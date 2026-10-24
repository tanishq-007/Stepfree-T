// Presentation-only helpers that map MBTA line names to colours and classes.
// Station.lines values come from the data layer ("Red", "Orange", "Blue", "Green", "Mattapan").
//
// Contrast (measured, WCAG relative luminance; see tests/components/contrast.test.ts):
//   white on Red #DA291C 4.87:1, Green #00843D 4.81:1, Blue #003DA5 9.50:1  -> AA pass
//   white on Orange #ED8B00 2.53:1 -> FAILS. The MBTA's own text_color is white, but we use
//   ink #0F172A on Orange instead: 7.05:1.

export interface LineStyle {
  /** Tailwind background class for a solid chip. */
  bg: string;
  /** Tailwind text class that meets 4.5:1 on `bg`. */
  text: string;
  /** Fill hex (official MBTA colour). */
  hex: string;
  /** Foreground hex actually paired with `hex`. Tested for 4.5:1. */
  fgHex: string;
  label: string;
}

const WHITE = "#ffffff";
const INK = "#0f172a";

const LINES: Record<string, LineStyle> = {
  red: { bg: "bg-mbta-red", text: "text-white", hex: "#da291c", fgHex: WHITE, label: "Red Line" },
  orange: { bg: "bg-mbta-orange", text: "text-ink", hex: "#ed8b00", fgHex: INK, label: "Orange Line" },
  blue: { bg: "bg-mbta-blue", text: "text-white", hex: "#003da5", fgHex: WHITE, label: "Blue Line" },
  green: { bg: "bg-mbta-green", text: "text-white", hex: "#00843d", fgHex: WHITE, label: "Green Line" },
  mattapan: { bg: "bg-mbta-mattapan", text: "text-white", hex: "#da291c", fgHex: WHITE, label: "Mattapan Line" },
};

const FALLBACK: LineStyle = { bg: "bg-ink-soft", text: "text-white", hex: "#334155", fgHex: WHITE, label: "Line" };

export const KNOWN_LINES = Object.keys(LINES);

export function lineStyle(line: string): LineStyle {
  return LINES[line.trim().toLowerCase()] ?? { ...FALLBACK, label: `${line} Line` };
}

/**
 * A line BOTH stations are on, or null. Never falls back to one station's line: a fallback would
 * draw a direct route that does not exist. Use the journey relationship for transfers.
 */
export function commonLine(a: string[] | undefined, b: string[] | undefined): string | null {
  if (!a?.length || !b?.length) return null;
  return a.find((l) => b.includes(l)) ?? null;
}

/** WCAG 2.x contrast ratio of two #rrggbb colours. */
export function contrastRatio(fg: string, bg: string): number {
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
  };
  const [hi, lo] = [lum(fg), lum(bg)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}
