const path = require('path');
const fs = require('fs');
const Investor = require('../models/Investor');
const { logAudit, logStatusChange } = require('../utils/audit');
const { createRoleBasedNotifications } = require('../utils/notifications');

const DOC_TYPES = ['aadhaar','pan','bank','photo'];

// POST /api/kyc/:investorId/upload/:docType
exports.uploadDoc = async (req, res) => {
  // Step 1: UPLOAD - Validate request
  console.log('[KYC UPLOAD] ========== START UPLOAD FLOW ==========');
  console.log('[KYC UPLOAD] Step 1: Validating upload request');
  
  try {
    const { investorId, docType } = req.params;
    console.log('[KYC UPLOAD] Params:', { investorId, docType, user: req.user._id });
    
    if (!DOC_TYPES.includes(docType)) {
      console.log('[KYC UPLOAD] FAILED: Invalid docType');
      return res.status(400).json({ message: `Invalid docType. Use: ${DOC_TYPES.join(', ')}` });
    }

    const investor = await Investor.findById(investorId);
    if (!investor) {
      console.log('[KYC UPLOAD] FAILED: Investor not found');
      return res.status(404).json({ message: 'Investor not found' });
    }
    if (!['DRAFT','KYC_PENDING','REJECTED'].includes(investor.status)) {
      console.log('[KYC UPLOAD] FAILED: Invalid investor status:', investor.status);
      return res.status(400).json({ message: 'Documents can only be uploaded for DRAFT, KYC_PENDING or REJECTED investors' });
    }
    const createdById = investor.createdBy?._id?.toString() || investor.createdBy?.toString();
    if (req.user.role === 'MAKER' && createdById !== req.user._id.toString()) {
      console.log('[KYC UPLOAD] FAILED: Unauthorized maker');
      return res.status(403).json({ message: 'Only creator can upload KYC' });
    }
    
    // Check if file was received by multer
    if (!req.file) {
      console.error('[KYC UPLOAD] FAILED: No file received by multer');
      return res.status(400).json({ message: 'No file uploaded' });
    }
    
    console.log('[KYC UPLOAD] File received:', {
      filename: req.file.filename,
      originalname: req.file.originalname,
      size: req.file.size,
      path: req.file.path,
      fieldname: req.file.fieldname
    });

    // Step 2: CREATE FOLDER - Already done by multer, but verify
    console.log('[KYC UPLOAD] Step 2: Verifying upload directory');
    const uploadDir = path.join(__dirname, '../uploads', investorId);
    if (!fs.existsSync(uploadDir)) {
      console.error('[KYC UPLOAD] CRITICAL: Upload directory missing after multer:', uploadDir);
      return res.status(500).json({ message: 'Upload directory creation failed' });
    }
    console.log('[KYC UPLOAD] Directory verified:', uploadDir);

    // Step 3: SAVE FILE - Verify multer saved file
    console.log('[KYC UPLOAD] Step 3: Verifying file saved to disk');
    const uploadedFilePath = req.file.path;
    if (!fs.existsSync(uploadedFilePath)) {
      console.error('[KYC UPLOAD] CRITICAL: File not found on disk after multer save:', uploadedFilePath);
      return res.status(500).json({ message: 'File upload failed - file not saved to disk' });
    }
    
    // Verify file size matches
    const stats = fs.statSync(uploadedFilePath);
    console.log('[KYC UPLOAD] File on disk verified:', {
      path: uploadedFilePath,
      size: stats.size,
      created: stats.birthtime
    });

    // Step 4: VERIFY FILE EXISTS - Double check file is readable
    console.log('[KYC UPLOAD] Step 4: Verifying file is readable');
    try {
      fs.accessSync(uploadedFilePath, fs.constants.R_OK);
      console.log('[KYC UPLOAD] File is readable');
    } catch (err) {
      console.error('[KYC UPLOAD] CRITICAL: File not readable:', err);
      return res.status(500).json({ message: 'File saved but not readable' });
    }

    // Step 5: SAVE DB - Update investor record
    console.log('[KYC UPLOAD] Step 5: Saving to database');
    
    // Remove old file if exists
    const old = investor.kycDocuments?.[docType];
    if (old?.filename) {
      const oldPath = path.join(__dirname, '../uploads', investorId, old.filename);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
        console.log('[KYC UPLOAD] Old file removed:', oldPath);
      }
    }

    // Ensure kycDocuments object exists
    if (!investor.kycDocuments) investor.kycDocuments = {};
    
    // Set new document data
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
    console.log('[KYC UPLOAD] Database save completed');

    // Step 6: VERIFY DB - Re-fetch to confirm
    console.log('[KYC UPLOAD] Step 6: Verifying database save');
    const verifyInvestor = await Investor.findById(investorId);
    const savedDoc = verifyInvestor.kycDocuments?.[docType];
    
    if (!savedDoc) {
      console.error('[KYC UPLOAD] CRITICAL: Document not found after DB save:', { investorId, docType });
      // Cleanup: remove file since DB save failed
      if (fs.existsSync(uploadedFilePath)) {
        fs.unlinkSync(uploadedFilePath);
        console.log('[KYC UPLOAD] Cleanup: removed orphaned file after DB failure');
      }
      return res.status(500).json({ message: 'Upload verification failed - document not saved to database' });
    }
    
    // Verify saved data integrity
    if (!savedDoc.url || !savedDoc.filename) {
      console.error('[KYC UPLOAD] CRITICAL: Saved document missing url/filename:', savedDoc);
      return res.status(500).json({ message: 'Upload verification failed - document data corrupted' });
    }
    
    console.log('[KYC UPLOAD] Database verified:', savedDoc);

    // Step 7: EMIT SOCKET - Notify other clients
    console.log('[KYC UPLOAD] Step 7: Emitting socket event');
    const io = req.app.get('socketio');
    if (io) {
      io.emit('investor_update', { 
        action: 'KYC_UPLOAD', 
        investorId,
        docType,
        investor: verifyInvestor 
      });
      console.log('[KYC UPLOAD] Socket event emitted');
    } else {
      console.warn('[KYC UPLOAD] Socket.io not available');
    }

    // Log status change if applicable
    if (oldStatus !== investor.status) {
      await logStatusChange({ entityType: 'Investor', entityId: investor._id,
        oldStatus, newStatus: investor.status, user: req.user });
      
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
      user: req.user, newData: { docType, filename: req.file.filename }, req });

    console.log('[KYC UPLOAD] ========== UPLOAD FLOW COMPLETE ==========');
    
    res.json({ 
      success: true,
      message: `${docType} uploaded successfully`, 
      investor: verifyInvestor,
      document: savedDoc
    });
    
  } catch (err) { 
    console.error('[KYC UPLOAD] UNEXPECTED ERROR:', err);
    res.status(500).json({ message: err.message || 'Upload failed' }); 
  }
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

