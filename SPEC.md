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

---

# Version 2: a public site with real events

Date: 2026-11-11. Decided by the owner: real Ticketmaster events are bookable
with PickTick's pretend checkout; "My tickets" is tied to the browser, with no
accounts; the site must work before the API key exists. Everything else in this
section marked **(my call)** was decided by Claude.

## V2.1 What changes

1. No "class demo" wording anywhere. PickTick presents as its own site.
2. A landing page at `/`. Search moves to `/events`.
3. "My tickets" at `/tickets`: every booking made in this browser.
4. Real events from the Ticketmaster Discovery API v2 appear in search and on
   the landing page, next to PickTick's own events, and can be booked the same
   way.

## V2.2 Honesty rules (not negotiable, my call)

Real event names next to a checkout would let a visitor believe they hold a
real ticket. So, without using the words "class" or "demo":

- Checkout says, next to the button: no payment is taken and PickTick does not
  issue real tickets. The button reads "Reserve", not "Pay".
- Every confirmation and every entry in My tickets carries the same line.
- Every Ticketmaster-sourced event page links to that event on Ticketmaster for
  real tickets, and the footer credits Ticketmaster for event data.
- No Ticketmaster logos or branding. PickTick never claims to be affiliated.

Known risk the owner accepted: Ticketmaster's API terms forbid applications
that replicate the Ticketmaster.com experience, so the key may be revoked. The
site must keep working without it.

## V2.3 Ticketmaster integration

- Secret `TICKETMASTER_API_KEY`. When it is missing, or the API fails or is
  rate limited, search returns PickTick's own events only and says nothing;
  a Ticketmaster event page that cannot be loaded shows a "could not load"
  state with a retry.
- Event ids from Ticketmaster are prefixed `tm-`. PickTick's own ids never
  start with `tm-`.
- Search calls `GET /discovery/v2/events.json` with `keyword`, a
  classification filter mapped from our four types, `startDateTime` /
  `endDateTime`, `countryCode=US`, `size=20`, `sort=date,asc`. Results merge
  with own events, soonest first. Events with no announced date are dropped.
- Responses are cached at the edge (Cache API) for 5 minutes for search and 10
  minutes for one event, to stay inside 5 requests per second and 5000 per day
  and inside the terms' "reasonable periods". The search box waits 300 ms after
  typing stops.
- Start times use the event's local date and time, so they read as the venue's
  wall clock, like PickTick's own events.
- Ticketmaster has no seat-level data, so each Ticketmaster event gets a
  generated house **(my call)**: three sections of 4 rows by 16 seats (192
  seats), priced from the event's price range when present (max, midpoint,
  min), else $120 / $75 / $45. The seat map is fixed the first time the event's
  room is used.
- Event images are shown from Ticketmaster's URLs, not copied.

## V2.4 My tickets

- The Durable Object stays the source of truth for a booking. After a
  successful confirm, the Worker also writes one row to D1 table
  `user_booking` (user id, booking id, event id, event name, start time, venue,
  city, image URL, seats, total, created at). Reading a booking repairs a
  missing row. The write is idempotent on booking id.
- `GET /api/me/bookings` returns the caller's rows, soonest event first.
- Reset also clears `user_booking`, and resets the rooms of every own event
  plus every event that has a row there.
- Clearing cookies loses access to tickets. The page says so.

## V2.5 Pages

- `/`: landing. What PickTick is, a search box that leads to `/events`, a row
  of upcoming events, and the three steps of a booking (pick a seat, hold it
  for two minutes, reserve).
- `/events`: search (was `/`).
- `/event/:id`: as before, plus the event image, and for Ticketmaster events
  the link to real tickets. The counters stay, titled "Live seat activity".
- `/tickets`: My tickets, with an empty state that leads to `/events`.
- `/privacy`: what is stored (an anonymous id cookie, the name typed, the
  bookings), that no payment data is collected, and where event data comes
  from. Linked from the footer of every page, as the API terms require.

## V2.6 Acceptance checks

Automated:

1. With no API key, search returns exactly the own events and never calls out.
2. With a key and a stubbed API, search merges both sources by date, maps
   fields correctly, drops undated events, and sends the mapped filters.
3. A failing or rate-limited API gives own events only, not an error.
4. `tm-` event detail maps name, start, venue, city, performer, image and
   link, and has a 192-seat map priced from the price range.
5. Holding and reserving a seat on a `tm-` event works end to end.
6. After a booking, `GET /api/me/bookings` lists it for that browser only;
   reading a booking whose row is missing restores the row.
7. Reset empties My tickets.

Manual: landing, events, tickets and privacy pages at phone and desktop width;
the words "class" and "demo" appear nowhere in the UI.

Not verified until the owner adds a key: the mapping against the live API.
