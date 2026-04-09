const Holding = require('../models/Holding');
const Security = require('../models/Security');
const Investor = require('../models/Investor');
const TransactionLedger = require('../models/TransactionLedger');
const Allocation = require('../models/Allocation');
const ShareTransfer = require('../models/ShareTransfer');
const { logAudit } = require('../utils/audit');
const { emitNotification, createRoleBasedNotifications, createNotification } = require('../utils/notifications');
const DeleteValidationService = require('../services/deleteValidationService');
const DeleteReconciliationService = require('../services/deleteReconciliationService');

const emit = (req, e, d) => { const io = req.app.get('socketio'); if (io) io.emit(e, d); };

exports.getAll = async (req, res) => {
  try {
    const q = {};
    if (req.query.investorId) q.investor = req.query.investorId;
    if (req.query.securityId) q.security = req.query.securityId;

    // Role-based filtering - TEMPORARILY DISABLED FOR DEBUGGING
    // if (!req.query.securityId) {
    //   if (req.user.role === 'MAKER') {
    //     q.createdBy = req.user._id;
    //   }
    // }
    // CHECKER and ADMIN see all records (no status filter)

    const holdings = await Holding.find(q)
      .populate('investor', 'fullName folioNumber panNumber status')
      .populate('security', 'isin companyName totalShares allocatedShares')
      .populate('createdBy approvedBy rejectedBy checkedBy', 'name role')
      .sort({ createdAt: -1 });
    
    // Add percentage calculation for each holding
    const enhancedHoldings = holdings.map(h => {
      const totalAllocated = h.security?.allocatedShares || 0;
      const percentage = totalAllocated > 0 ? ((h.shares / totalAllocated) * 100).toFixed(2) : 0;
      return {
        ...h.toJSON(),
        percentage: parseFloat(percentage)
      };
    });
    
    res.json({ holdings: enhancedHoldings });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// Get holdings by security with investor percentage breakdown
exports.getBySecurity = async (req, res) => {
  try {
    const { securityId } = req.params;
    const security = await Security.findById(securityId);
    if (!security) return res.status(404).json({ message: 'Security not found' });
    
    const holdings = await Holding.find({ security: securityId })
      .populate('investor', 'fullName folioNumber panNumber')
      .sort({ shares: -1 });
    
    const totalAllocated = security.allocatedShares;
    const enhancedHoldings = holdings.map(h => {
      const percentage = totalAllocated > 0 ? ((h.shares / totalAllocated) * 100).toFixed(2) : 0;
      return {
        ...h.toJSON(),
        percentage: parseFloat(percentage)
      };
    });
    
    res.json({ 
      security: { _id: security._id, isin: security.isin, companyName: security.companyName, totalShares: security.totalShares, allocatedShares: security.allocatedShares },
      holdings: enhancedHoldings,
      summary: {
        totalInvestors: holdings.length,
        totalAllocatedShares: totalAllocated,
        availableShares: security.totalShares - security.allocatedShares
      }
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.getLedger = async (req, res) => {
  try {
    const { investorId, securityId } = req.query;
    const q = {};
    if (investorId) q.investor = investorId;
    if (securityId) q.security = securityId;
    const ledger = await TransactionLedger.find(q)
      .populate('investor', 'fullName folioNumber')
      .populate('security', 'isin companyName')
      .populate('performedBy', 'name role')
      .sort({ createdAt: -1 });
    res.json({ ledger });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// Unified Transaction History - combines Allocations and Transfers
exports.getTransactionHistory = async (req, res) => {
  try {
    const { investorId, securityId, fromDate, toDate, type } = req.query;
    
    // Build date filter
    const dateFilter = {};
    if (fromDate || toDate) {
      dateFilter.createdAt = {};
      if (fromDate) dateFilter.createdAt.$gte = new Date(fromDate);
      if (toDate) dateFilter.createdAt.$lte = new Date(toDate);
    }
    
    const transactions = [];
    
    // Get Allocations (if type filter allows)
    if (!type || type === 'ALLOCATION') {
      const allocQuery = { ...dateFilter };
      if (investorId) allocQuery.investor = investorId;
      if (securityId) allocQuery.security = securityId;
      
      const allocations = await Allocation.find(allocQuery)
        .populate('investor', 'fullName folioNumber')
        .populate('security', 'isin companyName')
        .populate('createdBy approvedBy rejectedBy', 'name role')
        .sort({ createdAt: -1 });
      
      allocations.forEach(a => {
        transactions.push({
          _id: a._id,
          type: 'ALLOCATION',
          date: a.createdAt,
          status: a.status,
          investor: a.investor,
          security: a.security,
          from: 'SYSTEM',
          to: a.investor?.fullName || 'Unknown',
          quantity: a.quantity,
          beforeFromShares: null, // System has no before
          afterFromShares: null,
          beforeToShares: a.beforeShares || 0,
          afterToShares: a.afterShares || (a.status === 'APPROVED' ? a.quantity : null),
          approvedBy: a.approvedBy,
          approvedAt: a.approvedAt,
          rejectionReason: a.rejectionReason,
          remarks: a.remarks
        });
      });
    }
    
    // Get Transfers (if type filter allows)
    if (!type || type === 'TRANSFER') {
      const transferQuery = { ...dateFilter };
      if (investorId) {
        // Match either from or to investor
        transferQuery.$or = [{ fromInvestor: investorId }, { toInvestor: investorId }];
      }
      if (securityId) transferQuery.security = securityId;
      
      const transfers = await ShareTransfer.find(transferQuery)
        .populate('fromInvestor', 'fullName folioNumber')
        .populate('toInvestor', 'fullName folioNumber')
        .populate('security', 'isin companyName')
        .populate('createdBy approvedBy rejectedBy', 'name role')
        .sort({ createdAt: -1 });
      
      transfers.forEach(t => {
        transactions.push({
          _id: t._id,
          type: 'TRANSFER',
          date: t.createdAt,
          status: t.status,
          investor: investorId === t.fromInvestor?._id?.toString() ? t.fromInvestor : t.toInvestor,
          security: t.security,
          from: t.fromInvestor?.fullName || 'Unknown',
          to: t.toInvestor?.fullName || 'Unknown',
          quantity: t.quantity,
          beforeFromShares: t.beforeFromShares,
          afterFromShares: t.afterFromShares,
          beforeToShares: t.beforeToShares,
          afterToShares: t.afterToShares,
          approvedBy: t.approvedBy,
          approvedAt: t.approvedAt,
          executedAt: t.executedAt,
          rejectionReason: t.rejectionReason,
          remarks: t.remarks,
          lockedQuantity: t.lockedQuantity
        });
      });
    }
    
    // Sort by date descending
    transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    res.json({ 
      transactions,
      summary: {
        totalCount: transactions.length,
        allocations: transactions.filter(t => t.type === 'ALLOCATION').length,
        transfers: transactions.filter(t => t.type === 'TRANSFER').length
      }
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// Get investor summary with all holdings
exports.getInvestorSummary = async (req, res) => {
  try {
    const { investorId } = req.params;
    
    const investor = await Investor.findById(investorId).select('fullName folioNumber panNumber status');
    if (!investor) return res.status(404).json({ message: 'Investor not found' });
    
    const holdings = await Holding.find({ investor: investorId })
      .populate('security', 'isin companyName totalShares allocatedShares');
    
    // Calculate total portfolio value (if we had share prices)
    const totalShares = holdings.reduce((sum, h) => sum + h.shares, 0);
    const totalLocked = holdings.reduce((sum, h) => sum + h.lockedShares, 0);
    
    // Enhance holdings with percentage
    const enhancedHoldings = holdings.map(h => {
      const totalAllocated = h.security?.allocatedShares || 0;
      const percentage = totalAllocated > 0 ? ((h.shares / totalAllocated) * 100).toFixed(2) : 0;
      return {
        ...h.toJSON(),
        percentage: parseFloat(percentage)
      };
    });
    
    res.json({
      investor,
      holdings: enhancedHoldings,
      summary: {
        totalHoldings: holdings.length,
        totalShares,
        totalLocked,
        availableShares: totalShares - totalLocked
      }
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// Get pending holdings for Checker
exports.getPending = async (req, res) => {
  try {
    const holdings = await Holding.find({ status: 'PENDING' })
      .populate('investor', 'fullName folioNumber panNumber')
      .populate('security', 'isin companyName totalShares allocatedShares')
      .populate('createdBy', 'name role')
      .sort({ createdAt: -1 });
    res.json({ holdings });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// Create holding (Maker)
exports.create = async (req, res) => {
  try {
    const { investorId, securityId, shares, lockedShares, remarks } = req.body;

    // Validate required fields
    if (!investorId) return res.status(400).json({ message: 'Investor ID is required' });
    if (!securityId) return res.status(400).json({ message: 'Security ID is required' });
    if (!shares || isNaN(shares) || +shares < 0) 
      return res.status(400).json({ message: 'Valid shares (>= 0) is required' });

    const [investor, security] = await Promise.all([
      Investor.findById(investorId), Security.findById(securityId)
    ]);
    if (!investor) return res.status(404).json({ message: 'Investor not found' });
    if (!security) return res.status(404).json({ message: 'Security not found' });
    if (investor.status !== 'APPROVED') return res.status(400).json({ message: 'Investor must be APPROVED' });
    if (security.status !== 'APPROVED') return res.status(400).json({ message: 'Security must be APPROVED' });

    // Check if holding already exists
    const existingHolding = await Holding.findOne({ investor: investorId, security: securityId });
    if (existingHolding) {
      return res.status(400).json({ message: 'Holding already exists for this investor and security. Use update instead.' });
    }

    const holding = await Holding.create({
      investor: investorId,
      security: securityId,
      shares: +shares,
      lockedShares: lockedShares ? +lockedShares : 0,
      status: 'PENDING',
      createdBy: req.user._id,
      auditLogs: [{
        action: 'CREATE',
        performedBy: req.user._id,
        performedAt: new Date(),
        details: { shares: +shares, lockedShares: lockedShares ? +lockedShares : 0, remarks }
      }]
    });

    await logAudit({ entityType: 'Holding', entityId: holding._id, action: 'CREATE', user: req.user, newData: holding.toJSON() });

    // Notification: Holding Created → Checker + Admin
    await createRoleBasedNotifications({
      req,
      event: 'HOLDING_CREATED',
      message: `New holding of ${shares} shares for ${investor.fullName} created by ${req.user.fullName || req.user.email}`,
      entityType: 'Holding',
      entityId: holding._id,
      targetRoles: ['CHECKER', 'ADMIN']
    });

    emit(req, 'holding_update', { action: 'CREATED', holding });
    res.status(201).json({ message: 'Holding created (pending approval)', holding });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// Approve holding (Checker/Admin)
exports.approve = async (req, res) => {
  try {
    const holding = await Holding.findById(req.params.id)
      .populate('investor', 'fullName folioNumber')
      .populate('security', 'isin companyName totalShares allocatedShares');
    if (!holding) return res.status(404).json({ message: 'Holding not found' });
    if (holding.status !== 'PENDING') return res.status(400).json({ message: 'Only PENDING holdings can be approved' });
    
    // Prevent self-approval (except Admin)
    if (holding.createdBy && holding.createdBy.toString() === req.user._id.toString() && req.user.role !== 'ADMIN')
      return res.status(403).json({ message: 'Cannot approve your own holding' });

    // Update holding status
    holding.status = 'APPROVED';
    holding.checkedBy = req.user._id;
    holding.approvedBy = req.user._id;
    holding.approvedAt = new Date();
    holding.auditLogs.push({
      action: 'APPROVE',
      performedBy: req.user._id,
      performedAt: new Date(),
      details: { previousStatus: 'PENDING', newStatus: 'APPROVED' }
    });
    await holding.save();

    await logAudit({ entityType: 'Holding', entityId: holding._id, action: 'APPROVE', user: req.user,
      oldData: { status: 'PENDING' }, newData: { status: 'APPROVED' } });

    // Notification: Holding Approved → Maker
    if (holding.createdBy && holding.createdBy.toString() !== req.user._id.toString()) {
      await createNotification({
        userId: holding.createdBy,
        event: 'HOLDING_APPROVED',
        message: `Your holding of ${holding.shares} shares for ${holding.investor.fullName} was approved`,
        entityType: 'Holding',
        entityId: holding._id,
        createdBy: req.user._id,
        createdByName: req.user.fullName || req.user.email,
        link: `/app/holdings`,
        isRead: false,
        createdAt: new Date()
      });
    }

    emit(req, 'holding_update', { action: 'APPROVED', holding });
    res.json({ message: 'Holding approved', holding });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// Reject holding (Checker/Admin)
exports.reject = async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ message: 'Rejection reason required' });

    const holding = await Holding.findById(req.params.id)
      .populate('investor', 'fullName folioNumber')
      .populate('security', 'isin companyName');
    if (!holding) return res.status(404).json({ message: 'Holding not found' });
    if (holding.status !== 'PENDING') return res.status(400).json({ message: 'Only PENDING holdings can be rejected' });

    // Prevent self-rejection (except Admin)
    if (holding.createdBy && holding.createdBy.toString() === req.user._id.toString() && req.user.role !== 'ADMIN')
      return res.status(403).json({ message: 'Cannot reject your own holding' });

    holding.status = 'REJECTED';
    holding.checkedBy = req.user._id;
    holding.rejectedBy = req.user._id;
    holding.rejectedAt = new Date();
    holding.rejectionReason = reason;
    holding.auditLogs.push({
      action: 'REJECT',
      performedBy: req.user._id,
      performedAt: new Date(),
      details: { previousStatus: 'PENDING', newStatus: 'REJECTED', reason }
    });
    await holding.save();

    await logAudit({ entityType: 'Holding', entityId: holding._id, action: 'REJECT', user: req.user, newData: { reason } });

    // Notification: Holding Rejected → Maker
    if (holding.createdBy && holding.createdBy.toString() !== req.user._id.toString()) {
      await createNotification({
        userId: holding.createdBy,
        event: 'HOLDING_REJECTED',
        message: `Your holding of ${holding.shares} shares was rejected. Reason: ${reason}`,
        entityType: 'Holding',
        entityId: holding._id,
        createdBy: req.user._id,
        createdByName: req.user.fullName || req.user.email,
        link: `/app/holdings`,
        isRead: false,
        createdAt: new Date()
      });
    }

    emit(req, 'holding_update', { action: 'REJECTED', holding });
    res.json({ message: 'Holding rejected', holding });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.remove = async (req, res) => {
  try {
    const holding = await Holding.findById(req.params.id)
      .populate('investor', 'fullName folioNumber')
      .populate('security', 'isin companyName');
    if (!holding) return res.status(404).json({ message: 'Holding not found' });
    if (holding.isDeleted) return res.status(400).json({ message: 'Holding already deleted' });

    // Pre-delete validation
    const validation = await DeleteValidationService.validateHoldingDelete(holding);
    if (!validation.canDelete) {
      return res.status(400).json({
        message: 'Cannot delete holding',
        errors: validation.errors,
        warnings: validation.warnings,
        impact: validation.impact
      });
    }

    // Store old data for audit and reconciliation
    const oldData = holding.toJSON();

    // Perform soft delete
    holding.isDeleted = true;
    holding.deletedAt = new Date();
    holding.deletedBy = req.user._id;
    await holding.save();

    // Audit log
    await logAudit({
      entityType: 'Holding',
      entityId: holding._id,
      action: 'DELETE',
      user: req.user,
      oldData: oldData,
      newData: { isDeleted: true, deletedAt: holding.deletedAt, deletedBy: req.user._id }
    });

    // Post-delete reconciliation
    const reconciliation = await DeleteReconciliationService.fullReconciliation({
      entityType: 'Holding',
      entityId: holding._id,
      deletedData: oldData
    });

    // Emit socket events for real-time updates
    emit(req, 'holding_update', { action: 'DELETED', holding });
    emit(req, 'investor_update', { action: 'RECONCILED', investorId: holding.investor._id });
    emit(req, 'security_update', { action: 'RECONCILED', securityId: holding.security._id });

    res.json({
      message: 'Holding deleted successfully',
      holding,
      warnings: validation.warnings,
      reconciliation
    });
  } catch (err) {
    console.error('Error deleting holding:', err);
    res.status(500).json({ message: err.message });
  }
};
