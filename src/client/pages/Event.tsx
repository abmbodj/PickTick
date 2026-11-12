import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { MAX_HOLDS, NICKNAME_MAX } from '../../../shared/types';
import CheckoutPanel from '../components/CheckoutPanel';
import SeatMap from '../components/SeatMap';
import Stats from '../components/Stats';
import { ApiError, getEvent, holdSeat, payForHolds, releaseSeat } from '../lib/api';
import { eventDay, eventTime } from '../lib/format';
import { msLeft } from '../lib/room';
import { useEventRoom } from '../lib/useEventRoom';

const NAME_KEY = 'picktick.nickname';
type Notice = { kind: 'error' | 'info'; text: string };

function useNow(active: boolean): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

export default function Event() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const event = useQuery({ queryKey: ['event', id], queryFn: () => getEvent(id) });
  // Connect after the event has loaded, so the identity cookie already exists.
  const room = useEventRoom(id, event.data !== undefined);

  const [nickname, setNickname] = useState(() => localStorage.getItem(NAME_KEY) ?? '');
  const nameInput = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  // One id per checkout, so a double tap on Pay cannot create two bookings.
  const bookingId = useRef(crypto.randomUUID());

  const mine = room.state?.mine.seatIds ?? [];
  const now = useNow(mine.length > 0);
  const left = room.state ? msLeft(room.state, now) : null;

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  // The hold can run out two ways: this device's countdown reaches zero, or the
  // server takes the seats back first. Either way, say what happened.
  const EXPIRED: Notice = {
    kind: 'error',
    text: 'Your hold ran out, so those seats are back on sale. Pick again.',
  };
  useEffect(() => {
    if (left !== 0 || mine.length === 0) return;
    room.released(mine);
    setNotice(EXPIRED);
  }, [left]); // eslint-disable-line react-hooks/exhaustive-deps
  const expiredAt = room.state?.expiredAt ?? null;
  useEffect(() => {
    if (expiredAt !== null) setNotice(EXPIRED);
  }, [expiredAt]); // eslint-disable-line react-hooks/exhaustive-deps

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
            <button onClick={() => event.refetch()} className="font-semibold text-accent underline">
              Try again
            </button>
          )}
          <Link to="/events" className="font-semibold text-accent underline">
            Browse all events
          </Link>
        </div>
      </main>
    );

  const e = event.data;
  const name = nickname.trim();

  async function onSeat(seatId: string) {
    if (busy) return;
    if (!room.state) {
      setNotice({ kind: 'info', text: 'Still connecting to the live seat map. Try again in a moment.' });
      return;
    }
    if (mine.includes(seatId)) return release(seatId);
    if (!name) {
      nameInput.current?.focus();
      setNotice({ kind: 'info', text: 'Add your name first, so the room can see who holds the seat.' });
      return;
    }
    setBusy(seatId);
    try {
      const { expiresAt } = await holdSeat(id, seatId, name);
      room.held(seatId, expiresAt);
      setNotice(null);
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      setNotice({
        kind: 'error',
        text:
          status === 409
            ? 'Someone got that seat first. Try another.'
            : status === 422
              ? `You can hold up to ${MAX_HOLDS} seats. Release one to pick another.`
              : err instanceof Error
                ? err.message
                : 'That did not work. Try again.',
      });
    } finally {
      setBusy(null);
    }
  }

  async function release(seatId: string) {
    setBusy(seatId);
    try {
      await releaseSeat(id, seatId);
    } catch {
      // Already expired or released: the seat is free either way.
    } finally {
      room.released([seatId]);
      setBusy(null);
    }
  }

  async function onPay() {
    setPaying(true);
    try {
      const booking = await payForHolds(id, bookingId.current, name || 'Guest');
      navigate(`/event/${id}/booking/${booking.id}`);
    } catch (err) {
      setNotice({
        kind: 'error',
        text: err instanceof Error ? err.message : 'The reservation did not go through. Try again.',
      });
      setPaying(false);
    }
  }

  const heldSeats = mine.map((seatId) => ({
    id: seatId,
    priceCents: room.state?.seats[seatId]?.priceCents ?? 0,
  }));

  return (
    <main className="py-6 pb-10">
      <Link to="/events" className="text-sm font-semibold text-accent underline">
        All events
      </Link>
      <div className="mt-3 grid gap-5 sm:grid-cols-[auto_1fr] sm:items-center">
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
          {e.externalUrl && (
            <p className="mt-2 text-sm">
              <a href={e.externalUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-accent underline">
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
              className="h-11 w-full rounded-md border border-line bg-bg px-3 text-base placeholder:text-muted"
              placeholder="For example, Sam"
              value={nickname}
              maxLength={NICKNAME_MAX}
              autoComplete="nickname"
              onChange={(ev) => {
                setNickname(ev.target.value);
                localStorage.setItem(NAME_KEY, ev.target.value);
              }}
            />
          </label>

          <div className="mt-3 min-h-11" aria-live="assertive">
            {notice && (
              <p
                className={`rounded-md border px-3 py-2 text-sm font-semibold ${
                  notice.kind === 'error' ? 'border-danger text-danger' : 'border-ink'
                }`}
              >
                {notice.text}
              </p>
            )}
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
        </div>

        <aside className="flex flex-col gap-6">
          <CheckoutPanel seats={heldSeats} msLeft={left} paying={paying} onRelease={release} onPay={onPay} />
          <Stats stats={room.state?.stats ?? null} connected={room.connected} />
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
