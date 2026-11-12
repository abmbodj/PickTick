import { and, asc, eq, gte, sql, type SQL } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type {
  Booking,
  EventDetail,
  EventGroup,
  EventSummary,
  Performer,
  SearchPage,
  SeatMap,
  Ticket,
} from '../../shared/types';
import { event, performer, userBooking, venue } from './db/schema';
import { TM_PREFIX, tmGetEvent, tmPerformerEvents, tmSearch, type SearchParams } from './ticketmaster';

export type { SearchParams };
// The API key is optional: without it the site shows PickTick's own events only.
export type CatalogEnv = { DB: D1Database; TICKETMASTER_API_KEY?: string };

const summary = {
  id: event.id,
  name: event.name,
  type: event.type,
  startsAt: event.startsAt,
  venueName: venue.name,
  city: venue.city,
  performerName: performer.name,
  performerId: sql<string>`${performer.id}`,
  source: sql<'picktick'>`'picktick'`,
  imageUrl: sql<null>`NULL`,
};

// Turns free text into a safe FTS5 query: every word quoted, last word a prefix.
// Returns null when the text has no searchable words.
function ftsQuery(q: string): string | null {
  const words = q.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (words.length === 0) return null;
  return words.map((w, i) => `"${w}"${i === words.length - 1 ? '*' : ''}`).join(' ');
}

// One page of results. PickTick's own events lead the first page; the rest of
// that page, and every later page, is Ticketmaster's listing. Each group is
// soonest first. ponytail: own events are few, so they are not paged; give them
// LIMIT/OFFSET if the catalog grows past a screenful.
export async function searchEvents(env: CatalogEnv, p: SearchParams): Promise<SearchPage> {
  const page = p.page ?? 0;
  const [own, tm] = await Promise.all([
    page === 0 ? searchOwn(env.DB, p) : [],
    tmSearch(env.TICKETMASTER_API_KEY, p),
  ]);
  return { events: [...own, ...tm.events], page, totalPages: tm.totalPages };
}

async function searchOwn(d1: D1Database, p: SearchParams): Promise<EventSummary[]> {
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

export async function getEvent(env: CatalogEnv, id: string): Promise<EventDetail | null> {
  if (id.startsWith(TM_PREFIX)) return tmGetEvent(env.TICKETMASTER_API_KEY, id);
  const d1 = env.DB;
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
  return { ...rest, seatMap: JSON.parse(seatMapJson) as SeatMap, externalUrl: null, seatmapUrl: null };
}

export async function listEventIds(d1: D1Database): Promise<string[]> {
  const rows = await drizzle(d1).select({ id: event.id }).from(event);
  return rows.map((r) => r.id);
}

// ---- "My tickets" read model ----

export async function recordTicket(env: CatalogEnv, userId: string, eventId: string, b: Booking) {
  const e = await getEvent(env, eventId);
  if (!e) return;
  await drizzle(env.DB)
    .insert(userBooking)
    .values({
      bookingId: b.id,
      userId,
      eventId,
      eventName: e.name,
      startsAt: e.startsAt,
      venueName: e.venueName,
      city: e.city,
      imageUrl: e.imageUrl,
      seatIdsJson: JSON.stringify(b.seatIds),
      totalCents: b.totalCents,
      createdAt: b.createdAt,
    })
    .onConflictDoNothing();
}

export async function listTickets(d1: D1Database, userId: string): Promise<Ticket[]> {
  const rows = await drizzle(d1)
    .select()
    .from(userBooking)
    .where(eq(userBooking.userId, userId))
    .orderBy(asc(userBooking.startsAt), asc(userBooking.createdAt));
  return rows.map(({ seatIdsJson, userId: _u, ...t }) => ({ ...t, seatIds: JSON.parse(seatIdsJson) as string[] }));
}

// Every event whose room may hold state: own events plus any event with a booking.
export async function clearTickets(d1: D1Database): Promise<string[]> {
  const db = drizzle(d1);
  const booked = await db.selectDistinct({ id: userBooking.eventId }).from(userBooking);
  await db.delete(userBooking);
  return booked.map((r) => r.id);
}

// ---- one card per performer ----

// Collapses a result list so a tour with thirty dates is one entry, not
// thirty. Groups keep the order their first event appeared in.
export function groupEvents(events: EventSummary[]): EventGroup[] {
  const byKey = new Map<string, EventSummary[]>();
  for (const e of events) {
    // By name, not id: Ticketmaster sometimes lists one act under two ids.
    const key = e.performerId ? `${e.source}:${e.performerName.toLowerCase()}` : e.id;
    byKey.set(key, [...(byKey.get(key) ?? []), e]);
  }
  return [...byKey.values()].map((list) => {
    const sorted = [...list].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    const first = sorted[0];
    return {
      key: list[0].performerId ?? list[0].id,
      performerId: list[0].performerId,
      name: sorted.length === 1 ? first.name : first.performerName,
      type: first.type,
      source: first.source,
      imageUrl: sorted.find((e) => e.imageUrl)?.imageUrl ?? null,
      eventCount: sorted.length,
      nextStartsAt: first.startsAt,
      firstEventId: first.id,
      venueName: first.venueName,
      cities: [...new Set(sorted.map((e) => e.city).filter(Boolean))],
    };
  });
}

export async function getPerformer(env: CatalogEnv, id: string): Promise<Performer | null> {
  if (id.startsWith(TM_PREFIX)) {
    const tm = await tmPerformerEvents(env.TICKETMASTER_API_KEY, id);
    if (!tm) return null;
    // Pick up dates listed under a second id for the same act.
    const sameName = (await tmSearch(env.TICKETMASTER_API_KEY, { q: tm.name })).events.filter(
      (e) => e.performerName.toLowerCase() === tm.name.toLowerCase(),
    );
    const seen = new Set(tm.events.map((e) => e.id));
    tm.events.push(...sameName.filter((e) => !seen.has(e.id)));
    tm.events.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    return {
      id,
      name: tm.name,
      blurb: '',
      type: tm.events[0].type,
      source: 'ticketmaster',
      imageUrl: tm.events.find((e) => e.imageUrl)?.imageUrl ?? null,
      events: tm.events,
    };
  }
  const db = drizzle(env.DB);
  const [row] = await db.select().from(performer).where(eq(performer.id, id));
  if (!row) return null;
  const events = await db
    .select(summary)
    .from(event)
    .innerJoin(venue, eq(event.venueId, venue.id))
    .innerJoin(performer, eq(event.performerId, performer.id))
    .where(eq(event.performerId, id))
    .orderBy(asc(event.startsAt));
  if (events.length === 0) return null;
  return { id, name: row.name, blurb: row.blurb, type: events[0].type, source: 'picktick', imageUrl: null, events };
}
