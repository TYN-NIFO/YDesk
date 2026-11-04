'use client';

import { Dialog, Field } from "./ui/WorkspaceUI";
import { useGetPolicyQuery } from "@/lib/api";

import { useState } from 'react';
import { X, DollarSign } from 'lucide-react';
import toast from 'react-hot-toast';

interface PaymentModalProps {
  claim: any;
  onClose: () => void;
  onPay: (claimId: string, channel: string, reference: string | undefined, file: File | null) => Promise<void>;
}

export default function PaymentModal({ claim, onClose, onPay }: PaymentModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { data: policy } = useGetPolicyQuery({});
  const [channel, setChannel] = useState("Bank Transfer");
  const [reference, setReference] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      // Default to a generic channel since UX doesn't ask for one
      await onPay(claim._id, channel, reference.trim() || undefined, file);
      onClose();
    } catch (error: any) {
      console.error('Payment failed:', error);
      toast.error(error?.data?.error || error?.data?.message || 'Payment failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return <Dialog title="Record claim payment" description="Confirm how this approved expense was settled." onClose={onClose} busy={isSubmitting}>
    <div className="ui-detail-summary mb-6"><p className="text-xs text-gray-500">{claim.employeeId?.name} · {claim.claimId || 'Expense claim'}</p><p className="text-3xl font-semibold text-blue-900 mt-2">₹{(claim.netPayable ?? claim.grandTotal ?? 0).toLocaleString('en-IN')}</p><p className="text-xs text-gray-500 mt-2">{claim.category}</p></div>
    <form onSubmit={handleSubmit} className="space-y-5">
      <Field label="Payment channel" htmlFor="payment-channel" required><select id="payment-channel" value={channel} onChange={event => setChannel(event.target.value)} className="ui-control" required disabled={isSubmitting}>{(policy?.payoutChannels || ['Bank Transfer', 'Cash', 'Check']).map((value: string) => <option key={value}>{value}</option>)}</select></Field>
      <Field label="Transaction reference" htmlFor="payment-reference" hint="Optional bank transaction or payment reference."><input id="payment-reference" className="ui-control" value={reference} onChange={event => setReference(event.target.value)} placeholder="For example, UTR or receipt number" disabled={isSubmitting} /></Field>
      <Field label="Payment proof" htmlFor="payment-proof" hint="Optional PDF, JPG, or PNG up to 4MB."><label className="ui-upload" htmlFor="payment-proof"><DollarSign size={21} /><span>{file ? file.name : 'Choose a payment receipt'}</span><small>PDF, JPG, PNG · up to 4MB</small><input id="payment-proof" type="file" className="sr-only" accept=".pdf,.png,.jpg,.jpeg" disabled={isSubmitting} onChange={event => { const selected = event.target.files?.[0]; if (selected && selected.size > 4 * 1024 * 1024) { toast.error('Choose a file smaller than 4MB'); event.target.value = ''; } else handleFileChange(event); }} /></label></Field>
      <div className="ui-form-actions"><button type="button" onClick={onClose} disabled={isSubmitting} className="ui-button ui-button-secondary">Cancel</button><button type="submit" disabled={isSubmitting} className="ui-button ui-button-primary">{isSubmitting ? 'Recording payment…' : 'Confirm payment'}</button></div>
    </form>
  </Dialog>;
}
