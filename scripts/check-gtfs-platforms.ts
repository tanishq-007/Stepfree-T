// npm run check:gtfs -- [path-to-unzipped-gtfs]
//
// Cross-checks lib/data/platform-map.ts against the MBTA's own GTFS pathways data. Read-only: it never
// edits the map. It answers two questions:
//   1. Do the facility ids in real MBTA elevator alerts appear in GTFS pathways.txt? (the "critical check")
//   2. For each mapped elevator, which subway platforms and entrances does GTFS say it connects to,
//      and does that agree with the platform names in the map?
//
// Get the data first (about 21 MB), then unzip it:
//   https://cdn.mbta.com/MBTA_GTFS.zip
// The folder defaults to $GTFS_DIR, then <os temp>/mbta-gtfs.
import { readFileSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PLATFORM_MAP, type PlatformMapEntry } from "../lib/data/platform-map";
import { DataSnapshotSchema } from "../lib/data/schemas";

type Row = Record<string, string>;

/** Small RFC 4180 CSV reader: quoted fields, doubled quotes, CRLF. Enough for GTFS. */
export function parseCsv(text: string): Row[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let quoted = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else quoted = false;
      } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cur);
      cur = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i += 1;
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
    } else cur += c;
  }
  if (cur !== "" || row.length > 0) {
    row.push(cur);
    rows.push(row);
  }
  const header = rows.shift() ?? [];
  return rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

// GTFS pathway_mode: 1 walkway, 2 stairs, 3 moving sidewalk, 4 escalator, 5 elevator, 6 fare gate, 7 exit gate.
const STEP_FREE_NON_ELEVATOR = new Set(["1", "3", "6", "7"]);
const ELEVATOR = "5";
// GTFS vehicle_type on platforms: 0 light rail (Green, Mattapan), 1 subway. 2 = Commuter Rail, 3 = bus.
const SUBWAY_VEHICLES = new Set(["0", "1"]);

interface StationGraph {
  /** step-free walkway/gate edges only (no elevators), as an adjacency list, made undirected for "adjacency". */
  walk: Map<string, Set<string>>;
  /** elevator facility id -> the stop ids at its ends */
  elevatorEnds: Map<string, Set<string>>;
  platforms: Map<string, string>; // subway platform stop id -> platform name
  entrances: Set<string>;
}

function buildStationGraphs(stops: Row[], pathways: Row[]): Map<string, StationGraph> {
  const stationOf = new Map<string, string>();
  for (const s of stops) if (s.parent_station) stationOf.set(s.stop_id ?? "", s.parent_station);
  const graphs = new Map<string, StationGraph>();
  const graph = (station: string): StationGraph => {
    let g = graphs.get(station);
    if (!g) {
      g = { walk: new Map(), elevatorEnds: new Map(), platforms: new Map(), entrances: new Set() };
      graphs.set(station, g);
    }
    return g;
  };
  for (const s of stops) {
    const station = s.parent_station;
    if (!station) continue;
    if (s.location_type === "0" && SUBWAY_VEHICLES.has(s.vehicle_type ?? "")) {
      graph(station).platforms.set(s.stop_id ?? "", s.platform_name || s.stop_name || (s.stop_id ?? ""));
    }
    if (s.location_type === "2") graph(station).entrances.add(s.stop_id ?? "");
  }
  for (const p of pathways) {
    const from = p.from_stop_id ?? "";
    const to = p.to_stop_id ?? "";
    const station = stationOf.get(from) ?? stationOf.get(to);
    if (!station) continue;
    const g = graph(station);
    if (p.pathway_mode === ELEVATOR && p.facility_id) {
      const ends = g.elevatorEnds.get(p.facility_id) ?? new Set<string>();
      ends.add(from);
      ends.add(to);
      g.elevatorEnds.set(p.facility_id, ends);
    } else if (STEP_FREE_NON_ELEVATOR.has(p.pathway_mode ?? "")) {
      // Adjacency only: direction does not matter for "which platform is next to this elevator".
      for (const [a, b] of [[from, to], [to, from]] as const) {
        const set = g.walk.get(a) ?? new Set<string>();
        set.add(b);
        g.walk.set(a, set);
      }
    }
  }
  return graphs;
}

