import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { Readable } from 'node:stream';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'isolated-tests-only-secret-not-for-deployment';
process.env.AWS_S3_BUCKET_NAME = 'test-receipts';
process.env.AWS_REGION = 'us-east-1';
process.env.RATE_LIMIT_MAX_REQUESTS = '2000';
delete process.env.RESEND_API_KEY;
delete process.env.RESEND_FROM;

const { app } = await import('../server.js');
const { generateAccessToken } = await import('../controllers/authController.js');
const { default: User } = await import('../models/User.js');
const { default: Claim } = await import('../models/Claim.js');
const { default: Policy } = await import('../models/Policy.js');
const { default: RefreshToken } = await import('../models/RefreshToken.js');
const { OAuthRefreshToken, OAuthCode } = await import('../models/OAuth.js');
const { default: storage } = await import('../services/storage.js');
const { privateStorageService, StorageService } = await import('../services/storage.js');
const { default: Grievance } = await import('../models/Grievance.js');
const { validateAgainstPolicy } = await import('../services/policyValidation.js');
const { validCategories } = await import('../lib/categoryMaster.js');
const { default: smtpService } = await import('../services/emailService.js');
const { default: gridService } = await import('../services/sendgridEmailService.js');
const { default: resendService } = await import('../services/resendEmailService.js');
const { notifyGrievanceCreated, notifyGrievanceStatusChanged } = await import('../services/grievanceNotifications.js');
const { summaryWeek, buildWeeklyFeedbackSummary, sendWeeklyFeedbackSummary, mailIsConfigured } = await import('../services/weeklyFeedbackSummary.js');
const { default: WeeklySummaryDelivery } = await import('../models/WeeklySummaryDelivery.js');
const { default: WeeklyReport } = await import('../models/WeeklyReport.js');
let database, server, base, employee, other, finance, admin, supervisor, executive;

before(async () => {
  database = await MongoMemoryServer.create();
  await mongoose.connect(database.getUri());
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  const makeUser = async (role, name) => {
    const user = new User({ _id: new mongoose.Types.ObjectId(), name, email: `${name}@example.test`, role });
    user.createdBy = user._id;
    user.password = 'TestPassword123!';
    return user.save();
  };
  employee = await makeUser('employee', 'employee');
  other = await makeUser('employee', 'other');
  finance = await makeUser('finance_manager', 'finance');
  admin = await makeUser('admin', 'admin');
  supervisor = await makeUser('supervisor', 'supervisor');
  executive = await makeUser('executive', 'executive');
  smtpService.sendEmail = async () => ({ success: true });
  gridService.sendEmail = async () => ({ success: true });
  await Policy.create({ claimCategories: validCategories, requiredDocuments: { default: [] }, exchangeRates: { USD: 80, EUR: 90 } });
  storage.save = async file => ({ fileId: 'test-file', storageKey: 'test-file.pdf', name: file.originalname, size: file.size, mime: file.mimetype, url: 'https://test-receipts.s3.us-east-1.amazonaws.com/test-file.pdf' });
  storage.remove = async () => {};
  storage.get = async () => ({ body: Readable.from(['receipt']), contentType: 'application/pdf' });
});

after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await mongoose.disconnect();
  if (database) await database.stop();
});

