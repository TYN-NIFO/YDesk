'use client';

import { useState } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '@/lib/store';
import { useGetLeavesQuery, useGetLeavesByDateRangeQuery, useDeleteLeaveMutation, useGetHolidaysQuery } from '@/lib/api';
import LeaveForm from './LeaveForm';
import TeamLeaveCalendar from './TeamLeaveCalendar';
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
  const [page, setPage] = useState(1);
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const [viewMode, setViewMode] = useState<ViewMode>(forceView || 'calendar');
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [showForm, setShowForm] = useState(false);
  const [editingLeave, setEditingLeave] = useState<any>(null);

  const handlePrevMonth = () => {
    setPage(1);
    if (selectedMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear(selectedYear - 1);
    } else {
      setSelectedMonth(selectedMonth - 1);
    }
  };

  const handleNextMonth = () => {
    setPage(1);
    if (selectedMonth === 12) {
      setSelectedMonth(1);
      setSelectedYear(selectedYear + 1);
    } else {
      setSelectedMonth(selectedMonth + 1);
    }
  };

  // Fetch leaves for list view (month-specific)
  const { data: monthlyData, isLoading: monthlyLoading, error: monthlyError, refetch: refetchMonthly } = useGetLeavesQuery({
    page, limit: 20,
    year: selectedYear,
    month: selectedMonth
  });

  // Fetch leaves for calendar view (month range)
  const calendarFirstDay = new Date(selectedYear, selectedMonth - 1, 1);
  const calendarLastDay = new Date(selectedYear, selectedMonth, 0);
  const { data: calendarData, isLoading: calendarLoading, error: calendarError, refetch: refetchCalendar } = useGetLeavesByDateRangeQuery({
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
              <p className="ui-kpi-label">Approved leave days ({selectedYear})</p>
              <p className="ui-kpi-value">{yearSummary.totalLeaveDays}</p>
            </div>
          </div>

          <div className="ui-kpi-card">
            <span className="ui-kpi-icon bg-green-100 text-green-600"><Calendar size={18} /></span>
            <div className="ui-kpi-body">
              <p className="ui-kpi-label">Approved WFH days</p>
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
              <p className="ui-kpi-value">{monthlyData?.pagination?.total || 0}</p>
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
                aria-pressed={viewMode === 'calendar'}
                onClick={() => setViewMode('calendar')}
                className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${viewMode === 'calendar'
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-500 hover:text-gray-700'
                  }`}
              >
                <Calendar className="h-4 w-4 mr-2" />
                Team calendar
              </button>
              <button type="button" onClick={() => setViewMode('list')} aria-pressed={viewMode === 'list'} className={`ui-button ${viewMode === 'list' ? 'ui-button-primary' : 'ui-button-secondary'}`}><List size={16} />My requests</button>
            </div>
          )}
        </div>

        <div className="flex items-center space-x-2 mt-4 sm:mt-0">
          <select
            aria-label="Request month"
            value={selectedMonth}
            onChange={(e) => (setPage(1), setSelectedMonth(parseInt(e.target.value)))}
            className="ui-control border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {new Date(0, i).toLocaleDateString('en-US', { month: 'long' })}
              </option>
            ))}
          </select>

          <select
            aria-label="Request year"
            value={selectedYear}
            onChange={(e) => (setPage(1), setSelectedYear(parseInt(e.target.value)))}
            className="ui-control border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            {Array.from({ length: 11 }, (_, i) => currentYear - 5 + i).map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </div>
      </div>

      {viewMode === 'list' && (<div className="flex flex-wrap justify-between items-center gap-3 py-4" aria-label="Request pages"><span className="text-sm text-gray-600">Page {page} ? {monthlyData?.pagination?.total || 0} requests</span><div className="flex gap-2"><button className="ui-button ui-button-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><button className="ui-button ui-button-secondary" disabled={page >= (monthlyData?.pagination?.pages || 1)} onClick={() => setPage(page + 1)}>Next</button></div></div>)}
      {/* Content */}
      {(viewMode === 'calendar' ? calendarError : monthlyError) ? <div className="ui-empty" role="alert"><h3>Requests could not load</h3><p>Please try again.</p><button className="ui-button ui-button-secondary mt-3" onClick={() => viewMode === 'calendar' ? refetchCalendar() : refetchMonthly()}>Retry</button></div> : viewMode === 'calendar' ? (
        <TeamLeaveCalendar
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
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-3 mb-2">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getTypeColor(leave.type)}`}>
                      {leave.type}
                    </span>
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(leave.status)}`}>
                      {leave.status}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-sm text-gray-900">
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
