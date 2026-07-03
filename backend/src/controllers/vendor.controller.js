import Vendor from '../models/Vendor.js';
import logger from '../utils/logger.js';

// ─── Get Vendor Profile ───
export const getProfile = async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.user.id).select('-refreshToken');
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }
    res.status(200).json({ success: true, data: vendor });
  } catch (error) {
    logger.error(`Error in vendor getProfile: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// ─── Update Vendor Profile ───
export const updateProfile = async (req, res) => {
  try {
    const { 
      description, 
      socialLinks, 
      bankDetails,
      address
    } = req.body;

    const vendor = await Vendor.findById(req.user.id);
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }

    if (description) vendor.description = description;
    
    if (socialLinks) {
      vendor.socialLinks = { ...vendor.socialLinks, ...socialLinks };
    }
    
    // Only allow updating safe bank details, not everything directly
    if (bankDetails) {
      if (!vendor.bankDetails) vendor.bankDetails = {};
      if (bankDetails.upiId !== undefined) vendor.bankDetails.upiId = bankDetails.upiId;
    }

    if (address) {
      // Assuming they might want to update location
      vendor.address = { ...vendor.address, ...address };
    }

    await vendor.save();
    
    logger.info(`[vendor.controller] Profile updated successfully for vendor ID: ${vendor._id}`);

    res.status(200).json({ success: true, message: 'Profile updated successfully', data: vendor });
  } catch (error) {
    logger.error(`Error in vendor updateProfile: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};

// ─── Get Dashboard Stats (Phase 3A Mock for now) ───
export const getDashboardStats = async (req, res) => {
  try {
    // In Phase 3C, this will calculate real stats from Transaction & VendorCustomer models.
    // For Phase 3A, we return the vendor's denormalized stats + mock data.
    const vendor = await Vendor.findById(req.user.id);
    if (!vendor) {
      return res.status(404).json({ success: false, message: 'Vendor not found' });
    }

    res.status(200).json({
      success: true,
      data: {
        totalRevenue: vendor.stats.totalRevenue || 0,
        totalCustomers: vendor.stats.totalCustomers || 0,
        totalTransactions: 0, // Mock for now
        avgRating: vendor.stats.avgRating || 0,
      }
    });
  } catch (error) {
    logger.error(`Error in vendor getDashboardStats: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};
