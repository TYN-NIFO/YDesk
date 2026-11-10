import mongoose from 'mongoose';

const attemptSchema = new mongoose.Schema({
  stateHash: { type: String, required: true, unique: true },
  nonce: { type: String, required: true },
  codeVerifier: { type: String, required: true },
  browserChallenge: { type: String, required: true },
  expiresAt: { type: Date, required: true }
});
attemptSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const codeSchema = new mongoose.Schema({
  codeHash: { type: String, required: true, unique: true },
  browserChallenge: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  tokenVersion: { type: Number, required: true },
  expiresAt: { type: Date, required: true }
});
codeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
codeSchema.index({ userId: 1 });

export const GoogleLoginAttempt = mongoose.model('GoogleLoginAttempt', attemptSchema);
export const GoogleLoginCode = mongoose.model('GoogleLoginCode', codeSchema);
