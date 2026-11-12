import { useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import type { Booking, EventDetail } from '../../../shared/types';
import { eventDay, eventTime, money, seatLabel } from '../lib/format';
import { LogoMark } from './Logo';

// Tilt toward the pointer: -0.5..0.5 on each axis, written as CSS vars so React never re-renders.
export function tiltTo(ev: PointerEvent<HTMLElement>) {
  if (ev.pointerType !== 'mouse') return;
  const el = ev.currentTarget;
  const r = el.getBoundingClientRect();
  el.style.setProperty('--tx', String((ev.clientX - r.left) / r.width - 0.5));
  el.style.setProperty('--ty', String((ev.clientY - r.top) / r.height - 0.5));
}
export function tiltReset(ev: PointerEvent<HTMLElement>) {
  ev.currentTarget.style.setProperty('--tx', '0');
  ev.currentTarget.style.setProperty('--ty', '0');
}

// The reservation as real tickets, one per seat: the event on the body, a tear-off stub with the price.
// Several seats stack like tickets fanned in a hand; click, swipe or use the arrows to bring the next forward.
// The whole stack tilts in 3D under the mouse, the back tickets a little less. `large` is the ticket page's bigger version.
// The shape lives on inner elements so it doesn't fight ticket-print's clip-path.
export default function TicketCard({ event: e, booking: b, large }: { event: EventDetail; booking: Booking; large?: boolean }) {
  const n = b.seatIds.length;
  const [front, setFront] = useState(0);
  const downX = useRef(0);
  const prices = new Map(e.seatMap.sections.flatMap((s) => s.rows.flatMap((r) => r.seats.map((seat) => [seat.id, s.priceCents]))));
  const go = (step: number) => setFront((f) => (f + step + n) % n);

  function onClick(ev: MouseEvent) {
    go(ev.clientX - downX.current > 30 ? -1 : 1); // a swipe right goes back; a tap or a swipe left goes on
  }
  function onKey(ev: KeyboardEvent) {
    if (ev.key === 'ArrowRight') go(1);
    else if (ev.key === 'ArrowLeft') go(-1);
    else return;
    ev.preventDefault();
  }

  return (
    <article className={`ticket-print w-full text-left ${large ? 'max-w-xl' : 'max-w-md'}`}>
      <div
        className={`tilt grid ${n > 1 ? 'cursor-pointer touch-pan-y pt-6 pr-5 select-none' : ''}`}
        onPointerMove={tiltTo}
        onPointerLeave={tiltReset}
        onPointerDown={n > 1 ? (ev) => (downX.current = ev.clientX) : undefined}
        onClick={n > 1 ? onClick : undefined}
      >
        {b.seatIds.map((seatId, i) => {
          const depth = (i - front + n) % n; // 0 is the front ticket
          return (
            <div
              key={seatId}
              aria-hidden={depth > 0}
              className="ticket-fan flex [grid-area:1/1]"
              style={{ zIndex: n - depth, '--depth': depth } as CSSProperties}
            >
              <div className={`tilt-card ticket flex flex-1 rounded-lg bg-surface ${large ? '[--stub:7rem] sm:[--stub:9rem]' : '[--stub:7rem]'}`}>
                <div className={`tilt-layer min-w-0 flex-1 ${large ? 'p-5 sm:p-7' : 'p-4'}`}>
                  <h2 className={`leading-tight font-bold [overflow-wrap:anywhere] ${large ? 'text-2xl sm:text-3xl' : 'text-lg'}`}>{e.name}</h2>
                  <p className={`mt-1 text-muted ${large ? 'text-sm sm:text-base' : 'text-sm'}`}>
                    {eventDay(e.startsAt)} at {eventTime(e.startsAt)}
                    <br />
                    {e.venueName}
                    {e.city && `, ${e.city}`}
                  </p>
                  <p className={`font-semibold ${large ? 'mt-5 text-lg' : 'mt-3'}`}>{seatLabel(seatId)}</p>
                </div>
                <div
                  className={`perforation flex shrink-0 flex-col justify-between rounded-r-lg bg-brand pr-4 text-on-brand ${large ? 'w-28 py-6 sm:w-36' : 'w-28 py-4'}`}
                >
                  <div className="tilt-layer flex items-center justify-between">
                    <LogoMark className={`w-auto [&_path:first-child]:fill-on-brand [&_path:last-child]:stroke-brand ${large ? 'h-7' : 'h-5'}`} />
                    {n > 1 && (
                      <span className="font-mono text-xs font-bold tabular-nums">
                        {i + 1}/{n}
                      </span>
                    )}
                  </div>
                  <div className="tilt-layer">
                    <p className="text-xs font-bold tracking-wider uppercase">Admit 1</p>
                    <p className={`font-mono font-bold tabular-nums ${large ? 'text-2xl sm:text-3xl' : 'text-xl'}`}>
                      {money(prices.get(seatId) ?? Math.round(b.totalCents / n))}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {n > 1 && (
        <div className="mt-3 flex items-center justify-between gap-4 pr-5 text-sm">
          <p className="text-muted">
            {n} tickets · <span className="font-mono font-semibold text-ink tabular-nums">{money(b.totalCents)}</span> total
          </p>
          <div className="flex items-center gap-1" onKeyDown={onKey}>
            <button type="button" className="stack-btn" aria-label="Previous ticket" onClick={() => go(-1)}>
              ‹
            </button>
            <span className="min-w-14 text-center font-mono tabular-nums" aria-live="polite">
              {front + 1} of {n}
            </span>
            <button type="button" className="stack-btn" aria-label="Next ticket" onClick={() => go(1)}>
              ›
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
