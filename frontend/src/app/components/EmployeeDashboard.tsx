'use client';

import { useState } from 'react';
import { useSelector } from 'react-redux';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { RootState } from '@/lib/store';
import { useGetClaimsQuery, useGetClaimStatsQuery } from '@/lib/api';
import { formatCurrency } from '@/lib/currencyConverter';
import {
  Plus,
  FileText,
  Clock,
  CheckCircle,
  AlertCircle,
  Eye,
  Edit,
  Calendar,
  List,
  Plane,
  LayoutDashboard,
  Receipt
} from 'lucide-react';
import ImprovedClaimForm from './ImprovedClaimForm';
import LeaveMonthlyView from './LeaveMonthlyView';
import EmployeeLeaveDashboard from './EmployeeLeaveDashboard';
import TravelGuidelines from './TravelGuidelines';
import { PageHeading } from './ui/WorkspaceUI';


type ViewMode = 'claims' | 'leaves' | 'travel-guidelines' | 'my-calendar' | 'leave-dashboard';

// Same wording as the claim detail page
const statusLabels: Record<string, string> = {
  submitted: 'Awaiting review',
  finance_approved: 'Approved by finance',
  approved: 'Approved',
  paid: 'Paid',
  done: 'Completed',
  rejected: 'Needs attention',
};

// Full class names so Tailwind keeps the badge styles in the build
const statusClasses: Record<string, string> = {
  submitted: 'status-submitted',
  finance_approved: 'status-finance-approved',
  approved: 'status-approved',
  paid: 'status-paid',
  done: 'status-done',
  rejected: 'status-rejected',
};

