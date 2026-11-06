'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useResetPasswordMutation } from '@/lib/api';
import { AccountFormShell, Field } from '@/app/components/ui/WorkspaceUI';
import { Lock, CheckCircle } from 'lucide-react';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [formData, setFormData] = useState({
    newPassword: '',
    confirmPassword: ''
  });
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [isSuccess, setIsSuccess] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState<{
    score: number;
    label: string;
    color: string;
  }>({ score: 0, label: '', color: '' });

  const [resetPassword, { isLoading }] = useResetPasswordMutation();

  useEffect(() => {
    if (!token) {
      setErrors({ token: 'Invalid or missing reset token' });
    }
  }, [token]);

  useEffect(() => {
    // Calculate password strength
    const password = formData.newPassword;
    if (!password) {
      setPasswordStrength({ score: 0, label: '', color: '' });
      return;
    }

    let score = 0;
    if (password.length >= 6) score++;
    if (password.length >= 10) score++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[^a-zA-Z0-9]/.test(password)) score++;

    const strengthMap = [
      { label: 'Very Weak', color: 'bg-red-500' },
      { label: 'Weak', color: 'bg-orange-500' },
      { label: 'Fair', color: 'bg-yellow-500' },
      { label: 'Good', color: 'bg-blue-500' },
      { label: 'Strong', color: 'bg-green-500' }
    ];

    setPasswordStrength({
      score,
      label: strengthMap[score - 1]?.label || '',
      color: strengthMap[score - 1]?.color || ''
    });
  }, [formData.newPassword]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    // Clear error for this field when user starts typing
    if (errors[name]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};

    if (!formData.newPassword) {
      newErrors.newPassword = 'Password is required';
    } else if (formData.newPassword.length < 6) {
      newErrors.newPassword = 'Password must be at least 6 characters long';
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password';
    } else if (formData.newPassword !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token) {
      setErrors({ token: 'Invalid or missing reset token' });
      return;
    }

    if (!validateForm()) {
      return;
    }

    try {
      await resetPassword({
        token,
        newPassword: formData.newPassword
      }).unwrap();

      setIsSuccess(true);

      // Redirect to login after 3 seconds
      setTimeout(() => {
        router.push('/login');
      }, 3000);
    } catch (err: any) {
      console.error('Reset password error:', err);
      const errorMessage = err?.data?.details || err?.message || 'Failed to reset password';
      
      if (errorMessage.includes('expired') || errorMessage.includes('invalid')) {
        setErrors({ 
          token: 'This reset link has expired or is invalid. Please request a new one.' 
        });
      } else {
        setErrors({ general: errorMessage });
      }
    }
  };

  return <AccountFormShell title={errors.token ? 'This link is unavailable' : isSuccess ? 'Password updated' : 'Choose a new password'} description={errors.token ? 'Reset links expire after one hour. Request a new link to continue.' : isSuccess ? 'You can now sign in with your new password.' : 'Set a password you haven’t used before to secure your workspace.'}>
    {errors.token ? <Link href="/forgot-password" className="ui-button ui-button-primary w-full">Request a new link</Link> : isSuccess ? <div role="status" className="ui-note flex items-center gap-3"><CheckCircle size={20} />Your password has been saved. Opening sign in…</div> : <form onSubmit={handleSubmit} className="space-y-5">
      <Field label="New password" htmlFor="new-password" required error={errors.newPassword} hint="Use at least 6 characters. A longer, unique password is stronger."><input id="new-password" type="password" autoComplete="new-password" className="ui-control" value={formData.newPassword} onChange={event => setFormData(previous => ({ ...previous, newPassword: event.target.value }))} disabled={isLoading} aria-invalid={!!errors.newPassword} required /></Field>
      {passwordStrength.label && <div><div className="h-1 rounded-full bg-gray-100 overflow-hidden"><div className={`h-full ${passwordStrength.color}`} style={{ width: `${passwordStrength.score * 20}%` }} /></div><p className="ui-field-hint mt-2" role="status">Password strength: {passwordStrength.label}</p></div>}
      <Field label="Confirm password" htmlFor="confirm-password" required error={errors.confirmPassword}><input id="confirm-password" type="password" autoComplete="new-password" className="ui-control" value={formData.confirmPassword} onChange={event => setFormData(previous => ({ ...previous, confirmPassword: event.target.value }))} disabled={isLoading} aria-invalid={!!errors.confirmPassword} required /></Field>
      {errors.general && <p role="alert" className="ui-field-error">{errors.general}</p>}
      <button type="submit" className="ui-button ui-button-primary w-full" disabled={isLoading}><Lock size={15} />{isLoading ? 'Saving password…' : 'Save new password'}</button>
    </form>}
  </AccountFormShell>;
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    }>
      <ResetPasswordForm />
    </Suspense>
  );
}

