import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Box, Card, Typography, Button, Table, TableBody, TableCell, TableHead, TableRow,
  CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  MenuItem, Grid, Alert, IconButton, Tooltip, Chip, TableContainer, useMediaQuery, useTheme,
  Switch, FormControlLabel, Box as MuiBox
} from '@mui/material';
import { Add, CheckCircle, Cancel, Delete, Restore } from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import StatusChip from '../components/common/StatusChip';
import ConfirmDialog from '../components/common/ConfirmDialog';

export default function AllocationsPage() {
  const { user } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const [allocations, setAllocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [investors, setInvestors] = useState([]);
  const [securities, setSecurities] = useState([]);
  const [form, setForm] = useState({ investorId:'', securityId:'', quantity:'', remarks:'' });
  const [formErr, setFormErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const theme = useTheme();
  const fullScreenDialog = useMediaQuery(theme.breakpoints.down('sm'));

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await api.get('/allocations'); setAllocations(r.data.allocations); }
    catch { enqueueSnackbar('Load failed', { variant:'error' }); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Listen for real-time updates from socket events
  useEffect(() => {
    const handleAllocationUpdate = () => {
      console.log('Allocation updated, refreshing allocations page');
      load();
    };

    const handleHoldingsUpdate = () => {
      console.log('Holdings updated, refreshing allocations page');
      load();
    };

    const handleSecurityUpdate = () => {
      console.log('Security updated, refreshing allocations page');
      load();
    };

    window.addEventListener('allocation_update', handleAllocationUpdate);
    window.addEventListener('holdings_update', handleHoldingsUpdate);
    window.addEventListener('security_update', handleSecurityUpdate);

    return () => {
      window.removeEventListener('allocation_update', handleAllocationUpdate);
      window.removeEventListener('holdings_update', handleHoldingsUpdate);
      window.removeEventListener('security_update', handleSecurityUpdate);
    };
  }, [load]);

  const openCreate = async () => {
    const [ir, sr] = await Promise.all([
      api.get('/investors', { params: { status:'APPROVED' } }),
      api.get('/securities', { params: { status:'APPROVED' } })
    ]);
    setInvestors(ir.data.investors); setSecurities(sr.data.securities);
    setCreateOpen(true);
  };

  // Validation check
  const isFormValid = () => {
    return form.investorId && form.securityId && form.quantity && +form.quantity > 0;
  };

  const handleCreate = async () => {
    setFormErr('');

    // Frontend validation
    if (!form.investorId) {
      setFormErr('Please select an Investor');
      return;
    }
    if (!form.securityId) {
      setFormErr('Please select a Security');
      return;
    }
    if (!form.quantity || +form.quantity <= 0) {
      setFormErr('Please enter a valid Quantity (greater than 0)');
      return;
    }

    setSaving(true);
    try {
      await api.post('/allocations', { ...form, quantity: +form.quantity });
      enqueueSnackbar('Allocation created (pending approval)', { variant:'success' });
      setCreateOpen(false); setForm({ investorId:'', securityId:'', quantity:'', remarks:'' }); load();
    } catch(err) { setFormErr(err.response?.data?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  const handleAction = async (type, id, reason) => {
    if (actionLoading) return;
    setActionLoading(true);
    try {
      if (type === 'approve') await api.post(`/allocations/${id}/approve`);
      else await api.post(`/allocations/${id}/reject`, { reason });
      enqueueSnackbar('Done', { variant:'success' }); setConfirm(null);
    } catch(err) { enqueueSnackbar(err.response?.data?.message || 'Failed', { variant:'error' }); }
    finally {
      setConfirm(null);
      setActionLoading(false);
      load(); // ALWAYS reload data, even on error
    }
  };

  const handleDelete = async (allocation) => {
    if (deleteLoading) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/allocations/${allocation._id}`);
      enqueueSnackbar('Allocation deleted successfully', { variant:'success' });
      setDeleteConfirm(null);
    } catch(err) {
      const errorMsg = err.response?.data?.message || 'Failed to delete';
      if (err.response?.data?.errors) {
        enqueueSnackbar(err.response.data.errors.join(', '), { variant:'error', autoHideDuration: 6000 });
      } else {
        enqueueSnackbar(errorMsg, { variant:'error' });
      }
      setDeleteConfirm(null);
    } finally {
      setDeleteLoading(false);
      load(); // ALWAYS reload data after delete action
    }
  };

  const canApprove = ['CHECKER','ADMIN'].includes(user?.role);

  return (
    <Box>
      <Box sx={{ display:'flex', alignItems:'center', mb:{ xs: 2, sm: 3 }, gap:2, flexDirection:{ xs:'column', sm:'row' } }}>
        <Typography variant="h5" fontWeight={700} color="#1a3c6e" sx={{ flex:1 }}>Share Allocations</Typography>
        {user?.role === 'ADMIN' && (
          <FormControlLabel
            control={<Switch checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} size="small" />}
            label={<Typography fontSize={{ xs:11, sm:12 }}>Show Deleted</Typography>}
          />
        )}
        <Button variant="contained" startIcon={<Add />} onClick={openCreate} sx={{ bgcolor:'#1a3c6e', fontSize:{ xs:11, sm:12 }, flex:{ xs:1, sm:'auto' }, minWidth:120, maxWidth:180 }}>Allocate</Button>
      </Box>
      <Card>
        <TableContainer sx={{ overflowX:'auto' }}>
          <Table size="small" sx={{ minWidth:{ xs:600, md:800 } }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontSize:{ xs:11, sm:12 } }}>Investor</TableCell>
                <TableCell sx={{ fontSize:{ xs:11, sm:12 } }}>Security (ISIN)</TableCell>
                <TableCell align="right" sx={{ fontSize:{ xs:11, sm:12 } }}>Quantity</TableCell>
                <TableCell sx={{ fontSize:{ xs:11, sm:12 } }}>Status</TableCell>
                <TableCell sx={{ fontSize:{ xs:11, sm:12 } }}>Created By</TableCell>
              <TableCell sx={{ fontSize:{ xs:11, sm:12 } }}>Approved By</TableCell>
              <TableCell align="center" sx={{ fontSize:{ xs:11, sm:12 } }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={7} align="center"><CircularProgress size={24} /></TableCell></TableRow>}
            {!loading && allocations.filter(a => showDeleted || !a.isDeleted).map(a => (
              <TableRow key={a._id} hover sx={{ opacity: a.isDeleted ? 0.5 : 1, textDecoration: a.isDeleted ? 'line-through' : 'none' }}>
                <TableCell>
                  <Typography fontWeight={600} fontSize={{ xs:11, sm:13 }}>{a.investor?.fullName}</Typography>
                  <Typography fontSize={{ xs:10, sm:11 }} color="text.secondary">{a.investor?.folioNumber}</Typography>
                </TableCell>
                <TableCell>
                  <Chip label={a.security?.isin} size="small" variant="outlined" sx={{ fontFamily:'monospace', fontWeight:700, fontSize:{ xs:10, sm:12 } }} />
                  <Typography fontSize={{ xs:10, sm:11 }} color="text.secondary">{a.security?.companyName}</Typography>
                </TableCell>
                <TableCell align="right" sx={{ fontWeight:700, fontSize:{ xs:13, sm:15 } }}>{a.quantity?.toLocaleString()}</TableCell>
                <TableCell><StatusChip status={a.status} /></TableCell>
                <TableCell><Typography fontSize={{ xs:11, sm:12 }}>{a.createdBy?.name}</Typography></TableCell>
                <TableCell><Typography fontSize={{ xs:11, sm:12 }}>{a.approvedBy?.name || '—'}</Typography></TableCell>
                <TableCell align="center">
                  {!a.isDeleted && user?.role === 'ADMIN' && ['PENDING','REJECTED'].includes(a.status) && (
                    <Tooltip title="Delete">
                      <IconButton size="small" color="error" disabled={deleteLoading}
                        onClick={() => setDeleteConfirm({ allocation: a })}>
                        <Delete fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                  {canApprove && a.status === 'PENDING' && !a.isDeleted && (
                    <>
                      <Tooltip title="Approve"><IconButton size="small" color="success"
                        onClick={() => setConfirm({ type:'approve', id:a._id, title:'Approve Allocation', message:`Approve ${a.quantity} shares to ${a.investor?.fullName}?`, severity:'success' })}>
                        <CheckCircle fontSize="small" /></IconButton></Tooltip>
                      <Tooltip title="Reject"><IconButton size="small" color="error"
                        onClick={() => setConfirm({ type:'reject', id:a._id, title:'Reject Allocation', message:'Provide rejection reason:', severity:'error', requireReason:true })}>
                        <Cancel fontSize="small" /></IconButton></Tooltip>
                    </>
                  )}
                  {a.rejectionReason && <Tooltip title={a.rejectionReason}><Chip label="Rejected: see reason" size="small" color="error" variant="outlined" sx={{ fontSize:'0.6rem' }} /></Tooltip>}
                </TableCell>
              </TableRow>
            ))}
            {!loading && allocations.filter(a => showDeleted || !a.isDeleted).length === 0 && <TableRow><TableCell colSpan={7} align="center" sx={{ color:'text.secondary', py:3 }}>No allocations</TableCell></TableRow>}
          </TableBody>
        </Table>
        </TableContainer>
      </Card>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth fullScreen={fullScreenDialog}>
        <DialogTitle fontWeight={700}>Create Allocation</DialogTitle>
        <DialogContent sx={{ pt:2 }}>
          {formErr && <Alert severity="error" sx={{ mb:2 }}>{formErr}</Alert>}
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField select fullWidth size="small" label="Investor *" value={form.investorId} onChange={e => setForm(v=>({...v,investorId:e.target.value}))}>
                {investors.map(i => <MenuItem key={i._id} value={i._id}>{i.fullName} ({i.folioNumber})</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12}>
              <TextField select fullWidth size="small" label="Security *" value={form.securityId} onChange={e => setForm(v=>({...v,securityId:e.target.value}))}>
                {securities.map(s => <MenuItem key={s._id} value={s._id}>{s.isin} — {s.companyName} (Avail: {s.availableShares?.toLocaleString()})</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={6}><TextField fullWidth size="small" label="Quantity *" type="number" value={form.quantity} onChange={e => setForm(v=>({...v,quantity:e.target.value}))} /></Grid>
            <Grid item xs={12}><TextField fullWidth size="small" label="Remarks" value={form.remarks} onChange={e => setForm(v=>({...v,remarks:e.target.value}))} /></Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px:3, pb:2 }}>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate} disabled={saving || !isFormValid()} sx={{ bgcolor:'#1a3c6e' }}>
            {saving ? 'Creating...' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {confirm && <ConfirmDialog open={true} title={confirm.title} message={confirm.message}
        severity={confirm.severity} requireReason={confirm.requireReason}
        onConfirm={reason => handleAction(confirm.type, confirm.id, reason)}
        onCancel={() => setConfirm(null)} />}

      {deleteConfirm && (
        <Dialog open={true} onClose={() => setDeleteConfirm(null)} maxWidth="sm" fullWidth fullScreen={fullScreenDialog}>
          <DialogTitle fontWeight={700}>Confirm Delete</DialogTitle>
          <DialogContent>
            <Alert severity="warning" sx={{ mb:2 }}>This action may affect share calculations and cannot be undone easily.</Alert>
            <Box sx={{ mb:2 }}>
              <Typography variant="subtitle2" fontWeight={600}>Investor:</Typography>
              <Typography>{deleteConfirm.allocation.investor?.fullName} ({deleteConfirm.allocation.investor?.folioNumber})</Typography>
            </Box>
            <Box sx={{ mb:2 }}>
              <Typography variant="subtitle2" fontWeight={600}>Security:</Typography>
              <Typography>{deleteConfirm.allocation.security?.isin} - {deleteConfirm.allocation.security?.companyName}</Typography>
            </Box>
            <Box sx={{ mb:2 }}>
              <Typography variant="subtitle2" fontWeight={600}>Shares Impact:</Typography>
              <Typography>{deleteConfirm.allocation.quantity?.toLocaleString()} shares</Typography>
            </Box>
            <Box sx={{ mb:2 }}>
              <Typography variant="subtitle2" fontWeight={600}>Status:</Typography>
              <StatusChip status={deleteConfirm.allocation.status} />
            </Box>
          </DialogContent>
          <DialogActions sx={{ px:3, pb:2 }}>
            <Button onClick={() => setDeleteConfirm(null)} disabled={deleteLoading}>Cancel</Button>
            <Button variant="contained" onClick={() => handleDelete(deleteConfirm.allocation)} disabled={deleteLoading} color="error">
              {deleteLoading ? 'Deleting...' : 'Confirm Delete'}
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </Box>
  );
}
