// Attendance reporting uses the organisation's India calendar, not server timezone.
const offset = '+05:30';
export function calendarDayStart(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(NaN);
  const date = new Date(`${value}T00:00:00${offset}`);
  const check = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(check.getTime()) && check.toISOString().slice(0, 10) === value ? date : new Date(NaN);
}
export function calendarPeriod(year, month) {
  const startKey = `${year}-${String(month || 1).padStart(2, '0')}-01`;
  const nextYear = !month || month === 12 ? year + 1 : year;
  const nextMonth = !month || month === 12 ? 1 : month + 1;
  return { start: calendarDayStart(startKey), end: calendarDayStart(`${nextYear}-${String(nextMonth).padStart(2, '0')}-01`) };
}
export const overlapQuery = (start, end) => ({ startDate: { $lt: end }, endDate: { $gte: start } });
