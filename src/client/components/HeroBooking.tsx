import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { NICKNAME_MAX, type Booking, type EventDetail, type EventType } from '../../../shared/types';
import { container } from '../App';
import { getEvent, getPerformer, searchEvents } from '../lib/api';
import { dayOfMonth, eventDay, eventTime, monthAbbrev, shortDay } from '../lib/format';
import { useBooking } from '../lib/useBooking';
import { useDebounced } from '../lib/useDebounced';
import CancelTicket from './CancelTicket';
import CheckoutPanel, { Notice } from './CheckoutPanel';
import { LogoMark } from './Logo';
import SeatMap from './SeatMap';
import TicketCard from './TicketCard';

const MAX_MATCHES = 6;
const MAX_DATES = 12;
// Selected is filled almond; the rest are outlined, so the choice reads at a glance.
const choice =
  'chip rounded-lg border border-line text-left hover:border-muted aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-bg disabled:cursor-not-allowed disabled:opacity-50';

const TYPE_LABEL: Record<EventType, string> = {
  concert: 'Concerts',
  sports: 'Sports',
  theater: 'Theatre',
  comedy: 'Comedy',
};
const TYPE_ICON: Record<EventType, string> = {
  concert: 'M9 18V5l11-2v13 M9 18a3 3 0 1 1-6 0a3 3 0 0 1 6 0 M20 16a3 3 0 1 1-6 0a3 3 0 0 1 6 0',
  sports: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18 M3 12h18 M12 3v18 M5.6 5.6c3.5 3.5 3.5 9.3 0 12.8 M18.4 5.6c-3.5 3.5-3.5 9.3 0 12.8',
  theater: 'M4 5h16v6a8 8 0 0 1-16 0z M9 10h.01 M15 10h.01 M9 14c1.5 1.5 4.5 1.5 6 0',
  comedy: 'M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3 M5 11a7 7 0 0 0 14 0 M12 18v3 M8 21h8',
};

function TypeIcon({ type }: { type: EventType }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={TYPE_ICON[type]} />
    </svg>
  );
}

