'use client';

import { useState } from 'react';
import { useGetLeaveAnalyticsQuery, useGetTodayLeavesQuery, useGetLeavesByDateRangeQuery, useGetHolidaysQuery } from '@/lib/api';
import LoadingSpinner from './LoadingSpinner';
import BulkLeaveUpload from './BulkLeaveUpload';
import { BarChart3, Briefcase, Calendar, ChevronLeft, ChevronRight, Clock, AlertCircle, Plane, RefreshCw, Users, List } from 'lucide-react';

const toLocalYmd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Icon + color per leave type, for the KPI-style breakdown tiles.
const LEAVE_TYPE_THEME: Record<string, { icon: typeof Calendar; bg: string; color: string }> = {
  'Planned Leave': { icon: Calendar, bg: 'bg-green-100', color: 'text-green-600' },
  'Unplanned Leave': { icon: AlertCircle, bg: 'bg-red-100', color: 'text-red-600' },
  Permission: { icon: Clock, bg: 'bg-yellow-100', color: 'text-yellow-600' },
  WFH: { icon: List, bg: 'bg-blue-100', color: 'text-blue-600' },
  'Business Trip': { icon: Plane, bg: 'bg-purple-100', color: 'text-purple-600' },
  OD: { icon: Briefcase, bg: 'bg-indigo-100', color: 'text-indigo-600' },
  Flexi: { icon: RefreshCw, bg: 'bg-pink-100', color: 'text-pink-600' },
};
const DEFAULT_LEAVE_TYPE_THEME = { icon: BarChart3, bg: 'bg-gray-100', color: 'text-gray-600' };

interface AnalyticsDashboardProps {
  userRole: string;
  userEmail: string;
}

