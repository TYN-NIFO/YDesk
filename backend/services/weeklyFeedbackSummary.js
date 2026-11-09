import Grievance, { GRIEVANCE_CATEGORIES } from '../models/Grievance.js';
import User from '../models/User.js';
import WeeklySummaryDelivery from '../models/WeeklySummaryDelivery.js';
import WeeklyReport from '../models/WeeklyReport.js';
import { getEmailService, mailIsConfigured } from './mailService.js';

export { mailIsConfigured } from './mailService.js';

const indiaOffset = 330 * 60000;
const templateVersion = 'v2';
const perCategoryLimit = 10;
const subjectLimit = 120;
const statusLabels = { submitted: 'Submitted', under_review: 'Under review', resolved: 'Resolved', closed: 'Closed' };

function mondayStart(now) {
  const monday = new Date(now.getTime() + indiaOffset);
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  monday.setUTCHours(0, 0, 0, 0);
  return new Date(monday.getTime() - indiaOffset);
}

export function summaryWeek(now = new Date()) {
  return { start: mondayStart(now), end: now };
}

async function resolveReport(now, persist) {
  const week = mondayStart(now);
  const existing = await WeeklyReport.findOne({ week }).lean();
  if (existing) return existing;
  const previous = await WeeklyReport.findOne({ status: 'sent' }).sort({ periodEnd: -1 }).lean();
  const periodStart = previous ? previous.periodEnd : week;
  if (!persist) return { week, periodStart, periodEnd: now, status: 'pending' };
  await WeeklyReport.init();
  return WeeklyReport.findOneAndUpdate(
    { week },
    { $setOnInsert: { periodStart, periodEnd: now, status: 'pending' } },
    { upsert: true, new: true }
  ).lean();
}

const escapeHtml = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const clip = value => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > subjectLimit ? `${text.slice(0, subjectLimit - 1)}…` : text;
};

export async function buildWeeklyFeedbackSummary(now = new Date(), period = summaryWeek(now), { includeDetails = true } = {}) {
  const { start, end } = period;
  const inWindow = { $gte: start, $lt: end };
  const [received, resolved, open, raised, touched] = await Promise.all([
    Grievance.countDocuments({ createdAt: inWindow }),
    Grievance.countDocuments({ resolvedAt: inWindow }),
    Grievance.countDocuments({ status: { $in: ['submitted', 'under_review'] } }),
    includeDetails ? Grievance.find({ createdAt: inWindow }).select('grievanceId category subject status createdAt').sort({ createdAt: 1 }).lean() : [],
    includeDetails ? Grievance.find({ 'statusHistory.changedAt': inWindow }).select('grievanceId category subject statusHistory').lean() : []
  ]);
  const progress = touched.flatMap(grievance => grievance.statusHistory
    .map((entry, index, history) => ({ entry, from: history[index - 1]?.status }))
    .filter(({ entry, from }) => from && from !== entry.status && entry.changedAt >= start && entry.changedAt < end)
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
  if (!includeDetails) {
    const footer = 'Counts only. Names, references, subjects, descriptions, notes, and attachments are excluded.';
    return {
      received, resolved, open,
      subject: `YDesk weekly feedback summary: ${range}`,
      text: `Weekly feedback summary\n${range}\n\nReceived this week: ${received}\nResolved this week: ${resolved}\nOpen now: ${open}\n\n${footer}\n${url.href}`,
      html: `<div style="font-family:Arial,sans-serif;color:#0f2347"><h2>Weekly feedback summary</h2><p>${escapeHtml(range)}</p><p>Received this week: ${received}</p><p>Resolved this week: ${resolved}</p><p>Open now: ${open}</p><p>${footer}</p><p><a href="${escapeHtml(url.href)}">Open the feedback portal</a></p></div>`
    };
  }
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
    received, resolved, open,
    subject: `YDesk weekly feedback summary: ${range}`,
    text,
    html
  };
}

export async function sendWeeklyFeedbackSummary({ now = new Date(), dryRun = true, send } = {}) {
  if (!dryRun) {
    if (process.env.WEEKLY_SUMMARY_ENABLED !== 'true') throw new Error('Set WEEKLY_SUMMARY_ENABLED=true before sending summaries');
    if (!send && !mailIsConfigured()) throw new Error('Configure Resend, SendGrid, or SMTP before sending summaries');
  }
  const report = await resolveReport(now, !dryRun);
  const summary = await buildWeeklyFeedbackSummary(now, { start: report.periodStart, end: report.periodEnd });
  const recipients = await User.find({ isActive: true, grievanceAccess: { $in: ['handler', 'summary'] } }).select('_id email grievanceAccess');
  const allowlist = (process.env.WEEKLY_SUMMARY_RECIPIENTS || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
  const eligible = recipients.filter(user => !allowlist.length || allowlist.includes(user.email));
  const result = { week: report.week.toISOString(), recipients: eligible.length, sent: 0, skipped: 0, failed: 0, pending: 0, dryRun };
  if (dryRun) return result;
  let aggregateSummary;
  const deliver = send || (message => getEmailService().sendEmail(message));
  await WeeklySummaryDelivery.init();
  for (const user of eligible) {
    let delivery;
    try {
      delivery = await WeeklySummaryDelivery.findOneAndUpdate(
        {
          week: report.week,
          userId: user._id,
          status: 'failed'
        },
        { $set: { status: 'sending', error: '' } },
        { upsert: true, new: true }
      );
    } catch (error) {
      if (error.code === 11000) { result.skipped++; continue; }
      throw error;
    }
    try {
      if (user.grievanceAccess === 'summary') {
        aggregateSummary ||= await buildWeeklyFeedbackSummary(now, { start: report.periodStart, end: report.periodEnd }, { includeDetails: false });
      }
      const message = user.grievanceAccess === 'summary' ? aggregateSummary : summary;
      await deliver({ to: user.email, subject: message.subject, html: message.html, text: message.text, idempotencyKey: `weekly-feedback/${report.week.toISOString()}/${user._id}` });
    } catch (error) {
      await WeeklySummaryDelivery.updateOne({ _id: delivery._id }, { $set: { status: 'failed', error: 'Email delivery failed' } });
      result.failed++;
      continue;
    }
    await WeeklySummaryDelivery.updateOne({ _id: delivery._id }, { $set: { status: 'sent', sentAt: new Date() } });
    result.sent++;
  }
  const confirmed = await WeeklySummaryDelivery.countDocuments({ week: report.week, userId: { $in: eligible.map(user => user._id) }, status: 'sent' });
  result.pending = eligible.length - confirmed;
  if (eligible.length > 0 && result.pending === 0) {
    await WeeklyReport.updateOne({ _id: report._id }, { $set: { status: 'sent', sentAt: new Date() } });
  } else {
    await WeeklyReport.updateOne({ _id: report._id }, { $set: { status: 'pending' }, $unset: { sentAt: 1 } });
  }
  return result;
}