async function request(path, { user, method = 'GET', body, cookie, token } = {}) {
  const headers = {};
  if (user || token) headers.Authorization = `Bearer ${token || generateAccessToken(await User.findById(user._id))}`;
  if (cookie) headers.Cookie = cookie;
  if (body) headers['Content-Type'] = 'application/json';
  return fetch(`${base}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
}

const item = () => ({ date: '2026-01-01', subCategory: 'Supplies', description: 'Office supplies for the project', currency: 'INR', amount: 100, gstTotal: 18, amountInINR: 99999, attachments: [] });
const data = () => ({ businessUnit: 'General', category: validCategories[0], lineItems: [item()], advances: [] });
async function claim(user = employee, status = 'submitted') {
  return Claim.create({ ...data(), employeeId: user._id, createdBy: user._id, grandTotal: 118, netPayable: 118, status });
}
async function submit(payload, files = []) {
  const form = new FormData();
  form.set('claimData', JSON.stringify(payload));
  for (const file of files) form.append('files', new Blob(['receipt'], { type: 'application/pdf' }), file);
  return fetch(`${base}/api/claims`, { method: 'POST', headers: { Authorization: `Bearer ${generateAccessToken(await User.findById(employee._id))}` }, body: form });
}

test('employee cannot elevate their role', async () => {
  const response = await request(`/api/users/${employee._id}`, { user: employee, method: 'PATCH', body: { name: employee.name, email: employee.email, role: 'admin' } });
  assert.equal(response.status, 403);
  assert.equal((await User.findById(employee._id)).role, 'employee');
});

test('local preview origins are allowed for cookie-based session refresh', async () => {
  const response = await fetch(`${base}/api/health`, { headers: { Origin: 'http://127.0.0.1:3001' } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://127.0.0.1:3001');
  assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
});

test('financial export requires an authorized role', async () => {
  assert.equal((await request('/api/excel/getClaimsExcel')).status, 401);
  assert.equal((await request('/api/excel/getClaimsExcel', { user: employee })).status, 403);
  assert.equal((await request('/api/excel/getClaimsExcel', { user: finance })).status, 200);
});

test('claim totals are calculated from amount and GST, never client INR totals', async () => {
  const response = await submit(data());
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.equal(result.grandTotal, 118);
  assert.equal(result.lineItems[0].amountInINR, 118);
});

test('invalid money, advances and empty claims are rejected', async () => {
  for (const payload of [{ ...data(), lineItems: [] }, { ...data(), lineItems: [{ ...item(), amountInINR: -5 }] }, { ...data(), advances: [{ amount: -1 }] }]) {
    assert.equal((await submit(payload)).status, 400);
  }
});

test('foreign currency uses configured server rates', async () => {
  const response = await submit({ ...data(), lineItems: [{ ...item(), currency: 'USD' }] });
  assert.equal(response.status, 201);
  assert.equal((await response.json()).grandTotal, 9440);
});

test('claim editing rejects status, ownership and payment injection', async () => {
  const created = await claim();
  for (const injected of [{ status: 'paid' }, { employeeId: other._id }, { payment: { channel: 'Cash' } }, { financeApproval: { status: 'approved' } }]) {
    const response = await request(`/api/claims/${created._id}`, { user: employee, method: 'PATCH', body: { ...data(), ...injected } });
    assert.equal(response.status, 400);
  }
  assert.equal((await Claim.findById(created._id)).status, 'submitted');
});

test('editing approved expenses resets approval and settled expenses cannot be edited', async () => {
  const approved = await claim(employee, 'finance_approved');
  const response = await request(`/api/claims/${approved._id}`, { user: finance, method: 'PATCH', body: data() });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, 'submitted');
  const paid = await claim(employee, 'paid');
  assert.equal((await request(`/api/claims/${paid._id}`, { user: admin, method: 'PATCH', body: data() })).status, 403);
});

test('attachment mutation requires claim access and a mutable status', async () => {
  const created = await claim();
  assert.equal((await request(`/api/claims/${created._id}/upload`, { user: other, method: 'POST' })).status, 403);
  const paid = await claim(employee, 'paid');
  assert.equal((await request(`/api/claims/${paid._id}/upload`, { user: employee, method: 'POST' })).status, 403);
});

test('supervisors can read their own claims', async () => {
  const created = await claim(supervisor);
  assert.equal((await request(`/api/claims/${created._id}`, { user: supervisor })).status, 200);
});

test('employees cannot read another employee claim details', async () => {
  const created = await claim();
  assert.equal((await request(`/api/claims/${created._id}`, { user: other })).status, 403);
});

test('approval actions are validated and payment reference is retained', async () => {
  const created = await claim();
  assert.equal((await request(`/api/claims/${created._id}/finance-approve`, { user: finance, method: 'POST', body: { action: 'invalid' } })).status, 400);
  assert.equal((await request(`/api/claims/${created._id}/finance-approve`, { user: finance, method: 'POST', body: { action: 'approve' } })).status, 200);
  const paid = await request(`/api/claims/${created._id}/mark-paid`, { user: finance, method: 'POST', body: { channel: 'Bank Transfer', reference: 'LOCAL-TEST' } });
  assert.equal(paid.status, 200);
  assert.equal((await paid.json()).payment.reference, 'LOCAL-TEST');
});

test('refresh rotates once and logout revokes access and OAuth sessions', async () => {
  const login = await request('/api/auth/token/', { method: 'POST', body: { email: employee.email, password: 'TestPassword123!' } });
  assert.equal(login.status, 200);
  const originalCookie = login.headers.get('set-cookie').split(';')[0];
  assert.match(login.headers.get('set-cookie'), /Path=\/api\/auth\//);
  const refreshed = await request('/api/auth/refresh/', { method: 'POST', cookie: originalCookie });
  assert.equal(refreshed.status, 200);
  assert.equal((await request('/api/auth/refresh/', { method: 'POST', cookie: originalCookie })).status, 401);
  const { accessToken } = await refreshed.json();
  const cookie = refreshed.headers.get('set-cookie').split(';')[0];
  await OAuthRefreshToken.create({ tokenHash: 'test-oauth', clientId: 'test', userId: employee._id, expiresAt: new Date(Date.now() + 60000) });
  await OAuthCode.create({ codeHash: 'test-code', clientId: 'test', userId: employee._id, codeChallenge: 'test', redirectUri: 'http://localhost', expiresAt: new Date(Date.now() + 60000) });
  assert.equal((await request('/api/auth/logout/', { method: 'POST', token: accessToken, cookie })).status, 200);
  assert.equal((await request('/api/auth/me/', { token: accessToken })).status, 401);
  assert.equal((await request('/api/auth/refresh/', { method: 'POST', cookie })).status, 401);
  assert.equal(await OAuthRefreshToken.countDocuments({ userId: employee._id }), 0);
  assert.equal(await OAuthCode.countDocuments({ userId: employee._id }), 0);
});

test('refresh token digest is deterministic and verifies correctly', () => {
  const digest = RefreshToken.hashToken('example');
  assert.equal(digest, RefreshToken.hashToken('example'));
  assert.equal(new RefreshToken({ tokenHash: digest }).verifyToken('example'), true);
  assert.equal(new RefreshToken({ tokenHash: digest }).verifyToken('wrong'), false);
});

test('storage failures do not create claims with missing evidence', async () => {
  const original = storage.save;
  const count = await Claim.countDocuments();
  storage.save = async () => { throw new Error('Simulated storage outage'); };
  try {
    assert.equal((await submit(data(), ['receipt.pdf'])).status, 500);
    assert.equal(await Claim.countDocuments(), count);
  } finally { storage.save = original; }
});

test('canonical policy can be saved and required receipts are enforced', async () => {
  const current = await Policy.findOne().lean();
  const response = await request('/api/policy', { user: admin, method: 'PUT', body: { ...current, version: 'test-v2', mealCaps: { A: { lunch: 10 } }, lodgingCaps: { A: 100 }, requiredDocuments: { default: ['supporting_doc'] }, rulesBehavior: { missingDocuments: 'hard', capExceeded: 'hard' }, maxFileSizeMB: 4 } });
  assert.equal(response.status, 200);
  assert.equal((await submit(data())).status, 400);
  assert.equal((await submit(data(), ['receipt.pdf'])).status, 201);
});

test('meal and lodging caps honor hard and soft policy behavior', async () => {
  const policy = { claimCategories: validCategories, requiredDocuments: {}, mealCaps: { A: { lunch: 100 } }, lodgingCaps: { A: 100 }, rulesBehavior: { capExceeded: 'hard' } };
  for (const subCategory of ['Lunch', 'Hotel']) {
    const payload = { ...data(), lineItems: [{ ...item(), subCategory, amountInINR: 200 }] };
    assert.equal((await validateAgainstPolicy(payload, policy)).isValid, false);
    assert.equal((await validateAgainstPolicy(payload, { ...policy, rulesBehavior: { capExceeded: 'soft' } })).isValid, true);
  }
});

test('finance users cannot approve their own claims', async () => {
  const created = await claim(finance);
  assert.equal((await request(`/api/claims/${created._id}/finance-approve`, { user: finance, method: 'POST', body: { action: 'approve' } })).status, 403);
});

test('only one concurrent payment transition succeeds', async () => {
  const created = await claim(employee, 'finance_approved');
  const responses = await Promise.all([1, 2].map(() => request(`/api/claims/${created._id}/mark-paid`, { user: finance, method: 'POST', body: { channel: 'Cash' } })));
  assert.equal(responses.filter(response => response.status === 200).length, 1);
  assert.ok(responses.some(response => [400, 409].includes(response.status)));
});

test('confidential storage rejects missing or shared bucket configuration', async () => {
  const previous = process.env.AWS_S3_PRIVATE_BUCKET_NAME;
  try {
    delete process.env.AWS_S3_PRIVATE_BUCKET_NAME;
    await assert.rejects(new StorageService({ privateFiles: true }).ensureS3Initialized(), /PRIVATE_BUCKET/);
    process.env.AWS_S3_PRIVATE_BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME;
    await assert.rejects(new StorageService({ privateFiles: true }).ensureS3Initialized(), /separate private bucket/);
  } finally {
    if (previous) process.env.AWS_S3_PRIVATE_BUCKET_NAME = previous;
    else delete process.env.AWS_S3_PRIVATE_BUCKET_NAME;
  }
});

test('grievance ownership, private downloads and handler transitions are enforced', async () => {
  const originalSave = privateStorageService.save;
  const originalGet = privateStorageService.get;
  privateStorageService.save = async file => ({ fileId: 'confidential', storageKey: 'confidential.pdf', name: file.originalname, size: file.size, mime: file.mimetype });
  privateStorageService.get = async () => ({ body: Readable.from(['private document']), contentType: 'application/pdf' });
  try {
    const form = new FormData();
    form.set('category', 'Policy/Process');
    form.set('subject', 'Please review this process');
    form.set('description', 'A local regression test concern with sufficient detail.');
    form.append('files', new Blob(['private document'], { type: 'application/pdf' }), 'private.pdf');
    const response = await fetch(`${base}/api/grievances`, { method: 'POST', headers: { Authorization: `Bearer ${generateAccessToken(await User.findById(other._id))}` }, body: form });
    assert.equal(response.status, 201);
    const { grievance } = await response.json();
    const detail = `/api/grievances/${grievance.grievanceId}`;
    assert.equal((await request(detail, { user: employee })).status, 404);
    assert.equal((await request(`${detail}/attachments/confidential`, { user: other })).status, 200);
    assert.equal((await request(`${detail}/attachments/confidential`, { user: employee })).status, 404);
    assert.equal((await request(`${detail}/status`, { user: other, method: 'PATCH', body: { status: 'resolved', note: 'Local outcome' } })).status, 403);
    await User.updateOne({ _id: admin._id }, { $set: { grievanceAccess: 'handler' } });
    assert.equal((await request(`${detail}/status`, { user: admin, method: 'PATCH', body: { status: 'resolved', note: 'Local outcome' } })).status, 200);
    assert.equal((await request(`/api/users/${other._id}`, { user: admin, method: 'DELETE' })).status, 400);
    assert.equal((await Grievance.findOne({ grievanceId: grievance.grievanceId })).attachments[0].privateStorage, true);
  } finally { privateStorageService.save = originalSave; privateStorageService.get = originalGet; }
});

test('admin session revocation immediately invalidates an existing JWT', async () => {
  const token = generateAccessToken(await User.findById(supervisor._id));
  assert.equal((await request(`/api/auth/revoke/${supervisor._id}/`, { user: admin, method: 'POST' })).status, 200);
  assert.equal((await request('/api/auth/me/', { token })).status, 401);
});

test('avatar upload returns the S3 URL rather than a nonexistent local path', async () => {
  const form = new FormData();
  form.set('avatar', new Blob(['image'], { type: 'image/png' }), 'avatar.png');
  const response = await fetch(`${base}/api/auth/avatar/`, { method: 'POST', headers: { Authorization: `Bearer ${generateAccessToken(await User.findById(employee._id))}` }, body: form });
  assert.equal(response.status, 200);
  assert.match((await response.json()).avatarUrl, /^https:\/\//);
});

const roleUsers = {
  employee: () => employee, supervisor: () => supervisor, finance_manager: () => finance,
  admin: () => admin, executive: () => executive
};

async function feedback(user, overrides = {}) {
  return Grievance.create({ employeeId: user._id, category: 'Policy/Process', subject: 'Private feedback subject', description: 'PRIVATE_DESCRIPTION_DO_NOT_EMAIL', feedbackType: 'suggestion', ...overrides });
}

for (const [role, getUser] of Object.entries(roleUsers)) {
  test(`${role}: submit and read own feedback; cannot read or act on another person's feedback`, async () => {
    const user = getUser();
    await User.updateOne({ _id: user._id }, { $set: { grievanceAccess: null } });
    const response = await request('/api/feedback', { user, method: 'POST', body: { category: 'Ideas & Suggestions', feedbackType: 'suggestion', subject: 'A better onboarding checklist', description: 'Please consider adding a shared onboarding checklist for the team.' } });
    assert.equal(response.status, 201);
    const created = (await response.json()).grievance;
    assert.equal(created.feedbackType, 'suggestion');
    assert.match(created.grievanceId, /^feedback_/);
    assert.equal((await request(`/api/feedback/${created.grievanceId}`, { user })).status, 200);
    const ownList = await (await request('/api/feedback?feedbackType=suggestion', { user })).json();
    assert.ok(ownList.grievances.some(record => record.grievanceId === created.grievanceId));
    assert.ok(ownList.grievances.every(record => record.employeeId._id === user._id.toString()));
    const foreign = await feedback(other);
    assert.equal((await request(`/api/feedback/${foreign.grievanceId}`, { user })).status, 404);
    assert.equal((await request('/api/feedback?scope=all', { user })).status, 403);
    assert.equal((await request('/api/feedback/summary', { user })).status, 403);
    assert.equal((await request(`/api/feedback/${foreign.grievanceId}/status`, { user, method: 'PATCH', body: { status: 'resolved', note: 'Not permitted' } })).status, 403);
    assert.equal((await request('/api/users', { user })).status, role === 'admin' ? 200 : 403);
    assert.equal((await request('/api/leaves/pending', { user })).status, role === 'executive' ? 200 : 403);
  });

  test(`${role}: designated handlers can review others, never themselves`, async () => {
    const user = getUser();
    await User.updateOne({ _id: user._id }, { $set: { grievanceAccess: 'handler' } });
    try {
      const owned = await feedback(user);
      const foreign = await feedback(other);
      assert.equal((await request('/api/feedback?scope=all', { user })).status, 200);
      assert.equal((await request(`/api/feedback/${foreign.grievanceId}`, { user })).status, 200);
      assert.equal((await request(`/api/feedback/${owned.grievanceId}/status`, { user, method: 'PATCH', body: { status: 'resolved', note: 'Cannot handle own feedback' } })).status, 403);
      assert.equal((await request(`/api/feedback/${foreign.grievanceId}/status`, { user, method: 'PATCH', body: { status: 'resolved', note: 'Reviewed this suggestion' } })).status, 200);
      assert.equal((await request(`/api/feedback/${foreign.grievanceId}/status`, { user, method: 'PATCH', body: { status: 'submitted' } })).status, 400);
    } finally { await User.updateOne({ _id: user._id }, { $set: { grievanceAccess: null } }); }
  });

  test(`${role}: summary access never grants access to private feedback details`, async () => {
    const user = getUser();
    await User.updateOne({ _id: user._id }, { $set: { grievanceAccess: 'summary' } });
    try {
      const foreign = await feedback(other, { attachments: [{ fileId: 'private-summary-test', storageKey: 'private-summary-test.pdf', name: 'private.pdf', mime: 'application/pdf', size: 7, privateStorage: true }] });
      const response = await request('/api/feedback/summary', { user });
      assert.equal(response.status, 200);
      const summary = await response.json();
      const payload = JSON.stringify(summary);
      assert.ok(!payload.includes('PRIVATE_DESCRIPTION_DO_NOT_EMAIL'));
      assert.ok(!payload.includes('Private feedback subject'));
      assert.ok(!payload.includes(other.email));
      assert.equal((await request(`/api/feedback/${foreign.grievanceId}`, { user })).status, 404);
      assert.equal((await request(`/api/feedback/${foreign.grievanceId}/attachments/private-summary-test`, { user })).status, 404);
      const owned = await feedback(user);
      assert.equal((await request(`/api/feedback/${owned.grievanceId}`, { user })).status, 200);
      assert.equal((await request('/api/feedback?scope=all', { user })).status, 403);
      assert.equal((await request(`/api/feedback/${foreign.grievanceId}/status`, { user, method: 'PATCH', body: { status: 'closed', note: 'Not permitted' } })).status, 403);
    } finally { await User.updateOne({ _id: user._id }, { $set: { grievanceAccess: null } }); }
  });
}

