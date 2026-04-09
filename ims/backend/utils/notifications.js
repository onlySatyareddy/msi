// Notification utility for Socket.io with persistent notifications
let io = null;
const Notification = require('../models/Notification');

// Event to Type Mapping (STRICT - No hardcoded types)
const EVENT_TYPE_MAP = {
  INVESTOR_CREATED: 'INVESTOR',
  INVESTOR_EDITED: 'INVESTOR',
  KYC_SUBMITTED: 'INVESTOR',
  KYC_APPROVED: 'INVESTOR',
  KYC_REJECTED: 'INVESTOR',

  SECURITIES_CREATED: 'SECURITY',
  SECURITIES_APPROVED: 'SECURITY',
  SECURITIES_REJECTED: 'SECURITY',
  DIVIDEND_DECLARED: 'SECURITY',

  ALLOCATION_DONE: 'SYSTEM',
  ALLOCATION_APPROVED: 'SYSTEM',
  ALLOCATION_REJECTED: 'SYSTEM',

  SHARE_TRANSFER: 'TRANSFER',
  TRANSFER_SUBMITTED: 'TRANSFER',
  TRANSFER_APPROVED: 'TRANSFER',
  TRANSFER_REJECTED: 'TRANSFER',
  COMPLAINT_RAISED: 'COMPLAINT'
};

const initNotifications = (socketIo) => {
  io = socketIo;

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Join room based on user role and ID
    socket.on('join', (data) => {
      if (data.userId) socket.join(`user_${data.userId}`);
      if (data.role) socket.join(`role_${data.role}`);

      // Trigger missed notification recovery on reconnect
      retryFailedNotifications().catch(err => {
        console.error('Failed to retry notifications on reconnect:', err);
      });
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });
};

