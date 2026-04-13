/**
 * Folio Counter Setup Script
 * 
 * Run this script to initialize the folio counter for the CFTECH system.
 * 
 * Usage:
 *   node scripts/setupFolioCounter.js
 * 
 * This will:
 * 1. Check for existing CFTECH folios in the database
 * 2. Set the counter to the highest existing sequence number
 * 3. Or start from 0 if no folios exist
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Counter = require('../models/Counter');
const Investor = require('../models/Investor');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/ims';

async function setupFolioCounter() {
  try {
    console.log('🔧 Connecting to database...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to database');

    console.log('\n📊 Analyzing existing investors...');
    
    // Count existing investors with CFTECH folios
    const cfTechFolios = await Investor.find({
      folioNumber: { $regex: '^CFTECH' }
    }).sort({ folioNumber: -1 });
    
    let startValue = 0;
    
    if (cfTechFolios.length > 0) {
      const lastFolio = cfTechFolios[0].folioNumber;
      const match = lastFolio.match(/^CFTECH(\d+)$/);
      if (match) {
        startValue = parseInt(match[1], 10);
      }
      console.log(`📈 Found ${cfTechFolios.length} existing CFTECH folios`);
      console.log(`🎯 Last folio: ${lastFolio}`);
    } else {
      console.log('📭 No existing CFTECH folios found');
      console.log('🆕 Starting fresh from CFTECH00000001');
    }

    // Count old format folios for reference
    const oldFormatFolios = await Investor.countDocuments({
      folioNumber: { $regex: '^FOL-' }
    });
    
    if (oldFormatFolios > 0) {
      console.log(`⚠️  Found ${oldFormatFolios} old-format folios (FOL-XXXXXXX-YYYY-Z)`);
      console.log('   These will remain in the database but new folios will use CFTECH format');
    }

    // Initialize or update counter
    console.log('\n🔄 Setting up counter...');
    
    const counter = await Counter.findOneAndUpdate(
      { name: 'folio' },
      { 
        $setOnInsert: { 
          name: 'folio',
          prefix: 'CFTECH',
          padding: 8
        },
        $set: { value: startValue }
      },
      { upsert: true, new: true }
    );

    console.log('\n✅ Counter setup complete!');
    console.log('═══════════════════════════════════════');
    console.log(`  Counter Name: ${counter.name}`);
    console.log(`  Current Value: ${counter.value}`);
    console.log(`  Next Folio: CFTECH${String(counter.value + 1).padStart(8, '0')}`);
    console.log(`  Prefix: ${counter.prefix}`);
    console.log('═══════════════════════════════════════');

    // Test generation
    console.log('\n🧪 Testing folio generation...');
    const { generateFolioNumber } = require('../utils/folioGenerator');
    const testFolio = await generateFolioNumber();
    console.log(`✅ Generated test folio: ${testFolio}`);
    
    // Clean up test folio (remove from Investor if created)
    await Investor.deleteOne({ folioNumber: testFolio });
    console.log('🧹 Cleaned up test folio');

    console.log('\n🎉 Setup complete!');
    console.log('\nNext steps:');
    console.log('1. Deploy the updated backend code');
    console.log('2. New investors will automatically get CFTECH folios');
    console.log('3. Existing investors keep their current folios');

  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Disconnected from database');
  }
}

// Run if called directly
if (require.main === module) {
  setupFolioCounter();
}

module.exports = setupFolioCounter;
