const mongoose = require('mongoose');

const complaintSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  
  // Optional mappings
  investor: { type: mongoose.Schema.Types.ObjectId, ref: 'Investor', default: null },
  security: { type: mongoose.Schema.Types.ObjectId, ref: 'Security', default: null },
  
  status: {
    type: String,
    enum: ['PENDING', 'RESOLVED', 'CLOSED'],
    default: 'PENDING'
  },
  
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now },
  
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  resolvedAt: { type: Date },
  resolution: { type: String },
  
  closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  closedAt: { type: Date },
  
  comments: [{
    text: { type: String, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    createdAt: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

complaintSchema.index({ status: 1, createdAt: -1 });
complaintSchema.index({ createdBy: 1 });

module.exports = mongoose.model('Complaint', complaintSchema);
