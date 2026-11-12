import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import EventThumb from '../components/EventThumb';
import { getTickets } from '../lib/api';
import { eventDay, eventTime, money, seatLabel } from '../lib/format';

export default function Tickets() {
  const tickets = useQuery({ queryKey: ['tickets'], queryFn: getTickets, staleTime: 0 });

  return (
    <main className="py-8">
      <h1 className="rise display text-3xl sm:text-4xl">My tickets</h1>
      <p className="mt-2 max-w-[65ch] text-muted">
        Reservations made in this browser. They are tied to a cookie, so clearing cookies or switching
        devices leaves them behind.
      </p>

      <section aria-live="polite" aria-busy={tickets.isPending} className="mt-6">
        {tickets.isPending && (
          <ul className="animate-pulse space-y-4" aria-label="Loading tickets">
            {[0, 1].map((i) => (
              <li key={i} className="h-28 rounded-lg bg-surface" />
            ))}
          </ul>
        )}

        {tickets.isError && (
          <div>
            <p className="font-semibold">Your tickets could not be loaded.</p>
            <button
              onClick={() => tickets.refetch()}
              className="mt-3 btn-secondary"
            >
              Try again
            </button>
          </div>
        )}

        {tickets.data?.length === 0 && (
          <div className="rise rounded-lg border border-dashed border-muted p-8">
            <p className="text-lg font-bold">No tickets yet.</p>
            <p className="mt-1 text-muted">Pick an event, hold a seat and reserve it. It will show up here.</p>
            <Link
              to="/events"
              className="btn-primary mt-5"
            >
              Find an event
            </Link>
          </div>
        )}

        {tickets.data && tickets.data.length > 0 && (
          <ul className="stagger space-y-4">
            {tickets.data.map((t) => (
              <li key={t.bookingId} className="flex overflow-hidden rounded-lg border border-line bg-surface">
                <EventThumb imageUrl={t.imageUrl} startsAt={t.startsAt} className="hidden w-40 self-stretch rounded-none sm:block" />
                <div className="min-w-0 flex-1 p-4">
                  <h2 className="text-lg font-bold [overflow-wrap:anywhere]">
                    <Link to={`/event/${t.eventId}`} className="hover:underline">
                      {t.eventName}
                    </Link>
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    {eventDay(t.startsAt)} at {eventTime(t.startsAt)} · {t.venueName}
                    {t.city && `, ${t.city}`}
                  </p>
                  <ul className="mt-3 flex flex-wrap gap-2 text-sm font-semibold">
                    {t.seatIds.map((s) => (
                      <li key={s} className="rounded-md border border-line bg-bg px-2 py-1">
                        {seatLabel(s)}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex flex-col items-end justify-between border-l border-dashed border-muted p-4">
                  <span className="font-mono text-lg font-bold tabular-nums">{money(t.totalCents)}</span>
                  <Link
                    to={`/event/${t.eventId}/booking/${t.bookingId}`}
                    className="text-sm link"
                  >
                    View ticket
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
