-- ==============================================================================
-- MIGRATION 009 DOWN: REVERT CASE MASTER NORMALIZATION & FSM
-- ==============================================================================

BEGIN;

-- 1. Revert Surgeries Update Policy to Migration 001 Baseline
DROP POLICY IF EXISTS "Tenant Scoped Surgeries Update" ON public.surgeries;
CREATE POLICY "Tenant Scoped Surgeries Update"
ON public.surgeries
FOR UPDATE
TO authenticated
USING (
    facility_id IN (SELECT get_auth_user_facilities())
    AND user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'clinical_manager', 'clinical_director', 'scheduler', 'surgeon', 'biller', 'billing_rcm'])
)
WITH CHECK (
    facility_id IN (SELECT get_auth_user_facilities())
    AND user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'clinical_manager', 'clinical_director', 'scheduler', 'surgeon', 'biller', 'billing_rcm'])
);

-- 2. Drop Case Milestones Policies and Table
DROP POLICY IF EXISTS "Tenant Scoped Case Milestones Read" ON public.case_milestones;
DROP POLICY IF EXISTS "Tenant Scoped Case Milestones Insert" ON public.case_milestones;
DROP TRIGGER IF EXISTS trg_audit_case_milestones ON public.case_milestones;
DROP TABLE IF EXISTS public.case_milestones CASCADE;

-- 3. Drop FSM Trigger and Functions
DROP TRIGGER IF EXISTS trg_validate_case_status_transition ON public.surgeries;
DROP FUNCTION IF EXISTS public.fn_validate_case_status_transition();
DROP FUNCTION IF EXISTS public.calculate_surgery_financials(BIGINT, BOOLEAN);

-- 4. Drop Surgeries Constraints & Indexes
DROP INDEX IF EXISTS public.uq_facility_source_case;
DROP INDEX IF EXISTS public.idx_surgeries_facility_status;
DROP INDEX IF EXISTS public.idx_surgeries_room_date;
DROP INDEX IF EXISTS public.idx_surgeries_surgeon_date;
DROP INDEX IF EXISTS public.idx_surgeries_patient;
DROP INDEX IF EXISTS public.idx_surgeries_primary_payer;

ALTER TABLE public.surgeries
    DROP CONSTRAINT IF EXISTS chk_surgeries_status,
    DROP CONSTRAINT IF EXISTS chk_surgeries_classification,
    DROP CONSTRAINT IF EXISTS chk_surgeries_payment_model,
    DROP CONSTRAINT IF EXISTS chk_surgeries_cancellation_reason;

-- 5. Drop Expanded Columns from public.surgeries
ALTER TABLE public.surgeries
    DROP COLUMN IF EXISTS source_system,
    DROP COLUMN IF EXISTS source_case_id,
    DROP COLUMN IF EXISTS import_batch_id,
    DROP COLUMN IF EXISTS primary_payer_id,
    DROP COLUMN IF EXISTS scheduled_start_time,
    DROP COLUMN IF EXISTS scheduled_duration_minutes,
    DROP COLUMN IF EXISTS scheduled_turnover_minutes,
    DROP COLUMN IF EXISTS case_classification,
    DROP COLUMN IF EXISTS payment_model,
    DROP COLUMN IF EXISTS cancellation_reason_code,
    DROP COLUMN IF EXISTS cancellation_reason_text,
    DROP COLUMN IF EXISTS cancelled_at,
    DROP COLUMN IF EXISTS cancelled_by,
    DROP COLUMN IF EXISTS cosmetic_facility_fee,
    DROP COLUMN IF EXISTS cosmetic_anesthesia_fee,
    DROP COLUMN IF EXISTS self_pay_anesthesia_fee,
    DROP COLUMN IF EXISTS tray_cost,
    DROP COLUMN IF EXISTS pre_op_diagnosis,
    DROP COLUMN IF EXISTS post_op_diagnosis,
    DROP COLUMN IF EXISTS operative_findings,
    DROP COLUMN IF EXISTS clinical_notes,
    DROP COLUMN IF EXISTS version,
    DROP COLUMN IF EXISTS updated_by;

NOTIFY pgrst, 'reload schema';

COMMIT;
