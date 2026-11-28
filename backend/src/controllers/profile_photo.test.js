import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { connectTestDb, disconnectTestDb, clearCollections } from '../test/dbSetup.js';
import User from '../models/User.js';
import { uploadProfilePhoto, removeProfilePhoto, updateUserProfile } from './user.controller.js';

beforeAll(connectTestDb, 60000);
afterAll(disconnectTestDb, 60000);
afterEach(clearCollections);

const res = () => {
  const r = { statusCode: 200, body: null };
  r.status = (c) => ((r.statusCode = c), r);
  r.json = (b) => ((r.body = b), r);
  return r;
};
const makeUser = () => User.create({ zeebacId: 'ZBC-PH1', name: 'Asha', email: 'asha@test.com', phone: '9000011111', role: 'customer' });

describe('Profile photo', () => {
  it('stores the uploaded image URL (not the image itself)', async () => {
    const u = await makeUser();
    const r = res();
    await uploadProfilePhoto({ user: { id: u._id }, file: { url: 'https://res.cloudinary.com/demo/image/upload/v1/p.jpg', size: 200000 } }, r);
    expect(r.statusCode).toBe(200);
    expect((await User.findById(u._id)).profileImage).toBe('https://res.cloudinary.com/demo/image/upload/v1/p.jpg');
  });

  it('rejects missing files and files over 5 MB', async () => {
    const u = await makeUser();
    const a = res();
    await uploadProfilePhoto({ user: { id: u._id } }, a);
    expect(a.statusCode).toBe(400);
    const b = res();
    await uploadProfilePhoto({ user: { id: u._id }, file: { url: 'https://x/y.jpg', size: 6 * 1024 * 1024 } }, b);
    expect(b.statusCode).toBe(400);
    expect((await User.findById(u._id)).profileImage).toBeFalsy();
  });

  it('remove clears the photo', async () => {
    const u = await makeUser();
    await User.updateOne({ _id: u._id }, { profileImage: 'https://x/y.jpg' });
    const r = res();
    await removeProfilePhoto({ user: { id: u._id } }, r);
    expect(r.statusCode).toBe(200);
    expect((await User.findById(u._id)).profileImage).toBeFalsy();
  });

  it('profile update with one field no longer blanks name / email / phone', async () => {
    const u = await makeUser();
    const r = res();
    await updateUserProfile({ user: { id: u._id }, body: { name: 'Asha K' } }, r);
    const after = await User.findById(u._id);
    expect(after).toMatchObject({ name: 'Asha K', email: 'asha@test.com', phone: '9000011111' });
  });

  it('raw base64 images are not stored through the general profile update', async () => {
    const u = await makeUser();
    await updateUserProfile({ user: { id: u._id }, body: { profileImage: 'data:image/png;base64,AAAA' } }, res());
    expect((await User.findById(u._id)).profileImage).toBeFalsy();
  });
});
