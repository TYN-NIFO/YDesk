'use client';

import { useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '@/lib/store';
import { useGetLeavesQuery, useApproveLeaveMutation } from '@/lib/api';
import toast from 'react-hot-toast';

const APPROVER_ROLES = ['executive', 'supervisor', 'admin'];

export default function LeaveApprovals() {
  const { user } = useSelector((state: RootState) => state.auth);
  const isApprover = useMemo(() => !!user?.role && APPROVER_ROLES.includes(user.role), [user?.role]);
  const { data, isLoading, error: fetchError, refetch } = useGetLeavesQuery({ status: 'submitted', limit: 100 });
  const leaves = data?.leaves || [];
  const [approveLeave, { isLoading: approving }] = useApproveLeaveMutation();
  const [notesById, setNotesById] = useState<Record<string, string>>({});

  if (!isApprover) {
    return (
      <div className="ui-panel bg-white rounded-lg shadow p-6">
        <p className="text-gray-600">You are not authorized to view this page.</p>
      </div>
    );
  }

  const handleAction = async (id: string, action: 'approve' | 'reject') => {
    try {
      await approveLeave({ id, action, notes: notesById[id] || '' }).unwrap();
      toast.success(`Leave ${action === 'approve' ? 'approved' : 'rejected'} successfully`);
      refetch();
    } catch (e: any) {
      toast.error(e?.data?.error || e?.data?.message || `Failed to ${action} leave request`);
    }
  };

  return (
    <div className="ui-panel bg-white rounded-lg shadow">
      <div className="px-6 py-4 border-b border-gray-200">
        <h2 className="text-lg font-medium text-gray-900">Leave Approvals</h2>
        <p className="text-sm text-gray-600">Approve or reject submitted leave requests</p>
      </div>
      <div className="p-6">
        {isLoading ? (
          <div className="text-gray-500">Loading...</div>
        ) : fetchError ? (
          <div className="text-center py-8">
            <p className="text-red-600 font-medium mb-2">Failed to load leave requests</p>
            <p className="text-sm text-gray-500 mb-4">There was a server error. Please try again.</p>
            <button onClick={() => refetch()} className="text-blue-600 hover:text-blue-800 text-sm font-medium">
              Retry
            </button>
          </div>
        ) : leaves.length ? (
          <div className="overflow-x-auto">
            <table className="ui-table min-w-full divide-y divide-gray-200">
              <thead className="ui-table-head bg-gray-50">
                <tr>
                  <th className="ui-table-th px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Employee</th>
                  <th className="ui-table-th px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="ui-table-th px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="ui-table-th px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Hours</th>
                  <th className="ui-table-th px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reason</th>
                  <th className="ui-table-th px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Notes</th>
                  <th className="ui-table-th px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {leaves.map((lv: any) => (
                  <tr key={lv._id} className="hover:bg-gray-50">
                    <td className="ui-table-td px-6 py-4 whitespace-nowrap text-sm text-gray-900">{
                      lv.employeeName || lv.employeeId?.name || '-'
                    }</td>
                    <td className="ui-table-td px-6 py-4 whitespace-nowrap text-sm text-gray-900">{lv.type}</td>
                    <td className="ui-table-td px-6 py-4 whitespace-nowrap text-sm text-gray-900">{new Date(lv.date).toLocaleDateString()}</td>
                    <td className="ui-table-td px-6 py-4 whitespace-nowrap text-sm text-gray-900">{lv.type === 'Permission' ? (lv.hours ?? '-') : '-'}</td>
                    <td className="ui-table-td px-6 py-4 whitespace-nowrap text-sm text-gray-900">{lv.reason || '-'}</td>
                    <td className="ui-table-td px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <input
                        type="text"
                        className="ui-control border rounded-md px-2 py-1 w-56"
                        placeholder="Add notes (optional)"
                        value={notesById[lv._id] || ''}
                        onChange={(e) => setNotesById((prev) => ({ ...prev, [lv._id]: e.target.value }))}
                      />
                    </td>
                    <td className="ui-table-td px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                      <button
                        onClick={() => handleAction(lv._id, 'approve')}
                        disabled={approving}
                        className="ui-button ui-button-primary bg-green-600 text-white rounded-md px-3 py-1 hover:bg-green-700 disabled:opacity-50"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleAction(lv._id, 'reject')}
                        disabled={approving}
                        className="ui-button ui-button-danger bg-red-600 text-white rounded-md px-3 py-1 hover:bg-red-700 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-gray-500">No submitted leave requests</div>
        )}
      </div>
    </div>
  );
}
