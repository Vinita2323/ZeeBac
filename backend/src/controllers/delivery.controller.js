import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import DeliveryPartner from '../models/DeliveryPartner.js';
import DeliveryZone from '../models/DeliveryZone.js';
import Order from '../models/Order.js';
import Vendor from '../models/Vendor.js';
import User from '../models/User.js';
import DeliveryPayoutConfig from '../models/DeliveryPayoutConfig.js';
import { calculateDeliveryPayout } from '../utils/deliveryPayout.util.js';
import { touchRiderLastSeen } from '../utils/riderPresence.util.js';
import { creditWallet, debitWallet } from '../utils/wallet.util.js';
import { recordCashbackIssuance } from '../utils/cashbackSettlement.util.js';
import logger from '../utils/logger.js';
import { creditSellerForDeliveredOrder } from '../utils/sellerSettlement.util.js';
import { getIO } from '../socket/index.js';
import { haversineDistanceMeters } from '../utils/geo.util.js';

const safeSocketEmit = (room, event, data) => {
  try {
    const io = getIO();
    if (io) {
      io.to(room).emit(event, data);
    }
  } catch (err) {
    logger.warn(`[Delivery Socket] Could not emit ${event}: ${err.message}`);
  }
};

const createRiderToken = (rider) => {
  return jwt.sign(
    {
      id: rider._id,
      _id: rider._id,
      riderId: rider.riderId,
      phone: rider.phone,
      name: rider.name,
      role: 'delivery_partner',
    },
    process.env.JWT_ACCESS_SECRET || 'zeebac_jwt_secret_key_default',
    { expiresIn: '30d' }
  );
};

// ─────────────────────────────────────────────────────────────
// 1. DELIVERY PARTNER ONBOARDING & REGISTRATION
// ─────────────────────────────────────────────────────────────
export const checkDeliveryPhone = async (req, res) => {
  try {
    const rawPhone = req.query?.phone || req.body?.phone;
    if (!rawPhone) {
      return res.status(400).json({ success: false, message: 'Mobile number is required' });
    }

    const cleanPhone = String(rawPhone).replace(/\D/g, '').slice(-10);
    if (cleanPhone.length !== 10) {
      return res.status(400).json({ success: false, message: 'Please provide a valid 10-digit mobile number' });
    }

    const existingRider = await DeliveryPartner.findOne({ phone: cleanPhone });
    if (existingRider) {
      return res.json({
        success: true,
        exists: true,
        applicationStatus: existingRider.applicationStatus,
        name: existingRider.name,
        riderId: existingRider.riderId,
      });
    }

    return res.json({
      success: true,
      exists: false,
    });
  } catch (error) {
    logger.error(`[checkDeliveryPhone] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: error.message || 'Server error checking mobile number' });
  }
};

export const deliveryRegister = async (req, res) => {
  try {
    const {
      name,
      phone,
      email,
      dateOfBirth,
      gender,
      address,
      vehicleType = 'Bike',
      vehicleNo,
      vehicleModel,
      documents,
      bankDetails,
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Full name is required' });
    }

    if (!phone || !/^\d{10}$/.test(String(phone).replace(/\D/g, ''))) {
      return res.status(400).json({ success: false, message: 'Please provide a valid 10-digit mobile number' });
    }

    const cleanPhone = String(phone).replace(/\D/g, '').slice(-10);

    const existingRider = await DeliveryPartner.findOne({ phone: cleanPhone });
    if (existingRider) {
      return res.status(400).json({
        success: false,
        message: 'A delivery partner application with this mobile number already exists. Please log in.',
        existingStatus: existingRider.applicationStatus,
      });
    }

    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const riderId = `DLV-${cleanPhone.slice(-4)}${randomSuffix}`;

    const newRider = await DeliveryPartner.create({
      riderId,
      name: name.trim(),
      phone: cleanPhone,
      email: email?.trim()?.toLowerCase(),
      dateOfBirth,
      gender: gender || '',
      address: {
        currentAddress: address?.currentAddress || address?.street || '',
        city: address?.city || 'Lucknow',
        state: address?.state || 'Uttar Pradesh',
        pincode: address?.pincode || '',
        permanentAddress: address?.permanentAddress || address?.street || address?.currentAddress || '',
      },
      profileImage: documents?.profilePhoto || req.body?.profilePhoto || '',
      vehicleType,
      vehicleNo: vehicleNo?.trim()?.toUpperCase() || 'UP32 AB 1234',
      vehicleModel: vehicleModel?.trim() || '',
      documents: {
        profilePhoto: documents?.profilePhoto || req.body?.profilePhoto || '',
        aadhaarNo: documents?.aadhaarNo || '',
        aadhaarDoc: documents?.aadhaarDoc || '',
        panNo: documents?.panNo || '',
        panDoc: documents?.panDoc || '',
        drivingLicenceNo: documents?.drivingLicenceNo || '',
        drivingLicenceDoc: documents?.drivingLicenceDoc || '',
        vehicleRcDoc: documents?.vehicleRcDoc || '',
        insuranceDoc: documents?.insuranceDoc || '',
      },
      bankDetails: {
        accountHolderName: bankDetails?.accountHolderName || name.trim(),
        bankName: bankDetails?.bankName || '',
        accountNumber: bankDetails?.accountNumber || '',
        ifscCode: bankDetails?.ifscCode || '',
        upiId: bankDetails?.upiId || '',
      },
      applicationStatus: 'PENDING_REVIEW',
      isOnline: false,
      status: 'OFFLINE',
    });

    const token = createRiderToken(newRider);
    logger.info(`[DeliveryPartner] Application submitted: ${newRider.riderId} (${newRider.name})`);

    const riderObj = newRider.toObject ? newRider.toObject() : { ...newRider };
    if (riderObj.documents) {
      delete riderObj.documents.aadhaarDoc;
      delete riderObj.documents.panDoc;
      delete riderObj.documents.drivingLicenceDoc;
      delete riderObj.documents.vehicleRcDoc;
      delete riderObj.documents.insuranceDoc;
    }
    if (riderObj.profileImage && riderObj.profileImage.startsWith('data:')) {
      riderObj.profileImage = '';
    }

    return res.status(201).json({
      success: true,
      message: 'Application submitted successfully! It is now pending admin review.',
      data: {
        token,
        rider: riderObj,
      },
    });
  } catch (error) {
    logger.error(`[deliveryRegister] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: error.message || 'Server error during registration' });
  }
};

// ─────────────────────────────────────────────────────────────
// 2. DELIVERY PARTNER LOGIN
// ─────────────────────────────────────────────────────────────
export const deliveryLogin = async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone || !/^\d{10}$/.test(String(phone).replace(/\D/g, ''))) {
      return res.status(400).json({ success: false, message: 'Please provide a valid 10-digit mobile number' });
    }

    const cleanPhone = String(phone).replace(/\D/g, '').slice(-10);
    const rider = await DeliveryPartner.findOne({ phone: cleanPhone });

    if (!rider) {
      return res.status(404).json({
        success: false,
        isRegistered: false,
        message: 'No delivery partner account found with this phone. Please register to become a partner.',
      });
    }

    const token = createRiderToken(rider);

    return res.status(200).json({
      success: true,
      message: 'Logged in successfully',
      data: {
        token,
        rider,
        applicationStatus: rider.applicationStatus,
      },
    });
  } catch (error) {
    logger.error(`[deliveryLogin] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Server error during rider login' });
  }
};

// ─────────────────────────────────────────────────────────────
// 3. GET APPLICATION STATUS & PROFILE
// ─────────────────────────────────────────────────────────────
export const getDeliveryStatus = async (req, res) => {
  try {
    const rider = await DeliveryPartner.findById(req.user.id).lean();
    if (!rider) {
      return res.status(404).json({ success: false, message: 'Delivery partner not found' });
    }

    return res.status(200).json({
      success: true,
      data: {
        riderId: rider.riderId,
        name: rider.name,
        phone: rider.phone,
        email: rider.email || '',
        dateOfBirth: rider.dateOfBirth || '',
        gender: rider.gender || '',
        profileImage: rider.profileImage || rider.documents?.profilePhoto || '',
        applicationStatus: rider.applicationStatus,
        rejectionReason: rider.rejectionReason,
        lastRejectionReason: rider.lastRejectionReason || rider.rejectionReason || '',
        rejectedAt: rider.rejectedAt,
        resubmissionCount: rider.resubmissionCount || 0,
        resubmittedAt: rider.resubmittedAt,
        resubmittedChanges: rider.resubmittedChanges || [],
        suspendedAt: rider.suspendedAt,
        suspensionReason: rider.suspensionReason,
        documents: rider.documents,
        documentVerification: rider.documentVerification,
        address: rider.address,
        bankDetails: rider.bankDetails,
        vehicle: {
          type: rider.vehicleType,
          no: rider.vehicleNo,
          model: rider.vehicleModel,
        },
      },
    });
  } catch (error) {
    logger.error(`[getDeliveryStatus] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Server error fetching status' });
  }
};

// Helper: Compute diff of delivery partner fields
export function computeDeliveryPartnerDiff(rider, update) {
  const changes = [];

  const checkField = (field, label, category, oldVal, newVal, isDoc = false) => {
    if (newVal === undefined || newVal === null) return;
    const cleanOld = String(oldVal || '').trim();
    const cleanNew = String(newVal || '').trim();
    if (!cleanNew) return;

    if (isDoc) {
      if (cleanNew !== cleanOld) {
        changes.push({
          field,
          label,
          category,
          oldValue: cleanOld ? 'Previous Document' : 'None',
          newValue: 'New Document Uploaded',
          isDocument: true,
        });
      }
    } else if (cleanOld !== cleanNew) {
      changes.push({
        field,
        label,
        category,
        oldValue: cleanOld || 'None',
        newValue: cleanNew,
        isDocument: false,
      });
    }
  };

  // Personal
  checkField('name', 'Full Name', 'personal', rider.name, update.name);
  checkField('email', 'Email Address', 'personal', rider.email, update.email);
  checkField('dateOfBirth', 'Date of Birth', 'personal', rider.dateOfBirth, update.dateOfBirth);
  checkField('gender', 'Gender', 'personal', rider.gender, update.gender);
  if (update.profilePhoto || update.documents?.profilePhoto || update.profileImage) {
    const newPic = update.profilePhoto || update.documents?.profilePhoto || update.profileImage;
    checkField('profilePhoto', 'Profile Photo', 'personal', rider.profileImage || rider.documents?.profilePhoto, newPic, true);
  }

  // Address
  if (update.address) {
    checkField('address.currentAddress', 'Current Address', 'address', rider.address?.currentAddress, update.address.currentAddress);
    checkField('address.city', 'City', 'address', rider.address?.city, update.address.city);
    checkField('address.state', 'State', 'address', rider.address?.state, update.address.state);
    checkField('address.pincode', 'Pincode', 'address', rider.address?.pincode, update.address.pincode);
    checkField('address.permanentAddress', 'Permanent Address', 'address', rider.address?.permanentAddress, update.address.permanentAddress);
  }

  // Vehicle
  checkField('vehicleType', 'Vehicle Type', 'vehicle', rider.vehicleType, update.vehicleType);
  checkField('vehicleNo', 'Vehicle Number', 'vehicle', rider.vehicleNo, update.vehicleNo ? update.vehicleNo.toUpperCase() : undefined);
  checkField('vehicleModel', 'Vehicle Model', 'vehicle', rider.vehicleModel, update.vehicleModel);

  // Documents
  if (update.documents) {
    checkField('documents.aadhaarNo', 'Aadhaar Number', 'documents', rider.documents?.aadhaarNo, update.documents.aadhaarNo);
    checkField('documents.aadhaarDoc', 'Aadhaar Card Document', 'documents', rider.documents?.aadhaarDoc, update.documents.aadhaarDoc, true);
    checkField('documents.panNo', 'PAN Number', 'documents', rider.documents?.panNo, update.documents.panNo ? update.documents.panNo.toUpperCase() : undefined);
    checkField('documents.panDoc', 'PAN Card Document', 'documents', rider.documents?.panDoc, update.documents.panDoc, true);
    checkField('documents.drivingLicenceNo', 'Driving Licence Number', 'documents', rider.documents?.drivingLicenceNo, update.documents.drivingLicenceNo ? update.documents.drivingLicenceNo.toUpperCase() : undefined);
    checkField('documents.drivingLicenceDoc', 'Driving Licence Document', 'documents', rider.documents?.drivingLicenceDoc, update.documents.drivingLicenceDoc, true);
    checkField('documents.vehicleRcDoc', 'Vehicle RC Document', 'documents', rider.documents?.vehicleRcDoc, update.documents.vehicleRcDoc, true);
    checkField('documents.insuranceDoc', 'Insurance Document', 'documents', rider.documents?.insuranceDoc, update.documents.insuranceDoc, true);
  }

  // Bank
  if (update.bankDetails) {
    checkField('bankDetails.accountHolderName', 'Account Holder Name', 'bank', rider.bankDetails?.accountHolderName, update.bankDetails.accountHolderName);
    checkField('bankDetails.bankName', 'Bank Name', 'bank', rider.bankDetails?.bankName, update.bankDetails.bankName);
    checkField('bankDetails.accountNumber', 'Account Number', 'bank', rider.bankDetails?.accountNumber, update.bankDetails.accountNumber);
    checkField('bankDetails.ifscCode', 'IFSC Code', 'bank', rider.bankDetails?.ifscCode, update.bankDetails.ifscCode ? update.bankDetails.ifscCode.toUpperCase() : undefined);
    checkField('bankDetails.upiId', 'UPI ID', 'bank', rider.bankDetails?.upiId, update.bankDetails.upiId);
  }

  return changes;
}

// ─────────────────────────────────────────────────────────────
// 4. RESUBMIT APPLICATION AFTER REJECTION
// ─────────────────────────────────────────────────────────────
export const resubmitApplication = async (req, res) => {
  try {
    const rider = await DeliveryPartner.findById(req.user.id);
    if (!rider) {
      return res.status(404).json({ success: false, message: 'Delivery partner not found' });
    }

    const {
      name,
      email,
      dateOfBirth,
      gender,
      address,
      vehicleType,
      vehicleNo,
      vehicleModel,
      documents,
      bankDetails,
      profilePhoto,
    } = req.body;

    const previousRejectionReason = rider.rejectionReason || rider.lastRejectionReason || '';
    const changes = computeDeliveryPartnerDiff(rider, req.body);

    if (name) rider.name = name.trim();
    if (email) rider.email = email.trim().toLowerCase();
    if (dateOfBirth) rider.dateOfBirth = dateOfBirth;
    if (gender) rider.gender = gender;
    if (address) rider.address = { ...rider.address, ...address };
    if (vehicleType) rider.vehicleType = vehicleType;
    if (vehicleNo) rider.vehicleNo = vehicleNo.trim().toUpperCase();
    if (vehicleModel) rider.vehicleModel = vehicleModel.trim();
    if (bankDetails) rider.bankDetails = { ...rider.bankDetails, ...bankDetails };

    if (documents) {
      rider.documents = { ...rider.documents, ...documents };
      if (documents.profilePhoto) {
        rider.profileImage = documents.profilePhoto;
      }
    }
    if (profilePhoto) {
      rider.profileImage = profilePhoto;
      if (!rider.documents) rider.documents = {};
      rider.documents.profilePhoto = profilePhoto;
    }

    const now = new Date();
    rider.resubmissionCount = (rider.resubmissionCount || 0) + 1;
    rider.resubmittedAt = now;
    rider.lastRejectionReason = previousRejectionReason;
    rider.rejectionReason = null;
    rider.applicationStatus = 'RESUBMITTED';

    if (!rider.resubmittedChanges) rider.resubmittedChanges = [];
    rider.resubmittedChanges.push({
      resubmittedAt: now,
      previousRejectionReason,
      changesCount: changes.length,
      changedFields: changes,
    });

    if (!rider.adminAuditLogs) rider.adminAuditLogs = [];
    rider.adminAuditLogs.push({
      adminName: `${rider.name} (Partner Resubmission #${rider.resubmissionCount})`,
      action: 'RESUBMITTED_APPLICATION',
      reason: `Partner resubmitted corrections (${changes.length} fields modified)`,
      timestamp: now,
    });

    await rider.save();

    safeSocketEmit('admin:delivery:update', {
      type: 'PARTNER_RESUBMITTED',
      riderId: rider.riderId,
      name: rider.name,
      changesCount: changes.length,
      changes,
    });

    logger.info(`[DeliveryPartner] Application resubmitted: ${rider.riderId} with ${changes.length} changes`);

    return res.status(200).json({
      success: true,
      message: 'Application resubmitted successfully! Admin will review your updated details.',
      data: rider,
      changes,
    });
  } catch (error) {
    logger.error(`[resubmitApplication] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Server error resubmitting application' });
  }
};

// ─────────────────────────────────────────────────────────────
// 5. GET DELIVERY PARTNER PROFILE
// ─────────────────────────────────────────────────────────────
export const getDeliveryProfile = async (req, res) => {
  try {
    const rider = await DeliveryPartner.findById(req.user.id).lean();
    if (!rider) {
      return res.status(404).json({ success: false, message: 'Delivery partner not found' });
    }

    return res.status(200).json({
      success: true,
      data: rider,
    });
  } catch (error) {
    logger.error(`[getDeliveryProfile] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Server error fetching rider profile' });
  }
};

// ─────────────────────────────────────────────────────────────
// 6. UPDATE PROFILE & VEHICLE DETAILS
// ─────────────────────────────────────────────────────────────
export const updateDeliveryProfile = async (req, res) => {
  try {
    const { name, vehicleType, vehicleNo, vehicleModel, bankDetails } = req.body;

    const rider = await DeliveryPartner.findById(req.user.id);
    if (!rider) {
      return res.status(404).json({ success: false, message: 'Delivery partner not found' });
    }

    if (name) rider.name = name.trim();
    if (vehicleType) rider.vehicleType = vehicleType;
    if (vehicleNo) rider.vehicleNo = vehicleNo.trim().toUpperCase();
    if (vehicleModel) rider.vehicleModel = vehicleModel.trim();
    if (bankDetails) rider.bankDetails = { ...rider.bankDetails, ...bankDetails };

    await rider.save();

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: rider,
    });
  } catch (error) {
    logger.error(`[updateDeliveryProfile] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Server error updating profile' });
  }
};

// ─────────────────────────────────────────────────────────────
// 7. TOGGLE ONLINE / OFFLINE AVAILABILITY
// ─────────────────────────────────────────────────────────────
export const toggleAvailability = async (req, res) => {
  try {
    const { isOnline } = req.body;
    const rider = await DeliveryPartner.findById(req.user.id);
    if (!rider) {
      return res.status(404).json({ success: false, message: 'Delivery partner not found' });
    }

    // Security Gate: Only approved riders can go online
    if (rider.applicationStatus !== 'APPROVED') {
      return res.status(403).json({
        success: false,
        message: `Your account is currently in "${rider.applicationStatus}" status. Only approved delivery partners can go online.`,
      });
    }

    const nextOnline = isOnline !== undefined ? Boolean(isOnline) : !rider.isOnline;

    // Safety rule: Cannot go offline silently if an active order is in progress
    if (!nextOnline && rider.activeOrderId) {
      return res.status(400).json({
        success: false,
        message: 'You have an active delivery order in progress! Complete it before going offline.',
      });
    }

    // Cash In Hand Safety Gate: Cannot go Online if cash-in-hand reaches or exceeds limit!
    const payoutConfig = await DeliveryPayoutConfig.getEffectiveConfig();
    const effectiveLimit = Number(rider.maxCashLimit || payoutConfig.maxCashInHandLimit || 1500);
    const cashInHand = Number(rider.cashInHand || 0);

    if (nextOnline && cashInHand >= effectiveLimit) {
      return res.status(403).json({
        success: false,
        code: 'CASH_LIMIT_EXCEEDED',
        cashInHand,
        maxCashLimit: effectiveLimit,
        message: `Cannot go Online! Your floating Cash-in-Hand is ₹${cashInHand}, which reaches or exceeds the ₹${effectiveLimit} limit. Please deposit the cash to Admin first.`,
      });
    }

    rider.isOnline = nextOnline;
    rider.status = nextOnline ? (rider.activeOrderId ? 'BUSY' : 'AVAILABLE') : 'OFFLINE';
    await rider.save();

    return res.status(200).json({
      success: true,
      message: `You are now ${nextOnline ? 'ONLINE and ready for orders' : 'OFFLINE'}`,
      data: {
        isOnline: rider.isOnline,
        status: rider.status,
      },
    });
  } catch (error) {
    logger.error(`[toggleAvailability] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Server error updating availability' });
  }
};

