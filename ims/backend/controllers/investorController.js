const Investor = require('../models/Investor');
const Holding = require('../models/Holding');
const { generateFolioNumber, validateFolioFormat, getFolioStats } = require('../utils/folioGenerator');
const { logAudit, logStatusChange } = require('../utils/audit');
const { emitNotification, createRoleBasedNotifications, createNotification } = require('../utils/notifications');

const emit = (req, event, data) => {
  const io = req.app.get('socketio');
  if (io) io.emit(event, data);
};

// ── Validation Helpers ────────────────────────────────────
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[0-9]{10}$/;
const BANK_ACCOUNT_REGEX = /^\d{9,18}$/;

// Validate individual fields
const validateField = (field, value) => {
  const errors = [];
  switch (field) {
    case 'fullName':
      if (!value || value.trim().length < 2) errors.push('Full Name must be at least 2 characters');
      if (value && value.trim().length > 100) errors.push('Full Name must not exceed 100 characters');
      break;
    case 'panNumber':
      if (!value) errors.push('PAN is required');
      else if (!PAN_REGEX.test(value.toUpperCase())) errors.push('Invalid PAN format. Expected: ABCDE1234F');
      break;
    case 'email':
      if (!value) errors.push('Email is required');
      else if (!EMAIL_REGEX.test(value)) errors.push('Invalid email format');
      break;
    case 'phone':
      if (!value) errors.push('Phone is required');
      else if (!PHONE_REGEX.test(value)) errors.push('Phone must be exactly 10 digits');
      break;
    case 'bankAccount':
      if (!value) errors.push('Bank Account is required');
      else if (!BANK_ACCOUNT_REGEX.test(value)) errors.push('Bank Account must be 9-18 digits');
      break;
    case 'ifscCode':
      if (!value) errors.push('IFSC is required');
      else if (!IFSC_REGEX.test(value.toUpperCase())) errors.push('Invalid IFSC format. Expected: ABCD0XXXXXX');
      break;
    case 'city':
      if (!value || value.trim().length < 1) errors.push('City is required');
      if (value && value.trim().length > 50) errors.push('City must not exceed 50 characters');
      break;
    case 'address':
      if (!value || value.trim().length < 10) errors.push('Address must be at least 10 characters');
      if (value && value.trim().length > 200) errors.push('Address must not exceed 200 characters');
      break;
  }
  return errors;
};

// Validate all required fields for creation/update
const validateInvestorData = (data, requireAll = false) => {
  const errors = [];
  const fieldsToValidate = requireAll
    ? ['fullName', 'panNumber', 'email', 'phone', 'bankAccount', 'ifscCode', 'city', 'address']
    : Object.keys(data).filter(k => ['fullName', 'panNumber', 'email', 'phone', 'bankAccount', 'ifscCode', 'city', 'address'].includes(k));

  fieldsToValidate.forEach(field => {
    const fieldErrors = validateField(field, data[field]);
    errors.push(...fieldErrors);
  });

  return errors;
};