test('feedback form metadata excludes workload and grievance choices', async () => {
  const response = await request('/api/feedback/meta', { user: employee });
  assert.equal(response.status, 200);
  const meta = await response.json();
  assert.ok(!meta.categories.includes('Workload & Hours'));
  assert.deepEqual(meta.feedbackTypes, ['general', 'suggestion', 'appreciation', 'concern']);
  for (const invalid of [{ category: 'Workload & Hours' }, { feedbackType: 'grievance' }]) {
    assert.equal((await request('/api/feedback', { user: employee, method: 'POST', body: { category: 'Policy/Process', feedbackType: 'general', subject: 'Feedback submission', description: 'This feedback contains enough context for a reviewer.', ...invalid } })).status, 400);
  }
  for (const feedbackType of meta.feedbackTypes) {
    const created = await request('/api/feedback', { user: employee, method: 'POST', body: { category: 'Other', feedbackType, subject: 'Feedback submission', description: 'This feedback contains enough context for a reviewer.' } });
    assert.equal(created.status, 201);
    assert.equal((await created.json()).grievance.feedbackType, feedbackType);
  }
});

test('legacy records and API links remain accessible without a data migration', async () => {
  const legacy = await feedback(employee, { grievanceId: 'grievance_2025_99999', category: 'Workload & Hours' });
  assert.equal((await request(`/api/feedback/${legacy.grievanceId}`, { user: employee })).status, 200);
  assert.equal((await request(`/api/grievances/${legacy.grievanceId}`, { user: employee })).status, 200);
  await User.updateOne({ _id: admin._id }, { $set: { grievanceAccess: 'handler' } });
  assert.equal((await request(`/api/feedback/${legacy.grievanceId}/status`, { user: admin, method: 'PATCH', body: { status: 'resolved', note: 'Review legacy feedback' } })).status, 200);
});

