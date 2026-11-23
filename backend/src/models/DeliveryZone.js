import mongoose from 'mongoose';

const deliveryZoneSchema = new mongoose.Schema(
  {
    zoneId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    city: {
      type: String,
      required: true,
      trim: true,
      default: 'Lucknow',
      index: true,
    },
    state: {
      type: String,
      default: 'Uttar Pradesh',
      trim: true,
    },
    localities: [
      {
        type: String,
        trim: true,
      },
    ],
    centerCoordinates: {
      latitude: { type: Number, default: 26.8467 },
      longitude: { type: Number, default: 80.9462 },
    },
    radiusKm: {
      type: Number,
      default: 6,
      min: 1,
    },
    surgeMultiplier: {
      type: Number,
      default: 1.0,
      min: 1.0,
    },
    surgeBonus: {
      type: Number,
      default: 0,
      min: 0,
    },
    demandLevel: {
      type: String,
      enum: ['LOW', 'NORMAL', 'HIGH_DEMAND', 'SURGE'],
      default: 'HIGH_DEMAND',
    },
    demandBadge: {
      type: String,
      default: 'High Demand 🔥',
    },
    activeRidersCount: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    availableSlots: [
      {
        slotId: { type: String, required: true },
        timeRange: { type: String, required: true },
        label: { type: String, required: true },
        surgeBonus: { type: Number, default: 0 },
        incentiveBadge: { type: String, default: '' },
        isHot: { type: Boolean, default: false },
        maxCapacity: { type: Number, default: 30 },
      },
    ],
  },
  {
    timestamps: true,
  }
);

const DEFAULT_SLOTS = [
  {
    slotId: 'slot_1',
    timeRange: '06:00 AM - 11:00 AM',
    label: 'Morning Breakfast Rush',
    surgeBonus: 40,
    incentiveBadge: '+₹40/hr guarantee',
    isHot: false,
    maxCapacity: 50,
  },
  {
    slotId: 'slot_2',
    timeRange: '11:00 AM - 04:00 PM',
    label: 'Lunch & Groceries Peak',
    surgeBonus: 0,
    incentiveBadge: 'High Demand',
    isHot: false,
    maxCapacity: 60,
  },
  {
    slotId: 'slot_3',
    timeRange: '04:00 PM - 09:00 PM',
    label: 'Evening Peak Surge',
    surgeBonus: 20,
    incentiveBadge: '+₹20 extra per order',
    isHot: true,
    maxCapacity: 80,
  },
  {
    slotId: 'slot_4',
    timeRange: '09:00 PM - 12:00 AM',
    label: 'Late Night Express',
    surgeBonus: 30,
    incentiveBadge: '+₹30 extra per order',
    isHot: true,
    maxCapacity: 40,
  },
];

const DEFAULT_ZONES = [
  {
    zoneId: 'ZONE-LKO-GOMTI',
    name: 'Gomti Nagar',
    city: 'Lucknow',
    state: 'Uttar Pradesh',
    localities: ['Patrakarpuram', 'Vipin Khand', 'Vikas Khand', 'Manoj Pandey Chauraha', 'Gomti Nagar Extension'],
    centerCoordinates: { latitude: 26.8532, longitude: 80.9992 },
    radiusKm: 6,
    demandLevel: 'SURGE',
    demandBadge: 'Mega Peak +₹20 🔥',
    surgeBonus: 20,
    availableSlots: DEFAULT_SLOTS,
  },
  {
    zoneId: 'ZONE-LKO-HAZRATGANJ',
    name: 'Hazratganj & Central',
    city: 'Lucknow',
    state: 'Uttar Pradesh',
    localities: ['Hazratganj Market', 'Ashok Marg', 'Vidhan Sabha Marg', 'Kapoorthala', 'Lalbagh'],
    centerCoordinates: { latitude: 26.8500, longitude: 80.9490 },
    radiusKm: 5,
    demandLevel: 'HIGH_DEMAND',
    demandBadge: 'High Demand 🔥',
    surgeBonus: 15,
    availableSlots: DEFAULT_SLOTS,
  },
  {
    zoneId: 'ZONE-LKO-ALAMBAGH',
    name: 'Alambagh & South',
    city: 'Lucknow',
    state: 'Uttar Pradesh',
    localities: ['Alambagh Chauraha', 'Singar Nagar', 'Krishna Nagar', 'Transport Nagar', 'Ashiyana'],
    centerCoordinates: { latitude: 26.8124, longitude: 80.9023 },
    radiusKm: 6,
    demandLevel: 'HIGH_DEMAND',
    demandBadge: 'Busy Area ⚡',
    surgeBonus: 10,
    availableSlots: DEFAULT_SLOTS,
  },
  {
    zoneId: 'ZONE-LKO-INDIRA',
    name: 'Indira Nagar & Munshipulia',
    city: 'Lucknow',
    state: 'Uttar Pradesh',
    localities: ['Munshipulia', 'Bhootnath Market', 'Sector 14', 'Polytechnic Chauraha', 'Kalyanpur'],
    centerCoordinates: { latitude: 26.8833, longitude: 80.9833 },
    radiusKm: 6,
    demandLevel: 'NORMAL',
    demandBadge: 'Steady Demand',
    surgeBonus: 0,
    availableSlots: DEFAULT_SLOTS,
  },
  {
    zoneId: 'ZONE-IND-REGAL',
    name: 'Regal Square & Central',
    city: 'Indore',
    state: 'Madhya Pradesh',
    localities: ['RNT Marg', 'MG Road', 'Regal Square', 'Chhoti Gwaltoli', 'Palasia'],
    centerCoordinates: { latitude: 22.7196, longitude: 75.8577 },
    radiusKm: 5,
    demandLevel: 'HIGH_DEMAND',
    demandBadge: 'High Demand 🔥',
    surgeBonus: 15,
    availableSlots: DEFAULT_SLOTS,
  },
  {
    zoneId: 'ZONE-IND-VIJAY',
    name: 'Vijay Nagar & Scheme 54',
    city: 'Indore',
    state: 'Madhya Pradesh',
    localities: ['Vijay Nagar Square', 'Scheme 54', 'Bapat Square', 'MR 10', 'Sayaji Area'],
    centerCoordinates: { latitude: 22.7533, longitude: 75.8937 },
    radiusKm: 6,
    demandLevel: 'SURGE',
    demandBadge: 'Peak Rush +₹25 🔥',
    surgeBonus: 25,
    availableSlots: DEFAULT_SLOTS,
  },
];

deliveryZoneSchema.statics.seedDefaultZonesIfEmpty = async function () {
  const count = await this.countDocuments();
  if (count === 0) {
    await this.insertMany(DEFAULT_ZONES);
  }
};

const DeliveryZone = mongoose.model('DeliveryZone', deliveryZoneSchema);
export default DeliveryZone;
