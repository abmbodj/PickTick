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
  performerId: string | null; // null when the event has no named performer
  source: 'picktick' | 'ticketmaster';
  imageUrl: string | null;
  geo?: [number, number] | null; // venue latitude and longitude, when known
};
export const PAGE_SIZE = 100; // events fetched per page, before grouping by performer
export const MAX_PAGES = 10; // the Ticketmaster API stops at 1000 results
export type SearchPage = { events: EventSummary[]; page: number; totalPages: number };
export type EventDetail = EventSummary & {
  description: string;
  performerBlurb: string;
  seatMap: SeatMap;
  externalUrl: string | null; // where real tickets are sold, for Ticketmaster events
  seatmapUrl: string | null; // the venue's own seating chart image, when Ticketmaster has one
};

export type SeatStatus = 'available' | 'held' | 'sold';
export type SeatView = { id: string; priceCents: number; status: SeatStatus; by: string | null };
export type Stats = { granted: number; rejected: number; expired: number; sold: number };
export type Mine = { seatIds: string[]; expiresAt: number | null };
export type Snapshot = { seats: SeatView[]; stats: Stats; mine: Mine; now: number };
export type RoomMessage =
  | ({ type: 'snapshot' } & Snapshot)
  | { type: 'seats'; seats: SeatView[]; stats: Stats; now: number }
  | { type: 'viewers'; viewers: number }; // people with this event open right now, you included

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

// One row of "My tickets": a booking plus enough of the event to show it.
export type Ticket = {
  bookingId: string;
  eventId: string;
  eventName: string;
  startsAt: string;
  venueName: string;
  city: string;
  imageUrl: string | null;
  seatIds: string[];
  totalCents: number;
  createdAt: number;
};

// Search shows one card per performer, however many dates they have.
export type EventGroup = {
  key: string;
  performerId: string | null;
  name: string; // the performer, or the event itself when there is only one
  type: EventType;
  source: 'picktick' | 'ticketmaster';
  imageUrl: string | null;
  eventCount: number;
  nextStartsAt: string;
  firstEventId: string; // the soonest event
  nearEventId: string; // the date closest to the visitor; the soonest when we cannot tell
  venueName: string; // of the soonest event
  cities: string[]; // distinct, soonest first
};
export type GroupPage = { groups: EventGroup[]; page: number; totalPages: number; nearby?: boolean }; // nearby: these are around the visitor
export type Performer = {
  id: string;
  name: string;
  blurb: string;
  type: EventType;
  source: 'picktick' | 'ticketmaster';
  imageUrl: string | null;
  events: EventSummary[];
  nearEventId?: string | null; // the date closest to the visitor, when we can tell
};
