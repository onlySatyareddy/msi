import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Box, Card, CardContent, Typography, Button, TextField, Table,
  TableBody, TableCell, TableHead, TableRow, IconButton, Tooltip, Chip,
  CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions,
  Grid, Alert, MenuItem, LinearProgress, TableContainer, useMediaQuery, useTheme,
  Switch, FormControlLabel
} from '@mui/material';
import { Add, CheckCircle, Cancel, Refresh, Visibility, AssignmentTurnedIn, Delete } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import StatusChip from '../components/common/StatusChip';
import ConfirmDialog from '../components/common/ConfirmDialog';

export default function SecuritiesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const [securities, setSecurities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ isin:'', companyName:'', totalShares:'', remarks:'' });
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
    try { const r = await api.get('/securities'); setSecurities(r.data.securities); }
    catch { enqueueSnackbar('Load failed', { variant:'error' }); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Listen for real-time updates from socket events
  useEffect(() => {
    const handleSecurityUpdate = () => {
      console.log('Security updated, refreshing securities page');
      load();
    };

    const handleAllocationUpdate = () => {
      console.log('Allocation updated, refreshing securities page');
      load();
    };

    const handleHoldingUpdate = () => {
      console.log('Holding updated, refreshing securities page');
      load();
    };

    window.addEventListener('security_update', handleSecurityUpdate);
    window.addEventListener('allocation_update', handleAllocationUpdate);
    window.addEventListener('holding_update', handleHoldingUpdate);

    return () => {
      window.removeEventListener('security_update', handleSecurityUpdate);
      window.removeEventListener('allocation_update', handleAllocationUpdate);
      window.removeEventListener('holding_update', handleHoldingUpdate);
    };
  }, [load]);

  const handleCreate = async () => {
    setFormErr(''); setSaving(true);
    try {
      await api.post('/securities', { ...form, totalShares: +form.totalShares });
      enqueueSnackbar('Security created (Pending approval)', { variant:'success' });
      setCreateOpen(false); setForm({ isin:'', companyName:'', totalShares:'', remarks:'' }); load();
    } catch(err) { setFormErr(err.response?.data?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  const handleAction = async (type, id, reason) => {
    if (actionLoading) return;
    setActionLoading(true);
    try {
      if (type === 'approve') await api.post(`/securities/${id}/approve`);
      else await api.post(`/securities/${id}/reject`, { reason });
      enqueueSnackbar('Done', { variant:'success' }); setConfirm(null);
    } catch(err) { enqueueSnackbar(err.response?.data?.message || 'Failed', { variant:'error' }); }
    finally {
      setConfirm(null);
      setActionLoading(false);
      load(); // ALWAYS reload data, even on error
    }
  };

  const handleDelete = async (security) => {
    if (deleteLoading) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/securities/${security._id}`);
      enqueueSnackbar('Security deleted successfully', { variant:'success' });
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

  const isMaker = user?.role === 'MAKER';
  const canApprove = ['CHECKER','ADMIN'].includes(user?.role);

  return (
    <Box>
      <Box sx={{ display:'flex', alignItems:'center', mb:{ xs: 2, sm: 3 }, gap:2, flexDirection:{ xs:'column', sm:'row' } }}>
        <Typography variant="h5" fontWeight={700} color="#1a3c6e" sx={{ flex:1 }}>Securities (ISIN)</Typography>
        {user?.role === 'ADMIN' && (
          <FormControlLabel
            control={<Switch checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} size="small" />}
            label={<Typography fontSize={{ xs:11, sm:12 }}>Show Deleted</Typography>}
          />
        )}
        {!isMaker && <IconButton onClick={load} size="small"><Refresh /></IconButton>}
        <Button variant="contained" startIcon={<Add />} onClick={() => setCreateOpen(true)} sx={{ bgcolor:'#1a3c6e', fontSize:{ xs:11, sm:12 }, flex:{ xs:1, sm:'auto' }, minWidth:120, maxWidth:180 }}>
          Security
        </Button>
      </Box>

      <Card>
        <TableContainer sx={{ overflowX:'auto' }}>
          <Table size="small" sx={{ minWidth:{ xs:800, md:1000 } }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontSize:{ xs:11, sm:12 } }}>ISIN</TableCell>
                <TableCell sx={{ fontSize:{ xs:11, sm:12 } }}>Company</TableCell>
                <TableCell align="right" sx={{ fontSize:{ xs:11, sm:12 } }}>Total Shares</TableCell>
                <TableCell align="right" sx={{ fontSize:{ xs:11, sm:12 } }}>Allocated</TableCell>
                <TableCell align="right" sx={{ fontSize:{ xs:11, sm:12 } }}>Available</TableCell>
                <TableCell sx={{ fontSize:{ xs:11, sm:12 } }}>Allocation %</TableCell>
                <TableCell sx={{ fontSize:{ xs:11, sm:12 } }}>Status</TableCell>
                <TableCell sx={{ fontSize:{ xs:11, sm:12 } }}>Created By</TableCell>
                <TableCell align="center" sx={{ fontSize:{ xs:11, sm:12 } }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={9} align="center"><CircularProgress size={24} /></TableCell></TableRow>}
              {!loading && securities.filter(s => showDeleted || !s.isDeleted).map(s => {
                const pct = s.totalShares > 0 ? (s.allocatedShares / s.totalShares * 100) : 0;
                return (
                  <TableRow key={s._id} hover sx={{ opacity: s.isDeleted ? 0.5 : 1, textDecoration: s.isDeleted ? 'line-through' : 'none' }}>
                    <TableCell><Chip label={s.isin} size="small" variant="outlined" sx={{ fontFamily:'monospace', fontWeight:700, fontSize:{ xs:10, sm:12 } }} /></TableCell>
                    <TableCell><Typography fontWeight={600} fontSize={{ xs:11, sm:13 }}>{s.companyName}</Typography></TableCell>
                    <TableCell align="right" sx={{ fontSize:{ xs:11, sm:12 } }}>{s.totalShares?.toLocaleString()}</TableCell>
                    <TableCell align="right" sx={{ color:'#c62828', fontWeight:600, fontSize:{ xs:11, sm:12 } }}>{s.allocatedShares?.toLocaleString()}</TableCell>
                    <TableCell align="right" sx={{ color:'#2e7d32', fontWeight:600, fontSize:{ xs:11, sm:12 } }}>{(s.totalShares-s.allocatedShares)?.toLocaleString()}</TableCell>
                    <TableCell sx={{ minWidth:120 }}>
                      <Box sx={{ display:'flex', alignItems:'center', gap:1 }}>
                        <LinearProgress variant="determinate" value={pct} sx={{ flex:1, height:6, borderRadius:3 }} />
                        <Typography fontSize={{ xs:10, sm:11 }}>{pct.toFixed(1)}%</Typography>
                      </Box>
                    </TableCell>
                    <TableCell><StatusChip status={s.status} /></TableCell>
                    <TableCell><Typography fontSize={{ xs:11, sm:12 }}>{s.createdBy?.name}</Typography></TableCell>
                    <TableCell align="center">
                      {!s.isDeleted && user?.role === 'ADMIN' && ['PENDING','REJECTED'].includes(s.status) && (
                        <Tooltip title="Delete">
                          <IconButton size="small" color="error" disabled={deleteLoading}
                            onClick={() => setDeleteConfirm({ security: s })}>
                            <Delete fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      <Tooltip title="View Details"><IconButton size="small" onClick={() => navigate(`/app/securities/${s._id}`)}><Visibility fontSize="small" /></IconButton></Tooltip>
                      
                      {canApprove && s.status === 'PENDING' && !s.isDeleted && (
                        <>
                          <Tooltip title="Approve"><IconButton size="small" color="success"
                            onClick={() => setConfirm({ type:'approve', id:s._id, title:'Approve Security', message:`Approve ${s.isin}?`, severity:'success' })}>
                            <CheckCircle fontSize="small" />
                          </IconButton></Tooltip>
                          <Tooltip title="Reject"><IconButton size="small" color="error"
                            onClick={() => setConfirm({ type:'reject', id:s._id, title:'Reject Security', message:`Reject ${s.isin}?`, severity:'error', requireReason:true })}>
                            <Cancel fontSize="small" />
                          </IconButton></Tooltip>
                        </>
                      )}
                      
                      {s.status === 'APPROVED' && !s.isDeleted && (
                        <Tooltip title="Allocate Shares">
                          <IconButton size="small" color="primary" onClick={() => navigate(`/app/allocations?security=${s._id}`)}>
                            <AssignmentTurnedIn fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      
                      {s.rejectionReason && (
                        <Tooltip title={s.rejectionReason}><Chip label="Reason" size="small" color="error" variant="outlined" sx={{ fontSize:'0.6rem' }} /></Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {!loading && securities.filter(s => showDeleted || !s.isDeleted).length === 0 && (
                <TableRow><TableCell colSpan={9} align="center" sx={{ color:'text.secondary', py:3 }}>No securities found</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth fullScreen={fullScreenDialog}>
        <DialogTitle fontWeight={700}>Create New Security</DialogTitle>
        <DialogContent sx={{ pt:2 }}>
          {formErr && <Alert severity="error" sx={{ mb:2 }}>{formErr}</Alert>}
          <Grid container spacing={2}>
            <Grid item xs={6}><TextField fullWidth size="small" label="ISIN *" value={form.isin} onChange={e => setForm(v=>({...v,isin:e.target.value.toUpperCase()}))} placeholder="INE000A01011" inputProps={{ maxLength:12 }} /></Grid>
            <Grid item xs={6}><TextField fullWidth size="small" label="Total Shares *" type="number" value={form.totalShares} onChange={e => setForm(v=>({...v,totalShares:e.target.value}))} /></Grid>
            <Grid item xs={12}><TextField fullWidth size="small" label="Company Name *" value={form.companyName} onChange={e => setForm(v=>({...v,companyName:e.target.value}))} /></Grid>
            <Grid item xs={12}><TextField fullWidth size="small" label="Remarks" value={form.remarks} onChange={e => setForm(v=>({...v,remarks:e.target.value}))} multiline rows={2} /></Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px:3, pb:2 }}>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate} disabled={saving} sx={{ bgcolor:'#1a3c6e' }}>
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
            <Alert severity="warning" sx={{ mb:2 }}>This action will delete the security and cannot be undone easily. Ensure no holdings depend on this security.</Alert>
            <Box sx={{ mb:2 }}>
              <Typography variant="subtitle2" fontWeight={600}>ISIN:</Typography>
              <Typography>{deleteConfirm.security.isin}</Typography>
            </Box>
            <Box sx={{ mb:2 }}>
              <Typography variant="subtitle2" fontWeight={600}>Company Name:</Typography>
              <Typography>{deleteConfirm.security.companyName}</Typography>
            </Box>
            <Box sx={{ mb:2 }}>
              <Typography variant="subtitle2" fontWeight={600}>Total Shares:</Typography>
              <Typography>{deleteConfirm.security.totalShares?.toLocaleString()} shares</Typography>
            </Box>
            <Box sx={{ mb:2 }}>
              <Typography variant="subtitle2" fontWeight={600}>Allocated Shares:</Typography>
              <Typography>{deleteConfirm.security.allocatedShares?.toLocaleString()} shares</Typography>
            </Box>
            <Box sx={{ mb:2 }}>
              <Typography variant="subtitle2" fontWeight={600}>Status:</Typography>
              <StatusChip status={deleteConfirm.security.status} />
            </Box>
          </DialogContent>
          <DialogActions sx={{ px:3, pb:2 }}>
            <Button onClick={() => setDeleteConfirm(null)} disabled={deleteLoading}>Cancel</Button>
            <Button variant="contained" onClick={() => handleDelete(deleteConfirm.security)} disabled={deleteLoading} color="error">
              {deleteLoading ? 'Deleting...' : 'Confirm Delete'}
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </Box>
  );
}
