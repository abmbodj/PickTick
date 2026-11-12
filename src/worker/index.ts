import { Hono } from 'hono';
import { z } from 'zod';
import { EVENT_TYPES, MAX_PAGES, NICKNAME_MAX, type Booking } from '../../shared/types';
import {
  type CatalogEnv,
  clearTickets,
  getEvent,
  getPerformer,
  groupEvents,
  listEventIds,
  listTickets,
  recordTicket,
  searchEvents,
} from './catalog';
import { identity } from './identity';

export { EventRoom } from './event-room';

const app = new Hono<{ Bindings: Env; Variables: { uid: string } }>();

app.use('/api/*', identity);

app.get('/api/health', (c) => c.json({ ok: true }));

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const searchQuery = z.object({
  q: z.string().max(100).optional(),
  type: z.enum(EVENT_TYPES).optional(),
  from: day.optional(),
  to: day.optional(),
  page: z.coerce.number().int().min(0).max(MAX_PAGES - 1).optional(),
});

app.get('/api/events/search', async (c) => {
  const parsed = searchQuery.safeParse(c.req.query());
  if (!parsed.success) return c.json({ error: 'Invalid search parameters' }, 400);
  const { events, page, totalPages } = await searchEvents(c.env, parsed.data);
  return c.json({ groups: groupEvents(events), page, totalPages });
});

app.get('/api/performers/:id', async (c) => {
  try {
    const performer = await getPerformer(c.env, c.req.param('id'));
    return performer ? c.json(performer) : c.json({ error: 'Nothing on sale for this performer' }, 404);
  } catch {
    return c.json({ error: 'These dates could not be loaded right now. Try again in a moment.' }, 502);
  }
});

app.get('/api/events/:id', async (c) => {
  try {
    const event = await getEvent(c.env, c.req.param('id'));
    return event ? c.json(event) : c.json({ error: 'Event not found' }, 404);
  } catch {
    return c.json({ error: 'This event could not be loaded right now. Try again in a moment.' }, 502);
  }
});

// The booking itself lives in the event's room; this only feeds "My tickets",
// so a failure here must not fail a booking that already succeeded.
async function indexTicket(env: CatalogEnv, uid: string, eventId: string, booking: Booking) {
  try {
    await recordTicket(env, uid, eventId, booking);
  } catch (err) {
    console.error('my-tickets index write failed', err);
  }
}

// ---- seats: every call goes to the one Durable Object that owns the event ----

const notFound = { error: 'Event not found' };
// Ticketmaster events get a generated seat map. Bump HOUSE when its shape
// changes, so rooms built from the old shape are left behind.
const HOUSE = 2;
const room = (env: Env, eventId: string) =>
  env.EVENT_ROOM.get(
    env.EVENT_ROOM.idFromName(eventId.startsWith('tm-') ? `${eventId}#house${HOUSE}` : eventId),
  );
const nickname = z.string().trim().min(1).max(NICKNAME_MAX);
const holdBody = z.object({ seatId: z.string().min(1).max(64), nickname });
const bookingBody = z.object({ bookingId: z.uuid(), nickname });

async function body<T>(req: Request, schema: z.ZodType<T>): Promise<T | null> {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  return parsed.success ? parsed.data : null;
}

app.get('/api/events/:id/live', async (c) => {
  if (c.req.header('upgrade')?.toLowerCase() !== 'websocket')
    return c.json({ error: 'Expected a WebSocket upgrade' }, 426);
  const headers = new Headers(c.req.raw.headers);
  headers.set('x-uid', c.get('uid'));
  headers.set('x-event-id', c.req.param('id'));
  return room(c.env, c.req.param('id')).fetch(new Request(c.req.raw, { headers }));
});

app.post('/api/events/:id/holds', async (c) => {
  const data = await body(c.req.raw, holdBody);
  if (!data) return c.json({ error: 'Send a seatId and a nickname of 1 to 20 characters' }, 400);
  const eventId = c.req.param('id');
  const result = await room(c.env, eventId).hold(
    eventId,
    { id: c.get('uid'), nickname: data.nickname },
    data.seatId,
  );
  if (!result) return c.json(notFound, 404);
  if (result.ok) return c.json({ expiresAt: result.expiresAt });
  if (result.reason === 'taken') return c.json({ error: 'Someone got that seat first' }, 409);
  if (result.reason === 'limit') return c.json({ error: 'You can hold up to 4 seats' }, 422);
  return c.json({ error: 'Seat not found' }, 404);
});

app.delete('/api/events/:id/holds/:seatId', async (c) => {
  const eventId = c.req.param('id');
  const released = await room(c.env, eventId).release(eventId, c.get('uid'), c.req.param('seatId'));
  return released ? c.body(null, 204) : c.json({ error: 'You are not holding that seat' }, 404);
});

app.post('/api/events/:id/bookings', async (c) => {
  const data = await body(c.req.raw, bookingBody);
  if (!data) return c.json({ error: 'Send a bookingId and a nickname' }, 400);
  const eventId = c.req.param('id');
  const result = await room(c.env, eventId).confirm(
    eventId,
    { id: c.get('uid'), nickname: data.nickname },
    data.bookingId,
  );
  if (!result) return c.json(notFound, 404);
  if (!result.ok) return c.json({ error: 'Your hold ran out before payment. Pick seats again.' }, 410);
  await indexTicket(c.env, c.get('uid'), eventId, result.booking);
  return c.json(result.booking);
});

app.get('/api/events/:id/bookings/:bookingId', async (c) => {
  const eventId = c.req.param('id');
  const booking = await room(c.env, eventId).getBooking(eventId, c.get('uid'), c.req.param('bookingId'));
  if (!booking) return c.json({ error: 'Booking not found' }, 404);
  await indexTicket(c.env, c.get('uid'), eventId, booking); // repairs a row a failed write left out
  return c.json(booking);
});

app.get('/api/me/bookings', async (c) => c.json(await listTickets(c.env.DB, c.get('uid'))));

// ---- demo reset ----

async function sameSecret(given: string | undefined, expected: string | undefined): Promise<boolean> {
  if (!given || !expected) return false;
  const digest = (s: string) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return crypto.subtle.timingSafeEqual(await digest(given), await digest(expected));
}

app.post('/api/admin/reset', async (c) => {
  if (!(await sameSecret(c.req.header('x-reset-secret'), c.env.RESET_SECRET)))
    return c.json({ error: 'Wrong or missing reset secret' }, 401);
  const ids = new Set([...(await listEventIds(c.env.DB)), ...(await clearTickets(c.env.DB))]);
  await Promise.all([...ids].map((id) => room(c.env, id).reset()));
  return c.body(null, 204);
});

app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404));

export default app;
