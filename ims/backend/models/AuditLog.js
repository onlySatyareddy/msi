const mongoose = require('mongoose');
const crypto = require('crypto');

const auditLogSchema = new mongoose.Schema({
  entityType:  { type: String, required: true },
  entityId:    { type: mongoose.Schema.Types.ObjectId },
  action:      { type: String, required: true },
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userName:    { type: String, required: true },
  role:        { type: String, required: true },
  oldData:     { type: mongoose.Schema.Types.Mixed, default: null },
  newData:     { type: mongoose.Schema.Types.Mixed, default: null },
  reason:      { type: String },
  immutableHash: { type: String, unique: true },
  ipAddress: { type: String, default: null },
  // Validation and reconciliation fields
  issueType:   { 
    type: String, 
    enum: ['SHARE_MISMATCH', 'NEGATIVE_SHARES', 'TRANSFER_ERROR', 'DIVIDEND_ERROR', 'SECURITY_MISMATCH', 'REFERENTIAL_INTEGRITY', 'AUTO_FIX', 'AUTO_DELETE', null],
    default: null 
  },
  severity:    { 
    type: String, 
    enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL', null],
    default: null 
  },
  autoFixed:   { type: Boolean, default: false },
  fixAction:   { type: String },
  referenceId: { type: mongoose.Schema.Types.ObjectId },
  validationRunId: { type: String }
}, { timestamps: true, collection: 'audit_logs' });

auditLogSchema.pre('save', function(next) {
  if (this.isNew) {
    const data = { entityType: this.entityType, entityId: this.entityId,
      action: this.action, userId: this.userId, ts: new Date().toISOString() };
    this.immutableHash = crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
  }
  next();
});

auditLogSchema.pre(['updateOne','updateMany','findOneAndUpdate'], function() {
  throw new Error('Audit logs are immutable');
});

auditLogSchema.index({ entityType: 1, entityId: 1 });
auditLogSchema.index({ userId: 1 });
auditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
