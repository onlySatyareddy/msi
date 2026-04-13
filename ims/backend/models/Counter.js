const mongoose = require('mongoose');

/**
 * Counter Schema for atomic sequence generation
 * Used for generating sequential folio numbers with guaranteed uniqueness
 * 
 * @example
 * { name: 'folio', value: 42 }
 * Next folio: CFTECH00000042
 */
const counterSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    enum: ['folio'], // Add more counters here if needed
    description: 'Counter type identifier'
  },
  value: {
    type: Number,
    required: true,
    default: 0,
    min: 0,
    description: 'Current sequence value'
  },
  prefix: {
    type: String,
    default: 'CFTECH',
    description: 'Folio number prefix'
  },
  padding: {
    type: Number,
    default: 8,
    description: 'Number of digits to pad with zeros'
  }
}, {
  timestamps: true,
  collection: 'counters'
});

// Index for fast lookup
counterSchema.index({ name: 1 }, { unique: true });

module.exports = mongoose.model('Counter', counterSchema);
