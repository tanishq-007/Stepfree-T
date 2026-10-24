// Copies the MapLibre web worker into public/ so the browser can load it.
// MapLibre v6 resolves its worker relative to its own ES module, which Next.js bundles into a chunk
// without the worker file. TransitMap calls setWorkerUrl("/vendor/maplibre-gl-worker.mjs").
// Runs on postinstall and before build, so the worker always matches the installed maplibre-gl version.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const pkgDir = path.dirname(require.resolve("maplibre-gl/package.json"));
const src = path.join(pkgDir, "dist", "maplibre-gl-worker.mjs");
const outDir = path.join(process.cwd(), "public", "vendor");
mkdirSync(outDir, { recursive: true });
copyFileSync(src, path.join(outDir, "maplibre-gl-worker.mjs"));
console.log(`copied maplibre-gl ${require("maplibre-gl/package.json").version} worker -> public/vendor/maplibre-gl-worker.mjs`);
