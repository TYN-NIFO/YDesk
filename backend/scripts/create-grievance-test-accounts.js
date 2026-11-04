import mongoose from 'mongoose';
import crypto from 'node:crypto';
import User from '../models/User.js';
import dotenv from 'dotenv';
dotenv.config({ path: './config.env' });
dotenv.config();

// Creates (or updates) the four grievance-feature test accounts:
//   emp1@test.local   - employee, raises/tracks own grievances (no elevated access)
//   rathna@test.local - handler:  sees All grievances + Summary, can act on them
//   sathya@test.local - handler:  second handler, acts on grievances Rathna raises herself
//   gg@test.local      - leadership: Summary (aggregate counts) only
//
// Usage:
//   node scripts/create-grievance-test-accounts.js

const ACCOUNTS = [
  { email: 'emp1@test.local', name: 'Grievance Test Employee', grievanceAccess: null },
  { email: 'rathna@test.local', name: 'Rathna', grievanceAccess: 'handler' },
  { email: 'sathya@test.local', name: 'Sathya', grievanceAccess: 'handler' },
  { email: 'gg@test.local', name: 'GG', grievanceAccess: 'summary' },
];

const genPassword = () => crypto.randomBytes(12).toString('base64url'); // 16 chars, >=12 required

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  // Self-referencing creator: use an existing admin if one exists, else each user references itself.
  const admin = await User.findOne({ role: 'admin' });

  const results = [];

  for (const acct of ACCOUNTS) {
    const email = acct.email.toLowerCase();
    let user = await User.findOne({ email });
    const password = genPassword();

    if (user) {
      user.grievanceAccess = acct.grievanceAccess;
      user.password = password; // virtual setter hashes it
      user.isActive = true;
      await user.save();
      results.push({ email, password, status: 'updated', grievanceAccess: acct.grievanceAccess });
      continue;
    }

    user = new User({
      name: acct.name,
      email,
      password,
      role: 'employee',
      department: 'Grievance Testing',
      grievanceAccess: acct.grievanceAccess,
      createdBy: admin ? admin._id : undefined,
    });

    if (!admin) {
      // No admin exists yet; self-reference after first save (same pattern as create-admin.js).
      await user.save({ validateBeforeSave: false });
      user.createdBy = user._id;
    }

    await user.save();
    results.push({ email, password, status: 'created', grievanceAccess: acct.grievanceAccess });
  }

  console.log('\n=== Grievance test accounts ===');
  console.table(results.map(({ email, password, status, grievanceAccess }) => ({
    email, password, status, grievanceAccess: grievanceAccess ?? '(none)',
  })));
  console.log('Save these passwords now — they are not stored anywhere else.');
};

run()
  .catch((error) => {
    console.error('❌ Failed to create grievance test accounts:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
