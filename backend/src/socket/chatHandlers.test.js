import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { connectTestDb, disconnectTestDb, clearCollections } from '../test/dbSetup.js';
import Vendor from '../models/Vendor.js';
import User from '../models/User.js';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import registerChatHandlers from './chatHandlers.js';

beforeAll(connectTestDb, 60000);
afterAll(disconnectTestDb, 60000);
afterEach(clearCollections);

// Minimal fake socket.io server/socket — captures registered `on()` handlers
// so we can invoke them directly, the same way the real server would when a
// client emits, without needing a live socket connection.
function makeFakeSocket(user) {
  const handlers = {};
  const socket = {
    user,
    on: (event, handler) => { handlers[event] = handler; },
    join: () => {},
    leave: () => {},
  };
  return { socket, handlers };
}

function makeFakeIo() {
  const emitted = [];
  return {
    to: (room) => ({ emit: (event, payload) => emitted.push({ room, event, payload }) }),
    emitted,
  };
}

describe('chatHandlers sendMessage (QA regression)', () => {
  it('persists a message and updates the conversation preview', async () => {
    const vendor = await Vendor.create({ zeebacId: 'ZBV-CHAT1', ownerName: 'Chat Vendor Owner', storeName: 'Chat Vendor', phone: '9811100001', status: 'Verified' });
    const customer = await User.create({ name: 'Chat Customer', phone: '7811100001', zeebacId: 'ZBC-CHAT1' });
    const conversation = await Conversation.create({ vendorId: vendor._id, customerId: customer._id });

    const io = makeFakeIo();
    const { socket, handlers } = makeFakeSocket({ id: customer._id.toString(), role: 'customer' });
    registerChatHandlers(io, socket);

    const callbackResult = await new Promise((resolve) => {
      handlers.sendMessage({ conversationId: conversation._id.toString(), text: 'Hello vendor' }, resolve);
    });

    expect(callbackResult.success).toBe(true);

    const messages = await Message.find({ conversationId: conversation._id });
    expect(messages).toHaveLength(1);
    expect(messages[0].text).toBe('Hello vendor');
    expect(messages[0].sender).toBe('customer');

    const updatedConv = await Conversation.findById(conversation._id);
    expect(updatedConv.lastMessage).toBe('Hello vendor');
    expect(updatedConv.unreadByVendor).toBe(1);

    // Real-time events fired to the right rooms
    expect(io.emitted.some((e) => e.room === conversation._id.toString() && e.event === 'newMessage')).toBe(true);
    expect(io.emitted.some((e) => e.room === `vendor_${vendor._id}` && e.event === 'conversationUpdated')).toBe(true);
  });

  it('two sends in a row create two distinct messages, each persisted and ordered', async () => {
    const vendor = await Vendor.create({ zeebacId: 'ZBV-CHAT2', ownerName: 'Chat Vendor Owner 2', storeName: 'Chat Vendor 2', phone: '9811100002', status: 'Verified' });
    const customer = await User.create({ name: 'Chat Customer 2', phone: '7811100002', zeebacId: 'ZBC-CHAT2' });
    const conversation = await Conversation.create({ vendorId: vendor._id, customerId: customer._id });

    const io = makeFakeIo();
    const { socket, handlers } = makeFakeSocket({ id: customer._id.toString(), role: 'customer' });
    registerChatHandlers(io, socket);

    await new Promise((resolve) => handlers.sendMessage({ conversationId: conversation._id.toString(), text: 'First' }, resolve));
    await new Promise((resolve) => handlers.sendMessage({ conversationId: conversation._id.toString(), text: 'Second' }, resolve));

    const messages = await Message.find({ conversationId: conversation._id }).sort({ createdAt: 1 });
    expect(messages).toHaveLength(2);
    expect(messages.map((m) => m.text)).toEqual(['First', 'Second']);

    const updatedConv = await Conversation.findById(conversation._id);
    expect(updatedConv.lastMessage).toBe('Second'); // preview reflects the latest, not the first
    expect(updatedConv.unreadByVendor).toBe(2);
  });

  // Documents current behavior: sendMessage has no server-side dedup, so a
  // literal client retry (same conversation+text sent twice) creates two
  // rows. Not exploitable today since the frontend never auto-retries a
  // failed send — this test exists so a future retry feature can't silently
  // start duplicating messages without a test noticing.
  it('(documents current gap) an identical retried send is NOT deduped — creates a second message', async () => {
    const vendor = await Vendor.create({ zeebacId: 'ZBV-CHAT3', ownerName: 'Chat Vendor Owner 3', storeName: 'Chat Vendor 3', phone: '9811100003', status: 'Verified' });
    const customer = await User.create({ name: 'Chat Customer 3', phone: '7811100003', zeebacId: 'ZBC-CHAT3' });
    const conversation = await Conversation.create({ vendorId: vendor._id, customerId: customer._id });

    const io = makeFakeIo();
    const { socket, handlers } = makeFakeSocket({ id: customer._id.toString(), role: 'customer' });
    registerChatHandlers(io, socket);

    const payload = { conversationId: conversation._id.toString(), text: 'Retry me' };
    await new Promise((resolve) => handlers.sendMessage(payload, resolve));
    await new Promise((resolve) => handlers.sendMessage(payload, resolve));

    const messages = await Message.find({ conversationId: conversation._id });
    expect(messages).toHaveLength(2); // current behavior — see comment above
  });
});

