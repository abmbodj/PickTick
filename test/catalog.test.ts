import { env } from 'cloudflare:test';
import { expect, test } from 'vitest';
import { getEvent, searchEvents } from '../src/worker/catalog';

test('search with no params returns every seeded event, soonest first', async () => {
  const all = await searchEvents(env.DB, {});
  expect(all).toHaveLength(9);
  const times = all.map((e) => e.startsAt);
  expect(times).toEqual([...times].sort());
});

test("search by a performer's name returns that performer's event", async () => {
  const hits = await searchEvents(env.DB, { q: 'glasswing' });
  expect(hits.map((e) => e.id)).toEqual(['glasswing-night-signals']);
});

test('search matches a prefix of the last word', async () => {
  const hits = await searchEvents(env.DB, { q: 'roller der' });
  expect(hits.map((e) => e.id)).toEqual(['derby-finals']);
});

test('search type=comedy returns only comedy events', async () => {
  const hits = await searchEvents(env.DB, { type: 'comedy' });
  expect(hits).toHaveLength(2);
  expect(hits.every((e) => e.type === 'comedy')).toBe(true);
});

test('search from/to bounds starts_at inclusively', async () => {
  const hits = await searchEvents(env.DB, { from: '2027-02-12', to: '2027-02-20' });
  expect(hits.map((e) => e.id)).toEqual(['hot', 'dana-okafor-reply-all']);
});

test('search text full of FTS5 syntax does not throw', async () => {
  await expect(searchEvents(env.DB, { q: '"rock* -(a:b' })).resolves.toBeInstanceOf(Array);
  await expect(searchEvents(env.DB, { q: '"*-(:)' })).resolves.toHaveLength(9);
});

test('getEvent returns the seat map; unknown id is null', async () => {
  const hot = await getEvent(env.DB, 'hot');
  const seats = hot!.seatMap.sections.flatMap((s) => s.rows.flatMap((r) => r.seats));
  expect(seats.length).toBeGreaterThanOrEqual(35);
  expect(seats.length).toBeLessThanOrEqual(45);
  expect(hot!.venueName).toBe('The Coat Check');
  expect(await getEvent(env.DB, 'nope')).toBeNull();
});
