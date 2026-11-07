# Office check-ins (Apple Shortcuts)

The **Office** module shows office and home days on a calendar. A day set by hand in the app always wins; otherwise the days come from check-ins your iPhone sends to the Worker.

## One-time setup

1. Pick a long random token (at least 24 characters, e.g. `openssl rand -hex 24`) and store it as a Worker secret:
   `npx wrangler secret put CHECKIN_TOKEN`
2. The endpoint is `POST https://<your-app>/mcp/checkin`. It lives under `/mcp`, so the Cloudflare Access bypass you already have for `/mcp` covers it; no Access change is needed. It uses its own token, so it can't be used to read the closet.

## Request

`POST /mcp/checkin` with header `Authorization: Bearer <token>` (or put the token in the path: `/mcp/checkin/<token>`) and a JSON body:

```json
{ "type": "arrive", "at": "2026-10-29T09:12:00+01:00" }
```

- `type`: `arrive`, `leave`, or `home` (end of day, not at the office).
- `at`: the phone's local date and time. The app reads the date and the `HH:MM` as written and ignores the offset.

Arrivals and departures make the day an office day, with the times used for the stats. A weekday with only a `home` check-in is a home day; a day with nothing is left unmarked. Sending the same check-in twice is harmless.

## Shortcuts

Create three **Personal Automations** (Shortcuts → Automation), each running without asking:

| When | Action |
| --- | --- |
| Join the office Wi-Fi (or Arrive at the office) | Get contents of URL: `type` = `arrive` |
| Leave the office Wi-Fi (or Leave the office) | Get contents of URL: `type` = `leave` |
| Every weekday at your end-of-day time, only if you are not at the office | Get contents of URL: `type` = `home` |

In each **Get contents of URL**: Method `POST`, header `Authorization` = `Bearer <token>`, Request Body `JSON` with `type` (Text) and `at` = **Current Date** formatted as *ISO 8601*.

Wi-Fi is more reliable indoors than a location trigger; add the location one as a fallback if you like.

## Backfill

Past days can be imported as a backup-format JSON file with a `workdays` store (`{ "id": "YYYY-MM-DD", "status": "home", "updatedAt": "…" }` per day) through **Settings → Import items**. Don't commit it; it is personal data.
