import React, { useEffect, useState } from 'react';
import { 
  Box, Card, Typography, Table, TableBody, TableCell, TableHead, TableRow, 
  Chip, CircularProgress, Button, Alert, Paper, TableContainer, Tooltip, IconButton 
} from '@mui/material';
import { Visibility } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import StatusChip from '../components/common/StatusChip';

const KYC_DOCS = [
  { key: 'aadhaar', label: 'Aadhaar' },
  { key: 'pan', label: 'PAN' },
  { key: 'bank', label: 'Bank' },
  { key: 'photo', label: 'Photo' }
];

// Helper to safely get KYC document from multiple possible structures
// Step 8: FRONTEND SAFE RENDER - Validate all data before display
const getKycDoc = (investor, key) => {
  // Check multiple possible locations
  const rawDoc = investor.kycDocuments?.[key] || investor.kyc?.[key] || null;
  
  // Validate: must be object with url AND filename
  if (!rawDoc || typeof rawDoc !== 'object') return null;
  if (!rawDoc.url || typeof rawDoc.url !== 'string') return null;
  if (!rawDoc.filename || typeof rawDoc.filename !== 'string') return null;
  
  // Log for debugging
  console.log('[KYC DOC] Valid:', investor._id, key, {
    url: rawDoc.url,
    filename: rawDoc.filename,
    uploadedAt: rawDoc.uploadedAt
  });
  
  return rawDoc;
};

export default function KycPage() {
  const [investors, setInvestors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/kyc')
      .then(r => setInvestors(r.data.investors))
      .catch(err => {
        setError(err.response?.data?.message || 'Failed to load KYC dossiers');
      })
      .finally(() => setLoading(false));
  }, []);

  const getKycStatus = (doc, investor) => {
    const docInfo = getKycDoc(investor, doc);
    return docInfo ? 'UPLOADED' : 'PENDING';
  };

  const getUploadedDate = (doc, investor) => {
    const docInfo = getKycDoc(investor, doc);
    return docInfo?.uploadedAt ? new Date(docInfo.uploadedAt).toLocaleDateString() : '—';
  };
  
  // Get the most recent upload date across all docs
  const getLatestUploadedDate = (investor) => {
    const dates = KYC_DOCS.map(({ key }) => {
      const doc = getKycDoc(investor, key);
      return doc?.uploadedAt ? new Date(doc.uploadedAt) : null;
    }).filter(Boolean);
    
    if (dates.length === 0) return '—';
    const latest = new Date(Math.max(...dates));
    return latest.toLocaleDateString();
  };

  const getUploadedBy = (investor) => {
    return investor.createdBy?.name || investor.createdBy?.email || '—';
  };

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} color="#1a3c6e" mb={{ xs: 2, sm: 3 }}>
        KYC Review
      </Typography>
      
      <Card>
        <TableContainer component={Paper} elevation={0} sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: { xs: 800, md: 1200 } }}>
            <TableHead>
              <TableRow sx={{ bgcolor: '#f5f7fa' }}>
                <TableCell sx={{ fontWeight: 700, fontSize: { xs: 11, sm: 13 } }}>Investor</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: { xs: 11, sm: 13 } }}>Folio</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: { xs: 11, sm: 13 }, textAlign: 'center' }}>Aadhaar</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: { xs: 11, sm: 13 }, textAlign: 'center' }}>PAN</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: { xs: 11, sm: 13 }, textAlign: 'center' }}>Bank</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: { xs: 11, sm: 13 }, textAlign: 'center' }}>Photo</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: { xs: 11, sm: 13 }, textAlign: 'center' }}>Uploaded Date</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: { xs: 11, sm: 13 }, textAlign: 'center' }}>Uploaded By</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: { xs: 11, sm: 13 }, textAlign: 'center' }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: { xs: 11, sm: 13 }, textAlign: 'center' }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={10} align="center" sx={{ py: 4 }}>
                    <CircularProgress size={28} />
                  </TableCell>
                </TableRow>
              )}
              
              {!loading && investors.map(inv => (
                <TableRow key={inv._id} hover>
                  <TableCell>
                    <Typography fontWeight={600} fontSize={{ xs: 11, sm: 13 }}>
                      {inv.fullName}
                    </Typography>
                    <Typography fontSize={{ xs: 10, sm: 11 }} color="text.secondary">
                      {inv.email}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip 
                      label={inv.folioNumber} 
                      size="small" 
                      variant="outlined" 
                      sx={{ fontFamily: 'monospace', fontSize: { xs: 10, sm: 12 } }} 
                    />
                  </TableCell>
                  
                  {KYC_DOCS.map(({ key }) => (
                    <TableCell key={key} align="center">
                      <StatusChip status={getKycStatus(key, inv)} />
                    </TableCell>
                  ))}
                  
                  <TableCell align="center" sx={{ fontSize: { xs: 10, sm: 12 } }}>
                    {getLatestUploadedDate(inv)}
                  </TableCell>
                  
                  <TableCell align="center" sx={{ fontSize: { xs: 10, sm: 12 } }}>
                    {getUploadedBy(inv)}
                  </TableCell>
                  
                  <TableCell align="center">
                    <StatusChip status={inv.kycStatus || inv.status} />
                  </TableCell>
                  
                  <TableCell align="center">
                    <Tooltip title="Review KYC">
                      <IconButton 
                        size="small" 
                        color="primary"
                        onClick={() => navigate(`/app/investors/${inv._id}?tab=1`)}
                      >
                        <Visibility fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Button 
                      size="small" 
                      variant="outlined" 
                      sx={{ ml: { xs: 0.5, sm: 1 }, fontSize: { xs: 10, sm: 12 } }}
                      onClick={() => navigate(`/app/investors/${inv._id}?tab=1`)}
                    >
                      Review
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              
              {!loading && error && (
                <TableRow>
                  <TableCell colSpan={10} align="center" sx={{ py: 3 }}>
                    <Alert severity="error" sx={{ justifyContent: 'center' }}>
                      {error}
                    </Alert>
                  </TableCell>
                </TableRow>
              )}
              
              {!loading && !error && investors.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} align="center" sx={{ color: 'text.secondary', py: 4 }}>
                    No KYC dossiers found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>
    </Box>
  );
}
