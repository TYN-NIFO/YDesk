import crypto from 'node:crypto';
import User from '../models/User.js';
import { GoogleLoginAttempt, GoogleLoginCode } from '../models/GoogleLogin.js';
import { createWebSession } from './authController.js';
import { googleLoginConfig, googleIdentityProvider, hashLoginSecret, loginChallenge, sameLoginSecret, validateGoogleIdentity } from '../services/googleIdentity.js';

const cookieName = 'googleLoginState';
const cookieOptions = () => ({ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/api/auth/google' });
const noStore = res => { res.set('Cache-Control', 'no-store'); res.set('Referrer-Policy', 'no-referrer'); };
const frontendCallback = (config, params) => {
  const url = new URL('/auth/google', config.frontendUrl);
  url.hash = new URLSearchParams(params).toString();
  return url.href;
};

export function googleLoginStatus(req, res) {
  noStore(res);
  res.json({ enabled: Boolean(googleLoginConfig()) });
}

export async function startGoogleLogin(req, res) {
  noStore(res);
  const config = googleLoginConfig();
  if (!config) return res.status(503).json({ error: 'Google sign-in is not configured' });
  if (typeof req.query.challenge !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(req.query.challenge)) return res.status(400).json({ error: 'Start Google sign-in from the YDesk login page' });
  try {
    const state = crypto.randomBytes(32).toString('hex');
    const attempt = {
      stateHash: hashLoginSecret(state), nonce: crypto.randomBytes(32).toString('hex'),
      codeVerifier: crypto.randomBytes(32).toString('base64url'), browserChallenge: req.query.challenge,
      expiresAt: new Date(Date.now() + 10 * 60000)
    };
    await GoogleLoginAttempt.create(attempt);
    res.cookie(cookieName, state, { ...cookieOptions(), maxAge: 10 * 60000 });
    return res.redirect(googleIdentityProvider.authorizationUrl(attempt, state, config));
  } catch { return res.status(503).json({ error: 'Google sign-in could not start. Please try again.' }); }
}

async function existingGoogleUser(identity) {
  const linked = await User.findOne({ googleSubject: identity.subject }).select('+googleSubject');
  if (linked) return linked.isActive ? linked : null;
  const users = await User.find({ $or: [{ email: identity.email }, { googleLoginEmail: identity.email }] }).select('+googleSubject').limit(2);
  if (users.length !== 1 || !users[0].isActive || (users[0].googleSubject && users[0].googleSubject !== identity.subject)) return null;
  return User.findOneAndUpdate({
    _id: users[0]._id, isActive: true,
    $or: [{ googleSubject: { $exists: false } }, { googleSubject: null }, { googleSubject: identity.subject }]
  }, { $set: { googleSubject: identity.subject } }, { new: true }).select('+googleSubject');
}

export async function finishGoogleLogin(req, res) {
  noStore(res);
  const config = googleLoginConfig();
  if (!config) return res.status(503).json({ error: 'Google sign-in is not configured' });
  const state = req.query.state;
  const cookie = req.cookies?.[cookieName];
  res.clearCookie(cookieName, cookieOptions());
  const fail = error => res.redirect(frontendCallback(config, { error }));
  if (typeof state !== 'string' || !/^[a-f0-9]{64}$/.test(state) || !sameLoginSecret(state, cookie)) return fail('invalid_state');
  try {
    const attempt = await GoogleLoginAttempt.findOneAndDelete({ stateHash: hashLoginSecret(state), expiresAt: { $gt: new Date() } });
    if (!attempt) return fail('invalid_state');
    if (req.query.error) return fail(req.query.error === 'access_denied' ? 'cancelled' : 'failed');
    if (typeof req.query.code !== 'string' || !req.query.code || req.query.code.length > 4096) return fail('failed');
    const payload = await googleIdentityProvider.verifyAuthorizationCode(req.query.code, attempt, config);
    const identity = validateGoogleIdentity(payload, attempt.nonce, config);
    const user = await existingGoogleUser(identity);
    if (!user) return fail('account_unavailable');
    const code = crypto.randomBytes(32).toString('base64url');
    await GoogleLoginCode.create({
      codeHash: hashLoginSecret(code), browserChallenge: attempt.browserChallenge,
      userId: user._id, tokenVersion: user.tokenVersion || 0, expiresAt: new Date(Date.now() + 60000)
    });
    return res.redirect(frontendCallback(config, { code }));
  } catch { return fail('failed'); }
}

export async function exchangeGoogleLogin(req, res) {
  noStore(res);
  if (!googleLoginConfig()) return res.status(503).json({ error: 'Google sign-in is not configured' });
  const { code, verifier } = req.body || {};
  if (typeof code !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(code) || typeof verifier !== 'string' || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return res.status(400).json({ error: 'Invalid Google sign-in response' });
  try {
    const login = await GoogleLoginCode.findOneAndDelete({ codeHash: hashLoginSecret(code), browserChallenge: loginChallenge(verifier), expiresAt: { $gt: new Date() } });
    if (!login) return res.status(401).json({ error: 'Google sign-in expired. Please start again.' });
    const user = await User.findById(login.userId);
    if (!user?.isActive || (user.tokenVersion || 0) !== login.tokenVersion) return res.status(401).json({ error: 'This account is unavailable. Contact your YDesk administrator.' });
    return res.json(await createWebSession(user, req, res, 'GOOGLE_SSO'));
  } catch { return res.status(503).json({ error: 'Google sign-in could not complete. Please try again.' }); }
}
