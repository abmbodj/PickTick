import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Link, useParams } from 'react-router';
import { ApiError, getPerformer } from '../lib/api';
import { dayOfMonth, eventTime, monthAbbrev, weekdayOf } from '../lib/format';

// Every date for one performer, team or show.
export default function Artist() {
  const { id = '' } = useParams();
  const q = useQuery({ queryKey: ['performer', id], queryFn: () => getPerformer(id) });
  const name = q.data?.name;
  useEffect(() => {
    if (name) document.title = `${name} · PickTick`;
  }, [name]);

  if (!q.data && q.isPending)
    return (
      <main className="animate-pulse py-6" aria-busy="true" aria-label="Loading dates">
        <div className="aspect-[4/3] rounded-xl bg-surface sm:aspect-[21/9]" />
        <div className="mt-6 h-20 rounded-lg bg-surface" />
        <div className="mt-3 h-20 rounded-lg bg-surface" />
      </main>
    );
  if (!q.data) {
    const missing = q.error instanceof ApiError && q.error.status === 404;
    return (
      <main className="py-16">
        <h1 className="text-2xl font-bold">
          {missing ? 'Nothing is on sale for this performer right now.' : 'These dates could not be loaded.'}
        </h1>
        <div className="mt-4 flex gap-5">
          {!missing && (
            <button onClick={() => q.refetch()} className="link">
              Try again
            </button>
          )}
          <Link to="/events" className="link">
            Browse all events
          </Link>
        </div>
      </main>
    );
  }

  const p = q.data;
  return (
    <main className="py-6">
      <Link to="/events" className="link text-sm">
        All events
      </Link>

      <header
        className={`rise relative mt-3 flex items-end overflow-hidden rounded-xl bg-[linear-gradient(160deg,var(--color-velvet),var(--color-bg))] [--fade-to:var(--color-bg)] ${
          p.imageUrl ? 'aspect-[4/3] sm:aspect-[21/9]' : 'pt-16 sm:pt-24'
        }`}
      >
        {p.imageUrl && (
          <>
            <img src={p.imageUrl} alt="" className="settle absolute inset-0 h-full w-full object-cover object-[center_25%]" />
            <div className="image-blur" />
            <div className="image-fade" />
          </>
        )}
        <div className="relative p-5 sm:p-8">
          <h1 className="display text-[clamp(2rem,6vw,4rem)]">{p.name}</h1>
          <p className="mt-2 font-semibold">
            {p.events.length} {p.events.length === 1 ? 'date' : 'dates'} on sale
          </p>
        </div>
      </header>

      {p.blurb && <p className="mt-5 max-w-[65ch] text-muted">{p.blurb}</p>}

      <ul className="stagger mt-6 border-t border-line">
        {p.events.map((e) => (
          <li key={e.id} className="border-b border-line">
            <Link
              to={`/event/${e.id}`}
              className="group -mx-2 flex items-center gap-4 rounded-md px-2 py-4 transition-colors duration-150 hover:bg-surface"
            >
              <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-md bg-surface ring-1 ring-line ring-inset" aria-hidden="true">
                <span className="text-xs font-semibold uppercase">{monthAbbrev(e.startsAt)}</span>
                <span className="display text-2xl tabular-nums">{dayOfMonth(e.startsAt)}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-muted">
                  {weekdayOf(e.startsAt)} · {eventTime(e.startsAt)}
                </p>
                <h2 className="font-bold [overflow-wrap:anywhere]">
                  {e.city || e.venueName}
                  <span className="sr-only">, {monthAbbrev(e.startsAt)} {dayOfMonth(e.startsAt)}</span>
                </h2>
                <p className="text-sm text-muted [overflow-wrap:anywhere]">
                  {e.venueName}
                  {e.name !== p.name && ` · ${e.name}`}
                </p>
              </div>
              <span className="btn-secondary hidden shrink-0 group-hover:border-ink group-hover:bg-ink group-hover:text-bg sm:inline-flex">Pick seats</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
