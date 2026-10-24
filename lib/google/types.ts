// Response shapes of the Google-backed routes. Types only: the browser imports this file, so it must not
// import anything that reads the API key.

/** Missing data is always "unknown", never "yes". */
export type Tri = "yes" | "no" | "unknown";

export interface RestroomPlace {
  id: string;
  name: string;
  distanceMeters: number;
  /** null when Google does not say. */
  openNow: boolean | null;
  wheelchairRestroom: "yes";
  wheelchairEntrance: Tri;
  mapsUrl: string;
}

export interface RestroomsResponse {
  stationId: string;
  places: RestroomPlace[];
  source: "google";
  fetchedAt: string;
}

/** Sent when no Google key is set. The card renders nothing. */
export interface FeatureDisabled {
  enabled: false;
}

/** What we know about the Street View picture of one entrance. */
export interface EntrancePhotoInfo {
  /** true: Google has a picture. false: Google answered and has none. */
  available: boolean;
  /** "YYYY-MM" as Google gives it, or null. */
  captureDate: string | null;
  /** Who owns the photo, as Google gives it (for example "© 2026 Google"), or null. */
  copyright: string | null;
  /** Our own route (never a Google address), or null when there is no picture. */
  imageUrl: string | null;
}

/** An entrance MBTA marks wheelchair accessible. Every field below that is not `photo` or `mapUrl` comes from MBTA. */
export interface AccessibleEntranceInfo {
  id: string;
  /** MBTA's name, unchanged. The card removes MBTA's own "7 | " numbering when it shows it. */
  name: string;
  lat: number;
  lng: number;
  /** null when we do not know: no Google key, or the Google call failed. */
  photo: EntrancePhotoInfo | null;
  /** The station map (the same for every entrance of a station), or null without a Google key. */
  mapUrl: string | null;
  /** A Google Maps link that needs no key. */
  googleMapsLink: string;
}

export interface EntrancesResponse {
  stationId: string;
  stationName: string;
  entrances: AccessibleEntranceInfo[];
}
