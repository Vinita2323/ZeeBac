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

// Helper to ensure at least one document exists
export const getOrSeedPlatformContent = async () => {
  let doc = await PlatformContent.findOne();
  if (!doc) {
    doc = await PlatformContent.create({
      privacyPolicy: {
        title: 'Privacy Policy',
        content: DEFAULT_PRIVACY_POLICY,
        lastUpdated: new Date(),
      },
      termsOfService: {
        title: 'Terms of Service',
        content: DEFAULT_TERMS_OF_SERVICE,
        lastUpdated: new Date(),
      },
    });
  }
  return doc;
};

// Public: GET /api/auth/content/legal
export const getPublicLegalContent = async (req, res) => {
  try {
    const doc = await getOrSeedPlatformContent();
    return res.status(200).json({
      success: true,
      data: {
        privacyPolicy: doc.privacyPolicy,
        termsOfService: doc.termsOfService,
      },
    });
  } catch (error) {
    logger.error(`[getPublicLegalContent] Error: ${error.message}`);
    return res.status(200).json({
      success: true,
      data: {
        privacyPolicy: { title: 'Privacy Policy', content: DEFAULT_PRIVACY_POLICY, lastUpdated: new Date() },
        termsOfService: { title: 'Terms of Service', content: DEFAULT_TERMS_OF_SERVICE, lastUpdated: new Date() },
      },
    });
  }
};

// Admin: GET /api/admin/content/legal
export const getAdminLegalContent = async (req, res) => {
  try {
    const doc = await getOrSeedPlatformContent();
    return res.status(200).json({ success: true, data: doc });
  } catch (error) {
    logger.error(`[getAdminLegalContent] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Admin: PUT /api/admin/content/legal
export const updateAdminLegalContent = async (req, res) => {
  try {
    const { privacyPolicy, termsOfService } = req.body;
    let doc = await getOrSeedPlatformContent();

    if (privacyPolicy) {
      if (privacyPolicy.title !== undefined) doc.privacyPolicy.title = privacyPolicy.title;
      if (privacyPolicy.content !== undefined) doc.privacyPolicy.content = privacyPolicy.content;
      doc.privacyPolicy.lastUpdated = new Date();
    }

    if (termsOfService) {
      if (termsOfService.title !== undefined) doc.termsOfService.title = termsOfService.title;
      if (termsOfService.content !== undefined) doc.termsOfService.content = termsOfService.content;
      doc.termsOfService.lastUpdated = new Date();
    }

    if (req.user?.id) {
      doc.updatedBy = req.user.id;
    }

    await doc.save();
    return res.status(200).json({
      success: true,
      message: 'Legal content updated successfully',
      data: doc,
    });
  } catch (error) {
    logger.error(`[updateAdminLegalContent] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Failed to update legal content' });
  }
};
