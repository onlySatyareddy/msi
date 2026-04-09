const express = require('express');
const router = express.Router();
const c = require('../controllers/complaintController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.get('/', c.getAll);
router.get('/:id', c.getOne);
router.post('/', authorize('MAKER','ADMIN'), c.create);
router.post('/:id/resolve', authorize('CHECKER','ADMIN'), c.resolve);
router.post('/:id/close', authorize('ADMIN'), c.close);
router.post('/:id/comment', c.addComment);

module.exports = router;
