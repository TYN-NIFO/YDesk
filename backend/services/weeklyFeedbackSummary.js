import Grievance from '../models/Grievance.js';
import User from '../models/User.js';
import WeeklySummaryDelivery from '../models/WeeklySummaryDelivery.js';
import WeeklyReport from '../models/WeeklyReport.js';
import { getEmailService, mailIsConfigured } from './mailService.js';
import { renderWeeklyFeedbackSummary } from './weeklyFeedbackTemplate.js';

export { mailIsConfigured } from './mailService.js';

const indiaOffset = 330 * 60000;

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

export async function buildWeeklyFeedbackSummary(now = new Date(), period = summaryWeek(now), { includeDetails = true } = {}) {
  const { start, end } = period;
  const inWindow = { $gte: start, $lt: end };
  const [received, resolved, open, raised, touched] = await Promise.all([
    Grievance.countDocuments({ createdAt: inWindow }),
    Grievance.countDocuments({ resolvedAt: inWindow }),
    Grievance.countDocuments({ status: { $in: ['submitted', 'under_review'] } }),
    includeDetails ? Grievance.find({ createdAt: inWindow }).select('grievanceId category feedbackType subject status createdAt').sort({ createdAt: 1 }).lean() : [],
    includeDetails ? Grievance.find({ 'statusHistory.changedAt': inWindow }).select('grievanceId category subject statusHistory').lean() : []
  ]);
  const progress = touched.flatMap(grievance => grievance.statusHistory
    .map((entry, index, history) => ({ entry, from: history[index - 1]?.status }))
    .filter(({ entry, from }) => from && from !== entry.status && entry.changedAt >= start && entry.changedAt < end)
    .map(({ entry, from }) => ({ grievanceId: grievance.grievanceId, subject: grievance.subject, from, to: entry.status, at: entry.changedAt })))
    .sort((a, b) => a.at - b.at);
  return renderWeeklyFeedbackSummary({ start, end, received, resolved, open, raised, progress, includeDetails });
}

export async function sendWeeklyFeedbackSummary({ now = new Date(), dryRun = true, send } = {}) {
  if (!dryRun) {
    if (process.env.WEEKLY_SUMMARY_ENABLED !== 'true') throw new Error('Set WEEKLY_SUMMARY_ENABLED=true before sending summaries');
    if (!send && !mailIsConfigured()) throw new Error('Configure Resend, SendGrid, or SMTP before sending summaries');
  }
  const report = await resolveReport(now, !dryRun);
  const summary = await buildWeeklyFeedbackSummary(now, { start: report.periodStart, end: report.periodEnd });
  const recipients = await User.find({ isActive: true, grievanceAccess: { $in: ['handler', 'summary'] } }).select('_id email grievanceAccess weeklySummaryEmail');
  const deliveryEmail = user => (user.weeklySummaryEmail || user.email).trim().toLowerCase();
  const allowlist = (process.env.WEEKLY_SUMMARY_RECIPIENTS || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
  const eligible = recipients.filter(user => !allowlist.length || allowlist.includes(deliveryEmail(user)));
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
      await deliver({ to: deliveryEmail(user), subject: message.subject, html: message.html, text: message.text, idempotencyKey: `weekly-feedback/${report.week.toISOString()}/${user._id}` });
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
