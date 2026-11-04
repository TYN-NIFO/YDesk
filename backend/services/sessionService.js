import User from '../models/User.js';
import RefreshToken from '../models/RefreshToken.js';
import { OAuthRefreshToken, OAuthCode } from '../models/OAuth.js';

export async function revokeSessions(userId) {
  await User.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } });
  await Promise.all([
    RefreshToken.updateMany({ userId }, { isRevoked: true }),
    OAuthRefreshToken.deleteMany({ userId }),
    OAuthCode.deleteMany({ userId })
  ]);
}
