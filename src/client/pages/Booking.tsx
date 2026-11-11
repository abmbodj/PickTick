import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { getBooking, getEvent } from '../lib/api';
import { eventDay, eventTime, money, seatLabel } from '../lib/format';

export default function Booking() {
  const { id = '', bookingId = '' } = useParams();
  const event = useQuery({ queryKey: ['event', id], queryFn: () => getEvent(id) });
  const booking = useQuery({
    queryKey: ['booking', id, bookingId],
    queryFn: () => getBooking(id, bookingId),
    retry: false,
  });

  if (event.isPending || booking.isPending)
    return (
      <main className="animate-pulse py-8" aria-busy="true" aria-label="Loading booking">
        <div className="h-8 w-1/2 rounded bg-surface" />
        <div className="mt-6 h-40 max-w-md rounded-lg bg-surface" />
      </main>
    );
  if (event.isError || booking.isError)
    return (
      <main className="py-16">
        <h1 className="text-2xl font-bold">That booking is not available.</h1>
        <p className="mt-2 max-w-[60ch] text-muted">
          Bookings can only be opened in the browser that made them, and a demo reset clears them all.
        </p>
        <Link to="/" className="mt-4 inline-block font-semibold text-accent underline">
          Browse all events
        </Link>
      </main>
    );

  const e = event.data;
  const b = booking.data;
  return (
    <main className="py-8">
      <h1 className="text-3xl font-extrabold tracking-tight">You're in, {b.nickname}.</h1>
      <p className="mt-2 text-muted">
        {b.seatIds.length === 1 ? 'This seat is' : 'These seats are'} yours, and nobody else can book
        {b.seatIds.length === 1 ? ' it' : ' them'}.
      </p>

      <article className="mt-6 max-w-md rounded-lg border border-ink">
        <div className="border-b border-dashed border-ink p-4">
          <h2 className="text-lg font-bold">{e.name}</h2>
          <p className="mt-1 text-sm text-muted">
            {eventDay(e.startsAt)} at {eventTime(e.startsAt)}
            <br />
            {e.venueName}, {e.city}
          </p>
        </div>
        <ul className="divide-y divide-line px-4">
          {b.seatIds.map((seatId) => (
            <li key={seatId} className="py-3 font-semibold">
              {seatLabel(seatId)}
            </li>
          ))}
        </ul>
        <div className="flex items-baseline justify-between border-t border-ink p-4">
          <span className="text-sm text-muted">Total (pretend payment)</span>
          <span className="font-mono text-xl font-bold tabular-nums">{money(b.totalCents)}</span>
        </div>
      </article>

      <div className="mt-6 flex flex-wrap gap-4">
        <Link to={`/event/${id}`} className="font-semibold text-accent underline">
          Back to the seat map
        </Link>
        <Link to="/" className="font-semibold text-accent underline">
          Browse all events
        </Link>
      </div>
    </main>
  );
}
