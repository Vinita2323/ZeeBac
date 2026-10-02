import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { connectTestDb, disconnectTestDb, clearCollections } from '../test/dbSetup.js';
import Vendor from '../models/Vendor.js';
import User from '../models/User.js';
import Conversation from '../models/Conversation.js';
import { getMessages } from './chat.controller.js';

vi.mock('../socket/socket.js', () => ({ getIO: () => ({ to: () => ({ emit: () => {} }) }) }));

beforeAll(connectTestDb, 60000);
afterAll(disconnectTestDb, 60000);
afterEach(clearCollections);

const mockRes = () => {
  const res = {};
  res.statusCode = 200;
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (payload) => { res.body = payload; return res; };
  return res;
};

// Regression test: GET /chat/conversations/:id/messages used the same buggy
// pattern as the socket markAsRead handler — it flipped the shared
// lastMessageIsRead flag to true whenever the CALLER's own unread count was
// simply > 0, regardless of whether the caller was actually the recipient
// of the last message. See chatHandlers.test.js for the socket-path
// equivalent of this exact scenario.
describe('getMessages — blue tick only when the actual recipient reads it (QA regression)', () => {
  it("the sender fetching their own last message does not mark it seen by the other party", async () => {
    const vendor = await Vendor.create({ zeebacId: 'ZBV-CHATC1', ownerName: 'Owner', storeName: 'Store', phone: '9822200001', status: 'Verified' });
    const customer = await User.create({ name: 'Customer', phone: '7822200001', zeebacId: 'ZBC-CHATC1' });
    const conversation = await Conversation.create({
      vendorId: vendor._id,
      customerId: customer._id,
      lastMessage: 'Just browsing, thanks',
      lastMessageBy: 'customer',
      unreadByVendor: 1,
      unreadByCustomer: 1, // stale unread from an earlier vendor message the customer hasn't opened yet
      lastMessageIsRead: false,
    });

    // Customer fetches messages (e.g. re-opening the thread), clearing their
    // OWN unread count — must NOT mark the conversation as seen, since the
    // customer is the sender of the last message, not its recipient.
    const res1 = mockRes();
    await getMessages({ params: { id: conversation._id.toString() }, query: {}, user: { id: customer._id.toString(), role: 'customer' } }, res1);
    expect(res1.statusCode).toBe(200);

    let conv = await Conversation.findById(conversation._id);
    expect(conv.unreadByCustomer).toBe(0);
    expect(conv.lastMessageIsRead).toBe(false); // the bug: this used to become true here

    // The vendor — the actual recipient — now genuinely reads it.
    const res2 = mockRes();
    await getMessages({ params: { id: conversation._id.toString() }, query: {}, user: { id: vendor._id.toString(), role: 'vendor' } }, res2);
    expect(res2.statusCode).toBe(200);

    conv = await Conversation.findById(conversation._id);
    expect(conv.unreadByVendor).toBe(0);
    expect(conv.lastMessageIsRead).toBe(true);
  });
});