// POST /api/kyc/:investorId/cleanup - Remove orphaned document references
exports.cleanupOrphanedDocs = async (req, res) => {
  try {
    const { investorId } = req.params;
    const investor = await Investor.findById(investorId);
    if (!investor) return res.status(404).json({ message: 'Investor not found' });
    
    if (!investor.kycDocuments || Object.keys(investor.kycDocuments).length === 0) {
      return res.json({ message: 'No documents to cleanup', removed: [] });
    }
    
    const removed = [];
    const uploadBase = path.join(__dirname, '../uploads', investorId);
    
    for (const [docType, docInfo] of Object.entries(investor.kycDocuments)) {
      if (!docInfo || !docInfo.filename) continue;
      
      const filePath = path.join(uploadBase, docInfo.filename);
      if (!fs.existsSync(filePath)) {
        console.log('[KYC CLEANUP] Removing orphaned reference:', { investorId, docType, filename: docInfo.filename });
        delete investor.kycDocuments[docType];
        removed.push({ docType, filename: docInfo.filename });
      }
    }
    
    if (removed.length > 0) {
      investor.markModified('kycDocuments');
      await investor.save();
    }
    
    res.json({ 
      message: `Cleaned up ${removed.length} orphaned references`,
      removed,
      kycDocuments: investor.kycDocuments
    });
  } catch (err) {
    console.error('[KYC CLEANUP] Error:', err);
    res.status(500).json({ message: err.message });
  }
};

// GET /api/kyc/diagnostic - System health check for uploads
exports.getDiagnostic = async (req, res) => {
  try {
    const uploadsDir = path.join(__dirname, '../uploads');
    const diagnostic = {
      uploadsPath: uploadsDir,
      exists: fs.existsSync(uploadsDir),
      writable: false,
      diskSpace: null,
      stats: {
        totalDirectories: 0,
        totalFiles: 0,
        orphanedDocs: 0,
        corruptedDocs: 0
      },
      recentUploads: [],
      errors: []
    };
    
    // Check if writable
    try {
      const testFile = path.join(uploadsDir, '.write_test');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      diagnostic.writable = true;
    } catch (err) {
      diagnostic.errors.push(`Directory not writable: ${err.message}`);
    }
    
    // Scan all investor directories
    if (diagnostic.exists) {
      const entries = fs.readdirSync(uploadsDir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          diagnostic.stats.totalDirectories++;
          const investorDir = path.join(uploadsDir, entry.name);
          const files = fs.readdirSync(investorDir);
          diagnostic.stats.totalFiles += files.length;
          
          // Check for recent files (last 24 hours)
          files.forEach(file => {
            const filePath = path.join(investorDir, file);
            const stat = fs.statSync(filePath);
            const hoursAgo = (Date.now() - stat.mtime.getTime()) / (1000 * 60 * 60);
            if (hoursAgo < 24) {
              diagnostic.recentUploads.push({
                investorId: entry.name,
                filename: file,
                size: stat.size,
                modified: stat.mtime
              });
            }
          });
        }
      }
    }
    
    // Check database for orphaned references
    const investors = await Investor.find({ 
      $or: [
        { 'kycDocuments.aadhaar': { $exists: true } },
        { 'kycDocuments.pan': { $exists: true } },
        { 'kycDocuments.bank': { $exists: true } },
        { 'kycDocuments.photo': { $exists: true } }
      ]
    });
    
    for (const inv of investors) {
      if (!inv.kycDocuments) continue;
      
      for (const [docType, docInfo] of Object.entries(inv.kycDocuments)) {
        if (!docInfo) continue;
        
        // Check for corrupted (missing url/filename)
        if (!docInfo.url || !docInfo.filename) {
          diagnostic.stats.corruptedDocs++;
          continue;
        }
        
        // Check for orphaned (file not on disk)
        const filePath = path.join(uploadsDir, inv._id.toString(), docInfo.filename);
        if (!fs.existsSync(filePath)) {
          diagnostic.stats.orphanedDocs++;
        }
      }
    }
    
    res.json(diagnostic);
  } catch (err) {
    console.error('[KYC DIAGNOSTIC] Error:', err);
    res.status(500).json({ message: err.message });
  }
};
