import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { EventType, SeatMap as SeatMapData, SeatView } from '../../../shared/types';
import { money, seatLabel } from '../lib/format';

type Props = {
  // null draws the decorative block of seats from the landing hero instead of a venue.
  seatMap: SeatMapData | null;
  // Changes when the map shows a different event, so its seats flip over anew.
  mapKey?: string;
  eventType?: EventType;
  seats: Record<string, SeatView>;
  mine: string[];
  busy: string | null;
  onSeat: (seatId: string) => void;
  bare?: boolean; // no panel around the map
  maxSeatPx?: number;
};

const CELL = 0.82; // seat size, in seat-grid units
const MIN_SEAT_PX = 30; // smallest comfortable tap size; wider maps scroll sideways
const DECOR_COLS = 14;
const DECOR_ROWS = 7;

function describe(seat: SeatView | undefined, isMine: boolean): string {
  if (!seat) return 'loading';
  if (isMine) return 'held by you, tap to release';
  if (seat.status === 'held') return `held by ${seat.by}`;
  if (seat.status === 'sold') return `sold to ${seat.by}`;
  return 'available';
}

// One seat, drawn in a 1×1 cell at the origin; its slot puts it in place.
function Seat({
  id,
  row,
  priceCents,
  seat,
  isMine,
  busy,
  onSeat,
}: {
  id: string;
  row: number;
  priceCents: number;
  seat: SeatView | undefined;
  isMine: boolean;
  busy: boolean;
  onSeat: (seatId: string) => void;
}) {
  const status = isMine ? 'mine' : (seat?.status ?? 'available');
  const act = () => status !== 'sold' && onSeat(id);
  const inset = (1 - CELL) / 2;
  return (
    <g
      className="seat"
      style={{ '--row': Math.min(row, 16) } as CSSProperties}
      data-status={status}
      role="button"
      tabIndex={0}
      aria-label={`${seatLabel(id)}, ${money(priceCents)}, ${describe(seat, isMine)}`}
      aria-pressed={isMine}
      aria-disabled={status === 'sold'}
      opacity={busy ? 0.5 : 1}
      onClick={act}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          act();
        }
      }}
    >
      <title>{`${seatLabel(id)}: ${describe(seat, isMine)}`}</title>
      {/* Larger invisible hit area so neighbouring taps do not fall in the gaps. */}
      <rect width={1} height={1} fill="transparent" />
      {status === 'mine' && <rect className="seat-ring" x={inset} y={inset} width={CELL} height={CELL} rx={0.16} />}
      <rect
        className="seat-box"
        x={inset}
        y={inset}
        width={CELL}
        height={CELL}
        rx={0.16}
        strokeWidth={status === 'mine' ? 0.1 : 0.06}
        stroke={status === 'held' ? 'var(--color-muted)' : status === 'sold' ? 'var(--color-line)' : 'var(--color-ink)'}
        fill={
          status === 'mine'
            ? 'var(--color-brand)'
            : status === 'sold'
              ? 'var(--color-sold)'
              : status === 'held'
                ? 'url(#hatch)'
                : 'var(--color-bg)'
        }
      />
      {status === 'mine' && (
        <path
          className="seat-mark"
          pathLength={1}
          d="M0.3 0.52 l0.14 0.14 l0.27 -0.3"
          fill="none"
          stroke="var(--color-on-brand)"
          strokeWidth={0.1}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {status === 'sold' && (
        <path
          className="seat-mark"
          pathLength={1}
          d="M0.34 0.34 l0.32 0.32 m0 -0.32 l-0.32 0.32"
          stroke="var(--color-ink)"
          strokeWidth={0.09}
          strokeLinecap="round"
        />
      )}
    </g>
  );
}

// Decorative: an empty seat that fills and clears on a loop. Same scatter every render.
function DecorSeat({ i }: { i: number }) {
  const x = i % DECOR_COLS;
  const y = Math.floor(i / DECOR_COLS);
  const n = (i * 7919 + y * 104729) % 97;
  const taken = n < 46;
  return (
    <rect
      x={0.12}
      y={0.12}
      width={0.76}
      height={0.76}
      rx={0.16}
      stroke="var(--color-ink)"
      strokeWidth={0.07}
      className={taken ? 'hero-seat hero-cell' : 'hero-cell'}
      data-taken={taken || undefined}
      fill="transparent"
      style={
        {
          // Front row first, centre before the aisles.
          '--in': `${250 + y * 45 + Math.round(Math.abs(x - (DECOR_COLS - 1) / 2) * 18)}ms`,
          '--d': `-${(n * 0.19).toFixed(2)}s`,
        } as CSSProperties
      }
    />
  );
}

