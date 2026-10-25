# Life — project notes

Personal life-tracking web app (React + TypeScript + Vite), built one feature module at a time. Mobile-first, local-first storage (IndexedDB) synced to Cloudflare D1 through a Worker, hash routing. Hosted on Cloudflare Workers behind Cloudflare Access.

## Workflow
- `main` is production: CI deploys the repo's default branch (`main`) on every push. Never push to `main` directly.
- Work on a feature branch from `main` and open a PR into `main`; the PR description says what changed, how it was tested, and whether it adds a D1 migration.
- Each same-repo PR gets a preview version (`preview` job in `ci.yml`): built with `VITE_PREVIEW_LABEL` (banner, client never pushes) and uploaded with `READ_ONLY=true` (the Worker rejects pushes). Previews read production D1 and never run migrations.
- Don't reintroduce `keep_vars` in `wrangler.jsonc`: preview versions carry `READ_ONLY=true`, and keeping vars could copy it into a production deploy.
- Before pushing: `npm test` and `npm run build` must pass.

## Commands
- `npm run dev` — dev server
- `npm test` — vitest unit tests
- `npm run dev:full` — build + Worker + local D1 on :8787 (needs `.dev.vars`, copy from `.dev.vars.example`)
- `npm run build` — typecheck app and worker + Vite build (run before committing)
- `npm run deploy` — what CI runs: build, apply D1 migrations remotely, `wrangler deploy`

## Layout
- `src/App.tsx` — shell: top nav, routes `#/` (Home), `#/settings`, `#/<module>/...`
- `src/lib/` — shared infrastructure
  - `db.ts` — IndexedDB wrapper; one object store per module (`STORES` + `DB_VERSION`). Every local write also queues an `outbox` entry
  - `sync.ts` — background sync: push outbox, then pull changes since a cursor. Last write wins per record
  - `useCollection.ts` — React hook that loads a store and exposes `save`/`remove`
  - `router.ts` — `useRoute`, `navigate`, `href`
  - `backup.ts` — JSON export/import covering every store
  - `image.ts`, `format.ts` — photo downscaling, money/date helpers (`money()` uses the display currency)
  - `settings.tsx` — synced app settings (single record in the `settings` store), e.g. display currency
- `worker/` — Cloudflare Worker: serves `dist/`, exposes `/api/sync/pull` and `/api/sync/push`, and verifies the Cloudflare Access JWT (`auth.ts`, fails closed). `protocol.ts` is shared with the client
- `migrations/` — D1 schema. The server stores records as opaque JSON strings keyed by (store, id), so new modules need no server changes
- `src/modules/` — feature modules, registered in `src/modules/index.ts`
- `src/modules/clothes/` — first module; use it as the reference implementation
  - `importers/whering.ts` — pure Whering → ClothingItem/Outfit mapping (type-only imports so Node can run it), used by `scripts/import-whering.ts`
  - Outfits live in their own `outfits` store (`Outfit` in `types.ts`, helpers in `outfits.ts`); logging an outfit wear also logs each piece

## Adding a module
1. Create `src/modules/<id>/` with `types.ts`, an `index.tsx` exporting a `LifeModule`, and its screens.
2. Add `'<id>'` to `STORES` in `src/lib/db.ts` **and bump `DB_VERSION`**, so existing users get the new store.
   Sync and backups pick the new store up automatically; the server needs no changes.
3. Register the module in `src/modules/index.ts`. Home, the nav and backups pick it up automatically.
4. Keep stats and other derived logic in pure functions (see `clothes/stats.ts`) with vitest tests next to them.

## Conventions
- Dates are stored as local `YYYY-MM-DD` strings (`today()` in `lib/format.ts`); timestamps as ISO strings.
- Never hard-delete history that stats depend on; prefer a status field (see clothes `status`).
- Use `wearCount(item)` for wear totals, never `item.wears.length`: imported items and outfits carry undated `priorWears`. Never invent wear dates.
- Forms must spread the existing record before overwriting fields they edit, so fields they don't show (tags, priorWears, occasions…) survive an edit.
- **Settings → Import items** upserts by `updatedAt` (newer wins); keep `updatedAt` current on every write.
- Never commit personal data exports (Whering exports, import files, backups).
- Styling lives in `src/styles.css` with CSS variables on `:root` and a dark-mode override. Keep touch targets ≥ 44px and check layouts at 390px width.
