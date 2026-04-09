const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const Allocation = require('../models/Allocation');
require('dotenv').config();

const checkNotifications = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ims');
    console.log('Connected to MongoDB');

    const notifications = await Notification.find({ entityType: 'Allocation' })
      .sort({ createdAt: -1 })
      .limit(10);
    
    console.log(`\nFound ${notifications.length} allocation-related notifications\n`);

    for (const notif of notifications) {
      console.log(`\nNotification ID: ${notif._id}`);
      console.log(`  Event: ${notif.event}`);
      console.log(`  Entity Type: ${notif.entityType}`);
      console.log(`  Entity ID: ${notif.entityId}`);
      console.log(`  Link: ${notif.link}`);
      console.log(`  Created: ${notif.createdAt}`);
      
      // Check if this allocation exists
      const allocation = await Allocation.findById(notif.entityId);
      if (allocation) {
        console.log(`  ✅ Allocation EXISTS`);
        console.log(`     Status: ${allocation.status}`);
        console.log(`     Quantity: ${allocation.quantity}`);
      } else {
        console.log(`  ❌ Allocation DOES NOT EXIST`);
      }
    }

    // Show all allocations for reference
    const allAllocations = await Allocation.find({})
      .limit(5)
      .select('_id status quantity createdAt');
    console.log('\n\nRecent allocations in database:');
    allAllocations.forEach(a => {
      console.log(`  ID: ${a._id} | Status: ${a.status} | Quantity: ${a.quantity}`);
    });

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

checkNotifications();
