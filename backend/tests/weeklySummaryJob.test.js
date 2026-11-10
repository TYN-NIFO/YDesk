import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
process.env.NODE_ENV = 'test';
const { createWeeklySummaryJobRouter } = await import('../routes/weeklySummaryJobRoutes.js');
const token = 'isolated-test-job-token-at-least-32-characters';
let server, url, calls, result, failure;
const original = { token: process.env.WEEKLY_SUMMARY_JOB_TOKEN, enabled: process.env.WEEKLY_SUMMARY_ENABLED };
before(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/jobs', createWeeklySummaryJobRouter(async options => {
    calls.push(options);
    if (failure) throw failure;
    return { week: '2030-01-01', recipients: 1, sent: 0, skipped: 0, failed: 0, pending: 0, dryRun: options.dryRun, ...result };
  }));
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  url = `http://127.0.0.1:${server.address().port}/api/jobs/weekly-feedback-summary`;
});
after(async () => {
  await new Promise(resolve => server.close(resolve));
  for (const [key, value] of [['WEEKLY_SUMMARY_JOB_TOKEN', original.token], ['WEEKLY_SUMMARY_ENABLED', original.enabled]]) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});
function reset() { calls = []; result = {}; failure = null; process.env.WEEKLY_SUMMARY_JOB_TOKEN = token; delete process.env.WEEKLY_SUMMARY_ENABLED; }
const request = (body = {}, authorization = `Bearer ${token}`) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: authorization }, body: JSON.stringify(body) });

test('weekly endpoint rejects unconfigured, missing and incorrect credentials before invoking the job', async () => {
  reset(); delete process.env.WEEKLY_SUMMARY_JOB_TOKEN;
  assert.equal((await request()).status, 503);
  process.env.WEEKLY_SUMMARY_JOB_TOKEN = token;
  assert.equal((await request({}, '')).status, 401);
  assert.equal((await request({}, `Bearer ${'x'.repeat(token.length)}`)).status, 401);
  assert.equal(calls.length, 0);
});
test('weekly endpoint defaults to dry run and returns only delivery counts', async () => {
  reset(); result = { privateSubject: 'PRIVATE_DATA_DO_NOT_RETURN' };
  const response = await request();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  assert.equal(body.dryRun, true);
  assert.ok(!JSON.stringify(body).includes('PRIVATE_DATA_DO_NOT_RETURN'));
  assert.deepEqual(calls, [{ dryRun: true }]);
});
test('weekly endpoint requires server enablement and an explicit send request', async () => {
  reset(); assert.equal((await request({ dryRun: false })).status, 503); assert.equal(calls.length, 0);
  process.env.WEEKLY_SUMMARY_ENABLED = 'true';
  assert.equal((await request({ dryRun: false })).status, 200);
  assert.deepEqual(calls, [{ dryRun: false }]);
});
test('weekly endpoint rejects client timestamps, recipients and invalid dryRun values', async () => {
  reset();
  for (const body of [{ dryRun: 'false' }, { now: '2030-01-01' }, { to: 'unapproved@example.test' }, []]) assert.equal((await request(body)).status, 400);
  assert.equal(calls.length, 0);
});
test('weekly endpoint reports empty, failed and pending deliveries as incomplete', async () => {
  reset();
  for (const incomplete of [{ recipients: 0 }, { failed: 1 }, { pending: 1 }]) { result = incomplete; assert.equal((await request()).status, 503); }
});
test('weekly endpoint sanitizes failures without returning credentials or feedback', async () => {
  reset(); failure = new Error('PRIVATE_DATABASE_CREDENTIALS');
  const response = await request();
  assert.equal(response.status, 503);
  assert.ok(!(await response.text()).includes('PRIVATE_DATABASE_CREDENTIALS'));
});
