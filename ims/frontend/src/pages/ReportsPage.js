import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Box, Card, CardContent, Typography, Button, Table, TableBody, TableCell,
  TableHead, TableRow, Chip, CircularProgress, TextField, MenuItem, Grid,
  Tabs, Tab, IconButton, Tooltip, Paper, TableContainer, TablePagination,
  Collapse, Divider, Stack, Alert, Dialog, DialogTitle, DialogContent, DialogActions
} from '@mui/material';
import {
  FilterList, Refresh, Download, PictureAsPdf, Print, Search,
  ExpandMore, ExpandLess, AccountBalance, SwapHoriz, Person, Business, ReportProblem
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import api from '../utils/api';
import StatusChip from '../components/common/StatusChip';

const fmtN = (n) => n != null ? Number(n).toLocaleString('en-IN') : '—';
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN') : '—';

export default function ReportsPage() {
  const { enqueueSnackbar } = useSnackbar();
  const printRef = useRef(null);
  
  // Tabs
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(false);
  
  // Filters
  const [filters, setFilters] = useState({
    investor: '',
    security: '',
    fromDate: '',
    toDate: '',
    status: ''
  });
  
  // Data
  const [holdings, setHoldings] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [investors, setInvestors] = useState([]);
  const [securities, setSecurities] = useState([]);
  
  // Pagination
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  
  // Summary Data
  const [summary, setSummary] = useState({
    totalInvestors: 0,
    totalHoldings: 0,
    totalTransfers: 0,
    totalComplaints: 0,
    totalShares: 0
  });

  // Expanded row
  const [expandedRow, setExpandedRow] = useState(null);
  
  // Print Dialog
  const [printOpen, setPrintOpen] = useState(false);
  const [printData, setPrintData] = useState(null);

  // Load filters data
  const loadFilters = useCallback(async () => {
    try {
      const [ir, sr] = await Promise.all([
        api.get('/investors'),
        api.get('/securities')
      ]);
      setInvestors(ir.data.investors || []);
      setSecurities(sr.data.securities || []);
    } catch (err) {
      console.error('Failed to load filter data');
    }
  }, []);

  useEffect(() => { loadFilters(); }, [loadFilters]);

  // Load main data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.investor) params.investorId = filters.investor;
      if (filters.security) params.securityId = filters.security;
      if (filters.fromDate) params.from = new Date(filters.fromDate).toISOString();
      if (filters.toDate) params.to = new Date(filters.toDate).toISOString();
      if (filters.status) params.status = filters.status;

      // Load holdings
      const h = await api.get('/holdings', { params });
      setHoldings(h.data.holdings || []);
      
      // Load transfers
      const t = await api.get('/transfers', { params });
      setTransfers(t.data.transfers || []);
      
      // Load complaints
      const c = await api.get('/complaints', { params });
      setComplaints(c.data.complaints || []);
      
      // Calculate summary
      const allHoldings = h.data.holdings || [];
      const allTransfers = t.data.transfers || [];
      const allComplaints = c.data.complaints || [];
      const uniqueInvestors = new Set(allHoldings.map(h => h.investor?._id));
      
      setSummary({
        totalInvestors: uniqueInvestors.size,
        totalHoldings: allHoldings.length,
        totalTransfers: allTransfers.length,
        totalComplaints: allComplaints.length,
        totalShares: allHoldings.reduce((sum, h) => sum + (h.shares || 0), 0)
      });
    } catch (err) {
      enqueueSnackbar('Failed to load report data', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  }, [filters, enqueueSnackbar]);

  useEffect(() => { loadData(); }, [loadData]);

  // Real-time updates
  useEffect(() => {
    const interval = setInterval(() => {
      loadData();
    }, 30000); // Auto refresh every 30 seconds
    return () => clearInterval(interval);
  }, [loadData]);

  const resetFilters = () => {
    setFilters({
      investor: '',
      security: '',
      fromDate: '',
      toDate: '',
      status: ''
    });
    setPage(0);
  };

  // Export to CSV
  const exportCSV = () => {
    let data = [];
    let headers = [];
    let filename = '';

    if (tab === 0) {
      filename = 'investor_holdings_report.csv';
      headers = ['Investor Name', 'Folio No', 'Security', 'ISIN', 'Shares Held', 'Last Updated'];
      data = holdings.map(h => [
        h.investor?.fullName,
        h.investor?.folioNumber,
        h.security?.companyName,
        h.security?.isin,
        h.shares,
        fmtDate(h.updatedAt)
      ]);
    } else if (tab === 1) {
      filename = 'transfer_history_report.csv';
      headers = ['Transfer Date', 'From Investor', 'To Investor', 'Security', 'ISIN', 'Quantity', 'Status', 'Approved By'];
      data = transfers.map(t => [
        fmtDate(t.createdAt),
        t.fromInvestor?.fullName,
        t.toInvestor?.fullName,
        t.security?.companyName,
        t.security?.isin,
        t.quantity,
        t.status,
        t.approvedBy?.name || '-'
      ]);
    } else if (tab === 2) {
      filename = 'complaint_report.csv';
      headers = ['Complaint ID', 'Investor Name', 'Folio No', 'Subject', 'Category', 'Status', 'Created Date', 'Resolved By'];
      data = complaints.map(c => [
        c.complaintId || c._id.slice(-6).toUpperCase(),
        c.investor?.fullName,
        c.investor?.folioNumber,
        c.subject,
        c.category,
        c.status,
        fmtDate(c.createdAt),
        c.resolvedBy?.name || '-'
      ]);
    }

    const csvContent = [headers.join(','), ...data.map(row => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    enqueueSnackbar('Report exported to CSV', { variant: 'success' });
  };

  // Generate PDF
  const handlePrintPDF = async () => {
    if (!printRef.current) return;

    try {
      const canvas = await html2canvas(printRef.current, {
        scale: 2,
        useCORS: true,
        logging: false
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      
      const imgWidth = 190;
      const pageHeight = 297;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      pdf.save(`investor_report_${new Date().toISOString().split('T')[0]}.pdf`);
      enqueueSnackbar('PDF generated successfully', { variant: 'success' });
    } catch (err) {
      console.error('PDF generation error:', err);
      enqueueSnackbar('Failed to generate PDF', { variant: 'error' });
    }
  };

  // Open print dialog
  const openPrintDialog = () => {
    setPrintOpen(true);
  };

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} color="#1a3c6e" mb={3}>
        Investor Holdings & Transfer Report
      </Typography>

      {/* Summary Cards */}
      <Grid container spacing={2} mb={3}>
        <Grid item xs={12} sm={2.4}>
          <Paper sx={{ p: 2, borderRadius: 2, borderLeft: 4, borderLeftColor: '#1a3c6e' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box>
                <Typography fontSize={11} color="text.secondary" fontWeight={600}>TOTAL INVESTORS</Typography>
                <Typography variant="h5" fontWeight={800} color="#1a3c6e">{summary.totalInvestors}</Typography>
              </Box>
              <Box sx={{ p: 1.5, bgcolor: '#1a3c6e15', borderRadius: 2, color: '#1a3c6e' }}>
                <Person />
              </Box>
            </Box>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={2.4}>
          <Paper sx={{ p: 2, borderRadius: 2, borderLeft: 4, borderLeftColor: '#2e7d32' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box>
                <Typography fontSize={11} color="text.secondary" fontWeight={600}>TOTAL HOLDINGS</Typography>
                <Typography variant="h5" fontWeight={800} color="#2e7d32">{summary.totalHoldings}</Typography>
              </Box>
              <Box sx={{ p: 1.5, bgcolor: '#2e7d3215', borderRadius: 2, color: '#2e7d32' }}>
                <AccountBalance />
              </Box>
            </Box>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={2.4}>
          <Paper sx={{ p: 2, borderRadius: 2, borderLeft: 4, borderLeftColor: '#e8a020' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box>
                <Typography fontSize={11} color="text.secondary" fontWeight={600}>TOTAL TRANSFERS</Typography>
                <Typography variant="h5" fontWeight={800} color="#e8a020">{summary.totalTransfers}</Typography>
              </Box>
              <Box sx={{ p: 1.5, bgcolor: '#e8a02015', borderRadius: 2, color: '#e8a020' }}>
                <SwapHoriz />
              </Box>
            </Box>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={2.4}>
          <Paper sx={{ p: 2, borderRadius: 2, borderLeft: 4, borderLeftColor: '#c62828' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box>
                <Typography fontSize={11} color="text.secondary" fontWeight={600}>TOTAL COMPLAINTS</Typography>
                <Typography variant="h5" fontWeight={800} color="#c62828">{summary.totalComplaints}</Typography>
              </Box>
              <Box sx={{ p: 1.5, bgcolor: '#c6282815', borderRadius: 2, color: '#c62828' }}>
                <ReportProblem />
              </Box>
            </Box>
          </Paper>
        </Grid>
        <Grid item xs={12} sm={2.4}>
          <Paper sx={{ p: 2, borderRadius: 2, borderLeft: 4, borderLeftColor: '#6a1b9a' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box>
                <Typography fontSize={11} color="text.secondary" fontWeight={600}>TOTAL SHARES</Typography>
                <Typography variant="h5" fontWeight={800} color="#6a1b9a">{fmtN(summary.totalShares)}</Typography>
              </Box>
              <Box sx={{ p: 1.5, bgcolor: '#6a1b9a15', borderRadius: 2, color: '#6a1b9a' }}>
                <Business />
              </Box>
            </Box>
          </Paper>
        </Grid>
      </Grid>

      {/* Filters */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={3}>
              <TextField
                select
                fullWidth
                size="small"
                label="Investor"
                value={filters.investor}
                onChange={e => setFilters(f => ({ ...f, investor: e.target.value }))}
              >
                <MenuItem value="">All Investors</MenuItem>
                {investors.map(i => <MenuItem key={i._id} value={i._id}>{i.fullName}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                select
                fullWidth
                size="small"
                label="Security (ISIN)"
                value={filters.security}
                onChange={e => setFilters(f => ({ ...f, security: e.target.value }))}
              >
                <MenuItem value="">All Securities</MenuItem>
                {securities.map(s => <MenuItem key={s._id} value={s._id}>{s.isin} - {s.companyName}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={12} md={2}>
              <TextField
                fullWidth
                size="small"
                label="From Date"
                type="date"
                InputLabelProps={{ shrink: true }}
                value={filters.fromDate}
                onChange={e => setFilters(f => ({ ...f, fromDate: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12} md={2}>
              <TextField
                fullWidth
                size="small"
                label="To Date"
                type="date"
                InputLabelProps={{ shrink: true }}
                value={filters.toDate}
                onChange={e => setFilters(f => ({ ...f, toDate: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12} md={2}>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button variant="outlined" size="small" onClick={resetFilters} fullWidth>Reset</Button>
                <Tooltip title="Export CSV">
                  <IconButton size="small" onClick={exportCSV} color="primary">
                    <Download fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Print PDF">
                  <IconButton size="small" onClick={openPrintDialog} color="error">
                    <PictureAsPdf fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Validation Alert */}
      {holdings.length > 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Total shares validation: {fmtN(summary.totalShares)} shares across {summary.totalHoldings} holdings
        </Alert>
      )}

      {/* Tabs */}
      <Tabs value={tab} onChange={(e, v) => { setTab(v); setPage(0); }} sx={{ mb: 2 }}>
        <Tab label="Investor Holdings (Current Shares)" />
        <Tab label="Transfer History (Share Movements)" />
        <Tab label="Complaint Report" />
      </Tabs>

      {/* Holdings Report */}
      {tab === 0 && (
        <Card>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#1a3c6e' }}>
                  <TableCell sx={{ color: '#fff', fontWeight: 700 }}>Investor Name</TableCell>
                  <TableCell sx={{ color: '#fff', fontWeight: 700 }}>Folio No</TableCell>
                  <TableCell sx={{ color: '#fff', fontWeight: 700 }}>Security</TableCell>
                  <TableCell sx={{ color: '#fff', fontWeight: 700 }}>ISIN</TableCell>
                  <TableCell align="right" sx={{ color: '#fff', fontWeight: 700 }}>Shares Held</TableCell>
                  <TableCell sx={{ color: '#fff', fontWeight: 700 }}>Last Updated</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading && <TableRow><TableCell colSpan={6} align="center" sx={{ py: 4 }}><CircularProgress size={24} /></TableCell></TableRow>}
                {!loading && holdings
                  .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                  .map((h) => (
                    <TableRow key={h._id} hover>
                      <TableCell>
                        <Typography fontWeight={600}>{h.investor?.fullName}</Typography>
                      </TableCell>
                      <TableCell>
                        <Chip label={h.investor?.folioNumber} size="small" variant="outlined" sx={{ fontFamily: 'monospace', fontWeight: 600 }} />
                      </TableCell>
                      <TableCell>{h.security?.companyName}</TableCell>
                      <TableCell>
                        <Chip label={h.security?.isin} size="small" variant="outlined" sx={{ fontFamily: 'monospace' }} />
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, color: '#2e7d32' }}>{fmtN(h.shares)}</TableCell>
                      <TableCell sx={{ fontSize: 12 }}>{fmtDate(h.updatedAt)}</TableCell>
                    </TableRow>
                  ))}
                {!loading && holdings.length === 0 && (
                  <TableRow><TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.secondary' }}>No holdings data found</TableCell></TableRow>
                )}
                {/* Total Row */}
                {!loading && holdings.length > 0 && (
                  <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                    <TableCell colSpan={4} sx={{ fontWeight: 800, color: '#1a3c6e' }}>TOTAL</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 800, color: '#1a3c6e' }}>{fmtN(summary.totalShares)}</TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            rowsPerPageOptions={[5, 10, 25, 50]}
            component="div"
            count={holdings.length}
            rowsPerPage={rowsPerPage}
            page={page}
            onPageChange={(e, newPage) => setPage(newPage)}
            onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
          />
        </Card>
      )}

      {/* Transfer History Report */}
      {tab === 1 && (
        <Card>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#1a3c6e' }}>
                  <TableCell sx={{ color: '#fff', fontWeight: 700 }}>Transfer Date</TableCell>
                  <TableCell sx={{ color: '#fff', fontWeight: 700 }}>From Investor</TableCell>
                  <TableCell sx={{ color: '#fff', fontWeight: 700 }}>To Investor</TableCell>
                  <TableCell sx={{ color: '#fff', fontWeight: 700 }}>Security</TableCell>
                  <TableCell sx={{ color: '#fff', fontWeight: 700 }}>ISIN</TableCell>
                  <TableCell align="right" sx={{ color: '#fff', fontWeight: 700 }}>Quantity</TableCell>
                  <TableCell sx={{ color: '#fff', fontWeight: 700 }}>Status</TableCell>
                  <TableCell sx={{ color: '#fff', fontWeight: 700 }}>Approved By</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading && <TableRow><TableCell colSpan={8} align="center" sx={{ py: 4 }}><CircularProgress size={24} /></TableCell></TableRow>}
                {!loading && transfers
                  .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                  .map((t) => (
                    <React.Fragment key={t._id}>
                      <TableRow hover>
                        <TableCell sx={{ fontSize: 12, whiteSpace: 'nowrap' }}>{fmtDate(t.createdAt)}</TableCell>
                        <TableCell>
                          <Typography fontWeight={600} fontSize={13}>{t.fromInvestor?.fullName}</Typography>
                          <Typography fontSize={11} color="text.secondary">Before: {fmtN(t.beforeFromShares)} → After: {fmtN(t.afterFromShares)}</Typography>
                        </TableCell>
                        <TableCell>
                          <Typography fontWeight={600} fontSize={13}>{t.toInvestor?.fullName}</Typography>
                          <Typography fontSize={11} color="text.secondary">Before: {fmtN(t.beforeToShares)} → After: {fmtN(t.afterToShares)}</Typography>
                        </TableCell>
                        <TableCell>{t.security?.companyName}</TableCell>
                        <TableCell>
                          <Chip label={t.security?.isin} size="small" variant="outlined" sx={{ fontFamily: 'monospace' }} />
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, color: '#e8a020' }}>{fmtN(t.quantity)}</TableCell>
                        <TableCell><StatusChip status={t.status} /></TableCell>
                        <TableCell>{t.approvedBy?.name || '-'}</TableCell>
                      </TableRow>
                    </React.Fragment>
                  ))}
                {!loading && transfers.length === 0 && (
                  <TableRow><TableCell colSpan={8} align="center" sx={{ py: 4, color: 'text.secondary' }}>No transfer history found</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            rowsPerPageOptions={[5, 10, 25, 50]}
            component="div"
            count={transfers.length}
            rowsPerPage={rowsPerPage}
            page={page}
            onPageChange={(e, newPage) => setPage(newPage)}
            onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
          />
        </Card>
      )}

      {/* Complaint Report */}
      {tab === 2 && (
        <Card>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#c62828' }}>
                  <TableCell sx={{ color: '#fff', fontWeight: 700 }}>Complaint ID</TableCell>
                  <TableCell sx={{ color: '#fff', fontWeight: 700 }}>Investor Name</TableCell>
                  <TableCell sx={{ color: '#fff', fontWeight: 700 }}>Folio No</TableCell>
                  <TableCell sx={{ color: '#fff', fontWeight: 700 }}>Subject</TableCell>
                  <TableCell sx={{ color: '#fff', fontWeight: 700 }}>Category</TableCell>
                  <TableCell sx={{ color: '#fff', fontWeight: 700 }}>Status</TableCell>
                  <TableCell sx={{ color: '#fff', fontWeight: 700 }}>Created Date</TableCell>
                  <TableCell sx={{ color: '#fff', fontWeight: 700 }}>Resolved By</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading && <TableRow><TableCell colSpan={8} align="center" sx={{ py: 4 }}><CircularProgress size={24} /></TableCell></TableRow>}
                {!loading && complaints
                  .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                  .map((c) => (
                    <TableRow key={c._id} hover>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: 11 }}>
                        <Chip label={c.complaintId || c._id.slice(-6).toUpperCase()} size="small" variant="outlined" />
                      </TableCell>
                      <TableCell>
                        <Typography fontWeight={600} fontSize={13}>{c.investor?.fullName}</Typography>
                      </TableCell>
                      <TableCell>
                        <Chip label={c.investor?.folioNumber} size="small" variant="outlined" sx={{ fontFamily: 'monospace', fontWeight: 600 }} />
                      </TableCell>
                      <TableCell sx={{ maxWidth: 200 }}>
                        <Typography fontSize={12} noWrap>{c.subject}</Typography>
                      </TableCell>
                      <TableCell>
                        <Chip label={c.category} size="small" variant="outlined" />
                      </TableCell>
                      <TableCell><StatusChip status={c.status} /></TableCell>
                      <TableCell sx={{ fontSize: 12 }}>{fmtDate(c.createdAt)}</TableCell>
                      <TableCell>{c.resolvedBy?.name || '-'}</TableCell>
                    </TableRow>
                  ))}
                {!loading && complaints.length === 0 && (
                  <TableRow><TableCell colSpan={8} align="center" sx={{ py: 4, color: 'text.secondary' }}>No complaints found</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            rowsPerPageOptions={[5, 10, 25, 50]}
            component="div"
            count={complaints.length}
            rowsPerPage={rowsPerPage}
            page={page}
            onPageChange={(e, newPage) => setPage(newPage)}
            onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
          />
        </Card>
      )}

      {/* Print/PDF Dialog */}
      <Dialog open={printOpen} onClose={() => setPrintOpen(false)} maxWidth="lg" fullWidth>
        <DialogTitle fontWeight={700}>Print Report</DialogTitle>
        <DialogContent>
          <Box ref={printRef} sx={{ bgcolor: '#fff', p: 3 }}>
            {/* Report Header */}
            <Box sx={{ mb: 3, pb: 2, borderBottom: '2px solid #1a3c6e' }}>
              <Typography variant="h4" fontWeight={800} color="#1a3c6e">
                Investor Holdings & Transfer Report
              </Typography>
              <Typography variant="subtitle1" color="text.secondary" mt={1}>
                Generated on: {new Date().toLocaleDateString('en-IN')} at {new Date().toLocaleTimeString('en-IN')}
              </Typography>
            </Box>

            {/* Summary Section */}
            <Typography variant="h6" fontWeight={700} color="#1a3c6e" mb={2}>Summary</Typography>
            <Grid container spacing={2} mb={3}>
              <Grid item xs={2.4}>
                <Paper sx={{ p: 2, textAlign: 'center' }}>
                  <Typography fontSize={12} color="text.secondary">Total Investors</Typography>
                  <Typography variant="h5" fontWeight={800}>{summary.totalInvestors}</Typography>
                </Paper>
              </Grid>
              <Grid item xs={2.4}>
                <Paper sx={{ p: 2, textAlign: 'center' }}>
                  <Typography fontSize={12} color="text.secondary">Total Holdings</Typography>
                  <Typography variant="h5" fontWeight={800}>{summary.totalHoldings}</Typography>
                </Paper>
              </Grid>
              <Grid item xs={2.4}>
                <Paper sx={{ p: 2, textAlign: 'center' }}>
                  <Typography fontSize={12} color="text.secondary">Total Transfers</Typography>
                  <Typography variant="h5" fontWeight={800}>{summary.totalTransfers}</Typography>
                </Paper>
              </Grid>
              <Grid item xs={2.4}>
                <Paper sx={{ p: 2, textAlign: 'center' }}>
                  <Typography fontSize={12} color="text.secondary">Total Complaints</Typography>
                  <Typography variant="h5" fontWeight={800}>{summary.totalComplaints}</Typography>
                </Paper>
              </Grid>
              <Grid item xs={2.4}>
                <Paper sx={{ p: 2, textAlign: 'center' }}>
                  <Typography fontSize={12} color="text.secondary">Total Shares</Typography>
                  <Typography variant="h5" fontWeight={800}>{fmtN(summary.totalShares)}</Typography>
                </Paper>
              </Grid>
            </Grid>

            {/* Investor Holdings Table */}
            <Typography variant="h6" fontWeight={700} color="#1a3c6e" mb={2}>Investor Holdings (Current Shares)</Typography>
            <TableContainer component={Paper} variant="outlined" sx={{ mb: 3 }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: '#1a3c6e' }}>
                    <TableCell sx={{ color: '#fff', fontWeight: 700 }}>Investor Name</TableCell>
                    <TableCell sx={{ color: '#fff', fontWeight: 700 }}>Folio No</TableCell>
                    <TableCell sx={{ color: '#fff', fontWeight: 700 }}>Security</TableCell>
                    <TableCell sx={{ color: '#fff', fontWeight: 700 }}>ISIN</TableCell>
                    <TableCell align="right" sx={{ color: '#fff', fontWeight: 700 }}>Shares Held</TableCell>
                    <TableCell sx={{ color: '#fff', fontWeight: 700 }}>Last Updated</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {holdings.map((h, idx) => (
                    <TableRow key={idx}>
                      <TableCell>{h.investor?.fullName}</TableCell>
                      <TableCell>{h.investor?.folioNumber}</TableCell>
                      <TableCell>{h.security?.companyName}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: 11 }}>{h.security?.isin}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>{fmtN(h.shares)}</TableCell>
                      <TableCell sx={{ fontSize: 11 }}>{fmtDate(h.updatedAt)}</TableCell>
                    </TableRow>
                  ))}
                  {holdings.length === 0 && (
                    <TableRow><TableCell colSpan={6} align="center">No holdings data</TableCell></TableRow>
                  )}
                  <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                    <TableCell colSpan={4} sx={{ fontWeight: 800 }}>TOTAL</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 800 }}>{fmtN(summary.totalShares)}</TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>

            {/* Transfer History Table */}
            <Typography variant="h6" fontWeight={700} color="#1a3c6e" mb={2}>Transfer History (Share Movements)</Typography>
            <TableContainer component={Paper} variant="outlined" sx={{ mb: 3 }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: '#1a3c6e' }}>
                    <TableCell sx={{ color: '#fff', fontWeight: 700 }}>Transfer Date</TableCell>
                    <TableCell sx={{ color: '#fff', fontWeight: 700 }}>From Investor</TableCell>
                    <TableCell sx={{ color: '#fff', fontWeight: 700 }}>To Investor</TableCell>
                    <TableCell sx={{ color: '#fff', fontWeight: 700 }}>Security</TableCell>
                    <TableCell sx={{ color: '#fff', fontWeight: 700 }}>ISIN</TableCell>
                    <TableCell align="right" sx={{ color: '#fff', fontWeight: 700 }}>Quantity</TableCell>
                    <TableCell sx={{ color: '#fff', fontWeight: 700 }}>Status</TableCell>
                    <TableCell sx={{ color: '#fff', fontWeight: 700 }}>Approved By</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {transfers.map((t, idx) => (
                    <TableRow key={idx}>
                      <TableCell sx={{ fontSize: 11, whiteSpace: 'nowrap' }}>{fmtDate(t.createdAt)}</TableCell>
                      <TableCell>
                        <Typography fontSize={12}>{t.fromInvestor?.fullName}</Typography>
                        <Typography fontSize={10} color="text.secondary">Before: {fmtN(t.beforeFromShares)} → After: {fmtN(t.afterFromShares)}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography fontSize={12}>{t.toInvestor?.fullName}</Typography>
                        <Typography fontSize={10} color="text.secondary">Before: {fmtN(t.beforeToShares)} → After: {fmtN(t.afterToShares)}</Typography>
                      </TableCell>
                      <TableCell>{t.security?.companyName}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: 11 }}>{t.security?.isin}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>{fmtN(t.quantity)}</TableCell>
                      <TableCell>{t.status}</TableCell>
                      <TableCell>{t.approvedBy?.name || '-'}</TableCell>
                    </TableRow>
                  ))}
                  {transfers.length === 0 && (
                    <TableRow><TableCell colSpan={8} align="center">No transfer history</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>

            {/* Complaint Report Table */}
            <Typography variant="h6" fontWeight={700} color="#c62828" mb={2}>Complaint Report</Typography>
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: '#c62828' }}>
                    <TableCell sx={{ color: '#fff', fontWeight: 700 }}>Complaint ID</TableCell>
                    <TableCell sx={{ color: '#fff', fontWeight: 700 }}>Investor Name</TableCell>
                    <TableCell sx={{ color: '#fff', fontWeight: 700 }}>Folio No</TableCell>
                    <TableCell sx={{ color: '#fff', fontWeight: 700 }}>Subject</TableCell>
                    <TableCell sx={{ color: '#fff', fontWeight: 700 }}>Category</TableCell>
                    <TableCell sx={{ color: '#fff', fontWeight: 700 }}>Status</TableCell>
                    <TableCell sx={{ color: '#fff', fontWeight: 700 }}>Created Date</TableCell>
                    <TableCell sx={{ color: '#fff', fontWeight: 700 }}>Resolved By</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {complaints.map((c, idx) => (
                    <TableRow key={idx}>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: 11 }}>{c.complaintId || c._id.slice(-6).toUpperCase()}</TableCell>
                      <TableCell sx={{ fontSize: 12 }}>{c.investor?.fullName}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: 11 }}>{c.investor?.folioNumber}</TableCell>
                      <TableCell sx={{ fontSize: 11, maxWidth: 200 }}>{c.subject}</TableCell>
                      <TableCell sx={{ fontSize: 11 }}>{c.category}</TableCell>
                      <TableCell sx={{ fontSize: 11 }}>{c.status}</TableCell>
                      <TableCell sx={{ fontSize: 11 }}>{fmtDate(c.createdAt)}</TableCell>
                      <TableCell sx={{ fontSize: 11 }}>{c.resolvedBy?.name || '-'}</TableCell>
                    </TableRow>
                  ))}
                  {complaints.length === 0 && (
                    <TableRow><TableCell colSpan={8} align="center">No complaints found</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>

            {/* Footer */}
            <Box sx={{ mt: 3, pt: 2, borderTop: '1px solid #ddd', fontSize: 11, color: '#666' }}>
              <Typography>
                This is an auto-generated report. For any discrepancies, please contact the administrator.
              </Typography>
              <Typography sx={{ mt: 1 }}>
                © {new Date().getFullYear()} Capifide Tech - Investor Management System
              </Typography>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setPrintOpen(false)}>Close</Button>
          <Button variant="contained" startIcon={<PictureAsPdf />} onClick={handlePrintPDF} sx={{ bgcolor: '#c62828' }}>
            Download PDF
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
