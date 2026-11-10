'use client';
import { useState } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '@/lib/store';
import { roleConfig } from '@/lib/roles';
import AuthWrapper from '../components/AuthWrapper';
import EmployeeLeaveDashboard from '../components/EmployeeLeaveDashboard';
import PendingLeaveApprovals from '../components/PendingLeaveApprovals';
import LeaveAnalyticsDashboard from '../components/LeaveAnalyticsDashboard';

export default function LeaveDashboard() {
  const { user } = useSelector((state: RootState) => state.auth);
  const [view, setView] = useState('personal');
  const canManage = !!user && roleConfig(user.role).manageLeave;
  return <AuthWrapper><div className="ui-page">
    {canManage && <nav className="ui-toolbar mb-6 flex flex-wrap gap-2" aria-label="Time off sections">
      {[['personal', 'Team calendar & my requests'], ['approvals', 'Pending approvals'], ['analytics', 'Organisation analytics']].map(([key, label]) => <button type="button" key={key} aria-pressed={view === key} className={`ui-button ${view === key ? 'ui-button-primary' : 'ui-button-secondary'}`} onClick={() => setView(key)}>{label}</button>)}
    </nav>}
    {canManage && view === 'approvals' ? <PendingLeaveApprovals /> : canManage && view === 'analytics' ? <LeaveAnalyticsDashboard userRole={user!.role} userEmail={user!.email} /> : <EmployeeLeaveDashboard />}
  </div></AuthWrapper>;
}
