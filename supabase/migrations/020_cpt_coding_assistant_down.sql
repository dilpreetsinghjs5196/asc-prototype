-- ==============================================================================
-- MIGRATION 020 DOWN: ROLLBACK CPT CODING ASSISTANT (PHASE 43)
-- ==============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.fn_reject_cpt_coding_candidate(UUID, TEXT);
DROP FUNCTION IF EXISTS public.fn_commit_cpt_coding_candidate(UUID, TEXT, TEXT[], VARCHAR);

DROP TABLE IF EXISTS public.cpt_coding_reviews CASCADE;
DROP TABLE IF EXISTS public.cpt_coding_candidates CASCADE;
DROP TABLE IF EXISTS public.cpt_coding_sessions CASCADE;

COMMIT;
