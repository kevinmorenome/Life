# Backfilling item lines for old takeout orders

Each Wolt "Vaša narudžba je isporučena: <venue> <dd.mm.yyyy>" email (sender info@wolt.com) has two PDFs: **Potvrda narudžbe**
(the restaurant's confirmation, with the items) and **Račun …** (Wolt's own fee invoice: delivery, service fee). The Gmail connector
can only be used from a Claude chat, so the work is split: Claude downloads the PDFs, `scripts/takeout-backfill.ts` parses them, Claude
sends the result to `attach_takeout_items`. Orders must already be in the takeout log (the tool reports `missingOrders` otherwise);
the PDF's "ID narudžbe" is the order's sourceId.

Needs `pdftotext` (poppler). The cache and PDFs hold personal data: keep them out of git (`takeout-items.cache.json` is ignored).

1. **Download** (in a Claude chat with Gmail and the Life connector). Search `from:info@wolt.com subject:"Vaša narudžba je isporučena" has:attachment`
   (about 200, page through them), `get_message` each, `download_gmail_attachment` both PDFs into one folder. Optionally write
   `manifest.json` there: `[{ "orderId": "...", "total": 30.17 }]` with the "Ukupno EUR" of the email, so the dry run can check the sums.
2. **Parse** (resumable, skips PDFs already in the cache):
   `node --experimental-strip-types scripts/takeout-backfill.ts parse <pdf-dir> takeout-items.cache.json`
3. **Dry run**: shows the 5 most recent orders with their items beside the totals, writes nothing:
   `node --experimental-strip-types scripts/takeout-backfill.ts dry-run takeout-items.cache.json 5`
   Check it before going on. A line that says DIFFERENT is not necessarily wrong (a tip is not on the PDFs).
4. **Payloads**: `... payload takeout-items.cache.json takeout-payloads 25` makes one JSON file per call of `attach_takeout_items`.
5. **Attach**: Claude calls `attach_takeout_items` with each file's content. Safe to repeat: orders that already have items are `alreadyAttached`.
6. **Mark done**: `... mark takeout-items.cache.json <orderId>...` for the ones the tool accepted, so `payload` skips them next time.
