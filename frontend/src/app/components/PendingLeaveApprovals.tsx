'use client';

import { useState } from 'react';
import { useGetPendingLeavesQuery } from '@/lib/api';
import LeaveApprovalModal from './LeaveApprovalModal';
import LoadingSpinner from './LoadingSpinner';

export default function PendingLeaveApprovals() {
  const { data, isLoading, error, refetch } = useGetPendingLeavesQuery({ limit: 200 });
  const [selectedLeave, setSelectedLeave] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getDuration = (leave: any) => {
    if (leave.type === 'Permission' && leave.hours) {
      return `${leave.hours} hours`;
    }
    
    const start = new Date(leave.startDate);
    const end = new Date(leave.endDate);
    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    
    return `${days} day${days > 1 ? 's' : ''}`;
  };

  const getDaysAgo = (dateString: string) => {
    const now = new Date();
    const submitted = new Date(dateString);
    const diffTime = now.getTime() - submitted.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return '1 day ago';
    return `${diffDays} days ago`;
  };

  const handleApprove = (leave: any) => {
    setSelectedLeave(leave);
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedLeave(null);
  };

  const handleApprovalSuccess = () => {
    refetch();
    handleModalClose();
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
        <h3 className="text-lg font-medium text-gray-900 mb-2">Error Loading Pending Leaves</h3>
        <p className="text-gray-600 mb-4">There was an error loading the pending leave requests.</p>
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

  if (leaves.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-400 mb-4">
          <svg className="mx-auto h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">No Pending Approvals</h3>
        <p className="text-gray-600">All leave requests have been processed.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">
          Pending Leave Approvals ({leaves.length})
        </h2>
        <button
          onClick={() => refetch()}
          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
        >
          Refresh
        </button>
      </div>

      <div className="ui-panel bg-white shadow overflow-hidden sm:rounded-md">
        <ul className="divide-y divide-gray-200">
          {leaves.map((leave: any) => (
            <li key={leave._id} className="px-6 py-4 hover:bg-gray-50">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-3">
                    <div className="flex-shrink-0">
                      <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
                        <span className="text-sm font-medium text-gray-700">
                          {leave.employeeId?.name?.split(' ').map((n: string) => n[0]).join('').toUpperCase()}
                        </span>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {leave.employeeId?.name}
                        </p>
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          leave.type === 'Planned Leave' ? 'bg-green-100 text-green-800' :
                          leave.type === 'Unplanned Leave' ? 'bg-red-100 text-red-800' :
                          leave.type === 'WFH' ? 'bg-blue-100 text-blue-800' :
                          leave.type === 'Permission' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {leave.type}
                        </span>
                      </div>
                      <div className="flex items-center space-x-4 mt-1">
                        <p className="text-sm text-gray-600">
                          {formatDate(leave.startDate)} - {formatDate(leave.endDate)}
                        </p>
                        <p className="text-sm text-gray-600">
                          Duration: {getDuration(leave)}
                        </p>
                        <p className="text-sm text-gray-500">
                          Submitted {getDaysAgo(leave.createdAt)}
                        </p>
                      </div>
                      {leave.reason && (
                        <p className="text-sm text-gray-600 mt-1 truncate">
                          Reason: {leave.reason}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex-shrink-0 flex space-x-2">
                  <button
                    onClick={() => handleApprove(leave)}
                    className="ui-button ui-button-primary bg-blue-600 text-white px-3 py-1 rounded-md text-sm font-medium hover:bg-blue-700 transition-colors"
                  >
                    Review
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Approval Modal */}
      <LeaveApprovalModal
        leave={selectedLeave}
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onSuccess={handleApprovalSuccess}
      />
    </div>
  );
}
