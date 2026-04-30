const express    = require('express');
const router     = express.Router();
const bcrypt     = require('bcryptjs');
const Enrollment = require('@models/Enrollment');
const Course     = require('@models/Course');
const User       = require('@models/User');
const { authMiddleware }                                     = require('@middleware/authMiddleware');
const { generateAccessToken, generateRefreshToken,
        setAuthCookies }                                     = require('@utils/jwtUtils');
const { sendEmail, emailTemplates }                          = require('@utils/emailService');

// Public enrollment endpoint - register + enroll in one step
router.post('/enroll', async (req, res) => {
  try {
    const { name, email, phone, whatsappPhone, address, password, courseId, studyCentre, referralCode } = req.body;

    if (!name || !email || !phone || !address || !password || !courseId || !studyCentre) {
      return res.status(400).json({ error: 'All fields are required: name, email, phone, address, password, courseId, studyCentre' });
    }

    // Validate course exists
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    // Find or create user
    let user = await User.findOne({ email: email.toLowerCase() });
    let isNewUser = false;

    if (!user) {
      // Create new user
      const hashedPassword = await bcrypt.hash(password, 10);
      // Referral Logic
      let referredByUser = null;
      if (referralCode && referralCode.trim()) {
        referredByUser = await User.findOne({ referralCode: referralCode.trim().toUpperCase() });
        // Prevent self-referral
        if (referredByUser && (referredByUser.email === email.toLowerCase() || referredByUser.phone === phone)) {
          referredByUser = null;
        }
      }

      const { generateReferralCode } = require('@utils/referralUtils');
      const newReferralCode = generateReferralCode(name);

      user = await User.create({
        name,
        email: email.toLowerCase(),
        password: hashedPassword,
        phone,
        whatsappPhone: whatsappPhone || phone,
        address,
        studyCentre,
        role: 'student',
        referralCode: newReferralCode,
        referredBy: referredByUser ? referredByUser._id : undefined
      });
      isNewUser = true;
    }

    // Check for duplicate pending enrollment (same user + course + pending)
    const existingEnrollment = await Enrollment.findOne({
      userId: user._id,
      courseId,
      status: 'pending'
    });

    if (existingEnrollment) {
      // Still auto-login if new user or return cookies
      if (isNewUser) {
        const accessToken = generateAccessToken(user._id, user.email);
        const refreshToken = generateRefreshToken(user._id);
        setAuthCookies(res, accessToken, refreshToken, req);
      }
      return res.status(409).json({ 
        error: 'Already applied',
        message: 'You have already submitted an enrollment request for this course. Please wait for confirmation.'
      });
    }

    // Check if already paid/approved
    const paidEnrollment = await Enrollment.findOne({
      userId: user._id,
      courseId,
      status: 'paid'
    });

    if (paidEnrollment) {
      if (isNewUser) {
        const accessToken = generateAccessToken(user._id, user.email);
        const refreshToken = generateRefreshToken(user._id);
        setAuthCookies(res, accessToken, refreshToken, req);
      }
      return res.status(409).json({ 
        error: 'Already enrolled',
        message: 'You are already enrolled in this course.'
      });
    }

    // Create enrollment with pending status
    const enrollment = await Enrollment.create({
      userId: user._id,
      courseId,
      status: 'pending'
    });

    // Auto-login the user
    const accessToken = generateAccessToken(user._id, user.email);
    const refreshToken = generateRefreshToken(user._id);
    setAuthCookies(res, accessToken, refreshToken, req);

    // Send emails in background (fire-and-forget) — don't block the response
    const adminEmail = process.env.ADMIN_EMAIL || process.env.SENDER_EMAIL || 'adit80226@gmail.com';
    const wpPhone = whatsappPhone || phone;
    
    console.log(`[ENROLL] Dispatching emails for ${email} (Course: ${course.title})`);

    // Admin Notification
    sendEmail(
      adminEmail,
      'New Course Enrollment',
      emailTemplates.adminEnrollmentNotification(name, email, phone, wpPhone, address, course.title, studyCentre)
    ).catch(err => console.error(`[ENROLL ERROR] Admin email failed for ${email}:`, err.message));

    // Student Confirmation
    sendEmail(
      email,
      'Admission Request Received',
      emailTemplates.studentAdmissionReceived(name)
    ).catch(err => console.error(`[ENROLL ERROR] Student email failed for ${email}:`, err.message));

    res.status(201).json({
      message: 'Enrollment submitted successfully. We will contact you soon.',
      enrollment,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Enrollment error:', error);
    if (error.code === 11000) {
      const field = error.keyPattern?.email ? 'Email' : error.keyPattern?.phone ? 'Phone number' : 'Account';
      return res.status(409).json({ error: `${field} already registered. Please login instead.` });
    }
    res.status(500).json({ error: 'Enrollment failed. Please try again.' });
  }
});

// Enroll for logged-in users (simpler)
router.post('/enroll-loggedin', authMiddleware, async (req, res) => {
  try {
    const { courseId } = req.body;

    if (!courseId) {
      return res.status(400).json({ error: 'courseId is required' });
    }

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    // Check for duplicate pending enrollment
    const existingEnrollment = await Enrollment.findOne({
      userId: req.user._id,
      courseId,
      status: { $in: ['pending', 'paid'] }
    });

    if (existingEnrollment) {
      const msg = existingEnrollment.status === 'pending'
        ? 'You have already submitted an enrollment request for this course. Please wait for confirmation.'
        : 'You are already enrolled in this course.';
      return res.status(409).json({ error: 'Already applied', message: msg });
    }

    // Create enrollment
    const enrollment = await Enrollment.create({
      userId: req.user._id,
      courseId,
      status: 'pending'
    });

    // Send emails in background (fire-and-forget)
    const user = await User.findById(req.user._id);
    const adminEmail = process.env.ADMIN_EMAIL || process.env.SENDER_EMAIL || 'adit80226@gmail.com';
    
    console.log(`[ENROLL-AUTH] Dispatching emails for ${user.email} (Course: ${course.title})`);

    sendEmail(
      adminEmail,
      'New Course Enrollment',
      emailTemplates.adminEnrollmentNotification(
        user.name, user.email, user.phone, 
        user.whatsappPhone || user.phone, 
        user.address, course.title,
        user.studyCentre
      )
    ).catch(err => console.error(`[ENROLL-AUTH ERROR] Admin email failed for ${user.email}:`, err.message));

    sendEmail(
      user.email,
      'Admission Request Received',
      emailTemplates.studentAdmissionReceived(user.name)
    ).catch(err => console.error(`[ENROLL-AUTH ERROR] Student email failed for ${user.email}:`, err.message));

    res.status(201).json({
      message: 'Enrollment submitted successfully. We will contact you soon.',
      enrollment
    });
  } catch (error) {
    console.error('Enrollment error:', error);
    res.status(500).json({ error: 'Enrollment failed. Please try again.' });
  }
});

// Get user enrollments
router.get('/my-enrollments', authMiddleware, async (req, res) => {
  try {
    const enrollments = await Enrollment.find({ userId: req.user._id })
      .populate('courseId')
      .sort({ enrolledAt: -1 });
    res.json(enrollments);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch enrollments' });
  }
});

// Get specific enrollment
router.get('/:courseId', authMiddleware, async (req, res) => {
  try {
    const enrollment = await Enrollment.findOne({
      userId: req.user._id,
      courseId: req.params.courseId
    }).populate('courseId');

    if (!enrollment) {
      return res.status(404).json({ error: 'Enrollment not found' });
    }

    res.json(enrollment);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch enrollment' });
  }
});

module.exports = router;
