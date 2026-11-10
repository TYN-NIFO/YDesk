import express from 'express';
import crypto from 'node:crypto';
import { sendWeeklyFeedbackSummary } from '../services/weeklyFeedbackSummary.js';

export function createWeeklySummaryJobRouter(runSummary = sendWeeklyFeedbackSummary) {
  const router = express.Router();
  router.post('/weekly-feedback-summary', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const token = process.env.WEEKLY_SUMMARY_JOB_TOKEN;
    if (!token || token.length < 32) return res.status(503).json({ error: 'Weekly summary job is not configured' });
    const expected = Buffer.from(`Bearer ${token}`);
    const provided = Buffer.from(req.get('Authorization') || '');
    if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
      return res.status(401).json({ error: 'Job authentication required' });
    }
    const body = req.body || {};
    if (Array.isArray(body) || Object.keys(body).some(key => key !== 'dryRun') || (body.dryRun !== undefined && typeof body.dryRun !== 'boolean')) {
      return res.status(400).json({ error: 'Provide only a boolean dryRun value' });
    }
    try {
      const dryRun = body.dryRun !== false;
      if (!dryRun && process.env.WEEKLY_SUMMARY_ENABLED !== 'true') return res.status(503).json({ error: 'Weekly summary sending is disabled' });
      const result = await runSummary({ dryRun });
      const incomplete = !result.recipients || result.failed > 0 || result.pending > 0;
      const output = Object.fromEntries(['week', 'recipients', 'sent', 'skipped', 'failed', 'pending', 'dryRun'].map(key => [key, result[key]]));
      return res.status(incomplete ? 503 : 200).json(output);
    } catch {
      return res.status(503).json({ error: 'Weekly summary job could not complete' });
    }
  });
  return router;
}
