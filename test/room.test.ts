import { expect, test } from 'vitest';
import { applyHold, applyMessage, applyRelease, msLeft, type SeatMessage } from '../src/client/lib/room';
import type { RoomMessage, SeatView, Stats } from '../shared/types';

const stats: Stats = { granted: 0, rejected: 0, expired: 0, sold: 0 };
const seat = (id: string, status: SeatView['status'] = 'available', by: string | null = null): SeatView => ({
  id, priceCents: 1000, status, by,
});
const snapshot = (over: Partial<Extract<RoomMessage, { type: 'snapshot' }>> = {}): SeatMessage => ({
  type: 'snapshot',
  seats: [seat('a'), seat('b')],
  stats,
  mine: { seatIds: [], expiresAt: null },
  now: 1_000,
  ...over,
});

test('a snapshot after existing state replaces seats, stats and mine entirely', () => {
  let s = applyMessage(null, snapshot(), 1_000);
  s = applyHold(s, 'a', 9_000);
  s = applyMessage(
    s,
    snapshot({
      seats: [seat('b', 'held', 'me'), seat('c')],
      stats: { ...stats, granted: 5 },
      mine: { seatIds: ['b'], expiresAt: 7_000 },
    }),
    1_000,
  );
  expect(Object.keys(s.seats).sort()).toEqual(['b', 'c']);
  expect(s.stats.granted).toBe(5);
  expect(s.mine).toEqual({ seatIds: ['b'], expiresAt: 7_000 });
});

test('a seats message merges and leaves other seats untouched', () => {
  let s = applyMessage(null, snapshot(), 1_000);
  s = applyMessage(s, { type: 'seats', seats: [seat('a', 'held', 'ben')], stats: { ...stats, granted: 1 }, now: 1_000 }, 1_000);
  expect(s.seats.a).toMatchObject({ status: 'held', by: 'ben' });
  expect(s.seats.b.status).toBe('available');
  expect(s.stats.granted).toBe(1);
});

test('own held seat reported available or sold is dropped from mine', () => {
  let s = applyMessage(null, snapshot(), 1_000);
  s = applyHold(applyHold(s, 'a', 9_000), 'b', 9_000);
  expect(s.mine).toEqual({ seatIds: ['a', 'b'], expiresAt: 9_000 });
  expect(s.seats.a.status).toBe('held');
  s = applyMessage(s, { type: 'seats', seats: [seat('a')], stats, now: 1_000 }, 1_000);
  expect(s.mine).toEqual({ seatIds: ['b'], expiresAt: 9_000 });
  s = applyMessage(s, { type: 'seats', seats: [seat('b', 'sold', 'me')], stats, now: 1_000 }, 1_000);
  expect(s.mine).toEqual({ seatIds: [], expiresAt: null });
});

test('applyHold twice keeps one entry; applyRelease frees the seat', () => {
  let s = applyMessage(null, snapshot(), 1_000);
  s = applyHold(applyHold(s, 'a', 9_000), 'a', 9_000);
  expect(s.mine.seatIds).toEqual(['a']);
  s = applyRelease(s, 'a');
  expect(s.mine).toEqual({ seatIds: [], expiresAt: null });
  expect(s.seats.a).toMatchObject({ status: 'available', by: null });
});

test('msLeft follows the server clock when the client clock is 5 minutes ahead', () => {
  const serverNow = 1_000_000;
  const clientNow = serverNow + 5 * 60_000;
  let s = applyMessage(null, snapshot({ now: serverNow }), clientNow);
  expect(msLeft(s, clientNow)).toBeNull();
  s = applyHold(s, 'a', serverNow + 120_000);
  expect(msLeft(s, clientNow)).toBe(120_000);
  expect(msLeft(s, clientNow + 30_000)).toBe(90_000);
  expect(msLeft(s, clientNow + 500_000)).toBe(0);
});

test('seats freed by the server after the deadline are flagged as expired', () => {
  let s = applyMessage(null, snapshot(), 1_000);
  s = applyHold(s, 'a', 9_000);
  expect(s.expiredAt).toBeNull();
  s = applyMessage(s, { type: 'seats', seats: [seat('a')], stats, now: 9_050 }, 9_050);
  expect(s.mine.seatIds).toEqual([]);
  expect(s.expiredAt).toBe(9_050);
});

test('releasing or selling before the deadline is not flagged as expired', () => {
  let s = applyMessage(null, snapshot(), 1_000);
  s = applyHold(s, 'a', 9_000);
  s = applyMessage(s, { type: 'seats', seats: [seat('a', 'sold', 'me')], stats, now: 2_000 }, 2_000);
  expect(s.expiredAt).toBeNull();
});

test('a reconnect snapshot after the deadline with holds gone is flagged as expired', () => {
  let s = applyMessage(null, snapshot(), 1_000);
  s = applyHold(s, 'a', 9_000);
  s = applyMessage(s, snapshot({ now: 60_000 }), 60_000);
  expect(s.expiredAt).toBe(60_000);
});
