const mongoose = require('mongoose');

// Validation regex patterns (must match frontend)
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[0-9]{10}$/;
const BANK_ACCOUNT_REGEX = /^\d{9,18}$/;

const investorSchema = new mongoose.Schema({
  folioNumber: { type: String, required: true, unique: true, uppercase: true, trim: true },
  fullName:    { type: String, required: true, trim: true, minlength: [2, 'Name must be at least 2 characters'], maxlength: [100, 'Name must not exceed 100 characters'] },
  panNumber:   { type: String, required: true, unique: true, uppercase: true, trim: true,
                 match: [PAN_REGEX, 'Invalid PAN format. Expected: ABCDE1234F'] },
  email:       { type: String, required: true, trim: true, lowercase: true,
                 match: [EMAIL_REGEX, 'Invalid email format'] },
  phone:       { type: String, required: true, trim: true,
                 match: [PHONE_REGEX, 'Phone must be exactly 10 digits'] },
  bankAccount: { type: String, required: true, trim: true,
                 match: [BANK_ACCOUNT_REGEX, 'Bank Account must be 9-18 digits'] },
  ifscCode:    { type: String, required: true, uppercase: true, trim: true,
                 match: [IFSC_REGEX, 'Invalid IFSC format. Expected: ABCD0XXXXXX'] },
  city:        { type: String, required: true, trim: true, minlength: [1, 'City is required'], maxlength: [50, 'City must not exceed 50 characters'] },
  address:     { type: String, required: true, trim: true },

  // ── Workflow Status ─────────────────────────────────────
  // DRAFT → KYC_PENDING → UNDER_REVIEW → APPROVED / REJECTED
  status: {
    type: String,
    enum: ['DRAFT','KYC_PENDING','UNDER_REVIEW','APPROVED','REJECTED'],
    default: 'DRAFT'
  },
  rejectionReason: { type: String },

  // ── KYC ─────────────────────────────────────────────────
  kycStatus: {
    type: String,
    enum: ['NOT_STARTED','UPLOADED','SUBMITTED','APPROVED','REJECTED'],
    default: 'NOT_STARTED'
  },
  kycDocuments: {
    aadhaar: { url: String, filename: String, uploadedAt: Date, status: { type: String, default: 'PENDING' }, remark: String },
    pan:     { url: String, filename: String, uploadedAt: Date, status: { type: String, default: 'PENDING' }, remark: String },
    bank:    { url: String, filename: String, uploadedAt: Date, status: { type: String, default: 'PENDING' }, remark: String },
    photo:   { url: String, filename: String, uploadedAt: Date, status: { type: String, default: 'PENDING' }, remark: String }
  },
  kycRemark: { type: String },

  // ── Pending Update for Maker-Checker Flow ────────────────
  pendingUpdate: {
    oldData: { type: mongoose.Schema.Types.Mixed },
    newData: { type: mongoose.Schema.Types.Mixed },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    requestedAt: { type: Date },
    status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'] }
  },

  // ── Audit trail ─────────────────────────────────────────
  createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  submittedAt: { type: Date },
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedAt:  { type: Date },
  approvedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt:  { type: Date },
  rejectedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  rejectedAt:  { type: Date }
}, { timestamps: true });

investorSchema.index({ status: 1 });
investorSchema.index({ createdBy: 1 });
investorSchema.index({ panNumber: 1 }, { unique: true });
investorSchema.index({ email: 1 }, { unique: true, sparse: true }); // Unique but allow null/undefined during initial creation

module.exports = mongoose.model('Investor', investorSchema);
