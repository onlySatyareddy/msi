const mongoose = require('mongoose');
const Notification = require('../models/Notification');
require('dotenv').config();

const fixNotificationLinks = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ims');
    console.log('Connected to MongoDB');

    // Find all notifications with links that don't start with /app
    const notifications = await Notification.find({ 
      link: { $exists: true, $ne: null },
      link: { $not: /^\/app\// }
    });

    console.log(`Found ${notifications.length} notifications with incorrect links`);

    let updated = 0;
    for (const notification of notifications) {
      const oldLink = notification.link;
      const newLink = `/app${oldLink}`;
      
      await Notification.findByIdAndUpdate(notification._id, { link: newLink });
      console.log(`Updated: ${oldLink} -> ${newLink}`);
      updated++;
    }

    console.log(`Successfully updated ${updated} notification links`);
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

fixNotificationLinks();