export default function LeaveAnalyticsDashboard({ userRole, userEmail }: AnalyticsDashboardProps) {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [viewType, setViewType] = useState<'overview' | 'employees' | 'calendar'>('overview');

  const handlePrevMonth = () => {
    const activeMonth = selectedMonth || currentMonth;
    if (activeMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear(selectedYear - 1);
    } else {
      setSelectedMonth(activeMonth - 1);
    }
  };

  const handleNextMonth = () => {
    const activeMonth = selectedMonth || currentMonth;
    if (activeMonth === 12) {
      setSelectedMonth(1);
      setSelectedYear(selectedYear + 1);
    } else {
      setSelectedMonth(activeMonth + 1);
    }
  };

  const { data: analyticsData, isLoading: analyticsLoading } = useGetLeaveAnalyticsQuery({
    year: selectedYear,
    ...(selectedMonth && { month: selectedMonth })
  });

  const { data: todayData, isLoading: todayLoading } = useGetTodayLeavesQuery(undefined);

  // Precompute month range for calendar and fetch leaves once at top-level (hooks cannot be inside render functions)
  const calendarMonth = selectedMonth || new Date().getMonth() + 1;
  const calendarYear = selectedYear;
  const calendarFirstDay = new Date(calendarYear, calendarMonth - 1, 1);
  const calendarLastDay = new Date(calendarYear, calendarMonth, 0);
  const { data: leaveData, isLoading: leaveLoading } = useGetLeavesByDateRangeQuery({
    startDate: toLocalYmd(calendarFirstDay),
    endDate: toLocalYmd(calendarLastDay)
  });

  const { data: holidaysData, isLoading: holidaysLoading } = useGetHolidaysQuery({ year: calendarYear });

  // Check if user has access to analytics
  const hasAnalyticsAccess = userRole === 'executive' || userRole === 'admin';

  if (!hasAnalyticsAccess) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-400 mb-4">
          <svg className="mx-auto h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">Access Restricted</h3>
        <p className="text-gray-600">Only CTO and CEO can access organization analytics.</p>
      </div>
    );
  }

  if (analyticsLoading) {
    return (
      <div className="flex justify-center items-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  const summary = analyticsData?.summary;
  const allEmployees = summary?.employeeSummaries || [];

  // Filter out specific employee types
  const excludedEmployees = ['test@theyellow.network', 'admin@theyellow.network', 'finance@theyellow.network'];
  const employees = allEmployees.filter((emp: any) =>
    !excludedEmployees.includes(emp.employee.email)
  );

  const allTodayEmployees = todayData?.employees || [];
  const todayEmployees = allTodayEmployees.filter((emp: any) =>
    !excludedEmployees.includes(emp.employee.email)
  );

  const getLeaderboardData = () => {
    return {
      topLeaveTakers: [...employees]
        .sort((a, b) => b.totalLeaveDays - a.totalLeaveDays)
        .slice(0, 10),
      mostWFH: [...employees]
        .sort((a, b) => b.wfhDays - a.wfhDays)
        .slice(0, 10),
      unplannedRatio: [...employees]
        .filter(emp => emp.totalLeaveDays > 0)
        .map(emp => ({
          ...emp,
          unplannedRatio: emp.totalLeaveDays > 0 ? (emp.unplannedLeaveDays / emp.totalLeaveDays) * 100 : 0
        }))
        .sort((a, b) => b.unplannedRatio - a.unplannedRatio)
        .slice(0, 10)
    };
  };

  const renderOverview = () => {
    if (!summary) return null;

    const leaderboard = getLeaderboardData();

    // Type-wise counts for cards
    const plannedDays = (summary.leavesByType['Planned Leave'] as number) || 0;
    const unplannedDays = (summary.leavesByType['Unplanned Leave'] as number) || 0;
    const wfhDays = (summary.leavesByType['WFH'] as number) || 0;
    const permissionDays = (summary.leavesByType['Permission'] as number) || 0;
    const businessTripDays = (summary.leavesByType['Business Trip'] as number) || 0;
    const odDays = (summary.leavesByType['OD'] as number) || 0;
    const flexiDays = (summary.leavesByType['Flexi'] as number) || 0;

    return (
      <div className="space-y-6">
        {/* Summary Cards */}
        <div className="ui-kpi-grid">
          <div className="ui-kpi-card">
            <span className="ui-kpi-icon bg-blue-100 text-blue-600"><Users size={18} /></span>
            <div className="ui-kpi-body">
              <p className="ui-kpi-label">Total Employees</p>
              <p className="ui-kpi-value">{employees.length}</p>
            </div>
          </div>

          <div className="ui-kpi-card">
            <span className="ui-kpi-icon bg-green-100 text-green-600"><Calendar size={18} /></span>
            <div className="ui-kpi-body">
              <p className="ui-kpi-label">Total Leave Days</p>
              <p className="ui-kpi-value">{summary.totalLeaveDays.toFixed(1)}</p>
            </div>
          </div>

          <div className="ui-kpi-card">
            <span className="ui-kpi-icon bg-yellow-100 text-yellow-600"><Clock size={18} /></span>
            <div className="ui-kpi-body">
              <p className="ui-kpi-label">Employees on Leave</p>
              <p className="ui-kpi-value">{summary.employeesOnLeave}</p>
            </div>
          </div>

          <div className="ui-kpi-card">
            <span className="ui-kpi-icon bg-purple-100 text-purple-600"><BarChart3 size={18} /></span>
            <div className="ui-kpi-body">
              <p className="ui-kpi-label">Avg. Leave per Employee</p>
              <p className="ui-kpi-value">
                {employees.length > 0 ? (summary.totalLeaveDays / employees.length).toFixed(1) : '0.0'}
              </p>
            </div>
          </div>
        </div>

        {/* Leave Breakdown Cards */}
        <div className="ui-kpi-grid">
          {([
            ['Planned Leave', plannedDays],
            ['Unplanned Leave', unplannedDays],
            ['Permission', permissionDays],
            ['WFH', wfhDays],
            ['Business Trip', businessTripDays],
            ['OD', odDays],
            ['Flexi', flexiDays],
          ] as [string, number][]).map(([label, value]) => {
            const theme = LEAVE_TYPE_THEME[label] || DEFAULT_LEAVE_TYPE_THEME;
            return (
              <div key={label} className="ui-kpi-card">
                <span className={`ui-kpi-icon ${theme.bg} ${theme.color}`}><theme.icon size={18} /></span>
                <div className="ui-kpi-body">
                  <p className="ui-kpi-label">{label}</p>
                  <p className="ui-kpi-value">{value.toFixed(1)}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Today's Status */}
        <div className="ui-panel bg-white p-6 rounded-lg shadow border border-gray-200">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Today's Leave Status</h3>
          {todayLoading ? (
            <div className="flex justify-center py-4">
              <LoadingSpinner />
            </div>
          ) : todayEmployees.length === 0 ? (
            <p className="text-gray-600">No employees on leave today.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {todayEmployees.map((emp: any, index: number) => (
                <div key={index} className="ui-detail-summary flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                  <div className="flex-shrink-0">
                    <div className="h-8 w-8 rounded-full bg-gray-300 flex items-center justify-center">
                      <span className="text-xs font-medium text-gray-700">
                        {emp.employee.name.split(' ').map((n: string) => n[0]).join('').toUpperCase()}
                      </span>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{emp.employee.name}</p>
                    <div className="flex items-center space-x-2">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${emp.leaveType === 'Planned Leave' ? 'bg-green-100 text-green-800' :
                        emp.leaveType === 'Unplanned Leave' ? 'bg-red-100 text-red-800' :
                          emp.leaveType === 'WFH' ? 'bg-blue-100 text-blue-800' :
                            'bg-gray-100 text-gray-800'
                        }`}>
                        {emp.leaveType}
                      </span>
                      {emp.hours && <span className="text-xs text-gray-500">{emp.hours}h</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Removed distribution and leaderboard sections per request */}
      </div>
    );
  };

  const renderEmployees = () => {
    if (!summary) return null;

    return (
      <div className="ui-panel bg-white shadow overflow-hidden sm:rounded-md">
        <div className="px-4 py-5 sm:px-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900">Employee Leave Summary</h3>
          <p className="mt-1 text-sm text-gray-500">
            {selectedMonth ? `${selectedYear}-${String(selectedMonth).padStart(2, '0')}` : selectedYear} leave statistics by employee
          </p>
        </div>
        <ul className="divide-y divide-gray-200">
          {employees.map((emp: any) => (
            <li key={emp.employee.id} className="px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-3">
                    <div className="flex-shrink-0">
                      <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
                        <span className="text-sm font-medium text-gray-700">
                          {emp.employee.name.split(' ').map((n: string) => n[0]).join('').toUpperCase()}
                        </span>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{emp.employee.name}</p>
                      <p className="text-sm text-gray-500">{emp.employee.email}</p>
                      <p className="text-sm text-gray-500">{emp.employee.department || 'No department'}</p>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-900 ml-6">
                  <div className="text-center">
                    <div className="font-semibold">{Number(emp.totalLeaveDays).toFixed(2)}</div>
                    <div className="text-xs text-gray-500">Total Leave</div>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold">{Number(emp.plannedLeaveDays || 0).toFixed(2)}</div>
                    <div className="text-xs text-gray-500">Planned</div>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold text-red-600">{Number(emp.unplannedLeaveDays || 0).toFixed(2)}</div>
                    <div className="text-xs text-gray-500">Unplanned</div>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold">{Number(emp.permissionHours || 0).toFixed(1)}</div>
                    <div className="text-xs text-gray-500">Permission hrs</div>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold">{Number(emp.wfhDays || 0).toFixed(2)}</div>
                    <div className="text-xs text-gray-500">WFH</div>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold">{Number(emp.businessTripDays || 0).toFixed(2)}</div>
                    <div className="text-xs text-gray-500">Business Trip</div>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold">{Number(emp.odDays || 0).toFixed(2)}</div>
                    <div className="text-xs text-gray-500">OD</div>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold">{Number(emp.flexiDays || 0).toFixed(2)}</div>
                    <div className="text-xs text-gray-500">Flexi</div>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  const renderCalendar = () => {
    // Generate calendar data for the selected month/year
    const month = selectedMonth || new Date().getMonth() + 1;
    const year = selectedYear;
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay()); // Start from Sunday

    const calendarDays = [];
    const currentDate = new Date(startDate);

    while (currentDate <= lastDay || calendarDays.length < 42) { // 6 weeks * 7 days
      calendarDays.push(new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }

    const getLeaveDataForDate = (date: Date) => {
      if (!leaveData?.leaves) return [];

      const localDateStr = toLocalYmd(date);
      return leaveData.leaves.filter((leave: any) => {
        const leaveStartStr = (leave.startDate || '').split('T')[0];
        const leaveEndStr = (leave.endDate || leave.startDate || '').split('T')[0];
        return localDateStr >= leaveStartStr && localDateStr <= leaveEndStr;
      }).map((leave: any) => ({
        date: leave.startDate,
        employee: leave.employee?.name || leave.employeeEmail,
        email: leave.employeeEmail,
        type: leave.leaveType,
        reason: leave.reason,
        hours: leave.hours || 8
      }));
    };

    const getHolidayDataForDate = (date: Date) => {
      if (!holidaysData) return [];

      const localDateStr = toLocalYmd(date);
      return holidaysData.filter((holiday: any) => {
        const holidayDateStr = (holiday.date || '').split('T')[0];
        return holidayDateStr === localDateStr;
      }).map((holiday: any) => ({
        date: holiday.date,
        name: holiday.name,
        isFlexi: holiday.isFlexi,
        isHoliday: true
      }));
    };

    const getLeaveTypeColor = (type: string) => {
      switch (type) {
        case 'Planned Leave': return 'bg-green-100 text-green-800';
        case 'Unplanned Leave': return 'bg-red-100 text-red-800';
        case 'WFH': return 'bg-blue-100 text-blue-800';
        case 'Permission': return 'bg-yellow-100 text-yellow-800';
        case 'Business Trip': return 'bg-purple-100 text-purple-800';
        case 'OD': return 'bg-indigo-100 text-indigo-800';
        case 'Flexi': return 'bg-pink-100 text-pink-800';
        default: return 'bg-gray-100 text-gray-800';
      }
    };

    return (
      <div className="ui-panel bg-white shadow overflow-hidden sm:rounded-lg">
        <div className="px-4 py-5 sm:px-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900">Leave Calendar</h3>
          <p className="mt-1 text-sm text-gray-500">
            {new Date(year, month - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} leave calendar
          </p>
          {leaveLoading && (
            <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded">
              <p className="text-xs text-blue-800">Loading leave data...</p>
            </div>
          )}
        </div>

        <div className="px-4 pb-4">
          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-1">
            {/* Day Headers */}
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="p-2 text-center text-sm font-medium text-gray-500 bg-gray-50">
                {day}
              </div>
            ))}

            {/* Calendar Days */}
            {calendarDays.map((date, index) => {
              const isCurrentMonth = date.getMonth() === month - 1;
              const isToday = date.toDateString() === new Date().toDateString();
              const leaveData = getLeaveDataForDate(date);
              const holidayData = getHolidayDataForDate(date);

              const holiday = holidayData.length > 0 ? holidayData[0] : null;
              let cellBg = isCurrentMonth ? 'bg-white' : 'bg-gray-50';
              if (holiday) {
                cellBg = holiday.isFlexi ? 'bg-pink-50 border-pink-200' : 'bg-indigo-50 border-indigo-200';
              }

              return (
                <div
                  key={index}
                  className={`min-h-[80px] p-1 border ${cellBg} ${isToday ? 'ring-2 ring-blue-500' : 'border-gray-200'}`}
                >
                  <div className={`text-xs p-1 flex justify-between items-start ${isCurrentMonth ? (holiday ? 'text-gray-900 font-medium' : 'text-gray-900') : 'text-gray-400'} ${isToday ? 'font-bold' : ''}`}>
                    {holiday ? (
                      <div className={`font-semibold truncate ${holiday.isFlexi ? 'text-pink-800' : 'text-indigo-800'}`}>
                        {holiday.name}
                      </div>
                    ) : <div />}
                    <span>{date.getDate()}</span>
                  </div>
                  {holiday && holiday.isFlexi && (
                    <div className="px-1 mb-1">
                      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-pink-100 text-pink-800 shadow-sm">
                        Flexi
                      </span>
                    </div>
                  )}

                  {/* Leave Indicators */}
                  <div className="space-y-1">
                    {leaveData.map((leave: any, leaveIndex: number) => (
                      <div
                        key={leaveIndex}
                        className={`text-xs p-1 rounded truncate ${getLeaveTypeColor(leave.type)}`}
                        title={`${leave.employee} - ${leave.type}${leave.reason ? ` - ${leave.reason}` : ''}`}
                      >
                        <div className="font-medium truncate">{leave.employee.split(' ')[0]}</div>
                        <div className="text-xs opacity-75">{leave.type}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="mt-4 flex flex-wrap gap-2">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-green-100 border border-green-300 rounded"></div>
              <span className="text-xs text-gray-600">Planned Leave</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-red-100 border border-red-300 rounded"></div>
              <span className="text-xs text-gray-600">Unplanned Leave</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-blue-100 border border-blue-300 rounded"></div>
              <span className="text-xs text-gray-600">WFH</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-yellow-100 border border-yellow-300 rounded"></div>
              <span className="text-xs text-gray-600">Permission</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-purple-100 border border-purple-300 rounded"></div>
              <span className="text-xs text-gray-600">Business Trip</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-indigo-100 border border-indigo-300 rounded"></div>
              <span className="text-xs text-gray-600">OD</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-pink-100 border border-pink-300 rounded"></div>
              <span className="text-xs text-gray-600">Flexi</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-indigo-50 border border-indigo-200 rounded"></div>
              <span className="text-xs text-gray-600 font-medium">Holiday</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-pink-50 border border-pink-200 rounded"></div>
              <span className="text-xs text-gray-600 font-medium">Flexi Holiday</span>
            </div>
          </div>

          {/* Leave Summary for Selected Period */}
          {leaveData?.leaves && leaveData.leaves.length > 0 && (
            <div className="ui-detail-summary mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <h4 className="text-sm font-medium text-gray-900 mb-3">
                Leave Summary for {new Date(year, month - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {leaveData.leaves.slice(0, 9).map((leave: any, index: number) => (
                  <div key={index} className="text-xs bg-white p-2 rounded border">
                    <div className="font-medium text-gray-900">{leave.employee?.name || leave.employeeEmail}</div>
                    <div className="text-gray-600">{leave.leaveType}</div>
                    <div className="text-xs text-gray-500">{leave.startDate}</div>
                    <div className="text-xs text-gray-500 italic">{leave.reason}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Leave Analytics Dashboard</h2>
        <div className="mt-4 sm:mt-0 flex items-center space-x-2">
          {/* Bulk Upload Button */}
          <BulkLeaveUpload onUploadComplete={() => {
            // Refresh the analytics data
            window.location.reload();
          }} />

          <BulkLeaveUpload onUploadComplete={() => {
            // Refresh the analytics data
            window.location.reload();
          }} />

          {/* Month Selector */}
          <select
            value={selectedMonth || ''}
            onChange={(e) => setSelectedMonth(e.target.value ? parseInt(e.target.value) : null)}
            className="ui-control border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-blue-500 bg-white"
          >
            <option value="">All Year</option>
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {new Date(0, i).toLocaleDateString('en-US', { month: 'long' })}
              </option>
            ))}
          </select>

          {/* Year Selector */}
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            className="ui-control border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            {Array.from({ length: 11 }, (_, i) => currentYear - 5 + i).map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </div>
      </div>

      {/* View Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {[
            { key: 'overview', label: 'Overview' },
            { key: 'employees', label: 'Employees' },
            { key: 'calendar', label: 'Calendar' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setViewType(tab.key as any)}
              className={`ui-tab ${`py-2 px-1 border-b-2 font-medium text-sm ${viewType === tab.key
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      {viewType === 'overview' && renderOverview()}
      {viewType === 'employees' && renderEmployees()}
      {viewType === 'calendar' && renderCalendar()}
    </div >
  );
}
