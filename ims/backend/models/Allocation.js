const mongoose = require('mongoose');

const allocationSchema = new mongoose.Schema({
  investor:        { type: mongoose.Schema.Types.ObjectId, ref: 'Investor', required: true },
  security:        { type: mongoose.Schema.Types.ObjectId, ref: 'Security', required: true },
  quantity:        { type: Number, required: true, min: 1 },
  beforeShares:    { type: Number, required: true, default: 0 },
  afterShares:     { type: Number, default: null },
  remarks:         { type: String },
  status:          { type: String, enum: ['PENDING','APPROVED','REJECTED'], default: 'PENDING' },
  rejectionReason: { type: String },
  createdBy:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  approvedBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt:      { type: Date },
  rejectedBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  rejectedAt:      { type: Date },
  isDeleted:       { type: Boolean, default: false },
  deletedAt:       { type: Date },
  deletedBy:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('Allocation', allocationSchema);
