import type { Mine, RoomMessage, SeatView, Stats } from '../../../shared/types';

// Client-side copy of one event's live seat state. Pure functions; the
// WebSocket hook and the tap handlers feed them.
export type RoomState = {
  seats: Record<string, SeatView>;
  stats: Stats;
  mine: Mine;
  skewMs: number; // server clock minus this device's clock
  // Server time at which the server took back holds of mine that had run out.
  expiredAt: number | null;
};

const dropMine = (mine: Mine, gone: Set<string>): Mine => {
  const seatIds = mine.seatIds.filter((id) => !gone.has(id));
  return { seatIds, expiresAt: seatIds.length ? mine.expiresAt : null };
};

export function applyMessage(state: RoomState | null, msg: RoomMessage, clientNow: number): RoomState {
  const skewMs = msg.now - clientNow;
  // Holds of mine that are gone once their deadline has passed ran out;
  // gone any earlier, I released or paid for them.
  const expiry = (next: Mine) =>
    state?.mine.expiresAt != null &&
    next.seatIds.length < state.mine.seatIds.length &&
    msg.now >= state.mine.expiresAt
      ? msg.now
      : (state?.expiredAt ?? null);
  if (msg.type === 'snapshot' || !state) {
    const mine = msg.type === 'snapshot' ? msg.mine : { seatIds: [], expiresAt: null };
    return {
      seats: Object.fromEntries(msg.seats.map((s) => [s.id, s])),
      stats: msg.stats,
      mine,
      skewMs,
      expiredAt: expiry(mine),
    };
  }
  const seats = { ...state.seats };
  for (const s of msg.seats) seats[s.id] = s;
  // A seat of mine that is no longer held has expired, been released or been sold.
  const gone = new Set(msg.seats.filter((s) => s.status !== 'held').map((s) => s.id));
  const mine = dropMine(state.mine, gone);
  return { seats, stats: msg.stats, mine, skewMs, expiredAt: expiry(mine) };
}

export function applyHold(state: RoomState, seatId: string, expiresAt: number): RoomState {
  const seat = state.seats[seatId];
  return {
    ...state,
    seats: seat ? { ...state.seats, [seatId]: { ...seat, status: 'held' } } : state.seats,
    mine: { seatIds: [...new Set([...state.mine.seatIds, seatId])], expiresAt },
  };
}

export function applyRelease(state: RoomState, seatId: string): RoomState {
  const seat = state.seats[seatId];
  return {
    ...state,
    seats: seat ? { ...state.seats, [seatId]: { ...seat, status: 'available', by: null } } : state.seats,
    mine: dropMine(state.mine, new Set([seatId])),
  };
}

export function msLeft(state: RoomState, clientNow: number): number | null {
  if (state.mine.expiresAt === null) return null;
  return Math.max(0, state.mine.expiresAt - (clientNow + state.skewMs));
}
