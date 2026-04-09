const mongoose = require('mongoose');

const statusHistorySchema = new mongoose.Schema({
  entityType:     { type: String, required: true },
  entityId:       { type: mongoose.Schema.Types.ObjectId, required: true },
  oldStatus:      { type: String },
  newStatus:      { type: String, required: true },
  changedBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  changedByName:  { type: String },
  changedByRole:  { type: String },
  reason:         { type: String }
}, { timestamps: true });

statusHistorySchema.index({ entityType: 1, entityId: 1, createdAt: -1 });

module.exports = mongoose.model('StatusHistory', statusHistorySchema);
