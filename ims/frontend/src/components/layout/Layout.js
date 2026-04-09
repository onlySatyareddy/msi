import React, { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Box, Drawer, AppBar, Toolbar, Typography, IconButton, List, ListItem,
  ListItemButton, ListItemIcon, ListItemText, Avatar, Chip, Divider,
  Tooltip, Badge, useMediaQuery, useTheme
} from '@mui/material';
import {
  Dashboard, People, VerifiedUser, Security, AccountBalance,
  SwapHoriz, History, AdminPanelSettings, MenuOpen, Menu as MenuIcon,
  Logout, Assignment, Folder, Report, Payments
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import NotificationBell from './NotificationBell';

const DRAWER_W = 240;
const MINI_W = 64;

const NAV = [
  { label: 'Dashboard',   path: '/app',            icon: <Dashboard />,          roles: ['MAKER','CHECKER','ADMIN'] },
  { label: 'Investor Folio Management', path: '/app/investors', icon: <People />, roles: ['MAKER','CHECKER','ADMIN'] },
  { label: 'KYC',         path: '/app/kyc',         icon: <VerifiedUser />,       roles: ['CHECKER','ADMIN'] },
  { label: 'Securities & ISIN', path: '/app/securities', icon: <Security />, roles: ['MAKER','CHECKER','ADMIN'] },
  { label: 'Allocations', path: '/app/allocations', icon: <Assignment />,         roles: ['MAKER','CHECKER','ADMIN'] },
  { label: 'Holdings',    path: '/app/holdings',    icon: <AccountBalance />,     roles: ['MAKER','CHECKER','ADMIN'] },
  { label: 'Transfers',   path: '/app/transfers',   icon: <SwapHoriz />,          roles: ['MAKER','CHECKER','ADMIN'] },
  { label: 'Complaints',  path: '/app/complaints',  icon: <Report />,             roles: ['MAKER','CHECKER','ADMIN'] },
  { label: 'Reports',     path: '/app/reports',     icon: <Folder />,             roles: ['MAKER','CHECKER','ADMIN'] },
  { label: 'Corporate Action', path: '/app/dividends', icon: <Payments />, roles: ['MAKER','CHECKER','ADMIN'] },
  { label: 'Audit Logs',  path: '/app/audit',       icon: <History />,            roles: ['CHECKER','ADMIN'] },
  { label: 'Users',       path: '/app/users',       icon: <AdminPanelSettings />, roles: ['ADMIN'] },
];

const ROLE_COLORS = { ADMIN: 'error', CHECKER: 'warning', MAKER: 'primary' };

export default function Layout() {
  const [open, setOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const filtered = NAV.filter(n => n.roles.includes(user?.role));

  // Sync drawer state with screen size
  React.useEffect(() => {
    if (isMobile) {
      setOpen(false);
    } else {
      setOpen(true);
    }
  }, [isMobile]);

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const drawerContent = (
    <>
      {/* Logo */}
      <Box sx={{ display: 'flex', alignItems: 'center', p: 2, minHeight: 64, gap: 1.5 }}>
        <Box sx={{ width: 36, height: 36, borderRadius: 2, bgcolor: '#e8a020',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          fontWeight: 800, fontSize: 18, color: '#1a3c6e' }}>I</Box>
        <Typography fontWeight={800} fontSize={16} noWrap color="#fff">InvestorMS</Typography>
      </Box>
      <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)', mb: 1 }} />

      <List dense sx={{ px: 0.5, flexGrow: 1 }}>
        {filtered.map(item => {
          const active = location.pathname === item.path ||
            (item.path !== '/' && location.pathname.startsWith(item.path));
          return (
            <ListItem key={item.path} disablePadding sx={{ mb: 0.5 }}>
              <Tooltip title={item.label} placement="right">
                <ListItemButton onClick={() => { navigate(item.path); setMobileOpen(false); }} sx={{
                  borderRadius: 2, mx: 0.5, py: 1,
                  bgcolor: active ? 'rgba(232,160,32,0.2)' : 'transparent',
                  borderLeft: active ? '3px solid #e8a020' : '3px solid transparent',
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' }
                }}>
                  <ListItemIcon sx={{ color: active ? '#e8a020' : 'rgba(255,255,255,0.7)', minWidth: 40 }}>
                    {item.icon}
                  </ListItemIcon>
                  <ListItemText primary={item.label} primaryTypographyProps={{ fontSize: 13.5, fontWeight: active ? 700 : 500, color: active ? '#fff' : 'rgba(255,255,255,0.8)' }} />
                </ListItemButton>
              </Tooltip>
            </ListItem>
          );
        })}
      </List>

      <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />
      <Box sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Avatar sx={{ width: 34, height: 34, bgcolor: '#e8a020', fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
          {user?.name?.charAt(0).toUpperCase()}
        </Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography fontSize={12.5} fontWeight={600} color="#fff" noWrap>{user?.name}</Typography>
          <Chip label={user?.role} size="small" color={ROLE_COLORS[user?.role] || 'default'}
            sx={{ height: 18, fontSize: '0.65rem', mt: 0.3 }} />
        </Box>
        <Tooltip title="Logout"><IconButton size="small" onClick={logout} sx={{ color: 'rgba(255,255,255,0.6)' }}>
          <Logout fontSize="small" />
        </IconButton></Tooltip>
      </Box>
    </>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      {/* Mobile drawer - temporary */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={handleDrawerToggle}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': { boxSizing: 'border-box', width: DRAWER_W, bgcolor: '#1a3c6e', color: '#fff' }
        }}
      >
        {drawerContent}
      </Drawer>

      {/* Desktop drawer - permanent */}
      <Drawer variant="permanent" sx={{
        display: { xs: 'none', md: 'block' },
        width: open ? DRAWER_W : MINI_W, flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: open ? DRAWER_W : MINI_W,
          transition: 'width 0.25s ease',
          overflow: 'hidden',
          bgcolor: '#1a3c6e',
          color: '#fff',
          borderRight: 'none',
          boxShadow: '4px 0 20px rgba(0,0,0,0.15)'
        }
      }}>
        {/* Desktop drawer content */}
        <Box sx={{ display: 'flex', alignItems: 'center', p: open ? 2 : 1, minHeight: 64, gap: 1.5 }}>
          <Box sx={{ width: 36, height: 36, borderRadius: 2, bgcolor: '#e8a020',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            fontWeight: 800, fontSize: 18, color: '#1a3c6e' }}>I</Box>
          {open && <Typography fontWeight={800} fontSize={16} noWrap color="#fff">Capifide Tech</Typography>}
        </Box>
        <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)', mb: 1 }} />

        <List dense sx={{ px: 0.5, flexGrow: 1 }}>
          {filtered.map(item => {
            const active = location.pathname === item.path ||
              (item.path !== '/' && location.pathname.startsWith(item.path));
            return (
              <ListItem key={item.path} disablePadding sx={{ mb: 0.5 }}>
                <Tooltip title={!open ? item.label : ''} placement="right">
                  <ListItemButton onClick={() => navigate(item.path)} sx={{
                    borderRadius: 2, mx: 0.5, py: 1,
                    bgcolor: active ? 'rgba(232,160,32,0.2)' : 'transparent',
                    borderLeft: active ? '3px solid #e8a020' : '3px solid transparent',
                    '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' }
                  }}>
                    <ListItemIcon sx={{ color: active ? '#e8a020' : 'rgba(255,255,255,0.7)', minWidth: 40 }}>
                      {item.icon}
                    </ListItemIcon>
                    {open && <ListItemText primary={item.label} primaryTypographyProps={{ fontSize: 13.5, fontWeight: active ? 700 : 500, color: active ? '#fff' : 'rgba(255,255,255,0.8)' }} />}
                  </ListItemButton>
                </Tooltip>
              </ListItem>
            );
          })}
        </List>

        <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />
        <Box sx={{ p: open ? 1.5 : 1, display: 'flex', alignItems: 'center', gap: 1.5, justifyContent: open ? 'flex-start' : 'center' }}>
          <Tooltip title={open ? '' : `${user?.name} (${user?.role})`} placement="right">
            <Avatar sx={{ width: 34, height: 34, bgcolor: '#e8a020', fontSize: 14, fontWeight: 700, flexShrink: 0, cursor: 'pointer' }}>
              {user?.name?.charAt(0).toUpperCase()}
            </Avatar>
          </Tooltip>
          {open && (
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography fontSize={12.5} fontWeight={600} color="#fff" noWrap>{user?.name}</Typography>
              <Chip label={user?.role} size="small" color={ROLE_COLORS[user?.role] || 'default'}
                sx={{ height: 18, fontSize: '0.65rem', mt: 0.3 }} />
            </Box>
          )}
          {!open && (
            <Tooltip title="Logout">
              <IconButton size="small" onClick={logout} sx={{ color: 'rgba(255,255,255,0.6)' }}>
                <Logout fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {open && (
            <Tooltip title="Logout"><IconButton size="small" onClick={logout} sx={{ color: 'rgba(255,255,255,0.6)' }}>
              <Logout fontSize="small" />
            </IconButton></Tooltip>
          )}
        </Box>
      </Drawer>

      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <AppBar position="sticky" elevation={0} sx={{
          bgcolor: '#fff', borderBottom: '1px solid #e5e7eb',
          color: 'text.primary', zIndex: 1100
        }}>
          <Toolbar sx={{ gap: 2 }}>
            <IconButton 
              onClick={isMobile ? handleDrawerToggle : () => setOpen(o => !o)} 
              size="small"
              sx={{ display: { xs: 'flex', md: 'flex' } }}
            >
              {isMobile ? <MenuIcon /> : (open ? <MenuOpen /> : <MenuIcon />)}
            </IconButton>
            <Typography variant="h6" sx={{ flex: 1, color: '#1a3c6e', fontSize: { xs: '1rem', sm: '1.25rem' } }}>
              Capifide Tech - Investor Management
            </Typography>
            <NotificationBell />
            <Chip label={user?.role} color={ROLE_COLORS[user?.role] || 'default'} size="small" sx={{ display: { xs: 'none', sm: 'flex' } }} />
            <Tooltip title="Logout">
              <IconButton onClick={logout} size="small"><Logout fontSize="small" /></IconButton>
            </Tooltip>
          </Toolbar>
        </AppBar>
        <Box sx={{ flex: 1, overflow: 'auto', p: { xs: 2, sm: 3 } }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
