const Holding = require('../models/Holding');
const Security = require('../models/Security');
const Investor = require('../models/Investor');
const { logAudit } = require('../utils/audit');

/**
 * Post-delete reconciliation engine
 * Recalculates shares after delete operations to maintain consistency
 */
class DeleteReconciliationService {
  /**
   * Reconcile investor shares after holding/allocation deletion
   */
  static async reconcileInvestorShares(investorId) {
    try {
      // Skip if investorId is null or undefined
      if (!investorId) {
        console.warn('[RECONCILIATION] Skipping investor reconciliation - investorId is null');
        return { investorId: null, totalShares: 0, holdingCount: 0, recalculatedAt: new Date(), skipped: true };
      }

      // Get all APPROVED holdings for this investor
      const holdings = await Holding.find({
        investor: investorId,
        status: 'APPROVED',
        isDeleted: false
      });

      // Calculate total shares
      const totalShares = holdings.reduce((sum, h) => sum + h.shares, 0);

      // Update investor shares if model supports it (optional)
      // Investor model doesn't have shares field, but we can calculate dynamically

      return {
        investorId,
        totalShares,
        holdingCount: holdings.length,
        recalculatedAt: new Date()
      };
    } catch (err) {
      console.error('Error reconciling investor shares:', err);
      throw err;
    }
  }

  /**
   * Reconcile security totals after holding/allocation deletion
   */
  static async reconcileSecurityTotals(securityId) {
    try {
      // Skip if securityId is null or undefined
      if (!securityId) {
        console.warn('[RECONCILIATION] Skipping security reconciliation - securityId is null');
        return { securityId: null, totalAllocated: 0, holdingCount: 0, corrected: false, skipped: true };
      }

      // Get all APPROVED holdings for this security
      const holdings = await Holding.find({
        security: securityId,
        status: 'APPROVED',
        isDeleted: false
      });

      // Calculate total allocated shares
      const totalAllocated = holdings.reduce((sum, h) => sum + h.shares, 0);

      // Get security
      const security = await Security.findById(securityId);
      if (!security) {
        console.warn('[RECONCILIATION] Security not found, skipping reconciliation');
        return { securityId, totalAllocated, holdingCount: holdings.length, corrected: false, skipped: true };
      }

      // Check if security totals need correction
      const needsCorrection = security.allocatedShares !== totalAllocated;

      if (needsCorrection) {
        // Log the correction
        await logAudit({
          entityType: 'Security',
          entityId: securityId,
          action: 'RECONCILE',
          user: { _id: 'SYSTEM' },
          oldData: { allocatedShares: security.allocatedShares },
          newData: { allocatedShares: totalAllocated }
        });

        // Update security totals
        security.allocatedShares = totalAllocated;
        await security.save();
      }

      return {
        securityId,
        totalAllocated,
        previousAllocated: needsCorrection ? security.allocatedShares : totalAllocated,
        holdingCount: holdings.length,
        corrected: needsCorrection,
        recalculatedAt: new Date()
      };
    } catch (err) {
      console.error('Error reconciling security totals:', err);
      throw err;
    }
  }

