# Life

A personal, mobile-friendly web app for logs, inventories and stats about your life. It grows one feature module at a time.

## Features

### 👕 Clothes
- Wardrobe inventory: name, category, brand, color, size, seasons, price, purchase date, condition, photo, notes
- Status tracking (active, storage, donated, sold, discarded), so past items still count toward spending history
- Wear log: one tap for "Wore today", or log any past date
- Search, filter by category or status, and sort by newest, name, most worn or longest unworn
- Stats: closet value, total spent, wears in the last 30 days, items per category, most worn, best cost per wear, never worn

## Data

Everything is stored locally in your browser (IndexedDB). Nothing is sent to a server. Use **Settings → Export backup** to save a JSON file, and **Restore from file** to load it on another device or browser.

## Development

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (vitest)
npm run build      # typecheck + production build into dist/
```

Stack: React, TypeScript and Vite, with no backend. Routing is hash-based (`#/clothes/...`), so the build runs on any static host.

## Deploying

`.github/workflows/deploy.yml` builds the app and publishes it to GitHub Pages on every push to `main`. To turn it on, go to the repo's **Settings → Pages** and set **Source** to **GitHub Actions**.

## Adding a feature module

See [CLAUDE.md](CLAUDE.md#adding-a-module).
