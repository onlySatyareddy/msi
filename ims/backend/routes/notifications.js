const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { 
  getNotifications, 
  markAsRead, 
  markAllAsRead,
  getNotificationStats
} = require('../controllers/notificationController');

router.use(protect);

router.get('/', getNotifications);
router.get('/stats', getNotificationStats);
router.put('/:id/read', markAsRead);
router.put('/read-all', markAllAsRead);

module.exports = router;
