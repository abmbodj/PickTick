# PickTick: spec

Status: approved and built. Live at https://picktick.pmbodj49.workers.dev
Date: 2026-11-11

## 1. Intent

A working Ticketmaster-style site on a `workers.dev` URL, shown in a computer
organization and architecture class and then used live by classmates on their
own phones and laptops. It is for fun, not a grade. The audience studies system
design, so the app should make its contention handling visible: many people tap
the same seat, exactly one gets it, everyone else watches it change.

Source design: Hello Interview's Ticketmaster breakdown
(https://www.hellointerview.com/learn/system-design/problem-breakdowns/ticketmaster).

Everything below marked **(my call)** was decided by Claude, not the owner.
Change any of them before approving.

## 2. Goals, non-goals, anti-goals

Goals (the article's three core requirements):

1. View an event, including a live seat map.
2. Search events by keyword, type and date.
3. Book seats: hold, pay (fake), confirm. No seat is ever sold twice.

Plus one for the classroom **(my call)**:

4. Show the machinery: live counters of holds granted, conflicts rejected,
   holds expired and seats sold for the event on screen.

Non-goals:

- Real payments. No card fields exist anywhere, so nobody can type a real card.
- Accounts, passwords, email. A visitor types a nickname and that is all.
- Admin UI for creating events. Events come from a seed file.
- "My bookings" list, dynamic pricing, virtual waiting queue, rate limiting,
  edge caching. See section 9 for when each would be worth adding.

Anti-goals (it fails if any of these happen, even if it "works"):

- Two people end up holding or owning the same seat.
- A seat stays stuck as held after its hold has expired.
- It breaks or is unusable on a phone during the demo.
- The presenter cannot reset it between runs.

## 3. How the article's design maps to Cloudflare

| Article | PickTick | Why |
|---|---|---|
| API Gateway, Event, Search, Booking services | One Worker running Hono | One deploy, a handful of routes |
| PostgreSQL | D1 | Catalog only: events, venues, performers |
| Elasticsearch + CDC | D1 FTS5 table | Dozens of events, not millions |
| Redis lock with TTL | One Durable Object per event | Single-threaded, so check-and-hold is atomic without a lock |
| Ticket and Booking tables | SQLite storage inside that event's Durable Object | Holds, sales and bookings change together in one place, no cross-store transaction |
| SSE seat updates | WebSocket from the Durable Object | Built in; uses the hibernation API |
| Redis cache, CDN | Skipped | A classroom of users does not need it |
| Stripe | Fake "Pay" button | Demo |

The article's "implicit status with expiration time" is used for holds: a hold
is a row with `expires_at`, and any hold past that time is treated as absent.
No cron job and no cleanup is needed for correctness.

## 4. Stack

The owner asked for a mainstream industry stack rather than plain HTML, CSS and
JavaScript. The specific picks below are **my call**.

- Cloudflare Workers, TypeScript throughout, deployed with `wrangler` to
  `picktick.<account-subdomain>.workers.dev`. Must fit the free plan.
- Frontend: React single-page app built with Vite and the Cloudflare Vite
  plugin, served by Workers static assets. React Router for the three pages,
  Tailwind CSS for styling, TanStack Query for server data. The seat map is an
  SVG React component fed by the WebSocket.
- API: Hono on the Worker, with Zod validating every request body and query.
  The request and response types are shared with the frontend.
- D1 for the catalog, accessed through Drizzle ORM (schema and migrations in
  code; the FTS5 table is a raw SQL migration). One Durable Object class,
  `EventRoom`, SQLite-backed, one instance per event id.
- Tests: Vitest with `@cloudflare/vitest-pool-workers` for the hold logic.
- One repository, one deploy. Use current stable versions at build time and
  check each library's docs rather than relying on memory.

Not chosen: Next.js. It runs on Workers only through an adapter, and this app
has no need for server rendering.

## 5. Data model

D1 (read-mostly, written only by the seed script):

- `venue(id, name, city, seat_map_json)`; the seat map lists sections, rows and
  seats with x/y coordinates for drawing.
- `performer(id, name, blurb)`
- `event(id, venue_id, performer_id, name, description, type, starts_at)`;
  `type` is one of `concert`, `sports`, `theater`, `comedy`.
- `event_fts`: FTS5 over event name, description, performer name, venue name,
  city.

`EventRoom` Durable Object storage (one per event):

- `seat(id, section, row, number, price_cents, booking_id NULL)`; a seat with a
  `booking_id` is sold.
- `hold(seat_id PRIMARY KEY, user_id, nickname, expires_at)`
- `booking(id, user_id, nickname, total_cents, created_at)`
- `stats(granted, rejected, expired, sold)`

Seats are created from the venue seat map the first time an event's room is
used. Money is integer cents. All time comparisons use the Durable Object's
clock, never the browser's.

## 6. Behaviour

Identity:

- First visit sets an `HttpOnly` cookie with a random user id. The visitor is
  asked for a nickname (1 to 20 characters) before their first hold. Nicknames
  are always escaped when shown.

Seat states as everyone sees them: `available`, `held` (with holder nickname),
`sold` (with buyer nickname).

Holding:

- Tapping an available seat holds it immediately for the tapper.
- Tapping your own held seat releases it.
- A user can hold at most 4 seats per event.
- Hold length is 2 minutes **(my call; the article uses 10, shorter lets the
  class see a hold expire)**. It is one constant.
- All of a user's holds on an event share one deadline, set by their first
  hold. Adding seats does not extend it.
- When the deadline passes, the seats show as available to everyone without a
  page refresh.

Checkout:

- The checkout view lists held seats, the total and a countdown to the deadline.
- "Pay" confirms all of the user's live holds in one step, creates one booking
  and marks the seats sold.
- If the deadline has passed, Pay fails with a clear message and sells nothing.
- Pressing Pay twice does not create two bookings.

Live updates:

- The event page opens a WebSocket to the event's room. It receives a full
  snapshot on connect and then one message per seat change, plus updated
  counters. On disconnect it reconnects and takes a fresh snapshot.

Reset:

- `POST /api/admin/reset` with a secret header clears holds, bookings and
  counters for every event, so the demo can be run again.

## 7. HTTP interface

| Method and path | Does |
|---|---|
| `GET /api/events/search?q=&type=&from=&to=` | Matching events, soonest first; with no parameters, all upcoming events |
| `GET /api/events/:id` | Event, venue (with seat map), performer |
| `GET /api/events/:id/live` | WebSocket upgrade: snapshot, then seat and counter updates |
| `POST /api/events/:id/holds` `{seatId, nickname}` | Hold a seat. `409` if taken, `422` if over the limit |
| `DELETE /api/events/:id/holds/:seatId` | Release your own hold |
| `POST /api/events/:id/bookings` `{bookingId, nickname}` | Confirm your live holds. The browser makes one `bookingId` per checkout, so paying twice is one booking. `410` if expired |
| `GET /api/events/:id/bookings/:bookingId` | Booking for the confirmation page, owner only |
| `POST /api/admin/reset` | Reset demo state; requires secret |

Pages: `/` (search and list), `/event/:id` (seat map, counters, checkout
panel), `/event/:id/booking/:bookingId` (confirmation).

All input is validated on the server: ids exist, nickname length, seat belongs
to the event.

## 8. Acceptance checks

Automated (hold logic, in Vitest against a real `EventRoom`):

1. 50 simultaneous hold requests for one seat from 50 users: exactly one
   succeeds, 49 get `409`, and the rejected counter rises by 49.
2. A held seat becomes holdable by someone else once the deadline passes.
3. Pay after the deadline returns `410` and no seat is sold.
4. Pay twice returns the same booking and the seats are sold once.
5. A fifth hold by the same user returns `422`.
6. A user cannot release or pay for another user's hold.

Manual, on the deployed URL:

7. Two phones on the same event: a tap on one shows as held on the other
   within about a second.
8. A search for a performer's name finds their event; a type filter narrows the
   list.
9. Every page is usable one-handed at phone width and readable on a projector.
10. Reset returns every seat to available.

A small script that fires parallel holds at the deployed URL is included so the
presenter can show check 1 live.

## 9. Left out, and when to add it

- Virtual waiting queue: when one event sees more people than seats by a large
  factor and the seat map becomes a wall of rejections.
- Edge caching of event and search responses: when D1 reads show up as slow.
- Rate limiting: if someone in the room scripts the hold endpoint.
- Real Stripe test mode: if the payment step itself becomes part of the lesson.
- Nickname filtering: if the room cannot be trusted with a text box.

## 10. Seed content (my call)

About 8 invented events across the four types, with invented performers and
venues of 80 to 200 seats. One small "hot" event of about 40 seats, so a class
can sell it out and fight over the last seats.

## 11. Left to the builder

- Visual design, through the impeccable skill: write `PRODUCT.md` first from
  section 1, then design for a phone in a lit classroom and a projector.
- File layout, exact SQL, WebSocket message shapes.
- Exact wording of error messages, as long as each says what happened and what
  to do next.

## 12. Needs the owner

- A Cloudflare account, and running `wrangler login` once; this decides the
  `workers.dev` subdomain.
- Choosing the reset secret.
