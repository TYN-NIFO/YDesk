import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import mongoose from 'mongoose';
import User from '../models/User.js';
import multer from 'multer';
import storageService from '../services/storage.js';
import RefreshToken from '../models/RefreshToken.js';
import AuditLog from '../models/AuditLog.js';
import { getEmailService } from '../services/mailService.js';
import { revokeSessions } from '../services/sessionService.js';

// Token configuration
const TOKEN_CONFIG = {
  accessToken: {
    expiresIn: process.env.JWT_EXPIRES_IN || '2h',
    algorithm: 'HS256'
  },
  refreshToken: {
    expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '30d',
    algorithm: 'HS256'
  }
};

// Generate access token with more claims
const generateAccessToken = (user) => {
  return jwt.sign(
    {
      userId: user._id,
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion || 0,
      jti: uuidv4(),
      type: 'access'
    },
    process.env.JWT_SECRET,
    { 
      expiresIn: TOKEN_CONFIG.accessToken.expiresIn,
      algorithm: TOKEN_CONFIG.accessToken.algorithm
    }
  );
};

// Generate refresh token
const generateRefreshToken = () => {
  return crypto.randomBytes(64).toString('hex');
};

// Set refresh token cookie with better security
const setRefreshTokenCookie = (res, token) => {
  const isProduction = process.env.NODE_ENV === 'production';
  const cookieDomain = process.env.COOKIE_DOMAIN || undefined;
  const secureCookies = String(process.env.SECURE_COOKIES || (isProduction ? 'true' : 'false')).toLowerCase() === 'true';
  const sameSite = isProduction ? 'none' : 'lax';

  const cookieOptions = {
    httpOnly: true,
    secure: secureCookies,
    sameSite,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    path: '/api/auth/',
    ...(cookieDomain ? { domain: cookieDomain } : {})
  };

  res.cookie('refreshToken', token, cookieOptions);
  res.clearCookie('refreshToken', {
    httpOnly: true, secure: secureCookies, sameSite,
    path: '/api/auth/refresh/', ...(cookieDomain ? { domain: cookieDomain } : {})
  });
};

// Clear refresh token cookie
const clearRefreshTokenCookie = (res) => {
  const isProduction = process.env.NODE_ENV === 'production';
  const cookieDomain = process.env.COOKIE_DOMAIN || undefined;
  const secureCookies = String(process.env.SECURE_COOKIES || (isProduction ? 'true' : 'false')).toLowerCase() === 'true';
  const sameSite = isProduction ? 'none' : 'lax';

  const cookieOptions = {
    httpOnly: true,
    secure: secureCookies,
    sameSite,
    path: '/api/auth/',
    ...(cookieDomain ? { domain: cookieDomain } : {})
  };

  res.clearCookie('refreshToken', cookieOptions);
  res.clearCookie('refreshToken', { ...cookieOptions, path: '/api/auth/refresh/' });
};

// Create audit log entry
const createAuditLog = async (userId, action, resource, details = {}) => {
  try {
    await AuditLog.create({
      userId,
      action,
      resource,
      details: {
        ...details,
        timestamp: new Date(),
        userAgent: details.userAgent || 'Unknown'
      }
    });
  } catch (error) {
    console.error('Audit log creation failed:', error);
  }
};

// Password and Google logins share the same refresh-token and revocation rules.
const createWebSession = async (user, req, res, action = 'TOKEN_AUTH') => {
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken();
  await RefreshToken.create({
    userId: user._id, tokenHash: RefreshToken.hashToken(refreshToken),
    jti: uuidv4(), family: uuidv4(), expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  });
  user.lastLoginAt = new Date();
  await user.save();
  setRefreshTokenCookie(res, refreshToken);
  await createAuditLog(user._id, action, 'AUTH', { ipAddress: req.ip, userAgent: req.get('User-Agent') });
  return { message: 'Authentication successful', user: user.toPublicJSON(), accessToken };
};

