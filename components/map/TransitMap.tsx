"use client";
// Interactive MBTA map (MapLibre GL). Client-only: loaded through next/dynamic with ssr:false.
//
// Honesty rules this component follows:
//  - Marker colour comes ONLY from `markers[].status` (the engine's per-station verdict). The map never
//    computes or upgrades a status.
//  - Line geometry is official MBTA shape data, labelled as a reference, never as the rider's path.
//  - The highlighted trip segment exists only for a direct trip (see lib/client/map-geo.ts).
//  - The canvas is decorative for assistive tech: StationList is the accessible equivalent.
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { Map as MlMap, NavigationControl, setWorkerUrl, type GeoJSONSource, type MapLayerMouseEvent } from "maplibre-gl";
import type { AccessStatus } from "@/lib/types";
import type { RouteRelationship } from "@/lib/engine/journey";
import type { StationMarker } from "@/lib/client/types";
import type { NetworkLine } from "@/lib/client/use-status";
import { lineStyle } from "@/lib/client/lines";
import { boundsOf, emphasisedLines, tripSegment } from "@/lib/client/map-geo";

export const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

// MapLibre v6 looks for its worker next to its own ES module, which Next bundles away.
// scripts/copy-map-worker.mjs puts the matching worker in public/vendor on install and build.
setWorkerUrl("/vendor/maplibre-gl-worker.mjs");

const STATUS_HEX: Record<AccessStatus, string> = { STEP_FREE: "#166534", NOT_STEP_FREE: "#991b1b", UNKNOWN: "#4b5563" };
const GLYPH: Record<AccessStatus, string> = { STEP_FREE: "✓", NOT_STEP_FREE: "✕", UNKNOWN: "?" };
const BOSTON: [number, number] = [-71.0765, 42.355];

export interface TransitMapProps {
  markers: StationMarker[];
  lines: NetworkLine[];
  journey?: RouteRelationship;
  originId?: string;
  destinationId?: string;
  alternativeId?: string;
  transferIds?: string[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onFail: (reason: string) => void;
  /** Increments on every result; the map re-fits to the trip when it changes. */
  fitKey: string;
}

function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}

type Role = "origin" | "destination" | "alternative" | "transfer" | "station";

function stationGeoJSON(p: TransitMapProps): GeoJSON.FeatureCollection<GeoJSON.Point> {
  const role = (id: string): Role =>
    id === p.originId ? "origin" : id === p.destinationId ? "destination" : id === p.alternativeId ? "alternative" : p.transferIds?.includes(id) ? "transfer" : "station";
  return {
    type: "FeatureCollection",
    features: p.markers.map((m) => ({
      type: "Feature",
      id: m.id,
      geometry: { type: "Point", coordinates: [m.lng, m.lat] },
      properties: {
        id: m.id,
        name: m.name,
        status: m.status,
        color: STATUS_HEX[m.status],
        glyph: GLYPH[m.status],
        role: role(m.id),
        selected: m.id === p.selectedId,
        // Draw order: plain stations first, the trip on top.
        rank: { station: 0, transfer: 1, alternative: 2, destination: 3, origin: 3 }[role(m.id)],
      },
    })),
  };
}

function linesGeoJSON(p: TransitMapProps): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  const emphasis = emphasisedLines(p.journey);
  return {
    type: "FeatureCollection",
    features: p.lines.map((l) => ({
      type: "Feature",
      geometry: { type: "LineString", coordinates: l.coordinates },
      properties: { color: lineStyle(l.line).hex, emphasis: emphasis.length === 0 || emphasis.includes(l.line) ? 1 : 0 },
    })),
  };
}

