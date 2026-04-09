import React, { useEffect, useState, useCallback } from 'react';
import {
  Box, Card, CardContent, Typography, Grid, Button, TextField, Chip,
  Divider, Alert, CircularProgress, Stepper, Step, StepLabel, Table,
  TableBody, TableCell, TableHead, TableRow, IconButton, Tooltip, Paper,
  Tab, Tabs, Dialog, DialogTitle, DialogContent, DialogActions, InputAdornment
} from '@mui/material';
import { ArrowBack, Edit, Send, CheckCircle, Cancel, Upload, History, Save, Check, Clear } from '@mui/icons-material';
import { useParams, useNavigate } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import StatusChip from '../components/common/StatusChip';
import ConfirmDialog from '../components/common/ConfirmDialog';

const STEPS = ['DRAFT', 'KYC_PENDING', 'UNDER_REVIEW', 'APPROVED'];
const KYC_DOCS = [
  { key: 'aadhaar', label: 'Aadhaar Card' },
  { key: 'pan',     label: 'PAN Card' },
  { key: 'bank',    label: 'Bank Passbook' },
  { key: 'photo',   label: 'Photograph' },
];
const API_BASE = process.env.REACT_APP_API_URL?.replace('/api', '') || 'http://localhost:5001';

export default function InvestorDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();

  const [investor, setInvestor] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState(0);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [confirm, setConfirm] = useState(null);
  const [uploading, setUploading] = useState({});

  // Validation state
  const [fieldStatus, setFieldStatus] = useState({});
  const [validationErrors, setValidationErrors] = useState({});
  const [duplicateChecking, setDuplicateChecking] = useState({});

  // Validation helpers
  const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
  const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;

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
  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const PHONE_REGEX = /^[0-9]{10}$/;

  // Debounced duplicate check for PAN
  const checkDuplicatePan = useCallback(async (pan) => {
    if (!PAN_REGEX.test(pan)) return;
    setDuplicateChecking(prev => ({ ...prev, pan: true }));
    try {
      const response = await api.get(`/investors/check-pan?pan=${encodeURIComponent(pan)}&excludeId=${id}`);
      setFieldStatus(prev => ({ ...prev, pan: { exists: response.data.exists, message: response.data.message } }));
    } catch (err) {
      // Silent fail - backend validation will catch duplicates
    } finally {
      setDuplicateChecking(prev => ({ ...prev, pan: false }));
    }
  }, [id]);

  // Debounced duplicate check for Email
  const checkDuplicateEmail = useCallback(async (email) => {
    if (!EMAIL_REGEX.test(email)) return;
    setDuplicateChecking(prev => ({ ...prev, email: true }));
    try {
      const response = await api.get(`/investors/check-email?email=${encodeURIComponent(email)}&excludeId=${id}`);
      setFieldStatus(prev => ({ ...prev, email: { exists: response.data.exists, message: response.data.message } }));
    } catch (err) {
      // Silent fail - backend validation will catch duplicates
    } finally {
      setDuplicateChecking(prev => ({ ...prev, email: false }));
    }
  }, [id]);

  // Field validation
  const validateField = (name, value) => {
    let error = '';
    let isValid = true;
    let helperText = '';

    switch (name) {
      case 'fullName':
        if (!value || value.trim().length === 0) {
          error = 'This field is required';
          helperText = 'Enter full name (letters, spaces, dots allowed)';
          isValid = false;
        } else if (!/^[A-Za-z\s.]+$/.test(value)) {
          error = 'Invalid characters in name';
          helperText = 'Only letters (A-Z, a-z), spaces, and dots allowed';
          isValid = false;
        } else if (value.trim().length < 2) {
          error = 'Name must be at least 2 characters';
          helperText = 'Too short';
          isValid = false;
        } else if (value.trim().length > 100) {
          error = 'Name must not exceed 100 characters';
          helperText = 'Too long';
          isValid = false;
        } else {
          helperText = 'Valid Name ✅';
        }
        break;
      case 'panNumber':
        if (!value || value.length === 0) {
          error = 'This field is required';
          helperText = getPanGuide('');
          isValid = false;
        } else if (!PAN_REGEX.test(value)) {
          error = 'Invalid PAN format';
          helperText = getPanGuide(value);
          isValid = false;
        } else {
          helperText = 'Valid PAN ✅';
        }
        break;
      case 'email':
        if (!value || value.length === 0) {
          error = 'This field is required';
          helperText = 'Enter valid email address';
          isValid = false;
        } else if (!EMAIL_REGEX.test(value)) {
          error = 'Invalid email format';
          helperText = 'e.g. user@example.com';
          isValid = false;
        } else {
          helperText = 'Valid Email ✅';
        }
        break;
      case 'phone':
        if (!value || value.length === 0) {
          error = 'This field is required';
          helperText = 'Enter 10-digit mobile number';
          isValid = false;
        } else if (!PHONE_REGEX.test(value)) {
          error = 'Phone must be exactly 10 digits';
          helperText = `${value.length}/10 digits - continue typing`;
          isValid = false;
        } else {
          helperText = 'Valid Phone ✅';
        }
        break;
      case 'bankAccount':
        if (!value || value.length === 0) {
          error = 'This field is required';
          helperText = 'Enter 9-18 digit account number';
          isValid = false;
        } else if (!/^\d{9,18}$/.test(value)) {
          error = 'Account number must be 9-18 digits';
          helperText = `${value.length} digits typed (need 9-18)`;
          isValid = false;
        } else {
          helperText = 'Valid Account ✅';
        }
        break;
      case 'ifscCode':
        if (!value || value.length === 0) {
          error = 'This field is required';
          helperText = getIfscGuide('');
          isValid = false;
        } else if (!IFSC_REGEX.test(value)) {
          error = 'Invalid IFSC format';
          helperText = getIfscGuide(value);
          isValid = false;
        } else {
          helperText = 'Valid IFSC ✅';
        }
        break;
      case 'city':
        if (!value || value.trim().length === 0) {
          error = 'This field is required';
          helperText = 'Enter city name (letters and spaces only)';
          isValid = false;
        } else if (!/^[A-Za-z\s]+$/.test(value)) {
          error = 'Invalid characters in city';
          helperText = 'Only letters (A-Z, a-z) and spaces allowed';
          isValid = false;
        } else if (value.trim().length < 2) {
          error = 'City must be at least 2 characters';
          helperText = 'Too short';
          isValid = false;
        } else if (value.trim().length > 50) {
          error = 'City must not exceed 50 characters';
          helperText = 'Too long';
          isValid = false;
        } else {
          helperText = 'Valid City ✅';
        }
        break;
      case 'address':
        if (!value || value.trim().length === 0) {
          error = 'This field is required';
          helperText = 'Enter full address (letters, numbers, comma, dot, dash)';
          isValid = false;
        } else if (!/^[A-Za-z0-9\s,.-]+$/.test(value)) {
          error = 'Invalid characters in address';
          helperText = 'Only letters, numbers, spaces, comma, dot, dash allowed';
          isValid = false;
        } else if (value.trim().length < 10) {
          error = 'Address must be at least 10 characters';
          helperText = `${value.length}/10 characters - need more`;
          isValid = false;
        } else if (value.trim().length > 200) {
          error = 'Address must not exceed 200 characters';
          helperText = 'Too long (max 200)';
          isValid = false;
        } else {
          helperText = 'Valid Address ✅';
        }
        break;
      default:
        break;
    }

    return { error, isValid, helperText };
  };

  // Handle field change with strict input filtering
  const handleFieldChange = (field, value) => {
    let processedValue = value;

    // Full Name - letters and spaces only, no numbers
    if (field === 'fullName') {
      processedValue = value.replace(/[^a-zA-Z\s]/g, ''); // Only letters and spaces
    }
    // City - letters and spaces only, no numbers
    else if (field === 'city') {
      processedValue = value.replace(/[^a-zA-Z\s]/g, ''); // Only letters and spaces
    }
    // Address - letters, numbers, spaces, comma, dot, dash
    else if (field === 'address') {
      processedValue = value.replace(/[^A-Za-z0-9\s,.-]/g, '').slice(0, 200); // Allow specified chars, max 200
    }
    // Strict filtering for PAN - only allow valid chars at each position
    else if (field === 'panNumber') {
      let filtered = '';
      for (let i = 0; i < value.length; i++) {
        const char = filterPanInput(filtered, value[i]);
        if (char) filtered += char; // Only add if valid
      }
      processedValue = filtered;
    }
    // Strict filtering for IFSC - only allow valid chars at each position
    else if (field === 'ifscCode') {
      let filtered = '';
      for (let i = 0; i < value.length; i++) {
        const char = filterIfscInput(filtered, value[i]);
        if (char) filtered += char; // Only add if valid
      }
      processedValue = filtered;
    }
    // Numeric only for phone and bank account
    else if (field === 'phone' || field === 'bankAccount') {
      processedValue = value.replace(/\D/g, ''); // Remove non-digits
    }

    // Update form
    setEditForm(prev => ({ ...prev, [field]: processedValue }));

    // Validate field
    const { error, isValid, helperText } = validateField(field, processedValue);
    setValidationErrors(prev => ({ ...prev, [field]: error }));
    setFieldStatus(prev => ({ ...prev, [field]: { ...prev[field], valid: isValid, helperText, touched: true } }));

    // Trigger duplicate checks for PAN and Email
    if (field === 'panNumber' && PAN_REGEX.test(processedValue)) {
      const timeoutId = setTimeout(() => checkDuplicatePan(processedValue), 500);
      return () => clearTimeout(timeoutId);
    }
    if (field === 'email' && EMAIL_REGEX.test(processedValue)) {
      const timeoutId = setTimeout(() => checkDuplicateEmail(processedValue), 500);
      return () => clearTimeout(timeoutId);
    }
  };

  // Check if form is valid
  const isFormValid = () => {
    const requiredFields = ['fullName', 'panNumber', 'email', 'phone', 'bankAccount', 'ifscCode', 'city', 'address'];
    for (const field of requiredFields) {
      const { isValid } = validateField(field, editForm[field]);
      if (!isValid) return false;
      if (fieldStatus[field]?.exists) return false;
    }
    return true;
  };

  const load = async () => {
    try {
      const [invR, histR] = await Promise.all([
        api.get(`/investors/${id}`),
        api.get('/audit/history', { params: { entityType: 'Investor', entityId: id } })
          .catch(() => ({ data: { history: [] } }))
      ]);
      setInvestor(invR.data.investor);
      setHistory(histR.data.history);
      setError(null);
    } catch (err) {
      const status = err.response?.status;
      if (status === 404) {
        setError('Investor not found');
        enqueueSnackbar('Investor not found', { variant: 'error' });
        navigate('/app/investors');
      } else {
        setError('Failed to load investor details');
        enqueueSnackbar('Failed to load investor details', { variant: 'error' });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  // Listen for real-time updates from socket events
  useEffect(() => {
    const handleHoldingsUpdate = (event) => {
      console.log('Holdings updated, refreshing investor details:', event.detail);
      // Only reload if the update affects this investor
      if (event.detail?.fromInvestor === id || event.detail?.toInvestor === id) {
        load();
      }
    };

    const handleInvestorUpdate = (event) => {
      console.log('Investor updated, refreshing investor details:', event.detail);
      // Only reload if the update affects this investor
      if (event.detail?.investor?._id === id || event.detail?.investorId === id) {
        load();
      }
    };

    window.addEventListener('holdings_update', handleHoldingsUpdate);
    window.addEventListener('investor_update', handleInvestorUpdate);

    return () => {
      window.removeEventListener('holdings_update', handleHoldingsUpdate);
      window.removeEventListener('investor_update', handleInvestorUpdate);
    };
  }, [id, load]);

  const handleSaveEdit = async () => {
    // Frontend validation
    if (!isFormValid()) {
      enqueueSnackbar('Please fix all validation errors before saving', { variant: 'warning' });
      return;
    }

    try {
      // For APPROVED investors, use maker-checker flow
      if (investor.status === 'APPROVED') {
        const response = await api.post(`/investors/${id}/request-edit`, editForm);
        enqueueSnackbar(response.data?.message || 'Edit request submitted for approval', { variant: 'success' });
      } else {
        // Direct update for DRAFT/REJECTED status
        const response = await api.put(`/investors/${id}`, editForm);
        enqueueSnackbar(response.data?.message || 'Investor updated', { variant: 'success' });
      }
      setEditMode(false);
      setFieldStatus({});
      setValidationErrors({});
      load();
    } catch (err) {
      const status = err.response?.status;
      const message = err.response?.data?.message || err.response?.data?.error || 'Update failed';

      if (status === 400) {
        enqueueSnackbar(`Validation Error: ${message}`, { variant: 'error' });
      } else if (status === 409) {
        enqueueSnackbar(`Duplicate Found: ${message}`, { variant: 'error' });
      } else if (status === 403) {
        enqueueSnackbar(`Access Denied: ${message}`, { variant: 'error' });
      } else {
        enqueueSnackbar(message, { variant: 'error' });
      }
    }
  };

  const handleAction = async (type, reason) => {
    try {
      if (type === 'approve') await api.post(`/investors/${id}/approve`);
      else if (type === 'reject') await api.post(`/investors/${id}/reject`, { reason });
      else if (type === 'submit') await api.post(`/investors/${id}/submit`);
      else if (type === 'approve-edit') await api.post(`/investors/${id}/approve-edit`);
      else if (type === 'reject-edit') await api.post(`/investors/${id}/reject-edit`, { reason });
      enqueueSnackbar('Action successful', { variant: 'success' });
      setConfirm(null); load();
    } catch (err) {
      enqueueSnackbar(err.response?.data?.message || 'Action failed', { variant: 'error' });
      setConfirm(null);
    }
  };

  const handleUpload = async (docType, file) => {
    setUploading(u => ({ ...u, [docType]: true }));
    const formData = new FormData();
    formData.append('file', file);
    try {
      await api.post(`/kyc/${id}/upload/${docType}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      enqueueSnackbar(`${docType} uploaded!`, { variant: 'success' });
      load();
    } catch (err) {
      enqueueSnackbar(err.response?.data?.message || 'Upload failed', { variant: 'error' });
    } finally { setUploading(u => ({ ...u, [docType]: false })); }
  };

  if (loading) return <Box display="flex" justifyContent="center" mt={8}><CircularProgress /></Box>;
  if (!investor) return null;

  const isMaker = user?.role === 'MAKER';
  const isChecker = user?.role === 'CHECKER';
  const isAdmin = user?.role === 'ADMIN';
  const isOwner = investor.createdBy?._id === user?._id || investor.createdBy === user?._id;
  
  // Check if there's a pending edit request
  const hasPendingEdit = investor.pendingUpdate?.status === 'PENDING';
  
  // PERMANENT EDIT ACCESS: Maker and Admin can always see edit button
  const canEditPermanent = (isMaker || isAdmin) && !hasPendingEdit && !editMode;
  
  // Legacy checks for other actions
  const canEditDirect = (isMaker && isOwner || isAdmin) && ['DRAFT','REJECTED'].includes(investor.status);
  const canRequestEdit = (isMaker && isOwner || isAdmin) && investor.status === 'APPROVED' && !hasPendingEdit;
  const canApproveEdit = (isChecker || isAdmin) && hasPendingEdit;
  const canUploadKyc = (isMaker && isOwner || isAdmin) && ['DRAFT','KYC_PENDING','REJECTED'].includes(investor.status);
  const canSubmit = (isMaker && isOwner || isAdmin) && investor.status === 'KYC_PENDING';
  const canApprove = (isChecker || isAdmin) && investor.status === 'UNDER_REVIEW';

  const stepIdx = ['DRAFT','KYC_PENDING','UNDER_REVIEW','APPROVED','REJECTED'].indexOf(investor.status);
  const displayStep = investor.status === 'REJECTED' ? 2 : stepIdx;

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Button startIcon={<ArrowBack />} onClick={() => navigate('/app/investors')} size="small">Back</Button>
        <Typography variant="h5" fontWeight={700} color="#1a3c6e" sx={{ flex: 1 }}>
          {investor.fullName}
        </Typography>
        <StatusChip status={investor.status} size="medium" />
      </Box>

      {/* Workflow Stepper */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stepper activeStep={Math.min(displayStep, 3)} alternativeLabel>
            {STEPS.map(s => (
              <Step key={s} completed={stepIdx > STEPS.indexOf(s)}>
                <StepLabel error={investor.status === 'REJECTED' && s === 'UNDER_REVIEW'}>{s.replace('_',' ')}</StepLabel>
              </Step>
            ))}
          </Stepper>
          {investor.status === 'REJECTED' && (
            <Alert severity="error" sx={{ mt: 2 }}>
              <strong>Rejected:</strong> {investor.rejectionReason}
              {investor.rejectedBy && ` — by ${investor.rejectedBy.name}`}
            </Alert>
          )}
          {investor.status === 'APPROVED' && (
            <Alert severity="success" sx={{ mt: 2 }}>
              Approved by <strong>{investor.approvedBy?.name}</strong> on {new Date(investor.approvedAt).toLocaleString()}
            </Alert>
          )}
          {hasPendingEdit && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              <strong>Edit Pending Approval:</strong> Changes requested by {investor.pendingUpdate.requestedBy?.name || 'Maker'} on {new Date(investor.pendingUpdate.requestedAt).toLocaleString()}
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <Box sx={{ display: 'flex', gap: 1.5, mb: 3, flexWrap: 'wrap' }}>
        {/* PERMANENT EDIT BUTTON for Maker/Admin */}
        {canEditPermanent && (
          <Button variant="outlined" startIcon={<Edit />} onClick={() => {
            setEditMode(true);
            setEditForm({
              fullName: investor.fullName,
              panNumber: investor.panNumber || '',
              email: investor.email,
              phone: investor.phone,
              bankAccount: investor.bankAccount,
              ifscCode: investor.ifscCode,
              city: investor.city || '',
              address: investor.address
            });
            // Clear validation state
            setFieldStatus({});
            setValidationErrors({});
          }}>
            Edit
          </Button>
        )}
        {editMode && (
          <>
            <Button variant="contained" startIcon={<Save />} onClick={handleSaveEdit} sx={{ bgcolor: '#1a3c6e' }} disabled={!isFormValid()}>
              {investor.status === 'APPROVED' ? 'Submit for Approval' : 'Save'}
            </Button>
            <Button onClick={() => { setEditMode(false); setFieldStatus({}); setValidationErrors({}); }}>Cancel</Button>
          </>
        )}
        {canSubmit && (
          <Button variant="contained" startIcon={<Send />} color="primary"
            onClick={() => setConfirm({ type:'submit', title:'Submit for Review', message:'Submit this investor for checker review?', severity:'info' })}>
            Submit for Review
          </Button>
        )}
        {canApprove && (
          <>
            <Button variant="contained" color="success" startIcon={<CheckCircle />}
              onClick={() => setConfirm({ type:'approve', title:'Approve Investor', message:`Approve ${investor.fullName}?`, severity:'success' })}>Approve</Button>
            <Button variant="contained" color="error" startIcon={<Cancel />}
              onClick={() => setConfirm({ type:'reject', title:'Reject Investor', message:'Provide rejection reason:', severity:'error', requireReason:true })}>Reject</Button>
          </>
        )}
        {canApproveEdit && (
          <>
            <Button variant="contained" color="success" startIcon={<CheckCircle />}
              onClick={() => setConfirm({ type:'approve-edit', title:'Approve Edit', message:`Approve changes to ${investor.fullName}?`, severity:'success' })}>Approve Edit</Button>
            <Button variant="contained" color="error" startIcon={<Cancel />}
              onClick={() => setConfirm({ type:'reject-edit', title:'Reject Edit', message:'Provide rejection reason for edit:', severity:'error', requireReason:true })}>Reject Edit</Button>
          </>
        )}
      </Box>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Details" />
        <Tab label="KYC Documents" />
        <Tab label="History" />
      </Tabs>

      {/* DETAILS TAB */}
      {tab === 0 && (
        <Card>
          <CardContent>
            <Grid container spacing={2}>
              {/* Read-only fields */}
              <Grid item xs={12} sm={6}>
                <Typography fontSize={11} color="text.secondary" fontWeight={600} textTransform="uppercase">Folio Number</Typography>
                <Typography fontFamily="monospace" fontWeight={600}>{investor.folioNumber}</Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography fontSize={11} color="text.secondary" fontWeight={600} textTransform="uppercase">Shares</Typography>
                <Typography color="#2e7d32">{investor.shares || 0}</Typography>
              </Grid>

              {/* Full Name */}
              <Grid item xs={12} sm={6}>
                {editMode ? (
                  <TextField
                    fullWidth
                    size="small"
                    label="Full Name"
                    value={editForm.fullName || ''}
                    onChange={e => handleFieldChange('fullName', e.target.value)}
                    error={!!validationErrors.fullName}
                    helperText={fieldStatus.fullName?.helperText || 'Enter full name (2-100 characters)'}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        '&.Mui-error fieldset': { borderColor: '#d32f2f', borderWidth: '2px' },
                        '&.Mui-focused.Mui-error fieldset': { borderColor: '#d32f2f', borderWidth: '2px' }
                      },
                      '& .MuiFormHelperText-root': {
                        color: fieldStatus.fullName?.valid ? '#2e7d32' : (validationErrors.fullName ? '#d32f2f' : 'text.secondary'),
                        fontWeight: fieldStatus.fullName?.valid || validationErrors.fullName ? 500 : 400
                      }
                    }}
                  />
                ) : (
                  <Box>
                    <Typography fontSize={11} color="text.secondary" fontWeight={600} textTransform="uppercase">Full Name</Typography>
                    <Typography>{investor.fullName}</Typography>
                  </Box>
                )}
              </Grid>

              {/* PAN Number */}
              <Grid item xs={12} sm={6}>
                {editMode ? (
                  <TextField
                    fullWidth
                    size="small"
                    label="PAN Number"
                    value={editForm.panNumber || ''}
                    onChange={e => handleFieldChange('panNumber', e.target.value)}
                    error={!!validationErrors.panNumber || fieldStatus.pan?.exists}
                    helperText={
                      fieldStatus.pan?.message ||
                      fieldStatus.panNumber?.helperText ||
                      (duplicateChecking.pan ? 'Checking...' : 'Format: ABCDE1234F')
                    }
                    placeholder="ABCDE1234F"
                    inputProps={{ maxLength: 10 }}
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          {duplicateChecking.pan ? <CircularProgress size={16} /> :
                           fieldStatus.pan?.exists ? <Clear color="error" fontSize="small" /> :
                           fieldStatus.panNumber?.valid ? <Check color="success" fontSize="small" /> : null}
                        </InputAdornment>
                      )
                    }}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        '&.Mui-error fieldset': { borderColor: '#d32f2f', borderWidth: '2px' },
                        '&.Mui-focused.Mui-error fieldset': { borderColor: '#d32f2f', borderWidth: '2px' }
                      },
                      '& .MuiFormHelperText-root': {
                        color: fieldStatus.panNumber?.valid && !fieldStatus.pan?.exists ? '#2e7d32' : (validationErrors.panNumber || fieldStatus.pan?.exists ? '#d32f2f' : 'text.secondary'),
                        fontWeight: (fieldStatus.panNumber?.valid || validationErrors.panNumber || fieldStatus.pan?.exists) ? 500 : 400
                      }
                    }}
                  />
                ) : (
                  <Box>
                    <Typography fontSize={11} color="text.secondary" fontWeight={600} textTransform="uppercase">PAN Number</Typography>
                    <Typography fontFamily="monospace" fontWeight={600}>{investor.panNumber || '—'}</Typography>
                  </Box>
                )}
              </Grid>

              {/* Email */}
              <Grid item xs={12} sm={6}>
                {editMode ? (
                  <TextField
                    fullWidth
                    size="small"
                    label="Email"
                    type="email"
                    value={editForm.email || ''}
                    onChange={e => handleFieldChange('email', e.target.value)}
                    error={!!validationErrors.email || fieldStatus.email?.exists}
                    helperText={
                      fieldStatus.email?.message ||
                      fieldStatus.email?.helperText ||
                      (duplicateChecking.email ? 'Checking...' : 'Enter valid email address')
                    }
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          {duplicateChecking.email ? <CircularProgress size={16} /> :
                           fieldStatus.email?.exists ? <Clear color="error" fontSize="small" /> :
                           fieldStatus.email?.valid ? <Check color="success" fontSize="small" /> : null}
                        </InputAdornment>
                      )
                    }}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        '&.Mui-error fieldset': { borderColor: '#d32f2f', borderWidth: '2px' },
                        '&.Mui-focused.Mui-error fieldset': { borderColor: '#d32f2f', borderWidth: '2px' }
                      },
                      '& .MuiFormHelperText-root': {
                        color: fieldStatus.email?.valid && !fieldStatus.email?.exists ? '#2e7d32' : (validationErrors.email || fieldStatus.email?.exists ? '#d32f2f' : 'text.secondary'),
                        fontWeight: (fieldStatus.email?.valid || validationErrors.email || fieldStatus.email?.exists) ? 500 : 400
                      }
                    }}
                  />
                ) : (
                  <Box>
                    <Typography fontSize={11} color="text.secondary" fontWeight={600} textTransform="uppercase">Email</Typography>
                    <Typography>{investor.email}</Typography>
                  </Box>
                )}
              </Grid>

              {/* Phone */}
              <Grid item xs={12} sm={6}>
                {editMode ? (
                  <TextField
                    fullWidth
                    size="small"
                    label="Phone"
                    value={editForm.phone || ''}
                    onChange={e => handleFieldChange('phone', e.target.value)}
                    error={!!validationErrors.phone}
                    helperText={fieldStatus.phone?.helperText || 'Enter 10-digit mobile number'}
                    placeholder="9876543210"
                    inputProps={{ maxLength: 10, inputMode: 'numeric' }}
                    InputProps={{
                      endAdornment: fieldStatus.phone?.valid && (
                        <InputAdornment position="end"><Check color="success" fontSize="small" /></InputAdornment>
                      )
                    }}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        '&.Mui-error fieldset': { borderColor: '#d32f2f', borderWidth: '2px' },
                        '&.Mui-focused.Mui-error fieldset': { borderColor: '#d32f2f', borderWidth: '2px' }
                      },
                      '& .MuiFormHelperText-root': {
                        color: fieldStatus.phone?.valid ? '#2e7d32' : (validationErrors.phone ? '#d32f2f' : 'text.secondary'),
                        fontWeight: (fieldStatus.phone?.valid || validationErrors.phone) ? 500 : 400
                      }
                    }}
                  />
                ) : (
                  <Box>
                    <Typography fontSize={11} color="text.secondary" fontWeight={600} textTransform="uppercase">Phone</Typography>
                    <Typography>{investor.phone}</Typography>
                  </Box>
                )}
              </Grid>

              {/* Bank Account */}
              <Grid item xs={12} sm={6}>
                {editMode ? (
                  <TextField
                    fullWidth
                    size="small"
                    label="Bank Account"
                    value={editForm.bankAccount || ''}
                    onChange={e => handleFieldChange('bankAccount', e.target.value)}
                    error={!!validationErrors.bankAccount}
                    helperText={fieldStatus.bankAccount?.helperText || 'Enter 9-18 digit account number'}
                    placeholder="1234567890"
                    inputProps={{ maxLength: 18, inputMode: 'numeric' }}
                    InputProps={{
                      endAdornment: fieldStatus.bankAccount?.valid && (
                        <InputAdornment position="end"><Check color="success" fontSize="small" /></InputAdornment>
                      )
                    }}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        '&.Mui-error fieldset': { borderColor: '#d32f2f', borderWidth: '2px' },
                        '&.Mui-focused.Mui-error fieldset': { borderColor: '#d32f2f', borderWidth: '2px' }
                      },
                      '& .MuiFormHelperText-root': {
                        color: fieldStatus.bankAccount?.valid ? '#2e7d32' : (validationErrors.bankAccount ? '#d32f2f' : 'text.secondary'),
                        fontWeight: (fieldStatus.bankAccount?.valid || validationErrors.bankAccount) ? 500 : 400
                      }
                    }}
                  />
                ) : (
                  <Box>
                    <Typography fontSize={11} color="text.secondary" fontWeight={600} textTransform="uppercase">Bank Account</Typography>
                    <Typography fontFamily="monospace">{investor.bankAccount || '—'}</Typography>
                  </Box>
                )}
              </Grid>

              {/* IFSC Code */}
              <Grid item xs={12} sm={6}>
                {editMode ? (
                  <TextField
                    fullWidth
                    size="small"
                    label="IFSC Code"
                    value={editForm.ifscCode || ''}
                    onChange={e => handleFieldChange('ifscCode', e.target.value)}
                    error={!!validationErrors.ifscCode}
                    helperText={fieldStatus.ifscCode?.helperText || 'Format: ABCD0XXXXXX'}
                    placeholder="HDFC0123456"
                    inputProps={{ maxLength: 11 }}
                    InputProps={{
                      endAdornment: fieldStatus.ifscCode?.valid && (
                        <InputAdornment position="end"><Check color="success" fontSize="small" /></InputAdornment>
                      )
                    }}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        '&.Mui-error fieldset': { borderColor: '#d32f2f', borderWidth: '2px' },
                        '&.Mui-focused.Mui-error fieldset': { borderColor: '#d32f2f', borderWidth: '2px' }
                      },
                      '& .MuiFormHelperText-root': {
                        color: fieldStatus.ifscCode?.valid ? '#2e7d32' : (validationErrors.ifscCode ? '#d32f2f' : 'text.secondary'),
                        fontWeight: (fieldStatus.ifscCode?.valid || validationErrors.ifscCode) ? 500 : 400
                      }
                    }}
                  />
                ) : (
                  <Box>
                    <Typography fontSize={11} color="text.secondary" fontWeight={600} textTransform="uppercase">IFSC Code</Typography>
                    <Typography fontFamily="monospace" fontWeight={600}>{investor.ifscCode || '—'}</Typography>
                  </Box>
                )}
              </Grid>

              {/* City */}
              <Grid item xs={12} sm={6}>
                {editMode ? (
                  <TextField
                    fullWidth
                    size="small"
                    label="City"
                    value={editForm.city || ''}
                    onChange={e => handleFieldChange('city', e.target.value)}
                    error={!!validationErrors.city}
                    helperText={fieldStatus.city?.helperText || 'Enter city name'}
                    InputProps={{
                      endAdornment: fieldStatus.city?.valid && (
                        <InputAdornment position="end"><Check color="success" fontSize="small" /></InputAdornment>
                      )
                    }}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        '&.Mui-error fieldset': { borderColor: '#d32f2f', borderWidth: '2px' },
                        '&.Mui-focused.Mui-error fieldset': { borderColor: '#d32f2f', borderWidth: '2px' }
                      },
                      '& .MuiFormHelperText-root': {
                        color: fieldStatus.city?.valid ? '#2e7d32' : (validationErrors.city ? '#d32f2f' : 'text.secondary'),
                        fontWeight: (fieldStatus.city?.valid || validationErrors.city) ? 500 : 400
                      }
                    }}
                  />
                ) : (
                  <Box>
                    <Typography fontSize={11} color="text.secondary" fontWeight={600} textTransform="uppercase">City</Typography>
                    <Typography>{investor.city || '—'}</Typography>
                  </Box>
                )}
              </Grid>

              {/* Address */}
              <Grid item xs={12} sm={6}>
                {editMode ? (
                  <TextField
                    fullWidth
                    size="small"
                    label="Address"
                    value={editForm.address || ''}
                    onChange={e => handleFieldChange('address', e.target.value)}
                    error={!!validationErrors.address}
                    helperText={fieldStatus.address?.helperText || 'Enter full address (min 5 characters)'}
                    multiline
                    rows={2}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        '&.Mui-error fieldset': { borderColor: '#d32f2f', borderWidth: '2px' },
                        '&.Mui-focused.Mui-error fieldset': { borderColor: '#d32f2f', borderWidth: '2px' }
                      },
                      '& .MuiFormHelperText-root': {
                        color: fieldStatus.address?.valid ? '#2e7d32' : (validationErrors.address ? '#d32f2f' : 'text.secondary'),
                        fontWeight: (fieldStatus.address?.valid || validationErrors.address) ? 500 : 400
                      }
                    }}
                  />
                ) : (
                  <Box>
                    <Typography fontSize={11} color="text.secondary" fontWeight={600} textTransform="uppercase">Address</Typography>
                    <Typography>{investor.address || '—'}</Typography>
                  </Box>
                )}
              </Grid>

              <Grid item xs={12} sm={6}>
                <Typography fontSize={11} color="text.secondary" fontWeight={600} textTransform="uppercase">Created By</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography>{investor.createdBy?.name}</Typography>
                  <Chip label={investor.createdBy?.role} size="small" sx={{ height:18, fontSize:'0.62rem' }} />
                </Box>
                <Typography fontSize={12} color="text.secondary">{new Date(investor.createdAt).toLocaleString()}</Typography>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}

      {/* KYC TAB */}
      {tab === 1 && (
        <Card>
          <CardContent>
            <Typography variant="subtitle1" fontWeight={700} mb={2}>KYC Documents</Typography>
            <Grid container spacing={2}>
              {KYC_DOCS.map(doc => {
                const docData = investor.kycDocuments?.[doc.key];
                return (
                  <Grid item xs={12} sm={6} key={doc.key}>
                    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                      <Box sx={{ display:'flex', justifyContent:'space-between', alignItems:'center', mb: 1 }}>
                        <Typography fontWeight={600} fontSize={14}>{doc.label}</Typography>
                        <StatusChip status={docData ? 'UPLOADED' : 'NOT_STARTED'} />
                      </Box>
                      {docData ? (
                        <Box>
                          <Typography fontSize={12} color="text.secondary">File: {docData.filename}</Typography>
                          <Typography fontSize={12} color="text.secondary">
                            Uploaded: {new Date(docData.uploadedAt).toLocaleDateString()}
                          </Typography>
                          <Button size="small" href={`${API_BASE}${docData.url}`} target="_blank" sx={{ mt: 1 }}>
                            View Document
                          </Button>
                        </Box>
                      ) : (
                        <Typography fontSize={12} color="text.secondary">Not uploaded</Typography>
                      )}
                      {canUploadKyc && (
                        <Box sx={{ mt: 1.5 }}>
                          <input type="file" id={`upload-${doc.key}`} hidden accept=".jpg,.jpeg,.png,.pdf"
                            onChange={e => { if (e.target.files[0]) handleUpload(doc.key, e.target.files[0]); e.target.value=''; }} />
                          <label htmlFor={`upload-${doc.key}`}>
                            <Button variant="outlined" component="span" size="small" startIcon={<Upload />}
                              disabled={uploading[doc.key]}>
                              {uploading[doc.key] ? 'Uploading...' : docData ? 'Replace' : 'Upload'}
                            </Button>
                          </label>
                        </Box>
                      )}
                    </Paper>
                  </Grid>
                );
              })}
            </Grid>
          </CardContent>
        </Card>
      )}

      {/* HISTORY TAB */}
      {tab === 2 && (
        <Card>
          <CardContent>
            <Typography variant="subtitle1" fontWeight={700} mb={2}>Status History</Typography>
            {history.length === 0 ? (
              <Typography color="text.secondary">No history yet</Typography>
            ) : (
              <Box sx={{ position:'relative', pl: 3 }}>
                <Box sx={{ position:'absolute', left:8, top:0, bottom:0, width:2, bgcolor:'#e0e0e0' }} />
                {history.map((h, i) => (
                  <Box key={h._id || i} sx={{ position:'relative', mb: 2.5 }}>
                    <Box sx={{ position:'absolute', left:-20, width:12, height:12, borderRadius:'50%',
                      bgcolor: !h.oldStatus ? '#1a3c6e' : h.newStatus === 'APPROVED' ? '#2e7d32' : h.newStatus === 'REJECTED' ? '#c62828' : '#1a3c6e',
                      border: '2px solid white', boxShadow: 1 }} />
                    <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                      <Box sx={{ display:'flex', gap:1, alignItems:'center', mb:0.5, flexWrap:'wrap' }}>
                        {h.oldStatus ? (
                          <><StatusChip status={h.oldStatus} /><Typography fontSize={13} color="text.secondary">→</Typography></>
                        ) : (
                          <Chip label="CREATED" size="small" color="primary" variant="outlined" sx={{ fontSize: '0.7rem' }} />
                        )}
                        <StatusChip status={h.newStatus} />
                        <Typography fontSize={11} color="text.secondary" sx={{ ml:'auto' }}>
                          {new Date(h.createdAt).toLocaleString()}
                        </Typography>
                      </Box>
                      <Typography fontSize={12} color="text.secondary">
                        By: <strong>{h.changedByName}</strong> ({h.changedByRole})
                      </Typography>
                      {h.reason && <Alert severity="info" sx={{ mt: 0.5, py: 0.3, fontSize: 12 }}>{h.reason}</Alert>}
                    </Paper>
                  </Box>
                ))}
              </Box>
            )}
          </CardContent>
        </Card>
      )}

      {confirm && (
        <ConfirmDialog open={true} title={confirm.title} message={confirm.message}
          severity={confirm.severity} requireReason={confirm.requireReason}
          onConfirm={reason => handleAction(confirm.type, reason)}
          onCancel={() => setConfirm(null)} />
      )}
    </Box>
  );
}
