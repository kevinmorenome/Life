# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
One user: the owner, on their own phone (iPhone, installed as a home-screen PWA), reached behind Cloudflare Access. Desktop is secondary. They open it many times a day for quick logging (what I wore, ate, watched, played, where I worked) and now and then to look back (calendar, stats, trips, year in review). No other users are planned.

## Product Purpose
A personal life-tracking app: one calm place to log and look back on your life across clothes, food and recipes, trips and places, work days, entertainment (watching, music, books) and game nights. The calendar is where every module meets. Success is that logging takes seconds, most data arrives on its own from services already in use (Swarm, Trakt, stats.fm, TripIt, receipts and emails read by Claude), and looking back shows patterns you would never have written down.

## Positioning
Not a generic habit tracker or journal: a private, local-first record built one feature module at a time around the owner's own life, with the calendar as the shared timeline and Claude (through an MCP endpoint) as a second way to read and log.

## Operating Context
- React + TypeScript + Vite, hash routing, mobile-first.
- Local-first storage in IndexedDB, synced to Cloudflare D1 through a Worker; hosted on Cloudflare Workers behind Cloudflare Access.
- Modules are registered in `src/modules/`; the bottom bar, the ＋ menu, the calendar layers and the Stats tabs all belong to the app shell, not to modules.
- Claude reads and logs through an MCP endpoint (closet, wears, receipts, recipes, check-ins, digests).
- PR previews are read-only against production data.

## Capabilities and Constraints
- Modules: Clothes (closet, outfits, wear log, receipts), Calendar, Work, Check-ins (Swarm), Trips (TripIt, Swarm suggestions), Countries, Games, Watching (Trakt), Takeout (Wolt/Bolt/Uber), Music (stats.fm), Books (Goodreads import), Food (receipts, stock, shopping, prices) and Recipes (cooking mode, timers).
- Dates are local `YYYY-MM-DD`; history that stats depend on is never hard-deleted.
- Data exports and personal files are never committed.
- Navigation has no back buttons: swiping right goes back.
- The page never scrolls sideways; checked at 390px width.

## Brand Commitments
The existing look is Liquid Glass with one rule: glass is the control layer, content is flat (see CLAUDE.md, Conventions). Icon buttons over text buttons, floating menus over drawers, borderless photo grids, no cards inside cards. Treat this as the incumbent system, not something to replace.

## Evidence on Hand
Real, running app with its own data; no testimonials, customers or benchmarks exist and none should be invented. Layout and behaviour are documented in `CLAUDE.md`; styles live in `src/styles.css`.

## Product Principles
- Logging in seconds beats completeness: automate what a service can supply, and ask only for what it cannot.
- Everything meets on the calendar, a single timeline for all modules.
- Derive, don't duplicate: stats, stock and calendars are computed from records, never stored twice.
- Never invent data: unknown stays "date unknown" or empty.
- Quiet and personal: the interface recedes and the content (photos, days, numbers) leads.

## Accessibility & Inclusion
Touch targets at least 44px with an `aria-label` on icon buttons; meaning is never carried by colour alone (words or icons too); glass has an opaque fallback for `prefers-reduced-transparency`; dark mode supported.
