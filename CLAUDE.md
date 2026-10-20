# Buraco Score App

Live Buraco scoreboard for a private card club. Expo (iOS + Android) on Supabase.
**The full spec is [docs/SPEC.md](docs/SPEC.md). Read the relevant section before changing behaviour.**
Going live (accounts, keys, APK / ad hoc iOS builds; no store release): [docs/SETUP.md](docs/SETUP.md).

## Rules

1. **Scoring logic lives only in `packages/shared` and Postgres functions.** The app never computes a result it uploads; it calls an RPC, Postgres validates and writes, Realtime fans it out. The TS helpers (`totals`, `gameOutcome`, tournament engine) are for previews/pairings and must agree with the SQL.
2. **Every schema change is a new migration** in `supabase/migrations/`, then `pnpm db:types`. Never edit a migration that has been applied to a shared database.
3. **Every RPC has a test** in `packages/db-tests` (PGlite + stubbed Supabase `auth` schema, no Docker). Write the test first.

## Layout

- `apps/mobile`: Expo SDK 58, Expo Router (routes in `src/app/`, guarded by onboarding stage in `src/app/_layout.tsx`). See `apps/mobile/AGENTS.md` (check versioned Expo docs; install with `npx expo install`).
  - `src/lib`: supabase client, typed `rpc()`/`rpcWithPin()`, error codes, offline outbox, realtime hooks, push, formatting.
  - `src/components/ui`: the design system ("card table felt", tokens in `src/theme/tokens.ts`).
  - `src/features/<area>`: auth, clubs, lobby, game (model/api/actions + live/result/new/invite), history, stats, tournament, profile.
  - `src/i18n`: one EN/AR namespace per feature; `parity.test.ts` enforces identical keys.
- `packages/shared`: `@buraco/shared` — scoring, tournament engine (round-robin, Swiss, rotating, knockout, standings, CSV), generated DB types.
- `packages/db-tests`: runs every migration in PGlite; tests RPCs, RLS and stats; `scripts/gen-types.mjs` generates the DB types.
- `supabase/`: migrations, Edge Functions (`push-dispatch`, `game-cron`, `delete-account`), `setup/cron.sql` (run once per project).

## Commands

```bash
pnpm install
pnpm test          # shared + db + app unit tests
pnpm typecheck
pnpm format        # prettier (no semicolons, single quotes, width 140)
pnpm db:types      # regenerate packages/shared/src/database.types.ts from the migrations
pnpm mobile        # expo start (use a development build: native modules)
```

## Conventions

- DB: snake_case; writes only through `security definer` RPCs with `set search_path = ''`; revoke new functions from `public, anon` (and `authenticated` for internal helpers) — Supabase grants them explicitly.
- PIN-checking RPCs return `{ok:false, error}` instead of raising, so the failed-attempt counter commits. Do PIN checks before any write.
- `games.config_snapshot` is frozen at insert; read it with `configFromSnapshot`.
- App strings always via i18next (both `en` and `ar`); layout uses start/end, never left/right; team labels stay Latin `A`/`B`.