  /**
   * Full system reconciliation after delete
   * Recalculates all affected entities
   */
  static async fullReconciliation(deleteContext) {
    try {
      const { entityType, entityId, deletedData } = deleteContext;
      const reconciliationResults = [];

      // Reconcile based on entity type
      switch (entityType) {
        case 'Allocation': {
          const { investor, security, status, quantity } = deletedData;
          
          // If allocation was APPROVED, reverse the impact
          if (status === 'APPROVED') {
            // Reconcile investor shares (only if investor exists)
            if (investor) {
              const investorResult = await this.reconcileInvestorShares(investor);
              reconciliationResults.push(investorResult);
            }

            // Reconcile security totals (only if security exists)
            if (security) {
              const securityResult = await this.reconcileSecurityTotals(security);
              reconciliationResults.push(securityResult);
            }

            // Update holding if exists (only if both investor and security exist)
            if (investor && security) {
              const holding = await Holding.findOne({ investor, security });
              if (holding) {
                holding.shares = Math.max(0, holding.shares - quantity);
                await holding.save();
                reconciliationResults.push({
                  type: 'Holding',
                  holdingId: holding._id,
                  previousShares: holding.shares + quantity,
                  newShares: holding.shares
                });
              }
            }
          }
          break;
        }

        case 'Holding': {
          const { investor, security, shares } = deletedData;
          
          // Reconcile investor shares (only if investor exists)
          if (investor) {
            const investorResult = await this.reconcileInvestorShares(investor);
            reconciliationResults.push(investorResult);
          }

          // Reconcile security totals (only if security exists)
          if (security) {
            const securityResult = await this.reconcileSecurityTotals(security);
            reconciliationResults.push(securityResult);
          }
          break;
        }

        case 'ShareTransfer': {
          const { fromInvestor, toInvestor, security, lockedQuantity, status } = deletedData;
          
          // If transfer had locked shares, release them (only if fromInvestor and security exist)
          if (lockedQuantity > 0 && status !== 'EXECUTED' && fromInvestor && security) {
            const fromHolding = await Holding.findOne({ investor: fromInvestor, security });
            if (fromHolding) {
              fromHolding.lockedShares = Math.max(0, fromHolding.lockedShares - lockedQuantity);
              await fromHolding.save();
              reconciliationResults.push({
                type: 'Holding',
                holdingId: fromHolding._id,
                releasedLockedShares: lockedQuantity
              });
            }
          }

          // Reconcile from investor (only if exists)
          if (fromInvestor) {
            const fromInvestorResult = await this.reconcileInvestorShares(fromInvestor);
            reconciliationResults.push(fromInvestorResult);
          }

          // Reconcile to investor (only if exists)
          if (toInvestor) {
            const toInvestorResult = await this.reconcileInvestorShares(toInvestor);
            reconciliationResults.push(toInvestorResult);
          }

          // Reconcile security totals (only if security exists)
          if (security) {
            const securityResult = await this.reconcileSecurityTotals(security);
            reconciliationResults.push(securityResult);
          }
          break;
        }

        case 'Security': {
          // Security deletion doesn't require reconciliation
          // as it should only be allowed if no holdings exist
          break;
        }
      }

      return {
        success: true,
        entityType,
        entityId,
        reconciliationResults,
        reconciledAt: new Date()
      };
    } catch (err) {
      console.error('Error in full reconciliation:', err);
      return {
        success: false,
        error: err.message
      };
    }
  }

  /**
   * System health check - validates overall consistency
   */
  static async systemHealthCheck() {
    try {
      const issues = [];

      // Check all securities for allocation consistency
      const securities = await Security.find({ isDeleted: false });
      for (const security of securities) {
        const holdings = await Holding.find({
          security: security._id,
          status: 'APPROVED',
          isDeleted: false
        });
        const totalAllocated = holdings.reduce((sum, h) => sum + h.shares, 0);

        if (security.allocatedShares !== totalAllocated) {
          issues.push({
            type: 'SECURITY_MISMATCH',
            securityId: security._id,
            isin: security.isin,
            expected: totalAllocated,
            actual: security.allocatedShares
          });
        }
      }

      // Check for negative shares
      const negativeHoldings = await Holding.find({
        shares: { $lt: 0 },
        isDeleted: false
      });

      if (negativeHoldings.length > 0) {
        issues.push({
          type: 'NEGATIVE_SHARES',
          count: negativeHoldings.length,
          holdings: negativeHoldings.map(h => ({
            holdingId: h._id,
            investor: h.investor,
            security: h.security,
            shares: h.shares
          }))
        });
      }

      // Check for locked shares exceeding total shares
      const invalidLocks = await Holding.find({
        $expr: { $gt: ['$lockedShares', '$shares'] },
        isDeleted: false
      });

      if (invalidLocks.length > 0) {
        issues.push({
          type: 'INVALID_LOCKS',
          count: invalidLocks.length,
          holdings: invalidLocks.map(h => ({
            holdingId: h._id,
            investor: h.investor,
            security: h.security,
            shares: h.shares,
            lockedShares: h.lockedShares
          }))
        });
      }

      return {
        healthy: issues.length === 0,
        issues,
        checkedAt: new Date()
      };
    } catch (err) {
      console.error('Error in system health check:', err);
      return {
        healthy: false,
        error: err.message
      };
    }
  }
}

module.exports = DeleteReconciliationService;
