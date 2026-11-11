export const HOLD_MS = 120_000;
export const MAX_HOLDS = 4;
export const NICKNAME_MAX = 20;
export const EVENT_TYPES = ['concert', 'sports', 'theater', 'comedy'] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export type SeatMap = {
  sections: {
    name: string;
    priceCents: number;
    rows: { label: string; seats: { id: string; number: number; x: number; y: number }[] }[];
  }[];
};

export type EventSummary = {
  id: string;
  name: string;
  type: EventType;
  startsAt: string;
  venueName: string;
  city: string;
  performerName: string;
};
export type EventDetail = EventSummary & {
  description: string;
  performerBlurb: string;
  seatMap: SeatMap;
};

export type SeatStatus = 'available' | 'held' | 'sold';
export type SeatView = { id: string; priceCents: number; status: SeatStatus; by: string | null };
export type Stats = { granted: number; rejected: number; expired: number; sold: number };
export type Mine = { seatIds: string[]; expiresAt: number | null };
export type Snapshot = { seats: SeatView[]; stats: Stats; mine: Mine; now: number };
export type RoomMessage =
  | ({ type: 'snapshot' } & Snapshot)
  | { type: 'seats'; seats: SeatView[]; stats: Stats; now: number };

export type User = { id: string; nickname: string };
export type Booking = {
  id: string;
  nickname: string;
  totalCents: number;
  createdAt: number;
  seatIds: string[];
};
export type HoldResult =
  | { ok: true; expiresAt: number }
  | { ok: false; reason: 'taken' | 'limit' | 'unknown_seat' };
export type ConfirmResult = { ok: true; booking: Booking } | { ok: false; reason: 'expired' };
