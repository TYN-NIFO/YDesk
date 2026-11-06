'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '@/lib/store';
import { loadStoredAuth, logout } from '@/lib/slices/authSlice';
import authService from '@/lib/authService';

interface AuthWrapperProps {
  children: React.ReactNode;
  allowedRoles?: string[];
  redirectTo?: string;
}

const AuthWrapper = ({ children, allowedRoles, redirectTo = '/login' }: AuthWrapperProps) => {
  const router = useRouter();
  const dispatch = useDispatch();
  const { isAuthenticated, user, isLoading, isInitialized: authInitialized } = useSelector((state: RootState) => state.auth);
  const [componentInitialized, setComponentInitialized] = useState(false);

  useEffect(() => {
    // Load stored authentication data on mount
    dispatch(loadStoredAuth());
    setComponentInitialized(true);
  }, [dispatch]);

  useEffect(() => {
    if (!componentInitialized || !authInitialized) return;

    if (!isAuthenticated) {
      // Not authenticated, redirect to login
      router.push(redirectTo);
      return;
    }

    if (allowedRoles && user) {
      // Check role-based access exact match
      if (!allowedRoles.includes(user.role)) {
        // User doesn't have required role, redirect to unauthorized page
        router.push('/unauthorized');
        return;
      }
    }

    // Setup auto-refresh for the current token
    const token = authService.getAccessToken();
    if (token && !authService.isTokenExpired(token)) {
      authService.setupAutoRefresh();
    }
  }, [isAuthenticated, user, componentInitialized, authInitialized, allowedRoles, router, redirectTo]);

  // Handle logout
  const handleLogout = async () => {
    try {
      await authService.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      router.push('/login');
    }
  };

  // Show loading state while initializing
  if (!componentInitialized || !authInitialized || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Show unauthorized message if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Authentication Required</h1>
          <p className="text-gray-600 mb-4">Please log in to access this page.</p>
          <button
            onClick={() => router.push('/login')}
            className="ui-button ui-button-primary bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  // Show unauthorized message if role is insufficient
  if (allowedRoles && user) {
    if (!allowedRoles.includes(user.role)) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h1>
            <p className="text-gray-600 mb-4">
              You don&apos;t have permission to access this page. Required role: {allowedRoles.join(', ')}
            </p>
            <button
              onClick={handleLogout}
              className="ui-button ui-button-danger bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 mr-2"
            >
              Logout
            </button>
            <button
              onClick={() => router.push('/')}
              className="ui-button ui-button-primary bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            >
              Go Home
            </button>
          </div>
        </div>
      );
    }
  }

  // Render children if authenticated and authorized
  return <>{children}</>;
};

export default AuthWrapper;
