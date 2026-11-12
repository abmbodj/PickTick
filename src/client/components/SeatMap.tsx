import type { EventType, SeatMap as SeatMapData, SeatView } from '../../../shared/types';
import { money, seatLabel } from '../lib/format';

type Props = {
  seatMap: SeatMapData;
  eventType: EventType;
  seats: Record<string, SeatView>;
  mine: string[];
  busy: string | null;
  onSeat: (seatId: string) => void;
};

const CELL = 0.82; // seat size, in seat-grid units
const PX_PER_SEAT = 30; // smallest comfortable tap size; wider maps scroll sideways

function describe(seat: SeatView | undefined, isMine: boolean): string {
  if (!seat) return 'loading';
  if (isMine) return 'held by you, tap to release';
  if (seat.status === 'held') return `held by ${seat.by}`;
  if (seat.status === 'sold') return `sold to ${seat.by}`;
  return 'available';
}

export default function SeatMap({ seatMap, eventType, seats, mine, busy, onSeat }: Props) {
  const all = seatMap.sections.flatMap((s) => s.rows.flatMap((r) => r.seats));
  const cols = Math.max(...all.map((s) => s.x)) + 1;
  const rows = Math.max(...all.map((s) => s.y)) + 1;
  const mineSet = new Set(mine);
  const front = eventType === 'sports' ? 'Field of play' : 'Stage';

  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-surface p-3">
      <svg
        viewBox={`-0.4 -2.2 ${cols + 0.8} ${rows + 2.5}`}
        style={{ minWidth: cols * PX_PER_SEAT }}
        className="mx-auto block w-full max-w-3xl select-none"
        role="group"
        aria-label="Seat map"
      >
        <defs>
          <pattern id="hatch" width="0.2" height="0.2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="0.2" height="0.2" fill="var(--color-bg)" />
            <rect width="0.08" height="0.2" fill="var(--color-muted)" />
          </pattern>
        </defs>

        <rect x={cols * 0.15} y={-1.9} width={cols * 0.7} height={0.6} rx={0.12} fill="var(--color-line)" />
        <text x={cols / 2} y={-1.48} textAnchor="middle" fontSize={0.34} fontWeight={700} fill="var(--color-ink)">
          {front}
        </text>

        {seatMap.sections.map((section) => (
          <g key={section.name}>
            <text
              x={cols / 2}
              y={section.rows[0].seats[0].y - 0.28}
              textAnchor="middle"
              fontSize={0.36}
              fontWeight={700}
              fill="var(--color-ink)"
            >
              {section.name} · {money(section.priceCents)}
            </text>
            {section.rows.flatMap((row) =>
              row.seats.map((s) => {
                const seat = seats[s.id];
                const isMine = mineSet.has(s.id);
                const status = isMine ? 'mine' : (seat?.status ?? 'available');
                const act = () => status !== 'sold' && onSeat(s.id);
                return (
                  <g
                    key={s.id}
                    className="seat"
                    data-status={status}
                    role="button"
                    tabIndex={0}
                    aria-label={`${seatLabel(s.id)}, ${money(section.priceCents)}, ${describe(seat, isMine)}`}
                    aria-pressed={isMine}
                    aria-disabled={status === 'sold'}
                    opacity={busy === s.id ? 0.5 : 1}
                    onClick={act}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        act();
                      }
                    }}
                  >
                    <title>{`${seatLabel(s.id)}: ${describe(seat, isMine)}`}</title>
                    {/* Larger invisible hit area so neighbouring taps do not fall in the gaps. */}
                    <rect x={s.x} y={s.y} width={1} height={1} fill="transparent" />
                    <rect
                      x={s.x + (1 - CELL) / 2}
                      y={s.y + (1 - CELL) / 2}
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
                        d={`M${s.x + 0.3} ${s.y + 0.52} l0.14 0.14 l0.27 -0.3`}
                        fill="none"
                        stroke="var(--color-on-brand)"
                        strokeWidth={0.1}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    )}
                    {status === 'sold' && (
                      <path
                        d={`M${s.x + 0.34} ${s.y + 0.34} l0.32 0.32 m0 -0.32 l-0.32 0.32`}
                        stroke="var(--color-ink)"
                        strokeWidth={0.09}
                        strokeLinecap="round"
                      />
                    )}
                  </g>
                );
              }),
            )}
          </g>
        ))}
      </svg>

      <ul className="mt-3 flex flex-wrap justify-center gap-x-5 gap-y-1 text-sm" aria-label="Legend">
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
    </div>
  );
}
