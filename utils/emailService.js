const nodemailer = require('nodemailer');

// Lazy-initialized transporter (created on first use, not at import time)
// This ensures environment variables are fully loaded by dotenv before we read them.
let transporter = null;
let transporterVerified = false;

const getTransporter = () => {
  if (transporter) return transporter;

  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_PASS;

  if (!gmailUser || !gmailPass) {
    console.error('[EMAIL CONFIG] ❌ GMAIL_USER or GMAIL_PASS not set in environment variables!');
    console.error('[EMAIL CONFIG]    GMAIL_USER:', gmailUser ? '✅ set' : '❌ missing');
    console.error('[EMAIL CONFIG]    GMAIL_PASS:', gmailPass ? '✅ set' : '❌ missing');
    return null;
  }

  console.log('[EMAIL CONFIG] ✅ Creating Gmail SMTP transporter for:', gmailUser);

  transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, // Use STARTTLS
    family: 4,     // FORCE IPv4 (prevents ENETUNREACH/timeout on IPv6)
    logger: true,
    debug: true,
    auth: {
      user: gmailUser,
      pass: gmailPass
    },
    tls: {
      rejectUnauthorized: false
    }
  });

  // Verify credentials in background (non-blocking)
  transporter.verify()
    .then(() => {
      transporterVerified = true;
      console.log('[EMAIL CONFIG] ✅ Gmail SMTP transporter verified — ready to send emails');
    })
    .catch((err) => {
      transporterVerified = false;
      console.error('[EMAIL CONFIG] ❌ Gmail SMTP verification FAILED:', err.message);
      console.error('[EMAIL CONFIG]    Possible causes:');
      console.error('[EMAIL CONFIG]    1. App Password is incorrect or expired');
      console.error('[EMAIL CONFIG]    2. 2-Step Verification is not enabled on the Gmail account');
      console.error('[EMAIL CONFIG]    3. The App Password was revoked');
      console.error('[EMAIL CONFIG]    → Go to https://myaccount.google.com/apppasswords to generate a new one');
    });

  return transporter;
};

/**
 * Utility to send emails via Gmail SMTP
 * @param {string} to - Recipient email
 * @param {string} subject - Email subject
 * @param {string} html - HTML content of the email
 * @throws {Error} if email sending fails (so fire-and-forget .catch() handlers get triggered)
 */
const sendEmail = async (to, subject, html) => {
  const tp = getTransporter();

  if (!tp) {
    const errMsg = 'Email transporter not available — check GMAIL_USER and GMAIL_PASS env vars';
    console.error(`[EMAIL ERROR] ${errMsg}`);
    throw new Error(errMsg);
  }

  const mailOptions = {
    from: `"Third Eye Computer Education" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    html
  };

  console.log(`[EMAIL] Sending "${subject}" to ${to}...`);

  try {
    const info = await tp.sendMail(mailOptions);
    console.log(`[EMAIL] ✅ Sent "${subject}" to ${to} — messageId: ${info.messageId}`);
    return { success: true, data: info };
  } catch (error) {
    console.error(`[EMAIL ERROR] ❌ Failed to send "${subject}" to ${to}:`, error.message);
    if (error.responseCode === 535) {
      console.error('[EMAIL ERROR]    → Authentication failed. Your App Password may be expired or incorrect.');
      console.error('[EMAIL ERROR]    → Go to https://myaccount.google.com/apppasswords to generate a new one.');
    }
    // THROW instead of returning { success: false } so .catch() handlers in routes get triggered
    throw error;
  }
};

const emailTemplates = {
  // Used in enrollmentRoutes.js
  studentAdmissionReceived: (name) => `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
      <h2 style="color: #22C55E; text-align: center;">Admission Request Received</h2>
      <p>Dear ${name},</p>
      <p>Thank you for your interest in Third Eye Computer Education. Your admission request has been received successfully. Our team will reach out to you shortly with further details.</p>
      <p>Best Regards,<br>The Third Eye Team</p>
    </div>
  `,

  // Used in enrollmentRoutes.js
  adminEnrollmentNotification: (name, email, phone, wpPhone, address, courseTitle, studyCentre) => {
    const safeWpPhone = String(wpPhone || '');
    const cleanWpPhone = safeWpPhone.replace(/\D/g, '');
    return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
      <h2 style="color: #22C55E;">New Enrollment Request</h2>
      <p>A new student has requested enrollment:</p>
      <div style="background: #f9f9f9; padding: 15px; border-radius: 8px;">
        <p><strong>Student:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Phone:</strong> ${phone}</p>
        <p><strong>WhatsApp:</strong> ${safeWpPhone}</p>
        <p><strong>Address:</strong> ${address}</p>
        <p><strong>Course:</strong> ${courseTitle}</p>
        <p><strong>Study Centre:</strong> ${studyCentre || 'Not Specified'}</p>
      </div>
      <div style="text-align: center; margin: 20px 0;">
        <a href="https://wa.me/${cleanWpPhone}" style="background: #25D366; color: white; padding: 12px 25px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Chat on WhatsApp</a>
      </div>
      <p>Please log in to the admin panel to approve or reject this request.</p>
    </div>
    `;
  },

  // Used in adminRoutes2.js (Approval callback - if any) or for active students
  enrollmentSuccess: (name, courseTitle) => `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
      <h2 style="color: #22C55E; text-align: center;">Enrollment Approved!</h2>
      <p>Dear ${name},</p>
      <p>Congratulations! Your enrollment in <strong>${courseTitle}</strong> has been approved.</p>
      <p>You now have full access to all course materials and videos.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${process.env.FRONTEND_URL}/dashboard" style="background: #22C55E; color: white; padding: 12px 25px; text-decoration: none; border-radius: 8px; font-weight: bold;">Go to Dashboard</a>
      </div>
    </div>
  `,

  // Used in adminRoutes2.js
  examReminder: (name, examTitle, date, time, venue) => `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
      <h2 style="color: #22C55E;">New Exam Scheduled</h2>
      <p>Dear ${name},</p>
      <p>A new exam has been scheduled for your course:</p>
      <div style="background: #f9f9f9; padding: 15px; border-radius: 8px;">
        <p><strong>Exam:</strong> ${examTitle}</p>
        <p><strong>Date:</strong> ${new Date(date).toLocaleDateString()}</p>
        <p><strong>Time:</strong> ${time}</p>
        <p><strong>Venue:</strong> ${venue}</p>
      </div>
      <p>Please ensure you are present 15 minutes before the scheduled time.</p>
    </div>
  `,

  // Generic doubt session (can be used manually or in future routes)
  doubtSessionAnnouncement: (name, sessionTitle, date, time, venue) => `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
      <h2 style="color: #22C55E;">New Doubt Session Scheduled</h2>
      <p>Dear ${name},</p>
      <p>A new offline doubt solving session has been scheduled:</p>
      <div style="background: #f9f9f9; padding: 15px; border-radius: 8px;">
        <p><strong>Session:</strong> ${sessionTitle}</p>
        <p><strong>Date:</strong> ${new Date(date).toLocaleDateString()}</p>
        <p><strong>Time:</strong> ${time}</p>
        <p><strong>Venue:</strong> ${venue}</p>
      </div>
      <p>Attendance is optional but recommended.</p>
    </div>
  `,

  // Legacy/Alias support
  welcome: (name) => emailTemplates.studentAdmissionReceived(name),
  adminNotification: (name, email, courseTitle) => emailTemplates.adminEnrollmentNotification(name, email, 'N/A', 'N/A', 'N/A', courseTitle)
};

module.exports = { sendEmail, emailTemplates };