// GET /api/investors
exports.getAll = async (req, res) => {
  try {
    const { status, search, page = 1, limit = 20 } = req.query;
    const query = {};
    if (status) query.status = status;
    if (req.user.role === 'MAKER') query.createdBy = req.user._id;
    if (search) {
      query.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { panNumber: { $regex: search, $options: 'i' } },
        { folioNumber: { $regex: search, $options: 'i' } }
      ];
    }
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [investors, total] = await Promise.all([
      Investor.find(query)
        .populate('createdBy', 'name email role')
        .populate('approvedBy', 'name email role')
        .populate('rejectedBy', 'name email role')
        .sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
      Investor.countDocuments(query)
    ]);

    // Calculate shares from holdings for each investor (only APPROVED holdings)
    const investorIds = investors.map(inv => inv._id.toString());
    const holdings = await Holding.find({ investor: { $in: investorIds }, status: 'APPROVED' });

    const holdingsMap = {};
    holdings.forEach(h => {
      const invId = h.investor.toString();
      if (!holdingsMap[invId]) holdingsMap[invId] = 0;
      holdingsMap[invId] += h.shares;
    });

    const investorsWithShares = investors.map(inv => {
      const invObj = inv.toObject();
      invObj.shares = holdingsMap[inv._id.toString()] || 0;
      return invObj;
    });

    res.json({ investors: investorsWithShares, pagination: { page: +page, limit: +limit, total, pages: Math.ceil(total / +limit) } });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// GET /api/investors/:id
exports.getOne = async (req, res) => {
  try {
    const investor = await Investor.findById(req.params.id)
      .populate('createdBy', 'name email role')
      .populate('approvedBy', 'name email role')
      .populate('rejectedBy', 'name email role')
      .populate('submittedBy', 'name email role');
    if (!investor) return res.status(404).json({ message: 'Investor not found' });
    if (req.user.role === 'MAKER' && investor.createdBy._id.toString() !== req.user._id.toString())
      return res.status(403).json({ message: 'Access denied' });

    // Calculate shares from holdings (only APPROVED holdings)
    const holdings = await Holding.find({ investor: investor._id, status: 'APPROVED' });
    const totalShares = holdings.reduce((sum, h) => sum + h.shares, 0);

    const investorObj = investor.toObject();
    investorObj.shares = totalShares;

    res.json({ investor: investorObj });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// GET /api/investors/check-pan — Real-time PAN duplicate check
exports.checkPanDuplicate = async (req, res) => {
  try {
    const { pan, excludeId } = req.query;
    if (!pan) return res.status(400).json({ message: 'PAN parameter is required' });

    // Validate PAN format
    if (!PAN_REGEX.test(pan.toUpperCase())) {
      return res.status(400).json({ exists: false, message: 'Invalid PAN format', valid: false });
    }

    const query = { panNumber: pan.toUpperCase() };
    if (excludeId) query._id = { $ne: excludeId };

    const existing = await Investor.findOne(query);

    if (existing) {
      return res.json({
        exists: true,
        message: `❌ PAN already registered (Folio: ${existing.folioNumber})`,
        valid: false,
        conflict: { folioNumber: existing.folioNumber, fullName: existing.fullName }
      });
    }

    res.json({ exists: false, message: '✅ PAN is available', valid: true });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// GET /api/investors/check-email — Real-time Email duplicate check
exports.checkEmailDuplicate = async (req, res) => {
  try {
    const { email, excludeId } = req.query;
    if (!email) return res.status(400).json({ message: 'Email parameter is required' });

    // Validate email format
    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({ exists: false, message: 'Invalid email format', valid: false });
    }

    const query = { email: email.toLowerCase() };
    if (excludeId) query._id = { $ne: excludeId };

    const existing = await Investor.findOne(query);

    if (existing) {
      return res.json({
        exists: true,
        message: `❌ Email already registered (${existing.fullName})`,
        valid: false,
        conflict: { folioNumber: existing.folioNumber, fullName: existing.fullName }
      });
    }

    res.json({ exists: false, message: '✅ Email is available', valid: true });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// GET /api/investors/check-folio — Real-time Folio format validation
exports.checkFolioFormat = async (req, res) => {
  try {
    const { folio } = req.query;
    if (!folio) return res.status(400).json({ message: 'Folio parameter is required' });

    const validation = validateFolioFormat(folio);

    if (!validation.valid) {
      return res.json({
        valid: false,
        message: `❌ ${validation.error}`,
        folio
      });
    }

    // Check if folio already exists
    const existing = await Investor.findOne({ folioNumber: folio.toUpperCase() });
    if (existing) {
      return res.json({
        valid: false,
        message: `❌ Folio already assigned to ${existing.fullName}`,
        folio,
        conflict: { folioNumber: existing.folioNumber, fullName: existing.fullName }
      });
    }

    res.json({ valid: true, message: '✅ Folio format is valid and available', folio });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// GET /api/investors/folio-stats — Get folio generation statistics
exports.getFolioStats = async (req, res) => {
  try {
    const stats = await getFolioStats();
    res.json(stats);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// POST /api/investors — Maker creates draft
exports.create = async (req, res) => {
  try {
    const { fullName, panNumber, email, phone, bankAccount, ifscCode, address, city } = req.body;

    // Comprehensive validation
    const validationErrors = validateInvestorData(req.body, true);
    if (validationErrors.length > 0) {
      return res.status(400).json({ message: 'Validation failed', errors: validationErrors });
    }

    // Check PAN duplicate
    const dupPan = await Investor.findOne({ panNumber: panNumber.toUpperCase() });
    if (dupPan) return res.status(409).json({ message: 'PAN already registered' });

    // Check Email duplicate
    const dupEmail = await Investor.findOne({ email: email.toLowerCase() });
    if (dupEmail) return res.status(409).json({ message: 'Email already registered' });

    const folioNumber = await generateFolioNumber();
    const investor = await Investor.create({
      folioNumber, fullName: fullName.trim(), panNumber: panNumber.toUpperCase(),
      email: email.toLowerCase(), phone, bankAccount, ifscCode: ifscCode.toUpperCase(),
      address: address.trim(), city,
      createdBy: req.user._id, status: 'DRAFT', kycStatus: 'NOT_STARTED'
    });

    // Log initial status
    await logStatusChange({ entityType: 'Investor', entityId: investor._id,
      oldStatus: null, newStatus: 'DRAFT', user: req.user });

    await logAudit({ entityType: 'Investor', entityId: investor._id, action: 'CREATE',
      user: req.user, newData: investor.toJSON() });

    // Notification: Investor Created → Checker + Admin
    await createRoleBasedNotifications({
      req,
      event: 'INVESTOR_CREATED',
      message: `New investor "${fullName}" created by ${req.user.fullName || req.user.email}`,
      entityType: 'Investor',
      entityId: investor._id,
      skipUserId: req.user._id,
      targetRoles: ['CHECKER', 'ADMIN']
    });

    emit(req, 'investor_update', { action: 'CREATED', investor });
    res.status(201).json({ message: 'Investor created as DRAFT', investor });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// PUT /api/investors/:id — Maker edits DRAFT or REJECTED
exports.update = async (req, res) => {
  try {
    const investor = await Investor.findById(req.params.id);
    if (!investor) return res.status(404).json({ message: 'Investor not found' });
    if (!['DRAFT','REJECTED'].includes(investor.status))
      return res.status(400).json({ message: 'Can only edit DRAFT or REJECTED investors' });
    if (req.user.role === 'MAKER' && investor.createdBy.toString() !== req.user._id.toString())
      return res.status(403).json({ message: 'Only creator can edit' });

    // Validate fields being updated (note: panNumber is NOT editable in direct update)
    const allowed = ['fullName','email','phone','bankAccount','ifscCode','address','city'];
    const validationErrors = validateInvestorData(req.body, false);
    if (validationErrors.length > 0) {
      return res.status(400).json({ message: 'Validation failed', errors: validationErrors });
    }

    // Check email duplicate if email is being changed
    if (req.body.email && req.body.email.toLowerCase() !== investor.email.toLowerCase()) {
      const dup = await Investor.findOne({ email: req.body.email.toLowerCase(), _id: { $ne: investor._id } });
      if (dup) return res.status(409).json({ message: 'Email already registered by another investor' });
    }

    const oldData = investor.toJSON();
    allowed.forEach(f => { if (req.body[f] !== undefined) investor[f] = req.body[f]; });
    if (investor.status === 'REJECTED') investor.status = 'DRAFT';
    await investor.save();

    await logAudit({ entityType: 'Investor', entityId: investor._id, action: 'EDIT',
      user: req.user, oldData, newData: investor.toJSON() });

    emit(req, 'investor_update', { action: 'UPDATED', investor });
    res.json({ message: 'Investor updated', investor });
  } catch (err) {
    // Handle Mongoose validation errors
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({ message: 'Validation failed', errors: messages });
    }
    res.status(500).json({ message: err.message });
  }
};

// POST /api/investors/:id/submit — Maker submits for review
exports.submit = async (req, res) => {
  try {
    const investor = await Investor.findById(req.params.id);
    if (!investor) return res.status(404).json({ message: 'Investor not found' });
    if (investor.status !== 'KYC_PENDING')
      return res.status(400).json({ message: 'Investor must have KYC uploaded before submitting' });
    const submitCreatedById = investor.createdBy?._id?.toString() || investor.createdBy?.toString();
    if (req.user.role === 'MAKER' && submitCreatedById !== req.user._id.toString())
      return res.status(403).json({ message: 'Only creator can submit' });
    if (!investor.kycDocuments?.aadhaar?.url || !investor.kycDocuments?.pan?.url ||
        !investor.kycDocuments?.bank?.url)
      return res.status(400).json({ message: 'All KYC documents (Aadhaar, PAN, Bank) must be uploaded' });

    const oldStatus = investor.status;
    investor.status = 'UNDER_REVIEW';
    investor.kycStatus = 'SUBMITTED';
    investor.submittedAt = new Date();
    investor.submittedBy = req.user._id;
    await investor.save();

    await logStatusChange({ entityType: 'Investor', entityId: investor._id,
      oldStatus, newStatus: 'UNDER_REVIEW', user: req.user });
    await logAudit({ entityType: 'Investor', entityId: investor._id, action: 'SUBMIT',
      user: req.user, newData: { status: 'UNDER_REVIEW' } });

    emit(req, 'investor_update', { action: 'SUBMITTED', investor });
    res.json({ message: 'Investor submitted for review', investor });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// POST /api/investors/:id/approve — Checker/Admin approves
exports.approve = async (req, res) => {
  try {
    const investor = await Investor.findById(req.params.id);
    if (!investor) return res.status(404).json({ message: 'Investor not found' });
    if (investor.status === 'KYC_PENDING') {
      // Auto-transition from KYC_PENDING to UNDER_REVIEW
      investor.status = 'UNDER_REVIEW';
      investor.kycStatus = 'SUBMITTED';
      investor.submittedAt = new Date();
      investor.submittedBy = req.user._id;
      await investor.save();
    }
    if (investor.status !== 'UNDER_REVIEW')
      return res.status(400).json({ message: 'Investor must be UNDER_REVIEW to approve' });
    const createdById = investor.createdBy?._id?.toString() || investor.createdBy?.toString();
    if (createdById === req.user._id.toString() && req.user.role !== 'ADMIN')
      return res.status(403).json({ message: 'Maker cannot approve own investor' });

    const oldStatus = investor.status;
    investor.status = 'APPROVED';
    investor.kycStatus = 'APPROVED';
    investor.approvedBy = req.user._id;
    investor.approvedAt = new Date();
    investor.rejectionReason = undefined;
    await investor.save();

    await logStatusChange({ entityType: 'Investor', entityId: investor._id,
      oldStatus, newStatus: 'APPROVED', user: req.user });
    await logAudit({ entityType: 'Investor', entityId: investor._id, action: 'APPROVE',
      user: req.user, newData: { status: 'APPROVED', approvedBy: req.user.fullName || req.user.email } });

    // Notification: KYC Approved → Maker + Admin
    await createRoleBasedNotifications({
      req,
      event: 'KYC_APPROVED',
      message: `KYC approved for "${investor.fullName}" by ${req.user.fullName || req.user.email}`,
      entityType: 'Investor',
      entityId: investor._id,
      skipUserId: req.user._id,
      targetRoles: ['ADMIN']
    });

    // Also notify the Maker who created the investor
    if (investor.createdBy && investor.createdBy.toString() !== req.user._id.toString()) {
      await createNotification({
        userId: investor.createdBy,
        event: 'KYC_APPROVED',
        message: `KYC approved for "${investor.fullName}"`,
        entityType: 'Investor',
        entityId: investor._id,
        createdBy: req.user._id,
        createdByName: req.user.fullName || req.user.email,
        link: `/app/investors/${investor._id}`,
        isRead: false,
        createdAt: new Date()
      });
    }

    emit(req, 'investor_update', { action: 'APPROVED', investor });
    res.json({ message: 'Investor approved', investor });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// POST /api/investors/:id/reject — Checker/Admin rejects
exports.reject = async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ message: 'Rejection reason is mandatory' });
    const investor = await Investor.findById(req.params.id);
    if (!investor) return res.status(404).json({ message: 'Investor not found' });
    if (investor.status !== 'UNDER_REVIEW')
      return res.status(400).json({ message: 'Investor must be UNDER_REVIEW to reject' });

    const oldStatus = investor.status;
    investor.status = 'REJECTED';
    investor.kycStatus = 'REJECTED';
    investor.rejectionReason = reason;
    investor.rejectedBy = req.user._id;
    investor.rejectedAt = new Date();
    await investor.save();

    await logStatusChange({ entityType: 'Investor', entityId: investor._id,
      oldStatus, newStatus: 'REJECTED', user: req.user, reason });
    await logAudit({ entityType: 'Investor', entityId: investor._id, action: 'REJECT',
      user: req.user, newData: { status: 'REJECTED', reason } });

    // Notification: KYC Rejected → Maker + Admin
    await createRoleBasedNotifications({
      req,
      event: 'KYC_REJECTED',
      message: `KYC rejected for "${investor.fullName}" by ${req.user.fullName || req.user.email}. Reason: ${reason}`,
      entityType: 'Investor',
      entityId: investor._id,
      targetRoles: ['ADMIN']
    });

    // Also notify the Maker who created the investor
    if (investor.createdBy && investor.createdBy.toString() !== req.user._id.toString()) {
      await createNotification({
        userId: investor.createdBy,
        event: 'KYC_REJECTED',
        message: `KYC rejected for "${investor.fullName}". Reason: ${reason}`,
        entityType: 'Investor',
        entityId: investor._id,
        createdBy: req.user._id,
        createdByName: req.user.fullName || req.user.email,
        link: `/app/investors/${investor._id}`,
        isRead: false,
        createdAt: new Date()
      });
    }

    emit(req, 'investor_update', { action: 'REJECTED', investor });
    res.json({ message: 'Investor rejected', investor });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// POST /api/investors/:id/request-edit — Maker requests edit approval
exports.requestEdit = async (req, res) => {
  try {
    const investor = await Investor.findById(req.params.id);
    if (!investor) return res.status(404).json({ message: 'Investor not found' });
    
    // Only allow editing APPROVED investors through this flow
    if (investor.status !== 'APPROVED') 
      return res.status(400).json({ message: 'Can only edit APPROVED investors through approval flow' });
    
    // 1. PREVENT MULTIPLE PENDING EDITS
    if (investor.pendingUpdate && investor.pendingUpdate.status === 'PENDING') {
      return res.status(400).json({ 
        message: 'Edit already pending approval',
        pendingUpdate: investor.pendingUpdate 
      });
    }
    
    // 2. CHECK ROLE - Only Maker can request edit
    if (req.user.role === 'MAKER' && investor.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only creator can request edit' });
    }
    
    // Only MAKER or ADMIN can edit
    if (!['MAKER', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Only Maker or Admin can request edits' });
    }

    // 3. STORE ONLY ALLOWED FIELDS (Folio, CreatedBy locked)
    const allowedFields = ['fullName','email','phone','bankAccount','ifscCode','address','panNumber','city'];
    const oldData = {};
    const newData = {};
    const changedFields = {};
    let hasActualChanges = false;
    
    allowedFields.forEach(field => {
      oldData[field] = investor[field];
      if (req.body[field] !== undefined) {
        newData[field] = req.body[field];
        // 4. CHANGE DETECTION - Track only changed fields
        if (String(investor[field]).toLowerCase() !== String(req.body[field]).toLowerCase()) {
          changedFields[field] = { old: investor[field], new: req.body[field] };
          hasActualChanges = true;
        }
      } else {
        newData[field] = investor[field];
      }
    });

    // 3. CHANGE DETECTION - Reject if no actual changes
    if (!hasActualChanges) {
      return res.status(400).json({ message: 'No changes detected' });
    }

    // 4. VALIDATE ALL CHANGED FIELDS
    const changedFieldNames = Object.keys(changedFields);
    const validationErrors = [];

    for (const field of changedFieldNames) {
      const errors = validateField(field, newData[field]);
      validationErrors.push(...errors);
    }

    if (validationErrors.length > 0) {
      return res.status(400).json({ message: 'Validation failed', errors: validationErrors });
    }

    // 5. CHECK DUPLICATE PAN if changed
    if (changedFields.panNumber) {
      const dup = await Investor.findOne({
        panNumber: newData.panNumber.toUpperCase(),
        _id: { $ne: investor._id }
      });
      if (dup) return res.status(409).json({ message: 'PAN already registered by another investor' });
    }

    // 6. CHECK DUPLICATE EMAIL if changed
    if (changedFields.email) {
      const dup = await Investor.findOne({
        email: newData.email.toLowerCase(),
        _id: { $ne: investor._id }
      });
      if (dup) return res.status(409).json({ message: 'Email already registered by another investor' });
    }

    // 5. SET PENDING UPDATE with field-level audit
    investor.pendingUpdate = {
      oldData,
      newData,
      changedFields,
      requestedBy: req.user._id,
      requestedAt: new Date(),
      status: 'PENDING'
    };
    
    await investor.save();

    // 6. LOG AUDIT with field-level changes
    await logAudit({ 
      entityType: 'Investor', 
      entityId: investor._id, 
      action: 'EDIT_REQUEST',
      user: req.user, 
      oldData, 
      newData,
      changedFields,
      performedBy: req.user._id
    });

    // 7. REAL-TIME SYNC - Emit socket event
    emit(req, 'investor_edit_requested', { 
      action: 'EDIT_REQUESTED', 
      investor,
      pendingUpdate: investor.pendingUpdate
    });

    // 8. NOTIFY: Investor Edited → Checker + Admin
    await createRoleBasedNotifications({
      req,
      event: 'INVESTOR_EDITED',
      message: `Edit requested for "${investor.fullName}" by ${req.user.fullName || req.user.email}`,
      entityType: 'Investor',
      entityId: investor._id,
      targetRoles: ['CHECKER', 'ADMIN']
    });

    res.json({ 
      success: true,
      message: 'Edit request submitted for approval', 
      investor,
      pendingUpdate: investor.pendingUpdate,
      changedFields
    });
  } catch (err) { 
    res.status(500).json({ message: err.message }); 
  }
};

// POST /api/investors/:id/approve-edit — Checker/Admin approves edit
exports.approveEdit = async (req, res) => {
  try {
    const investor = await Investor.findById(req.params.id);
    if (!investor) return res.status(404).json({ message: 'Investor not found' });
    
    if (!investor.pendingUpdate || investor.pendingUpdate.status !== 'PENDING')
      return res.status(400).json({ message: 'No pending edit request found' });

    // 1. SECURITY - Only Checker/Admin can approve
    if (!['CHECKER', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Only Checker or Admin can approve edits' });
    }

    // 2. Maker cannot approve own edit (unless Admin)
    const createdById = investor.createdBy?._id?.toString() || investor.createdBy?.toString();
    const requestedById = investor.pendingUpdate.requestedBy?.toString();
    
    if ((createdById === req.user._id.toString() || requestedById === req.user._id.toString()) 
        && req.user.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Maker cannot approve own edit request' });
    }

    const { oldData, newData, changedFields } = investor.pendingUpdate;

    // 3. APPROVAL SAFETY - Re-check duplicates before applying
    if (changedFields && changedFields.panNumber) {
      const dup = await Investor.findOne({
        panNumber: newData.panNumber.toUpperCase(),
        _id: { $ne: investor._id }
      });
      if (dup) {
        return res.status(409).json({
          message: 'Cannot approve: PAN already registered by another investor',
          conflict: { folioNumber: dup.folioNumber, fullName: dup.fullName }
        });
      }
    }

    if (changedFields && changedFields.email) {
      const dup = await Investor.findOne({
        email: newData.email.toLowerCase(),
        _id: { $ne: investor._id }
      });
      if (dup) {
        return res.status(409).json({
          message: 'Cannot approve: Email already registered by another investor',
          conflict: { folioNumber: dup.folioNumber, fullName: dup.fullName }
        });
      }
    }

    // 4. Apply the changes
    const allowedFields = ['fullName','email','phone','bankAccount','ifscCode','address','panNumber','city'];
    allowedFields.forEach(field => {
      if (newData[field] !== undefined) {
        investor[field] = newData[field];
      }
    });

    // 5. AUTO CLEANUP - Clear pending update after approval
    investor.pendingUpdate = {
      status: 'APPROVED',
      approvedBy: req.user._id,
      approvedAt: new Date(),
      oldData,
      newData,
      changedFields
    };
    
    await investor.save();

    // 6. LOG AUDIT
    await logAudit({ 
      entityType: 'Investor', 
      entityId: investor._id, 
      action: 'EDIT_APPROVE',
      user: req.user, 
      oldData, 
      newData,
      changedFields,
      performedBy: req.user._id,
      approvedBy: req.user._id
    });

    // 7. REAL-TIME SYNC
    emit(req, 'investor_edit_approved', { 
      action: 'EDIT_APPROVED', 
      investor,
      approvedBy: req.user._id 
    });

    // 8. NOTIFY with improved message
    if (investor.createdBy) {
      await emitNotification('INVESTOR_EDITED', {
        title: 'Investor Edit Approved',
        message: `Your investor edit (${investor.folioNumber}) has been approved by ${req.user.fullName || req.user.email}`,
        entityId: investor._id,
        entityType: 'Investor',
        createdBy: req.user._id,
        createdByName: req.user.fullName || req.user.email,
        link: `/app/investors/${investor._id}`
      }, [investor.createdBy]);
    }

    res.json({ 
      success: true,
      message: 'Edit request approved and changes applied', 
      investor,
      changedFields
    });
  } catch (err) { 
    res.status(500).json({ message: err.message }); 
  }
};

// POST /api/investors/:id/reject-edit — Checker/Admin rejects edit
exports.rejectEdit = async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ message: 'Rejection reason is mandatory' });
    
    const investor = await Investor.findById(req.params.id);
    if (!investor) return res.status(404).json({ message: 'Investor not found' });
    
    if (!investor.pendingUpdate || investor.pendingUpdate.status !== 'PENDING')
      return res.status(400).json({ message: 'No pending edit request found' });

    // 1. SECURITY - Only Checker/Admin can reject
    if (!['CHECKER', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Only Checker or Admin can reject edits' });
    }

    // 2. Maker cannot reject own edit (unless Admin)
    const createdById = investor.createdBy?._id?.toString() || investor.createdBy?.toString();
    const requestedById = investor.pendingUpdate.requestedBy?.toString();
    
    if ((createdById === req.user._id.toString() || requestedById === req.user._id.toString()) 
        && req.user.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Maker cannot reject own edit request' });
    }

    const { oldData, newData, changedFields } = investor.pendingUpdate;

    // 3. AUTO CLEANUP - Store rejection info before clearing
    investor.pendingUpdate = {
      status: 'REJECTED',
      rejectedBy: req.user._id,
      rejectedAt: new Date(),
      rejectionReason: reason,
      oldData,
      newData,
      changedFields
    };
    
    await investor.save();

    // 4. LOG AUDIT with rejection reason
    await logAudit({ 
      entityType: 'Investor', 
      entityId: investor._id, 
      action: 'EDIT_REJECT',
      user: req.user, 
      oldData, 
      newData,
      changedFields,
      reason,
      performedBy: req.user._id,
      rejectedBy: req.user._id
    });

    // 5. REAL-TIME SYNC
    emit(req, 'investor_edit_rejected', { 
      action: 'EDIT_REJECTED', 
      investor,
      rejectedBy: req.user._id,
      reason
    });

    // 6. NOTIFY with improved message including reason
    await emitNotification('INVESTOR_EDITED', {
      title: 'Investor Edit Rejected',
      message: `Your investor edit (${investor.folioNumber}) was rejected by ${req.user.fullName || req.user.email}: ${reason}`,
      entityId: investor._id,
      entityType: 'Investor',
      createdBy: req.user._id,
      createdByName: req.user.fullName || req.user.email,
      link: `/app/investors/${investor._id}`,
      metadata: { reason }
    }, [investor.createdBy]);

    res.json({ 
      success: true,
      message: 'Edit request rejected', 
      investor,
      changedFields,
      reason
    });
  } catch (err) { 
    res.status(500).json({ message: err.message }); 
  }
};

// DELETE /api/investors/:id — Admin deletes investor
exports.remove = async (req, res) => {
  try {
    const investor = await Investor.findById(req.params.id);
    if (!investor) return res.status(404).json({ message: 'Investor not found' });
    
    // Only ADMIN can delete
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Only Admin can delete investors' });
    }

    // Log audit before deletion
    await logAudit({ 
      entityType: 'Investor', 
      entityId: investor._id, 
      action: 'DELETE',
      user: req.user, 
      oldData: investor.toJSON()
    });

    await Investor.findByIdAndDelete(req.params.id);
    
    emit(req, 'investor_update', { action: 'DELETED', investorId: req.params.id });
    res.json({ message: 'Investor deleted successfully' });
  } catch (err) { 
    res.status(500).json({ message: err.message }); 
  }
};
