# Life — project notes

Personal life-tracking web app (React + TypeScript + Vite), built one feature module at a time. Mobile-first, local-first storage (IndexedDB) synced to Cloudflare D1 through a Worker, hash routing. Hosted on Cloudflare Workers behind Cloudflare Access.

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
  - `image.ts`, `format.ts` — photo downscaling, money/date helpers
- `worker/` — Cloudflare Worker: serves `dist/`, exposes `/api/sync/pull` and `/api/sync/push`, and verifies the Cloudflare Access JWT (`auth.ts`, fails closed). `protocol.ts` is shared with the client
- `migrations/` — D1 schema. The server stores records as opaque JSON strings keyed by (store, id), so new modules need no server changes
- `src/modules/` — feature modules, registered in `src/modules/index.ts`
- `src/modules/clothes/` — first module; use it as the reference implementation

## Adding a module
1. Create `src/modules/<id>/` with `types.ts`, an `index.tsx` exporting a `LifeModule`, and its screens.
2. Add `'<id>'` to `STORES` in `src/lib/db.ts` **and bump `DB_VERSION`**, so existing users get the new store.
   Sync and backups pick the new store up automatically; the server needs no changes.
3. Register the module in `src/modules/index.ts`. Home, the nav and backups pick it up automatically.
4. Keep stats and other derived logic in pure functions (see `clothes/stats.ts`) with vitest tests next to them.

## Conventions
- Dates are stored as local `YYYY-MM-DD` strings (`today()` in `lib/format.ts`); timestamps as ISO strings.
- Never hard-delete history that stats depend on; prefer a status field (see clothes `status`).
- Styling lives in `src/styles.css` with CSS variables on `:root` and a dark-mode override. Keep touch targets ≥ 44px and check layouts at 390px width.