// The landing hero. Typing turns its block of seats into the best match's
// live seat map, and the whole booking happens here: tap, name, reserve.
export default function HeroBooking() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const term = useDebounced(q.trim(), 350); // fewer lookups mid-word; each one is an API call
  const searching = term.length >= 2;
  const search = useQuery({
    queryKey: ['search', { q: term }, 0],
    queryFn: () => searchEvents({ q: term }),
    enabled: searching,
    placeholderData: keepPreviousData, // the map stays put while the next letters are looked up
  });
  // Matches sit under their kind of event. The kinds keep the order of their
  // best match, so the top result stays first and the arrow keys follow the page.
  const found = searching ? (search.data?.groups ?? []).slice(0, MAX_MATCHES) : [];
  const kinds = [...new Set(found.map((g) => g.type))];
  const groups = [...found].sort((a, b) => kinds.indexOf(a.type) - kinds.indexOf(b.type));

  // Which match, and which of its dates. A new search starts from the top again.
  const [pick, setPick] = useState(0);
  const [dateId, setDateId] = useState<string | null>(null);
  useEffect(() => {
    setPick(0);
    setDateId(null);
  }, [term]);
  const group = groups[Math.min(pick, groups.length - 1)];
  const many = group !== undefined && group.eventCount > 1 && group.performerId !== null;
  const performer = useQuery({
    queryKey: ['performer', group?.performerId],
    queryFn: () => getPerformer(group!.performerId!),
    enabled: many,
  });
  const wanted = group ? (dateId ?? group.nearEventId) : null;
  // Ticketmaster sometimes lists one show twice; a tile per show is enough.
  const dates = (performer.data?.events ?? []).filter(
    (d, i, all) => all.findIndex((o) => o.startsAt === d.startsAt && o.venueName === d.venueName) === i,
  );

  // The event on the map. It follows the search, except while seats are held:
  // then it stays, so a hold is never dropped by typing.
  const [eventId, setEventId] = useState<string | null>(null);
  const event = useQuery({
    queryKey: ['event', eventId],
    queryFn: () => getEvent(eventId!),
    enabled: eventId !== null,
    placeholderData: keepPreviousData, // slide from one venue to the next, not through an empty map
  });
  const e = eventId ? event.data : undefined;
  const live = e !== undefined && e.id === eventId;
  const booking = useBooking(eventId ?? '', live, { guest: true });
  const holding = booking.mine.length > 0;
  const [ticket, setTicket] = useState<{ event: EventDetail; booking: Booking } | null>(null);
  useEffect(() => {
    if (!holding) setEventId(wanted);
  }, [wanted, holding]);

  // Each keystroke is acknowledged by the seats, not by a spinner.
  const stage = useRef<HTMLDivElement>(null);
  const nudge = () => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    stage.current?.animate([{ opacity: 1 }, { opacity: 0.55 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' });
  };

  // The view follows the booking: down to the checkout when the first seat is held, then to the
  // ticket once it is reserved. A glide, or a jump for anyone who asked for less motion.
  const checkoutAt = useRef<HTMLDivElement>(null);
  const ticketAt = useRef<HTMLDivElement>(null);
  const glide = (el: HTMLElement | null, block: ScrollLogicalPosition) =>
    el?.scrollIntoView({ block, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  useEffect(() => {
    // Below lg the checkout is a bar pinned to the screen, already in view.
    if (holding && matchMedia('(min-width: 1024px)').matches) glide(checkoutAt.current, 'nearest');
  }, [holding]);
  useEffect(() => {
    if (ticket) glide(ticketAt.current, 'center');
  }, [ticket]);

  async function onPay() {
    const done = await booking.pay();
    if (done && e) setTicket({ event: e, booking: done });
  }

  const select = (i: number) => {
    setPick(i);
    setDateId(null);
  };

  return (
    <section
      className={`relative bg-[linear-gradient(180deg,var(--color-bg),var(--color-velvet)_70%)] ${searching || holding ? 'hero-active' : ''}`}
    >
      {/* Blurs the hero's bottom edge into the page instead of ending on a hard line. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-x-16 -bottom-20 h-40 bg-[linear-gradient(180deg,var(--color-velvet),var(--color-bg))] blur-2xl"
      />
      <div className={`${container} relative flex flex-col items-center gap-8 py-14 sm:gap-10 sm:py-20`}>
        <h1 className="rise flex items-center gap-[0.3em] text-[clamp(2.5rem,9vw,5rem)]">
          <LogoMark draw className="h-[0.95em] w-auto" />
          <span className="display">PickTick</span>
          <span className="sr-only">: live seats for concerts, games and shows</span>
        </h1>

        {ticket ? (
          <div ref={ticketAt} className="flex w-full flex-col items-center gap-5">
            <p className="display text-2xl sm:text-3xl">You're in, {ticket.booking.nickname}.</p>
            <TicketCard event={ticket.event} booking={ticket.booking} />
            <CancelTicket
              eventId={ticket.event.id}
              bookingId={ticket.booking.id}
              seats={ticket.booking.seatIds.length}
              onDone={() => setTicket(null)} // back to the same map, with the seats free again
            />
            <div className="flex flex-wrap justify-center gap-5">
              <button
                className="link"
                onClick={() => {
                  setTicket(null);
                  setQ('');
                }}
              >
                Book something else
              </button>
              <Link to="/tickets" className="link">
                My tickets
              </Link>
            </div>
          </div>
        ) : (
          <>
            <form
              role="search"
              className="rise flex w-full max-w-xl flex-col gap-2 [--i:1] sm:flex-row"
              onSubmit={(ev) => {
                ev.preventDefault();
                navigate(q.trim() ? `/events?q=${encodeURIComponent(q.trim())}` : '/events');
              }}
            >
              <label className="flex-1">
                <span className="sr-only">Search artists, teams, venues or cities</span>
                <input
                  type="search"
                  value={q}
                  maxLength={100}
                  onChange={(ev) => {
                    setQ(ev.target.value);
                    nudge();
                  }}
                  onKeyDown={(ev) => {
                    // Up and down step through the other matches without leaving the field.
                    const step = ev.key === 'ArrowDown' ? 1 : ev.key === 'ArrowUp' ? -1 : 0;
                    if (!step || holding || groups.length < 2) return;
                    ev.preventDefault();
                    select((pick + step + groups.length) % groups.length);
                  }}
                  // Names, not words: no red squiggles, no autocorrecting "Mulaney", and a Search key on phones.
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  enterKeyHint="search"
                  placeholder="Who do you want to see?"
                  className="h-13 w-full rounded-md border-2 border-ink bg-bg px-4 text-lg text-ink placeholder:text-muted placeholder:transition-opacity placeholder:duration-200 focus:placeholder:opacity-60"
                />
              </label>
              <button className="btn-primary h-13">Find events</button>
            </form>

            {/* What the seats below are, and the ways to change that. */}
            <div className="flex w-full max-w-2xl flex-col items-center gap-3 text-center empty:hidden" aria-live="polite">
              {e && (
                <p key={e.id} className="notice-in">
                  <Link to={`/event/${e.id}`} className="text-lg font-bold hover:underline">
                    {e.name}
                  </Link>
                  <br />
                  <span className="text-sm text-muted">
                    {eventDay(e.startsAt)} at {eventTime(e.startsAt)} · {e.venueName}
                    {e.city && `, ${e.city}`}
                  </span>
                </p>
              )}
              {searching && search.isError && (
                <p>
                  Events could not be loaded.{' '}
                  <button onClick={() => search.refetch()} className="link">
                    Try again
                  </button>
                </p>
              )}
              {searching && search.data && !search.isPlaceholderData && groups.length === 0 && (
                <p className="notice-in font-semibold">Nothing on sale matches that. Try a performer, team or city.</p>
              )}
              {groups.length > 1 && (
                <div className="flex w-full flex-col gap-4">
                  {kinds.map((kind) => (
                    <div key={kind} role="group" aria-label={TYPE_LABEL[kind]} className="text-left">
                      <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted">
                        <TypeIcon type={kind} />
                        {TYPE_LABEL[kind]}
                      </p>
                      <ul className="grid gap-2 sm:grid-cols-2">
                        {groups
                          .filter((g) => g.type === kind)
                          .map((g) => (
                            <li key={g.key}>
                              <button
                                className={`${choice} group flex w-full items-center gap-3 p-1.5 pr-3`}
                                aria-pressed={g === group}
                                disabled={holding}
                                onClick={() => select(groups.indexOf(g))}
                              >
                                {g.imageUrl ? (
                                  <img src={g.imageUrl} alt="" loading="lazy" className="h-12 w-16 shrink-0 rounded-md object-cover" />
                                ) : (
                                  <span className="grid h-12 w-16 shrink-0 place-items-center rounded-md bg-surface" aria-hidden="true">
                                    <TypeIcon type={g.type} />
                                  </span>
                                )}
                                <span className="min-w-0">
                                  <span className="block truncate font-semibold">{g.name}</span>
                                  <span className="block truncate text-sm text-muted group-aria-pressed:text-bg/75">
                                    {g.eventCount > 1
                                      ? `${g.eventCount} dates · next ${shortDay(g.nextStartsAt)}`
                                      : `${shortDay(g.nextStartsAt)}${g.cities[0] ? ` · ${g.cities[0]}` : ''}`}
                                  </span>
                                </span>
                              </button>
                            </li>
                          ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
              {many && performer.data && (
                // A strip of dates that scrolls sideways; the time tells two shows on one day apart.
                <div className="w-full overflow-x-auto pb-1">
                  <ul className="mx-auto flex w-max snap-x gap-2" aria-label="Dates">
                    {dates.slice(0, MAX_DATES).map((d) => (
                      <li key={d.id} className="snap-start">
                        <button
                          className={`${choice} group flex w-28 flex-col items-center px-2 py-2 text-center`}
                          aria-pressed={d.id === wanted}
                          disabled={holding}
                          onClick={() => setDateId(d.id)}
                        >
                          <span className="text-xs font-semibold uppercase">{monthAbbrev(d.startsAt)}</span>
                          <span className="display text-2xl tabular-nums">{dayOfMonth(d.startsAt)}</span>
                          <span className="text-xs font-semibold">{eventTime(d.startsAt)}</span>
                          <span className="w-full truncate text-xs text-muted group-aria-pressed:text-bg/75">{d.city || d.venueName}</span>
                        </button>
                      </li>
                    ))}
                    {dates.length > MAX_DATES && (
                      <li className="flex items-center">
                        <Link to={`/artist/${performer.data.id}`} className="link px-3 text-sm whitespace-nowrap">
                          All {dates.length} dates
                        </Link>
                      </li>
                    )}
                  </ul>
                </div>
              )}
              {holding && groups.length + (many ? 1 : 0) > 1 && (
                <p className="text-sm text-muted">Release your seats to switch event.</p>
              )}
              <Notice notice={booking.notice} />
            </div>

            <div ref={stage} className={`hero-stage rise w-full [--i:2] ${e ? 'max-w-2xl' : 'max-w-md'}`}>
              <SeatMap
                bare
                maxSeatPx={40}
                seatMap={e?.seatMap ?? null}
                mapKey={e?.id}
                eventType={e?.type}
                seats={live ? (booking.room.state?.seats ?? {}) : {}}
                mine={booking.mine}
                busy={booking.busy}
                onSeat={booking.onSeat}
              />
              {e?.source === 'ticketmaster' && (
                <p className="mx-auto mt-3 max-w-[65ch] text-center text-sm text-muted">
                  This seat map and its prices are PickTick's own, not the venue's floor plan or Ticketmaster's prices.
                </p>
              )}
            </div>

            {holding && (
              // pb on phones: room to scroll the map's last rows above the pinned checkout bar.
              <div ref={checkoutAt} className="w-full max-w-md scroll-mb-6 pb-48 text-left lg:pb-0">
                <CheckoutPanel
                  seats={booking.heldSeats}
                  msLeft={booking.left}
                  paying={booking.paying}
                  onRelease={booking.release}
                  onPay={onPay}
                >
                  <label className="mt-3 block">
                    <span className="sr-only mb-1 text-sm font-semibold lg:not-sr-only lg:block">Name on the ticket</span>
                    <input
                      className="field"
                      placeholder="Name on the ticket"
                      value={booking.nickname}
                      maxLength={NICKNAME_MAX}
                      autoComplete="nickname"
                      onChange={(ev) => booking.setNickname(ev.target.value)}
                    />
                  </label>
                </CheckoutPanel>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
