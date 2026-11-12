import type { PointerEvent } from 'react';
import type { Booking, EventSummary } from '../../../shared/types';
import { eventDay, eventTime, money, seatLabel } from '../lib/format';
import { LogoMark } from './Logo';

// Tilt toward the pointer: -0.5..0.5 on each axis, written as CSS vars so React never re-renders.
function tiltTo(ev: PointerEvent<HTMLElement>) {
  if (ev.pointerType !== 'mouse') return;
  const el = ev.currentTarget;
  const r = el.getBoundingClientRect();
  el.style.setProperty('--tx', String((ev.clientX - r.left) / r.width - 0.5));
  el.style.setProperty('--ty', String((ev.clientY - r.top) / r.height - 0.5));
}
function tiltReset(ev: PointerEvent<HTMLElement>) {
  ev.currentTarget.style.setProperty('--tx', '0');
  ev.currentTarget.style.setProperty('--ty', '0');
}

// The reservation as a real ticket: the event on the body, a tear-off stub with the admit count and total.
// The shape lives on an inner element so it doesn't fight ticket-print's clip-path.
// It tilts in 3D under the mouse. `large` is the ticket page's bigger version.
export default function TicketCard({
  event: e,
  booking: b,
  large,
}: {
  event: EventSummary;
  booking: Booking;
  large?: boolean;
}) {
  const n = b.seatIds.length;
  return (
    <article
      className={`ticket-print tilt w-full text-left ${large ? 'max-w-xl' : 'max-w-md'}`}
      onPointerMove={tiltTo}
      onPointerLeave={tiltReset}
    >
      <div className={`tilt-card ticket flex rounded-lg bg-surface ${large ? '[--stub:7rem] sm:[--stub:9rem]' : '[--stub:7rem]'}`}>
        <div className={`tilt-layer min-w-0 flex-1 ${large ? 'p-5 sm:p-7' : 'p-4'}`}>
          <h2 className={`leading-tight font-bold [overflow-wrap:anywhere] ${large ? 'text-2xl sm:text-3xl' : 'text-lg'}`}>
            {e.name}
          </h2>
          <p className={`mt-1 text-muted ${large ? 'sm:text-base text-sm' : 'text-sm'}`}>
            {eventDay(e.startsAt)} at {eventTime(e.startsAt)}
            <br />
            {e.venueName}
            {e.city && `, ${e.city}`}
          </p>
          <ul className={`stagger space-y-1 [--i:6] ${large ? 'mt-5 text-lg' : 'mt-3'}`}>
            {b.seatIds.map((seatId) => (
              <li key={seatId} className="font-semibold">
                {seatLabel(seatId)}
              </li>
            ))}
          </ul>
        </div>
        <div
          className={`perforation flex shrink-0 flex-col justify-between rounded-r-lg bg-brand pr-4 text-on-brand ${large ? 'w-28 py-6 sm:w-36' : 'w-28 py-4'}`}
        >
          <LogoMark
            className={`tilt-layer w-auto self-start [&_path:first-child]:fill-on-brand [&_path:last-child]:stroke-brand ${large ? 'h-7' : 'h-5'}`}
          />
          <div className="tilt-layer">
            <p className="text-xs font-bold tracking-wider uppercase">Admit {n}</p>
            <p className={`font-mono font-bold tabular-nums ${large ? 'text-2xl sm:text-3xl' : 'text-xl'}`}>{money(b.totalCents)}</p>
          </div>
        </div>
      </div>
    </article>
  );
}
