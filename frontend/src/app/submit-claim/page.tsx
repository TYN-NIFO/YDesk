'use client';

import { useSelector } from 'react-redux';
import { useRouter } from 'next/navigation';
import { RootState } from '@/lib/store';
import ImprovedClaimForm from '@/app/components/ImprovedClaimForm';

export default function SubmitClaimPage() {
  const { user } = useSelector((state: RootState) => state.auth);
  const router = useRouter();

  const handleClose = () => {
    // Navigate to the user's role-appropriate dashboard
    switch (user?.role) {
      case 'executive':
        router.push('/executive');
        break;
      case 'admin':
        router.push('/admin');
        break;
      case 'finance_manager':
        router.push('/finance');
        break;
      case 'employee':
      case 'supervisor':
      default:
        router.push('/employee');
        break;
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h1>
          <p className="text-gray-600">Please log in to submit a claim.</p>
        </div>
      </div>
    );
  }

  return <div className="ui-page"><ImprovedClaimForm onClose={handleClose} employeeId={user._id} /></div>;
}
