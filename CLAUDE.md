# Life — project notes

Personal life-tracking web app (React + TypeScript + Vite), built one feature module at a time. Mobile-first, local-only storage (IndexedDB), hash routing.

## Commands
- `npm run dev` — dev server
- `npm test` — vitest unit tests
- `npm run build` — `tsc -b` typecheck + Vite build (run before committing)

## Layout
- `src/App.tsx` — shell: top nav, routes `#/` (Home), `#/settings`, `#/<module>/...`
- `src/lib/` — shared infrastructure
  - `db.ts` — IndexedDB wrapper; one object store per module (`STORES` + `DB_VERSION`)
  - `useCollection.ts` — React hook that loads a store and exposes `save`/`remove`
  - `router.ts` — `useRoute`, `navigate`, `href`
  - `backup.ts` — JSON export/import covering every store
  - `image.ts`, `format.ts` — photo downscaling, money/date helpers
- `src/modules/` — feature modules, registered in `src/modules/index.ts`
- `src/modules/clothes/` — first module; use it as the reference implementation

## Adding a module
1. Create `src/modules/<id>/` with `types.ts`, an `index.tsx` exporting a `LifeModule`, and its screens.
2. Add `'<id>'` to `STORES` in `src/lib/db.ts` **and bump `DB_VERSION`**, so existing users get the new store.
3. Register the module in `src/modules/index.ts`. Home, the nav and backups pick it up automatically.
4. Keep stats and other derived logic in pure functions (see `clothes/stats.ts`) with vitest tests next to them.

## Conventions
- Dates are stored as local `YYYY-MM-DD` strings (`today()` in `lib/format.ts`); timestamps as ISO strings.
- Never hard-delete history that stats depend on; prefer a status field (see clothes `status`).
- Styling lives in `src/styles.css` with CSS variables on `:root` and a dark-mode override. Keep touch targets ≥ 44px and check layouts at 390px width.
