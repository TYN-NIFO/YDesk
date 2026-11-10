import '../config/environment.js';
import mongoose from 'mongoose';
import User from '../models/User.js';

const [loginEmail, deliveryEmail] = process.argv.slice(2);
if (!loginEmail || !deliveryEmail) throw new Error('Usage: node scripts/set-weekly-summary-email.js <login-email> <delivery-email|none>');
if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
try {
  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false, autoCreate: false });
  const user = await User.findOneAndUpdate(
    { email: loginEmail.trim().toLowerCase() },
    { $set: { weeklySummaryEmail: deliveryEmail === 'none' ? '' : deliveryEmail } },
    { new: true, runValidators: true }
  ).select('email weeklySummaryEmail grievanceAccess');
  if (!user) throw new Error('No existing account matches the login email');
  console.log(JSON.stringify({ loginEmail: user.email, weeklySummaryEmail: user.weeklySummaryEmail || user.email, access: user.grievanceAccess || 'own', emailsSent: 0 }));
} finally {
  await mongoose.disconnect();
}