// Token-based authentication (replaces login)
const token = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ 
        error: 'Validation failed',
        details: 'Email and password are required' 
      });
    }

    // Find user
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !user.isActive) {
      return res.status(401).json({ 
        error: 'Authentication failed',
        details: 'Invalid credentials' 
      });
    }

    // Check password
    if (!user.checkPassword(password)) {
      return res.status(401).json({ 
        error: 'Authentication failed',
        details: 'Invalid credentials' 
      });
    }

    res.json(await createWebSession(user, req, res));
  } catch (error) {
    console.error('Token authentication error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};

// Refresh token with rotation
const refresh = async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    
    if (!refreshToken) {
      return res.status(401).json({ 
        error: 'Authentication failed',
        details: 'Refresh token required' 
      });
    }

    // Find refresh token in database
    const tokenDoc = await RefreshToken.findOneAndUpdate({
      tokenHash: RefreshToken.hashToken(refreshToken),
      isRevoked: false,
      expiresAt: { $gt: new Date() }
    }, { $set: { isRevoked: true } }, { new: false });

    if (!tokenDoc) {
      return res.status(401).json({ 
        error: 'Authentication failed',
        details: 'Invalid or expired refresh token' 
      });
    }

    // Get user
    const user = await User.findById(tokenDoc.userId);
    if (!user || !user.isActive) {
      return res.status(401).json({ 
        error: 'Authentication failed',
        details: 'User not found or inactive' 
      });
    }

    // Generate new tokens
    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken();
    const newJti = uuidv4();

    // Revoke old token and create new one (token rotation)

    await RefreshToken.create({
      userId: user._id,
      tokenHash: RefreshToken.hashToken(newRefreshToken),
      jti: newJti,
      family: tokenDoc.family, // Same family for rotation
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    });

    // Set new refresh token cookie
    setRefreshTokenCookie(res, newRefreshToken);

    // Create audit log
    await createAuditLog(user._id, 'TOKEN_REFRESH', 'AUTH', { 
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({
      message: 'Token refreshed successfully',
      user: user.toPublicJSON(),
      accessToken: newAccessToken
    });
  } catch (error) {
    console.error('Refresh error:', error);
    res.status(500).json({ error: 'Token refresh failed' });
  }
};

// Logout
const logout = async (req, res) => {
  try {
    await revokeSessions(req.user._id);
    const refreshToken = req.cookies.refreshToken;
    
    if (refreshToken) {
      // Revoke refresh token
      await RefreshToken.updateMany(
        { tokenHash: RefreshToken.hashToken(refreshToken) },
        { isRevoked: true }
      );
    }

    // Clear cookie
    clearRefreshTokenCookie(res);

    // Create audit log
    if (req.user) {
      await createAuditLog(req.user._id, 'LOGOUT', 'AUTH', { 
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });
    }

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
};

// Get user profile
const getProfile = async (req, res) => {
  try {
    if (req.method === 'PATCH') {
      // Update profile
      const { name, email, department, firstName, lastName, companyName, companyUrl, avatarUrl } = req.body;
      const updates = {};
      
      if (name) updates.name = name;
      if (email) updates.email = email.toLowerCase();
      if (department) updates.department = department;
      if (firstName !== undefined) updates.firstName = firstName;
      if (lastName !== undefined) updates.lastName = lastName;
      if (companyName !== undefined) updates.companyName = companyName;
      if (companyUrl !== undefined) updates.companyUrl = companyUrl;
      if (avatarUrl !== undefined) updates.avatarUrl = avatarUrl;

      const user = await User.findByIdAndUpdate(
        req.user._id,
        updates,
        { new: true, runValidators: true }
      );

      await createAuditLog(req.user._id, 'PROFILE_UPDATE', 'USER', { 
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

      res.json({
        message: 'Profile updated successfully',
        user: user.toPublicJSON()
      });
    } else {
      // Get profile
      res.json({
        user: req.user.toPublicJSON()
      });
    }
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ error: 'Profile operation failed' });
  }
};

// Avatar upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, callback) => callback(null, ['image/jpeg', 'image/png'].includes(file.mimetype))
});
const uploadAvatar = [
  upload.single('avatar'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }
      const info = await storageService.save(req.file);
      const publicUrl = info.url;

      await User.findByIdAndUpdate(req.user._id, { avatarUrl: publicUrl });

      await createAuditLog(req.user._id, 'AVATAR_UPLOAD', 'USER', {
        fileName: info.name,
        fileId: info.fileId,
        storageKey: info.storageKey
      });

      res.json({
        message: 'Avatar uploaded successfully',
        avatarUrl: publicUrl
      });
    } catch (error) {
      console.error('Avatar upload error:', error);
      res.status(500).json({ error: 'Avatar upload failed' });
    }
  }
];

