require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

const seed = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected. Seeding users...');

  const users = [
    { name: 'Admin User',   email: 'admin@ims.com',   password: 'Admin@123',   role: 'ADMIN' },
    { name: 'Checker User', email: 'checker@ims.com', password: 'Checker@123', role: 'CHECKER' },
    { name: 'Maker User',   email: 'maker@ims.com',   password: 'Maker@123',   role: 'MAKER' }
  ];

  for (const u of users) {
    const exists = await User.findOne({ email: u.email });
    if (!exists) {
      await User.create(u);
      console.log(`Created: ${u.role} — ${u.email} / ${u.password}`);
    } else {
      console.log(`Exists: ${u.email}`);
    }
  }

  console.log('\nSeed complete!');
  process.exit(0);
};

seed().catch(err => { console.error(err); process.exit(1); });
