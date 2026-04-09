import React from 'react';
import { Box, Typography, Button, Paper, Container } from '@mui/material';
import { Home, Refresh, ArrowBack } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

const ErrorPage = ({ 
  title = 'Something went wrong ❌',
  description = 'Server issue or unexpected error',
  showRetry = true,
  showHome = true,
  showBack = false
}) => {
  const navigate = useNavigate();

  const handleRetry = () => {
    window.location.reload();
  };

  const handleHome = () => {
    navigate('/app');
  };

  const handleBack = () => {
    navigate(-1);
  };

  return (
    <Container maxWidth="sm">
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          py: 4
        }}
      >
        <Paper
          sx={{
            p: 4,
            textAlign: 'center',
            borderRadius: 2,
            boxShadow: 3
          }}
        >
          <Typography variant="h4" gutterBottom sx={{ fontWeight: 700, color: '#1a3c6e' }}>
            {title}
          </Typography>
          
          <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
            {description}
          </Typography>

          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
            {showRetry && (
              <Button
                variant="contained"
                startIcon={<Refresh />}
                onClick={handleRetry}
                sx={{
                  bgcolor: '#2e7d32',
                  '&:hover': { bgcolor: '#1b5e20' }
                }}
              >
                Retry
              </Button>
            )}
            
            {showHome && (
              <Button
                variant="outlined"
                startIcon={<Home />}
                onClick={handleHome}
                sx={{
                  borderColor: '#1a3c6e',
                  color: '#1a3c6e',
                  '&:hover': { borderColor: '#2a4c7e', color: '#2a4c7e' }
                }}
              >
                Go Home
              </Button>
            )}
            
            {showBack && (
              <Button
                variant="text"
                startIcon={<ArrowBack />}
                onClick={handleBack}
                sx={{ color: '#1a3c6e' }}
              >
                Go Back
              </Button>
            )}
          </Box>
        </Paper>
      </Box>
    </Container>
  );
};

export default ErrorPage;
