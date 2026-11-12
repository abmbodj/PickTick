import { Link } from 'react-router';
import type { EventGroup } from '../../../shared/types';
import { eventDay, eventTime, shortDay } from '../lib/format';
import EventThumb from './EventThumb';

// One performer or one event. Several dates show as a stack of cards and lead
// to the performer's page; a single date leads straight to its seat map.
export default function GroupCard({ group: g }: { group: EventGroup }) {
  const many = g.eventCount > 1 && g.performerId !== null;
  const extraCities = g.cities.length - 1;
  const badge = many && (
    <span className="mb-2 inline-block rounded-full bg-brand px-2.5 py-0.5 text-xs font-bold text-on-brand">
      {g.eventCount} dates
    </span>
  );
  const title = <h3 className="display line-clamp-2 text-xl">{g.name}</h3>;

  return (
    <Link
      to={many ? `/artist/${g.performerId}` : `/event/${g.firstEventId}`}
      className="stack relative block rounded-xl"
    >
      {many && (
        <>
          <span className="stack-card stack-a" aria-hidden="true" />
          <span className="stack-card stack-b" aria-hidden="true" />
        </>
      )}
      <article className="stack-top relative flex h-full flex-col overflow-hidden rounded-xl border border-line bg-surface">
        {/* overflow-hidden clips the hover zoom, so the picture never shows below its fade. */}
        {g.imageUrl ? (
          <div className="relative aspect-[4/3] overflow-hidden">
            <img src={g.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
            <div className="image-blur" />
            <div className="image-fade" />
            <div className="absolute inset-x-0 bottom-0 px-4 pb-1">
              {badge}
              {title}
            </div>
          </div>
        ) : (
          <>
            <EventThumb imageUrl={null} startsAt={g.nextStartsAt} type={g.type} className="aspect-[2/1] w-full rounded-none" />
            <div className="px-4 pt-4">
              {badge}
              {title}
            </div>
          </>
        )}
        <p className="px-4 pt-2 pb-4 text-sm text-muted">
          {many ? (
            <>
              Next {shortDay(g.nextStartsAt)}
              {g.cities[0] && ` · ${g.cities[0]}`}
              {extraCities > 0 && ` + ${extraCities} more ${extraCities === 1 ? 'city' : 'cities'}`}
            </>
          ) : (
            <>
              {eventDay(g.nextStartsAt)} at {eventTime(g.nextStartsAt)}
              <br />
              {g.venueName}
              {g.cities[0] && `, ${g.cities[0]}`}
            </>
          )}
        </p>
      </article>
    </Link>
  );
}

export const groupGrid = 'stagger grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-x-7 gap-y-10';

export function GroupGridSkeleton({ count }: { count: number }) {
  return (
    <ul className={`${groupGrid} animate-pulse`} aria-label="Loading events">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="overflow-hidden rounded-xl border border-line">
          <div className="aspect-[4/3] bg-surface" />
          <div className="m-4 h-4 w-2/3 rounded bg-surface" />
        </li>
      ))}
    </ul>
  );
}
