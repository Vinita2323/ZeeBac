import Story from '../models/Story.js';
import Vendor from '../models/Vendor.js';
import User from '../models/User.js';
import logger from '../utils/logger.js';

// 1. Create a new 24-hour Store Story (Vendor only)
export const createStory = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const { caption, offerTag, backgroundColor, mediaType } = req.body;

    let mediaUrl = null;
    if (req.file) {
      mediaUrl = req.file.url || req.file.path || req.file.filename;
    } else if (req.body.mediaUrl) {
      mediaUrl = req.body.mediaUrl;
    }

    if (!mediaUrl) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an image or media file for your story',
      });
    }

    // Explicit 24-hour expiration window
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const newStory = await Story.create({
      vendorId,
      mediaUrl,
      mediaType: mediaType || 'image',
      caption: caption || '',
      offerTag: offerTag || '',
      backgroundColor: backgroundColor || '#1e1b4b',
      expiresAt,
      views: [],
      viewCount: 0,
    });

    const populatedStory = await Story.findById(newStory._id).populate(
      'vendorId',
      'storeName profilePic category address phone'
    );

    res.status(201).json({
      success: true,
      message: '24-Hour Story published successfully!',
      data: populatedStory,
    });
  } catch (error) {
    logger.error(`createStory error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server error while creating story' });
  }
};

// 2. Get all active stories grouped by vendor (For Home Screen Story Reel)
export const getActiveStories = async (req, res) => {
  try {
    const now = new Date();
    const currentUserId = req.user?.id ? req.user.id.toString() : null;
    const { lat, lng, radius = 10000 } = req.query; // Default 10km radius

    const storyQuery = {
      isActive: true,
      expiresAt: { $gt: now },
    };

    // If user GPS coordinates provided, filter to verified stores within 10km radius
    if (lat && lng) {
      const parsedLat = parseFloat(lat);
      const parsedLng = parseFloat(lng);

      if (!isNaN(parsedLat) && !isNaN(parsedLng)) {
        const nearbyVendors = await Vendor.find({
          location: {
            $near: {
              $geometry: {
                type: 'Point',
                coordinates: [parsedLng, parsedLat],
              },
              $maxDistance: parseInt(radius),
            },
          },
          status: 'Verified',
        }).select('_id');

        const nearbyVendorIds = nearbyVendors.map((v) => v._id);
        storyQuery.vendorId = { $in: nearbyVendorIds };
      }
    }

    // Fetch active, unexpired stories for nearby vendors
    const activeStories = await Story.find(storyQuery)
      .populate('vendorId', 'storeName profilePic category address phone zeebacId location')
      .sort({ createdAt: 1 }); // chronological within each vendor

    // Group stories by vendor
    const vendorMap = new Map();

    for (const story of activeStories) {
      if (!story.vendorId) continue;
      const vId = story.vendorId._id.toString();

      if (!vendorMap.has(vId)) {
        vendorMap.set(vId, {
          vendor: story.vendorId,
          stories: [],
          latestStoryAt: story.createdAt,
          hasUnseen: false,
        });
      }

      const group = vendorMap.get(vId);
      const isSeenByCurrentUser = currentUserId
        ? story.views.some((v) => v.userId && v.userId.toString() === currentUserId)
        : false;

      group.stories.push({
        _id: story._id,
        mediaUrl: story.mediaUrl,
        mediaType: story.mediaType,
        caption: story.caption,
        offerTag: story.offerTag,
        backgroundColor: story.backgroundColor,
        createdAt: story.createdAt,
        expiresAt: story.expiresAt,
        viewCount: story.viewCount,
        isSeen: isSeenByCurrentUser,
      });

      if (new Date(story.createdAt) > new Date(group.latestStoryAt)) {
        group.latestStoryAt = story.createdAt;
      }

      if (!isSeenByCurrentUser) {
        group.hasUnseen = true;
      }
    }

    // Convert map to array, prioritizing groups with unseen stories and newer stories
    const groupedList = Array.from(vendorMap.values()).sort((a, b) => {
      if (a.hasUnseen !== b.hasUnseen) {
        return a.hasUnseen ? -1 : 1; // unseen stories come first
      }
      return new Date(b.latestStoryAt) - new Date(a.latestStoryAt);
    });

    res.status(200).json({
      success: true,
      data: groupedList,
    });
  } catch (error) {
    logger.error(`getActiveStories error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server error while fetching stories' });
  }
};

