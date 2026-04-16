const express     = require('express');
const router      = express.Router();
const User        = require('@models/User');
const Enrollment  = require('@models/Enrollment');
const ActivityLog = require('@models/ActivityLog');
const { authMiddleware }       = require('@middleware/authMiddleware');
const { generateReferralCode } = require('@utils/referralUtils');

// Get Unified Dashboard Data
router.get('/dashboard', authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id;

    // Fetch user profile
    let user = await User.findById(userId).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Auto-generate referral code if missing (for legacy users)
    if (!user.referralCode) {
      user.referralCode = generateReferralCode(user.name);
      await user.save();
    }

    user = user.toObject(); // Convert to plain object if needed for the response logic below
    delete user.password;

    // Fetch enrollments with populated course details (excluding heavy fields)
    const enrollments = await Enrollment.find({ userId })
      .populate({
        path: 'courseId',
        select: 'title description thumbnail price duration level' // Exclude videos and mockTests to optimize response
      })
      .sort({ enrolledAt: -1 })
      .lean();

    // Fetch recent activities
    const recentActivities = await ActivityLog.find({ userId })
      .sort({ timestamp: -1 })
      .limit(5)
      .lean();

    // Referral Stats
    const referredUsers = await User.find({ referredBy: userId })
      .select('name createdAt rewardPoints')
      .sort({ createdAt: -1 })
      .lean();
    
    const referredCount = referredUsers.length;
    const referredUserIds = referredUsers.map(u => u._id);

    // Find all potential success indicators for these referred students
    const allEnrollments = await Enrollment.find({
      userId: { $in: referredUserIds }
    }).lean();

    // Deep Healing / Reconciliation Logic
    let needsSave = false;
    const currentRewarded = user.rewardedReferrals || [];
    const rewardedIdsStrings = new Set(currentRewarded.map(id => id.toString()));

    // Enriched list with ultra-robust status check
    const enrichedReferredUsers = referredUsers.map((u) => {
      const uIdStr = u._id.toString();
      const userEnrollments = allEnrollments.filter(e => 
        e.userId && e.userId.toString() === uIdStr
      );
      
      // Check if student has a successful enrollment
      const hasSuccessfulEnrollment = userEnrollments.some(e => {
        const status = String(e.status || '').toLowerCase();
        const payStatus = String(e.paymentStatus || '').toLowerCase();
        return status === 'paid' || payStatus === 'paid' || payStatus === 'partial';
      });

      // HEALING: If student is successful but not in rewarded list, add them!
      if (hasSuccessfulEnrollment && !rewardedIdsStrings.has(uIdStr)) {

        if (!user.rewardedReferrals) user.rewardedReferrals = [];
        user.rewardedReferrals.push(u._id);
        user.rewardPoints = (user.rewardPoints || 0) + 50;
        rewardedIdsStrings.add(uIdStr);
        needsSave = true;
      }

      const isActuallyRewarded = rewardedIdsStrings.has(uIdStr);

      return {
        ...u,
        isRewarded: isActuallyRewarded
      };
    });

    // Save changes if healing occurred
    if (needsSave) {
      await User.findByIdAndUpdate(userId, {
        rewardedReferrals: user.rewardedReferrals,
        rewardPoints: user.rewardPoints
      });

    }

    const successfulReferrals = enrichedReferredUsers.filter(u => u.isRewarded).length;

    res.json({
      user,
      enrollments,
      recentActivities,
      referralStats: {
        referredCount,
        successfulReferrals,
        referredUsers: enrichedReferredUsers
      }
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Failed to load dashboard data. Please try again.' });
  }
});

module.exports = router;