function segmentGeoJSON(p: TransitMapProps): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  const byId = new Map(p.markers.map((m) => [m.id, m] as const));
  const seg = tripSegment(p.lines, p.journey, p.originId ? byId.get(p.originId) : null, p.destinationId ? byId.get(p.destinationId) : null);
  return {
    type: "FeatureCollection",
    features: seg ? [{ type: "Feature", geometry: { type: "LineString", coordinates: seg.coordinates }, properties: { color: lineStyle(seg.line).hex } }] : [],
  };
}

export default function TransitMap(props: TransitMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [ready, setReady] = useState(false);
  const latest = useRef(props);
  latest.current = props;

  // Create the map once.
  useEffect(() => {
    if (!container.current) return;
    if (!webglAvailable()) {
      props.onFail("Your browser cannot draw the interactive map (WebGL is off or unsupported).");
      return;
    }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let map: MlMap;
    try {
      map = new MlMap({
        container: container.current,
        style: MAP_STYLE_URL,
        center: BOSTON,
        zoom: 11.2,
        minZoom: 9,
        maxZoom: 17,
        maxBounds: [[-71.6, 42.1], [-70.6, 42.6]],
        attributionControl: { compact: true, customAttribution: "Lines &amp; stations: MBTA V3 API" },
        cooperativeGestures: false,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        reduceMotion: reduce,
      });
    } catch (e) {
      props.onFail(e instanceof Error ? e.message : "The map could not start.");
      return;
    }
    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    map.touchZoomRotate.disableRotation();

    let failed = false;
    const fail = (why: string) => {
      if (failed) return;
      failed = true;
      latest.current.onFail(why);
    };
    // Base tiles failing is not fatal for our layers, but a style failure before load is.
    const timeout = window.setTimeout(() => !map.loaded() && fail("The map tiles took too long to load."), 15000);
    map.on("error", (e) => {
      if (!map.isStyleLoaded()) fail(e.error?.message ? `The map could not load: ${e.error.message}` : "The map could not load.");
    });
    map.on("webglcontextlost", () => fail("The map stopped drawing (graphics context lost)."));

    map.on("load", () => {
      window.clearTimeout(timeout);
      const p = latest.current;
      map.addSource("lines", { type: "geojson", data: linesGeoJSON(p) });
      map.addSource("segment", { type: "geojson", data: segmentGeoJSON(p) });
      map.addSource("stations", { type: "geojson", data: stationGeoJSON(p), promoteId: "id" });

      map.addLayer({
        id: "lines",
        type: "line",
        source: "lines",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": ["get", "color"], "line-width": ["interpolate", ["linear"], ["zoom"], 10, 2.5, 14, 5], "line-opacity": ["case", ["==", ["get", "emphasis"], 1], 0.9, 0.22] },
      });
      map.addLayer({
        id: "segment-casing",
        type: "line",
        source: "segment",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#ffffff", "line-width": ["interpolate", ["linear"], ["zoom"], 10, 9, 14, 14] },
      });
      map.addLayer({
        id: "segment",
        type: "line",
        source: "segment",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": ["get", "color"], "line-width": ["interpolate", ["linear"], ["zoom"], 10, 5, 14, 9] },
      });
      // Halo ring for trip roles (origin/destination/alternative/transfer) and the selected station.
      map.addLayer({
        id: "station-ring",
        type: "circle",
        source: "stations",
        filter: ["any", ["!=", ["get", "role"], "station"], ["==", ["get", "selected"], true]],
        paint: {
          "circle-radius": ["case", ["==", ["get", "selected"], true], 17, ["match", ["get", "role"], ["origin", "destination"], 15, 13]],
          "circle-color": "#ffffff",
          "circle-stroke-width": ["case", ["==", ["get", "selected"], true], 4, 3],
          "circle-stroke-color": ["case", ["==", ["get", "selected"], true], "#0f766e", ["==", ["get", "role"], "alternative"], "#166534", ["==", ["get", "role"], "transfer"], "#b45309", "#0f172a"],
        },
      });
      map.addLayer({
        id: "station-dot",
        type: "circle",
        source: "stations",
        layout: { "circle-sort-key": ["get", "rank"] },
        paint: {
          // `zoom` must be the top-level input; the trip-role size is chosen inside each stop.
          "circle-radius": [
            "interpolate", ["linear"], ["zoom"],
            10, ["case", ["!=", ["get", "role"], "station"], 9, 4],
            13, ["case", ["!=", ["get", "role"], "station"], 9, 7],
            15, ["case", ["!=", ["get", "role"], "station"], 10, 9],
          ],
          "circle-color": ["get", "color"],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.5,
        },
      });
      // Glyph inside the dot so status is not colour alone (shown once dots are big enough).
      map.addLayer({
        id: "station-glyph",
        type: "symbol",
        source: "stations",
        filter: ["any", ["!=", ["get", "role"], "station"], [">=", ["zoom"], 12.5]],
        layout: { "text-field": ["get", "glyph"], "text-font": ["Noto Sans Bold"], "text-size": 11, "text-allow-overlap": true, "text-ignore-placement": true },
        paint: { "text-color": "#ffffff" },
      });
      map.addLayer({
        id: "station-label",
        type: "symbol",
        source: "stations",
        filter: ["any", ["!=", ["get", "role"], "station"], [">=", ["zoom"], 13.5]],
        layout: {
          "text-field": ["get", "name"],
          "text-font": ["Noto Sans Bold"],
          "text-size": ["case", ["!=", ["get", "role"], "station"], 13, 11],
          "text-offset": [0, 1.5],
          "text-anchor": "top",
          "text-optional": true,
        },
        paint: { "text-color": "#0f172a", "text-halo-color": "#ffffff", "text-halo-width": 2 },
      });

      const pick = (e: MapLayerMouseEvent) => {
        const id = e.features?.[0]?.properties?.id;
        if (typeof id === "string") latest.current.onSelect(id);
      };
      map.on("click", "station-dot", pick);
      map.on("mouseenter", "station-dot", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "station-dot", () => (map.getCanvas().style.cursor = ""));
      setReady(true);
    });

    return () => {
      window.clearTimeout(timeout);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push data changes into the existing sources (no re-creation, so scenario switches are smooth).
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    (map.getSource("stations") as GeoJSONSource | undefined)?.setData(stationGeoJSON(props));
    (map.getSource("lines") as GeoJSONSource | undefined)?.setData(linesGeoJSON(props));
    (map.getSource("segment") as GeoJSONSource | undefined)?.setData(segmentGeoJSON(props));
  }, [ready, props.markers, props.lines, props.journey, props.selectedId, props.originId, props.destinationId, props.alternativeId, props.transferIds]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fit to the trip when the result changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const byId = new Map(props.markers.map((m) => [m.id, m] as const));
    const pts = [props.originId, props.destinationId, props.alternativeId, ...(props.transferIds ?? [])].map((id) => (id ? byId.get(id) : undefined));
    const b = boundsOf(pts);
    // Bottom padding clears the attribution bar and the station label drawn under the dot.
    if (b) map.fitBounds(b, { padding: { top: 70, bottom: 95, left: 60, right: 75 }, maxZoom: 14, duration: 900 });
  }, [ready, props.fitKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fly to a station picked from the list.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !props.selectedId) return;
    const m = props.markers.find((x) => x.id === props.selectedId);
    if (m && !map.getBounds().contains([m.lng, m.lat])) map.easeTo({ center: [m.lng, m.lat], duration: 600 });
  }, [ready, props.selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="transit-map relative h-full w-full">
      {/* maplibre-gl.css sets .maplibregl-map{position:relative}, so size by height, not inset. */}
      <div ref={container} className="h-full w-full" aria-hidden="true" />
      {!ready ? (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-sunken" role="status" aria-busy="true">
          <span className="text-sm font-semibold text-ink-soft">Loading map…</span>
        </div>
      ) : null}
    </div>
  );
}
