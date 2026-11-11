import { SELF } from 'cloudflare:test';
import { expect, test } from 'vitest';

test('GET /api/health returns ok', async () => {
  const res = await SELF.fetch('https://x/api/health');
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
});

const get = (path: string, init?: RequestInit) => SELF.fetch(`https://x${path}`, init);

test('search route returns events and rejects a bad type or date', async () => {
  const ok = await get('/api/events/search?q=herons');
  expect(((await ok.json()) as { id: string }[]).map((e) => e.id)).toEqual(['herons-rooks']);
  expect((await get('/api/events/search?type=opera')).status).toBe(400);
  expect((await get('/api/events/search?from=tomorrow')).status).toBe(400);
});

test('event route returns detail, 404 for an unknown id', async () => {
  const res = await get('/api/events/hot');
  expect(((await res.json()) as { seatMap: unknown }).seatMap).toBeTruthy();
  expect((await get('/api/events/nope')).status).toBe(404);
});
