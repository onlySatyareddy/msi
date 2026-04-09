const AuditLog = require('../models/AuditLog');
const StatusHistory = require('../models/StatusHistory');

/**
 * Log an audit action
 */
const logAudit = async ({ entityType, entityId, action, user, oldData, newData, reason }) => {
  try {
    await AuditLog.create({
      entityType,
      entityId,
      action,
      userId: user?._id || null,
      userName: user?.name || 'System',
      role: user?.role || 'SYSTEM',
      oldData: oldData || null,
      newData: newData || null,
      reason: reason || null
    });
  } catch (err) {
    console.error('Audit log error:', err.message);
  }
};

/**
 * Log a status change
 */
const logStatusChange = async ({ entityType, entityId, oldStatus, newStatus, user, reason }) => {
  try {
    await StatusHistory.create({
      entityType,
      entityId,
      oldStatus,
      newStatus,
      changedBy: user?._id || null,
      changedByName: user?.name || 'System',
      changedByRole: user?.role || 'SYSTEM',
      reason: reason || null
    });
  } catch (err) {
    console.error('Status history error:', err.message);
  }
};

module.exports = { logAudit, logStatusChange };
