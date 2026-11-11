import { and, asc, eq, gte, sql, type SQL } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type { EventDetail, EventSummary, EventType, SeatMap } from '../../shared/types';
import { event, performer, venue } from './db/schema';

export type SearchParams = { q?: string; type?: EventType; from?: string; to?: string };

const summary = {
  id: event.id,
  name: event.name,
  type: event.type,
  startsAt: event.startsAt,
  venueName: venue.name,
  city: venue.city,
  performerName: performer.name,
};

// Turns free text into a safe FTS5 query: every word quoted, last word a prefix.
// Returns null when the text has no searchable words.
function ftsQuery(q: string): string | null {
  const words = q.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (words.length === 0) return null;
  return words.map((w, i) => `"${w}"${i === words.length - 1 ? '*' : ''}`).join(' ');
}

export async function searchEvents(d1: D1Database, p: SearchParams): Promise<EventSummary[]> {
  const where: SQL[] = [];
  const match = p.q ? ftsQuery(p.q) : null;
  if (match)
    where.push(sql`${event.id} IN (SELECT event_id FROM event_fts WHERE event_fts MATCH ${match})`);
  if (p.type) where.push(eq(event.type, p.type));
  if (p.from) where.push(gte(event.startsAt, p.from));
  if (p.to) where.push(sql`substr(${event.startsAt}, 1, 10) <= ${p.to}`);
  if (!p.from && !p.to) where.push(gte(event.startsAt, new Date().toISOString()));

  return drizzle(d1)
    .select(summary)
    .from(event)
    .innerJoin(venue, eq(event.venueId, venue.id))
    .innerJoin(performer, eq(event.performerId, performer.id))
    .where(and(...where))
    .orderBy(asc(event.startsAt));
}

export async function getEvent(d1: D1Database, id: string): Promise<EventDetail | null> {
  const [row] = await drizzle(d1)
    .select({
      ...summary,
      description: event.description,
      performerBlurb: performer.blurb,
      seatMapJson: venue.seatMapJson,
    })
    .from(event)
    .innerJoin(venue, eq(event.venueId, venue.id))
    .innerJoin(performer, eq(event.performerId, performer.id))
    .where(eq(event.id, id));
  if (!row) return null;
  const { seatMapJson, ...rest } = row;
  return { ...rest, seatMap: JSON.parse(seatMapJson) as SeatMap };
}

export async function listEventIds(d1: D1Database): Promise<string[]> {
  const rows = await drizzle(d1).select({ id: event.id }).from(event);
  return rows.map((r) => r.id);
}
