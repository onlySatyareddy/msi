const rateLimit = require('express-rate-limit');

// Rate limiting configuration for production
const createRateLimiter = (windowMs = 15 * 60 * 1000, max = 100, message = 'Too many requests from this IP') => {
  return rateLimit({
    windowMs,
    max,
    message: { success: false, message },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => process.env.NODE_ENV === 'development' // Skip rate limiting in development
  });
};

// General API rate limiter
const apiLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  1000, // 1000 requests per window (increased from 100)
  'Too many requests from this IP, please try again after 15 minutes'
);

// Strict rate limiter for authentication routes
const authLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  20, // 20 requests per window (increased from 5)
  'Too many login attempts, please try again after 15 minutes'
);

// Strict rate limiter for sensitive operations
const strictLimiter = createRateLimiter(
  60 * 60 * 1000, // 1 hour
  50, // 50 requests per window (increased from 10)
  'Too many requests for this operation, please try again later'
);

module.exports = {
  apiLimiter,
  authLimiter,
  strictLimiter,
  createRateLimiter
};
