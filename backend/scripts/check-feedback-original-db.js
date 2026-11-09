import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const settings = { ...process.env };
for (const filename of ['.env', process.env.NODE_ENV === 'production' ? 'config.production.env' : 'config.env']) {
  const content = await fs.readFile(path.join(directory, filename), 'utf8').catch(error => {
    if (error.code !== 'ENOENT') throw error;
    return '';
  });
  for (const [key, value] of Object.entries(dotenv.parse(content))) {
    if (settings[key] === undefined) settings[key] = value;
  }
}
if (!settings.MONGODB_URI) throw new Error('MONGODB_URI is required');
const cleanupIndex = process.argv.indexOf('--cleanup');
if (cleanupIndex < 0 && !process.argv.includes('--run')) {
  throw new Error('Use --run to create, test, and remove tracked feedback, or --cleanup <report.json> to resume cleanup');
}
const fingerprint = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const target = fingerprint(settings.MONGODB_URI);
const runId = crypto.randomUUID();
const reportPath = cleanupIndex >= 0
  ? path.resolve(process.argv[cleanupIndex + 1] || '')
  : path.resolve(directory, '..', '.local', 'verification', `feedback-${runId}.json`);
const report = cleanupIndex >= 0 ? JSON.parse(await fs.readFile(reportPath, 'utf8')) : {
  version: 1, runId, marker: `YDESK-VERIFY-${runId}`, target,
  startedAt: new Date().toISOString(), status: 'running',
  api: 'latest local code against configured original database',
  authentication: 'temporary local tokens; existing passwords and sessions unchanged',
  accounts: [], checks: [], created: { feedback: [], audits: [] },
  email: { mode: 'captured locally', interceptedMessages: 0, realEmailsSent: 0 }
};
assert.match(report.runId, /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
assert.equal(report.marker, `YDESK-VERIFY-${report.runId}`);
assert.equal(report.target, target, 'Cleanup database must match the recorded target');
const save = async () => {
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(`${reportPath}.pending`, JSON.stringify(report, null, 2));
  await fs.rename(`${reportPath}.pending`, reportPath);
};
const client = new mongoose.mongo.MongoClient(settings.MONGODB_URI, {
  serverSelectionTimeoutMS: 15000, appName: 'YDesk-tracked-feedback-verification'
});
let server;
let connected = false;
let failure;
const check = async (name, actual, expected) => {
  report.checks.push({ name, actual, expected, passed: actual === expected, at: new Date().toISOString() });
  await save();
  assert.equal(actual, expected, name);
};
const cleanup = async database => {
  const actorIds = report.accounts.map(account => new mongoose.Types.ObjectId(account.id));
  const filter = { subject: { $regex: `^${report.marker} ` }, employeeId: { $in: actorIds } };
  const records = await database.collection('grievances').find(filter, { projection: { _id: 1, grievanceId: 1, employeeId: 1 } }).toArray();
  for (const record of records) {
    if (!report.created.feedback.some(item => item.id === record._id.toString())) {
      report.created.feedback.push({ id: record._id.toString(), reference: record.grievanceId, accountId: record.employeeId.toString(), recoveredDuringCleanup: true });
    }
  }
  const references = report.created.feedback.map(record => record.reference);
  const auditFilter = { resource: 'GRIEVANCE', 'details.userAgent': report.marker, 'details.grievanceId': { $in: references } };
  const audits = await database.collection('auditlogs').find(auditFilter, { projection: { _id: 1, action: 1, 'details.grievanceId': 1 } }).toArray();
  for (const audit of audits) {
    if (!report.created.audits.some(item => item.id === audit._id.toString())) {
      report.created.audits.push({ id: audit._id.toString(), action: audit.action, reference: audit.details.grievanceId });
    }
  }
  report.cleanup = { status: 'running', startedAt: new Date().toISOString() };
  await save();
  const auditIds = report.created.audits.map(record => new mongoose.Types.ObjectId(record.id));
  const feedbackIds = report.created.feedback.map(record => new mongoose.Types.ObjectId(record.id));
  const auditDeletion = await database.collection('auditlogs').deleteMany({ ...auditFilter, _id: { $in: auditIds } });
  const feedbackDeletion = await database.collection('grievances').deleteMany({ ...filter, _id: { $in: feedbackIds } });
  const remainingFeedback = await database.collection('grievances').countDocuments(filter);
  const remainingAudits = await database.collection('auditlogs').countDocuments(auditFilter);
  const preserved = [];
  for (const baseline of report.preserved || []) {
    const current = await database.collection(baseline.collection).findOne({ _id: new mongoose.Types.ObjectId(baseline.id) });
    preserved.push({ collection: baseline.collection, id: baseline.id, unchanged: fingerprint(current) === baseline.fingerprint });
  }
  Object.assign(report.cleanup, {
    status: remainingFeedback === 0 && remainingAudits === 0 ? 'complete' : 'incomplete',
    completedAt: new Date().toISOString(), deletedFeedbackThisAttempt: feedbackDeletion.deletedCount,
    deletedAuditsThisAttempt: auditDeletion.deletedCount, remainingFeedback, remainingAudits,
    preservedRecordsChecked: preserved.length, preservedRecordsUnchanged: preserved.every(record => record.unchanged),
    changedBaselineRecords: preserved.filter(record => !record.unchanged),
    referenceCounter: 'Allocated reference numbers are not reused; the shared counter is not reset'
  });
  await save();
  assert.equal(remainingFeedback + remainingAudits, 0, 'All run-created records must be removed');
  assert.ok(report.cleanup.preservedRecordsUnchanged, 'Pre-existing account and feedback records must remain unchanged');
};

try {
  await client.connect();
  connected = true;
  const database = client.db();
  if (cleanupIndex < 0) {
    const profiles = await database.collection('users').find({
      $or: [{ email: /@(?:test\.local|example\.test)$/i }, { email: /(?:^test[+._-]|[+._-]test@)/i }, { name: /test|preview/i }]
    }).limit(30).toArray();
    assert.ok(profiles.length, 'No existing test accounts found');
    report.accounts = profiles.map(profile => ({ id: profile._id.toString(), email: profile.email, role: profile.role, access: profile.grievanceAccess || 'own', active: profile.isActive !== false }));
    const existing = await database.collection('grievances').find({ employeeId: { $in: profiles.map(profile => profile._id) } }).toArray();
    report.preserved = [
      ...profiles.map(profile => ({ collection: 'users', id: profile._id.toString(), fingerprint: fingerprint(profile) })),
      ...existing.map(record => ({ collection: 'grievances', id: record._id.toString(), fingerprint: fingerprint(record) }))
    ];
    await save();
    const active = profiles.filter(profile => profile.isActive !== false);
    assert.ok(active.length >= 2, 'At least two active test accounts are required');
    assert.ok(active.filter(profile => profile.grievanceAccess === 'handler').length >= 2, 'Two existing handlers are required');
    assert.ok(active.some(profile => profile.grievanceAccess === 'summary'), 'An existing summary viewer is required');
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = crypto.randomBytes(48).toString('hex');
    process.env.RATE_LIMIT_MAX_REQUESTS = '2000';
    for (const key of ['MONGODB_URI', 'RESEND_API_KEY', 'RESEND_FROM', 'SENDGRID_API_KEY', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM', 'EMAIL_FROM']) delete process.env[key];
    mongoose.set('autoIndex', false);
    mongoose.set('autoCreate', false);
    const { app } = await import('../server.js');
    const { generateAccessToken } = await import('../controllers/authController.js');
    const { default: smtp } = await import('../services/emailService.js');
    const { default: grid } = await import('../services/sendgridEmailService.js');
    const { buildWeeklyFeedbackSummary } = await import('../services/weeklyFeedbackSummary.js');
    smtp.sendEmail = grid.sendEmail = async () => {
      report.email.interceptedMessages++;
      return { success: true };
    };
    await mongoose.connect(settings.MONGODB_URI, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 15000 });
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const request = (profile, route, method = 'GET', payload) => fetch(`${base}${route}`, {
      method, headers: { Authorization: `Bearer ${generateAccessToken(profile)}`, 'Content-Type': 'application/json', 'User-Agent': report.marker },
      body: payload ? JSON.stringify(payload) : undefined,
      signal: AbortSignal.timeout(30000)
    });
    for (const [position, profile] of active.entries()) {
      report.nextWrite = { accountId: profile._id.toString(), subject: `${report.marker} Account ${position + 1}` };
      await save();
      const response = await request(profile, '/api/feedback', 'POST', {
        feedbackType: ['general', 'suggestion', 'appreciation', 'concern'][position % 4], category: 'Other',
        subject: report.nextWrite.subject, description: `${report.marker} Temporary verification entry; removed after this run.`
      });
      const payload = await response.json();
      if (payload.grievance) report.created.feedback.push({ id: payload.grievance._id, reference: payload.grievance.grievanceId, accountId: profile._id.toString() });
      delete report.nextWrite;
      await check(`${profile.email}: create feedback`, response.status, 201);
    }
    for (const profile of active) {
      const own = report.created.feedback.find(record => record.accountId === profile._id.toString());
      const foreign = report.created.feedback.find(record => record.accountId !== profile._id.toString());
      await check(`${profile.email}: own details`, (await request(profile, `/api/feedback/${own.reference}`)).status, 200);
      await check(`${profile.email}: other details`, (await request(profile, `/api/feedback/${foreign.reference}`)).status, profile.grievanceAccess === 'handler' ? 200 : 404);
      await check(`${profile.email}: all feedback`, (await request(profile, '/api/feedback?scope=all')).status, profile.grievanceAccess === 'handler' ? 200 : 403);
      await check(`${profile.email}: summary`, (await request(profile, '/api/feedback/summary')).status, ['handler', 'summary'].includes(profile.grievanceAccess) ? 200 : 403);
      await check(`${profile.email}: self-review denied`, (await request(profile, `/api/feedback/${own.reference}/status`, 'PATCH', { status: 'resolved', note: `${report.marker} Own review is forbidden` })).status, 403);
      if (profile.grievanceAccess !== 'handler') {
        await check(`${profile.email}: foreign update denied`, (await request(profile, `/api/feedback/${foreign.reference}/status`, 'PATCH', { status: 'resolved', note: `${report.marker} Unauthorized review` })).status, 403);
        await check(`${profile.email}: private download denied`, (await request(profile, `/api/feedback/${foreign.reference}/attachments/not-a-file`)).status, 404);
      }
    }
    const handlers = active.filter(profile => profile.grievanceAccess === 'handler');
    const employeeRecord = report.created.feedback.find(record => !handlers.some(profile => profile._id.toString() === record.accountId));
    for (const [position, status] of ['under_review', 'resolved', 'closed'].entries()) {
      const response = await request(handlers[position % handlers.length], `/api/feedback/${employeeRecord.reference}/status`, 'PATCH', { status, note: `${report.marker} Verified ${status}` });
      await check(`Handler transition to ${status}`, response.status, 200);
    }
    await check('Closed feedback cannot be reopened', (await request(handlers[0], `/api/feedback/${employeeRecord.reference}/status`, 'PATCH', { status: 'under_review' })).status, 400);
    for (const [position, handler] of handlers.entries()) {
      const own = report.created.feedback.find(record => record.accountId === handler._id.toString());
      await check(`${handler.email}: another handler can review`, (await request(handlers[(position + 1) % handlers.length], `/api/feedback/${own.reference}/status`, 'PATCH', { status: 'resolved', note: `${report.marker} Reviewed by a different handler` })).status, 200);
    }
    const now = new Date();
    const period = { start: new Date(report.startedAt), end: now };
    const counts = await buildWeeklyFeedbackSummary(now, period, { includeDetails: false });
    const details = await buildWeeklyFeedbackSummary(now, period);
    await check('Summary email excludes test subjects and descriptions', JSON.stringify(counts).includes(report.marker), false);
    await check('Handler email includes test subjects', details.text.includes(report.marker), true);
    await check('Weekly window counts all run entries', counts.received >= active.length, true);
    report.weekly = { mode: 'render only; no weekly delivery records or emails created', received: counts.received, resolved: counts.resolved, open: counts.open };
    report.status = 'passed';
  }
} catch (error) {
  failure = error;
  report.status = 'failed';
  report.error = { name: error.name, message: error.message };
} finally {
  if (server) await new Promise(resolve => server.close(resolve));
  if (connected && report.accounts.length) {
    try { await cleanup(client.db()); }
    catch (error) {
      failure ||= error;
      report.status = 'failed';
      report.cleanup ||= {};
      report.cleanup.error = { name: error.name, message: error.message };
    }
  }
  report.completedAt = new Date().toISOString();
  await save();
  await mongoose.disconnect();
  await client.close();
}
console.log(JSON.stringify({ report: reportPath, status: report.status, checks: report.checks.length, feedbackCreated: report.created.feedback.length, auditRecords: report.created.audits.length, cleanup: report.cleanup, email: report.email }));
if (failure) process.exitCode = 1;
