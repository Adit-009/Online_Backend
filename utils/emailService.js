/**
 * 📧 Resend Email Service
 * This service replaces Nodemailer to avoid SMTP connection timeouts on Render.
 * It uses the Resend HTTP API which is faster and more reliable.
 */
const { Resend } = require('resend');

// Initialize Resend with API Key
const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Sends an email using Resend API
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} html - HTML body content
 * @returns {Promise<{success: boolean, messageId: string}>}
 */
const sendEmail = async (to, subject, html) => {
  try {
    // 1. Validation
    if (!process.env.RESEND_API_KEY) {
      console.error('[RESEND] ❌ API Key is missing! Please set RESEND_API_KEY in .env or Render dashboard.');
      throw new Error('RESEND_API_KEY not configured');
    }

    if (!to) {
      console.error('[RESEND] ❌ Recipient (to) is missing.');
      throw new Error('Email recipient is required');
    }

    console.log(`[RESEND] 📤 Sending "${subject}" to ${to}...`);

    // 2. Dispatch via Resend
    // Note: We use the verified domain email provided: admin@thirdeyenagaonkathiatoli.in
    const { data, error } = await resend.emails.send({
      from: 'Third Eye Computer Education <admin@thirdeyenagaonkathiatoli.in>',
      to: [to],
      subject: subject,
      html: html,
    });

    // 3. Handle Errors from API
    if (error) {
      console.error(`[RESEND ERROR] ❌ API reported failure:`, error.message);
      throw new Error(error.message);
    }

    // 4. Success
    console.log(`[RESEND] ✅ Successfully sent! Message ID: ${data.id}`);
    return { success: true, messageId: data.id };

  } catch (err) {
    console.error(`[RESEND ERROR] ❌ Critical failure sending email:`, err.message);
    throw err; // Re-throw to allow .catch() in routes to handle it
  }
};

/**
 * HTML Email Templates
 * DO NOT MODIFY these templates as they are used across the application.
 */
const emailTemplates = {
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

  // Used in enrollmentRoutes.js
  studentAdmissionReceived: (name) => `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
      <h2 style="color: #22C55E;">Admission Request Received</h2>
      <p>Dear ${name},</p>
      <p>Thank you for your interest in Third Eye Computer Education! We have received your admission request.</p>
      <p>Our team will review your application and contact you shortly with the next steps.</p>
      <div style="background: #f0fdf4; padding: 15px; border-radius: 8px; border-left: 4px solid #22C55E;">
        <p style="margin: 0;"><strong>What's next?</strong> We will verify your details and send you an approval notification once processed.</p>
      </div>
      <p>If you have any urgent queries, feel free to contact us.</p>
      <p>Best Regards,<br/><strong>Third Eye Computer Education Team</strong></p>
    </div>
  `,

  // Used when admin approves enrollment
  enrollmentApproved: (name, courseTitle) => `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
      <h2 style="color: #22C55E;">Admission Approved! 🎉</h2>
      <p>Dear ${name},</p>
      <p>Congratulations! Your admission for the course <strong>${courseTitle}</strong> has been approved.</p>
      <p>You can now log in to your dashboard to access your course materials, videos, and upcoming exams.</p>
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
      <h2 style="color: #22C55E;">Doubt Clearing Session</h2>
      <p>Dear ${name},</p>
      <p>A new doubt clearing session has been scheduled:</p>
      <div style="background: #f9f9f9; padding: 15px; border-radius: 8px;">
        <p><strong>Topic:</strong> ${sessionTitle}</p>
        <p><strong>Date:</strong> ${new Date(date).toLocaleDateString()}</p>
        <p><strong>Time:</strong> ${time}</p>
        <p><strong>Venue:</strong> ${venue}</p>
      </div>
      <p>Come prepared with your questions!</p>
    </div>
  `
};

module.exports = { sendEmail, emailTemplates };