test('SMTP, SendGrid, and Resend notifications exclude private content', async () => {
  const savedKey = process.env.SENDGRID_API_KEY;
  const savedResendKey = process.env.RESEND_API_KEY;
  const smtp = smtpService.sendEmail;
  const grid = gridService.sendEmail;
  const resend = resendService.sendEmail;
  const messages = [];
  smtpService.sendEmail = gridService.sendEmail = resendService.sendEmail = async message => { messages.push(message); return { success: true }; };
  try {
    const record = await feedback(employee);
    for (const provider of ['smtp', 'sendgrid', 'resend']) {
      delete process.env.RESEND_API_KEY;
      if (provider === 'resend') process.env.RESEND_API_KEY = 're_mock_no_network';
      if (provider === 'sendgrid') process.env.SENDGRID_API_KEY = 'mock-key-no-network';
      else delete process.env.SENDGRID_API_KEY;
      await notifyGrievanceCreated(record, employee);
      await notifyGrievanceStatusChanged(record, employee, 'PRIVATE_NOTE_DO_NOT_EMAIL');
    }
    assert.equal(messages.length, 9);
    for (const message of messages) {
      assert.ok(/feedback/i.test(message.subject));
      assert.ok(!JSON.stringify(message).includes('PRIVATE_DESCRIPTION_DO_NOT_EMAIL'));
      assert.ok(!JSON.stringify(message).includes('PRIVATE_NOTE_DO_NOT_EMAIL'));
      assert.match(message.html, /\/feedback/);
    }
  } finally {
    smtpService.sendEmail = smtp;
    gridService.sendEmail = grid;
    resendService.sendEmail = resend;
    if (savedResendKey) process.env.RESEND_API_KEY = savedResendKey;
    else delete process.env.RESEND_API_KEY;
    if (savedKey) process.env.SENDGRID_API_KEY = savedKey;
    else delete process.env.SENDGRID_API_KEY;
  }
});

