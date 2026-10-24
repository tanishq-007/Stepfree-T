// Per-station verdicts for the map. Pure. Reuses evaluateStation() so a marker can never disagree with
// the rules that decide the trip. A marker is green ONLY when that station's own verdict is STEP_FREE on
// fresh data. "No outage reported" is not enough on its own: evaluateStation also requires MBTA
// wheelchair_boarding = accessible and every elevator question resolved.
import type { AccessStatus, DataSnapshot, UserProfile } from "@/lib/types";
import { PLATFORM_MAP, type PlatformMap } from "@/lib/data/platform-map";
import { checkFreshness, evaluateStation } from "./rules";

export interface StationMarker {
  id: string;
  name: string;
  lines: string[];
  lat: number;
  lng: number;
  wheelchairBoarding: "accessible" | "not_accessible" | "unknown";
  status: AccessStatus;
  reasons: { code: string; message: string }[];
  /** Active alerts at this station, split by how the engine used them. */
  blockingAlertIds: string[];
  infoAlertIds: string[];
}

export function stationStatuses(
  snapshot: DataSnapshot,
  profile: UserProfile,
  now: Date,
  platformMap: PlatformMap = PLATFORM_MAP,
): StationMarker[] {
  const nowMs = now.getTime();
  const fresh = checkFreshness(snapshot.fetchedAt, nowMs);
  return snapshot.stations.map((s) => {
    const v = evaluateStation(s, profile, snapshot, nowMs, platformMap);
    const base = {
      id: s.id,
      name: s.name,
      lines: s.lines,
      lat: s.lat,
      lng: s.lng,
      wheelchairBoarding: s.wheelchairBoarding,
      blockingAlertIds: v.blocking.map((a) => a.id),
      infoAlertIds: v.info.map((a) => a.id),
    };
    if (!fresh.fresh) {
      return {
        ...base,
        status: "UNKNOWN" as const,
        reasons: [{ code: fresh.code ?? "DATA_INVALID", message: "The MBTA data is too old or invalid to check this station." }],
      };
    }
    return { ...base, status: v.status, reasons: v.reasons.map((r) => ({ code: r.code, message: r.message })) };
  });
}
