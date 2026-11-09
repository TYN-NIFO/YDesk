import User from '../models/User.js';
import { getEmailService } from './mailService.js';

// Grievance emails carry only the ID, category, subject and status. The
// description and attachments stay in YDesk, behind sign-in.

const STATUS_LABELS = {
  submitted: 'Submitted',
  under_review: 'Under review',
  resolved: 'Resolved',
  closed: 'Closed'
};

const escapeHtml = (value = '') =>
  String(value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));

const grievancesUrl = () => `${process.env.FRONTEND_URL || ''}/feedback`;

function renderEmail(heading, rows, footer) {
  const tableRows = rows
    .map(([label, value]) => `<tr><td style="padding:4px 12px 4px 0;color:#57534e">${escapeHtml(label)}</td><td style="padding:4px 0">${escapeHtml(value)}</td></tr>`)
    .join('');
  const html = `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:15px;color:#1c1917">
  <h2 style="font-size:18px;margin:0 0 12px">${escapeHtml(heading)}</h2>
  <table style="border-collapse:collapse;margin-bottom:16px">${tableRows}</table>
  <p style="margin:0 0 16px">${escapeHtml(footer)}</p>
  <p style="margin:0"><a href="${escapeHtml(grievancesUrl())}">Open feedback in YDesk</a></p>
</div>`;
  const text = `${heading}\n\n${rows.map(([label, value]) => `${label}: ${value}`).join('\n')}\n\n${footer}\n\n${grievancesUrl()}`;
  return { html, text };
}

// Email failures are logged, never thrown: a grievance must not be lost
// because SMTP or SendGrid is down.
async function send(to, subject, body) {
  if (!to || (Array.isArray(to) && to.length === 0)) return;
  try {
    await getEmailService().sendEmail({ to, subject, ...body });
  } catch (error) {
    console.error('Grievance email failed:', { subject, error: error.message });
  }
}

export async function notifyGrievanceCreated(grievance, filer) {
  const handlers = await User.find({ grievanceAccess: 'handler', isActive: true }).select('email');
  const handlerEmails = handlers.map((h) => h.email).filter((email) => email !== filer.email);
  const rows = [
    ['Feedback reference', grievance.grievanceId],
    ['Raised by', filer.name],
    ['Category', grievance.category],
    ['Subject', grievance.subject]
  ];

  await Promise.all([
    send(
      handlerEmails,
      `New feedback ${grievance.grievanceId}: ${grievance.category}`,
      renderEmail('New feedback has been shared', rows, 'Sign in to YDesk to read the details and respond.')
    ),
    send(
      filer.email,
      `Your feedback ${grievance.grievanceId} has been received`,
      renderEmail('We have received your feedback', rows, 'The feedback reviewers will follow up. You will get an email whenever its status changes.')
    )
  ]);
}

export async function notifyGrievanceStatusChanged(grievance, filer, note) {
  const rows = [
    ['Feedback reference', grievance.grievanceId],
    ['Subject', grievance.subject],
    ['New status', STATUS_LABELS[grievance.status] || grievance.status]
  ];


  await send(
    filer.email,
    `Feedback ${grievance.grievanceId} is now ${STATUS_LABELS[grievance.status] || grievance.status}`,
    renderEmail('Your feedback has been updated', rows, 'Sign in to YDesk to see the full history.')
  );
}
