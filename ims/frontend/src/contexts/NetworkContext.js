import React, { createContext, useContext, useState, useEffect } from 'react';
import { enqueueSnackbar } from 'notistack';

const NetworkContext = createContext();

export const useNetwork = () => {
  const context = useContext(NetworkContext);
  if (!context) {
    throw new Error('useNetwork must be used within NetworkProvider');
  }
  return context;
};

export const NetworkProvider = ({ children }) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [networkStatus, setNetworkStatus] = useState('online');

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setNetworkStatus('online');
      enqueueSnackbar('Internet connection restored', { variant: 'success' });
    };

    const handleOffline = () => {
      setIsOnline(false);
      setNetworkStatus('offline');
      enqueueSnackbar('No internet connection ❌', { variant: 'error', persist: true });
    };

    const handleConnectionChange = () => {
      setIsOnline(navigator.onLine);
      setNetworkStatus(navigator.onLine ? 'online' : 'offline');
    };

    // Listen to browser events
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('connectionchange', handleConnectionChange);

    // Check connection periodically
    const checkConnection = setInterval(() => {
      if (navigator.onLine !== isOnline) {
        handleConnectionChange();
      }
    }, 5000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('connectionchange', handleConnectionChange);
      clearInterval(checkConnection);
    };
  }, [isOnline]);

  const value = {
    isOnline,
    networkStatus,
    isSlow: networkStatus === 'slow',
    isOffline: networkStatus === 'offline'
  };

  return (
    <NetworkContext.Provider value={value}>
      {children}
    </NetworkContext.Provider>
  );
};
