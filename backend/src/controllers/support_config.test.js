import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { getSupportConfig, updateSupportConfig } from './support.controller.js';

let mongod;
const call = async (handler, req) => {
  const out = {};
  const res = { status(c) { out.code = c; return this; }, json(d) { out.body = d; return this; } };
  await handler(req, res);
  return out;
};

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe('Support helpline config', () => {
  it('rider helpline falls back to main helpline until set', async () => {
    await call(updateSupportConfig, { user: {}, body: { supportPhone: '+91 90000 11111' } });
    const r = await call(getSupportConfig, {});
    expect(r.body.data.riderSupportPhone).toBe('+91 90000 11111');
    expect(r.body.data.riderSupportPhoneIsCustom).toBe(false);
  });

  it('saves a separate rider helpline and clears it back to fallback', async () => {
    const u = await call(updateSupportConfig, { user: {}, body: { riderSupportPhone: '1800-222-3333' } });
    expect(u.code).toBe(200);
    let r = await call(getSupportConfig, {});
    expect(r.body.data.riderSupportPhone).toBe('1800-222-3333');
    expect(r.body.data.riderSupportPhoneIsCustom).toBe(true);
    expect(r.body.data.supportPhone).toBe('+91 90000 11111');

    await call(updateSupportConfig, { user: {}, body: { riderSupportPhone: '' } });
    r = await call(getSupportConfig, {});
    expect(r.body.data.riderSupportPhone).toBe('+91 90000 11111');
  });

  it('rejects invalid values', async () => {
    expect((await call(updateSupportConfig, { user: {}, body: { riderSupportPhone: 'call me' } })).code).toBe(400);
    expect((await call(updateSupportConfig, { user: {}, body: { supportPhone: { $ne: 1 } } })).code).toBe(400);
  });
});
