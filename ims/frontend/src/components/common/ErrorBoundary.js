import React from 'react';
import { Box, Typography, Button, Paper } from '@mui/material';
import { Refresh, ErrorOutline } from '@mui/icons-material';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({
      error: error,
      errorInfo: errorInfo
    });

    // Log error to console and send to error tracking service in production
    const errorDetails = {
      error: error?.toString(),
      stack: error?.stack,
      componentStack: errorInfo?.componentStack,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      userId: localStorage.getItem('ims_userId') || localStorage.getItem('userId') || 'anonymous',
      buildVersion: process.env.REACT_APP_VERSION || 'unknown'
    };

    console.error('Error caught by boundary:', errorDetails);

    // Send to error tracking service in production
    if (process.env.NODE_ENV === 'production') {
      // TODO: Integrate with error tracking service like Sentry
      // Sentry.captureException(error, { extra: errorDetails });
      
      // Fallback: Send to your own error endpoint
      fetch(`${process.env.REACT_APP_API_URL}/errors/client`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorDetails)
      }).catch(() => {
        // Silently fail if error logging fails
      });
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <Box
          sx={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: '#f5f5f5',
            p: 3
          }}
        >
          <Paper
            sx={{
              p: 4,
              textAlign: 'center',
              maxWidth: 500,
              borderRadius: 2
            }}
          >
            <ErrorOutline
              sx={{
                fontSize: 64,
                color: '#f44336',
                mb: 2
              }}
            />
            
            <Typography variant="h5" gutterBottom sx={{ fontWeight: 600 }}>
              Something went wrong ❌
            </Typography>
            
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              {this.state.error?.message || 'An unexpected error occurred'}
            </Typography>
            
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Server issue or unexpected error. Please try again.
            </Typography>
            
            <Button
              variant="contained"
              startIcon={<Refresh />}
              onClick={this.handleRetry}
              sx={{
                bgcolor: '#1a3c6e',
                '&:hover': { bgcolor: '#2a4c7e' }
              }}
            >
              Retry
            </Button>
          </Paper>
        </Box>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
