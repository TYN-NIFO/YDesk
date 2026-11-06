import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ 
        error: 'Authentication failed',
        details: 'Access token required' 
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if token is an access token
    if (decoded.type !== 'access') {
      return res.status(401).json({ 
        error: 'Authentication failed',
        details: 'Invalid token type' 
      });
    }

    // Find user
    const user = await User.findById(decoded.userId).select('-passwordHash');
    
    if (!user || !user.isActive || (decoded.tokenVersion || 0) !== (user.tokenVersion || 0)) {
      return res.status(401).json({ 
        error: 'Authentication failed',
        details: 'User not found or inactive' 
      });
    }

    // Add user to request
    req.user = user;
    req.token = token;
    req.tokenData = decoded;
    
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Authentication failed',
        details: 'Token expired' 
      });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        error: 'Authentication failed',
        details: 'Invalid token' 
      });
    }
    console.error('Auth middleware error:', error);
    res.status(500).json({ 
      error: 'Authentication error',
      details: 'Internal server error' 
    });
  }
};

export { auth };
