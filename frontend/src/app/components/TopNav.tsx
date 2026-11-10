'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSelector } from 'react-redux';
import { LayoutDashboard, CalendarDays, FilePlus2, ShieldCheck, Settings, LogOut, Users } from 'lucide-react';
import { RootState } from '@/lib/store';
import authService from '@/lib/authService';
import { roleConfig } from '@/lib/roles';

export default function TopNav() {
  const { user, isAuthenticated } = useSelector((state: RootState) => state.auth);
  const pathname = usePathname();
  const router = useRouter();
  if (!user || !isAuthenticated) return <a className="skip-link" href="#main-content">Skip to content</a>;
  const dashboard = roleConfig(user.role).home;
  const links = [
    { href: dashboard, label: 'Overview', icon: LayoutDashboard },
    { href: '/submit-claim', label: 'New expense', icon: FilePlus2 },
    { href: '/leave-dashboard', label: 'Time off', icon: CalendarDays },
    { href: '/feedback', label: 'Feedback', icon: ShieldCheck },
    ...(user.role === 'admin' ? [{ href: '/admin/users', label: 'People', icon: Users }] : [])
  ];
  const isActive = (href: string) => pathname === href || (href === "/leave-dashboard" && pathname === "/submit-leave");
  return (
    <header className="workspace-header">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <div className="workspace-topbar">
        <Link href={dashboard} className="desk-brand" aria-label="YDesk home"><span className="desk-emblem small">y<span /></span><span>YDesk<small>The Yellow Network</small></span></Link>
        <div className="workspace-account"><div className="account-avatar" aria-hidden="true">{user.name.split(' ').map(part => part[0]).slice(0, 2).join('')}</div><div className="account-name"><span>{user.name}</span><small>{roleConfig(user.role).label}</small></div><Link href="/settings" className="icon-button" aria-label="Account settings"><Settings size={19} /></Link><button className="icon-button" aria-label="Sign out of all sessions" title="Sign out of all sessions" onClick={async () => { await authService.logout(); router.replace('/login'); }}><LogOut size={19} /></button></div>
      </div>
      <nav className="workspace-navigation" aria-label="Main navigation">{links.map(link => <Link key={link.href} href={link.href} className={isActive(link.href) ? 'active' : ''} aria-current={isActive(link.href) ? 'page' : undefined}><link.icon size={17} strokeWidth={1.8} />{link.label}</Link>)}</nav>
    </header>
  );
}
