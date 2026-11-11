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

// ---- booking API ----
import { beforeEach } from 'vitest';
import type { Booking, RoomMessage } from '../shared/types';

const SEAT = 'Front-1-1';
const json = (cookie: string, body: unknown, method = 'POST'): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json', cookie },
  body: JSON.stringify(body),
});
async function newUser(): Promise<string> {
  const res = await get('/api/health');
  return res.headers.get('set-cookie')!.split(';')[0];
}
const hold = (cookie: string, seatId: string, nickname = 'ana', event = 'hot') =>
  get(`/api/events/${event}/holds`, json(cookie, { seatId, nickname }));
const reset = (secret?: string) =>
  get('/api/admin/reset', { method: 'POST', headers: secret ? { 'x-reset-secret': secret } : {} });

beforeEach(async () => {
  await reset('test-secret');
});

test('first API call sets an HttpOnly uid cookie; later calls with it set none', async () => {
  const first = await get('/api/health');
  const header = first.headers.get('set-cookie')!;
  expect(header).toMatch(/^uid=[0-9a-f-]{36};/);
  expect(header).toMatch(/HttpOnly/i);
  expect(header).toMatch(/SameSite=Lax/i);
  const second = await get('/api/health', { headers: { cookie: header.split(';')[0] } });
  expect(second.headers.get('set-cookie')).toBeNull();
});

test('a second user holding the same seat gets 409', async () => {
  const [a, b] = [await newUser(), await newUser()];
  const won = await hold(a, SEAT);
  expect(won.status).toBe(200);
  expect(((await won.json()) as { expiresAt: number }).expiresAt).toBeGreaterThan(Date.now());
  expect((await hold(b, SEAT, 'ben')).status).toBe(409);
});

test('a fifth hold gets 422', async () => {
  const a = await newUser();
  for (let i = 1; i <= 4; i++) expect((await hold(a, `Front-1-${i}`)).status).toBe(200);
  expect((await hold(a, 'Front-1-5')).status).toBe(422);
});

test('nickname is validated, and HTML is kept as literal text', async () => {
  const a = await newUser();
  expect((await hold(a, SEAT, '   ')).status).toBe(400);
  expect((await hold(a, SEAT, 'x'.repeat(21))).status).toBe(400);
  expect((await get('/api/events/hot/holds', json(a, { seatId: SEAT }))).status).toBe(400);
  expect((await get('/api/events/hot/holds', { method: 'POST', headers: { cookie: a }, body: 'not json' })).status).toBe(400);
  expect((await hold(a, SEAT, '  <b>x</b> ')).status).toBe(200);
  const ws = await live(a);
  const snap = await ws.next();
  expect(snap.type === 'snapshot' && snap.seats.find((s) => s.id === SEAT)?.by).toBe('<b>x</b>');
  ws.close();
});

test('unknown event or seat is 404', async () => {
  const a = await newUser();
  expect((await hold(a, SEAT, 'ana', 'nope')).status).toBe(404);
  expect((await hold(a, 'zzz')).status).toBe(404);
  expect((await get('/api/events/nope/live', { headers: { upgrade: 'websocket', cookie: a } })).status).toBe(404);
});

test('release: only the holder can release', async () => {
  const [a, b] = [await newUser(), await newUser()];
  await hold(a, SEAT);
  const del = (cookie: string) =>
    get(`/api/events/hot/holds/${SEAT}`, { method: 'DELETE', headers: { cookie } });
  expect((await del(b)).status).toBe(404);
  expect((await del(a)).status).toBe(204);
  expect((await hold(b, SEAT, 'ben')).status).toBe(200);
});

test('booking flow: hold, pay, read back; other users cannot read it', async () => {
  const [a, b] = [await newUser(), await newUser()];
  await hold(a, SEAT);
  const bookingId = crypto.randomUUID();
  const pay = () => get('/api/events/hot/bookings', json(a, { bookingId, nickname: 'ana' }));
  const paid = await pay();
  expect(paid.status).toBe(200);
  const booking = (await paid.json()) as Booking;
  expect(booking).toMatchObject({ id: bookingId, totalCents: 6000, seatIds: [SEAT] });
  expect(await (await pay()).json()).toEqual(booking);
  expect((await get(`/api/events/hot/bookings/${bookingId}`, { headers: { cookie: a } })).status).toBe(200);
  expect((await get(`/api/events/hot/bookings/${bookingId}`, { headers: { cookie: b } })).status).toBe(404);
});

test('paying with no live holds is 410; a non-uuid bookingId is 400', async () => {
  const a = await newUser();
  expect((await get('/api/events/hot/bookings', json(a, { bookingId: crypto.randomUUID(), nickname: 'ana' }))).status).toBe(410);
  expect((await get('/api/events/hot/bookings', json(a, { bookingId: 'b1', nickname: 'ana' }))).status).toBe(400);
});

async function live(cookie: string) {
  const res = await get('/api/events/hot/live', { headers: { upgrade: 'websocket', cookie } });
  const ws = res.webSocket!;
  const queue: RoomMessage[] = [];
  let wake: (() => void) | null = null;
  ws.addEventListener('message', (e) => {
    queue.push(JSON.parse(e.data as string));
    wake?.();
  });
  ws.accept();
  return {
    close: () => ws.close(),
    async next(): Promise<RoomMessage> {
      if (!queue.length) await new Promise<void>((r) => (wake = r));
      return queue.shift()!;
    },
  };
}

test("live: snapshot first, then another user's hold arrives as a seats message", async () => {
  const [a, b] = [await newUser(), await newUser()];
  const ws = await live(a);
  const snap = await ws.next();
  expect(snap.type).toBe('snapshot');
  expect(snap.seats).toHaveLength(40);
  await hold(b, SEAT, 'ben');
  const update = await ws.next();
  expect(update).toMatchObject({
    type: 'seats',
    seats: [{ id: SEAT, status: 'held', by: 'ben' }],
    stats: { granted: 1 },
  });
  ws.close();
});

test('live: the snapshot carries your own holds and deadline', async () => {
  const a = await newUser();
  const held = (await (await hold(a, SEAT)).json()) as { expiresAt: number };
  const ws = await live(a);
  const snap = await ws.next();
  expect(snap.type === 'snapshot' && snap.mine).toEqual({ seatIds: [SEAT], expiresAt: held.expiresAt });
  ws.close();
});

test('live: an expired hold is pushed as available when the alarm fires', async () => {
  const [a, b] = [await newUser(), await newUser()];
  await hold(a, SEAT);
  const ws = await live(b);
  await ws.next();
  const { env, runInDurableObject, runDurableObjectAlarm } = await import('cloudflare:test');
  const stub = env.EVENT_ROOM.get(env.EVENT_ROOM.idFromName('hot'));
  await runInDurableObject(stub, (_i, state) => {
    state.storage.sql.exec('UPDATE hold SET expires_at = 0');
  });
  expect(await runDurableObjectAlarm(stub)).toBe(true);
  expect(await ws.next()).toMatchObject({
    type: 'seats',
    seats: [{ id: SEAT, status: 'available', by: null }],
    stats: { expired: 1 },
  });
  ws.close();
});

test('reset needs the secret, and frees held seats', async () => {
  const [a, b] = [await newUser(), await newUser()];
  await hold(a, SEAT);
  expect((await reset()).status).toBe(401);
  expect((await reset('wrong')).status).toBe(401);
  expect((await hold(b, SEAT, 'ben')).status).toBe(409);
  expect((await reset('test-secret')).status).toBe(204);
  expect((await hold(b, SEAT, 'ben')).status).toBe(200);
});