export default function EmployeeDashboard() {
  const [showClaimForm, setShowClaimForm] = useState(false);
  const [currentView, setCurrentView] = useState<ViewMode>('claims');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const { user, isAuthenticated } = useSelector((state: RootState) => state.auth);
  const { data: claimsData, isLoading: claimsLoading, error: claimsError } = useGetClaimsQuery({ limit: 1000 });
  const { data: claimStats } = useGetClaimStatsQuery({ scope: 'own' });
  const claims = claimsData?.claims || [];
  const router = useRouter();

  // Calculate statistics
  const calculateStats = () => {
    if (!claimStats) return { total: 0, pending: 0, approved: 0, rejected: 0, totalAmount: 0 };

    const countByStatus = (status: string) =>
      claimStats.statusStats?.find((item: { _id: string }) => item._id === status)?.count || 0;

    return {
      total: claimStats.totalClaims || 0,
      pending: countByStatus('submitted'),
      approved: countByStatus('approved') + countByStatus('finance_approved') + countByStatus('paid') + countByStatus('done'),
      rejected: countByStatus('rejected'),
      totalAmount: claimStats.totalAmount || 0
    };
  };

  const stats = calculateStats();

  if (!isAuthenticated || !user) {
    return (
      <div className="ui-page text-center text-sm text-[var(--ui-muted)]">Loading…</div>
    );
  }

  if (showClaimForm) {
    return (
      <div className="ui-page">
        <ImprovedClaimForm
          onClose={() => setShowClaimForm(false)}
          employeeId={user?._id}
        />
      </div>
    );
  }

  const statTiles = [
    { label: 'Total claims', value: stats.total, icon: FileText },
    { label: 'Awaiting review', value: stats.pending, icon: Clock },
    { label: 'Approved', value: stats.approved, icon: CheckCircle },
    { label: 'Needs attention', value: stats.rejected, icon: AlertCircle },
  ];

  return (
    <div className="ui-page">
      <PageHeading
        title="My workspace"
        description={`Welcome back, ${user.name}. Track your expense claims, time off and travel guidance.`}
        icon={LayoutDashboard}
        actions={currentView === 'claims' && (
          <button type="button" onClick={() => setShowClaimForm(true)} className="ui-button ui-button-primary">
            <Plus size={16} />
            New claim
          </button>
        )}
      />

      {/* Navigation Tabs */}
      <nav className="flex gap-7 overflow-x-auto overflow-y-hidden border-b border-[var(--ui-line)] mb-8" aria-label="Workspace sections">
        {[
          { key: 'claims' as ViewMode, label: 'Claims', icon: FileText },
          { key: 'leaves' as ViewMode, label: 'Leaves', icon: List },
          { key: 'travel-guidelines' as ViewMode, label: 'Travel guidelines', icon: Plane },
          { key: 'my-calendar' as ViewMode, label: 'My calendar', icon: Calendar },
          ...(user?.role === 'executive' ? [{ key: 'leave-dashboard' as ViewMode, label: 'Leave dashboard', icon: Calendar }] : [])
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setCurrentView(tab.key)}
            aria-current={currentView === tab.key ? 'page' : undefined}
            className={`ui-tab flex items-center gap-2 whitespace-nowrap border-b-[3px] ${currentView === tab.key ? 'border-blue-500' : 'border-transparent hover:text-[var(--ui-ink)]'}`}
          >
            <tab.icon size={16} strokeWidth={1.8} />
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>

      {currentView === 'claims' && (
        <div className="space-y-6">
          {/* Statistics */}
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_290px] gap-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {statTiles.map((tile) => (
                <div key={tile.label} className="ui-panel p-5">
                  <span className="ui-section-icon"><tile.icon size={18} /></span>
                  <p className="text-xs text-[var(--ui-muted)] mt-4">{tile.label}</p>
                  <p className="text-2xl font-semibold text-[var(--ui-ink)] mt-1 tabular-nums">{tile.value}</p>
                </div>
              ))}
            </div>
            <div className="ui-summary-total rounded-[14px]">
              <p>Total claimed</p>
              <strong>{formatCurrency(stats.totalAmount, 'INR')}</strong>
              <small>Across all your claims, including those still in review.</small>
            </div>
          </div>

          {/* Claims List */}
          <section className="ui-form-section">
            <div className="ui-section-heading">
              <div className="ui-section-title">
                <span className="ui-section-icon"><Receipt size={18} /></span>
                <div>
                  <h2>My claims</h2>
                  <p>View and manage your expense claims</p>
                </div>
              </div>
            </div>

            {claimsLoading ? (
              <div className="ui-section-content text-center text-sm text-[var(--ui-muted)]">Loading claims…</div>
            ) : claimsError ? (
              <div className="ui-section-content">
                <div className="ui-empty">
                  <span className="ui-empty-icon"><AlertCircle size={22} /></span>
                  <h3>Couldn&apos;t load your claims</h3>
                  <p>The server may be waking up. Refresh the page in a few seconds.</p>
                </div>
              </div>
            ) : claims.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="ui-table">
                  <thead className="ui-table-head">
                    <tr>
                      {['Claim ID', 'Category', 'Amount', 'Status', 'Submitted', ''].map((label, i) => (
                        <th key={label || i} className={`ui-table-th ${label === 'Amount' ? 'text-right' : 'text-left'}`}>
                          {label || <span className="sr-only">Actions</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {claims.map((claim: any) => (
                      <tr key={claim._id}>
                        <td className="ui-table-td whitespace-nowrap">
                          <button type="button" onClick={() => router.push(`/claims/${claim._id}`)} className="font-medium text-[var(--ui-ink)] hover:underline">
                            {claim.claimId || claim._id.slice(-8)}
                          </button>
                        </td>
                        <td className="ui-table-td">{claim.category}</td>
                        <td className="ui-table-td whitespace-nowrap text-right tabular-nums font-medium text-[var(--ui-ink)]">
                          {formatCurrency(claim.grandTotal || 0, 'INR')}
                        </td>
                        <td className="ui-table-td whitespace-nowrap">
                          <span className={`status-badge ${statusClasses[claim.status] || 'bg-gray-100 text-gray-700'}`}>
                            {statusLabels[claim.status] || claim.status}
                          </span>
                        </td>
                        <td className="ui-table-td whitespace-nowrap">{format(new Date(claim.createdAt), 'dd MMM yyyy')}</td>
                        <td className="ui-table-td whitespace-nowrap">
                          <div className="flex justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => router.push(`/claims/${claim._id}`)}
                              className="ui-icon-button"
                              aria-label={`View ${claim.claimId || 'claim'}`}
                              title="View details"
                            >
                              <Eye size={16} />
                            </button>
                            {['submitted', 'rejected'].includes(claim.status) && (
                              <button
                                type="button"
                                onClick={() => router.push(`/claims/${claim._id}/edit`)}
                                className="ui-icon-button"
                                aria-label={`Edit ${claim.claimId || 'claim'}`}
                                title="Edit claim"
                              >
                                <Edit size={16} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="ui-section-content">
                <div className="ui-empty">
                  <span className="ui-empty-icon"><Receipt size={22} /></span>
                  <h3>No claims yet</h3>
                  <p>Create your first expense claim to get started.</p>
                  <button type="button" onClick={() => setShowClaimForm(true)} className="ui-button ui-button-primary mt-5">
                    <Plus size={16} />
                    New claim
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {currentView === 'leaves' && (
              <div className="space-y-6">
                <div className="flex flex-wrap gap-4 justify-between items-center">
                  <h2 className="text-xl font-semibold text-[var(--ui-ink)]">Leaves</h2>
                  <div className="flex gap-3">
                    <select
                      value={selectedYear}
                      onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                      className="ui-control !w-auto"
                      aria-label="Year"
                    >
                      {[selectedYear - 2, selectedYear - 1, selectedYear, selectedYear + 1].map(year => (
                        <option key={year} value={year}>{year}</option>
                      ))}
                    </select>

                    <select
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                      className="ui-control !w-auto"
                      aria-label="Month"
                    >
                      {Array.from({ length: 12 }, (_, i) => (
                        <option key={i + 1} value={i + 1}>
                          {new Date(0, i).toLocaleDateString('en-US', { month: 'long' })}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <LeaveMonthlyView
                  year={selectedYear}
                  month={selectedMonth}
                  isCurrentUser={true}
                />
              </div>
            )}

            {currentView === 'travel-guidelines' && (
              <TravelGuidelines />
            )}

            {currentView === 'my-calendar' && (
              <EmployeeLeaveDashboard userId={user?._id} forceView="calendar" />
            )}

            {currentView === 'leave-dashboard' && (
              <EmployeeLeaveDashboard userId={user?._id} />
            )}
    </div>
  );
}
