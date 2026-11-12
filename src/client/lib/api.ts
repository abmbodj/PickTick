import type { Booking, EventDetail, EventType, GroupPage, Performer, Ticket } from '../../../shared/types';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || data === null)
    throw new ApiError(res.status, data?.error ?? 'Something went wrong. Try again.');
  return data;
}

const post = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

export type SearchFilters = { q: string; type: EventType | ''; from: string; to: string };

export function searchEvents(f: Partial<SearchFilters>, page = 0): Promise<GroupPage> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) params.set(k, v);
  if (page) params.set('page', String(page));
  return api(`/api/events/search?${params}`);
}

export const getEvent = (id: string) => api<EventDetail>(`/api/events/${encodeURIComponent(id)}`);

export const holdSeat = (eventId: string, seatId: string, nickname: string) =>
  api<{ expiresAt: number }>(`/api/events/${encodeURIComponent(eventId)}/holds`, post({ seatId, nickname }));

export const releaseSeat = (eventId: string, seatId: string) =>
  api<void>(`/api/events/${encodeURIComponent(eventId)}/holds/${encodeURIComponent(seatId)}`, {
    method: 'DELETE',
  });

export const payForHolds = (eventId: string, bookingId: string, nickname: string) =>
  api<Booking>(`/api/events/${encodeURIComponent(eventId)}/bookings`, post({ bookingId, nickname }));

export const getBooking = (eventId: string, bookingId: string) =>
  api<Booking>(`/api/events/${encodeURIComponent(eventId)}/bookings/${encodeURIComponent(bookingId)}`);

export const getTickets = () => api<Ticket[]>('/api/me/bookings');

export const getPerformer = (id: string) => api<Performer>(`/api/performers/${encodeURIComponent(id)}`);
