/**
 * ============================================================================================
 *  !!  TEAMMATE: HAND-VERIFY THIS FILE BEFORE ANYONE RELIES ON IT  !!
 * ============================================================================================
 * The MBTA API does not say which platform an elevator serves. This map was built by READING
 * the real `long_name` of each facility from https://api-v3.mbta.com/facilities, for example
 *   "Kendall/MIT Elevator 866 (Alewife platform to Main Street)"  -> serves "Alewife platform".
 * Nobody has walked these stations. Treat every entry as a claim to check.
 *
 *  verified: true   The facility name names the platform(s) explicitly, or the station has only
 *                   one platform stop in the MBTA data (Alewife). Still needs a human check.
 *  verified: false  We INFERRED the platform (name says only "Platform", "Lobby", "Underpass",
 *                   or the elevator is a platform-to-platform connector). The engine will NOT
 *                   turn an unverified entry into STEP_FREE: it returns UNKNOWN instead.
 *
 *  platforms: string[]  Subway platforms (or "Entrance" for a street entrance) this elevator
 *                       gives step-free access to. [] = the elevator is not on a subway path
 *                       (Commuter Rail, bus terminal). Names must match between elevators at
 *                       the same station: the engine compares them as plain strings.
 *  Any elevator NOT listed here is "unknown" and an outage of it makes the result UNKNOWN.
 *
 *  GTFS CROSS-CHECK (run `npm run check:gtfs`, MBTA GTFS "Fall 2026, version D"):
 *   - All 68 ids appear in GTFS pathways.txt as elevator pathways at the station listed here.
 *   - Pairs the engine uses as BACKUPS for each other reach the same platform(s) in GTFS:
 *     Alewife 813/961, Porter 983/987, Kendall/MIT 866/777 and 756/757, Government Center 720/721,
 *     Forest Hills 724/842.
 *   - Single-elevator platforms agree with GTFS: Central 860, 861; Charles/MGH 951, 952;
 *     Downtown Crossing 869, 870, 891, 892. Davis 816 is the only elevator to its island platform
 *     (GTFS 70063 + 70064), so it was changed to verified.
 *   - Still needs a human look: entries where GTFS lists MORE platforms next to the elevator than this
 *     map does (State 803, 974, 975; North Station 910, 911; Haymarket 906), and Park Street, where GTFS
 *     splits the westbound Green platform by branch (B, C, D, E) instead of "Copley & West".
 *   - Platform-to-platform connectors (Downtown Crossing 998/999, Government Center 722/723,
 *     State 802/967, Park Street 808/979) stay unverified on purpose.
 *   This is a cross-check against MBTA data, not a site visit.
 *
 * Covered stations: Alewife, Davis, Porter, Harvard, Central, Kendall/MIT, Charles/MGH,
 * Park Street, Downtown Crossing, South Station, Jackson Square, Forest Hills,
 * Government Center, State, Haymarket, North Station.
 * ============================================================================================
 */

export interface PlatformMapEntry {
  stationId: string;
  platforms: string[];
  verified: boolean;
  note?: string;
}

export type PlatformMap = Record<string, PlatformMapEntry>;

const AL = "Alewife platform";
const AB = "Ashmont/Braintree platform";
const OG = "Oak Grove platform";
const FH = "Forest Hills platform";
const WL = "Wonderland platform";
const GCN = "Government Center & North platform";
const CW = "Copley & West platform";
const ENT = "Entrance";

function entry(stationId: string, platforms: string[], verified: boolean, note?: string): PlatformMapEntry {
  return note ? { stationId, platforms, verified, note } : { stationId, platforms, verified };
}

