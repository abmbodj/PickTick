import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { container } from '../App';
import EventThumb from '../components/EventThumb';
import { searchEvents } from '../lib/api';
import { eventDay, eventTime } from '../lib/format';

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
            style={taken ? { animationDelay: `${(n * 0.19).toFixed(2)}s` } : undefined}
          />
        );
      })}
    </svg>
  );
}

const STEPS = [
  ['Tap a seat', 'The seat map is live. You see every seat the moment someone else takes it.'],
  ['It is yours for two minutes', 'Nobody can take a seat you are holding. Add up to four.'],
  ['Reserve it', 'Confirm before the clock runs out and the seats are yours for good.'],
];

export default function Landing() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const upcoming = useQuery({
    queryKey: ['search', { q: '', type: '', from: '', to: '' }],
    queryFn: () => searchEvents({ q: '', type: '', from: '', to: '' }),
  });
  // Lead with events that have a picture, then fill with the soonest.
  const featured = [...(upcoming.data ?? [])]
    .sort((a, b) => Number(Boolean(b.imageUrl)) - Number(Boolean(a.imageUrl)))
    .slice(0, 6);

  return (
    <main>
      <section className="bg-brand">
        <div className={`${container} grid items-center gap-10 py-12 sm:py-20 lg:grid-cols-[1.1fr_1fr]`}>
          <div>
            <h1 className="display text-[clamp(2.5rem,7vw,5rem)]">Good seats go fast. Be faster.</h1>
            <p className="mt-5 max-w-[46ch] text-lg">
              Find concerts, games and shows, watch the seat map change live, and hold your seats for two
              minutes while you decide.
            </p>
            <form
              role="search"
              className="mt-7 flex max-w-xl flex-col gap-2 sm:flex-row"
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
                  className="h-13 w-full rounded-md border-2 border-ink bg-bg px-4 text-base placeholder:text-muted"
                />
              </label>
              <button className="h-13 rounded-md bg-ink px-6 text-base font-bold text-bg transition-opacity duration-150 hover:opacity-85">
                Find events
              </button>
            </form>
          </div>
          <div className="mx-auto w-full max-w-md lg:max-w-none">
            <HeroSeats />
          </div>
        </div>
      </section>

      <section className={`${container} py-12 sm:py-16`}>
        <div className="flex items-end justify-between gap-4">
          <h2 className="display text-3xl sm:text-4xl">Coming up</h2>
          <Link to="/events" className="shrink-0 font-semibold text-accent underline">
            See all events
          </Link>
        </div>

        {upcoming.isPending && (
          <ul className="mt-6 grid animate-pulse grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-6" aria-label="Loading events">
            {[0, 1, 2].map((i) => (
              <li key={i}>
                <div className="aspect-video rounded-md bg-surface" />
                <div className="mt-3 h-4 w-2/3 rounded bg-surface" />
              </li>
            ))}
          </ul>
        )}
        {upcoming.isError && (
          <p className="mt-6">
            Events could not be loaded.{' '}
            <button onClick={() => upcoming.refetch()} className="font-semibold text-accent underline">
              Try again
            </button>
          </p>
        )}
        {upcoming.data && (
          <ul className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-x-6 gap-y-8">
            {featured.map((e) => (
              <li key={e.id}>
                <Link to={`/event/${e.id}`} className="group block rounded-md">
                  <EventThumb imageUrl={e.imageUrl} startsAt={e.startsAt} type={e.type} className="aspect-video w-full" />
                  <h3 className="mt-3 text-lg leading-snug font-bold group-hover:underline">{e.name}</h3>
                  <p className="mt-1 text-sm text-muted">
                    {eventDay(e.startsAt)} at {eventTime(e.startsAt)}
                    <br />
                    {e.venueName}
                    {e.city && `, ${e.city}`}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="bg-ink text-bg">
        <div className={`${container} py-12 sm:py-16`}>
          <h2 className="display text-3xl sm:text-4xl">How a seat becomes yours</h2>
          <ol className="mt-8 grid gap-8 sm:grid-cols-3">
            {STEPS.map(([title, body], i) => (
              <li key={title}>
                <span className="display text-5xl text-brand" aria-hidden="true">
                  {i + 1}
                </span>
                <h3 className="mt-2 text-xl font-bold">{title}</h3>
                <p className="mt-2 max-w-[34ch] leading-relaxed text-bg/85">{body}</p>
              </li>
            ))}
          </ol>
          <Link
            to="/events"
            className="mt-10 inline-flex h-13 items-center rounded-md bg-brand px-6 font-bold text-ink transition-colors duration-150 hover:bg-brand-strong"
          >
            Browse events
          </Link>
        </div>
      </section>
    </main>
  );
}
