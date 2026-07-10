import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Load env
dotenv.config();

// Connect and Insert
const testNotifications = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/zeebac');
    console.log('Connected to DB');

    // Define minimal schema here to avoid import issues
    const NotificationSchema = new mongoose.Schema({
      recipientId: mongoose.Schema.Types.ObjectId,
      recipientType: String,
      type: String,
      title: String,
      message: String,
      isRead: { type: Boolean, default: false },
    }, { timestamps: true });
    
    const Notification = mongoose.models.Notification || mongoose.model('Notification', NotificationSchema);
    
    // Admin schema
    const AdminUserSchema = new mongoose.Schema({ email: String, role: String });
    const AdminUser = mongoose.models.AdminUser || mongoose.model('AdminUser', AdminUserSchema, 'adminusers');

    const admin = await AdminUser.findOne();
    
    if (!admin) {
      console.log('No AdminUser found! Please login to admin at least once or run seed script.');
      process.exit(1);
    }

    const notifs = [
      {
        recipientId: admin._id,
        recipientType: 'admin',
        type: 'FRAUD_ALERT',
        title: 'Suspicious Transaction',
        message: 'A large transaction of ₹50,000 was flagged at Noir Concept Store.',
        isRead: false
      },
      {
        recipientId: admin._id,
        recipientType: 'admin',
        type: 'VENDOR_KYC',
        title: 'New Vendor Registration',
        message: 'The Fresh Market has submitted KYC documents for approval.',
        isRead: false
      },
      {
        recipientId: admin._id,
        recipientType: 'admin',
        type: 'SUPPORT_TICKET',
        title: 'High Priority Ticket',
        message: 'Customer Dheeraj reported an issue with cashback not crediting.',
        isRead: false
      }
    ];

    await Notification.insertMany(notifs);
    console.log('Successfully injected 3 dummy notifications for Admin:', admin.email);

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

testNotifications();
