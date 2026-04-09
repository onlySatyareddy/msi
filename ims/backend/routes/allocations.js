const express = require('express');
const router = express.Router();
const c = require('../controllers/allocationController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);
router.get('/', c.getAll);
router.get('/:id', c.getOne);
router.post('/', authorize('MAKER','ADMIN'), c.create);
router.post('/:id/approve', authorize('CHECKER','ADMIN'), c.approve);
router.post('/:id/reject',  authorize('CHECKER','ADMIN'), c.reject);
router.delete('/:id', authorize('ADMIN'), c.remove);

module.exports = router;