// The seats are numbered slots that outlive the layout: when the map changes
// venue (or stops being decoration), each slot slides to its new place
// instead of the whole map being swapped.
export default function SeatMap({ seatMap, mapKey, eventType, seats, mine, busy, onSeat, bare, maxSeatPx = 80 }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = box.current!;
    const measure = () => setWidth(el.clientWidth - parseFloat(getComputedStyle(el).paddingLeft) * 2);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [bare]);

  const all = seatMap?.sections.flatMap((sec) =>
    sec.rows.flatMap((r) => r.seats.map((s) => ({ ...s, priceCents: sec.priceCents }))),
  );
  const cols = all ? Math.max(...all.map((s) => s.x)) + 1 : DECOR_COLS;
  const rows = all ? Math.max(...all.map((s) => s.y)) + 1 : DECOR_ROWS;
  // A venue gets a margin and room above for the stage; the decoration is just seats.
  const [margin, head, foot] = all ? [0.4, 2.2, 0.3] : [0, 0, 0];
  const px = all
    ? Math.max(MIN_SEAT_PX, Math.min(maxSeatPx, Math.min(width, 768) / (cols + margin * 2)))
    : Math.min(32, width / cols);
  const svgWidth = Math.max(width, px * (cols + margin * 2));
  const left = (svgWidth - cols * px) / 2;
  const top = head * px;
  const mineSet = new Set(mine);
  const front = eventType === 'sports' ? 'Field of play' : 'Stage';
  const place = (x: number, y: number): CSSProperties => ({
    transform: `translate(${left + x * px}px, ${top + y * px}px) scale(${px})`,
  });

  return (
    <div ref={box} className={`overflow-x-auto ${bare ? '' : 'rounded-lg border border-line bg-surface p-3'}`}>
      {width > 0 && (
        <svg
          width={svgWidth}
          style={{ height: (rows + head + foot) * px }}
          className="seat-stage block select-none"
          role={all ? 'group' : undefined}
          aria-label={all ? 'Seat map' : undefined}
          aria-hidden={all ? undefined : true}
        >
          <defs>
            <pattern id="hatch" width="0.2" height="0.2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="0.2" height="0.2" fill="var(--color-bg)" />
              <rect width="0.08" height="0.2" fill="var(--color-muted)" />
            </pattern>
          </defs>

          {seatMap && (
            <g key={mapKey} className="fade-in" style={place(0, 0)}>
              <rect x={cols * 0.15} y={-1.9} width={cols * 0.7} height={0.6} rx={0.12} fill="var(--color-line)" />
              <text x={cols / 2} y={-1.48} textAnchor="middle" fontSize={0.34} fontWeight={700} fill="var(--color-ink)">
                {front}
              </text>
              {seatMap.sections.map((section) => (
                <text
                  key={section.name}
                  x={cols / 2}
                  y={section.rows[0].seats[0].y - 0.28}
                  textAnchor="middle"
                  fontSize={0.36}
                  fontWeight={700}
                  fill="var(--color-ink)"
                >
                  {section.name} · {money(section.priceCents)}
                </text>
              ))}
            </g>
          )}

          {Array.from({ length: all ? all.length : DECOR_COLS * DECOR_ROWS }, (_, i) => {
            const s = all?.[i];
            return (
              <g key={i} className="seat-slot" style={s ? place(s.x, s.y) : place(i % DECOR_COLS, Math.floor(i / DECOR_COLS))}>
                {s ? (
                  <Seat
                    key={mapKey}
                    id={s.id}
                    row={s.y}
                    priceCents={s.priceCents}
                    seat={seats[s.id]}
                    isMine={mineSet.has(s.id)}
                    busy={busy === s.id}
                    onSeat={onSeat}
                  />
                ) : (
                  <DecorSeat key="decor" i={i} />
                )}
              </g>
            );
          })}
        </svg>
      )}

      {all && (
        <ul className="fade-in mt-3 flex flex-wrap justify-center gap-x-5 gap-y-1 text-sm" aria-label="Legend">
          {[
            ['Available', 'border-2 border-ink bg-bg'],
            ['Yours', 'border-2 border-ink bg-brand'],
            ['Held by someone', 'border-2 border-muted bg-[repeating-linear-gradient(45deg,var(--color-muted)_0_2px,var(--color-bg)_2px_5px)]'],
            ['Sold', 'border-2 border-line bg-sold'],
          ].map(([label, swatch]) => (
            <li key={label} className="flex items-center gap-2">
              <span className={`inline-block h-4 w-4 rounded-sm ${swatch}`} aria-hidden="true" />
              {label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
