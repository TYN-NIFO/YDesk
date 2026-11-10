import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { MongoMemoryServer } from 'mongodb-memory-server';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'isolated-google-sso-test-secret';
process.env.RATE_LIMIT_MAX_REQUESTS = '2000';
Object.assign(process.env, {
  GOOGLE_CLIENT_ID: 'fixture-client.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'fixture-google-secret',
  GOOGLE_REDIRECT_URI: 'http://127.0.0.1:5000/api/auth/google/callback', FRONTEND_URL: 'http://localhost:3000', GOOGLE_WORKSPACE_DOMAINS: 'company.test'
});
const { app } = await import('../server.js');
const { default: User } = await import('../models/User.js');
const { GoogleLoginAttempt, GoogleLoginCode } = await import('../models/GoogleLogin.js');
const { googleIdentityProvider, hashLoginSecret, loginChallenge } = await import('../services/googleIdentity.js');
const { revokeSessions } = await import('../services/sessionService.js');
let database, server, base, users;
let payloadOverrides = {}, googleCalls = 0, selectedUser, providerFailure = false;
const originalProvider = googleIdentityProvider.verifyAuthorizationCode;
before(async () => {
  database = await MongoMemoryServer.create(); await mongoose.connect(database.getUri());
  users = [];
  for (const role of ['employee', 'supervisor', 'finance_manager', 'admin', 'executive']) {
    const user = new User({ _id: new mongoose.Types.ObjectId(), name: role, email: `${role}@company.test`, role, grievanceAccess: role === 'executive' ? 'summary' : null });
    user.createdBy = user._id; user.password = 'GoogleSsoFixturePassword!'; await user.save(); users.push(user);
  }
  googleIdentityProvider.verifyAuthorizationCode = async (code, attempt) => {
    googleCalls++;
    if (providerFailure) throw new Error('PRIVATE_PROVIDER_FAILURE');
    return { iss: 'https://accounts.google.com', aud: process.env.GOOGLE_CLIENT_ID, exp: Math.floor(Date.now() / 1000) + 3600,
      sub: `google-${selectedUser._id}`, email: selectedUser.email, email_verified: true, hd: 'company.test', nonce: attempt.nonce, ...payloadOverrides };
  };
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); base = `http://127.0.0.1:${server.address().port}/api/auth/google`;
});
after(async () => {
  googleIdentityProvider.verifyAuthorizationCode = originalProvider;
  if (server) await new Promise(resolve => server.close(resolve)); await mongoose.disconnect(); if (database) await database.stop();
});
async function begin() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const response = await fetch(`${base}/start?challenge=${loginChallenge(verifier)}`, { redirect: 'manual' });
  assert.equal(response.status, 302);
  const google = new URL(response.headers.get('location'));
  const cookie = response.headers.get('set-cookie').match(/googleLoginState=[^;]+/)[0];
  return { verifier, google, cookie, response, state: google.searchParams.get('state') };
}
async function callback(attempt, extra = '') {
  return fetch(`${base}/callback?state=${attempt.state}&code=fixture-authorization-code${extra}`, { headers: { Cookie: attempt.cookie }, redirect: 'manual' });
}
async function authorize(user, overrides = {}) {
  selectedUser = user; payloadOverrides = overrides; providerFailure = false;
  const attempt = await begin(); const response = await callback(attempt); const location = new URL(response.headers.get('location'));
  return { ...attempt, response, location, params: new URLSearchParams(location.hash.slice(1)) };
}
const exchange = (code, verifier) => fetch(`${base}/exchange`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, verifier }) });

