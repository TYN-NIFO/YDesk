import mongoose from 'mongoose';
import crypto from 'crypto';

const refreshTokenSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  tokenHash: {
    type: String,
    required: true
  },
  jti: {
    type: String,
    required: true,
    unique: true
  },
  family: {
    type: String,
    required: true
  },
  expiresAt: {
    type: Date,
    required: true
  },
  isRevoked: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
refreshTokenSchema.index({ userId: 1 });
refreshTokenSchema.index({ family: 1 });
refreshTokenSchema.index({ isRevoked: 1 });

// Method to hash token
refreshTokenSchema.statics.hashToken = function(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
};

// Method to verify token
refreshTokenSchema.methods.verifyToken = function(token) {
  const actual = Buffer.from(this.constructor.hashToken(token));
  const expected = Buffer.from(this.tokenHash);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
};

// TTL index to automatically delete expired tokens (jti field already has unique index)
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('RefreshToken', refreshTokenSchema);
