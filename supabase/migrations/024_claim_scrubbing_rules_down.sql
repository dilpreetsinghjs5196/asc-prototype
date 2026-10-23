-- ==============================================================================
-- MIGRATION 024 DOWN: CLAIM SCRUBBING RULES ROLLBACK (PHASE 47)
-- ==============================================================================
-- Description: Reversibly drops all claim scrubbing tables, functions, and policies
--              in strict reverse dependency order.
-- ==============================================================================

BEGIN;

-- 1. Drop Stored Procedures
DROP FUNCTION IF EXISTS public.fn_approve_clean_claim(UUID, UUID);
DROP FUNCTION IF EXISTS public.fn_override_claim_finding(UUID, TEXT, UUID);
DROP FUNCTION IF EXISTS public.fn_apply_claim_edit(UUID, UUID);
DROP FUNCTION IF EXISTS public.fn_scrub_claim(UUID, UUID);
DROP FUNCTION IF EXISTS public.fn_generate_claim_from_encounter(BIGINT, UUID);

-- 2. Drop Dependent Scrubbing Tables
DROP TABLE IF EXISTS public.claim_scrub_edits CASCADE;
DROP TABLE IF EXISTS public.claim_scrub_findings CASCADE;
DROP TABLE IF EXISTS public.claim_scrub_runs CASCADE;
DROP TABLE IF EXISTS public.ncci_ptp_edits CASCADE;
DROP TABLE IF EXISTS public.claim_lines CASCADE;
DROP TABLE IF EXISTS public.claims CASCADE;

COMMIT;
