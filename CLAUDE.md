# Life — project notes

Personal life-tracking web app (React + TypeScript + Vite), built one feature module at a time. Mobile-first, local-first storage (IndexedDB) synced to Cloudflare D1 through a Worker, hash routing. Hosted on Cloudflare Workers behind Cloudflare Access.

## Workflow
- `main` is production: CI deploys the repo's default branch (`main`) on every push. Never push to `main` directly.
- Work on a feature branch from `main` and open a PR into `main`; the PR description says what changed, how it was tested, and whether it adds a D1 migration.
- Each same-repo PR gets a preview version (`preview` job in `ci.yml`): built with `VITE_PREVIEW_LABEL` (banner, client never pushes) and uploaded with `READ_ONLY=true` (the Worker rejects pushes). Previews read production D1 and never run migrations.
- Don't reintroduce `keep_vars` in `wrangler.jsonc`: preview versions carry `READ_ONLY=true`, and keeping vars could copy it into a production deploy.
- Before pushing: `npm test` and `npm run build` must pass.

- Upcoming work and ideas live in GitHub Issues (see `TODO.md` for labels and workflow); check them before starting a feature, reference the issue with `Closes #N` in the PR, and open new issues for follow-ups.

## Commands
- `npm run dev` — dev server
- `npm test` — vitest unit tests
- `npm run dev:full` — build + Worker + local D1 on :8787 (needs `.dev.vars`, copy from `.dev.vars.example`)
- `npm run build` — typecheck app and worker + Vite build (run before committing)
- `npm run deploy` — what CI runs: build, apply D1 migrations remotely, `wrangler deploy`

