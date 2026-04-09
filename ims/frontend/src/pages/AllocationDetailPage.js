import React, { useEffect, useState, useCallback } from 'react';
import {
  Box, Card, Typography, Button, CircularProgress, Chip, Grid, Divider,
  Alert, Dialog, DialogTitle, DialogContent, DialogActions, TextField
} from '@mui/material';
import { ArrowBack, CheckCircle, Cancel } from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import StatusChip from '../components/common/StatusChip';
import ConfirmDialog from '../components/common/ConfirmDialog';

export default function AllocationDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const [allocation, setAllocation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get(`/allocations/${id}`);
      setAllocation(r.data.allocation);
    } catch (err) {
      console.error('Failed to load allocation:', err);
      if (err.response?.status === 404) {
        enqueueSnackbar('Allocation not found. Redirecting to allocations list...', { variant: 'error' });
        // Redirect to allocations list after a short delay
        setTimeout(() => navigate('/app/allocations'), 2000);
      } else {
        enqueueSnackbar('Failed to load allocation', { variant: 'error' });
      }
    } finally {
      setLoading(false);
    }
  }, [id, enqueueSnackbar, navigate]);

  useEffect(() => { load(); }, [load]);

  const handleAction = async (type, reason) => {
    try {
      if (type === 'approve') {
        await api.post(`/allocations/${id}/approve`);
      } else {
        await api.post(`/allocations/${id}/reject`, { reason });
      }
      enqueueSnackbar('Done', { variant: 'success' });
      setConfirm(null);
      load();
    } catch (err) {
      enqueueSnackbar(err.response?.data?.message || 'Failed', { variant: 'error' });
      setConfirm(null);
    }
  };

  const canApprove = ['CHECKER', 'ADMIN'].includes(user?.role);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!allocation) {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <Typography variant="h6" color="text.secondary">Allocation not found</Typography>
        <Button onClick={() => navigate('/app/allocations')} sx={{ mt: 2 }}>Back to Allocations</Button>
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 2 }}>
        <Button startIcon={<ArrowBack />} onClick={() => navigate('/app/allocations')}>
          Back
        </Button>
        <Typography variant="h5" fontWeight={700} color="#1a3c6e">
          Allocation Details
        </Typography>
      </Box>

      <Card sx={{ p: 3, mb: 2 }}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>Investor</Typography>
            <Typography fontWeight={600}>{allocation.investor?.fullName}</Typography>
            <Typography variant="body2" color="text.secondary">Folio: {allocation.investor?.folioNumber}</Typography>
          </Grid>
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>Security</Typography>
            <Chip 
              label={allocation.security?.isin} 
              size="small" 
              variant="outlined" 
              sx={{ fontFamily: 'monospace', fontWeight: 700, mb: 1 }} 
            />
            <Typography variant="body2">{allocation.security?.companyName}</Typography>
          </Grid>
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>Quantity</Typography>
            <Typography variant="h4" fontWeight={700} color="#1a3c6e">
              {allocation.quantity?.toLocaleString()}
            </Typography>
          </Grid>
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>Status</Typography>
            <StatusChip status={allocation.status} />
          </Grid>
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>Created By</Typography>
            <Typography>{allocation.createdBy?.name || '—'}</Typography>
            <Typography variant="body2" color="text.secondary">
              {new Date(allocation.createdAt).toLocaleString()}
            </Typography>
          </Grid>
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>Approved By</Typography>
            <Typography>{allocation.approvedBy?.name || '—'}</Typography>
            {allocation.approvedAt && (
              <Typography variant="body2" color="text.secondary">
                {new Date(allocation.approvedAt).toLocaleString()}
              </Typography>
            )}
          </Grid>
          {allocation.remarks && (
            <Grid item xs={12}>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>Remarks</Typography>
              <Typography>{allocation.remarks}</Typography>
            </Grid>
          )}
          {allocation.rejectionReason && (
            <Grid item xs={12}>
              <Alert severity="error" sx={{ mt: 2 }}>
                <Typography fontWeight={600}>Rejection Reason:</Typography>
                <Typography>{allocation.rejectionReason}</Typography>
              </Alert>
            </Grid>
          )}
        </Grid>

        <Divider sx={{ my: 3 }} />

        <Box sx={{ display: 'flex', gap: 2 }}>
          {canApprove && allocation.status === 'PENDING' && (
            <>
              <Button
                variant="contained"
                startIcon={<CheckCircle />}
                onClick={() => setConfirm({
                  type: 'approve',
                  title: 'Approve Allocation',
                  message: `Approve ${allocation.quantity?.toLocaleString()} shares to ${allocation.investor?.fullName}?`,
                  severity: 'success'
                })}
                sx={{ bgcolor: '#2e7d32' }}
              >
                Approve
              </Button>
              <Button
                variant="contained"
                startIcon={<Cancel />}
                onClick={() => setConfirm({
                  type: 'reject',
                  title: 'Reject Allocation',
                  message: 'Provide rejection reason:',
                  severity: 'error',
                  requireReason: true
                })}
                sx={{ bgcolor: '#c62828' }}
              >
                Reject
              </Button>
            </>
          )}
        </Box>
      </Card>

      {confirm && (
        <ConfirmDialog
          open={true}
          title={confirm.title}
          message={confirm.message}
          severity={confirm.severity}
          requireReason={confirm.requireReason}
          onConfirm={handleAction}
          onCancel={() => setConfirm(null)}
        />
      )}
    </Box>
  );
}
