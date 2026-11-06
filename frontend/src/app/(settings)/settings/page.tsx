'use client';

import { useEffect, useState } from 'react';
import { useGetProfileQuery, useUpdateProfileMutation, useUploadAvatarMutation } from '@/lib/api';
import toast from 'react-hot-toast';
import Image from 'next/image';
import { User as UserRound, Building2, Camera, Save, Loader2, Lock as LockKeyhole } from 'lucide-react';
import { PageHeading, FormSection, Field } from '@/app/components/ui/WorkspaceUI';
import AuthWrapper from '@/app/components/AuthWrapper';

export default function SettingsPage() {
  const { data, isLoading } = useGetProfileQuery(undefined);
  const [updateProfile, { isLoading: isUpdating }] = useUpdateProfileMutation();
  const [uploadAvatar, { isLoading: isUploading }] = useUploadAvatarMutation();

  const user = data?.user;

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companyUrl, setCompanyUrl] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');

  useEffect(() => {
    if (user) {
      // Split existing name into first/last as a starting point
      const parts = (user.firstName && user.lastName)
        ? [user.firstName, user.lastName]
        : (user.name || '').trim().split(' ');
      setFirstName(user.firstName || parts[0] || '');
      setLastName(user.lastName || (parts.length > 1 ? parts.slice(1).join(' ') : ''));
      setCompanyName(user.companyName || '');
      setCompanyUrl(user.companyUrl || '');
      setAvatarUrl(user.avatarUrl || '');
    }
  }, [user]);

  const handleAvatarChange = async (file: File) => {
    try {
      const resp = await uploadAvatar(file).unwrap();
      if (resp?.avatarUrl) {
        setAvatarUrl(resp.avatarUrl);
        // persist avatar url on profile as well
        await updateProfile({ avatarUrl: resp.avatarUrl }).unwrap();
      }
    } catch (e) {
      console.error('Avatar upload failed', e);
      toast.error('Avatar upload failed. Please sign in again if the problem persists.');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateProfile({ firstName, lastName, companyName, companyUrl }).unwrap();
      toast.success('Profile updated');
    } catch (e) {
      console.error('Update failed', e);
      toast.error('Update failed. Please sign in again if the problem persists.');
    }
  };

  if (isLoading) return <div className="ui-page" role="status">Loading your profile…</div>;
  return <AuthWrapper><div className="ui-page">
    <PageHeading title="Account settings" description="Manage the details that make this workspace yours." icon={UserRound} />
    <div className="ui-form-layout">
      <form onSubmit={handleSave} className="ui-form-main">
        <FormSection title="Personal details" description="Your name appears on claims, requests, and approvals." icon={UserRound}><div className="grid sm:grid-cols-2 gap-5">
          <Field label="First name" htmlFor="profile-first-name"><input id="profile-first-name" className="ui-control" autoComplete="given-name" value={firstName} onChange={event => setFirstName(event.target.value)} /></Field>
          <Field label="Last name" htmlFor="profile-last-name"><input id="profile-last-name" className="ui-control" autoComplete="family-name" value={lastName} onChange={event => setLastName(event.target.value)} /></Field>
          <Field label="Work email" htmlFor="profile-email" hint="Managed by your administrator."><input id="profile-email" className="ui-control" value={user?.email || ''} disabled /></Field>
          <Field label="Account name" htmlFor="profile-account"><input id="profile-account" className="ui-control" value={user?.name || ''} disabled /></Field>
        </div></FormSection>
        <FormSection title="Company details" description="Keep your organization information up to date." icon={Building2}><div className="grid sm:grid-cols-2 gap-5">
          <Field label="Company name" htmlFor="profile-company"><input id="profile-company" className="ui-control" autoComplete="organization" value={companyName} onChange={event => setCompanyName(event.target.value)} placeholder="Your company" /></Field>
          <Field label="Company website" htmlFor="profile-website" hint="Include https:// at the beginning."><input id="profile-website" type="url" className="ui-control" autoComplete="url" value={companyUrl} onChange={event => setCompanyUrl(event.target.value)} placeholder="https://company.com" /></Field>
        </div></FormSection>
        <FormSection title="Profile photo" description="Choose a clear photo so your team can recognize you." icon={Camera}>
          <label className="ui-upload" htmlFor="profile-photo"><Camera size={22} /><span>{isUploading ? 'Uploading your photo…' : 'Choose a profile photo'}</span><small>JPG or PNG · up to 4MB</small><input id="profile-photo" type="file" className="sr-only" accept="image/jpeg,image/png" disabled={isUploading} onChange={async event => { const file = event.target.files?.[0]; if (file) { if (file.size > 4 * 1024 * 1024) toast.error('Choose a photo smaller than 4MB'); else await handleAvatarChange(file); } event.target.value = ''; }} /></label>
        </FormSection>
        <div className="ui-form-actions"><button type="submit" className="ui-button ui-button-primary" disabled={isUpdating || isUploading}>{isUpdating ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}{isUpdating ? 'Saving changes…' : 'Save profile changes'}</button></div>
      </form>
      <aside className="ui-summary"><div className="ui-profile-identity"><div className="ui-profile-avatar">{avatarUrl ? <Image src={avatarUrl} alt="Your profile" width={84} height={84} unoptimized className="w-full h-full object-cover" /> : (firstName[0] || user?.name?.[0] || 'Y') + (lastName[0] || '')}</div><h2 className="text-lg font-semibold text-blue-900">{[firstName, lastName].filter(Boolean).join(' ') || user?.name}</h2><p className="text-xs text-gray-500 mt-2 break-all">{user?.email}</p><span className="inline-block mt-4 rounded-full bg-blue-50 text-blue-700 px-3 py-1 text-xs capitalize">{user?.role?.replaceAll('_', ' ')}</span></div><div className="ui-summary-help border-t border-gray-200"><h3 className="flex items-center gap-2"><LockKeyhole size={14} />Your account</h3><p>Roles and work email are managed by your administrator. Contact them if these details need to change.</p></div></aside>
    </div>
  </div></AuthWrapper>;
}
