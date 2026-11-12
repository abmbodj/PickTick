import { env, SELF } from 'cloudflare:test';
import { afterEach, expect, test, vi } from 'vitest';
import type { EventSummary, Ticket } from '../shared/types';
import { getEvent, searchEvents } from '../src/worker/catalog';

const withKey = { ...env, TICKETMASTER_API_KEY: 'k-123' };
const noKey = { ...env, TICKETMASTER_API_KEY: undefined };

const tmEvent = (over: Record<string, unknown> = {}) => ({
  id: 'Z7r9jZ1Ad0',
  name: 'Nova Lights: World Tour',
  url: 'https://www.ticketmaster.com/event/Z7r9jZ1Ad0',
  info: 'Doors open one hour before the show.',
  images: [
    { ratio: '3_2', url: 'https://s1.ticketm.net/a_3_2.jpg', width: 305, height: 203 },
    { ratio: '16_9', url: 'https://s1.ticketm.net/a_16_9_small.jpg', width: 100, height: 56 },
    { ratio: '16_9', url: 'https://s1.ticketm.net/a_16_9.jpg', width: 1024, height: 576 },
  ],
  dates: { start: { localDate: '2027-01-15', localTime: '19:30:00', dateTime: '2027-01-16T01:30:00Z' } },
  classifications: [{ segment: { name: 'Music' }, genre: { name: 'Pop' } }],
  priceRanges: [{ type: 'standard', currency: 'USD', min: 49.5, max: 199 }],
  _embedded: {
    venues: [{ name: 'United Center', city: { name: 'Chicago' }, state: { stateCode: 'IL' } }],
    attractions: [{ name: 'Nova Lights' }],
  },
  ...over,
});

// Replaces outbound fetch; returns the list of URLs requested.
function stubApi(handler: (url: URL) => Response): string[] {
  const calls: string[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    calls.push(url.toString());
    return handler(url);
  });
  return calls;
}
const page = (events: unknown[]) => Response.json({ _embedded: { events }, page: { totalElements: events.length } });

afterEach(() => vi.restoreAllMocks());

test('with no API key, search returns only own events and never calls out', async () => {
  const calls = stubApi(() => page([tmEvent()]));
  const hits = await searchEvents(noKey, { q: 'no-key-case' });
  expect(hits).toEqual([]);
  const all = await searchEvents(noKey, {});
  expect(all).toHaveLength(9);
  expect(all.every((e) => e.source === 'picktick' && e.imageUrl === null)).toBe(true);
  expect(calls).toEqual([]);
});

test('with a key, search merges both sources by date and maps fields', async () => {
  const calls = stubApi(() =>
    page([
      tmEvent(),
      tmEvent({ id: 'undated', dates: { start: { dateTBA: true } } }),
      tmEvent({ id: 'late', name: 'Later Show', dates: { start: { localDate: '2027-12-31' } } }),
    ]),
  );
  const hits = await searchEvents(withKey, { from: '2027-01-01', to: '2027-12-31' });
  expect(hits).toHaveLength(11); // 9 own + 2 dated
  expect(hits.map((e) => e.startsAt)).toEqual(hits.map((e) => e.startsAt).sort());
  expect(hits[0]).toEqual<EventSummary>({
    id: 'tm-Z7r9jZ1Ad0',
    name: 'Nova Lights: World Tour',
    type: 'concert',
    startsAt: '2027-01-15T19:30:00Z',
    venueName: 'United Center',
    city: 'Chicago',
    performerName: 'Nova Lights',
    source: 'ticketmaster',
    imageUrl: 'https://s1.ticketm.net/a_16_9.jpg',
  });
  expect(hits.at(-1)).toMatchObject({ id: 'tm-late', startsAt: '2027-12-31T00:00:00Z' });
  expect(calls).toHaveLength(1);
});

