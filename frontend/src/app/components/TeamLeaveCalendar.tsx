'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import LoadingSpinner from './LoadingSpinner';

interface CalendarLeave {
  id?: string; _id?: string; employee?: { name?: string }; employeeEmail?: string;
  leaveType?: string; type?: string; startDate: string; endDate: string;
  status: string; hours?: number; isFullDay?: boolean;
}
interface CalendarHoliday { _id?: string; date: string; name: string; isFlexi?: boolean }
interface Props {
  year: number; month: number; leaves: CalendarLeave[]; holidays: CalendarHoliday[]; isLoading: boolean;
  currentUser?: { email?: string } | null; onPrevMonth: () => void; onNextMonth: () => void;
}
// Attendance is recorded on the company calendar, irrespective of viewer timezone.
const dayKey = (value: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
const nameOf = (leave: CalendarLeave) => leave.employee?.name || leave.employeeEmail || 'Team member';
const typeOf = (leave: CalendarLeave) => leave.leaveType || leave.type;
const statusOf = (leave: CalendarLeave) => ({ submitted: 'Pending', approved: 'Approved', rejected: 'Rejected' }[String(leave.status)] || 'Unknown');

export default function TeamLeaveCalendar({ year, month, leaves, holidays, isLoading, currentUser, onPrevMonth, onNextMonth }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [scope, setScope] = useState('team');
  useEffect(() => setSelected(null), [year, month]);
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const last = new Date(year, month, 0).getDate();
  const keyFor = (day: number) => `${prefix}-${String(day).padStart(2, '0')}`;
  const filtered = leaves.filter(leave =>
    (status === 'all' || leave.status === status) &&
    (scope === 'team' || leave.employeeEmail === currentUser?.email) &&
    `${nameOf(leave)} ${typeOf(leave)}`.toLowerCase().includes(search.toLowerCase().trim()) &&
    dayKey(leave.startDate) <= keyFor(last) && dayKey(leave.endDate) >= keyFor(1)
  ).sort((a, b) => a.startDate.localeCompare(b.startDate) || nameOf(a).localeCompare(nameOf(b)));
  const onDay = (key: string) => filtered.filter(leave => dayKey(leave.startDate) <= key && dayKey(leave.endDate) >= key);
  const visible = selected ? onDay(selected) : filtered;
  const monthLabel = new Date(year, month - 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const dateLabel = (key: string) => new Date(`${key}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  const today = dayKey(new Date().toISOString());

  return <section className="ui-panel leave-calendar" aria-label="Team leave calendar">
    <div className="leave-calendar-heading"><div><h3>{monthLabel}</h3><p>Choose a day to see every request, or browse the whole month below.</p></div>
      <div className="leave-calendar-navigation"><button type="button" className="ui-icon-button" onClick={onPrevMonth} aria-label="Previous month"><ChevronLeft size={20} /></button><button type="button" className="ui-icon-button" onClick={onNextMonth} aria-label="Next month"><ChevronRight size={20} /></button></div>
    </div>
    <div className="leave-calendar-filters">
      <label className="leave-calendar-search"><Search size={18} aria-hidden="true" /><input className="ui-control" aria-label="Search team requests" placeholder="Search name or leave type" value={search} onChange={event => setSearch(event.target.value)} /></label>
      <select className="ui-control" aria-label="Request status" value={status} onChange={event => setStatus(event.target.value)}><option value="all">All statuses</option><option value="submitted">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select>
      {currentUser && <select className="ui-control" aria-label="Request owner" value={scope} onChange={event => setScope(event.target.value)}><option value="team">Whole team</option><option value="mine">My requests</option></select>}
    </div>
    {isLoading ? <div className="p-12 flex justify-center"><LoadingSpinner /></div> : <>
      <div className="leave-calendar-grid">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <div className="leave-weekday" key={day}>{day}</div>)}
        {Array.from({ length: new Date(year, month - 1, 1).getDay() }, (_, i) => <div className="leave-day-blank" key={`blank-${i}`} />)}
        {Array.from({ length: last }, (_, i) => {
          const key = keyFor(i + 1); const requests = onDay(key);
          const dayHolidays = holidays.filter(holiday => holiday.date && dayKey(holiday.date) === key);
          return <button key={key} type="button" className={`leave-day ${selected === key ? 'is-selected' : ''} ${key === today ? 'is-today' : ''}`} onClick={() => { setSelected(key); if (window.matchMedia('(max-width: 760px)').matches) requestAnimationFrame(() => document.getElementById('calendar-requests')?.scrollIntoView({ block: 'start' })); }} aria-pressed={selected === key} aria-label={`${dateLabel(key)}, ${requests.length} requests${dayHolidays.length ? ', ' + dayHolidays.map(h => h.name).join(', ') : ''}`} aria-controls="calendar-requests" aria-current={key === today ? 'date' : undefined}>
            <span className="leave-day-number">{i + 1}</span>
            {dayHolidays.map(holiday => <span key={holiday._id || holiday.name} className="leave-holiday">{holiday.name}</span>)}
            <span className="leave-day-preview">{requests.slice(0, 2).map((leave, index) => <span key={leave._id || index}>{nameOf(leave)}<small>{typeOf(leave)}</small></span>)}</span>
            {requests.length > 0 && <span className="leave-day-count">{requests.length}<span className="leave-count-label"> request{requests.length === 1 ? '' : 's'}{requests.length > 2 ? ' · View all' : ''}</span></span>}
          </button>;
        })}
      </div>
      <div id="calendar-requests" className="leave-request-section">
        <div className="leave-request-heading"><div><h3>{selected ? dateLabel(selected) : 'All requests this month'}</h3><p aria-live="polite">{visible.length} request{visible.length === 1 ? '' : 's'}{selected ? ' on this day' : ' matching your filters'}</p></div>{selected && <button type="button" className="ui-button ui-button-secondary" onClick={() => setSelected(null)}>Show whole month</button>}</div>
        {selected && holidays.filter(h => h.date && dayKey(h.date) === selected).map(h => <p className="ui-note mb-3" key={h._id || h.name}>{h.name}{h.isFlexi ? ' · Optional holiday' : ' · Holiday'}</p>)}
        {visible.length === 0 ? <div className="ui-empty"><h3>No matching requests</h3><p>Choose another day or adjust the filters to see more requests.</p></div> : <ul className="leave-request-list">{visible.map((leave, index) => <li key={leave._id || leave.id || index}>
          <div className="leave-request-person"><span className="account-avatar" aria-hidden="true">{nameOf(leave).slice(0, 2).toUpperCase()}</span><div><strong>{nameOf(leave)}{currentUser?.email === leave.employeeEmail ? ' (you)' : ''}</strong><p>{typeOf(leave)}</p></div></div>
          <div className="leave-request-dates">{dateLabel(dayKey(leave.startDate))}{dayKey(leave.startDate) !== dayKey(leave.endDate) && <> – {dateLabel(dayKey(leave.endDate))}</>}<small>{leave.hours ? `${leave.hours} hours` : leave.isFullDay === false ? 'Half day' : 'Full day'}</small></div>
          <span className={`status-badge status-${leave.status}`}>{statusOf(leave)}</span>
        </li>)}</ul>}
      </div>
    </>}
  </section>;
}