/** Everything reachable from `start` on step-free edges WITHOUT using any elevator. */
function walkComponent(g: StationGraph, start: string): Set<string> {
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length > 0) {
    const node = queue.shift() as string;
    for (const next of g.walk.get(node) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

export interface GtfsElevatorFacts {
  platforms: string[]; // platform names next to either end of the elevator (no other elevator needed)
  entrance: boolean; // an entrance is next to one end of the elevator
}

export function elevatorFacts(g: StationGraph, facilityId: string): GtfsElevatorFacts | null {
  const ends = g.elevatorEnds.get(facilityId);
  if (!ends) return null;
  const near = new Set<string>();
  for (const end of ends) for (const n of walkComponent(g, end)) near.add(n);
  const platforms = [...new Set([...near].filter((n) => g.platforms.has(n)).map((n) => g.platforms.get(n) as string))].sort();
  const entrance = [...near].some((n) => g.entrances.has(n));
  return { platforms, entrance };
}

const norm = (s: string) => s.toLowerCase().replace(/\bplatforms?\b/g, "").replace(/\s+/g, " ").trim();

/** Rough agreement test between a map entry and the GTFS facts. Anything not clearly equal is "review". */
export function compare(entry: PlatformMapEntry, facts: GtfsElevatorFacts | null): "agrees" | "differs" | "review" {
  if (!facts) return "differs";
  const mapPlatforms = entry.platforms.filter((p) => p !== "Entrance");
  const mapEntrance = entry.platforms.includes("Entrance");
  if (entry.platforms.length === 0) return facts.platforms.length === 0 ? "agrees" : "review";
  if (mapEntrance && mapPlatforms.length === 0) return facts.entrance && facts.platforms.length === 0 ? "agrees" : "review";
  const gtfs = facts.platforms.map(norm);
  const matched = mapPlatforms.every((p) => {
    const n = norm(p);
    if (n === "" || n === "red line" || n === "green line" || n === "orange line") return gtfs.length > 0; // generic name
    return gtfs.some((g) => g !== "" && (n.includes(g) || g.includes(n)));
  });
  if (!matched) return "differs";
  return mapPlatforms.length === gtfs.length || gtfs.length === 1 ? "agrees" : "review";
}

function main(): void {
  const dir = process.argv[2] ?? process.env.GTFS_DIR ?? path.join(os.tmpdir(), "mbta-gtfs");
  for (const f of ["stops.txt", "pathways.txt"]) {
    if (!existsSync(path.join(dir, f))) {
      console.error(`Missing ${f} in ${dir}. Download https://cdn.mbta.com/MBTA_GTFS.zip and unzip it there.`);
      process.exit(1);
    }
  }
  const read = (f: string) => parseCsv(readFileSync(path.join(dir, f), "utf8"));
  const stops = read("stops.txt");
  const pathways = read("pathways.txt");
  const feed = existsSync(path.join(dir, "feed_info.txt")) ? read("feed_info.txt")[0]?.feed_version : undefined;
  console.log(`GTFS: ${dir}${feed ? ` (${feed})` : ""}`);

  // 1. Critical check: alert facility ids -> pathways facility_id.
  const pathwayFacilities = new Set(pathways.map((p) => p.facility_id).filter((x): x is string => Boolean(x)));
  const snapshot = DataSnapshotSchema.parse(
    JSON.parse(readFileSync(path.join(process.cwd(), "lib", "data", "snapshots", "mbta-snapshot.json"), "utf8")),
  );
  const alertFacilities = [
    ...new Set(snapshot.alerts.filter((a) => a.effect === "ELEVATOR_CLOSURE").flatMap((a) => a.facilityIds)),
  ];
  const found = alertFacilities.filter((id) => pathwayFacilities.has(id));
  console.log(`\n1. Elevator alert facility ids found in pathways.txt: ${found.length} of ${alertFacilities.length}`);
  for (const id of alertFacilities.filter((x) => !pathwayFacilities.has(x))) console.log(`   missing: ${id}`);

  // 2. Platform map vs GTFS.
  const graphs = buildStationGraphs(stops, pathways);
  const counts = { agrees: 0, differs: 0, review: 0 };
  console.log("\n2. Platform map vs GTFS (platforms next to each end of the elevator, without another elevator)");
  let lastStation = "";
  for (const [id, entry] of Object.entries(PLATFORM_MAP)) {
    if (entry.stationId !== lastStation) {
      lastStation = entry.stationId;
      console.log(`\n   ${entry.stationId}`);
    }
    const g = graphs.get(entry.stationId);
    const facts = g ? elevatorFacts(g, id) : null;
    const verdict = compare(entry, facts);
    counts[verdict] += 1;
    const gtfs = facts ? `${facts.platforms.join(" + ") || "-"}${facts.entrance ? " | entrance" : ""}` : "not in pathways";
    console.log(
      `   ${verdict.padEnd(7)} ${id.padEnd(5)} map=[${entry.platforms.join(", ")}]${entry.verified ? "" : " (unverified)"}  gtfs=[${gtfs}]`,
    );
  }
  console.log(`\nSummary: ${counts.agrees} agree, ${counts.review} need review, ${counts.differs} differ.`);
}

main();
