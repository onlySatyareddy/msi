import React, { useEffect, useState, useCallback } from 'react';
import {
  Box, Card, CardContent, Typography, Button, Table, TableBody, TableCell,
  TableHead, TableRow, Chip, CircularProgress, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, MenuItem, Grid, Alert,
  IconButton, Tooltip, Tabs, Tab, Badge, Divider
} from '@mui/material';
import { Add, Send, CheckCircle, Cancel, Visibility, Comment } from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import StatusChip from '../components/common/StatusChip';
import ConfirmDialog from '../components/common/ConfirmDialog';

export default function ComplaintsPage() {
  const { user } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(null);
  const [investors, setInvestors] = useState([]);
  const [securities, setSecurities] = useState([]);
  const [form, setForm] = useState({ title:'', description:'', investor:'', security:'' });
  const [formErr, setFormErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [tab, setTab] = useState(0);
  const [comment, setComment] = useState('');

  const isMaker = user?.role === 'MAKER';
  const canResolve = ['CHECKER','ADMIN'].includes(user?.role);
  const isAdmin = user?.role === 'ADMIN';

  const load = useCallback(async () => {
    setLoading(true);
    try { 
      const r = await api.get('/complaints'); 
      setComplaints(r.data.complaints); 
    }
    catch { enqueueSnackbar('Load failed', { variant:'error' }); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = async () => {
    const [ir, sr] = await Promise.all([
      api.get('/investors', { params:{ status:'APPROVED' } }),
      api.get('/securities', { params:{ status:'APPROVED' } })
    ]);
    setInvestors(ir.data.investors); 
    setSecurities(sr.data.securities);
    setCreateOpen(true);
  };

  const handleCreate = async () => {
    setFormErr(''); setSaving(true);
    try {
      await api.post('/complaints', { 
        ...form, 
        investor: form.investor || null,
        security: form.security || null
      });
      enqueueSnackbar('Complaint created!', { variant:'success' });
      setCreateOpen(false); 
      setForm({ title:'', description:'', investor:'', security:'' }); 
      load();
    } catch(err) { 
      setFormErr(err.response?.data?.message || 'Failed'); 
    } finally { setSaving(false); }
  };

  const handleAction = async (type, id, data) => {
    try {
      if (type === 'resolve') await api.post(`/complaints/${id}/resolve`, { resolution: data });
      if (type === 'close') await api.post(`/complaints/${id}/close`);
      if (type === 'comment') await api.post(`/complaints/${id}/comment`, { text: comment });
      enqueueSnackbar('Done', { variant:'success' }); 
      setConfirm(null); 
      setComment('');
      load();
      if (detailOpen) {
        const r = await api.get(`/complaints/${detailOpen._id}`);
        setDetailOpen(r.data.complaint);
      }
    } catch(err) { 
      enqueueSnackbar(err.response?.data?.message || 'Failed', { variant:'error' }); 
      setConfirm(null);
    }
  };

  const filteredComplaints = complaints.filter(c => {
    if (tab === 0) return true;
    if (tab === 1) return c.status === 'PENDING';
    if (tab === 2) return c.status === 'RESOLVED';
    if (tab === 3) return c.status === 'CLOSED';
    return true;
  });

  return (
    <Box>
      <Box sx={{ display:'flex', alignItems:'center', mb:3, gap:2 }}>
        <Typography variant="h5" fontWeight={700} color="#1a3c6e" sx={{ flex:1 }}>Complaints</Typography>
        {(isMaker || isAdmin) && (
          <Button variant="contained" startIcon={<Add />} onClick={openCreate} sx={{ bgcolor:'#1a3c6e' }}>
            New Complaint
          </Button>
        )}
      </Box>

      <Tabs value={tab} onChange={(e,v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="All" />
        <Tab label={<Badge badgeContent={complaints.filter(c=>c.status==='PENDING').length} color="error">Pending</Badge>} />
        <Tab label="Resolved" />
        <Tab label="Closed" />
      </Tabs>

      <Card>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Title</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Investor</TableCell>
              <TableCell>Security</TableCell>
              <TableCell>Created By</TableCell>
              <TableCell>Created At</TableCell>
              <TableCell align="center">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={7} align="center"><CircularProgress size={24} /></TableCell></TableRow>}
            {!loading && filteredComplaints.map(c => (
              <TableRow key={c._id} hover>
                <TableCell>
                  <Typography fontWeight={600} fontSize={13}>{c.title}</Typography>
                  <Typography fontSize={11} color="text.secondary" sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.description}
                  </Typography>
                </TableCell>
                <TableCell><StatusChip status={c.status} /></TableCell>
                <TableCell>{c.investor ? `${c.investor.fullName} (${c.investor.folioNumber})` : '—'}</TableCell>
                <TableCell>{c.security ? c.security.isin : '—'}</TableCell>
                <TableCell>
                  <Typography fontSize={12}>{c.createdBy?.name}</Typography>
                  <Chip label={c.createdBy?.role} size="small" sx={{ fontSize: '0.6rem', height: 16 }} />
                </TableCell>
                <TableCell sx={{ fontSize: 12 }}>{new Date(c.createdAt).toLocaleDateString()}</TableCell>
                <TableCell align="center">
                  <Tooltip title="View Details">
                    <IconButton size="small" onClick={() => setDetailOpen(c)}><Visibility fontSize="small" /></IconButton>
                  </Tooltip>
                  
                  {canResolve && c.status === 'PENDING' && (
                    <>
                      <Tooltip title="Resolve">
                        <IconButton size="small" color="success"
                          onClick={() => setConfirm({ type:'resolve', id:c._id, title:'Resolve Complaint', message:`Resolve "${c.title}"?`, severity:'success', requireResolution: true })}>
                          <CheckCircle fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      {isAdmin && (
                        <Tooltip title="Close">
                          <IconButton size="small" color="error"
                            onClick={() => setConfirm({ type:'close', id:c._id, title:'Close Complaint', message:`Close "${c.title}" without resolving?`, severity:'error' })}>
                            <Cancel fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {!loading && filteredComplaints.length === 0 && (
              <TableRow><TableCell colSpan={7} align="center" sx={{ color:'text.secondary', py:3 }}>No complaints found</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Create Dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle fontWeight={700}>Create New Complaint</DialogTitle>
        <DialogContent sx={{ pt:2 }}>
          {formErr && <Alert severity="error" sx={{ mb:2 }}>{formErr}</Alert>}
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField fullWidth size="small" label="Title *" value={form.title}
                onChange={e => setForm(v=>({...v,title:e.target.value}))} />
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth size="small" label="Description *" multiline rows={3} value={form.description}
                onChange={e => setForm(v=>({...v,description:e.target.value}))} />
            </Grid>
            <Grid item xs={12}>
              <TextField select fullWidth size="small" label="Related Investor (Optional)" value={form.investor}
                onChange={e => setForm(v=>({...v,investor:e.target.value}))}>
                <MenuItem value="">None</MenuItem>
                {investors.map(i => <MenuItem key={i._id} value={i._id}>{i.fullName} ({i.folioNumber})</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12}>
              <TextField select fullWidth size="small" label="Related Security (Optional)" value={form.security}
                onChange={e => setForm(v=>({...v,security:e.target.value}))}>
                <MenuItem value="">None</MenuItem>
                {securities.map(s => <MenuItem key={s._id} value={s._id}>{s.isin} - {s.companyName}</MenuItem>)}
              </TextField>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px:3, pb:2 }}>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate} disabled={saving} sx={{ bgcolor:'#1a3c6e' }}>
            {saving ? 'Creating...' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Detail Dialog */}
      {detailOpen && (
        <Dialog open={true} onClose={() => setDetailOpen(null)} maxWidth="md" fullWidth>
          <DialogTitle fontWeight={700}>Complaint Details</DialogTitle>
          <DialogContent>
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Typography variant="h6" fontWeight={700}>{detailOpen.title}</Typography>
                <StatusChip status={detailOpen.status} sx={{ mt: 1 }} />
              </Grid>
              
              <Grid item xs={12}>
                <Typography variant="subtitle2" color="text.secondary" fontWeight={700}>DESCRIPTION</Typography>
                <Typography>{detailOpen.description}</Typography>
              </Grid>

              {(detailOpen.investor || detailOpen.security) && (
                <Grid item xs={12}>
                  <Typography variant="subtitle2" color="text.secondary" fontWeight={700} mb={1}>RELATED TO</Typography>
                  {detailOpen.investor && (
                    <Chip label={`Investor: ${detailOpen.investor.fullName}`} size="small" sx={{ mr: 1 }} />
                  )}
                  {detailOpen.security && (
                    <Chip label={`Security: ${detailOpen.security.isin}`} size="small" />
                  )}
                </Grid>
              )}

              {detailOpen.resolution && (
                <Grid item xs={12}>
                  <Typography variant="subtitle2" color="text.secondary" fontWeight={700}>RESOLUTION</Typography>
                  <Alert severity="success">{detailOpen.resolution}</Alert>
                  <Typography fontSize={12} color="text.secondary" mt={0.5}>
                    Resolved by {detailOpen.resolvedBy?.name} on {new Date(detailOpen.resolvedAt).toLocaleString()}
                  </Typography>
                </Grid>
              )}

              <Grid item xs={12}>
                <Typography variant="subtitle2" color="text.secondary" fontWeight={700} mb={1}>COMMENTS</Typography>
                {detailOpen.comments?.map((com, i) => (
                  <Box key={i} sx={{ mb: 1, p: 1, bgcolor: '#f5f5f5', borderRadius: 1 }}>
                    <Typography fontSize={12} fontWeight={600}>{com.createdBy?.name} ({com.createdBy?.role})</Typography>
                    <Typography fontSize={13}>{com.text}</Typography>
                    <Typography fontSize={10} color="text.secondary">{new Date(com.createdAt).toLocaleString()}</Typography>
                  </Box>
                ))}
                {detailOpen.status !== 'CLOSED' && (
                  <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
                    <TextField fullWidth size="small" placeholder="Add a comment..." value={comment}
                      onChange={e => setComment(e.target.value)} />
                    <Button variant="contained" size="small" onClick={() => handleAction('comment', detailOpen._id)}
                      disabled={!comment.trim()} sx={{ bgcolor:'#1a3c6e' }}>
                      <Comment fontSize="small" />
                    </Button>
                  </Box>
                )}
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions>
            {canResolve && detailOpen.status === 'PENDING' && (
              <>
                <Button color="success" onClick={() => setConfirm({ type:'resolve', id:detailOpen._id, title:'Resolve Complaint', message:'Add resolution note:', severity:'success', requireResolution: true })}>
                  Resolve
                </Button>
                {isAdmin && (
                  <Button color="error" onClick={() => setConfirm({ type:'close', id:detailOpen._id, title:'Close Complaint', message:'Close without resolving?', severity:'error' })}>
                    Close
                  </Button>
                )}
              </>
            )}
            <Button onClick={() => setDetailOpen(null)}>Close</Button>
          </DialogActions>
        </Dialog>
      )}

      {confirm && <ConfirmDialog open={true} title={confirm.title} message={confirm.message}
        severity={confirm.severity} requireReason={confirm.requireResolution}
        onConfirm={data => handleAction(confirm.type, confirm.id, data)}
        onCancel={() => setConfirm(null)} />}
    </Box>
  );
}
