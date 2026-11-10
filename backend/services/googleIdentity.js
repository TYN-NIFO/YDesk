import crypto from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';

export const hashLoginSecret = value => crypto.createHash('sha256').update(value).digest('hex');
export const loginChallenge = value => crypto.createHash('sha256').update(value).digest('base64url');
export function sameLoginSecret(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function googleLoginConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  const frontendUrl = process.env.FRONTEND_URL;
  const domains = (process.env.GOOGLE_WORKSPACE_DOMAINS || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
  if (!clientId || !clientSecret || !redirectUri || !frontendUrl || !domains.length) return null;
  try {
    const callback = new URL(redirectUri), frontend = new URL(frontendUrl);
    const secure = url => url.protocol === 'https:' || (process.env.NODE_ENV !== 'production' && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname));
    if (!secure(callback) || !secure(frontend) || callback.username || callback.password || frontend.username || frontend.password) return null;
    if (callback.pathname !== '/api/auth/google/callback' || callback.search || callback.hash) return null;
    return { clientId, clientSecret, redirectUri, frontendUrl: frontend.origin, domains };
  } catch { return null; }
}

const client = config => new OAuth2Client({ clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.redirectUri, transporterOptions: { timeout: 15000 } });
export const googleIdentityProvider = {
  authorizationUrl(attempt, state, config) {
    return client(config).generateAuthUrl({
      scope: ['openid', 'email', 'profile'], response_type: 'code', access_type: 'online',
      state, nonce: attempt.nonce, code_challenge: loginChallenge(attempt.codeVerifier), code_challenge_method: 'S256',
      prompt: 'select_account', hd: config.domains.length === 1 ? config.domains[0] : '*'
    });
  },
  async verifyAuthorizationCode(code, attempt, config) {
    const oauth = client(config);
    const { tokens } = await oauth.getToken({ code, codeVerifier: attempt.codeVerifier, redirect_uri: config.redirectUri });
    if (!tokens.id_token) throw new Error('Google identity token missing');
    const ticket = await oauth.verifyIdToken({ idToken: tokens.id_token, audience: config.clientId });
    return ticket.getPayload();
  }
};

export function validateGoogleIdentity(payload, nonce, config) {
  if (!payload || !['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss) || payload.aud !== config.clientId) throw new Error('Invalid Google identity');
  if (!Number.isFinite(payload.exp) || payload.exp <= Date.now() / 1000) throw new Error('Google identity expired');
  if (payload.email_verified !== true || typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 255) throw new Error('Google identity is not verified');
  if (!sameLoginSecret(payload.nonce, nonce)) throw new Error('Google login nonce mismatch');
  if (typeof payload.hd !== 'string' || !config.domains.includes(payload.hd.toLowerCase())) throw new Error('Company Workspace account required');
  if (typeof payload.email !== 'string' || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(payload.email)) throw new Error('Google identity email missing');
  return { subject: payload.sub, email: payload.email.toLowerCase() };
}
