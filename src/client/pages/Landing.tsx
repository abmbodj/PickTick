import { useQueries, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { container } from '../App';
import GroupCard, { GroupGridSkeleton, groupGrid } from '../components/GroupCard';
import { LogoMark } from '../components/Logo';
import { searchEvents } from '../lib/api';
import type { EventType } from '../../../shared/types';

// Decorative: a block of seats being taken, on a loop. Same order every render.
function HeroSeats() {
  const cols = 14;
  const rows = 7;
  return (
    <svg viewBox={`0 0 ${cols} ${rows}`} className="w-full" aria-hidden="true">
      {Array.from({ length: cols * rows }, (_, i) => {
        const x = i % cols;
        const y = Math.floor(i / cols);
        const n = (i * 7919 + y * 104729) % 97; // fixed scatter
        const taken = n < 46;
        return (
          <rect
            key={i}
            x={x + 0.12}
            y={y + 0.12}
            width={0.76}
            height={0.76}
            rx={0.16}
            stroke="var(--color-ink)"
            strokeWidth={0.07}
            className={taken ? 'hero-seat' : undefined}
            data-taken={taken || undefined}
            fill="transparent"
            style={taken ? { animationDelay: `-${(n * 0.19).toFixed(2)}s` } : undefined}
          />
        );
      })}
    </svg>
  );
}

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
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const trending = useQuery({ queryKey: ['search', {}, 0], queryFn: () => searchEvents({}) });
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
      <section className="relative bg-[linear-gradient(180deg,var(--color-bg),var(--color-velvet)_70%)]">
        {/* Blurs the hero's bottom edge into the page instead of ending on a hard line. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-x-16 -bottom-20 h-40 bg-[linear-gradient(180deg,var(--color-velvet),var(--color-bg))] blur-2xl"
        />
        <div className={`${container} relative flex flex-col items-center gap-10 py-14 sm:gap-12 sm:py-20`}>
          <h1 className="flex items-center gap-[0.3em] text-[clamp(2.5rem,9vw,5rem)]">
            <LogoMark className="h-[0.95em] w-auto" />
            <span className="display">PickTick</span>
            <span className="sr-only">: live seats for concerts, games and shows</span>
          </h1>
          <div className="w-full max-w-md">
            <HeroSeats />
          </div>
          <form
            role="search"
            className="flex w-full max-w-xl flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              navigate(q.trim() ? `/events?q=${encodeURIComponent(q.trim())}` : '/events');
            }}
          >
            <label className="flex-1">
              <span className="sr-only">Search events</span>
              <input
                type="search"
                value={q}
                maxLength={100}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Artist, team, venue or city"
                className="h-13 w-full rounded-md border-2 border-ink bg-bg px-4 text-base text-ink placeholder:text-muted"
              />
            </label>
            <button className="btn-primary h-13">Find events</button>
          </form>
        </div>
      </section>

      <section className={`${container} relative py-12 sm:py-16`}>
        <div className="flex items-end justify-between gap-4">
          <h2 className="display text-3xl sm:text-4xl">Trending</h2>
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
          <section key={type} className={`${container} relative pb-12 sm:pb-16`}>
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
        <div className={`${container} py-12 sm:py-16`}>
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
    </main>
  );
}
