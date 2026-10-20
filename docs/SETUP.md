# Setup: from this repo to players' phones

Everything in the repo runs locally without accounts (tests use PGlite, an in-process Postgres).
Going live needs the accounts below. Do the steps in order; each says what it unlocks.

## 0. Prerequisites

- Node 24, pnpm 10 (`corepack enable`), Git.
- Supabase CLI (`npx supabase --version`); Docker only if you want the full local stack.
- An Expo account and EAS CLI (`npx eas-cli@latest login`).
- No developer accounts needed: Android gets an APK, iPhones use the web app (Cloudflare Pages, free).

```bash
pnpm install
pnpm test        # shared engine + every migration/RPC + app unit tests
pnpm typecheck
```

## 1. Supabase project (database, auth, realtime)

1. Create a project at supabase.com. Pick a region close to Qatar (e.g. `eu-central-1` or `me-central-1` when available).
2. Link and push the schema:
   ```bash
   npx supabase login
   npx supabase link --project-ref <ref>
   npx supabase db push            # applies supabase/migrations in order
   pnpm db:types:linked            # optional: regenerate types from the live project
   ```
3. **Realtime**: the migrations add `games`, `game_seats`, `rounds`, `round_lines`, `tournaments`,
   `tournament_rounds`, `tournament_matches`, `tournament_events`, `club_members` to the `supabase_realtime` publication. Check under
   Database → Publications.
4. **API keys**: copy the project URL and the *publishable* key into `apps/mobile/.env.local`
   (see `apps/mobile/.env.example`). Never put the secret/service-role key in the app.

## 2. Player accounts (username and password)

There is no SMS, Apple or Google sign-in, so signing in costs nothing. Players sign in with a
username and password that a club owner or admin creates for them, and stay signed in on that
phone: the session refreshes itself and only ends when they sign out.

1. Authentication → Providers → **Email**: enabled, **Confirm email off**. Authentication →
   Sign In / Providers: **Allow new users to sign up off**, because only admins create accounts.
   `supabase/config.toml` has the same settings for the local stack. Leave Phone, Apple and Google off.
2. Authentication → Sessions: leave *time-box* and *inactivity timeout* empty so players stay signed in.
3. Deploy the account function (no extra secrets needed):
   ```bash
   npx supabase functions deploy manage-accounts
   ```
4. **Your own first account**: Authentication → Users → *Add user* → *Create new user*. Email
   `<your-username>@users.buraco.app` (the app adds this suffix to every username; no email is
   ever sent to it), a password, and tick *Auto Confirm User*. Sign in to the app with just the
   username, finish setup and create the club: you are its owner.
5. **Everyone else**: in the app, Club settings → Members → *Add player*. Choose their name,
   username and password and hand those over; they join your club straight away. *Set a new
   password* on a member replaces a forgotten one (phones already signed in stay signed in).
   The owner can do this for anyone in the club; admins only for plain members.

Players change their own password in Profile → Change password (they type the current one first).
A forgotten **PIN** is reset by the player in Profile → Forgot PIN, after re-entering their password.

## 3. Push notifications

1. `cd apps/mobile && npx eas-cli@latest init` → writes the EAS project ID. Put it in `EAS_PROJECT_ID`.
2. iOS: `eas credentials` creates the APNs key. Android: upload an FCM v1 service-account key in
   the Expo dashboard (Project → Credentials).
3. Deploy the Edge Functions and secrets:
   ```bash
   npx supabase secrets set CRON_SECRET=$(openssl rand -hex 32)
   npx supabase secrets set EXPO_ACCESS_TOKEN=<expo access token, optional but recommended>
   npx supabase functions deploy push-dispatch
   npx supabase functions deploy game-cron
   ```
4. Run `supabase/setup/cron.sql` once in the SQL editor (fill in the placeholders first). It
   schedules `game-cron` every minute (invite expiry, 2-minute warnings, tournament clock) and
   sends queued pushes immediately after each insert. Details: `supabase/functions/README.md`.

## 4. Crash reporting (Sentry)

Create a React Native project in Sentry. Set `EXPO_PUBLIC_SENTRY_DSN` in `.env.local`, and
`SENTRY_ORG`, `SENTRY_PROJECT` plus a `SENTRY_AUTH_TOKEN` **EAS secret** for source-map upload
(`eas env:create --name SENTRY_AUTH_TOKEN --visibility secret`).

## 5. Run on devices

The app uses native modules (push, Face ID, camera, RTL switching), so use a
development build rather than Expo Go:

```bash
cd apps/mobile
npx eas-cli@latest build --profile development --platform all
npx expo start --dev-client
```

Phase gates from the spec, to check by hand:
- **Phase 1**: score one real game (ghost mode) start to finish; totals match paper.
- **Phase 2**: a normal game on 4 phones; toggle aeroplane mode mid-game on one phone: its round
  shows *Sending…*, posts on reconnect, no divergence.
- **Phase 3**: after 20 games, stats match a hand count (also covered by `packages/db-tests/src/stats.test.ts`).
- **Phase 4**: a 12-player Swiss evening (also simulated end to end in `packages/db-tests/src/tournament.test.ts`).

## 6. Sending the app to players (no stores)

The app is not published on Google Play or the App Store. EAS builds it and you send it to
players directly. The `production` profile in `apps/mobile/eas.json` uses internal distribution.

### Android: an APK file
```bash
npx eas-cli@latest build --profile production --platform android
```
EAS gives a download link to a `.apk`. Send the link or the file (WhatsApp, email, …). On the
phone: open it, allow *Install unknown apps* for the app that opened it, install. Push
notifications need the FCM key from step 3.

### iPhone: the web app on the home screen (free)
iPhones use the same app as a website added to the home screen. It opens full screen with its
own icon. No Apple account, nothing to install, nothing expires.

1. **Notification keys (once)**: generate a VAPID key pair and set it as described in
   `supabase/functions/README.md`. Put the *public* key in `apps/mobile/.env.local` as
   `EXPO_PUBLIC_VAPID_PUBLIC_KEY`.
2. **Build and host** on Cloudflare Pages (free). Create a Cloudflare account, then:
   ```bash
   cd apps/mobile
   npx expo export --platform web             # writes dist/
   npx wrangler@latest pages deploy dist --project-name buraco-club
   ```
   You get `https://buraco-club.pages.dev` (a custom domain is optional). `public/_redirects`
   and `public/_headers` are already set up for Cloudflare Pages; Netlify reads the same files.
   Run the same two commands again for every update. Players get it the next time they open the app.
3. **Each iPhone player**: open the link in **Safari**, sign in, tap *Share* → *Add to Home
   Screen*, then open *Buraco* from the home screen and tap *Turn on notifications* (iOS 16.4+).
   Notifications only work from the home-screen icon, not from a Safari tab.

Differences from the Android app: no Face ID shortcut for the PIN (the PIN is typed), the club
invite is typed instead of scanned, and notifications need the home-screen step above.

If the web app isn't good enough, a friend's paid Apple developer account can build the real
iPhone app (ad hoc, up to 100 iPhones): `eas device:create` for each iPhone, then
`eas build --profile production --platform ios`.

### Updates
Android: JavaScript-only changes (screens, text, fixes) reach every installed phone without a
new install: `npx eas-cli@latest update --channel production`. The app picks it up on its next
launch. A new APK is only needed when native modules or `app.config.ts` change.
iPhone (web app): deploy again (step 2 above).

`docs/release/` (store listing, data disclosures) only matters if you publish to a store later.
The privacy policy is still worth sharing with the club.
