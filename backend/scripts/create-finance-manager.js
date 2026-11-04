import { seedPassword } from './seed-password.js';
import mongoose from 'mongoose';
import User from '../models/User.js';
import dotenv from 'dotenv';
dotenv.config({ path: './config.env' });

const createFinanceManager = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');

    // Check if finance manager exists
    const existingFinanceManager = await User.findOne({ 
      role: 'finance_manager',
      email: 'finance@company.com'
    });
    
    if (existingFinanceManager) {
      console.log('⚠️  Finance manager already exists');
      return;
    }

    // Create finance manager
    const financeManager = new User({
      name: 'Finance Manager',
      email: 'finance@company.com',
      password: seedPassword(),
      role: 'finance_manager',
      department: 'Finance',
      createdBy: '000000000000000000000000' // System created
    });
    
    await financeManager.save();
    console.log('✅ Created finance manager');
    console.log('Email: finance@company.com');


    console.log('🎉 Finance manager creation completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Creation error:', error);
    process.exit(1);
  }
};

createFinanceManager();
