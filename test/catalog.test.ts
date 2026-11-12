import { env } from 'cloudflare:test';
import { expect, test } from 'vitest';
import { getEvent, searchEvents } from '../src/worker/catalog';

const noKey = { ...env, TICKETMASTER_API_KEY: undefined };

test('search with no params returns every seeded event, soonest first', async () => {
  const all = (await searchEvents(noKey, {})).events;
  expect(all).toHaveLength(9);
  const times = all.map((e) => e.startsAt);
  expect(times).toEqual([...times].sort());
});

test("search by a performer's name returns that performer's event", async () => {
  const hits = (await searchEvents(noKey, { q: 'glasswing' })).events;
  expect(hits.map((e) => e.id)).toEqual(['glasswing-night-signals']);
});

test('search matches a prefix of the last word', async () => {
  const hits = (await searchEvents(noKey, { q: 'roller der' })).events;
  expect(hits.map((e) => e.id)).toEqual(['derby-finals']);
});

test('search type=comedy returns only comedy events', async () => {
  const hits = (await searchEvents(noKey, { type: 'comedy' })).events;
  expect(hits).toHaveLength(2);
  expect(hits.every((e) => e.type === 'comedy')).toBe(true);
});

test('search from/to bounds starts_at inclusively', async () => {
  const hits = (await searchEvents(noKey, { from: '2027-02-12', to: '2027-02-20' })).events;
  expect(hits.map((e) => e.id)).toEqual(['hot', 'dana-okafor-reply-all']);
});

test('search text full of FTS5 syntax does not throw', async () => {
  expect((await searchEvents(noKey, { q: '"rock* -(a:b' })).events).toBeInstanceOf(Array);
  expect((await searchEvents(noKey, { q: '"*-(:)' })).events).toHaveLength(9);
});

test('getEvent returns the seat map; unknown id is null', async () => {
  const hot = await getEvent(noKey, 'hot');
  const seats = hot!.seatMap.sections.flatMap((s) => s.rows.flatMap((r) => r.seats));
  expect(seats.length).toBeGreaterThanOrEqual(35);
  expect(seats.length).toBeLessThanOrEqual(45);
  expect(hot!.venueName).toBe('The Coat Check');
  expect(await getEvent(noKey, 'nope')).toBeNull();
});
