import PlatformContent from '../models/PlatformContent.js';
import logger from '../utils/logger.js';

export const DEFAULT_PRIVACY_POLICY = `## 1. Information We Collect
We collect information that you provide directly to us, such as when you create or modify your account, request on-demand services, contact customer support, or otherwise communicate with us. This information may include: name, email, phone number, and postal address.

## 2. How We Use Information
We may use the information we collect about you to provide, maintain, and improve our services, including to facilitate payments, send receipts, provide products and services you request, and develop new features.

## 3. Sharing of Information
We may share the information we collect about you with vendors to provide you with the services you request. We will not sell your personal information to third parties without your explicit consent.

## 4. Security Data
We take reasonable measures to help protect information about you from loss, theft, misuse and unauthorized access, disclosure, alteration and destruction.`;

export const DEFAULT_TERMS_OF_SERVICE = `## 1. Acceptance of Terms
By accessing or using the Zeebac platform, you agree to be bound by these Terms of Service. If you do not agree to all the terms and conditions, then you may not access the platform or use any services.

## 2. User Responsibilities
You are responsible for maintaining the security of your account and password. Zeebac cannot and will not be liable for any loss or damage from your failure to comply with this security obligation.

## 3. Cashback & Rewards
Cashback offers and rewards are subject to change without notice. Zeebac reserves the right to modify, suspend, or terminate the cashback program at any time at our sole discretion.

## 4. Vendor Agreements
Vendors must provide accurate business information and honor all promotional offers listed on the Zeebac platform. Failure to do so may result in account suspension or termination.`;

export const LEGAL_AUDIENCES = ['customer', 'vendor', 'delivery'];
const AUDIENCE_LABEL = { customer: 'Customer', vendor: 'Vendor', delivery: 'Delivery Partner' };
const DEFAULT_TITLES = {
  customer: { privacyPolicy: 'Privacy Policy', termsOfService: 'Terms of Service' },
  vendor: { privacyPolicy: 'Vendor Privacy Policy', termsOfService: 'Vendor Terms & Conditions' },
  delivery: { privacyPolicy: 'Delivery Partner Privacy Policy', termsOfService: 'Delivery Partner Terms & Conditions' },
};
export const normalizeAudience = (a) => {
  const v = String(a || '').toLowerCase();
  if (['vendor', 'vendors', 'merchant', 'seller', 'store'].includes(v)) return 'vendor';
  if (['delivery', 'rider', 'riders', 'delivery-partner', 'delivery_partner', 'partner'].includes(v)) return 'delivery';
  return 'customer';
};

// Ensures the content document exists and every audience has its own Privacy Policy + Terms.
// Missing audience documents are seeded once from the existing shared copy, so nothing goes blank.
export const getOrSeedPlatformContent = async () => {
  let doc = await PlatformContent.findOne();
  if (!doc) {
    doc = await PlatformContent.create({
      privacyPolicy: { title: 'Privacy Policy', content: DEFAULT_PRIVACY_POLICY, lastUpdated: new Date() },
      termsOfService: { title: 'Terms of Service', content: DEFAULT_TERMS_OF_SERVICE, lastUpdated: new Date() },
    });
  }
  let changed = false;
  for (const aud of LEGAL_AUDIENCES) {
    for (const key of ['privacyPolicy', 'termsOfService']) {
      const cur = doc.legal?.[aud]?.[key];
      if (!cur || !cur.content) {
        const shared = doc[key] || {};
        doc.set(`legal.${aud}.${key}`, {
          title: aud === 'customer' ? shared.title || DEFAULT_TITLES.customer[key] : DEFAULT_TITLES[aud][key],
          content: shared.content || (key === 'privacyPolicy' ? DEFAULT_PRIVACY_POLICY : DEFAULT_TERMS_OF_SERVICE),
          lastUpdated: shared.lastUpdated || new Date(),
        });
        changed = true;
      }
    }
  }
  if (changed) await doc.save();
  return doc;
};

const pickAudience = (doc, aud) => ({
  audience: aud,
  privacyPolicy: doc.legal[aud].privacyPolicy,
  termsOfService: doc.legal[aud].termsOfService,
});

// Public: GET /api/auth/content/legal?audience=customer|vendor|delivery
export const getPublicLegalContent = async (req, res) => {
  const aud = normalizeAudience(req.query.audience);
  try {
    const doc = await getOrSeedPlatformContent();
    return res.status(200).json({ success: true, data: pickAudience(doc, aud) });
  } catch (error) {
    logger.error(`[getPublicLegalContent] Error: ${error.message}`);
    return res.status(200).json({
      success: true,
      data: {
        audience: aud,
        privacyPolicy: { title: DEFAULT_TITLES[aud].privacyPolicy, content: DEFAULT_PRIVACY_POLICY, lastUpdated: new Date() },
        termsOfService: { title: DEFAULT_TITLES[aud].termsOfService, content: DEFAULT_TERMS_OF_SERVICE, lastUpdated: new Date() },
      },
    });
  }
};

// Admin: GET /api/admin/content/legal → { customer, vendor, delivery } (+ legacy top-level fields)
export const getAdminLegalContent = async (req, res) => {
  try {
    const doc = await getOrSeedPlatformContent();
    const legal = Object.fromEntries(LEGAL_AUDIENCES.map((a) => [a, pickAudience(doc, a)]));
    return res.status(200).json({
      success: true,
      data: { legal, audiences: LEGAL_AUDIENCES.map((a) => ({ key: a, label: AUDIENCE_LABEL[a] })), privacyPolicy: doc.privacyPolicy, termsOfService: doc.termsOfService },
    });
  } catch (error) {
    logger.error(`[getAdminLegalContent] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Admin: PUT /api/admin/content/legal { audience, privacyPolicy?, termsOfService? }
// Updates ONLY the given audience. (No audience → customer, for older admin clients.)
export const updateAdminLegalContent = async (req, res) => {
  try {
    const { privacyPolicy, termsOfService } = req.body;
    const aud = normalizeAudience(req.body.audience);
    const doc = await getOrSeedPlatformContent();

    for (const [key, incoming] of [['privacyPolicy', privacyPolicy], ['termsOfService', termsOfService]]) {
      if (!incoming) continue;
      const title = incoming.title !== undefined ? String(incoming.title).trim() : doc.legal[aud][key].title;
      const content = incoming.content !== undefined ? String(incoming.content) : doc.legal[aud][key].content;
      if (!title) return res.status(400).json({ success: false, message: 'Title is required' });
      if (!content.trim()) return res.status(400).json({ success: false, message: 'Content cannot be empty' });
      doc.set(`legal.${aud}.${key}`, { title, content, lastUpdated: new Date() });
      // Keep the legacy shared copy in sync with the customer version (older app builds read it).
      if (aud === 'customer') doc.set(key, { title, content, lastUpdated: new Date() });
    }
    if (req.user?.id) doc.updatedBy = req.user.id;
    await doc.save();
    return res.status(200).json({
      success: true,
      message: `${AUDIENCE_LABEL[aud]} legal content updated successfully`,
      data: pickAudience(doc, aud),
    });
  } catch (error) {
    logger.error(`[updateAdminLegalContent] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Failed to update legal content' });
  }
};
