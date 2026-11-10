'use client';

import AuthWrapper from '../components/AuthWrapper';
import PendingLeaveApprovals from '../components/PendingLeaveApprovals';

export default function ApprovalsPage() {
  return (
    <AuthWrapper allowedRoles={['executive']}>
      <div className="max-w-6xl mx-auto p-6">
        <PendingLeaveApprovals />
      </div>
    </AuthWrapper>
  );
}


