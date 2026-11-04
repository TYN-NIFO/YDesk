'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForgotPasswordMutation } from '@/lib/api';
import { AccountFormShell, Field } from '@/app/components/ui/WorkspaceUI';
import { Mail, Send } from 'lucide-react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState('');
  
  const [forgotPassword, { isLoading }] = useForgotPasswordMutation();

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate email
    if (!email) {
      setError('Please enter your email address');
      return;
    }

    if (!validateEmail(email)) {
      setError('Please enter a valid email address');
      return;
    }

    try {
      await forgotPassword({ email }).unwrap();
      setIsSubmitted(true);
    } catch (err: any) {
      console.error('Forgot password error:', err);
      // For security reasons, we show a generic message even on error
      // This prevents email enumeration attacks
      setIsSubmitted(true);
    }
  };

  return <AccountFormShell title={isSubmitted ? 'Check your inbox' : 'Forgot your password?'} description={isSubmitted ? 'If your email is linked to an account, a reset link will be on its way.' : 'Enter your work email and we’ll send you a link to get back into your workspace.'}>
    {isSubmitted ? <div role="status" className="space-y-5"><span className="ui-empty-icon"><Mail size={24} /></span><p className="text-sm text-gray-500 break-all">{email}</p><div className="ui-note">The link expires in one hour. Check your spam folder if it doesn’t appear in your inbox.</div><button type="button" className="ui-button ui-button-secondary w-full" onClick={() => { setIsSubmitted(false); setEmail(''); setError(''); }}>Use another email</button></div> : <form onSubmit={handleSubmit} className="space-y-5"><Field label="Work email" htmlFor="reset-email" required error={error}><input id="reset-email" name="email" type="email" autoComplete="email" className="ui-control" placeholder="you@company.com" required value={email} onChange={event => setEmail(event.target.value)} disabled={isLoading} aria-invalid={!!error} /></Field><button type="submit" className="ui-button ui-button-primary w-full" disabled={isLoading}><Send size={15} />{isLoading ? 'Sending link…' : 'Send reset link'}</button></form>}
  </AccountFormShell>;
}
