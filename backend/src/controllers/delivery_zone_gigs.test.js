import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import DeliveryPartner from '../models/DeliveryPartner.js';
import DeliveryZone from '../models/DeliveryZone.js';
import DeliveryPayoutConfig from '../models/DeliveryPayoutConfig.js';
import {
  getDeliveryZones,
  updateRiderWorkingZone,
  getRiderGigs,
  bookRiderGig,
  cancelRiderGig,
  checkInRiderGig,
} from './delivery.controller.js';

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);

  await DeliveryPayoutConfig.create({
    baseFare: 30,
    perKmRate: 10,
    minPayout: 30,
    maxCashInHandLimit: 1500,
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe('Rider Working Area Selection & Gig Booking Lifecycle Suite', () => {
  let rider;

  beforeEach(async () => {
    await DeliveryPartner.deleteMany({});
    await DeliveryZone.deleteMany({});

    rider = await DeliveryPartner.create({
      riderId: 'RDR-TEST-001',
      name: 'Vikas Rider',
      phone: '9876543210',
      applicationStatus: 'APPROVED',
      isOnline: false,
      status: 'OFFLINE',
      cashInHand: 0,
      workingZone: 'Gomti Nagar',
      workingCity: 'Lucknow',
    });
  });

  const mockRes = () => {
    const res = {};
    res.statusCode = 200;
    res.status = (code) => {
      res.statusCode = code;
      return res;
    };
    res.json = (data) => {
      res.data = data;
      return res;
    };
    return res;
  };

  it('1. seeds default zones and fetches zones for rider city', async () => {
    const req = {
      user: { id: rider._id.toString() },
      query: { city: 'Lucknow' },
    };
    const res = mockRes();

    await getDeliveryZones(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data.zones)).toBe(true);
    expect(res.data.data.zones.length).toBeGreaterThan(0);

    const gomti = res.data.data.zones.find((z) => z.name === 'Gomti Nagar');
    expect(gomti).toBeDefined();
    expect(gomti.city).toBe('Lucknow');
    expect(gomti.surgeBonus).toBe(20);
    expect(gomti.demandLevel).toBe('SURGE');
  });

  it('2. updates rider working zone and city correctly', async () => {
    const req = {
      user: { id: rider._id.toString() },
      body: {
        zoneName: 'Hazratganj & Central',
        city: 'Lucknow',
      },
    };
    const res = mockRes();

    await updateRiderWorkingZone(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.workingZone).toBe('Hazratganj & Central');
    expect(res.data.data.workingCity).toBe('Lucknow');

    const updatedRider = await DeliveryPartner.findById(rider._id);
    expect(updatedRider.workingZone).toBe('Hazratganj & Central');
  });

  it('3. returns 7-day gig schedule and slots for working zone', async () => {
    const req = {
      user: { id: rider._id.toString() },
      query: { zoneName: 'Gomti Nagar' },
    };
    const res = mockRes();

    await getRiderGigs(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.days.length).toBe(7);
    expect(res.data.data.days[0].isToday).toBe(true);
    expect(res.data.data.slots.length).toBeGreaterThan(0);
  });

  it('4. books a gig slot and prevents duplicate booking on the same date', async () => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const bookReq = {
      user: { id: rider._id.toString() },
      body: {
        date: todayStr,
        slotId: 'slot_3', // Evening Peak Surge
        zoneName: 'Gomti Nagar',
      },
    };
    const res1 = mockRes();

    await bookRiderGig(bookReq, res1);

    expect(res1.statusCode).toBe(201);
    expect(res1.data.success).toBe(true);
    expect(res1.data.data.slotId).toBe('slot_3');
    expect(res1.data.data.status).toBe('BOOKED');
    expect(res1.data.data.surgeBonus).toBe(20);

    // Duplicate booking check
    const res2 = mockRes();
    await bookRiderGig(bookReq, res2);

    expect(res2.statusCode).toBe(400);
    expect(res2.data.success).toBe(false);
    expect(res2.data.message).toContain('already booked');
  });

  it('5. checks in to booked gig and automatically turns rider ONLINE', async () => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const bookReq = {
      user: { id: rider._id.toString() },
      body: {
        date: todayStr,
        slotId: 'slot_1',
        zoneName: 'Gomti Nagar',
      },
    };
    const bookRes = mockRes();
    await bookRiderGig(bookReq, bookRes);
    const gigId = bookRes.data.data.gigId;

    // Verify initial rider status is offline
    const riderBefore = await DeliveryPartner.findById(rider._id);
    expect(riderBefore.isOnline).toBe(false);

    // Check-in
    const checkInReq = {
      user: { id: rider._id.toString() },
      params: { gigId },
    };
    const checkInRes = mockRes();
    await checkInRiderGig(checkInReq, checkInRes);

    expect(checkInRes.statusCode).toBe(200);
    expect(checkInRes.data.success).toBe(true);
    expect(checkInRes.data.isOnline).toBe(true);
    expect(checkInRes.data.status).toBe('AVAILABLE');
    expect(checkInRes.data.data.gig.status).toBe('CHECKED_IN');

    // DB verify
    const riderAfter = await DeliveryPartner.findById(rider._id);
    expect(riderAfter.isOnline).toBe(true);
    expect(riderAfter.status).toBe('AVAILABLE');
  });

  it('6. cancels booked gig slot successfully', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);

    const bookReq = {
      user: { id: rider._id.toString() },
      body: {
        date: tomorrowStr,
        slotId: 'slot_2',
        zoneName: 'Gomti Nagar',
      },
    };
    const bookRes = mockRes();
    await bookRiderGig(bookReq, bookRes);
    const gigId = bookRes.data.data.gigId;

    const cancelReq = {
      user: { id: rider._id.toString() },
      params: { gigId },
    };
    const cancelRes = mockRes();
    await cancelRiderGig(cancelReq, cancelRes);

    expect(cancelRes.statusCode).toBe(200);
    expect(cancelRes.data.success).toBe(true);
    expect(cancelRes.data.data.status).toBe('CANCELLED');

    const updatedRider = await DeliveryPartner.findById(rider._id);
    const gig = updatedRider.bookedGigs.find((g) => g.gigId === gigId);
    expect(gig.status).toBe('CANCELLED');
  });

  it('7. blocks gig check-in if cash in hand exceeds pocket limit', async () => {
    // Set rider cash in hand to ₹1,600 (exceeding ₹1,500 limit)
    await DeliveryPartner.findByIdAndUpdate(rider._id, { cashInHand: 1600 });

    const todayStr = new Date().toISOString().slice(0, 10);
    const bookReq = {
      user: { id: rider._id.toString() },
      body: {
        date: todayStr,
        slotId: 'slot_4',
        zoneName: 'Gomti Nagar',
      },
    };
    const bookRes = mockRes();
    await bookRiderGig(bookReq, bookRes);
    const gigId = bookRes.data.data.gigId;

    const checkInReq = {
      user: { id: rider._id.toString() },
      params: { gigId },
    };
    const checkInRes = mockRes();
    await checkInRiderGig(checkInReq, checkInRes);

    expect(checkInRes.statusCode).toBe(403);
    expect(checkInRes.data.code).toBe('CASH_LIMIT_EXCEEDED');
    expect(checkInRes.data.cashInHand).toBe(1600);

    // Rider should remain offline
    const updatedRider = await DeliveryPartner.findById(rider._id);
    expect(updatedRider.isOnline).toBe(false);
  });
});