export const PLATFORM_MAP: PlatformMap = {
  // ---- Alewife (place-alfcl): single platform stop in MBTA data (70061) ----
  "813": entry("place-alfcl", ["Platform"], true, "Platform to main lobby"),
  "961": entry("place-alfcl", ["Platform"], true, "Platform to Russell Field, Rindge Avenue lobby"),
  "814": entry("place-alfcl", [ENT], false, "Main lobby to street, parking garage"),
  "815": entry("place-alfcl", [ENT], false, "Main lobby to street, parking garage"),

  // ---- Davis (place-davis): island platform, name says only "Platform" ----
  // GTFS pathways (Fall 2026 version D): 816 is the only elevator next to the Alewife and Ashmont/Braintree
  // platform stops (70063, 70064), which share one island. So "Platform" is confirmed and there is no backup.
  "816": entry("place-davis", ["Platform"], true, "Platform to lobby; GTFS-checked: only elevator to the island platform"),
  "817": entry("place-davis", [ENT], false, "Lobby to College Avenue"),

  // ---- Porter (place-portr) ----
  "983": entry("place-portr", ["Red Line platforms"], true, "Red Line platforms to lobby"),
  "987": entry("place-portr", ["Red Line platforms"], true, "Red Line platforms to lobby"),
  "982": entry("place-portr", [ENT], false, "Lobby to Somerville Avenue & Mass Ave"),
  "985": entry("place-portr", [ENT], false, "Lobby to Somerville Avenue"),
  "986": entry("place-portr", [], true, "Commuter Rail platform to lobby; not a subway path"),

  // ---- Harvard (place-harsq): MBTA lists no platform elevator ----
  "821": entry("place-harsq", [ENT], false, "Lobby to Harvard Square"),
  "973": entry("place-harsq", [ENT], false, "Upper busway to Brattle Square"),

  // ---- Central (place-cntsq) ----
  "860": entry("place-cntsq", [AL], true, "Alewife platform to Massachusetts Avenue"),
  "861": entry("place-cntsq", [AB], true, "Ashmont/Braintree platform to Massachusetts Avenue"),

  // ---- Kendall/MIT (place-knncl) ----
  "866": entry("place-knncl", [AL], true, "Alewife platform to Main Street"),
  "777": entry("place-knncl", [AL], true, "Alewife platform to Main Street"),
  "756": entry("place-knncl", [AB], true, "Ashmont/Braintree platform to Main Street"),
  "757": entry("place-knncl", [AB], true, "Ashmont/Braintree platform to Main Street"),

  // ---- Charles/MGH (place-chmnl) ----
  "952": entry("place-chmnl", [AL], true, "Alewife platform to lobby"),
  "951": entry("place-chmnl", [AB], true, "Ashmont/Braintree platform to lobby"),

  // ---- Park Street (place-pktrm): Red + Green interchange, several connector elevators ----
  "808": entry("place-pktrm", ["Red Line platform", GCN], false, "Red Line center platform to GC & North platform, Winter St Concourse"),
  "979": entry("place-pktrm", ["Red Line platform", CW], false, "Red Line center platform to Copley & West platform"),
  "812": entry("place-pktrm", [GCN], true, "Green Line underpass to Government Center & North platform"),
  "823": entry("place-pktrm", [CW], true, "Green Line underpass to Copley & West platform"),
  "978": entry("place-pktrm", [CW], true, "Copley & West platform to Boston Common"),
  "804": entry("place-pktrm", [ENT], false, "GC & North lobby to Tremont Street, Winter Street"),

  // ---- Downtown Crossing (place-dwnxg) ----
  "869": entry("place-dwnxg", [AL], true, "Alewife platform to Summer Street Concourse"),
  "870": entry("place-dwnxg", [AB], true, "Ashmont/Braintree platform to Summer Street Concourse"),
  "891": entry("place-dwnxg", [OG], true, "Oak Grove platform to Franklin Street"),
  "892": entry("place-dwnxg", [FH], true, "Forest Hills platform to Washington Street, Winter Street"),
  "998": entry("place-dwnxg", [OG, AL], false, "Oak Grove platform to Alewife platform (transfer connector)"),
  "999": entry("place-dwnxg", [OG, AL], false, "Oak Grove platform to Alewife platform (transfer connector)"),

  // ---- South Station (place-sstat) ----
  "901": entry("place-sstat", [AB], false, "Ashmont/Braintree platform to Silver Line drop-off platform and lobby"),
  "918": entry("place-sstat", [AB], false, "Ashmont/Braintree platform to Airport/Design Center/Chelsea platform and lobby"),
  "927": entry("place-sstat", [AL], false, "Alewife platform to Silver Line drop-off platform"),
  "919": entry("place-sstat", [AL], false, "Alewife platform to Airport/Design Center/Chelsea platform"),
  "926": entry("place-sstat", [ENT], false, "Subway lobby to Atlantic Avenue, Summer Street"),
  "949": entry("place-sstat", [ENT], false, "Lobby to Dewey Square"),
  "753": entry("place-sstat", [], true, "Bus Terminal to Commuter Rail concourse; not a subway path"),
  "754": entry("place-sstat", [], true, "Bus Terminal to Commuter Rail concourse; not a subway path"),
  "6476": entry("place-sstat", [], true, "Red Line/Silver Line lobby to Commuter Rail lobby; not a subway path"),

  // ---- Jackson Square (place-jaksn): name says only "Platform" and it has two platform stops ----
  "846": entry("place-jaksn", ["Platform"], false, "Platform to paid lobby"),

  // ---- Forest Hills (place-forhl) ----
  "724": entry("place-forhl", ["Orange Line platform"], true, "Orange Line platform to Southwest Corridor Park lobby"),
  "842": entry("place-forhl", ["Orange Line platform"], true, "Orange Line platform to main upper lobby"),
  "841": entry("place-forhl", [], true, "Commuter Rail platform to lobby; not a subway path"),
  "843": entry("place-forhl", [ENT], false, "Lower busway to upper lobby"),

  // ---- Government Center (place-gover) ----
  "720": entry("place-gover", ["Green Line platform"], true, "Green Line platform to street"),
  "721": entry("place-gover", ["Green Line platform"], true, "Green Line platform to street"),
  "722": entry("place-gover", ["Blue Line platform", "Green Line platform"], false, "Blue Line platform to Green Line platform (transfer connector)"),
  "723": entry("place-gover", ["Blue Line platform", "Green Line platform"], false, "Blue Line platform to Green Line platform (transfer connector)"),

  // ---- State (place-state) ----
  "803": entry("place-state", [FH], true, "Forest Hills platform to Washington Street, Milk Street"),
  "974": entry("place-state", ["Bowdoin platform"], true, "Bowdoin platform to Congress Street, 60 State Street"),
  "975": entry("place-state", [WL], true, "Wonderland platform to Congress Street, 53 State Street"),
  "802": entry("place-state", [OG, FH, WL], false, "Oak Grove platform to Forest Hills, Wonderland platforms (transfer connector)"),
  "967": entry("place-state", [OG, FH, WL], false, "Oak Grove platform to Forest Hills, Wonderland platforms (transfer connector)"),

  // ---- Haymarket (place-haecl) ----
  "903": entry("place-haecl", [OG], true, "Oak Grove platform to Congress Street lobby"),
  "904": entry("place-haecl", [FH], true, "Forest Hills platform to Congress Street lobby"),
  "905": entry("place-haecl", [FH], true, "Underpass to Forest Hills platform"),
  "907": entry("place-haecl", [OG], true, "Underpass to Oak Grove platform"),
  "906": entry("place-haecl", ["Green Line platforms"], true, "Underpass to Green Line platforms, busway"),
  "908": entry("place-haecl", [ENT], false, "Green Line lobby to busway, Sudbury Street, New Chardon Street"),

  // ---- North Station (place-north) ----
  "911": entry("place-north", [OG], true, "Oak Grove platform to paid lobby"),
  "910": entry("place-north", ["Forest Hills, Copley & West platform"], true, "Lobby to Forest Hills, Copley & West platform"),
  "909": entry("place-north", [ENT], false, "Orange Line, Green Line lobby to Valenti Way"),
  "912": entry("place-north", [ENT], false, "Orange Line, Green Line lobby to Causeway Street"),
  "731": entry("place-north", [ENT], false, "Passageway to Causeway Street"),
  "732": entry("place-north", [], true, "Passageway to Commuter Rail, TD Garden; not a subway path"),
};

/** What the Facility type exposes: the platform names, or "unknown" when the elevator is not mapped. */
export function servedPlatforms(facilityId: string, map: PlatformMap = PLATFORM_MAP): string[] | "unknown" {
  const found = map[facilityId];
  return found ? found.platforms : "unknown";
}
