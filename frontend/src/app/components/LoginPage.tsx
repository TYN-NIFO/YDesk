'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSelector } from 'react-redux';
import { ArrowRight, Eye, EyeOff, FileText, CalendarDays, ShieldCheck, Loader2 } from 'lucide-react';
import { RootState } from '@/lib/store';
import authService from '@/lib/authService';

export default function LoginPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useSelector((state: RootState) => state.auth);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const destination = (role: string) => role === 'admin' ? '/admin' : role === 'executive' ? '/executive' : role === 'finance_manager' ? '/finance' : '/employee';

  useEffect(() => { if (isAuthenticated && user) router.replace(destination(user.role)); }, [isAuthenticated, user, router]);

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
          <p className="text-sm font-medium text-gray-500 mt-7 mb-2">Welcome to YDesk</p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-gray-900">Your workday, connected.</h2>
          <p className="text-gray-500 mt-4 mb-9 leading-relaxed">Sign in with your company account to get started.</p>
          <form onSubmit={signIn} className="space-y-5">
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
