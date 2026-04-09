import React, { useEffect, useState, useRef } from 'react';
import { Box, Card, Typography, Table, TableBody, TableCell, TableHead, TableRow, Chip, CircularProgress, TextField, MenuItem, Grid, Tabs, Tab, Collapse, IconButton, Button, Paper, TableContainer, Dialog, DialogTitle, DialogContent, DialogActions, useMediaQuery, useTheme } from '@mui/material';
import { ExpandMore, ExpandLess, PictureAsPdf, Download, Print } from '@mui/icons-material';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import api from '../utils/api';
import StatusChip from '../components/common/StatusChip';

const ACTION_COLORS = {
  CREATE: 'primary', EDIT: 'warning', APPROVE: 'success', REJECT: 'error',
  SUBMIT: 'info', INITIATE: 'info', KYC_UPLOAD: 'info'
};

function AuditRow({ log }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <TableRow hover>
        <TableCell sx={{ fontSize:12, fontFamily:'monospace', color:'text.secondary' }}>{new Date(log.createdAt).toLocaleString()}</TableCell>
        <TableCell><Chip label={log.entityType} size="small" variant="outlined" /></TableCell>
        <TableCell><Chip label={log.action} size="small" color={ACTION_COLORS[log.action] || 'default'} /></TableCell>
        <TableCell><Typography fontSize={13} fontWeight={600}>{log.userId?.name || log.userName || '—'}</Typography></TableCell>
        <TableCell><Chip label={log.role || '—'} size="small" /></TableCell>
        <TableCell sx={{ fontSize: 12, color: log.reason ? 'inherit' : 'text.secondary', fontStyle: log.reason ? 'inherit' : 'italic' }}>{log.reason || 'No reason'}</TableCell>
        <TableCell>
          {(log.oldData || log.newData) ? (
            <IconButton size="small" onClick={() => setExpanded(e => !e)} color="primary">
              {expanded ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
            </IconButton>
          ) : (
            <Typography fontSize={11} color="text.secondary" fontStyle="italic">—</Typography>
          )}
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={7} sx={{ py:0 }}>
            <Collapse in={expanded}>
              <Box sx={{ p:2, bgcolor:'#f8f9fa', borderRadius:1, my:1 }}>
                <Grid container spacing={2}>
                  {log.oldData && <Grid item xs={6}>
                    <Card variant="outlined" sx={{ borderColor: '#ff9800' }}>
                      <Box sx={{ bgcolor: '#fff3e0', px: 1.5, py: 0.75, borderBottom: '1px solid #ffe0b2' }}>
                        <Typography fontSize={12} fontWeight={700} color="#e65100" display="flex" alignItems="center" gap={0.5}>
                          <span>←</span> OLD DATA
                        </Typography>
                      </Box>
                      <Table size="small" sx={{ '& td': { fontSize: 11, py: 0.5, borderColor: '#f5f5f5' } }}>
                        <TableBody>
                          {Object.entries(log.oldData).map(([key, val]) => (
                            <TableRow key={key} sx={{ '&:hover': { bgcolor: '#fafafa' } }}>
                              <TableCell sx={{ fontWeight: 600, color: '#666', width: '40%' }}>{key}</TableCell>
                              <TableCell sx={{ color: '#333', fontFamily: 'monospace' }}>
                                {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </Card>
                  </Grid>}
                  {log.newData && <Grid item xs={6}>
                    <Card variant="outlined" sx={{ borderColor: '#4caf50' }}>
                      <Box sx={{ bgcolor: '#e8f5e9', px: 1.5, py: 0.75, borderBottom: '1px solid #c8e6c9' }}>
                        <Typography fontSize={12} fontWeight={700} color="#2e7d32" display="flex" alignItems="center" gap={0.5}>
                          <span>→</span> NEW DATA
                        </Typography>
                      </Box>
                      <Table size="small" sx={{ '& td': { fontSize: 11, py: 0.5, borderColor: '#f5f5f5' } }}>
                        <TableBody>
                          {Object.entries(log.newData).map(([key, val]) => (
                            <TableRow key={key} sx={{ '&:hover': { bgcolor: '#fafafa' } }}>
                              <TableCell sx={{ fontWeight: 600, color: '#666', width: '40%' }}>{key}</TableCell>
                              <TableCell sx={{ color: '#333', fontFamily: 'monospace' }}>
                                {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </Card>
                  </Grid>}
                </Grid>
              </Box>
            </Collapse>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

export default function AuditPage() {
  const [tab, setTab] = useState(0);
  const [logs, setLogs] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [entityType, setEntityType] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [printOpen, setPrintOpen] = useState(false);
  const [validationResults, setValidationResults] = useState(null);
  const [validationLoading, setValidationLoading] = useState(false);
  const [autoFix, setAutoFix] = useState(false);
  const printRef = useRef(null);
  const theme = useTheme();
  const fullScreenDialog = useMediaQuery(theme.breakpoints.down('sm'));

  useEffect(() => {
    setLoading(true);
    const params = {};
    if (entityType) params.entityType = entityType;
    Promise.all([
      api.get('/audit/logs', { params }),
      api.get('/audit/history')
    ]).then(([lr, hr]) => {
      setLogs(lr.data.logs);
      setHistory(hr.data.history);
    }).catch(console.error).finally(() => setLoading(false));
  }, [entityType]);

  // Export to Excel (CSV)
  const exportToExcel = () => {
    let dataToExport = tab === 0 ? logs : history;
    
    // Apply user filter
    if (userFilter) {
      if (tab === 0) {
        dataToExport = dataToExport.filter(log => 
          (log.userId?.name || log.userName || '').toLowerCase().includes(userFilter.toLowerCase())
        );
      } else {
        dataToExport = dataToExport.filter(h => 
          h.changedByName.toLowerCase().includes(userFilter.toLowerCase())
        );
      }
    }

    if (dataToExport.length === 0) return;

    const headers = tab === 0 
      ? ['Timestamp', 'Entity Type', 'Action', 'Performed By', 'Role', 'Reason', 'Old Data', 'New Data']
      : ['Timestamp', 'Entity Type', 'Old Status', 'New Status', 'Changed By', 'Role', 'Reason'];

    const rows = dataToExport.map(item => {
      if (tab === 0) {
        return [
          new Date(item.createdAt).toLocaleString(),
          item.entityType,
          item.action,
          item.userId?.name || item.userName || '—',
          item.role || '—',
          item.reason || '—',
          item.oldData ? JSON.stringify(item.oldData) : '—',
          item.newData ? JSON.stringify(item.newData) : '—'
        ];
      } else {
        return [
          new Date(item.createdAt).toLocaleString(),
          item.entityType,
          item.oldStatus || '—',
          item.newStatus,
          item.changedByName,
          item.changedByRole,
          item.reason || '—'
        ];
      }
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${tab === 0 ? 'audit_logs' : 'status_history'}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  // Generate PDF (multi-page)
  const generatePDF = async () => {
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

      // Add first page
      pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      // Add additional pages if needed
      let pageCount = 1;
      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
        pageCount++;
      }

      // Add page numbers
      const totalPages = pdf.internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);
        pdf.setFontSize(10);
        pdf.setTextColor(150);
        pdf.text(`Page ${i} of ${totalPages}`, 10, 290);
        pdf.text(`Generated on: ${new Date().toLocaleDateString()}`, 140, 290);
      }

      pdf.save(`audit_report_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (err) {
      console.error('PDF generation error:', err);
    }
  };

  // Print
  const handlePrint = () => {
    const printContent = document.getElementById('print-content');
    if (!printContent) return;

    // Create a new window for printing
    const printWindow = window.open('', '', 'width=800,height=600');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Print Report</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #1a3c6e; color: white; }
          .header { border-bottom: 2px solid #1a3c6e; margin-bottom: 20px; padding-bottom: 10px; }
          .summary { background-color: #f5f5f5; padding: 15px; margin-bottom: 20px; border-radius: 5px; }
          .footer { margin-top: 30px; padding-top: 10px; border-top: 1px solid #ddd; font-size: 11px; color: #666; }
        </style>
      </head>
      <body>
        ${printContent.innerHTML}
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.onload = function() {
      printWindow.print();
      printWindow.close();
    };
  };

  // Run validation
  const runValidation = async () => {
    setValidationLoading(true);
    try {
      const response = await api.get('/audit/validate', { params: { autoFix } });
      setValidationResults(response.data);
    } catch (error) {
      console.error('Validation error:', error);
    } finally {
      setValidationLoading(false);
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: { xs: 2, sm: 3 }, flexDirection: { xs: 'column', sm: 'row' }, gap: { xs: 2, sm: 0 } }}>
        <Typography variant="h5" fontWeight={700} color="#1a3c6e">Audit & History</Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: { xs: 'center', sm: 'flex-end' } }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<Download />}
            onClick={exportToExcel}
            disabled={loading || (tab === 0 ? logs.length === 0 : history.length === 0)}
            sx={{ fontSize: { xs: 11, sm: 12 } }}
          >
            Export to Excel
          </Button>
          <Button
            variant="outlined"
            size="small"
            startIcon={<PictureAsPdf />}
            onClick={() => setPrintOpen(true)}
            disabled={loading || (tab === 0 ? logs.length === 0 : history.length === 0)}
            sx={{ fontSize: { xs: 11, sm: 12 } }}
          >
            Download PDF
          </Button>
          <Button
            variant="contained"
            size="small"
            startIcon={<Print />}
            onClick={handlePrint}
            disabled={loading || (tab === 0 ? logs.length === 0 : history.length === 0)}
            sx={{ bgcolor: '#1a3c6e' }}
          >
            Print
          </Button>
        </Box>
      </Box>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: { xs: 1, sm: 2 } }}>
        <Tab label="Audit Logs" />
        <Tab label="Status History" />
        <Tab label="Validation Dashboard" />
      </Tabs>

      {tab === 0 && (
        <Box>
          <Paper sx={{ mb: 2, p: { xs: 1, sm: 2 }, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
            <TextField select size="small" label="Entity Type" value={entityType} onChange={e => setEntityType(e.target.value)} sx={{ minWidth: { xs: 120, sm: 180 }, flex: 1 }}>
              {['','Investor','Security','Allocation','Transfer'].map(e => <MenuItem key={e} value={e}>{e || 'All'}</MenuItem>)}
            </TextField>
            <TextField size="small" label="Filter by User" placeholder="User name..." value={userFilter} onChange={e => setUserFilter(e.target.value)} sx={{ minWidth: { xs: 150, sm: 200 }, flex: 1 }} />
            <Button variant="outlined" size="small" onClick={() => { setEntityType(''); setUserFilter(''); }} sx={{ fontSize: { xs: 11, sm: 12 } }}>Clear Filters</Button>
          </Paper>
          <Card>
            <TableContainer sx={{ overflowX: 'auto' }}>
              <Table size="small" sx={{ minWidth: { xs: 700, md: 900 } }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontSize: { xs: 11, sm: 12 } }}>Timestamp</TableCell>
                    <TableCell sx={{ fontSize: { xs: 11, sm: 12 } }}>Entity</TableCell>
                    <TableCell sx={{ fontSize: { xs: 11, sm: 12 } }}>Action</TableCell>
                    <TableCell sx={{ fontSize: { xs: 11, sm: 12 } }}>Performed By</TableCell>
                    <TableCell sx={{ fontSize: { xs: 11, sm: 12 } }}>Role</TableCell>
                    <TableCell sx={{ fontSize: { xs: 11, sm: 12 } }}>Reason</TableCell>
                    <TableCell sx={{ fontSize: { xs: 11, sm: 12 } }}>Details</TableCell>
                  </TableRow>
                </TableHead>
              <TableBody>
                {loading && <TableRow><TableCell colSpan={7} align="center"><CircularProgress size={24} /></TableCell></TableRow>}
                {!loading && logs.filter(log => !userFilter || (log.userId?.name || log.userName || '').toLowerCase().includes(userFilter.toLowerCase())).map(log => <AuditRow key={log._id} log={log} />)}
                {!loading && logs.filter(log => !userFilter || (log.userId?.name || log.userName || '').toLowerCase().includes(userFilter.toLowerCase())).length === 0 && <TableRow><TableCell colSpan={7} align="center" sx={{ color:'text.secondary', py:3 }}>No logs</TableCell></TableRow>}
              </TableBody>
            </Table>
            </TableContainer>
          </Card>
        </Box>
      )}

      {tab === 1 && (
        <Box>
          <Paper sx={{ mb: 2, p: { xs: 1, sm: 2 }, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
            <TextField size="small" label="Filter by Changed By" placeholder="User name..." value={userFilter} onChange={e => setUserFilter(e.target.value)} sx={{ minWidth: { xs: 150, sm: 200 }, flex: 1 }} />
            <Button variant="outlined" size="small" onClick={() => setUserFilter('')} sx={{ fontSize: { xs: 11, sm: 12 } }}>Clear Filter</Button>
          </Paper>
          <Card>
            <TableContainer sx={{ overflowX: 'auto' }}>
              <Table size="small" sx={{ minWidth: { xs: 700, md: 900 } }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontSize: { xs: 11, sm: 12 } }}>Timestamp</TableCell>
                    <TableCell sx={{ fontSize: { xs: 11, sm: 12 } }}>Entity</TableCell>
                    <TableCell sx={{ fontSize: { xs: 11, sm: 12 } }}>Old Status</TableCell>
                    <TableCell sx={{ fontSize: { xs: 11, sm: 12 } }}>New Status</TableCell>
                    <TableCell sx={{ fontSize: { xs: 11, sm: 12 } }}>Changed By</TableCell>
                    <TableCell sx={{ fontSize: { xs: 11, sm: 12 } }}>Role</TableCell>
                    <TableCell sx={{ fontSize: { xs: 11, sm: 12 } }}>Reason</TableCell>
                  </TableRow>
                </TableHead>
              <TableBody>
                {loading && <TableRow><TableCell colSpan={7} align="center"><CircularProgress size={24} /></TableCell></TableRow>}
                {!loading && history.filter(h => !userFilter || h.changedByName.toLowerCase().includes(userFilter.toLowerCase())).map(h => (
                  <TableRow key={h._id} hover>
                    <TableCell sx={{ fontSize:12, fontFamily:'monospace', color:'text.secondary' }}>{new Date(h.createdAt).toLocaleString()}</TableCell>
                    <TableCell><Chip label={h.entityType} size="small" variant="outlined" /></TableCell>
                    <TableCell>{h.oldStatus ? <StatusChip status={h.oldStatus} /> : '—'}</TableCell>
                    <TableCell><StatusChip status={h.newStatus} /></TableCell>
                    <TableCell><Typography fontSize={13} fontWeight={600}>{h.changedByName}</Typography></TableCell>
                    <TableCell><Chip label={h.changedByRole} size="small" /></TableCell>
                    <TableCell sx={{ fontSize:12, color:'text.secondary' }}>{h.reason || '—'}</TableCell>
                  </TableRow>
                ))}
                {!loading && history.filter(h => !userFilter || h.changedByName.toLowerCase().includes(userFilter.toLowerCase())).length === 0 && <TableRow><TableCell colSpan={7} align="center" sx={{ color:'text.secondary', py:3 }}>No history</TableCell></TableRow>}
              </TableBody>
            </Table>
            </TableContainer>
          </Card>
        </Box>
      )}

      {tab === 2 && (
        <Box>
          {/* Controls */}
          <Paper sx={{ mb: { xs: 2, sm: 3 }, p: { xs: 1, sm: 2 }, display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', justifyContent: { xs: 'center', sm: 'flex-start' } }}>
            <Button
              variant="contained"
              onClick={runValidation}
              disabled={validationLoading}
              sx={{ bgcolor: '#1a3c6e', fontSize: { xs: 11, sm: 12 }, flex: { xs: 1, sm: 'auto' } }}
            >
              {validationLoading ? <CircularProgress size={20} sx={{ mr: 1 }} /> : null}
              Run Audit
            </Button>
            <Button
              variant={autoFix ? 'contained' : 'outlined'}
              onClick={() => setAutoFix(!autoFix)}
              color={autoFix ? 'warning' : 'primary'}
              sx={{ fontSize: { xs: 11, sm: 12 }, flex: { xs: 1, sm: 'auto' } }}
            >
              Auto-Fix: {autoFix ? 'ON' : 'OFF'}
            </Button>
            <Button variant="outlined" onClick={() => { setValidationResults(null); }} sx={{ fontSize: { xs: 11, sm: 12 }, flex: { xs: 1, sm: 'auto' } }}>
              Refresh
            </Button>
          </Paper>

          {/* Summary Cards */}
          {validationResults && (
            <Grid container spacing={{ xs: 1, sm: 2 }} sx={{ mb: { xs: 2, sm: 3 } }}>
              <Grid item xs={12} sm={6} md={2.4}>
                <Card sx={{ p: { xs: 1.5, sm: 2 }, bgcolor: '#e3f2fd', border: '1px solid #2196f3' }}>
                  <Typography variant="body2" color="#1565c0" fontSize={{ xs: 11, sm: 12 }}>Total Checked</Typography>
                  <Typography variant="h4" fontWeight={700} color="#0d47a1" fontSize={{ xs: '1.5rem', sm: '2.125rem' }}>{validationResults.summary.totalChecked}</Typography>
                </Card>
              </Grid>
              <Grid item xs={12} sm={6} md={2.4}>
                <Card sx={{ p: { xs: 1.5, sm: 2 }, bgcolor: '#ffebee', border: '1px solid #f44336' }}>
                  <Typography variant="body2" color="#c62828" fontSize={{ xs: 11, sm: 12 }}>Errors Found</Typography>
                  <Typography variant="h4" fontWeight={700} color="#b71c1c" fontSize={{ xs: '1.5rem', sm: '2.125rem' }}>{validationResults.summary.errorsFound}</Typography>
                </Card>
              </Grid>
              <Grid item xs={12} sm={6} md={2.4}>
                <Card sx={{ p: { xs: 1.5, sm: 2 }, bgcolor: '#e8f5e9', border: '1px solid #4caf50' }}>
                  <Typography variant="body2" color="#2e7d32" fontSize={{ xs: 11, sm: 12 }}>Auto Fixed</Typography>
                  <Typography variant="h4" fontWeight={700} color="#1b5e20" fontSize={{ xs: '1.5rem', sm: '2.125rem' }}>{validationResults.summary.autoFixed}</Typography>
                </Card>
              </Grid>
              <Grid item xs={12} sm={6} md={2.4}>
                <Card sx={{ p: { xs: 1.5, sm: 2 }, bgcolor: '#fff3e0', border: '1px solid #ff9800' }}>
                  <Typography variant="body2" color="#ef6c00" fontSize={{ xs: 11, sm: 12 }}>High Severity</Typography>
                  <Typography variant="h4" fontWeight={700} color="#e65100" fontSize={{ xs: '1.5rem', sm: '2.125rem' }}>{validationResults.summary.highErrors}</Typography>
                </Card>
              </Grid>
              <Grid item xs={12} sm={6} md={2.4}>
                <Card sx={{ p: { xs: 1.5, sm: 2 }, bgcolor: '#fce4ec', border: '1px solid #e91e63' }}>
                  <Typography variant="body2" color="#c2185b" fontSize={{ xs: 11, sm: 12 }}>Critical Errors</Typography>
                  <Typography variant="h4" fontWeight={700} color="#880e4f" fontSize={{ xs: '1.5rem', sm: '2.125rem' }}>{validationResults.summary.criticalErrors}</Typography>
                </Card>
              </Grid>
            </Grid>
          )}

          {/* Issues Table */}
          {validationResults && validationResults.issues.length > 0 && (
            <Card>
              <Typography variant="h6" fontWeight={700} mb={{ xs: 1, sm: 2 }}>Validation Issues</Typography>
              <TableContainer sx={{ overflowX: 'auto' }}>
                <Table size="small" sx={{ minWidth: { xs: 800, md: 1000 } }}>
                  <TableHead>
                    <TableRow sx={{ bgcolor: '#1a3c6e' }}>
                      <TableCell sx={{ color: '#fff', fontWeight: 700, fontSize: { xs: 11, sm: 12 } }}>Type</TableCell>
                      <TableCell sx={{ color: '#fff', fontWeight: 700, fontSize: { xs: 11, sm: 12 } }}>Severity</TableCell>
                      <TableCell sx={{ color: '#fff', fontWeight: 700, fontSize: { xs: 11, sm: 12 } }}>Investor</TableCell>
                      <TableCell sx={{ color: '#fff', fontWeight: 700, fontSize: { xs: 11, sm: 12 } }}>ISIN</TableCell>
                      <TableCell sx={{ color: '#fff', fontWeight: 700, fontSize: { xs: 11, sm: 12 } }}>Expected</TableCell>
                      <TableCell sx={{ color: '#fff', fontWeight: 700, fontSize: { xs: 11, sm: 12 } }}>Actual</TableCell>
                      <TableCell sx={{ color: '#fff', fontWeight: 700, fontSize: { xs: 11, sm: 12 } }}>Status</TableCell>
                      <TableCell sx={{ color: '#fff', fontWeight: 700, fontSize: { xs: 11, sm: 12 } }}>Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {validationResults.issues.map(issue => (
                      <TableRow key={issue.id} hover>
                        <TableCell sx={{ fontSize: { xs: 10, sm: 11 } }}>{issue.type}</TableCell>
                        <TableCell>
                          <Chip 
                            label={issue.severity} 
                            size="small"
                            color={issue.severity === 'CRITICAL' ? 'error' : issue.severity === 'HIGH' ? 'warning' : 'default'}
                          />
                        </TableCell>
                        <TableCell sx={{ fontSize: { xs: 10, sm: 11 } }}>{issue.investor}</TableCell>
                        <TableCell sx={{ fontSize: { xs: 10, sm: 11 } }}>{issue.isin}</TableCell>
                        <TableCell sx={{ fontFamily: 'monospace', fontSize: { xs: 10, sm: 11 } }}>{issue.expected}</TableCell>
                        <TableCell sx={{ fontFamily: 'monospace', fontSize: { xs: 10, sm: 11 } }}>{issue.actual}</TableCell>
                        <TableCell>
                          <Chip 
                            label={issue.fixed ? 'Fixed' : 'Pending'} 
                            size="small"
                            color={issue.fixed ? 'success' : 'default'}
                          />
                        </TableCell>
                        <TableCell sx={{ fontSize: { xs: 10, sm: 11 } }}>{issue.fixAction}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Card>
          )}

          {!validationResults && (
            <Card sx={{ p: 4, textAlign: 'center', bgcolor: '#f5f5f5' }}>
              <Typography variant="body1" color="text.secondary">
                Click "Run Audit" to perform a full system validation check
              </Typography>
            </Card>
          )}
        </Box>
      )}

      {/* Print/Export Dialog */}
      <Dialog open={printOpen} onClose={() => setPrintOpen(false)} maxWidth="lg" fullWidth fullScreen={fullScreenDialog}>
        <DialogTitle fontWeight={700}>
          {tab === 0 ? 'Audit Logs Report' : 'Status History Report'}
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Box ref={printRef} id="print-content" sx={{ bgcolor: '#fff', p: 2 }}>
            {/* Header */}
            <Box sx={{ mb: 3, pb: 2, borderBottom: '2px solid #1a3c6e' }}>
              <Typography variant="h5" fontWeight={800} color="#1a3c6e">
                {tab === 0 ? 'Audit Logs Report' : 'Status History Report'}
              </Typography>
              <Typography variant="subtitle1" color="text.secondary" mt={1}>
                Investor Management System - Audit Trail
              </Typography>
              <Typography variant="body2" color="text.secondary" mt={0.5}>
                Generated on: {new Date().toLocaleDateString('en-IN')} at {new Date().toLocaleTimeString('en-IN')}
              </Typography>
              {entityType && (
                <Box sx={{ mt: 1 }}>
                  <Typography variant="body2" color="primary">
                    Filter: Entity Type = {entityType}
                  </Typography>
                </Box>
              )}
              {userFilter && (
                <Box sx={{ mt: 1 }}>
                  <Typography variant="body2" color="primary">
                    Filter: User = {userFilter}
                  </Typography>
                </Box>
              )}
            </Box>

            {/* Summary */}
            <Box sx={{ mb: 3, p: 2, bgcolor: '#f5f5f5', borderRadius: 1 }}>
              <Typography variant="h6" fontWeight={700} mb={2}>Summary</Typography>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="body2">Total Records: <strong>{tab === 0 ? (userFilter ? logs.filter(log => (log.userId?.name || log.userName || '').toLowerCase().includes(userFilter.toLowerCase())).length : logs.length) : (userFilter ? history.filter(h => h.changedByName.toLowerCase().includes(userFilter.toLowerCase())).length : history.length)}</strong></Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2">Report Type: <strong>{tab === 0 ? 'Audit Logs' : 'Status History'}</strong></Typography>
                </Grid>
              </Grid>
            </Box>

            {/* Table */}
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: '#1a3c6e' }}>
                    {tab === 0 ? (
                      <>
                        <TableCell sx={{ color: '#fff', fontWeight: 700 }}>Timestamp</TableCell>
                        <TableCell sx={{ color: '#fff', fontWeight: 700 }}>Entity Type</TableCell>
                        <TableCell sx={{ color: '#fff', fontWeight: 700 }}>Action</TableCell>
                        <TableCell sx={{ color: '#fff', fontWeight: 700 }}>Performed By</TableCell>
                        <TableCell sx={{ color: '#fff', fontWeight: 700 }}>Role</TableCell>
                        <TableCell sx={{ color: '#fff', fontWeight: 700 }}>Reason</TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell sx={{ color: '#fff', fontWeight: 700 }}>Timestamp</TableCell>
                        <TableCell sx={{ color: '#fff', fontWeight: 700 }}>Entity Type</TableCell>
                        <TableCell sx={{ color: '#fff', fontWeight: 700 }}>Old Status</TableCell>
                        <TableCell sx={{ color: '#fff', fontWeight: 700 }}>New Status</TableCell>
                        <TableCell sx={{ color: '#fff', fontWeight: 700 }}>Changed By</TableCell>
                        <TableCell sx={{ color: '#fff', fontWeight: 700 }}>Role</TableCell>
                        <TableCell sx={{ color: '#fff', fontWeight: 700 }}>Reason</TableCell>
                      </>
                    )}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {tab === 0 && logs.filter(log => !userFilter || (log.userId?.name || log.userName || '').toLowerCase().includes(userFilter.toLowerCase())).map(log => (
                    <TableRow key={log._id}>
                      <TableCell sx={{ fontSize: 10, fontFamily: 'monospace' }}>
                        {new Date(log.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell>{log.entityType}</TableCell>
                      <TableCell>{log.action}</TableCell>
                      <TableCell>{log.userId?.name || log.userName || '—'}</TableCell>
                      <TableCell>{log.role || '—'}</TableCell>
                      <TableCell sx={{ fontSize: 10 }}>{log.reason || '—'}</TableCell>
                    </TableRow>
                  ))}
                  {tab === 1 && history.filter(h => !userFilter || h.changedByName.toLowerCase().includes(userFilter.toLowerCase())).map(h => (
                    <TableRow key={h._id}>
                      <TableCell sx={{ fontSize: 10, fontFamily: 'monospace' }}>
                        {new Date(h.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell>{h.entityType}</TableCell>
                      <TableCell>{h.oldStatus || '—'}</TableCell>
                      <TableCell>{h.newStatus}</TableCell>
                      <TableCell>{h.changedByName}</TableCell>
                      <TableCell>{h.changedByRole}</TableCell>
                      <TableCell sx={{ fontSize: 10 }}>{h.reason || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            {/* Footer */}
            <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid #ddd', fontSize: 11, color: '#666' }}>
              <Typography>
                This is an auto-generated report from the Investor Management System Audit Trail.
                For any discrepancies, please contact the system administrator.
              </Typography>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setPrintOpen(false)}>Close</Button>
          <Button
            variant="outlined"
            startIcon={<Download />}
            onClick={exportToExcel}
          >
            Export to Excel
          </Button>
          <Button
            variant="contained"
            startIcon={<PictureAsPdf />}
            onClick={generatePDF}
            sx={{ bgcolor: '#c62828' }}
          >
            Download PDF
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
