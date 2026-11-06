import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  week: { type: Date, required: true, unique: true },
  periodStart: { type: Date, required: true },
  periodEnd: { type: Date, required: true },
  status: { type: String, enum: ['pending', 'sent'], required: true },
  sentAt: Date
}, { timestamps: true });

schema.index({ status: 1, periodEnd: -1 });
export default mongoose.model('WeeklyReport', schema);
