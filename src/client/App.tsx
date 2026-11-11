import { Link, Route, Routes } from 'react-router';
import Booking from './pages/Booking';
import Event from './pages/Event';
import Home from './pages/Home';

export default function App() {
  return (
    <div className="mx-auto min-h-dvh max-w-6xl px-4 sm:px-6">
      <header className="flex items-center justify-between border-b border-line py-3">
        <Link to="/" className="rounded-sm text-lg font-extrabold tracking-tight">
          Pick<span className="bg-brand px-1">Tick</span>
        </Link>
        <span className="text-right text-xs text-muted sm:text-sm">Class demo. No real money.</span>
      </header>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/event/:id" element={<Event />} />
        <Route path="/event/:id/booking/:bookingId" element={<Booking />} />
        <Route
          path="*"
          element={
            <main className="py-16">
              <h1 className="text-2xl font-bold">That page does not exist.</h1>
              <Link to="/" className="mt-4 inline-block font-semibold text-accent underline">
                Browse all events
              </Link>
            </main>
          }
        />
      </Routes>
    </div>
  );
}
