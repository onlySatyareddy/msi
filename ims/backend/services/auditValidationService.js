const mongoose = require('mongoose');
const Investor = require('../models/Investor');
const Security = require('../models/Security');
const Holding = require('../models/Holding');
const ShareTransfer = require('../models/ShareTransfer');
const Dividend = require('../models/Dividend');
const AuditLog = require('../models/AuditLog');

/**
 * Enterprise-Grade Audit, Validation & Auto-Reconciliation Engine
 * 
 * This service provides comprehensive data validation across all entities
 * in the Investor Management System with auto-correction capabilities.
 */

class AuditValidationService {
  constructor() {
    this.results = {
      summary: {
        totalChecked: 0,
        errorsFound: 0,
        autoFixed: 0,
        criticalErrors: 0,
        highErrors: 0,
        mediumErrors: 0,
        lowErrors: 0
      },
      issues: []
    };
  }

  /**
   * Run full system audit with optional auto-fix
   * @param {Object} options - { autoFix: boolean, userId: ObjectId, userName: string, role: string }
   * @returns {Promise<Object>} Validation results
   */
  async runFullAudit(options = {}) {
    const { autoFix = false, userId, userName, role } = options;
    
    // Reset results
    this.results = {
      summary: {
        totalChecked: 0,
        errorsFound: 0,
        autoFixed: 0,
        criticalErrors: 0,
        highErrors: 0,
        mediumErrors: 0,
        lowErrors: 0
      },
      issues: []
    };

    try {
      // Run all validation modules
      await this.validateInvestorHoldings(autoFix, userId, userName, role);
      await this.validateSecurityLevel(autoFix, userId, userName, role);
      await this.validateTransferIntegrity(autoFix, userId, userName, role);
      await this.validateDividends(autoFix, userId, userName, role);
      await this.validateReferentialIntegrity(autoFix, userId, userName, role);

      return this.results;
    } catch (error) {
      console.error('Audit validation error:', error);
      throw error;
    }
  }

  /**
   * Add issue to results
   */
  addIssue(issue) {
    this.results.issues.push(issue);
    this.results.summary.errorsFound++;
    
    // Count by severity
    switch (issue.severity) {
      case 'CRITICAL': this.results.summary.criticalErrors++; break;
      case 'HIGH': this.results.summary.highErrors++; break;
      case 'MEDIUM': this.results.summary.mediumErrors++; break;
      case 'LOW': this.results.summary.lowErrors++; break;
    }
  }

  /**
   * A. Investor Holdings Validation
   * Formula: sharesHeld = allocatedShares + receivedTransfers - sentTransfers
   */
  async validateInvestorHoldings(autoFix, userId, userName, role) {
    const holdings = await Holding.find({}).populate('investor', 'fullName folioNumber').populate('security', 'isin companyName');
    this.results.summary.totalChecked += holdings.length;

    for (const holding of holdings) {
      // Check for negative shares
      if (holding.shares < 0) {
        const issue = {
          id: new mongoose.Types.ObjectId().toString(),
          type: 'NEGATIVE_SHARES',
          severity: 'CRITICAL',
          entityId: holding._id.toString(),
          investor: holding.investor?.fullName || 'Unknown',
          isin: holding.security?.isin || 'Unknown',
          expected: 0,
          actual: holding.shares,
          fixed: false,
          fixAction: 'Set shares to 0',
          timestamp: new Date()
        };

        if (autoFix) {
          try {
            await Holding.findByIdAndUpdate(holding._id, { shares: 0 });
            issue.fixed = true;
            this.results.summary.autoFixed++;
          } catch (error) {
            console.error('Auto-fix error:', error);
          }
        }

        this.addIssue(issue);
      }

      // Validate shares against transaction history (skip if investor or security is null)
      if (!holding.investor || !holding.security) {
        const issue = {
          id: new mongoose.Types.ObjectId().toString(),
          type: 'ORPHANED_HOLDING',
          severity: 'CRITICAL',
          entityId: holding._id.toString(),
          investor: 'Unknown',
          isin: 'Unknown',
          expected: 'Valid investor and security',
          actual: holding.investor ? 'Security missing' : 'Investor missing',
          fixed: false,
          fixAction: 'Delete orphaned holding',
          timestamp: new Date()
        };

        if (autoFix) {
          try {
            await Holding.findByIdAndDelete(holding._id);
            issue.fixed = true;
            this.results.summary.autoFixed++;
          } catch (error) {
            console.error('Auto-fix error:', error);
          }
        }

        this.addIssue(issue);
        continue; // Skip to next holding
      }

      const transfersReceived = await ShareTransfer.find({
        toInvestor: holding.investor._id,
        security: holding.security._id,
        status: 'EXECUTED'
      });

      const transfersSent = await ShareTransfer.find({
        fromInvestor: holding.investor._id,
        security: holding.security._id,
        status: 'EXECUTED'
      });

      const allocatedShares = await this.getAllocatedShares(holding.investor._id, holding.security._id);
      const computedShares = allocatedShares + transfersReceived.reduce((sum, t) => sum + t.quantity, 0) - transfersSent.reduce((sum, t) => sum + t.quantity, 0);

      if (Math.abs(holding.shares - computedShares) > 1) {
        const issue = {
          id: new mongoose.Types.ObjectId().toString(),
          type: 'SHARE_MISMATCH',
          severity: 'HIGH',
          entityId: holding._id.toString(),
          investor: holding.investor?.fullName || 'Unknown',
          isin: holding.security?.isin || 'Unknown',
          expected: computedShares,
          actual: holding.shares,
          fixed: false,
          fixAction: `Recalculate from transaction history (Allocated: ${allocatedShares}, Received: ${transfersReceived.reduce((sum, t) => sum + t.quantity, 0)}, Sent: ${transfersSent.reduce((sum, t) => sum + t.quantity, 0)})`,
          timestamp: new Date()
        };

        if (autoFix) {
          try {
            await Holding.findByIdAndUpdate(holding._id, { shares: computedShares });
            issue.fixed = true;
            this.results.summary.autoFixed++;
          } catch (error) {
            console.error('Auto-fix error:', error);
          }
        }

        this.addIssue(issue);
      }
    }
  }

