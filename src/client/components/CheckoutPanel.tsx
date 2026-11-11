import { HOLD_MS, MAX_HOLDS } from '../../../shared/types';
import { clock, money, seatLabel } from '../lib/format';

type Props = {
  seats: { id: string; priceCents: number }[];
  msLeft: number | null;
  paying: boolean;
  onRelease: (seatId: string) => void;
  onPay: () => void;
};

export default function CheckoutPanel({ seats, msLeft, paying, onRelease, onPay }: Props) {
  const total = seats.reduce((sum, s) => sum + s.priceCents, 0);
  const urgent = msLeft !== null && msLeft <= 30_000;

  return (
    <section
      aria-label="Checkout"
      className="fixed inset-x-0 bottom-0 z-10 border-t border-ink bg-bg px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:static lg:rounded-lg lg:border lg:p-4"
    >
      {seats.length === 0 ? (
        <p className="py-1 text-sm">
          <span className="font-semibold">Tap a seat to hold it.</span>{' '}
          <span className="text-muted">
            You get {HOLD_MS / 60_000} minutes to pay, for up to {MAX_HOLDS} seats.
          </span>
        </p>
      ) : (
        <>
          <ul className="flex flex-wrap gap-2 lg:flex-col" aria-label="Seats you are holding">
            {seats.map((s) => (
              <li
                key={s.id}
                className="flex items-center gap-2 rounded-md border border-line py-1 pr-1 pl-3 text-sm lg:justify-between"
              >
                <span>
                  <span className="font-semibold">{seatLabel(s.id)}</span>{' '}
                  <span className="text-muted">{money(s.priceCents)}</span>
                </span>
                <button
                  onClick={() => onRelease(s.id)}
                  aria-label={`Release ${seatLabel(s.id)}`}
                  className="grid h-8 w-8 place-items-center rounded-md text-lg leading-none hover:bg-surface"
                >
                  <span aria-hidden="true">×</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center justify-between gap-4">
            <p className="text-sm" role="timer" aria-live="off">
              <span className={`font-mono text-xl font-bold tabular-nums ${urgent ? 'text-danger' : ''}`}>
                {clock(msLeft ?? 0)}
              </span>{' '}
              <span className="text-muted">left to pay</span>
            </p>
            <button
              onClick={onPay}
              disabled={paying}
              className="h-12 rounded-md bg-brand px-6 text-base font-bold text-ink transition-colors duration-150 hover:bg-brand-strong active:bg-brand-strong disabled:cursor-wait disabled:opacity-60"
            >
              {paying ? 'Paying…' : `Pay ${money(total)}`}
            </button>
          </div>
          <p className="mt-2 text-xs text-muted">Pretend payment. No card is asked for or charged.</p>
        </>
      )}
    </section>
  );
}
