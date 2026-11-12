import { useQueries, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { container } from '../App';
import GroupCard, { GroupGridSkeleton, groupGrid } from '../components/GroupCard';
import HeroBooking from '../components/HeroBooking';
import { searchEvents } from '../lib/api';
import type { EventType } from '../../../shared/types';

const ROWS: [EventType, string][] = [
  ['concert', 'Concerts'],
  ['sports', 'Sports'],
  ['theater', 'Theatre'],
  ['comedy', 'Comedy'],
];

const STEPS = [
  ['Tap a seat', 'The seat map is live. You see every seat the moment someone else takes it.'],
  ['It is yours for two minutes', 'Nobody can take a seat you are holding. Add up to four.'],
  ['Reserve it', 'Confirm before the clock runs out and the seats are yours for good.'],
];

export default function Landing() {
  // Events around the visitor; the server falls back to the usual list when it can't tell where they are.
  const trending = useQuery({ queryKey: ['search', { nearby: '1' }, 0], queryFn: () => searchEvents({ nearby: '1' }) });
  const byType = useQueries({
    queries: ROWS.map(([type]) => ({
      queryKey: ['search', { type }, 0],
      queryFn: () => searchEvents({ type }),
    })),
  });
  // Pictures first, eight across the top; the rows below never repeat them.
  const top = [...(trending.data?.groups ?? [])]
    .sort((a, b) => Number(Boolean(b.imageUrl)) - Number(Boolean(a.imageUrl)))
    .slice(0, 8);
  const shown = new Set(top.map((g) => g.key));

  return (
    <main className="overflow-x-clip">
      <HeroBooking />

      {/* Steps back while the hero is being used to book. */}
      <div className="after-hero">
      <section className={`${container} relative py-12 sm:py-16`}>
        <div className="rise flex items-end justify-between gap-4 [--i:4]">
          <h2 className="display text-3xl sm:text-4xl">{trending.data && !trending.data.nearby ? 'Trending' : 'Near you'}</h2>
          <Link to="/events" className="link shrink-0">
            See all events
          </Link>
        </div>
        <div className="mt-8">
          {trending.isPending && <GroupGridSkeleton count={4} />}
          {trending.isError && (
            <p>
              Events could not be loaded.{' '}
              <button onClick={() => trending.refetch()} className="link">
                Try again
              </button>
            </p>
          )}
          {trending.data && (
            <ul className={groupGrid}>
              {top.map((g) => (
                <li key={g.key}>
                  <GroupCard group={g} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {ROWS.map(([type, heading], i) => {
        const groups = (byType[i].data?.groups ?? []).filter((g) => !shown.has(g.key)).slice(0, 4);
        if (groups.length === 0) return null;
        return (
          <section key={type} className={`${container} reveal relative pb-12 sm:pb-16`}>
            <div className="flex items-end justify-between gap-4">
              <h2 className="display text-2xl sm:text-3xl">{heading}</h2>
              <Link to={`/events?type=${type}`} className="link shrink-0">
                See all {heading.toLowerCase()}
              </Link>
            </div>
            <ul className={`${groupGrid} mt-8`}>
              {groups.map((g) => (
                <li key={g.key}>
                  <GroupCard group={g} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <section className="border-y border-line bg-surface">
        <div className={`${container} reveal py-12 sm:py-16`}>
          <h2 className="display text-3xl sm:text-4xl">How a seat becomes yours</h2>
          <ol className="mt-8 grid gap-8 sm:grid-cols-3">
            {STEPS.map(([title, body], i) => (
              <li key={title}>
                <span className="display text-5xl text-brand" aria-hidden="true">
                  {i + 1}
                </span>
                <h3 className="mt-2 text-xl font-bold">{title}</h3>
                <p className="mt-2 max-w-[34ch] leading-relaxed text-muted">{body}</p>
              </li>
            ))}
          </ol>
          <Link
            to="/events"
            className="btn-primary mt-10"
          >
            Browse events
          </Link>
        </div>
      </section>
      </div>
    </main>
  );
}
