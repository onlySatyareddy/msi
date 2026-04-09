const Holding = require('../models/Holding');
const ShareTransfer = require('../models/ShareTransfer');
const TransactionLedger = require('../models/TransactionLedger');
const Dividend = require('../models/Dividend');

/**
 * Pre-delete validation engine
 * Checks if a record can be safely deleted without causing data corruption
 */
class DeleteValidationService {
  /**
   * Validate if allocation can be deleted
   */
  static async validateAllocationDelete(allocation) {
    const errors = [];
    const warnings = [];

    // Rule: APPROVED allocations cannot be deleted
    if (allocation.status === 'APPROVED') {
      errors.push('APPROVED allocations cannot be deleted. Please reject it first.');
    }

    // Rule: Check if allocation is used in any transfers
    const relatedTransfers = await ShareTransfer.countDocuments({
      $or: [
        { fromInvestor: allocation.investor, security: allocation.security },
        { toInvestor: allocation.investor, security: allocation.security }
      ],
      status: { $in: ['EXECUTED', 'APPROVED', 'UNDER_REVIEW'] }
    });

    if (relatedTransfers > 0) {
      errors.push('This allocation is referenced by active transfers. Delete related transfers first.');
    }

    // Rule: Check if allocation is used in dividend distributions
    const relatedDividends = await Dividend.countDocuments({
      security: allocation.security
    });

    if (relatedDividends > 0) {
      warnings.push('This allocation is referenced by dividend distributions.');
    }

    // Rule: Check if allocation affects investor shares
    if (allocation.status === 'APPROVED') {
      const holding = await Holding.findOne({
        investor: allocation.investor,
        security: allocation.security
      });

      if (holding && holding.shares > 0) {
        errors.push(`Deleting this allocation would affect investor shares. Current holding has ${holding.shares} shares.`);
      }
    }

    return {
      canDelete: errors.length === 0,
      errors,
      warnings,
      impact: {
        investorShares: allocation.status === 'APPROVED' ? allocation.quantity : 0,
        securityAllocated: allocation.status === 'APPROVED' ? allocation.quantity : 0
      }
    };
  }

  /**
   * Validate if holding can be deleted
   */
  static async validateHoldingDelete(holding) {
    const errors = [];
    const warnings = [];

    // Rule: APPROVED holdings cannot be deleted
    if (holding.status === 'APPROVED') {
      errors.push('APPROVED holdings cannot be deleted. Please reject it first.');
    }

    // Rule: Check if holding is used in active transfers
    const activeTransfers = await ShareTransfer.countDocuments({
      $or: [
        { fromInvestor: holding.investor, security: holding.security },
        { toInvestor: holding.investor, security: holding.security }
      ],
      status: { $in: ['EXECUTED', 'APPROVED', 'UNDER_REVIEW', 'INITIATED'] }
    });

    if (activeTransfers > 0) {
      errors.push(`This holding is referenced by ${activeTransfers} active transfer(s). Delete related transfers first.`);
    }

    // Rule: Check if holding has locked shares
    if (holding.lockedShares > 0) {
      errors.push(`Holding has ${holding.lockedShares} locked shares. Cannot delete with locked shares.`);
    }

    // Rule: Check if holding is used in dividend distributions
    const relatedDividends = await Dividend.countDocuments({
      security: holding.security
    });

    if (relatedDividends > 0) {
      warnings.push('This holding is referenced by dividend distributions.');
    }

    // Rule: Check ledger entries
    const ledgerEntries = await TransactionLedger.countDocuments({
      investor: holding.investor,
      security: holding.security
    });

    if (ledgerEntries > 0) {
      warnings.push(`This holding has ${ledgerEntries} ledger entry(ies).`);
    }

    return {
      canDelete: errors.length === 0,
      errors,
      warnings,
      impact: {
        investorShares: holding.shares,
        lockedShares: holding.lockedShares
      }
    };
  }

  /**
   * Validate if transfer can be deleted
   */
  static async validateTransferDelete(transfer) {
    const errors = [];
    const warnings = [];

    // Rule: EXECUTED or APPROVED transfers cannot be deleted
    if (transfer.status === 'EXECUTED') {
      errors.push('EXECUTED transfers cannot be deleted. The transfer has already been completed.');
    }

    if (transfer.status === 'APPROVED') {
      errors.push('APPROVED transfers cannot be deleted. The transfer is ready for execution.');
    }

    // Rule: Check if transfer has locked shares
    if (transfer.lockedQuantity > 0) {
      warnings.push(`Transfer has ${transfer.lockedQuantity} locked shares. Shares will be released on delete.`);
    }

    return {
      canDelete: errors.length === 0,
      errors,
      warnings,
      impact: {
        lockedShares: transfer.lockedQuantity,
        fromInvestorShares: transfer.quantity,
        toInvestorShares: transfer.quantity
      }
    };
  }

  /**
   * Validate if security can be deleted
   */
  static async validateSecurityDelete(security) {
    const errors = [];
    const warnings = [];

    // Rule: APPROVED securities cannot be deleted
    if (security.status === 'APPROVED') {
      errors.push('APPROVED securities cannot be deleted. Please reject it first.');
    }

    // Rule: Check if security has holdings
    const holdingCount = await Holding.countDocuments({
      security: security._id,
      isDeleted: false
    });

    if (holdingCount > 0) {
      errors.push(`Security has ${holdingCount} holding(s). Delete holdings first.`);
    }

    // Rule: Check if security has transfers
    const transferCount = await ShareTransfer.countDocuments({
      security: security._id,
      isDeleted: false
    });

    if (transferCount > 0) {
      warnings.push(`Security has ${transferCount} transfer(s).`);
    }

    return {
      canDelete: errors.length === 0,
      errors,
      warnings,
      impact: {
        totalShares: security.totalShares,
        allocatedShares: security.allocatedShares
      }
    };
  }
}

module.exports = DeleteValidationService;
