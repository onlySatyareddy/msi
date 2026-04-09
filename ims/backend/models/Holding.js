const mongoose = require('mongoose');

const holdingSchema = new mongoose.Schema({
  investor:        { type: mongoose.Schema.Types.ObjectId, ref: 'Investor', required: true },
  security:        { type: mongoose.Schema.Types.ObjectId, ref: 'Security', required: true },
  shares:          { type: Number, required: true, min: 0, default: 0 },
  lockedShares:    { type: Number, default: 0, min: 0 },
  status:          { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
  rejectionReason: { type: String },
  createdBy:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  checkedBy:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt:      { type: Date },
  rejectedBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  rejectedAt:      { type: Date },
  auditLogs:       [{
    action:       { type: String },
    performedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    performedAt:  { type: Date, default: Date.now },
    details:      { type: mongoose.Schema.Types.Mixed }
  }],
  isDeleted:       { type: Boolean, default: false },
  deletedAt:       { type: Date },
  deletedBy:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

holdingSchema.index({ investor: 1, security: 1 }, { unique: true });
holdingSchema.virtual('availableShares').get(function() { return this.shares - this.lockedShares; });
holdingSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Holding', holdingSchema);
