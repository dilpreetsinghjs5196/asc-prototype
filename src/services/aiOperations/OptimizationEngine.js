/**
 * Optimization Engine Module
 * Multi-objective solver (0-1 Knapsack interface) for scheduling candidate surgeries.
 * Designed to be easily swappable with Google OR-Tools CP-SAT or MILP.
 */

export const optimizeSchedule = (candidateSurgeries, targetMinutes, _numberOfORs) => {
    // 0-1 Knapsack Dynamic Programming approach
    // We want to maximize the sum of 'optimizationScore' without exceeding 'targetMinutes'.
    // candidateSurgeries is an array of objects, each having a 'duration' (weight) and 'optimizationScore' (value).
    
    const n = candidateSurgeries.length;
    const maxW = Math.floor(targetMinutes);
    
    // DP array initialization
    // dp[w] will store the max score achievable with total duration <= w
    const dp = Array.from({ length: n + 1 }, () => new Float64Array(maxW + 1).fill(0));
    
    // Backtracking array to find selected items
    const keep = Array.from({ length: n + 1 }, () => new Uint8Array(maxW + 1).fill(0));
    
    for (let i = 1; i <= n; i++) {
        const item = candidateSurgeries[i - 1];
        // Ensure weight is at least 1 min to prevent infinite loops, but realistically it's > 10
        const wt = Math.max(1, Math.ceil(item.duration));
        const val = item.optimizationScore;
        
        for (let w = 1; w <= maxW; w++) {
            if (wt <= w && (dp[i - 1][w - wt] + val) > dp[i - 1][w]) {
                dp[i][w] = dp[i - 1][w - wt] + val;
                keep[i][w] = 1;
            } else {
                dp[i][w] = dp[i - 1][w];
                keep[i][w] = 0;
            }
        }
    }
    
    // Backtrack to find selected items
    const selectedSurgeries = [];
    let w = maxW;
    let currentMinutes = 0;
    let currentRevenue = 0;
    let currentProfit = 0;
    let currentORCost = 0;
    let currentLaborCost = 0;
    let currentSuppliesCost = 0;
    let currentImplantCost = 0;
    let currentRecoveryCost = 0;
    let currentCleaningCost = 0;
    
    for (let i = n; i > 0; i--) {
        if (keep[i][w] === 1) {
            const item = candidateSurgeries[i - 1];
            selectedSurgeries.push({ ...item });
            
            const wt = Math.max(1, Math.ceil(item.duration));
            currentMinutes += item.duration;
            currentRevenue += item.reimbursement;
            currentProfit += item.estimatedProfit;
            currentORCost += item.estimatedORCost;
            currentLaborCost += item.estimatedLaborCost;
            currentSuppliesCost += item.estimatedSuppliesCost;
            currentImplantCost += item.estimatedImplantCost || 0;
            currentRecoveryCost += item.estimatedRecoveryCost || 0;
            currentCleaningCost += item.estimatedCleaningCost || 0;
            
            w -= wt;
        }
    }
    
    // selectedSurgeries is collected in reverse order, reverse it to maintain natural order
    selectedSurgeries.reverse();

    return {
        selectedSurgeries,
        currentMinutes,
        currentRevenue,
        currentProfit,
        currentORCost,
        currentLaborCost,
        currentSuppliesCost,
        currentImplantCost,
        currentRecoveryCost,
        currentCleaningCost,
        totalOptimizationScore: dp[n][maxW]
    };
};
