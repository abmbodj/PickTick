import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useDeferredValue, useState } from 'react';
import { Link } from 'react-router';
import { EVENT_TYPES } from '../../../shared/types';
import { searchEvents, type SearchFilters } from '../lib/api';
import { dayOfMonth, eventDay, eventTime, monthAbbrev } from '../lib/format';

const EMPTY: SearchFilters = { q: '', type: '', from: '', to: '' };
const field =
  'h-11 w-full rounded-md border border-line bg-bg px-3 text-base text-ink placeholder:text-muted';

export default function Home() {
  const [filters, setFilters] = useState(EMPTY);
  const deferred = useDeferredValue(filters);
  const set = (patch: Partial<SearchFilters>) => setFilters((f) => ({ ...f, ...patch }));
  const filtered = Object.values(filters).some(Boolean);

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['search', deferred],
    queryFn: () => searchEvents(deferred),
    placeholderData: keepPreviousData,
  });

  return (
    <main className="py-8">
      <h1 className="text-3xl font-extrabold tracking-tight">Find an event</h1>

      <form role="search" className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-[1fr_auto_auto]" onSubmit={(e) => e.preventDefault()}>
        <label className="col-span-2 block sm:col-span-1">
          <span className="mb-1 block text-sm font-semibold">Search</span>
          <input
            type="search"
            className={field}
            placeholder="Performer, event, venue or city"
            value={filters.q}
            maxLength={100}
            onChange={(e) => set({ q: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">From</span>
          <input type="date" className={field} value={filters.from} onChange={(e) => set({ from: e.target.value })} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">To</span>
          <input type="date" className={field} value={filters.to} onChange={(e) => set({ to: e.target.value })} />
        </label>
      </form>

      <fieldset className="mt-4">
        <legend className="sr-only">Event type</legend>
        <div className="flex flex-wrap gap-2">
          {(['', ...EVENT_TYPES] as const).map((t) => (
            <label
              key={t}
              className="cursor-pointer rounded-full border border-line px-4 py-2 text-sm font-semibold capitalize transition-colors duration-150 hover:bg-surface has-checked:border-ink has-checked:bg-ink has-checked:text-bg has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent"
            >
              <input
                type="radio"
                name="type"
                className="sr-only"
                checked={filters.type === t}
                onChange={() => set({ type: t })}
              />
              {t || 'All'}
            </label>
          ))}
        </div>
      </fieldset>

      <section aria-live="polite" aria-busy={isPending} className="mt-6 border-t border-line">
        {isPending && (
          <ul aria-label="Loading events">
            {[0, 1, 2, 3].map((i) => (
              <li key={i} className="flex animate-pulse gap-4 border-b border-line py-4">
                <div className="h-14 w-14 rounded-md bg-surface" />
                <div className="flex-1 space-y-2 py-1">
                  <div className="h-4 w-2/3 rounded bg-surface" />
                  <div className="h-3 w-1/2 rounded bg-surface" />
                </div>
              </li>
            ))}
          </ul>
        )}

        {isError && (
          <div className="py-10">
            <p className="font-semibold">Events could not be loaded.</p>
            <p className="mt-1 text-muted">{error.message}</p>
            <button
              onClick={() => refetch()}
              className="mt-4 h-11 rounded-md border border-ink px-4 font-semibold hover:bg-surface"
            >
              Try again
            </button>
          </div>
        )}

        {data?.length === 0 && (
          <div className="py-10">
            <p className="font-semibold">No events match that search.</p>
            <p className="mt-1 text-muted">Try a performer, a city, or a wider date range.</p>
            {filtered && (
              <button
                onClick={() => setFilters(EMPTY)}
                className="mt-4 h-11 rounded-md border border-ink px-4 font-semibold hover:bg-surface"
              >
                Clear search and filters
              </button>
            )}
          </div>
        )}

        {data && data.length > 0 && (
          <ul>
            {data.map((e) => (
              <li key={e.id} className="border-b border-line">
                <Link
                  to={`/event/${e.id}`}
                  className="-mx-2 flex items-center gap-4 rounded-md px-2 py-4 transition-colors duration-150 hover:bg-surface"
                >
                  <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-md bg-ink text-bg" aria-hidden="true">
                    <span className="text-xs font-semibold uppercase">{monthAbbrev(e.startsAt)}</span>
                    <span className="text-xl leading-none font-extrabold tabular-nums">{dayOfMonth(e.startsAt)}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-bold">{e.name}</h2>
                    <p className="text-sm text-muted">
                      <span className="sr-only">{eventDay(e.startsAt)}, </span>
                      {eventTime(e.startsAt)} · {e.venueName}, {e.city}
                    </p>
                  </div>
                  <span className="hidden rounded-full border border-line px-3 py-1 text-xs font-semibold capitalize sm:block">
                    {e.type}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