test('Google status exposes only enablement and invalid start challenges are rejected', async () => {
  const config = await fetch(`${base}/config`); assert.deepEqual(await config.json(), { enabled: true });
  assert.equal((await fetch(`${base}/start?challenge=bad`, { redirect: 'manual' })).status, 400);
});
test('Google start binds state, nonce and PKCE with an HTTP-only SameSite=Lax cookie', async () => {
  const attempt = await begin(); const params = attempt.google.searchParams;
  assert.equal(attempt.google.origin, 'https://accounts.google.com');
  assert.equal(params.get('code_challenge_method'), 'S256'); assert.equal(params.get('hd'), 'company.test');
  assert.ok(params.get('scope').includes('openid')); assert.ok(attempt.response.headers.get('set-cookie').includes('HttpOnly')); assert.ok(attempt.response.headers.get('set-cookie').includes('SameSite=Lax'));
  const stored = await GoogleLoginAttempt.findOne({ stateHash: hashLoginSecret(attempt.state) }).lean();
  assert.equal(params.get('nonce'), stored.nonce); assert.equal(params.get('code_challenge'), loginChallenge(stored.codeVerifier)); assert.ok(!JSON.stringify(stored).includes(attempt.state));
});
test('Google callback rejects a missing or wrong browser state before contacting Google', async () => {
  const attempt = await begin(); const count = googleCalls;
  const response = await fetch(`${base}/callback?state=${attempt.state}&code=fixture`, { redirect: 'manual' });
  assert.ok(response.headers.get('location').includes('invalid_state')); assert.equal(googleCalls, count);
});
for (const role of ['employee', 'supervisor', 'finance_manager', 'admin', 'executive']) {
  test(`${role}: Google login retains the existing account, password, role and feedback access`, async () => {
    const user = users.find(user => user.role === role); const before = await User.findById(user._id).lean();
    const attempt = await authorize(user); assert.ok(attempt.params.get('code')); assert.ok(!attempt.location.search); assert.ok(!attempt.location.href.includes('accessToken'));
    const response = await exchange(attempt.params.get('code'), attempt.verifier); assert.equal(response.status, 200);
    const body = await response.json(); assert.equal(body.user._id, String(user._id)); assert.equal(body.user.email, before.email); assert.equal(body.user.role, role); assert.equal(body.user.grievanceAccess, before.grievanceAccess); assert.equal(body.user.googleSubject, undefined); assert.equal(body.user.passwordHash, undefined);
    const token = jwt.verify(body.accessToken, process.env.JWT_SECRET); assert.equal(token.type, 'access'); assert.equal(token.userId, String(user._id));
    assert.ok(response.headers.get('set-cookie').includes('HttpOnly'));
    const after = await User.findById(user._id).select('+googleSubject').lean(); assert.equal(after.passwordHash, before.passwordHash); assert.equal(after.googleSubject, `google-${user._id}`);
  });
}
test('Google handoff requires browser proof and can only be exchanged once', async () => {
  const attempt = await authorize(users[0]); const code = attempt.params.get('code');
  assert.equal((await exchange(code, crypto.randomBytes(32).toString('base64url'))).status, 401);
  assert.equal((await exchange(code, attempt.verifier)).status, 200); assert.equal((await exchange(code, attempt.verifier)).status, 401);
  assert.ok((await callback(attempt)).headers.get('location').includes('invalid_state'));
});
test('revocation or deactivation between Google verification and exchange blocks login', async () => {
  const user = users[0]; const revoked = await authorize(user); await revokeSessions(user._id);
  assert.equal((await exchange(revoked.params.get('code'), revoked.verifier)).status, 401);
  const disabled = await authorize(user); await User.updateOne({ _id: user._id }, { isActive: false });
  try { assert.equal((await exchange(disabled.params.get('code'), disabled.verifier)).status, 401); }
  finally { await User.updateOne({ _id: user._id }, { isActive: true }); }
});
test('unregistered Google accounts cannot create users and a different Google subject cannot take over an account', async () => {
  const count = await User.countDocuments();
  const unknown = await authorize(users[0], { sub: 'unregistered-google', email: 'unregistered@company.test' }); assert.equal(unknown.params.get('error'), 'account_unavailable'); assert.equal(await User.countDocuments(), count);
  const collision = await authorize(users[0], { sub: 'different-google-subject' }); assert.equal(collision.params.get('error'), 'account_unavailable');
});
test('Google subject remains the identity when the verified Workspace email changes', async () => {
  const attempt = await authorize(users[0], { email: 'renamed@company.test' }); const response = await exchange(attempt.params.get('code'), attempt.verifier);
  assert.equal(response.status, 200); assert.equal((await response.json()).user.email, users[0].email);
});
for (const [name, override] of Object.entries({
  issuer: { iss: 'https://attacker.example' }, audience: { aud: 'different-app' }, expiry: { exp: 1 },
  verification: { email_verified: false }, nonce: { nonce: 'wrong-nonce' }, workspace: { hd: 'other-company.test' }, missingWorkspace: { hd: undefined }
})) {
  test(`Google callback rejects invalid ${name}`, async () => { const attempt = await authorize(users[0], override); assert.equal(attempt.params.get('error'), 'failed'); });
}
test('expired attempts and handoffs are refused even before TTL cleanup', async () => {
  const expired = await begin(); await GoogleLoginAttempt.updateOne({ stateHash: hashLoginSecret(expired.state) }, { expiresAt: new Date(0) }); assert.ok((await callback(expired)).headers.get('location').includes('invalid_state'));
  const handoff = await authorize(users[0]); await GoogleLoginCode.updateOne({ codeHash: hashLoginSecret(handoff.params.get('code')) }, { expiresAt: new Date(0) }); assert.equal((await exchange(handoff.params.get('code'), handoff.verifier)).status, 401);
});
test('administrator-approved Google aliases retain the existing login, while mail delivery aliases do not grant login', async () => {
  const user = new User({ _id: new mongoose.Types.ObjectId(), name: 'Alias fixture', email: 'legacy@example.test', role: 'executive', googleLoginEmail: 'approved@company.test', weeklySummaryEmail: 'delivery-only@company.test' }); user.createdBy = user._id; user.password = 'AliasFixturePassword!'; await user.save();
  const denied = await authorize(user, { sub: 'not-linked-yet', email: 'delivery-only@company.test' }); assert.equal(denied.params.get('error'), 'account_unavailable');
  const approved = await authorize(user, { email: 'approved@company.test' }); const response = await exchange(approved.params.get('code'), approved.verifier); assert.equal(response.status, 200); assert.equal((await response.json()).user.email, user.email);
});
test('provider cancellation and failures return safe errors without tokens or provider details', async () => {
  selectedUser = users[0]; payloadOverrides = {}; const attempt = await begin();
  assert.ok((await callback(attempt, '&error=access_denied')).headers.get('location').includes('cancelled'));
  const failed = await begin(); providerFailure = true;
  try { const response = await callback(failed); assert.ok(response.headers.get('location').endsWith('#error=failed')); assert.ok(!response.headers.get('location').includes('PRIVATE_PROVIDER')); }
  finally { providerFailure = false; }
});
test('Google sign-in stays disabled without credentials and leaves password login available', async () => {
  const saved = process.env.GOOGLE_CLIENT_SECRET; delete process.env.GOOGLE_CLIENT_SECRET;
  try { assert.deepEqual(await (await fetch(`${base}/config`)).json(), { enabled: false }); assert.equal((await fetch(`${base}/start?challenge=${'a'.repeat(43)}`)).status, 503); }
  finally { process.env.GOOGLE_CLIENT_SECRET = saved; }
  const passwordLogin = await fetch(base.replace('/google', '/token/'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: users[0].email, password: 'GoogleSsoFixturePassword!' }) }); assert.equal(passwordLogin.status, 200);
});
