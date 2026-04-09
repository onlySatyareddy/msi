const mongoose = require('mongoose');

const dividendDistributionSchema = new mongoose.Schema({
  dividend: { type: mongoose.Schema.Types.ObjectId, ref: 'Dividend', required: true },
  investor: { type: mongoose.Schema.Types.ObjectId, ref: 'Investor', required: true },
  security: { type: mongoose.Schema.Types.ObjectId, ref: 'Security', required: true },
  shares: { type: Number, required: true, min: 0 },
  percentage: { type: Number, required: true, min: 0, max: 100 },
  dividendPerShare: { type: Number, required: true, min: 0 },
  dividendAmount: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ['PENDING', 'PAID'], default: 'PENDING' },
  paidAt: { type: Date }
}, { timestamps: true });

dividendDistributionSchema.index({ dividend: 1, investor: 1 }, { unique: true });
dividendDistributionSchema.index({ security: 1 });

module.exports = mongoose.model('DividendDistribution', dividendDistributionSchema);
