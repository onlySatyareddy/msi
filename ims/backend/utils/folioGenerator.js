const Counter = require('../models/Counter');
const Investor = require('../models/Investor');

/**
 * CFTECH Folio Number Configuration
 * Format: CFTECH00000001 (14 characters)
 * - Prefix: CFTECH (6 chars)
 * - Numeric: 00000001 (8 digits, zero-padded)
 */
const FOLIO_CONFIG = {
  PREFIX: 'CFTECH',
  PADDING: 8,
  TOTAL_LENGTH: 14, // 6 + 8 = 14 characters
  COUNTER_NAME: 'folio'
};

/**
 * CFTECH folio regex pattern
 * ^CFTECH\d{8}$
 * - CFTECH followed by exactly 8 digits
 */
const FOLIO_REGEX = /^CFTECH\d{8}$/;

/**
 * Generate next sequential folio number using atomic counter
 * 
 * Production-safe for high concurrency:
 * - Uses findOneAndUpdate with $inc (atomic operation)
 * - Guaranteed unique even with simultaneous requests
 * - No race conditions possible
 * 
 * @returns {Promise<string>} Next folio number (e.g., "CFTECH00000042")
 */
const MAX_SEQUENCE = 99999999; // CFTECH99999999 max capacity

const generateFolioNumber = async () => {
  console.log('🔵 Generating sequential folio number...');
  
  try {
    // 🔥 ATOMIC OPERATION: findOneAndUpdate with $inc
    // This ensures thread-safe sequential numbering even under high concurrency
    const counter = await Counter.findOneAndUpdate(
      { name: FOLIO_CONFIG.COUNTER_NAME },  // Query
      { $inc: { value: 1 } },               // Atomically increment by 1
      { 
        new: true,      // Return updated document
        upsert: true    // Create if doesn't exist
      }
    );
    
    const sequence = counter.value;
    
    // 🔒 CAPACITY CHECK: Prevent overflow beyond 99,999,999
    if (sequence > MAX_SEQUENCE) {
      throw new Error(`Folio capacity exhausted. Maximum reached: ${FOLIO_CONFIG.PREFIX}${MAX_SEQUENCE}`);
    }
    
    // Generate folio: CFTECH + zero-padded sequence
    // Example: sequence 42 -> "00000042" -> "CFTECH00000042"
    const padded = String(sequence).padStart(FOLIO_CONFIG.PADDING, '0');
    const folio = `${FOLIO_CONFIG.PREFIX}${padded}`;
    
    console.log(`✅ Generated folio: ${folio} (sequence: ${sequence})`);
    
    // � SAFETY CHECK: Verify no duplicate exists
    // This handles edge cases like manual DB edits
    const existing = await Investor.findOne({ folioNumber: folio });
    if (existing) {
      console.error(`❌ Duplicate folio detected: ${folio}. Counter may be out of sync.`);
      throw new Error(`Folio number ${folio} already exists. Counter synchronization issue.`);
    }
    
    return folio;
    
  } catch (error) {
    console.error('❌ Failed to generate folio number:', error.message);
    throw new Error(`Folio generation failed: ${error.message}`);
  }
};

/**
 * Validate CFTECH folio format
 * 
 * @param {string} folio - Folio number to validate
 * @returns {Object} Validation result { valid: boolean, error?: string }
 */
const validateFolioFormat = (folio) => {
  if (!folio || typeof folio !== 'string') {
    return { 
      valid: false, 
      error: 'Folio must be a non-empty string' 
    };
  }
  
  // Check format: CFTECH00000001
  if (!FOLIO_REGEX.test(folio)) {
    return { 
      valid: false, 
      error: `Invalid folio format. Expected: ${FOLIO_CONFIG.PREFIX} followed by 8 digits (e.g., ${FOLIO_CONFIG.PREFIX}00000001). Got: ${folio}` 
    };
  }
  
  // Check total length
  if (folio.length !== FOLIO_CONFIG.TOTAL_LENGTH) {
    return { 
      valid: false, 
      error: `Folio must be exactly ${FOLIO_CONFIG.TOTAL_LENGTH} characters. Got: ${folio.length}` 
    };
  }
  
  return { valid: true };
};

/**
 * Get folio statistics for monitoring
 * 
 * @returns {Promise<Object>} Folio statistics
 */
const getFolioStats = async () => {
  const counter = await Counter.findOne({ name: FOLIO_CONFIG.COUNTER_NAME });
  const totalInvestors = await Investor.countDocuments();
  const maxCapacity = Math.pow(10, FOLIO_CONFIG.PADDING) - 1; // 99,999,999
  const currentSequence = counter?.value || 0;
  const remaining = maxCapacity - currentSequence;
  const usedPercent = ((currentSequence / maxCapacity) * 100).toFixed(2);
  
  return {
    totalInvestors,
    currentSequenceNumber: currentSequence,
    lastFolioNumber: currentSequence > 0 ? `${FOLIO_CONFIG.PREFIX}${String(currentSequence).padStart(FOLIO_CONFIG.PADDING, '0')}` : null,
    nextFolioNumber: `${FOLIO_CONFIG.PREFIX}${String(currentSequence + 1).padStart(FOLIO_CONFIG.PADDING, '0')}`,
    maxCapacity: `${FOLIO_CONFIG.PREFIX}${maxCapacity}`, // CFTECH99999999
    remainingCapacity: remaining,
    capacityUsed: `${usedPercent}%`,
    isNearLimit: remaining < 1000, // Warning if less than 1000 remaining
    config: FOLIO_CONFIG
  };
};

/**
 * Initialize counter (for setup/migration)
 * Sets counter to current max sequence number
 * 
 * @returns {Promise<Object>} Initialized counter
 */
const initializeCounter = async () => {
  console.log('🔧 Initializing folio counter...');
  
  // Find highest existing folio number
  const investors = await Investor.find({ 
    folioNumber: { $regex: `^${FOLIO_CONFIG.PREFIX}` }
  }).sort({ folioNumber: -1 }).limit(1);
  
  let startValue = 0;
  
  if (investors.length > 0) {
    const lastFolio = investors[0].folioNumber;
    const match = lastFolio.match(new RegExp(`^${FOLIO_CONFIG.PREFIX}(\\d+)$`));
    if (match) {
      startValue = parseInt(match[1], 10);
    }
  }
  
  // Set counter to current max
  const counter = await Counter.findOneAndUpdate(
    { name: FOLIO_CONFIG.COUNTER_NAME },
    { $set: { value: startValue } },
    { upsert: true, new: true }
  );
  
  console.log(`✅ Counter initialized at: ${startValue}`);
  return counter;
};

/**
 * Legacy validation functions (kept for backward compatibility)
 * @deprecated Not used in CFTECH format
 */
const validateFolioChecksum = () => true;
const calculateChecksum = () => '';

module.exports = {
  generateFolioNumber,
  validateFolioFormat,
  validateFolioChecksum,  // Kept for backward compatibility
  calculateChecksum,      // Kept for backward compatibility
  getFolioStats,
  initializeCounter,
  FOLIO_CONFIG,
  FOLIO_REGEX
};