// Create and emit notification with persistence
const emitNotification = async (event, data, targets) => {
  if (!io) return;

  // Get type from event using EVENT_TYPE_MAP
  const type = EVENT_TYPE_MAP[event];

  if (!type) {
    throw new Error(`Invalid event: ${event}. Event must be one of: ${Object.keys(EVENT_TYPE_MAP).join(', ')}`);
  }

  const deliveryMode = data.deliveryMode || 'ANY';

  // Auto-generate link if not provided
  let link = data.link;
  if (!link && data.entityId && data.entityType) {
    const entityTypeLower = data.entityType.toLowerCase();
    const entityUrl = entityTypeLower === 'security' ? 'securities' : `${entityTypeLower}s`;
    link = `/app/${entityUrl}/${data.entityId}`;
  }

  const notificationData = {
    title: data.title || event,
    message: data.message,
    type: type,
    event: event,
    status: 'PENDING',
    deliveryMode: deliveryMode,
    deliveryAttempts: 0,
    entityId: data.entityId,
    entityType: data.entityType,
    createdBy: data.createdBy || null,
    createdByName: data.createdByName || 'System',
    targetRoles: targets.filter(t => typeof t === 'string' && ['MAKER', 'CHECKER', 'ADMIN'].includes(t)),
    targetUser: targets.find(t => typeof t !== 'string'),
    link: link,
    metadata: data.metadata
  };

  // Save to database
  const notification = await Notification.create(notificationData);

  console.log(`[NOTIFICATION] Created ${notification._id} | Event: ${event} | Mode: ${deliveryMode} | Targets: ${targets.length}`);

  const responseData = {
    _id: notification._id,
    ...notificationData,
    createdAt: notification.createdAt,
    read: false,
    timestamp: notification.createdAt.toISOString()
  };

  // Update status to SENT before emitting
  await Notification.findByIdAndUpdate(notification._id, {
    status: 'SENT',
    deliveryAttempts: 1,
    lastDeliveryAttempt: new Date()
  });

  console.log(`[NOTIFICATION] Sent ${notification._id} | Attempt: 1 | Mode: ${deliveryMode}`);

  // Track ACK responses per user (not global)
  const ackReceivedByUser = new Map(); // Track which users have ACKed

  // Emit to targets with ACK callback that includes userId
  targets.forEach(target => {
    if (typeof target === 'string' && ['MAKER', 'CHECKER', 'ADMIN'].includes(target)) {
      // It's a role - emit to all users in that role
      io.to(`role_${target}`).emit('new_notification', responseData, (ack, userId) => {
        if (ack === 'RECEIVED' && userId) {
          // Add user to deliveredTo array if not already there
          Notification.findByIdAndUpdate(
            notification._id,
            {
              $addToSet: { deliveredTo: { userId, deliveredAt: new Date() } }
            }
          ).catch(err => {
            console.error(`[NOTIFICATION] Failed to record delivery for user ${userId}:`, err);
          });
          ackReceivedByUser.set(userId.toString(), true);
          console.log(`[NOTIFICATION] ACK received from user ${userId} for ${notification._id}`);
        }
      });
    } else {
      // It's a user ID
      io.to(`user_${target}`).emit('new_notification', responseData, (ack, userId) => {
        if (ack === 'RECEIVED' && userId && userId.toString() === target.toString()) {
          // Add user to deliveredTo array if not already there
          Notification.findByIdAndUpdate(
            notification._id,
            {
              $addToSet: { deliveredTo: { userId, deliveredAt: new Date() } }
            }
          ).catch(err => {
            console.error(`[NOTIFICATION] Failed to record delivery for user ${userId}:`, err);
          });
          ackReceivedByUser.set(userId.toString(), true);
          console.log(`[NOTIFICATION] ACK received from user ${userId} for ${notification._id}`);
        }
      });
    }
  });

  // Also emit to admins with ACK callback
  io.to('role_ADMIN').emit('new_notification', responseData, (ack, userId) => {
    if (ack === 'RECEIVED' && userId) {
      // Add user to deliveredTo array if not already there
      Notification.findByIdAndUpdate(
        notification._id,
        {
          $addToSet: { deliveredTo: { userId, deliveredAt: new Date() } }
        }
      ).catch(err => {
        console.error(`[NOTIFICATION] Failed to record delivery for admin user ${userId}:`, err);
      });
      ackReceivedByUser.set(userId.toString(), true);
      console.log(`[NOTIFICATION] ACK received from admin user ${userId} for ${notification._id}`);
    }
  });

  // Check delivery status after 5 seconds (timeout)
  setTimeout(async () => {
    const updatedNotification = await Notification.findById(notification._id);
    if (!updatedNotification) return;

    const deliveredCount = updatedNotification.deliveredTo.length;
    const targetCount = targets.length;

    console.log(`[NOTIFICATION] Delivery check ${notification._id} | Delivered: ${deliveredCount}/${targetCount} | Mode: ${deliveryMode}`);

    if (deliveryMode === 'ANY') {
      // ANY mode: delivered if at least one user ACKs
      if (deliveredCount > 0) {
        await Notification.findByIdAndUpdate(notification._id, { status: 'DELIVERED' });
        console.log(`[NOTIFICATION] ${notification._id} marked as DELIVERED (ANY mode - ${deliveredCount} user ACKs)`);
      } else {
        await Notification.findByIdAndUpdate(notification._id, { status: 'FAILED' });
        console.log(`[NOTIFICATION] ${notification._id} marked as FAILED (ANY mode - no ACKs)`);
      }
    } else {
      // ALL mode: delivered only if all target users ACK
      if (deliveredCount >= targetCount && targetCount > 0) {
        await Notification.findByIdAndUpdate(notification._id, { status: 'DELIVERED' });
        console.log(`[NOTIFICATION] ${notification._id} marked as DELIVERED (ALL mode - ${deliveredCount}/${targetCount} user ACKs)`);
      } else {
        await Notification.findByIdAndUpdate(notification._id, { status: 'FAILED' });
        console.log(`[NOTIFICATION] ${notification._id} marked as FAILED (ALL mode - only ${deliveredCount}/${targetCount} user ACKs)`);
      }
    }
  }, 5000);

  return notification;
};

