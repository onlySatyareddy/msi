const mongoose = require('mongoose');
const Allocation = require('../models/Allocation');
require('dotenv').config();

const checkAllocation = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ims');
    console.log('Connected to MongoDB');

    const allocationId = '69d6537057f9e2291d30bc77';
    
    console.log(`\nChecking allocation with ID: ${allocationId}`);
    
    const allocation = await Allocation.findById(allocationId)
      .populate('investor', 'fullName folioNumber')
      .populate('security', 'isin companyName');
    
    if (allocation) {
      console.log('\n✅ Allocation FOUND:');
      console.log('  ID:', allocation._id);
      console.log('  Investor:', allocation.investor?.fullName);
      console.log('  Security:', allocation.security?.companyName);
      console.log('  Quantity:', allocation.quantity);
      console.log('  Status:', allocation.status);
      console.log('  Created At:', allocation.createdAt);
    } else {
      console.log('\n❌ Allocation NOT FOUND');
      console.log('  This allocation ID does not exist in the database');
      
      // Show all allocations for reference
      const allAllocations = await Allocation.find({})
        .limit(10)
        .select('_id investor security quantity status createdAt');
      console.log('\n\nRecent allocations in database:');
      allAllocations.forEach(a => {
        console.log(`  ID: ${a._id} | Status: ${a.status} | Created: ${a.createdAt}`);
      });
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

checkAllocation();
