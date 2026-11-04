'use client';

import { useParams, useRouter } from 'next/navigation';
import { useSelector } from 'react-redux';
import { useGetClaimQuery } from '@/lib/api';
import { RootState } from '@/lib/store';
import { ArrowLeft } from 'lucide-react';
import ImprovedClaimForm from '@/app/components/ImprovedClaimForm';

export default function ClaimEditPage() {
  const params = useParams();
  const router = useRouter();
  const claimId = params.id as string;
  const { user } = useSelector((state: RootState) => state.auth);

  const { data: claim, isLoading, error } = useGetClaimQuery(claimId);

  const handleClose = () => {
    const dashboardRoutes = {
      employee: '/employee',
      executive: '/executive',
      finance_manager: '/finance',
      admin: '/admin'
    };
    
    const route = dashboardRoutes[user?.role as keyof typeof dashboardRoutes] || '/employee';
    router.push(route);
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

  return <div className="ui-page"><ImprovedClaimForm onClose={handleClose} employeeId={claim.employeeId?._id || claim.employeeId} existingClaim={claim} isEditing /></div>;
}
