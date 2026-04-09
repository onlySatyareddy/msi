// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
global.localStorage = localStorageMock;

// Mock notistack
jest.mock('notistack', () => ({
  enqueueSnackbar: jest.fn(),
}));

// Mock axios
jest.mock('axios', () => ({
  create: jest.fn(() => ({
    interceptors: {
      request: {
        use: jest.fn(),
      },
      response: {
        use: jest.fn(),
      },
    },
  })),
}));

import api from '../api';

describe('api utility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should export default api instance', () => {
    expect(api).toBeDefined();
    expect(typeof api).toBe('object');
  });

  it('should have interceptors property', () => {
    expect(api).toHaveProperty('interceptors');
    expect(api.interceptors).toHaveProperty('request');
    expect(api.interceptors).toHaveProperty('response');
  });

  it('should have request and response interceptors', () => {
    expect(api.interceptors.request).toBeDefined();
    expect(api.interceptors.response).toBeDefined();
    expect(typeof api.interceptors.request.use).toBe('function');
    expect(typeof api.interceptors.response.use).toBe('function');
  });
});
