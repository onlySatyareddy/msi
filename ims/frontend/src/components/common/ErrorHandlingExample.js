import React, { useState } from 'react';
import { Box, TextField, Button, Typography, Paper, Alert } from '@mui/material';
import { Save, Refresh } from '@mui/icons-material';
import { useApi } from '../../hooks/useApi';
import { useNetwork } from '../../contexts/NetworkContext';
import LoadingState from './LoadingState';
import api from '../../utils/api';

const ErrorHandlingExample = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    message: ''
  });
  
  const [formErrors, setFormErrors] = useState({});
  
  const { loading, error, execute, reset } = useApi();

  // Handle form field changes
  const handleChange = (field) => (event) => {
    setFormData(prev => ({
      ...prev,
      [field]: event.target.value
    }));
    
    // Clear field error when user starts typing
    if (formErrors[field]) {
      setFormErrors(prev => ({
        ...prev,
        [field]: ''
      }));
    }
  };

  // Validate form before submission
  const validateForm = () => {
    const errors = {};
    
    if (!formData.name.trim()) {
      errors.name = 'Name is required';
    }
    
    if (!formData.email.trim()) {
      errors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = 'Invalid email format';
    }
    
    if (!formData.message.trim()) {
      errors.message = 'Message is required';
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Handle form submission
  const handleSubmit = async (event) => {
    event.preventDefault();
    
    // Validate form first
    if (!validateForm()) {
      return;
    }
    
    // Execute API call with error handling
    const result = await execute(
      () => api.post('/example', formData),
      {
        showSuccessMessage: true,
        successMessage: 'Form submitted successfully!',
        errorMessage: 'Failed to submit form. Please try again.'
      }
    );
    
    if (result.success) {
      // Reset form on success
      setFormData({ name: '', email: '', message: '' });
      setFormErrors({});
    }
  };

  // Handle retry
  const handleRetry = () => {
    reset();
    handleSubmit(new Event('submit'));
  };

  return (
    <Box sx={{ p: 3, maxWidth: 600, mx: 'auto' }}>
      <Paper sx={{ p: 3, borderRadius: 2 }}>
        <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, color: '#1a3c6e' }}>
          Error Handling Example
        </Typography>
        
        {/* Network Status */}
        <NetworkStatus />
        
        {/* Global Error Display */}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
            <Button 
              size="small" 
              onClick={handleRetry}
              sx={{ ml: 2 }}
            >
              Retry
            </Button>
          </Alert>
        )}
        
        {/* Form with Validation */}
        <Box component="form" onSubmit={handleSubmit}>
          <TextField
            fullWidth
            label="Name"
            value={formData.name}
            onChange={handleChange('name')}
            error={!!formErrors.name}
            helperText={formErrors.name}
            disabled={loading}
            sx={{ mb: 2 }}
          />
          
          <TextField
            fullWidth
            label="Email"
            type="email"
            value={formData.email}
            onChange={handleChange('email')}
            error={!!formErrors.email}
            helperText={formErrors.email}
            disabled={loading}
            sx={{ mb: 2 }}
          />
          
          <TextField
            fullWidth
            label="Message"
            multiline
            rows={4}
            value={formData.message}
            onChange={handleChange('message')}
            error={!!formErrors.message}
            helperText={formErrors.message}
            disabled={loading}
            sx={{ mb: 2 }}
          />
          
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button
              type="submit"
              variant="contained"
              startIcon={loading ? <Refresh /> : <Save />}
              disabled={loading}
              sx={{
                bgcolor: '#1a3c6e',
                '&:hover': { bgcolor: '#2a4c7e' }
              }}
            >
              {loading ? 'Submitting...' : 'Submit'}
            </Button>
            
            {error && (
              <Button
                variant="outlined"
                onClick={handleRetry}
                startIcon={<Refresh />}
                sx={{
                  borderColor: '#1a3c6e',
                  color: '#1a3c6e'
                }}
              >
                Retry
              </Button>
            )}
          </Box>
        </Box>
        
        {/* Loading State */}
        {loading && <LoadingState message="Submitting form..." />}
      </Paper>
    </Box>
  );
};

// Network Status Component
const NetworkStatus = () => {
  const { isOnline, isOffline } = useNetwork();
  
  if (isOnline) return null;
  
  return (
    <Alert severity="warning" sx={{ mb: 2 }}>
      You are currently offline. Please check your internet connection.
    </Alert>
  );
};

export default ErrorHandlingExample;