test('weekly summary covers the current Monday-to-send-time week in IST', () => {
  const now = new Date('2026-11-06T12:30:00Z');
  const week = summaryWeek(now);
  assert.equal(week.start.toISOString(), '2026-11-01T18:30:00.000Z');
  assert.equal(week.end.toISOString(), now.toISOString());
});

test('mail readiness requires a provider and a sender', () => {
  const keys = ['SENDGRID_API_KEY', 'EMAIL_FROM', 'SMTP_FROM', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    keys.forEach(key => delete process.env[key]);
    assert.equal(mailIsConfigured(), false);
    process.env.SENDGRID_API_KEY = 'mock-key';
    assert.equal(mailIsConfigured(), false);
    process.env.EMAIL_FROM = 'sender@example.test';
    assert.equal(mailIsConfigured(), true);
    delete process.env.SENDGRID_API_KEY;
    Object.assign(process.env, { SMTP_HOST: 'smtp.example.test', SMTP_USER: 'sender', SMTP_PASS: 'mock-password', SMTP_FROM: 'sender@example.test' });
    assert.equal(mailIsConfigured(), true);
  } finally {
    for (const key of keys) {
      if (previous[key] !== undefined) process.env[key] = previous[key];
      else delete process.env[key];
    }
  }
});

test('weekly summaries show subjects but never descriptions, escape subjects, and dry runs send no email', async () => {
  const now = new Date('2026-11-06T12:30:00Z');
  await feedback(employee, { createdAt: new Date('2026-11-03T04:00:00Z'), feedbackType: 'appreciation' });
  await feedback(employee, { createdAt: new Date('2026-11-03T05:00:00Z'), subject: '<img src=x onerror=alert(1)>' });
  await feedback(employee, {
    createdAt: new Date('2026-11-02T06:00:00Z'),
    status: 'resolved',
    resolvedAt: new Date('2026-11-04T06:00:00Z'),
    statusHistory: [
      { status: 'submitted', changedBy: employee._id, changedAt: new Date('2026-11-02T06:00:00Z') },
      { status: 'resolved', changedBy: admin._id, changedAt: new Date('2026-11-04T06:00:00Z') }
    ]
  });
  const summary = await buildWeeklyFeedbackSummary(now);
  assert.ok(summary.received >= 3);
  assert.ok(summary.text.includes('Submitted → Resolved'));
  assert.ok(summary.html.includes('Submitted → Resolved'));
  assert.ok(summary.text.includes('Private feedback subject'));
  assert.ok(summary.html.includes('Private feedback subject'));
  assert.ok(!summary.text.includes('PRIVATE_DESCRIPTION_DO_NOT_EMAIL'));
  assert.ok(!summary.html.includes('PRIVATE_DESCRIPTION_DO_NOT_EMAIL'));
  assert.ok(!summary.html.includes('<img src=x'));
  assert.ok(summary.html.includes('&lt;img src=x'));
  let calls = 0;
  const result = await sendWeeklyFeedbackSummary({ now, send: async () => { calls++; } });
  assert.equal(result.dryRun, true);
  assert.equal(calls, 0);
});

