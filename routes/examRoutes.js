const express = require('express');
const router = express.Router();
const Exam = require('../models/Exam');
const Enrollment = require('../models/Enrollment');
const User = require('../models/User');
const { authMiddleware } = require('../middleware/authMiddleware');
const { sendEmail, emailTemplates } = require('../utils/emailService');

// Get all upcoming exams for a course
router.get('/course/:courseId', authMiddleware, async (req, res) => {
  try {
    const exams = await Exam.find({ courseId: req.params.courseId }).sort({ date: 1 });
    res.json(exams);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch exams' });
  }
});

// Check exam eligibility for a specific course
router.get('/eligibility/:courseId', authMiddleware, async (req, res) => {
  try {
    const enrollment = await Enrollment.findOne({ userId: req.user._id, courseId: req.params.courseId }).populate('courseId');
    if (!enrollment) return res.status(404).json({ error: 'Enrollment not found' });

    const course = enrollment.courseId;
    const now = new Date();
    const enrolledAt = new Date(enrollment.enrolledAt);
    const msPassed = now - enrolledAt;
    const daysPassed = Math.floor(msPassed / (1000 * 60 * 60 * 24));
    
    const minDaysBeforeExam = course.minDaysBeforeExam || 30;
    const minProgress = course.minProgress || 80;
    
    const isEligible = enrollment.adminOverride || (daysPassed >= minDaysBeforeExam && enrollment.progress >= minProgress);
    
    res.json({
      isEligible,
      daysPassed,
      minDaysBeforeExam,
      daysLeft: Math.max(0, minDaysBeforeExam - daysPassed),
      currentProgress: enrollment.progress,
      requiredProgress: minProgress,
      adminOverride: enrollment.adminOverride,
      status: enrollment.status
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to check eligibility' });
  }
});

// Get all available exams for enrolled courses
router.get('/available', authMiddleware, async (req, res) => {
  try {
    // Only show exams for courses where the student has an approved (paid) enrollment
    const enrollments = await Enrollment.find({ userId: req.user._id, status: 'paid' }).populate('courseId', 'title');
    const validEnrollments = enrollments.filter(e => e.courseId);
    const courseIds = validEnrollments.map(e => e.courseId._id);
    const exams = await Exam.find({ courseId: { $in: courseIds } }).populate('courseId').sort({ date: 1 });
    
    const availableExams = exams.map(exam => {
      const enrollment = validEnrollments.find(e => e.courseId?._id.toString() === exam.courseId?._id.toString());
      const course = exam.courseId;
      
      const now = new Date();
      const enrolledAt = new Date(enrollment.enrolledAt);
      const daysPassed = Math.floor((now - enrolledAt) / (1000 * 60 * 60 * 24));
      
      const minDaysBeforeExam = course.minDaysBeforeExam || 30;
      const minProgress = course.minProgress || 80;
      
      const isEligible = enrollment.adminOverride || (daysPassed >= minDaysBeforeExam && enrollment.progress >= minProgress);
      const isBooked = exam.enrolledStudents.some(s => s.userId.toString() === req.user._id.toString());

      return { 
        ...exam.toObject(), 
        isEligible, 
        isBooked, 
        courseTitle: course?.title || 'Unknown Course',
        eligibilityDetails: {
          daysPassed,
          minDaysBeforeExam,
          daysLeft: Math.max(0, minDaysBeforeExam - daysPassed),
          currentProgress: enrollment.progress,
          requiredProgress: minProgress,
          adminOverride: enrollment.adminOverride
        }
      };
    }).filter(exam => exam.isEligible || exam.isBooked); // Only show exams student can actually book or has booked
    
    res.json(availableExams);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch available exams' });
  }
});

// Book exam slot
router.post('/:examId/book', authMiddleware, async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.examId).populate('courseId');
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    if (exam.enrolledStudents.length >= exam.maxSeats) return res.status(400).json({ error: 'Exam is full' });

    const enrollment = await Enrollment.findOne({ userId: req.user._id, courseId: exam.courseId });
    if (!enrollment || enrollment.status !== 'paid') {
      return res.status(403).json({ error: 'You must have an approved enrollment to book this exam' });
    }

    const course = exam.courseId;
    const now = new Date();
    const enrolledAt = new Date(enrollment.enrolledAt);
    const daysPassed = Math.floor((now - enrolledAt) / (1000 * 60 * 60 * 24));
    
    const minDaysBeforeExam = course.minDaysBeforeExam || 30;
    const minProgress = course.minProgress || 80;
    
    const isEligible = enrollment.adminOverride || (daysPassed >= minDaysBeforeExam && enrollment.progress >= minProgress);

    if (!isEligible) {
      let message = 'You are not eligible to book this exam.';
      if (!enrollment.adminOverride) {
        if (daysPassed < minDaysBeforeExam && enrollment.progress < minProgress) {
          message = `Exam can be booked after ${minDaysBeforeExam - daysPassed} more days and completion of ${minProgress}% progress.`;
        } else if (daysPassed < minDaysBeforeExam) {
          message = `Exam can be booked after ${minDaysBeforeExam - daysPassed} more days.`;
        } else if (enrollment.progress < minProgress) {
          message = `Complete ${minProgress}% of course to unlock exam.`;
        }
      }
      return res.status(403).json({ error: message });
    }

    const alreadyBooked = exam.enrolledStudents.some(s => s.userId.toString() === req.user._id.toString());
    if (alreadyBooked) return res.status(400).json({ error: 'Already booked this exam' });
    exam.enrolledStudents.push({ userId: req.user._id, bookedAt: new Date() });
    await exam.save();
    const user = await User.findById(req.user._id);
    if (user && user.email) {
      try {
        await sendEmail(user.email, 'Exam Booking Confirmation', emailTemplates.examReminder(user.name, exam.title, exam.date, exam.time, exam.venue));
      } catch (emailErr) {
        console.error('Failed to send booking email:', emailErr);
      }
    }
    res.json({ message: 'Exam booked successfully', exam });
  } catch (error) {
    res.status(500).json({ error: 'Failed to book exam' });
  }
});

// Get user's booked exams
router.get('/my-exams', authMiddleware, async (req, res) => {
  try {
    // Only show booked exams for courses where the student still has a valid paid enrollment
    const enrollments = await Enrollment.find({ userId: req.user._id, status: 'paid' });
    const enrolledCourseIds = enrollments.map(e => e.courseId.toString());

    const exams = await Exam.find({ 
      'enrolledStudents.userId': req.user._id,
      courseId: { $in: enrolledCourseIds }
    }).populate('courseId', 'title').sort({ date: 1 });
    
    res.json(exams);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch booked exams' });
  }
});

module.exports = router;
