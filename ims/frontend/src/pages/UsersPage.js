import React, { useEffect, useState } from 'react';
import { Box, Card, Typography, Button, Table, TableBody, TableCell, TableHead, TableRow,
  Chip, Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, Grid, Alert, IconButton, Tooltip } from '@mui/material';
import { Add, Block, CheckCircle } from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import api from '../utils/api';

const ROLE_COLORS = { ADMIN:'error', CHECKER:'warning', MAKER:'primary' };

export default function UsersPage() {
  const { enqueueSnackbar } = useSnackbar();
  const [users, setUsers] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name:'', email:'', password:'', role:'MAKER' });
  const [formErr, setFormErr] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => api.get('/users').then(r => setUsers(r.data.users));
  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    setFormErr(''); setSaving(true);
    try {
      await api.post('/users', form);
      enqueueSnackbar('User created', { variant:'success' });
      setCreateOpen(false); setForm({ name:'', email:'', password:'', role:'MAKER' }); load();
    } catch(err) { setFormErr(err.response?.data?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  const toggleStatus = async (u) => {
    await api.patch(`/users/${u._id}/status`, { status: u.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' });
    load();
  };

  return (
    <Box>
      <Box sx={{ display:'flex', alignItems:'center', mb:3, gap:2 }}>
        <Typography variant="h5" fontWeight={700} color="#1a3c6e" sx={{ flex:1 }}>User Management</Typography>
        <Button variant="contained" startIcon={<Add />} onClick={() => setCreateOpen(true)} sx={{ bgcolor:'#1a3c6e' }}>New User</Button>
      </Box>
      <Card>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Role</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Created</TableCell>
              <TableCell align="center">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map(u => (
              <TableRow key={u._id} hover>
                <TableCell><Typography fontWeight={600}>{u.name}</Typography></TableCell>
                <TableCell sx={{ fontSize:13 }}>{u.email}</TableCell>
                <TableCell><Chip label={u.role} color={ROLE_COLORS[u.role]} size="small" /></TableCell>
                <TableCell><Chip label={u.status} color={u.status==='ACTIVE'?'success':'default'} size="small" /></TableCell>
                <TableCell sx={{ fontSize:12, color:'text.secondary' }}>{new Date(u.createdAt).toLocaleDateString()}</TableCell>
                <TableCell align="center">
                  <Tooltip title={u.status==='ACTIVE' ? 'Deactivate' : 'Activate'}>
                    <IconButton size="small" color={u.status==='ACTIVE'?'error':'success'} onClick={() => toggleStatus(u)}>
                      {u.status==='ACTIVE' ? <Block fontSize="small" /> : <CheckCircle fontSize="small" />}
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle fontWeight={700}>Create User</DialogTitle>
        <DialogContent sx={{ pt:2 }}>
          {formErr && <Alert severity="error" sx={{ mb:2 }}>{formErr}</Alert>}
          <Grid container spacing={2}>
            <Grid item xs={12}><TextField fullWidth size="small" label="Full Name *" value={form.name} onChange={e => setForm(v=>({...v,name:e.target.value}))} /></Grid>
            <Grid item xs={12}><TextField fullWidth size="small" label="Email *" type="email" value={form.email} onChange={e => setForm(v=>({...v,email:e.target.value}))} /></Grid>
            <Grid item xs={12}><TextField fullWidth size="small" label="Password *" type="password" value={form.password} onChange={e => setForm(v=>({...v,password:e.target.value}))} /></Grid>
            <Grid item xs={12}>
              <TextField select fullWidth size="small" label="Role" value={form.role} onChange={e => setForm(v=>({...v,role:e.target.value}))}>
                {['MAKER','CHECKER','ADMIN'].map(r => <MenuItem key={r} value={r}>{r}</MenuItem>)}
              </TextField>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px:3, pb:2 }}>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate} disabled={saving} sx={{ bgcolor:'#1a3c6e' }}>
            {saving ? 'Creating...' : 'Create User'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
