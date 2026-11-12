import { buildSeatMap } from '../../shared/seat-map';
import { MAX_PAGES, PAGE_SIZE, type EventDetail, type EventSummary, type EventType, type SeatMap } from '../../shared/types';

// Ticketmaster Discovery API v2. Everything here degrades quietly: without a
// key, or when the API is down or rate limited, search simply has no results
// from this source.
const ROOT = 'https://app.ticketmaster.com/discovery/v2';
export const TM_PREFIX = 'tm-';
// The API allows 5 requests a second and 5000 a day: a class all using the site at once must stay
// well inside that. Answers are cached fresh for these seconds, and kept a day longer as a
// fallback for when the API says no (rate limited or down).
const SEARCH_TTL = 900;
const EVENT_TTL = 1800;
const STALE_TTL = 86_400;
const RETRY_AFTER_MS = 700; // one more try after a rate limit; the limit is per second

export type SearchParams = {
  q?: string;
  type?: EventType;
  from?: string;
  to?: string;
  page?: number;
  near?: [number, number] | null; // only events around here, when set
};
const NEARBY_MILES = '75';

type TmEvent = {
  id?: string;
  name?: string;
  url?: string;
  info?: string;
  pleaseNote?: string;
  images?: { ratio?: string; url?: string; width?: number }[];
  dates?: { start?: { localDate?: string; localTime?: string } };
  classifications?: { segment?: { name?: string }; genre?: { name?: string }; subGenre?: { name?: string } }[];
  priceRanges?: { min?: number; max?: number }[];
  seatmap?: { staticUrl?: string };
  _embedded?: {
    venues?: { name?: string; city?: { name?: string }; location?: { latitude?: string; longitude?: string } }[];
    attractions?: { id?: string; name?: string }[];
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
  if (c?.genre?.name === 'Comedy' || c?.subGenre?.name === 'Comedy') return 'comedy';
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
  const lat = Number(venue?.location?.latitude ?? NaN);
  const lng = Number(venue?.location?.longitude ?? NaN);
  return {
    id: TM_PREFIX + e.id,
    name: e.name,
    type: typeOf(e),
    // Local date and time, so it reads as the venue's wall clock.
    startsAt: `${date}T${e.dates?.start?.localTime ?? '00:00:00'}Z`,
    venueName: venue?.name ?? 'Venue to be announced',
    city: venue?.city?.name ?? '',
    performerName: e._embedded?.attractions?.[0]?.name ?? e.name,
    performerId: e._embedded?.attractions?.[0]?.id ? TM_PREFIX + e._embedded.attractions[0].id : null,
    source: 'ticketmaster',
    imageUrl: imageOf(e),
    geo: Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null,
  };
}

// The API has no seat-level data, so each event gets a generated house shaped
// for its kind of event: [section, rows, seats per row], dearest first. Prices
// run from the top to the bottom of the event's price range when it has one.
const HOUSES: Record<EventType, [string, number, number][]> = {
  concert: [['Pit', 2, 10], ['Floor', 4, 16], ['Balcony', 4, 20]],
  sports: [['Courtside', 2, 12], ['Lower', 4, 18], ['Upper', 4, 22]],
  theater: [['Orchestra', 5, 14], ['Mezzanine', 3, 14], ['Balcony', 3, 12]],
  comedy: [['Front', 3, 10], ['Main', 5, 12]],
};

function generatedSeatMap(e: TmEvent): SeatMap {
  const range = e.priceRanges?.find((r) => r.min != null && r.max != null);
  const [high, low] = range ? [range.max! * 100, range.min! * 100] : [12000, 4500];
  const house = HOUSES[typeOf(e)];
  return buildSeatMap(
    house.map(([name, rows, perRow], i) => {
      const t = house.length === 1 ? 0 : i / (house.length - 1); // 0 at the front, 1 at the back
      const price = !range && house.length === 3 ? [12000, 7500, 4500][i] : high + (low - high) * t;
      return { name, rows, perRow, priceCents: Math.round(price) };
    }),
  );
}

async function cachedJson(url: URL, apiKey: string, ttl: number): Promise<Response> {
  // The cache keys leave the API key out.
  const query = `${url.pathname}?${url.searchParams}`;
  const cacheKey = new Request(`https://tm-cache.invalid${query}`);
  const staleKey = new Request(`https://tm-stale.invalid${query}`);
  const hit = await caches.default.match(cacheKey);
  if (hit) return hit;
  url.searchParams.set('apikey', apiKey);
  const get = () => fetch(url, { headers: { accept: 'application/json' } });
  let res: Response | null = null;
  try {
    res = await get();
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, RETRY_AFTER_MS));
      res = await get();
    }
  } catch {
    res = null; // unreachable: try the stale copy below
  }
  if (res?.ok) {
    for (const [key, age] of [[cacheKey, ttl], [staleKey, STALE_TTL]] as const) {
      const copy = new Response(res.clone().body, res);
      copy.headers.set('cache-control', `public, max-age=${age}`);
      await caches.default.put(key, copy);
    }
    return res;
  }
  // Rate limited or down: an older answer beats an empty page. A real 404 is passed on.
  if (res?.status !== 404) {
    const stale = await caches.default.match(staleKey);
    if (stale) return stale;
  }
  if (!res) throw new Error('Ticketmaster API unreachable');
  return res;
}

