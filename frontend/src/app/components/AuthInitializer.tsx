'use client';

import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { loadStoredAuth } from '../../lib/slices/authSlice';
import authService from '@/lib/authService';

export function AuthInitializer({ children }: { children: React.ReactNode }) {
  const dispatch = useDispatch();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    dispatch(loadStoredAuth());
    const initialize = async () => {
      if (!authService.getAccessToken()) await authService.refreshToken();
      else authService.setupAutoRefresh();
      if (active) setReady(true);
    };
    initialize();
    return () => { active = false; };
  }, [dispatch]);
  if (!ready) return <div className="min-h-screen grid place-items-center" role="status"><p className="text-sm text-gray-500">Opening your workspace…</p></div>;
  return <>{children}</>;
}
