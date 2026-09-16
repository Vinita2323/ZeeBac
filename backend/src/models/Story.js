import mongoose from 'mongoose';

const storySchema = new mongoose.Schema(
  {
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
      required: true,
      index: true,
    },
    mediaUrl: {
      type: String,
      required: true,
    },
    mediaType: {
      type: String,
      enum: ['image', 'video'],
      default: 'image',
    },
    caption: {
      type: String,
      trim: true,
      maxlength: 300,
      default: '',
    },
    offerTag: {
      type: String,
      trim: true,
      maxlength: 50,
      default: '', // e.g. "Flat 20% OFF", "Flash Deal", "New Arrival"
    },
    backgroundColor: {
      type: String,
      default: '#1e1b4b',
    },
    views: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        userName: {
          type: String,
          trim: true,
          default: '',
        },
        userImage: {
          type: String,
          default: '',
        },
        viewedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    viewCount: {
      type: Number,
      default: 0,
    },
    expiresAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 24 * 60 * 60 * 1000), // exactly 24 hours from creation
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// TTL index to automatically clean up stories after they expire
storySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('Story', storySchema);
