/**
 * Patient Intake & Data Agent
 * Following specification in Section 5 of agent/project.md
 */
export const executePatientIntake = async (taskContext, _systemContext) => {
    const patientData = taskContext.patient || {};
    const procedureData = taskContext.procedure || { description: "Total Knee Replacement" };
    const warnings = [];
    let requiresHumanReview = false;

    // Validate Required Fields
    if (!patientData.name) {
        warnings.push("Intake check: Missing patient name.");
        requiresHumanReview = true;
    }

    // Duplicate detection simulation
    const duplicateCheck = {
        possibleDuplicate: false,
        confidence: 0.99
    };

    return {
        agent: "patient",
        status: "completed",
        requestId: taskContext.requestId,
        result: {
            patient: {
                validated: !requiresHumanReview,
                patientId: patientData.id || `PAT-${Math.floor(Math.random() * 1000)}`,
                name: patientData.name || "Unknown Patient",
                mrn: patientData.mrn || "N/A",
                duplicateCheck
            },
            procedure: procedureData
        },
        confidence: requiresHumanReview ? 0.50 : 0.95,
        warnings,
        requiresHumanReview,
        nextRecommendedAgents: ["cpt"]
    };
};
