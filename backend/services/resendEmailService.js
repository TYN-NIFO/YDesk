import emailTemplates from './emailService.js';

const escapeHtml = value => String(value || '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

class ResendEmailService {
  async sendEmail({ to, subject, html, text, idempotencyKey }) {
    const key = process.env.RESEND_API_KEY;
    const sender = process.env.RESEND_FROM || process.env.EMAIL_FROM || process.env.SMTP_FROM;
    if (!key || !sender) throw new Error('Configure RESEND_API_KEY and RESEND_FROM or EMAIL_FROM');
    const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean);
    if (!recipients.length) throw new Error('An email recipient is required');
    const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers, redirect: 'error', signal: AbortSignal.timeout(15000),
      body: JSON.stringify({ from: sender.includes('<') ? sender : `YDesk <${sender}>`, to: recipients, subject, html, text })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(`Resend email request failed (${response.status})`);
      error.status = response.status;
      error.code = result.name || 'resend_error';
      throw error;
    }
    if (!result.id) throw new Error('Resend returned no delivery reference');
    return { success: true, provider: 'Resend', messageId: result.id };
  }

  async sendPasswordResetEmail(email, resetToken, userName) {
    if (!process.env.FRONTEND_URL) throw new Error('FRONTEND_URL is required for password reset emails');
    const url = new URL('/reset-password', process.env.FRONTEND_URL);
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error('FRONTEND_URL must use HTTP(S)');
    url.searchParams.set('token', resetToken);
    return this.sendEmail({
      to: email, subject: 'Reset your YDesk password',
      html: emailTemplates.getPasswordResetTemplate(escapeHtml(userName), escapeHtml(url.href), '1 hour'),
      text: emailTemplates.getPasswordResetTextVersion(userName, url.href, '1 hour')
    });
  }

  async sendPasswordResetConfirmation(email, userName) {
    return this.sendEmail({
      to: email, subject: 'Your YDesk password has been reset',
      html: emailTemplates.getPasswordResetConfirmationTemplate(escapeHtml(userName)),
      text: emailTemplates.getPasswordResetConfirmationTextVersion(userName)
    });
  }
}

export default new ResendEmailService();
