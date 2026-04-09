import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Box, Card, Typography, Button, Table, TableBody, TableCell, TableHead, TableRow,
  CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  MenuItem, Grid, Alert, IconButton, Tooltip, Chip, TableContainer, Collapse, useMediaQuery, useTheme,
  Switch, FormControlLabel
} from '@mui/material';
import { Add, CheckCircle, Cancel, ExpandMore, ExpandLess, Delete } from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import StatusChip from '../components/common/StatusChip';
import ConfirmDialog from '../components/common/ConfirmDialog';

export default function HoldingsPage() {
  const { user } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const { socket } = useSocket();
  const [holdings, setHoldings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedInvestors, setExpandedInvestors] = useState({});
  const [createOpen, setCreateOpen] = useState(false);
  const [investors, setInvestors] = useState([]);
  const [securities, setSecurities] = useState([]);
  const [form, setForm] = useState({ investorId:'', securityId:'', shares:'', lockedShares:'', remarks:'' });
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
    try {
      const r = await api.get('/holdings');
      setHoldings(r.data.holdings);
    } catch (err) {
      console.error('Failed to load holdings:', err);
      enqueueSnackbar('Failed to load holdings', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [enqueueSnackbar]);

  useEffect(() => {
    load();
  }, [load]);

  // Keep stable ref to load function for socket handlers
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; }, [load]);

  // Listen for real-time updates from socket events
  useEffect(() => {
    if (!socket) return;

    const handleHoldingUpdate = () => {
      console.log('Holding updated, refreshing holdings page');
      loadRef.current();
    };

    const handleAllocationUpdate = () => {
      console.log('Allocation updated, refreshing holdings page');
      loadRef.current();
    };

    const handleTransferUpdate = () => {
      console.log('Transfer updated, refreshing holdings page');
      loadRef.current();
    };

    const handleSecurityUpdate = () => {
      console.log('Security updated, refreshing holdings page');
      loadRef.current();
    };

    socket.on('holding_update', handleHoldingUpdate);
    socket.on('allocation_update', handleAllocationUpdate);
    socket.on('transfer_update', handleTransferUpdate);
    socket.on('security_update', handleSecurityUpdate);

    return () => {
      socket.off('holding_update', handleHoldingUpdate);
      socket.off('allocation_update', handleAllocationUpdate);
      socket.off('transfer_update', handleTransferUpdate);
      socket.off('security_update', handleSecurityUpdate);
    };
  }, [socket]); // Only re-run when socket changes, not when load changes

  const openCreate = async () => {
    const [ir, sr] = await Promise.all([
      api.get('/investors', { params: { status:'APPROVED' } }),
      api.get('/securities', { params: { status:'APPROVED' } })
    ]);
    setInvestors(ir.data.investors);
    setSecurities(sr.data.securities);
    setCreateOpen(true);
  };

  const isFormValid = () => {
    return form.investorId && form.securityId && form.shares && +form.shares >= 0;
  };

  const handleCreate = async () => {
    setFormErr('');
    if (!form.investorId) {
      setFormErr('Please select an Investor');
      return;
    }
    if (!form.securityId) {
      setFormErr('Please select a Security');
      return;
    }
    if (!form.shares || isNaN(form.shares) || +form.shares < 0) {
      setFormErr('Please enter valid Shares (>= 0)');
      return;
    }

    setSaving(true);
    try {
      await api.post('/holdings', { ...form, shares: +form.shares, lockedShares: form.lockedShares ? +form.lockedShares : 0 });
      enqueueSnackbar('Holding created (pending approval)', { variant:'success' });
      setCreateOpen(false);
      setForm({ investorId:'', securityId:'', shares:'', lockedShares:'', remarks:'' });
      load();
    } catch(err) {
      setFormErr(err.response?.data?.message || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const handleAction = async (type, id, reason) => {
    if (actionLoading) return;
    setActionLoading(true);
    try {
      if (type === 'approve') await api.post(`/holdings/${id}/approve`);
      else await api.post(`/holdings/${id}/reject`, { reason });
      enqueueSnackbar('Done', { variant:'success' });
      setConfirm(null);
    } catch(err) {
      enqueueSnackbar(err.response?.data?.message || 'Failed', { variant:'error' });
    } finally {
      setConfirm(null);
      setActionLoading(false);
      load(); // ALWAYS reload data, even on error
    }
  };

  const handleDelete = async (holding) => {
    if (deleteLoading) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/holdings/${holding._id}`);
      enqueueSnackbar('Holding deleted successfully', { variant:'success' });
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
  const canCreate = ['MAKER','ADMIN'].includes(user?.role);

  // Listen for real-time updates from socket events
  useEffect(() => {
    const handleHoldingsUpdate = () => {
      console.log('Holdings updated, refreshing holdings page');
      load();
    };

    const handleTransferUpdate = () => {
      console.log('Transfer updated, refreshing holdings page');
      load();
    };

    window.addEventListener('holdings_update', handleHoldingsUpdate);
    window.addEventListener('transfer_update', handleTransferUpdate);

    return () => {
      window.removeEventListener('holdings_update', handleHoldingsUpdate);
      window.removeEventListener('transfer_update', handleTransferUpdate);
    };
  }, [load]);

  // Group holdings by investor
  const groupedHoldings = React.useMemo(() => {
    const groups = {};
    holdings.forEach(h => {
      const investorId = h.investor?._id;
      if (!groups[investorId]) {
        groups[investorId] = {
          investor: h.investor,
          holdings: []
        };
      }
      groups[investorId].holdings.push(h);
    });
    return Object.values(groups);
  }, [holdings]);

  // Calculate totals for an investor
  const calculateInvestorTotals = (investorHoldings) => {
    return investorHoldings.reduce((acc, h) => ({
      totalShares: acc.totalShares + (h.shares || 0),
      lockedShares: acc.lockedShares + (h.lockedShares || 0),
      availableShares: acc.availableShares + (h.availableShares || 0)
    }), { totalShares: 0, lockedShares: 0, availableShares: 0 });
  };

  const toggleExpand = (investorId) => {
    setExpandedInvestors(prev => ({
      ...prev,
      [investorId]: !prev[investorId]
    }));
  };

  return (
    <Box>
      <Box sx={{ display:'flex', alignItems:'center', mb:{ xs: 2, sm: 3 }, gap:2, flexDirection:{ xs:'column', sm:'row' } }}>
        <Typography variant="h5" fontWeight={700} color="#1a3c6e" sx={{ flex:1 }}>Holdings</Typography>
        {user?.role === 'ADMIN' && (
          <FormControlLabel
            control={<Switch checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} size="small" />}
            label={<Typography fontSize={{ xs:11, sm:12 }}>Show Deleted</Typography>}
          />
        )}
        {canCreate && (
          <Button variant="contained" startIcon={<Add />} onClick={openCreate} sx={{ bgcolor:'#1a3c6e', fontSize:{ xs:11, sm:12 }, flex:{ xs:1, sm:'auto' }, minWidth:120, maxWidth:180 }}>Create Holding</Button>
        )}
      </Box>
      <Card>
        <TableContainer sx={{ overflowX:'auto' }}>
          <Table size="small" sx={{ minWidth:{ xs:600, md:800 } }}>
            <TableHead>
              <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                <TableCell sx={{ width: 40 }}></TableCell>
                <TableCell>Investor</TableCell>
                <TableCell>Folio</TableCell>
                <TableCell>Security (ISIN)</TableCell>
                <TableCell align="right">Shares</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Created By</TableCell>
                <TableCell align="center">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={8} align="center"><CircularProgress size={24} /></TableCell></TableRow>}
              {!loading && groupedHoldings.map(group => {
                const investorId = group.investor?._id;
                const isExpanded = expandedInvestors[investorId];
                const totals = calculateInvestorTotals(group.holdings);

                return (
                  <React.Fragment key={investorId}>
                    <TableRow hover sx={{ cursor: 'pointer' }} onClick={() => toggleExpand(investorId)}>
                      <TableCell>
                        <IconButton size="small" sx={{ p: 0.5 }}>
                          {isExpanded ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
                        </IconButton>
                      </TableCell>
                      <TableCell>
                        <Typography fontWeight={600} fontSize={{ xs:11, sm:13 }}>{group.investor?.fullName}</Typography>
                        <Typography fontSize={{ xs:10, sm:11 }} color="text.secondary">{group.holdings.length} securities</Typography>
                      </TableCell>
                      <TableCell><Chip label={group.investor?.folioNumber} size="small" variant="outlined" sx={{ fontFamily:'monospace' }} /></TableCell>
                      <TableCell>—</TableCell>
                      <TableCell align="right" sx={{ fontWeight:700, fontSize:{ xs:13, sm:15 } }}>{totals.totalShares.toLocaleString()}</TableCell>
                      <TableCell>—</TableCell>
                      <TableCell>—</TableCell>
                      <TableCell align="center">—</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={8} sx={{ p: 0, border: 'none' }}>
                        <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                          <Box sx={{ p: 2, bgcolor: '#fafafa' }}>
                            <Typography variant="subtitle2" fontWeight={600} mb={2} color="#1a3c6e">
                              Holdings Details
                            </Typography>
                            <Table size="small">
                              <TableHead>
                                <TableRow sx={{ bgcolor: '#e8e8e8' }}>
                                  <TableCell>Security (ISIN)</TableCell>
                                  <TableCell>Company</TableCell>
                                  <TableCell align="right">Shares</TableCell>
                                  <TableCell>Status</TableCell>
                                  <TableCell>Created By</TableCell>
                                  <TableCell align="center">Actions</TableCell>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {group.holdings.filter(h => showDeleted || !h.isDeleted).map(h => (
                                  <TableRow key={h._id} hover sx={{ opacity: h.isDeleted ? 0.5 : 1, textDecoration: h.isDeleted ? 'line-through' : 'none' }}>
                                    <TableCell>
                                      <Chip label={h.security?.isin} size="small" variant="outlined" sx={{ fontFamily:'monospace', fontWeight:700 }} />
                                    </TableCell>
                                    <TableCell>
                                      <Typography fontSize={12}>{h.security?.companyName}</Typography>
                                    </TableCell>
                                    <TableCell align="right" sx={{ fontWeight:600 }}>{h.shares?.toLocaleString()}</TableCell>
                                    <TableCell><StatusChip status={h.status} /></TableCell>
                                    <TableCell><Typography fontSize={11}>{h.createdBy?.name || '—'}</Typography></TableCell>
                                    <TableCell align="center">
                                      {!h.isDeleted && user?.role === 'ADMIN' && ['PENDING','REJECTED'].includes(h.status) && (
                                        <Tooltip title="Delete">
                                          <IconButton size="small" color="error" disabled={deleteLoading}
                                            onClick={(e) => { e.stopPropagation(); setDeleteConfirm({ holding: h, investor: group.investor }); }}>
                                            <Delete fontSize="small" />
                                          </IconButton>
                                        </Tooltip>
                                      )}
                                      {canApprove && h.status === 'PENDING' && !h.isDeleted && (
                                        <>
                                          <Tooltip title="Approve"><IconButton size="small" color="success"
                                            onClick={(e) => { e.stopPropagation(); setConfirm({ type:'approve', id:h._id, title:'Approve Holding', message:`Approve ${h.shares} shares for ${group.investor?.fullName}?`, severity:'success' }); }}>
                                            <CheckCircle fontSize="small" /></IconButton></Tooltip>
                                          <Tooltip title="Reject"><IconButton size="small" color="error"
                                            onClick={(e) => { e.stopPropagation(); setConfirm({ type:'reject', id:h._id, title:'Reject Holding', message:'Provide rejection reason:', severity:'error', requireReason:true }); }}>
                                            <Cancel fontSize="small" /></IconButton></Tooltip>
                                        </>
                                      )}
                                      {h.rejectionReason && <Tooltip title={h.rejectionReason}><Chip label="Rejected" size="small" color="error" variant="outlined" sx={{ fontSize:'0.6rem' }} /></Tooltip>}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </Box>
                        </Collapse>
                      </TableCell>
                    </TableRow>
                  </React.Fragment>
                );
              })}
              {!loading && groupedHoldings.length === 0 && <TableRow><TableCell colSpan={8} align="center" sx={{ color:'text.secondary', py:3 }}>No holdings yet</TableCell></TableRow>}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth fullScreen={fullScreenDialog}>
        <DialogTitle fontWeight={700}>Create Holding</DialogTitle>
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
                {securities.map(s => <MenuItem key={s._id} value={s._id}>{s.isin} — {s.companyName}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={6}><TextField fullWidth size="small" label="Shares *" type="number" value={form.shares} onChange={e => setForm(v=>({...v,shares:e.target.value}))} /></Grid>
            <Grid item xs={6}><TextField fullWidth size="small" label="Locked Shares" type="number" value={form.lockedShares} onChange={e => setForm(v=>({...v,lockedShares:e.target.value}))} /></Grid>
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
              <Typography>{deleteConfirm.investor?.fullName} ({deleteConfirm.investor?.folioNumber})</Typography>
            </Box>
            <Box sx={{ mb:2 }}>
              <Typography variant="subtitle2" fontWeight={600}>Security:</Typography>
              <Typography>{deleteConfirm.holding.security?.isin} - {deleteConfirm.holding.security?.companyName}</Typography>
            </Box>
            <Box sx={{ mb:2 }}>
              <Typography variant="subtitle2" fontWeight={600}>Shares Impact:</Typography>
              <Typography>{deleteConfirm.holding.shares?.toLocaleString()} shares</Typography>
            </Box>
            <Box sx={{ mb:2 }}>
              <Typography variant="subtitle2" fontWeight={600}>Locked Shares:</Typography>
              <Typography>{deleteConfirm.holding.lockedShares?.toLocaleString() || 0} shares</Typography>
            </Box>
            <Box sx={{ mb:2 }}>
              <Typography variant="subtitle2" fontWeight={600}>Status:</Typography>
              <StatusChip status={deleteConfirm.holding.status} />
            </Box>
          </DialogContent>
          <DialogActions sx={{ px:3, pb:2 }}>
            <Button onClick={() => setDeleteConfirm(null)} disabled={deleteLoading}>Cancel</Button>
            <Button variant="contained" onClick={() => handleDelete(deleteConfirm.holding)} disabled={deleteLoading} color="error">
              {deleteLoading ? 'Deleting...' : 'Confirm Delete'}
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </Box>
  );
}
