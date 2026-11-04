import mongoose from 'mongoose';
import User from '../models/User.js';
import dotenv from 'dotenv';
dotenv.config({ path: './config.env' });
dotenv.config();

// Usage:
//   node scripts/set-grievance-access.js <handler|summary|none> <email> [email...]
// Example:
//   node scripts/set-grievance-access.js handler rathna@theyellow.network sathya.k@theyellow.network
//   node scripts/set-grievance-access.js summary gg@theyellownetwork.com

const [access, ...emails] = process.argv.slice(2);
const ACCESS_VALUES = { handler: 'handler', summary: 'summary', none: null };

const setGrievanceAccess = async () => {
  if (!(access in ACCESS_VALUES) || emails.length === 0) {
    console.error('Usage: node scripts/set-grievance-access.js <handler|summary|none> <email> [email...]');
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    for (const email of emails) {
      const user = await User.findOneAndUpdate(
        { email: email.toLowerCase() },
        { grievanceAccess: ACCESS_VALUES[access] },
        { new: true }
      );
      if (user) {
        console.log(`- ${user.name} (${user.email}): grievanceAccess = ${user.grievanceAccess}`);
      } else {
        console.log(`- ${email}: no such user`);
      }
    }

    const all = await User.find({ grievanceAccess: { $ne: null } }).select('name email grievanceAccess');
    console.log('\nUsers with grievance access:');
    all.forEach((u) => console.log(`- ${u.name} (${u.email}): ${u.grievanceAccess}`));
  } catch (error) {
    console.error('❌ Failed to set grievance access:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

setGrievanceAccess();
