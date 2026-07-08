import StorefrontMedia from '../models/StorefrontMedia.js';
import Promotion from '../models/Promotion.js';
import logger from '../utils/logger.js';

// ─── MEDIA ──────────────────────────────────────────────────────────────────

// GET vendor's own media gallery
export const getMyMedia = async (req, res) => {
  try {
    const media = await StorefrontMedia.find({ vendorId: req.user.id, isActive: true })
      .sort({ sortOrder: 1, createdAt: -1 });
    res.status(200).json({ success: true, data: media });
  } catch (err) {
    logger.error(`getMyMedia error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// POST upload media
export const uploadMedia = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    const { caption, sortOrder } = req.body;
    const url = `/uploads/media/${req.file.filename}`;

    const media = await StorefrontMedia.create({
      vendorId: req.user.id,
      type: req.file.mimetype.startsWith('video') ? 'video' : 'image',
      url,
      caption: caption || '',
      sortOrder: sortOrder ? parseInt(sortOrder) : 0,
    });

    logger.info(`[Media] Vendor ${req.user.id} uploaded media: ${media._id}`);
    res.status(201).json({ success: true, data: media });
  } catch (err) {
    logger.error(`uploadMedia error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// DELETE media
export const deleteMedia = async (req, res) => {
  try {
    const media = await StorefrontMedia.findOne({ _id: req.params.id, vendorId: req.user.id });
    if (!media) return res.status(404).json({ success: false, message: 'Media not found' });
    await StorefrontMedia.findByIdAndDelete(req.params.id);
    res.status(200).json({ success: true, message: 'Deleted successfully' });
  } catch (err) {
    logger.error(`deleteMedia error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// GET vendor media for public (user viewing store page)
export const getVendorMedia = async (req, res) => {
  try {
    const media = await StorefrontMedia.find({ vendorId: req.params.vendorId, isActive: true })
      .sort({ sortOrder: 1, createdAt: -1 });
    res.status(200).json({ success: true, data: media });
  } catch (err) {
    logger.error(`getVendorMedia error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// ─── PROMOTIONS ──────────────────────────────────────────────────────────────

// GET vendor's own promotions
export const getMyPromotions = async (req, res) => {
  try {
    const promotions = await Promotion.find({ vendorId: req.user.id })
      .sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: promotions });
  } catch (err) {
    logger.error(`getMyPromotions error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// POST create promotion
export const createPromotion = async (req, res) => {
  try {
    const { title, description, type, value, minPurchase, validUntil } = req.body;
    if (!title || !description) {
      return res.status(400).json({ success: false, message: 'Title and Description are required' });
    }
    const promotion = await Promotion.create({
      vendorId: req.user.id,
      title,
      description,
      type: type || 'percent',
      value: value || 0,
      minPurchase: minPurchase || 0,
      validUntil: validUntil || null,
    });
    logger.info(`[Promotions] Vendor ${req.user.id} created promotion: ${promotion._id}`);
    res.status(201).json({ success: true, data: promotion });
  } catch (err) {
    logger.error(`createPromotion error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// PUT toggle promotion active status
export const togglePromotion = async (req, res) => {
  try {
    const promo = await Promotion.findOne({ _id: req.params.id, vendorId: req.user.id });
    if (!promo) return res.status(404).json({ success: false, message: 'Promotion not found' });
    promo.isActive = !promo.isActive;
    await promo.save();
    res.status(200).json({ success: true, data: promo });
  } catch (err) {
    logger.error(`togglePromotion error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// DELETE promotion
export const deletePromotion = async (req, res) => {
  try {
    const promo = await Promotion.findOne({ _id: req.params.id, vendorId: req.user.id });
    if (!promo) return res.status(404).json({ success: false, message: 'Promotion not found' });
    await Promotion.findByIdAndDelete(req.params.id);
    res.status(200).json({ success: true, message: 'Deleted successfully' });
  } catch (err) {
    logger.error(`deletePromotion error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// GET vendor promotions for public (user viewing store page)
export const getVendorPromotions = async (req, res) => {
  try {
    const now = new Date();
    const promotions = await Promotion.find({
      vendorId: req.params.vendorId,
      isActive: true,
      $or: [{ validUntil: null }, { validUntil: { $gte: now } }]
    }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: promotions });
  } catch (err) {
    logger.error(`getVendorPromotions error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};
