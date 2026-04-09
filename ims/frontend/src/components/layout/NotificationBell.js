import React, { useEffect, useState, useCallback } from 'react';
import {
  IconButton, Badge, Menu, Typography, Box, Divider,
  List, ListItem, ListItemText, ListItemIcon, Tooltip, Chip, CircularProgress,
  Tabs, Tab, Button
} from '@mui/material';
import {
  Notifications, NotificationsNone,
  Security, SwapHoriz, Report, Person, Settings,
  CheckCircle, Cancel, Add, Edit, Warning
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import { io } from 'socket.io-client';
import api from '../../utils/api';
import { useNavigate } from 'react-router-dom';

// Notification Route Map - maps events to their destination routes
export const NOTIFICATION_ROUTE_MAP = {
  // Investor
  INVESTOR_CREATED: (n) => `/app/investors/${n.entityId}`,
  INVESTOR_EDITED: (n) => `/app/investors/${n.entityId}`,
  KYC_SUBMITTED: (n) => `/app/investors/${n.entityId}`,
  KYC_APPROVED: (n) => `/app/investors/${n.entityId}`,
  KYC_REJECTED: (n) => `/app/investors/${n.entityId}`,
  INVESTOR_EDIT_APPROVED: (n) => `/app/investors/${n.entityId}`,
  INVESTOR_EDIT_REJECTED: (n) => `/app/investors/${n.entityId}`,

  // Security (correct plural)
  SECURITIES_CREATED: (n) => `/app/securities/${n.entityId}`,
  SECURITIES_APPROVED: (n) => `/app/securities/${n.entityId}`,
  SECURITIES_REJECTED: (n) => `/app/securities/${n.entityId}`,
  DIVIDEND_DECLARED: (n) => `/app/dividends`,

  // Allocation (use list page to avoid 404 from invalid/deleted entityIds)
  ALLOCATION_DONE: (n) => `/app/allocations`,
  ALLOCATION_APPROVED: (n) => `/app/allocations`,
  ALLOCATION_REJECTED: (n) => `/app/allocations`,

  // Transfer (navigate to list page since detail page doesn't exist)
  SHARE_TRANSFER: (n) => `/app/transfers`,
  TRANSFER_SUBMITTED: (n) => `/app/transfers`,
  TRANSFER_APPROVED: (n) => `/app/transfers`,
  TRANSFER_REJECTED: (n) => `/app/transfers`,

  // Complaint (navigate to list page since detail page doesn't exist)
  COMPLAINT_RAISED: (n) => `/app/complaints`,
  COMPLAINT_RESOLVED: (n) => `/app/complaints`
};

// Event configuration for smart UI
const EVENT_CONFIG = {
  // Investor events
  INVESTOR_CREATED: {
    icon: <Person />,
    color: '#2196F3',
    bgColor: 'rgba(33, 150, 243, 0.1)',
    label: 'Investor Created',
    type: 'INVESTOR'
  },
  INVESTOR_EDITED: {
    icon: <Edit />,
    color: '#FF9800',
    bgColor: 'rgba(255, 152, 0, 0.1)',
    label: 'Investor Edited',
    type: 'INVESTOR'
  },
  INVESTOR_EDIT_APPROVED: {
    icon: <CheckCircle />,
    color: '#4CAF50',
    bgColor: 'rgba(76, 175, 80, 0.1)',
    label: 'Investor Edit Approved',
    type: 'INVESTOR'
  },
  INVESTOR_EDIT_REJECTED: {
    icon: <Cancel />,
    color: '#F44336',
    bgColor: 'rgba(244, 67, 54, 0.1)',
    label: 'Investor Edit Rejected',
    type: 'INVESTOR'
  },
  KYC_SUBMITTED: {
    icon: <Person />,
    color: '#9C27B0',
    bgColor: 'rgba(156, 39, 176, 0.1)',
    label: 'KYC Submitted',
    type: 'INVESTOR'
  },
  KYC_APPROVED: {
    icon: <CheckCircle />,
    color: '#4CAF50',
    bgColor: 'rgba(76, 175, 80, 0.1)',
    label: 'KYC Approved',
    type: 'INVESTOR'
  },
  KYC_REJECTED: {
    icon: <Cancel />,
    color: '#F44336',
    bgColor: 'rgba(244, 67, 54, 0.1)',
    label: 'KYC Rejected',
    type: 'INVESTOR'
  },
  // Security events
  SECURITIES_CREATED: {
    icon: <Add />,
    color: '#2196F3',
    bgColor: 'rgba(33, 150, 243, 0.1)',
    label: 'Security Created',
    type: 'SECURITY'
  },
  SECURITIES_APPROVED: {
    icon: <CheckCircle />,
    color: '#4CAF50',
    bgColor: 'rgba(76, 175, 80, 0.1)',
    label: 'Security Approved',
    type: 'SECURITY'
  },
  SECURITIES_REJECTED: {
    icon: <Cancel />,
    color: '#F44336',
    bgColor: 'rgba(244, 67, 54, 0.1)',
    label: 'Security Rejected',
    type: 'SECURITY'
  },
  DIVIDEND_DECLARED: {
    icon: <Security />,
    color: '#FFC107',
    bgColor: 'rgba(255, 193, 7, 0.1)',
    label: 'Dividend Declared',
    type: 'SECURITY'
  },
  // Allocation events
  ALLOCATION_DONE: {
    icon: <Add />,
    color: '#2196F3',
    bgColor: 'rgba(33, 150, 243, 0.1)',
    label: 'Allocation Done',
    type: 'SYSTEM'
  },
  ALLOCATION_APPROVED: {
    icon: <CheckCircle />,
    color: '#4CAF50',
    bgColor: 'rgba(76, 175, 80, 0.1)',
    label: 'Allocation Approved',
    type: 'SYSTEM'
  },
  ALLOCATION_REJECTED: {
    icon: <Cancel />,
    color: '#F44336',
    bgColor: 'rgba(244, 67, 54, 0.1)',
    label: 'Allocation Rejected',
    type: 'SYSTEM'
  },
  // Transfer events
  SHARE_TRANSFER: {
    icon: <SwapHoriz />,
    color: '#00BCD4',
    bgColor: 'rgba(0, 188, 212, 0.1)',
    label: 'Share Transfer',
    type: 'TRANSFER'
  },
  TRANSFER_SUBMITTED: {
    icon: <SwapHoriz />,
    color: '#00BCD4',
    bgColor: 'rgba(0, 188, 212, 0.1)',
    label: 'Transfer Submitted',
    type: 'TRANSFER'
  },
  TRANSFER_APPROVED: {
    icon: <CheckCircle />,
    color: '#4CAF50',
    bgColor: 'rgba(76, 175, 80, 0.1)',
    label: 'Transfer Approved',
    type: 'TRANSFER'
  },
  TRANSFER_REJECTED: {
    icon: <Cancel />,
    color: '#F44336',
    bgColor: 'rgba(244, 67, 54, 0.1)',
    label: 'Transfer Rejected',
    type: 'TRANSFER'
  },
  // Complaint events
  COMPLAINT_RAISED: {
    icon: <Report />,
    color: '#F44336',
    bgColor: 'rgba(244, 67, 54, 0.1)',
    label: 'Complaint Raised',
    type: 'COMPLAINT'
  },
  COMPLAINT_RESOLVED: {
    icon: <CheckCircle />,
    color: '#4CAF50',
    bgColor: 'rgba(76, 175, 80, 0.1)',
    label: 'Complaint Resolved',
    type: 'COMPLAINT'
  }
};

// Type filter labels
const TYPE_FILTERS = {
  ALL: { label: 'All', color: '#1a3c6e' },
  INVESTOR: { label: 'Investor', color: '#2196F3' },
  SECURITY: { label: 'Security', color: '#9C27B0' },
  TRANSFER: { label: 'Transfer', color: '#00BCD4' },
  COMPLAINT: { label: 'Complaint', color: '#F44336' },
  SYSTEM: { label: 'System', color: '#FF9800' }
};

// Time ago formatter
const timeAgo = (date) => {
  const seconds = Math.floor((new Date() - new Date(date)) / 1000);
  let interval = seconds / 31536000;
  if (interval > 1) return Math.floor(interval) + " years ago";
  interval = seconds / 2592000;
  if (interval > 1) return Math.floor(interval) + " months ago";
  interval = seconds / 86400;
  if (interval > 1) return Math.floor(interval) + " days ago";
  interval = seconds / 3600;
  if (interval > 1) return Math.floor(interval) + " hours ago";
  interval = seconds / 60;
  if (interval > 1) return Math.floor(interval) + " min ago";
  return "Just now";
};

export default function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [anchorEl, setAnchorEl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [socket, setSocket] = useState(null);
  const [filterType, setFilterType] = useState('ALL');

  // Duplicate prevention with Set-based tracking
  const receivedIdsRef = React.useRef(new Set());

  // Add notification with duplicate prevention
  const addNotificationWithDuplicateCheck = (newNotification) => {
    setNotifications(prev => {
      // Check if notification already exists in state
      if (prev.find(n => n._id === newNotification._id)) {
        return prev;
      }

      // Check if notification ID was already received (prevents duplicates across reconnects)
      if (receivedIdsRef.current.has(newNotification._id)) {
        return prev;
      }

      // Add to received IDs set
      receivedIdsRef.current.add(newNotification._id);

      // Limit the set size to prevent memory leaks (keep last 1000 IDs)
      if (receivedIdsRef.current.size > 1000) {
        const idsArray = Array.from(receivedIdsRef.current);
        receivedIdsRef.current = new Set(idsArray.slice(-500));
      }

      return [newNotification, ...prev].slice(0, 50);
    });
  };

  // Fetch notifications from API
  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      const res = await api.get('/notifications');
      if (res.data.success) {
        setNotifications(res.data.data);
        setUnreadCount(res.data.data.filter(n => !n.isRead).length);
      }
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Initial load
  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Socket.io connection for real-time updates
  useEffect(() => {
    if (!user) return;

    const socketUrl = process.env.REACT_APP_SOCKET_URL ||
                     (process.env.REACT_APP_API_URL?.replace('/api', '') || 'http://localhost:5002');

    const newSocket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000
    });

    newSocket.on('connect', () => {
      console.log('Notification socket connected');
      // Join rooms based on user role and ID
      newSocket.emit('join', { userId: user._id, role: user.role });
    });

    // Listen for new notifications with event-based handling and ACK
    newSocket.on('new_notification', (data, callback) => {
      console.log('New notification received:', data.message || data.event || 'Notification');

      // Send ACK callback with userId to confirm delivery
      if (callback) {
        callback('RECEIVED', user._id);
      }

      const eventConfig = EVENT_CONFIG[data.event] || EVENT_CONFIG[data.type] || {
        icon: <Notifications />,
        color: '#1a3c6e',
        bgColor: 'rgba(26, 60, 110, 0.1)',
        label: 'Notification'
      };

      const enhancedNotification = {
        ...data,
        _eventConfig: eventConfig
      };

      // Add notification with duplicate prevention
      addNotificationWithDuplicateCheck(enhancedNotification);
      setUnreadCount(prev => prev + 1);

      // Optional: Show toast notification for important events
      if (data.event === 'KYC_APPROVED' || data.event === 'SECURITIES_APPROVED' ||
          data.event === 'COMPLAINT_RAISED' || data.event === 'KYC_REJECTED') {
        // Could integrate with toast library here
        console.log('Important notification:', data.event);
      }
    });

    newSocket.on('connect_error', (err) => {
      console.log('Socket connection error:', err.message);
      // Fallback to polling on socket error
      setTimeout(() => fetchNotifications(), 5000);
    });

    newSocket.on('disconnect', () => {
      console.log('Notification socket disconnected');
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [user, fetchNotifications]);

  // Polling fallback every 30 seconds
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      fetchNotifications();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications, user]);

  const handleOpen = (event) => {
    setAnchorEl(event.currentTarget);
    // Refresh notifications when opening
    fetchNotifications();
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const markAsRead = async (id) => {
    try {
      await api.put(`/notifications/${id}/read`);
      setNotifications(prev => prev.map(n => 
        n._id === id ? { ...n, isRead: true } : n
      ));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to mark as read:', err);
    }
  };

  const markAllAsRead = async () => {
    try {
      await api.put('/notifications/read-all');
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  };

  const handleNotificationClick = (notification) => {
    markAsRead(notification._id);
    handleClose();

    const event = notification.event || notification.type;
    const entityType = notification.entityType;

    // Use NOTIFICATION_ROUTE_MAP if event exists in map
    if (event && NOTIFICATION_ROUTE_MAP[event]) {
      const route = NOTIFICATION_ROUTE_MAP[event](notification);
      navigate(route);
      return;
    }

    // Fallback: Use notification.link if available
    if (notification.link) {
      const link = notification.link.startsWith('/app') ? notification.link : `/app${notification.link}`;
      navigate(link);
      return;
    }

    // Fallback: Navigate based on entityType if entityId exists
    if (notification.entityId && notification.entityType) {
      const entityTypeLower = notification.entityType.toLowerCase();
      const detailPage = entityTypeLower === 'security' ? 'securities' : `${entityTypeLower}s`;
      
      // For certain entity types, prefer list page over detail page if detail might not exist
      if (entityTypeLower === 'transfer' || entityTypeLower === 'complaint' || entityTypeLower === 'dividend') {
        navigate(`/app/${detailPage}`);
      } else {
        navigate(`/app/${detailPage}/${notification.entityId}`);
      }
      return;
    }

    // Fallback: Navigate to list page based on entityType
    if (entityType) {
      const entityTypeLower = entityType.toLowerCase();
      const listPage = entityTypeLower === 'security' ? 'securities' : `${entityTypeLower}s`;
      navigate(`/app/${listPage}`);
      return;
    }

    // Default to dashboard
    navigate('/app');
  };

  // Filter notifications by type
  const filteredNotifications = notifications.filter(n => {
    if (filterType === 'ALL') return true;
    const notificationType = n.type || n._eventConfig?.type;
    return notificationType === filterType;
  });

  return (
    <>
      <Tooltip title="Notifications">
        <IconButton onClick={handleOpen} size="small" sx={{ color: '#1a3c6e' }}>
          <Badge badgeContent={unreadCount} color="error">
            {unreadCount > 0 ? <Notifications /> : <NotificationsNone />}
          </Badge>
        </IconButton>
      </Tooltip>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleClose}
        PaperProps={{ sx: { width: 450, maxHeight: 600, borderRadius: 2 } }}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
      >
        <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', bgcolor: '#f5f5f5' }}>
          <Typography fontWeight={700} fontSize={16}>Notifications</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {loading && <CircularProgress size={16} />}
            {unreadCount > 0 && (
              <Chip
                label={`${unreadCount} unread`}
                size="small"
                color="error"
                onClick={markAllAsRead}
                sx={{ cursor: 'pointer', fontWeight: 600 }}
              />
            )}
          </Box>
        </Box>
        <Divider />

        {/* Filter Tabs */}
        <Box sx={{ px: 1, pt: 1, bgcolor: '#fafafa' }}>
          <Tabs
            value={filterType}
            onChange={(e, newValue) => setFilterType(newValue)}
            variant="scrollable"
            scrollButtons="auto"
            sx={{
              minHeight: 36,
              '& .MuiTab-root': {
                minHeight: 36,
                py: 0.5,
                px: 1,
                fontSize: 12,
                fontWeight: 600,
                textTransform: 'none'
              }
            }}
          >
            {Object.keys(TYPE_FILTERS).map(type => (
              <Tab
                key={type}
                label={TYPE_FILTERS[type].label}
                value={type}
                sx={{
                  color: TYPE_FILTERS[type].color,
                  '&.Mui-selected': { color: TYPE_FILTERS[type].color }
                }}
              />
            ))}
          </Tabs>
        </Box>
        <Divider />

        <List sx={{ p: 0, maxHeight: 400, overflow: 'auto' }}>
          {filteredNotifications.length === 0 ? (
            <ListItem sx={{ py: 4 }}>
              <ListItemText
                primary={<Typography align="center" color="text.secondary">No notifications</Typography>}
                secondary={<Typography align="center" color="text.secondary" fontSize={12}>You'll see notifications here when there's activity</Typography>}
              />
            </ListItem>
          ) : (
            filteredNotifications.map((n) => {
              const eventConfig = n._eventConfig || EVENT_CONFIG[n.event] || EVENT_CONFIG[n.type] || {
                icon: <Notifications />,
                color: '#1a3c6e',
                bgColor: 'rgba(26, 60, 110, 0.1)',
                label: 'Notification'
              };

              return (
                <ListItem
                  key={n._id}
                  sx={{
                    bgcolor: n.isRead ? 'transparent' : eventConfig.bgColor,
                    borderLeft: n.isRead ? 'none' : `3px solid ${eventConfig.color}`,
                    py: 1.5,
                    px: 2,
                    cursor: 'pointer',
                    '&:hover': { bgcolor: n.isRead ? 'rgba(26,60,110,0.05)' : eventConfig.bgColor.replace('0.1', '0.15)') }
                  }}
                  onClick={() => handleNotificationClick(n)}
                >
                  <ListItemIcon sx={{ minWidth: 40 }}>
                    <Box sx={{ color: eventConfig.color }}>
                      {eventConfig.icon}
                    </Box>
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                        <Typography fontWeight={n.isRead ? 400 : 600} fontSize={14}>
                          {n.message}
                        </Typography>
                        {!n.isRead && (
                          <Chip
                            label="New"
                            size="small"
                            sx={{
                              height: 18,
                              fontSize: 10,
                              fontWeight: 600,
                              bgcolor: eventConfig.color,
                              color: 'white'
                            }}
                          />
                        )}
                      </Box>
                    }
                    secondary={
                      <Box component="span" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Typography component="span" fontSize={12} color="text.secondary">
                          {eventConfig.label} • {timeAgo(n.createdAt)}
                        </Typography>
                      </Box>
                    }
                  />
                </ListItem>
              );
            })
          )}
        </List>

        {notifications.length > 0 && (
          <>
            <Divider />
            <Box sx={{ p: 1.5, textAlign: 'center' }}>
              <Typography fontSize={12} color="text.secondary" sx={{ cursor: 'pointer' }} onClick={handleClose}>
                View all notifications
              </Typography>
            </Box>
          </>
        )}
      </Menu>
    </>
  );
}