## Layout
- `src/App.tsx` — shell: top bar (name, sync dot, settings), routes `#/settings` and `#/<module>/...`; with a single module, `#/` opens it (Home lists modules once there are more)
- `src/BottomNav.tsx` — Instagram-style bottom tab bar from the module's `tabs`, with a centre ＋ menu from its `actions`; hidden where `hideNav` says (forms with their own bottom Save)
- `src/icons.tsx` — inline line icons; `public/` holds the PWA manifest and icons (`node scripts/make-icons.mjs` regenerates them)
- `src/lib/` — shared infrastructure
  - `db.ts` — IndexedDB wrapper; one object store per module (`STORES` + `DB_VERSION`). Every local write also queues an `outbox` entry
  - `sync.ts` — background sync: push outbox, then pull changes since a cursor. Last write wins per record
  - `useCollection.ts` — React hook that loads a store and exposes `save`/`remove`
  - `router.ts` — `useRoute`, `navigate`, `href`
  - `backup.ts` — JSON export/import covering every store
  - `image.ts`, `format.ts` — photo downscaling and background removal for item photos (`cutOutImage`: on-device `@imgly/background-removal`, lazy-loaded, model files from IMG.LY's CDN; pure clean-up in `cutout.ts`), money/date helpers (`money()` uses the display currency)
  - `settings.tsx` — synced app settings (single record in the `settings` store), e.g. display currency
- `worker/` — Cloudflare Worker: serves `dist/`, exposes `/api/sync/pull` and `/api/sync/push`, and verifies the Cloudflare Access JWT (`auth.ts`, fails closed). `protocol.ts` is shared with the client
  - `mcp.ts` + `mcpTools.ts` — MCP endpoint (`/mcp`, bypassed in Access, guarded by the `MCP_TOKEN` secret) so Claude can read the closet and log wears; `records.ts` holds the D1 upsert/list helpers. Tools must never edit existing records: wears go through the `inbox` store (below); new items/outfits have fresh ids so they're written directly
- `migrations/` — D1 schema. The server stores records as opaque JSON strings keyed by (store, id), so new modules need no server changes
- `src/modules/` — feature modules, registered in `src/modules/index.ts`
- `src/modules/clothes/` — first module; use it as the reference implementation
  - `importers/whering.ts` — pure Whering → ClothingItem/Outfit mapping (type-only imports so Node can run it), used by `scripts/import-whering.ts`
  - Closet list: search bar + filter button; `FilterSheet` is the full-screen filter page (sub-category, colors, sort, status, favorites; category stays as tabs on the list) and `closetFilter.ts` holds the pure filter/sort logic
  - Outfits live in their own `outfits` store (`Outfit` in `types.ts`, helpers in `outfits.ts`); logging an outfit wear also logs each piece
  - Calendar (`#/clothes/calendar[/YYYY-MM | /YYYY-MM-DD[/outfit|/items]]`) is derived from dated `wears` only (`calendar.ts`); there's no separate calendar store
- Inbox: `inbox` store holds `WearRequest`s, `TagRequest`s, `OutfitEditRequest`s (rename, add/remove pieces) and `ItemEditRequest`s (field changes, never wears/photo/tags) and `PhotoRequest`s (`set_item_photo`: the Worker downloads the image and the app sets it on the existing item, then drops the image from the request) queued by the MCP endpoint. `processInbox()` (`clothes/inboxRunner.ts`, registered with `setAfterPull` in `main.tsx`, skipped in PR previews) applies them via pure `applyInbox()` after each pull, then marks them applied; wears are idempotent per date
- Receipts: Claude reads order emails via the Gmail connector and adds the clothes with the `add_receipt_items` MCP tool (`mcpTools.ts`; validation, item building and image download in `receipt.ts`). Items are fresh `ClothingItem`s with `needsReview: true` and ids `receipt-<message id>-<n>` (idempotent per email); the closet marks them (`ReviewMark`, banner, `reviewOnly` filter) and `ReviewFlow` (`#/clothes/review`, pure helpers in `review.ts`) is a bottom drawer over the closet that steps through them one at a time, each shown as the normal `ItemDetail` page in its `review` mode (every field editable in place; Save → `markReviewed()` and slide to the next; "Check later" keeps the flag and skips it for that visit; swiping the page left, handled with pointer events in `ReviewFlow`, is the same as Check later). When an item comes up, `ReviewFlow` also cuts out its photo's background on-device (`cutOutImage`, saved via pure `withCutOutPhoto()` only if the photo and item are still as they were; the original stays if it can't run), and changing a photo on `ItemDetail` does the same (`itemPhoto` in `lib/image.ts`). Don't put `transform`/`will-change` on the sliding page: it would trap the fixed field sheets inside it (the swipe only sets an inline transform while dragging or settling). PR previews have Settings → "Add sample items to review" (`sampleReview.ts`), local only, since previews never push. MCP guards keep an item's wear history in one record: `add_item` and `add_receipt_items` refuse a same-name/brand duplicate of an active or stored item (`findDuplicate` in `receipt.ts`) unless the user confirmed, and `edit_item` only retires an item with `confirmRetire`; photos for existing items go through `set_item_photo`. Other edit paths must keep `needsReview` (spread the record)
- `src/modules/packing/` — trips in the `trips` store (`Trip` in `types.ts`). The checklist is derived by `packingList()` in `packing.ts` from planned outfits per day (`outfitPlan`) + hand-picked items + custom extras; only `packed` ids are stored. Clothes' calendar reads trips to mark trip days and offer "Log as worn" for planned outfits

## Adding a module
1. Create `src/modules/<id>/` with `types.ts`, an `index.tsx` exporting a `LifeModule` (including bottom-bar `tabs`, ＋ menu `actions`, and `hideNav` for form routes), and its screens.
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
- Prefer small icon buttons (≥ 44px touch target, with an `aria-label`) over text buttons for actions like add, remove, edit and toggle; keep text for primary Save/Cancel in forms.
- UI should look like the Whering app: icon buttons over text buttons (text only for primary Save/Cancel), floating menus (`IconMenu`, `.menu`) over drawers or inline button rows, flat-lay outfit tiles with floating round icon buttons (`.card-fab`), borderless photo grids (pieces float on the page background, no boxed tiles), and no cards inside cards — use flat sections and hairline lists instead of boxed rows.
- Styling lives in `src/styles.css` with CSS variables on `:root` and a dark-mode override. Keep touch targets ≥ 44px and check layouts at 390px width.
