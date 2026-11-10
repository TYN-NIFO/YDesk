import { roleConfig } from './roles';
export const GOOGLE_VERIFIER_KEY = 'ydesk-google-login-verifier';
export const GOOGLE_NEXT_KEY = 'ydesk-google-login-next';
const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...Array.from(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function safeLoginDestination(path: string | null, role: string) {
  const fallback = roleConfig(role).home;
  if (!path || !path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return fallback;
  try {
    const url = new URL(path, window.location.origin);
    if (url.origin !== window.location.origin || ['/login', '/auth/google'].includes(url.pathname)) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return fallback; }
}

export async function beginGoogleSignIn() {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  sessionStorage.setItem(GOOGLE_VERIFIER_KEY, verifier);
  const next = new URLSearchParams(window.location.search).get('next');
  if (next) sessionStorage.setItem(GOOGLE_NEXT_KEY, next); else sessionStorage.removeItem(GOOGLE_NEXT_KEY);
  const url = new URL(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'}/auth/google/start`);
  url.searchParams.set('challenge', challenge);
  window.location.assign(url.href);
}
