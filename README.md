# Life

A personal, mobile-friendly web app for logs, inventories and stats about your life. It grows one feature module at a time.

## Features

### 👕 Clothes
- Wardrobe inventory: name, category, brand, color, size, seasons, price, purchase date, condition, photo, notes
- Status tracking (active, storage, donated, sold, discarded), so past items still count toward spending history
- Wear log: one tap for "Wore today", or log any past date
- Outfits: combine pieces, log an outfit wear (also logs each piece), see which outfits an item is in
- Calendar: month view with a photo of what you wore each day; tap a day to log an outfit or items, or remove entries
- Search, filter by category or status, and sort by newest, name, most worn or longest unworn
- Stats: closet value, total spent, wears in the last 30 days, items per category, most worn, best cost per wear, never worn
- Import from Whering (see below)

### Importing from Whering

1. Export your wardrobe from Whering's website to a JSON file shaped like `{ "items": [...] }` (category, brand, colors, size, price, currency, tags, timesWorn, imageUrls).
   Optionally also a details file `{ items[], outfits[] }` from Whering's API (dateAdded, lastWorn, wornCount, seasons, occasions, fabric, archived, outfits with pieceIds), joined by image URL.
2. Convert it, which downloads and shrinks every photo:
   `node --experimental-strip-types scripts/import-whering.ts whering-export.json life-import-whering.json --details whering-details.json --currency EUR`
   (behind an HTTP proxy, prefix with `NODE_USE_ENV_PROXY=1`)
3. In the app: **Settings → Import items** → pick `life-import-whering.json`. It adds new records and updates ones from an earlier import (the newer copy wins), so re-running is safe.

Whering only stores each item's *last* wear date, so an item gets that one dated wear plus the rest of its count as undated `priorWears`; earlier dates are never invented. Archived Whering items are imported with status *storage*.

Neither file is committed (see `.gitignore`); they contain your personal data.

### App shell
- Bottom tab bar (Closet · Outfits · ＋ · Calendar · Stats); ＋ opens quick actions: log today, add an item, new outfit
- Installable: add it to your home screen for a full-screen app with its own icon

## Data and privacy

- The app reads and writes to your browser first (IndexedDB), so it's fast and works offline.
- Changes sync in the background to your own Cloudflare database (D1) through a small Worker API, so every device you sign in on sees the same data.
- The whole site sits behind **Cloudflare Access**, so only the email(s) you allow can open it. The Worker also re-checks the Access login token on every API call and refuses to serve data if Access isn't configured.
- **Settings → Export backup** downloads everything as a JSON file at any time.

## Talk to Claude (log outfits by chatting)

The Worker exposes an [MCP](https://modelcontextprotocol.io) endpoint at `/mcp`, so Claude can look up your closet and log what you wore: *"I wore the navy blazer and the white tee today."* Tools: `find_items`, `list_outfits`, `show_photos` (shows item and outfit photos in the chat when Claude is unsure which item you mean, or you ask to see something), `get_wear_log`, `log_wear`, `add_tags` (adds style/mood/occasion tags like "cozy" or "pajamas" to items and outfits, only when you describe them yourself, and never removes any), `add_item`, `create_outfit`.

Logging two or more loose pieces saves them as an outfit (an identical outfit is reused, and a similar one makes Claude ask you first, so outfits never get duplicated). `log_wear` doesn't edit your records on the server. It queues a request in the synced `inbox` store, and the app applies it with its normal wear logic the next time it syncs (open app: about a minute). Applying is idempotent, so two devices can't double-log.

One-time setup:

1. **Secret:** generate a long random token (`openssl rand -hex 32`) and store it as the Worker secret `MCP_TOKEN` (`npx wrangler secret put MCP_TOKEN`, or the dashboard under **Settings → Variables and Secrets**). Until it's set (24+ characters), `/mcp` answers 503.
2. **Let it past Access:** Claude can't sign in through Cloudflare Access, so add a second Access application for the same hostname with path `/mcp*` and a policy with action **Bypass** for Everyone. The endpoint then protects itself with the token; everything else stays behind Access.
3. **Connect Claude:**
   - Claude app / claude.ai: **Settings → Connectors → Add custom connector** with URL `https://life.<your-subdomain>.workers.dev/mcp/<token>`.
   - Claude Code: `claude mcp add --transport http life https://life.<your-subdomain>.workers.dev/mcp --header "Authorization: Bearer <token>"`.

Treat the URL like a password: anyone with it can read your closet and queue wears (not delete anything). To rotate, set a new `MCP_TOKEN` and update the connector. PR previews are read-only, so their write tools refuse.

## Development

```bash
npm install
npm run dev        # UI only at http://localhost:5173 (data stays in the browser)
npm run dev:full   # UI + Worker + local D1 at http://localhost:8787 (needs .dev.vars, see below)
npm test           # unit tests (vitest)
npm run build      # typecheck app + worker, production build into dist/
```

For `dev:full`, copy `.dev.vars.example` to `.dev.vars`; it turns off the login check locally.

Stack: React, TypeScript and Vite for the app, plus a Cloudflare Worker (`worker/`) with D1 (`migrations/`). Routing is hash-based (`#/clothes/...`).

## Deploying (Cloudflare, free plan)

GitHub Actions (`.github/workflows/ci.yml`) tests every push and deploys pushes to the default branch. One-time setup:

1. **Cloudflare API token:** Cloudflare dashboard → profile icon → **My Profile → API Tokens → Create Token** → template **Edit Cloudflare Workers** → **Add more** → *Account · D1 · Edit* → Continue → Create. Copy the token.
2. **Account ID:** dashboard home → **⋯** next to your account → **Copy account ID** (it's also on the Workers & Pages overview).
3. **GitHub secrets:** repo → **Settings → Secrets and variables → Actions → New repository secret**: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
4. **Deploy:** repo → **Actions → CI / Deploy → Run workflow**. The app is published at `https://life.<your-subdomain>.workers.dev`.
5. **Lock it down with Cloudflare Access:** Workers & Pages → **life** → **Settings → Domains & Routes** → on the `workers.dev` row, **Enable Cloudflare Access**. Then select **Manage Cloudflare Access** and make the policy allow only your email. Note the **team domain** (`<team>.cloudflareaccess.com`) and the application's **Audience (AUD) tag**.
6. **Tell the Worker about Access:** put the team domain and AUD tag in `vars` in `wrangler.jsonc` (`ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`) and push. They aren't secrets.

Until step 6 is done, the site loads but refuses to sync (the status dot shows "Sync not set up"), and nothing leaves your browser.

## How changes ship

`main` is the live site: every merge into `main` is tested and deployed automatically.

1. **Branch:** each feature or fix starts on its own branch from `main` (e.g. `feature/outfit-stats`, `fix/photo-rotation`).
2. **Pull request:** open a PR into `main`. CI runs the tests and the build on it, then publishes a **preview** at `https://pr-<number>-life.kevinmorenom.workers.dev` and comments the link on the PR. The live site is untouched.
3. **Review:** read the PR description and diff, and try the preview. It shows your real closet behind the same login, but it's read-only: nothing you change there is saved (a banner says so). Ask for changes on the PR if needed.
4. **Merge:** merging into `main` deploys to https://life.kevinmorenom.workers.dev within about a minute.
5. **Undo:** if something breaks, revert the PR's merge commit on GitHub; that redeploys the previous version.

Database schema changes (`migrations/`) apply on deploy, so a revert doesn't undo them, and previews don't apply them; PRs that add a migration say so.

## Adding a feature module

See [CLAUDE.md](CLAUDE.md#adding-a-module).
