const express = require('express');
const router = express.Router();
const c = require('../controllers/dividendController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);
router.get('/dashboard-summary', c.getDashboardSummary);
router.get('/', c.getAll);
router.get('/distributions', c.getAllDistributions);
router.get('/:id', c.getOne);
router.get('/:id/report', c.getReport);
router.post('/', authorize('MAKER', 'ADMIN'), c.create);
router.post('/:id/submit', authorize('MAKER', 'ADMIN'), c.submit);
router.post('/:id/approve', authorize('CHECKER', 'ADMIN'), c.approve);
router.post('/:id/reject', authorize('CHECKER', 'ADMIN'), c.reject);
router.post('/:id/calculate', authorize('ADMIN'), c.calculate);
router.post('/:id/mark-paid', authorize('ADMIN'), c.markPaid);
router.delete('/:id', authorize('ADMIN'), c.remove);

module.exports = router;
