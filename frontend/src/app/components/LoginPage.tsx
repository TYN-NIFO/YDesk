'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSelector } from 'react-redux';
import { ArrowRight, Eye, EyeOff, FileText, CalendarDays, ShieldCheck, Loader2 } from 'lucide-react';
import { RootState } from '@/lib/store';
import authService from '@/lib/authService';
import { roleConfig } from '@/lib/roles';
import { beginGoogleSignIn } from '@/lib/googleSignIn';

export default function LoginPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useSelector((state: RootState) => state.auth);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const destination = (role: string) => roleConfig(role).home;

  useEffect(() => { if (isAuthenticated && user) router.replace(destination(user.role)); }, [isAuthenticated, user, router]);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'}/auth/google/config`, { signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then(result => { if (!controller.signal.aborted) setGoogleEnabled(result?.enabled === true); })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  const googleSignIn = async () => {
    setBusy(true); setError('');
    try { await beginGoogleSignIn(); }
    catch { setError('Google sign-in could not start. Please try again.'); setBusy(false); }
  };

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const result = await authService.authenticate({ email: email.trim(), password });
      authService.setupAutoRefresh();
      const next = new URLSearchParams(window.location.search).get('next');
      router.replace(next && next.startsWith('/') && !next.startsWith('//') && !next.includes('\\') ? next : destination(result.user.role));
    } catch (failure: any) { setError(failure.message || 'Could not sign in. Please try again.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="sign-in-layout">
      <section className="sign-in-story" aria-label="Welcome to YDesk">
        <div className="story-topline"><span className="network-wordmark">the yellow<span>network.</span></span><span className="staff-pill">Your team workspace</span></div>
        <div className="story-content">
          <h1>Less paperwork.<br />More possibilities.</h1>
          <p>Good work deserves a simpler workday. Bring your expenses, time off, and feedback together in YDesk.</p>
          <div className="story-features">
            {[{ icon: FileText, title: 'Expenses, without the chase', text: 'Submit receipts and follow every approval.' }, { icon: CalendarDays, title: 'Make room for your time', text: 'Plan leave and stay in sync with your team.' }, { icon: ShieldCheck, title: 'A place to be heard', text: 'Share feedback, ideas, and appreciation.' }].map(feature => <div key={feature.title} className="story-feature"><span><feature.icon size={20} strokeWidth={1.6} /></span><div><h2>{feature.title}</h2><p>{feature.text}</p></div></div>)}
          </div>
        </div>
        <div className="story-footer"><span>Connected people. Better outcomes.</span><a href="https://theyellow.network" target="_blank" rel="noreferrer">Discover TYN <ArrowRight size={15} /></a></div>
        <svg className="network-art" viewBox="0 0 560 560" fill="none" aria-hidden="true"><circle cx="280" cy="280" r="240" /><circle cx="280" cy="280" r="160" /><circle cx="280" cy="280" r="80" /><path d="M40 280h480M280 40v480M110 110l340 340M110 450l340-340" /><circle className="network-node" cx="280" cy="40" r="9" /><circle className="network-node" cx="450" cy="450" r="9" /><circle className="network-node" cx="120" cy="280" r="9" /></svg>
      </section>
      <section className="sign-in-panel">
        <div className="sign-in-form">
          <div className="desk-emblem" aria-hidden="true">y<span /></div>
          <p className="login-eyebrow">Welcome to YDesk</p>
          <h2 className="login-title">Your workday, connected.</h2>
          <p className="login-description">Sign in with your company account to get started.</p>
          {googleEnabled && <div className="login-google">
            <button type="button" data-testid="google-sign-in" disabled={busy} onClick={googleSignIn} className="w-full min-h-[44px] flex items-center justify-center gap-3 rounded-md border border-gray-300 bg-white px-4 py-3 font-medium text-gray-800 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:opacity-60">
              <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6C44.4 38.03 46.98 31.87 46.98 24.55Z"/><path fill="#FBBC05" d="M10.53 28.59A14.41 14.41 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.87 23.87 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.97-6.19Z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.9-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.17 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"/></svg>
              Continue with Google
            </button>
            <p className="login-divider">or use your YDesk password</p>
          </div>}
          <form onSubmit={signIn} className="login-fields">
            <div><label htmlFor="email" className="block text-sm font-semibold mb-2">Work email</label><input id="email" name="email" className="input" type="email" autoComplete="username" placeholder="you@company.com" required value={email} onChange={event => { setEmail(event.target.value); setError(''); }} disabled={busy} /></div>
            <div><div className="flex justify-between gap-3 mb-2"><label htmlFor="password" className="text-sm font-semibold">Password</label><Link href="/forgot-password" className="text-sm font-medium text-blue-600 hover:underline">Forgot password?</Link></div><div className="relative"><input id="password" name="password" className="input pr-12" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter your password" required value={password} onChange={event => { setPassword(event.target.value); setError(''); }} disabled={busy} /><button type="button" className="absolute right-3 top-3 text-gray-500 p-1" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></div>
            {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 text-red-800 text-sm p-3">{error}</div>}
            <button className="btn btn-primary w-full flex justify-between items-center py-3.5" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in to your workspace'}{busy ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}</button>
          </form>
          <p className="sign-in-help">Need access? Contact your YDesk administrator.</p>
        </div>
        <p className="sign-in-copyright">© {new Date().getFullYear()} The Yellow Network</p>
      </section>
    </div>
  );
}
