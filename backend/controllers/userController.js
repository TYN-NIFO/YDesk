import User from '../models/User.js';
import AuditLog from '../models/AuditLog.js';
import { validationResult } from 'express-validator';
import { revokeSessions } from '../services/sessionService.js';

// Create audit log entry
const createAuditLog = async (userId, action, resource, details = {}) => {
  try {
    await AuditLog.create({
      userId,
      action,
      resource,
      details
    });
  } catch (error) {
    console.error('Audit log creation failed:', error);
  }
};

// Get all users (with filters)
const getUsers = async (req, res) => {
  try {
    const { role, status, department } = req.query;
    const filter = {};

    if (role) filter.role = role;
    if (status !== undefined) filter.isActive = status === 'active';
    if (department) filter.department = new RegExp(department, 'i');

    const users = await User.find(filter)
      .select('-passwordHash')
      .populate('assignedSupervisor1', 'name email')
      .populate('assignedSupervisor2', 'name email')
      .sort({ createdAt: -1 });

    res.json(users);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

// Get user by ID
const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-passwordHash')
      .populate('assignedSupervisor1', 'name email')
      .populate('assignedSupervisor2', 'name email');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
};

// Create user (admin only)
const createUser = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      name,
      email,
      password,
      role,
      supervisorLevel,
      department,
      assignedSupervisor1,
      assignedSupervisor2
    } = req.body;

    // Check if email already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    // Validate supervisor assignments
    if (assignedSupervisor1 || assignedSupervisor2) {
      const supervisors = await User.find({
        _id: { $in: [assignedSupervisor1, assignedSupervisor2].filter(Boolean) },
        role: 'supervisor'
      });

      if (supervisors.length !== [assignedSupervisor1, assignedSupervisor2].filter(Boolean).length) {
        return res.status(400).json({ error: 'Invalid supervisor assignment' });
      }
    }

    // Create user
    const user = new User({
      name,
      email: email.toLowerCase(),
      password, // Will be hashed by virtual
      role,
      supervisorLevel: role === 'supervisor' ? supervisorLevel : null,
      department,
      assignedSupervisor1,
      assignedSupervisor2,
      createdBy: req.user._id
    });

    await user.save();

    // Create audit log
    await createAuditLog(req.user._id, 'CREATE_USER', 'USER', {
      targetUserId: user._id,
      userDetails: { name, email, role }
    });

    res.status(201).json(user.toPublicJSON());
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
};

// Update user
const updateUser = async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Administrator access required' });
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      name,
      email,
      role,
      supervisorLevel,
      department,
      assignedSupervisor1,
      assignedSupervisor2
    } = req.body;

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if email is being changed and if it already exists
    if (email && email.toLowerCase() !== user.email) {
      const existingUser = await User.findOne({ email: email.toLowerCase() });
      if (existingUser) {
        return res.status(400).json({ error: 'Email already exists' });
      }
    }

    // Validate supervisor assignments
    if (assignedSupervisor1 || assignedSupervisor2) {
      const supervisors = await User.find({
        _id: { $in: [assignedSupervisor1, assignedSupervisor2].filter(Boolean) },
        role: 'supervisor'
      });

      if (supervisors.length !== [assignedSupervisor1, assignedSupervisor2].filter(Boolean).length) {
        return res.status(400).json({ error: 'Invalid supervisor assignment' });
      }
    }

    // Update user
    const updateData = {
      name: name || user.name,
      email: email ? email.toLowerCase() : user.email,
      role: role || user.role,
      supervisorLevel: role === 'supervisor' ? supervisorLevel : null,
      department: department || user.department,
      assignedSupervisor1,
      assignedSupervisor2
    };

    Object.assign(user, updateData);
    await user.save();

    // Create audit log
    await createAuditLog(req.user._id, 'UPDATE_USER', 'USER', {
      targetUserId: user._id,
      changes: updateData
    });

    res.json(user.toPublicJSON());
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
};

