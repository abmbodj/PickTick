import type { EventType } from '../../../shared/types';
import { dayOfMonth, monthAbbrev } from '../lib/format';

// Poster colours for events that come without a picture.
const POSTER: Record<EventType | 'none', string> = {
  concert: 'bg-brand text-on-brand',
  sports: 'bg-velvet text-ink',
  theater: 'bg-surface text-brand ring-1 ring-inset ring-line',
  comedy: 'bg-bg text-ink ring-1 ring-inset ring-ink',
  none: 'bg-surface text-ink ring-1 ring-inset ring-line',
};

// The event's image with the date stamped on it, or a date poster when there
// is no image. `className` sets the size and shape; the poster type scales to it.
export default function EventThumb({
  imageUrl,
  startsAt,
  type,
  className,
}: {
  imageUrl: string | null;
  startsAt: string;
  type?: EventType;
  className: string;
}) {
  if (!imageUrl)
    return (
      <div
        aria-hidden="true"
        className={`@container-[size] shrink-0 overflow-hidden rounded-md ${POSTER[type ?? 'none']} ${className}`}
      >
        <div className="display flex h-full w-full flex-col items-center justify-center">
          <span className="text-[16cqh] uppercase">{monthAbbrev(startsAt)}</span>
          <span className="text-[52cqh] leading-[0.85] tabular-nums">{dayOfMonth(startsAt)}</span>
        </div>
      </div>
    );
  return (
    <div className={`relative shrink-0 overflow-hidden rounded-md bg-surface ${className}`} aria-hidden="true">
      <img src={imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
      <span className="absolute top-0 left-0 flex flex-col items-center rounded-br-md bg-bg px-2 py-1 text-ink">
        <span className="text-[0.7rem] font-semibold uppercase">{monthAbbrev(startsAt)}</span>
        <span className="text-xl leading-none font-extrabold tabular-nums">{dayOfMonth(startsAt)}</span>
      </span>
    </div>
  );
}
