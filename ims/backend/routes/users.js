const express = require('express');
const router = express.Router();
const { getAll, create, updateStatus } = require('../controllers/userController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect, authorize('ADMIN'));
router.get('/', getAll);
router.post('/', create);
router.patch('/:id/status', updateStatus);

module.exports = router;
