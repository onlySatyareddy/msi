const ShareTransfer = require('../models/ShareTransfer');
const Investor = require('../models/Investor');
const Holding = require('../models/Holding');
const TransactionLedger = require('../models/TransactionLedger');
const { logAudit, logStatusChange } = require('../utils/audit');
const { emitNotification, createRoleBasedNotifications, createNotification } = require('../utils/notifications');
const auditValidationService = require('../services/auditValidationService');
const DeleteValidationService = require('../services/deleteValidationService');
const DeleteReconciliationService = require('../services/deleteReconciliationService');

const emit = (req, e, d) => { const io = req.app.get('socketio'); if (io) io.emit(e, d); };
const notify = (req, type, data, targets) => { emitNotification(type, data, targets); };

exports.getAll = async (req, res) => {
  try {
    const q = {};
    // Role-based filtering (skip when viewing by securityId for detail pages)
    if (!req.query.securityId) {
      if (req.user.role === 'MAKER') q.createdBy = req.user._id;
    }
    if (req.query.status) q.status = req.query.status;
    const transfers = await ShareTransfer.find(q)
      .populate('fromInvestor', 'fullName folioNumber panNumber')
      .populate('toInvestor', 'fullName folioNumber panNumber')
      .populate('security', 'isin companyName')
      .populate('createdBy approvedBy rejectedBy', 'name role')
      .sort({ createdAt: -1 });
    res.json({ transfers });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.getOne = async (req, res) => {
  try {
    const t = await ShareTransfer.findById(req.params.id)
      .populate('fromInvestor', 'fullName folioNumber')
      .populate('toInvestor', 'fullName folioNumber')
      .populate('security', 'isin companyName')
      .populate('createdBy approvedBy rejectedBy submittedBy', 'name role')
      .populate('auditHistory.performedBy', 'name role');
    if (!t) return res.status(404).json({ message: 'Transfer not found' });
    res.json({ transfer: t });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// STEP 1: Maker initiates
exports.initiate = async (req, res) => {
  try {
    const { fromInvestorId, toInvestorId, securityId, quantity, remarks } = req.body;
    if (!fromInvestorId || !toInvestorId || !securityId || !quantity)
      return res.status(400).json({ message: 'fromInvestorId, toInvestorId, securityId, quantity required' });
    if (fromInvestorId === toInvestorId) return res.status(400).json({ message: 'Self-transfer not allowed' });
    if (quantity <= 0) return res.status(400).json({ message: 'Quantity must be > 0' });

    const [fromInv, toInv] = await Promise.all([
      Investor.findById(fromInvestorId), Investor.findById(toInvestorId)
    ]);
    if (!fromInv || !toInv) return res.status(404).json({ message: 'Investor not found' });
    if (fromInv.status !== 'APPROVED' || toInv.status !== 'APPROVED')
      return res.status(400).json({ message: 'Both investors must be APPROVED' });

    const fromHolding = await Holding.findOne({ investor: fromInvestorId, security: securityId });
    const toHolding = await Holding.findOne({ investor: toInvestorId, security: securityId });
    if (!fromHolding) return res.status(400).json({ message: 'Sender has no holding for this security' });

    const available = fromHolding.shares - fromHolding.lockedShares;
    if (available < quantity)
      return res.status(400).json({ message: `Insufficient available shares. Available: ${available}, Locked: ${fromHolding.lockedShares}` });

    const beforeFromShares = fromHolding.shares;
    const beforeToShares = toHolding ? toHolding.shares : 0;

    // LOCK shares immediately
    fromHolding.lockedShares += +quantity;
    await fromHolding.save();

    const transfer = await ShareTransfer.create({
      fromInvestor: fromInvestorId, toInvestor: toInvestorId,
      security: securityId, quantity: +quantity, remarks,
      beforeFromShares, beforeToShares, lockedQuantity: +quantity,
      status: 'INITIATED', createdBy: req.user._id,
      auditHistory: [{ action: 'INITIATED', performedBy: req.user._id,
        details: { beforeFromShares, beforeToShares, quantity }, remarks: 'Transfer initiated' }]
    });

    await logAudit({ entityType: 'Transfer', entityId: transfer._id, action: 'INITIATE',
      user: req.user, newData: { quantity, beforeFromShares, beforeToShares } });
    emit(req, 'transfer_update', { action: 'INITIATED', transfer });
    
    // Notification: Share Transfer → Checker + Admin
    await createRoleBasedNotifications({
      req,
      event: 'SHARE_TRANSFER',
      message: `Share transfer initiated: ${quantity} shares from ${fromInv.fullName} to ${toInv.fullName} by ${req.user.fullName || req.user.email}`,
      entityType: 'Transfer',
      entityId: transfer._id,
      targetRoles: ['CHECKER', 'ADMIN']
    });
    
    res.status(201).json({ message: 'Transfer initiated. Shares locked.', transfer });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// STEP 2: Maker submits
exports.submit = async (req, res) => {
  try {
    const transfer = await ShareTransfer.findById(req.params.id);
    if (!transfer) return res.status(404).json({ message: 'Transfer not found' });
    if (transfer.status !== 'INITIATED') return res.status(400).json({ message: 'Transfer must be INITIATED to submit' });
    if (transfer.createdBy && transfer.createdBy.toString() !== req.user._id.toString() && req.user.role !== 'ADMIN')
      return res.status(403).json({ message: 'Only creator can submit' });

    transfer.status = 'UNDER_REVIEW';
    transfer.submittedAt = new Date();
    transfer.submittedBy = req.user._id;
    transfer.auditHistory.push({ action: 'SUBMITTED', performedBy: req.user._id, remarks: req.body.remarks || '' });
    await transfer.save();

    await logStatusChange({ entityType: 'Transfer', entityId: transfer._id, oldStatus: 'INITIATED', newStatus: 'UNDER_REVIEW', user: req.user });
    emit(req, 'transfer_update', { action: 'SUBMITTED', transfer });
    
    // Notify checkers and admins
    notify(req, 'TRANSFER_SUBMITTED', {
      transferId: transfer._id,
      message: `Transfer submitted for review`,
      submittedBy: req.user.name
    }, ['CHECKER', 'ADMIN']);
    
    res.json({ message: 'Transfer submitted for review', transfer });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// STEP 3: Checker/Admin approves → EXECUTE
exports.approve = async (req, res) => {
  try {
    // Safe ID extraction helper - handles both populated objects and plain ObjectIds
    const getId = (ref) => {
      if (!ref) return null;
      if (ref._id) return ref._id; // Populated object
      return ref; // Already an ObjectId or string
    };

    const transfer = await ShareTransfer.findById(req.params.id)
      .populate('fromInvestor', 'fullName folioNumber')
      .populate('toInvestor', 'fullName folioNumber')
      .populate('security', 'isin companyName');
    if (!transfer) return res.status(404).json({ message: 'Transfer not found' });
    if (transfer.status !== 'UNDER_REVIEW') return res.status(400).json({ message: 'Transfer must be UNDER_REVIEW' });
    if (transfer.createdBy && transfer.createdBy.toString() === req.user._id.toString() && req.user.role !== 'ADMIN')
      return res.status(403).json({ message: 'Cannot approve your own transfer' });

    // Safely extract IDs
    const fromInvestorId = getId(transfer.fromInvestor);
    const toInvestorId = getId(transfer.toInvestor);
    const securityId = getId(transfer.security);

    if (!fromInvestorId || !toInvestorId || !securityId) {
      return res.status(400).json({ message: 'Invalid transfer data: missing investor or security' });
    }

    const fromHolding = await Holding.findOne({ investor: fromInvestorId, security: securityId });
    let toHolding = await Holding.findOne({ investor: toInvestorId, security: securityId });
    if (!fromHolding)
      return res.status(400).json({ message: 'Sender holding not found. The holding may have been deleted.' });
    // Check if we have enough shares (including locked shares for this transfer)
    if (fromHolding.shares < transfer.quantity && fromHolding.lockedShares < transfer.quantity)
      return res.status(400).json({ message: `Insufficient shares to execute. Required: ${transfer.quantity}, Total Shares: ${fromHolding.shares}, Locked: ${fromHolding.lockedShares}` });

    // PSEUDO-TRANSACTION: Store original values for rollback
    const originalFromShares = fromHolding.shares;
    const originalFromLocked = fromHolding.lockedShares;
    const originalToShares = toHolding ? toHolding.shares : 0;
    const toHoldingExisted = !!toHolding;

    try {
      // EXECUTE TRANSFER - Step 1: Update sender
      fromHolding.shares -= transfer.quantity;
      fromHolding.lockedShares = Math.max(0, fromHolding.lockedShares - transfer.lockedQuantity);
      fromHolding.updatedBy = req.user._id;
      await fromHolding.save();

      // Step 2: Update receiver
      if (toHolding) {
        toHolding.shares += transfer.quantity;
        toHolding.updatedBy = req.user._id;
        await toHolding.save();
      } else {
        toHolding = await Holding.create({ investor: toInvestorId, security: securityId, shares: transfer.quantity, status: 'APPROVED', approvedBy: req.user._id, approvedAt: new Date(), createdBy: req.user._id });
      }

      // Step 3: Update transfer record
      transfer.afterFromShares = fromHolding.shares;
      transfer.afterToShares = toHolding.shares;
      transfer.status = 'EXECUTED';
      transfer.approvedBy = req.user._id;
      transfer.approvedAt = new Date();
      transfer.executedAt = new Date();
      transfer.lockedQuantity = 0;
      transfer.auditHistory.push({ action: 'APPROVED_AND_EXECUTED', performedBy: req.user._id,
        details: { afterFromShares: fromHolding.shares, afterTo: toHolding.shares }, remarks: req.body.remarks || '' });
      await transfer.save();

      // Step 4: LEDGER entries
      await TransactionLedger.insertMany([
        { investor: fromInvestorId, security: securityId, type: 'DEBIT',
          quantity: transfer.quantity, balanceAfter: fromHolding.shares,
          referenceId: transfer._id, refType: 'TRANSFER',
          description: `Transfer to ${transfer.toInvestor?.fullName || 'Unknown'}`, performedBy: req.user._id },
        { investor: toInvestorId, security: securityId, type: 'CREDIT',
          quantity: transfer.quantity, balanceAfter: toHolding.shares,
          referenceId: transfer._id, refType: 'TRANSFER',
          description: `Transfer from ${transfer.fromInvestor?.fullName || 'Unknown'}`, performedBy: req.user._id }
      ]);

      // Step 5: Audit log
      await logAudit({ entityType: 'Transfer', entityId: transfer._id, action: 'APPROVE',
        user: req.user, oldData: { beforeFrom: transfer.beforeFromShares, beforeTo: transfer.beforeToShares },
        newData: { afterFrom: fromHolding.shares, afterTo: toHolding.shares } });

      // Step 6: Real-time socket events
      emit(req, 'transfer_update', { action: 'EXECUTED', transfer });
      emit(req, 'holdings_update', { action: 'UPDATED', fromInvestor: fromInvestorId, toInvestor: toInvestorId, security: securityId });
      emit(req, 'investor_update', { action: 'SHARES_UPDATED', investorId: fromInvestorId });
      emit(req, 'investor_update', { action: 'SHARES_UPDATED', investorId: toInvestorId });

      // Step 7: Notification
      if (transfer.createdBy) {
        notify(req, 'TRANSFER_APPROVED', {
          transferId: transfer._id,
          message: `Your transfer has been approved and executed`,
          approvedBy: req.user.fullName || req.user.email,
          quantity: transfer.quantity,
          from: transfer.fromInvestor.fullName,
          to: transfer.toInvestor.fullName
        }, [transfer.createdBy]);
      }

      res.json({ message: 'Transfer executed successfully', transfer });

    } catch (execError) {
      // ROLLBACK: Restore original values if any step fails
      console.error('[TRANSFER EXECUTION ERROR] Rolling back changes:', execError.message);
      
      try {
        fromHolding.shares = originalFromShares;
        fromHolding.lockedShares = originalFromLocked;
        await fromHolding.save();

        if (toHoldingExisted && toHolding) {
          toHolding.shares = originalToShares;
          await toHolding.save();
        } else if (!toHoldingExisted && toHolding) {
          await Holding.deleteOne({ _id: toHolding._id });
        }

        console.log('[TRANSFER EXECUTION ERROR] Rollback completed');
      } catch (rollbackError) {
        console.error('[TRANSFER EXECUTION ERROR] Rollback failed:', rollbackError.message);
      }

      throw execError;
    }

    // Trigger real-time validation (non-blocking)
    auditValidationService.runFullAudit({
      autoFix: false,
      userId: req.user._id,
      userName: req.user.fullName || req.user.email,
      role: req.user.role
    }).catch(err => console.error('Validation trigger failed:', err));

    res.json({ message: 'Transfer approved and executed', transfer });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// Checker/Admin rejects → unlock shares
exports.reject = async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ message: 'Rejection reason required' });
    const transfer = await ShareTransfer.findById(req.params.id);
    if (!transfer) return res.status(404).json({ message: 'Transfer not found' });
    if (!['UNDER_REVIEW','INITIATED'].includes(transfer.status))
      return res.status(400).json({ message: 'Transfer cannot be rejected in current status' });

    // UNLOCK shares
    const fromHolding = await Holding.findOne({ investor: transfer.fromInvestor, security: transfer.security });
    if (fromHolding) {
      fromHolding.lockedShares = Math.max(0, fromHolding.lockedShares - transfer.lockedQuantity);
      await fromHolding.save();
    }

    transfer.status = 'REJECTED';
    transfer.rejectionReason = reason;
    transfer.rejectedBy = req.user._id;
    transfer.rejectedAt = new Date();
    transfer.lockedQuantity = 0;
    transfer.auditHistory.push({ action: 'REJECTED', performedBy: req.user._id, remarks: reason });
    await transfer.save();

    await logAudit({ entityType: 'Transfer', entityId: transfer._id, action: 'REJECT',
      user: req.user, newData: { reason } });
    emit(req, 'transfer_update', { action: 'REJECTED', transfer });
    emit(req, 'holdings_update', { action: 'UNLOCKED', investorId: transfer.fromInvestor._id, security: transfer.security._id });
    emit(req, 'investor_update', { action: 'SHARES_UPDATED', investorId: transfer.fromInvestor._id });
    res.json({ message: 'Transfer rejected. Shares unlocked.', transfer });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.remove = async (req, res) => {
  try {
    const transfer = await ShareTransfer.findById(req.params.id)
      .populate('fromInvestor', 'fullName folioNumber')
      .populate('toInvestor', 'fullName folioNumber')
      .populate('security', 'isin companyName');
    if (!transfer) return res.status(404).json({ message: 'Transfer not found' });
    if (transfer.isDeleted) return res.status(400).json({ message: 'Transfer already deleted' });

    // Pre-delete validation
    const validation = await DeleteValidationService.validateTransferDelete(transfer);
    if (!validation.canDelete) {
      return res.status(400).json({
        message: 'Cannot delete transfer',
        errors: validation.errors,
        warnings: validation.warnings,
        impact: validation.impact
      });
    }

    // Store old data for audit and reconciliation
    const oldData = transfer.toJSON();

    // Perform soft delete
    transfer.isDeleted = true;
    transfer.deletedAt = new Date();
    transfer.deletedBy = req.user._id;
    await transfer.save();

    // Audit log
    await logAudit({
      entityType: 'Transfer',
      entityId: transfer._id,
      action: 'DELETE',
      user: req.user,
      oldData: oldData,
      newData: { isDeleted: true, deletedAt: transfer.deletedAt, deletedBy: req.user._id }
    });

    // Post-delete reconciliation
    const reconciliation = await DeleteReconciliationService.fullReconciliation({
      entityType: 'ShareTransfer',
      entityId: transfer._id,
      deletedData: oldData
    });

    // Emit socket events for real-time updates
    emit(req, 'transfer_update', { action: 'DELETED', transfer });
    emit(req, 'holdings_update', { action: 'RECONCILED', investor: transfer.fromInvestor._id, security: transfer.security._id });
    emit(req, 'investor_update', { action: 'RECONCILED', investorId: transfer.fromInvestor._id });
    emit(req, 'investor_update', { action: 'RECONCILED', investorId: transfer.toInvestor._id });

    res.json({
      message: 'Transfer deleted successfully',
      transfer,
      warnings: validation.warnings,
      reconciliation
    });
  } catch (err) {
    console.error('Error deleting transfer:', err);
    res.status(500).json({ message: err.message });
  }
};
