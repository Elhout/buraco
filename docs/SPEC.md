# Buraco Score App — Build Spec

Oct 18, 2026 · @Sherif Elhout

## Overview

A live Buraco scoreboard for a private card group: each of the 4 players follows the score on their own phone, confirms participation and results with a PIN, and every game lands in a shared history. Built once in Expo for iOS and Android, backed by Supabase.

- Users: members of a club (your group). Each person has their own account and PIN.
- Core loop: host picks 4 players → push invite → PIN confirm → live rounds on all 4 phones → both teams confirm the final → stats update.
- Also: spectators, a lobby showing who is playing now, ghost mode for unverified games, tournament mode.
- Done when: a full game can be scored from 4 phones with no manual sync, history survives app reinstall, and a 12-player tournament runs end to end.

## House rules and scoring logic

Scores are entered by hand per round; the app only adds, tracks the 2000 target, and decides the winner.

| Rule | Value | App behaviour |
| --- | --- | --- |
| Deck | 104 cards, 2s are wild | Informational only; no card math |
| Round score | One number per team, can be negative | Entered by one team, confirmed by the other team with PIN before it posts |
| Exact cut | +100 to the player who cuts exactly 11 cards | One-tap button → pick player → +100 line on their team in the current round |
| Target | 2000 | Progress bar per team, points-to-go shown |
| Game ends | First team at ≥ 2000 after a round | Checked only when a round is confirmed, never mid-round |
| Both at ≥ 2000 | Higher total wins | Automatic |
| Equal totals at ≥ 2000 | Play another round | Game stays live; banner says tie, next round decides |
| Undo | Last round or bonus can be reverted | Requires PIN from the other team; kept in audit log |

Config per club, editable by the club owner: target (default 2000), cut bonus (default 100), whether negative rounds are allowed (default yes). Every game stores a copy of the config it was played with, so changing it later never rewrites history.

```latex
\text{team\_total} = \sum_{r} \left( \text{round\_score}_{r} + 100 \cdot \text{exact\_cuts}_{r} \right)
```

## Identity, clubs and PIN

Every player has their own account because push notifications and the live view need a registered device; the PIN is not a login, it is the signature on game actions.

**Accounts**

