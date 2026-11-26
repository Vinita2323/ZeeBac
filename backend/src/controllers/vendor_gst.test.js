import { describe, it, expect, beforeAll, afterAll } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import Vendor from "../models/Vendor.js";
import Order from "../models/Order.js";
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

describe("GST slab breakdown", () => {
  it("returns slabs keyed by rate, grouping each invoice by its effective GST rate", async () => {
    const v = await new Vendor({ storeName: "Slab Store", ownerName: "O", phone: "9876500022", zeebacId: "ZBV-GST2", status: "Verified" }).save({ validateBeforeSave: false });
    const when = new Date(2026, 10, 10);
    // 5% order: taxable 1000, tax 50 ; 18% order: taxable 200, tax 36 ; 0% order: no tax
    await Order.collection.insertMany([
      { vendorId: v._id, orderId: "S1", itemTotal: 1000, taxAmount: 50, finalPayableAmount: 1050, orderStatus: "DELIVERED", createdAt: when },
      { vendorId: v._id, orderId: "S2", itemTotal: 200, taxAmount: 36, finalPayableAmount: 236, orderStatus: "DELIVERED", createdAt: when },
      { vendorId: v._id, orderId: "S3", itemTotal: 300, taxAmount: 0, finalPayableAmount: 300, orderStatus: "DELIVERED", createdAt: when },
    ]);
    const r = await call(getVendorGSTReport, { user: { id: v._id.toString() }, query: { year: "2026", month: "11" } });
    expect(r.code).toBe(200);
    const sl = r.body.data.slabs;
    expect(Object.keys(sl).sort()).toEqual(["0", "12", "18", "28", "5"]);
    expect(sl["5"]).toMatchObject({ salesTaxable: 1000, outputGst: 50, netGst: 50 });
    expect(sl["18"]).toMatchObject({ salesTaxable: 200, outputGst: 36 });
    expect(sl["12"]).toMatchObject({ salesTaxable: 0, outputGst: 0 });
    for (const x of Object.values(sl)) for (const k of ["purchaseTaxable", "inputGst", "salesTaxable", "outputGst", "netGst"]) expect(typeof x[k]).toBe("number");
  });
});
