import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Box, Card, CardContent, Typography, Button, TextField, MenuItem,
  Table, TableBody, TableCell, TableHead, TableRow, Paper,
  IconButton, Tooltip, Chip, CircularProgress, InputAdornment, Dialog,
  DialogTitle, DialogContent, DialogActions, Grid, Alert, useMediaQuery, useTheme, TableContainer
} from '@mui/material';
import { Add, Search, Visibility, Edit, CheckCircle, Cancel, Send, Refresh, Delete } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import StatusChip from '../components/common/StatusChip';
import ConfirmDialog from '../components/common/ConfirmDialog';

const STATUS_OPTS = ['','DRAFT','KYC_PENDING','UNDER_REVIEW','APPROVED','REJECTED'];

const INIT_FORM = { fullName:'', panNumber:'', email:'', phone:'', bankAccount:'', ifscCode:'', city:'', address:'' };

// Validation regex patterns
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[0-9]{10}$/;
const BANK_ACCOUNT_REGEX = /^\d{9,18}$/;

// Strict PAN input filter - only allows valid chars at each position
const filterPanInput = (currentValue, newChar) => {
  const len = currentValue.length;
  const char = newChar.toUpperCase();

  // Position 1-5: Only letters A-Z
  if (len < 5) {
    if (/^[A-Z]$/.test(char)) return char;
    return ''; // Reject digits and others
  }
  // Position 6-9: Only digits 0-9
  if (len >= 5 && len < 9) {
    if (/^[0-9]$/.test(char)) return char;
    return ''; // Reject letters and others
  }
  // Position 10: Only letter A-Z
  if (len === 9) {
    if (/^[A-Z]$/.test(char)) return char;
    return ''; // Reject digits and others
  }
  return ''; // Max 10 chars reached
};

// Progressive format guide for PAN - shows what to type next
const getPanGuide = (value) => {
  if (!value) return 'Type: A B C D E (5 letters A-Z)';
  const len = value.length;
  if (len < 5) {
    const remaining = 5 - len;
    return `Continue: ${remaining} letter${remaining > 1 ? 's' : ''} (A-Z only)`;
  }
  if (len < 9) {
    const digitsDone = len - 5;
    const remaining = 4 - digitsDone;
    return `Now: ${remaining} digit${remaining > 1 ? 's' : ''} (0-9 only)`;
  }
  if (len === 9) return 'Last: 1 letter (A-Z only)';
  return '';
};

// Strict IFSC input filter - only allows valid chars at each position
const filterIfscInput = (currentValue, newChar) => {
  const len = currentValue.length;
  const char = newChar.toUpperCase();

  // Position 1-4: Only letters A-Z
  if (len < 4) {
    if (/^[A-Z]$/.test(char)) return char;
    return ''; // Reject digits and others
  }
  // Position 5: Only digit 0
  if (len === 4) {
    if (char === '0') return '0';
    return ''; // Must be 0, reject others
  }
  // Position 6-11: Letters A-Z or digits 0-9
  if (len >= 5 && len < 11) {
    if (/^[A-Z0-9]$/.test(char)) return char;
    return '';
  }
  return ''; // Max 11 chars reached
};

// Progressive format guide for IFSC - shows what to type next
const getIfscGuide = (value) => {
  if (!value) return 'Type: A B C D (4 letters A-Z)';
  const len = value.length;
  if (len < 4) {
    const remaining = 4 - len;
    return `Continue: ${remaining} letter${remaining > 1 ? 's' : ''} (A-Z only)`;
  }
  if (len === 4) return 'Now: Type 0 (zero only)';
  if (len < 11) {
    const remaining = 11 - len;
    return `Last: ${remaining} character${remaining > 1 ? 's' : ''} (A-Z or 0-9)`;
  }
  return '';
};

