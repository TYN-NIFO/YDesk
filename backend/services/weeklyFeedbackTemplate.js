const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const statusLabels = { submitted: 'Submitted', under_review: 'Under review', resolved: 'Resolved', closed: 'Closed' };
const typeLabels = { general: 'General feedback', suggestion: 'Suggestion', appreciation: 'Appreciation', concern: 'Concern' };
const date = value => new Date(value).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });

// Shared by the real weekly job and synthetic previews; never accepts employee profiles.
export function renderWeeklyFeedbackSummary({ start, end, received, resolved, open, raised = [], progress = [], includeDetails = true, frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000', sample = false }) {
  const url = new URL('/feedback', frontendUrl);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('FRONTEND_URL must be an HTTP(S) URL');
  const range = `${date(start)} to ${date(end)} (IST)`;
  const groups = new Map();
  if (includeDetails) {
    for (const item of raised) {
      const category = item.category || 'Other';
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category).push(item);
    }
  }
  const footer = includeDetails
    ? 'Subjects are included; names, descriptions, notes, and attachments are not. Sign in to view the details you have access to.'
    : 'Counts only. Names, references, subjects, descriptions, notes, and attachments are excluded.';
  const notice = sample ? 'SAMPLE: All feedback and figures below are synthetic. No production records are included.' : '';
  const status = value => statusLabels[value] || value;
  const type = value => typeLabels[value] || 'Concern';
  const text = [
    'Weekly feedback summary', range, ...(sample ? ['', notice] : []), '',
    `Received this week: ${received}`, `Resolved this week: ${resolved}`, `Open now: ${open}`, '',
    ...(includeDetails ? [
      'Feedback received this week',
      ...(groups.size ? [...groups].flatMap(([category, items]) => [
        `${category} (${items.length})`,
        ...items.map(item => `- ${item.grievanceId}: ${item.subject}\n  ${type(item.feedbackType)} | ${status(item.status)} | Received ${date(item.createdAt)}`), ''
      ]) : ['No new feedback this week.', '']),
      'Progress this week',
      ...(progress.length ? progress.map(item => `- ${item.grievanceId} ${item.subject}: ${status(item.from)} \u2192 ${status(item.to)} (${date(item.at)})`) : ['No status changes this week.']), ''
    ] : []),
    footer, `Open feedback portal: ${url.href}`, 'Sent by YDesk'
  ].join('\n');
  const metric = (label, value) => `<tr><td style="padding:8px 18px 8px 0;color:#536075">${escapeHtml(label)}</td><td style="padding:8px 0;font-weight:bold">${escapeHtml(value)}</td></tr>`;
  const heading = label => `<h3 style="font-size:18px;margin:28px 0 12px;color:#0f2347">${escapeHtml(label)}</h3>`;
  const html = '<!doctype html><html><head><meta charset="UTF-8"></head><body style="margin:0;background:#f5f6f8">'
    + '<div style="font-family:Arial,sans-serif;color:#0f2347;max-width:640px;margin:24px auto;background:#fff;border:1px solid #e4e8ee;border-radius:12px;overflow:hidden">'
    + '<div style="background:#0f2347;color:#fff;padding:24px 28px;border-top:6px solid #ffcf32"><strong style="font-size:22px">YDesk</strong><h1 style="font-size:23px;margin:14px 0 8px">Weekly feedback summary</h1>'
    + `<p style="margin:0;color:#dce3ef;font-size:14px">${escapeHtml(range)}</p></div><div style="padding:24px 28px">`
    + (sample ? `<p style="background:#fff7d6;padding:12px;font-size:13px;margin-top:0">${escapeHtml(notice)}</p>` : '')
    + `<table role="presentation" style="border-collapse:collapse;width:100%">${metric('Feedback received', received)}${metric('Resolved this week', resolved)}${metric('Open now', open)}</table>`
    + (includeDetails ? heading('Feedback received this week')
      + (groups.size ? [...groups].map(([category, items]) => `<h4 style="margin:20px 0 10px;font-size:14px;color:#536075">${escapeHtml(category)} (${items.length})</h4>`
        + items.map(item => '<div style="border:1px solid #e4e8ee;border-left:4px solid #ffcf32;border-radius:6px;padding:14px 16px;margin-bottom:10px">'
          + `<p style="margin:0 0 6px;font-size:12px;color:#536075">${escapeHtml(item.grievanceId)}</p>`
          + `<p style="margin:0 0 8px;font-size:15px;font-weight:bold;line-height:1.5;overflow-wrap:anywhere">${escapeHtml(item.subject)}</p>`
          + `<p style="margin:0;font-size:12px;line-height:1.6;color:#536075">${escapeHtml(type(item.feedbackType))} | ${escapeHtml(status(item.status))}<br>Received ${escapeHtml(date(item.createdAt))}</p></div>`).join('')).join('')
        : '<p>No new feedback this week.</p>')
      + heading('Progress this week')
      + (progress.length ? progress.map(item => `<p style="font-size:13px;line-height:1.6"><strong>${escapeHtml(item.grievanceId)}</strong> ${escapeHtml(item.subject)}<br>${escapeHtml(status(item.from))} \u2192 ${escapeHtml(status(item.to))} (${escapeHtml(date(item.at))})</p>`).join('') : '<p>No status changes this week.</p>')
      : '')
    + `<p style="margin:28px 0"><a href="${escapeHtml(url.href)}" style="display:inline-block;background:#ffcf32;color:#0f2347;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:6px">Open feedback portal</a></p>`
    + `<p style="font-size:12px;line-height:1.6;color:#536075">${escapeHtml(footer)}</p>`
    + '<p style="font-size:11px;color:#788496;border-top:1px solid #e4e8ee;padding-top:16px">Sent by YDesk | Template v3</p></div></div></body></html>';
  return { received, resolved, open, subject: `YDesk weekly feedback summary: ${range}${sample ? ' - SAMPLE' : ''}`, text, html };
}
