import { haversineDistanceMeters } from './geo.util.js';

/**
 * Calculates delivery payout for a rider based on distance and admin configuration.
 *
 * Formula:
 * Payout = Base Fare + (Billable Distance * Rate/km) + Surge Bonus
 * Subject to guaranteed Minimum Payout floor.
 *
 * Example:
 * Base = ₹30, Base Distance Included = 0 km, Rate = ₹10/km
 * - 2 km: 30 + (2 * 10) = ₹50
 * - 5 km: 30 + (5 * 10) = ₹80
 * - 8 km: 30 + (8 * 10) = ₹110
 *
 * @param {number} distanceKm - Total trip distance in kilometers
 * @param {Object} config - Active payout configuration object
 * @returns {Object} Breakdown and final totalPayout
 */
export function calculateDeliveryPayout(distanceKm = 0, config = {}) {
  const baseFare = Number(config?.baseFare ?? 30);
  const baseDistanceIncludedKm = Math.max(0, Number(config?.baseDistanceIncludedKm ?? 0));
  const perKmRate = Number(config?.perKmRate ?? 10);
  const minPayout = Number(config?.minPayout ?? 30);
  const surgeBonus = Number(config?.surgeBonus ?? 0);

  const safeDistance = Math.max(0, Number(distanceKm) || 0);
  const billableDistanceKm = Math.max(0, safeDistance - baseDistanceIncludedKm);
  const distancePayout = Math.round(billableDistanceKm * perKmRate * 100) / 100;

  const rawTotal = baseFare + distancePayout + surgeBonus;
  const totalPayout = Math.max(minPayout, Math.round(rawTotal * 100) / 100);

  return {
    baseFare,
    baseDistanceIncludedKm,
    distanceKm: Math.round(safeDistance * 10) / 10,
    billableDistanceKm: Math.round(billableDistanceKm * 10) / 10,
    perKmRate,
    distancePayout,
    surgeBonus,
    minPayout,
    totalPayout,
  };
}

/**
 * Estimates trip distance in kilometers between store/vendor and customer.
 * Uses exact Haversine distance if coordinates are present, or returns fallback.
 *
 * @param {Object} params
 * @param {Array<number>} [params.vendorCoords] - [lng, lat] GeoJSON coordinates of store
 * @param {Object} [params.customerCoords] - { latitude, longitude } or [lng, lat]
 * @param {number} [params.fallbackKm] - Fallback distance if coordinates missing (default 2.0 km)
 * @returns {number} Distance in kilometers (1 decimal)
 */
export function estimateDistanceKm({ vendorCoords, customerCoords, fallbackKm = 2.0 }) {
  if (
    Array.isArray(vendorCoords) &&
    vendorCoords.length === 2 &&
    !isNaN(vendorCoords[0]) &&
    !isNaN(vendorCoords[1])
  ) {
    let custLng = null;
    let custLat = null;

    if (customerCoords) {
      if (Array.isArray(customerCoords) && customerCoords.length === 2) {
        custLng = Number(customerCoords[0]);
        custLat = Number(customerCoords[1]);
      } else if (customerCoords.latitude !== undefined && customerCoords.longitude !== undefined) {
        custLng = Number(customerCoords.longitude);
        custLat = Number(customerCoords.latitude);
      } else if (customerCoords.lat !== undefined && customerCoords.lng !== undefined) {
        custLng = Number(customerCoords.lng);
        custLat = Number(customerCoords.lat);
      }
    }

    if (custLng !== null && custLat !== null && !isNaN(custLng) && !isNaN(custLat)) {
      const meters = haversineDistanceMeters([vendorCoords[0], vendorCoords[1]], [custLng, custLat]);
      const km = Math.round((meters / 1000) * 10) / 10;
      return Math.max(0.5, km);
    }
  }

  return Math.max(0.5, Number(fallbackKm) || 2.0);
}