export async function tmSearch(
  apiKey: string | undefined,
  p: SearchParams,
): Promise<{ events: EventSummary[]; totalPages: number }> {
  const none = { events: [], totalPages: 1 };
  if (!apiKey) return none;
  const url = new URL(`${ROOT}/events.json`);
  // "Today" for a US audience: 12 hours behind UTC, so an evening show is still
  // today after midnight UTC.
  const today = new Date(Date.now() - 12 * 3_600_000).toISOString().slice(0, 10);
  if (p.q) url.searchParams.set('keyword', p.q);
  if (p.type) url.searchParams.set(...TYPE_FILTER[p.type]);
  // Filter on the event's local start. startDateTime also matches season passes
  // that began long before the range, which fill whole pages with junk.
  url.searchParams.set(
    'localStartDateTime',
    `${p.from ?? today}T00:00:00,${p.to ? `${p.to}T23:59:59` : '*'}`,
  );
  url.searchParams.set('countryCode', 'US');
  if (p.near) {
    // Rounded so visitors in one city share a cached answer.
    // Rounded to half a degree (about 50 km) so a whole area shares one cached answer; small
    // next to the 75-mile radius.
    url.searchParams.set('latlong', p.near.map((n) => (Math.round(n * 2) / 2).toFixed(1)).join(','));
    url.searchParams.set('radius', NEARBY_MILES);
    url.searchParams.set('unit', 'miles');
  }
  url.searchParams.set('size', String(PAGE_SIZE));
  url.searchParams.set('page', String(p.page ?? 0));
  // Best-known events first, as people expect from a ticket site; sorting by
  // date leads with restaurant offers and museum passes.
  url.searchParams.set('sort', 'relevance,desc');
  try {
    const res = await cachedJson(url, apiKey, SEARCH_TTL);
    if (!res.ok) return none;
    const data = (await res.json()) as {
      _embedded?: { events?: TmEvent[] };
      page?: { totalPages?: number };
    };
    // The API matches loosely: season passes that began before the range, and
    // types that only mention the word. Keep what was actually asked for.
    const first = p.from ?? today;
    const events = (data._embedded?.events ?? [])
      .map(toSummary)
      .filter((e) => e !== null)
      .filter((e) => {
        const day = e.startsAt.slice(0, 10);
        return day >= first && (!p.to || day <= p.to) && (!p.type || e.type === p.type);
      });
    return { events, totalPages: Math.min(Math.max(data.page?.totalPages ?? 1, 1), MAX_PAGES) };
  } catch {
    return none;
  }
}

// Search-as-you-type: Ticketmaster's suggest endpoint matches partial words ("mulan" finds
// Mulaney), which the keyword search above does not. Events only, mapped like search results;
// any failure gives none, so search simply works as before.
// ponytail: one call of up to SUGGEST_SIZE events, so a 28-date tour may show as fewer dates
// in the result card; its artist page still lists them all.
const SUGGEST_SIZE = '20';
export async function tmSuggest(apiKey: string | undefined, p: SearchParams): Promise<EventSummary[]> {
  if (!apiKey || !p.q) return [];
  const url = new URL(`${ROOT}/suggest`);
  url.searchParams.set('keyword', p.q);
  url.searchParams.set('countryCode', 'US');
  url.searchParams.set('resource', 'events');
  url.searchParams.set('size', SUGGEST_SIZE);
  try {
    const res = await cachedJson(url, apiKey, SEARCH_TTL);
    if (!res.ok) {
      console.warn(`suggest: Ticketmaster answered ${res.status}`);
      return [];
    }
    const data = (await res.json()) as { _embedded?: Record<string, TmEvent[]> };
    // ponytail: shape check while suggestions are new; drop once confirmed live
    console.log(`suggest: ${Object.entries(data._embedded ?? {}).map(([k, v]) => `${k}=${v.length}`).join(' ') || 'nothing'}`);
    const first = new Date(Date.now() - 12 * 3_600_000).toISOString().slice(0, 10);
    return (data._embedded?.events ?? [])
      .map(toSummary)
      .filter((e) => e !== null)
      .filter((e) => {
        const day = e.startsAt.slice(0, 10);
        return day >= (p.from ?? first) && (!p.to || day <= p.to) && (!p.type || e.type === p.type);
      });
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
    seatmapUrl: httpsOrNull(e.seatmap?.staticUrl),
  };
}

// Every upcoming US date for one attraction (performer, team, show), soonest
// first. null when there is no key or nothing is on sale.
export async function tmPerformerEvents(
  apiKey: string | undefined,
  performerId: string,
): Promise<{ name: string; events: EventSummary[] } | null> {
  const rawId = performerId.slice(TM_PREFIX.length);
  if (!apiKey || !/^[A-Za-z0-9_-]{1,64}$/.test(rawId)) return null;
  const url = new URL(`${ROOT}/events.json`);
  const today = new Date(Date.now() - 12 * 3_600_000).toISOString().slice(0, 10);
  url.searchParams.set('attractionId', rawId);
  url.searchParams.set('localStartDateTime', `${today}T00:00:00,*`);
  url.searchParams.set('countryCode', 'US');
  url.searchParams.set('size', '60');
  url.searchParams.set('sort', 'date,asc');
  const res = await cachedJson(url, apiKey, SEARCH_TTL);
  if (!res.ok) throw new Error(`Ticketmaster API responded ${res.status}`);
  const raw = ((await res.json()) as { _embedded?: { events?: TmEvent[] } })._embedded?.events ?? [];
  const name = raw.flatMap((e) => e._embedded?.attractions ?? []).find((a) => a.id === rawId)?.name;
  const events = raw
    .map(toSummary)
    .filter((e) => e !== null)
    // Headliner or support, every date here belongs on this performer's page.
    .map((e) => ({ ...e, performerId, performerName: name ?? e.performerName }))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return events.length ? { name: name ?? events[0].performerName, events } : null;
}
