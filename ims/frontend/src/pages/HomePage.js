import React from 'react';
import { Box, Typography, Button, Container, Paper } from '@mui/material';
import { TrendingUp, Security, Speed } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

export default function HomePage() {
  const navigate = useNavigate();

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#0f2444' }}>
      {/* Hero Section */}
      <Container maxWidth="lg" sx={{ pt: 8, pb: 6 }}>
        <Box sx={{ textAlign: 'center', color: 'white' }}>
          <Typography 
            variant="h1" 
            sx={{ 
              fontSize: { xs: '2.5rem', md: '4rem' },
              fontWeight: 800,
              mb: 2,
              background: 'linear-gradient(135deg, #fff 0%, #e8a020 100%)',
              backgroundClip: 'text',
              textFillColor: 'transparent',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}
          >
            Capifide Tech
          </Typography>
          <Typography 
            variant="h5" 
            sx={{ 
              color: 'rgba(255,255,255,0.7)',
              mb: 4,
              fontWeight: 400
            }}
          >
            Secure Investor Management & Share Transfer Solutions
          </Typography>
          <Button 
            variant="contained" 
            size="large"
            onClick={() => navigate('/login')}
            sx={{ 
              bgcolor: '#e8a020',
              color: '#0f2444',
              fontWeight: 700,
              px: 4,
              py: 1.5,
              fontSize: '1.1rem',
              '&:hover': {
                bgcolor: '#f0b84d',
                transform: 'translateY(-2px)',
                boxShadow: '0 8px 25px rgba(232,160,32,0.4)'
              },
              transition: 'all 0.3s ease'
            }}
          >
            Login to System
          </Button>
        </Box>
      </Container>

      {/* Features Section */}
      <Container maxWidth="lg" sx={{ py: 6 }}>
        <Box sx={{ 
          display: 'grid', 
          gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
          gap: 3
        }}>
          <Paper sx={{ 
            p: 4, 
            bgcolor: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            textAlign: 'center',
            transition: 'all 0.3s ease',
            '&:hover': {
              transform: 'translateY(-5px)',
              bgcolor: 'rgba(255,255,255,0.08)',
              borderColor: '#e8a020'
            }
          }}>
            <Security sx={{ fontSize: 48, color: '#e8a020', mb: 2 }} />
            <Typography variant="h6" color="white" fontWeight={600} mb={1}>
              Secure & Compliant
            </Typography>
            <Typography color="rgba(255,255,255,0.6)" fontSize={14}>
              Maker-Checker workflow with full audit trail
            </Typography>
          </Paper>

          <Paper sx={{ 
            p: 4, 
            bgcolor: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            textAlign: 'center',
            transition: 'all 0.3s ease',
            '&:hover': {
              transform: 'translateY(-5px)',
              bgcolor: 'rgba(255,255,255,0.08)',
              borderColor: '#e8a020'
            }
          }}>
            <TrendingUp sx={{ fontSize: 48, color: '#e8a020', mb: 2 }} />
            <Typography variant="h6" color="white" fontWeight={600} mb={1}>
              Real-time Tracking
            </Typography>
            <Typography color="rgba(255,255,255,0.6)" fontSize={14}>
              Live share transfers and holdings updates
            </Typography>
          </Paper>

          <Paper sx={{ 
            p: 4, 
            bgcolor: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            textAlign: 'center',
            transition: 'all 0.3s ease',
            '&:hover': {
              transform: 'translateY(-5px)',
              bgcolor: 'rgba(255,255,255,0.08)',
              borderColor: '#e8a020'
            }
          }}>
            <Speed sx={{ fontSize: 48, color: '#e8a020', mb: 2 }} />
            <Typography variant="h6" color="white" fontWeight={600} mb={1}>
              Fast & Efficient
            </Typography>
            <Typography color="rgba(255,255,255,0.6)" fontSize={14}>
              Streamlined KYC and allocation processes
            </Typography>
          </Paper>
        </Box>
      </Container>

      {/* Footer */}
      <Box sx={{ 
        borderTop: '1px solid rgba(255,255,255,0.1)',
        py: 3,
        textAlign: 'center'
      }}>
        <Typography color="rgba(255,255,255,0.4)" fontSize={12}>
          © 2024 Capifide Tech. All rights reserved.
        </Typography>
      </Box>
    </Box>
  );
}
