import User from '../models/User.js';
import Vendor from '../models/Vendor.js';
import { verifyOtpOnly } from './auth.controller.js';
import { sendTokens } from '../utils/token.utils.js';
import logger from '../utils/logger.js';

// Helper to generate unique Zeebac ID
const generateZeebacId = async (prefix, Model) => {
  let isUnique = false;
  let newId;
  while (!isUnique) {
    const randomDigits = Math.floor(1000 + Math.random() * 9000);
    newId = `${prefix}-${randomDigits}`;
    const exists = await Model.findOne({ zeebacId: newId });
    if (!exists) isUnique = true;
  }
  return newId;
};

// 1. Customer Signup
export const customerSignup = async (req, res) => {
  try {
    const { phone, otp, name, email } = req.body;

    // 1. Verify OTP
    await verifyOtpOnly(phone, otp, 'signup', 'customer');

    // 2. Check if user already exists
    const existingUser = await User.findOne({ phone });
    if (existingUser) {
      logger.warn(`[customerSignup] Failed: Account already exists for phone ${phone}`);
      return res.status(400).json({ success: false, message: 'Account already exists. Please login.' });
    }

    // 3. Generate IDs
    const zeebacId = await generateZeebacId('ZBC', User);
    
    // Auto-generate referral code (e.g., ZEEBACRAHUL150)
    const firstName = name.split(' ')[0].toUpperCase().replace(/[^A-Z]/g, '');
    const referralCode = `ZEEBAC${firstName}150`;

    // 4. Create User
    const profileImage = req.file ? `/uploads/profiles/${req.file.filename}` : undefined;

    const user = await User.create({
      zeebacId,
      name,
      phone,
      email,
      profileImage,
      referralCode
    });

    // 5. Generate tokens
    const tokens = sendTokens(res, user);
    user.refreshToken = tokens.refreshToken;
    await user.save();

    logger.info(`[customerSignup] Success: User created with ID ${user._id}`);
    res.status(201).json({
      success: true,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        _id: user._id,
        name: user.name,
        phone: user.phone,
        zeebacId: user.zeebacId,
        role: user.role
      }
    });

  } catch (error) {
    logger.error(`[customerSignup] Error: ${error.message}`);
    res.status(400).json({ success: false, message: error.message });
  }
};

// 2. Vendor Signup
export const vendorSignup = async (req, res) => {
  try {
    const { 
      phone, otp, storeName, ownerName, shopType, category, gstNumber,
      fullAddress, landmark, city, state, pincode, lat, lng,
      accountHolderName, bankName, accountNumber, ifscCode, upiId
    } = req.body;

    // 1. Verify OTP
    await verifyOtpOnly(phone, otp, 'signup', 'vendor');

    // 2. Check if vendor already exists
    const existingVendor = await Vendor.findOne({ phone });
    if (existingVendor) {
      logger.warn(`[vendorSignup] Failed: Vendor already exists for phone ${phone}`);
      return res.status(400).json({ success: false, message: 'Vendor account already exists.' });
    }

    // 3. Generate Zeebac ID
    const zeebacId = await generateZeebacId('ZBV', Vendor);

    // 4. Process files if any
    const documents = {};
    let profilePic = null;

    if (req.files) {
      if (req.files.storeLogo) profilePic = `/uploads/profiles/${req.files.storeLogo[0].filename}`;
      
      const addDoc = (field) => {
        if (req.files[field]) {
          documents[field] = {
            fileName: req.files[field][0].originalname,
            fileUrl: `/uploads/documents/${req.files[field][0].filename}`,
            fileType: req.files[field][0].mimetype,
            uploadedAt: new Date()
          };
        }
      };

      addDoc('aadhaarPan');
      addDoc('gstCertificate');
      addDoc('shopLicense');
      addDoc('cancelledCheque');
    }

    // 5. Create Vendor (Status: Pending)
    const vendor = await Vendor.create({
      zeebacId,
      storeName,
      ownerName,
      phone,
      shopType,
      category,
      gstNumber,
      address: {
        fullAddress,
        landmark,
        city,
        state,
        pincode,
        coordinates: (lat && lng) ? { latitude: lat, longitude: lng } : undefined
      },
      bankDetails: {
        accountHolderName,
        bankName,
        accountNumber,
        ifscCode,
        upiId
      },
      documents,
      profilePic
    });

    logger.info(`[vendorSignup] Success: Vendor submitted application with ID ${vendor._id}`);

    // Vendor application is pending KYC. No token is returned yet.
    res.status(201).json({
      success: true,
      message: 'Vendor application submitted successfully. Pending KYC approval.'
    });

  } catch (error) {
    logger.error(`[vendorSignup] Error: ${error.message}`);
    res.status(400).json({ success: false, message: error.message });
  }
};
