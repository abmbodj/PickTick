import type { Booking, EventSummary } from '../../../shared/types';
import { eventDay, eventTime, money, seatLabel } from '../lib/format';

// The reservation, drawn as a ticket stub. It prints in from its top edge.
export default function TicketCard({ event: e, booking: b }: { event: EventSummary; booking: Booking }) {
  return (
    <article className="ticket-print w-full max-w-md rounded-lg border border-line bg-surface text-left">
      <div className="border-b border-dashed border-muted p-4">
        <h2 className="text-lg font-bold">{e.name}</h2>
        <p className="mt-1 text-sm text-muted">
          {eventDay(e.startsAt)} at {eventTime(e.startsAt)}
          <br />
          {e.venueName}
          {e.city && `, ${e.city}`}
        </p>
      </div>
      <ul className="stagger divide-y divide-line px-4 [--i:6]">
        {b.seatIds.map((seatId) => (
          <li key={seatId} className="py-3 font-semibold">
            {seatLabel(seatId)}
          </li>
        ))}
      </ul>
      <div className="flex items-baseline justify-between border-t border-line p-4">
        <span className="text-sm text-muted">Total</span>
        <span className="font-mono text-xl font-bold tabular-nums">{money(b.totalCents)}</span>
      </div>
    </article>
  );
}