describe('chatHandlers markAsRead — blue tick only when the actual recipient reads it (QA regression)', () => {
  // Regression test: markAsRead used to set the shared lastMessageIsRead
  // flag to true whenever EITHER side's own unread count was simply > 0 —
  // not whether that side was actually the recipient of the last message.
  // So a customer re-opening a thread where THEY sent the last message
  // (while still having an unrelated older unread count from the vendor)
  // would incorrectly show a blue "seen by vendor" tick the vendor never
  // earned.
  it('the sender re-reading their own last message does not mark it seen; the real recipient reading it does', async () => {
    const vendor = await Vendor.create({ zeebacId: 'ZBV-CHAT4', ownerName: 'Chat Vendor Owner 4', storeName: 'Chat Vendor 4', phone: '9811100004', status: 'Verified' });
    const customer = await User.create({ name: 'Chat Customer 4', phone: '7811100004', zeebacId: 'ZBC-CHAT4' });
    const conversation = await Conversation.create({ vendorId: vendor._id, customerId: customer._id });

    const io = makeFakeIo();
    const { socket: vendorSocket, handlers: vendorHandlers } = makeFakeSocket({ id: vendor._id.toString(), role: 'vendor' });
    const { socket: customerSocket, handlers: customerHandlers } = makeFakeSocket({ id: customer._id.toString(), role: 'customer' });
    registerChatHandlers(io, vendorSocket);
    registerChatHandlers(io, customerSocket);

    // Vendor messages first, leaving the customer with a real unread count.
    await new Promise((resolve) => vendorHandlers.sendMessage({ conversationId: conversation._id.toString(), text: 'Hi, how can I help?' }, resolve));
    // Customer then replies — they are now the sender of the LAST message.
    await new Promise((resolve) => customerHandlers.sendMessage({ conversationId: conversation._id.toString(), text: 'Just browsing, thanks' }, resolve));

    let conv = await Conversation.findById(conversation._id);
    expect(conv.lastMessageBy).toBe('customer');
    expect(conv.unreadByCustomer).toBe(1); // still hasn't read the vendor's earlier message
    expect(conv.lastMessageIsRead).toBe(false);

    // Customer re-opens the thread (clearing their OWN unread count from the
    // vendor's earlier message) — this must NOT flip lastMessageIsRead,
    // since the customer is the SENDER of the last message, not its recipient.
    await customerHandlers.markAsRead(conversation._id.toString());
    conv = await Conversation.findById(conversation._id);
    expect(conv.unreadByCustomer).toBe(0);
    expect(conv.lastMessageIsRead).toBe(false); // the bug: this used to become true here

    // The vendor — the ACTUAL recipient of the customer's last message —
    // now genuinely reads it, which correctly flips the tick blue.
    await vendorHandlers.markAsRead(conversation._id.toString());
    conv = await Conversation.findById(conversation._id);
    expect(conv.unreadByVendor).toBe(0);
    expect(conv.lastMessageIsRead).toBe(true);
  });
});
