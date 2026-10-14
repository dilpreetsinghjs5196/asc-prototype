/**
 * Scenario Generator Module
 * Groups optimized results and applies real-world factors like MPPR and availability.
 */

export const generateRecommendation = (
    optimizationResult,
    settings,
    numberOfORs,
    totalAvailableMinutes,
    selectedCategory
) => {
    const {
        selectedSurgeries,
        currentMinutes,
        currentRevenue,
        currentORCost,
        currentLaborCost,
        currentSuppliesCost,
        currentImplantCost,
        currentRecoveryCost,
        currentCleaningCost
    } = optimizationResult;

    // Group identical surgeries and sort by gross charge (reimbursement) descending
    let totalCases = 0;
    let sumTurnover = 0;
    let sumConfidence = 0;
    let sumRisk = 0;
    
    const groupedSurgeriesMap = {};

    selectedSurgeries.forEach(item => {
        if (!groupedSurgeriesMap[item.code]) {
            groupedSurgeriesMap[item.code] = { 
                ...item, 
                quantity: 0, 
                totalGroupCost: 0, 
                totalGroupProfit: 0, 
                totalGroupDuration: 0, 
                totalGroupRevenue: 0 
            };
        }
        groupedSurgeriesMap[item.code].quantity += 1;
        groupedSurgeriesMap[item.code].totalGroupCost += item.totalCost;
        groupedSurgeriesMap[item.code].totalGroupProfit += item.estimatedProfit;
        groupedSurgeriesMap[item.code].totalGroupDuration += item.duration;
        groupedSurgeriesMap[item.code].totalGroupRevenue += item.reimbursement;
        
        totalCases++;
        // If turnover exists use it, else default to 30
        sumTurnover += (item.averageTurnover || 30);
        sumConfidence += (item.confidenceScore || 90);
        sumRisk += (item.cancellationRisk || 5);
    });
    
    const groupedSurgeries = Object.values(groupedSurgeriesMap);
    groupedSurgeries.sort((a, b) => b.reimbursement - a.reimbursement);

    // Apply MPPR if enabled in settings
    const mpprFactor = settings?.apply_medicare_mppr ? 0.85 : 1.0;
    const adjustedRevenue = currentRevenue * mpprFactor;

    // Availability Factor: Not all recommended procedures will be available (70% realistic)
    const availabilityFactor = 0.70;
    const realisticRevenue = adjustedRevenue * availabilityFactor;

    // Recalculate profit with realistic revenue
    const totalCosts = currentORCost + currentLaborCost + currentSuppliesCost + currentImplantCost + currentRecoveryCost + currentCleaningCost;
    const realisticProfit = realisticRevenue - totalCosts;

    // Calculate new metrics
    const avgTurnover = totalCases > 0 ? Math.round(sumTurnover / totalCases) : 0;
    const avgConfidence = totalCases > 0 ? Math.round(sumConfidence / totalCases) : 0;
    const avgRisk = totalCases > 0 ? Math.round(sumRisk / totalCases) : 0;
    const idleTime = Math.max(0, totalAvailableMinutes - currentMinutes);
    const overtime = Math.max(0, currentMinutes - totalAvailableMinutes);
    const profitMargin = realisticRevenue > 0 ? ((realisticProfit / realisticRevenue) * 100).toFixed(1) : 0;
    const utilization = Math.round((currentMinutes / totalAvailableMinutes) * 100);

    return {
        surgeries: groupedSurgeries,
        totalCases,
        totalMinutes: currentMinutes,
        totalRevenue: realisticRevenue,  // Use realistic revenue
        optimisticRevenue: currentRevenue,  // Keep original for reference
        totalProfit: realisticProfit,  // Use realistic profit
        profitMargin,
        totalORCost: currentORCost,
        totalLaborCost: currentLaborCost,
        totalSuppliesCost: currentSuppliesCost,
        totalImplantCost: currentImplantCost,
        totalRecoveryCost: currentRecoveryCost,
        totalCleaningCost: currentCleaningCost,
        totalCost: totalCosts,
        utilization,
        idleTime,
        overtime,
        avgTurnover,
        avgConfidence,
        avgRisk,
        numberOfORs: numberOfORs,
        totalAvailableMinutes: totalAvailableMinutes,
        mpprFactor: mpprFactor,
        availabilityFactor: availabilityFactor,
        selectedCategory: selectedCategory
    };
};
