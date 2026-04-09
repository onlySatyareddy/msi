const crypto = require('crypto');

// Configuration
const FOLIO_CONFIG = {
  PREFIX: 'FOL',
  RANDOM_LENGTH: 7, // 6-8 chars for scalability (36^7 = 78 billion combinations)
  INCLUDE_YEAR: true,
  ENABLE_CHECKSUM: true,
  MAX_RETRIES: 10,
  CHARSET: '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ' // No I, O to avoid confusion
};

/**
 * Generate random alphanumeric string
 */
const generateRandomString = (length) => {
  const chars = FOLIO_CONFIG.CHARSET;
  const bytes = crypto.randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
};

/**
 * Calculate checksum digit using Modulo-36 algorithm
 * Provides validation to detect typos/transcription errors
 */
const calculateChecksum = (str) => {
  // Remove dashes for checksum calculation
  const cleanStr = str.replace(/-/g, '');
  let sum = 0;
  for (let i = 0; i < cleanStr.length; i++) {
    const char = cleanStr[i];
    const value = FOLIO_CONFIG.CHARSET.indexOf(char);
    if (value === -1) continue;
    sum += value * (i + 1);
  }
  return FOLIO_CONFIG.CHARSET[sum % 36];
};

/**
 * Validate folio checksum
 */
const validateFolioChecksum = (folio) => {
  if (!FOLIO_CONFIG.ENABLE_CHECKSUM) return true;
  const parts = folio.split('-');
  if (parts.length < 2) return false;
  const base = parts.slice(0, -1).join('');
  const checksum = parts[parts.length - 1];
  const expectedChecksum = calculateChecksum(base);
  return checksum === expectedChecksum;
};

/**
 * Generate industry-level folio number
 * Pattern: FOL-{RANDOM}-{YEAR}-{CHECKSUM}
 * Example: FOL-5G8H2K1-2026-X
 */
const generateFolioNumber = async () => {
  console.log('🔵 Starting folio generation with industry-level random algorithm...');
  const Investor = require('../models/Investor');
  const year = FOLIO_CONFIG.INCLUDE_YEAR ? new Date().getFullYear().toString() : '';

  for (let attempt = 0; attempt < FOLIO_CONFIG.MAX_RETRIES; attempt++) {
    const random = generateRandomString(FOLIO_CONFIG.RANDOM_LENGTH);
    const baseParts = [FOLIO_CONFIG.PREFIX, random];
    if (year) baseParts.push(year);
    const base = baseParts.join('-');

    let folio = base;
    if (FOLIO_CONFIG.ENABLE_CHECKSUM) {
      const checksum = calculateChecksum(base);
      folio = `${base}-${checksum}`;
    }

    console.log(`🔍 Attempt ${attempt + 1}/${FOLIO_CONFIG.MAX_RETRIES}: Generated folio: ${folio}`);

    // Check for collision
    const existing = await Investor.findOne({ folioNumber: folio });
    if (!existing) {
      console.log(`✅ Successfully generated unique folio: ${folio}`);
      return folio;
    }

    // Collision detected - retry with new random string
    console.warn(`⚠️  Folio collision detected: ${folio}. Retrying (${attempt + 1}/${FOLIO_CONFIG.MAX_RETRIES})`);
  }

  console.error('❌ Failed to generate unique folio after maximum retries');
  throw new Error('Failed to generate unique folio after maximum retries. System may need configuration adjustment.');
};

/**
 * Validate folio format and checksum
 */
const validateFolioFormat = (folio) => {
  if (!folio || typeof folio !== 'string') return { valid: false, error: 'Folio must be a string' };
  
  const pattern = new RegExp(`^${FOLIO_CONFIG.PREFIX}-[${FOLIO_CONFIG.CHARSET}]{${FOLIO_CONFIG.RANDOM_LENGTH}}${FOLIO_CONFIG.INCLUDE_YEAR ? '-\\d{4}' : ''}${FOLIO_CONFIG.ENABLE_CHECKSUM ? '-[' + FOLIO_CONFIG.CHARSET + ']' : ''}$`);
  
  if (!pattern.test(folio)) {
    return { valid: false, error: `Invalid folio format. Expected: ${FOLIO_CONFIG.PREFIX}-XXXXXXX${FOLIO_CONFIG.INCLUDE_YEAR ? '-YYYY' : ''}${FOLIO_CONFIG.ENABLE_CHECKSUM ? '-X' : ''}` };
  }
  
  if (FOLIO_CONFIG.ENABLE_CHECKSUM && !validateFolioChecksum(folio)) {
    return { valid: false, error: 'Invalid folio checksum' };
  }
  
  return { valid: true };
};

/**
 * Get folio statistics for monitoring
 */
const getFolioStats = async () => {
  const Investor = require('../models/Investor');
  const total = await Investor.countDocuments();
  const entropy = Math.log2(Math.pow(FOLIO_CONFIG.CHARSET.length, FOLIO_CONFIG.RANDOM_LENGTH));

  return {
    totalInvestors: total,
    possibleCombinations: Math.pow(FOLIO_CONFIG.CHARSET.length, FOLIO_CONFIG.RANDOM_LENGTH),
    entropyBits: entropy,
    collisionProbability: total / Math.pow(FOLIO_CONFIG.CHARSET.length, FOLIO_CONFIG.RANDOM_LENGTH),
    config: FOLIO_CONFIG
  };
};

module.exports = {
  generateFolioNumber,
  validateFolioFormat,
  validateFolioChecksum,
  calculateChecksum,
  getFolioStats,
  FOLIO_CONFIG
};
