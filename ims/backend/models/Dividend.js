const mongoose = require('mongoose');

const dividendSchema = new mongoose.Schema({
  security: { type: mongoose.Schema.Types.ObjectId, ref: 'Security', required: true },
  fiscalYear: { type: String, required: true }, // e.g., "2024-2025"
  dividendPerShare: { type: Number, required: true, min: 0 },
  totalDividend: { type: Number, default: 0 },
  totalShares: { type: Number, default: 0 },
  totalInvestors: { type: Number, default: 0 },
  recordDate: { type: Date },
  paymentDate: { type: Date },
  description: { type: String },
  status: { type: String, enum: ['DRAFT', 'PENDING', 'APPROVED', 'PAID'], default: 'DRAFT' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt: { type: Date },
  rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  rejectedAt: { type: Date },
  rejectionReason: { type: String },
  paidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  paidAt: { type: Date }
}, { timestamps: true });

dividendSchema.index({ security: 1, createdAt: -1 });
dividendSchema.index({ fiscalYear: 1 });
dividendSchema.index({ status: 1 });

module.exports = mongoose.model('Dividend', dividendSchema);
