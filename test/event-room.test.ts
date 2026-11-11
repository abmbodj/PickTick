import { env, runInDurableObject } from 'cloudflare:test';
import { expect, test } from 'vitest';
import { HOLD_MS, type User } from '../shared/types';

// A fresh room per test, all backed by the seeded 40-seat 'hot' event.
const room = () => env.EVENT_ROOM.get(env.EVENT_ROOM.idFromName(crypto.randomUUID()));
const user = (n: string): User => ({ id: `u-${n}`, nickname: n });
const expireAll = (r: ReturnType<typeof room>) =>
  runInDurableObject(r, (_i, state) => {
    state.storage.sql.exec('UPDATE hold SET expires_at = 0');
  });
const SEAT = 'Front-1-1';
const seatOf = async (r: ReturnType<typeof room>, id: string, uid = 'viewer') =>
  (await r.snapshot('hot', uid))!.seats.find((s) => s.id === id)!;

test('50 users hold one seat at once: exactly one wins', async () => {
  const r = room();
  const results = await Promise.all(
    Array.from({ length: 50 }, (_, i) => r.hold('hot', user(String(i)), SEAT)),
  );
  expect(results.filter((x) => x!.ok)).toHaveLength(1);
  expect(results.filter((x) => !x!.ok && x!.reason === 'taken')).toHaveLength(49);
  const snap = (await r.snapshot('hot', 'viewer'))!;
  expect(snap.stats).toMatchObject({ granted: 1, rejected: 49 });
  expect(snap.seats).toHaveLength(40);
  expect(snap.seats.filter((s) => s.status === 'held')).toHaveLength(1);
});

test('a hold lasts HOLD_MS and shows the holder nickname', async () => {
  const r = room();
  const before = Date.now();
  const res = await r.hold('hot', user('ana'), SEAT);
  expect(res).toMatchObject({ ok: true });
  if (res?.ok) expect(res.expiresAt - before).toBeGreaterThanOrEqual(HOLD_MS);
  expect(await seatOf(r, SEAT)).toMatchObject({ status: 'held', by: 'ana', priceCents: 6000 });
  expect((await r.snapshot('hot', 'u-ana'))!.mine.seatIds).toEqual([SEAT]);
});

test('an expired hold lets another user hold the seat', async () => {
  const r = room();
  await r.hold('hot', user('ana'), SEAT);
  await expireAll(r);
  expect((await seatOf(r, SEAT)).status).toBe('available');
  expect(await r.hold('hot', user('ben'), SEAT)).toMatchObject({ ok: true });
  expect((await r.snapshot('hot', 'viewer'))!.stats.expired).toBe(1);
  expect((await r.snapshot('hot', 'u-ana'))!.mine).toEqual({ seatIds: [], expiresAt: null });
});

test("a second seat shares the first seat's deadline", async () => {
  const r = room();
  const a = await r.hold('hot', user('ana'), 'Front-1-1');
  const b = await r.hold('hot', user('ana'), 'Front-1-2');
  expect(a?.ok && b?.ok && a.expiresAt === b.expiresAt).toBe(true);
});

test('holding your own held seat again is ok and not counted twice', async () => {
  const r = room();
  await r.hold('hot', user('ana'), SEAT);
  expect(await r.hold('hot', user('ana'), SEAT)).toMatchObject({ ok: true });
  expect((await r.snapshot('hot', 'viewer'))!.stats).toMatchObject({ granted: 1, rejected: 0 });
});

test('a fifth hold returns limit', async () => {
  const r = room();
  for (let i = 1; i <= 4; i++)
    expect(await r.hold('hot', user('ana'), `Front-1-${i}`)).toMatchObject({ ok: true });
  expect(await r.hold('hot', user('ana'), 'Front-1-5')).toEqual({ ok: false, reason: 'limit' });
});

