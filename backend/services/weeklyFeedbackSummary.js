import Grievance, { GRIEVANCE_CATEGORIES } from '../models/Grievance.js';
import User from '../models/User.js';
import WeeklySummaryDelivery from '../models/WeeklySummaryDelivery.js';
import emailService from './emailService.js';
import sendgridEmailService from './sendgridEmailService.js';

const indiaOffset = 330 * 60000;
const templateVersion = 'v2';
const perCategoryLimit = 10;
const subjectLimit = 120;
const statusLabels = { submitted: 'Submitted', under_review: 'Under review', resolved: 'Resolved', closed: 'Closed' };

export function summaryWeek(now = new Date()) {
  const monday = new Date(now.getTime() + indiaOffset);
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  monday.setUTCHours(0, 0, 0, 0);
  return { start: new Date(monday.getTime() - indiaOffset), end: now };
}

export function mailIsConfigured() {
  return Boolean(process.env.SENDGRID_API_KEY && (process.env.SMTP_FROM || process.env.EMAIL_FROM)) ||
    Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.SMTP_FROM);
}

const escapeHtml = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const clip = value => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > subjectLimit ? `${text.slice(0, subjectLimit - 1)}…` : text;
};

export async function buildWeeklyFeedbackSummary(now = new Date()) {
  const { start, end } = summaryWeek(now);
  const inWindow = { $gte: start, $lte: end };
  const [received, resolved, open, raised, touched] = await Promise.all([
    Grievance.countDocuments({ createdAt: inWindow }),
    Grievance.countDocuments({ resolvedAt: inWindow }),
    Grievance.countDocuments({ status: { $in: ['submitted', 'under_review'] } }),
    Grievance.find({ createdAt: inWindow }).select('grievanceId category subject status createdAt').sort({ createdAt: 1 }).lean(),
    Grievance.find({ 'statusHistory.changedAt': inWindow }).select('grievanceId category subject statusHistory').lean()
  ]);
  const progress = touched.flatMap(grievance => grievance.statusHistory
    .map((entry, index, history) => ({ entry, from: history[index - 1]?.status }))
    .filter(({ entry, from }) => from && from !== entry.status && entry.changedAt >= start && entry.changedAt <= end)
    .map(({ entry, from }) => ({ grievanceId: grievance.grievanceId, subject: grievance.subject, from, to: entry.status, at: entry.changedAt })))
    .sort((a, b) => a.at - b.at);
  const categories = [...new Set([...GRIEVANCE_CATEGORIES, ...raised.map(item => item.category)])]
    .map(name => ({ name, items: raised.filter(item => item.category === name) }))
    .filter(group => group.items.length)
    .map(group => ({ ...group, shown: group.items.slice(0, perCategoryLimit), hidden: Math.max(0, group.items.length - perCategoryLimit) }));
  const date = value => value.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });
  const range = `${date(start)} – ${date(end)}`;
  const url = new URL('/feedback', process.env.FRONTEND_URL || 'http://localhost:3000');
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('FRONTEND_URL must be an HTTP(S) URL');
  const footer = 'Subjects are included; names, descriptions, notes, and attachments are not. Sign in to view the details you have access to.';
  const text = [
    'Weekly feedback summary', range, '',
    `Received this week: ${received}`, `Resolved this week: ${resolved}`, `Open now: ${open}`, '',
    'Progress this week',
    ...(progress.length
      ? progress.map(p => `- ${p.grievanceId} ${clip(p.subject)}: ${statusLabels[p.from]} → ${statusLabels[p.to]} (${date(p.at)})`)
      : ['No status changes this week.']),
    '',
    'New this week',
    ...(categories.length
      ? categories.flatMap(group => [
        `${group.name} (${group.items.length})`,
        ...group.shown.map(item => `- ${item.grievanceId} ${clip(item.subject)} [${statusLabels[item.status]}] (${date(item.createdAt)})`),
        ...(group.hidden ? [`+ ${group.hidden} more in the portal`] : []),
        ''
      ])
      : ['No new feedback this week.']),
    footer, url.href
  ].join('\n');
  const row = (label, value) => `<tr><td style="padding:6px 24px 6px 0">${escapeHtml(label)}</td><td style="padding:6px 0">${escapeHtml(value)}</td></tr>`;
  const cell = value => `<td style="padding:6px 16px 6px 0;vertical-align:top">${escapeHtml(value)}</td>`;
  const html = `<div style="font-family:Arial,sans-serif;color:#0f2347;max-width:640px">`
    + `<h2>Weekly feedback summary</h2><p>${escapeHtml(range)}</p>`
    + `<table>${row('Received this week', received)}${row('Resolved this week', resolved)}${row('Open now', open)}</table>`
    + `<h3 style="margin:24px 0 8px">Progress this week</h3>`
    + (progress.length
      ? `<table>${progress.map(p => `<tr>${cell(p.grievanceId)}${cell(clip(p.subject))}${cell(`${statusLabels[p.from]} → ${statusLabels[p.to]}`)}${cell(date(p.at))}</tr>`).join('')}</table>`
      : '<p>No status changes this week.</p>')
    + `<h3 style="margin:24px 0 8px">New this week</h3>`
    + (categories.length
      ? categories.map(group => `<h4 style="margin:16px 0 4px">${escapeHtml(group.name)} (${group.items.length})</h4>`
        + `<table>${group.shown.map(item => `<tr>${cell(item.grievanceId)}${cell(clip(item.subject))}${cell(statusLabels[item.status])}${cell(date(item.createdAt))}</tr>`).join('')}</table>`
        + (group.hidden ? `<p>+ ${group.hidden} more in the portal</p>` : '')).join('')
      : '<p>No new feedback this week.</p>')
    + `<p style="font-size:12px;color:#555">${escapeHtml(footer)}</p>`
    + `<p><a href="${escapeHtml(url.href)}">Open the feedback portal</a></p>`
    + `<p style="font-size:11px;color:#888">Template ${templateVersion}</p></div>`;
  return {
    week: start, end, received, resolved, open,
    subject: `YDesk weekly feedback summary: ${range}`,
    text,
    html
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
