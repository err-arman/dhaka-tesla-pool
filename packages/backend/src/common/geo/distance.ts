// Distance between two points on the earth's surface.
//
// Haversine, not a flat euclidean approximation. The areas are a few kilometres across
// but Dhaka's latitude is ~23.8 degrees north, where the "one degree of longitude is
// always 111 km" shortcut it sits closest to is off by enough to move the 3 km join
// threshold onto the wrong side of a boundary. Haversine costs one asin and a couple of
// trig calls, which is nothing next to the query it is used in.

const EARTH_RADIUS_KM = 6371.0088;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** A point with just enough detail to measure between two locations. */
export type GeoPoint = { lat: number; lng: number };

/**
 * Great-circle distance in kilometres.
 *
 * The clamp on the inner term guards against floating-point drift pushing `a` slightly
 * above 1 for two nearly identical points, which would make `asin` return NaN and turn a
 * "same area" comparison into a false negative that quietly breaks pooling.
 */
export function haversineKm(from: GeoPoint, to: GeoPoint): number {
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);

  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(Math.min(1, Math.max(0, a))));
}

/** True when two points are within `maxKm`, inclusive of the boundary itself. */
export function isWithinKm(from: GeoPoint, to: GeoPoint, maxKm: number): boolean {
  return haversineKm(from, to) <= maxKm;
}
