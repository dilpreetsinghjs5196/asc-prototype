import { AgentContext } from './AgentContext.js';
import { AgentRegistry, isAgentSupported } from './AgentRegistry.js';

// Task Dependency Map as per Master Architecture (Section 11)
const AGENT_DEPENDENCIES = {
    patient: [],
    cpt: ['patient'],
    cost: ['cpt'],
    orTime: ['cpt'],
    staff: ['cpt'],
    scheduling: ['orTime', 'staff'],
    optimization: ['scheduling', 'cost'],
    billing: ['cost']
};

const AGENT_CONTEXT_KEY_MAP = {
    patient: 'patient',
    cpt: 'cpt',
    cost: 'costs',
    staff: 'staff',
    orTime: 'orTime',
    scheduling: 'schedule',
    optimization: 'optimization',
    billing: 'billing'
};

export class AgentOrchestrator {
    constructor(requestId, sourceType = 'manual_form') {
        this.agentContext = new AgentContext(requestId, sourceType);
    }

    /**
     * Executes a list of target tasks by checking dependencies
     * and running logical agents from the Registry.
     * 
     * @param {Array<Object>} tasks Array of Task Contract objects: { agent, action, input, dependsOn }
     * @param {Object} systemContext Global resources needed (cptCodes list, surgeries list, etc.)
     * @returns {Object} The final validated Shared Context JSON
     */
    async executePipeline(tasks, systemContext) {
        // Enforce the master routing checklist (Section 3)
        const completedAgents = new Set();
        const pendingTasks = [...tasks];
        
        // Sort and sequence tasks dynamically based on dependencies
        let iterations = 0;
        const maxIterations = tasks.length * 3; // safety cap to prevent infinite loops

        while (pendingTasks.length > 0 && iterations < maxIterations) {
            iterations++;
            
            // Find tasks whose dependencies are satisfied
            const readyTasksIndices = [];
            for (let i = 0; i < pendingTasks.length; i++) {
                const task = pendingTasks[i];
                const deps = task.dependsOn || AGENT_DEPENDENCIES[task.agent] || [];
                
                const allDepsMet = deps.every(dep => completedAgents.has(dep));
                if (allDepsMet) {
                    readyTasksIndices.push(i);
                }
            }

            if (readyTasksIndices.length === 0) {
                // If there are pending tasks but none are ready, we have a circular block or missing requirements
                const blockedAgents = pendingTasks.map(t => t.agent).join(', ');
                this.agentContext.addWarning(`Pipeline blocked: Dependencies unsatisfied for logical agents: ${blockedAgents}`);
                break;
            }

            // Run ready tasks (support parallel simulation)
            const tasksToRun = readyTasksIndices.map(idx => pendingTasks[idx]);
            
            // Remove from pending list
            readyTasksIndices.reverse().forEach(idx => {
                pendingTasks.splice(idx, 1);
            });

            // Execute tasks in parallel
            const runPromises = tasksToRun.map(async (task) => {
                const agentName = task.agent;
                
                if (!isAgentSupported(agentName)) {
                    const err = new Error(`Unsupported logical agent: "${agentName}"`);
                    this.agentContext.recordHistory(agentName, 'failed', null, err);
                    this.agentContext.addWarning(`Unsupported agent run: ${agentName}`);
                    return;
                }

                // Update context status
                this.agentContext.recordHistory(agentName, 'running', null);
                
                try {
                    // Populate task input with context updates if not explicitly provided
                    const taskContext = {
                        patient: this.agentContext.context.patient,
                        procedure: this.agentContext.context.procedure,
                        cpt: this.agentContext.context.cpt,
                        ...task
                    };

                    // Run the logical agent executor
                    const agentResult = await AgentRegistry[agentName](taskContext, systemContext);
                    
                    if (agentResult.status === 'completed') {
                        // Update Context Section
                        if (agentName === 'patient') {
                            this.agentContext.update('patient', agentResult.result.patient);
                            this.agentContext.update('procedure', agentResult.result.procedure);
                        } else {
                            const contextKey = AGENT_CONTEXT_KEY_MAP[agentName] || agentName;
                            this.agentContext.update(contextKey, agentResult.result);
                        }
                        
                        // Collect warnings
                        if (agentResult.warnings) {
                            agentResult.warnings.forEach(w => this.agentContext.addWarning(w));
                        }
                        
                        this.agentContext.recordHistory(agentName, 'completed', agentResult.result);
                        completedAgents.add(agentName);
                    } else {
                        // Handle agent failures
                        const errMsg = agentResult.warnings?.join(', ') || 'Agent execution failed';
                        throw new Error(errMsg);
                    }
                } catch (e) {
                    this.agentContext.recordHistory(agentName, 'failed', null, e);
                    this.agentContext.addWarning(`Agent ${agentName} run failed: ${e.message}`);
                    
                    // Human in the Loop validation check trigger
                    if (task.requiresHumanReview !== false) {
                        this.agentContext.recordApproval(agentName, 'modified', 'System Auto-Fallback', `Triggered automatic human override due to run error.`);
                    }
                }
            });

            await Promise.all(runPromises);
        }

        // Return final structured context contract
        return this.agentContext.getContextJson();
    }
}
