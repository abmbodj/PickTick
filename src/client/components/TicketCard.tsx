import type { Booking, EventSummary } from '../../../shared/types';
import { eventDay, eventTime, money, seatLabel } from '../lib/format';
import { LogoMark } from './Logo';

// The reservation as a real ticket: the event on the body, a tear-off stub with the admit count and total.
// The shape lives on an inner element so it doesn't fight ticket-print's clip-path.
export default function TicketCard({ event: e, booking: b }: { event: EventSummary; booking: Booking }) {
  const n = b.seatIds.length;
  return (
    <article className="ticket-print w-full max-w-md text-left">
      <div className="ticket flex rounded-lg bg-surface [--stub:7rem]">
        <div className="min-w-0 flex-1 p-4">
          <h2 className="text-lg leading-tight font-bold [overflow-wrap:anywhere]">{e.name}</h2>
          <p className="mt-1 text-sm text-muted">
            {eventDay(e.startsAt)} at {eventTime(e.startsAt)}
            <br />
            {e.venueName}
            {e.city && `, ${e.city}`}
          </p>
          <ul className="stagger mt-3 space-y-1 [--i:6]">
            {b.seatIds.map((seatId) => (
              <li key={seatId} className="font-semibold">
                {seatLabel(seatId)}
              </li>
            ))}
          </ul>
        </div>
        <div className="perforation flex w-28 shrink-0 flex-col justify-between rounded-r-lg bg-brand py-4 pr-4 text-on-brand">
          <LogoMark className="h-5 w-auto self-start [&_path:first-child]:fill-on-brand [&_path:last-child]:stroke-brand" />
          <div>
            <p className="text-xs font-bold tracking-wider uppercase">Admit {n}</p>
            <p className="font-mono text-xl font-bold tabular-nums">{money(b.totalCents)}</p>
          </div>
        </div>
      </div>
    </article>
  );
}
