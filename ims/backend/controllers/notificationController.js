const Notification = require('../models/Notification');
const User = require('../models/User');

// Get notification statistics (monitoring endpoint)
exports.getNotificationStats = async (req, res) => {
  try {
    const total = await Notification.countDocuments();
    const delivered = await Notification.countDocuments({ status: 'DELIVERED' });
    const failed = await Notification.countDocuments({ status: 'FAILED' });
    const pending = await Notification.countDocuments({ status: 'PENDING' });
    const sent = await Notification.countDocuments({ status: 'SENT' });

    // Calculate success rate
    const totalProcessed = delivered + failed;
    const successRate = totalProcessed > 0 ? ((delivered / totalProcessed) * 100).toFixed(2) : 0;

    // Get stats by delivery mode
    const anyModeCount = await Notification.countDocuments({ deliveryMode: 'ANY' });
    const allModeCount = await Notification.countDocuments({ deliveryMode: 'ALL' });

    // Get stats by event type
    const statsByEvent = await Notification.aggregate([
      {
        $group: {
          _id: '$event',
          count: { $sum: 1 },
          delivered: { $sum: { $cond: [{ $eq: ['$status', 'DELIVERED'] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ['$status', 'FAILED'] }, 1, 0] } }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    // Get average delivery attempts
    const avgDeliveryAttempts = await Notification.aggregate([
      {
        $group: {
          _id: null,
          avgAttempts: { $avg: '$deliveryAttempts' }
        }
      }
    ]);

    const avgAttempts = avgDeliveryAttempts[0]?.avgAttempts?.toFixed(2) || 0;

    res.json({
      success: true,
      stats: {
        total,
        delivered,
        failed,
        pending,
        sent,
        successRate: `${successRate}%`,
        deliveryModes: {
          any: anyModeCount,
          all: allModeCount
        },
        byEvent: statsByEvent,
        avgDeliveryAttempts: avgAttempts
      },
      timestamp: new Date()
    });
  } catch (err) {
    console.error('Get notification stats error:', err);
    res.status(500).json({ message: err.message });
  }
};

// Get notifications for current user
exports.getNotifications = async (req, res) => {
  try {
    const userId = req.user._id;
    const userRole = req.user.role;
    
    // Find notifications where user is a recipient OR
    // user's role is in targetRoles OR
    // notification is broadcast
    const notifications = await Notification.find({
      $or: [
        { 'recipients.user': userId },
        { targetRoles: userRole },
        { targetUser: userId },
        { isBroadcast: true }
      ]
    })
    .sort({ createdAt: -1 })
    .limit(50)
    .populate('createdBy', 'name email role')
    .lean();

    // Mark as read status for this user
    const formattedNotifications = notifications.map(n => {
      const recipientEntry = n.recipients?.find(r => r.user?.toString() === userId.toString());
      return {
        ...n,
        isRead: recipientEntry ? recipientEntry.read : false,
        readAt: recipientEntry ? recipientEntry.readAt : null
      };
    });

    res.json({
      success: true,
      count: formattedNotifications.length,
      data: formattedNotifications
    });
  } catch (err) {
    console.error('Get notifications error:', err);
    res.status(500).json({ message: err.message });
  }
};

// Mark notification as read
exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const notification = await Notification.findById(id);
    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    // Update or add recipient entry
    const existingIndex = notification.recipients.findIndex(
      r => r.user?.toString() === userId.toString()
    );

    if (existingIndex >= 0) {
      notification.recipients[existingIndex].read = true;
      notification.recipients[existingIndex].readAt = new Date();
    } else {
      notification.recipients.push({
        user: userId,
        read: true,
        readAt: new Date()
      });
    }

    await notification.save();

    res.json({ success: true, message: 'Marked as read' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Mark all notifications as read
exports.markAllAsRead = async (req, res) => {
  try {
    const userId = req.user._id;

    // Find all unread notifications for this user
    const notifications = await Notification.find({
      $or: [
        { 'recipients.user': userId, 'recipients.read': false },
        { targetRoles: req.user.role }
      ]
    });

    // Update each notification
    for (const notification of notifications) {
      const existingIndex = notification.recipients.findIndex(
        r => r.user?.toString() === userId.toString()
      );

      if (existingIndex >= 0) {
        notification.recipients[existingIndex].read = true;
        notification.recipients[existingIndex].readAt = new Date();
      } else {
        notification.recipients.push({
          user: userId,
          read: true,
          readAt: new Date()
        });
      }

      await notification.save();
    }

    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Create notification (internal use)
exports.createNotification = async (data) => {
  try {
    const {
      title,
      message,
      type,
      entityId,
      entityType,
      createdBy,
      createdByName,
      targetRoles,
      targetUser,
      link,
      metadata,
      isBroadcast
    } = data;

    const notification = await Notification.create({
      title,
      message,
      type,
      entityId,
      entityType,
      createdBy,
      createdByName,
      targetRoles,
      targetUser,
      link,
      metadata,
      isBroadcast,
      recipients: []
    });

    return notification;
  } catch (err) {
    console.error('Create notification error:', err);
    return null;
  }
};

// Delete old notifications (cleanup job)
exports.deleteOldNotifications = async (days = 30) => {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    await Notification.deleteMany({
      createdAt: { $lt: cutoffDate }
    });

    console.log(`Deleted notifications older than ${days} days`);
  } catch (err) {
    console.error('Delete old notifications error:', err);
  }
};