test('search sends the key, keyword, mapped type and date range', async () => {
  const calls = stubApi(() => page([]));
  await searchEvents(withKey, { q: 'param check', type: 'theater', from: '2027-03-01', to: '2027-03-31' });
  const url = new URL(calls[0]);
  expect(url.origin + url.pathname).toBe('https://app.ticketmaster.com/discovery/v2/events.json');
  expect(Object.fromEntries(url.searchParams)).toMatchObject({
    apikey: 'k-123',
    keyword: 'param check',
    segmentName: 'Arts & Theatre',
    startDateTime: '2027-03-01T00:00:00Z',
    endDateTime: '2027-03-31T23:59:59Z',
    countryCode: 'US',
    size: '20',
    sort: 'date,asc',
  });
  calls.length = 0;
  await searchEvents(withKey, { q: 'comedy check', type: 'comedy' });
  expect(new URL(calls[0]).searchParams.get('classificationName')).toBe('Comedy');
});

test('a repeated search is served from cache', async () => {
  const calls = stubApi(() => page([tmEvent()]));
  await searchEvents(withKey, { q: 'cache check' });
  await searchEvents(withKey, { q: 'cache check' });
  expect(calls).toHaveLength(1);
});

test('a failing, rate-limited or malformed API gives own events only', async () => {
  stubApi(() => new Response('{"fault":{}}', { status: 429 }));
  expect(await searchEvents(withKey, { q: 'herons rate limited' })).toEqual([]);
  expect((await searchEvents(withKey, { type: 'sports', from: '2027-01-02' })).map((e) => e.id)).toEqual([
    'herons-rooks',
    'derby-finals',
  ]);
  vi.restoreAllMocks();
  stubApi(() => new Response('<html>oops', { status: 200 }));
  expect(await searchEvents(withKey, { type: 'comedy', from: '2027-01-03' })).toHaveLength(2);
  vi.restoreAllMocks();
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
  expect(await searchEvents(withKey, { type: 'theater', from: '2027-01-04' })).toHaveLength(2);
});

test('tm- event detail maps fields and gets a 192-seat map priced from the range', async () => {
  const calls = stubApi(() => Response.json(tmEvent({ id: 'detail1' })));
  const e = (await getEvent(withKey, 'tm-detail1'))!;
  expect(calls[0]).toContain('/discovery/v2/events/detail1.json?apikey=k-123');
  expect(e).toMatchObject({
    id: 'tm-detail1',
    name: 'Nova Lights: World Tour',
    startsAt: '2027-01-15T19:30:00Z',
    venueName: 'United Center',
    city: 'Chicago',
    performerName: 'Nova Lights',
    description: 'Doors open one hour before the show.',
    externalUrl: 'https://www.ticketmaster.com/event/Z7r9jZ1Ad0',
    imageUrl: 'https://s1.ticketm.net/a_16_9.jpg',
    source: 'ticketmaster',
  });
  const seats = e.seatMap.sections.flatMap((s) => s.rows.flatMap((r) => r.seats));
  expect(seats).toHaveLength(192);
  expect(e.seatMap.sections.map((s) => s.priceCents)).toEqual([19900, 12425, 4950]);
});

test('tm- detail: defaults without a price range, null for 404 or no key, unsafe links dropped', async () => {
  stubApi((url) =>
    url.pathname.includes('missing')
      ? new Response('{}', { status: 404 })
      : Response.json(tmEvent({ id: 'noprice', priceRanges: undefined, url: 'javascript:alert(1)', images: [] })),
  );
  const e = (await getEvent(withKey, 'tm-noprice'))!;
  expect(e.seatMap.sections.map((s) => s.priceCents)).toEqual([12000, 7500, 4500]);
  expect(e.externalUrl).toBeNull();
  expect(e.imageUrl).toBeNull();
  expect(await getEvent(withKey, 'tm-missing')).toBeNull();
  expect(await getEvent(noKey, 'tm-noprice2')).toBeNull();
  expect(await getEvent(withKey, 'tm-bad/../id')).toBeNull();
});

test('tm- detail: an API outage throws rather than pretending the event is gone', async () => {
  stubApi(() => new Response('{}', { status: 503 }));
  await expect(getEvent(withKey, 'tm-outage')).rejects.toThrow();
});

