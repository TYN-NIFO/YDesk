import '../config/environment.js';
import mongoose from 'mongoose';
import User from '../models/User.js';

const [loginEmail, suppliedAlias] = process.argv.slice(2);
if (!loginEmail || !suppliedAlias) throw new Error('Usage: node scripts/set-google-login-email.js <existing-login-email> <workspace-email|none>');
const alias = suppliedAlias.trim().toLowerCase();
if (alias !== 'none' && (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(alias) || alias.length > 254)) throw new Error('A valid Google Workspace email is required');
if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
try {
  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false, autoCreate: false });
  const user = await User.findOne({ email: loginEmail.trim().toLowerCase() });
  if (!user) throw new Error('Existing YDesk account not found');
  if (alias !== 'none') {
    const conflict = await User.exists({ _id: { $ne: user._id }, $or: [{ email: alias }, { googleLoginEmail: alias }] });
    if (conflict) throw new Error('That address belongs to another existing YDesk account');
  }
  await User.updateOne({ _id: user._id }, alias === 'none' ? { $unset: { googleLoginEmail: 1 } } : { $set: { googleLoginEmail: alias } });
  console.log(JSON.stringify({ loginEmail: user.email, googleLoginEmail: alias === 'none' ? null : alias, role: user.role, emailsSent: 0 }));
} finally { await mongoose.disconnect(); }
