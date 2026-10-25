# Life — to-do & ideas

Running list of what's next. Move items to **Done** (with the PR number) when they ship, and add new ideas under the right module. Keep each item to one line; put design detail in the PR.

## Clothes

### Next up
- [ ] Show the favourite heart on closet and outfit lists, and add a "Favorites" filter (the flag is saved on items and outfits but not shown anywhere else yet).
- [ ] Look at the new item and outfit pages with real cut-out photos and in dark mode (only checked with placeholder items, light mode).
- [ ] Colours as a real list on `ClothingItem` (today `color` is free text split on commas), with a swatch picker in the item form.
- [ ] Add more colour names to `colors.ts` as you hit ones that show a grey dot.
- [ ] "Wore it today" quick button back on the item page (currently only via the Stats tab wear log).

### Ideas from the inspiration screenshots
- [ ] Schedule an outfit for a future date ("Agendar"); the calendar only shows past wears today.
- [ ] Outfit selfies: attach photos to an outfit wear ("Selfies del conjunto").
- [ ] Share action (the paper-plane icon).
- [ ] Nested categories (e.g. Shirts > Polo shirt) instead of the flat list.
- [ ] Tabs (About / Style / Stats) on the outfit page, like the item page.
- [ ] Inline edit of colours and tags from the detail page.

### Done
- [x] Redesigned item and outfit detail pages: flat hero, edit / favourite / ⋮ menu, tabs, colour swatches, coloured stat icons, month-grouped wear log (#5).

## App-wide
- [ ] Other modules (see `src/modules/`), added one at a time following `clothes/`.

## Notes
- Previews (`https://pr-<number>-life.<subdomain>.workers.dev`) are read-only; production only updates when a PR merges into `main`.
