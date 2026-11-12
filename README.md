# PickTick

A ticket site where the seat map is live. You watch seats get taken as it happens, you hold yours for
two minutes while you decide, and exactly one person ever gets a seat. It was built to show a
classroom how a ticketing system handles contention, then let the whole room try to break it from
their phones.

**Live:** https://picktick.pmbodj49.workers.dev

Reservations are free and no real ticket is issued. There are no card fields anywhere.

## What it does

- **Live seat map.** Every seat is available, held, yours or sold. Changes made by anyone are pushed to
  everyone viewing that event over a WebSocket, and each state differs by shape and mark as well as
  colour.
- **Holds that expire.** Tap up to 4 seats; they are yours for 2 minutes. If you don't pay in time they
  return to the map on their own.
- **No seat sold twice.** When many people tap the same seat at once, one gets it and the rest are told
  "Someone got that seat first".
- **Live counters.** Each event shows holds granted, conflicts rejected, holds expired, seats sold, and
  how many people have it open right now.
- **Search and browse.** Search by performer, team, venue or city, filter by type and date, and see all
  of a performer's dates on one page. The landing page lists events near you (from Cloudflare's city
  level location) or trending ones when there is no location.
- **Book from the landing page.** Search, pick seats and pay without leaving the hero; the ticket
  prints in place.
- **Tickets without accounts.** You are identified by an anonymous cookie. Your tickets are listed under
  My tickets and can be cancelled, which frees the seats.
- **Real events (optional).** With a Ticketmaster API key, real concerts, games and shows are mixed in
  with PickTick's own nine events.

## Quick start

Needs Node 22.18 or later (the scripts in `scripts/` run TypeScript directly).

```bash
npm install
echo "RESET_SECRET=dev-secret" > .dev.vars
npx wrangler d1 migrations apply picktick --local
npm run dev
```

