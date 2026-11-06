'use client';

import { Dialog } from "./ui/WorkspaceUI";

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useGetPolicyQuery } from '../../lib/api';
import { X, DollarSign } from 'lucide-react';

const paymentSchema = z.object({
  channel: z.string().min(1, 'Payment channel is required'),
  notes: z.string().optional(),
});

type PaymentFormData = z.infer<typeof paymentSchema>;

interface ClaimPaymentModalProps {
  claim: any;
  onClose: () => void;
  onMarkAsPaid: (claimId: string, channel: string, notes?: string) => Promise<void>;
}

export default function ClaimPaymentModal({ claim, onClose, onMarkAsPaid }: ClaimPaymentModalProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const { data: policy } = useGetPolicyQuery({});

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema),
  });

  const handleMarkAsPaid = async (data: PaymentFormData) => {
    setIsProcessing(true);
    try {
      await onMarkAsPaid(claim._id, data.channel, data.notes);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog title="Record claim payment" description="Confirm the payment details for this approved expense." onClose={onClose} busy={isProcessing}>



        {/* Claim Details */}
        <div className="ui-detail-summary mb-6 p-4 bg-gray-50 rounded-lg">
          <h4 className="font-medium text-gray-900 mb-2">Claim Details</h4>
          <div className="space-y-2 text-sm">
            <div>
              <span className="font-medium">Employee:</span> {claim.employeeId?.name || 'Unknown'}
            </div>
            <div>
              <span className="font-medium">Category:</span> {claim.category}
            </div>
            <div>
              <span className="font-medium">Amount:</span> ${claim.amount.toLocaleString()}
            </div>
            <div>
              <span className="font-medium">Description:</span> {claim.description}
            </div>
            <div>
              <span className="font-medium">Status:</span> {claim.status.replace('_', ' ').toUpperCase()}
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit(handleMarkAsPaid)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Payment Channel
            </label>
            <select aria-label="Payment Channel"
              {...register('channel')}
              className="ui-control input"
            >
              <option value="">Select payment channel</option>
              {policy?.payoutChannels?.map((channel: string) => (
                <option key={channel} value={channel}>
                  {channel}
                </option>
              ))}
            </select>
            {errors.channel && (
              <p className="mt-1 text-sm text-red-600">{errors.channel.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes (Optional)
            </label>
            <textarea aria-label="Notes (Optional)"
              {...register('notes')}
              rows={3}
              className="ui-control input"
              placeholder="Add any notes about the payment..."
            />
            {errors.notes && (
              <p className="mt-1 text-sm text-red-600">{errors.notes.message}</p>
            )}
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isProcessing}
              className="btn btn-primary flex items-center"
            >
              <DollarSign className="h-4 w-4 mr-2" />
              {isProcessing ? 'Processing...' : 'Mark as Paid'}
            </button>
          </div>
        </form>

    </Dialog>
  );
}