// Retry failed notifications
const retryFailedNotifications = async () => {
  if (!io) return;

  try {
    // Find notifications that are PENDING, SENT, or FAILED with deliveryAttempts < 3
    const failedNotifications = await Notification.find({
      status: { $in: ['PENDING', 'SENT', 'FAILED'] },
      deliveryAttempts: { $lt: 3 }
    }).limit(50);

    console.log(`[RETRY WORKER] Found ${failedNotifications.length} notifications to retry`);

    for (const notification of failedNotifications) {
      const newAttempts = notification.deliveryAttempts + 1;

      // Update status to SENT and increment attempts
      await Notification.findByIdAndUpdate(notification._id, {
        status: 'SENT',
        deliveryAttempts: newAttempts,
        lastDeliveryAttempt: new Date()
      });

      console.log(`[RETRY WORKER] Retrying ${notification._id} | Attempt: ${newAttempts} | Mode: ${notification.deliveryMode}`);

      const responseData = {
        _id: notification._id,
        title: notification.title,
        message: notification.message,
        type: notification.type,
        event: notification.event,
        deliveryMode: notification.deliveryMode,
        entityId: notification.entityId,
        entityType: notification.entityType,
        createdAt: notification.createdAt,
        read: false,
        timestamp: notification.createdAt.toISOString()
      };

      // Emit to targets based on notification configuration
      const targets = [];
      if (notification.targetRoles && notification.targetRoles.length > 0) {
        targets.push(...notification.targetRoles);
      }
      if (notification.targetUser) {
        targets.push(notification.targetUser);
      }

      // Emit with ACK callback that includes userId
      targets.forEach(target => {
        if (typeof target === 'string' && ['MAKER', 'CHECKER', 'ADMIN'].includes(target)) {
          // It's a role
          io.to(`role_${target}`).emit('new_notification', responseData, (ack, userId) => {
            if (ack === 'RECEIVED' && userId) {
              // Add user to deliveredTo array if not already there
              Notification.findByIdAndUpdate(
                notification._id,
                {
                  $addToSet: { deliveredTo: { userId, deliveredAt: new Date() } }
                }
              ).catch(err => {
                console.error(`[RETRY WORKER] Failed to record delivery for user ${userId}:`, err);
              });
              console.log(`[RETRY WORKER] ACK received from user ${userId} for ${notification._id}`);
            }
          });
        } else {
          // It's a user ID
          io.to(`user_${target}`).emit('new_notification', responseData, (ack, userId) => {
            if (ack === 'RECEIVED' && userId && userId.toString() === target.toString()) {
              // Add user to deliveredTo array if not already there
              Notification.findByIdAndUpdate(
                notification._id,
                {
                  $addToSet: { deliveredTo: { userId, deliveredAt: new Date() } }
                }
              ).catch(err => {
                console.error(`[RETRY WORKER] Failed to record delivery for user ${userId}:`, err);
              });
              console.log(`[RETRY WORKER] ACK received from user ${userId} for ${notification._id}`);
            }
          });
        }
      });

      // Check delivery status after 5 seconds (timeout)
      setTimeout(async () => {
        const updatedNotification = await Notification.findById(notification._id);
        if (!updatedNotification) return;

        const deliveredCount = updatedNotification.deliveredTo.length;
        const targetCount = targets.length;
        const deliveryMode = updatedNotification.deliveryMode || 'ANY';

        console.log(`[RETRY WORKER] Delivery check ${notification._id} | Delivered: ${deliveredCount}/${targetCount} | Mode: ${deliveryMode}`);

        if (deliveryMode === 'ANY') {
          // ANY mode: delivered if at least one user ACKs
          if (deliveredCount > 0) {
            await Notification.findByIdAndUpdate(notification._id, { status: 'DELIVERED' });
            console.log(`[RETRY WORKER] ${notification._id} marked as DELIVERED (ANY mode - ${deliveredCount} user ACKs after ${newAttempts} attempts)`);
          } else if (newAttempts >= 3) {
            await Notification.findByIdAndUpdate(notification._id, { status: 'FAILED' });
            console.log(`[RETRY WORKER] ${notification._id} marked as PERMANENTLY FAILED (ANY mode - no ACKs after ${newAttempts} attempts)`);
          }
        } else {
          // ALL mode: delivered only if all target users ACK
          if (deliveredCount >= targetCount && targetCount > 0) {
            await Notification.findByIdAndUpdate(notification._id, { status: 'DELIVERED' });
            console.log(`[RETRY WORKER] ${notification._id} marked as DELIVERED (ALL mode - ${deliveredCount}/${targetCount} user ACKs after ${newAttempts} attempts)`);
          } else if (newAttempts >= 3) {
            await Notification.findByIdAndUpdate(notification._id, { status: 'FAILED' });
            console.log(`[RETRY WORKER] ${notification._id} marked as PERMANENTLY FAILED (ALL mode - only ${deliveredCount}/${targetCount} user ACKs after ${newAttempts} attempts)`);
          }
        }
      }, 5000);
    }
  } catch (err) {
    console.error('[RETRY WORKER] Failed to retry notifications:', err);
  }
};

