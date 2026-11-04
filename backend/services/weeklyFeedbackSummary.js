import Grievance from '../models/Grievance.js';
import User from '../models/User.js';
import WeeklySummaryDelivery from '../models/WeeklySummaryDelivery.js';
import emailService from './emailService.js';
import sendgridEmailService from './sendgridEmailService.js';

const dayMs = 86400000;
const indiaOffset = 330 * 60000;

export function summaryWeek(now = new Date()) {
  const monday = new Date(now.getTime() + indiaOffset);
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  monday.setUTCHours(0, 0, 0, 0);
  const end = new Date(monday.getTime() - indiaOffset);
  return { start: new Date(end.getTime() - 7 * dayMs), end };
}

export function mailIsConfigured() {
  return Boolean(process.env.SENDGRID_API_KEY && (process.env.SMTP_FROM || process.env.EMAIL_FROM)) ||
    Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.SMTP_FROM);
}

export async function buildWeeklyFeedbackSummary(now = new Date()) {
  const { start, end } = summaryWeek(now);
  const [received, resolved, open, byType] = await Promise.all([
    Grievance.countDocuments({ createdAt: { $gte: start, $lt: end } }),
    Grievance.countDocuments({ resolvedAt: { $gte: start, $lt: end } }),
    Grievance.countDocuments({ status: { $in: ['submitted', 'under_review'] } }),
    Grievance.aggregate([
      { $match: { createdAt: { $gte: start, $lt: end } } },
      { $group: { _id: { $ifNull: ['$feedbackType', 'concern'] }, count: { $sum: 1 } } }
    ])
  ]);
  const date = value => value.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });
  const range = `${date(start)} – ${date(new Date(end.getTime() - 1))}`;
  const counts = Object.fromEntries(byType.map(row => [row._id, row.count]));
  const lines = [
    ['Received last week', received], ['Resolved last week', resolved], ['Open now', open],
    ['General feedback', counts.general || 0], ['Suggestions', counts.suggestion || 0],
    ['Appreciation', counts.appreciation || 0], ['Concerns', counts.concern || 0]
  ];
  const url = new URL('/feedback', process.env.FRONTEND_URL || 'http://localhost:3000');
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('FRONTEND_URL must be an HTTP(S) URL');
  const href = url.href.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  return {
    week: start, end, received, resolved, open,
    subject: `YDesk weekly feedback summary: ${range}`,
    text: `Weekly feedback summary\n${range}\n\n${lines.map(([label, count]) => `${label}: ${count}`).join('\n')}\n\nCounts only. Sign in to view the feedback you have access to.\n${url.href}`,
    html: `<div style="font-family:Arial,sans-serif;color:#0f2347;max-width:560px"><h2>Weekly feedback summary</h2><p>${range}</p><table>${lines.map(([label, count]) => `<tr><td style="padding:8px 24px 8px 0">${label}</td><td>${count}</td></tr>`).join('')}</table><p>Counts only. Names, subjects, descriptions, notes, and attachments are excluded.</p><p><a href="${href}">Open the feedback portal</a></p></div>`
  };
}

export async function sendWeeklyFeedbackSummary({ now = new Date(), dryRun = true, send } = {}) {
  const summary = await buildWeeklyFeedbackSummary(now);
  const recipients = await User.find({ isActive: true, grievanceAccess: { $in: ['handler', 'summary'] } }).select('_id email');
  const allowlist = (process.env.WEEKLY_SUMMARY_RECIPIENTS || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
  const eligible = recipients.filter(user => !allowlist.length || allowlist.includes(user.email));
  const result = { week: summary.week.toISOString(), recipients: eligible.length, sent: 0, skipped: 0, failed: 0, dryRun };
  if (dryRun) return result;
  if (process.env.WEEKLY_SUMMARY_ENABLED !== 'true') throw new Error('Set WEEKLY_SUMMARY_ENABLED=true before sending summaries');
  if (!send && !mailIsConfigured()) throw new Error('Configure SendGrid or SMTP before sending summaries');
  const deliver = send || (message => (process.env.SENDGRID_API_KEY ? sendgridEmailService : emailService).sendEmail(message));
  await WeeklySummaryDelivery.init();
  for (const user of eligible) {
    let delivery;
    try {
      delivery = await WeeklySummaryDelivery.findOneAndUpdate(
        { week: summary.week, userId: user._id, status: 'failed' },
        { $set: { status: 'sending', error: '' } },
        { upsert: true, new: true }
      );
    } catch (error) {
      if (error.code === 11000) { result.skipped++; continue; }
      throw error;
    }
    try {
      await deliver({ to: user.email, subject: summary.subject, html: summary.html, text: summary.text });
      await WeeklySummaryDelivery.updateOne({ _id: delivery._id }, { $set: { status: 'sent', sentAt: new Date() } });
      result.sent++;
    } catch (error) {
      await WeeklySummaryDelivery.updateOne({ _id: delivery._id }, { $set: { status: 'failed', error: 'Email delivery failed' } });
      result.failed++;
    }
  }
  return result;
}
