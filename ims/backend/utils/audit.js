const AuditLog = require('../models/AuditLog');
const StatusHistory = require('../models/StatusHistory');

/**
 * Extract client IP address from request
 * Handles proxy scenarios with x-forwarded-for header
 */
const extractIpAddress = (req) => {
  if (!req) return null;

  // Check for x-forwarded-for header (common in production/proxy setups)
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    // x-forwarded-for can contain multiple IPs, take the first one
    const ips = forwarded.split(',').map(ip => ip.trim());
    return ips[0] || null;
  }

  // Fallback to req.ip (Express built-in)
  if (req.ip) return req.ip;

  // Fallback to connection remote address
  if (req.connection?.remoteAddress) return req.connection.remoteAddress;

  // Fallback to socket remote address
  if (req.socket?.remoteAddress) return req.socket.remoteAddress;

  return null;
};

/**
 * Log an audit action
 * Now accepts req object to extract IP address
 */
const logAudit = async ({ entityType, entityId, action, user, oldData, newData, reason, req }) => {
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
      reason: reason || null,
      ipAddress: extractIpAddress(req)
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
