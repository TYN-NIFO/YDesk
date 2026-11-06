import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  week: { type: Date, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['sending', 'sent', 'failed'], required: true },
  sentAt: Date,
  error: String
}, { timestamps: true });

schema.index({ week: 1, userId: 1 }, { unique: true });
export default mongoose.model('WeeklySummaryDelivery', schema);
