const mongoose = require('mongoose');
require('dotenv').config();

const Holding = require('../models/Holding');
const Allocation = require('../models/Allocation');

async function fixHoldingShares() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/investor_management_system');
    console.log('Connected to MongoDB');

    // Find the holding with 0 shares
    const holding = await Holding.findById('69d79644b0a2590c43e988ac');
    if (!holding) {
      console.log('Holding not found');
      process.exit(0);
    }

    console.log('Current holding:', {
      investor: holding.investor,
      security: holding.security,
      shares: holding.shares,
      lockedShares: holding.lockedShares,
      status: holding.status
    });

    // Find the approved allocation for this investor and security
    const allocation = await Allocation.findOne({
      investor: holding.investor,
      security: holding.security,
      status: 'APPROVED'
    });

    if (!allocation) {
      console.log('No approved allocation found for this investor and security');
      process.exit(0);
    }

    console.log('Found allocation:', {
      quantity: allocation.quantity,
      beforeShares: allocation.beforeShares,
      afterShares: allocation.afterShares,
      status: allocation.status
    });

    // Fix the holding shares
    holding.shares = allocation.afterShares || allocation.quantity;
    holding.status = 'APPROVED';
    holding.updatedBy = allocation.approvedBy;
    await holding.save();

    console.log('Fixed holding shares to:', holding.shares);

    // Verify the fix
    const updatedHolding = await Holding.findById('69d79644b0a2590c43e988ac');
    console.log('Updated holding:', {
      shares: updatedHolding.shares,
      lockedShares: updatedHolding.lockedShares,
      status: updatedHolding.status
    });

    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

fixHoldingShares();
