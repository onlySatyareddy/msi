const mongoose = require('mongoose');

const ledgerSchema = new mongoose.Schema({
  investor:    { type: mongoose.Schema.Types.ObjectId, ref: 'Investor', required: true },
  security:    { type: mongoose.Schema.Types.ObjectId, ref: 'Security', required: true },
  type:        { type: String, enum: ['CREDIT','DEBIT'], required: true },
  quantity:    { type: Number, required: true, min: 1 },
  balanceAfter:{ type: Number, required: true },
  referenceId: { type: mongoose.Schema.Types.ObjectId },
  refType:     { type: String, enum: ['ALLOCATION','TRANSFER'] },
  description: { type: String },
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

ledgerSchema.index({ investor: 1, security: 1, createdAt: -1 });
ledgerSchema.index({ referenceId: 1 });

module.exports = mongoose.model('TransactionLedger', ledgerSchema);
