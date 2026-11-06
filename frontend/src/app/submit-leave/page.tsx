'use client';

import { useSelector } from 'react-redux';
import { useRouter } from 'next/navigation';
import { RootState } from '@/lib/store';
import AuthWrapper from '@/app/components/AuthWrapper';
import LeaveForm from '@/app/components/LeaveForm';

export default function SubmitLeavePage() {
  const { user } = useSelector((state: RootState) => state.auth);
  const router = useRouter();

  const handleSuccess = () => {
    // Route back to appropriate dashboard based on user role
    switch (user?.role) {
      case 'executive':
        router.push('/executive');
        break;
      case 'finance_manager':
        router.push('/finance');
        break;
      case 'admin':
        router.push('/admin');
        break;
      default:
        router.push('/employee');
    }
  };

  const handleCancel = () => {
    // Route back to appropriate dashboard based on user role
    switch (user?.role) {
      case 'executive':
        router.push('/executive');
        break;
      case 'finance_manager':
        router.push('/finance');
        break;
      case 'admin':
        router.push('/admin');
        break;
      default:
        router.push('/employee');
    }
  };

  return <AuthWrapper><div className="ui-page"><LeaveForm onSuccess={handleSuccess} onCancel={handleCancel} /></div></AuthWrapper>;
}
