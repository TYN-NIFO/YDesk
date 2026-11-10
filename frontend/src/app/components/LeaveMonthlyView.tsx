'use client';

import { useEffect, useState } from 'react';
import { useGetLeavesQuery, useDeleteLeaveMutation } from '@/lib/api';
import toast from 'react-hot-toast';
import LeaveForm from './LeaveForm';
import LoadingSpinner from './LoadingSpinner';
import { Calendar, List, Clock, CheckCircle } from 'lucide-react';

interface LeaveMonthlyViewProps {
  year?: number;
  month?: number;
  userId?: string;
  isCurrentUser?: boolean;
}

export default function LeaveMonthlyView({
  year = new Date().getFullYear(),
  month = new Date().getMonth() + 1,
  userId,
  isCurrentUser = true
}: LeaveMonthlyViewProps) {
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [year, month]);
  const { data, isLoading, error, refetch } = useGetLeavesQuery({ year, month, page, limit: 20 });
  const [deleteLeave, { isLoading: isDeleting }] = useDeleteLeaveMutation();
  const [editingLeave, setEditingLeave] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);

  const monthName = new Date(year, month - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const handleDelete = async (leaveId: string) => {
    if (!window.confirm('Are you sure you want to delete this leave request?')) {
      return;
    }

    try {
      await deleteLeave(leaveId).unwrap();
      toast.success('Leave request deleted successfully');
      refetch();
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
    refetch();
  };

  const handleFormCancel = () => {
    setShowForm(false);
    setEditingLeave(null);
  };

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

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-red-600 mb-4">
          <svg className="mx-auto h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">Error Loading Leaves</h3>
        <p className="text-gray-600 mb-4">There was an error loading your leave data.</p>
        <button
          onClick={() => refetch()}
          className="ui-button ui-button-primary bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  const leaves = data?.leaves || [];
  const yearSummary = data?.yearSummary;

  // Calculate month-specific statistics
  const monthStats = {
    totalRequests: leaves.length,
    approvedRequests: leaves.filter((l: any) => l.status === 'approved').length,
    pendingRequests: leaves.filter((l: any) => l.status === 'submitted').length,
    rejectedRequests: leaves.filter((l: any) => l.status === 'rejected').length
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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-gray-900">{monthName} - Leave Summary</h2>
        {isCurrentUser && (
          <button
            onClick={() => setShowForm(true)}
            className="ui-button ui-button-primary bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
          >
            Request Leave
          </button>
        )}
      </div>

      {/* KPI Cards */}
      {yearSummary && (
        <div className="ui-kpi-grid mb-6">
          <div className="ui-kpi-card">
            <span className="ui-kpi-icon bg-blue-100 text-blue-600"><Calendar size={18} /></span>
            <div className="ui-kpi-body">
              <p className="ui-kpi-label">Total Leave Days (YTD)</p>
              <p className="ui-kpi-value">{yearSummary.totalLeaveDays}</p>
            </div>
          </div>

          <div className="ui-kpi-card">
            <span className="ui-kpi-icon bg-green-100 text-green-600"><List size={18} /></span>
            <div className="ui-kpi-body">
              <p className="ui-kpi-label">WFH Days (YTD)</p>
              <p className="ui-kpi-value">{yearSummary.wfhDays}</p>
            </div>
          </div>

          <div className="ui-kpi-card">
            <span className="ui-kpi-icon bg-yellow-100 text-yellow-600"><Clock size={18} /></span>
            <div className="ui-kpi-body">
              <p className="ui-kpi-label">Permission Hours (YTD)</p>
              <p className="ui-kpi-value">{yearSummary.permissionHours}</p>
            </div>
          </div>

          <div className="ui-kpi-card">
            <span className="ui-kpi-icon bg-red-100 text-red-600"><CheckCircle size={18} /></span>
            <div className="ui-kpi-body">
              <p className="ui-kpi-label">Pending Requests</p>
              <p className="ui-kpi-value">{monthStats.pendingRequests}</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-sm text-gray-600">Page {page} ? {data?.pagination?.total || 0} requests</span><div className="flex gap-2"><button className="ui-button ui-button-secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button><button className="ui-button ui-button-secondary" disabled={page >= (data?.pagination?.pages || 1)} onClick={() => setPage(page + 1)}>Next</button></div></div>
      {/* Detailed Table */}
      <div className="ui-panel bg-white shadow overflow-hidden sm:rounded-md">
        <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
          <h3 className="text-lg leading-6 font-medium text-gray-900">
            Leave Requests for {monthName}
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            {leaves.length} request(s) • {monthStats.approvedRequests} approved • {monthStats.pendingRequests} pending • {monthStats.rejectedRequests} rejected
          </p>
        </div>

        {leaves.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-gray-400 mb-4">
              <svg className="mx-auto h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Leave Requests</h3>
            <p className="text-gray-600 mb-4">You haven't submitted any leave requests for {monthName}.</p>
            {isCurrentUser && (
              <button
                onClick={() => setShowForm(true)}
                className="ui-button ui-button-primary bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
              >
                Submit Your First Request
              </button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-gray-200">
            {leaves.map((leave: any) => (
              <li key={leave._id} className="px-6 py-4">
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

                  {isCurrentUser && leave.status === 'submitted' && (
                    <div className="flex-shrink-0 flex space-x-2">
                      <button
                        onClick={() => handleEdit(leave)}
                        className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(leave._id)}
                        disabled={isDeleting}
                        className="ui-button ui-button-secondary text-red-600 hover:text-red-800 text-sm font-medium disabled:opacity-50"
                      >
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
    </div>
  );
}
