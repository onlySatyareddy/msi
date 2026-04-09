const Security = require('../models/Security');
const { logAudit, logStatusChange } = require('../utils/audit');
const { emitNotification, createRoleBasedNotifications, createNotification } = require('../utils/notifications');
const DeleteValidationService = require('../services/deleteValidationService');
const DeleteReconciliationService = require('../services/deleteReconciliationService');

const emit = (req, event, data) => { const io = req.app.get('socketio'); if (io) io.emit(event, data); };

exports.getAll = async (req, res) => {
  try {
    const { status, search, page = 1, limit = 20 } = req.query;
    const q = {};

    // Role-based filtering - TEMPORARILY DISABLED FOR DEBUGGING
    // if (req.user.role === 'MAKER') {
    //   q.createdBy = req.user._id;
    // }
    // CHECKER and ADMIN see all records (no status filter)

    if (status && status !== 'all') q.status = status.toUpperCase();
    if (search) q.$or = [{ companyName: { $regex: search, $options: 'i' } }, { isin: { $regex: search, $options: 'i' } }];
    const skip = (parseInt(page)-1)*parseInt(limit);
    const [securities, total] = await Promise.all([
      Security.find(q).populate('createdBy approvedBy rejectedBy', 'name role').sort({ createdAt: -1 }).skip(skip).limit(+limit),
      Security.countDocuments(q)
    ]);
    res.json({ securities, pagination: { page: +page, limit: +limit, total, pages: Math.ceil(total/+limit) } });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.getOne = async (req, res) => {
  try {
    const s = await Security.findById(req.params.id).populate('createdBy approvedBy rejectedBy', 'name role');
    if (!s) return res.status(404).json({ message: 'Security not found' });
    res.json({ security: s });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.create = async (req, res) => {
  try {
    const { isin, companyName, totalShares, remarks } = req.body;
    if (!isin || !companyName || !totalShares) return res.status(400).json({ message: 'isin, companyName, totalShares required' });
    if (await Security.findOne({ isin: isin.toUpperCase() })) return res.status(409).json({ message: 'ISIN already exists' });
    const s = await Security.create({ isin: isin.toUpperCase(), companyName, totalShares: +totalShares, remarks, createdBy: req.user._id });
    await logAudit({ entityType: 'Security', entityId: s._id, action: 'CREATE', user: req.user, newData: s.toJSON() });
    emit(req, 'security_update', { action: 'CREATED', security: s });
    
    // Notification: Securities Created → Checker + Admin
    await createRoleBasedNotifications({
      req,
      event: 'SECURITIES_CREATED',
      message: `New security "${s.companyName}" (${s.isin}) created by ${req.user.fullName || req.user.email}`,
      entityType: 'Security',
      entityId: s._id,
      targetRoles: ['CHECKER', 'ADMIN']
    });
    
    res.status(201).json({ message: 'Security created (PENDING approval)', security: s });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.approve = async (req, res) => {
  try {
    const s = await Security.findById(req.params.id);
    if (!s) return res.status(404).json({ message: 'Security not found' });
    if (s.status !== 'PENDING') return res.status(400).json({ message: 'Only PENDING securities can be approved' });

    // Prevent self-approval (except Admin)
    if (s.createdBy && s.createdBy.toString() === req.user._id.toString() && req.user.role !== 'ADMIN')
      return res.status(403).json({ message: 'Cannot approve your own security' });

    const old = s.status;
    s.status = 'APPROVED'; s.approvedBy = req.user._id; s.approvedAt = new Date();
    await s.save();
    await logStatusChange({ entityType: 'Security', entityId: s._id, oldStatus: old, newStatus: 'APPROVED', user: req.user });
    await logAudit({ entityType: 'Security', entityId: s._id, action: 'APPROVE', user: req.user });
    emit(req, 'security_update', { action: 'APPROVED', security: s });
    
    // Notification: Securities Approved → Maker
    if (s.createdBy && s.createdBy.toString() !== req.user._id.toString()) {
      await createNotification({
        userId: s.createdBy,
        event: 'SECURITIES_APPROVED',
        message: `Your security "${s.companyName}" (${s.isin}) was approved by ${req.user.fullName || req.user.email}`,
        entityType: 'Security',
        entityId: s._id,
        createdBy: req.user._id,
        createdByName: req.user.fullName || req.user.email,
        link: `/app/securities/${s._id}`,
        isRead: false,
        createdAt: new Date()
      });
    }
    
    res.json({ message: 'Security approved', security: s });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.reject = async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ message: 'Rejection reason required' });
    const s = await Security.findById(req.params.id);
    if (!s) return res.status(404).json({ message: 'Security not found' });
    if (s.status !== 'PENDING') return res.status(400).json({ message: 'Only PENDING securities can be rejected' });

    // Prevent self-rejection (except Admin)
    if (s.createdBy && s.createdBy.toString() === req.user._id.toString() && req.user.role !== 'ADMIN')
      return res.status(403).json({ message: 'Cannot reject your own security' });

    const old = s.status;
    s.status = 'REJECTED'; s.rejectedBy = req.user._id; s.rejectedAt = new Date(); s.rejectionReason = reason;
    await s.save();
    await logStatusChange({ entityType: 'Security', entityId: s._id, oldStatus: old, newStatus: 'REJECTED', user: req.user, reason });
    await logAudit({ entityType: 'Security', entityId: s._id, action: 'REJECT', user: req.user, newData: { reason } });
    
    // Notify the maker who created the security
    if (s.createdBy?.toString() !== req.user._id.toString()) {
      await emitNotification('SECURITIES_REJECTED', {
        userId: s.createdBy,
        message: `Security (${s.isin} - ${s.companyName}) was rejected. Reason: ${reason}`,
        entityType: 'Security',
        entityId: s._id,
        createdBy: req.user._id,
        createdByName: req.user.fullName || req.user.email,
        link: `/app/securities/${s._id}`,
        isRead: false,
        createdAt: new Date()
      });
    }
    
    emit(req, 'security_update', { action: 'REJECTED', security: s });
    res.json({ message: 'Security rejected', security: s });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.remove = async (req, res) => {
  try {
    const security = await Security.findById(req.params.id);
    if (!security) return res.status(404).json({ message: 'Security not found' });
    if (security.isDeleted) return res.status(400).json({ message: 'Security already deleted' });

    // Pre-delete validation
    const validation = await DeleteValidationService.validateSecurityDelete(security);
    if (!validation.canDelete) {
      return res.status(400).json({
        message: 'Cannot delete security',
        errors: validation.errors,
        warnings: validation.warnings,
        impact: validation.impact
      });
    }

    // Store old data for audit and reconciliation
    const oldData = security.toJSON();

    // Perform soft delete
    security.isDeleted = true;
    security.deletedAt = new Date();
    security.deletedBy = req.user._id;
    await security.save();

    // Audit log
    await logAudit({
      entityType: 'Security',
      entityId: security._id,
      action: 'DELETE',
      user: req.user,
      oldData: oldData,
      newData: { isDeleted: true, deletedAt: security.deletedAt, deletedBy: req.user._id }
    });

    // Post-delete reconciliation
    const reconciliation = await DeleteReconciliationService.fullReconciliation({
      entityType: 'Security',
      entityId: security._id,
      deletedData: oldData
    });

    // Emit socket events for real-time updates
    emit(req, 'security_update', { action: 'DELETED', security });

    res.json({
      message: 'Security deleted successfully',
      security,
      warnings: validation.warnings,
      reconciliation
    });
  } catch (err) {
    console.error('Error deleting security:', err);
    res.status(500).json({ message: err.message });
  }
};
