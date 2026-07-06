import Review from '../models/Review.js';
import Vendor from '../models/Vendor.js';
import Transaction from '../models/Transaction.js';
import logger from '../utils/logger.js';

// Get reviews for a specific vendor (Used by both User and Vendor apps)
export const getVendorReviews = async (req, res) => {
  try {
    // If it's a vendor requesting their own reviews
    // OR if it's a customer requesting a specific vendor's reviews
    const vendorId = req.params.vendorId || req.user.id;

    const reviews = await Review.find({ vendorId, isVisible: true })
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({ success: true, data: reviews });
  } catch (error) {
    logger.error(`Error in getVendorReviews: ${error.message}`);
    res.status(500).json({ success: false, message: 'Failed to fetch reviews' });
  }
};

// Customer creates or updates a review
export const createReview = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const { rating, text } = req.body;
    const customerId = req.user.id;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: 'Invalid rating. Must be between 1 and 5.' });
    }

    // Fetch user to get name
    const User = (await import('../models/User.js')).default;
    const customer = await User.findById(customerId);
    const customerName = customer ? customer.name : 'Unknown User';

    // Check if customer has verified transactions with this vendor
    const verifiedTransaction = await Transaction.findOne({
      customerId,
      vendorId,
      status: 'Approved'
    });

    const isVerified = !!verifiedTransaction;

    // Create or update review
    const review = await Review.findOneAndUpdate(
      { vendorId, customerId },
      { 
        $set: { 
          rating, 
          text, 
          customerName, 
          isVerified 
        } 
      },
      { new: true, upsert: true }
    );

    // Recalculate Vendor's average rating and total reviews
    const stats = await Review.aggregate([
      { $match: { vendorId: review.vendorId, isVisible: true } },
      {
        $group: {
          _id: null,
          avgRating: { $avg: '$rating' },
          totalReviews: { $sum: 1 }
        }
      }
    ]);

    if (stats.length > 0) {
      await Vendor.findByIdAndUpdate(vendorId, {
        $set: {
          'stats.avgRating': parseFloat(stats[0].avgRating.toFixed(1)),
          'stats.totalReviews': stats[0].totalReviews
        }
      });
    }

    res.status(201).json({ success: true, data: review, message: 'Review posted successfully' });
  } catch (error) {
    logger.error(`Error in createReview: ${error.message}`);
    res.status(500).json({ success: false, message: 'Failed to submit review' });
  }
};

// Customer deletes a review
export const deleteReview = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const customerId = req.user.id;

    const review = await Review.findOneAndDelete({ vendorId, customerId });
    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }

    // Recalculate Vendor's average rating and total reviews
    const stats = await Review.aggregate([
      { $match: { vendorId: review.vendorId, isVisible: true } },
      {
        $group: {
          _id: null,
          avgRating: { $avg: '$rating' },
          totalReviews: { $sum: 1 }
        }
      }
    ]);

    const avgRating = stats.length > 0 ? parseFloat(stats[0].avgRating.toFixed(1)) : 0;
    const totalReviews = stats.length > 0 ? stats[0].totalReviews : 0;

    await Vendor.findByIdAndUpdate(vendorId, {
      $set: {
        'stats.avgRating': avgRating,
        'stats.totalReviews': totalReviews
      }
    });

    res.status(200).json({ success: true, message: 'Review deleted successfully' });
  } catch (error) {
    logger.error(`Error in deleteReview: ${error.message}`);
    res.status(500).json({ success: false, message: 'Failed to delete review' });
  }
};

// Vendor replies to a review
export const replyToReview = async (req, res) => {
  try {
    const { id: reviewId } = req.params;
    const { text } = req.body;
    const vendorId = req.user.id;

    if (!text || text.trim() === '') {
      return res.status(400).json({ success: false, message: 'Reply text is required' });
    }

    const review = await Review.findOneAndUpdate(
      { _id: reviewId, vendorId },
      {
        $set: {
          'reply.text': text,
          'reply.repliedAt': new Date()
        }
      },
      { new: true }
    );

    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found or unauthorized' });
    }

    res.status(200).json({ success: true, data: review, message: 'Replied to review successfully' });
  } catch (error) {
    logger.error(`Error in replyToReview: ${error.message}`);
    res.status(500).json({ success: false, message: 'Failed to reply to review' });
  }
};
