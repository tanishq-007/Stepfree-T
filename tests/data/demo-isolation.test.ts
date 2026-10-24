// Live/simulated separation, checked statically: the simulated snapshot may only be imported by the
// demo route and by tests. Run by the `demo-live-isolation` Kiro hook on every save under app/ or lib/.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");
const ALLOWED = new Set(["app/api/demo/route.ts", "lib/data/demo-snapshot.ts"]);
const IMPORTS_DEMO = /from\s+["'](?:@\/lib\/data\/demo-snapshot|\.{1,2}\/(?:[\w-]+\/)*demo-snapshot)["']/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

describe("demo data isolation", () => {
  const files = ["app", "lib", "components"].flatMap((d) => sourceFiles(path.join(ROOT, d)));

  it("scans the real source tree", () => {
    expect(files.length).toBeGreaterThan(30);
  });

  it("only the demo route imports the simulated snapshot", () => {
    const offenders = files.map((f) => path.relative(ROOT, f)).filter((rel) => !ALLOWED.has(rel) && IMPORTS_DEMO.test(readFileSync(path.join(ROOT, rel), "utf8")));
    expect(offenders).toEqual([]);
  });

  it("the demo route labels every response as simulated", () => {
    const src = readFileSync(path.join(ROOT, "app/api/demo/route.ts"), "utf8");
    expect(src).toContain("simulated: true");
    expect(src).toContain('label: "Simulated demo data"');
  });

  it("the guard itself detects a forbidden import", () => {
    expect(IMPORTS_DEMO.test('import { buildDemoSnapshot } from "@/lib/data/demo-snapshot";')).toBe(true);
    expect(IMPORTS_DEMO.test('import { x } from "../data/demo-snapshot";')).toBe(true);
    expect(IMPORTS_DEMO.test('import { x } from "@/lib/data/snapshot";')).toBe(false);
  });
});
