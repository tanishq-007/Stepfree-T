// npm run a11y -- [base-url]
//
// Automated accessibility audit in a real Chrome: axe-core (WCAG 2.0/2.1/2.2 A and AA rules + best practice)
// on every screen, including each demo result state, with all <details> sections opened. It also checks
// reflow (WCAG 1.4.10): no horizontal scrolling at 320 CSS px wide.
//
// Start the app first (npm run build && npm start), then run this. Set CHROME_PATH if Chrome is not in
// the default place. This is not a substitute for testing with VoiceOver, TalkBack and real riders.
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import puppeteer, { type Page } from "puppeteer-core";
import type { AxeResults } from "axe-core";
import { DEMO_SCENARIOS } from "../lib/client/types";

const require = createRequire(import.meta.url);
const AXE_SOURCE = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const BASE = (process.argv[2] ?? process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter((p): p is string => Boolean(p));

interface Screen {
  name: string;
  path: string;
  /** Wait for this selector before auditing (the result banner for demo screens). */
  ready?: string;
}

const SCREENS: Screen[] = [
  { name: "home (no trip)", path: "/" },
  { name: "trip form", path: "/trip/new" },
  ...DEMO_SCENARIOS.map((s) => ({ name: `demo: ${s}`, path: `/?demo=${s}`, ready: "[data-status]" })),
];

async function audit(page: Page): Promise<AxeResults> {
  await page.evaluate(() => document.querySelectorAll("details").forEach((d) => d.setAttribute("open", "")));
  await page.addScriptTag({ content: AXE_SOURCE });
  return page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (ctx: Document, opts: object) => Promise<AxeResults> } }).axe;
    return axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] } });
  });
}

async function main(): Promise<void> {
  const executablePath = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!executablePath) throw new Error("Chrome not found. Set CHROME_PATH.");
  const browser = await puppeteer.launch({ executablePath, headless: true, args: ["--no-first-run"] });
  let problems = 0;
  try {
    for (const screen of SCREENS) {
      const context = await browser.createBrowserContext(); // fresh localStorage for every screen
      const page = await context.newPage();
      await page.setViewport({ width: 390, height: 844 });
      await page.goto(`${BASE}${screen.path}`, { waitUntil: "networkidle0", timeout: 30_000 });
      if (screen.ready) await page.waitForSelector(screen.ready, { timeout: 15_000 });
      await page.waitForNetworkIdle({ idleTime: 500, timeout: 15_000 }).catch(() => undefined);

      const results = await audit(page);
      await page.setViewport({ width: 320, height: 640 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      // Name the deepest elements that stick out past the right edge, so a reflow failure is easy to fix.
      const culprits =
        overflow > 0
          ? await page.evaluate(() => {
              const width = document.documentElement.clientWidth;
              const clipped = (el: HTMLElement) => {
                for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
                  if (["hidden", "clip"].includes(getComputedStyle(p).overflowX)) return true;
                }
                return false;
              };
              const wide = [...document.querySelectorAll<HTMLElement>("body *")].filter(
                (el) => el.getBoundingClientRect().right > width + 0.5 && !clipped(el),
              );
              return wide
                .filter((el) => !wide.some((other) => other !== el && el.contains(other)))
                .slice(0, 3)
                .map((el) => `<${el.tagName.toLowerCase()} class="${(el.getAttribute("class") ?? "").slice(0, 90)}"> right=${Math.round(el.getBoundingClientRect().right)}px`);
            })
          : [];
      const status = await page.evaluate(() => document.querySelector("[data-status]")?.getAttribute("data-status") ?? "-");

      const bad = results.violations;
      problems += bad.length + (overflow > 0 ? 1 : 0);
      console.log(
        `${bad.length === 0 && overflow <= 0 ? "PASS" : "FAIL"}  ${screen.name.padEnd(34)} status=${status.padEnd(13)} axe passes=${results.passes.length} violations=${bad.length} incomplete=${results.incomplete.length} reflow320=${overflow > 0 ? `${overflow}px overflow` : "ok"}`,
      );
      for (const v of bad) {
        console.log(`      ${v.impact ?? ""} ${v.id}: ${v.help}`);
        for (const n of v.nodes.slice(0, 3)) console.log(`        ${n.target.join(" ")}  ${n.failureSummary?.split("\n").slice(1, 2).join(" ") ?? ""}`);
      }
      for (const c of culprits) console.log(`      reflow: ${c}`);
      for (const v of results.incomplete) {
        console.log(`      needs a human check: ${v.id}: ${v.help}`);
        for (const n of v.nodes.slice(0, 3)) console.log(`        ${n.target.join(" ")}  ${(n.any[0]?.message ?? "").slice(0, 160)}`);
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
  console.log(problems === 0 ? "\nNo automated accessibility violations found." : `\n${problems} problem(s) found.`);
  if (problems > 0) process.exit(1);
}

main().catch((err: unknown) => {
  console.error("Audit failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
