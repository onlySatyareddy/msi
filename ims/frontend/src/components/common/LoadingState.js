import React from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';

const LoadingState = ({ 
  message = 'Loading...', 
  size = 40,
  showText = true,
  minHeight = '200px'
}) => {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: minHeight,
        gap: 2
      }}
    >
      <CircularProgress 
        size={size} 
        sx={{ 
          color: '#1a3c6e',
          '& .MuiCircularProgress-circle': {
            strokeLinecap: 'round'
          }
        }} 
      />
      {showText && (
        <Typography 
          variant="body2" 
          color="text.secondary"
          sx={{ fontWeight: 500 }}
        >
          {message}
        </Typography>
      )}
    </Box>
  );
};

export default LoadingState;
