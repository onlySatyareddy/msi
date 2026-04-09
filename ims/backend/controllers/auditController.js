const AuditLog = require('../models/AuditLog');
const StatusHistory = require('../models/StatusHistory');
const auditValidationService = require('../services/auditValidationService');

exports.getLogs = async (req, res) => {
  try {
    const { entityType, entityId, action, page = 1, limit = 50 } = req.query;
    const q = {};
    if (entityType) q.entityType = entityType;
    if (entityId) q.entityId = entityId;
    if (action) q.action = action;
    const skip = (parseInt(page)-1)*parseInt(limit);
    const [logs, total] = await Promise.all([
      AuditLog.find(q).populate('userId', 'name role').sort({ createdAt: -1 }).skip(skip).limit(+limit),
      AuditLog.countDocuments(q)
    ]);
    res.json({ logs, pagination: { page: +page, limit: +limit, total, pages: Math.ceil(total/+limit) } });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.getStatusHistory = async (req, res) => {
  try {
    const { entityType, entityId } = req.query;
    const q = {};
    if (entityType) q.entityType = entityType;
    if (entityId) q.entityId = entityId;
    const history = await StatusHistory.find(q)
      .populate('changedBy', 'name role')
      .sort({ createdAt: -1 });
    res.json({ history });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

/**
 * Run full system validation with optional auto-fix
 * GET /api/audit/validate?autoFix=true
 */
exports.runValidation = async (req, res) => {
  try {
    const autoFix = req.query.autoFix === 'true';
    const userId = req.user._id;
    const userName = req.user.name || req.user.email;
    const role = req.user.role;

    // Run validation
    const results = await auditValidationService.runFullAudit({
      autoFix,
      userId,
      userName,
      role
    });

    res.json(results);
  } catch (err) {
    console.error('Validation error:', err);
    res.status(500).json({ message: err.message });
  }
};
