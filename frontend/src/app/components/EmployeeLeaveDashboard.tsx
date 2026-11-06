'use client';

import { useState } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '@/lib/store';
import { useGetLeavesQuery, useGetLeavesByDateRangeQuery, useDeleteLeaveMutation, useGetHolidaysQuery } from '@/lib/api';
import LeaveForm from './LeaveForm';
import LoadingSpinner from './LoadingSpinner';
import { Calendar, List, Plus, Edit, Trash2, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';

const toLocalYmd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

interface EmployeeLeaveDashboardProps {
  userId?: string;
  forceView?: 'calendar' | 'list';
}

type ViewMode = 'calendar' | 'list';

export default function EmployeeLeaveDashboard({ userId, forceView }: EmployeeLeaveDashboardProps) {
  const { user } = useSelector((state: RootState) => state.auth);
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const [viewMode, setViewMode] = useState<ViewMode>(forceView || 'calendar');
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [showForm, setShowForm] = useState(false);
  const [editingLeave, setEditingLeave] = useState<any>(null);

  const handlePrevMonth = () => {
    if (selectedMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear(selectedYear - 1);
    } else {
      setSelectedMonth(selectedMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedMonth(1);
      setSelectedYear(selectedYear + 1);
    } else {
      setSelectedMonth(selectedMonth + 1);
    }
  };

  // Fetch leaves for list view (month-specific)
  const { data: monthlyData, isLoading: monthlyLoading, refetch: refetchMonthly } = useGetLeavesQuery({
    year: selectedYear,
    month: selectedMonth
  });

  // Fetch leaves for calendar view (month range)
  const calendarFirstDay = new Date(selectedYear, selectedMonth - 1, 1);
  const calendarLastDay = new Date(selectedYear, selectedMonth, 0);
  const { data: calendarData, isLoading: calendarLoading } = useGetLeavesByDateRangeQuery({
    startDate: toLocalYmd(calendarFirstDay),
    endDate: toLocalYmd(calendarLastDay)
  });

  // Fetch holidays for the year
  const { data: holidays = [], isLoading: holidaysLoading } = useGetHolidaysQuery({ year: selectedYear });

  // Fetch year summary for statistics
  const { data: yearData } = useGetLeavesQuery({ year: selectedYear });

  const [deleteLeave, { isLoading: isDeleting }] = useDeleteLeaveMutation();

  const monthlyLeaves = monthlyData?.leaves || [];
  const calendarLeaves = calendarData?.leaves || [];
  const yearSummary = yearData?.yearSummary;

  const handleDelete = async (leaveId: string) => {
    if (!window.confirm('Are you sure you want to delete this leave request?')) {
      return;
    }

    try {
      await deleteLeave(leaveId).unwrap();
      toast.success('Leave request deleted successfully');
      refetchMonthly();
    } catch (error: any) {
      console.error('Delete error:', error);
      toast.error(error?.data?.error || error?.data?.message || 'Failed to delete leave request');
    }
  };

  const handleEdit = (leave: any) => {
    setEditingLeave(leave);
    setShowForm(true);
  };

  const handleFormSuccess = () => {
    setShowForm(false);
    setEditingLeave(null);
    refetchMonthly();
  };

  const handleFormCancel = () => {
    setShowForm(false);
    setEditingLeave(null);
  };

  if (showForm) {
    return (
      <LeaveForm
        initialData={editingLeave}
        mode={editingLeave ? 'edit' : 'create'}
        onSuccess={handleFormSuccess}
        onCancel={handleFormCancel}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Leave Dashboard</h2>
          <p className="text-sm text-gray-600 mt-1">
            Manage your leave requests and view your leave calendar
          </p>
        </div>

        <div className="mt-4 sm:mt-0 flex items-center space-x-3">
          <button
            onClick={() => setShowForm(true)}
            className="ui-button ui-button-primary flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4 mr-2" />
            Request Leave
          </button>
        </div>
      </div>

      {/* Year Summary Cards */}
      {yearSummary && (
        <div className="ui-kpi-grid">
          <div className="ui-kpi-card">
            <span className="ui-kpi-icon bg-blue-100 text-blue-600"><Calendar size={18} /></span>
            <div className="ui-kpi-body">
              <p className="ui-kpi-label">Total Leave Days ({selectedYear})</p>
              <p className="ui-kpi-value">{yearSummary.totalLeaveDays}</p>
            </div>
          </div>

          <div className="ui-kpi-card">
            <span className="ui-kpi-icon bg-green-100 text-green-600"><Calendar size={18} /></span>
            <div className="ui-kpi-body">
              <p className="ui-kpi-label">WFH Days</p>
              <p className="ui-kpi-value">{yearSummary.wfhDays}</p>
            </div>
          </div>

          <div className="ui-kpi-card">
            <span className="ui-kpi-icon bg-yellow-100 text-yellow-600"><Calendar size={18} /></span>
            <div className="ui-kpi-body">
              <p className="ui-kpi-label">Permission Hours</p>
              <p className="ui-kpi-value">{yearSummary.permissionHours}</p>
            </div>
          </div>

          <div className="ui-kpi-card">
            <span className="ui-kpi-icon bg-purple-100 text-purple-600"><List size={18} /></span>
            <div className="ui-kpi-body">
              <p className="ui-kpi-label">Total Requests</p>
              <p className="ui-kpi-value">{monthlyLeaves.length}</p>
            </div>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="ui-panel flex flex-col sm:flex-row sm:items-center sm:justify-between bg-white p-4 rounded-lg shadow border border-gray-200">
        <div className="flex items-center space-x-4">
          {/* View Mode Toggle */}
          {!forceView && (
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setViewMode('calendar')}
                className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${viewMode === 'calendar'
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-500 hover:text-gray-700'
                  }`}
              >
                <Calendar className="h-4 w-4 mr-2" />
                Calendar
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center space-x-2 mt-4 sm:mt-0">
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
            className="ui-control border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {new Date(0, i).toLocaleDateString('en-US', { month: 'long' })}
              </option>
            ))}
          </select>

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

      {/* Content */}
      {viewMode === 'calendar' ? (
        <EmployeeCalendarView
          year={selectedYear}
          month={selectedMonth}
          leaves={calendarLeaves}
          holidays={holidays}
          isLoading={calendarLoading || holidaysLoading}
          currentUser={user}
          onPrevMonth={handlePrevMonth}
          onNextMonth={handleNextMonth}
        />
      ) : (
        <EmployeeListView
          year={selectedYear}
          month={selectedMonth}
          leaves={monthlyLeaves}
          isLoading={monthlyLoading}
          onEdit={handleEdit}
          onDelete={handleDelete}
          isDeleting={isDeleting}
        />
      )}
    </div>
  );
}

// Calendar View Component
interface EmployeeCalendarViewProps {
  year: number;
  month: number;
  leaves: any[];
  holidays: any[];
  isLoading: boolean;
  currentUser: any;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}

function EmployeeCalendarView({ year, month, leaves, holidays, isLoading, currentUser, onPrevMonth, onNextMonth }: EmployeeCalendarViewProps) {
  // Generate calendar data
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
    const dateStr = toLocalYmd(date);
    return leaves.filter((leave: any) => {
      const leaveStart = new Date(leave.startDate);
      const leaveEnd = new Date(leave.endDate);
      const currentDate = new Date(dateStr);

      // Check if the current date falls within the leave period (inclusive)
      return currentDate >= leaveStart && currentDate <= leaveEnd;
    });
  };

  const getHolidayDataForDate = (date: Date) => {
    const dateStr = toLocalYmd(date);
    return holidays.filter((holiday: any) => {
      if (!holiday.date) return false;
      const holidayDateStr = new Date(holiday.date).toISOString().split('T')[0];
      return dateStr === holidayDateStr;
    });
  };

  const getLeaveTypeColor = (type: string) => {
    switch (type) {
      case 'Planned Leave': return 'bg-green-100 text-green-800 border-green-200';
      case 'Unplanned Leave': return 'bg-red-100 text-red-800 border-red-200';
      case 'WFH': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'Permission': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'Business Trip': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'OD': return 'bg-indigo-100 text-indigo-800 border-indigo-200';
      case 'Flexi': return 'bg-pink-100 text-pink-800 border-pink-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  if (isLoading) {
    return (
      <div className="ui-panel bg-white rounded-lg shadow p-6">
        <div className="flex justify-center items-center py-12">
          <LoadingSpinner />
        </div>
      </div>
    );
  }

  return (
    <div className="ui-panel bg-white shadow overflow-hidden sm:rounded-lg">
      <div className="px-4 py-5 sm:px-6">
        <h3 className="text-lg leading-6 font-medium text-gray-900 flex items-center space-x-2">
          <button
            onClick={onPrevMonth}
            className="ui-button ui-button-secondary p-1 hover:bg-gray-100 rounded-full transition-colors"
            title="Previous Month"
          >
            <ChevronLeft className="h-5 w-5 text-gray-600" />
          </button>
          <span>{new Date(year, month - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
          <button
            onClick={onNextMonth}
            className="ui-button ui-button-secondary p-1 hover:bg-gray-100 rounded-full transition-colors"
            title="Next Month"
          >
            <ChevronRight className="h-5 w-5 text-gray-600" />
          </button>
        </h3>
        <p className="mt-1 text-sm text-gray-500">
          See who's on leave across the team
        </p>
        <div className="mt-2 flex items-center space-x-4 text-xs text-gray-600">
          <div className="flex items-center space-x-1">
            <div className="w-3 h-3 bg-blue-100 border border-blue-400 rounded"></div>
            <span>Your leaves (highlighted with blue ring)</span>
          </div>
          <div className="flex items-center space-x-1">
            <div className="w-3 h-3 bg-gray-100 border border-gray-300 rounded"></div>
            <span>Team members' leaves</span>
          </div>
        </div>
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
            const hasHoliday = holidayData.length > 0;
            const firstHoliday = hasHoliday ? holidayData[0] : null;

            return (
              <div
                key={index}
                className={`min-h-[100px] flex flex-col border border-gray-200 ${isCurrentMonth
                  ? hasHoliday
                    ? firstHoliday?.isFlexi ? 'bg-pink-50' : 'bg-indigo-50'
                    : 'bg-white'
                  : 'bg-gray-50'
                  } ${isToday ? 'ring-2 ring-blue-500' : ''}`}
                title={firstHoliday ? firstHoliday.name : ''}
              >
                <div className={`text-xs p-1 text-right ${isCurrentMonth ? 'text-gray-900' : 'text-gray-400'
                  } ${isToday ? 'font-bold' : ''}`}>
                  {date.getDate()}
                </div>

                <div className="flex-1 p-1 space-y-1 overflow-y-auto">
                  {/* Holiday Indicator inside calendar cell */}
                  {holidayData.map((holiday: any, holidayIndex: number) => (
                    <div
                      key={`holiday-${holidayIndex}`}
                      className={`text-xs p-1 rounded font-medium border ${holiday.isFlexi
                        ? 'bg-pink-100 text-pink-800 border-pink-200'
                        : 'bg-indigo-100 text-indigo-800 border-indigo-200'
                        }`}
                      title={holiday.name}
                    >
                      <div className="flex items-center justify-between">
                        <span className="truncate flex-1 font-bold">{holiday.name}</span>
                        {holiday.isFlexi && <span className="ml-1 bg-pink-100 text-pink-700 py-0 text-[10px] px-1 rounded-full border border-pink-200">Flexi</span>}
                      </div>
                    </div>
                  ))}

                  {/* Leave Indicators */}
                  {leaveData.slice(0, 11).map((leave: any, leaveIndex: number) => {
                    const isCurrentUser = leave.employeeEmail === currentUser?.email;
                    const isPending = leave.status === 'submitted';
                    const isRejected = leave.status === 'rejected';
                    return (
                      <div
                        key={leaveIndex}
                        className={`text-xs p-1 rounded border ${getLeaveTypeColor(leave.leaveType)} ${isCurrentUser ? 'ring-1 ring-blue-400' : ''
                          } ${isPending ? 'opacity-60 border-dashed' : ''} ${isRejected ? 'opacity-40 line-through' : ''}`}
                        title={`${leave.employee?.name || leave.employeeEmail} - ${leave.leaveType}${leave.reason ? ` - ${leave.reason}` : ''} (${leave.status})`}
                      >
                        <div className="font-medium truncate flex items-center justify-between relative">
                          <div className="flex items-center">
                            {isPending && <div className="w-1.5 h-1.5 rounded-full bg-red-500 mr-1.5 flex-shrink-0" title="Pending Approval"></div>}
                            <span>{isCurrentUser ? 'Me' : (leave.employee?.name || leave.employeeEmail).split(' ')[0]}</span>
                          </div>
                          <div className="flex items-center">
                            {isPending && <span className="text-[10px] ml-1 opacity-70">Pending</span>}
                            {isRejected && <span className="text-[10px] ml-1">❌</span>}
                          </div>
                        </div>
                        <div className="text-xs opacity-75 ml-3">{leave.leaveType}</div>
                      </div>
                    );
                  })}
                  {leaveData.length > (11 - holidayData.length) && (
                    <div className="text-xs p-1 bg-gray-100 text-gray-600 rounded text-center">
                      +{leaveData.length - (11 - holidayData.length)} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-4 space-y-2">
          <div className="flex flex-wrap gap-2">
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
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-gray-500 border-t pt-2">
            <div className="flex items-center space-x-1">
              <span>⏳</span>
              <span>Pending approval (dashed border)</span>
            </div>
            <div className="flex items-center space-x-1">
              <span>❌</span>
              <span>Rejected (strikethrough)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// List View Component
interface EmployeeListViewProps {
  year: number;
  month: number;
  leaves: any[];
  isLoading: boolean;
  onEdit: (leave: any) => void;
  onDelete: (leaveId: string) => void;
  isDeleting: boolean;
}

function EmployeeListView({ year, month, leaves, isLoading, onEdit, onDelete, isDeleting }: EmployeeListViewProps) {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  };

  const formatDateRange = (start: string, end: string) => {
    const startDate = new Date(start);
    const endDate = new Date(end);

    if (startDate.toDateString() === endDate.toDateString()) {
      return formatDate(start);
    }

    return `${formatDate(start)} - ${formatDate(end)}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'bg-green-100 text-green-800';
      case 'rejected':
        return 'bg-red-100 text-red-800';
      case 'submitted':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'Planned Leave':
        return 'bg-green-100 text-green-800';
      case 'Unplanned Leave':
        return 'bg-red-100 text-red-800';
      case 'WFH':
        return 'bg-blue-100 text-blue-800';
      case 'Permission':
        return 'bg-yellow-100 text-yellow-800';
      case 'Business Trip':
        return 'bg-purple-100 text-purple-800';
      case 'OD':
        return 'bg-indigo-100 text-indigo-800';
      case 'Flexi':
        return 'bg-pink-100 text-pink-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const monthName = new Date(year, month - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // Calculate month-specific statistics
  const monthStats = {
    totalRequests: leaves.length,
    approvedRequests: leaves.filter((l: any) => l.status === 'approved').length,
    pendingRequests: leaves.filter((l: any) => l.status === 'submitted').length,
    rejectedRequests: leaves.filter((l: any) => l.status === 'rejected').length
  };

  if (isLoading) {
    return (
      <div className="ui-panel bg-white rounded-lg shadow p-6">
        <div className="flex justify-center items-center py-12">
          <LoadingSpinner />
        </div>
      </div>
    );
  }

  return (
    <div className="ui-panel bg-white shadow overflow-hidden sm:rounded-md">
      <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
        <h3 className="text-lg leading-6 font-medium text-gray-900">
          My Leave Requests - {monthName}
        </h3>
        <p className="mt-1 text-sm text-gray-500">
          {leaves.length} request(s) • {monthStats.approvedRequests} approved • {monthStats.pendingRequests} pending • {monthStats.rejectedRequests} rejected
        </p>
        <p className="mt-1 text-xs text-blue-600">
          Note: List view shows only your personal leave requests. Use Calendar view to see team leaves.
        </p>
      </div>

      {leaves.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-gray-400 mb-4">
            <Calendar className="mx-auto h-12 w-12" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Leave Requests</h3>
          <p className="text-gray-600 mb-4">You haven't submitted any leave requests for {monthName}.</p>
        </div>
      ) : (
        <ul className="divide-y divide-gray-200">
          {leaves.map((leave: any) => (
            <li key={leave._id} className="px-6 py-4 hover:bg-gray-50">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-3 mb-2">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getTypeColor(leave.type)}`}>
                      {leave.type}
                    </span>
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(leave.status)}`}>
                      {leave.status}
                    </span>
                  </div>

                  <div className="flex items-center space-x-4 text-sm text-gray-900">
                    <span className="font-medium">
                      {formatDateRange(leave.startDate, leave.endDate)}
                    </span>
                    {leave.type === 'Permission' && leave.hours && (
                      <span className="text-gray-600">
                        {leave.hours} hours
                      </span>
                    )}
                    <span className="text-gray-600">
                      Duration: {leave.durationInDays} day{leave.durationInDays > 1 ? 's' : ''}
                    </span>
                  </div>

                  {leave.reason && (
                    <p className="mt-1 text-sm text-gray-600">
                      Reason: {leave.reason}
                    </p>
                  )}

                  {leave.approval?.notes && leave.status !== 'submitted' && (
                    <p className="mt-1 text-sm text-gray-600">
                      {leave.status === 'approved' ? 'Approval notes' : 'Rejection reason'}: {leave.approval.notes}
                    </p>
                  )}

                  {leave.approval?.approvedAt && (
                    <p className="mt-1 text-xs text-gray-500">
                      {leave.status === 'approved' ? 'Approved' : 'Rejected'} on{' '}
                      {new Date(leave.approval.approvedAt).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </p>
                  )}
                </div>

                {leave.status === 'submitted' && (
                  <div className="flex-shrink-0 flex space-x-2">
                    <button
                      onClick={() => onEdit(leave)}
                      className="flex items-center px-3 py-1 text-blue-600 hover:text-blue-800 text-sm font-medium border border-blue-200 rounded-md hover:bg-blue-50 transition-colors"
                    >
                      <Edit className="h-3 w-3 mr-1" />
                      Edit
                    </button>
                    <button
                      onClick={() => onDelete(leave._id)}
                      disabled={isDeleting}
                      className="ui-button ui-button-secondary flex items-center px-3 py-1 text-red-600 hover:text-red-800 text-sm font-medium border border-red-200 rounded-md hover:bg-red-50 transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
