const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  title: { type: String, required: true },
  message: { type: String, required: true },
  type: {
    type: String,
    enum: ['SECURITY', 'TRANSFER', 'COMPLAINT', 'INVESTOR', 'SYSTEM'],
    required: true
  },
  event: {
    type: String,
    enum: [
      'INVESTOR_CREATED',
      'INVESTOR_EDITED',
      'KYC_SUBMITTED',
      'KYC_APPROVED',
      'KYC_REJECTED',
      'SECURITIES_CREATED',
      'SECURITIES_APPROVED',
      'SECURITIES_REJECTED',
      'ALLOCATION_DONE',
      'ALLOCATION_APPROVED',
      'ALLOCATION_REJECTED',
      'SHARE_TRANSFER',
      'TRANSFER_SUBMITTED',
      'TRANSFER_APPROVED',
      'TRANSFER_REJECTED',
      'COMPLAINT_RAISED',
      'DIVIDEND_DECLARED'
    ],
    required: true
  },
  status: {
    type: String,
    enum: ['PENDING', 'SENT', 'DELIVERED', 'FAILED'],
    default: 'PENDING'
  },
  deliveryMode: {
    type: String,
    enum: ['ANY', 'ALL'],
    default: 'ANY'
  },
  deliveryAttempts: { type: Number, default: 0 },
  lastDeliveryAttempt: { type: Date },
  // Track delivery per user (multi-device, multi-user safe)
  deliveredTo: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    deliveredAt: { type: Date, default: Date.now },
    deviceId: { type: String } // Optional: track device ID for multi-device support
  }],
  entityId: { type: String }, // ID of related entity (security, transfer, etc.)
  entityType: { type: String }, // 'security', 'transfer', 'complaint', 'investor'
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  createdByName: { type: String },
  recipients: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    role: { type: String, enum: ['MAKER', 'CHECKER', 'ADMIN'] },
    read: { type: Boolean, default: false },
    readAt: { type: Date }
  }],
  // For role-based notifications (sent to all users with specific roles)
  targetRoles: [{ type: String, enum: ['MAKER', 'CHECKER', 'ADMIN'] }],
  // For user-specific notifications
  targetUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  link: { type: String }, // Frontend route to navigate to
  metadata: { type: mongoose.Schema.Types.Mixed }, // Additional data
  isBroadcast: { type: Boolean, default: false }
}, {
  timestamps: true
});

// Index for performance
notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ 'recipients.user': 1, 'recipients.read': 1 });
notificationSchema.index({ targetRoles: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
