/**
 * Centralized dividend calculation utilities
 * Ensures consistent DPS and dividend amount calculations across all views
 */

/**
 * Get Dividend Per Share (DPS) from security object
 * Uses standardized priority order for consistency
 * @param {Object} security - Security object with dividend data
 * @returns {number} - DPS value or 0
 */
export const getDPS = (security) => {
  if (!security) return 0;
  
  // Priority order: latestDividend > dividends[0] > lastDividend > dividendPerShare
  return security.latestDividend?.dividendPerShare ||
         security.dividends?.[0]?.dividendPerShare ||
         security.lastDividend?.dividendPerShare ||
         security.dividendPerShare ||
         0;
};

/**
 * Get total dividend amount for a security
 * @param {Object} security - Security object
 * @returns {number} - Total dividend or 0
 */
export const getTotalDividend = (security) => {
  if (!security) return 0;
  
  const dps = getDPS(security);
  const shares = security.allocatedShares || security.totalShares || 0;
  
  // Use backend-calculated total if available
  const totalFromBackend = security.latestDividend?.totalDividend ||
                           security.dividends?.[0]?.totalDividend ||
                           security.lastDividend?.totalDividend;
  
  if (totalFromBackend) return totalFromBackend;
  if (dps && shares > 0) return shares * dps;
  
  return 0;
};

/**
 * Calculate dividend amount for a specific holding
 * @param {Object} holding - Holding object with shares
 * @param {Object} security - Security object with DPS info
 * @returns {number} - Calculated dividend amount
 */
export const calculateDividendAmount = (holding, security) => {
  if (!holding || !security) return 0;
  
  // Use pre-calculated dividend amount if available
  if (holding.dividendAmount !== undefined && holding.dividendAmount !== null) {
    return holding.dividendAmount;
  }
  
  const dps = getDPS(security);
  const shares = holding.shares || 0;
  
  return dps > 0 ? shares * dps : 0;
};

/**
 * Calculate percentage holding
 * @param {number} shares - Investor shares
 * @param {number} totalShares - Total allocated shares
 * @returns {string} - Percentage string with 2 decimals
 */
export const calculatePercentage = (shares, totalShares) => {
  if (!shares || !totalShares || totalShares <= 0) return '0.00';
  return ((shares / totalShares) * 100).toFixed(2);
};

/**
 * Format number with Indian locale
 * @param {number} num - Number to format
 * @returns {string} - Formatted number
 */
export const formatNumber = (num) => {
  if (num === null || num === undefined || isNaN(num)) return '—';
  return Number(num).toLocaleString('en-IN');
};

/**
 * Format currency with Rupee symbol
 * @param {number} amount - Amount to format
 * @returns {string} - Formatted currency
 */
export const formatCurrency = (amount) => {
  if (amount === null || amount === undefined || isNaN(amount)) return '—';
  return `₹${Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

/**
 * Check if security has active dividend
 * @param {Object} security - Security object
 * @returns {boolean}
 */
export const hasActiveDividend = (security) => {
  return getDPS(security) > 0;
};
