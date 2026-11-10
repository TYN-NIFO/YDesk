// The database and provider credentials remain on Render. GitHub only triggers the job.
try {
  const url = new URL(process.env.WEEKLY_SUMMARY_API_URL);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('A valid HTTPS weekly summary URL is required');
  const token = process.env.WEEKLY_SUMMARY_JOB_TOKEN;
  if (!token || token.length < 32) throw new Error('WEEKLY_SUMMARY_JOB_TOKEN is required');
  const dryRun = process.env.SEND_EMAIL !== 'true';
  const response = await fetch(url, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(120000),
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ dryRun })
  });
  if (!response.ok) throw new Error(`Weekly summary endpoint returned HTTP ${response.status}`);
  const result = await response.json();
  if (result.dryRun !== dryRun || !result.recipients || result.failed || result.pending) throw new Error('Weekly summary job did not confirm completion');
  console.log(JSON.stringify(Object.fromEntries(['week', 'recipients', 'sent', 'skipped', 'failed', 'pending', 'dryRun'].map(key => [key, result[key]]))));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
