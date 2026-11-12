import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { getBooking, getEvent } from '../lib/api';
import CancelTicket from '../components/CancelTicket';
import TicketCard from '../components/TicketCard';

export default function Booking() {
  const { id = '', bookingId = '' } = useParams();
  const event = useQuery({ queryKey: ['event', id], queryFn: () => getEvent(id) });
  const [cancelled, setCancelled] = useState(false);
  // Once cancelled, stop asking for it: the server would answer 404.
  const booking = useQuery({
    queryKey: ['booking', id, bookingId],
    queryFn: () => getBooking(id, bookingId),
    retry: false,
    enabled: !cancelled,
  });

  if (cancelled)
    return (
      <main className="flex flex-col items-center py-10 text-center sm:py-16">
        <h1 className="rise display text-3xl sm:text-5xl">Ticket cancelled.</h1>
        <p className="rise mt-2 text-muted [--i:1]">Those seats are back on sale.</p>
        <div className="rise mt-6 flex flex-wrap justify-center gap-5 [--i:2]">
          <Link to={`/event/${id}`} className="link">
            Back to the seat map
          </Link>
          <Link to="/tickets" className="link">
            My tickets
          </Link>
        </div>
      </main>
    );

  if ((!event.data && event.isPending) || (!booking.data && booking.isPending))
    return (
      <main className="animate-pulse py-8" aria-busy="true" aria-label="Loading ticket">
        <div className="h-8 w-1/2 rounded bg-surface" />
        <div className="mx-auto mt-10 h-48 max-w-xl rounded-lg bg-surface" />
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
    <main className="flex flex-col items-center py-10 text-center sm:py-16">
      <h1 className="rise display text-3xl sm:text-5xl">You're in, {b.nickname}.</h1>
      <p className="rise mt-2 text-muted [--i:1]">
        {b.seatIds.length === 1 ? 'This seat is' : 'These seats are'} yours, and nobody else can book
        {b.seatIds.length === 1 ? ' it' : ' them'}.
      </p>

      <div className="mt-10 flex w-full justify-center">
        <TicketCard event={e} booking={b} large />
      </div>

      <div className="mt-10">
        <CancelTicket eventId={id} bookingId={b.id} seats={b.seatIds.length} onDone={() => setCancelled(true)} />
      </div>

      <div className="mt-6 flex flex-wrap justify-center gap-5">
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
