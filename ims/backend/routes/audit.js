const express = require('express');
const router = express.Router();
const c = require('../controllers/auditController');
const { protect, authorize } = require('../middleware/auth');

router.get('/logs', protect, authorize('CHECKER','ADMIN'), c.getLogs);
router.get('/history', protect, authorize('MAKER','CHECKER','ADMIN'), c.getStatusHistory);

// ============================================================================
// AUDIT VALIDATION & RECONCILIATION ROUTES
// ============================================================================

router.get('/validate', protect, authorize('ADMIN','CHECKER'), c.runValidation);

module.exports = router;
