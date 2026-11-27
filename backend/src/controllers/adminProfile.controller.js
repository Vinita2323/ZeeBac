import bcrypt from 'bcryptjs';
import AdminUser from '../models/AdminUser.js';
import { writeAudit } from '../utils/sellerSettlement.util.js';
import logger from '../utils/logger.js';

const publicAdmin = (a) => ({
  _id: a._id,
  name: a.name,
  email: a.email,
  phone: a.phone || '',
  role: a.role,
  permissions: a.permissions,
  lastLoginAt: a.lastLoginAt,
  passwordChangedAt: a.passwordChangedAt,
  createdAt: a.createdAt,
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// GET /admin/me
export const getAdminProfile = async (req, res) => {
  try {
    const admin = await AdminUser.findById(req.user.id);
    if (!admin) return res.status(404).json({ success: false, message: 'Admin not found' });
    res.json({ success: true, data: publicAdmin(admin) });
  } catch (error) {
    logger.error(`getAdminProfile: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// PUT /admin/me { name, email, phone, currentPassword (required when changing email) }
export const updateAdminProfile = async (req, res) => {
  try {
    const admin = await AdminUser.findById(req.user.id);
    if (!admin) return res.status(404).json({ success: false, message: 'Admin not found' });
    const before = { name: admin.name, email: admin.email, phone: admin.phone };
    const { name, email, phone, currentPassword } = req.body || {};

    if (name !== undefined) {
      const n = String(name).trim();
      if (n.length < 2 || n.length > 60) return res.status(400).json({ success: false, message: 'Name must be 2–60 characters' });
      admin.name = n;
    }
    if (phone !== undefined) {
      const p = String(phone).replace(/\D/g, '');
      if (p && p.length !== 10) return res.status(400).json({ success: false, message: 'Phone must be 10 digits' });
      admin.phone = p;
    }
    if (email !== undefined && String(email).trim().toLowerCase() !== admin.email) {
      const e = String(email).trim().toLowerCase();
      if (!EMAIL_RE.test(e)) return res.status(400).json({ success: false, message: 'Enter a valid email address' });
      // Login email is a credential: confirm with the current password.
      if (!currentPassword || !(await bcrypt.compare(String(currentPassword), admin.passwordHash))) {
        return res.status(401).json({ success: false, code: 'PASSWORD_REQUIRED', message: 'Enter your current password to change the login email' });
      }
      if (await AdminUser.exists({ email: e, _id: { $ne: admin._id } })) {
        return res.status(409).json({ success: false, message: 'Another admin already uses this email' });
      }
      admin.email = e;
    }
    await admin.save();
    await writeAudit(req, { action: 'ADMIN_PROFILE_UPDATED', entityType: 'AdminUser', entityId: admin._id, before, after: { name: admin.name, email: admin.email, phone: admin.phone } });
    res.json({ success: true, message: 'Profile updated', data: publicAdmin(admin) });
  } catch (error) {
    logger.error(`updateAdminProfile: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// PUT /admin/me/password { currentPassword, newPassword }
export const changeAdminPassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    const admin = await AdminUser.findById(req.user.id);
    if (!admin) return res.status(404).json({ success: false, message: 'Admin not found' });
    if (!currentPassword || !(await bcrypt.compare(String(currentPassword), admin.passwordHash))) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect' });
    }
    const pw = String(newPassword || '');
    if (pw.length < 8 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw)) {
      return res.status(400).json({ success: false, message: 'New password must be at least 8 characters with letters and numbers' });
    }
    if (await bcrypt.compare(pw, admin.passwordHash)) {
      return res.status(400).json({ success: false, message: 'New password must be different from the current one' });
    }
    admin.passwordHash = await bcrypt.hash(pw, 10);
    admin.passwordChangedAt = new Date();
    await admin.save();
    await writeAudit(req, { action: 'ADMIN_PASSWORD_CHANGED', entityType: 'AdminUser', entityId: admin._id });
    res.json({ success: true, message: 'Password changed successfully.' });
  } catch (error) {
    logger.error(`changeAdminPassword: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};
