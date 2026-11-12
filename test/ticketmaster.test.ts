import { env, SELF } from 'cloudflare:test';
import { afterEach, expect, test, vi } from 'vitest';
import type { EventSummary, Ticket } from '../shared/types';
import { getEvent, getPerformer, groupEvents, searchEvents } from '../src/worker/catalog';

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
  seatmap: { staticUrl: 'https://maps.ticketmaster.com/maps/geometry/3/event/x/staticImage' },
  _embedded: {
    venues: [{ name: 'United Center', city: { name: 'Chicago' }, state: { stateCode: 'IL' } }],
    attractions: [{ id: 'K8vZ9171ob7', name: 'Nova Lights' }],
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
  const hits = (await searchEvents(noKey, { q: 'no-key-case' })).events;
  expect(hits).toEqual([]);
  const all = (await searchEvents(noKey, {})).events;
  expect(all).toHaveLength(9);
  expect(all.every((e) => e.source === 'picktick' && e.imageUrl === null)).toBe(true);
  expect(calls).toEqual([]);
});

test('with a key, search lists own events then API events, and maps fields', async () => {
  const calls = stubApi(() =>
    page([
      tmEvent(),
      tmEvent({ id: 'undated', dates: { start: { dateTBA: true } } }),
      tmEvent({ id: 'late', name: 'Later Show', dates: { start: { localDate: '2027-12-31' } } }),
    ]),
  );
  const hits = (await searchEvents(withKey, { from: '2027-01-01', to: '2027-12-31' })).events;
  expect(hits).toHaveLength(11); // 9 own + 2 dated
  expect(hits.slice(0, 9).every((e) => e.source === 'picktick')).toBe(true);
  expect(hits[9]).toEqual<EventSummary>({
    id: 'tm-Z7r9jZ1Ad0',
    name: 'Nova Lights: World Tour',
    type: 'concert',
    startsAt: '2027-01-15T19:30:00Z',
    venueName: 'United Center',
    city: 'Chicago',
    performerName: 'Nova Lights',
    performerId: 'tm-K8vZ9171ob7',
    source: 'ticketmaster',
    imageUrl: 'https://s1.ticketm.net/a_16_9.jpg',
    geo: null, // the fixture's venue has no coordinates
  });
  expect(hits.at(-1)).toMatchObject({ id: 'tm-late', startsAt: '2027-12-31T00:00:00Z' });
  expect(calls).toHaveLength(1);
});

test('search sends the key, keyword, mapped type and date range', async () => {
  const calls = stubApi(() => page([]));
  (await searchEvents(withKey, { q: 'param check', type: 'theater', from: '2027-03-01', to: '2027-03-31' })).events;
  const url = new URL(calls[0]);
  expect(url.origin + url.pathname).toBe('https://app.ticketmaster.com/discovery/v2/events.json');
  expect(Object.fromEntries(url.searchParams)).toMatchObject({
    apikey: 'k-123',
    keyword: 'param check',
    segmentName: 'Arts & Theatre',
    localStartDateTime: '2027-03-01T00:00:00,2027-03-31T23:59:59',
    countryCode: 'US',
    size: '100',
    sort: 'relevance,desc',
  });
  calls.length = 0;
  (await searchEvents(withKey, { q: 'comedy check', type: 'comedy' })).events;
  expect(new URL(calls[0]).searchParams.get('classificationName')).toBe('Comedy');
});

test('a repeated search is served from cache', async () => {
  const calls = stubApi(() => page([tmEvent()]));
  (await searchEvents(withKey, { q: 'cache check' })).events;
  (await searchEvents(withKey, { q: 'cache check' })).events;
  expect(calls).toHaveLength(1);
});

test('a failing, rate-limited or malformed API gives own events only', async () => {
  stubApi(() => new Response('{"fault":{}}', { status: 429 }));
  expect((await searchEvents(withKey, { q: 'herons rate limited' })).events).toEqual([]);
  expect(((await searchEvents(withKey, { type: 'sports', from: '2027-01-02' })).events).map((e) => e.id)).toEqual([
    'herons-rooks',
    'derby-finals',
  ]);
  vi.restoreAllMocks();
  stubApi(() => new Response('<html>oops', { status: 200 }));
  expect((await searchEvents(withKey, { type: 'comedy', from: '2027-01-03' })).events).toHaveLength(2);
  vi.restoreAllMocks();
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
  expect((await searchEvents(withKey, { type: 'theater', from: '2027-01-04' })).events).toHaveLength(2);
});