  /**
   * Get allocated shares for an investor-security pair
   */
  async getAllocatedShares(investorId, securityId) {
    // This would query allocations - for now return 0
    return 0;
  }

  /**
   * B. Security-Level Validation
   * Check: SUM(all investor shares for ISIN) == security.totalShares
   */
  async validateSecurityLevel(autoFix, userId, userName, role) {
    const securities = await Security.find({});
    this.results.summary.totalChecked += securities.length;

    for (const security of securities) {
      const holdings = await Holding.find({ security: security._id });
      const investorSum = holdings.reduce((sum, h) => sum + (h.shares || 0), 0);

      if (Math.abs(investorSum - security.totalShares) > 1) {
        const issue = {
          id: new mongoose.Types.ObjectId().toString(),
          type: 'SECURITY_MISMATCH',
          severity: 'HIGH',
          entityId: security._id.toString(),
          investor: 'N/A',
          isin: security.isin,
          expected: investorSum,
          actual: security.totalShares,
          fixed: false,
          fixAction: `Rebuild totalShares from holdings (${investorSum})`,
          timestamp: new Date()
        };

        if (autoFix) {
          try {
            await Security.findByIdAndUpdate(security._id, { totalShares: investorSum });
            issue.fixed = true;
            this.results.summary.autoFixed++;
          } catch (error) {
            console.error('Auto-fix error:', error);
          }
        }

        this.addIssue(issue);
      }
    }
  }

  /**
   * C. Transfer Integrity Validation
   * Check: beforeShares - quantity = afterShares
   */
  async validateTransferIntegrity(autoFix, userId, userName, role) {
    const transfers = await ShareTransfer.find({ status: 'EXECUTED' }).populate('fromInvestor', 'fullName').populate('toInvestor', 'fullName').populate('security', 'isin');
    this.results.summary.totalChecked += transfers.length;

    for (const transfer of transfers) {
      // Check from investor math
      const expectedFrom = transfer.beforeFromShares - transfer.quantity;
      if (transfer.afterFromShares !== null && Math.abs(transfer.afterFromShares - expectedFrom) > 1) {
        const issue = {
          id: new mongoose.Types.ObjectId().toString(),
          type: 'TRANSFER_ERROR',
          severity: 'HIGH',
          entityId: transfer._id.toString(),
          investor: transfer.fromInvestor?.fullName || 'Unknown',
          isin: transfer.security?.isin || 'Unknown',
          expected: expectedFrom,
          actual: transfer.afterFromShares,
          fixed: false,
          fixAction: `Correct afterFromShares to ${expectedFrom}`,
          timestamp: new Date()
        };

        if (autoFix) {
          try {
            await ShareTransfer.findByIdAndUpdate(transfer._id, { afterFromShares: expectedFrom });
            issue.fixed = true;
            this.results.summary.autoFixed++;
          } catch (error) {
            console.error('Auto-fix error:', error);
          }
        }

        this.addIssue(issue);
      }

      // Check to investor math
      const expectedTo = transfer.beforeToShares + transfer.quantity;
      if (transfer.afterToShares !== null && Math.abs(transfer.afterToShares - expectedTo) > 1) {
        const issue = {
          id: new mongoose.Types.ObjectId().toString(),
          type: 'TRANSFER_ERROR',
          severity: 'HIGH',
          entityId: transfer._id.toString(),
          investor: transfer.toInvestor?.fullName || 'Unknown',
          isin: transfer.security?.isin || 'Unknown',
          expected: expectedTo,
          actual: transfer.afterToShares,
          fixed: false,
          fixAction: `Correct afterToShares to ${expectedTo}`,
          timestamp: new Date()
        };

        if (autoFix) {
          try {
            await ShareTransfer.findByIdAndUpdate(transfer._id, { afterToShares: expectedTo });
            issue.fixed = true;
            this.results.summary.autoFixed++;
          } catch (error) {
            console.error('Auto-fix error:', error);
          }
        }

        this.addIssue(issue);
      }

      // Check if beforeShares >= quantity
      if (transfer.beforeFromShares < transfer.quantity) {
        const issue = {
          id: new mongoose.Types.ObjectId().toString(),
          type: 'TRANSFER_ERROR',
          severity: 'CRITICAL',
          entityId: transfer._id.toString(),
          investor: transfer.fromInvestor?.fullName || 'Unknown',
          isin: transfer.security?.isin || 'Unknown',
          expected: transfer.beforeFromShares,
          actual: transfer.quantity,
          fixed: false,
          fixAction: 'Transfer quantity exceeds available shares - manual review required',
          timestamp: new Date()
        };

        this.addIssue(issue);
      }
    }
  }

