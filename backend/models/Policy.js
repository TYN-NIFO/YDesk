import mongoose from 'mongoose';

const PolicySchema = new mongoose.Schema({
  version: { 
    type: String, 
    required: true,
    default: 'v1.0'
  },
  categoryDefinitions: { type: [mongoose.Schema.Types.Mixed], default: undefined },
  exchangeRates: { type: mongoose.Schema.Types.Mixed, default: {} },
  approvalMode: {
    type: String,
    enum: ['both', 'any'],
    default: 'both'
  },
  claimCategories: {
    type: [String],
    default: [
      'Travel & Lodging',
      'Client Entertainment & Business Meals',
      'Employee Welfare & HR',
      'Training & Development',
      'Marketing & Business Development',
      'Subscriptions & Memberships',
      'Office & Admin',
      'IT & Software',
      'Project / Client-Billable Expenses',
      'Finance, Legal & Compliance',
      'Advances & Reconciliations'
    ]
  },
  maxAmountBeforeFinanceManager: {
    type: Number,
    default: 10000
  },
  allowedFileTypes: {
    type: [String],
    default: ['pdf', 'jpg', 'jpeg', 'png']
  },
  maxFileSizeMB: {
    type: Number,
    default: 4
  },
  payoutChannels: {
    type: [String],
    default: ['Bank Transfer', 'Cash', 'Check']
  },
  autoAssignSupervisors: {
    type: Boolean,
    default: false
  },
  claimRetentionDays: {
    type: Number,
    default: 365
  },
  mileageRate: { 
    type: Number, 
    default: 12 
  }, // ₹/km
  cityClasses: { 
    type: [String], 
    default: ["A", "B", "C"] 
  },
  mealCaps: { // per city class
    type: mongoose.Schema.Types.Mixed, // { A: { breakfast: 150, lunch: 300, dinner: 400, snack: 100 }, ... }
    default: {
      A: { breakfast: 200, lunch: 350, dinner: 500, snack: 150 },
      B: { breakfast: 150, lunch: 300, dinner: 400, snack: 120 },
      C: { breakfast: 120, lunch: 250, dinner: 350, snack: 100 }
    }
  },
  lodgingCaps: { 
    type: mongoose.Schema.Types.Mixed, 
    default: { A: 4000, B: 3000, C: 2000 }
  }, // { A: 3500, B: 2500, C: 1800 }
  requiredDocuments: { // per line type
    type: mongoose.Schema.Types.Mixed, // { flight: ["airline_invoice","mmt_invoice"], train:["ticket","payment_proof"], ... }
    default: {
      default: ['supporting_doc'],
      flight: ['airline_invoice', 'mmt_invoice'],
      train: ['ticket', 'payment_proof']
    }
  },
  adminSubCategories: { 
    type: [String], 
    default: ["printout", "repairs", "filing", "others"] 
  },
  rulesBehavior: { // "hard" blocks submit; "soft" allows with override
    missingDocuments: { 
      type: String, 
      default: "hard" 
    },
    capExceeded: { 
      type: String, 
      default: "soft" 
    }
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, { 
  timestamps: true 
});

export default mongoose.model('Policy', PolicySchema);
