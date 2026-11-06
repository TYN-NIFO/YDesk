'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSelector } from 'react-redux';
import { useGetClaimQuery, useMarkPaidMutation, useDeleteClaimMutation } from '@/lib/api';
import { RootState } from '@/lib/store';
import { format } from 'date-fns';
import { ArrowLeft, Edit, DollarSign, Trash2 } from 'lucide-react';
import PaymentModal from '@/app/components/PaymentModal';
import toast from 'react-hot-toast';
import authService from '@/lib/authService';
import { PageHeading, FormSection } from '@/app/components/ui/WorkspaceUI';
import { Receipt, FileText, Download, Eye, Wallet, CheckCircle } from 'lucide-react';
import { formatCurrency } from '@/lib/currencyConverter';

export default function ClaimViewPage() {
  const params = useParams();
  const router = useRouter();
  const claimId = params.id as string;
  const { user, accessToken } = useSelector((state: RootState) => state.auth);

  const { data: claim, isLoading, error } = useGetClaimQuery(claimId);

  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [markPaid, { isLoading: isMarkingPaid }] = useMarkPaidMutation();
  const [deleteClaim] = useDeleteClaimMutation();

  // Helper function to handle file access via public S3 URL
  const handleFileAccess = async (url: string, fileName: string, isDownload: boolean = false) => {
    try {
      if (isDownload) {
        // Use backend proxy to download — avoids S3 CORS restrictions
        const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';
        const proxyUrl = `${API_URL}/claims/download-proxy?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(fileName)}`;
        const response = await fetch(proxyUrl, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
        if (!response.ok) throw new Error('Download failed');
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(blobUrl);
      } else {
        // View file in new tab directly from S3
        window.open(url, '_blank');
      }
    } catch (error) {
      console.error(`${isDownload ? 'Download' : 'View'} failed:`, error);
      toast.error(`Failed to ${isDownload ? 'download' : 'view'} file. Please try again.`);
    }
  };

  const canEditClaim = (claim: any): boolean => {
    if (!user || !claim || ['paid', 'done'].includes(claim.status)) return false;
    return ['admin', 'finance_manager', 'executive'].includes(user.role) ||
      (claim.employeeId._id === user._id && ['submitted', 'rejected'].includes(claim.status));
  };

  const canMarkAsPaid = (claim: any): boolean => {
    if (!user || !claim) return false;
    return user.role === 'finance_manager' && claim.status === 'finance_approved';
  };

  const canDeleteClaim = (claim: any): boolean => {
    if (!user || !claim || !['submitted', 'rejected'].includes(claim.status)) return false;
    return ['admin', 'finance_manager', 'executive'].includes(user.role) || claim.employeeId._id === user._id;
  };

  const handleMarkAsPaid = async (id: string, channel?: string, reference?: string, file?: File | null) => {
    try {
      await markPaid({ id, channel: channel || 'Bank Transfer', reference, file }).unwrap();
      toast.success('Claim marked as paid successfully');
      setIsPaymentOpen(false);
    } catch (e: any) {
      throw e;
    }
  };

  const handleDeleteClaim = async () => {
    if (!claim) return;

    if (!confirm('Are you sure you want to delete this claim? This action cannot be undone.')) {
      return;
    }

    try {
      setIsDeleting(true);
      const result = await deleteClaim(claimId).unwrap();
      toast.success(result.message || 'Claim deleted successfully');

      // Navigate back to appropriate dashboard
      const dashboardRoutes: Record<string, string> = {
        executive: '/executive',
        employee: '/employee',
        supervisor: '/employee',
        finance_manager: '/finance',
        admin: '/admin'
      };

      const route = dashboardRoutes[user?.role || ''] || '/employee';
      router.push(route);
    } catch (error: any) {
      const errorMessage = error?.data?.error || error?.message || 'Failed to delete claim';
      toast.error(errorMessage);
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading claim...</p>
        </div>
      </div>
    );
  }

  if (error || !claim) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600">Error loading claim. Please try again.</p>
          <button
            onClick={() => router.back()}
            className="ui-button ui-button-primary mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const statusLabels: Record<string, string> = { submitted: 'Awaiting review', finance_approved: 'Approved by finance', approved: 'Approved', paid: 'Paid', done: 'Completed', rejected: 'Needs attention' };
  const displayDate = (date?: string) => date ? format(new Date(date), 'dd MMM yyyy') : '—';
  const receiptButtons = (files: any[]) => files?.length ? <div className="space-y-2">{files.map(file => <div key={file.fileId || file.name} className="ui-receipt"><span className="ui-receipt-name"><FileText size={15} /><span>{file.name}</span></span><button type="button" className="ui-icon-button" aria-label={`View ${file.name}`} onClick={() => handleFileAccess(file.url, file.name)}><Eye size={15} /></button><button type="button" className="ui-icon-button" aria-label={`Download ${file.name}`} onClick={() => handleFileAccess(file.url, file.name, true)}><Download size={15} /></button></div>)}</div> : <p className="ui-field-hint">No receipts attached.</p>;
  return <div className="ui-page">
    <PageHeading title={claim.claimId || 'Expense claim'} description={`Submitted by ${claim.employeeId?.name || 'employee'} on ${displayDate(claim.createdAt)}`} icon={Receipt} onBack={() => router.back()} actions={<>{canEditClaim(claim) && <button type="button" onClick={() => router.push(`/claims/${claimId}/edit`)} className="ui-button ui-button-secondary"><Edit size={15} />Edit claim</button>}{canMarkAsPaid(claim) && <button type="button" onClick={() => setIsPaymentOpen(true)} disabled={isMarkingPaid} className="ui-button ui-button-primary"><DollarSign size={15} />Record payment</button>}{canDeleteClaim(claim) && <button type="button" onClick={handleDeleteClaim} disabled={isDeleting} className="ui-button ui-button-danger"><Trash2 size={15} />{isDeleting ? 'Deleting…' : 'Delete claim'}</button>}</>} />
    <div className="ui-form-layout">
      <div className="ui-form-main">
        <FormSection title="Claim details" icon={FileText}><dl className="grid sm:grid-cols-2 gap-5">{[['Category', claim.category], ['Business unit', claim.businessUnit], ['Employee', claim.employeeId?.name], ['Email', claim.employeeId?.email]].map(([label, value]) => <div key={label}><dt className="ui-field-hint">{label}</dt><dd className="text-sm font-medium text-blue-900 mt-1 break-words">{value || '—'}</dd></div>)}</dl></FormSection>
        <FormSection title="Expense items" description={`${claim.lineItems?.length || 0} items in this claim`} icon={Receipt}><div className="space-y-5">{claim.lineItems?.map((item: any, index: number) => <article className="ui-expense-item" key={item._id || index}><div className="ui-expense-item-heading"><h3><span className="ui-item-number">{index + 1}</span>{item.subCategory}</h3><span className="text-xs text-gray-500">{displayDate(item.date)}</span></div><p className="text-sm text-gray-600 leading-relaxed mb-5">{item.description}</p><div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-5"><div><p className="ui-field-hint">Amount</p><p className="text-sm mt-1">{formatCurrency(item.amount || 0, item.currency || 'INR')}</p></div><div><p className="ui-field-hint">GST / tax</p><p className="text-sm mt-1">{formatCurrency(item.gstTotal || 0, item.currency || 'INR')}</p></div><div><p className="ui-field-hint">Total in INR</p><p className="text-sm font-semibold text-blue-900 mt-1">{formatCurrency(item.amountInINR || 0, 'INR')}</p></div></div>{receiptButtons(item.attachments)}</article>)}</div></FormSection>
        {claim.advances?.length > 0 && <FormSection title="Advances" icon={Wallet}><div className="overflow-x-auto"><table className="ui-table"><thead className="ui-table-head"><tr>{['Date', 'Reference', 'Amount'].map(label => <th className="ui-table-th text-left" key={label}>{label}</th>)}</tr></thead><tbody>{claim.advances.map((advance: any, index: number) => <tr key={advance._id || index}><td className="ui-table-td">{displayDate(advance.date)}</td><td className="ui-table-td">{advance.refNo || '—'}</td><td className="ui-table-td">{formatCurrency(advance.amount || 0, 'INR')}</td></tr>)}</tbody></table></div></FormSection>}
        {claim.attachments?.length > 0 && <FormSection title="Additional documents" icon={FileText}>{receiptButtons(claim.attachments)}</FormSection>}
        <FormSection title="Review and settlement" icon={CheckCircle}><div className="space-y-5"><div className="ui-detail-summary"><h3 className="text-sm font-semibold text-blue-900">Finance review</h3><p className="text-xs text-gray-500 mt-2">{claim.financeApproval?.approvedBy?.name || 'Not reviewed yet'}{claim.financeApproval?.approvedAt ? ` · ${displayDate(claim.financeApproval.approvedAt)}` : ''}</p>{claim.financeApproval?.notes && <p className="text-sm text-gray-600 mt-3">{claim.financeApproval.notes}</p>}{claim.financeApproval?.reason && <p className="ui-field-error mt-3">{claim.financeApproval.reason}</p>}</div>{claim.payment?.paidAt && <div className="ui-detail-summary"><h3 className="text-sm font-semibold text-blue-900">Payment recorded</h3><p className="text-xs text-gray-500 mt-2">{claim.payment.channel} · {displayDate(claim.payment.paidAt)}</p>{claim.payment.reference && <p className="text-sm mt-3">Reference: {claim.payment.reference}</p>}</div>}</div></FormSection>
      </div>
      <aside className="ui-summary"><h2 className="ui-summary-heading">Claim summary</h2><div className="ui-summary-content"><span className={`status-badge status-${claim.status.replaceAll('_', '-')}`}>{statusLabels[claim.status] || claim.status}</span><div className="ui-summary-row mt-4"><span>Expense total</span><strong>{formatCurrency(claim.grandTotal || 0, 'INR')}</strong></div><div className="ui-summary-row"><span>Advances</span><strong>{formatCurrency(claim.advances?.reduce((sum: number, advance: any) => sum + (advance.amount || 0), 0) || 0, 'INR')}</strong></div></div><div className="ui-summary-total"><p>Net payable</p><strong>{formatCurrency(claim.netPayable ?? claim.grandTotal ?? 0, 'INR')}</strong><small>{claim.status === 'paid' ? 'This claim has been settled.' : 'Follow the review status here as your claim progresses.'}</small></div></aside>
    </div>
    {isPaymentOpen && <PaymentModal claim={claim} onClose={() => setIsPaymentOpen(false)} onPay={handleMarkAsPaid} />}
  </div>;
}
