# PickTick

A ticket site with a live seat map, on Cloudflare Workers. Reservations are free; no real tickets are issued.
Live at https://picktick.pmbodj49.workers.dev. What it does and why: [SPEC.md](SPEC.md).

| Do this | Command |
|---|---|
| Install | `npm install` |
| Set up the local database (once) | `npx wrangler d1 migrations apply picktick --local` |
| Run locally | `npm run dev` |
| Run the tests | `npm test` |
| Fire 50 simultaneous holds at one seat | `npm run contention -- <url> hot Front-1-1 50` |
| Reset every seat | `curl -X POST <url>/api/admin/reset -H "x-reset-secret: <secret>"` |
| Regenerate seed data after editing `scripts/make-seed.ts` | `npm run seed` |

The local reset secret is in `.dev.vars` (create it with `RESET_SECRET=dev-secret`). The live
site's secret is in `.reset-secret`; both files are gitignored.

Reset the live site: `curl -X POST https://picktick.pmbodj49.workers.dev/api/admin/reset -H "x-reset-secret: $(cat .reset-secret)"`

## Real events (Ticketmaster Discovery API)

Without a key the site shows its own nine events. To add real events:

1. Create a free account at https://developer.ticketmaster.com and copy the Consumer Key of its app.
2. Live site: `npx wrangler secret put TICKETMASTER_API_KEY` and paste the key when asked.
3. Local: add a line `TICKETMASTER_API_KEY=<key>` to `.dev.vars` and restart `npm run dev`.

Real events get a generated 192-seat house, since the API has no seat data. Limits: 5 requests per
second, 5000 per day; responses are cached for 5 to 10 minutes.

## Deploy

1. `npx wrangler login`
2. `npx wrangler d1 create picktick`, then paste the printed `database_id` into `wrangler.jsonc`
3. `npx wrangler d1 migrations apply picktick --remote`
4. `npx wrangler secret put RESET_SECRET`
5. `npm run deploy`

## How it is put together

- `src/worker/index.ts`: the API (Hono). `src/worker/catalog.ts`: events, search and the My tickets
  index (D1, FTS5). `src/worker/ticketmaster.ts`: real events from the Discovery API.
- `src/worker/event-room.ts`: one Durable Object per event. It owns seats, holds, bookings and
  counters, and pushes changes over WebSocket. This is where "no seat sold twice" is enforced.
- `src/client/`: the React app. `lib/room.ts` is the client copy of live seat state.
- `shared/types.ts`: types and limits used by both sides (`HOLD_MS`, `MAX_HOLDS`).