test('weekly emails are opt-in, sent only to active authorized viewers, and deduplicated', async () => {
  const previous = process.env.WEEKLY_SUMMARY_ENABLED;
  delete process.env.WEEKLY_SUMMARY_ENABLED;
  await assert.rejects(sendWeeklyFeedbackSummary({ dryRun: false, send: async () => {} }), /WEEKLY_SUMMARY_ENABLED/);
  process.env.WEEKLY_SUMMARY_ENABLED = 'true';
  await User.updateMany({}, { $set: { grievanceAccess: null } });
  await User.updateOne({ _id: admin._id }, { $set: { grievanceAccess: 'handler' } });
  await User.updateOne({ _id: executive._id }, { $set: { grievanceAccess: 'summary' } });
  await User.updateOne({ _id: other._id }, { $set: { grievanceAccess: 'handler', isActive: false } });
  const messages = [];
  try {
    const options = { now: new Date('2026-11-02T03:30:00Z'), dryRun: false, send: async message => { messages.push(message); } };
    const first = await sendWeeklyFeedbackSummary(options);
    assert.equal(first.sent, 2);
    assert.deepEqual(messages.map(message => message.to).sort(), [admin.email, executive.email].sort());
    const summaryMessage = messages.find(message => message.to === executive.email);
    assert.ok(summaryMessage.text.includes('Counts only'));
    assert.ok(!JSON.stringify(summaryMessage).includes('Private feedback subject'));
    assert.ok(!JSON.stringify(summaryMessage).includes('feedback_'));
    const second = await sendWeeklyFeedbackSummary(options);
    assert.equal(second.sent, 0);
    assert.equal(second.skipped, 2);
    assert.equal(await WeeklySummaryDelivery.countDocuments({ status: 'sent' }), 2);
  } finally {
    await User.updateOne({ _id: other._id }, { $set: { isActive: true, grievanceAccess: null } });
    if (previous) process.env.WEEKLY_SUMMARY_ENABLED = previous;
    else delete process.env.WEEKLY_SUMMARY_ENABLED;
  }
});

test('failed weekly deliveries can be retried without resending successful recipients', async () => {
  const previous = process.env.WEEKLY_SUMMARY_ENABLED;
  process.env.WEEKLY_SUMMARY_ENABLED = 'true';
  try {
    const now = new Date('2026-11-09T03:30:00Z');
    const failed = await sendWeeklyFeedbackSummary({ now, dryRun: false, send: async message => { if (message.to === admin.email) throw new Error('Simulated provider outage'); } });
    assert.equal(failed.failed, 1);
    assert.equal(failed.sent, 1);
    const retry = await sendWeeklyFeedbackSummary({ now, dryRun: false, send: async () => ({ success: true }) });
    assert.equal(retry.sent, 1);
    assert.equal(retry.skipped, 1);
  } finally {
    if (previous) process.env.WEEKLY_SUMMARY_ENABLED = previous;
    else delete process.env.WEEKLY_SUMMARY_ENABLED;
  }
});

test('changes made after one report are included in the next report without gaps', async () => {
  const previous = process.env.WEEKLY_SUMMARY_ENABLED;
  process.env.WEEKLY_SUMMARY_ENABLED = 'true';
  await User.updateMany({}, { $set: { grievanceAccess: null } });
  await User.updateOne({ _id: admin._id }, { $set: { grievanceAccess: 'handler' } });
  const item = await feedback(employee, {
    createdAt: new Date('2026-11-18T04:00:00Z'),
    statusHistory: [{ status: 'submitted', changedBy: employee._id, changedAt: new Date('2026-11-18T04:00:00Z') }]
  });
  const messages = [];
  const send = async message => { messages.push(message); };
  try {
    const friday = await sendWeeklyFeedbackSummary({ now: new Date('2026-11-20T12:30:00Z'), dryRun: false, send });
    assert.equal(friday.sent, 1);
    await Grievance.updateOne({ _id: item._id }, {
      $set: { status: 'resolved', resolvedAt: new Date('2026-11-21T06:00:00Z') },
      $push: { statusHistory: { status: 'resolved', changedBy: admin._id, changedAt: new Date('2026-11-21T06:00:00Z') } }
    });
    const monday = await sendWeeklyFeedbackSummary({ now: new Date('2026-11-23T03:30:00Z'), dryRun: false, send });
    assert.equal(monday.sent, 1);
    assert.ok(messages[1].text.includes('Submitted → Resolved'));
    const again = await sendWeeklyFeedbackSummary({ now: new Date('2026-11-23T04:00:00Z'), dryRun: false, send });
    assert.equal(again.sent, 0);
  } finally {
    await User.updateOne({ _id: admin._id }, { $set: { grievanceAccess: null } });
    if (previous) process.env.WEEKLY_SUMMARY_ENABLED = previous;
    else delete process.env.WEEKLY_SUMMARY_ENABLED;
  }
});

