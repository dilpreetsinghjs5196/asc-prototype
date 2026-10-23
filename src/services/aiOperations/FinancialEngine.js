/**
 * Financial Engine Module
 * Calculates comprehensive costs and Net Profit.
 * Reusable across the application for optimization and historical profiling.
 */

import { calculateORCost as utilCalculateORCost } from '../../utils/hospitalUtils.js';

/**
 * Calculates a detailed financial breakdown and pure Net Profit.
 * Formula: Allowable Revenue (Reimbursement) - (OR + Labor + Supplies + Implant + Recovery + Cleaning)
 * Note: Gross Charge is the 350% billed chargemaster rate; Net Profit in healthcare accounting
 * is strictly derived from collected/allowable reimbursement revenue.
 */
export const calculateNetProfit = ({
    grossCharge = 0,
    reimbursement = null,
    expectedRevenue = null,
    durationMinutes = 60,
    suppliesCost = 0,
    implantCost = 0,
}) => {
    // 1. OR Cost
    const orCost = utilCalculateORCost(durationMinutes);
    
    // 2. Labor Cost ($15/min of OR time)
    const laborCost = durationMinutes * 15;
    
    // 3. Recovery Cost ($10/min of OR time to predict PACU utilization)
    const recoveryCost = durationMinutes * 10;
    
    // 4. Cleaning Cost (Flat $150 per turnover)
    const cleaningCost = 150;
    
    // Total Direct Case Costs
    const totalCost = orCost + laborCost + suppliesCost + implantCost + recoveryCost + cleaningCost;
    
    // Authoritative Revenue Resolution:
    // If expectedRevenue or reimbursement is explicitly provided, use it.
    // If only gross charge is provided, derive allowable baseline (Gross Charge / 3.50).
    const resolvedRevenue = expectedRevenue !== null 
        ? Number(expectedRevenue) 
        : (reimbursement !== null && Number(reimbursement) > 0 
            ? Number(reimbursement) 
            : (grossCharge > 0 ? Number(grossCharge) / 3.50 : 0));
    
    // Net Margin / Operating Profit based on actual expected reimbursement
    const netProfit = resolvedRevenue - totalCost;
    
    // Billed Chargemaster Variance
    const grossMargin = grossCharge - totalCost;
    
    return {
        orCost,
        laborCost,
        suppliesCost,
        implantCost,
        recoveryCost,
        cleaningCost,
        totalCost,
        grossCharge,
        resolvedRevenue,
        grossMargin,
        netProfit
    };
};

export const estimateFinancials = (cpt, duration, avgSuppliesCost, avgImplantCost = 0) => {
    const reimbursement = parseFloat(cpt.reimbursement || 0);
    const grossCharge = parseFloat(cpt.gross_charge || (reimbursement > 0 ? Math.round(reimbursement * 3.5) : 0));
    
    // Use average supplies cost, capped reasonably to avoid massive outlier distortion
    const suppliesCost = Math.min(avgSuppliesCost, (reimbursement > 0 ? reimbursement : grossCharge) * 0.4) || 200;
    const implantCost = avgImplantCost || 0;
    
    const financials = calculateNetProfit({
        grossCharge,
        reimbursement,
        durationMinutes: duration,
        suppliesCost,
        implantCost
    });
    
    return {
        estimatedORCost: financials.orCost,
        estimatedLaborCost: financials.laborCost,
        estimatedSuppliesCost: financials.suppliesCost,
        estimatedImplantCost: financials.implantCost,
        estimatedRecoveryCost: financials.recoveryCost,
        estimatedCleaningCost: financials.cleaningCost,
        totalCost: financials.totalCost,
        estimatedProfit: financials.netProfit,
        reimbursement: grossCharge
    };
};
