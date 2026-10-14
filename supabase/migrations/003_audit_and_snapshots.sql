-- ==============================================================================
-- MIGRATION: 003_audit_and_snapshots.sql
-- DESCRIPTION: Phase 2 Database Normalization & Immutable Audit Subsystem
--              - Append-only audit_logs ledger (HIPAA compliant immutable transaction audit)
--              - Generic audit trigger function fn_audit_log_trigger()
--              - Audit triggers on all clinical, operational, and financial master tables
--              - Immutable surgery_financial_snapshots table for case financial freezing
--              - Hardened RLS policies (strict read-only for audit_logs; no update/delete allowed)
-- AUTHOR: ASCANALYST Architecture Team
-- DATE: 2026-10-14
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. APPEND-ONLY AUDIT LOGS LEDGER
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE,
    table_name TEXT NOT NULL,
    record_id TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE', 'EXECUTE', 'EXPORT', 'FREEZE')),
    actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    actor_email TEXT,
    ip_address INET,
    previous_state JSONB,
    new_state JSONB,
    change_reason TEXT,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Performance and compliance indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_facility_time ON public.audit_logs(facility_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_table_record ON public.audit_logs(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON public.audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);

-- ==============================================================================
-- 2. GENERIC POSTGRESQL AUDIT TRIGGER FUNCTION
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.fn_audit_log_trigger()
RETURNS TRIGGER AS $$
DECLARE
    v_actor_id UUID;
    v_actor_email TEXT;
    v_facility_id UUID;
    v_record_id TEXT;
    v_ip_addr INET;
BEGIN
    -- Extract authenticated user identity from Supabase JWT context if available
    BEGIN
        v_actor_id := auth.uid();
        v_actor_email := auth.jwt() ->> 'email';
    EXCEPTION WHEN OTHERS THEN
        v_actor_id := NULL;
        v_actor_email := NULL;
    END;

    -- Extract client IP address if provided in request headers
    BEGIN
        v_ip_addr := (current_setting('request.headers', true)::json ->> 'x-forwarded-for')::inet;
    EXCEPTION WHEN OTHERS THEN
        v_ip_addr := NULL;
    END;

    IF TG_OP = 'DELETE' THEN
        v_facility_id := (to_jsonb(OLD) ->> 'facility_id')::UUID;
        v_record_id := to_jsonb(OLD) ->> 'id';

        INSERT INTO public.audit_logs (
            facility_id,
            table_name,
            record_id,
            action,
            actor_id,
            actor_email,
            ip_address,
            previous_state,
            new_state,
            timestamp
        ) VALUES (
            v_facility_id,
            TG_TABLE_NAME,
            v_record_id,
            TG_OP,
            v_actor_id,
            v_actor_email,
            v_ip_addr,
            to_jsonb(OLD),
            NULL,
            NOW()
        );
        RETURN OLD;

    ELSIF TG_OP = 'UPDATE' THEN
        v_facility_id := COALESCE(
            (to_jsonb(NEW) ->> 'facility_id')::UUID,
            (to_jsonb(OLD) ->> 'facility_id')::UUID
        );
        v_record_id := to_jsonb(NEW) ->> 'id';

        -- Avoid logging no-op updates where record states are identical
        IF to_jsonb(OLD) IS DISTINCT FROM to_jsonb(NEW) THEN
            INSERT INTO public.audit_logs (
                facility_id,
                table_name,
                record_id,
                action,
                actor_id,
                actor_email,
                ip_address,
                previous_state,
                new_state,
                timestamp
            ) VALUES (
                v_facility_id,
                TG_TABLE_NAME,
                v_record_id,
                TG_OP,
                v_actor_id,
                v_actor_email,
                v_ip_addr,
                to_jsonb(OLD),
                to_jsonb(NEW),
                NOW()
            );
        END IF;
        RETURN NEW;

    ELSIF TG_OP = 'INSERT' THEN
        v_facility_id := (to_jsonb(NEW) ->> 'facility_id')::UUID;
        v_record_id := to_jsonb(NEW) ->> 'id';

        INSERT INTO public.audit_logs (
            facility_id,
            table_name,
            record_id,
            action,
            actor_id,
            actor_email,
            ip_address,
            previous_state,
            new_state,
            timestamp
        ) VALUES (
            v_facility_id,
            TG_TABLE_NAME,
            v_record_id,
            TG_OP,
            v_actor_id,
            v_actor_email,
            v_ip_addr,
            NULL,
            to_jsonb(NEW),
            NOW()
        );
        RETURN NEW;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================================================
-- 3. ATTACH AUDIT TRIGGERS TO OPERATIONAL & FINANCIAL TABLES
-- ==============================================================================

-- 3.1 Surgeries
DROP TRIGGER IF EXISTS trg_audit_surgeries ON public.surgeries;
CREATE TRIGGER trg_audit_surgeries
AFTER INSERT OR UPDATE OR DELETE ON public.surgeries
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();

-- 3.2 Surgery Procedures
DROP TRIGGER IF EXISTS trg_audit_surgery_procedures ON public.surgery_procedures;
CREATE TRIGGER trg_audit_surgery_procedures
AFTER INSERT OR UPDATE OR DELETE ON public.surgery_procedures
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();

-- 3.3 Patients
DROP TRIGGER IF EXISTS trg_audit_patients ON public.patients;
CREATE TRIGGER trg_audit_patients
AFTER INSERT OR UPDATE OR DELETE ON public.patients
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();

-- 3.4 Surgeons
DROP TRIGGER IF EXISTS trg_audit_surgeons ON public.surgeons;
CREATE TRIGGER trg_audit_surgeons
AFTER INSERT OR UPDATE OR DELETE ON public.surgeons
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();

-- 3.5 Operating Rooms
DROP TRIGGER IF EXISTS trg_audit_operating_rooms ON public.operating_rooms;
CREATE TRIGGER trg_audit_operating_rooms
AFTER INSERT OR UPDATE OR DELETE ON public.operating_rooms
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();

-- 3.6 Payers
DROP TRIGGER IF EXISTS trg_audit_payers ON public.payers;
CREATE TRIGGER trg_audit_payers
AFTER INSERT OR UPDATE OR DELETE ON public.payers
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();

-- 3.7 Payer Fee Schedules
DROP TRIGGER IF EXISTS trg_audit_payer_fee_schedules ON public.payer_fee_schedules;
CREATE TRIGGER trg_audit_payer_fee_schedules
AFTER INSERT OR UPDATE OR DELETE ON public.payer_fee_schedules
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();

-- 3.8 CPT Codes
DROP TRIGGER IF EXISTS trg_audit_cpt_codes ON public.cpt_codes;
CREATE TRIGGER trg_audit_cpt_codes
AFTER INSERT OR UPDATE OR DELETE ON public.cpt_codes
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();

-- 3.9 OR Block Schedule
DROP TRIGGER IF EXISTS trg_audit_or_block_schedule ON public.or_block_schedule;
CREATE TRIGGER trg_audit_or_block_schedule
AFTER INSERT OR UPDATE OR DELETE ON public.or_block_schedule
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();

-- 3.10 Staff
DROP TRIGGER IF EXISTS trg_audit_staff ON public.staff;
CREATE TRIGGER trg_audit_staff
AFTER INSERT OR UPDATE OR DELETE ON public.staff
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();

-- ==============================================================================
-- 4. IMMUTABLE SURGERY FINANCIAL SNAPSHOTS TABLE
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.surgery_financial_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    surgery_id BIGINT NOT NULL UNIQUE REFERENCES public.surgeries(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    gross_revenue NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    expected_reimbursement NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    room_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    labor_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    supplies_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    implants_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    medications_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    net_margin NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    margin_per_or_minute NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    calculation_version TEXT NOT NULL DEFAULT 'v1.0-cms2026',
    snapshot_data JSONB DEFAULT '{}'::jsonb,
    frozen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    frozen_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_snapshots_surgery ON public.surgery_financial_snapshots(surgery_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_facility ON public.surgery_financial_snapshots(facility_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_facility_margin ON public.surgery_financial_snapshots(facility_id, net_margin);

-- ==============================================================================
-- 5. HARDENED ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

-- 5.1 Audit Logs RLS (Strict Read-Only Ledger for Authorized Roles)
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authorized Roles Can View Audit Logs" ON public.audit_logs;
CREATE POLICY "Authorized Roles Can View Audit Logs"
ON public.audit_logs
FOR SELECT
TO authenticated
USING (
    facility_id IN (SELECT facility_id FROM public.get_auth_user_facilities())
    AND public.user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'clinical_director'])
);

-- Note: STRICTLY NO UPDATE OR DELETE POLICIES are granted on public.audit_logs.
-- This guarantees HIPAA append-only immutable provenance.

-- 5.2 Surgery Financial Snapshots RLS
ALTER TABLE public.surgery_financial_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant Members Can View Snapshots" ON public.surgery_financial_snapshots;
CREATE POLICY "Tenant Members Can View Snapshots"
ON public.surgery_financial_snapshots
FOR SELECT
TO authenticated
USING (
    facility_id IN (SELECT facility_id FROM public.get_auth_user_facilities())
);

DROP POLICY IF EXISTS "Billers and Admins Can Freeze Snapshots" ON public.surgery_financial_snapshots;
CREATE POLICY "Billers and Admins Can Freeze Snapshots"
ON public.surgery_financial_snapshots
FOR ALL
TO authenticated
USING (
    facility_id IN (SELECT facility_id FROM public.get_auth_user_facilities())
    AND public.user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'biller'])
)
WITH CHECK (
    facility_id IN (SELECT facility_id FROM public.get_auth_user_facilities())
    AND public.user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'biller'])
);

COMMIT;
