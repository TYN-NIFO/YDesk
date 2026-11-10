'use client';

// Keep legacy callers on the same permission-checked approval flow.
import AuthWrapper from './AuthWrapper';
import PendingLeaveApprovals from './PendingLeaveApprovals';
export default function LeaveApprovals() { return <AuthWrapper allowedRoles={['executive']}><PendingLeaveApprovals /></AuthWrapper>; }
