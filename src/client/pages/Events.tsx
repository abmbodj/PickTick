import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { EVENT_TYPES, type EventType } from '../../../shared/types';
import { searchEvents, type SearchFilters } from '../lib/api';
import GroupCard, { GroupGridSkeleton, groupGrid } from '../components/GroupCard';
import { useDebounced } from '../lib/useDebounced';

const EMPTY: SearchFilters = { q: '', type: '', from: '', to: '' };
const field = 'field';

export default function Events() {
  const [params] = useSearchParams();
  const [filters, setFilters] = useState<SearchFilters>(() => {
    const type = params.get('type') ?? '';
    return {
      ...EMPTY,
      q: params.get('q') ?? '',
      type: (EVENT_TYPES as readonly string[]).includes(type) ? (type as EventType) : '',
    };
  });
  const [page, setPage] = useState(0);
  const deferred = useDebounced(filters, 300);
  const results = useRef<HTMLElement>(null);
  // Any change to the search starts again from the first page.
  const change = (next: SearchFilters) => {
    setFilters(next);
    setPage(0);
  };
  const set = (patch: Partial<SearchFilters>) => change({ ...filters, ...patch });
  const goTo = (next: number) => {
    setPage(next);
    results.current?.scrollIntoView({ block: 'start' });
  };
  const filtered = Object.values(filters).some(Boolean);

  const { data: result, isPending, isError, error, refetch, isPlaceholderData } = useQuery({
    queryKey: ['search', deferred, page],
    queryFn: () => searchEvents(deferred, page),
    placeholderData: keepPreviousData,
  });

  const data = result?.groups;
  const totalPages = result?.totalPages ?? 1;

  return (
    <main className="overflow-x-clip py-8">
      <h1 className="rise display text-3xl sm:text-4xl">Find an event</h1>

      <form role="search" className="rise mt-5 grid [--i:1] grid-cols-2 gap-3 sm:grid-cols-[1fr_auto_auto]" onSubmit={(e) => e.preventDefault()}>
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

      <fieldset className="rise mt-4 [--i:2]">
        <legend className="sr-only">Event type</legend>
        <div className="flex flex-wrap gap-2">
          {(['', ...EVENT_TYPES] as const).map((t) => (
            <label
              key={t}
              className="chip inline-flex min-h-11 cursor-pointer items-center rounded-full border border-line px-4 text-sm font-semibold capitalize hover:border-muted hover:bg-surface has-checked:border-ink has-checked:bg-ink has-checked:text-bg has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent"
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

      <section
        ref={results}
        aria-live="polite"
        aria-busy={isPending || isPlaceholderData}
        className="mt-6 scroll-mt-4 border-t border-line"
      >
        {isPending && (
          <div className="pt-8">
            <GroupGridSkeleton count={8} />
          </div>
        )}

        {isError && (
          <div className="py-10">
            <p className="font-semibold">Events could not be loaded.</p>
            <p className="mt-1 text-muted">{error.message}</p>
            <button
              onClick={() => refetch()}
              className="mt-4 btn-secondary"
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
                onClick={() => change(EMPTY)}
                className="mt-4 btn-secondary"
              >
                Clear search and filters
              </button>
            )}
          </div>
        )}

        {data && data.length > 0 && (
          <ul className={`${groupGrid} pt-8`}>
            {data.map((g) => (
              <li key={g.key}>
                <GroupCard group={g} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {data && totalPages > 1 && (
        <nav aria-label="Pages" className="mt-6 flex items-center justify-between gap-4">
          <button
            onClick={() => goTo(page - 1)}
            disabled={page === 0}
            className="btn-secondary"
          >
            Previous
          </button>
          <p className="text-sm tabular-nums" aria-live="polite">
            Page <span className="font-bold">{page + 1}</span> of {totalPages}
          </p>
          <button
            onClick={() => goTo(page + 1)}
            disabled={page + 1 >= totalPages}
            className="btn-secondary"
          >
            Next
          </button>
        </nav>
      )}
    </main>
  );
}