// Create role-based notifications with proper targeting
const createRoleBasedNotifications = async ({ req, event, message, entityType, entityId, skipUserId, targetRoles }) => {
  const targets = [];

  // Add role targets
  if (targetRoles && targetRoles.length > 0) {
    targets.push(...targetRoles);
  }

  // Always include ADMIN unless explicitly skipped
  if (!targetRoles || !targetRoles.includes('ADMIN')) {
    targets.push('ADMIN');
  }

  // Create notification data
  // Handle special case: Security -> securities (not securitys)
  const entityTypeLower = entityType.toLowerCase();
  const entityUrl = entityTypeLower === 'security' ? 'securities' : `${entityTypeLower}s`;

  const notificationData = {
    title: event,
    message: message,
    entityId: entityId,
    entityType: entityType,
    createdBy: req.user._id,
    createdByName: req.user.fullName || req.user.email,
    link: `/app/${entityUrl}/${entityId}`,
    metadata: { actionBy: req._id }
  };

  // Use emitNotification with event
  return await emitNotification(event, notificationData, targets);
};

// Create single user notification
const createNotification = async (data) => {
  if (!io) return;

  // Get type from event using EVENT_TYPE_MAP
  const type = EVENT_TYPE_MAP[data.event];

  if (!type) {
    throw new Error(`Invalid event: ${data.event}. Event must be one of: ${Object.keys(EVENT_TYPE_MAP).join(', ')}`);
  }

  // Auto-generate link if not provided
  let link = data.link;
  if (!link && data.entityId && data.entityType) {
    const entityTypeLower = data.entityType.toLowerCase();
    const entityUrl = entityTypeLower === 'security' ? 'securities' : `${entityTypeLower}s`;
    link = `/app/${entityUrl}/${data.entityId}`;
  }

  const notificationData = {
    title: data.event,
    message: data.message,
    type: type,
    event: data.event,
    entityId: data.entityId,
    entityType: data.entityType,
    createdBy: data.createdBy,
    createdByName: data.createdByName,
    targetUser: data.userId,
    link: link,
    metadata: data.metadata
  };

  // Save to database
  const notification = await Notification.create(notificationData);

  const responseData = {
    _id: notification._id,
    ...notificationData,
    createdAt: notification.createdAt,
    read: false,
    timestamp: notification.createdAt.toISOString()
  };

  // Emit to specific user
  if (data.userId) {
    io.to(`user_${data.userId}`).emit('new_notification', responseData);
  }

  return notification;
};

// Broadcast to all connected clients
const broadcast = (event, data) => {
  if (!io) return;
  io.emit(event, data);
};

module.exports = {
  initNotifications,
  emitNotification,
  createRoleBasedNotifications,
  createNotification,
  broadcast,
  EVENT_TYPE_MAP,
  retryFailedNotifications
};
