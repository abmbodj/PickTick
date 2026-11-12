import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { cancelBooking } from '../lib/api';

// "Cancel ticket", confirmed in place. The seats go back on sale for everyone
// at once; `onDone` runs after the server has given them back.
export default function CancelTicket({
  eventId,
  bookingId,
  seats,
  onDone,
}: {
  eventId: string;
  bookingId: string;
  seats: number;
  onDone?: () => void;
}) {
  const queryClient = useQueryClient();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    setBusy(true);
    setError(null);
    try {
      await cancelBooking(eventId, bookingId);
      queryClient.removeQueries({ queryKey: ['booking', eventId, bookingId] });
      await queryClient.invalidateQueries({ queryKey: ['tickets'] });
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work. Try again.');
      setBusy(false);
    }
  }

  if (!asking)
    return (
      <button className="link text-sm" onClick={() => setAsking(true)}>
        Cancel ticket
      </button>
    );
  return (
    <div className="notice-in flex flex-wrap items-center gap-x-4 gap-y-2 text-sm" role="group" aria-label="Cancel ticket">
      <span className="font-semibold">
        Give {seats === 1 ? 'this seat' : 'these seats'} back? Anyone can take {seats === 1 ? 'it' : 'them'}.
      </span>
      <button className="btn-secondary h-9 border-danger text-danger hover:border-danger" disabled={busy} onClick={cancel}>
        {busy ? 'Cancelling…' : 'Yes, cancel'}
      </button>
      <button className="link" disabled={busy} onClick={() => setAsking(false)}>
        Keep it
      </button>
      {error && (
        <p role="alert" className="w-full text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