// ---- My tickets (own events; the index is the same for every source) ----

const get = (path: string, init?: RequestInit) => SELF.fetch(`https://x${path}`, init);
const json = (cookie: string, body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', cookie },
  body: JSON.stringify(body),
});
const newUser = async () => (await get('/api/health')).headers.get('set-cookie')!.split(';')[0];
const mine = async (cookie: string) =>
  (await (await get('/api/me/bookings', { headers: { cookie } })).json()) as Ticket[];
async function book(cookie: string, eventId: string, seatId: string) {
  await get(`/api/events/${eventId}/holds`, json(cookie, { seatId, nickname: 'ana' }));
  const bookingId = crypto.randomUUID();
  const res = await get(`/api/events/${eventId}/bookings`, json(cookie, { bookingId, nickname: 'ana' }));
  expect(res.status).toBe(200);
  return bookingId;
}
const resetAll = () => get('/api/admin/reset', { method: 'POST', headers: { 'x-reset-secret': 'test-secret' } });

test('my tickets lists bookings for this browser only, soonest event first', async () => {
  await resetAll();
  const [a, b] = [await newUser(), await newUser()];
  expect(await mine(a)).toEqual([]);
  const later = await book(a, 'derby-finals', 'Trackside-1-1');
  const sooner = await book(a, 'hot', 'Front-1-1');
  const tickets = await mine(a);
  expect(tickets.map((t) => t.bookingId)).toEqual([sooner, later]);
  expect(tickets[0]).toMatchObject({
    eventId: 'hot',
    eventName: 'Marrow & Vine: The Last Forty',
    startsAt: '2027-02-12T20:00:00Z',
    venueName: 'The Coat Check',
    city: 'Portland',
    imageUrl: null,
    seatIds: ['Front-1-1'],
    totalCents: 6000,
  });
  expect(await mine(b)).toEqual([]);
});

test('reading a booking restores a missing my-tickets row; paying twice makes one row', async () => {
  await resetAll();
  const a = await newUser();
  const bookingId = await book(a, 'hot', 'Front-1-2');
  await get('/api/events/hot/bookings', json(a, { bookingId, nickname: 'ana' }));
  expect(await mine(a)).toHaveLength(1);
  await env.DB.prepare('DELETE FROM user_booking').run();
  expect(await mine(a)).toEqual([]);
  expect((await get(`/api/events/hot/bookings/${bookingId}`, { headers: { cookie: a } })).status).toBe(200);
  expect((await mine(a)).map((t) => t.bookingId)).toEqual([bookingId]);
});

test('reset empties my tickets', async () => {
  const a = await newUser();
  await book(a, 'hot', 'Front-1-3');
  await resetAll();
  expect(await mine(a)).toEqual([]);
});

test('a Ticketmaster event can be held and reserved end to end', async () => {
  await resetAll();
  stubApi(() => Response.json(tmEvent({ id: 'e2e' })));
  const a = await newUser();
  const detail = await get('/api/events/tm-e2e');
  expect(detail.status).toBe(200);
  const bookingId = await book(a, 'tm-e2e', 'Floor-1-1');
  expect(await mine(a)).toMatchObject([
    {
      bookingId,
      eventId: 'tm-e2e',
      eventName: 'Nova Lights: World Tour',
      venueName: 'United Center',
      imageUrl: 'https://s1.ticketm.net/a_16_9.jpg',
      seatIds: ['Floor-1-1'],
      totalCents: 19900,
    },
  ]);
  // Reset reaches rooms of Ticketmaster events that have bookings.
  await resetAll();
  const b = await newUser();
  expect((await get('/api/events/tm-e2e/holds', json(b, { seatId: 'Floor-1-1', nickname: 'ben' }))).status).toBe(200);
});

test('an event page that cannot be loaded from the API is a 502, not a 404', async () => {
  stubApi(() => new Response('{}', { status: 503 }));
  expect((await get('/api/events/tm-down')).status).toBe(502);
});
