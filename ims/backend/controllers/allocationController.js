const Allocation = require('../models/Allocation');
const Security = require('../models/Security');
const Investor = require('../models/Investor');
const Holding = require('../models/Holding');
const TransactionLedger = require('../models/TransactionLedger');
const { logAudit, logStatusChange } = require('../utils/audit');
const { emitNotification, createRoleBasedNotifications, createNotification } = require('../utils/notifications');
const auditValidationService = require('../services/auditValidationService');
const DeleteValidationService = require('../services/deleteValidationService');
const DeleteReconciliationService = require('../services/deleteReconciliationService');

const emit = (req, e, d) => { const io = req.app.get('socketio'); if (io) io.emit(e, d); };

exports.getAll = async (req, res) => {
  try {
    const q = {};
    if (req.user.role === 'MAKER') q.createdBy = req.user._id;
    const allocations = await Allocation.find(q)
      .populate('investor', 'fullName folioNumber panNumber')
      .populate('security', 'isin companyName totalShares')
      .populate('createdBy approvedBy rejectedBy', 'name role')
      .sort({ createdAt: -1 });
    res.json({ allocations });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.getOne = async (req, res) => {
  try {
    const alloc = await Allocation.findById(req.params.id)
      .populate('investor', 'fullName folioNumber panNumber')
      .populate('security', 'isin companyName totalShares allocatedShares availableShares')
      .populate('createdBy approvedBy rejectedBy', 'name role');
    
    if (!alloc) {
      console.warn(`[WARNING] Allocation not found: ${req.params.id}. This might be an invalid notification entityId.`);
      return res.status(404).json({ 
        message: 'Allocation not found',
        error: 'INVALID_ALLOCATION_ID',
        id: req.params.id
      });
    }
    
    res.json({ allocation: alloc });
  } catch (err) {
    console.error(`[ERROR] Failed to fetch allocation ${req.params.id}:`, err.message);
    res.status(500).json({ message: err.message });
  }
};

exports.create = async (req, res) => {
  try {
    const { investorId, securityId, quantity, remarks } = req.body;

    // Validate required fields
    if (!investorId) return res.status(400).json({ message: 'Investor ID is required' });
    if (!securityId) return res.status(400).json({ message: 'Security ID is required' });
    if (!quantity || isNaN(quantity) || +quantity <= 0) 
      return res.status(400).json({ message: 'Valid quantity (greater than 0) is required' });

    const [investor, security] = await Promise.all([
      Investor.findById(investorId), Security.findById(securityId)
    ]);
    if (!investor) return res.status(404).json({ message: 'Investor not found' });
    if (!security) return res.status(404).json({ message: 'Security not found' });
    if (investor.status !== 'APPROVED') return res.status(400).json({ message: 'Investor must be APPROVED' });
    if (security.status !== 'APPROVED') return res.status(400).json({ message: 'Security must be APPROVED' });
    if (security.availableShares < quantity)
      return res.status(400).json({ message: `Insufficient shares. Available: ${security.availableShares}` });

    // Get current holding to record before shares
    let holding = await Holding.findOne({ investor: investorId, security: securityId });
    const beforeShares = holding ? holding.shares : 0;

    const alloc = await Allocation.create({
      investor: investorId, security: securityId, quantity: +quantity, 
      beforeShares, remarks, createdBy: req.user._id
    });
    await logAudit({ entityType: 'Allocation', entityId: alloc._id, action: 'CREATE', user: req.user, newData: alloc.toJSON(), req });
    
    // Notification: Allocation Done → Checker + Admin
    await createRoleBasedNotifications({
      req,
      event: 'ALLOCATION_DONE',
      message: `New allocation of ${quantity} shares for ${investor.fullName} created by ${req.user.fullName || req.user.email}`,
      entityType: 'Allocation',
      entityId: alloc._id,
      targetRoles: ['CHECKER', 'ADMIN']
    });
    
    emit(req, 'allocation_update', { action: 'CREATED', allocation: alloc });
    res.status(201).json({ message: 'Allocation created (pending approval)', allocation: alloc });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.approve = async (req, res) => {
  try {
    // Safe ID extraction helper - handles both populated objects and plain ObjectIds
    const getId = (ref) => {
      if (!ref) return null;
      if (ref._id) return ref._id; // Populated object
      return ref; // Already an ObjectId or string
    };

    const alloc = await Allocation.findById(req.params.id)
      .populate('investor', 'fullName folioNumber')
      .populate('security', 'isin companyName totalShares allocatedShares');
    if (!alloc) return res.status(404).json({ message: 'Allocation not found' });
    if (alloc.status !== 'PENDING') return res.status(400).json({ message: 'Only PENDING allocations can be approved' });
    if (alloc.createdBy && alloc.createdBy.toString() === req.user._id.toString() && req.user.role !== 'ADMIN')
      return res.status(403).json({ message: 'Cannot approve your own allocation' });

    // Safely extract IDs
    const investorId = getId(alloc.investor);
    const securityId = getId(alloc.security);

    if (!investorId || !securityId) {
      return res.status(400).json({ message: 'Invalid allocation data: missing investor or security' });
    }

    const security = await Security.findById(securityId);
    if (!security) return res.status(404).json({ message: 'Security not found' });
    if (security.availableShares < alloc.quantity)
      return res.status(400).json({ message: 'Shares no longer available' });

    // Update holding
    let holding = await Holding.findOne({ investor: investorId, security: securityId });
    if (holding) {
      // Fix: Set shares to allocation quantity if current shares are 0 but allocation was approved
      if (holding.shares === 0 && alloc.status === 'APPROVED' && alloc.afterShares) {
        holding.shares = alloc.afterShares;
      } else {
        holding.shares += alloc.quantity;
      }
      holding.status = 'APPROVED';
      holding.updatedBy = req.user._id;
      await holding.save();
    } else {
      holding = await Holding.create({
        investor: investorId,
        security: securityId,
        shares: alloc.quantity,
        status: 'APPROVED',
        approvedBy: req.user._id,
        approvedAt: new Date(),
        createdBy: req.user._id
      });
    }

    // Update security allocated
    security.allocatedShares += alloc.quantity;
    await security.save();

    // Update allocation with after shares and approved status
    alloc.afterShares = holding.shares;
    alloc.status = 'APPROVED'; 
    alloc.approvedBy = req.user._id; 
    alloc.approvedAt = new Date();
    await alloc.save();

    // Ledger entry
    await TransactionLedger.create({
      investor: investorId, security: securityId, type: 'CREDIT',
      quantity: alloc.quantity, balanceAfter: holding.shares,
      referenceId: alloc._id, refType: 'ALLOCATION',
      description: `Allocation approved by ${req.user.fullName || req.user.email}`, performedBy: req.user._id
    });

    await logAudit({ entityType: 'Allocation', entityId: alloc._id, action: 'APPROVE', user: req.user,
      oldData: { shares: alloc.beforeShares }, newData: { shares: alloc.afterShares }, req });
    
    // Notification: Allocation Approved → Maker
    if (alloc.createdBy && alloc.createdBy.toString() !== req.user._id.toString()) {
      await createNotification({
        userId: alloc.createdBy,
        event: 'ALLOCATION_APPROVED',
        message: `Your allocation of ${alloc.quantity} shares for ${alloc.investor?.fullName || 'Unknown'} was approved`,
        entityType: 'Allocation',
        entityId: alloc._id,
        createdBy: req.user._id,
        createdByName: req.user.fullName || req.user.email,
        link: `/app/allocations/${alloc._id}`,
        isRead: false,
        createdAt: new Date()
      });
    }
    
    emit(req, 'allocation_update', { action: 'APPROVED', allocation: alloc });
    emit(req, 'holdings_update', { action: 'UPDATED', investor: investorId, security: securityId });

    // Trigger real-time validation (non-blocking)
    auditValidationService.runFullAudit({
      autoFix: false,
      userId: req.user._id,
      userName: req.user.fullName || req.user.email,
      role: req.user.role
    }).catch(err => console.error('Validation trigger failed:', err));

    res.json({ message: 'Allocation approved. Holdings updated.', allocation: alloc, holding });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.reject = async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ message: 'Rejection reason required' });
    const alloc = await Allocation.findById(req.params.id);
    if (!alloc) return res.status(404).json({ message: 'Allocation not found' });
    if (alloc.status !== 'PENDING') return res.status(400).json({ message: 'Only PENDING allocations can be rejected' });

    // Prevent self-rejection (except Admin)
    if (alloc.createdBy && alloc.createdBy.toString() === req.user._id.toString() && req.user.role !== 'ADMIN')
      return res.status(403).json({ message: 'Cannot reject your own allocation' });

    alloc.status = 'REJECTED'; alloc.rejectedBy = req.user._id; alloc.rejectedAt = new Date(); alloc.rejectionReason = reason;
    await alloc.save();
    await logAudit({ entityType: 'Allocation', entityId: alloc._id, action: 'REJECT', user: req.user, newData: { reason }, req });
    
    // Notification: Allocation Rejected → Maker
    if (alloc.createdBy && alloc.createdBy.toString() !== req.user._id.toString()) {
      await createNotification({
        userId: alloc.createdBy,
        event: 'ALLOCATION_REJECTED',
        message: `Your allocation of ${alloc.quantity} shares was rejected. Reason: ${reason}`,
        entityType: 'Allocation',
        entityId: alloc._id,
        createdBy: req.user._id,
        createdByName: req.user.fullName || req.user.email,
        link: `/app/allocations/${alloc._id}`,
        isRead: false,
        createdAt: new Date()
      });
    }
    
    emit(req, 'allocation_update', { action: 'REJECTED', allocation: alloc });
    res.json({ message: 'Allocation rejected', allocation: alloc });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.remove = async (req, res) => {
  try {
    const alloc = await Allocation.findById(req.params.id)
      .populate('investor', 'fullName folioNumber')
      .populate('security', 'isin companyName');
    if (!alloc) return res.status(404).json({ message: 'Allocation not found' });
    if (alloc.isDeleted) return res.status(400).json({ message: 'Allocation already deleted' });

    // Pre-delete validation
    const validation = await DeleteValidationService.validateAllocationDelete(alloc);
    if (!validation.canDelete) {
      return res.status(400).json({
        message: 'Cannot delete allocation',
        errors: validation.errors,
        warnings: validation.warnings,
        impact: validation.impact
      });
    }

    // Store old data for audit and reconciliation
    const oldData = alloc.toJSON();

    // Perform soft delete
    alloc.isDeleted = true;
    alloc.deletedAt = new Date();
    alloc.deletedBy = req.user._id;
    await alloc.save();

    // Audit log
    await logAudit({
      entityType: 'Allocation',
      entityId: alloc._id,
      action: 'DELETE',
      user: req.user,
      oldData: oldData,
      newData: { isDeleted: true, deletedAt: alloc.deletedAt, deletedBy: req.user._id },
      req
    });

    // Post-delete reconciliation
    const reconciliation = await DeleteReconciliationService.fullReconciliation({
      entityType: 'Allocation',
      entityId: alloc._id,
      deletedData: oldData
    });

    // Emit socket events for real-time updates
    emit(req, 'allocation_update', { action: 'DELETED', allocation: alloc });
    emit(req, 'holdings_update', { action: 'RECONCILED', investor: alloc.investor._id, security: alloc.security._id });
    emit(req, 'investor_update', { action: 'RECONCILED', investorId: alloc.investor._id });
    emit(req, 'security_update', { action: 'RECONCILED', securityId: alloc.security._id });

    res.json({
      message: 'Allocation deleted successfully',
      allocation: alloc,
      warnings: validation.warnings,
      reconciliation
    });
  } catch (err) {
    console.error('Error deleting allocation:', err);
    res.status(500).json({ message: err.message });
  }
};
