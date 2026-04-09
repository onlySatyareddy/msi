const express = require('express');
const router = express.Router();
const c = require('../controllers/holdingController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

// Role-based access
router.post('/', authorize('MAKER', 'ADMIN'), c.create);
router.get('/', c.getAll);
router.get('/pending', authorize('CHECKER', 'ADMIN'), c.getPending);
router.post('/:id/approve', authorize('CHECKER', 'ADMIN'), c.approve);
router.post('/:id/reject', authorize('CHECKER', 'ADMIN'), c.reject);
router.delete('/:id', authorize('ADMIN'), c.remove);

// Existing routes (read-only)
router.get('/ledger', c.getLedger);
router.get('/transactions', c.getTransactionHistory);
router.get('/by-security/:securityId', c.getBySecurity);
router.get('/investor-summary/:investorId', c.getInvestorSummary);

module.exports = router;
