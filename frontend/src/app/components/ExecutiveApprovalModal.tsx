'use client';

import { Dialog } from "./ui/WorkspaceUI";

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle, XCircle, AlertTriangle, Crown } from 'lucide-react';

const approvalSchema = z.object({
  notes: z.string().optional(),
  rejectionReason: z.string().min(10, 'Rejection reason must be at least 10 characters').optional(),
});

type ApprovalFormData = z.infer<typeof approvalSchema>;

interface ExecutiveApprovalModalProps {
  claim: any;
  onClose: () => void;
  onApprove: (claimId: string, isApproved: boolean, notes?: string, rejectionReason?: string) => void;
}

export default function ExecutiveApprovalModal({ claim, onClose, onApprove }: ExecutiveApprovalModalProps) {
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [action, setAction] = useState<'approve' | 'reject' | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    reset,
  } = useForm<ApprovalFormData>({
    resolver: zodResolver(approvalSchema),
  });

  const watchedRejectionReason = watch('rejectionReason');

  const handleApprove = async (data: ApprovalFormData) => {
    setIsApproving(true);
    try {
      await onApprove(claim._id, true, data.notes);
      onClose();
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async (data: ApprovalFormData) => {
    if (!data.rejectionReason || data.rejectionReason.trim().length < 10) {
      return;
    }

    setIsRejecting(true);
    try {
      await onApprove(claim._id, false, data.notes, data.rejectionReason);
      onClose();
    } finally {
      setIsRejecting(false);
    }
  };

  const handleActionSubmit = (data: ApprovalFormData) => {
    if (action === 'approve') {
      handleApprove(data);
    } else if (action === 'reject') {
      handleReject(data);
    }
  };

  const handleActionClick = (selectedAction: 'approve' | 'reject') => {
    setAction(selectedAction);
    reset(); // Reset form when changing action
  };

  const handleClose = () => {
    setAction(null);
    reset();
    onClose();
  };

  return (
    <Dialog title="Executive review" description="Review this claim and record your decision." onClose={handleClose} busy={isApproving || isRejecting}>

        <div>


          {/* Claim Details */}
          <div className="ui-detail-summary bg-gray-50 p-4 rounded-lg mb-4">
            <div className="space-y-2 text-sm">
              <div>
                <span className="font-medium">Employee:</span> {claim.employeeId?.name || 'Unknown'}
              </div>
              <div>
                <span className="font-medium">Category:</span> {claim.category}
              </div>
              <div>
                <span className="font-medium">Amount:</span> ₹{claim.grandTotal?.toLocaleString() || '0'}
              </div>
              <div>
                <span className="font-medium">Status:</span> {claim.status?.replace('_', ' ').toUpperCase() || 'N/A'}
              </div>
              {claim.financeApproval?.approvedBy && (
                <div>
                  <span className="font-medium">Finance Approved By:</span> {claim.financeApproval.approvedBy?.name || 'Unknown'}
                </div>
              )}
              {claim.lineItems && claim.lineItems.length > 0 && (
                <div>
                  <span className="font-medium">Line Items:</span> {claim.lineItems.length} item{claim.lineItems.length !== 1 ? 's' : ''}
                </div>
              )}
              {claim.advances && claim.advances.length > 0 && (
                <div>
                  <span className="font-medium">Advances:</span> ₹{claim.advances.reduce((sum: number, advance: any) => sum + (advance.amount || 0), 0).toLocaleString()}
                </div>
              )}
            </div>
          </div>

          {/* Notes Field */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Notes (Optional)
            </label>
            <textarea aria-label="Notes (Optional)"
              {...register('notes')}
              rows={3}
              className="ui-control w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Add any additional notes..."
            />
          </div>

          {/* Rejection Reason Field - Only show when rejecting */}
          {action === 'reject' && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Rejection Reason <span className="text-red-500">*</span>
              </label>
              <textarea aria-label="Rejection Reason"
                {...register('rejectionReason')}
                rows={3}
                className="ui-control w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500"
                placeholder="Please provide a detailed reason for rejection (minimum 10 characters)..."
              />
              {errors.rejectionReason && (
                <p className="text-red-500 text-sm mt-1">{errors.rejectionReason.message}</p>
              )}
            </div>
          )}

          {/* Action Buttons - Only show when no action is selected */}
          {!action && (
            <div className="flex space-x-3">
              <button
                onClick={() => handleActionClick('approve')}
                disabled={isApproving || isRejecting}
                className={`ui-button ${`flex-1 flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white ${
                  isApproving || isRejecting
                    ? 'ui-button-secondary bg-gray-400 cursor-not-allowed'
                    : 'ui-button-primary bg-green-600 hover:bg-green-700'
                }`}`}
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Approve
              </button>
              <button
                onClick={() => handleActionClick('reject')}
                disabled={isApproving || isRejecting}
                className={`ui-button ${`flex-1 flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white ${
                  isApproving || isRejecting
                    ? 'ui-button-secondary bg-gray-400 cursor-not-allowed'
                    : 'ui-button-danger bg-red-600 hover:bg-red-700'
                }`}`}
              >
                <XCircle className="h-4 w-4 mr-2" />
                Reject
              </button>
            </div>
          )}

          {/* Submit Button - Only show when action is selected */}
          {action && (
            <form onSubmit={handleSubmit(handleActionSubmit)} className="space-y-3">
              <button
                type="submit"
                disabled={isApproving || isRejecting || (action === 'reject' && (!watchedRejectionReason || watchedRejectionReason.trim().length < 10))}
                className={`ui-button ${`w-full flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white ${
                  isApproving || isRejecting || (action === 'reject' && (!watchedRejectionReason || watchedRejectionReason.trim().length < 10))
                    ? 'ui-button-secondary bg-gray-400 cursor-not-allowed'
                    : action === 'approve'
                    ? 'ui-button-primary bg-green-600 hover:bg-green-700'
                    : 'ui-button-danger bg-red-600 hover:bg-red-700'
                }`}`}
              >
                {isApproving || isRejecting ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                ) : (
                  <>
                    {action === 'approve' ? (
                      <>
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Confirm Approval
                      </>
                    ) : (
                      <>
                        <XCircle className="h-4 w-4 mr-2" />
                        Confirm Rejection
                      </>
                    )}
                  </>
                )}
              </button>

              {/* Back button to change action */}
              <button
                type="button"
                onClick={() => handleActionClick(null as any)}
                disabled={isApproving || isRejecting}
                className="ui-button ui-button-secondary w-full px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                Back
              </button>
            </form>
          )}

          {/* Warning for Rejection */}
          {action === 'reject' && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
              <div className="flex items-center">
                <AlertTriangle className="h-4 w-4 text-red-600 mr-2" />
                <span className="text-sm text-red-700">
                  <strong>Warning:</strong> Rejecting this claim will require the employee to resubmit with corrections.
                </span>
              </div>
            </div>
          )}
        </div>

    </Dialog>
  );
}
