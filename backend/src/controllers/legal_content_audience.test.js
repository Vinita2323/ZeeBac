import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { connectTestDb, disconnectTestDb, clearCollections } from '../test/dbSetup.js';
import PlatformContent from '../models/PlatformContent.js';
import { getPublicLegalContent, getAdminLegalContent, updateAdminLegalContent } from './platformContent.controller.js';

beforeAll(connectTestDb, 60000);
afterAll(disconnectTestDb, 60000);
afterEach(clearCollections);

const res = () => {
  const r = { statusCode: 200, body: null };
  r.status = (c) => ((r.statusCode = c), r);
  r.json = (b) => ((r.body = b), r);
  return r;
};
const pub = async (audience) => {
  const r = res();
  await getPublicLegalContent({ query: audience ? { audience } : {} }, r);
  return r.body.data;
};
const put = async (body) => {
  const r = res();
  await updateAdminLegalContent({ body, user: {} }, r);
  return r;
};

describe('Legal content per audience', () => {
  it('existing shared content is preserved and seeded into each audience with its own title', async () => {
    await PlatformContent.create({
      privacyPolicy: { title: 'Privacy Policy', content: '## Existing privacy text', lastUpdated: new Date() },
      termsOfService: { title: 'Terms of Service', content: '## Existing terms text', lastUpdated: new Date() },
    });
    const c = await pub('customer');
    const v = await pub('vendor');
    const d = await pub('delivery');
    expect(c.privacyPolicy.content).toBe('## Existing privacy text');
    expect(v.termsOfService.content).toBe('## Existing terms text');
    expect(c.termsOfService.title).toBe('Terms of Service');
    expect(v.termsOfService.title).toBe('Vendor Terms & Conditions');
    expect(d.privacyPolicy.title).toBe('Delivery Partner Privacy Policy');
  });

  it('editing one audience never changes the others', async () => {
    await put({ audience: 'vendor', termsOfService: { title: 'Seller Agreement', content: '## Vendor only terms' } });
    await put({ audience: 'delivery', privacyPolicy: { title: 'Rider Privacy', content: '## Rider privacy' } });
    expect((await pub('vendor')).termsOfService).toMatchObject({ title: 'Seller Agreement', content: '## Vendor only terms' });
    expect((await pub('delivery')).privacyPolicy).toMatchObject({ title: 'Rider Privacy', content: '## Rider privacy' });
    expect((await pub('customer')).termsOfService.content).not.toBe('## Vendor only terms');
    expect((await pub('delivery')).termsOfService.content).not.toBe('## Vendor only terms');
    expect((await pub('vendor')).privacyPolicy.content).not.toBe('## Rider privacy');
  });

  it('customer edits keep the legacy shared copy in sync; no audience defaults to customer', async () => {
    await put({ termsOfService: { title: 'Customer T&C', content: '## Customer terms v2' } });
    expect((await pub()).termsOfService.content).toBe('## Customer terms v2');
    const doc = await PlatformContent.findOne();
    expect(doc.termsOfService.content).toBe('## Customer terms v2');
    expect((await pub('vendor')).termsOfService.content).not.toBe('## Customer terms v2');
  });

  it('rejects empty content, accepts aliases (rider → delivery)', async () => {
    const r = await put({ audience: 'vendor', privacyPolicy: { title: 'X', content: '   ' } });
    expect(r.statusCode).toBe(400);
    await put({ audience: 'rider', termsOfService: { title: 'Rider T', content: '## r' } });
    expect((await pub('delivery')).termsOfService.title).toBe('Rider T');
  });

  it('admin GET returns all three audiences', async () => {
    const r = res();
    await getAdminLegalContent({}, r);
    expect(Object.keys(r.body.data.legal)).toEqual(['customer', 'vendor', 'delivery']);
    expect(r.body.data.audiences.map((a) => a.label)).toEqual(['Customer', 'Vendor', 'Delivery Partner']);
  });
});
