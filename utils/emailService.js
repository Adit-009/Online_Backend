const nodemailer = require('nodemailer');

// Configure Gmail SMTP Transporter
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',   // explicit host instead of service: 'gmail'
  port: 587,                // 587 = STARTTLS (most reliable, rarely blocked)
  secure: false,            // false for port 587; true only for port 465
  requireTLS: true,         // forces TLS upgrade — fixes timeout on most servers
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS  // must be a Google App Password, not your Gmail password
  }
  // Removed: service, pool, maxConnections, maxMessages, timeout overrides, tls.rejectUnauthorized
  // pool:true + Gmail = unreliable; rejectUnauthorized:false = security risk
});

/**
 * Utility to send emails via Gmail SMTP
 * @param {string} to - Recipient email
 * @param {string} subject - Email subject
 * @param {string} html - HTML content of the email
 */
const sendEmail = async (to, subject, html) => {
  try {
    const mailOptions = {
      from: `"Third Eye Computer Education" <${process.env.GMAIL_USER}>`,
      to,
      subject,
      html
    };

    const info = await transporter.sendMail(mailOptions);
    return { success: true, data: info };
  } catch (error) {
    console.error('[EMAIL ERROR] Gmail SMTP failed:', error);
    return { success: false, error: error.message };
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
    const safeWpPhone = wpPhone || '';
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
        <a href="https://wa.me/${safeWpPhone.replace(/\D/g, '')}" style="background: #25D366; color: white; padding: 12px 25px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Chat on WhatsApp</a>
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