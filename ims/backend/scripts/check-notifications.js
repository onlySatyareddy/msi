const mongoose = require('mongoose');
const Notification = require('../models/Notification');
require('dotenv').config();

const checkNotifications = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ims');
    console.log('Connected to MongoDB');

    const notifications = await Notification.find({}).sort({ createdAt: -1 }).limit(20);
    console.log(`Found ${notifications.length} recent notifications`);

    notifications.forEach((n, i) => {
      console.log(`\n${i + 1}. ID: ${n._id}`);
      console.log(`   Event: ${n.event}`);
      console.log(`   Type: ${n.type}`);
      console.log(`   Link: ${n.link}`);
      console.log(`   Created: ${n.createdAt}`);
    });

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

checkNotifications();
