# Life

A personal, mobile-friendly web app for logs, inventories and stats about your life. It grows one feature module at a time.

## Features

### 👕 Clothes
- Wardrobe inventory: name, category, brand, color, size, seasons, price, purchase date, condition, photo, notes
- Status tracking (active, storage, donated, sold, discarded), so past items still count toward spending history
- Wear log: one tap for "Wore today", or log any past date
- Search, filter by category or status, and sort by newest, name, most worn or longest unworn
- Stats: closet value, total spent, wears in the last 30 days, items per category, most worn, best cost per wear, never worn

## Data and privacy

- The app reads and writes to your browser first (IndexedDB), so it's fast and works offline.
- Changes sync in the background to your own Cloudflare database (D1) through a small Worker API, so every device you sign in on sees the same data.
- The whole site sits behind **Cloudflare Access**, so only the email(s) you allow can open it. The Worker also re-checks the Access login token on every API call and refuses to serve data if Access isn't configured.
- **Settings → Export backup** downloads everything as a JSON file at any time.

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
6. **Tell the Worker about Access:** **life → Settings → Variables and Secrets → Add**: `ACCESS_TEAM_DOMAIN` = your team domain, `ACCESS_AUD` = the AUD tag. Deploy.

Until step 6 is done, the site loads but refuses to sync (the status dot shows "Sync not set up"), and nothing leaves your browser.

## Adding a feature module

See [CLAUDE.md](CLAUDE.md#adding-a-module).
