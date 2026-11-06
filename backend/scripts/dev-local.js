import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import crypto from 'node:crypto';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = crypto.randomBytes(48).toString('hex');
const { app } = await import('../server.js');
const { default: User } = await import('../models/User.js');
const { default: Policy } = await import('../models/Policy.js');
const { validCategories } = await import('../lib/categoryMaster.js');
const database = await MongoMemoryServer.create();
await mongoose.connect(database.getUri());
const password = process.env.PREVIEW_PASSWORD || crypto.randomBytes(12).toString('base64url');
if (password.length < 12) throw new Error('PREVIEW_PASSWORD must contain at least 12 characters');
for (const role of ['employee', 'supervisor', 'admin', 'finance_manager', 'executive']) {
  const user = new User({ _id: new mongoose.Types.ObjectId(), name: `Preview ${role.replace('_', ' ')}`, email: `${role}@example.test`, role });
  user.createdBy = user._id;
  user.grievanceAccess = ['admin', 'finance_manager'].includes(role) ? 'handler' : role === 'executive' ? 'summary' : null;
  user.password = password;
  await user.save();
}
await Policy.create({ claimCategories: validCategories, requiredDocuments: { default: [] } });
const server = app.listen(5000, '127.0.0.1', () => {
  console.log('Isolated preview API: http://127.0.0.1:5000');
  console.log('Preview accounts: employee@example.test, supervisor@example.test, admin@example.test, finance_manager@example.test, executive@example.test');
  console.log(`Temporary preview password: ${password}`);
  console.log('Preview records are temporary; cloud storage and email are not configured.');
});
async function stop() {
  await new Promise(resolve => server.close(resolve));
  await mongoose.disconnect();
  await database.stop();
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
