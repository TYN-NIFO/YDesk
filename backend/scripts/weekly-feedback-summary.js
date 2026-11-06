import '../config/environment.js';
import mongoose from 'mongoose';
import { sendWeeklyFeedbackSummary } from '../services/weeklyFeedbackSummary.js';

if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
const dryRun = !process.argv.includes('--send');
if (!dryRun && process.env.WEEKLY_SUMMARY_ENABLED !== 'true') throw new Error('Weekly summary sending is disabled');
await mongoose.connect(process.env.MONGODB_URI);
try {
  const result = await sendWeeklyFeedbackSummary({ dryRun });
  console.log(JSON.stringify(result));
  if (result.failed > 0 || result.pending > 0) process.exitCode = 1;
} finally { await mongoose.disconnect(); }
