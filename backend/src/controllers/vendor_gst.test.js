import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import Vendor from "../models/Vendor.js";
import { getVendorGSTReport, getVendorGSTFilingHistory, fileVendorGST } from "./vendor.controller.js";

let mongod;
const call = async (h, req) => { const o = {}; const res = { status(c) { o.code = c; return this; }, json(d) { o.body = d; return this; } }; await h(req, res); return o; };

beforeAll(async () => { mongod = await MongoMemoryServer.create(); await mongoose.connect(mongod.getUri()); });
afterAll(async () => { await mongoose.disconnect(); await mongod.stop(); });

describe("Vendor GST endpoints without req.vendor (normal vendor token)", () => {
  it("report, file and history work using req.user.id", async () => {
    const v = await new Vendor({ storeName: "GST Test Store", ownerName: "Owner", phone: "9876500011", zeebacId: "ZBV-GST1", status: "Verified" }).save({ validateBeforeSave: false });
    const req = { user: { id: v._id.toString(), role: "vendor" } };

    const r = await call(getVendorGSTReport, { ...req, query: { year: "2026", month: "11" } });
    expect(r.body?.message || "").not.toMatch(/Failed/);
    expect(r.code).toBe(200);

    const f = await call(fileVendorGST, { ...req, body: { period: "2026-11" } });
    expect(f.code).toBe(200);

    const h = await call(getVendorGSTFilingHistory, req);
    expect(h.code).toBe(200);
    expect(h.body.data).toHaveLength(1);
  });

  it("returns 404 instead of crashing for an unknown vendor", async () => {
    const r = await call(getVendorGSTFilingHistory, { user: { id: new mongoose.Types.ObjectId().toString() } });
    expect(r.code).toBe(404);
  });
});
