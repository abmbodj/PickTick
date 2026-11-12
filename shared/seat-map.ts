import type { SeatMap } from './types.ts';

export type SectionSpec = { name: string; priceCents: number; rows: number; perRow: number };

// Lays sections out front to back, each row centred, with an aisle between sections.
export function buildSeatMap(specs: SectionSpec[]): SeatMap {
  const widest = Math.max(...specs.map((s) => s.perRow));
  let y = 0;
  const sections = specs.map((s) => {
    const rows = Array.from({ length: s.rows }, (_, r) => {
      const offset = (widest - s.perRow) / 2;
      const row = {
        label: String(r + 1),
        seats: Array.from({ length: s.perRow }, (_, i) => ({
          id: `${s.name}-${r + 1}-${i + 1}`,
          number: i + 1,
          x: offset + i,
          y,
        })),
      };
      y += 1;
      return row;
    });
    y += 0.8;
    return { name: s.name, priceCents: s.priceCents, rows };
  });
  return { sections };
}
