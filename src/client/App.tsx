import { useEffect } from 'react';
import { Link, NavLink, Outlet, Route, Routes, useLocation, useMatch } from 'react-router';
import { LogoMark } from './components/Logo';
import Booking from './pages/Booking';
import Event from './pages/Event';
import Events from './pages/Events';
import Landing from './pages/Landing';
import Privacy from './pages/Privacy';
import Tickets from './pages/Tickets';

export const container = 'mx-auto w-full max-w-6xl px-5 sm:px-8 lg:px-12';

const navLink = ({ isActive }: { isActive: boolean }) =>
  `inline-flex min-h-11 items-center rounded-sm text-sm font-semibold decoration-brand decoration-2 underline-offset-8 hover:underline ${isActive ? 'underline' : ''}`;

const TITLES: [RegExp, string][] = [
  [/^\/$/, 'PickTick: live seats for concerts, games and shows'],
  [/^\/events/, 'Events · PickTick'],
  [/^\/tickets/, 'My tickets · PickTick'],
  [/^\/privacy/, 'Privacy · PickTick'],
  [/\/booking\//, 'Your ticket · PickTick'],
];

export default function App() {
  const { pathname } = useLocation();
  // The seat page has a fixed checkout bar on small screens; leave the footer room under it.
  const onEventPage = useMatch('/event/:id') !== null;
  // A new page starts at the top, with its own tab title.
  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = TITLES.find(([re]) => re.test(pathname))?.[1] ?? 'PickTick';
  }, [pathname]);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line bg-bg">
        <div className={`${container} flex items-center justify-between py-2`}>
          {/* The landing hero carries the logo itself, so the header's copy steps aside there. */}
          <Link
            to="/"
            aria-label="PickTick home"
            className={`inline-flex min-h-11 items-center gap-2.5 rounded-sm ${pathname === '/' ? 'invisible' : ''}`}
          >
            <LogoMark className="h-7 w-auto" />
            <span className="text-xl font-black tracking-tight [font-stretch:125%]">PickTick</span>
          </Link>
          <nav aria-label="Main" className="flex gap-5">
            <NavLink to="/events" className={navLink}>
              Events
            </NavLink>
            <NavLink to="/tickets" className={navLink}>
              My tickets
            </NavLink>
          </nav>
        </div>
      </header>

      <div className="flex-1">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route
            element={
              <div className={container}>
                <Outlet />
              </div>
            }
          >
            <Route path="/events" element={<Events />} />
            <Route path="/event/:id" element={<Event />} />
            <Route path="/event/:id/booking/:bookingId" element={<Booking />} />
            <Route path="/tickets" element={<Tickets />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route
              path="*"
              element={
                <main className="py-16">
                  <h1 className="text-2xl font-bold">That page does not exist.</h1>
                  <Link to="/events" className="mt-4 inline-block link">
                    Browse all events
                  </Link>
                </main>
              }
            />
          </Route>
        </Routes>
      </div>

      <footer className={`border-t border-line ${onEventPage ? 'pb-36 lg:pb-0' : ''}`}>
        <div className={`${container} flex flex-col gap-3 py-6 text-sm text-muted sm:flex-row sm:items-center sm:justify-between`}>
          <p className="max-w-[60ch]">
            Some listings use event data from Ticketmaster. PickTick is not affiliated with Ticketmaster and
            does not issue real tickets.
          </p>
          <nav aria-label="Footer" className="flex gap-5 font-semibold text-ink">
            <Link to="/events" className="inline-flex min-h-11 items-center hover:underline">
              Events
            </Link>
            <Link to="/tickets" className="inline-flex min-h-11 items-center hover:underline">
              My tickets
            </Link>
            <Link to="/privacy" className="inline-flex min-h-11 items-center hover:underline">
              Privacy
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