- Sign-in: username and password (Supabase Auth email/password with a synthetic `<username>@users.buraco.app` address; no SMS, Apple or Google, to keep running costs at zero). Club owners and admins create accounts and set new passwords; self sign-up is off. Players stay signed in on their phone until they sign out. *(Changed 2026-10-20 at the club's request; replaces phone OTP + Apple/Google.)*
- Profile: display name, avatar, preferred language (EN/AR).
- A device registers its Expo push token on login and clears it on logout.

**Clubs**

- A club is a group of players. One owner, members, optional admins.
- Join by 6-character invite code or QR. A player can be in several clubs.
- Lobby, who is playing now, spectating, history and stats are all scoped to the club. Nothing is visible across clubs.
- Club settings hold the scoring config (target, cut bonus).

**PIN**

- 4 digits, set at signup, changeable in profile.
- Required for: accepting a game invite, confirming the other team's round score, confirming the final result, approving an undo, retro-confirming a ghost game.
- Stored as a salted hash (bcrypt) in a table only reachable through a Postgres function; the client never reads the hash. Verification runs server-side (`verify_pin(user_id, pin)` RPC).
- 5 wrong attempts → 15-minute lockout; reset PIN after re-entering the account password.
- PIN prompt on the player's own phone only. Nobody types another person's PIN on a shared device; that is what ghost mode is for.

**Roles inside a game**

- Host: creates the game, picks players and teams, can cancel before it goes live.
- Scorekeeper: one per team by default (the host and the first confirmed opponent); either can be reassigned from the game menu. Prevents two people typing the same round.
- Spectator: read-only.

## Game lifecycle and ghost mode

A game moves through five states; every transition is written server-side so all four phones agree.

&#91;embedded content: game state machine · 4 main states, 4 exits\]

The dashed path is ghost mode: it skips the invite step and lands in Finished as unverified until the real players confirm with their PIN.

**Steps**

1. Host taps New game, picks 4 club members (self included), drags them into Team A and Team B, picks normal or ghost.
2. Normal: game is `inviting`. The other 3 get a push. Each opens it and enters PIN → `confirmed`. Invite expires after 10 minutes; host can swap a player or switch to ghost.
3. All 4 confirmed → `live`. The game appears in the club lobby as playing now.
4. Each round: scorekeeper of one team enters both scores → the other team's scorekeeper sees a confirm sheet → PIN → round posts to all phones. Exact-cut +100 is a single tap, visible to all, and is included in that round's confirmation.
5. A team reaches 2000 at round confirmation → app proposes the result. Both scorekeepers confirm with PIN → `finished`, stats update. Tie at ≥ 2000 keeps the game live for one more round.
6. Host can cancel while `inviting`; once `live`, abandoning needs both scorekeepers' PIN and the game is stored as `abandoned` (no stats).

**Ghost mode**

- Starts instantly, no invites. Seats can be real members (unconfirmed) or guest names.
- Identical live screen and round flow, but round and final confirmations are single-tap, no PIN.
- Result stored with `verified = false`. Shows in history with a ghost badge; excluded from rankings, win rates and tournament standings.
- Any real member in a ghost game gets a push afterwards: Confirm this result? PIN → their seat is verified. When all real seats are verified the game counts as normal. Guest seats never verify.
- Use cases: a guest at the table, a dead phone, a quick casual game.

## Live score, lobby and spectating

Supabase Realtime carries everything live; the database is the single source of truth and the phones are views of it.

| Need | Mechanism | Detail |
| --- | --- | --- |
| Live score on 4 phones | Postgres Changes on `rounds`, `round_lines`, `games` filtered by `game_id` | Client subscribes on open, refetches on reconnect |
| Pending confirmation prompt | Same subscription + local rule: row with `status = pending` and my team ≠ entering team | Confirm sheet pops on the scorekeeper's phone only |
| Who is playing now | Lobby query `games where club_id = ? and status in (inviting, live)` + Postgres Changes on `games` | Card per game: 4 avatars, score, round number, spectator count |
| Spectators | Same game subscription, read-only; Realtime Presence channel `game:<id>` for count and names | Any club member; no PIN |
| Online members | Presence channel `club:<id>` | Grey/green dot in player picker |
| Push | Expo Notifications → APNs/FCM via Supabase Edge Function triggered by DB webhook | Events listed in Push notification events |

**Live screen**

- Top: Team A vs Team B totals, progress bars to 2000, points-to-go.
- Middle: round list, newest first, each row showing A score, B score, cut bonuses, who confirmed.
- Bottom: Enter round (scorekeepers only), +100 exact cut, menu (undo, reassign scorekeeper, abandon).
- Spectators see the same without the bottom bar.

**Offline and conflicts**

- Writes go through an outbox: a round entered with no signal is saved locally, marked Sending, and posted when the connection returns. The other phones cannot confirm until it lands, which is the correct behaviour.
- If two scorekeepers enter the same round number, the second insert fails on a unique constraint `(game_id, round_no)` and the client shows the first entry for confirmation instead.
- Last-updated timestamp on the live screen; a red bar if the subscription has been down more than 10 seconds.

## Tournament mode

A tournament is a scheduler on top of normal games: it creates the matches, assigns tables, and ranks the results. Every match is a regular verified game, so the live screen, confirmations and history are reused unchanged.

**Setup (organizer)**

- Name, date, format, partnership mode, round length, target (defaults to club target, often lowered to 1500 for time).
- Entrants: pick club members. Pairs mode needs an even count; individual mode needs a multiple of 4 (organizer can add a ghost seat to fill a table).

| Format | Best for | How rounds are built |
| --- | --- | --- |
| Round-robin | ≤ 6 pairs | Every pair meets every other pair once |
| Swiss | 8 to 40 players, fixed evening | Round 1 random; each next round pairs teams with equal match points who have not met |
| Knockout | Finals day | Bracket seeded from a Swiss or round-robin stage, single elimination |

**Partnership mode**

- Fixed pairs: a pair is the ranked unit for the whole event.
- Rotating partners (individual): each round the engine forms new pairs and tables; the ranked unit is the player. Pair repeats are minimized.

**Scoring and ranking**

- Match points: win 2, draw 1, loss 0. A draw only exists when a round is stopped by the clock with equal totals.
- Tiebreak order: match points → sum of point differential (capped at ±1000 per match) → head-to-head → total points scored.
- Timed rounds: a visible clock per table; when it expires the current round of play is finished and the match is scored as it stands. Target can still end it earlier.
- Standings update live after each match confirmation; leaderboard screen in the tournament tab.

**Operations**

- Table assignment shown on each player's phone with a push: Round 3, Table 2, you and X vs Y and Z.
- Organizer can substitute a player (late arrival), skip a bye, or edit a result with a reason; all edits logged.
- Export: standings and all match results as CSV, shareable from the app.

## History and stats

History is the list of games; stats are views computed from verified games only, so a ghost game never moves a ranking until its players confirm it.

**History**

- Club timeline of finished games, newest first: date, teams, final score, rounds played, ghost or verified badge.
- Game detail: every round with scores, cut bonuses, who entered and who confirmed, undo log.
- Filters: my games, by player, by date range, verified only, tournament only.

**Player stats (verified games)**

- Games played, wins, win rate.
- Average points per game, average per round, biggest win margin, longest game (rounds).
- Exact cuts: count and per-game rate.
- Best partner (highest win rate together, minimum 5 games) and toughest opponents.
- Current streak and best streak.

**Pair stats** for any two players who have teamed: games, win rate, average score.

**Head-to-head** between two players or two fixed pairs.

**Club leaderboard**: ranked by win rate with a minimum of 10 games, with games played and points differential as columns; season reset optional (organizer sets a season start date).

Stats live in Postgres views (`v_player_stats`, `v_pair_stats`, `v_h2h`) refreshed on read; at this volume no materialization is needed.

## Data model

Fourteen tables; `games` is the hub. All ids are UUIDs, all tables carry `created_at`, and Row Level Security scopes every read to clubs the user belongs to.

| Table | Key columns | Notes |
| --- | --- | --- |
| profiles | id (= auth.users.id), display\_name, avatar\_url, lang | One per account |
| pins | user\_id, pin\_hash, failed\_attempts, locked\_until | No client read; RPC `verify_pin` only |
| devices | user\_id, expo\_push\_token, platform, last\_seen | Several per user |
| clubs | id, name, owner\_id, invite\_code, target\_score (2000), cut\_bonus (100), allow\_negative | Config lives here |
| club\_members | club\_id, user\_id, role (owner / admin / member), joined\_at | Unique (club\_id, user\_id) |
| games | id, club\_id, host\_id, mode (normal / ghost), status (draft / inviting / live / finished / abandoned / expired), config\_snapshot jsonb, verified bool, winner\_team, started\_at, finished\_at, tournament\_match\_id null | `config_snapshot` freezes target and bonus |
| game\_seats | game\_id, seat (1–4), team (A / B), user\_id null, guest\_name null, invite\_status (invited / confirmed / declined), confirmed\_at, is\_scorekeeper, verified\_at | 4 rows per game; user\_id or guest\_name required |
| rounds | game\_id, round\_no, team\_a\_score, team\_b\_score, entered\_by\_seat, status (pending / confirmed / voided), confirmed\_by\_seat, confirmed\_at | Unique (game\_id, round\_no) |
| round\_lines | round\_id, type (cut\_bonus), seat, points (100) | One row per exact cut |
| game\_events | game\_id, type, actor\_seat, payload jsonb | Audit log: undo, reassign, abandon, verify |
| tournaments | id, club\_id, organizer\_id, name, format (round\_robin / swiss / knockout), pairing (fixed / rotating), round\_minutes, target\_score, status, season\_id null |  |
| tournament\_entries | tournament\_id, user\_id, pair\_id null, seed | Pair\_id groups fixed partners |
| tournament\_rounds | tournament\_id, round\_no, starts\_at, ends\_at, status | Clock per round |
| tournament\_matches | tournament\_round\_id, table\_no, team\_a\_entries uuid\[\], team\_b\_entries uuid\[\], game\_id, result (a / b / draw), points\_a, points\_b | One game per match |

Derived views: `v_game_totals` (sum of rounds and lines per team), `v_player_stats`, `v_pair_stats`, `v_h2h`, `v_tournament_standings`.

Key constraints and functions

- `games.status` transitions enforced by a trigger: only the paths in the lifecycle diagram are allowed.
- `confirm_round(round_id, pin)` RPC: verifies PIN, checks the caller is the opposing scorekeeper, marks confirmed, recomputes totals, and sets `games.status = finished` plus `winner_team` when a team is at or over target and totals differ.
- `verify_pin` increments `failed_attempts` and sets `locked_until` after 5 failures.
- RLS: club members read club data; only seats write to their game; only the organizer writes tournament rows.

## Tech stack and architecture

One Expo codebase on top of Supabase; business rules live in Postgres functions so no phone can post an inconsistent score.

&#91;embedded content: system architecture · app, Supabase services, push\]

The app never computes a result it then uploads: it calls an RPC, Postgres validates and writes, Realtime fans the change out to every phone, and a trigger queues any push.

| Layer | Choice | Why |
| --- | --- | --- |
| App | Expo SDK (React Native, TypeScript), Expo Router | One codebase, iOS + Android, OTA updates with EAS Update |
| State and data | TanStack Query + Supabase JS client; Realtime subscriptions invalidate queries | Simple, cache-first, reconnect-safe |
| Local persistence | expo-sqlite via Drizzle for history cache and the write outbox | Works at the table with no signal |
| Auth | Supabase Auth: username + password, accounts created by club admins | No per-message SMS cost, no third-party login |
| Database | Supabase Postgres with RLS, triggers and RPCs | Rules enforced server-side |
| Realtime | Supabase Realtime: Postgres Changes + Presence | Live score, lobby, spectators |
| Push | Expo Notifications; Supabase Edge Function (Deno) triggered by database webhooks calls the Expo Push API | No separate push server |
| Builds and stores | EAS Build + EAS Submit; TestFlight and Play internal testing | Store pipelines without a Mac |
| i18n | i18next with EN and AR; RTL via `I18nManager`, tested on both | Bilingual from day one |
| Monitoring | Sentry for app crashes; Supabase logs for RPC errors |  |

**Project layout**

- `apps/mobile` Expo app: `app/` routes, `features/` (auth, clubs, game, tournament, stats), `lib/` (supabase, realtime, outbox, pin).
- `supabase/` migrations, functions (`push-dispatch`, `invite-expiry`), seed data.
- `packages/shared` TypeScript types generated from the schema plus the pure scoring helpers (`totals`, `isFinished`, `winner`) with unit tests.

**Security notes**

- PIN never leaves the device in clear text more than once per action; sent over TLS to the RPC, compared against bcrypt hash, never logged.
- Service-role key only in Edge Functions. The app uses the anon key with RLS.
- Invite codes rotate on demand by the club owner.

## Screens and navigation

Four tabs plus modal flows; the live game screen is the only one that must be fast and fat-finger-proof.

| Screen | Route | Contents |
| --- | --- | --- |
| Onboarding | /auth | Username + password → name, avatar, language → set PIN → join or create club (players added by an admin are already in the club) |
| Lobby (tab) | /club | Playing now cards, online members, New game button, club switcher |
| New game (modal) | /game/new | Pick 4 members, drag into teams, normal or ghost, Start |
| Invite pending | /game/\[id\]/invite | 4 seats with status, countdown, swap player, switch to ghost |
| PIN sheet | component | 4-digit pad, biometric shortcut optional, error and lockout states |
| Live game | /game/\[id\] | Totals, progress bars, round list, Enter round, +100 exact cut, menu |
| Enter round (sheet) | component | Two numeric fields, sign toggle, preview of new totals, Send for confirmation |
| Confirm round (sheet) | component | Shows both scores and any cut bonus, Confirm with PIN or Dispute |
| Game over | /game/\[id\]/result | Winner, final totals, both-team PIN confirm, share card |
| History (tab) | /history | Game list with filters; tap → game detail |
| Game detail | /history/\[id\] | Rounds, bonuses, confirmations, audit log, verify button for ghost seats |
| Stats (tab) | /stats | My stats, leaderboard, pair stats, head-to-head picker |
| Tournaments (tab) | /tournaments | List, create (organizer), detail with rounds, tables, standings, clock |
| Profile | /profile | Name, avatar, language, change PIN, devices, leave club |

Design rules

- Live screen: numbers at 40pt or larger, team colours consistent across the app, every action within thumb reach, no destructive action without a sheet.
- Arabic layout mirrored, numerals follow device locale, team labels A/B stay Latin to avoid confusion at the table.
- Dark mode default: card tables are usually in dim rooms.

## Push notification events

Every push comes from a database change: a trigger writes to `notification_queue`, the `push-dispatch` Edge Function sends it through Expo and marks it delivered.

| Event | Recipients | Message | Deep link |
| --- | --- | --- | --- |
| Game invite | 3 invited players | Omar invited you: you and Sara vs Ahmed and Nour. Confirm with PIN | /game/\[id\]/invite |
| Invite expiring | Players not yet confirmed, at 2 minutes left | Your seat expires in 2 minutes | /game/\[id\]/invite |
| Game started | Club members who opted in | Omar and Sara vs Ahmed and Nour just started | /game/\[id\] |
| Round awaiting your confirmation | Opposing scorekeeper, only if app is backgrounded | Round 4: 350 vs 220. Confirm? | /game/\[id\] |
| Final result awaiting confirmation | Both scorekeepers, if backgrounded | Team A wins 2010 to 1840. Confirm with PIN | /game/\[id\]/result |
| Ghost game to verify | Real members in a ghost game, after finish | Confirm last night's result? | /history/\[id\] |
| Tournament table assignment | Entrants, each round | Round 3, Table 2: you and X vs Y and Z | /tournaments/\[id\] |
| Tournament round clock | Entrants, 5 minutes before end | 5 minutes left in round 3 | /tournaments/\[id\] |
| Undo requested | Opposing scorekeeper | Omar wants to undo round 4 | /game/\[id\] |

Rules

- Pushes about a live game are suppressed when that game is open on screen; the in-app sheet is enough.
- Game-started and tournament pushes are per-user toggles in Profile.
- Message text is sent in the recipient's language.

## Build phases and Claude Code hand-off

Four phases, each shippable to TestFlight on its own; phase 1 is playable in a week of evenings.

1. **Core scoring, single device.** Expo project, EN/AR shell, Supabase schema (clubs, games, seats, rounds, round\_lines), ghost-mode game with manual rounds, +100 cut, 2000 target and tie rule, local history. Gate: one real game scored start to finish, totals match paper.
2. **Accounts, PIN, live.** Username/password accounts, PIN RPCs, club invite codes, invite flow with push, live subscriptions on 4 phones, opposing-team confirmation, lobby with playing now and spectators, outbox for offline writes. Gate: a game on 4 phones with aeroplane mode toggled mid-game and no divergence.
3. **History and stats.** Game detail with audit log, ghost retro-verification, player/pair/h2h views, leaderboard, filters. Gate: stats match a hand count over 20 games.
4. **Tournament mode and release.** Formats, pairing engine with tests, table assignment pushes, round clock, standings, CSV export; store listings, privacy policy, Sentry; EAS Submit to App Store and Play. Gate: a 12-player Swiss event run live.

**Claude Code hand-off**

- Put this doc in the repo as `docs/SPEC.md` and point `CLAUDE.md` at it with three rules: scoring logic only in `packages/shared` and Postgres functions; every schema change is a migration; every RPC has a test.
- First prompt: scaffold the monorepo (Expo + Supabase CLI + shared package), write the phase 1 migration from the Data model table, and generate types.
- Keep the pairing engine and scoring helpers pure TypeScript with Vitest tests before any UI.

**Open items**

- [x] ~~SMS provider for OTP in Qatar~~: dropped, sign-in is username + password
- [ ] App name and icon
- [ ] Should spectators be allowed from outside the club via a share link (default no)
- [ ] Tournament default target 1500 or 2000
- [ ] Season boundaries for the leaderboard