async function withWeeklyReviewer(run) {
  const previousEnabled = process.env.WEEKLY_SUMMARY_ENABLED;
  const previousRecipients = process.env.WEEKLY_SUMMARY_RECIPIENTS;
  const reviewer = await User.findById(admin._id);
  process.env.WEEKLY_SUMMARY_ENABLED = 'true';
  process.env.WEEKLY_SUMMARY_RECIPIENTS = admin.email;
  await User.updateOne({ _id: admin._id }, { $set: { grievanceAccess: 'handler' } });
  try {
    await run();
  } finally {
    await User.updateOne({ _id: admin._id }, { $set: { grievanceAccess: reviewer.grievanceAccess } });
    if (previousEnabled === undefined) delete process.env.WEEKLY_SUMMARY_ENABLED;
    else process.env.WEEKLY_SUMMARY_ENABLED = previousEnabled;
    if (previousRecipients === undefined) delete process.env.WEEKLY_SUMMARY_RECIPIENTS;
    else process.env.WEEKLY_SUMMARY_RECIPIENTS = previousRecipients;
  }
}

test('unfinished deliveries keep reports pending and can recover incorrect sent metadata', async () => {
  await withWeeklyReviewer(async () => {
    const now = new Date('2030-01-11T12:30:00Z');
    const week = summaryWeek(now).start;
    await WeeklyReport.create({ week, periodStart: week, periodEnd: now, status: 'sent', sentAt: now });
    await WeeklySummaryDelivery.create({ week, userId: admin._id, status: 'sending' });
    let sentMessages = 0;
    const options = { now, dryRun: false, send: async () => { sentMessages++; } };
    const busy = await sendWeeklyFeedbackSummary(options);
    assert.equal(busy.pending, 1);
    assert.equal(busy.skipped, 1);
    assert.equal(sentMessages, 0);
    const pending = await WeeklyReport.findOne({ week });
    assert.equal(pending.status, 'pending');
    assert.equal(pending.sentAt, undefined);
    await WeeklySummaryDelivery.updateOne({ week, userId: admin._id }, { $set: { status: 'failed' } });
    const retry = await sendWeeklyFeedbackSummary(options);
    assert.equal(retry.sent, 1);
    assert.equal(retry.pending, 0);
    assert.equal((await WeeklyReport.findOne({ week })).status, 'sent');
    await sendWeeklyFeedbackSummary(options);
    assert.equal(sentMessages, 1);
  });
});

test('overlapping summary runs never complete an in-flight report or send twice', async () => {
  await withWeeklyReviewer(async () => {
    const now = new Date('2030-01-18T12:30:00Z');
    const week = summaryWeek(now).start;
    let releaseSend;
    let notifySending;
    const sending = new Promise(resolve => { notifySending = resolve; });
    const released = new Promise(resolve => { releaseSend = resolve; });
    let sentMessages = 0;
    const first = sendWeeklyFeedbackSummary({ now, dryRun: false, send: async () => {
      sentMessages++;
      notifySending();
      await released;
    } });
    try {
      await Promise.race([sending, first.then(() => { throw new Error('First report did not enter delivery'); })]);
      const second = await sendWeeklyFeedbackSummary({ now, dryRun: false, send: async () => { sentMessages++; } });
      assert.equal(second.pending, 1);
      assert.equal((await WeeklyReport.findOne({ week })).status, 'pending');
    } finally {
      releaseSend();
      await first;
    }
    assert.equal(sentMessages, 1);
    assert.equal((await WeeklyReport.findOne({ week })).status, 'sent');
  });
});

test('ambiguous stale deliveries are not automatically resent', async () => {
  await withWeeklyReviewer(async () => {
    const now = new Date('2030-01-25T12:30:00Z');
    const week = summaryWeek(now).start;
    await WeeklyReport.create({ week, periodStart: week, periodEnd: now, status: 'pending' });
    await WeeklySummaryDelivery.collection.insertOne({ week, userId: admin._id, status: 'sending', updatedAt: new Date(Date.now() - 3600000) });
    const result = await sendWeeklyFeedbackSummary({ now, dryRun: false, send: async () => { assert.fail('Ambiguous delivery must be checked before retrying'); } });
    assert.equal(result.pending, 1);
    assert.equal(result.sent, 0);
    assert.equal((await WeeklyReport.findOne({ week })).status, 'pending');
  });
});

