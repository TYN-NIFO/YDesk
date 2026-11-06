import mongoose from 'mongoose';
import { getNextSequence } from '../services/counterService.js';

export const GRIEVANCE_CATEGORIES = [
  'Workplace Experience',
  'Ideas & Suggestions',
  'Appreciation',
  'Pay & Reimbursement',
  'Policy/Process',
  'Facilities & Safety',
  'Other'
];

export const FEEDBACK_TYPES = ['general', 'suggestion', 'appreciation', 'concern'];
const legacyCategories = ['Workplace Harassment', 'Discrimination', 'Manager/Peer Conflict', 'Workload & Hours'];

export const GRIEVANCE_STATUSES = ['submitted', 'under_review', 'resolved', 'closed'];

// Allowed status moves for handlers. A resolved grievance can be reopened.
export const GRIEVANCE_TRANSITIONS = {
  submitted: ['under_review', 'resolved', 'closed'],
  under_review: ['resolved', 'closed'],
  resolved: ['under_review', 'closed'],
  closed: []
};

const attachmentSchema = new mongoose.Schema({
  privateStorage: { type: Boolean, default: false },
  legacyStorageKey: String,
  fileId: { type: String, required: true },
  name: { type: String, required: true },
  size: { type: Number, required: true },
  mime: { type: String, required: true },
  storageKey: { type: String, required: true }
}, { _id: false });

const statusHistorySchema = new mongoose.Schema({
  status: { type: String, enum: GRIEVANCE_STATUSES, required: true },
  note: { type: String, trim: true, default: '' },
  changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  changedAt: { type: Date, default: Date.now }
}, { _id: false });

const GrievanceSchema = new mongoose.Schema({
  feedbackType: { type: String, enum: FEEDBACK_TYPES, default: 'concern' },
  grievanceId: {
    type: String,
    unique: true,
    required: false // Auto-generated in pre-save hook
  },
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  category: {
    type: String,
    enum: [...GRIEVANCE_CATEGORIES, ...legacyCategories],
    required: true
  },
  subject: {
    type: String,
    trim: true,
    required: true,
    maxlength: 150
  },
  description: {
    type: String,
    trim: true,
    required: true,
    maxlength: 5000
  },
  incidentDate: {
    type: Date
  },
  attachments: [attachmentSchema],
  status: {
    type: String,
    enum: GRIEVANCE_STATUSES,
    default: 'submitted'
  },
  statusHistory: [statusHistorySchema],
  resolvedAt: {
    type: Date
  }
}, {
  timestamps: true
});

GrievanceSchema.index({ employeeId: 1, createdAt: -1 });
GrievanceSchema.index({ status: 1, createdAt: -1 });

GrievanceSchema.pre('save', async function (next) {
  if (!this.grievanceId) {
    try {
      const seq = await getNextSequence('grievanceId');
      const year = (this.createdAt || new Date()).getFullYear();
      this.grievanceId = `feedback_${year}_${String(seq).padStart(5, '0')}`;
    } catch (error) {
      console.error('Error generating grievance ID:', error);
      return next(new Error('Failed to generate grievance ID'));
    }
  }
  next();
});

export default mongoose.model('Grievance', GrievanceSchema);
