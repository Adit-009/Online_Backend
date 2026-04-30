/**
 * Email Service (DISABLED)
 * All email confirmations have been removed as per user request.
 */

const sendEmail = async (to, subject, html) => {
  console.log(`[EMAIL DISABLED] Would have sent to ${to}: ${subject}`);
  return { success: true, message: 'Email disabled' };
};

const emailTemplates = {
  adminEnrollmentNotification: () => '',
  studentAdmissionReceived: () => '',
  examReminder: () => '',
  doubtSessionAnnouncement: () => '',
  welcome: () => '',
  adminNotification: () => ''
};

module.exports = { sendEmail, emailTemplates };