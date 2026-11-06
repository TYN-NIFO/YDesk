import mongoose from 'mongoose';
import { getNextClaimSequence } from '../services/counterService.js';

const AttachmentSchema = new mongoose.Schema({
  fileId: String,
  name: String,
  size: Number,
  mime: String,
  storageKey: String,
  url: String, // Public S3 URL
  label: String // for required document matching
}, { _id: false });

const LineItemSchema = new mongoose.Schema({
  type: String,
  cityClass: { type: String, enum: ['A', 'B', 'C'], default: 'A' },
  mealType: { type: String, enum: ['breakfast', 'lunch', 'dinner', 'snack'] },
  nights: { type: Number, min: 1, max: 365, default: 1 },
  date: { type: Date, required: true },
  subCategory: { type: String, required: true },
  description: { type: String, required: true },
  currency: { type: String, enum: ['INR', 'USD', 'EUR'], default: 'INR' },
  amount: { type: Number, required: true },
  gstTotal: { type: Number, default: 0 },
  amountInINR: { type: Number, required: true },
  attachments: { type: [AttachmentSchema], default: [] }
}, { _id: true });

const AdvanceSchema = new mongoose.Schema({
  date: Date,
  refNo: String,
  amount: Number
}, { _id: true });

const ClaimSchema = new mongoose.Schema({
  // Claim identification
  claimId: {
    type: String,
    unique: true,
    required: false  // Auto-generated in pre-save hook
  },
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  businessUnit: {
    type: String,
    enum: ['Coinnovation', 'General'],
    required: true
  },
  category: {
    type: String,
    required: true
  },
  advances: {
    type: [AdvanceSchema],
    default: []
  },
  lineItems: {
    type: [LineItemSchema],
    default: []
  },
  totalsByHead: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  grandTotal: Number,
  netPayable: Number,
  status: {
    type: String,
    enum: ['submitted', 'approved', 'rejected', 'finance_approved', 'paid', 'done'],
    default: 'submitted'
  },
  policyVersion: String,
  violations: [{
    code: String,
    message: String,
    level: {
      type: String,
      enum: ['warn', 'error']
    }
  }],
  attachments: {
    type: [AttachmentSchema],
    default: []
  },

  // Approval/Rejection tracking
  supervisorApproval: {
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: Date,
    status: { type: String, enum: ['approved', 'rejected', 'pending'], default: 'pending' },
    reason: String,
    notes: String
  },
  financeApproval: {
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: Date,
    status: { type: String, enum: ['approved', 'rejected', 'pending'], default: 'pending' },
    reason: String,
    notes: String
  },

  // Payment tracking
  payment: {
    paidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    paidAt: Date,
    channel: String,
    reference: String
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
ClaimSchema.index({ employeeId: 1, createdAt: -1 });
ClaimSchema.index({ status: 1 });
ClaimSchema.index({ claimId: 1 });

// Pre-save middleware to generate claimId
ClaimSchema.pre('save', async function (next) {
  if (!this.claimId) {
    try {
      const seq = await getNextClaimSequence();
      const year = new Date().getFullYear();
      this.claimId = `claim_${year}_${String(seq).padStart(5, '0')}`;
    } catch (error) {
      console.error('Error generating claim ID:', error);
      return next(new Error('Failed to generate claim ID'));
    }
  }

  next();
});

export default mongoose.model('Claim', ClaimSchema);