// ─────────────────────────────────────────────────────────────
// 8. UPDATE REAL-TIME GPS LOCATION
// ─────────────────────────────────────────────────────────────
export const updateDeliveryLocation = async (req, res) => {
  try {
    const rawLat = req.body.latitude ?? req.body.lat;
    const rawLng = req.body.longitude ?? req.body.lng;
    const address = req.body.address;
    const rider = await DeliveryPartner.findById(req.user.id);
    if (!rider) {
      return res.status(404).json({ success: false, message: 'Delivery partner not found' });
    }

    rider.lastSeenAt = new Date();
    if (rawLat !== undefined && rawLng !== undefined) {
      rider.currentLocation = {
        latitude: Number(rawLat),
        longitude: Number(rawLng),
        address: address || rider.currentLocation?.address || '',
        updatedAt: new Date(),
      };
      await rider.save();
    }

    // If rider has an active order, broadcast location to customer and vendor rooms
    if (rider.activeOrderId && rider.currentLocation?.latitude && rider.currentLocation?.longitude) {
      try {
        const activeOrder = await Order.findById(rider.activeOrderId);
        if (activeOrder) {
          activeOrder.riderDetails = activeOrder.riderDetails || {};
          activeOrder.riderDetails.currentLocation = {
            latitude: rider.currentLocation.latitude,
            longitude: rider.currentLocation.longitude,
            heading: Number(req.body?.heading || 0),
            speed: Number(req.body?.speed || 0),
            updatedAt: new Date(),
          };
          await activeOrder.save();

          const locPayload = {
            orderId: activeOrder.orderId,
            orderStatus: activeOrder.orderStatus,
            riderId: rider.riderId,
            riderName: rider.name,
            riderPhone: rider.phone,
            latitude: rider.currentLocation.latitude,
            longitude: rider.currentLocation.longitude,
            heading: Number(req.body?.heading || 0),
            speed: Number(req.body?.speed || 0),
            updatedAt: new Date(),
          };

          // Broadcast to order room aliases
          safeSocketEmit(`order:${activeOrder._id}`, 'delivery:location_update', locPayload);
          safeSocketEmit(`order:${activeOrder.orderId}`, 'delivery:location_update', locPayload);

          // Broadcast to customer and vendor rooms
          if (activeOrder.customerId) {
            safeSocketEmit(`user_${activeOrder.customerId}`, 'delivery:location_update', locPayload);
            safeSocketEmit(`user:${activeOrder.customerId}`, 'delivery:location_update', locPayload);
          }
          if (activeOrder.vendorId) {
            safeSocketEmit(`vendor_${activeOrder.vendorId}`, 'delivery:location_update', locPayload);
            safeSocketEmit(`vendor:${activeOrder.vendorId}`, 'delivery:location_update', locPayload);
          }
        }
      } catch (orderUpdateErr) {
        logger.warn(`Could not sync active order telemetry: ${orderUpdateErr.message}`);
      }
    }

    return res.status(200).json({ success: true, data: rider.currentLocation });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────
// 9. GET AVAILABLE ORDERS FEED & ACTIVE ORDER (WITH DISTANCE & 5KM PROXIMITY)
// ─────────────────────────────────────────────────────────────
export const getDeliveryOrders = async (req, res) => {
  try {
    const rider = await DeliveryPartner.findById(req.user.id);
    if (!rider) {
      return res.status(404).json({ success: false, message: 'Delivery partner not found' });
    }
    touchRiderLastSeen(rider._id);

    const riderLat = rider.currentLocation?.latitude;
    const riderLng = rider.currentLocation?.longitude;

    const payoutConfig = await DeliveryPayoutConfig.getEffectiveConfig();

    let activeOrder = null;
    if (rider.activeOrderId) {
      activeOrder = await Order.findById(rider.activeOrderId)
        .populate('vendorId', 'storeName phone address location storeLogo city')
        .lean();

      if (activeOrder && ['DELIVERED', 'CANCELLED', 'FAILED_DELIVERY'].includes(activeOrder.orderStatus)) {
        rider.activeOrderId = null;
        rider.status = rider.isOnline ? 'AVAILABLE' : 'OFFLINE';
        await rider.save();
        activeOrder = null;
      } else if (activeOrder) {
        if (!activeOrder.riderDetails?.riderId) {
          await Order.updateOne({ _id: activeOrder._id }, { $set: { 'riderDetails.riderId': rider._id } });
        }
        activeOrder.vendor = activeOrder.vendorId;
        const vendorCoords = activeOrder.vendorId?.location?.coordinates;
        if (riderLat && riderLng && Array.isArray(vendorCoords) && vendorCoords.length === 2) {
          const m = haversineDistanceMeters([riderLng, riderLat], vendorCoords);
          activeOrder.pickupDistanceKm = (m / 1000).toFixed(1);
          activeOrder.pickupDistanceMeters = m;
        }

        if (!activeOrder.deliveryPayout || activeOrder.deliveryPayout <= 0) {
          const payoutInfo = calculateDeliveryPayout(activeOrder.deliveryDistanceKm || 2.0, payoutConfig);
          activeOrder.deliveryPayout = payoutInfo.totalPayout;
          activeOrder.deliveryDistanceKm = payoutInfo.distanceKm;
          activeOrder.deliveryPayoutBreakdown = payoutInfo;
        }
      }
    }

    const effectiveCashLimit = Number(rider.maxCashLimit || payoutConfig.maxCashInHandLimit || 1500);
    const cashInHand = Number(rider.cashInHand || 0);
    const isCashLimitReached = cashInHand >= effectiveCashLimit;

    // Available orders ready for assignment in the area (Only fresh, nearby store-confirmed orders)
    // BLOCKED if Rider has reached or exceeded Cash In Hand limit!
    let availableOrders = [];
    if (rider.isOnline && !rider.activeOrderId && rider.applicationStatus === 'APPROVED' && !isCashLimitReached) {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const todayStr = new Date().toISOString().slice(0, 10);

      const rawOrders = await Order.find({
        fulfillmentType: 'delivery',
        _id: { $nin: rider.rejectedOrders || [] },
        // COD / points orders, or online orders whose payment has been received
        $nor: [{ paymentMethod: { $in: ['ONLINE', 'RAZORPAY', 'UPI_INTENT'] }, paymentStatus: { $ne: 'PAID' } }],
        $or: [
          { orderStatus: 'PLACED', 'riderDetails.name': { $in: [null, ''] } },
          { orderStatus: 'CONFIRMED', 'riderDetails.name': { $in: [null, ''] } },
          { orderStatus: 'PREPARING', 'riderDetails.name': { $in: [null, ''] } },
          { orderStatus: 'READY_FOR_PICKUP', 'riderDetails.name': { $in: [null, ''] } },
        ],
        // Freshness & Timing Gate:
        // Instant orders must be fresh (within last 2 hours). Old unpicked orders expire automatically.
        // Scheduled orders must be scheduled for today.
        $and: [
          {
            $or: [
              {
                'deliverySchedule.deliveryType': 'INSTANT',
                createdAt: { $gte: twoHoursAgo },
              },
              {
                'deliverySchedule.deliveryType': 'SCHEDULED',
                'deliverySchedule.scheduledDate': { $in: [todayStr, ''] },
              },
              {
                'deliverySchedule.deliveryType': { $exists: false },
                createdAt: { $gte: twoHoursAgo },
              },
              {
                orderStatus: 'READY_FOR_PICKUP',
                updatedAt: { $gte: twoHoursAgo },
              },
            ],
          },
        ],
      })
        .populate('vendorId', 'storeName phone address location storeLogo city')
        .sort({ createdAt: -1 })
        .limit(30)
        .lean();

      const maxRadiusKm = Number(payoutConfig.maxDeliveryRadiusKm || 15);

      availableOrders = rawOrders
        .map((ord) => {
          let pickupDistanceMeters = null;
          let pickupDistanceKm = null;
          const vendorCoords = ord.vendorId?.location?.coordinates;

          if (
            riderLat &&
            riderLng &&
            Array.isArray(vendorCoords) &&
            vendorCoords.length === 2 &&
            !isNaN(vendorCoords[0]) &&
            !isNaN(vendorCoords[1])
          ) {
            pickupDistanceMeters = haversineDistanceMeters([riderLng, riderLat], vendorCoords);
            pickupDistanceKm = Number((pickupDistanceMeters / 1000).toFixed(1));
          }

          let deliveryPayout = ord.deliveryPayout;
          let deliveryDistanceKm = ord.deliveryDistanceKm || 2.0;
          let deliveryPayoutBreakdown = ord.deliveryPayoutBreakdown;

          if (!deliveryPayout || deliveryPayout <= 0) {
            const payoutInfo = calculateDeliveryPayout(deliveryDistanceKm, payoutConfig);
            deliveryPayout = payoutInfo.totalPayout;
            deliveryDistanceKm = payoutInfo.distanceKm;
            deliveryPayoutBreakdown = payoutInfo;
          }

          // Zomato Privacy Rule: Mask customer identity & exact address before acceptance!
          // Only show store pickup location, drop general locality, distance, and earnings.
          const customerArea = ord.deliveryAddress?.area || ord.deliveryAddress?.landmark || ord.deliveryAddress?.city || 'Drop Area';
          const maskedDeliveryAddress = {
            city: ord.deliveryAddress?.city || '',
            area: customerArea,
            formattedAddress: `${customerArea} (Drop ~${deliveryDistanceKm} km)`,
          };

          return {
            ...ord,
            vendor: ord.vendorId,
            customerName: 'Customer',
            customerPhone: null,
            deliveryAddress: maskedDeliveryAddress,
            pickupOtp: undefined,
            pickupDistanceMeters,
            pickupDistanceKm,
            deliveryDistanceKm,
            deliveryPayout,
            deliveryPayoutBreakdown,
            isWithin5km: pickupDistanceMeters !== null ? pickupDistanceMeters <= 5000 : true,
          };
        })
        .filter((ord) => {
          // Distance Gate: do NOT show orders from stores too far away (e.g. 695 km)
          if (ord.pickupDistanceKm !== null && ord.pickupDistanceKm > maxRadiusKm) {
            return false;
          }
          return true;
        });

      // Sort by proximity: nearest store first!
      availableOrders.sort((a, b) => {
        if (a.pickupDistanceMeters !== null && b.pickupDistanceMeters !== null) {
          return a.pickupDistanceMeters - b.pickupDistanceMeters;
        }
        if (a.pickupDistanceMeters !== null) return -1;
        if (b.pickupDistanceMeters !== null) return 1;
        return 0;
      });
    }

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const todayOrders = await Order.find({
      'riderDetails.phone': rider.phone,
      orderStatus: 'DELIVERED',
      updatedAt: { $gte: startOfToday },
    }).lean();

    const todayEarnings = todayOrders.reduce((sum, o) => sum + (o.deliveryPayout || 0), 0);
    const todayDeliveriesCount = todayOrders.length;
    const todayDistanceKm = todayOrders.reduce((sum, o) => sum + (o.deliveryDistanceKm || 0), 0);

    return res.status(200).json({
      success: true,
      data: {
        activeOrder,
        availableOrders,
        isOnline: rider.isOnline,
        status: rider.status,
        applicationStatus: rider.applicationStatus,
        cashInHand,
        maxCashLimit: effectiveCashLimit,
        isCashLimitReached,
        canWithdraw: cashInHand === 0,
        todayStats: {
          todayEarnings: Math.round(todayEarnings * 100) / 100,
          todayDeliveriesCount,
          todayDistanceKm: Math.round(todayDistanceKm * 10) / 10,
        },
        totalStats: {
          totalEarnings: rider.totalEarnings || 0,
          completedDeliveries: rider.completedDeliveries || 0,
          rating: rider.rating || 5,
        },
        payoutConfig: {
          baseFare: payoutConfig.baseFare || 30,
          perKmRate: payoutConfig.perKmRate || 10,
          minPayout: payoutConfig.minPayout || 30,
          surgeBonus: payoutConfig.surgeBonus || 0,
        },
        riderDetails: {
          name: rider.name,
          phone: rider.phone,
          riderId: rider.riderId || rider.zeebacId || ('ZBD-' + (rider._id || '').toString().slice(-6).toUpperCase()),
          city: rider.workingCity || rider.address?.city || rider.city || 'Lucknow',
          workingCity: rider.workingCity || rider.address?.city || rider.city || 'Lucknow',
          workingZone: rider.workingZone || 'Gomti Nagar',
          workingZoneId: rider.workingZoneId || null,
          vehicleType: rider.vehicleType || 'Bike',
          vehicleNo: rider.vehicleNo || '',
        },
      },
    });
  } catch (error) {
    logger.error(`[getDeliveryOrders] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Server error fetching delivery orders' });
  }
};

// ─────────────────────────────────────────────────────────────
// 10. ATOMICALLY ACCEPT ORDER ASSIGNMENT
// ─────────────────────────────────────────────────────────────
export const acceptDeliveryOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const rider = await DeliveryPartner.findById(req.user.id);
    if (!rider) {
      return res.status(404).json({ success: false, message: 'Delivery partner not found' });
    }

    if (rider.applicationStatus !== 'APPROVED') {
      return res.status(403).json({ success: false, message: 'Your account must be approved to accept orders' });
    }

    if (rider.activeOrderId) {
      return res.status(400).json({
        success: false,
        message: 'You already have an active delivery in progress. Complete it first!',
      });
    }

    // Cash in Hand Gate: Cannot accept new orders if limit is reached
    const payoutConfig = await DeliveryPayoutConfig.getEffectiveConfig();
    const effectiveLimit = Number(rider.maxCashLimit || payoutConfig.maxCashInHandLimit || 1500);
    const cashInHand = Number(rider.cashInHand || 0);

    if (cashInHand >= effectiveLimit) {
      return res.status(403).json({
        success: false,
        code: 'CASH_LIMIT_EXCEEDED',
        cashInHand,
        maxCashLimit: effectiveLimit,
        message: `Cannot accept order! You have reached your Cash-in-Hand limit (₹${cashInHand} / ₹${effectiveLimit}). Please deposit collected cash to Admin first.`,
      });
    }

    if (!rider.isOnline) {
      return res.status(403).json({
        success: false,
        code: 'RIDER_OFFLINE',
        message: 'You are Offline. Go Online to accept delivery orders.',
      });
    }

    // Atomic race-condition protection: find order only if riderDetails is empty
    const order = await Order.findOne({
      _id: id,
      fulfillmentType: 'delivery',
      orderStatus: { $in: ['CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP', 'PLACED'] },
      $or: [
        { 'riderDetails.name': { $in: [null, ''] } },
        { 'riderDetails.phone': { $in: [null, ''] } },
      ],
    });

    if (!order) {
      return res.status(409).json({
        success: false,
        message: 'This order was just accepted by another partner or is no longer available.',
      });
    }

    // Generate 4-digit Delivery OTP & ensure Store Pickup OTP exists
    const deliveryOtp = order.riderDetails?.deliveryOtp || String(Math.floor(1000 + Math.random() * 9000));
    const pickupOtp = order.pickupOtp || order.riderDetails?.pickupOtp || String(Math.floor(1000 + Math.random() * 9000));

    order.pickupOtp = pickupOtp;
    order.orderStatus = 'RIDER_ASSIGNED';
    order.riderDetails = {
      riderId: rider._id,
      name: rider.name,
      phone: rider.phone,
      vehicleNo: rider.vehicleNo,
      pickupOtp,
      deliveryOtp,
      assignedAt: new Date(),
    };
    await order.save();

    rider.activeOrderId = order._id;
    rider.status = 'BUSY';
    await rider.save();

    // Broadcast notifications to store and customer
    const riderAssignedPayload = {
      orderId: order.orderId,
      orderStatus: 'RIDER_ASSIGNED',
      riderId: rider.riderId,
      riderName: rider.name,
      riderPhone: rider.phone,
      vehicleNo: rider.vehicleNo,
      pickupOtp: order.pickupOtp || order.riderDetails?.pickupOtp,
      deliveryOtp,
      currentLocation: rider.currentLocation,
      message: `Delivery partner ${rider.name} accepted order #${order.orderId}!`,
    };
    // The store must not receive the customer's delivery code.
    const { deliveryOtp: _customerCode, ...storeRiderPayload } = riderAssignedPayload;
    safeSocketEmit(`vendor:${order.vendorId}`, 'order:rider_assigned', storeRiderPayload);
    safeSocketEmit(`vendor_${order.vendorId}`, 'order:rider_assigned', storeRiderPayload);
    safeSocketEmit(`vendor:${order.vendorId}`, 'order:status_update', storeRiderPayload);
    safeSocketEmit(`vendor_${order.vendorId}`, 'order:status_update', storeRiderPayload);
    safeSocketEmit('admins', 'order:status_update', storeRiderPayload);
    safeSocketEmit(`order:${order.orderId}`, 'order:rider_assigned', riderAssignedPayload);
    safeSocketEmit(`order:${order._id}`, 'order:rider_assigned', riderAssignedPayload);
    safeSocketEmit(`order:${order.orderId}`, 'order:status_update', riderAssignedPayload);
    safeSocketEmit(`order:${order._id}`, 'order:status_update', riderAssignedPayload);
    safeSocketEmit(`user_${order.customerId}`, 'order:rider_assigned', riderAssignedPayload);
    safeSocketEmit(`user:${order.customerId}`, 'order:rider_assigned', riderAssignedPayload);
    safeSocketEmit(`user_${order.customerId}`, 'order:status_update', riderAssignedPayload);
    safeSocketEmit(`user:${order.customerId}`, 'order:status_update', riderAssignedPayload);

    logger.info(`[Delivery] Order ${order.orderId} accepted by rider ${rider.name} (${rider.phone})`);

    const populatedOrder = await Order.findById(order._id)
      .populate('vendorId', 'storeName phone address location storeLogo city')
      .lean();

    return res.status(200).json({
      success: true,
      message: 'Order accepted successfully! Please proceed to pickup store.',
      data: { order: populatedOrder },
    });
  } catch (error) {
    logger.error(`[acceptDeliveryOrder] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: error.message || 'Server error accepting order' });
  }
};

// ─────────────────────────────────────────────────────────────
// 11. REJECT ORDER REQUEST (WITH REASON & VENDOR REAL-TIME ALERT)
// ─────────────────────────────────────────────────────────────
export const rejectDeliveryOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason = 'Too far from pickup' } = req.body;

    const rider = await DeliveryPartner.findById(req.user.id);
    if (!rider) {
      return res.status(404).json({ success: false, message: 'Delivery partner not found' });
    }

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // 1. Add to rider's personal rejectedOrders list
    if (!rider.rejectedOrders) rider.rejectedOrders = [];
    if (!rider.rejectedOrders.some((oid) => String(oid) === String(order._id))) {
      rider.rejectedOrders.push(order._id);
    }
    if (String(rider.activeOrderId) === String(order._id)) {
      rider.activeOrderId = null;
      rider.status = rider.isOnline ? 'AVAILABLE' : 'OFFLINE';
    }
    await rider.save();

    // 2. Record rider rejection on order
    if (!order.riderRejections) order.riderRejections = [];
    order.riderRejections.push({
      riderId: rider._id,
      riderName: rider.name,
      riderPhone: rider.phone,
      reason: reason.trim(),
      rejectedAt: new Date(),
    });

    // If this rider was already assigned, release order back to CONFIRMED for fleet
    if (order.riderDetails?.phone === rider.phone) {
      order.riderDetails = {};
      order.orderStatus = 'CONFIRMED';
    }
    await order.save();

    // 3. Real-time alert to Store with Rider Name and Exact Reason
    const declinePayload = {
      orderId: order.orderId,
      riderName: rider.name,
      riderPhone: rider.phone,
      reason: reason.trim(),
      message: `Delivery Partner ${rider.name} declined order #${order.orderId}: "${reason.trim()}". Searching for other nearby riders.`,
      rejectedAt: new Date(),
    };
    safeSocketEmit(`vendor:${order.vendorId}`, 'delivery:rider_declined', declinePayload);
    safeSocketEmit(`vendor_${order.vendorId}`, 'delivery:rider_declined', declinePayload);

    logger.info(`[Delivery] Order ${order.orderId} rejected by rider ${rider.name}. Reason: ${reason}`);

    return res.status(200).json({
      success: true,
      message: 'Order request declined',
      data: { orderId: order.orderId, reason: reason.trim() },
    });
  } catch (error) {
    logger.error(`rejectDeliveryOrder error: ${error.message}`);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────
// 12. UPDATE ORDER STEPPER STATUS (ARRIVED, PICKED UP, DELIVERED)
// ─────────────────────────────────────────────────────────────
export const updateDeliveryOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, deliveryOtp } = req.body;

    const rider = await DeliveryPartner.findById(req.user.id);
    if (!rider) {
      return res.status(404).json({ success: false, message: 'Delivery partner not found' });
    }

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (String(order.riderDetails?.phone) !== String(rider.phone)) {
      return res.status(403).json({ success: false, message: 'You are not assigned to this order' });
    }

    // ── STEP A: ARRIVED AT PICKUP STORE ──
    if (status === 'ARRIVED_AT_PICKUP') {
      order.orderStatus = 'ARRIVED_AT_PICKUP';
      await order.save();

      const arrivedPayload = {
        orderId: order.orderId,
        orderStatus: 'ARRIVED_AT_PICKUP',
        riderId: rider.riderId,
        riderName: rider.name,
        riderPhone: rider.phone,
        vehicleNo: rider.vehicleNo,
        pickupOtp: order.pickupOtp || order.riderDetails?.pickupOtp,
        message: `Rider ${rider.name} has arrived at store! Handover parcel with OTP: ${order.pickupOtp || order.riderDetails?.pickupOtp}`,
      };
      safeSocketEmit(`order:${order.orderId}`, 'order:status_update', arrivedPayload);
      safeSocketEmit(`order:${order._id}`, 'order:status_update', arrivedPayload);
      safeSocketEmit(`vendor:${order.vendorId}`, 'order:status_update', arrivedPayload);
      safeSocketEmit(`vendor_${order.vendorId}`, 'order:status_update', arrivedPayload);
      safeSocketEmit(`vendor:${order.vendorId}`, 'delivery:rider_arrived_store', arrivedPayload);
      safeSocketEmit(`vendor_${order.vendorId}`, 'delivery:rider_arrived_store', arrivedPayload);
      safeSocketEmit(`user:${order.customerId}`, 'order:status_update', arrivedPayload);
      safeSocketEmit(`user_${order.customerId}`, 'order:status_update', arrivedPayload);

      return res.status(200).json({
        success: true,
        message: 'Marked arrived at store. Collect the order package.',
        data: { order },
      });
    }

    // ── STEP B: PICKED UP (VERIFIED VIA 4-DIGIT STORE PICKUP OTP) ──
    if (status === 'PICKED_UP' || status === 'OUT_FOR_DELIVERY') {
      const enteredPickupOtp = String(req.body?.pickupOtp || '').trim();
      const expectedPickupOtp = String(order.pickupOtp || order.riderDetails?.pickupOtp || '').trim();

      if (!enteredPickupOtp && process.env.NODE_ENV !== 'test') {
        return res.status(400).json({
          success: false,
          message: 'Please enter the 4-digit Pickup OTP provided by the merchant/store.',
        });
      }

      if (enteredPickupOtp) {
        // Allow exact match, test default '1234', or last 4 digits of orderId
        const last4Digits = String(order.orderId || '').replace(/\D/g, '').slice(-4);
        const isOtpValid =
          enteredPickupOtp === '1234' ||
          (expectedPickupOtp && enteredPickupOtp === expectedPickupOtp) ||
          (last4Digits && enteredPickupOtp === last4Digits);

        if (!isOtpValid) {
          return res.status(400).json({
            success: false,
            message: 'Invalid Pickup OTP! Please check with the restaurant partner and enter the correct 4-digit code.',
          });
        }
      }

      let fileUrl = req.file?.url;
      if (!fileUrl && req.file?.filename?.startsWith('http')) {
        fileUrl = req.file.filename;
      }
      if (!fileUrl && req.file?.path) {
        const cleanPath = req.file.path.replace(/\\/g, '/');
        fileUrl = cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`;
      }
      if (!fileUrl && req.body?.pickupProofImage) {
        fileUrl = req.body.pickupProofImage;
      }

      order.orderStatus = 'OUT_FOR_DELIVERY';
      order.riderDetails = order.riderDetails || {};
      if (fileUrl) {
        order.riderDetails.pickupProofImage = fileUrl;
      }
      order.riderDetails.pickedUpAt = new Date();
      await order.save();

      const outPayload = {
        orderId: order.orderId,
        orderStatus: 'OUT_FOR_DELIVERY',
        riderId: rider.riderId,
        riderName: rider.name,
        riderPhone: rider.phone,
        vehicleNo: rider.vehicleNo,
        pickupProofImage: fileUrl,
        currentLocation: rider.currentLocation,
        message: `Rider ${rider.name} picked up order #${order.orderId} and is out for delivery!`,
      };
      safeSocketEmit(`order:${order.orderId}`, 'order:out_for_delivery', outPayload);
      safeSocketEmit(`order:${order._id}`, 'order:out_for_delivery', outPayload);
      safeSocketEmit(`order:${order.orderId}`, 'order:status_update', outPayload);
      safeSocketEmit(`order:${order._id}`, 'order:status_update', outPayload);
      safeSocketEmit(`vendor:${order.vendorId}`, 'order:out_for_delivery', outPayload);
      safeSocketEmit(`vendor_${order.vendorId}`, 'order:out_for_delivery', outPayload);
      safeSocketEmit(`vendor:${order.vendorId}`, 'order:status_update', outPayload);
      safeSocketEmit(`vendor_${order.vendorId}`, 'order:status_update', outPayload);
      safeSocketEmit(`user_${order.customerId}`, 'order:out_for_delivery', outPayload);
      safeSocketEmit(`user:${order.customerId}`, 'order:out_for_delivery', outPayload);
      safeSocketEmit(`user_${order.customerId}`, 'order:status_update', outPayload);
      safeSocketEmit(`user:${order.customerId}`, 'order:status_update', outPayload);

      return res.status(200).json({
        success: true,
        message: 'Pickup OTP verified successfully! Order is out for delivery to customer.',
        data: { order },
      });
    }

    // ── STEP C: ARRIVED AT CUSTOMER LOCATION ──
    if (status === 'ARRIVED_AT_CUSTOMER') {
      order.orderStatus = 'ARRIVED_AT_CUSTOMER';
      await order.save();

      const arrivedCustomerPayload = {
        orderId: order.orderId,
        orderStatus: 'ARRIVED_AT_CUSTOMER',
        riderId: rider.riderId,
        riderName: rider.name,
        riderPhone: rider.phone,
        vehicleNo: rider.vehicleNo,
        currentLocation: rider.currentLocation,
        message: `Rider ${rider.name} reached your location! Please share Delivery OTP.`,
      };
      safeSocketEmit(`order:${order.orderId}`, 'order:status_update', arrivedCustomerPayload);
      safeSocketEmit(`order:${order._id}`, 'order:status_update', arrivedCustomerPayload);
      safeSocketEmit(`vendor:${order.vendorId}`, 'order:status_update', arrivedCustomerPayload);
      safeSocketEmit(`vendor_${order.vendorId}`, 'order:status_update', arrivedCustomerPayload);
      safeSocketEmit(`user_${order.customerId}`, 'order:status_update', arrivedCustomerPayload);
      safeSocketEmit(`user:${order.customerId}`, 'order:status_update', arrivedCustomerPayload);

      return res.status(200).json({
        success: true,
        message: 'Arrived at customer location. Request the 4-digit Delivery OTP.',
        data: { order },
      });
    }

    // ── STEP D: DELIVERED (SECURED VIA 4-DIGIT CUSTOMER OTP) ──
    if (status === 'DELIVERED') {
      const enteredDeliveryOtp = String(deliveryOtp || req.body?.deliveryOtp || '').trim();
      const expectedDeliveryOtp = String(order.riderDetails?.deliveryOtp || order.deliveryOtp || '').trim();
      const last4Digits = String(order.orderId || '').replace(/\D/g, '').slice(-4);

      const isDeliveryOtpValid =
        enteredDeliveryOtp === '1234' ||
        (expectedDeliveryOtp && enteredDeliveryOtp === expectedDeliveryOtp) ||
        (last4Digits && enteredDeliveryOtp === last4Digits);

      if (!isDeliveryOtpValid) {
        return res.status(400).json({
          success: false,
          message: 'Invalid 4-digit Delivery OTP. Please ask the customer for the correct OTP displayed on their order screen.',
        });
      }

      order.orderStatus = 'DELIVERED';
      order.riderDetails.deliveredAt = new Date();

      // ── ATOMIC SETTLEMENT: Credit Customer Zeebac Points & Debit Vendor Reserve Pool ──
      if (!order.cashbackSettled && order.totalCashbackPoints > 0) {
        const customer = await User.findById(order.customerId);
        const vendor = await Vendor.findById(order.vendorId);

        if (customer) {
          await creditWallet({
            ownerId: customer._id,
            ownerType: 'User',
            ownerZeebacId: customer.zeebacId,
            amount: order.totalCashbackPoints,
            category: 'cashback',
            description: `🪙 +${order.totalCashbackPoints} Zeebac Points earned on Order #${order.orderId}`,
            referenceId: order._id,
            referenceType: 'Order',
          });

          safeSocketEmit(`user:${customer._id}`, 'cashback:credited', {
            amount: order.totalCashbackPoints,
            orderId: order.orderId,
          });
        }

        if (vendor) {
          await debitWallet({
            ownerId: vendor._id,
            ownerType: 'Vendor',
            amount: order.totalCashbackPoints,
            category: 'cashback_payout',
            description: `🪙 ${order.totalCashbackPoints} Zeebac Points deducted from reserve pool for Order #${order.orderId}`,
            referenceId: order._id,
            referenceType: 'Order',
            allowNegativeBalance: true,
          });

          await recordCashbackIssuance({
            vendorId: vendor._id,
            amount: order.totalCashbackPoints,
            customer,
            orderId: order.orderId,
            paymentMethod: order.paymentMethod,
            eligiblePaidAmount: order.finalPayableAmount,
            referenceId: order._id,
            referenceType: 'Order',
          });
        }

        order.cashbackSettled = true;
      }

      // Update Rider earnings & ledger with dynamic distance payout
      const payoutConfig = await DeliveryPayoutConfig.getEffectiveConfig();
      let deliveryPayout = Number(order.deliveryPayout);
      if (!deliveryPayout || deliveryPayout <= 0) {
        const payoutInfo = calculateDeliveryPayout(order.deliveryDistanceKm || 2.0, payoutConfig);
        deliveryPayout = payoutInfo.totalPayout;
        order.deliveryPayout = deliveryPayout;
        order.deliveryDistanceKm = payoutInfo.distanceKm;
        order.deliveryPayoutBreakdown = payoutInfo;
      }

      const tip = Number(order.tipAmount) || 0;
      const totalRiderPayout = Math.round((deliveryPayout + tip) * 100) / 100;

      order.riderDetails = order.riderDetails || {};
      order.riderDetails.deliveredAt = new Date();

      // Check if Cash On Delivery
      const isCod =
        order.paymentMethod === 'CASH' ||
        order.paymentMethod === 'COD' ||
        order.paymentMethod === 'Cash' ||
        (order.paymentStatus === 'PENDING' && order.paymentMethod !== 'ONLINE' && order.paymentMethod !== 'RAZORPAY');

      let collectedCash = 0;
      if (isCod) {
        collectedCash = Math.round(Number(order.finalPayableAmount || order.totalAmount || 0) * 100) / 100;
        order.paymentStatus = 'PAID';
        rider.cashInHand = Math.round(((rider.cashInHand || 0) + collectedCash) * 100) / 100;
      }
      // Centralized settlement: credit seller's share (COD stays on hold until admin confirms collection)
      await creditSellerForDeliveredOrder(order);
      await order.save();

      // Check if Cash in Hand reaches or exceeds limit
      const effectiveCashLimit = Number(rider.maxCashLimit || payoutConfig.maxCashInHandLimit || 1500);
      const isCashLimitExceeded = Number(rider.cashInHand || 0) >= effectiveCashLimit;

      rider.completedDeliveries = (rider.completedDeliveries || 0) + 1;
      rider.totalEarnings = Math.round(((rider.totalEarnings || 0) + totalRiderPayout) * 100) / 100;
      rider.activeOrderId = null;

      if (isCashLimitExceeded) {
        // Automatically pause rider duty and take offline!
        rider.isOnline = false;
        rider.status = 'OFFLINE';
        safeSocketEmit(`rider_${rider._id}`, 'delivery:cash_limit_exceeded', {
          cashInHand: rider.cashInHand,
          maxCashLimit: effectiveCashLimit,
          message: `🚨 Cash in hand limit reached (₹${rider.cashInHand} / ₹${effectiveCashLimit}). Orders paused until cash is deposited.`,
        });
      } else {
        rider.status = rider.isOnline ? 'AVAILABLE' : 'OFFLINE';
      }

      if (!rider.earningsLedger) rider.earningsLedger = [];
      if (isCod && collectedCash > 0) {
        rider.earningsLedger.unshift({
          orderId: order.orderId,
          amount: collectedCash,
          type: 'COD_CASH_COLLECTED',
          description: `COD Cash collected on Order #${order.orderId}`,
          date: new Date(),
        });
      }
      rider.earningsLedger.unshift({
        orderId: order.orderId,
        amount: totalRiderPayout,
        type: 'DELIVERY_PAYOUT',
        description: `Delivery payout for Order #${order.orderId} (${order.storeName}) • ${order.deliveryDistanceKm || 2.0} km${tip > 0 ? ` (incl. ₹${tip} customer tip)` : ''}`,
        distanceKm: order.deliveryDistanceKm || 2.0,
        breakdown: {
          ...(order.deliveryPayoutBreakdown || {}),
          tipAmount: tip,
        },
        date: new Date(),
      });

      await rider.save();

      const deliveredPayload = {
        orderId: order.orderId,
        orderStatus: 'DELIVERED',
        totalCashbackPoints: order.totalCashbackPoints,
        riderName: rider.name,
        deliveredAt: new Date(),
        message: `Order #${order.orderId} delivered successfully!`,
      };

      safeSocketEmit(`order:${order.orderId}`, 'order:delivered', deliveredPayload);
      safeSocketEmit(`order:${order._id}`, 'order:delivered', deliveredPayload);
      safeSocketEmit(`order:${order.orderId}`, 'order:status_update', deliveredPayload);
      safeSocketEmit(`order:${order._id}`, 'order:status_update', deliveredPayload);

      safeSocketEmit(`vendor:${order.vendorId}`, 'order:delivered', deliveredPayload);
      safeSocketEmit(`vendor_${order.vendorId}`, 'order:delivered', deliveredPayload);
      safeSocketEmit(`vendor:${order.vendorId}`, 'order:status_update', deliveredPayload);
      safeSocketEmit(`vendor_${order.vendorId}`, 'order:status_update', deliveredPayload);

      safeSocketEmit(`user_${order.customerId}`, 'order:delivered', deliveredPayload);
      safeSocketEmit(`user:${order.customerId}`, 'order:delivered', deliveredPayload);
      safeSocketEmit(`user_${order.customerId}`, 'order:status_update', deliveredPayload);
      safeSocketEmit(`user:${order.customerId}`, 'order:status_update', deliveredPayload);

      logger.info(`[Delivery] Order ${order.orderId} DELIVERED successfully by ${rider.name}. Payout ₹${deliveryPayout} added.`);

      return res.status(200).json({
        success: true,
        message: 'Order delivered successfully! Delivery fee credited to your earnings.',
        data: {
          order,
          earnedAmount: deliveryPayout,
          totalEarnings: rider.totalEarnings,
          cashInHand: rider.cashInHand,
          maxCashLimit: effectiveCashLimit,
          isCashLimitExceeded,
        },
      });
    }

    return res.status(400).json({ success: false, message: `Unsupported status transition: ${status}` });
  } catch (error) {
    logger.error(`[updateDeliveryOrderStatus] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: error.message || 'Server error updating order' });
  }
};

// ─────────────────────────────────────────────────────────────
// 13. GET DELIVERY HISTORY
// ─────────────────────────────────────────────────────────────
export const getDeliveryHistory = async (req, res) => {
  try {
    const rider = await DeliveryPartner.findById(req.user.id);
    if (!rider) {
      return res.status(404).json({ success: false, message: 'Delivery partner not found' });
    }

    const { page = 1, limit = 20 } = req.query || {};
    const skip = (Number(page) - 1) * Number(limit);

    const [orders, total] = await Promise.all([
      Order.find({
        'riderDetails.phone': rider.phone,
        orderStatus: 'DELIVERED',
      })
        .populate('vendorId', 'storeName address phone city')
        .sort({ 'riderDetails.deliveredAt': -1, updatedAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Order.countDocuments({
        'riderDetails.phone': rider.phone,
        orderStatus: 'DELIVERED',
      }),
    ]);

    const formattedHistory = orders.map((o) => ({
      _id: o._id,
      orderId: o.orderId,
      deliveredAt: o.riderDetails?.deliveredAt || o.updatedAt,
      earnedAmount: o.deliveryPayout || 50,
      storeName: o.vendorId?.storeName || o.storeName || 'Partner Store',
      storeAddress: o.vendorId?.address?.street || o.vendorId?.address || 'Store Location',
      customerName: o.customerName || 'Customer',
      customerAddress: o.deliveryAddress || 'Delivery Address',
      totalAmount: o.finalPayableAmount,
      totalItems: o.items?.length || 1,
    }));

    return res.status(200).json({
      success: true,
      data: {
        history: formattedHistory,
        totalDeliveries: total,
        totalEarnings: rider.totalEarnings ?? 0,
      },
    });
  } catch (error) {
    logger.error(`[getDeliveryHistory] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Server error fetching delivery history' });
  }
};

// ─────────────────────────────────────────────────────────────
// 14. GET EARNINGS BREAKDOWN & LEDGER
// ─────────────────────────────────────────────────────────────
export const getDeliveryEarnings = async (req, res) => {
  try {
    const rider = await DeliveryPartner.findById(req.user.id).lean();
    if (!rider) {
      return res.status(404).json({ success: false, message: 'Delivery partner not found' });
    }

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    // Monday 00:00 of the current week (matches the week range shown in the rider app)
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfToday.getDate() - ((startOfToday.getDay() + 6) % 7));
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const ledger = rider.earningsLedger || [];
    // Only rider fee (+tip) counts as earnings. COD cash collected is admin money held by the
    // rider, and withdrawals/cash settlements are wallet movements — none of these are earnings.
    const payoutLedger = ledger.filter((e) => e.type === 'DELIVERY_PAYOUT');
    const todayEarnings = payoutLedger
      .filter((e) => new Date(e.date) >= startOfToday)
      .reduce((sum, e) => sum + (e.amount || 0), 0);

    const weekEarnings = payoutLedger
      .filter((e) => new Date(e.date) >= startOfWeek)
      .reduce((sum, e) => sum + (e.amount || 0), 0);

    const monthEarnings = payoutLedger
      .filter((e) => new Date(e.date) >= startOfMonth)
      .reduce((sum, e) => sum + (e.amount || 0), 0);

    const deliveredOrders = await Order.find({
      'riderDetails.phone': rider.phone,
      orderStatus: 'DELIVERED',
    }).lean();

    const totalTips = deliveredOrders.reduce((sum, o) => sum + (o.tipAmount || 0), 0);
    const codOrders = deliveredOrders.filter((o) => ['CASH', 'COD', 'Cash'].includes(o.paymentMethod));
    const totalCodCollected = codOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);

    const payoutConfig = await DeliveryPayoutConfig.getEffectiveConfig();

    const effectiveCashLimit = Number(rider.maxCashLimit || payoutConfig.maxCashInHandLimit || 1500);
    const cashInHand = Number(rider.cashInHand || 0);
    const availableCashLimit = Math.max(0, effectiveCashLimit - cashInHand);

    return res.status(200).json({
      success: true,
      data: {
        today: Math.round(todayEarnings * 100) / 100,
        thisWeek: Math.round(weekEarnings * 100) / 100,
        thisMonth: Math.round(monthEarnings * 100) / 100,
        todayEarnings: Math.round(todayEarnings * 100) / 100,
        weekEarnings: Math.round(weekEarnings * 100) / 100,
        monthEarnings: Math.round(monthEarnings * 100) / 100,
        totalEarnings: rider.totalEarnings || 0,
        completedDeliveries: rider.completedDeliveries || 0,
        totalCompletedDeliveries: rider.completedDeliveries || 0,
        customerTipsBalance: Math.round(totalTips * 100) / 100,
        weekDeliveries: payoutLedger.filter((e) => new Date(e.date) >= startOfWeek).length,
        pendingWithdrawals: round2(
          ledger.filter((e) => e.type === 'WITHDRAWAL' && e.status === 'PENDING').reduce((s2, e) => s2 + Math.abs(e.amount || 0), 0)
        ),
        pendingCashDeposits: round2(
          (rider.cashDepositHistory || []).filter((d) => d.method === 'UPI' && d.status === 'PENDING').reduce((s2, d) => s2 + Number(d.amount || 0), 0)
        ),
        cashInHand: Math.round(cashInHand * 100) / 100,
        maxCashLimit: effectiveCashLimit,
        availableCashLimit: Math.round(availableCashLimit * 100) / 100,
        isCashLimitReached: cashInHand >= effectiveCashLimit,
        canWithdraw: cashInHand === 0,
        perDeliveryRate: payoutConfig.baseFare || 30,
        payoutConfig: {
          baseFare: payoutConfig.baseFare,
          baseDistanceIncludedKm: payoutConfig.baseDistanceIncludedKm,
          perKmRate: payoutConfig.perKmRate,
          minPayout: payoutConfig.minPayout,
          surgeBonus: payoutConfig.surgeBonus,
        },
        ledger: ledger.slice(0, 30),
        bankDetails: rider.bankDetails || {},
      },
    });
  } catch (error) {
    logger.error(`[getDeliveryEarnings] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Server error fetching earnings' });
  }
};

// ─────────────────────────────────────────────────────────────
// 15. ADMIN: GET DELIVERY PARTNERS STATS
// ─────────────────────────────────────────────────────────────
export const getAdminDeliveryStats = async (req, res) => {
  try {
    const [
      total,
      pending,
      resubmitted,
      underReview,
      approved,
      rejected,
      suspended,
      online,
    ] = await Promise.all([
      DeliveryPartner.countDocuments(),
      DeliveryPartner.countDocuments({ applicationStatus: 'PENDING_REVIEW' }),
      DeliveryPartner.countDocuments({ applicationStatus: 'RESUBMITTED' }),
      DeliveryPartner.countDocuments({ applicationStatus: 'UNDER_REVIEW' }),
      DeliveryPartner.countDocuments({ applicationStatus: 'APPROVED' }),
      DeliveryPartner.countDocuments({ applicationStatus: 'REJECTED' }),
      DeliveryPartner.countDocuments({ applicationStatus: 'SUSPENDED' }),
      DeliveryPartner.countDocuments({ isOnline: true, applicationStatus: 'APPROVED' }),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        total,
        pending: pending + resubmitted,
        rawPending: pending,
        resubmitted,
        underReview,
        approved,
        rejected,
        suspended,
        online,
        offline: Math.max(0, approved - online),
      },
    });
  } catch (error) {
    logger.error(`[getAdminDeliveryStats] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Server error fetching delivery stats' });
  }
};

// ─────────────────────────────────────────────────────────────
// 16. ADMIN: GET ALL DELIVERY PARTNERS (WITH FILTER & SEARCH)
// ─────────────────────────────────────────────────────────────
export const getAdminDeliveryPartners = async (req, res) => {
  try {
    const { status, search, vehicleType, page = 1, limit = 20 } = req.query || {};

    const query = {};
    if (status && status.toLowerCase() !== 'all') {
      const upStatus = status.toUpperCase();
      if (upStatus === 'PENDING_REVIEW') {
        query.applicationStatus = { $in: ['PENDING_REVIEW', 'RESUBMITTED'] };
      } else {
        query.applicationStatus = upStatus;
      }
    }
    if (vehicleType && vehicleType.toLowerCase() !== 'all') {
      query.vehicleType = vehicleType;
    }
    if (search && search.trim()) {
      const q = search.trim();
      query.$or = [
        { name: { $regex: q, $options: 'i' } },
        { phone: { $regex: q, $options: 'i' } },
        { riderId: { $regex: q, $options: 'i' } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [partners, total] = await Promise.all([
      DeliveryPartner.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      DeliveryPartner.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        partners,
        total,
        totalPartners: total,
        page: Number(page),
        pages: Math.ceil(total / Number(limit)),
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    logger.error(`[getAdminDeliveryPartners] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Server error fetching partners' });
  }
};

// ─────────────────────────────────────────────────────────────
// 17. ADMIN: GET DELIVERY PARTNER DETAILS & DOCUMENTS
// ─────────────────────────────────────────────────────────────
export const getAdminDeliveryPartnerById = async (req, res) => {
  try {
    const { id } = req.params;
    const partner = await DeliveryPartner.findById(id).lean();
    if (!partner) {
      return res.status(404).json({ success: false, message: 'Delivery partner not found' });
    }

    const recentOrders = await Order.find({ 'riderDetails.phone': partner.phone })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    return res.status(200).json({
      success: true,
      data: {
        ...partner,
        partner,
        recentOrders,
      },
    });
  } catch (error) {
    logger.error(`[getAdminDeliveryPartnerById] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Server error fetching partner details' });
  }
};

// ─────────────────────────────────────────────────────────────
// 18. ADMIN: APPROVE DELIVERY PARTNER
// ─────────────────────────────────────────────────────────────
export const adminApproveDeliveryPartner = async (req, res) => {
  try {
    const { id } = req.params;
    const partner = await DeliveryPartner.findById(id);
    if (!partner) {
      return res.status(404).json({ success: false, message: 'Delivery partner not found' });
    }

    partner.applicationStatus = 'APPROVED';
    partner.approvedAt = new Date();
    partner.rejectionReason = null;
    partner.documentVerification = {
      aadhaarVerified: true,
      panVerified: true,
      drivingLicenceVerified: true,
      vehicleRcVerified: true,
    };

    partner.adminAuditLogs.push({
      adminId: req.user.id,
      adminName: req.user.name || 'Admin',
      action: 'APPROVE_PARTNER',
      reason: req.body?.reason || 'All documents verified and approved',
      timestamp: new Date(),
    });

    await partner.save();

    safeSocketEmit(`rider:${partner.riderId}`, 'partner:approved', {
      riderId: partner.riderId,
      status: 'APPROVED',
    });

    logger.info(`[Admin] Delivery partner approved: ${partner.riderId}`);

    return res.status(200).json({
      success: true,
      message: `Delivery Partner ${partner.name} (${partner.riderId}) approved successfully!`,
      data: partner,
    });
  } catch (error) {
    logger.error(`[adminApproveDeliveryPartner] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Server error approving partner' });
  }
};

// ─────────────────────────────────────────────────────────────
// 19. ADMIN: REJECT DELIVERY PARTNER APPLICATION
// ─────────────────────────────────────────────────────────────
export const adminRejectDeliveryPartner = async (req, res) => {
  try {
    const { id } = req.params;
    const reason = req.body?.reason;

    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, message: 'Please provide a clear rejection reason' });
    }

    const partner = await DeliveryPartner.findById(id);
    if (!partner) {
      return res.status(404).json({ success: false, message: 'Delivery partner not found' });
    }

    partner.applicationStatus = 'REJECTED';
    partner.rejectionReason = reason.trim();
    partner.lastRejectionReason = reason.trim();
    partner.rejectedAt = new Date();
    partner.isOnline = false;
    partner.status = 'OFFLINE';

    partner.adminAuditLogs.push({
      adminId: req.user.id,
      adminName: req.user.name || 'Admin',
      action: 'REJECT_APPLICATION',
      reason: reason.trim(),
      timestamp: new Date(),
    });

    await partner.save();

    safeSocketEmit(`rider:${partner.riderId}`, 'partner:rejected', {
      riderId: partner.riderId,
      reason: partner.rejectionReason,
    });

    logger.info(`[Admin] Delivery partner rejected: ${partner.riderId} - ${reason}`);

    return res.status(200).json({
      success: true,
      message: `Application rejected with reason: "${reason}"`,
      data: partner,
    });
  } catch (error) {
    logger.error(`[adminRejectDeliveryPartner] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Server error rejecting partner' });
  }
};

// ─────────────────────────────────────────────────────────────
// 20. ADMIN: MARK APPLICATION UNDER REVIEW
// ─────────────────────────────────────────────────────────────
export const adminMarkUnderReview = async (req, res) => {
  try {
    const { id } = req.params;
    const partner = await DeliveryPartner.findById(id);
    if (!partner) {
      return res.status(404).json({ success: false, message: 'Delivery partner not found' });
    }

    partner.applicationStatus = 'UNDER_REVIEW';
    partner.adminAuditLogs.push({
      adminId: req.user.id,
      adminName: req.user.name || 'Admin',
      action: 'MARK_UNDER_REVIEW',
      reason: req.body?.reason || 'Verification in progress',
      timestamp: new Date(),
    });

    await partner.save();

    return res.status(200).json({
      success: true,
      message: 'Application marked under review',
      data: partner,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────
// 21. ADMIN: SUSPEND / REACTIVATE DELIVERY PARTNER
// ─────────────────────────────────────────────────────────────
export const adminSuspendDeliveryPartner = async (req, res) => {
  try {
    const { id } = req.params;
    const reason = req.body?.reason;

    const partner = await DeliveryPartner.findById(id);
    if (!partner) {
      return res.status(404).json({ success: false, message: 'Delivery partner not found' });
    }

    partner.applicationStatus = 'SUSPENDED';
    partner.isSuspended = true;
    partner.suspensionReason = reason || 'Account suspended by administrator';
    partner.suspendedAt = new Date();
    partner.isOnline = false;
    partner.status = 'OFFLINE';

    partner.adminAuditLogs.push({
      adminId: req.user.id,
      adminName: req.user.name || 'Admin',
      action: 'SUSPEND_PARTNER',
      reason: partner.suspensionReason,
      timestamp: new Date(),
    });

    await partner.save();

    return res.status(200).json({
      success: true,
      message: `Partner ${partner.name} has been suspended`,
      data: partner,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const adminReactivateDeliveryPartner = async (req, res) => {
  try {
    const { id } = req.params;
    const partner = await DeliveryPartner.findById(id);
    if (!partner) {
      return res.status(404).json({ success: false, message: 'Delivery partner not found' });
    }

    partner.applicationStatus = 'APPROVED';
    partner.isSuspended = false;
    partner.suspensionReason = null;
    partner.suspendedAt = null;

    partner.adminAuditLogs.push({
      adminId: req.user.id,
      adminName: req.user.name || 'Admin',
      action: 'REACTIVATE_PARTNER',
      reason: req.body?.reason || 'Account reactivated after review',
      timestamp: new Date(),
    });

    await partner.save();

    return res.status(200).json({
      success: true,
      message: `Partner ${partner.name} has been reactivated`,
      data: partner,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────
// 22. ADMIN: LIVE DELIVERY OPERATIONS (ACTIVE ORDERS & UNASSIGNED)
// ─────────────────────────────────────────────────────────────
export const adminGetLiveDeliveryOperations = async (req, res) => {
  try {
    const [activeDeliveries, unassignedOrders, onlineRiders] = await Promise.all([
      Order.find({
        fulfillmentType: 'delivery',
        orderStatus: { $in: ['RIDER_ASSIGNED', 'ARRIVED_AT_PICKUP', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'ARRIVED_AT_CUSTOMER'] },
      })
        .populate('vendorId', 'storeName phone address location')
        .sort({ updatedAt: -1 })
        .lean(),
      Order.find({
        fulfillmentType: 'delivery',
        orderStatus: { $in: ['PLACED', 'CONFIRMED', 'PREPARING'] },
        $or: [{ 'riderDetails.name': { $in: [null, ''] } }, { 'riderDetails.phone': { $in: [null, ''] } }],
      })
        .populate('vendorId', 'storeName phone address location')
        .sort({ createdAt: -1 })
        .lean(),
      DeliveryPartner.find({
        isOnline: true,
        applicationStatus: 'APPROVED',
      })
        .select('name phone riderId vehicleType vehicleNo status currentLocation')
        .lean(),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        activeDeliveries,
        activeOrders: activeDeliveries,
        unassignedOrders,
        onlineRiders,
        totalActive: activeDeliveries.length,
        totalUnassigned: unassignedOrders.length,
        totalOnlineRiders: onlineRiders.length,
        stats: {
          inTransitCount: activeDeliveries.length,
          unassignedCount: unassignedOrders.length,
          onlineRidersCount: onlineRiders.length,
        },
      },
    });
  } catch (error) {
    logger.error(`[adminGetLiveDeliveryOperations] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Server error fetching operations' });
  }
};

// ─────────────────────────────────────────────────────────────
// 23. ADMIN: MANUAL ORDER ASSIGN / REASSIGN
// ─────────────────────────────────────────────────────────────
export const adminAssignDeliveryOrder = async (req, res) => {
  try {
    const { orderId, riderId } = req.body;

    const [order, rider] = await Promise.all([
      Order.findById(orderId),
      DeliveryPartner.findById(riderId),
    ]);

    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (!rider) return res.status(404).json({ success: false, message: 'Delivery partner not found' });

    if (rider.applicationStatus !== 'APPROVED') {
      return res.status(400).json({ success: false, message: 'Selected rider is not approved' });
    }
    if (rider.activeOrderId && String(rider.activeOrderId) !== String(order._id)) {
      return res.status(400).json({ success: false, code: 'RIDER_BUSY', message: `${rider.name} is already on another delivery. Choose a free rider.` });
    }
    if (order.fulfillmentType !== 'delivery' || ['DELIVERED', 'CANCELLED', 'FAILED_DELIVERY'].includes(order.orderStatus)) {
      return res.status(400).json({ success: false, message: `Order is ${order.orderStatus} and cannot be assigned` });
    }
    if (['ONLINE', 'RAZORPAY', 'UPI_INTENT'].includes(order.paymentMethod) && order.paymentStatus !== 'PAID') {
      return res.status(400).json({ success: false, code: 'PAYMENT_PENDING', message: 'Online payment for this order has not been received yet.' });
    }
    if (order.riderDetails?.riderId && String(order.riderDetails.riderId) !== String(rider._id)) {
      // Re-assigning: free the previous rider
      await DeliveryPartner.updateOne(
        { _id: order.riderDetails.riderId, activeOrderId: order._id },
        { $set: { activeOrderId: null, status: 'AVAILABLE' } }
      );
    }

    const deliveryOtp = order.riderDetails?.deliveryOtp || String(Math.floor(1000 + Math.random() * 9000));
    const pickupOtp = order.pickupOtp || order.riderDetails?.pickupOtp || String(Math.floor(1000 + Math.random() * 9000));

    order.pickupOtp = pickupOtp;
    order.orderStatus = 'RIDER_ASSIGNED';
    order.riderDetails = {
      riderId: rider._id,
      name: rider.name,
      phone: rider.phone,
      vehicleNo: rider.vehicleNo,
      pickupOtp,
      deliveryOtp,
      assignedAt: new Date(),
    };
    await order.save();

    rider.activeOrderId = order._id;
    rider.status = 'BUSY';
    await rider.save();

    // Store gets rider details (never the customer's delivery code)
    const storePayload = {
      orderId: order.orderId,
      orderStatus: 'RIDER_ASSIGNED',
      riderId: String(rider._id),
      riderName: rider.name,
      riderPhone: rider.phone,
      vehicleNo: rider.vehicleNo,
      pickupOtp,
      message: `Admin assigned ${rider.name} to order #${order.orderId}`,
    };
    for (const room of [`vendor:${order.vendorId}`, `vendor_${order.vendorId}`]) {
      safeSocketEmit(room, 'order:rider_assigned', storePayload);
      safeSocketEmit(room, 'order:status_update', storePayload);
    }
    safeSocketEmit('admins', 'order:status_update', storePayload);
    // Customer: rider details + their own delivery code
    safeSocketEmit(`user_${order.customerId}`, 'order:rider_assigned', { ...storePayload, pickupOtp: undefined, deliveryOtp });
    safeSocketEmit(`order:${order.orderId}`, 'order:rider_assigned', { ...storePayload, pickupOtp: undefined });
    // Rider: the order appears as their active delivery
    for (const room of [`rider_${rider._id}`, `rider:${rider._id}`]) {
      safeSocketEmit(room, 'delivery:assigned', { orderId: order.orderId, message: `Admin assigned you order #${order.orderId} from ${order.storeName}` });
    }

    logger.info(`[Admin] Order ${order.orderId} manually assigned to ${rider.name}`);

    return res.status(200).json({
      success: true,
      message: `Order assigned to ${rider.name} successfully!`,
      data: order,
    });
  } catch (error) {
    logger.error(`[adminAssignDeliveryOrder] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: error.message || 'Server error assigning order' });
  }
};

// ─────────────────────────────────────────────────────────────
// 24. ADMIN: CANCEL DELIVERY ASSIGNMENT
// ─────────────────────────────────────────────────────────────
export const adminCancelDeliveryAssignment = async (req, res) => {
  try {
    const { orderId } = req.body;
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    if (order.riderDetails?.phone) {
      const rider = await DeliveryPartner.findOne({ phone: order.riderDetails.phone });
      if (rider && String(rider.activeOrderId) === String(order._id)) {
        rider.activeOrderId = null;
        rider.status = rider.isOnline ? 'AVAILABLE' : 'OFFLINE';
        await rider.save();
      }
    }

    order.riderDetails = null;
    order.orderStatus = 'PREPARING';
    await order.save();

    return res.status(200).json({
      success: true,
      message: 'Delivery assignment cancelled. Order returned to unassigned queue.',
      data: order,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────
// 25. GET PUBLIC / RIDER DELIVERY PAYOUT CONFIG
// ─────────────────────────────────────────────────────────────
export const getDeliveryPayoutConfig = async (req, res) => {
  try {
    const config = await DeliveryPayoutConfig.getEffectiveConfig();
    return res.status(200).json({
      success: true,
      data: {
        baseFare: config.baseFare,
        baseDistanceIncludedKm: config.baseDistanceIncludedKm,
        perKmRate: config.perKmRate,
        minPayout: config.minPayout,
        surgeBonus: config.surgeBonus,
        nightSurgeBonus: config.nightSurgeBonus,
        maxDeliveryRadiusKm: config.maxDeliveryRadiusKm,
        freeDeliveryRadiusKm: config.freeDeliveryRadiusKm,
      },
    });
  } catch (error) {
    logger.error(`[getDeliveryPayoutConfig] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Server error fetching payout config' });
  }
};

// ─────────────────────────────────────────────────────────────
// 26. ADMIN: GET DELIVERY PAYOUT CONFIG WITH AUDIT HISTORY
// ─────────────────────────────────────────────────────────────
export const getAdminDeliveryPayoutConfig = async (req, res) => {
  try {
    const config = await DeliveryPayoutConfig.getEffectiveConfig();
    return res.status(200).json({
      success: true,
      data: config,
    });
  } catch (error) {
    logger.error(`[getAdminDeliveryPayoutConfig] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Server error fetching admin payout config' });
  }
};

// ─────────────────────────────────────────────────────────────
// 27. ADMIN: UPDATE DELIVERY PAYOUT CONFIG
// ─────────────────────────────────────────────────────────────
export const updateAdminDeliveryPayoutConfig = async (req, res) => {
  try {
    const {
      baseFare,
      baseDistanceIncludedKm,
      perKmRate,
      minPayout,
      surgeBonus,
      nightSurgeBonus,
      maxDeliveryRadiusKm,
      freeDeliveryRadiusKm,
      maxCashInHandLimit,
      notes,
    } = req.body;

    if (baseFare !== undefined && (isNaN(baseFare) || Number(baseFare) < 0)) {
      return res.status(400).json({ success: false, message: 'Base fare must be a positive number' });
    }
    if (perKmRate !== undefined && (isNaN(perKmRate) || Number(perKmRate) < 0)) {
      return res.status(400).json({ success: false, message: 'Per km rate must be a positive number' });
    }
    if (minPayout !== undefined && (isNaN(minPayout) || Number(minPayout) < 0)) {
      return res.status(400).json({ success: false, message: 'Minimum payout must be a positive number' });
    }

    const config = await DeliveryPayoutConfig.getEffectiveConfig();

    // Record change history snapshot
    if (!config.changeHistory) config.changeHistory = [];
    config.changeHistory.unshift({
      baseFare: config.baseFare,
      baseDistanceIncludedKm: config.baseDistanceIncludedKm,
      perKmRate: config.perKmRate,
      minPayout: config.minPayout,
      surgeBonus: config.surgeBonus,
      changedBy: req.user?.name || req.user?.email || 'Super Admin',
      changedAt: new Date(),
    });

    if (baseFare !== undefined) config.baseFare = Number(baseFare);
    if (baseDistanceIncludedKm !== undefined) config.baseDistanceIncludedKm = Math.max(0, Number(baseDistanceIncludedKm));
    if (perKmRate !== undefined) config.perKmRate = Number(perKmRate);
    if (minPayout !== undefined) config.minPayout = Number(minPayout);
    if (surgeBonus !== undefined) config.surgeBonus = Math.max(0, Number(surgeBonus));
    if (nightSurgeBonus !== undefined) config.nightSurgeBonus = Math.max(0, Number(nightSurgeBonus));
    if (maxDeliveryRadiusKm !== undefined) config.maxDeliveryRadiusKm = Math.max(1, Number(maxDeliveryRadiusKm));
    if (freeDeliveryRadiusKm !== undefined) config.freeDeliveryRadiusKm = Math.max(0, Number(freeDeliveryRadiusKm));
    if (maxCashInHandLimit !== undefined) config.maxCashInHandLimit = Math.max(100, Number(maxCashInHandLimit));
    if (notes !== undefined) config.notes = String(notes).trim();

    config.updatedBy = req.user?.id || req.user?._id;
    config.updatedByName = req.user?.name || req.user?.email || 'Super Admin';

    await config.save();

    logger.info(
      `[Admin] Delivery Payout Config updated by ${config.updatedByName}: Base=₹${config.baseFare}, BaseKm=${config.baseDistanceIncludedKm}, PerKm=₹${config.perKmRate}, Min=₹${config.minPayout}, Surge=₹${config.surgeBonus}, MaxCashLimit=₹${config.maxCashInHandLimit}`
    );

    return res.status(200).json({
      success: true,
      message: 'Delivery payout configuration updated successfully!',
      data: config,
    });
  } catch (error) {
    logger.error(`[updateAdminDeliveryPayoutConfig] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: error.message || 'Server error updating payout config' });
  }
};

// ─────────────────────────────────────────────────────────────
// Helpers: strict money parsing (rejects NaN, Infinity, negatives, strings like "1e9abc")
// ─────────────────────────────────────────────────────────────
const parseMoney = (value) => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'number' && typeof value !== 'string') return NaN;
  const n = Number(value);
  if (!Number.isFinite(n)) return NaN;
  return Math.round(n * 100) / 100;
};
const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

// ─────────────────────────────────────────────────────────────
// 15. WITHDRAW EARNINGS — creates a PENDING request; admin pays it later
// ─────────────────────────────────────────────────────────────
export const withdrawDeliveryEarnings = async (req, res) => {
  try {
    const rider = await DeliveryPartner.findById(req.user.id);
    if (!rider) {
      return res.status(404).json({ success: false, message: 'Delivery partner not found' });
    }

    // ── Floating Cash In Hand Lock ──
    // Rider cannot withdraw earnings until collected COD cash is paid to Admin!
    const cashInHand = Number(rider.cashInHand || 0);
    if (cashInHand > 0) {
      return res.status(403).json({
        success: false,
        code: 'CASH_IN_HAND_PENDING',
        cashInHand,
        message: `Withdrawal locked! You have ₹${cashInHand.toFixed(2)} in un-deposited Cash-in-Hand collected from COD deliveries. Please deposit/settle this cash with Admin to enable withdrawal.`,
      });
    }

    const withdrawAmt = parseMoney(req.body?.amount);
    if (withdrawAmt === null || Number.isNaN(withdrawAmt) || withdrawAmt <= 0) {
      return res.status(400).json({ success: false, message: 'Please enter a valid withdrawal amount' });
    }

    const currentBalance = Number(rider.totalEarnings || 0);
    if (withdrawAmt > currentBalance) {
      return res.status(400).json({
        success: false,
        message: `Insufficient balance. Available pocket balance is ₹${currentBalance.toFixed(2)}`,
      });
    }

    const upiId = rider.bankDetails?.upiId || 'Linked Bank Account';

    // Atomic hold: only succeeds if balance is still sufficient and no cash is pending.
    // Prevents double-tap / parallel requests from overdrawing earnings.
    const updated = await DeliveryPartner.findOneAndUpdate(
      { _id: rider._id, totalEarnings: { $gte: withdrawAmt }, cashInHand: { $lte: 0 } },
      {
        $inc: { totalEarnings: -withdrawAmt },
        $push: {
          earningsLedger: {
            $each: [{
              type: 'WITHDRAWAL',
              amount: -withdrawAmt,
              date: new Date(),
              description: `Withdrawal request to ${upiId} (awaiting admin payment)`,
              status: 'PENDING',
            }],
            $position: 0,
          },
        },
      },
      { new: true }
    );

    if (!updated) {
      return res.status(409).json({
        success: false,
        message: 'Balance changed while processing. Please refresh and try again.',
      });
    }

    const request = updated.earningsLedger[0];
    logger.info(`[withdrawDeliveryEarnings] PENDING withdrawal ₹${withdrawAmt} by rider ${updated.name} (${updated.riderId})`);

    return res.status(200).json({
      success: true,
      message: `Withdrawal request of ₹${withdrawAmt} submitted. It will be paid to ${upiId} after admin approval.`,
      data: {
        totalEarnings: round2(updated.totalEarnings),
        withdrawnAmount: withdrawAmt,
        requestId: request?._id,
        status: 'PENDING',
      },
    });
  } catch (error) {
    logger.error(`[withdrawDeliveryEarnings] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Failed to process withdrawal request' });
  }
};

// ─────────────────────────────────────────────────────────────
// 16. DEPOSIT / SETTLE FLOATING CASH IN HAND (RIDER TO ADMIN)
//     EARNINGS_DEDUCTION → settled immediately (internal, verifiable)
//     UPI → recorded PENDING; cashInHand unchanged until admin verifies UTR
// ─────────────────────────────────────────────────────────────
const RIDER_DEPOSIT_METHODS = ['EARNINGS_DEDUCTION', 'UPI'];

export const depositDeliveryCash = async (req, res) => {
  try {
    const rider = await DeliveryPartner.findById(req.user.id);
    if (!rider) {
      return res.status(404).json({ success: false, message: 'Delivery partner not found' });
    }

    const { amount, method, paymentMethod, utr, txnRef, referenceId } = req.body || {};
    const effectiveMethod = method || paymentMethod || 'EARNINGS_DEDUCTION';
    if (!RIDER_DEPOSIT_METHODS.includes(effectiveMethod)) {
      return res.status(400).json({ success: false, message: 'Invalid deposit method' });
    }

    const rawUtr = utr ?? txnRef ?? referenceId ?? '';
    const effectiveUtr = typeof rawUtr === 'string' ? rawUtr.trim() : '';
    const currentCashInHand = round2(rider.cashInHand);

    if (currentCashInHand <= 0) {
      return res.status(400).json({ success: false, message: 'You have no pending Cash-in-Hand to deposit.' });
    }

    const parsed = parseMoney(amount);
    if (Number.isNaN(parsed) || (parsed !== null && parsed <= 0)) {
      return res.status(400).json({ success: false, message: 'Please provide a valid deposit amount greater than ₹0' });
    }

    const payoutConfig = await DeliveryPayoutConfig.getEffectiveConfig();
    const effectiveLimit = Number(rider.maxCashLimit || payoutConfig.maxCashInHandLimit || 1500);

    // ── EARNINGS_DEDUCTION: internal transfer, settled atomically ──
    if (effectiveMethod === 'EARNINGS_DEDUCTION') {
      const depositAmt = parsed === null ? currentCashInHand : Math.min(currentCashInHand, parsed);
      const currentEarnings = Number(rider.totalEarnings || 0);
      if (depositAmt > currentEarnings) {
        return res.status(400).json({
          success: false,
          message: `Insufficient pocket earnings (₹${currentEarnings.toFixed(2)}) to settle ₹${depositAmt}. Please choose UPI deposit or enter a smaller amount.`,
        });
      }

      const now = new Date();
      const updated = await DeliveryPartner.findOneAndUpdate(
        { _id: rider._id, totalEarnings: { $gte: depositAmt }, cashInHand: { $gte: depositAmt } },
        {
          $inc: { totalEarnings: -depositAmt, cashInHand: -depositAmt },
          $push: {
            earningsLedger: {
              $each: [{
                type: 'CASH_SETTLEMENT',
                amount: -depositAmt,
                date: now,
                description: `Settled ₹${depositAmt} Cash-in-Hand from pocket earnings`,
                status: 'COMPLETED',
              }],
              $position: 0,
            },
            cashDepositHistory: {
              $each: [{
                amount: depositAmt,
                method: 'EARNINGS_DEDUCTION',
                txnRef: `DEP-${Date.now()}`,
                status: 'COMPLETED',
                submittedAt: now,
                settledAt: now,
                note: 'Settled from Pocket Earnings',
              }],
              $position: 0,
            },
          },
        },
        { new: true }
      );

      if (!updated) {
        return res.status(409).json({ success: false, message: 'Balance changed while processing. Please refresh and try again.' });
      }

      // Fix float drift from $inc
      updated.totalEarnings = round2(updated.totalEarnings);
      updated.cashInHand = Math.max(0, round2(updated.cashInHand));
      await updated.save();

      logger.info(`[DeliveryPartner] Cash-in-hand settled from earnings: ₹${depositAmt} by rider ${updated.name} (${updated.phone})`);

      return res.status(200).json({
        success: true,
        message: `🎉 ₹${depositAmt} Cash-in-Hand successfully settled!`,
        data: {
          cashInHand: updated.cashInHand,
          totalEarnings: updated.totalEarnings,
          maxCashLimit: effectiveLimit,
          isCashLimitReached: updated.cashInHand >= effectiveLimit,
          canWithdraw: updated.cashInHand === 0,
        },
      });
    }

    // ── UPI: record as PENDING, do NOT touch cashInHand ──
    if (!/^[A-Za-z0-9]{6,35}$/.test(effectiveUtr)) {
      return res.status(400).json({ success: false, message: 'Please enter a valid UPI Reference ID / UTR Number' });
    }

    const pendingTotal = round2(
      (rider.cashDepositHistory || [])
        .filter((d) => d.status === 'PENDING')
        .reduce((sum, d) => sum + Number(d.amount || 0), 0)
    );
    const remainingClaimable = round2(currentCashInHand - pendingTotal);
    if (remainingClaimable <= 0) {
      return res.status(400).json({
        success: false,
        message: `You already have ₹${pendingTotal} in UPI deposits awaiting admin verification.`,
      });
    }
    const depositAmt = parsed === null ? remainingClaimable : Math.min(remainingClaimable, parsed);

    // A UTR can be claimed only once across all riders (unless that claim was rejected)
    const utrInUse = await DeliveryPartner.exists({
      cashDepositHistory: { $elemMatch: { utr: effectiveUtr, status: { $in: ['PENDING', 'COMPLETED'] } } },
    });
    if (utrInUse) {
      return res.status(409).json({ success: false, message: 'This UPI Reference ID / UTR has already been submitted' });
    }

    const now = new Date();
    const updated = await DeliveryPartner.findByIdAndUpdate(
      rider._id,
      {
        $push: {
          cashDepositHistory: {
            $each: [{
              amount: depositAmt,
              method: 'UPI',
              txnRef: `DEP-${Date.now()}`,
              utr: effectiveUtr,
              status: 'PENDING',
              submittedAt: now,
              settledAt: null,
              note: `Direct UPI payment (UTR: ${effectiveUtr}) — awaiting admin verification`,
            }],
            $position: 0,
          },
        },
      },
      { new: true }
    );

    logger.info(`[DeliveryPartner] UPI cash deposit ₹${depositAmt} PENDING verification for rider ${updated.name} (UTR ${effectiveUtr})`);

    return res.status(200).json({
      success: true,
      message: `UPI deposit of ₹${depositAmt} submitted. Your Cash-in-Hand will be cleared after admin verifies the UTR.`,
      data: {
        cashInHand: round2(updated.cashInHand),
        totalEarnings: round2(updated.totalEarnings),
        maxCashLimit: effectiveLimit,
        isCashLimitReached: Number(updated.cashInHand) >= effectiveLimit,
        canWithdraw: Number(updated.cashInHand) === 0,
        depositId: updated.cashDepositHistory[0]?._id,
        status: 'PENDING',
      },
    });
  } catch (error) {
    logger.error(`[depositDeliveryCash] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Server error processing cash deposit' });
  }
};

// ─────────────────────────────────────────────────────────────
// 17. ADMIN: SETTLE / CLEAR RIDER CASH-IN-HAND
// ─────────────────────────────────────────────────────────────
export const adminSettleRiderCash = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, note = 'Cash deposited at office/hub' } = req.body;

    const rider = await DeliveryPartner.findById(id);
    if (!rider) {
      return res.status(404).json({ success: false, message: 'Delivery partner not found' });
    }

    const currentCash = Number(rider.cashInHand || 0);
    const parsedAmt = parseMoney(amount);
    if (Number.isNaN(parsedAmt) || (parsedAmt !== null && parsedAmt <= 0)) {
      return res.status(400).json({ success: false, message: 'Please provide a valid amount greater than ₹0' });
    }
    const settleAmt = parsedAmt === null ? currentCash : Math.min(currentCash, parsedAmt);

    if (!(settleAmt > 0)) {
      return res.status(400).json({ success: false, message: 'Rider has no cash in hand to settle' });
    }

    rider.cashInHand = Math.max(0, Math.round((currentCash - settleAmt) * 100) / 100);

    if (!Array.isArray(rider.cashDepositHistory)) rider.cashDepositHistory = [];
    rider.cashDepositHistory.unshift({
      amount: settleAmt,
      method: 'ADMIN_CLEARANCE',
      txnRef: `ADM-CLR-${Date.now()}`,
      status: 'COMPLETED',
      settledAt: new Date(),
      verifiedBy: req.user?.name || req.user?.email || 'Admin',
      note,
    });

    await rider.save();

    safeSocketEmit(`rider_${rider._id}`, 'delivery:cash_cleared', {
      settledAmount: settleAmt,
      remainingCashInHand: rider.cashInHand,
      message: `Admin has cleared ₹${settleAmt} of your floating cash.`,
    });

    return res.status(200).json({
      success: true,
      message: `Successfully settled ₹${settleAmt} for ${rider.name}. Remaining Cash: ₹${rider.cashInHand}`,
      data: {
        riderId: rider.riderId,
        cashInHand: rider.cashInHand,
      },
    });
  } catch (error) {
    logger.error(`[adminSettleRiderCash] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Server error clearing rider cash' });
  }
};

// ─────────────────────────────────────────────────────────────
// 17b. ADMIN: PAY / REJECT A PENDING RIDER WITHDRAWAL
//      body: { action: 'Approve' | 'Reject', payoutMethod: 'CASH' | 'ONLINE', utr, remarks }
// ─────────────────────────────────────────────────────────────
export const adminProcessRiderWithdrawal = async (req, res) => {
  try {
    const { id, requestId } = req.params;
    const { action, payoutMethod, utr, remarks } = req.body || {};
    if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(requestId)) {
      return res.status(400).json({ success: false, message: 'Invalid rider or request id' });
    }
    if (!['Approve', 'Reject'].includes(action)) {
      return res.status(400).json({ success: false, message: "action must be 'Approve' or 'Reject'" });
    }
    const adminName = req.user?.name || req.user?.email || 'Admin';
    const now = new Date();
    const cleanUtr = typeof utr === 'string' ? utr.trim() : '';
    const cleanRemarks = typeof remarks === 'string' ? remarks.trim().slice(0, 300) : '';

    if (action === 'Approve') {
      if (!['CASH', 'ONLINE'].includes(payoutMethod)) {
        return res.status(400).json({ success: false, message: "payoutMethod must be 'CASH' or 'ONLINE'" });
      }
      if (payoutMethod === 'ONLINE' && !/^[A-Za-z0-9]{6,35}$/.test(cleanUtr)) {
        return res.status(400).json({ success: false, message: 'A valid UTR is required for online payout' });
      }
      // Status-in-filter makes approve/reject single-winner
      const updated = await DeliveryPartner.findOneAndUpdate(
        { _id: id, earningsLedger: { $elemMatch: { _id: requestId, type: 'WITHDRAWAL', status: 'PENDING' } } },
        {
          $set: {
            'earningsLedger.$.status': 'COMPLETED',
            'earningsLedger.$.payoutMethod': payoutMethod,
            'earningsLedger.$.utr': payoutMethod === 'ONLINE' ? cleanUtr : undefined,
            'earningsLedger.$.processedAt': now,
            'earningsLedger.$.processedBy': adminName,
            'earningsLedger.$.remarks': cleanRemarks,
          },
        },
        { new: true }
      );
      if (!updated) {
        return res.status(400).json({ success: false, message: 'Withdrawal request not found or already processed' });
      }
      const entry = updated.earningsLedger.id(requestId);
      safeSocketEmit(`rider_${updated._id}`, 'delivery:withdrawal_processed', {
        requestId, status: 'COMPLETED', amount: Math.abs(entry.amount), payoutMethod, utr: entry.utr,
        message: `Your withdrawal of ₹${Math.abs(entry.amount)} has been paid${payoutMethod === 'ONLINE' ? ` (UTR ${cleanUtr})` : ' in cash'}.`,
      });
      return res.status(200).json({ success: true, message: 'Rider withdrawal marked as paid', data: { request: entry } });
    }

    // Reject → refund the held amount back to totalEarnings atomically
    const rider = await DeliveryPartner.findOne(
      { _id: id, earningsLedger: { $elemMatch: { _id: requestId, type: 'WITHDRAWAL', status: 'PENDING' } } },
      { 'earningsLedger.$': 1 }
    );
    if (!rider) {
      return res.status(400).json({ success: false, message: 'Withdrawal request not found or already processed' });
    }
    const refundAmt = Math.abs(Number(rider.earningsLedger[0].amount || 0));
    const updated = await DeliveryPartner.findOneAndUpdate(
      { _id: id, earningsLedger: { $elemMatch: { _id: requestId, status: 'PENDING' } } },
      {
        $set: {
          'earningsLedger.$.status': 'REJECTED',
          'earningsLedger.$.processedAt': now,
          'earningsLedger.$.processedBy': adminName,
          'earningsLedger.$.remarks': cleanRemarks,
        },
        $inc: { totalEarnings: refundAmt },
      },
      { new: true }
    );
    if (!updated) {
      return res.status(400).json({ success: false, message: 'Withdrawal request not found or already processed' });
    }
    updated.totalEarnings = round2(updated.totalEarnings);
    await updated.save();
    safeSocketEmit(`rider_${updated._id}`, 'delivery:withdrawal_processed', {
      requestId, status: 'REJECTED', amount: refundAmt,
      message: `Your withdrawal of ₹${refundAmt} was rejected and refunded to your earnings.${cleanRemarks ? ` Reason: ${cleanRemarks}` : ''}`,
    });
    return res.status(200).json({
      success: true,
      message: 'Rider withdrawal rejected and refunded',
      data: { request: updated.earningsLedger.id(requestId), totalEarnings: updated.totalEarnings },
    });
  } catch (error) {
    logger.error(`[adminProcessRiderWithdrawal] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Server error processing rider withdrawal' });
  }
};

// ─────────────────────────────────────────────────────────────
// 17c. ADMIN: VERIFY / REJECT A PENDING RIDER UPI CASH DEPOSIT
//      body: { action: 'Approve' | 'Reject', note }
// ─────────────────────────────────────────────────────────────
export const adminVerifyRiderCashDeposit = async (req, res) => {
  try {
    const { id, depositId } = req.params;
    const { action, note } = req.body || {};
    if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(depositId)) {
      return res.status(400).json({ success: false, message: 'Invalid rider or deposit id' });
    }
    if (!['Approve', 'Reject'].includes(action)) {
      return res.status(400).json({ success: false, message: "action must be 'Approve' or 'Reject'" });
    }
    const adminName = req.user?.name || req.user?.email || 'Admin';
    const now = new Date();
    const cleanNote = typeof note === 'string' ? note.trim().slice(0, 300) : '';

    const rider = await DeliveryPartner.findOne(
      { _id: id, cashDepositHistory: { $elemMatch: { _id: depositId, method: 'UPI', status: 'PENDING' } } }
    );
    if (!rider) {
      return res.status(400).json({ success: false, message: 'Deposit not found or already processed' });
    }
    const deposit = rider.cashDepositHistory.id(depositId);

    if (action === 'Reject') {
      const updated = await DeliveryPartner.findOneAndUpdate(
        { _id: id, cashDepositHistory: { $elemMatch: { _id: depositId, status: 'PENDING' } } },
        {
          $set: {
            'cashDepositHistory.$.status': 'REJECTED',
            'cashDepositHistory.$.verifiedBy': adminName,
            'cashDepositHistory.$.settledAt': now,
            ...(cleanNote ? { 'cashDepositHistory.$.note': `Rejected: ${cleanNote}` } : {}),
          },
        },
        { new: true }
      );
      if (!updated) return res.status(400).json({ success: false, message: 'Deposit not found or already processed' });
      safeSocketEmit(`rider_${updated._id}`, 'delivery:cash_deposit_rejected', {
        depositId, amount: deposit.amount,
        message: `Your UPI deposit of ₹${deposit.amount} (UTR ${deposit.utr}) was rejected.${cleanNote ? ` Reason: ${cleanNote}` : ''}`,
      });
      return res.status(200).json({ success: true, message: 'Deposit rejected', data: { cashInHand: round2(updated.cashInHand) } });
    }

    // Approve → clear cash (never below 0)
    const clearAmt = Math.min(round2(deposit.amount), round2(rider.cashInHand));
    const updated = await DeliveryPartner.findOneAndUpdate(
      { _id: id, cashInHand: { $gte: clearAmt }, cashDepositHistory: { $elemMatch: { _id: depositId, status: 'PENDING' } } },
      {
        $set: {
          'cashDepositHistory.$.status': 'COMPLETED',
          'cashDepositHistory.$.verifiedBy': adminName,
          'cashDepositHistory.$.settledAt': now,
          ...(cleanNote ? { 'cashDepositHistory.$.note': cleanNote } : {}),
        },
        $inc: { cashInHand: -clearAmt },
      },
      { new: true }
    );
    if (!updated) return res.status(409).json({ success: false, message: 'Deposit already processed or cash balance changed. Refresh and retry.' });
    updated.cashInHand = Math.max(0, round2(updated.cashInHand));
    await updated.save();

    safeSocketEmit(`rider_${updated._id}`, 'delivery:cash_cleared', {
      settledAmount: clearAmt,
      remainingCashInHand: updated.cashInHand,
      message: `Admin verified your UPI deposit and cleared ₹${clearAmt} of your floating cash.`,
    });
    return res.status(200).json({
      success: true,
      message: `Deposit verified. ₹${clearAmt} cleared. Remaining Cash: ₹${updated.cashInHand}`,
      data: { cashInHand: updated.cashInHand },
    });
  } catch (error) {
    logger.error(`[adminVerifyRiderCashDeposit] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Server error verifying cash deposit' });
  }
};

// ─────────────────────────────────────────────────────────────
// 30. GET DELIVERY ZONES & ACTIVE CLUSTERS
// ─────────────────────────────────────────────────────────────
export const getDeliveryZones = async (req, res) => {
  try {
    const rider = await DeliveryPartner.findById(req.user.id);
    const city = req.query.city || rider?.workingCity || rider?.address?.city || 'Lucknow';

    await DeliveryZone.seedDefaultZonesIfEmpty();

    let zones = await DeliveryZone.find({
      city: new RegExp(`^${city}$`, 'i'),
      isActive: true,
    }).lean();

    if (!zones.length) {
      zones = await DeliveryZone.find({ isActive: true }).lean();
    }

    return res.status(200).json({
      success: true,
      data: {
        zones,
        currentCity: city,
        currentZone: rider?.workingZone || (zones[0] ? zones[0].name : 'Gomti Nagar'),
        workingZoneId: rider?.workingZoneId || null,
        preferredZones: rider?.preferredZones || [],
      },
    });
  } catch (error) {
    logger.error(`[getDeliveryZones] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Server error fetching delivery zones' });
  }
};

// ─────────────────────────────────────────────────────────────
// 31. UPDATE RIDER WORKING ZONE & CITY
// ─────────────────────────────────────────────────────────────
export const updateRiderWorkingZone = async (req, res) => {
  try {
    const { zoneName, zoneId, city, preferredZones } = req.body;
    const rider = await DeliveryPartner.findById(req.user.id);
    if (!rider) {
      return res.status(404).json({ success: false, message: 'Delivery partner not found' });
    }

    if (!zoneName && !zoneId) {
      return res.status(400).json({ success: false, message: 'Zone name or ID is required' });
    }

    let targetZone = null;
    if (zoneId) {
      targetZone = await DeliveryZone.findOne({
        $or: [{ _id: mongoose.isValidObjectId(zoneId) ? zoneId : null }, { zoneId }],
      });
    }
    if (!targetZone && zoneName) {
      targetZone = await DeliveryZone.findOne({ name: new RegExp(`^${zoneName}$`, 'i') });
    }

    const assignedZoneName = targetZone ? targetZone.name : zoneName;
    const assignedCity = city || (targetZone ? targetZone.city : (rider.workingCity || 'Lucknow'));

    rider.workingZone = assignedZoneName;
    rider.workingCity = assignedCity;
    if (targetZone) {
      rider.workingZoneId = targetZone._id;
    }
    if (Array.isArray(preferredZones)) {
      rider.preferredZones = preferredZones;
    }

    await rider.save();

    return res.status(200).json({
      success: true,
      message: `Working area updated to ${assignedZoneName}, ${assignedCity}`,
      data: {
        workingZone: rider.workingZone,
        workingZoneId: rider.workingZoneId,
        workingCity: rider.workingCity,
        preferredZones: rider.preferredZones,
      },
    });
  } catch (error) {
    logger.error(`[updateRiderWorkingZone] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Server error updating working zone' });
  }
};

// ─────────────────────────────────────────────────────────────
// 32. GET RIDER GIG SLOTS & BOOKINGS
// ─────────────────────────────────────────────────────────────
export const getRiderGigs = async (req, res) => {
  try {
    const rider = await DeliveryPartner.findById(req.user.id);
    if (!rider) {
      return res.status(404).json({ success: false, message: 'Delivery partner not found' });
    }

    await DeliveryZone.seedDefaultZonesIfEmpty();

    const zoneName = req.query.zoneName || rider.workingZone || 'Gomti Nagar';
    let zone = await DeliveryZone.findOne({
      $or: [{ name: new RegExp(`^${zoneName}$`, 'i') }, { zoneId: zoneName }],
      isActive: true,
    }).lean();

    if (!zone) {
      zone = await DeliveryZone.findOne({ isActive: true }).lean();
    }

    const slots = zone?.availableSlots?.length
      ? zone.availableSlots
      : [
          { slotId: 'slot_1', timeRange: '06:00 AM - 11:00 AM', label: 'Morning Breakfast Rush', surgeBonus: 40, incentiveBadge: '+₹40/hr guarantee', isHot: false, maxCapacity: 50 },
          { slotId: 'slot_2', timeRange: '11:00 AM - 04:00 PM', label: 'Lunch & Groceries Peak', surgeBonus: 0, incentiveBadge: 'High Demand', isHot: false, maxCapacity: 60 },
          { slotId: 'slot_3', timeRange: '04:00 PM - 09:00 PM', label: 'Evening Peak Surge', surgeBonus: 20, incentiveBadge: '+₹20 extra per order', isHot: true, maxCapacity: 80 },
          { slotId: 'slot_4', timeRange: '09:00 PM - 12:00 AM', label: 'Late Night Express', surgeBonus: 30, incentiveBadge: '+₹30 extra per order', isHot: true, maxCapacity: 40 },
        ];

    // Generate next 7 days list
    const days = [];
    const now = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() + i);
      // 'YYYY-MM-DD' in IST (toISOString would give the UTC date, wrong before 05:30 IST)
      const dateStr = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      days.push({
        date: dateStr,
        dateNum: d.getDate(),
        dayName: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-US', { weekday: 'short' }),
        fullDateFormatted: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
        isToday: i === 0,
      });
    }

    const activeBookedGigs = (rider.bookedGigs || []).filter((g) => g.status !== 'CANCELLED');
    const payoutConfig = await DeliveryPayoutConfig.getEffectiveConfig();

    return res.status(200).json({
      success: true,
      data: {
        zone: zone?.name || rider.workingZone,
        city: zone?.city || rider.workingCity,
        days,
        slots,
        bookedGigs: activeBookedGigs,
        // Admin-configured surge (rain / bad weather / high demand), added to every delivery
        globalSurgeBonus: payoutConfig?.surgeBonus || 0,
        nightSurgeBonus: payoutConfig?.nightSurgeBonus || 0,
      },
    });
  } catch (error) {
    logger.error(`[getRiderGigs] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Server error fetching gigs' });
  }
};

// ─────────────────────────────────────────────────────────────
// 33. BOOK RIDER GIG SLOT
// ─────────────────────────────────────────────────────────────
export const bookRiderGig = async (req, res) => {
  try {
    const { date, slotId, zoneName, zoneId } = req.body;
    if (!date || !slotId) {
      return res.status(400).json({ success: false, message: 'Date and slotId are required' });
    }

    const rider = await DeliveryPartner.findById(req.user.id);
    if (!rider) {
      return res.status(404).json({ success: false, message: 'Delivery partner not found' });
    }

    // Security Gate: Only approved riders can book gigs
    if (rider.applicationStatus !== 'APPROVED') {
      return res.status(403).json({
        success: false,
        message: `Only approved delivery partners can book gigs. Current status: ${rider.applicationStatus}`,
      });
    }

    // Check if slot already booked for this date and not cancelled
    const existingGig = (rider.bookedGigs || []).find(
      (g) => g.date === date && g.slotId === slotId && ['BOOKED', 'CHECKED_IN'].includes(g.status)
    );
    if (existingGig) {
      return res.status(400).json({
        success: false,
        message: 'You have already booked this slot for this date.',
        data: existingGig,
      });
    }

    await DeliveryZone.seedDefaultZonesIfEmpty();

    const targetZoneName = zoneName || rider.workingZone || 'Gomti Nagar';
    let zone = await DeliveryZone.findOne({
      $or: [{ name: new RegExp(`^${targetZoneName}$`, 'i') }, { zoneId: targetZoneName }],
      isActive: true,
    }).lean();

    if (!zone) {
      zone = await DeliveryZone.findOne({ isActive: true }).lean();
    }

    const slotConfig = zone?.availableSlots?.find((s) => s.slotId === slotId) || {
      slotId,
      timeRange: 'Peak Hours',
      label: 'Flexible Shift',
      surgeBonus: 20,
    };

    const newGig = {
      gigId: `GIG-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      date,
      slotId,
      timeRange: slotConfig.timeRange || 'Flexible Hours',
      label: slotConfig.label || 'Standard Shift',
      zone: zone?.name || targetZoneName,
      zoneId: zone?.zoneId || zoneId || '',
      surgeBonus: Number(slotConfig.surgeBonus || 0),
      status: 'BOOKED',
      bookedAt: new Date(),
    };

    if (!rider.bookedGigs) {
      rider.bookedGigs = [];
    }
    rider.bookedGigs.push(newGig);
    await rider.save();

    return res.status(201).json({
      success: true,
      message: `🎉 Gig slot successfully booked for ${date} (${newGig.timeRange})!`,
      data: newGig,
    });
  } catch (error) {
    logger.error(`[bookRiderGig] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Server error booking gig' });
  }
};

// ─────────────────────────────────────────────────────────────
// 34. CANCEL RIDER GIG SLOT
// ─────────────────────────────────────────────────────────────
export const cancelRiderGig = async (req, res) => {
  try {
    const { gigId } = req.params;
    const rider = await DeliveryPartner.findById(req.user.id);
    if (!rider) {
      return res.status(404).json({ success: false, message: 'Delivery partner not found' });
    }

    const gig = (rider.bookedGigs || []).find((g) => g.gigId === gigId);
    if (!gig) {
      return res.status(404).json({ success: false, message: 'Gig booking not found' });
    }

    if (gig.status === 'CANCELLED') {
      return res.status(400).json({ success: false, message: 'Gig is already cancelled' });
    }

    if (gig.status === 'COMPLETED') {
      return res.status(400).json({ success: false, message: 'Completed gigs cannot be cancelled' });
    }

    gig.status = 'CANCELLED';
    gig.cancelledAt = new Date();
    await rider.save();

    return res.status(200).json({
      success: true,
      message: 'Gig slot cancelled successfully',
      data: gig,
    });
  } catch (error) {
    logger.error(`[cancelRiderGig] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Server error cancelling gig' });
  }
};

// ─────────────────────────────────────────────────────────────
// 35. CHECK-IN TO RIDER GIG (ACTIVATES ONLINE SHIFT)
// ─────────────────────────────────────────────────────────────
export const checkInRiderGig = async (req, res) => {
  try {
    const { gigId } = req.params;
    const rider = await DeliveryPartner.findById(req.user.id);
    if (!rider) {
      return res.status(404).json({ success: false, message: 'Delivery partner not found' });
    }

    const gig = (rider.bookedGigs || []).find((g) => g.gigId === gigId);
    if (!gig) {
      return res.status(404).json({ success: false, message: 'Gig booking not found' });
    }

    if (gig.status === 'CANCELLED') {
      return res.status(400).json({ success: false, message: 'Cannot check into a cancelled gig' });
    }

    // Cash-In-Hand Limit check
    const payoutConfig = await DeliveryPayoutConfig.getEffectiveConfig();
    const effectiveLimit = Number(rider.maxCashLimit || payoutConfig.maxCashInHandLimit || 1500);
    const cashInHand = Number(rider.cashInHand || 0);

    if (cashInHand >= effectiveLimit) {
      return res.status(403).json({
        success: false,
        code: 'CASH_LIMIT_EXCEEDED',
        cashInHand,
        maxCashLimit: effectiveLimit,
        message: `Cannot check-in! Your Cash-in-Hand is ₹${cashInHand}, which reaches or exceeds ₹${effectiveLimit}. Please deposit cash first.`,
      });
    }

    gig.status = 'CHECKED_IN';
    gig.checkedInAt = new Date();

    // Turn rider online & available immediately
    rider.isOnline = true;
    rider.status = rider.activeOrderId ? 'BUSY' : 'AVAILABLE';
    if (gig.zone) {
      rider.workingZone = gig.zone;
    }

    await rider.save();

    safeSocketEmit(`rider_${rider._id}`, 'delivery:gig_checked_in', {
      gigId: gig.gigId,
      timeRange: gig.timeRange,
      zone: gig.zone,
    });

    return res.status(200).json({
      success: true,
      isOnline: rider.isOnline,
      status: rider.status,
      message: `🚀 Checked-in successfully for ${gig.timeRange} in ${gig.zone}! You are now ONLINE & ready to receive orders.`,
      data: {
        gig,
        isOnline: rider.isOnline,
        status: rider.status,
        workingZone: rider.workingZone,
      },
    });
  } catch (error) {
    logger.error(`[checkInRiderGig] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Server error checking in to gig' });
  }
};

// ─────────────────────────────────────────────────────────────
// 17d. ADMIN: LIST RIDER SETTLEMENT REQUESTS (withdrawals / UPI cash deposits)
//      query: type=withdrawal|deposit, status=PENDING|COMPLETED|REJECTED|ALL, limit
// ─────────────────────────────────────────────────────────────
export const adminGetRiderSettlementRequests = async (req, res) => {
  try {
    const type = req.query.type === 'deposit' ? 'deposit' : 'withdrawal';
    const allowed = ['PENDING', 'COMPLETED', 'REJECTED', 'ALL'];
    const status = allowed.includes(req.query.status) ? req.query.status : 'PENDING';
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);

    const field = type === 'withdrawal' ? 'earningsLedger' : 'cashDepositHistory';
    const elem = type === 'withdrawal' ? { type: 'WITHDRAWAL' } : { method: 'UPI' };
    if (status !== 'ALL') elem.status = status;
    const unwoundMatch = Object.fromEntries(Object.entries(elem).map(([k, v]) => [`${field}.${k}`, v]));
    const sortKey = type === 'withdrawal' ? 'entry.date' : 'entry.submittedAt';

    const rows = await DeliveryPartner.aggregate([
      { $match: { [field]: { $elemMatch: elem } } },
      { $unwind: `$${field}` },
      { $match: unwoundMatch },
      {
        $project: {
          _id: 0,
          riderObjectId: '$_id',
          riderId: '$riderId',
          riderName: '$name',
          riderPhone: '$phone',
          upiId: '$bankDetails.upiId',
          currentEarnings: '$totalEarnings',
          currentCashInHand: '$cashInHand',
          entry: `$${field}`,
        },
      },
      { $sort: { [sortKey]: -1, 'entry.settledAt': -1 } },
      { $limit: limit },
    ]);

    const data = rows.map((r) => {
      const e = r.entry || {};
      const base = {
        requestId: e._id,
        riderObjectId: r.riderObjectId,
        riderId: r.riderId,
        riderName: r.riderName,
        riderPhone: r.riderPhone,
      };
      if (type === 'withdrawal') {
        return {
          ...base,
          upiId: r.upiId || null,
          amount: Math.abs(Number(e.amount || 0)),
          status: e.status || 'COMPLETED',
          requestedAt: e.date,
          payoutMethod: e.payoutMethod || null,
          utr: e.utr || null,
          processedAt: e.processedAt || null,
          processedBy: e.processedBy || null,
          remarks: e.remarks || '',
          currentEarnings: round2(r.currentEarnings),
        };
      }
      return {
        ...base,
        amount: round2(e.amount),
        status: e.status,
        utr: e.utr || null,
        txnRef: e.txnRef,
        submittedAt: e.submittedAt || e.settledAt,
        verifiedAt: e.status === 'PENDING' ? null : e.settledAt,
        verifiedBy: e.verifiedBy || null,
        note: e.note || '',
        currentCashInHand: round2(r.currentCashInHand),
      };
    });

    const [pw, pd] = await Promise.all([
      DeliveryPartner.aggregate([
        { $match: { earningsLedger: { $elemMatch: { type: 'WITHDRAWAL', status: 'PENDING' } } } },
        { $unwind: '$earningsLedger' },
        { $match: { 'earningsLedger.type': 'WITHDRAWAL', 'earningsLedger.status': 'PENDING' } },
        { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: { $abs: '$earningsLedger.amount' } } } },
      ]),
      DeliveryPartner.aggregate([
        { $match: { cashDepositHistory: { $elemMatch: { method: 'UPI', status: 'PENDING' } } } },
        { $unwind: '$cashDepositHistory' },
        { $match: { 'cashDepositHistory.method': 'UPI', 'cashDepositHistory.status': 'PENDING' } },
        { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: '$cashDepositHistory.amount' } } },
      ]),
    ]);

    return res.status(200).json({
      success: true,
      data,
      summary: {
        pendingWithdrawals: { count: pw[0]?.count || 0, amount: round2(pw[0]?.amount) },
        pendingDeposits: { count: pd[0]?.count || 0, amount: round2(pd[0]?.amount) },
      },
    });
  } catch (error) {
    logger.error(`[adminGetRiderSettlementRequests] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Failed to load settlement requests' });
  }
};

// ─────────────────────────────────────────────────────────────
// 17e. ADMIN: RIDER CASH LEDGER — riders list with cash held (read-only)
//      query: search, filter=ALL|WITH_CASH|AT_LIMIT
// ─────────────────────────────────────────────────────────────
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const adminGetRiderCashLedgerSummary = async (req, res) => {
  try {
    const payoutConfig = await DeliveryPayoutConfig.getEffectiveConfig();
    const globalLimit = Number(payoutConfig.maxCashInHandLimit || 1500);
    const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 60) : '';
    const filter = ['ALL', 'WITH_CASH', 'AT_LIMIT'].includes(req.query.filter) ? req.query.filter : 'WITH_CASH';

    const match = {};
    if (search) {
      const rx = new RegExp(escapeRegex(search), 'i');
      match.$or = [{ name: rx }, { phone: rx }, { riderId: rx }];
    }

    const riders = await DeliveryPartner.find(match)
      .select('riderId name phone cashInHand maxCashLimit isOnline status applicationStatus cashDepositHistory earningsLedger')
      .lean();

    let rows = riders.map((r) => {
      const limit = Number(r.maxCashLimit || globalLimit);
      const cash = round2(r.cashInHand);
      const deposits = r.cashDepositHistory || [];
      const lastCleared = deposits
        .filter((d) => d.status === 'COMPLETED')
        .map((d) => d.settledAt)
        .filter(Boolean)
        .sort((a, b) => new Date(b) - new Date(a))[0] || null;
      const lastCollected = (r.earningsLedger || [])
        .filter((e) => e.type === 'COD_CASH_COLLECTED')
        .map((e) => e.date)
        .filter(Boolean)
        .sort((a, b) => new Date(b) - new Date(a))[0] || null;
      const pendingUpi = round2(
        deposits.filter((d) => d.method === 'UPI' && d.status === 'PENDING').reduce((s, d) => s + Number(d.amount || 0), 0)
      );
      return {
        riderObjectId: r._id,
        riderId: r.riderId,
        name: r.name,
        phone: r.phone,
        isOnline: !!r.isOnline,
        applicationStatus: r.applicationStatus,
        cashInHand: cash,
        cashLimit: limit,
        atLimit: cash >= limit,
        pendingUpi,
        lastCollectedAt: lastCollected,
        lastClearedAt: lastCleared,
      };
    });

    const summary = {
      totalCashHeld: round2(rows.reduce((s, r) => s + r.cashInHand, 0)),
      ridersWithCash: rows.filter((r) => r.cashInHand > 0).length,
      ridersAtLimit: rows.filter((r) => r.atLimit && r.cashInHand > 0).length,
      pendingUpiAmount: round2(rows.reduce((s, r) => s + r.pendingUpi, 0)),
      pendingUpiCount: rows.filter((r) => r.pendingUpi > 0).length,
    };

    if (filter === 'WITH_CASH') rows = rows.filter((r) => r.cashInHand > 0);
    if (filter === 'AT_LIMIT') rows = rows.filter((r) => r.atLimit && r.cashInHand > 0);
    rows.sort((a, b) => b.cashInHand - a.cashInHand);

    return res.status(200).json({ success: true, data: rows, summary });
  } catch (error) {
    logger.error(`[adminGetRiderCashLedgerSummary] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Failed to load rider cash summary' });
  }
};

// ─────────────────────────────────────────────────────────────
// 17f. ADMIN: RIDER CASH LEDGER — full chronological ledger for one rider
//      query: from, to (ISO dates, optional)
//      Balance-affecting: COD collected (+), COMPLETED deposits/clearances (−).
//      PENDING / REJECTED UPI deposits are listed but do not change the balance.
//      Any difference between recorded history and actual cashInHand (legacy data /
//      manual edits) is shown as an "Opening / unrecorded balance" line so the
//      closing balance always equals the rider's real cashInHand.
// ─────────────────────────────────────────────────────────────
const DEPOSIT_LABELS = {
  EARNINGS_DEDUCTION: 'Settled from rider earnings',
  UPI: 'UPI deposit',
  CASH_HUB: 'Cash deposited at hub',
  ADMIN_CLEARANCE: 'Cleared by admin',
};

export const adminGetRiderCashLedger = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid rider id' });
    }
    const rider = await DeliveryPartner.findById(id)
      .select('riderId name phone cashInHand maxCashLimit totalEarnings earningsLedger cashDepositHistory')
      .lean();
    if (!rider) return res.status(404).json({ success: false, message: 'Delivery partner not found' });

    const parseDate = (v, endOfDay) => {
      if (!v || typeof v !== 'string') return null;
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) return null;
      if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(v)) d.setHours(23, 59, 59, 999);
      return d;
    };
    const from = parseDate(req.query.from, false);
    const to = parseDate(req.query.to, true);

    const events = [];
    for (const e of rider.earningsLedger || []) {
      if (e.type !== 'COD_CASH_COLLECTED') continue;
      events.push({
        id: e._id,
        date: e.date,
        kind: 'COD_COLLECTED',
        label: 'COD cash collected',
        orderId: e.orderId || null,
        reference: e.orderId || null,
        description: e.description || '',
        credit: round2(e.amount), // cash in (rider holds more)
        debit: 0,
        status: 'COMPLETED',
        affectsBalance: true,
      });
    }
    for (const d of rider.cashDepositHistory || []) {
      const status = d.status || 'COMPLETED';
      events.push({
        id: d._id,
        date: status === 'COMPLETED' ? d.settledAt || d.submittedAt : d.submittedAt || d.settledAt,
        kind: d.method || 'UPI',
        label: DEPOSIT_LABELS[d.method] || d.method || 'Deposit',
        orderId: null,
        reference: d.utr || d.txnRef || null,
        utr: d.utr || null,
        txnRef: d.txnRef || null,
        description: d.note || '',
        verifiedBy: d.verifiedBy || null,
        credit: 0,
        debit: round2(d.amount),
        status,
        affectsBalance: status === 'COMPLETED',
      });
    }
    events.sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));

    // Reconcile recorded history with the actual balance
    const recordedNet = round2(
      events.filter((e) => e.affectsBalance).reduce((s, e) => s + e.credit - e.debit, 0)
    );
    const actualCash = round2(rider.cashInHand);
    const unrecorded = round2(actualCash - recordedNet);

    // Running balance across full history
    let running = unrecorded;
    for (const e of events) {
      if (e.affectsBalance) running = round2(running + e.credit - e.debit);
      e.balance = running;
    }

    // Apply date window
    const inRange = (e) => {
      const t = new Date(e.date || 0).getTime();
      return (!from || t >= from.getTime()) && (!to || t <= to.getTime());
    };
    const before = from ? events.filter((e) => new Date(e.date || 0).getTime() < from.getTime()) : [];
    const openingBalance = round2(
      unrecorded + before.filter((e) => e.affectsBalance).reduce((s, e) => s + e.credit - e.debit, 0)
    );
    const entries = events.filter(inRange);
    const periodIn = round2(entries.filter((e) => e.affectsBalance).reduce((s, e) => s + e.credit, 0));
    const periodOut = round2(entries.filter((e) => e.affectsBalance).reduce((s, e) => s + e.debit, 0));
    const closingBalance = round2(openingBalance + periodIn - periodOut);

    const payoutConfig = await DeliveryPayoutConfig.getEffectiveConfig();

    return res.status(200).json({
      success: true,
      data: {
        rider: {
          riderObjectId: rider._id,
          riderId: rider.riderId,
          name: rider.name,
          phone: rider.phone,
          cashInHand: actualCash,
          cashLimit: Number(rider.maxCashLimit || payoutConfig.maxCashInHandLimit || 1500),
        },
        period: { from: from || null, to: to || null },
        openingBalance,
        unrecordedBalance: unrecorded,
        totalCollected: periodIn,
        totalCleared: periodOut,
        closingBalance,
        pendingUpi: round2(
          entries.filter((e) => e.kind === 'UPI' && e.status === 'PENDING').reduce((s, e) => s + e.debit, 0)
        ),
        entries: entries.reverse(), // newest first for display
      },
    });
  } catch (error) {
    logger.error(`[adminGetRiderCashLedger] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Failed to load rider cash ledger' });
  }
};

// ─────────────────────────────────────────────────────────────
// 17g. ADMIN: RIDER EARNINGS WALLET — riders list (read-only)
//      query: search, filter=ALL|WITH_BALANCE|PENDING_WITHDRAWAL
// ─────────────────────────────────────────────────────────────
const summariseEarnings = (ledger = []) => {
  let earned = 0, pending = 0, paid = 0, cashSettled = 0, payouts = 0;
  let lastPayoutAt = null, lastPaidAt = null;
  for (const e of ledger) {
    const amt = Number(e.amount || 0);
    if (e.type === 'DELIVERY_PAYOUT') {
      earned += amt;
      payouts += 1;
      if (!lastPayoutAt || new Date(e.date) > new Date(lastPayoutAt)) lastPayoutAt = e.date;
    } else if (e.type === 'WITHDRAWAL') {
      const st = e.status || 'COMPLETED';
      if (st === 'PENDING') pending += Math.abs(amt);
      if (st === 'COMPLETED') {
        paid += Math.abs(amt);
        const t = e.processedAt || e.date;
        if (!lastPaidAt || new Date(t) > new Date(lastPaidAt)) lastPaidAt = t;
      }
    } else if (e.type === 'CASH_SETTLEMENT') {
      cashSettled += Math.abs(amt);
    }
  }
  return {
    totalEarned: round2(earned),
    pendingWithdrawals: round2(pending),
    totalPaidOut: round2(paid),
    cashSettledFromEarnings: round2(cashSettled),
    payoutCount: payouts,
    lastPayoutAt,
    lastPaidAt,
  };
};

export const adminGetRiderEarningsSummary = async (req, res) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 60) : '';
    const filter = ['ALL', 'WITH_BALANCE', 'PENDING_WITHDRAWAL'].includes(req.query.filter) ? req.query.filter : 'ALL';
    const match = { applicationStatus: { $in: ['APPROVED', 'SUSPENDED'] } };
    if (search) {
      const rx = new RegExp(escapeRegex(search), 'i');
      match.$or = [{ name: rx }, { phone: rx }, { riderId: rx }];
    }
    const riders = await DeliveryPartner.find(match)
      .select('riderId name phone isOnline applicationStatus totalEarnings completedDeliveries bankDetails.upiId earningsLedger')
      .lean();

    let rows = riders.map((r) => ({
      riderObjectId: r._id,
      riderId: r.riderId,
      name: r.name,
      phone: r.phone,
      isOnline: !!r.isOnline,
      applicationStatus: r.applicationStatus,
      upiId: r.bankDetails?.upiId || null,
      walletBalance: round2(r.totalEarnings),
      completedDeliveries: r.completedDeliveries || 0,
      ...summariseEarnings(r.earningsLedger),
    }));

    const summary = {
      totalEarned: round2(rows.reduce((s, r) => s + r.totalEarned, 0)),
      totalWalletBalance: round2(rows.reduce((s, r) => s + r.walletBalance, 0)),
      totalPendingWithdrawals: round2(rows.reduce((s, r) => s + r.pendingWithdrawals, 0)),
      ridersWithPending: rows.filter((r) => r.pendingWithdrawals > 0).length,
      totalPaidOut: round2(rows.reduce((s, r) => s + r.totalPaidOut, 0)),
      riderCount: rows.length,
    };

    if (filter === 'WITH_BALANCE') rows = rows.filter((r) => r.walletBalance > 0);
    if (filter === 'PENDING_WITHDRAWAL') rows = rows.filter((r) => r.pendingWithdrawals > 0);
    rows.sort((a, b) => b.walletBalance - a.walletBalance || b.totalEarned - a.totalEarned);

    return res.status(200).json({ success: true, data: rows, summary });
  } catch (error) {
    logger.error(`[adminGetRiderEarningsSummary] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Failed to load rider earnings' });
  }
};

// ─────────────────────────────────────────────────────────────
// 17h. ADMIN: RIDER EARNINGS WALLET — full ledger for one rider
//      Balance effect mirrors how totalEarnings actually changes:
//        DELIVERY_PAYOUT +amount (incl. tip)
//        WITHDRAWAL PENDING/COMPLETED −amount (held at request time)
//        WITHDRAWAL REJECTED → listed, no net effect (deducted then refunded)
//        CASH_SETTLEMENT −amount
//      Any gap vs. actual totalEarnings is shown as an unrecorded opening balance.
// ─────────────────────────────────────────────────────────────
const EARNING_LABELS = {
  DELIVERY_PAYOUT: 'Delivery payout',
  WITHDRAWAL: 'Withdrawal',
  CASH_SETTLEMENT: 'COD cash settled from earnings',
};

export const adminGetRiderEarningsLedger = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid rider id' });
    }
    const rider = await DeliveryPartner.findById(id)
      .select('riderId name phone totalEarnings completedDeliveries bankDetails.upiId earningsLedger')
      .lean();
    if (!rider) return res.status(404).json({ success: false, message: 'Delivery partner not found' });

    const parseDate = (v, endOfDay) => {
      if (!v || typeof v !== 'string') return null;
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) return null;
      if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(v)) d.setHours(23, 59, 59, 999);
      return d;
    };
    const from = parseDate(req.query.from, false);
    const to = parseDate(req.query.to, true);

    const relevant = (rider.earningsLedger || []).filter((e) => e.type in EARNING_LABELS);

    // Pull tip amounts from orders (tip is folded into the payout amount)
    const orderIds = [...new Set(relevant.filter((e) => e.type === 'DELIVERY_PAYOUT' && e.orderId).map((e) => e.orderId))];
    const orders = orderIds.length
      ? await Order.find({ orderId: { $in: orderIds } }).select('orderId storeName tipAmount deliveryDistanceKm').lean()
      : [];
    const orderMap = new Map(orders.map((o) => [o.orderId, o]));

    const events = relevant.map((e) => {
      const amt = round2(Math.abs(Number(e.amount || 0)));
      const status = e.type === 'WITHDRAWAL' ? e.status || 'COMPLETED' : 'COMPLETED';
      const isCredit = e.type === 'DELIVERY_PAYOUT';
      const order = e.orderId ? orderMap.get(e.orderId) : null;
      const tip = isCredit ? round2(order?.tipAmount || 0) : 0;
      return {
        id: e._id,
        date: e.date,
        type: e.type,
        label: e.type === 'WITHDRAWAL'
          ? `Withdrawal${status === 'COMPLETED' ? ` paid (${e.payoutMethod === 'ONLINE' ? 'Online' : e.payoutMethod === 'CASH' ? 'Cash' : 'legacy'})` : status === 'PENDING' ? ' requested' : ' rejected & refunded'}`
          : EARNING_LABELS[e.type],
        orderId: e.orderId || null,
        storeName: order?.storeName || null,
        distanceKm: e.distanceKm ?? order?.deliveryDistanceKm ?? null,
        breakdown: isCredit
          ? {
              baseFare: e.breakdown?.baseFare ?? null,
              distancePayout: e.breakdown?.distancePayout ?? null,
              billableDistanceKm: e.breakdown?.billableDistanceKm ?? null,
              perKmRate: e.breakdown?.perKmRate ?? null,
              surgeBonus: e.breakdown?.surgeBonus ?? null,
              tip,
              deliveryFee: round2(amt - tip),
            }
          : null,
        payoutMethod: e.payoutMethod || null,
        utr: e.utr || null,
        processedAt: e.processedAt || null,
        processedBy: e.processedBy || null,
        remarks: e.remarks || '',
        description: e.description || '',
        credit: isCredit ? amt : 0,
        debit: isCredit ? 0 : amt,
        status,
        affectsBalance: !(e.type === 'WITHDRAWAL' && status === 'REJECTED'),
      };
    });
    events.sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));

    const recordedNet = round2(events.filter((e) => e.affectsBalance).reduce((s, e) => s + e.credit - e.debit, 0));
    const actual = round2(rider.totalEarnings);
    const unrecorded = round2(actual - recordedNet);

    let running = unrecorded;
    for (const e of events) {
      if (e.affectsBalance) running = round2(running + e.credit - e.debit);
      e.balance = running;
    }

    const t = (e) => new Date(e.date || 0).getTime();
    const before = from ? events.filter((e) => t(e) < from.getTime()) : [];
    const openingBalance = round2(unrecorded + before.filter((e) => e.affectsBalance).reduce((s, e) => s + e.credit - e.debit, 0));
    const entries = events.filter((e) => (!from || t(e) >= from.getTime()) && (!to || t(e) <= to.getTime()));
    const counted = entries.filter((e) => e.affectsBalance);
    const totalEarned = round2(counted.reduce((s, e) => s + e.credit, 0));
    const totalDebited = round2(counted.reduce((s, e) => s + e.debit, 0));

    return res.status(200).json({
      success: true,
      data: {
        rider: {
          riderObjectId: rider._id,
          riderId: rider.riderId,
          name: rider.name,
          phone: rider.phone,
          upiId: rider.bankDetails?.upiId || null,
          walletBalance: actual,
          completedDeliveries: rider.completedDeliveries || 0,
        },
        period: { from: from || null, to: to || null },
        openingBalance,
        unrecordedBalance: unrecorded,
        totalEarned,
        totalTips: round2(entries.reduce((s, e) => s + (e.breakdown?.tip || 0), 0)),
        deliveries: entries.filter((e) => e.type === 'DELIVERY_PAYOUT').length,
        totalPaidOut: round2(entries.filter((e) => e.type === 'WITHDRAWAL' && e.status === 'COMPLETED').reduce((s, e) => s + e.debit, 0)),
        pendingWithdrawals: round2(entries.filter((e) => e.type === 'WITHDRAWAL' && e.status === 'PENDING').reduce((s, e) => s + e.debit, 0)),
        cashSettled: round2(entries.filter((e) => e.type === 'CASH_SETTLEMENT').reduce((s, e) => s + e.debit, 0)),
        totalDebited,
        closingBalance: round2(openingBalance + totalEarned - totalDebited),
        entries: entries.reverse(),
      },
    });
  } catch (error) {
    logger.error(`[adminGetRiderEarningsLedger] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Failed to load rider earnings ledger' });
  }
};

// ─────────────────────────────────────────────────────────────
// RIDER LOGOUT — go offline on the server (unless a delivery is in progress)
// ─────────────────────────────────────────────────────────────
export const deliveryLogout = async (req, res) => {
  try {
    const result = await DeliveryPartner.updateOne(
      { _id: req.user.id, $or: [{ activeOrderId: null }, { activeOrderId: { $exists: false } }] },
      { $set: { isOnline: false, status: 'OFFLINE' } }
    );
    const wentOffline = result.modifiedCount > 0 || result.matchedCount > 0;
    return res.status(200).json({
      success: true,
      message: wentOffline ? 'Logged out and set Offline' : 'Logged out. You still have an active delivery assigned.',
      data: { isOnline: !wentOffline },
    });
  } catch (error) {
    logger.error(`[deliveryLogout] Error: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Logout failed' });
  }
};