  /**
   * D. Dividend Validation
   * Check: totalDividend = dividendPerShare × totalShares
   */
  async validateDividends(autoFix, userId, userName, role) {
    const dividends = await Dividend.find({}).populate('security', 'isin companyName');
    this.results.summary.totalChecked += dividends.length;

    for (const dividend of dividends) {
      const expectedTotal = dividend.dividendPerShare * dividend.totalShares;
      
      if (Math.abs(dividend.totalDividend - expectedTotal) > 0.01) {
        const issue = {
          id: new mongoose.Types.ObjectId().toString(),
          type: 'DIVIDEND_ERROR',
          severity: 'HIGH',
          entityId: dividend._id.toString(),
          investor: 'N/A',
          isin: dividend.security?.isin || 'Unknown',
          expected: expectedTotal,
          actual: dividend.totalDividend,
          fixed: false,
          fixAction: `Recalculate totalDividend: ${dividend.dividendPerShare} × ${dividend.totalShares} = ${expectedTotal}`,
          timestamp: new Date()
        };

        if (autoFix) {
          try {
            await Dividend.findByIdAndUpdate(dividend._id, { totalDividend: expectedTotal });
            issue.fixed = true;
            this.results.summary.autoFixed++;
          } catch (error) {
            console.error('Auto-fix error:', error);
          }
        }

        this.addIssue(issue);
      }
    }
  }

  /**
   * E. Referential Integrity Validation
   * Check: Holding without investor, Holding without security, Transfer without valid investors
   */
  async validateReferentialIntegrity(autoFix, userId, userName, role) {
    // Check holdings without investor
    const holdings = await Holding.find({});
    this.results.summary.totalChecked += holdings.length;

    for (const holding of holdings) {
      const investor = await Investor.findById(holding.investor);
      const security = await Security.findById(holding.security);

      if (!investor) {
        const issue = {
          id: new mongoose.Types.ObjectId().toString(),
          type: 'REFERENTIAL_INTEGRITY',
          severity: 'CRITICAL',
          entityId: holding._id.toString(),
          investor: 'Unknown',
          isin: 'Unknown',
          expected: 'Valid investor reference',
          actual: 'Investor not found',
          fixed: false,
          fixAction: 'Delete orphan holding',
          timestamp: new Date()
        };

        if (autoFix) {
          try {
            await Holding.findByIdAndDelete(holding._id);
            issue.fixed = true;
            this.results.summary.autoFixed++;
          } catch (error) {
            console.error('Auto-fix error:', error);
          }
        }

        this.addIssue(issue);
      }

      if (!security) {
        const issue = {
          id: new mongoose.Types.ObjectId().toString(),
          type: 'REFERENTIAL_INTEGRITY',
          severity: 'CRITICAL',
          entityId: holding._id.toString(),
          investor: 'Unknown',
          isin: 'Unknown',
          expected: 'Valid security reference',
          actual: 'Security not found',
          fixed: false,
          fixAction: 'Delete orphan holding',
          timestamp: new Date()
        };

        if (autoFix) {
          try {
            await Holding.findByIdAndDelete(holding._id);
            issue.fixed = true;
            this.results.summary.autoFixed++;
          } catch (error) {
            console.error('Auto-fix error:', error);
          }
        }

        this.addIssue(issue);
      }
    }
  }
}

module.exports = new AuditValidationService();
