// The PickTick mark: a ticket stub with a tick on it. Size it with `className`.
export function LogoMark({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 32 24" className={className} aria-hidden="true">
      <path
        fill="var(--color-brand)"
        d="M3 0h26a3 3 0 0 1 3 3v5a4 4 0 0 0 0 8v5a3 3 0 0 1-3 3H3a3 3 0 0 1-3-3v-5a4 4 0 0 0 0-8V3a3 3 0 0 1 3-3z"
      />
      <path
        d="M10 12.5l4 4 8-9"
        fill="none"
        stroke="var(--color-on-brand)"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
