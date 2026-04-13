import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Box, Card, Typography, Button, Table, TableBody, TableCell,
  TableHead, TableRow, Chip, CircularProgress, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, MenuItem, Grid, Alert,
  IconButton, Tooltip, Paper, Select, FormControl, InputLabel,
  TableContainer, TablePagination
} from '@mui/material';
import {
  Add, Refresh, Print, PictureAsPdf, Download, Search, FilterList
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { getDPS, getTotalDividend, calculateDividendAmount, formatNumber, formatCurrency } from '../utils/dividendCalculations';

const fmtN = (n) => n != null ? Number(n).toLocaleString('en-IN') : '—';

export default function DividendsPage() {
  const { user } = useAuth();
  const { socket } = useSocket();
  const { enqueueSnackbar } = useSnackbar();

  const [securities, setSecurities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [createOpen, setCreateOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [selectedSecurity, setSelectedSecurity] = useState(null);
  const [investorHoldings, setInvestorHoldings] = useState([]);
  const [loadingHoldings, setLoadingHoldings] = useState(false);
  const [allInvestorHoldings, setAllInvestorHoldings] = useState([]);
  const [loadingAllHoldings, setLoadingAllHoldings] = useState(false);
  const [folioFilter, setFolioFilter] = useState('');
  const [investorNameFilter, setInvestorNameFilter] = useState('');
  const [showInvestorView, setShowInvestorView] = useState(false);
  const [printInvestorOpen, setPrintInvestorOpen] = useState(false);
  const investorPrintRef = useRef(null);
  const [form, setForm] = useState({ companyName: '', isin: '', totalShares: '' });
  const [formErr, setFormErr] = useState('');
  const [saving, setSaving] = useState(false);
  const printRef = useRef(null);

  // Role-based access
  const canCreate = ['MAKER', 'ADMIN'].includes(user?.role);
  const canEdit = ['MAKER', 'ADMIN'].includes(user?.role);
  const canDelete = ['ADMIN'].includes(user?.role);
  const isInvestor = user?.role === 'INVESTOR';

  // Load securities (dividend declarations)
  const loadSecurities = useCallback(async () => {
    setLoading(true);
    try {
      // 🔥 Fetch both securities AND dividends separately
      const [secRes, divRes] = await Promise.all([
        api.get('/securities'),
        api.get('/dividends').catch(() => ({ data: { dividends: [] } })) // Graceful fallback
      ]);
      
      const securities = secRes.data.securities || [];
      const dividends = divRes.data?.dividends || [];
      
      // 🔥 Merge latest dividend into each security
      const securitiesWithDividends = securities.map(sec => {
        // Find latest dividend for this security
        const secDividends = dividends.filter(d => 
          d.security?._id === sec._id || d.security === sec._id
        );
        const latest = secDividends.sort((a, b) => 
          new Date(b.createdAt) - new Date(a.createdAt)
        )[0];
        
        return {
          ...sec,
          latestDividend: latest || null
        };
      });
      
      console.log('🔍 Merged securities with dividends:', securitiesWithDividends.map(s => ({
        company: s.companyName,
        hasLatestDividend: !!s.latestDividend,
        dps: s.latestDividend?.dividendPerShare || 'NONE'
      })));
      
      setSecurities(securitiesWithDividends);
    } catch { enqueueSnackbar('Load failed', { variant: 'error' }); }
    finally { setLoading(false); }
  }, [enqueueSnackbar]);

  // Load all investor holdings across all securities
  const loadAllInvestorHoldings = useCallback(async () => {
    setLoadingAllHoldings(true);
    try {
      const r = await api.get('/holdings');
      setAllInvestorHoldings(r.data.holdings || []);
    } catch { enqueueSnackbar('Failed to load all holdings', { variant: 'error' }); }
    finally { setLoadingAllHoldings(false); }
  }, [enqueueSnackbar]);

  useEffect(() => {
    loadSecurities();
    loadAllInvestorHoldings();
  }, [loadSecurities, loadAllInvestorHoldings]);

  // Keep stable refs for socket handlers
  const loadSecuritiesRef = useRef(loadSecurities);
  const loadAllInvestorHoldingsRef = useRef(loadAllInvestorHoldings);
  useEffect(() => { loadSecuritiesRef.current = loadSecurities; }, [loadSecurities]);
  useEffect(() => { loadAllInvestorHoldingsRef.current = loadAllInvestorHoldings; }, [loadAllInvestorHoldings]);

  // Real-time WebSocket updates - Listen to ALL relevant events
  useEffect(() => {
    if (!socket) return;

    const handleSecurityUpdate = (data) => {
      console.log('[Socket] Security update received:', data.action);
      enqueueSnackbar(`Security ${data.action?.toLowerCase() || 'updated'}`, { variant: 'success' });
      loadSecuritiesRef.current();
      loadAllInvestorHoldingsRef.current();
    };

    const handleDividendUpdate = (data) => {
      console.log('[Socket] Dividend update received:', data.action);
      enqueueSnackbar(`Dividend ${data.action?.toLowerCase() || 'updated'}`, { variant: 'success' });
      loadSecuritiesRef.current();
      loadAllInvestorHoldingsRef.current();
    };

    const handleHoldingUpdate = (data) => {
      console.log('[Socket] Holding update received:', data.action);
      loadAllInvestorHoldingsRef.current();
    };

    const handleAllocationUpdate = (data) => {
      console.log('[Socket] Allocation update received:', data.action);
      loadSecuritiesRef.current();
      loadAllInvestorHoldingsRef.current();
    };

    socket.on('security_update', handleSecurityUpdate);
    socket.on('dividend_update', handleDividendUpdate);
    socket.on('holding_update', handleHoldingUpdate);
    socket.on('holdings_update', handleHoldingUpdate);
    socket.on('allocation_update', handleAllocationUpdate);

    return () => {
      socket.off('security_update', handleSecurityUpdate);
      socket.off('dividend_update', handleDividendUpdate);
      socket.off('holding_update', handleHoldingUpdate);
      socket.off('holdings_update', handleHoldingUpdate);
      socket.off('allocation_update', handleAllocationUpdate);
    };
  }, [socket, enqueueSnackbar]);

  // Filter securities
  const filteredSecurities = securities.filter(s => {
    const searchLower = searchTerm.toLowerCase();
    return (
      s.companyName?.toLowerCase().includes(searchLower) ||
      s.isin?.toLowerCase().includes(searchLower)
    );
  });

  // Filter all investor holdings
  const filteredInvestorHoldings = allInvestorHoldings.filter(h => {
    const folioLower = folioFilter.toLowerCase();
    const nameLower = investorNameFilter.toLowerCase();
    const investorName = h.investor?.fullName?.toLowerCase() || '';
    const folioNumber = h.investor?.folioNumber?.toLowerCase() || '';
    
    const matchesFolio = !folioFilter || folioNumber.includes(folioLower);
    const matchesName = !investorNameFilter || investorName.includes(nameLower);
    
    return matchesFolio && matchesName;
  });

  // Group holdings by investor
  const holdingsByInvestor = filteredInvestorHoldings.reduce((acc, holding) => {
    const investorId = holding.investor?._id || 'unknown';
    if (!acc[investorId]) {
      acc[investorId] = {
        investor: holding.investor,
        holdings: []
      };
    }
    acc[investorId].holdings.push(holding);
    return acc;
  }, {});

  const investorsList = Object.values(holdingsByInvestor);

  // Pagination
  const handleChangePage = (event, newPage) => setPage(newPage);
  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  // Open create dialog
  const openCreate = () => {
    setForm({ companyName: '', isin: '', totalShares: '' });
    setFormErr('');
    setCreateOpen(true);
  };

  // Create new dividend declaration
  const handleCreate = async () => {
    setFormErr('');
    setSaving(true);
    try {
      // Validation: Check if ISIN already exists
      const existing = securities.find(s => s.isin === form.isin);
      if (existing) {
        setFormErr('ISIN already exists');
        setSaving(false);
        return;
      }

      await api.post('/securities', form);
      enqueueSnackbar('Dividend declaration created!', { variant: 'success' });
      setCreateOpen(false);
      loadSecurities();
    } catch (err) {
      setFormErr(err.response?.data?.message || 'Failed to create');
    } finally {
      setSaving(false);
    }
  };

  // 🔥 DIVIDEND DIALOG STATE & FUNCTIONS
  const [dividendOpen, setDividendOpen] = useState(false);
  const [selectedSecurityForDividend, setSelectedSecurityForDividend] = useState(null);
  const [dividendPerShare, setDividendPerShare] = useState('');
  const [dividendErr, setDividendErr] = useState('');
  const [dividendSaving, setDividendSaving] = useState(false);

  // Open dividend dialog for specific security
  const openDividendDialog = (security) => {
    setSelectedSecurityForDividend(security);
    setDividendPerShare('');
    setDividendErr('');
    setDividendOpen(true);
  };

  // Close dividend dialog with cleanup
  const closeDividendDialog = () => {
    setDividendPerShare('');
    setDividendErr('');
    setDividendOpen(false);
    setSelectedSecurityForDividend(null);
  };

  // Submit dividend declaration
  const handleDividendSubmit = async () => {
    if (!dividendPerShare || Number(dividendPerShare) <= 0) {
      setDividendErr('Please enter a valid dividend per share amount');
      return;
    }

    setDividendErr('');
    setDividendSaving(true);

    try {
      const currentYear = new Date().getFullYear();
      const fiscalYear = `FY${currentYear}-${(currentYear + 1).toString().slice(-2)}`;
      
      await api.post('/dividends', {
        securityId: selectedSecurityForDividend._id,
        dividendPerShare: Number(dividendPerShare),
        fiscalYear: fiscalYear
      });

      enqueueSnackbar(
        `Dividend of ₹${dividendPerShare}/share declared for ${selectedSecurityForDividend.companyName}!`,
        { variant: 'success' }
      );

      // Clear and close
      closeDividendDialog();

      // Refresh data
      loadSecurities();
      loadAllInvestorHoldings();
    } catch (err) {
      setDividendErr(err.response?.data?.message || 'Failed to declare dividend');
    } finally {
      setDividendSaving(false);
    }
  };

  // Print/Export investor holdings for selected ISIN
  const handlePrint = async (security) => {
    setSelectedSecurity(security);
    setLoadingHoldings(true);
    setPrintOpen(true);
    try {
      const r = await api.get(`/holdings`, { params: { securityId: security._id } });
      const holdings = r.data.holdings || [];
      
      // Validation: Total shares = sum of investor shares
      const investorSum = holdings.reduce((sum, h) => sum + (h.shares || 0), 0);
      const totalShares = security.allocatedShares || security.totalShares || 0;
      
      if (Math.abs(investorSum - totalShares) > 1) {
        enqueueSnackbar(`Warning: Total shares (${totalShares}) != Investor sum (${investorSum})`, { variant: 'warning' });
      }

      setInvestorHoldings(holdings);
    } catch (err) {
      enqueueSnackbar('Failed to load investor holdings', { variant: 'error' });
    } finally {
      setLoadingHoldings(false);
    }
  };

  // Export to Excel (CSV implementation)
  const handleExportExcel = () => {
    if (!selectedSecurity || investorHoldings.length === 0) return;

    const headers = ['Investor Name', 'Folio Number', 'Shares Held', '% Holding'];
    const rows = investorHoldings.map(h => [
      h.investor?.fullName || '—',
      h.investor?.folioNumber || '—',
      h.shares || 0,
      selectedSecurity.allocatedShares > 0 
        ? ((h.shares / selectedSecurity.allocatedShares) * 100).toFixed(2) + '%'
        : '0%'
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${selectedSecurity.companyName}_dividend_holdings.csv`;
    link.click();
    enqueueSnackbar('Exported to CSV', { variant: 'success' });
  };

  // Generate PDF using html2canvas and jspdf
  const handlePrintPDF = async () => {
    if (!printRef.current || investorHoldings.length === 0) return;

    try {
      const canvas = await html2canvas(printRef.current, {
        scale: 2,
        useCORS: true,
        logging: false
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      
      const imgWidth = 190; // A4 width in mm
      const pageHeight = 297; // A4 height in mm
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

      pdf.save(`${selectedSecurity.companyName}_dividend_holdings.pdf`);
      enqueueSnackbar('PDF generated successfully', { variant: 'success' });
    } catch (err) {
      console.error('PDF generation error:', err);
      enqueueSnackbar('Failed to generate PDF', { variant: 'error' });
    }
  };

  // Helper to get security name by ID
  const getSecurityName = (securityId) => {
    const security = securities.find(s => s._id === securityId);
    return security?.companyName || 'Unknown';
  };

  // Export investor-wise holdings to Excel
  const handleExportInvestorExcel = () => {
    if (investorsList.length === 0) return;

    let csvContent = 'Investor Name,Folio Number,Company,ISIN,Shares Held\n';
    
    investorsList.forEach(inv => {
      inv.holdings.forEach(h => {
        const security = securities.find(s => s._id === h.security?._id);
        csvContent += `${inv.investor?.fullName || '—'},${inv.investor?.folioNumber || '—'},${security?.companyName || h.security?.companyName || '—'},${security?.isin || h.security?.isin || '—'},${h.shares || 0}\n`;
      });
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `investor_holdings_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    enqueueSnackbar('Exported to CSV', { variant: 'success' });
  };

  // Generate PDF for investor-wise holdings
  const handlePrintInvestorPDF = async () => {
    if (!investorPrintRef.current || investorsList.length === 0) return;

    try {
      const canvas = await html2canvas(investorPrintRef.current, {
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

      pdf.save(`investor_holdings_${new Date().toISOString().split('T')[0]}.pdf`);
      enqueueSnackbar('PDF generated successfully', { variant: 'success' });
    } catch (err) {
      console.error('PDF generation error:', err);
      enqueueSnackbar('Failed to generate PDF', { variant: 'error' });
    }
  };

  // Delete security
  const handleDelete = async (security) => {
    if (!window.confirm(`Delete ${security.companyName}?`)) return;
    try {
      await api.delete(`/securities/${security._id}`);
      enqueueSnackbar('Deleted successfully', { variant: 'success' });
      loadSecurities();
    } catch (err) {
      enqueueSnackbar(err.response?.data?.message || 'Failed to delete', { variant: 'error' });
    }
  };

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: { xs: 2, sm: 3 }, gap: 2, flexWrap: 'wrap', flexDirection: { xs: 'column', sm: 'row' } }}>
        <Typography variant="h5" fontWeight={700} color="#1a3c6e">
          Real-Time Dividend Management
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: { xs: 'center', sm: 'flex-end' } }}>
          <Button 
            variant={showInvestorView ? "contained" : "outlined"}
            size="small"
            onClick={() => setShowInvestorView(!showInvestorView)}
            sx={{ 
              borderColor: '#1a3c6e', 
              color: showInvestorView ? '#fff' : '#1a3c6e', 
              fontSize: { xs: 11, sm: 12 }, 
              flex: { xs: 1, sm: 'auto' } 
            }}
          >
            {showInvestorView ? 'Securities View' : 'Investor View'}
          </Button>
          <IconButton size="small" onClick={() => { loadSecurities(); loadAllInvestorHoldings(); }}>
            <Refresh />
          </IconButton>
          {!isInvestor && canCreate && (
            <Button variant="contained" startIcon={<Add />} onClick={() => setCreateOpen(true)} sx={{ bgcolor: '#1a3c6e', fontSize: { xs: 11, sm: 12 }, flex: { xs: 1, sm: 'auto' }, minWidth: 120, maxWidth: 180 }}>Dividend</Button>
          )}
        </Box>
      </Box>

      {/* Search/Filter - Securities View */}
      {!showInvestorView && (
        <Paper sx={{ p: { xs: 1, sm: 2 }, mb: { xs: 2, sm: 3 }, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
          <FilterList fontSize="small" color="action" />
          <TextField
            size="small"
            placeholder="Search by Company or ISIN..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            sx={{ minWidth: { xs: 200, sm: 300 }, flexGrow: 1 }}
            InputProps={{
              startAdornment: <Search sx={{ mr: 1, color: 'text.secondary' }} />
            }}
          />
        </Paper>
      )}

      {/* Search/Filter - Investor View */}
      {showInvestorView && (
        <Paper sx={{ p: { xs: 1, sm: 2 }, mb: { xs: 2, sm: 3 }, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
          <FilterList fontSize="small" color="action" />
          <TextField
            size="small"
            placeholder="Filter by Folio Number..."
            value={folioFilter}
            onChange={e => setFolioFilter(e.target.value)}
            sx={{ minWidth: { xs: 150, sm: 200 }, flex: 1 }}
          />
          <TextField
            size="small"
            placeholder="Filter by Investor Name..."
            value={investorNameFilter}
            onChange={e => setInvestorNameFilter(e.target.value)}
            sx={{ minWidth: { xs: 150, sm: 200 }, flex: 1 }}
          />
          <Button size="small" variant="outlined" onClick={() => { setFolioFilter(''); setInvestorNameFilter(''); }} sx={{ fontSize: { xs: 11, sm: 12 } }}>
            Clear Filters
          </Button>
          <Button
            variant="contained"
            size="small"
            startIcon={<Print />}
            onClick={() => setPrintInvestorOpen(true)}
            sx={{ bgcolor: '#1a3c6e', fontSize: { xs: 11, sm: 12 }, flex: { xs: 1, sm: 'auto' } }}
          >
            Print Report
          </Button>
        </Paper>
      )}

      {/* Main Dividend Table - Securities View */}
      {!showInvestorView && (
        <Card>
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table sx={{ minWidth: { xs: 600, md: 800 } }}>
              <TableHead>
                <TableRow sx={{ bgcolor: '#1a3c6e' }}>
                  <TableCell sx={{ color: '#fff', fontWeight: 700, fontSize: { xs: 11, sm: 12 } }}>Company</TableCell>
                  <TableCell sx={{ color: '#fff', fontWeight: 700, fontSize: { xs: 11, sm: 12 } }}>ISIN</TableCell>
                  <TableCell align="right" sx={{ color: '#fff', fontWeight: 700, fontSize: { xs: 11, sm: 12 } }}>Total Shares</TableCell>
                  <TableCell align="right" sx={{ color: '#fff', fontWeight: 700, fontSize: { xs: 11, sm: 12 } }}>DPS (₹)</TableCell>
                  <TableCell align="right" sx={{ color: '#fff', fontWeight: 700, fontSize: { xs: 11, sm: 12 } }}>Total Dividend (₹)</TableCell>
                  <TableCell align="center" sx={{ color: '#fff', fontWeight: 700, fontSize: { xs: 11, sm: 12 } }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading && (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                      <CircularProgress size={24} />
                    </TableCell>
                  </TableRow>
                )}
                {!loading && filteredSecurities
                  .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                  .map((security) => (
                    <TableRow key={security._id} hover>
                      <TableCell sx={{ fontWeight: 600 }}>{security.companyName}</TableCell>
                      <TableCell>
                        <Chip 
                          label={security.isin} 
                          size="small" 
                          variant="outlined" 
                          sx={{ fontFamily: 'monospace', fontWeight: 700 }}
                        />
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>
                        {fmtN(security.allocatedShares || security.totalShares)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, color: '#2e7d32' }}>
                        {(() => {
                          const dps = getDPS(security);
                          return dps > 0 ? `₹${dps}` : '—';
                        })()}
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, color: '#1a3c6e' }}>
                        {(() => {
                          const totalDividend = getTotalDividend(security);
                          return totalDividend > 0 ? `₹${fmtN(totalDividend)}` : '—';
                        })()}
                      </TableCell>
                      <TableCell align="center">
                        <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                          {!isInvestor && canCreate && (
                            <Tooltip title="Declare Dividend">
                              <IconButton 
                                size="small" 
                                color="success"
                                onClick={() => openDividendDialog(security)}
                              >
                                <Add fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                          <Tooltip title="Print Investor Breakdown">
                            <IconButton 
                              size="small" 
                              color="primary"
                              onClick={() => handlePrint(security)}
                            >
                              <Print fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          {!isInvestor && canDelete && (
                            <Tooltip title="Delete">
                              <IconButton 
                                size="small" 
                                color="error"
                                onClick={() => handleDelete(security)}
                              >
                                <Download fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                {!loading && filteredSecurities.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ color: 'text.secondary', py: 4 }}>
                      <Typography>No dividend declarations found</Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            rowsPerPageOptions={[5, 10, 25, 50]}
            component="div"
            count={filteredSecurities.length}
            rowsPerPage={rowsPerPage}
            page={page}
            onPageChange={handleChangePage}
            onRowsPerPageChange={handleChangeRowsPerPage}
          />
        </Card>
      )}

      {/* Investor-wise Holdings Table - Investor View */}
      {showInvestorView && (
        <>
          {loadingAllHoldings ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : investorsList.length === 0 ? (
            <Card sx={{ p: 4, textAlign: 'center' }}>
              <Typography color="text.secondary">No investor holdings found</Typography>
            </Card>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {investorsList.map((invData, idx) => {
                const totalShares = invData.holdings.reduce((sum, h) => sum + (h.shares || 0), 0);
                return (
                  <Card key={idx}>
                    <Box sx={{ p: 2, bgcolor: '#1a3c6e', color: '#fff' }}>
                      <Typography variant="h6" fontWeight={700}>
                        {invData.investor?.fullName || 'Unknown Investor'}
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 2, mt: 1, flexWrap: 'wrap' }}>
                        <Chip 
                          label={`Folio: ${invData.investor?.folioNumber || '—'}`} 
                          size="small" 
                          sx={{ bgcolor: '#fff', color: '#1a3c6e', fontWeight: 700 }}
                        />
                        <Chip 
                          label={`Total Holdings: ${fmtN(totalShares)} shares`} 
                          size="small" 
                          sx={{ bgcolor: '#fff', color: '#1a3c6e', fontWeight: 700 }}
                        />
                        <Chip 
                          label={`Companies: ${invData.holdings.length}`} 
                          size="small" 
                          sx={{ bgcolor: '#fff', color: '#1a3c6e', fontWeight: 700 }}
                        />
                      </Box>
                    </Box>
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                            <TableCell sx={{ fontWeight: 700 }}>Company</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>ISIN</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 700 }}>Shares Held</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 700 }}>DPS (₹)</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 700 }}>Dividend (₹)</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 700 }}>% of Total</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {invData.holdings.map((holding, hIdx) => {
                            const security = securities.find(s => s._id === holding.security?._id);
                            const percentage = totalShares > 0 ? ((holding.shares / totalShares) * 100).toFixed(2) : '0';
                            // Use centralized DPS calculation
                            const dps = getDPS(security);
                            const dividend = calculateDividendAmount(holding, security);
                            return (
                              <TableRow key={hIdx} hover>
                                <TableCell sx={{ fontWeight: 600 }}>{security?.companyName || holding.security?.companyName || '—'}</TableCell>
                                <TableCell>
                                  <Chip 
                                    label={security?.isin || holding.security?.isin || '—'} 
                                    size="small" 
                                    variant="outlined"
                                    sx={{ fontFamily: 'monospace' }}
                                  />
                                </TableCell>
                                <TableCell align="right" sx={{ fontWeight: 700 }}>{fmtN(holding.shares)}</TableCell>
                                <TableCell align="right" sx={{ fontWeight: 700, color: '#2e7d32' }}>
                                  {dps > 0 ? `₹${dps}` : '—'}
                                </TableCell>
                                <TableCell align="right" sx={{ fontWeight: 700, color: '#1a3c6e' }}>
                                  {dividend > 0 ? `₹${fmtN(dividend)}` : '—'}
                                </TableCell>
                                <TableCell align="right">
                                  <Chip 
                                    label={`${percentage}%`} 
                                    size="small"
                                    color={percentage > 50 ? 'primary' : 'default'}
                                    sx={{ fontWeight: 700 }}
                                  />
                                </TableCell>
                              </TableRow>
                            );
                          })}
                          <TableRow sx={{ bgcolor: '#e3f2fd', fontWeight: 800 }}>
                            <TableCell colSpan={2} sx={{ fontWeight: 800, color: '#1a3c6e' }}>TOTAL</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 800, color: '#1a3c6e' }}>{fmtN(totalShares)}</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 800, color: '#1a3c6e' }}>—</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 800, color: '#1a3c6e' }}>
                              {(() => {
                                const totalDividend = invData.holdings.reduce((sum, h) => {
                                  const sec = securities.find(s => s._id === h.security?._id);
                                  return sum + calculateDividendAmount(h, sec);
                                }, 0);
                                return totalDividend > 0 ? `₹${fmtN(totalDividend)}` : '—';
                              })()}
                            </TableCell>
                            <TableCell align="right" sx={{ fontWeight: 800, color: '#1a3c6e' }}>100%</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Card>
                );
              })}
            </Box>
          )}
        </>
      )}

      {/* Create Dividend Dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle fontWeight={700}>Declare Dividend</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          {formErr && <Alert severity="error" sx={{ mb: 2 }}>{formErr}</Alert>}
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                size="small"
                label="Company Name *"
                value={form.companyName}
                onChange={e => setForm(v => ({ ...v, companyName: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                size="small"
                label="ISIN *"
                value={form.isin}
                onChange={e => setForm(v => ({ ...v, isin: e.target.value.toUpperCase() }))}
                inputProps={{ style: { fontFamily: 'monospace', textTransform: 'uppercase' } }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                size="small"
                label="Total Shares *"
                type="number"
                value={form.totalShares}
                onChange={e => setForm(v => ({ ...v, totalShares: e.target.value }))}
                inputProps={{ min: 1 }}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={saving || !form.companyName || !form.isin || !form.totalShares}
            sx={{ bgcolor: '#2e7d32' }}
          >
            {saving ? 'Creating...' : '✅ Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 🔥 DIVIDEND DECLARATION DIALOG */}
      <Dialog open={dividendOpen} onClose={closeDividendDialog} maxWidth="sm" fullWidth>
        <DialogTitle fontWeight={700}>
          Declare Dividend — {selectedSecurityForDividend?.companyName}
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          {dividendErr && <Alert severity="error" sx={{ mb: 2 }}>{dividendErr}</Alert>}
          
          {/* Auto-filled Info Display */}
          <Box sx={{ mb: 3, p: 2, bgcolor: '#f5f5f5', borderRadius: 1 }}>
            <Typography variant="body2" color="text.secondary">
              <strong>ISIN:</strong> {selectedSecurityForDividend?.isin}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              <strong>Total Shares:</strong> {fmtN(selectedSecurityForDividend?.allocatedShares || selectedSecurityForDividend?.totalShares)}
            </Typography>
          </Box>

          <TextField
            fullWidth
            size="small"
            label="Fiscal Year *"
            value={`FY${new Date().getFullYear()}-${(new Date().getFullYear() + 1).toString().slice(-2)}`}
            disabled
            sx={{ mb: 2 }}
            helperText="Auto-detected current fiscal year"
          />

          <TextField
            fullWidth
            size="small"
            label="Dividend Per Share (₹) *"
            type="number"
            value={dividendPerShare}
            onChange={e => setDividendPerShare(e.target.value)}
            inputProps={{ min: 0.01, step: 0.01 }}
            helperText={dividendPerShare ? 
              `Total Dividend Payout: ₹${fmtN((selectedSecurityForDividend?.allocatedShares || selectedSecurityForDividend?.totalShares || 0) * Number(dividendPerShare))}` : 
              'Enter dividend amount per share'
            }
            sx={{ mb: 2 }}
          />

          {dividendPerShare > 0 && (
            <Alert severity="info" sx={{ mt: 2 }}>
              This will distribute ₹{dividendPerShare}/share to all {fmtN(selectedSecurityForDividend?.allocatedShares || selectedSecurityForDividend?.totalShares || 0)} shares
              (Total: ₹{fmtN((selectedSecurityForDividend?.allocatedShares || selectedSecurityForDividend?.totalShares || 0) * Number(dividendPerShare))})
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={closeDividendDialog}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleDividendSubmit}
            disabled={dividendSaving || !dividendPerShare || Number(dividendPerShare) <= 0}
            sx={{ bgcolor: '#2e7d32' }}
          >
            {dividendSaving ? 'Declaring...' : '✅ Declare Dividend'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Print/Export Dialog */}
      <Dialog open={printOpen} onClose={() => setPrintOpen(false)} maxWidth="lg" fullWidth>
        <DialogTitle fontWeight={700}>
          Investor Holdings — {selectedSecurity?.companyName}
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          {loadingHoldings ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <Box ref={printRef} sx={{ bgcolor: '#fff', p: 2 }}>
              {/* Header for PDF */}
              <Box sx={{ mb: 3, pb: 2, borderBottom: '2px solid #1a3c6e' }}>
                <Typography variant="h5" fontWeight={800} color="#1a3c6e">
                  {selectedSecurity?.companyName}
                </Typography>
                <Typography variant="subtitle1" color="text.secondary" mt={1}>
                  Dividend Holdings Report
                </Typography>
                <Typography variant="body2" color="text.secondary" mt={0.5}>
                  Generated on: {new Date().toLocaleDateString('en-IN')} at {new Date().toLocaleTimeString('en-IN')}
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
                <Chip label={`ISIN: ${selectedSecurity?.isin}`} variant="outlined" />
                <Chip label={`Total Shares: ${fmtN(selectedSecurity?.allocatedShares || selectedSecurity?.totalShares)}`} variant="outlined" color="primary" />
                <Chip label={`DPS: ₹${selectedSecurity?.latestDividend?.dividendPerShare || selectedSecurity?.dividends?.[0]?.dividendPerShare || 0}`} variant="outlined" color="success" />
                <Chip label={`Total Dividend: ₹${fmtN((selectedSecurity?.allocatedShares || selectedSecurity?.totalShares || 0) * (selectedSecurity?.latestDividend?.dividendPerShare || selectedSecurity?.dividends?.[0]?.dividendPerShare || 0))}`} variant="outlined" sx={{ bgcolor: '#e3f2fd', color: '#1a3c6e', fontWeight: 700 }} />
                <Chip label={`Investors: ${investorHoldings.length}`} variant="outlined" />
              </Box>
              
              <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 400, mb: 2 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow sx={{ bgcolor: '#1a3c6e' }}>
                      <TableCell sx={{ color: '#fff', fontWeight: 700 }}>Investor Name</TableCell>
                      <TableCell sx={{ color: '#fff', fontWeight: 700 }}>Folio Number</TableCell>
                      <TableCell align="right" sx={{ color: '#fff', fontWeight: 700 }}>Shares Held</TableCell>
                      <TableCell align="right" sx={{ color: '#fff', fontWeight: 700 }}>DPS (₹)</TableCell>
                      <TableCell align="right" sx={{ color: '#fff', fontWeight: 700 }}>Dividend (₹)</TableCell>
                      <TableCell align="right" sx={{ color: '#fff', fontWeight: 700 }}>% Holding</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {investorHoldings.map((holding, idx) => {
                      // 🔥 Same DPS logic as main table
                      const dps = selectedSecurity?.latestDividend?.dividendPerShare ||
                                  selectedSecurity?.dividends?.[0]?.dividendPerShare ||
                                  selectedSecurity?.lastDividend?.dividendPerShare || 0;
                      const dividend = dps > 0 ? holding.shares * dps : 0;
                      return (
                        <TableRow key={idx} hover>
                          <TableCell sx={{ fontWeight: 600 }}>{holding.investor?.fullName || '—'}</TableCell>
                          <TableCell>
                            <Chip 
                              label={holding.investor?.folioNumber || '—'} 
                              size="small" 
                              variant="outlined"
                              sx={{ fontFamily: 'monospace' }}
                            />
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700 }}>{fmtN(holding.shares)}</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700, color: '#2e7d32' }}>{dps > 0 ? `₹${dps}` : '—'}</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700, color: '#1a3c6e' }}>{dividend > 0 ? `₹${fmtN(dividend)}` : '—'}</TableCell>
                          <TableCell align="right">
                            <Chip 
                              label={selectedSecurity.allocatedShares > 0 
                                ? ((holding.shares / selectedSecurity.allocatedShares) * 100).toFixed(2) + '%'
                                : '0%'
                              } 
                              size="small"
                              color={holding.shares / (selectedSecurity.allocatedShares || 1) > 0.5 ? 'primary' : 'default'}
                              sx={{ fontWeight: 700 }}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {investorHoldings.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} align="center" sx={{ color: 'text.secondary', py: 4 }}>
                          <Typography>No investor holdings found</Typography>
                        </TableCell>
                      </TableRow>
                    )}
                    {/* Total Row */}
                    {investorHoldings.length > 0 && (
                      <TableRow sx={{ bgcolor: '#f5f5f5', fontWeight: 800 }}>
                        <TableCell colSpan={2} sx={{ fontWeight: 800, color: '#1a3c6e' }}>TOTAL</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 800 }}>
                          {fmtN(investorHoldings.reduce((sum, h) => sum + (h.shares || 0), 0))}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 800, color: '#1a3c6e' }}>—</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 800, color: '#1a3c6e' }}>
                          {(() => {
                            const totalDps = selectedSecurity?.latestDividend?.dividendPerShare ||
                                            selectedSecurity?.dividends?.[0]?.dividendPerShare || 0;
                            const totalShares = investorHoldings.reduce((sum, h) => sum + (h.shares || 0), 0);
                            const totalDividend = totalDps > 0 ? totalShares * totalDps : 0;
                            return totalDividend > 0 ? `₹${fmtN(totalDividend)}` : '—';
                          })()}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 800, color: '#1a3c6e' }}>100%</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>

              {/* Footer for PDF */}
              <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid #ddd', fontSize: 11, color: '#666' }}>
                <Typography>
                  This is an auto-generated report. For any discrepancies, please contact the administrator.
                </Typography>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setPrintOpen(false)}>Close</Button>
          <Button
            variant="outlined"
            startIcon={<Download />}
            onClick={handleExportExcel}
            disabled={loadingHoldings || investorHoldings.length === 0}
          >
            Export to Excel
          </Button>
          <Button
            variant="contained"
            startIcon={<PictureAsPdf />}
            onClick={handlePrintPDF}
            disabled={loadingHoldings || investorHoldings.length === 0}
            sx={{ bgcolor: '#c62828' }}
          >
            Download PDF
          </Button>
        </DialogActions>
      </Dialog>

      {/* Investor-wise Print Dialog */}
      <Dialog open={printInvestorOpen} onClose={() => setPrintInvestorOpen(false)} maxWidth="lg" fullWidth>
        <DialogTitle fontWeight={700}>
          Investor-wise Holdings Report
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          {loadingAllHoldings ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : (
            <Box ref={investorPrintRef} sx={{ bgcolor: '#fff', p: 2 }}>
              {/* Header for PDF */}
              <Box sx={{ mb: 3, pb: 2, borderBottom: '2px solid #1a3c6e' }}>
                <Typography variant="h5" fontWeight={800} color="#1a3c6e">
                  Investor-wise Share Holdings Report
                </Typography>
                <Typography variant="subtitle1" color="text.secondary" mt={1}>
                  Complete Holdings Breakdown by Investor
                </Typography>
                <Typography variant="body2" color="text.secondary" mt={0.5}>
                  Generated on: {new Date().toLocaleDateString('en-IN')} at {new Date().toLocaleTimeString('en-IN')}
                </Typography>
                {(folioFilter || investorNameFilter) && (
                  <Box sx={{ mt: 1 }}>
                    <Typography variant="body2" color="primary">
                      Filters Applied: 
                      {folioFilter && ` Folio: ${folioFilter}`}
                      {investorNameFilter && ` Name: ${investorNameFilter}`}
                    </Typography>
                  </Box>
                )}
              </Box>

              <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
                <Chip label={`Total Investors: ${investorsList.length}`} variant="outlined" color="primary" />
                <Chip label={`Total Holdings: ${fmtN(investorsList.reduce((sum, inv) => sum + inv.holdings.reduce((s, h) => s + (h.shares || 0), 0), 0))}`} variant="outlined" />
              </Box>
              
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {investorsList.map((invData, idx) => {
                  const totalShares = invData.holdings.reduce((sum, h) => sum + (h.shares || 0), 0);
                  return (
                    <Box key={idx}>
                      <Box sx={{ p: 2, bgcolor: '#1a3c6e', color: '#fff', borderRadius: 1 }}>
                        <Typography variant="h6" fontWeight={700}>
                          Investor {idx + 1}: {invData.investor?.fullName || 'Unknown Investor'}
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 2, mt: 1, flexWrap: 'wrap' }}>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            Folio: {invData.investor?.folioNumber || '—'}
                          </Typography>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            Total Shares: {fmtN(totalShares)}
                          </Typography>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            Companies: {invData.holdings.length}
                          </Typography>
                        </Box>
                      </Box>
                      <TableContainer component={Paper} variant="outlined" sx={{ mt: 2 }}>
                        <Table size="small">
                          <TableHead>
                            <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                              <TableCell sx={{ fontWeight: 700 }}>Company</TableCell>
                              <TableCell sx={{ fontWeight: 700 }}>ISIN</TableCell>
                              <TableCell align="right" sx={{ fontWeight: 700 }}>Shares Held</TableCell>
                              <TableCell align="right" sx={{ fontWeight: 700 }}>DPS (₹)</TableCell>
                              <TableCell align="right" sx={{ fontWeight: 700 }}>Dividend (₹)</TableCell>
                              <TableCell align="right" sx={{ fontWeight: 700 }}>% of Investor Total</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {invData.holdings.map((holding, hIdx) => {
                              // 🔥 FIX: Try both securityId formats
                              const security = securities.find(s => 
                                s._id === holding.securityId || 
                                s._id === holding.security?._id
                              );
                              const percentage = totalShares > 0 ? ((holding.shares / totalShares) * 100).toFixed(2) : '0';
                              // 🔥 Same DPS logic
                              const dps = security?.latestDividend?.dividendPerShare ||
                                          security?.dividends?.[0]?.dividendPerShare ||
                                          security?.lastDividend?.dividendPerShare || 0;
                              const dividend = dps > 0 ? holding.shares * dps : 0;
                              return (
                                <TableRow key={hIdx} hover>
                                  <TableCell sx={{ fontWeight: 600 }}>{security?.companyName || holding.security?.companyName || '—'}</TableCell>
                                  <TableCell>
                                    <Typography sx={{ fontFamily: 'monospace', fontSize: 12 }}>
                                      {security?.isin || holding.security?.isin || '—'}
                                    </Typography>
                                  </TableCell>
                                  <TableCell align="right" sx={{ fontWeight: 700 }}>{fmtN(holding.shares)}</TableCell>
                                  <TableCell align="right" sx={{ fontWeight: 700, color: '#2e7d32' }}>{dps > 0 ? `₹${dps}` : '—'}</TableCell>
                                  <TableCell align="right" sx={{ fontWeight: 700, color: '#1a3c6e' }}>{dividend > 0 ? `₹${fmtN(dividend)}` : '—'}</TableCell>
                                  <TableCell align="right">
                                    <Chip 
                                      label={`${percentage}%`} 
                                      size="small"
                                      color={percentage > 50 ? 'primary' : 'default'}
                                      sx={{ fontWeight: 700 }}
                                    />
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                            <TableRow sx={{ bgcolor: '#e3f2fd', fontWeight: 800 }}>
                              <TableCell colSpan={2} sx={{ fontWeight: 800, color: '#1a3c6e' }}>TOTAL</TableCell>
                              <TableCell align="right" sx={{ fontWeight: 800, color: '#1a3c6e' }}>{fmtN(totalShares)}</TableCell>
                              <TableCell align="right" sx={{ fontWeight: 800, color: '#1a3c6e' }}>—</TableCell>
                              <TableCell align="right" sx={{ fontWeight: 800, color: '#1a3c6e' }}>
                                {(() => {
                                  const totalDividend = invData.holdings.reduce((sum, h) => {
                                    // 🔥 FIX: Same dual lookup for total
                                    const sec = securities.find(s => 
                                      s._id === h.securityId || 
                                      s._id === h.security?._id
                                    );
                                    const d = sec?.latestDividend?.dividendPerShare || 0;
                                    return sum + (h.shares * d);
                                  }, 0);
                                  return totalDividend > 0 ? `₹${fmtN(totalDividend)}` : '—';
                                })()}
                              </TableCell>
                              <TableCell align="right" sx={{ fontWeight: 800, color: '#1a3c6e' }}>100%</TableCell>
                            </TableRow>
                          </TableBody>
                        </Table>
                      </TableContainer>
                    </Box>
                  );
                })}
              </Box>

              {/* Footer for PDF */}
              <Box sx={{ mt: 3, pt: 2, borderTop: '1px solid #ddd', fontSize: 11, color: '#666' }}>
                <Typography>
                  This is an auto-generated report. For any discrepancies, please contact the administrator.
                </Typography>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setPrintInvestorOpen(false)}>Close</Button>
          <Button
            variant="outlined"
            startIcon={<Download />}
            onClick={handleExportInvestorExcel}
            disabled={loadingAllHoldings || investorsList.length === 0}
          >
            Export to Excel
          </Button>
          <Button
            variant="contained"
            startIcon={<PictureAsPdf />}
            onClick={handlePrintInvestorPDF}
            disabled={loadingAllHoldings || investorsList.length === 0}
            sx={{ bgcolor: '#c62828' }}
          >
            Download PDF
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
