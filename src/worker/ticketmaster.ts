import { buildSeatMap } from '../../shared/seat-map';
import type { EventDetail, EventSummary, EventType, SeatMap } from '../../shared/types';

// Ticketmaster Discovery API v2. Everything here degrades quietly: without a
// key, or when the API is down or rate limited, search simply has no results
// from this source.
const ROOT = 'https://app.ticketmaster.com/discovery/v2';
export const TM_PREFIX = 'tm-';
const SEARCH_TTL = 300; // seconds; the API allows 5 requests/second and 5000/day
const EVENT_TTL = 600;

export type SearchParams = { q?: string; type?: EventType; from?: string; to?: string };

type TmEvent = {
  id?: string;
  name?: string;
  url?: string;
  info?: string;
  pleaseNote?: string;
  images?: { ratio?: string; url?: string; width?: number }[];
  dates?: { start?: { localDate?: string; localTime?: string } };
  classifications?: { segment?: { name?: string }; genre?: { name?: string } }[];
  priceRanges?: { min?: number; max?: number }[];
  _embedded?: {
    venues?: { name?: string; city?: { name?: string } }[];
    attractions?: { name?: string }[];
  };
};

const TYPE_FILTER: Record<EventType, [string, string]> = {
  concert: ['segmentName', 'Music'],
  sports: ['segmentName', 'Sports'],
  theater: ['segmentName', 'Arts & Theatre'],
  comedy: ['classificationName', 'Comedy'],
};

function typeOf(e: TmEvent): EventType {
  const c = e.classifications?.[0];
  if (c?.genre?.name === 'Comedy') return 'comedy';
  if (c?.segment?.name === 'Music') return 'concert';
  if (c?.segment?.name === 'Sports') return 'sports';
  return 'theater';
}

const httpsOrNull = (url: string | undefined) => (url?.startsWith('https://') ? url : null);

function imageOf(e: TmEvent): string | null {
  const wide = (e.images ?? [])
    .filter((i) => i.ratio === '16_9' && i.url)
    .sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
  // Largest 16:9 up to ~1100px wide; bigger files add nothing at our sizes.
  const pick = wide.find((i) => (i.width ?? 0) <= 1136) ?? wide.at(-1) ?? e.images?.[0];
  return httpsOrNull(pick?.url);
}

function toSummary(e: TmEvent): EventSummary | null {
  const date = e.dates?.start?.localDate;
  if (!e.id || !e.name || !date) return null; // no announced date: leave it out
  const venue = e._embedded?.venues?.[0];
  return {
    id: TM_PREFIX + e.id,
    name: e.name,
    type: typeOf(e),
    // Local date and time, so it reads as the venue's wall clock.
    startsAt: `${date}T${e.dates?.start?.localTime ?? '00:00:00'}Z`,
    venueName: venue?.name ?? 'Venue to be announced',
    city: venue?.city?.name ?? '',
    performerName: e._embedded?.attractions?.[0]?.name ?? e.name,
    source: 'ticketmaster',
    imageUrl: imageOf(e),
  };
}

// The API has no seat-level data, so every Ticketmaster event gets the same
// generated house, priced from the event's price range when there is one.
function generatedSeatMap(e: TmEvent): SeatMap {
  const range = e.priceRanges?.find((r) => r.min != null && r.max != null);
  const [high, low] = range ? [range.max! * 100, range.min! * 100] : [12000, 4500];
  const mid = range ? (high + low) / 2 : 7500;
  return buildSeatMap(
    [
      ['Floor', high],
      ['Lower', mid],
      ['Upper', low],
    ].map(([name, price]) => ({
      name: name as string,
      priceCents: Math.round(price as number),
      rows: 4,
      perRow: 16,
    })),
  );
}

async function cachedJson(url: URL, apiKey: string, ttl: number): Promise<Response> {
  // The cache key leaves the API key out.
  const cacheKey = new Request(`https://tm-cache.invalid${url.pathname}?${url.searchParams}`);
  const hit = await caches.default.match(cacheKey);
  if (hit) return hit;
  url.searchParams.set('apikey', apiKey);
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (res.ok) {
    const copy = new Response(res.clone().body, res);
    copy.headers.set('cache-control', `public, max-age=${ttl}`);
    await caches.default.put(cacheKey, copy);
  }
  return res;
}

export async function tmSearch(apiKey: string | undefined, p: SearchParams): Promise<EventSummary[]> {
  if (!apiKey) return [];
  const url = new URL(`${ROOT}/events.json`);
  const today = new Date().toISOString().slice(0, 10);
  if (p.q) url.searchParams.set('keyword', p.q);
  if (p.type) url.searchParams.set(...TYPE_FILTER[p.type]);
  url.searchParams.set('startDateTime', `${p.from ?? today}T00:00:00Z`);
  if (p.to) url.searchParams.set('endDateTime', `${p.to}T23:59:59Z`);
  url.searchParams.set('countryCode', 'US');
  url.searchParams.set('size', '20');
  url.searchParams.set('sort', 'date,asc');
  try {
    const res = await cachedJson(url, apiKey, SEARCH_TTL);
    if (!res.ok) return [];
    const data = (await res.json()) as { _embedded?: { events?: TmEvent[] } };
    return (data._embedded?.events ?? []).map(toSummary).filter((e) => e !== null);
  } catch {
    return [];
  }
}

// null when the event does not exist (or there is no key); throws when the API
// cannot be reached, so an outage is not mistaken for a missing event.
export async function tmGetEvent(apiKey: string | undefined, id: string): Promise<EventDetail | null> {
  const rawId = id.slice(TM_PREFIX.length);
  if (!apiKey || !/^[A-Za-z0-9_-]{1,64}$/.test(rawId)) return null;
  const res = await cachedJson(new URL(`${ROOT}/events/${rawId}.json`), apiKey, EVENT_TTL);
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok) throw new Error(`Ticketmaster API responded ${res.status}`);
  const e = (await res.json()) as TmEvent;
  const summary = toSummary({ ...e, id: rawId });
  if (!summary) return null;
  return {
    ...summary,
    description: (e.info ?? e.pleaseNote ?? '').slice(0, 600),
    performerBlurb: '',
    seatMap: generatedSeatMap(e),
    externalUrl: httpsOrNull(e.url),
  };
}