test('tm- event detail maps fields and gets a concert house priced from the range', async () => {
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
  expect(seats).toHaveLength(164);
  expect(e.seatMap.sections.map((s) => s.name)).toEqual(['Pit', 'Floor', 'Balcony']);
  expect(e.seatmapUrl).toBe('https://maps.ticketmaster.com/maps/geometry/3/event/x/staticImage');
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
  const bookingId = await book(a, 'tm-e2e', 'Pit-1-1');
  expect(await mine(a)).toMatchObject([
    {
      bookingId,
      eventId: 'tm-e2e',
      eventName: 'Nova Lights: World Tour',
      venueName: 'United Center',
      imageUrl: 'https://s1.ticketm.net/a_16_9.jpg',
      seatIds: ['Pit-1-1'],
      totalCents: 19900,
    },
  ]);
  // Reset reaches rooms of Ticketmaster events that have bookings.
  await resetAll();
  const b = await newUser();
  expect((await get('/api/events/tm-e2e/holds', json(b, { seatId: 'Pit-1-1', nickname: 'ben' }))).status).toBe(200);
});

test('an event page that cannot be loaded from the API is a 502, not a 404', async () => {
  stubApi(() => new Response('{}', { status: 503 }));
  expect((await get('/api/events/tm-down')).status).toBe(502);
});

test('results the API returns from outside the asked dates or type are dropped', async () => {
  stubApi(() =>
    page([
      tmEvent({ id: 'early', dates: { start: { localDate: '2026-09-03' } } }), // a season pass that started earlier
      tmEvent({ id: 'inside', dates: { start: { localDate: '2027-06-02', localTime: '20:00:00' } } }),
      tmEvent({ id: 'after', dates: { start: { localDate: '2027-06-09' } } }),
      tmEvent({ id: 'play', dates: { start: { localDate: '2027-06-03' } }, classifications: [{ segment: { name: 'Arts & Theatre' }, genre: { name: 'Theatre' } }] }),
    ]),
  );
  const hits = (await searchEvents(withKey, { type: 'concert', from: '2027-06-01', to: '2027-06-07' })).events;
  expect(hits.map((e) => e.id)).toEqual(['tm-inside']);
});

test('with no dates asked, events that started before today are dropped', async () => {
  stubApi(() => page([tmEvent({ id: 'old', dates: { start: { localDate: '2020-01-01' } } }), tmEvent({ id: 'future-ok' })]));
  const hits = (await searchEvents(withKey, { q: 'past filter check' })).events;
  expect(hits.map((e) => e.id)).toEqual(['tm-future-ok']);
});

// ---- pagination ----

const paged = (events: unknown[], totalPages: number) =>
  Response.json({ _embedded: { events }, page: { size: 20, totalElements: totalPages * 20, totalPages, number: 0 } });

test('page 0 leads with own events, then the API page; later pages are API only', async () => {
  const calls = stubApi((url) => paged([tmEvent({ id: `p${url.searchParams.get('page')}` })], 7));
  const first = await searchEvents(withKey, { from: '2027-01-01', to: '2027-12-30' });
  expect(first.page).toBe(0);
  expect(first.totalPages).toBe(7);
  expect(first.events).toHaveLength(10);
  expect(first.events.slice(0, 9).every((e) => e.source === 'picktick')).toBe(true);
  expect(first.events[9].id).toBe('tm-p0');
  const third = await searchEvents(withKey, { from: '2027-01-01', to: '2027-12-30', page: 2 });
  expect(third.page).toBe(2);
  expect(third.events.map((e) => e.id)).toEqual(['tm-p2']);
  expect(calls.map((c) => new URL(c).searchParams.get('page'))).toEqual(['0', '2']);
});

test('total pages are capped at the API deep-paging limit, and are 1 without a key', async () => {
  stubApi(() => paged([tmEvent()], 4000));
  expect((await searchEvents(withKey, { q: 'cap check' })).totalPages).toBe(10);
  const own = await searchEvents(noKey, {});
  expect(own).toMatchObject({ page: 0, totalPages: 1 });
  expect((await searchEvents(noKey, { page: 3 })).events).toEqual([]);
});

test('the generated house follows the kind of event', async () => {
  const kinds: Record<string, unknown> = {
    game: [{ segment: { name: 'Sports' }, genre: { name: 'Basketball' } }],
    play: [{ segment: { name: 'Arts & Theatre' }, genre: { name: 'Theatre' } }],
    standup: [{ segment: { name: 'Arts & Theatre' }, genre: { name: 'Comedy' } }],
  };
  stubApi((url) => {
    const id = url.pathname.split('/').pop()!.replace('.json', '');
    return Response.json(tmEvent({ id, classifications: kinds[id], seatmap: undefined }));
  });
  const names = async (id: string) => (await getEvent(withKey, `tm-${id}`))!.seatMap.sections.map((s) => s.name);
  expect(await names('game')).toEqual(['Courtside', 'Lower', 'Upper']);
  expect(await names('play')).toEqual(['Orchestra', 'Mezzanine', 'Balcony']);
  expect(await names('standup')).toEqual(['Front', 'Main']);
  expect((await getEvent(withKey, 'tm-game'))!.seatmapUrl).toBeNull();
  expect((await getEvent(noKey, 'hot'))!.seatmapUrl).toBeNull();
});

