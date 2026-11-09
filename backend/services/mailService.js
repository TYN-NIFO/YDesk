import resendEmailService from './resendEmailService.js';
import sendgridEmailService from './sendgridEmailService.js';
import smtpEmailService from './emailService.js';

export function getEmailService() {
  if (process.env.RESEND_API_KEY) return resendEmailService;
  if (process.env.SENDGRID_API_KEY) return sendgridEmailService;
  return smtpEmailService;
}

export function mailIsConfigured() {
  if (process.env.RESEND_API_KEY) return Boolean(process.env.RESEND_FROM || process.env.EMAIL_FROM || process.env.SMTP_FROM);
  if (process.env.SENDGRID_API_KEY) return Boolean(process.env.SMTP_FROM || process.env.EMAIL_FROM);
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.SMTP_FROM);
}