test('confirm after expiry returns expired and sells nothing', async () => {
  const r = room();
  await r.hold('hot', user('ana'), SEAT);
  await expireAll(r);
  expect(await r.confirm('hot', user('ana'), 'b1')).toEqual({ ok: false, reason: 'expired' });
  const snap = (await r.snapshot('hot', 'viewer'))!;
  expect(snap.seats.some((s) => s.status === 'sold')).toBe(false);
  expect(snap.stats.sold).toBe(0);
});

test('confirm twice with the same bookingId sells once', async () => {
  const r = room();
  await r.hold('hot', user('ana'), 'Front-1-1');
  await r.hold('hot', user('ana'), 'Back-1-1');
  const first = await r.confirm('hot', user('ana'), 'b1');
  const second = await r.confirm('hot', user('ana'), 'b1');
  expect(first).toMatchObject({ ok: true, booking: { id: 'b1', totalCents: 10000, nickname: 'ana' } });
  expect(second).toEqual(first);
  if (first?.ok) expect(first.booking.seatIds.sort()).toEqual(['Back-1-1', 'Front-1-1']);
  const snap = (await r.snapshot('hot', 'u-ana'))!;
  expect(snap.stats.sold).toBe(2);
  expect(snap.mine.seatIds).toEqual([]);
  expect(snap.seats.find((s) => s.id === 'Front-1-1')).toMatchObject({ status: 'sold', by: 'ana' });
});

test('a sold seat cannot be held', async () => {
  const r = room();
  await r.hold('hot', user('ana'), SEAT);
  await r.confirm('hot', user('ana'), 'b1');
  expect(await r.hold('hot', user('ben'), SEAT)).toEqual({ ok: false, reason: 'taken' });
});

test('release by a non-holder returns false and the hold remains', async () => {
  const r = room();
  await r.hold('hot', user('ana'), SEAT);
  expect(await r.release('hot', 'u-ben', SEAT)).toBe(false);
  expect((await seatOf(r, SEAT)).status).toBe('held');
  expect(await r.release('hot', 'u-ana', SEAT)).toBe(true);
  expect((await seatOf(r, SEAT)).status).toBe('available');
});

test("confirm only sells the caller's seats", async () => {
  const r = room();
  await r.hold('hot', user('ana'), 'Front-1-1');
  await r.hold('hot', user('ben'), 'Front-1-2');
  await r.confirm('hot', user('ana'), 'b1');
  expect((await seatOf(r, 'Front-1-2')).status).toBe('held');
});

test("getBooking hides another user's booking", async () => {
  const r = room();
  await r.hold('hot', user('ana'), SEAT);
  await r.confirm('hot', user('ana'), 'b1');
  expect(await r.getBooking('hot', 'u-ana', 'b1')).toMatchObject({ id: 'b1' });
  expect(await r.getBooking('hot', 'u-ben', 'b1')).toBeNull();
  // Someone else reusing the id cannot read or overwrite it either.
  await r.hold('hot', user('ben'), 'Front-1-2');
  expect(await r.confirm('hot', user('ben'), 'b1')).toEqual({ ok: false, reason: 'expired' });
});

test('unknown seat and unknown event', async () => {
  const r = room();
  expect(await r.hold('hot', user('ana'), 'zzz')).toEqual({ ok: false, reason: 'unknown_seat' });
  const ghost = room();
  expect(await ghost.hold('nope', user('ana'), SEAT)).toBeNull();
  expect(await ghost.snapshot('nope', 'u-ana')).toBeNull();
  const tables = await runInDurableObject(ghost, (_i, state) =>
    state.storage.sql.exec("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'seat'").one().n,
  );
  expect(tables).toBe(0);
});

test('reset returns every seat to available and stats to zero', async () => {
  const r = room();
  await r.hold('hot', user('ana'), 'Front-1-1');
  await r.confirm('hot', user('ana'), 'b1');
  await r.hold('hot', user('ben'), 'Front-1-2');
  await r.reset();
  const snap = (await r.snapshot('hot', 'viewer'))!;
  expect(snap.seats.every((s) => s.status === 'available')).toBe(true);
  expect(snap.stats).toEqual({ granted: 0, rejected: 0, expired: 0, sold: 0 });
});