// 3. Get active stories for a specific vendor (e.g. Vendor Detail screen)
export const getVendorStories = async (req, res) => {
  try {
    const { vendorId } = req.params;
    const now = new Date();
    const currentUserId = req.user?.id ? req.user.id.toString() : null;

    const stories = await Story.find({
      vendorId,
      isActive: true,
      expiresAt: { $gt: now },
    })
      .populate('vendorId', 'storeName profilePic category address phone')
      .sort({ createdAt: 1 });

    const formatted = stories.map((story) => ({
      _id: story._id,
      vendorId: story.vendorId,
      mediaUrl: story.mediaUrl,
      mediaType: story.mediaType,
      caption: story.caption,
      offerTag: story.offerTag,
      backgroundColor: story.backgroundColor,
      createdAt: story.createdAt,
      expiresAt: story.expiresAt,
      viewCount: story.viewCount,
      isSeen: currentUserId
        ? story.views.some((v) => v.userId && v.userId.toString() === currentUserId)
        : false,
    }));

    res.status(200).json({ success: true, data: formatted });
  } catch (error) {
    logger.error(`getVendorStories error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Helper to extract unique viewers from views array (ensures each customer only appears once)
const getUniqueViewers = (views = []) => {
  const uniqueMap = new Map();
  for (const v of views) {
    const name = (v.userName || v.userId?.name || 'Customer').trim();
    const userIdStr = v.userId?._id
      ? v.userId._id.toString()
      : v.userId
      ? v.userId.toString()
      : null;

    // Unique key: prefer userId, otherwise lowercase name
    const key = userIdStr || name.toLowerCase();

    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, {
        _id: v._id,
        userId: userIdStr,
        name,
        profileImage: v.userImage || v.userId?.profileImage || '',
        viewedAt: v.viewedAt,
      });
    } else {
      // If user viewed multiple times, keep the latest viewed timestamp
      const existing = uniqueMap.get(key);
      if (new Date(v.viewedAt) > new Date(existing.viewedAt)) {
        existing.viewedAt = v.viewedAt;
      }
    }
  }

  return Array.from(uniqueMap.values()).sort(
    (a, b) => new Date(b.viewedAt) - new Date(a.viewedAt)
  );
};

// 4. Get logged-in Vendor's own stories (Vendor Dashboard)
export const getMyStories = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const now = new Date();

    const activeStories = await Story.find({
      vendorId,
      isActive: true,
      expiresAt: { $gt: now },
    })
      .populate('views.userId', 'name profileImage phone zeebacId')
      .sort({ createdAt: -1 });

    const formattedStories = activeStories.map((story) => {
      const storyObj = story.toObject();
      const viewersList = getUniqueViewers(story.views || []);

      return {
        ...storyObj,
        viewCount: viewersList.length,
        viewersList,
      };
    });

    res.status(200).json({
      success: true,
      data: formattedStories,
    });
  } catch (error) {
    logger.error(`getMyStories error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// 5. Record a Story View (Customer views a story)
export const recordStoryView = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id || req.user?._id;

    const story = await Story.findById(id);
    if (!story) {
      return res.status(404).json({ success: false, message: 'Story not found' });
    }

    let userName = req.user?.name || '';
    let userImage = '';

    if (userId) {
      try {
        const userDoc = await User.findById(userId).select('name profileImage');
        if (userDoc) {
          userName = userDoc.name || userName;
          userImage = userDoc.profileImage || '';
        } else {
          const vendorDoc = await Vendor.findById(userId).select('storeName ownerName profilePic');
          if (vendorDoc) {
            userName = vendorDoc.ownerName || vendorDoc.storeName || userName;
            userImage = vendorDoc.profilePic || '';
          }
        }
      } catch (fetchErr) {
        logger.warn(`Could not lookup user details for story view: ${fetchErr.message}`);
      }

      // Check if user has already viewed (by userId or by exact name)
      const alreadyViewed = story.views.some((v) => {
        const matchesId = v.userId && (v.userId._id || v.userId).toString() === userId.toString();
        const matchesName =
          userName &&
          v.userName &&
          v.userName.toLowerCase().trim() === userName.toLowerCase().trim();
        return matchesId || matchesName;
      });

      if (!alreadyViewed) {
        story.views.push({
          userId,
          userName: userName || 'Customer',
          userImage,
          viewedAt: new Date(),
        });
        const uniqueList = getUniqueViewers(story.views);
        story.viewCount = uniqueList.length;
        await story.save();
      }
    } else {
      story.views.push({
        userName: 'Customer',
        viewedAt: new Date(),
      });
      const uniqueList = getUniqueViewers(story.views);
      story.viewCount = uniqueList.length;
      await story.save();
    }

    const uniqueCount = getUniqueViewers(story.views).length;

    res.status(200).json({
      success: true,
      viewCount: uniqueCount,
    });
  } catch (error) {
    logger.error(`recordStoryView error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// 6. Get Story Viewers (Vendor only)
export const getStoryViewers = async (req, res) => {
  try {
    const { id } = req.params;
    const vendorId = req.user.id;

    const story = await Story.findOne({ _id: id, vendorId })
      .populate('views.userId', 'name profileImage phone zeebacId');

    if (!story) {
      return res.status(404).json({ success: false, message: 'Story not found or unauthorized' });
    }

    const viewers = getUniqueViewers(story.views || []);

    res.status(200).json({
      success: true,
      data: {
        storyId: story._id,
        caption: story.caption,
        mediaUrl: story.mediaUrl,
        viewCount: viewers.length,
        viewers,
      },
    });
  } catch (error) {
    logger.error(`getStoryViewers error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server error fetching story viewers' });
  }
};

// 7. Delete a Story (Vendor only)
export const deleteStory = async (req, res) => {
  try {
    const { id } = req.params;
    const vendorId = req.user.id;

    const story = await Story.findOne({ _id: id, vendorId });
    if (!story) {
      return res.status(404).json({
        success: false,
        message: 'Story not found or you are not authorized to delete it',
      });
    }

    story.isActive = false;
    await story.save();

    res.status(200).json({
      success: true,
      message: 'Story deleted successfully',
    });
  } catch (error) {
    logger.error(`deleteStory error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
