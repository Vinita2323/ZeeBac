const EARTH_RADIUS_METERS = 6371000;
const toRadians = (deg) => (deg * Math.PI) / 180;

// Great-circle distance between two GeoJSON [longitude, latitude] points, in
// meters. Good enough for "is this customer plausibly standing at this
// vendor's shop" — no need for anything more precise than the Haversine
// formula at this scale.
export const haversineDistanceMeters = ([lng1, lat1], [lng2, lat2]) => {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(EARTH_RADIUS_METERS * c);
};