// Check username availability
const checkUsername = async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email || typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({ 
        error: 'Validation failed',
        details: 'Valid email is required' 
      });
    }

    // Ensure database connection is ready
    if (mongoose.connection.readyState !== 1) {
      console.error('Database not connected, readyState:', mongoose.connection.readyState);
      return res.status(503).json({ 
        error: 'Service temporarily unavailable',
        details: 'Database connection not ready' 
      });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    
    return res.json({
      available: !existingUser,
      message: existingUser ? 'Email already taken' : 'Email available'
    });
  } catch (error) {
    console.error('Username check error:', error);
    // Ensure response hasn't been sent
    if (!res.headersSent) {
      return res.status(500).json({ 
        error: 'Username check failed',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
};

// Change password
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ 
        error: 'Validation failed',
        details: 'Current password and new password are required' 
      });
    }

    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const user = await User.findById(req.user._id);
    
    // Verify current password
    if (!user.checkPassword(currentPassword)) {
      return res.status(401).json({ 
        error: 'Authentication failed',
        details: 'Current password is incorrect' 
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    // Revoke all refresh tokens for this user
    await revokeSessions(user._id);

    await createAuditLog(user._id, 'PASSWORD_CHANGE', 'AUTH', { 
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({ error: 'Password change failed' });
  }
};

// Forgot password
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ 
        error: 'Validation failed',
        details: 'Email is required' 
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    
    // Always return the same message regardless of whether user exists
    // This prevents email enumeration attacks
    const responseMessage = 'If the email exists, a reset link has been sent';
    
    if (!user) {
      return res.json({ message: responseMessage });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    user.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.resetPasswordExpires = resetTokenExpiry;
    await user.save();

    // Send password reset email
    try {
      const activeEmailService = getEmailService();
      await activeEmailService.sendPasswordResetEmail(
        user.email,
        resetToken,
        user.name
      );
      console.log('✅ Password reset email sent to:', user.email);
    } catch (emailError) {
      console.error('❌ Failed to send password reset email:', emailError);
      // Don't reveal email sending failure to user for security
      // Log it for debugging but still return success message
    }

    await createAuditLog(user._id, 'FORGOT_PASSWORD', 'AUTH', { 
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({ message: responseMessage });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Forgot password failed' });
  }
};

// Reset password
const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ 
        error: 'Validation failed',
        details: 'Token and new password are required' 
      });
    }

    // Validate password length
    if (newPassword.length < 6) {
      return res.status(400).json({ 
        error: 'Validation failed',
        details: 'Password must be at least 6 characters long' 
      });
    }

    const user = await User.findOne({
      resetPasswordToken: crypto.createHash('sha256').update(token).digest('hex'),
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ 
        error: 'Invalid token',
        details: 'Password reset token is invalid or expired' 
      });
    }

    // Update password
    user.password = newPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    // Revoke all refresh tokens for this user (logout from all devices)
    await revokeSessions(user._id);

    // Send confirmation email
    try {
      const activeEmailService = getEmailService();
      await activeEmailService.sendPasswordResetConfirmation(user.email, user.name);
      console.log('✅ Password reset confirmation email sent to:', user.email);
    } catch (emailError) {
      console.error('❌ Failed to send confirmation email:', emailError);
      // Don't fail the request if confirmation email fails
    }

    await createAuditLog(user._id, 'PASSWORD_RESET', 'AUTH', { 
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Password reset failed' });
  }
};

// Revoke all sessions for a user (admin only)
const revokeUserSessions = async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Revoke all refresh tokens for the user
    await revokeSessions(userId);

    // Create audit log
    await createAuditLog(req.user._id, 'REVOKE_SESSIONS', 'USER', { 
      targetUserId: userId,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({ message: 'All sessions revoked successfully' });
  } catch (error) {
    console.error('Revoke sessions error:', error);
    res.status(500).json({ error: 'Failed to revoke sessions' });
  }
};

export {
  token,
  refresh,
  logout,
  getProfile,
  checkUsername,
  changePassword,
  forgotPassword,
  resetPassword,
  revokeUserSessions,
  uploadAvatar,
  createAuditLog,
  createWebSession,
  generateAccessToken
};
