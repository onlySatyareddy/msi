const Investor = require('../models/Investor');
const Security = require('../models/Security');
const Holding = require('../models/Holding');
const ShareTransfer = require('../models/ShareTransfer');
const Allocation = require('../models/Allocation');
const TransactionLedger = require('../models/TransactionLedger');

exports.getStats = async (req, res) => {
  try {
    const today = new Date(); today.setHours(0,0,0,0);
    const [
      totalInvestors, approvedInvestors, pendingInvestors, rejectedInvestors,
      totalSecurities, approvedSecurities,
      allHoldings, lockedData,
      transfersToday, pendingTransfers, executedTransfers,
      pendingAllocations
    ] = await Promise.all([
      Investor.countDocuments(),
      Investor.countDocuments({ status: 'APPROVED' }),
      Investor.countDocuments({ status: 'UNDER_REVIEW' }),
      Investor.countDocuments({ status: 'REJECTED' }),
      Security.countDocuments(),
      Security.countDocuments({ status: 'APPROVED' }),
      Holding.aggregate([{ $group: { _id: null, totalShares: { $sum: '$shares' } } }]),
      Holding.aggregate([{ $group: { _id: null, totalLocked: { $sum: '$lockedShares' } } }]),
      ShareTransfer.countDocuments({ createdAt: { $gte: today } }),
      ShareTransfer.countDocuments({ status: 'UNDER_REVIEW' }),
      ShareTransfer.countDocuments({ status: 'EXECUTED' }),
      Allocation.countDocuments({ status: 'PENDING' })
    ]);

    const totalAllocated = allHoldings[0]?.totalShares || 0;
    const totalLocked = lockedData[0]?.totalLocked || 0;

    // Recent transfers with full details
    const last7Days = new Date(); last7Days.setDate(last7Days.getDate() - 7);
    const recentTransfers = await ShareTransfer.find({ createdAt: { $gte: last7Days } })
      .populate('fromInvestor', 'folioNumber fullName')
      .populate('toInvestor', 'folioNumber fullName')
      .populate('security', 'isin companyName')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 })
      .limit(10);

    const securityDist = await Security.find({ status: 'APPROVED' }).select('isin companyName totalShares allocatedShares');

    res.json({
      investors: { total: totalInvestors, approved: approvedInvestors, pending: pendingInvestors, rejected: rejectedInvestors },
      securities: { total: totalSecurities, approved: approvedSecurities },
      shares: { totalAllocated, totalLocked, available: totalAllocated - totalLocked },
      transfers: { today: transfersToday, pending: pendingTransfers, executed: executedTransfers },
      allocations: { pending: pendingAllocations },
      charts: { recentTransfers, securityDist }
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
};
