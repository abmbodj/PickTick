import type { Mine, RoomMessage, SeatView, Stats } from '../../../shared/types';

// Client-side copy of one event's live seat state. Pure functions; the
// WebSocket hook and the tap handlers feed them.
export type RoomState = {
  seats: Record<string, SeatView>;
  stats: Stats;
  mine: Mine;
  skewMs: number; // server clock minus this device's clock
};

const dropMine = (mine: Mine, gone: Set<string>): Mine => {
  const seatIds = mine.seatIds.filter((id) => !gone.has(id));
  return { seatIds, expiresAt: seatIds.length ? mine.expiresAt : null };
};

export function applyMessage(state: RoomState | null, msg: RoomMessage, clientNow: number): RoomState {
  const skewMs = msg.now - clientNow;
  if (msg.type === 'snapshot' || !state)
    return {
      seats: Object.fromEntries(msg.seats.map((s) => [s.id, s])),
      stats: msg.stats,
      mine: msg.type === 'snapshot' ? msg.mine : { seatIds: [], expiresAt: null },
      skewMs,
    };
  const seats = { ...state.seats };
  for (const s of msg.seats) seats[s.id] = s;
  // A seat of mine that is no longer held has expired, been released or been sold.
  const gone = new Set(msg.seats.filter((s) => s.status !== 'held').map((s) => s.id));
  return { seats, stats: msg.stats, mine: dropMine(state.mine, gone), skewMs };
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
