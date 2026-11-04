import { seedPassword } from './seed-password.js';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';

dotenv.config({ path: './config.env' });

const EMPLOYEE_PASSWORD = seedPassword('EMPLOYEE_PASSWORD');
const ADMIN_EMAIL = 'admin@theyellow.network';
const ADMIN_PASSWORD = seedPassword('ADMIN_PASSWORD');
const SUPERVISOR_EMAIL = 'supervisor@theyellow.network';
const SUPERVISOR_PASSWORD = seedPassword('SUPERVISOR_PASSWORD');
const FINANCE_EMAIL = 'finance@theyellow.network';
const FINANCE_PASSWORD = seedPassword('FINANCE_PASSWORD');

const employees = [
  { name: 'Ganapathy Gangadharan', department: 'CEO', phone: '7358295305', email: 'gg@theyellownetwork.com', joinedOn: '2/22/2023' },
  { name: 'Senthilvelan Natarajan', department: 'Co founder & CTO', phone: '8056296664', email: 'velan@theyellow.network', joinedOn: '10/1/2024' },
  { name: 'Sudharshan E', department: 'Alliance Director', phone: '9994262999', email: 'sudharshan@theyellow.network', joinedOn: '1/15/2024' },
  { name: 'K Anandpadmanaban', department: 'Innovation Evangelist', phone: '9842479457', email: 'anand@theyellow.network', joinedOn: '2/1/2024' },
  { name: 'Sourish Ghosh', department: 'Growth Manager', phone: '8777718212', email: 'sourish@theyellow.network', joinedOn: '3/1/2024' },
  { name: 'Kaushik Venkatesan', department: 'Alliance Director', phone: '9566196927', email: 'kaushik@theyellow.network', joinedOn: '5/1/2024' },
  { name: 'Lathiesh Mahendran', department: 'Software Developer', phone: '9894578288', email: 'lathiesh@theyellow.network', joinedOn: '4/1/2024' },
  { name: 'Rakesh Mahendran', department: 'Software Developer', phone: '8825817452', email: 'rakesh@theyellow.network', joinedOn: '4/1/2024' },
  { name: 'Rathnasundara Devi S', department: 'Legal and Finance Manager', phone: '7708286978', email: 'rathna@theyellow.network', joinedOn: '12/30/2024' },
  { name: 'Maharshi', department: 'Innovation Consultant', phone: '9428727103', email: 'maharshi@theyellow.network', joinedOn: '5/5/2025' },
];

async function upsertUser({ name, email, password, role, department, createdBy, supervisorLevel }) {
  // Fetch existing user by email
  let user = await User.findOne({ email: email.toLowerCase() });

  if (!user) {
    if (!createdBy) {
      throw new Error(`createdBy is required to create user ${email}`);
    }
    // Create new user document
    user = new User({
      name,
      email: email.toLowerCase(),
      role: role || 'employee',
      department: department || '',
      supervisorLevel: supervisorLevel ?? undefined,
      createdBy,
      isActive: true,
    });

    // Set password via virtual to hash
    user.password = password;
    await user.save();

    // If createdBy wasn't provided (e.g., for admin), set it to self after creation
    if (!createdBy) {
      await User.findByIdAndUpdate(user._id, { createdBy: user._id });
      user = await User.findById(user._id);
    }

    console.log(`✅ Created ${role || 'employee'}: ${name} <${email}>`);
  } else {
    // Update existing fields
    user.name = name || user.name;
    user.role = role || user.role;
    user.department = department ?? user.department;
    if (typeof supervisorLevel !== 'undefined') user.supervisorLevel = supervisorLevel;
    if (createdBy) user.createdBy = createdBy;
    user.isActive = true;

    // Reset password to requested one
    user.password = password;

    await user.save();
    console.log(`🆙 Updated ${role || 'employee'}: ${name} <${email}>`);
  }

  return user;
}

// Special upsert for admin: ensure createdBy references self to satisfy schema
async function upsertAdminSelf() {
  let admin = await User.findOne({ email: ADMIN_EMAIL.toLowerCase() });
  if (!admin) {
    const adminId = new mongoose.Types.ObjectId();
    admin = await User.create({
      _id: adminId,
      name: 'System Administrator',
      email: ADMIN_EMAIL.toLowerCase(),
      passwordHash: bcrypt.hashSync(ADMIN_PASSWORD, 12),
      role: 'admin',
      department: 'IT',
      createdBy: adminId,
      isActive: true,
    });
    console.log(`✅ Created admin: ${admin.name} <${admin.email}>`);
  } else {
    admin.name = 'System Administrator';
    admin.role = 'admin';
    admin.department = 'IT';
    admin.isActive = true;
    // Reset password to requested one
    admin.passwordHash = bcrypt.hashSync(ADMIN_PASSWORD, 12);
    if (!admin.createdBy) {
      admin.createdBy = admin._id;
    }
    await admin.save();
    console.log(`🆙 Updated admin: ${admin.name} <${admin.email}>`);
  }
  return admin;
}

async function main() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI is not set in config.env');
    }

    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log('✅ Connected to MongoDB');

    // 1) Upsert Admin (self-referential createdBy)
    const admin = await upsertAdminSelf();

    // 2) Upsert Supervisor (level 1)
    const supervisor = await upsertUser({
      name: 'Default Supervisor',
      email: SUPERVISOR_EMAIL,
      password: SUPERVISOR_PASSWORD,
      role: 'supervisor',
      department: 'Operations',
      createdBy: admin._id,
      supervisorLevel: 1,
    });

    // 3) Upsert Finance Manager
    const finance = await upsertUser({
      name: 'Finance Manager',
      email: FINANCE_EMAIL,
      password: FINANCE_PASSWORD,
      role: 'finance_manager',
      department: 'Finance',
      createdBy: admin._id,
    });

    // 4) Upsert Employees
    for (const emp of employees) {
      await upsertUser({
        name: emp.name,
        email: emp.email,
        password: EMPLOYEE_PASSWORD,
        role: 'employee',
        department: emp.department,
        createdBy: admin._id,
      });
    }

    console.log('\n🎉 Done seeding users.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Seed error:', err);
    process.exit(1);
  }
}

main();
