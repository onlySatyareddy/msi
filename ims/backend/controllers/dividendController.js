const Dividend = require('../models/Dividend');
const DividendDistribution = require('../models/DividendDistribution');
const Holding = require('../models/Holding');
const Security = require('../models/Security');
const Investor = require('../models/Investor');
const { logAudit, logStatusChange } = require('../utils/audit');
const { emitNotification, createRoleBasedNotifications, createNotification } = require('../utils/notifications');
const auditValidationService = require('../services/auditValidationService');

const emit = (req, e, d) => { const io = req.app.get('socketio'); if (io) io.emit(e, d); };

// Get all dividends
exports.getAll = async (req, res) => {
  try {
    const { fiscalYear, status, securityId } = req.query;
    const q = {};
    if (fiscalYear) q.fiscalYear = fiscalYear;
    if (status) q.status = status;
    if (securityId) q.security = securityId;
    
    const dividends = await Dividend.find(q)
      .populate('security', 'isin companyName totalShares')
      .populate('createdBy', 'name')
      .populate('approvedBy', 'name')
      .sort({ createdAt: -1 });
    res.json({ dividends });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// Get dashboard summary
exports.getDashboardSummary = async (req, res) => {
  try {
    const { fiscalYear } = req.query;
    const q = fiscalYear ? { fiscalYear } : {};
    
    const totalDeclarations = await Dividend.countDocuments(q);
    const paidDividends = await Dividend.countDocuments({ ...q, status: 'PAID' });
    const totalPaidAmount = await Dividend.aggregate([
      { $match: { ...q, status: 'PAID' } },
      { $group: { _id: null, total: { $sum: '$totalDividend' } } }
    ]);
    
    const uniqueSecurities = await Dividend.distinct('security', q);
    const securitiesCount = uniqueSecurities.length;
    
    // Quarterly breakdown
    const quarterlyData = await Dividend.aggregate([
      { $match: q },
      { $group: {
        _id: { 
          year: { $year: '$createdAt' },
          quarter: { $ceil: { $divide: [{ $month: '$createdAt' }, 3] } }
        },
        totalDividend: { $sum: '$totalDividend' },
        count: { $sum: 1 }
      }},
      { $sort: { '_id.year': -1, '_id.quarter': 1 } }
    ]);
    
    // Per share trend
    const perShareTrend = await Dividend.aggregate([
      { $match: q },
      { $sort: { createdAt: 1 } },
      {
        $project: {
          date: '$createdAt',
          dividendPerShare: 1,
          security: 1,
          companyName: '$security.companyName'
        }
      }
    ]);
    
    res.json({
      summary: {
        totalDeclarations,
        paidDividends,
        totalPaidAmount: totalPaidAmount[0]?.total || 0,
        securitiesCount,
        pendingApproval: await Dividend.countDocuments({ ...q, status: 'PENDING' }),
        draft: await Dividend.countDocuments({ ...q, status: 'DRAFT' })
      },
      quarterlyData,
      perShareTrend
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// Get single dividend with distributions
exports.getOne = async (req, res) => {
  try {
    const dividend = await Dividend.findById(req.params.id)
      .populate('security', 'isin companyName totalShares');
    if (!dividend) return res.status(404).json({ message: 'Dividend not found' });
    
    const distributions = await DividendDistribution.find({ dividend: dividend._id })
      .populate('investor', 'fullName folioNumber')
      .populate('security', 'isin companyName')
      .sort({ dividendAmount: -1 });
    
    res.json({ dividend, distributions });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// Create dividend declaration
exports.create = async (req, res) => {
  try {
    const { securityId, dividendPerShare, fiscalYear, recordDate, paymentDate, description } = req.body;
    if (!securityId || !dividendPerShare || dividendPerShare <= 0)
      return res.status(400).json({ message: 'securityId and valid dividendPerShare required' });
    if (!fiscalYear)
      return res.status(400).json({ message: 'fiscalYear is required' });
    
    const security = await Security.findById(securityId);
    if (!security) return res.status(404).json({ message: 'Security not found' });
    if (security.status !== 'APPROVED') 
      return res.status(400).json({ message: 'Security must be APPROVED' });
    
    // Calculate total dividend based on allocated shares
    const totalDividend = security.allocatedShares * dividendPerShare;
    
    const dividend = await Dividend.create({
      security: securityId,
      fiscalYear,
      dividendPerShare: +dividendPerShare,
      totalDividend,
      totalShares: security.allocatedShares,
      recordDate: recordDate ? new Date(recordDate) : null,
      paymentDate: paymentDate ? new Date(paymentDate) : null,
      description,
      status: 'DRAFT',
      createdBy: req.user._id
    });
    
    await logAudit({ entityType: 'Dividend', entityId: dividend._id, action: 'CREATE', 
      user: req.user, newData: { securityId, dividendPerShare, fiscalYear, totalDividend }, req });
    
    // Notification: Dividend Declared → Checker + Admin
    await createRoleBasedNotifications({
      req,
      event: 'DIVIDEND_DECLARED',
      message: `Dividend of ${dividendPerShare} per share declared for ${security.companyName} by ${req.user.fullName || req.user.email}`,
      entityType: 'Dividend',
      entityId: dividend._id,
      targetRoles: ['CHECKER', 'ADMIN']
    });
    
    emit(req, 'dividend_update', { action: 'CREATED', dividend });
    
    res.status(201).json({ message: 'Dividend declared', dividend });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// Calculate dividend distribution based on current holdings
exports.calculate = async (req, res) => {
  try {
    const dividend = await Dividend.findById(req.params.id)
      .populate('security', 'isin companyName totalShares allocatedShares');
    if (!dividend) return res.status(404).json({ message: 'Dividend not found' });
    if (dividend.status !== 'APPROVED') 
      return res.status(400).json({ message: 'Dividend must be APPROVED to calculate distribution' });
    
    const security = dividend.security;
    
    // Get all current holdings for this security
    const holdings = await Holding.find({ security: security._id })
      .populate('investor', 'fullName folioNumber');
    
    const totalAllocatedShares = security.allocatedShares;
    
    // Create distribution records
    const distributions = [];
    let calculatedTotal = 0;
    
    for (const holding of holdings) {
      if (holding.shares > 0) {
        const percentage = totalAllocatedShares > 0 
          ? (holding.shares / totalAllocatedShares) * 100 
          : 0;
        const dividendAmount = holding.shares * dividend.dividendPerShare;
        calculatedTotal += dividendAmount;
        
        distributions.push({
          dividend: dividend._id,
          investor: holding.investor._id,
          security: security._id,
          shares: holding.shares,
          percentage: parseFloat(percentage.toFixed(2)),
          dividendPerShare: dividend.dividendPerShare,
          dividendAmount: parseFloat(dividendAmount.toFixed(2)),
          status: 'PENDING'
        });
      }
    }
    
    // Bulk insert distributions
    if (distributions.length > 0) {
      await DividendDistribution.insertMany(distributions, { ordered: false }).catch(err => {
        // Ignore duplicate key errors (in case of recalculation)
        if (err.code !== 11000) throw err;
      });
    }
    
    // Update dividend with calculated data
    dividend.totalDividend = calculatedTotal;
    dividend.totalShares = totalAllocatedShares;
    dividend.totalInvestors = distributions.length;
    await dividend.save();
    
    await logAudit({ entityType: 'Dividend', entityId: dividend._id, action: 'CALCULATE',
      user: req.user, newData: { totalDividend: calculatedTotal, distributions: distributions.length }, req });
    emit(req, 'dividend_update', { action: 'CALCULATED', dividend, distributions });
    
    res.json({ 
      message: 'Dividend calculated', 
      dividend, 
      distributions,
      summary: {
        totalInvestors: distributions.length,
        totalShares: totalAllocatedShares,
        totalDividend: calculatedTotal
      }
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// Get dividend report for a specific dividend
exports.getReport = async (req, res) => {
  try {
    const dividend = await Dividend.findById(req.params.id)
      .populate('security', 'isin companyName totalShares allocatedShares');
    if (!dividend) return res.status(404).json({ message: 'Dividend not found' });
    
    const distributions = await DividendDistribution.find({ dividend: dividend._id })
      .populate('investor', 'fullName folioNumber')
      .populate('security', 'isin companyName')
      .sort({ dividendAmount: -1 });
    
    // Calculate summary
    const totalInvestors = distributions.length;
    const totalShares = distributions.reduce((sum, d) => sum + d.shares, 0);
    const totalDividend = distributions.reduce((sum, d) => sum + d.dividendAmount, 0);
    
    res.json({
      dividend,
      distributions,
      summary: {
        security: dividend.security,
        dividendPerShare: dividend.dividendPerShare,
        totalInvestors,
        totalShares,
        totalDividend,
        status: dividend.status
      }
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// Get all dividend distributions (for admin report)
exports.getAllDistributions = async (req, res) => {
  try {
    const { investorId, securityId, dividendId } = req.query;
    const q = {};
    if (investorId) q.investor = investorId;
    if (securityId) q.security = securityId;
    if (dividendId) q.dividend = dividendId;
    
    const distributions = await DividendDistribution.find(q)
      .populate('investor', 'fullName folioNumber')
      .populate('security', 'isin companyName')
      .populate('dividend', 'dividendPerShare createdAt')
      .sort({ createdAt: -1 });
    
    res.json({ distributions });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// Submit dividend for approval
exports.submit = async (req, res) => {
  try {
    const dividend = await Dividend.findById(req.params.id).populate('security', 'companyName');
    if (!dividend) return res.status(404).json({ message: 'Dividend not found' });
    if (dividend.status !== 'DRAFT')
      return res.status(400).json({ message: 'Only DRAFT dividends can be submitted' });
    if (dividend.createdBy && dividend.createdBy.toString() !== req.user._id.toString() && req.user.role !== 'ADMIN')
      return res.status(403).json({ message: 'Only creator can submit' });
    
    const oldStatus = dividend.status;
    dividend.status = 'PENDING';
    await dividend.save();
    
    await logStatusChange({ entityType: 'Dividend', entityId: dividend._id,
      oldStatus, newStatus: 'PENDING', user: req.user });
    await logAudit({ entityType: 'Dividend', entityId: dividend._id, action: 'SUBMIT',
      user: req.user, newData: { status: 'PENDING' } });
    
    await createRoleBasedNotifications({
      req,
      event: 'DIVIDEND_SUBMITTED',
      message: `Dividend for ${dividend.security.companyName} submitted for review by ${req.user.fullName || req.user.email}`,
      entityType: 'Dividend',
      entityId: dividend._id,
      targetRoles: ['CHECKER', 'ADMIN']
    });
    
    emit(req, 'dividend_update', { action: 'SUBMITTED', dividend });
    res.json({ message: 'Dividend submitted for approval', dividend });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// Approve dividend
exports.approve = async (req, res) => {
  try {
    const dividend = await Dividend.findById(req.params.id).populate('security', 'companyName');
    if (!dividend) return res.status(404).json({ message: 'Dividend not found' });
    if (dividend.status !== 'PENDING')
      return res.status(400).json({ message: 'Only PENDING dividends can be approved' });
    if (dividend.createdBy && dividend.createdBy.toString() === req.user._id.toString() && req.user.role !== 'ADMIN')
      return res.status(403).json({ message: 'Cannot approve your own dividend' });
    
    const oldStatus = dividend.status;
    dividend.status = 'APPROVED';
    dividend.approvedBy = req.user._id;
    dividend.approvedAt = new Date();
    await dividend.save();
    
    await logStatusChange({ entityType: 'Dividend', entityId: dividend._id,
      oldStatus, newStatus: 'APPROVED', user: req.user });
    await logAudit({ entityType: 'Dividend', entityId: dividend._id, action: 'APPROVE',
      user: req.user, newData: { status: 'APPROVED', approvedBy: req.user.fullName || req.user.email } });
    
    await createRoleBasedNotifications({
      req,
      event: 'DIVIDEND_APPROVED',
      message: `Dividend for ${dividend.security.companyName} approved by ${req.user.fullName || req.user.email}`,
      entityType: 'Dividend',
      entityId: dividend._id,
      skipUserId: req.user._id,
      targetRoles: ['ADMIN']
    });
    
    if (dividend.createdBy && dividend.createdBy.toString() !== req.user._id.toString()) {
      await createNotification({
        userId: dividend.createdBy,
        event: 'DIVIDEND_APPROVED',
        message: `Your dividend for ${dividend.security.companyName} has been approved`,
        entityType: 'Dividend',
        entityId: dividend._id,
        createdBy: req.user._id,
        createdByName: req.user.fullName || req.user.email,
        link: `/app/dividends/${dividend._id}`,
        isRead: false,
        createdAt: new Date()
      });
    }
    
    emit(req, 'dividend_update', { action: 'APPROVED', dividend });

    // Trigger real-time validation (non-blocking)
    auditValidationService.runFullAudit({
      autoFix: false,
      userId: req.user._id,
      userName: req.user.fullName || req.user.email,
      role: req.user.role
    }).catch(err => console.error('Validation trigger failed:', err));

    res.json({ message: 'Dividend approved', dividend });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// Reject dividend
exports.reject = async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ message: 'Rejection reason is required' });
    
    const dividend = await Dividend.findById(req.params.id).populate('security', 'companyName');
    if (!dividend) return res.status(404).json({ message: 'Dividend not found' });
    if (dividend.status !== 'PENDING')
      return res.status(400).json({ message: 'Only PENDING dividends can be rejected' });
    
    const oldStatus = dividend.status;
    dividend.status = 'DRAFT';
    dividend.rejectedBy = req.user._id;
    dividend.rejectedAt = new Date();
    dividend.rejectionReason = reason;
    await dividend.save();
    
    await logStatusChange({ entityType: 'Dividend', entityId: dividend._id,
      oldStatus, newStatus: 'DRAFT', user: req.user });
    await logAudit({ entityType: 'Dividend', entityId: dividend._id, action: 'REJECT',
      user: req.user, newData: { status: 'DRAFT', rejectionReason: reason } });
    
    await createRoleBasedNotifications({
      req,
      event: 'DIVIDEND_REJECTED',
      message: `Dividend for ${dividend.security.companyName} rejected. Reason: ${reason}`,
      entityType: 'Dividend',
      entityId: dividend._id,
      targetRoles: ['ADMIN']
    });
    
    if (dividend.createdBy && dividend.createdBy.toString() !== req.user._id.toString()) {
      await createNotification({
        userId: dividend.createdBy,
        event: 'DIVIDEND_REJECTED',
        message: `Your dividend for ${dividend.security.companyName} was rejected. Reason: ${reason}`,
        entityType: 'Dividend',
        entityId: dividend._id,
        createdBy: req.user._id,
        createdByName: req.user.fullName || req.user.email,
        link: `/app/dividends/${dividend._id}`,
        isRead: false,
        createdAt: new Date()
      });
    }
    
    emit(req, 'dividend_update', { action: 'REJECTED', dividend });
    res.json({ message: 'Dividend rejected', dividend });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// Mark dividend as paid
exports.markPaid = async (req, res) => {
  try {
    const dividend = await Dividend.findById(req.params.id).populate('security', 'companyName');
    if (!dividend) return res.status(404).json({ message: 'Dividend not found' });
    if (dividend.status !== 'APPROVED')
      return res.status(400).json({ message: 'Only APPROVED dividends can be marked as paid' });
    
    const oldStatus = dividend.status;
    dividend.status = 'PAID';
    dividend.paidBy = req.user._id;
    dividend.paidAt = new Date();
    await dividend.save();
    
    // Update all distributions to PAID
    await DividendDistribution.updateMany(
      { dividend: dividend._id },
      { status: 'PAID', paidAt: new Date() }
    );
    
    await logStatusChange({ entityType: 'Dividend', entityId: dividend._id,
      oldStatus, newStatus: 'PAID', user: req.user });
    await logAudit({ entityType: 'Dividend', entityId: dividend._id, action: 'MARK_PAID',
      user: req.user, newData: { status: 'PAID', paidAt: new Date() } });
    
    await createRoleBasedNotifications({
      req,
      event: 'DIVIDEND_PAID',
      message: `Dividend for ${dividend.security.companyName} marked as paid by ${req.user.fullName || req.user.email}`,
      entityType: 'Dividend',
      entityId: dividend._id,
      targetRoles: ['ADMIN', 'CHECKER']
    });
    
    emit(req, 'dividend_update', { action: 'PAID', dividend });
    res.json({ message: 'Dividend marked as paid', dividend });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// Delete dividend (only if draft)
exports.remove = async (req, res) => {
  try {
    const dividend = await Dividend.findById(req.params.id);
    if (!dividend) return res.status(404).json({ message: 'Dividend not found' });
    if (dividend.status !== 'DRAFT')
      return res.status(400).json({ message: 'Only DRAFT dividends can be deleted' });
    if (dividend.createdBy && dividend.createdBy.toString() !== req.user._id.toString() && req.user.role !== 'ADMIN')
      return res.status(403).json({ message: 'Only creator or Admin can delete' });
    
    // Delete associated distributions
    await DividendDistribution.deleteMany({ dividend: dividend._id });
    
    await Dividend.findByIdAndDelete(req.params.id);
    
    await logAudit({ entityType: 'Dividend', entityId: dividend._id, action: 'DELETE',
      user: req.user, oldData: dividend.toJSON() });
    emit(req, 'dividend_update', { action: 'DELETED', dividendId: req.params.id });
    
    res.json({ message: 'Dividend deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};
