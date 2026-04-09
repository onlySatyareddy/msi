const mongoose = require('mongoose');

const securitySchema = new mongoose.Schema({
  isin:            { type: String, required: true, unique: true, uppercase: true, trim: true },
  companyName:     { type: String, required: true, trim: true },
  totalShares:     { type: Number, required: true, min: 1 },
  allocatedShares: { type: Number, default: 0, min: 0 },
  status:          { type: String, enum: ['PENDING','APPROVED','REJECTED'], default: 'PENDING' },
  remarks:         { type: String },
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

securitySchema.virtual('availableShares').get(function() {
  return this.totalShares - this.allocatedShares;
});
securitySchema.set('toJSON', { virtuals: true });
securitySchema.index({ status: 1 });

module.exports = mongoose.model('Security', securitySchema);
