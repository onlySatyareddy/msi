// Enhanced API with error handling
import axios from 'axios';
import { enqueueSnackbar } from 'notistack';

// Create axios instance
const api = axios.create({
  baseURL: 'https://msi-backend-33sc.onrender.com/api',
  timeout: 30000,
  withCredentials: true
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    // Add auth token
    const token = localStorage.getItem('ims_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    const { response, request, code } = error;

    // Network error (no response)
    if (!response) {
      if (code === 'ECONNABORTED') {
        enqueueSnackbar('Request timeout. Please try again.', { variant: 'error' });
      } else if (request) {
        enqueueSnackbar('Server not reachable. Check your connection.', { variant: 'error' });
      } else {
        enqueueSnackbar('Network error. Please check your connection.', { variant: 'error' });
      }
      return Promise.reject(error);
    }

    const { status, data } = response;

    // Handle specific status codes
    switch (status) {
      case 401:
        enqueueSnackbar('Session expired. Please login again.', { variant: 'error' });
        // Clear auth data
        localStorage.removeItem('ims_token');
        localStorage.removeItem('ims_user');
        // Redirect to login after delay
        setTimeout(() => {
          window.location.href = '/login';
        }, 2000);
        break;
      
      case 403:
        enqueueSnackbar('Access denied. You don\'t have permission.', { variant: 'error' });
        break;
      
      case 404:
        enqueueSnackbar('Resource not found.', { variant: 'error' });
        break;
      
      case 422:
        enqueueSnackbar(data?.message || 'Validation error.', { variant: 'error' });
        break;
      
      case 429:
        enqueueSnackbar('Too many requests. Please try again later.', { variant: 'error' });
        break;
      
      case 500:
        enqueueSnackbar('Server error. Please try again later.', { variant: 'error' });
        break;
      
      default:
        enqueueSnackbar(data?.message || 'Something went wrong.', { variant: 'error' });
        break;
    }

    return Promise.reject(error);
  }
);

export default api;
