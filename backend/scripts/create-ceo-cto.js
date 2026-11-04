import { seedPassword } from './seed-password.js';
import mongoose from 'mongoose';
import User from '../models/User.js';
import dotenv from 'dotenv';
dotenv.config({ path: './config.env' });

const createCEOCTO = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');

    // Create CEO (Velan)
    const existingCEO = await User.findOne({ email: 'velan@theyellow.network' });
    if (existingCEO) {
      console.log('⚠️  CEO (Velan) already exists');
    } else {
      // Create a temporary user first to get an ID
      const tempUser = new User({
        name: 'Velan',
        email: 'velan@theyellow.network',
        password: seedPassword(),
        role: 'admin', // Give admin role for full access
        department: 'Executive',
        createdBy: '000000000000000000000000' // Temporary ID
      });
      await tempUser.save();
      
      // Update to self-reference
      await User.findByIdAndUpdate(tempUser._id, { createdBy: tempUser._id });
      console.log('✅ Created CEO (Velan)');
      console.log('Email: velan@theyellow.network');
      console.log('Password: velan123');
    }

    // Create CTO (GG)
    const existingCTO = await User.findOne({ email: 'gg@theyellownetwork.com' });
    if (existingCTO) {
      console.log('⚠️  CTO (GG) already exists');
    } else {
      // Create a temporary user first to get an ID
      const tempUser = new User({
        name: 'GG',
        email: 'gg@theyellownetwork.com',
        password: seedPassword(),
        role: 'admin', // Give admin role for full access
        department: 'Executive',
        createdBy: '000000000000000000000000' // Temporary ID
      });
      await tempUser.save();
      
      // Update to self-reference
      await User.findByIdAndUpdate(tempUser._id, { createdBy: tempUser._id });
      console.log('✅ Created CTO (GG)');
      console.log('Email: gg@theyellownetwork.com');
      console.log('Password: gg123');
    }

    console.log('🎉 CEO and CTO creation completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Creation error:', error);
    process.exit(1);
  }
};

createCEOCTO();
