import React, { useEffect, useState } from 'react';
import { Grid, Card, CardContent, Typography, Box, Chip, CircularProgress, Divider, Table, TableBody, TableCell, TableHead, TableRow, Paper } from '@mui/material';
import { People, Security, SwapHoriz, AccountBalance, Lock, TrendingUp, CheckCircle, Cancel, Schedule } from '@mui/icons-material';
import api from '../utils/api';
import StatusChip from '../components/common/StatusChip';

const StatCard = ({ title, value, subtitle, icon, color = '#1a3c6e', bg }) => (
  <Card sx={{ height: '100%' }}>
    <CardContent>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <Box>
          <Typography color="text.secondary" fontSize={12} fontWeight={600} textTransform="uppercase" letterSpacing={0.5}>{title}</Typography>
          <Typography variant="h4" fontWeight={800} color={color} mt={0.5}>{value ?? '—'}</Typography>
          {subtitle && <Typography color="text.secondary" fontSize={12} mt={0.5}>{subtitle}</Typography>}
        </Box>
        <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: bg || `${color}15` }}>{React.cloneElement(icon, { sx: { color, fontSize: 28 } })}</Box>
      </Box>
    </CardContent>
  </Card>
);

export default function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/dashboard').then(r => setStats(r.data)).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <Box display="flex" justifyContent="center" mt={8}><CircularProgress /></Box>;
  if (!stats) return null;
  const { investors, securities, shares, transfers, allocations, charts } = stats;

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} mb={3} color="#1a3c6e">Dashboard Overview</Typography>

      <Grid container spacing={2.5} mb={3}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard title="Total Investors" value={investors.total} subtitle={`${investors.approved} approved`} icon={<People />} color="#1a3c6e" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard title="Pending Review" value={investors.pending} subtitle="Awaiting approval" icon={<Schedule />} color="#e65100" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard title="Securities" value={securities.total} subtitle={`${securities.approved} active`} icon={<Security />} color="#2e7d32" />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard title="Transfers Today" value={transfers.today} subtitle={`${transfers.pending} pending`} icon={<SwapHoriz />} color="#6a1b9a" />
        </Grid>
      </Grid>

      <Grid container spacing={2.5} mb={3}>
        <Grid item xs={12} sm={4}>
          <StatCard title="Total Shares Held" value={shares.totalAllocated?.toLocaleString()} subtitle="Across all investors" icon={<AccountBalance />} color="#1565c0" />
        </Grid>
        <Grid item xs={12} sm={4}>
          <StatCard title="Locked Shares" value={shares.totalLocked?.toLocaleString()} subtitle="In active transfers" icon={<Lock />} color="#c62828" />
        </Grid>
        <Grid item xs={12} sm={4}>
          <StatCard title="Available Shares" value={shares.available?.toLocaleString()} subtitle="Ready to transfer" icon={<TrendingUp />} color="#2e7d32" />
        </Grid>
      </Grid>

      <Grid container spacing={2.5}>
        {/* Investor Status Breakdown */}
        <Grid item xs={12} md={5}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={700} mb={2} color="#1a3c6e">Investor Status Breakdown</Typography>
              {[
                { label: 'Approved', value: investors.approved, color: 'success' },
                { label: 'Under Review', value: investors.pending, color: 'warning' },
                { label: 'Rejected', value: investors.rejected, color: 'error' },
                { label: 'Total', value: investors.total, color: 'default' }
              ].map(r => (
                <Box key={r.label} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1.2, borderBottom: '1px solid #f0f0f0' }}>
                  <Chip label={r.label} color={r.color} size="small" sx={{ width: 120 }} />
                  <Typography fontWeight={700} fontSize={18}>{r.value}</Typography>
                </Box>
              ))}
            </CardContent>
          </Card>
        </Grid>

        {/* Securities Distribution */}
        <Grid item xs={12} md={7}>
          <Card>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={700} mb={2} color="#1a3c6e">Securities Share Distribution</Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>ISIN</TableCell>
                    <TableCell>Company</TableCell>
                    <TableCell align="right">Total</TableCell>
                    <TableCell align="right">Allocated</TableCell>
                    <TableCell align="right">Available</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {charts.securityDist?.length === 0 && (
                    <TableRow><TableCell colSpan={5} align="center">No approved securities yet</TableCell></TableRow>
                  )}
                  {charts.securityDist?.map(s => (
                    <TableRow key={s._id} hover>
                      <TableCell><Chip label={s.isin} size="small" variant="outlined" /></TableCell>
                      <TableCell>{s.companyName}</TableCell>
                      <TableCell align="right">{s.totalShares?.toLocaleString()}</TableCell>
                      <TableCell align="right" sx={{ color: '#c62828', fontWeight: 600 }}>{s.allocatedShares?.toLocaleString()}</TableCell>
                      <TableCell align="right" sx={{ color: '#2e7d32', fontWeight: 600 }}>{(s.totalShares - s.allocatedShares)?.toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </Grid>

        {/* Transfer Activity */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={700} mb={2} color="#1a3c6e">Transfer Activity (Last 7 Days)</Typography>
              {charts.recentTransfers?.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 4, bgcolor: '#f5f5f5', borderRadius: 2 }}>
                  <SwapHoriz sx={{ fontSize: 40, color: '#9e9e9e', mb: 1 }} />
                  <Typography color="text.secondary">No transfers in the last 7 days</Typography>
                </Box>
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                      <TableCell>Date</TableCell>
                      <TableCell>From Investor</TableCell>
                      <TableCell>To Investor</TableCell>
                      <TableCell>Security</TableCell>
                      <TableCell align="right">Shares</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Performed By</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {charts.recentTransfers?.map(t => (
                      <TableRow key={t._id} hover>
                        <TableCell sx={{ fontSize: 12 }}>{new Date(t.createdAt).toLocaleDateString()}</TableCell>
                        <TableCell><Typography fontSize={13} fontWeight={600}>{t.fromInvestor?.folioNumber}</Typography><Typography fontSize={11} color="text.secondary">{t.fromInvestor?.fullName}</Typography></TableCell>
                        <TableCell><Typography fontSize={13} fontWeight={600}>{t.toInvestor?.folioNumber}</Typography><Typography fontSize={11} color="text.secondary">{t.toInvestor?.fullName}</Typography></TableCell>
                        <TableCell><Chip label={t.security?.isin} size="small" variant="outlined" /></TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, color: '#1a3c6e' }}>{t.quantity?.toLocaleString()}</TableCell>
                        <TableCell><StatusChip status={t.status} /></TableCell>
                        <TableCell sx={{ fontSize: 12 }}>{t.createdBy?.name}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
