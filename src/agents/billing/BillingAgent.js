/**
 * Billing Agent (Phase 47 Authoritative Engine Integration)
 * Evaluates claims, verifies NCCI PTP edits, and checks pre-bill completeness.
 */
import { db } from '../../lib/supabase.js';

export const executeBillingTask = async (taskContext = {}, _systemContext = {}) => {
    try {
        let claim = null;
        let scrubResult = null;

        if (taskContext.claimId) {
            claim = await db.getClaimById(taskContext.claimId);
            scrubResult = await db.scrubClaim(taskContext.claimId);
        } else if (taskContext.surgeryId) {
            const genRes = await db.generateClaimFromEncounter(taskContext.surgeryId);
            if (genRes?.claim_id) {
                claim = await db.getClaimById(genRes.claim_id);
                scrubResult = await db.scrubClaim(genRes.claim_id);
            }
        }

        const isClean = scrubResult?.status === 'SCRUB_PASSED' || (scrubResult?.fatal_errors_count === 0);

        return {
            agent: "billing",
            status: "completed",
            requestId: taskContext.requestId || null,
            result: {
                claimId: claim?.id || taskContext.claimId || null,
                patientControlNumber: claim?.patient_control_number || null,
                billedAmount: claim ? parseFloat(claim.total_gross_charge || 0) : (taskContext.billedAmount || 0),
                expectedReimbursement: claim ? parseFloat(claim.total_expected_reimbursement || 0) : 0,
                scrubStatus: scrubResult?.status || 'UNSCRUBBED',
                fatalErrorsCount: scrubResult?.fatal_errors_count || 0,
                warningsCount: scrubResult?.warnings_count || 0,
                paymentStatus: isClean ? "ready_for_submission" : "scrub_blocked"
            },
            confidence: isClean ? 0.99 : 0.85,
            warnings: scrubResult?.warnings_count > 0 ? [`Claim has ${scrubResult.warnings_count} non-fatal billing warnings.`] : [],
            requiresHumanReview: !isClean,
            nextRecommendedAgents: isClean ? ["compliance"] : ["coder"]
        };
    } catch (err) {
        console.warn('BillingAgent fallback execution:', err.message);
        return {
            agent: "billing",
            status: "failed",
            requestId: taskContext.requestId || null,
            error: err.message,
            result: {
                paymentStatus: "error"
            },
            confidence: 0.5,
            warnings: [err.message],
            requiresHumanReview: true,
            nextRecommendedAgents: []
        };
    }
};
