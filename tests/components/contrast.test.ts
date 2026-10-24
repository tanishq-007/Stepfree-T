// I9: every MBTA line chip pairs its fill with a foreground that meets WCAG AA (4.5:1).
// The MBTA's own white-on-orange (2.53:1) fails, so this test would have caught the old chip.
import { describe, expect, it } from "vitest";
import { commonLine, contrastRatio, KNOWN_LINES, lineStyle } from "@/lib/client/lines";

describe("line chip contrast", () => {
  it.each(KNOWN_LINES)("%s meets 4.5:1", (line) => {
    const s = lineStyle(line);
    expect(contrastRatio(s.fgHex, s.hex)).toBeGreaterThanOrEqual(4.5);
  });

  it("the fallback chip for an unknown line meets 4.5:1", () => {
    const s = lineStyle("Silver");
    expect(contrastRatio(s.fgHex, s.hex)).toBeGreaterThanOrEqual(4.5);
  });

  it("documents why Orange uses dark text: white on official orange fails", () => {
    expect(contrastRatio("#ffffff", "#ed8b00")).toBeLessThan(4.5);
    expect(lineStyle("Orange").fgHex).toBe("#0f172a");
  });

  it("the Tailwind text class matches the measured foreground", () => {
    for (const line of KNOWN_LINES) {
      const s = lineStyle(line);
      expect(s.text).toBe(s.fgHex === "#ffffff" ? "text-white" : "text-ink");
    }
  });
});

describe("commonLine never invents a shared line", () => {
  it("returns a line only when both stations are on it", () => {
    expect(commonLine(["Red"], ["Red", "Green"])).toBe("Red");
    expect(commonLine(["Red"], ["Orange"])).toBeNull();
    expect(commonLine(["Red"], [])).toBeNull();
    expect(commonLine(undefined, ["Red"])).toBeNull();
  });
});
