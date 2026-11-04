-- ==============================================================================
-- MIGRATION DOWN: 054_claims_model_down.sql
-- PHASE: 80 — Claims Model Rollback
-- ==============================================================================

SET search_path = public, pg_temp;

-- 1. Drop Views
DROP VIEW IF EXISTS public.vw_claim_line_adjudication CASCADE;
DROP VIEW IF EXISTS public.vw_claims_rcm_summary CASCADE;

-- 2. Drop Audit Table
DROP TABLE IF EXISTS public.claim_lifecycle_history CASCADE;

-- 3. Drop Added Columns from public.claim_lines
ALTER TABLE public.claim_lines
    DROP COLUMN IF EXISTS line_balance,
    DROP COLUMN IF EXISTS disallowed_amount,
    DROP COLUMN IF EXISTS patient_deductible,
    DROP COLUMN IF EXISTS patient_coinsurance,
    DROP COLUMN IF EXISTS patient_copay,
    DROP COLUMN IF EXISTS contractual_adjustment,
    DROP COLUMN IF EXISTS paid_amount,
    DROP COLUMN IF EXISTS allowed_amount,
    DROP COLUMN IF EXISTS line_rcm_status,
    DROP COLUMN IF EXISTS revenue_code;

-- 4. Drop Added Columns from public.claims
ALTER TABLE public.claims
    DROP COLUMN IF EXISTS last_status_change_by,
    DROP COLUMN IF EXISTS last_status_change_at,
    DROP COLUMN IF EXISTS outstanding_ar_balance,
    DROP COLUMN IF EXISTS total_patient_balance,
    DROP COLUMN IF EXISTS total_contractual_adjustment,
    DROP COLUMN IF EXISTS total_paid_amount,
    DROP COLUMN IF EXISTS total_allowed_amount,
    DROP COLUMN IF EXISTS adjudicated_at,
    DROP COLUMN IF EXISTS last_submitted_at,
    DROP COLUMN IF EXISTS initial_submitted_at,
    DROP COLUMN IF EXISTS payer_ack_at,
    DROP COLUMN IF EXISTS payer_ack_status,
    DROP COLUMN IF EXISTS clearinghouse_ack_at,
    DROP COLUMN IF EXISTS clearinghouse_ack_status,
    DROP COLUMN IF EXISTS source_system_id,
    DROP COLUMN IF EXISTS transmission_batch_id,
    DROP COLUMN IF EXISTS payer_claim_control_number,
    DROP COLUMN IF EXISTS clearinghouse_claim_id,
    DROP COLUMN IF EXISTS billing_format,
    DROP COLUMN IF EXISTS rcm_status;