test('an open-ended search asks from the current US day, so tonight\'s shows are kept', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-12T00:30:00Z')); // still the evening of Nov 11 across the US
  try {
    const calls = stubApi(() => page([tmEvent({ id: 'tonight', dates: { start: { localDate: '2026-11-11', localTime: '20:00:00' } } })]));
    const hits = (await searchEvents(withKey, { q: 'tonight check' })).events;
    expect(new URL(calls[0]).searchParams.get('localStartDateTime')).toBe('2026-11-11T00:00:00,*');
    expect(hits.map((e) => e.id)).toEqual(['tm-tonight']);
  } finally {
    vi.useRealTimers();
  }
});

test('an event is comedy when its genre or sub-genre says so', async () => {
  stubApi(() =>
    page([
      tmEvent({ id: 'sub', classifications: [{ segment: { name: 'Arts & Theatre' }, genre: { name: 'Theatre' }, subGenre: { name: 'Comedy' } }] }),
      tmEvent({ id: 'gen', classifications: [{ segment: { name: 'Arts & Theatre' }, genre: { name: 'Comedy' } }] }),
      tmEvent({ id: 'not', classifications: [{ segment: { name: 'Arts & Theatre' }, genre: { name: 'Performance Art' } }] }),
    ]),
  );
  const hits = (await searchEvents(withKey, { type: 'comedy', q: 'comedy tag check' })).events;
  expect(hits.map((e) => e.id)).toEqual(['tm-sub', 'tm-gen']);
});

// ---- one card per performer ----

const summary = (over: Partial<EventSummary>): EventSummary => ({
  id: 'e1', name: 'Tour Stop', type: 'concert', startsAt: '2027-01-10T20:00:00Z', venueName: 'Hall', city: 'Atlanta',
  performerName: 'bleood', performerId: 'tm-A1', source: 'ticketmaster', imageUrl: 'https://s1.ticketm.net/x.jpg', ...over,
});

test('events by one performer collapse into one group, in first-seen order', () => {
  const groups = groupEvents([
    summary({ id: 'e2', startsAt: '2027-01-12T20:00:00Z', city: 'Millvale' }),
    summary({ id: 'solo', name: 'One Night Only', performerName: 'Solo Act', performerId: 'tm-B2', city: 'Reno' }),
    summary({ id: 'e1', startsAt: '2027-01-10T20:00:00Z', city: 'Atlanta' }),
    summary({ id: 'e3', startsAt: '2027-01-14T20:00:00Z', city: 'Atlanta' }),
    summary({ id: 'loose', name: 'Food Fair', performerId: null, performerName: 'Food Fair', city: 'Austin' }),
  ]);
  expect(groups.map((g) => g.key)).toEqual(['tm-A1', 'tm-B2', 'loose']);
  expect(groups[0]).toMatchObject({
    name: 'bleood',
    performerId: 'tm-A1',
    eventCount: 3,
    nextStartsAt: '2027-01-10T20:00:00Z',
    firstEventId: 'e1',
    cities: ['Atlanta', 'Millvale'],
  });
  // A performer with a single event is shown as that event.
  expect(groups[1]).toMatchObject({ name: 'One Night Only', eventCount: 1, firstEventId: 'solo', venueName: 'Hall' });
  expect(groups[2]).toMatchObject({ name: 'Food Fair', performerId: null, eventCount: 1 });
});

test('the search route answers with groups', async () => {
  stubApi(() => page([tmEvent({ id: 'g1' }), tmEvent({ id: 'g2', dates: { start: { localDate: '2027-02-01' } } })]));
  const res = await get('/api/events/search?q=group%20route%20check');
  const body = (await res.json()) as { groups: { name: string; eventCount: number }[]; page: number; totalPages: number };
  expect(body.groups).toEqual([expect.objectContaining({ name: 'Nova Lights', eventCount: 2 })]);
  expect(body).toMatchObject({ page: 0, totalPages: 1 });
});

