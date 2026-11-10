'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import authService from '@/lib/authService';
import { GOOGLE_VERIFIER_KEY, GOOGLE_NEXT_KEY, safeLoginDestination } from '@/lib/googleSignIn';

const errors: Record<string, string> = {
  cancelled: 'Google sign-in was cancelled. You can try again or use your YDesk password.',
  account_unavailable: 'Your Google account is not connected to an active YDesk account. Contact your administrator.',
  invalid_state: 'This sign-in attempt expired. Please start again.',
  failed: 'Google sign-in could not complete. Use your company Workspace account and try again.',
};

export default function GoogleLoginCallback() {
  const router = useRouter();
  const pending = useRef<Promise<any> | null>(null);
  const initialResponse = useRef<{ code: string | null; verifier: string | null; error: string | null } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    if (!pending.current) {
      if (!initialResponse.current) {
        const params = new URLSearchParams(window.location.hash.slice(1));
        initialResponse.current = { code: params.get('code'), verifier: sessionStorage.getItem(GOOGLE_VERIFIER_KEY), error: params.get('error') };
        window.history.replaceState(null, '', '/auth/google');
      }
      const { code, verifier, error: providerError } = initialResponse.current;
      if (providerError || !code || !verifier) {
        setError(errors[providerError || 'invalid_state'] || errors.failed);
        sessionStorage.removeItem(GOOGLE_VERIFIER_KEY);
        return;
      }
      pending.current = authService.completeGoogleLogin(code, verifier).finally(() => sessionStorage.removeItem(GOOGLE_VERIFIER_KEY));
    }
    pending.current.then(result => {
      if (!active) return;
      const next = sessionStorage.getItem(GOOGLE_NEXT_KEY);
      sessionStorage.removeItem(GOOGLE_NEXT_KEY);
      router.replace(safeLoginDestination(next, result.user.role));
    }).catch(failure => { if (active) setError(failure.message || errors.failed); });
    return () => { active = false; };
  }, [router]);
  return <main className="min-h-screen grid place-items-center bg-gray-50 px-5"><section className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
    <p className="text-lg font-bold text-gray-900 mb-5">YDesk</p>
    {error ? <><h1 className="text-xl font-semibold mb-3">Sign-in needs another try</h1><p role="alert" className="text-sm leading-relaxed text-gray-600 mb-6">{error}</p><Link href="/login" className="btn btn-primary inline-flex">Back to sign in</Link></> : <><Loader2 className="mx-auto mb-4 animate-spin text-blue-600" aria-hidden="true"/><h1 className="text-xl font-semibold" role="status">Signing you in</h1><p className="mt-3 text-sm text-gray-600">Opening your workspace.</p></>}
  </section></main>;
}
