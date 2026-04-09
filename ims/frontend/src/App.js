import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import { SnackbarProvider } from 'notistack';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { NetworkProvider } from './contexts/NetworkContext';
import { SocketProvider } from './contexts/SocketContext';
import ErrorBoundary from './components/common/ErrorBoundary';
import ErrorPage from './pages/ErrorPage';
import Layout from './components/layout/Layout';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import InvestorsPage from './pages/InvestorsPage';
import InvestorDetailPage from './pages/InvestorDetailPage';
import KycPage from './pages/KycPage';
import SecuritiesPage from './pages/SecuritiesPage';
import AllocationsPage from './pages/AllocationsPage';
import AllocationDetailPage from './pages/AllocationDetailPage';
import HoldingsPage from './pages/HoldingsPage';
import TransfersPage from './pages/TransfersPage';
import AuditPage from './pages/AuditPage';
import UsersPage from './pages/UsersPage';
import ComplaintsPage from './pages/ComplaintsPage';
import ReportsPage from './pages/ReportsPage';
import SecurityDetailPage from './pages/SecurityDetailPage';
import DividendsPage from './pages/DividendsPage';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#1a3c6e', light: '#2d5fa8', dark: '#0f2444' },
    secondary: { main: '#e8a020', light: '#f0b84d', dark: '#c07010' },
    success: { main: '#2e7d32' },
    error: { main: '#c62828' },
    warning: { main: '#e65100' },
    background: { default: '#f0f2f5', paper: '#ffffff' },
    text: { primary: '#1a1a2e', secondary: '#546e7a' }
  },
  typography: {
    fontFamily: '"Outfit", sans-serif',
    h4: { fontWeight: 700 }, h5: { fontWeight: 600 }, h6: { fontWeight: 600 },
    subtitle1: { fontWeight: 500 }
  },
  shape: { borderRadius: 10 },
  components: {
    MuiButton: { styleOverrides: { root: { textTransform: 'none', fontWeight: 600, borderRadius: 8 } } },
    MuiCard: { styleOverrides: { root: { boxShadow: '0 2px 12px rgba(0,0,0,0.08)', borderRadius: 12 } } },
    MuiChip: { styleOverrides: { root: { fontWeight: 600, fontSize: '0.72rem' } } },
    MuiTableHead: { styleOverrides: { root: { '& .MuiTableCell-head': { fontWeight: 700, backgroundColor: '#1a3c6e', color: '#fff' } } } },
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } }
  }
});

const ProtectedRoute = ({ children, roles }) => {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
};

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <NetworkProvider>
          <SnackbarProvider maxSnack={4} anchorOrigin={{ vertical: 'top', horizontal: 'right' }}>
            <AuthProvider>
              <SocketProvider>
                <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                  <Routes>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/app" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
                      <Route index element={<DashboardPage />} />
                      <Route path="investors" element={<InvestorsPage />} />
                      <Route path="investors/:id" element={<InvestorDetailPage />} />
                      <Route path="kyc" element={<ProtectedRoute roles={['CHECKER','ADMIN']}><KycPage /></ProtectedRoute>} />
                      <Route path="securities" element={<SecuritiesPage />} />
                      <Route path="securities/:id" element={<SecurityDetailPage />} />
                      <Route path="allocations" element={<AllocationsPage />} />
                      <Route path="allocations/:id" element={<AllocationDetailPage />} />
                      <Route path="holdings" element={<HoldingsPage />} />
                      <Route path="transfers" element={<TransfersPage />} />
                      <Route path="complaints" element={<ComplaintsPage />} />
                      <Route path="reports" element={<ReportsPage />} />
                      <Route path="dividends" element={<DividendsPage />} />
                      <Route path="audit" element={<ProtectedRoute roles={['CHECKER','ADMIN']}><AuditPage /></ProtectedRoute>} />
                      <Route path="users" element={<ProtectedRoute roles={['ADMIN']}><UsersPage /></ProtectedRoute>} />
                    </Route>
                    {/* Error routes */}
                    <Route path="/error" element={<ErrorPage />} />
                    <Route path="*" element={<ErrorPage 
                      title="Page Not Found ❌" 
                      description="The page you're looking for doesn't exist."
                      showHome={true}
                      showRetry={false}
                    />} />
                  </Routes>
                </BrowserRouter>
              </SocketProvider>
            </AuthProvider>
          </SnackbarProvider>
        </NetworkProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
