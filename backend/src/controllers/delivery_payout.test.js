import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { connectTestDb, disconnectTestDb, clearCollections } from '../test/dbSetup.js';
import DeliveryPayoutConfig from '../models/DeliveryPayoutConfig.js';
import { calculateDeliveryPayout, estimateDistanceKm } from '../utils/deliveryPayout.util.js';
import {
  getAdminDeliveryPayoutConfig,
  updateAdminDeliveryPayoutConfig,
} from './delivery.controller.js';

beforeAll(connectTestDb, 60000);
afterAll(disconnectTestDb, 60000);

describe('Dynamic Distance-Based Rider Payout Suite', () => {
  beforeEach(async () => {
    await clearCollections();
  });

  it('calculates dynamic payout matching the requested formula: Base ₹30 + (Distance * ₹10/km)', () => {
    const config = {
      baseFare: 30,
      baseDistanceIncludedKm: 0,
      perKmRate: 10,
      minPayout: 30,
      surgeBonus: 0,
    };

    // 2 km drop -> 30 + (2 * 10) = ₹50
    const drop2km = calculateDeliveryPayout(2.0, config);
    expect(drop2km.totalPayout).toBe(50);
    expect(drop2km.distanceKm).toBe(2.0);
    expect(drop2km.distancePayout).toBe(20);

    // 5 km drop -> 30 + (5 * 10) = ₹80
    const drop5km = calculateDeliveryPayout(5.0, config);
    expect(drop5km.totalPayout).toBe(80);
    expect(drop5km.distanceKm).toBe(5.0);
    expect(drop5km.distancePayout).toBe(50);

    // 8 km drop -> 30 + (8 * 10) = ₹110
    const drop8km = calculateDeliveryPayout(8.0, config);
    expect(drop8km.totalPayout).toBe(110);
    expect(drop8km.distanceKm).toBe(8.0);
    expect(drop8km.distancePayout).toBe(80);
  });

  it('calculates payout with included base distance and surge bonus', () => {
    const config = {
      baseFare: 30,
      baseDistanceIncludedKm: 2, // First 2 km covered by base fare
      perKmRate: 10,
      minPayout: 30,
      surgeBonus: 15, // Rainy day bonus
    };

    // 2 km drop with base included + 15 surge -> 30 + 0 + 15 = ₹45
    const drop2km = calculateDeliveryPayout(2.0, config);
    expect(drop2km.totalPayout).toBe(45);
    expect(drop2km.billableDistanceKm).toBe(0);

    // 5 km drop -> 30 + (3 * 10) + 15 = ₹75
    const drop5km = calculateDeliveryPayout(5.0, config);
    expect(drop5km.totalPayout).toBe(75);
    expect(drop5km.billableDistanceKm).toBe(3.0);
  });

  it('respects guaranteed minimum payout floor', () => {
    const config = {
      baseFare: 20,
      baseDistanceIncludedKm: 0,
      perKmRate: 5,
      minPayout: 40, // Minimum guarantee
      surgeBonus: 0,
    };

    // 1 km -> 20 + 5 = 25, but minPayout is 40 -> ₹40
    const drop1km = calculateDeliveryPayout(1.0, config);
    expect(drop1km.totalPayout).toBe(40);
  });

  it('estimates distance using coordinates with Haversine formula', () => {
    // Hazratganj Lucknow store [80.9462, 26.8504] to Gomti Nagar Lucknow customer [80.9992, 26.8529] ~ 5.3 km
    const dist = estimateDistanceKm({
      vendorCoords: [80.9462, 26.8504],
      customerCoords: { longitude: 80.9992, latitude: 26.8529 },
    });
    expect(dist).toBeGreaterThan(4.5);
    expect(dist).toBeLessThan(6.0);
  });

  it('allows Admin to fetch and update dynamic payout configuration', async () => {
    // Initial fetch should create default config
    let resData = null;
    const reqGet = { user: { id: 'admin1', name: 'Super Admin' } };
    const resGet = {
      status(code) {
        expect(code).toBe(200);
        return this;
      },
      json(body) {
        resData = body;
        return this;
      },
    };

    await getAdminDeliveryPayoutConfig(reqGet, resGet);
    expect(resData.success).toBe(true);
    expect(resData.data.baseFare).toBe(30);
    expect(resData.data.perKmRate).toBe(10);

    // Update config to Base ₹35, PerKm ₹12, Surge ₹10
    const reqPut = {
      user: { id: 'admin1', name: 'Super Admin', email: 'admin@zeebac.com' },
      body: {
        baseFare: 35,
        perKmRate: 12,
        baseDistanceIncludedKm: 1,
        surgeBonus: 10,
        minPayout: 40,
        notes: 'Monsoon special rider payout rates',
      },
    };
    let putData = null;
    const resPut = {
      status(code) {
        expect(code).toBe(200);
        return this;
      },
      json(body) {
        putData = body;
        return this;
      },
    };

    await updateAdminDeliveryPayoutConfig(reqPut, resPut);
    expect(putData.success).toBe(true);
    expect(putData.data.baseFare).toBe(35);
    expect(putData.data.perKmRate).toBe(12);
    expect(putData.data.surgeBonus).toBe(10);
    expect(putData.data.changeHistory.length).toBeGreaterThan(0);
    expect(putData.data.changeHistory[0].baseFare).toBe(30); // Old snapshot
  });
});