// Deactivate user
const deactivateUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.isActive = false;
    await user.save();

    // Create audit log
    await createAuditLog(req.user._id, 'DEACTIVATE_USER', 'USER', {
      targetUserId: user._id,
      userDetails: { name: user.name, email: user.email }
    });

    res.json({ message: 'User deactivated successfully' });
  } catch (error) {
    console.error('Deactivate user error:', error);
    res.status(500).json({ error: 'Failed to deactivate user' });
  }
};

// Reset password
const resetPassword = async (req, res) => {
  try {
    const { password } = req.body;
    
    if (!password) {
      return res.status(400).json({ error: 'New password is required' });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.password = password; // Will be hashed by virtual
    await user.save();
    await revokeSessions(user._id);

    // Create audit log
    await createAuditLog(req.user._id, 'RESET_PASSWORD', 'USER', {
      targetUserId: user._id,
      userDetails: { name: user.name, email: user.email }
    });

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
};

// Get supervisors for assignment
const getSupervisors = async (req, res) => {
  try {
    const supervisors = await User.find({
      role: 'supervisor',
      isActive: true
    })
    .select('name email supervisorLevel department')
    .sort({ name: 1 });

    res.json(supervisors);
  } catch (error) {
    console.error('Get supervisors error:', error);
    res.status(500).json({ error: 'Failed to fetch supervisors' });
  }
};

// Get employee names for filtering
const getEmployeeNames = async (req, res) => {
  try {
    const employees = await User.find(
      { 
        isActive: true,
        role: { $in: ['employee', 'supervisor'] }
      },
      { 
        _id: 1, 
        name: 1, 
        email: 1, 
        department: 1,
        role: 1
      }
    ).sort({ name: 1 });

    res.json({
      success: true,
      data: employees.map(emp => ({
        id: emp._id,
        name: emp.name,
        email: emp.email,
        department: emp.department,
        role: emp.role
      }))
    });
  } catch (error) {
    console.error('Error fetching employee names:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch employee names'
    });
  }
};

// Delete user (permanently)
const deleteUser = async (req, res) => {
  try {
    const userId = req.params.id;
    
    // Prevent self-deletion
    if (userId === req.user._id.toString()) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check for associated claims
    const Claim = (await import('../models/Claim.js')).default;
    const claimCount = await Claim.countDocuments({ 
      $or: [{ employeeId: userId }, { createdBy: userId }] 
    });
    
    if (claimCount > 0) {
      return res.status(400).json({ 
        error: `Cannot delete user. They have ${claimCount} associated claim records. Please deactivate them instead.` 
      });
    }

    // Check for associated leaves
    const Leave = (await import('../models/Leave.js')).default;
    const leaveCount = await Leave.countDocuments({ 
      $or: [{ employeeId: userId }, { createdBy: userId }] 
    });

    if (leaveCount > 0) {
      return res.status(400).json({ 
        error: `Cannot delete user. They have ${leaveCount} associated leave records. Please deactivate them instead.` 
      });
    }

    const Grievance = (await import('../models/Grievance.js')).default;
    const grievanceCount = await Grievance.countDocuments({
      $or: [{ employeeId: userId }, { 'statusHistory.changedBy': userId }]
    });
    if (grievanceCount > 0) {
      return res.status(400).json({ error: 'This user has grievance records. Deactivate them instead.' });
    }

    await revokeSessions(userId);

    // Delete associated RefreshTokens
    const RefreshToken = (await import('../models/RefreshToken.js')).default;
    await RefreshToken.deleteMany({ userId });

    // Delete the user
    await User.findByIdAndDelete(userId);

    // Create audit log
    await createAuditLog(req.user._id, 'DELETE_USER', 'USER', {
      targetUserId: userId,
      userDetails: { name: user.name, email: user.email }
    });

    res.json({ message: 'User deleted permanently' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
};

export {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deactivateUser,
  deleteUser,
  resetPassword,
  getSupervisors,
  getEmployeeNames
};
