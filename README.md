# Buraco Score App

A live Buraco scoreboard: four phones, PIN-confirmed rounds, shared club history, stats and tournaments. Arabic and English.

- Spec: [docs/SPEC.md](docs/SPEC.md)
- Going live (Supabase, player accounts, push, Sentry, EAS, sending the app): [docs/SETUP.md](docs/SETUP.md)
- Store texts and privacy policy: [docs/release/](docs/release/)
- Notes for AI agents: [CLAUDE.md](CLAUDE.md)

```bash
pnpm install
pnpm test       # scoring + tournament engine, every migration/RPC in PGlite, app unit tests
pnpm typecheck
pnpm mobile
```

| Part | Where |
| --- | --- |
| App (Expo SDK 58, Expo Router, TanStack Query) | `apps/mobile` |
| Scoring rules, tournament engine, DB types | `packages/shared` |
| Database tests (no Docker) and type generator | `packages/db-tests` |
| Schema, RLS, RPCs, Edge Functions | `supabase/` |
