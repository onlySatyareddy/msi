import { useState, useCallback, useEffect } from 'react';
import { enqueueSnackbar } from 'notistack';
import api from '../utils/axiosInterceptor';
import { useNetwork } from '../contexts/NetworkContext';

export const useApi = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { isOnline, isOffline } = useNetwork();

  const execute = useCallback(async (apiCall, options = {}) => {
    const {
      showSuccessMessage = true,
      showErrorMessage = true,
      successMessage = 'Operation successful',
      errorMessage = null
    } = options;

    // Check network status
    if (isOffline) {
      const msg = 'No internet connection. Please check your network.';
      if (showErrorMessage) {
        enqueueSnackbar(msg, { variant: 'error', persist: true });
      }
      setError(msg);
      return { success: false, error: msg, data: null };
    }

    setLoading(true);
    setError(null);

    try {
      const response = await apiCall();
      
      if (showSuccessMessage && response.data?.message) {
        enqueueSnackbar(response.data.message, { variant: 'success' });
      } else if (showSuccessMessage && successMessage) {
        enqueueSnackbar(successMessage, { variant: 'success' });
      }

      return {
        success: true,
        data: response.data,
        error: null
      };
    } catch (err) {
      const errorMsg = errorMessage || err.response?.data?.message || err.message || 'Something went wrong';
      
      if (showErrorMessage) {
        enqueueSnackbar(errorMsg, { variant: 'error' });
      }
      
      setError(errorMsg);
      return {
        success: false,
        error: errorMsg,
        data: null
      };
    } finally {
      setLoading(false);
    }
  }, [isOffline, showErrorMessage]);

  const reset = useCallback(() => {
    setError(null);
    setLoading(false);
  }, []);

  return {
    loading,
    error,
    execute,
    reset,
    isOnline
  };
};

export default useApi;
