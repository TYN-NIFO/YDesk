import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarDayStart, calendarPeriod, overlapQuery } from '../services/leaveDates.js';
test('India calendar starts before UTC date and rejects impossible dates', () => {
  assert.equal(calendarDayStart('2026-11-01').toISOString(), '2026-10-31T18:30:00.000Z');
  for (const date of ['2026-02-30', '2026-13-01', 'bad', '2026-11-01T00:00:00Z']) assert.ok(Number.isNaN(calendarDayStart(date).getTime()));
});
test('month, leap year and December boundaries are half open', () => {
  assert.equal(calendarPeriod(2026, 12).end.toISOString(), '2026-12-31T18:30:00.000Z');
  assert.equal(calendarPeriod(2024, 2).end - calendarPeriod(2024, 2).start, 29 * 86400000);
  assert.equal(calendarPeriod(2026).end.toISOString(), '2026-12-31T18:30:00.000Z');
});
test('overlap query includes spanning requests and the last day without including next month', () => {
  const { start, end } = calendarPeriod(2026, 11);
  const query = overlapQuery(start, end);
  const matches = (a,b) => new Date(a) < query.startDate.$lt && new Date(b) >= query.endDate.$gte;
  assert.ok(matches('2026-10-28','2026-11-02'));
  assert.ok(matches('2026-11-30T18:29:59Z','2026-11-30T18:29:59Z'));
  assert.ok(!matches('2026-11-30T18:30:00Z','2026-12-02'));
});
