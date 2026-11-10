import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderWeeklyFeedbackSummary } from '../services/weeklyFeedbackTemplate.js';

const base = {
  start: new Date('2026-11-01T18:30:00Z'), end: new Date('2026-11-06T12:30:00Z'),
  received: 12, resolved: 3, open: 9, frontendUrl: 'https://portal.example.test',
  raised: Array.from({ length: 12 }, (_, index) => ({
    grievanceId: `feedback_2026_${index}`, category: 'Ideas & Suggestions', feedbackType: 'suggestion',
    subject: `Suggestion ${index}`, status: 'under_review', createdAt: new Date('2026-11-03T05:00:00Z')
  }))
};

test('detailed weekly email lists every received item with type, category, status and IST date', () => {
  const result = renderWeeklyFeedbackSummary(base);
  for (const item of base.raised) {
    assert.ok(result.text.includes(`${item.grievanceId}: ${item.subject}`));
    assert.ok(result.html.includes(item.grievanceId));
    assert.ok(result.html.includes(item.subject));
  }
  assert.ok(result.text.includes('Suggestion | Under review | Received 3 Nov 2026'));
  assert.ok(result.html.includes('Ideas &amp; Suggestions (12)'));
  assert.ok(result.html.includes('https://portal.example.test/feedback'));
  assert.ok(result.subject.includes('2 Nov 2026 to 6 Nov 2026 (IST)'));
  assert.ok(!result.html.includes('more in the portal'));
});

test('email escapes submitted content and excludes profiles, descriptions, notes and attachments', () => {
  const result = renderWeeklyFeedbackSummary({ ...base,
    raised: [{ ...base.raised[0], subject: '<img src=x onerror=alert(1)>', category: '<script>alert(2)</script>',
      employeeId: 'PRIVATE_EMPLOYEE', description: 'PRIVATE_DESCRIPTION', attachments: ['PRIVATE_ATTACHMENT'], note: 'PRIVATE_NOTE' }],
    progress: [{ grievanceId: 'feedback_change', subject: '<b>subject</b>', from: 'submitted', to: 'resolved', at: base.end, note: 'PRIVATE_NOTE' }]
  });
  assert.ok(result.html.includes('&lt;img src=x'));
  assert.ok(result.html.includes('&lt;script&gt;'));
  assert.ok(result.html.includes('Submitted \u2192 Resolved'));
  assert.ok(!result.html.includes('<img src=x'));
  for (const value of ['PRIVATE_EMPLOYEE', 'PRIVATE_DESCRIPTION', 'PRIVATE_ATTACHMENT', 'PRIVATE_NOTE']) {
    assert.ok(!JSON.stringify(result).includes(value));
  }
  const aggregate = renderWeeklyFeedbackSummary({ ...base, includeDetails: false });
  assert.ok(aggregate.text.includes('Counts only'));
  assert.ok(!aggregate.text.includes('Suggestion 0'));
  assert.ok(!aggregate.html.includes('feedback_2026_'));
});

test('sample labels, empty weeks and invalid portal URLs are handled explicitly', () => {
  const empty = renderWeeklyFeedbackSummary({ ...base, received: 0, raised: [], sample: true });
  assert.ok(empty.subject.endsWith(' - SAMPLE'));
  assert.ok(empty.text.includes('All feedback and figures below are synthetic'));
  assert.ok(empty.text.includes('No new feedback this week.'));
  assert.ok(empty.html.includes('No status changes this week.'));
  assert.throws(() => renderWeeklyFeedbackSummary({ ...base, frontendUrl: 'javascript:alert(1)' }));
});