Then open the URL Vite prints (http://localhost:5173 unless that port is taken).

## Commands

| Do this | Command |
|---|---|
| Run locally | `npm run dev` |
| Run the tests (79, in the Workers runtime) | `npm test` |
| Type-check | `npm run typecheck` |
| Build and deploy | `npm run deploy` |
| Fire 50 simultaneous holds at one seat | `npm run contention -- <url> hot Front-1-1 50` |
| Reset every seat, hold and booking | `curl -X POST <url>/api/admin/reset -H "x-reset-secret: <secret>"` |
| Regenerate seed data after editing `scripts/make-seed.ts` | `npm run seed` |

`<url>` is `http://localhost:5173` locally or the live URL. The contention script defaults to the `hot`
event, seat `Front-1-1` and 50 requests, then prints a count per HTTP status: one `200` (the hold
granted) and the rest `409` (someone got there first).

## Configuration

| Name | Where | Needed for |
|---|---|---|
| `RESET_SECRET` | `.dev.vars` locally, `npx wrangler secret put RESET_SECRET` live | The reset endpoint |
| `TICKETMASTER_API_KEY` | `.dev.vars` locally, `npx wrangler secret put TICKETMASTER_API_KEY` live | Real events (optional) |

`.dev.vars` and `.reset-secret` (the live site's reset secret, kept locally) are gitignored. To reset
the live site:

```bash
curl -X POST https://picktick.pmbodj49.workers.dev/api/admin/reset -H "x-reset-secret: $(cat .reset-secret)"
```

### Real events from Ticketmaster

Without a key the site shows only its own nine events. To add real ones, create a free account at
https://developer.ticketmaster.com, copy your app's Consumer Key, and set it as
`TICKETMASTER_API_KEY` (above). Restart `npm run dev` after editing `.dev.vars`.

The API has no seat data, so each real event gets a generated 192-seat house, and the site says its seat
map and prices are PickTick's own. Ticketmaster allows 5 requests per second and 5,000 per day;
responses are cached for 5 to 10 minutes.

## Deploy your own

1. `npx wrangler login`
2. `npx wrangler d1 create picktick`, then put the printed `database_id` into `wrangler.jsonc`
3. `npx wrangler d1 migrations apply picktick --remote`
4. `npx wrangler secret put RESET_SECRET` (and `TICKETMASTER_API_KEY` if you want real events)
5. `npm run deploy`

It fits Cloudflare's free plan.

## How it works

| Piece | Built with | Holds |
|---|---|---|
| API | One Worker running Hono, every input checked with Zod | Routes, the anonymous identity cookie |
| Catalog and search | D1 (SQLite) with Drizzle and an FTS5 index | Events, venues, performers, the My tickets index |
| Seats | One `EventRoom` Durable Object per event, with its own SQLite storage | Seats, holds, bookings, counters, WebSocket viewers |
| Front end | React, React Router, TanStack Query, Tailwind CSS, built with Vite | The pages and the SVG seat map |

**Why no seat is sold twice.** Every hold, payment and cancellation for an event goes to that event's
Durable Object, which handles one request at a time. Checking a seat is free and marking it held happen
in the same step, so there is nothing to race and no lock to manage. Holds, sales and bookings live in
the same storage, so there is no cross-database transaction either.

**Why holds expire without a cleanup job.** A hold is a row with an `expires_at` time, and any hold past
that time is treated as absent. An alarm wakes the room at the next expiry only to push the freed
seats to viewers; correctness never depends on it.

The design follows Hello Interview's
[Ticketmaster breakdown](https://www.hellointerview.com/learn/system-design/problem-breakdowns/ticketmaster),
mapped onto Cloudflare. [SPEC.md](SPEC.md) has the full mapping and the reasoning.

### API

| Method and path | Does |
|---|---|
| `GET /api/events/search` | Search and filter events (`q`, `type`, `from`, `to`, `page`, `nearby=1`) |
| `GET /api/events/:id` | One event with its venue and seat layout |
| `GET /api/events/:id/live` | WebSocket: seat changes, counters and viewer count |
| `POST /api/events/:id/holds` | Hold a seat (409 if taken, 422 past 4 seats) |
| `DELETE /api/events/:id/holds/:seatId` | Release a held seat |
| `POST /api/events/:id/bookings` | Pay for your holds (410 if they ran out) |
| `GET /api/events/:id/bookings/:bookingId` | One booking |
| `DELETE /api/events/:id/bookings/:bookingId` | Cancel a booking and free its seats |
| `GET /api/performers/:id` | A performer and all their dates |
| `GET /api/me/bookings` | Your tickets |
| `POST /api/admin/reset` | Reset everything (needs `x-reset-secret`) |
| `GET /api/health` | Health check |

### Project layout

```
src/worker/index.ts         the API routes
src/worker/event-room.ts    the Durable Object: seats, holds, bookings, live updates
src/worker/catalog.ts       events, search and the My tickets index (D1)
src/worker/ticketmaster.ts  real events from the Discovery API
src/worker/identity.ts      the anonymous uid cookie
src/client/pages/           Landing, Events, Event, Artist, Booking, Tickets, Privacy
src/client/components/      SeatMap, HeroBooking, CheckoutPanel, TicketCard, Stats, ...
src/client/lib/             API client, live room state, the booking hook
shared/                     types, limits (HOLD_MS, MAX_HOLDS) and seat layouts used by both sides
migrations/                 D1 schema and seed data
scripts/                    seed generator and the contention test
test/                       Vitest tests run in the Workers runtime
```

## Design

The look is dark by choice: obsidian ink, velvet curfew and almond hearth, with Archivo's wide display
weights for headlines. The site is flat everywhere except the landing hero's soft gradient. Seat states
never rely on colour alone, so a washed-out projector can still tell them apart. Motion only marks a
change of state and is removed for anyone who prefers reduced motion. [PRODUCT.md](PRODUCT.md) has the
brand, audience and design principles.

## Left out on purpose

Real payments, accounts, an admin UI for events, a virtual waiting queue, rate limiting and edge
caching. Each is a non-goal for a classroom demo; [SPEC.md](SPEC.md) section 9 says when each would be
worth adding.
