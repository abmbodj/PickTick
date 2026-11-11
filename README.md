# PickTick

A Ticketmaster-style class demo on Cloudflare Workers. No real tickets, no real money.
What it does and why: [SPEC.md](SPEC.md).

| Do this | Command |
|---|---|
| Install | `npm install` |
| Set up the local database (once) | `npx wrangler d1 migrations apply picktick --local` |
| Run locally | `npm run dev` |
| Run the tests | `npm test` |
| Fire 50 simultaneous holds at one seat | `npm run contention -- <url> hot Front-1-1 50` |
| Reset every seat | `curl -X POST <url>/api/admin/reset -H "x-reset-secret: <secret>"` |
| Regenerate seed data after editing `scripts/make-seed.ts` | `npm run seed` |

The local reset secret is in `.dev.vars` (`dev-secret` by default).

## Deploy

1. `npx wrangler login`
2. `npx wrangler d1 create picktick`, then paste the printed `database_id` into `wrangler.jsonc`
3. `npx wrangler d1 migrations apply picktick --remote`
4. `npx wrangler secret put RESET_SECRET`
5. `npm run deploy`

## How it is put together

- `src/worker/index.ts`: the API (Hono). `src/worker/catalog.ts`: events and search (D1, FTS5).
- `src/worker/event-room.ts`: one Durable Object per event. It owns seats, holds, bookings and
  counters, and pushes changes over WebSocket. This is where "no seat sold twice" is enforced.
- `src/client/`: the React app. `lib/room.ts` is the client copy of live seat state.
- `shared/types.ts`: types and limits used by both sides (`HOLD_MS`, `MAX_HOLDS`).
