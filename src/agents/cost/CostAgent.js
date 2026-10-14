import { calculateNetProfit } from '../../services/aiOperations/FinancialEngine';

/**
 * Cost Agent
 * Following specification in Section 13 of agent/project.md
 */
export const executeCostTask = async (taskContext, _systemContext) => {
    const input = taskContext.input || {};
    const grossCharge = parseFloat(input.grossCharge || 1200);
    const durationMinutes = parseFloat(input.durationMinutes || 60);
    const suppliesCost = parseFloat(input.suppliesCost || 200);
    const implantCost = parseFloat(input.implantCost || 0);

    const breakDown = calculateNetProfit({
        grossCharge,
        durationMinutes,
        suppliesCost,
        implantCost
    });

    return {
        agent: "cost",
        status: "completed",
        requestId: taskContext.requestId,
        result: {
            totalCost: breakDown.totalCost,
            netProfit: breakDown.netProfit,
            breakDown
        },
        confidence: 0.99,
        warnings: [],
        requiresHumanReview: false,
        nextRecommendedAgents: ["billing"]
    };
};
