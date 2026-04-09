const express = require('express');
const router = express.Router();
const c = require('../controllers/investorController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);
router.get('/',           c.getAll);
router.get('/check-pan',  c.checkPanDuplicate);     // Real-time PAN duplicate check
router.get('/check-email', c.checkEmailDuplicate); // Real-time Email duplicate check
router.get('/check-folio', c.checkFolioFormat);     // Real-time Folio format validation
router.get('/folio-stats', c.getFolioStats);        // Folio generation statistics
router.get('/:id',        c.getOne);
router.post('/',          authorize('MAKER','ADMIN'), c.create);
router.put('/:id',        authorize('MAKER','ADMIN'), c.update);
router.delete('/:id',     authorize('ADMIN'), c.remove);
router.post('/:id/submit',authorize('MAKER','ADMIN'), c.submit);
router.post('/:id/approve', authorize('CHECKER','ADMIN'), c.approve);
router.post('/:id/reject',  authorize('CHECKER','ADMIN'), c.reject);

// Maker-Checker Edit Approval Flow
router.post('/:id/request-edit', authorize('MAKER','ADMIN'), c.requestEdit);
router.post('/:id/approve-edit',  authorize('CHECKER','ADMIN'), c.approveEdit);
router.post('/:id/reject-edit',   authorize('CHECKER','ADMIN'), c.rejectEdit);

module.exports = router;
