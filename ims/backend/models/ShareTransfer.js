const mongoose = require('mongoose');

const shareTransferSchema = new mongoose.Schema({
  fromInvestor:     { type: mongoose.Schema.Types.ObjectId, ref: 'Investor', required: true },
  toInvestor:       { type: mongoose.Schema.Types.ObjectId, ref: 'Investor', required: true },
  security:         { type: mongoose.Schema.Types.ObjectId, ref: 'Security', required: true },
  quantity:         { type: Number, required: true, min: 1 },
  remarks:          { type: String },

  beforeFromShares: { type: Number, required: true },
  beforeToShares:   { type: Number, required: true },
  afterFromShares:  { type: Number, default: null },
  afterToShares:    { type: Number, default: null },
  lockedQuantity:   { type: Number, default: 0 },

  status: {
    type: String,
    enum: ['INITIATED','SUBMITTED','UNDER_REVIEW','APPROVED','REJECTED','EXECUTED'],
    default: 'INITIATED'
  },
  rejectionReason:  { type: String },

  createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  submittedAt: { type: Date },
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt:  { type: Date },
  rejectedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  rejectedAt:  { type: Date },
  executedAt:  { type: Date },

  auditHistory: [{
    action:      { type: String, required: true },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    performedAt: { type: Date, default: Date.now },
    details:     { type: mongoose.Schema.Types.Mixed },
    remarks:     { type: String }
  }],
  isDeleted:   { type: Boolean, default: false },
  deletedAt:   { type: Date },
  deletedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

shareTransferSchema.index({ fromInvestor: 1, status: 1 });
shareTransferSchema.index({ status: 1 });
shareTransferSchema.index({ createdAt: -1 });

module.exports = mongoose.model('ShareTransfer', shareTransferSchema);
