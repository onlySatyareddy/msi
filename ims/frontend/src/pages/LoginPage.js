import React, { useState } from 'react';
import { Box, Card, CardContent, Typography, TextField, Button, Alert, InputAdornment, IconButton, Chip, Tabs, Tab } from '@mui/material';
import { Visibility, VisibilityOff, AccountBalance, Email, Lock } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSnackbar } from 'notistack';
import api from '../utils/api';

const DEMO_ACCOUNTS = [
  { label: 'Admin',   email: 'admin@ims.com',   pass: 'Admin@123',   color: 'error' },
  { label: 'Checker', email: 'checker@ims.com', pass: 'Checker@123', color: 'warning' },
  { label: 'Maker',   email: 'maker@ims.com',   pass: 'Maker@123',   color: 'primary' },
];

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [otp, setOtp] = useState('');
  const [loginMethod, setLoginMethod] = useState(0);
  const [otpSent, setOtpSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, setUser } = useAuth();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();

  const handleLogin = async (e) => {
    e?.preventDefault();
    setError(''); setLoading(true);
    try {
      const payload = loginMethod === 0 
        ? { email, password }
        : { email, otp };
      const endpoint = loginMethod === 0 ? '/auth/login' : '/auth/login-otp';
      const res = await api.post(endpoint, payload);
      const { token, user } = res.data;
      localStorage.setItem('ims_token', token);
      localStorage.setItem('ims_user', JSON.stringify(user));
      setUser(user); // Update AuthContext state
      enqueueSnackbar(`Welcome, ${user.name}!`, { variant: 'success' });
      navigate('/app');
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed');
    } finally { setLoading(false); }
  };

  const sendOtp = async () => {
    if (!email) {
      setError('Please enter email first');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/send-otp', { email });
      setOtpSent(true);
      enqueueSnackbar('OTP sent to your email!', { variant: 'success' });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send OTP');
    } finally { setLoading(false); }
  };

  const fillDemo = (acc) => { 
    setEmail(acc.email); 
    setPassword(acc.pass); 
    setOtp('');
    setError(''); 
    setLoginMethod(0);
    setOtpSent(false);
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #0f2444 0%, #1a3c6e 50%, #2d5fa8 100%)' }}>
      <Box sx={{ width: '100%', maxWidth: 440, px: 2 }}>
        <Box sx={{ textAlign: 'center', mb: 4 }}>
          <Box sx={{ width: 64, height: 64, borderRadius: 3, bgcolor: '#e8a020',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', mb: 2 }}>
            <AccountBalance sx={{ color: '#1a3c6e', fontSize: 34 }} />
          </Box>
          <Typography variant="h4" color="white" fontWeight={800}>Capifide Tech</Typography>
          <Typography color="rgba(255,255,255,0.6)" fontSize={14}>Investor Management System</Typography>
        </Box>

        <Card elevation={0} sx={{ borderRadius: 3, overflow: 'visible' }}>
          <CardContent sx={{ p: 4 }}>
            <Typography variant="h6" mb={2} fontWeight={700}>Sign In</Typography>

            {/* Login Method Tabs */}
            <Tabs 
              value={loginMethod} 
              onChange={(e, v) => setLoginMethod(v)}
              sx={{ mb: 3, '& .MuiTabs-flexContainer': { justifyContent: 'center' } }}
            >
              <Tab label="Password" icon={<Lock fontSize="small" />} iconPosition="start" />
              <Tab label="Email OTP" icon={<Email fontSize="small" />} iconPosition="start" />
            </Tabs>

            {/* Demo quick-fill */}
            <Box sx={{ display: 'flex', gap: 1, mb: 3, flexWrap: 'wrap', justifyContent: 'center' }}>
              {DEMO_ACCOUNTS.map(acc => (
                <Chip key={acc.label} label={`Demo ${acc.label}`} color={acc.color} variant="outlined"
                  size="small" onClick={() => fillDemo(acc)} sx={{ cursor: 'pointer', fontSize: '0.7rem' }} />
              ))}
            </Box>

            <form onSubmit={handleLogin}>
              <TextField 
                fullWidth 
                label="Email" 
                type="email" 
                value={email}
                onChange={e => setEmail(e.target.value)} 
                sx={{ mb: 2 }} 
                size="small" 
                required 
              />
              
              {loginMethod === 0 ? (
                <TextField 
                  fullWidth 
                  label="Password" 
                  type={showPw ? 'text' : 'password'}
                  value={password} 
                  onChange={e => setPassword(e.target.value)} 
                  sx={{ mb: 2 }} 
                  size="small" 
                  required
                  InputProps={{ endAdornment: (
                    <InputAdornment position="end">
                      <IconButton onClick={() => setShowPw(v => !v)} size="small">
                        {showPw ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  )}} 
                />
              ) : (
                <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                  <TextField 
                    fullWidth 
                    label="OTP" 
                    type="text"
                    value={otp} 
                    onChange={e => setOtp(e.target.value)} 
                    size="small" 
                    required
                    placeholder={otpSent ? "Enter OTP" : "Click Send OTP"}
                  />
                  <Button 
                    variant="outlined" 
                    size="small"
                    onClick={sendOtp}
                    disabled={loading || !email}
                    sx={{ minWidth: 100 }}
                  >
                    {otpSent ? 'Resend' : 'Send OTP'}
                  </Button>
                </Box>
              )}
              
              {error && <Alert severity="error" sx={{ mb: 2, py: 0.5 }}>{error}</Alert>}
              
              <Button 
                fullWidth 
                variant="contained" 
                type="submit" 
                size="large"
                disabled={loading} 
                sx={{ py: 1.3, bgcolor: '#1a3c6e', '&:hover': { bgcolor: '#0f2444' } }}
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Typography textAlign="center" color="rgba(255,255,255,0.4)" fontSize={12} mt={3}>
          © 2024 Capifide Tech. All rights reserved.
        </Typography>
      </Box>
    </Box>
  );
}