export default function InvestorsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const { socket } = useSocket();
  const [investors, setInvestors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(INIT_FORM);
  const [formErr, setFormErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [confirm, setConfirm] = useState(null); // { type, investorId, title, message }
  const [fieldStatus, setFieldStatus] = useState({}); // { field: { touched, valid, error, helperText } }
  const theme = useTheme();
  const fullScreenDialog = useMediaQuery(theme.breakpoints.down('sm')); 

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      const r = await api.get('/investors', { params });
      setInvestors(r.data.investors);
    } catch (err) {
      enqueueSnackbar('Failed to load investors', { variant: 'error' });
    } finally { setLoading(false); }
  }, [search, statusFilter]);

  useEffect(() => { load(); }, [load]);

  // Keep stable ref to load function for socket handlers
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; }, [load]);

  // Listen for real-time updates from socket events
  useEffect(() => {
    if (!socket) return;

    const handleHoldingsUpdate = () => {
      console.log('Holdings updated, refreshing investor table');
      loadRef.current();
    };

    const handleInvestorUpdate = () => {
      console.log('Investor updated, refreshing investor table');
      loadRef.current();
    };

    socket.on('holdings_update', handleHoldingsUpdate);
    socket.on('investor_update', handleInvestorUpdate);

    return () => {
      socket.off('holdings_update', handleHoldingsUpdate);
      socket.off('investor_update', handleInvestorUpdate);
    };
  }, [socket]); // Only re-run when socket changes, not when load changes

  // Validate individual field with visual feedback
  const validateField = (field, value) => {
    let error = '';
    let isValid = false;
    let helperText = '';

    switch (field) {
      case 'fullName':
        if (!value || value.trim().length === 0) {
          error = 'This field is required';
          helperText = 'Enter full name (letters, spaces, dots allowed)';
        } else if (!/^[A-Za-z\s.]+$/.test(value)) {
          error = 'Invalid characters in name';
          helperText = 'Only letters (A-Z, a-z), spaces, and dots allowed';
        } else if (value.trim().length < 2) {
          error = 'Full Name must be at least 2 characters';
          helperText = 'Too short';
        } else if (value.trim().length > 100) {
          error = 'Full Name must not exceed 100 characters';
          helperText = 'Too long';
        } else {
          isValid = true;
          helperText = 'Valid Name ✅';
        }
        break;
      case 'panNumber':
        if (!value || value.length === 0) {
          error = 'This field is required';
          helperText = getPanGuide('');
        } else if (!PAN_REGEX.test(value)) {
          error = 'Invalid PAN format';
          helperText = getPanGuide(value);
        } else {
          isValid = true;
          helperText = 'Valid PAN ✅';
        }
        break;
      case 'email':
        if (!value || value.length === 0) {
          error = 'This field is required';
          helperText = 'Enter valid email address';
        } else if (!EMAIL_REGEX.test(value)) {
          error = 'Invalid email format';
          helperText = 'e.g. user@example.com';
        } else {
          isValid = true;
          helperText = 'Valid Email ✅';
        }
        break;
      case 'phone':
        if (!value || value.length === 0) {
          error = 'This field is required';
          helperText = 'Enter 10-digit mobile number';
        } else if (!PHONE_REGEX.test(value)) {
          error = 'Phone must be exactly 10 digits';
          helperText = `${value.length}/10 digits - continue typing`;
        } else {
          isValid = true;
          helperText = 'Valid Phone ✅';
        }
        break;
      case 'bankAccount':
        if (!value || value.length === 0) {
          error = 'This field is required';
          helperText = 'Enter 9-18 digit account number';
        } else if (!BANK_ACCOUNT_REGEX.test(value)) {
          error = 'Bank Account must be 9-18 digits';
          helperText = `${value.length} digits typed (need 9-18)`;
        } else {
          isValid = true;
          helperText = 'Valid Account ✅';
        }
        break;
      case 'ifscCode':
        if (!value || value.length === 0) {
          error = 'This field is required';
          helperText = getIfscGuide('');
        } else if (!IFSC_REGEX.test(value)) {
          error = 'Invalid IFSC format';
          helperText = getIfscGuide(value);
        } else {
          isValid = true;
          helperText = 'Valid IFSC ✅';
        }
        break;
      case 'city':
        if (!value || value.trim().length === 0) {
          error = 'This field is required';
          helperText = 'Enter city name (letters and spaces only)';
        } else if (!/^[A-Za-z\s]+$/.test(value)) {
          error = 'Invalid characters in city';
          helperText = 'Only letters (A-Z, a-z) and spaces allowed';
        } else if (value.trim().length < 2) {
          error = 'City must be at least 2 characters';
          helperText = 'Too short';
        } else if (value.trim().length > 50) {
          error = 'City must not exceed 50 characters';
          helperText = 'Too long';
        } else {
          isValid = true;
          helperText = 'Valid City ✅';
        }
        break;
      case 'address':
        if (!value || value.trim().length === 0) {
          error = 'This field is required';
          helperText = 'Enter full address (letters, numbers, comma, dot, dash)';
        } else if (!/^[A-Za-z0-9\s,.-]+$/.test(value)) {
          error = 'Invalid characters in address';
          helperText = 'Only letters, numbers, spaces, comma, dot, dash allowed';
        } else if (value.trim().length < 10) {
          error = 'Address must be at least 10 characters';
          helperText = `${value.length}/10 characters - need more`;
        } else if (value.trim().length > 200) {
          error = 'Address must not exceed 200 characters';
          helperText = 'Too long (max 200)';
        } else {
          isValid = true;
          helperText = 'Valid Address ✅';
        }
        break;
      default:
        helperText = '';
    }

    return { error, isValid, helperText };
  };

  // Check if entire form is valid
  const isFormValid = () => {
    const fields = ['fullName', 'panNumber', 'email', 'phone', 'bankAccount', 'ifscCode', 'city', 'address'];
    for (const field of fields) {
      const { isValid } = validateField(field, form[field]);
      if (!isValid) return false;
    }
    return true;
  };

  // Handle field change with strict input filtering
  const handleFieldChange = (key, value) => {
    let processedValue = value;

    // Full Name - letters, spaces, and dots only
    if (key === 'fullName') {
      processedValue = value.replace(/[^a-zA-Z\s.]/g, ''); // Only letters, spaces, dots
    }
    // City - letters and spaces only
    else if (key === 'city') {
      processedValue = value.replace(/[^a-zA-Z\s]/g, ''); // Only letters and spaces
    }
    // Address - letters, numbers, spaces, comma, dot, dash
    else if (key === 'address') {
      processedValue = value.replace(/[^A-Za-z0-9\s,.-]/g, '').slice(0, 200); // Allow specified chars, max 200
    }
    // Strict filtering for PAN - only allow valid chars at each position
    else if (key === 'panNumber') {
      let filtered = '';
      for (let i = 0; i < value.length; i++) {
        const char = filterPanInput(filtered, value[i]);
        if (char) filtered += char; // Only add if valid
      }
      processedValue = filtered;
    }
    // Strict filtering for IFSC - only allow valid chars at each position
    else if (key === 'ifscCode') {
      let filtered = '';
      for (let i = 0; i < value.length; i++) {
        const char = filterIfscInput(filtered, value[i]);
        if (char) filtered += char; // Only add if valid
      }
      processedValue = filtered;
    }
    // Numeric only for phone and bank account
    else if (key === 'phone' || key === 'bankAccount') {
      processedValue = value.replace(/\D/g, '');
    }

    // Update form value
    setForm(v => ({ ...v, [key]: processedValue }));

    // Validate and update field status
    const { error, isValid, helperText } = validateField(key, processedValue);
    setFieldStatus(prev => ({
      ...prev,
      [key]: {
        touched: true,
        valid: isValid,
        error,
        helperText
      }
    }));
  };

  const handleCreate = async () => {
    setFormErr('');

    // Frontend validation
    if (!isFormValid()) {
      setFormErr('Please fix all validation errors before submitting');
      return;
    }

    setSaving(true);
    try {
      await api.post('/investors', form);
      enqueueSnackbar('Investor created as DRAFT', { variant: 'success' });
      setCreateOpen(false); setForm(INIT_FORM); load();
    } catch (err) {
      const status = err.response?.status;
      const msg = err.response?.data?.message || 'Creation failed';
      if (status === 400) setFormErr(`Validation Error: ${msg}`);
      else if (status === 409) setFormErr(`Duplicate: ${msg}`);
      else setFormErr(msg);
    } finally { setSaving(false); }
  };

  const handleAction = async (type, id, reason) => {
    if (actionLoading) return;
    setActionLoading(true);
    try {
      if (type === 'approve') await api.post(`/investors/${id}/approve`);
      else if (type === 'reject') await api.post(`/investors/${id}/reject`, { reason });
      else if (type === 'submit') await api.post(`/investors/${id}/submit`);
      else if (type === 'delete') await api.delete(`/investors/${id}`);
      enqueueSnackbar(`Action successful`, { variant: 'success' });
      setConfirm(null);
    } catch (err) {
      enqueueSnackbar(err.response?.data?.message || 'Action failed', { variant: 'error' });
    } finally {
      setConfirm(null);
      setActionLoading(false);
      load(); // ALWAYS reload data, even on error
    }
  };

  const isMaker = user?.role === 'MAKER';
  const isChecker = user?.role === 'CHECKER';
  const isAdmin = user?.role === 'ADMIN';

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: { xs: 2, sm: 3 }, gap: 2, flexDirection: { xs: 'column', sm: 'row' } }}>
        <Typography variant="h5" fontWeight={700} color="#1a3c6e" sx={{ flex: 1 }}>Investors</Typography>
        {(isMaker || isAdmin) && (
          <Button variant="contained" startIcon={<Add />} onClick={() => { setCreateOpen(true); setFieldStatus({}); }}
            sx={{ bgcolor: '#1a3c6e', fontSize: { xs: 11, sm: 12 }, flex: { xs: 1, sm: 'auto' }, minWidth: 120, maxWidth: 180 }}>Investor</Button>
        )}
      </Box>

      {/* Filters */}
      <Card sx={{ mb: { xs: 1, sm: 2 } }}>
        <CardContent sx={{ py: { xs: 1, sm: 1.5 }, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
          <TextField size="small" placeholder="Search name, PAN, folio..." value={search}
            onChange={e => setSearch(e.target.value)} sx={{ minWidth: { xs: 180, sm: 240 }, flex: 1 }}
            InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }} />
          <TextField select size="small" label="Status" value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)} sx={{ minWidth: { xs: 120, sm: 160 }, flex: 1 }}>
            {STATUS_OPTS.map(s => <MenuItem key={s} value={s}>{s || 'All Statuses'}</MenuItem>)}
          </TextField>
          <IconButton onClick={load} size="small"><Refresh /></IconButton>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: { xs: 800, md: 1000 } }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontSize: { xs: 11, sm: 12 } }}>Folio</TableCell>
                <TableCell sx={{ fontSize: { xs: 11, sm: 12 } }}>Name</TableCell>
                <TableCell sx={{ fontSize: { xs: 11, sm: 12 } }}>PAN</TableCell>
                <TableCell sx={{ fontSize: { xs: 11, sm: 12 } }}>Status</TableCell>
                <TableCell sx={{ fontSize: { xs: 11, sm: 12 } }}>KYC</TableCell>
                <TableCell align="right" sx={{ fontSize: { xs: 11, sm: 12 } }}>Shares</TableCell>
                <TableCell sx={{ fontSize: { xs: 11, sm: 12 } }}>Created By</TableCell>
                <TableCell sx={{ fontSize: { xs: 11, sm: 12 } }}>Created At</TableCell>
                <TableCell align="center" sx={{ fontSize: { xs: 11, sm: 12 } }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={9} align="center" sx={{ py: 4 }}><CircularProgress size={28} /></TableCell></TableRow>
              )}
              {!loading && investors.length === 0 && (
                <TableRow><TableCell colSpan={9} align="center" sx={{ py: 4, color: 'text.secondary' }}>No investors found</TableCell></TableRow>
              )}
              {!loading && investors.map(inv => (
                <TableRow key={inv._id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/app/investors/${inv._id}`)}>
                  <TableCell><Chip label={inv.folioNumber} size="small" variant="outlined" sx={{ fontFamily: 'monospace', fontSize: 11 }} /></TableCell>
                  <TableCell><Typography fontWeight={600} fontSize={13}>{inv.fullName}</Typography></TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{inv.panNumber}</TableCell>
                  <TableCell><StatusChip status={inv.status} /></TableCell>
                  <TableCell><StatusChip status={inv.kycStatus} /></TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, color: '#2e7d32' }}>{inv.shares || 0}</TableCell>
                  <TableCell>
                    <Typography fontSize={12}>{inv.createdBy?.name}</Typography>
                    <Chip label={inv.createdBy?.role} size="small" sx={{ fontSize: '0.6rem', height: 16 }} />
                  </TableCell>
                  <TableCell sx={{ fontSize: 12, color: 'text.secondary' }}>{new Date(inv.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell align="center" onClick={e => e.stopPropagation()}>
                    <Tooltip title="View Details">
                      <IconButton size="small" onClick={() => navigate(`/app/investors/${inv._id}`)}><Visibility fontSize="small" /></IconButton>
                    </Tooltip>
                    {/* PERMANENT EDIT for Maker/Admin */}
                    {(isMaker || isAdmin) && (
                      <Tooltip title="Edit">
                        <IconButton size="small" onClick={() => navigate(`/app/investors/${inv._id}`)}><Edit fontSize="small" /></IconButton>
                      </Tooltip>
                    )}
                    {((isMaker && inv.createdBy?._id === user?._id) || isAdmin) && inv.status === 'KYC_PENDING' && (
                      <Tooltip title="Submit for Review">
                        <IconButton size="small" color="primary"
                          onClick={() => setConfirm({ type:'submit', id: inv._id, title: 'Submit for Review', message: `Submit "${inv.fullName}" for checker review?`, severity:'info' })}>
                          <Send fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                    {(isChecker || isAdmin) && inv.status === 'UNDER_REVIEW' && (
                      <>
                        <Tooltip title="Approve">
                          <IconButton size="small" color="success"
                            onClick={() => setConfirm({ type:'approve', id: inv._id, title: 'Approve Investor', message: `Approve "${inv.fullName}"?`, severity:'success' })}>
                            <CheckCircle fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Reject">
                          <IconButton size="small" color="error"
                            onClick={() => setConfirm({ type:'reject', id: inv._id, title: 'Reject Investor', message: `Reject "${inv.fullName}"?`, severity:'error', requireReason: true })}>
                            <Cancel fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </>
                    )}
                    {/* ADMIN DELETE */}
                    {isAdmin && (inv.status === 'DRAFT' || inv.status === 'PENDING' || inv.status === 'REJECTED') && (
                      <Tooltip title="Delete">
                        <IconButton size="small" color="error"
                          onClick={() => setConfirm({ type:'delete', id: inv._id, title: 'Delete Investor', message: `Are you sure you want to delete "${inv.fullName}"? This action cannot be undone.`, severity:'error', requireReason: false })}>
                          <Delete fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      {/* Create Dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth fullScreen={fullScreenDialog}>
        <DialogTitle fontWeight={700}>Create New Investor</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          {formErr && <Alert severity="error" sx={{ mb: 2 }}>{formErr}</Alert>}
          <Grid container spacing={2}>
            {[
              { label: 'Full Name *', key: 'fullName', xs: 12 },
              { label: 'PAN Number *', key: 'panNumber', xs: 6, placeholder: 'ABCDE1234F', inputProps: { maxLength: 10 } },
              { label: 'Email *', key: 'email', xs: 6, type: 'email' },
              { label: 'Phone *', key: 'phone', xs: 6, placeholder: '9876543210', inputProps: { maxLength: 10, inputMode: 'numeric' } },
              { label: 'Bank Account *', key: 'bankAccount', xs: 6, placeholder: '9-18 digits', inputProps: { maxLength: 18, inputMode: 'numeric' } },
              { label: 'IFSC Code *', key: 'ifscCode', xs: 6, placeholder: 'ABCD0XXXXXX', inputProps: { maxLength: 11 } },
              { label: 'City *', key: 'city', xs: 6, placeholder: 'e.g. Indore, Mumbai, Delhi' },
              { label: 'Address *', key: 'address', xs: 12, multiline: true, rows: 2 },
            ].map(f => {
              const status = fieldStatus[f.key];
              const isError = status?.touched && !status?.valid && status?.error;
              const isSuccess = status?.touched && status?.valid;
              return (
                <Grid item xs={f.xs} key={f.key}>
                  <TextField
                    fullWidth
                    size="small"
                    label={f.label}
                    value={f.value || form[f.key]}
                    onChange={e => handleFieldChange(f.key, e.target.value)}
                    placeholder={f.placeholder}
                    multiline={f.multiline}
                    rows={f.rows}
                    type={f.type || 'text'}
                    disabled={f.disabled}
                    inputProps={f.inputProps}
                    error={!!isError}
                    helperText={status?.helperText || (f.placeholder || '')}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        '&.Mui-error fieldset': {
                          borderColor: '#d32f2f',
                          borderWidth: '2px'
                        },
                        '&.Mui-focused.Mui-error fieldset': {
                          borderColor: '#d32f2f',
                          borderWidth: '2px'
                        }
                      },
                      '& .MuiFormHelperText-root': {
                        color: isSuccess ? '#2e7d32' : (isError ? '#d32f2f' : 'text.secondary'),
                        fontWeight: isSuccess || isError ? 500 : 400,
                        marginLeft: '0px'
                      }
                    }}
                  />
                </Grid>
              );
            })}
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => { setCreateOpen(false); setFormErr(''); setForm(INIT_FORM); setFieldStatus({}); }}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate} disabled={saving || !isFormValid()} sx={{ bgcolor: '#1a3c6e' }}>
            {saving ? 'Creating...' : 'Create Draft'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Confirm Dialog */}
      {confirm && (
        <ConfirmDialog open={true} title={confirm.title} message={confirm.message}
          severity={confirm.severity} requireReason={confirm.requireReason}
          onConfirm={reason => handleAction(confirm.type, confirm.id, reason)}
          onCancel={() => setConfirm(null)} />
      )}
    </Box>
  );
}
