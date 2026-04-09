const path = require('path');
const fs = require('fs');
const Investor = require('../models/Investor');
const { logAudit, logStatusChange } = require('../utils/audit');
const { createRoleBasedNotifications } = require('../utils/notifications');

const DOC_TYPES = ['aadhaar','pan','bank','photo'];

// POST /api/kyc/:investorId/upload/:docType
exports.uploadDoc = async (req, res) => {
  try {
    const { investorId, docType } = req.params;
    if (!DOC_TYPES.includes(docType))
      return res.status(400).json({ message: `Invalid docType. Use: ${DOC_TYPES.join(', ')}` });

    const investor = await Investor.findById(investorId);
    if (!investor) return res.status(404).json({ message: 'Investor not found' });
    if (!['DRAFT','KYC_PENDING','REJECTED'].includes(investor.status))
      return res.status(400).json({ message: 'Documents can only be uploaded for DRAFT, KYC_PENDING or REJECTED investors' });
    const createdById = investor.createdBy?._id?.toString() || investor.createdBy?.toString();
    if (req.user.role === 'MAKER' && createdById !== req.user._id.toString())
      return res.status(403).json({ message: 'Only creator can upload KYC' });
    if (!req.file)
      return res.status(400).json({ message: 'No file uploaded' });

    // Remove old file if exists
    const old = investor.kycDocuments?.[docType];
    if (old?.filename) {
      const oldPath = path.join(__dirname, '../uploads', investorId, old.filename);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    if (!investor.kycDocuments) investor.kycDocuments = {};
    investor.kycDocuments[docType] = {
      url: `/uploads/${investorId}/${req.file.filename}`,
      filename: req.file.filename,
      uploadedAt: new Date(),
      status: 'PENDING'
    };

    // Move to KYC_PENDING if still DRAFT
    const oldStatus = investor.status;
    if (investor.status === 'DRAFT') {
      investor.status = 'KYC_PENDING';
      investor.kycStatus = 'UPLOADED';
    }
    investor.markModified('kycDocuments');
    await investor.save();

    if (oldStatus !== investor.status) {
      await logStatusChange({ entityType: 'Investor', entityId: investor._id,
        oldStatus, newStatus: investor.status, user: req.user });
      
      // Notification: KYC Submitted → Checker + Admin
      if (investor.status === 'KYC_PENDING') {
        await createRoleBasedNotifications({
          req,
          event: 'KYC_SUBMITTED',
          message: `KYC documents submitted for "${investor.fullName}" by ${req.user.fullName || req.user.email}`,
          entityType: 'Investor',
          entityId: investor._id,
          targetRoles: ['CHECKER', 'ADMIN']
        });
      }
    }
    await logAudit({ entityType: 'Investor', entityId: investor._id, action: 'KYC_UPLOAD',
      user: req.user, newData: { docType, filename: req.file.filename } });

    res.json({ message: `${docType} uploaded successfully`, investor });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// GET /api/kyc/:investorId
exports.getDossier = async (req, res) => {
  try {
    const investor = await Investor.findById(req.params.investorId)
      .populate('createdBy', 'name');
    if (!investor) return res.status(404).json({ message: 'Investor not found' });
    res.json({ kycDocuments: investor.kycDocuments, kycStatus: investor.kycStatus, kycRemark: investor.kycRemark });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// GET /api/kyc — all dossiers for checker/admin
exports.getAllDossiers = async (req, res) => {
  try {
    const investors = await Investor.find({ status: { $in: ['KYC_PENDING','UNDER_REVIEW','APPROVED','REJECTED'] } })
      .populate('createdBy', 'name email');
    res.json({ investors });
  } catch (err) { res.status(500).json({ message: err.message }); }
};
