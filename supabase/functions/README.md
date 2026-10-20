# Edge Functions

| Function | Called by | Does |
| --- | --- | --- |
| `push-dispatch` | AFTER INSERT trigger on `notification_queue` (pg_net), game-cron | Claims queued pushes, formats them in the recipient's language, sends through the Expo Push API (and Web Push to web-app devices), marks rows sent/skipped/failed (or re-queues transient failures), deletes dead device tokens |
| `game-cron` | pg_cron, every minute | `warn_expiring_invites`, `expire_invites`, `tournament_clock_tick` (ignored while the RPC does not exist), then the same queue drain as push-dispatch |
| `delete-account` | the app (signed-in user) | `anonymize_user`, then deletes the auth user |
| `manage-accounts` | the app (club owner/admin) | `create`: new username+password account, added to the club as a member. `set_password`: resets a member's password. Permission check: SQL `assert_account_admin` (tested in `packages/db-tests/src/accounts.test.ts`) |

Layout:

- `_shared/messages.ts`: push texts (EN/AR) per event. Pure TS, tested in `packages/db-tests/src/push-messages.test.ts`.
- `_shared/dispatch.ts`: claim → send → finish loop over an `RpcClient` interface.
- `_shared/auth.ts`: bearer check with constant-time compare.
- `_shared/accounts.ts`: username/password rules (a copy of `packages/shared/src/accounts.ts`, kept identical by `accounts-parity.test.ts`) and `parseAccountRequest` (tested in `manage-accounts.test.ts`).
- `_shared/service.ts`: Deno-only glue (env, service-role client, 401 gate).
- `_shared/webpush.ts`: Web Push helpers (payload `{title, body, url}`, push-service status → sent / retry / dead endpoint). Pure, tested in `packages/db-tests/src/web-push-dispatch.test.ts`.
- `_shared/webpush-sender.ts`: Deno-only. Encrypts with VAPID via `npm:web-push` (`generateRequestDetails`, no network) and posts with `fetch`. TTL 1 hour, urgency high.
- `push-dispatch/expo.ts`: Expo HTTP helpers (chunking, ticket → status). `dispatch.ts`, `auth.ts` and `expo.ts` are tested in `packages/db-tests/src/push-dispatch.test.ts` with a fake `fetch` and a fake database.

`push-dispatch` and `game-cron` have `verify_jwt = false` in `supabase/config.toml` and authenticate themselves: the request must carry `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` or `Authorization: Bearer <CRON_SECRET>`. Anything else gets 401. `delete-account` and `manage-accounts` also have `verify_jwt = false` but identify the caller from their user JWT (`auth.getUser`).

`manage-accounts` body: `{"action":"create","club_id","username","password","display_name"}` → `{ok:true,user_id}`, or `{"action":"set_password","club_id","user_id","password"}` → `{ok:true}`. Errors: 400 `invalid_request | invalid_username | weak_password | invalid_name`, 401 `unauthorized`, 403 `forbidden`, 409 `username_taken`, 500 `failed`.

## Environment

| Variable | Source | Purpose |
| --- | --- | --- |
| `SUPABASE_URL` | provided by Supabase | Database API |
| `SUPABASE_SERVICE_ROLE_KEY` | provided by Supabase | Calls the service-role RPCs; also accepted as a bearer |
| `CRON_SECRET` | `supabase secrets set` | Bearer used by pg_cron and the queue trigger (stored in Vault as `cron_secret`) |
| `EXPO_ACCESS_TOKEN` | `supabase secrets set`, optional | Only needed if "Enhanced push security" is on for the Expo project |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | `supabase secrets set`, optional | Web Push for the web app (iPhones). Without all three, web devices are skipped and Expo pushes still go out |

```bash
supabase secrets set CRON_SECRET="$(openssl rand -hex 32)"
supabase secrets set EXPO_ACCESS_TOKEN=<token from expo.dev → Access tokens>   # optional
```

Keep the `CRON_SECRET` value: `setup/cron.sql` needs the same string.

Web Push (once per project). Generate a VAPID key pair, keep the private key secret:

```bash
npx web-push generate-vapid-keys
supabase secrets set VAPID_PUBLIC_KEY=<public key> VAPID_PRIVATE_KEY=<private key> VAPID_SUBJECT=mailto:you@example.com
```

The **public** key also goes into the app build as `EXPO_PUBLIC_VAPID_PUBLIC_KEY` (browsers need it to subscribe). Changing the key pair later invalidates every web subscription: players have to turn notifications on again.

Web devices are rows in `public.devices` with `platform = 'web'`: `expo_push_token` holds the push endpoint, `web_p256dh` / `web_auth` the subscription keys (`register_web_push`, migration `20261030000000_web_push.sql`). `claim_notifications` returns them as `web: [{endpoint, p256dh, auth}]` next to the Expo `tokens`; a 404/410 from the push service deletes the device through `finish_notifications`.

## Deploy

```bash
supabase link --project-ref <project-ref>
supabase db push                                    # migrations first
supabase functions deploy push-dispatch game-cron delete-account manage-accounts   # verify_jwt=false comes from config.toml
```

Then, once per project, open `supabase/setup/cron.sql`, replace the two placeholders in step 1 (project URL and the `CRON_SECRET` value), and run it in the Dashboard SQL editor. Do not commit the filled-in copy. It enables `pg_cron` and `pg_net`, stores the URL and secret in Vault, schedules `game-cron` every minute, and adds the `notification_queue` trigger that calls `push-dispatch` right after a push is queued (cron is the fallback). It is safe to re-run.

Manual run:

```bash
curl -X POST "https://<project-ref>.supabase.co/functions/v1/push-dispatch" -H "Authorization: Bearer $CRON_SECRET"
```

Both return a JSON summary, e.g. `{"ok":true,"batches":1,"claimed":3,"sent":2,"skipped":1,"failed":0,"requeued":0,"deadTokens":0}`.

## Local checks

```bash
cd packages/db-tests && npx vitest run src/push-messages.test.ts src/push-dispatch.test.ts
# Type-check the Deno entry points. The env var / flag keep Deno from reading (and rewriting)
# the pnpm workspace's root package.json.
cd supabase/functions && DENO_NO_PACKAGE_JSON=1 deno check --no-config push-dispatch/index.ts game-cron/index.ts delete-account/index.ts manage-accounts/index.ts
supabase functions serve   # local, uses supabase/.env or --env-file for CRON_SECRET
```

## Retry behaviour

- A row with no device tokens (none registered, or the game is open on screen) is `skipped`.
- Any accepted Expo ticket marks the row `sent`; `DeviceNotRegistered` tokens are deleted.
- If every message failed with a transient error (HTTP 5xx/429, network, `MessageRateExceeded`), the row goes back to `queued` while `attempts < 3`. `claim_notifications` does not return `attempts` yet, so until a migration adds it, rows are marked `failed` instead of re-queued.
- Rows stuck in `sending` (function crashed between claim and finish) are not reclaimed automatically.
