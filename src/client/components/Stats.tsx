import type { Stats as StatsData } from '../../../shared/types';

const LABELS: [keyof StatsData, string][] = [
  ['granted', 'Holds granted'],
  ['rejected', 'Conflicts rejected'],
  ['expired', 'Holds expired'],
  ['sold', 'Seats sold'],
];

// Who else has this event open right now, counted by the event's room. Nothing until it knows.
export function Viewers({ count, className = '' }: { count: number | null | undefined; className?: string }) {
  if (!count) return null;
  return (
    <p className={`text-sm text-muted ${className}`}>
      {count === 1 ? 'Just you here right now' : `You and ${count - 1} ${count === 2 ? 'other' : 'others'} here right now`}
    </p>
  );
}

// Live counters straight from the event's Durable Object.
export default function Stats({
  stats,
  connected,
  viewers,
}: {
  stats: StatsData | null;
  connected: boolean;
  viewers?: number | null;
}) {
  return (
    <section aria-label="Live counters">
      <div className="flex items-center justify-between">
        <h2 className="font-bold">Live seat activity</h2>
        <span className="flex items-center gap-2 text-sm font-semibold" role="status">
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full ${connected ? 'bg-accent' : 'animate-pulse bg-danger'}`}
            aria-hidden="true"
          />
          {connected ? 'Live' : 'Reconnecting'}
        </span>
      </div>
      {connected && <Viewers count={viewers} className="mt-1" />}
      <dl className="mt-2 grid grid-cols-2 gap-x-4 border-t border-line sm:grid-cols-4 lg:grid-cols-2">
        {LABELS.map(([key, label]) => (
          <div key={key} className="flex items-baseline justify-between gap-2 border-b border-line py-2">
            <dt className="text-sm text-muted">{label}</dt>
            {/* The key restarts the flash each time the number changes. */}
            <dd key={stats?.[key]} className="bump rounded px-1.5 font-mono text-lg font-bold tabular-nums">
              {stats ? stats[key] : '–'}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-sm text-muted">
        When two people tap the same seat, only the first gets it.
      </p>
    </section>
  );
}
