import { optimizeSchedule } from '../../services/aiOperations/OptimizationEngine';

/**
 * OR Optimization Agent
 * Following specification in Section 17 of agent/project.md
 */
export const executeOROptimizationTask = async (taskContext, _systemContext) => {
    const candidateSurgeries = taskContext.candidates || [];
    const targetMinutes = taskContext.targetMinutes || 480;
    const numberOfORs = taskContext.numberOfORs || 2;

    const optRes = optimizeSchedule(candidateSurgeries, targetMinutes, numberOfORs);

    return {
        agent: "optimization",
        status: "completed",
        requestId: taskContext.requestId,
        result: optRes,
        confidence: 0.98,
        warnings: [],
        requiresHumanReview: false,
        nextRecommendedAgents: ["billing"]
    };
};
