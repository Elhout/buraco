# Working on Buraco from your phone (Claude Code)

The code lives on GitHub (**Elhout/buraco**, branch `feat/buraco-app`). A Claude Code session on
your phone edits the code and pushes it; GitHub then checks everything and publishes it by itself
(`.github/workflows/deploy.yml`): database changes, the web app and the Android update.

## 1. Connect Claude to the repository (once)

1. Open the **Claude** app (or claude.ai/code in the phone browser) → **Code**.
2. Connect your GitHub account when asked, and allow access to **Elhout/buraco**.
3. Pick the repository and the branch **feat/buraco-app**, then describe what you want, e.g.
   "make the +100 button bigger" or "add a Players filter for wins".
4. When Claude is done it pushes to the branch. Watch it go live under the repository's
   **Actions** tab on GitHub (green tick = published).

## 2. Let GitHub publish (once, about 10 minutes)

GitHub → **Elhout/buraco** → **Settings** → **Secrets and variables** → **Actions** →
**New repository secret**. Add these four (copy each value exactly, no spaces):

| Secret name | Where to get it |
| --- | --- |
| `SUPABASE_ACCESS_TOKEN` | supabase.com → your avatar → **Account** → **Access Tokens** → *Generate new token* (name it "GitHub deploy"). |
| `SUPABASE_DB_PASSWORD` | The database password, kept on the laptop in `supabase\.env.local` (line `SUPABASE_DB_PASSWORD=`). Or set a new one in Supabase → project **buraco** → *Database* → *Settings* → *Reset database password* (then update the laptop file too). |
| `CLOUDFLARE_API_TOKEN` | dash.cloudflare.com → *My Profile* → **API Tokens** → *Create Token* → *Create Custom Token* → permission **Account · Cloudflare Pages · Edit** → *Continue* → *Create Token*. |
| `EXPO_TOKEN` | expo.dev → account **elhouts-team** → *Settings* → **Access tokens** → *Create token* (name it "GitHub deploy"). |

Until a secret is added, its step is simply skipped (the Actions page says so), nothing breaks.

## What still needs the laptop

- **A new APK**: only when native code or `app.config.ts` changes (Claude will say so). Run
  `npx eas-cli@latest build --platform android --profile production` in `apps/mobile` on the
  laptop: the signing key (`apps/mobile/keys/`, `apps/mobile/credentials.json`) lives only there.
  Keep a backup of those two.
- **Secrets** (keys, passwords) never go in the code or in a chat.
