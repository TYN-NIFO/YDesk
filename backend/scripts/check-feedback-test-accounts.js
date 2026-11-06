import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const settings = { ...process.env };
for (const filename of ['.env', process.env.NODE_ENV === 'production' ? 'config.production.env' : 'config.env']) {
  const location = path.join(directory, filename);
  if (!fs.existsSync(location)) continue;
  for (const [key, value] of Object.entries(dotenv.parse(fs.readFileSync(location)))) {
    if (settings[key] === undefined) settings[key] = value;
  }
}
if (!settings.MONGODB_URI) throw new Error('MONGODB_URI is not configured');

const source = new mongoose.mongo.MongoClient(settings.MONGODB_URI, {
  serverSelectionTimeoutMS: 15000,
  appName: 'YDesk-readonly-test-profile-check'
});
let profiles;
try {
  await source.connect();
  profiles = await source.db().collection('users').find({
    $or: [
      { email: /@(?:test\.local|example\.test)$/i },
      { email: /(?:^test[+._-]|[+._-]test@)/i },
      { name: /test|preview/i }
    ]
  }, { projection: { name: 1, email: 1, role: 1, grievanceAccess: 1, isActive: 1 } }).limit(30).toArray();
} finally {
  await source.close();
}
assert.ok(profiles.length, 'No test profiles found');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
process.env.RATE_LIMIT_MAX_REQUESTS = '2000';
for (const key of ['MONGODB_URI', 'SENDGRID_API_KEY', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM', 'EMAIL_FROM', 'WEEKLY_SUMMARY_RECIPIENTS']) {
  delete process.env[key];
}
const { app } = await import('../server.js');
const { default: User } = await import('../models/User.js');
const { default: Grievance } = await import('../models/Grievance.js');
const { default: smtp } = await import('../services/emailService.js');
const { default: grid } = await import('../services/sendgridEmailService.js');
const { sendWeeklyFeedbackSummary } = await import('../services/weeklyFeedbackSummary.js');
smtp.sendEmail = grid.sendEmail = async () => ({ success: true });

const database = await MongoMemoryServer.create();
let server;
try {
  await mongoose.connect(database.getUri());
  const password = crypto.randomBytes(16).toString('hex');
  for (const profile of profiles) {
    const user = new User({ ...profile, createdBy: profile._id });
    user.password = password;
    await user.save();
  }
  const owner = new User({ _id: new mongoose.Types.ObjectId(), name: 'Isolated fixture owner', email: 'fixture@example.test', role: 'employee' });
  owner.createdBy = owner._id;
  owner.password = password;
  await owner.save();
  const foreign = await Grievance.create({ employeeId: owner._id, feedbackType: 'suggestion', category: 'Other', subject: 'PRIVATE_FIXTURE_SUBJECT', description: 'PRIVATE_FIXTURE_DESCRIPTION', statusHistory: [{ status: 'submitted', changedBy: owner._id }] });
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const results = [];
  for (const profile of profiles) {
    const login = await fetch(`${base}/api/auth/token/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: profile.email, password }) });
    assert.equal(login.status, profile.isActive ? 200 : 401, profile.email);
    if (!profile.isActive) {
      results.push({ email: profile.email, inactive: true, passed: true });
      continue;
    }
    const credentials = await login.json();
    const headers = { Authorization: `Bearer ${credentials.accessToken}`, 'Content-Type': 'application/json' };
    const request = (route, method = 'GET', payload) => fetch(`${base}${route}`, { method, headers, body: payload ? JSON.stringify(payload) : undefined });
    const created = await request('/api/feedback', 'POST', { feedbackType: 'general', category: 'Other', subject: 'Isolated account verification', description: 'This feedback exists only in the disposable local database.' });
    assert.equal(created.status, 201, profile.email);
    const own = (await created.json()).grievance;
    assert.equal((await request(`/api/feedback/${own.grievanceId}`)).status, 200);
    const detail = await request(`/api/feedback/${foreign.grievanceId}`);
    const all = await request('/api/feedback?scope=all');
    const summary = await request('/api/feedback/summary');
    assert.equal(detail.status, profile.grievanceAccess === 'handler' ? 200 : 404, profile.email);
    assert.equal(all.status, profile.grievanceAccess === 'handler' ? 200 : 403, profile.email);
    assert.equal(summary.status, ['handler', 'summary'].includes(profile.grievanceAccess) ? 200 : 403, profile.email);
    assert.equal((await request(`/api/feedback/${own.grievanceId}/status`, 'PATCH', { status: 'resolved', note: 'Cannot review own feedback' })).status, 403);
    results.push({ email: profile.email, role: profile.role, access: profile.grievanceAccess || 'own', passed: true });
  }
  const messages = [];
  process.env.WEEKLY_SUMMARY_ENABLED = 'true';
  const weekly = await sendWeeklyFeedbackSummary({ dryRun: false, now: new Date(Date.now() + 1000), send: async message => { messages.push(message); } });
  assert.equal(weekly.sent, profiles.filter(profile => profile.isActive && ['handler', 'summary'].includes(profile.grievanceAccess)).length);
  for (const profile of profiles.filter(profile => profile.isActive && profile.grievanceAccess === 'summary')) {
    const message = messages.find(message => message.to === profile.email);
    assert.ok(message.text.includes('Counts only'));
    assert.ok(!JSON.stringify(message).includes('PRIVATE_FIXTURE_SUBJECT'));
  }
  console.log(JSON.stringify({ sourceDatabase: 'read-only', executionDatabase: 'disposable local copy', accounts: results, weekly: { recipients: weekly.recipients, mockedDeliveries: weekly.sent, pending: weekly.pending }, realEmailsSent: 0 }));
} finally {
  if (server) await new Promise(resolve => server.close(resolve));
  await mongoose.disconnect();
  await database.stop();
}
