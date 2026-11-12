import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { getBooking, getEvent } from '../lib/api';
import TicketCard from '../components/TicketCard';

export default function Booking() {
  const { id = '', bookingId = '' } = useParams();
  const event = useQuery({ queryKey: ['event', id], queryFn: () => getEvent(id) });
  const booking = useQuery({
    queryKey: ['booking', id, bookingId],
    queryFn: () => getBooking(id, bookingId),
    retry: false,
  });

  if ((!event.data && event.isPending) || (!booking.data && booking.isPending))
    return (
      <main className="animate-pulse py-8" aria-busy="true" aria-label="Loading ticket">
        <div className="h-8 w-1/2 rounded bg-surface" />
        <div className="mt-6 h-40 max-w-md rounded-lg bg-surface" />
      </main>
    );
  if (!event.data || !booking.data)
    return (
      <main className="py-16">
        <h1 className="text-2xl font-bold">That ticket is not available.</h1>
        <p className="mt-2 max-w-[60ch] text-muted">
          Reservations can only be opened in the browser that made them.
        </p>
        <Link to="/events" className="mt-4 inline-block link">
          Browse all events
        </Link>
      </main>
    );

  const e = event.data;
  const b = booking.data;
  return (
    <main className="py-8">
      <h1 className="rise display text-3xl sm:text-4xl">You're in, {b.nickname}.</h1>
      <p className="rise mt-2 text-muted [--i:1]">
        {b.seatIds.length === 1 ? 'This seat is' : 'These seats are'} yours, and nobody else can book
        {b.seatIds.length === 1 ? ' it' : ' them'}.
      </p>

      <div className="mt-6">
        <TicketCard event={e} booking={b} />
      </div>

      <p className="mt-3 max-w-md text-sm text-muted">
        A reservation only. No payment was taken and no real ticket is issued.
      </p>

      <div className="mt-6 flex flex-wrap gap-5">
        <Link to="/tickets" className="link">
          My tickets
        </Link>
        <Link to={`/event/${id}`} className="link">
          Back to the seat map
        </Link>
        <Link to="/events" className="link">
          Browse all events
        </Link>
      </div>
    </main>
  );
}
