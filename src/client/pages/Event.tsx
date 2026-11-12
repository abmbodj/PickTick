import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { NICKNAME_MAX } from '../../../shared/types';
import CheckoutPanel, { Notice } from '../components/CheckoutPanel';
import SeatMap from '../components/SeatMap';
import Stats from '../components/Stats';
import { ApiError, getEvent } from '../lib/api';
import { eventDay, eventTime } from '../lib/format';
import { useBooking } from '../lib/useBooking';

export default function Event() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const event = useQuery({ queryKey: ['event', id], queryFn: () => getEvent(id) });
  const nameInput = useRef<HTMLInputElement>(null);
  // The room connects after the event has loaded, so the identity cookie already exists.
  const { room, mine, left, notice, busy, paying, nickname, setNickname, heldSeats, onSeat, release, pay } =
    useBooking(id, event.data !== undefined, { onNeedName: () => nameInput.current?.focus() });

  const eventName = event.data?.name;
  useEffect(() => {
    if (eventName) document.title = `${eventName} · PickTick`;
  }, [eventName]);

  if (!event.data && event.isPending)
    return (
      <main className="animate-pulse py-8" aria-busy="true" aria-label="Loading event">
        <div className="h-8 w-2/3 rounded bg-surface" />
        <div className="mt-3 h-4 w-1/2 rounded bg-surface" />
        <div className="mt-6 h-72 rounded-lg bg-surface" />
      </main>
    );
  if (!event.data)
    return (
      <main className="py-16">
        <h1 className="text-2xl font-bold">
          {event.error instanceof ApiError && event.error.status === 404
            ? 'That event does not exist.'
            : 'The event could not be loaded.'}
        </h1>
        <div className="mt-4 flex gap-5">
          {!(event.error instanceof ApiError && event.error.status === 404) && (
            <button onClick={() => event.refetch()} className="link">
              Try again
            </button>
          )}
          <Link to="/events" className="link">
            Browse all events
          </Link>
        </div>
      </main>
    );

  const e = event.data;
  async function onPay() {
    const booking = await pay();
    if (booking) navigate(`/event/${id}/booking/${booking.id}`);
  }

  return (
    <main className="py-6 pb-10">
      <Link to="/events" className="text-sm link">
        All events
      </Link>
      <div className="rise mt-3 grid gap-5 sm:grid-cols-[auto_1fr] sm:items-center">
        {e.imageUrl && (
          <img
            src={e.imageUrl}
            alt=""
            className="aspect-video w-full rounded-lg object-cover sm:w-64"
          />
        )}
        <div>
          <h1 className="display text-2xl sm:text-4xl">{e.name}</h1>
          <p className="mt-2 text-muted">
            {eventDay(e.startsAt)} at {eventTime(e.startsAt)} · {e.venueName}
            {e.city && `, ${e.city}`}
          </p>
          {e.performerId && (
            <p className="mt-2 text-sm">
              <Link to={`/artist/${e.performerId}`} className="link">
                All dates for {e.performerName}
              </Link>
            </p>
          )}
          {e.externalUrl && (
            <p className="mt-2 text-sm">
              <a href={e.externalUrl} target="_blank" rel="noopener noreferrer" className="link">
                Buy real tickets for this event on Ticketmaster
              </a>
            </p>
          )}
        </div>
      </div>
      {e.description && <p className="mt-4 max-w-[65ch]">{e.description}</p>}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div>
          <label className="block max-w-xs">
            <span className="mb-1 block text-sm font-semibold">Your name, shown on seats you hold</span>
            <input
              ref={nameInput}
              className="field"
              placeholder="For example, Sam"
              value={nickname}
              maxLength={NICKNAME_MAX}
              autoComplete="nickname"
              onChange={(ev) => setNickname(ev.target.value)}
            />
          </label>

          <div className="mt-3 min-h-11" aria-live="assertive">
            <Notice notice={notice} />
          </div>

          <div className="mt-1">
            <SeatMap
              seatMap={e.seatMap}
              eventType={e.type}
              seats={room.state?.seats ?? {}}
              mine={mine}
              busy={busy}
              onSeat={onSeat}
            />
          </div>
          {e.source === 'ticketmaster' && (
            <p className="mt-2 max-w-[65ch] text-sm text-muted">
              This seat map and its prices are PickTick's own, not the venue's floor plan or Ticketmaster's prices.
            </p>
          )}
          {e.seatmapUrl && (
            <details className="mt-3">
              <summary className="link inline-flex min-h-11 cursor-pointer items-center">
                See the venue's real seating chart
              </summary>
              <img
                src={e.seatmapUrl}
                alt={`Seating chart for ${e.venueName}`}
                loading="lazy"
                className="mt-2 w-full max-w-xl rounded-lg bg-white p-2"
              />
            </details>
          )}
        </div>

        <aside className="flex flex-col gap-6">
          <CheckoutPanel seats={heldSeats} msLeft={left} paying={paying} onRelease={release} onPay={onPay} />
          <Stats stats={room.state?.stats ?? null} connected={room.connected} viewers={room.state?.viewers} />
          {e.performerBlurb && (
            <section>
              <h2 className="font-bold">{e.performerName}</h2>
              <p className="mt-1 text-sm text-muted">{e.performerBlurb}</p>
            </section>
          )}
        </aside>
      </div>
    </main>
  );
}
