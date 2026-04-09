import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Card, CardContent, Typography, Table, TableBody, TableCell,
  TableHead, TableRow, Chip, CircularProgress, LinearProgress,
  Button, IconButton, Tooltip, Tabs, Tab, Divider, Grid, Paper
} from '@mui/material';
import { ArrowBack, SwapHoriz, TrendingUp, AccountBalance } from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import api from '../utils/api';
import StatusChip from '../components/common/StatusChip';

export default function SecurityDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const [security, setSecurity] = useState(null);
  const [holdings, setHoldings] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sr, hr, tr] = await Promise.all([
        api.get(`/securities/${id}`),
        api.get('/holdings', { params: { securityId: id } }),
        api.get('/transfers', { params: { securityId: id } })
      ]);
      setSecurity(sr.data.security);
      setHoldings(hr.data.holdings);
      setTransfers(tr.data.transfers.filter(t => t.status === 'EXECUTED' || t.status === 'APPROVED'));
      setError(null);
    } catch (err) {
      const status = err.response?.status;
      if (status === 404) {
        setError('Security not found');
        enqueueSnackbar('Security not found', { variant: 'error' });
        navigate('/app/securities');
      } else {
        setError('Failed to load security details');
        enqueueSnackbar('Failed to load security details', { variant: 'error' });
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!security) return null;

  const totalAllocated = holdings.reduce((sum, h) => sum + (h.shares || 0), 0);
  const allocationPct = security.totalShares > 0 ? (totalAllocated / security.totalShares * 100) : 0;

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 2 }}>
        <IconButton onClick={() => navigate('/app/securities')}><ArrowBack /></IconButton>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5" fontWeight={700} color="#1a3c6e">{security.companyName}</Typography>
          <Typography color="text.secondary" fontSize={14}>ISIN: {security.isin}</Typography>
        </Box>
        <StatusChip status={security.status} />
      </Box>

      {/* Summary Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} md={3}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            <Typography fontSize={12} color="text.secondary">Total Shares</Typography>
            <Typography variant="h5" fontWeight={700} color="#1a3c6e">{security.totalShares?.toLocaleString()}</Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} md={3}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            <Typography fontSize={12} color="text.secondary">Allocated</Typography>
            <Typography variant="h5" fontWeight={700} color="#c62828">{totalAllocated.toLocaleString()}</Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} md={3}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            <Typography fontSize={12} color="text.secondary">Available</Typography>
            <Typography variant="h5" fontWeight={700} color="#2e7d32">{(security.totalShares - totalAllocated).toLocaleString()}</Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} md={3}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            <Typography fontSize={12} color="text.secondary">Allocation %</Typography>
            <Typography variant="h5" fontWeight={700}>{allocationPct.toFixed(2)}%</Typography>
            <LinearProgress variant="determinate" value={allocationPct} sx={{ mt: 1 }} />
          </Paper>
        </Grid>
      </Grid>

      <Tabs value={tab} onChange={(e, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab icon={<AccountBalance fontSize="small" />} iconPosition="start" label="Current Holdings" />
        <Tab icon={<SwapHoriz fontSize="small" />} iconPosition="start" label="Transfer History" />
      </Tabs>

      {tab === 0 && (
        <Card>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Investor Name</TableCell>
                <TableCell>Folio Number</TableCell>
                <TableCell align="right">Shares</TableCell>
                <TableCell align="right">% Holding</TableCell>
                <TableCell>Last Updated</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {holdings.length === 0 && (
                <TableRow><TableCell colSpan={5} align="center" sx={{ py: 4, color: 'text.secondary' }}>No holdings found</TableCell></TableRow>
              )}
              {holdings.map(h => {
                const pct = totalAllocated > 0 ? ((h.shares / totalAllocated) * 100).toFixed(2) : 0;
                return (
                  <TableRow key={h._id} hover>
                    <TableCell><Typography fontWeight={600}>{h.investor?.fullName}</Typography></TableCell>
                    <TableCell><Chip label={h.investor?.folioNumber} size="small" variant="outlined" sx={{ fontFamily: 'monospace' }} /></TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, color: '#1a3c6e' }}>{h.shares?.toLocaleString()}</TableCell>
                    <TableCell align="right">{pct}%</TableCell>
                    <TableCell sx={{ fontSize: 12 }}>{new Date(h.updatedAt).toLocaleDateString()}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {tab === 1 && (
        <Card>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Date & Time</TableCell>
                <TableCell>From Investor</TableCell>
                <TableCell>To Investor</TableCell>
                <TableCell align="right">Quantity</TableCell>
                <TableCell>Sender (Before → After)</TableCell>
                <TableCell>Receiver (Before → After)</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Approved By</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {transfers.length === 0 && (
                <TableRow><TableCell colSpan={8} align="center" sx={{ py: 4, color: 'text.secondary' }}>No transfer history</TableCell></TableRow>
              )}
              {transfers.map(t => (
                <TableRow key={t._id} hover>
                  <TableCell sx={{ fontSize: 12 }}>{new Date(t.executedAt || t.approvedAt).toLocaleString()}</TableCell>
                  <TableCell>
                    <Typography fontWeight={600} fontSize={13}>{t.fromInvestor?.fullName}</Typography>
                    <Typography fontSize={11} color="text.secondary">{t.fromInvestor?.folioNumber}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography fontWeight={600} fontSize={13}>{t.toInvestor?.fullName}</Typography>
                    <Typography fontSize={11} color="text.secondary">{t.toInvestor?.folioNumber}</Typography>
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>{t.quantity?.toLocaleString()}</TableCell>
                  <TableCell>
                    <Typography fontSize={12}>
                      <span style={{ color: '#1565c0' }}>{t.beforeFromShares?.toLocaleString()}</span>
                      {' → '}
                      <span style={{ color: '#c62828' }}>{t.afterFromShares?.toLocaleString()}</span>
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography fontSize={12}>
                      <span style={{ color: '#1565c0' }}>{t.beforeToShares?.toLocaleString()}</span>
                      {' → '}
                      <span style={{ color: '#2e7d32' }}>{t.afterToShares?.toLocaleString()}</span>
                    </Typography>
                  </TableCell>
                  <TableCell><StatusChip status={t.status} /></TableCell>
                  <TableCell>
                    <Typography fontSize={12}>{t.approvedBy?.name}</Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </Box>
  );
}
