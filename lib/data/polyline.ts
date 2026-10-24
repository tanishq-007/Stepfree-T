// Google encoded-polyline decoder (precision 5), the format MBTA uses for /shapes `polyline`.
// Returns [lng, lat] pairs (GeoJSON order) because the map consumes GeoJSON.
// Throws on malformed input so a corrupt shape is rejected, never drawn wrong.

export type LngLat = [number, number];

export function decodePolyline(encoded: string, precision = 5): LngLat[] {
  const factor = 10 ** precision;
  const out: LngLat[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  const next = (): number => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      if (index >= encoded.length) throw new Error("Truncated polyline");
      byte = encoded.charCodeAt(index++) - 63;
      if (byte < 0 || byte > 63) throw new Error("Invalid polyline character");
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };

  while (index < encoded.length) {
    lat += next();
    lng += next();
    out.push([lng / factor, lat / factor]);
  }
  return out;
}