test('a Ticketmaster performer page lists every date, soonest first', async () => {
  const calls = stubApi(() =>
    page([
      tmEvent({ id: 'd2', dates: { start: { localDate: '2027-03-02', localTime: '20:00:00' } } }),
      tmEvent({ id: 'd1', dates: { start: { localDate: '2027-03-01', localTime: '20:00:00' } }, _embedded: {
        venues: [{ name: 'Fox Theatre', city: { name: 'Detroit' } }],
        attractions: [{ id: 'OPENER', name: 'Opening Act' }, { id: 'K8vZ9171ob7', name: 'Nova Lights' }],
      } }),
    ]),
  );
  const p = (await getPerformer(withKey, 'tm-K8vZ9171ob7'))!;
  const url = new URL(calls[0]);
  expect(url.searchParams.get('attractionId')).toBe('K8vZ9171ob7');
  expect(url.searchParams.get('sort')).toBe('date,asc');
  expect(p).toMatchObject({ id: 'tm-K8vZ9171ob7', name: 'Nova Lights', source: 'ticketmaster', imageUrl: 'https://s1.ticketm.net/a_16_9.jpg' });
  expect(p.events.map((e) => e.id)).toEqual(['tm-d1', 'tm-d2']);
});

test('performer page: own performers come from the catalog; unknown or empty is null', async () => {
  const own = (await getPerformer(noKey, 'marigold-co'))!;
  expect(own).toMatchObject({ name: 'Marigold Repertory Company', source: 'picktick' });
  expect(own.blurb).toContain('resident company');
  expect(own.events.map((e) => e.id)).toEqual(['clockmakers-daughter', 'history-of-rain']);
  expect(await getPerformer(noKey, 'nobody')).toBeNull();
  stubApi(() => page([]));
  expect(await getPerformer(withKey, 'tm-NOEVENTS')).toBeNull();
  expect(await getPerformer(withKey, 'tm-bad/../id')).toBeNull();
  expect((await get('/api/performers/nobody')).status).toBe(404);
  expect((await get('/api/performers/marigold-co')).status).toBe(200);
});

test('two listings of the same performer under different ids are one group and one page', async () => {
  const groups = groupEvents([
    summary({ id: 'a1', performerId: 'tm-A1', city: 'Atlanta' }),
    summary({ id: 'z1', performerId: 'tm-Z9', performerName: 'BLEOOD', city: 'Dallas', startsAt: '2027-01-11T20:00:00Z' }),
  ]);
  expect(groups).toHaveLength(1);
  expect(groups[0]).toMatchObject({ key: 'tm-A1', performerId: 'tm-A1', eventCount: 2, cities: ['Atlanta', 'Dallas'] });

  const twin = (id: string, date: string, attraction: { id: string; name: string }, city = 'Chicago') =>
    tmEvent({ id, dates: { start: { localDate: date } }, _embedded: {
      venues: [{ name: 'Hall', city: { name: city } }],
      attractions: [attraction],
    } });
  stubApi((url) =>
    url.searchParams.get('attractionId')
      ? page([twin('dup1', '2027-04-01', { id: 'DUPCHECK', name: 'Twin Act' })])
      : page([
          twin('dup1', '2027-04-01', { id: 'DUPCHECK', name: 'Twin Act' }),
          twin('dup2', '2027-04-02', { id: 'OTHERID', name: 'twin act' }, 'Dallas'),
          twin('unrelated', '2027-04-03', { id: 'X', name: 'Twin Act Tribute' }, 'Reno'),
        ]),
  );
  const p = (await getPerformer(withKey, 'tm-DUPCHECK'))!;
  expect(p.events.map((e) => e.id)).toEqual(['tm-dup1', 'tm-dup2']);
});

test("a group prefers the act's own picture over Ticketmaster's generic category art", () => {
  const [g] = groupEvents([
    summary({ id: 'p1', imageUrl: 'https://s1.ticketm.net/dam/c/df8/generic_16_9.jpg' }),
    summary({ id: 'p2', startsAt: '2027-01-11T20:00:00Z', imageUrl: 'https://s1.ticketm.net/dam/a/24d/artist_16_9.jpg' }),
  ]);
  expect(g.imageUrl).toBe('https://s1.ticketm.net/dam/a/24d/artist_16_9.jpg');
});

test("a group points at the date nearest the visitor, or the soonest when it can't tell", () => {
  const dates = [
    summary({ id: 'la', startsAt: '2027-01-10T20:00:00Z', geo: [34.05, -118.24] }),
    summary({ id: 'tba', startsAt: '2027-01-11T20:00:00Z', geo: null }),
    summary({ id: 'nyc', startsAt: '2027-01-12T20:00:00Z', geo: [40.71, -74.0] }),
  ];
  expect(groupEvents(dates, [39.95, -75.17])[0].nearEventId).toBe('nyc'); // from Philadelphia
  expect(groupEvents(dates)[0].nearEventId).toBe('la');
});
