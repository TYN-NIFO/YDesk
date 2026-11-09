import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
const { default: resend } = await import('../services/resendEmailService.js');
const { default: smtp } = await import('../services/emailService.js');
const { default: sendgrid } = await import('../services/sendgridEmailService.js');
const { getEmailService, mailIsConfigured } = await import('../services/mailService.js');
const originalFetch = globalThis.fetch;
const keys = ['RESEND_API_KEY', 'RESEND_FROM', 'EMAIL_FROM', 'SMTP_FROM', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SENDGRID_API_KEY', 'FRONTEND_URL'];
const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of keys) {
    if (previous[key] === undefined) delete process.env[key];
    else process.env[key] = previous[key];
  }
});

function configure() {
  for (const key of keys) delete process.env[key];
  process.env.RESEND_API_KEY = 're_mock_not_a_real_key';
  process.env.RESEND_FROM = 'sender@example.test';
  process.env.FRONTEND_URL = 'https://ydesk.example.test';
}

test('Resend takes priority over legacy providers and fails closed if its sender is missing', () => {
  configure();
  process.env.SENDGRID_API_KEY = 'legacy-mock';
  assert.equal(getEmailService(), resend);
  assert.equal(mailIsConfigured(), true);
  delete process.env.RESEND_FROM;
  assert.equal(mailIsConfigured(), false);
  delete process.env.RESEND_API_KEY;
  assert.equal(getEmailService(), sendgrid);
  process.env.EMAIL_FROM = 'legacy@example.test';
  assert.equal(mailIsConfigured(), true);
  delete process.env.SENDGRID_API_KEY;
  assert.equal(getEmailService(), smtp);
});

test('Resend sends HTTPS requests with recipient arrays and an idempotency key', async () => {
  configure();
  let captured;
  globalThis.fetch = async (url, options) => {
    captured = { url, options, payload: JSON.parse(options.body) };
    return Response.json({ id: 'mock-message-id' });
  };
  const result = await resend.sendEmail({ to: ['one@example.test', 'two@example.test'], subject: 'Feedback update', text: 'Read the portal', html: '<p>Read the portal</p>', idempotencyKey: 'weekly-feedback/mock-week/mock-user' });
  assert.equal(result.provider, 'Resend');
  assert.equal(result.messageId, 'mock-message-id');
  assert.equal(captured.url, 'https://api.resend.com/emails');
  assert.equal(captured.options.redirect, 'error');
  assert.equal(captured.options.headers.Authorization, `Bearer ${process.env.RESEND_API_KEY}`);
  assert.equal(captured.options.headers['Idempotency-Key'], 'weekly-feedback/mock-week/mock-user');
  assert.deepEqual(captured.payload.to, ['one@example.test', 'two@example.test']);
  assert.equal(captured.payload.from, 'YDesk <sender@example.test>');
  assert.ok(captured.options.signal instanceof AbortSignal);
});

test('provider rejections throw sanitized errors rather than reporting success', async () => {
  configure();
  globalThis.fetch = async () => Response.json({ name: 'validation_error', message: 'Untrusted provider detail' }, { status: 403 });
  await assert.rejects(resend.sendEmail({ to: 'recipient@example.test', subject: 'Test', text: 'Test' }), error => error.status === 403 && error.code === 'validation_error' && !error.message.includes('Untrusted'));
});

test('a successful response without a delivery reference is rejected', async () => {
  configure();
  globalThis.fetch = async () => Response.json({});
  await assert.rejects(resend.sendEmail({ to: 'recipient@example.test', subject: 'Test', text: 'Test' }), /no delivery reference/);
});

test('missing mail settings and recipients fail before making a request', async () => {
  configure();
  globalThis.fetch = async () => { assert.fail('No network request is allowed'); };
  await assert.rejects(resend.sendEmail({ to: [], subject: 'Test' }), /recipient/);
  delete process.env.RESEND_API_KEY;
  await assert.rejects(resend.sendEmail({ to: 'recipient@example.test' }), /Configure RESEND/);
});

test('password reset and confirmation use Resend with escaped names and encoded reset links', async () => {
  configure();
  const messages = [];
  globalThis.fetch = async (url, options) => {
    messages.push(JSON.parse(options.body));
    return Response.json({ id: `mock-message-${messages.length}` });
  };
  await resend.sendPasswordResetEmail('recipient@example.test', 'token&extra=value', '<img src=x>');
  await resend.sendPasswordResetConfirmation('recipient@example.test', '<img src=x>');
  assert.equal(messages.length, 2);
  assert.ok(messages[0].text.includes('https://ydesk.example.test/reset-password?token=token%26extra%3Dvalue'));
  for (const message of messages) {
    assert.deepEqual(message.to, ['recipient@example.test']);
    assert.ok(!message.html.includes('<img src=x>'));
    assert.ok(message.html.includes('&lt;img src=x&gt;'));
  }
});
