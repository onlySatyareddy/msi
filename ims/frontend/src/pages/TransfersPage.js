import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Box, Card, CardContent, Typography, Button, Table, TableBody, TableCell,
  TableHead, TableRow, Chip, CircularProgress, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, MenuItem, Grid, Alert,
  IconButton, Tooltip, Paper, Tabs, Tab, TableContainer, useMediaQuery, useTheme,
  Switch, FormControlLabel
} from '@mui/material';
import { Add, CheckCircle, Cancel, Send, Visibility, Lock, LockOpen, Delete } from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import StatusChip from '../components/common/StatusChip';
import ConfirmDialog from '../components/common/ConfirmDialog';

export default function TransfersPage() {
  const { user } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const { socket } = useSocket();
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(null);
  const [investors, setInvestors] = useState([]);
  const [holdings, setHoldings] = useState([]);
  const [securities, setSecurities] = useState([]);
  const [form, setForm] = useState({ fromInvestorId:'', toInvestorId:'', securityId:'', quantity:'', remarks:'' });
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
    try { const r = await api.get('/transfers'); setTransfers(r.data.transfers); }
    catch { enqueueSnackbar('Load failed', { variant:'error' }); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Keep stable ref to load function for socket handlers
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; }, [load]);

  // Listen for real-time updates from socket events
  useEffect(() => {
    if (!socket) return;

    const handleHoldingsUpdate = () => {
      console.log('Holdings updated, refreshing transfer list');
      loadRef.current();
    };

    const handleTransferUpdate = () => {
      console.log('Transfer updated, refreshing transfer list');
      loadRef.current();
    };

    const handleAllocationUpdate = () => {
      console.log('Allocation updated, refreshing transfer list');
      loadRef.current();
    };

    const handleSecurityUpdate = () => {
      console.log('Security updated, refreshing transfer list');
      loadRef.current();
    };

    socket.on('holdings_update', handleHoldingsUpdate);
    socket.on('transfer_update', handleTransferUpdate);
    socket.on('allocation_update', handleAllocationUpdate);
    socket.on('security_update', handleSecurityUpdate);

    return () => {
      socket.off('holdings_update', handleHoldingsUpdate);
      socket.off('transfer_update', handleTransferUpdate);
      socket.off('allocation_update', handleAllocationUpdate);
      socket.off('security_update', handleSecurityUpdate);
    };
  }, [socket]); // Only re-run when socket changes, not when load changes

  const openCreate = async () => {
    const [ir, sr] = await Promise.all([
      api.get('/investors', { params:{ status:'APPROVED' } }),
      api.get('/securities', { params:{ status:'APPROVED' } })
    ]);
    setInvestors(ir.data.investors); setSecurities(sr.data.securities);
    setCreateOpen(true);
  };

  // When fromInvestor changes, load their holdings
  const onFromChange = async (investorId) => {
    setForm(v => ({ ...v, fromInvestorId: investorId, securityId:'' }));
    if (investorId) {
      const r = await api.get('/holdings', { params:{ investorId } });
      setHoldings(r.data.holdings);
    }
  };

  const handleCreate = async () => {
    setFormErr(''); setSaving(true);
    try {
      await api.post('/transfers', { ...form, quantity: +form.quantity });
      enqueueSnackbar('Transfer initiated! Shares locked.', { variant:'success' });
      setCreateOpen(false); setForm({ fromInvestorId:'', toInvestorId:'', securityId:'', quantity:'', remarks:'' }); load();
    } catch(err) { setFormErr(err.response?.data?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  const handleAction = async (type, id, reason) => {
    if (actionLoading) return;
    setActionLoading(true);
    try {
      if (type === 'submit')  await api.post(`/transfers/${id}/submit`);
      if (type === 'approve') await api.post(`/transfers/${id}/approve`);
      if (type === 'reject')  await api.post(`/transfers/${id}/reject`, { reason });
      enqueueSnackbar('Done', { variant:'success' }); 
    } catch(err) { enqueueSnackbar(err.response?.data?.message || 'Failed', { variant: 'error' }); }
    finally {
      setConfirm(null);
      setActionLoading(false);
      load(); // ALWAYS reload data, even on error
    }
  };

  const handleDelete = async (transfer) => {
    if (deleteLoading) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/transfers/${transfer._id}`);
      enqueueSnackbar('Transfer deleted successfully', { variant:'success' });
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
        <Typography variant="h5" fontWeight={700} color="#1a3c6e" sx={{ flex:1 }}>Share Transfers</Typography>
        {user?.role === 'ADMIN' && (
          <FormControlLabel
            control={<Switch checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} size="small" />}
            label={<Typography fontSize={{ xs:11, sm:12 }}>Show Deleted</Typography>}
          />
        )}
        {(isMaker || user?.role==='ADMIN') && (
          <Button variant="contained" startIcon={<Add />} onClick={openCreate} sx={{ bgcolor:'#1a3c6e', fontSize:{ xs:11, sm:12 }, flex:{ xs:1, sm:'auto' }, minWidth:120, maxWidth:180 }}>Transfer</Button>
        )}
      </Box>

      <Card>
        <TableContainer sx={{ overflowX:'auto' }}>
          <Table size="small" sx={{ minWidth:{ xs:800, md:1000 } }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontSize:{ xs:11, sm:12 } }}>Date</TableCell>
                <TableCell sx={{ fontSize:{ xs:11, sm:12 } }}>From → To</TableCell>
                <TableCell sx={{ fontSize:{ xs:11, sm:12 } }}>Company</TableCell>
                <TableCell align="right" sx={{ fontSize:{ xs:11, sm:12 } }}>Qty</TableCell>
                <TableCell align="center" sx={{ fontSize:{ xs:11, sm:12 } }}>Sender Change</TableCell>
                <TableCell align="center" sx={{ fontSize:{ xs:11, sm:12 } }}>Receiver Change</TableCell>
                <TableCell sx={{ fontSize:{ xs:11, sm:12 } }}>Status</TableCell>
                <TableCell align="center" sx={{ fontSize:{ xs:11, sm:12 } }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={8} align="center"><CircularProgress size={24} /></TableCell></TableRow>}
              {!loading && transfers.filter(t => showDeleted || !t.isDeleted).map(t => (
                <TableRow key={t._id} hover sx={{ opacity: t.isDeleted ? 0.5 : 1, textDecoration: t.isDeleted ? 'line-through' : 'none' }}>
                  <TableCell sx={{ fontSize:{ xs:10, sm:12 } }}>{new Date(t.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Typography fontWeight={600} fontSize={{ xs:11, sm:13 }}>{t.fromInvestor?.fullName}</Typography>
                      <Typography fontSize={{ xs:10, sm:11 }} color="text.secondary">→</Typography>
                      <Typography fontWeight={600} fontSize={{ xs:11, sm:13 }}>{t.toInvestor?.fullName}</Typography>
                    </Box>
                    <Typography fontSize={{ xs:9, sm:10 }} color="text.secondary">{t.fromInvestor?.folioNumber} → {t.toInvestor?.folioNumber}</Typography>
                  </TableCell>
                  <TableCell>
                    <Chip label={t.security?.isin} size="small" variant="outlined" sx={{ fontFamily:'monospace', fontWeight: 700, fontSize:{ xs:10, sm:12 } }} />
                    <Typography fontSize={{ xs:10, sm:11 }} color="text.secondary">{t.security?.companyName}</Typography>
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight:700, fontSize:{ xs:11, sm:12 } }}>{t.quantity?.toLocaleString()}</TableCell>
                <TableCell align="center">
                  {t.afterFromShares !== null ? (
                    <Typography sx={{ color: '#c62828', fontWeight: 700, fontFamily: 'monospace' }}>
                      {t.beforeFromShares?.toLocaleString()} → {t.afterFromShares?.toLocaleString()} 🔴
                    </Typography>
                  ) : (
                    <Box sx={{ color: 'text.disabled', fontSize: 12 }}>
                      {t.beforeFromShares?.toLocaleString()} → Pending
                      {t.lockedQuantity > 0 && (
                        <Chip icon={<Lock sx={{ fontSize:'0.7rem !important' }} />} label={`Locked: ${t.lockedQuantity}`} size="small" color="warning" sx={{ ml:0.5, height:16, fontSize:'0.6rem' }} />
                      )}
                    </Box>
                  )}
                </TableCell>
                <TableCell align="center">
                  {t.afterToShares !== null ? (
                    <Typography sx={{ color: '#2e7d32', fontWeight: 700, fontFamily: 'monospace' }}>
                      {t.beforeToShares?.toLocaleString()} → {t.afterToShares?.toLocaleString()} 🟢
                    </Typography>
                  ) : (
                    <Typography sx={{ color: 'text.disabled', fontSize: 12 }}>
                      {t.beforeToShares?.toLocaleString()} → Pending
                    </Typography>
                  )}
                </TableCell>
                <TableCell><StatusChip status={t.status} /></TableCell>
                <TableCell align="center">
                  {!t.isDeleted && user?.role === 'ADMIN' && ['INITIATED'].includes(t.status) && (
                    <Tooltip title="Delete">
                      <IconButton size="small" color="error" disabled={deleteLoading}
                        onClick={() => setDeleteConfirm({ transfer: t })}>
                        <Delete fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                  <Tooltip title="View Details"><IconButton size="small" onClick={() => setDetailOpen(t)}><Visibility fontSize="small" /></IconButton></Tooltip>
                  {(isMaker || user?.role==='ADMIN') && t.status === 'INITIATED' && t.createdBy?._id === user?._id && !t.isDeleted && (
                    <Tooltip title="Submit for Review"><IconButton size="small" color="primary"
                      onClick={() => setConfirm({ type:'submit', id:t._id, title:'Submit Transfer', message:'Submit this transfer for checker review?', severity:'info' })}>
                      <Send fontSize="small" /></IconButton></Tooltip>
                  )}
                  {canApprove && t.status === 'UNDER_REVIEW' && !t.isDeleted && (
                    <>
                      <Tooltip title="Approve & Execute"><IconButton size="small" color="success"
                        onClick={() => setConfirm({ type:'approve', id:t._id, title:'Approve & Execute Transfer', message:`Approve transfer of ${t.quantity} shares from ${t.fromInvestor?.fullName} to ${t.toInvestor?.fullName}? This will IMMEDIATELY execute the transfer.`, severity:'success' })}>
                        <CheckCircle fontSize="small" /></IconButton></Tooltip>
                      <Tooltip title="Reject"><IconButton size="small" color="error"
                        onClick={() => setConfirm({ type:'reject', id:t._id, title:'Reject Transfer', message:'Shares will be unlocked upon rejection.', severity:'error', requireReason:true })}>
                        <Cancel fontSize="small" /></IconButton></Tooltip>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {!loading && transfers.filter(t => showDeleted || !t.isDeleted).length === 0 && <TableRow><TableCell colSpan={8} align="center" sx={{ color:'text.secondary', py:3 }}>No transfers</TableCell></TableRow>}
          </TableBody>
        </Table>
        </TableContainer>
      </Card>

      {/* Initiate Dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth fullScreen={fullScreenDialog}>
        <DialogTitle fontWeight={700}>Initiate Share Transfer</DialogTitle>
        <DialogContent sx={{ pt:2 }}>
          {formErr && <Alert severity="error" sx={{ mb:2 }}>{formErr}</Alert>}
          <Alert severity="info" sx={{ mb:2, fontSize:12 }}>Shares will be locked immediately upon initiation. Transfer executes only after Checker/Admin approval.</Alert>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField select fullWidth size="small" label="From Investor *" value={form.fromInvestorId} onChange={e => onFromChange(e.target.value)}>
                {investors.map(i => <MenuItem key={i._id} value={i._id}>{i.fullName} ({i.folioNumber})</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12}>
              <TextField select fullWidth size="small" label="To Investor *" value={form.toInvestorId} onChange={e => setForm(v=>({...v,toInvestorId:e.target.value}))}>
                {investors.filter(i => i._id !== form.fromInvestorId).map(i => <MenuItem key={i._id} value={i._id}>{i.fullName} ({i.folioNumber})</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12}>
              <TextField select fullWidth size="small" label="Security *" value={form.securityId} onChange={e => setForm(v=>({...v,securityId:e.target.value}))}>
                {holdings.map(h => <MenuItem key={h.security?._id} value={h.security?._id}>{h.security?.isin} — Available: {h.availableShares?.toLocaleString()}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={6}><TextField fullWidth size="small" label="Quantity *" type="number" value={form.quantity} onChange={e => setForm(v=>({...v,quantity:e.target.value}))} /></Grid>
            <Grid item xs={12}><TextField fullWidth size="small" label="Remarks" value={form.remarks} onChange={e => setForm(v=>({...v,remarks:e.target.value}))} /></Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px:3, pb:2 }}>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate} disabled={saving} sx={{ bgcolor:'#1a3c6e' }}>
            {saving ? 'Initiating...' : 'Initiate (Lock Shares)'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Detail Dialog */}
      {detailOpen && (
        <Dialog open={true} onClose={() => setDetailOpen(null)} maxWidth="md" fullWidth>
          <DialogTitle fontWeight={700}>Transfer Details</DialogTitle>
          <DialogContent>
            <Grid container spacing={3}>
              <Grid item xs={6}>
                <Typography variant="subtitle2" color="text.secondary" fontWeight={700} mb={1}>FROM INVESTOR</Typography>
                <Paper variant="outlined" sx={{ p:2, borderRadius:2, borderColor:'#c62828' }}>
                  <Typography fontWeight={700}>{detailOpen.fromInvestor?.fullName}</Typography>
                  <Typography fontSize={12} color="text.secondary">{detailOpen.fromInvestor?.folioNumber}</Typography>
                  <Box sx={{ mt:1.5, display:'flex', gap:2 }}>
                    <Box sx={{ textAlign:'center' }}>
                      <Typography fontSize={10} color="text.secondary">BEFORE</Typography>
                      <Typography fontWeight={800} fontSize={22} color="#1565c0">{detailOpen.beforeFromShares?.toLocaleString()}</Typography>
                    </Box>
                    <Typography sx={{ alignSelf:'center', fontSize:20 }}>→</Typography>
                    <Box sx={{ textAlign:'center' }}>
                      <Typography fontSize={10} color="text.secondary">AFTER</Typography>
                      <Typography fontWeight={800} fontSize={22} color={detailOpen.afterFromShares !== null ? '#c62828' : '#999'}>
                        {detailOpen.afterFromShares !== null ? detailOpen.afterFromShares?.toLocaleString() : 'Pending'}
                      </Typography>
                    </Box>
                    <Box sx={{ textAlign:'center' }}>
                      <Typography fontSize={10} color="text.secondary">LOCKED</Typography>
                      <Typography fontWeight={700} fontSize={18} color="#e65100">{detailOpen.lockedQuantity?.toLocaleString()}</Typography>
                    </Box>
                  </Box>
                </Paper>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="subtitle2" color="text.secondary" fontWeight={700} mb={1}>TO INVESTOR</Typography>
                <Paper variant="outlined" sx={{ p:2, borderRadius:2, borderColor:'#2e7d32' }}>
                  <Typography fontWeight={700}>{detailOpen.toInvestor?.fullName}</Typography>
                  <Typography fontSize={12} color="text.secondary">{detailOpen.toInvestor?.folioNumber}</Typography>
                  <Box sx={{ mt:1.5, display:'flex', gap:2 }}>
                    <Box sx={{ textAlign:'center' }}>
                      <Typography fontSize={10} color="text.secondary">BEFORE</Typography>
                      <Typography fontWeight={800} fontSize={22} color="#1565c0">{detailOpen.beforeToShares?.toLocaleString()}</Typography>
                    </Box>
                    <Typography sx={{ alignSelf:'center', fontSize:20 }}>→</Typography>
                    <Box sx={{ textAlign:'center' }}>
                      <Typography fontSize={10} color="text.secondary">AFTER</Typography>
                      <Typography fontWeight={800} fontSize={22} color={detailOpen.afterToShares !== null ? '#2e7d32' : '#999'}>
                        {detailOpen.afterToShares !== null ? detailOpen.afterToShares?.toLocaleString() : 'Pending'}
                      </Typography>
                    </Box>
                  </Box>
                </Paper>
              </Grid>
              <Grid item xs={12}>
                <Typography variant="subtitle2" fontWeight={700} mb={1}>AUDIT TRAIL</Typography>
                {detailOpen.auditHistory?.map((h, i) => (
                  <Box key={i} sx={{ display:'flex', gap:2, py:1, borderBottom:'1px solid #f0f0f0', alignItems:'center' }}>
                    <Chip label={h.action} size="small" variant="outlined" sx={{ minWidth:160, fontFamily:'monospace', fontSize:'0.65rem' }} />
                    <Typography fontSize={12} color="text.secondary">{new Date(h.performedAt).toLocaleString()}</Typography>
                    {h.remarks && <Typography fontSize={12} color="text.secondary" sx={{ fontStyle:'italic' }}>"{h.remarks}"</Typography>}
                  </Box>
                ))}
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions><Button onClick={() => setDetailOpen(null)}>Close</Button></DialogActions>
        </Dialog>
      )}

      {confirm && <ConfirmDialog open={true} title={confirm.title} message={confirm.message}
        severity={confirm.severity} requireReason={confirm.requireReason}
        onConfirm={reason => handleAction(confirm.type, confirm.id, reason)}
        onCancel={() => setConfirm(null)} />}

      {deleteConfirm && (
        <Dialog open={true} onClose={() => setDeleteConfirm(null)} maxWidth="sm" fullWidth fullScreen={fullScreenDialog}>
          <DialogTitle fontWeight={700}>Confirm Delete</DialogTitle>
          <DialogContent>
            <Alert severity="warning" sx={{ mb:2 }}>This action will unlock locked shares and cannot be undone easily.</Alert>
            <Box sx={{ mb:2 }}>
              <Typography variant="subtitle2" fontWeight={600}>From Investor:</Typography>
              <Typography>{deleteConfirm.transfer.fromInvestor?.fullName} ({deleteConfirm.transfer.fromInvestor?.folioNumber})</Typography>
            </Box>
            <Box sx={{ mb:2 }}>
              <Typography variant="subtitle2" fontWeight={600}>To Investor:</Typography>
              <Typography>{deleteConfirm.transfer.toInvestor?.fullName} ({deleteConfirm.transfer.toInvestor?.folioNumber})</Typography>
            </Box>
            <Box sx={{ mb:2 }}>
              <Typography variant="subtitle2" fontWeight={600}>Security:</Typography>
              <Typography>{deleteConfirm.transfer.security?.isin} - {deleteConfirm.transfer.security?.companyName}</Typography>
            </Box>
            <Box sx={{ mb:2 }}>
              <Typography variant="subtitle2" fontWeight={600}>Shares Impact:</Typography>
              <Typography>{deleteConfirm.transfer.quantity?.toLocaleString()} shares</Typography>
            </Box>
            <Box sx={{ mb:2 }}>
              <Typography variant="subtitle2" fontWeight={600}>Locked Shares:</Typography>
              <Typography>{deleteConfirm.transfer.lockedQuantity?.toLocaleString() || 0} shares (will be unlocked)</Typography>
            </Box>
            <Box sx={{ mb:2 }}>
              <Typography variant="subtitle2" fontWeight={600}>Status:</Typography>
              <StatusChip status={deleteConfirm.transfer.status} />
            </Box>
          </DialogContent>
          <DialogActions sx={{ px:3, pb:2 }}>
            <Button onClick={() => setDeleteConfirm(null)} disabled={deleteLoading}>Cancel</Button>
            <Button variant="contained" onClick={() => handleDelete(deleteConfirm.transfer)} disabled={deleteLoading} color="error">
              {deleteLoading ? 'Deleting...' : 'Confirm Delete'}
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </Box>
  );
}