test('a database error after provider acceptance does not make a delivery retryable', async () => {
  await withWeeklyReviewer(async () => {
    const now = new Date('2030-02-08T12:30:00Z');
    const week = summaryWeek(now).start;
    const originalUpdate = WeeklySummaryDelivery.updateOne;
    let sentMessages = 0;
    const options = { now, dryRun: false, send: async () => { sentMessages++; } };
    WeeklySummaryDelivery.updateOne = function(filter, update, ...options) {
      if (update.$set?.status === 'sent') throw new Error('Simulated confirmation database outage');
      return originalUpdate.call(this, filter, update, ...options);
    };
    try {
      await assert.rejects(sendWeeklyFeedbackSummary(options), /confirmation database outage/);
    } finally {
      WeeklySummaryDelivery.updateOne = originalUpdate;
    }
    assert.equal((await WeeklySummaryDelivery.findOne({ week, userId: admin._id })).status, 'sending');
    const retry = await sendWeeklyFeedbackSummary(options);
    assert.equal(retry.pending, 1);
    assert.equal(sentMessages, 1);
  });
});

test('reports with no eligible recipients do not advance the completed cutoff', async () => {
  await withWeeklyReviewer(async () => {
    process.env.WEEKLY_SUMMARY_RECIPIENTS = 'nobody@example.test';
    const now = new Date('2030-02-01T12:30:00Z');
    const week = summaryWeek(now).start;
    const result = await sendWeeklyFeedbackSummary({ now, dryRun: false, send: async () => { assert.fail('No recipient should be emailed'); } });
    assert.equal(result.recipients, 0);
    assert.equal((await WeeklyReport.findOne({ week })).status, 'pending');
  });
});

test('adjacent reporting windows count boundary submissions and progress exactly once', async () => {
  const start = new Date('2030-02-04T00:00:00Z');
  const boundary = new Date('2030-02-05T00:00:00Z');
  const end = new Date('2030-02-06T00:00:00Z');
  await feedback(employee, { subject: 'Before boundary submission', createdAt: start });
  await feedback(employee, {
    subject: 'At boundary submission', createdAt: boundary, status: 'resolved', resolvedAt: boundary,
    statusHistory: [
      { status: 'submitted', changedBy: employee._id, changedAt: start },
      { status: 'resolved', changedBy: admin._id, changedAt: boundary }
    ]
  });
  const first = await buildWeeklyFeedbackSummary(boundary, { start, end: boundary });
  const second = await buildWeeklyFeedbackSummary(end, { start: boundary, end });
  assert.equal(first.received, 1);
  assert.equal(second.received, 1);
  assert.equal(first.resolved, 0);
  assert.equal(second.resolved, 1);
  assert.ok(!first.text.includes('At boundary submission'));
  assert.ok(second.text.includes('At boundary submission'));
  assert.ok(!first.text.includes('Submitted → Resolved'));
  assert.ok(second.text.includes('Submitted → Resolved'));
});

test('weekly delivery can use another mailbox without changing account identity or sending twice', async () => {
  await withWeeklyReviewer(async () => {
    const original = await User.findById(admin._id).lean();
    const target = 'weekly-target@example.test';
    await User.updateOne({ _id: admin._id }, { $set: { weeklySummaryEmail: target } }, { runValidators: true });
    process.env.WEEKLY_SUMMARY_RECIPIENTS = target.toUpperCase();
    const messages = [];
    const now = new Date('2030-03-08T12:30:00Z');
    try {
      const countBefore = await WeeklySummaryDelivery.countDocuments();
      const preview = await sendWeeklyFeedbackSummary({ now });
      assert.equal(preview.recipients, 1);
      assert.equal(preview.dryRun, true);
      assert.equal(await WeeklySummaryDelivery.countDocuments(), countBefore);
      const options = { now, dryRun: false, send: async message => { messages.push(message); } };
      assert.equal((await sendWeeklyFeedbackSummary(options)).sent, 1);
      assert.equal(messages[0].to, target);
      assert.ok(messages[0].text.includes('Feedback received this week'));
      await User.updateOne({ _id: admin._id }, { $set: { weeklySummaryEmail: 'another-target@example.test' } });
      process.env.WEEKLY_SUMMARY_RECIPIENTS = 'another-target@example.test';
      assert.equal((await sendWeeklyFeedbackSummary(options)).skipped, 1);
      assert.equal(messages.length, 1);
      const after = await User.findById(admin._id).lean();
      assert.equal(after.email, original.email);
      assert.equal(after.passwordHash, original.passwordHash);
      assert.equal(after.role, original.role);
    } finally {
      await User.updateOne({ _id: admin._id }, { $unset: { weeklySummaryEmail: 1 } });
    }
  });
});

test('a weekly mailbox override never grants feedback access and rejects invalid addresses', async () => {
  const invalid = new User({ weeklySummaryEmail: 'one@example.test,two@example.test' });
  assert.ok(invalid.validateSync().errors.weeklySummaryEmail);
  await withWeeklyReviewer(async () => {
    const original = await User.findById(other._id).lean();
    await User.updateOne({ _id: other._id }, { $set: { isActive: true, grievanceAccess: null, weeklySummaryEmail: 'unprivileged@example.test' } });
    process.env.WEEKLY_SUMMARY_RECIPIENTS = 'unprivileged@example.test';
    try {
      const result = await sendWeeklyFeedbackSummary({ now: new Date('2030-03-15T12:30:00Z') });
      assert.equal(result.recipients, 0);
    } finally {
      await User.updateOne({ _id: other._id }, { $set: { isActive: original.isActive, grievanceAccess: original.grievanceAccess }, $unset: { weeklySummaryEmail: 1 } });
    }
  });
});
