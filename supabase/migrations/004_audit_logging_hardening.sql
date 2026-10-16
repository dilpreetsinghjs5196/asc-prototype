-- ==============================================================================
-- MIGRATION: 004_audit_logging_hardening.sql
-- DESCRIPTION: Phase 24 — Hardened Audit Logging, Recursive Sanitization & Immutability
--              - Non-destructive schema extensions (source, correlation_id, changed_fields, metadata)
--              - Dynamic constraint inspection and safe superset expansion
--              - Recursive PL/pgSQL JSONB credential and sensitive secret sanitizer
--              - Non-blocking clinical triggers vs fail-closed administrative triggers
--              - Hardened SECURITY DEFINER RPC function with strict tenancy validation
--              - Dual-resolution RLS policy (relational permissions + legacy role fallback)
--              - Statement-level immutability trigger preventing DELETE/UPDATE/TRUNCATE cascades
-- PLATFORM: Supabase PostgreSQL 15+
-- AUTHOR: ASCANALYST Architecture & Security Engineering Team
-- DATE: 2026-10-16
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. EXTEND AUDIT_LOGS SCHEMA (FORWARD-ONLY & IDEMPOTENT)
-- ==============================================================================

ALTER TABLE public.audit_logs 
    ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'SYSTEM',
    ADD COLUMN IF NOT EXISTS correlation_id TEXT,
    ADD COLUMN IF NOT EXISTS changed_fields JSONB,
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Safely drop any existing CHECK constraint on 'action' regardless of generated name
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT conname 
        FROM pg_constraint 
        WHERE conrelid = 'public.audit_logs'::regclass 
          AND contype = 'c'
          AND pg_get_constraintdef(oid) LIKE '%action%'
    ) LOOP
        EXECUTE 'ALTER TABLE public.audit_logs DROP CONSTRAINT ' || quote_ident(r.conname);
    END LOOP;
END $$;

ALTER TABLE public.audit_logs 
    ADD CONSTRAINT audit_logs_action_check 
    CHECK (action IN ('INSERT', 'UPDATE', 'DELETE', 'EXECUTE', 'EXPORT', 'FREEZE', 'LOGIN', 'LOGOUT', 'OVERRIDE', 'VIEW_PHI', 'AI_ANALYSIS'));

-- Safely drop any existing CHECK constraint on 'source'
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT conname 
        FROM pg_constraint 
        WHERE conrelid = 'public.audit_logs'::regclass 
          AND contype = 'c'
          AND pg_get_constraintdef(oid) LIKE '%source%'
    ) LOOP
        EXECUTE 'ALTER TABLE public.audit_logs DROP CONSTRAINT ' || quote_ident(r.conname);
    END LOOP;
END $$;

ALTER TABLE public.audit_logs 
    ADD CONSTRAINT audit_logs_source_check 
    CHECK (source IN ('UI', 'API', 'AI_AGENT', 'BACKGROUND_JOB', 'SYSTEM', 'IMPORT'));

-- Performance and compliance indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_source ON public.audit_logs(source);
CREATE INDEX IF NOT EXISTS idx_audit_logs_correlation ON public.audit_logs(correlation_id) WHERE correlation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logs_facility_action ON public.audit_logs(facility_id, action, timestamp DESC);

-- ==============================================================================
-- 2. RECURSIVE JSONB SANITIZER FUNCTION
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.fn_sanitize_audit_jsonb(p_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_key TEXT;
    v_val JSONB;
    v_res JSONB;
    v_elem JSONB;
    v_arr JSONB := '[]'::jsonb;
    -- Regular expression matching credential and sensitive secret keys
    c_sensitive_pattern CONSTANT TEXT := '(?i)(password|passwd|token|secret|api_key|access_token|refresh_token|ssn|social_security|bank_account|routing_number|credit_card|cvv|authorization|auth_header)';
BEGIN
    IF p_data IS NULL THEN
        RETURN NULL;
    END IF;

    -- Handle JSONB Objects
    IF jsonb_typeof(p_data) = 'object' THEN
        v_res := '{}'::jsonb;
        FOR v_key, v_val IN SELECT * FROM jsonb_each(p_data)
        LOOP
            IF v_key ~ c_sensitive_pattern THEN
                v_res := v_res || jsonb_build_object(v_key, '"[REDACTED]"'::jsonb);
            ELSIF jsonb_typeof(v_val) IN ('object', 'array') THEN
                v_res := v_res || jsonb_build_object(v_key, public.fn_sanitize_audit_jsonb(v_val));
            ELSE
                v_res := v_res || jsonb_build_object(v_key, v_val);
            END IF;
        END LOOP;
        RETURN v_res;

    -- Handle JSONB Arrays
    ELSIF jsonb_typeof(p_data) = 'array' THEN
        FOR v_elem IN SELECT * FROM jsonb_array_elements(p_data)
        LOOP
            IF jsonb_typeof(v_elem) IN ('object', 'array') THEN
                v_arr := v_arr || jsonb_build_array(public.fn_sanitize_audit_jsonb(v_elem));
            ELSE
                v_arr := v_arr || jsonb_build_array(v_elem);
            END IF;
        END LOOP;
        RETURN v_arr;

    -- Handle Scalars
    ELSE
        RETURN p_data;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_sanitize_audit_jsonb(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_sanitize_audit_jsonb(JSONB) TO authenticated;

-- ==============================================================================
-- 3. HARDENED TRIGGER FUNCTION (NON-BLOCKING CLINICAL WRITE PATH)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.fn_audit_log_trigger()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
    v_actor_id UUID;
    v_actor_email TEXT;
    v_facility_id UUID;
    v_record_id TEXT;
    v_ip_addr INET;
    v_source TEXT;
    v_old_json JSONB;
    v_new_json JSONB;
    v_diff JSONB := '{}'::jsonb;
    v_key TEXT;
BEGIN
    -- Extract authenticated user identity from Supabase JWT session context
    BEGIN
        v_actor_id := auth.uid();
        v_actor_email := auth.jwt() ->> 'email';
    EXCEPTION WHEN OTHERS THEN
        v_actor_id := NULL;
        v_actor_email := NULL;
    END;

    -- Extract client IP address from request headers
    BEGIN
        v_ip_addr := (current_setting('request.headers', true)::json ->> 'x-forwarded-for')::inet;
    EXCEPTION WHEN OTHERS THEN
        v_ip_addr := NULL;
    END;

    -- Infer default source based on actor presence
    IF v_actor_id IS NOT NULL THEN
        v_source := 'UI';
    ELSE
        v_source := 'SYSTEM';
    END IF;

    -- Handle DELETE
    IF TG_OP = 'DELETE' THEN
        v_facility_id := (to_jsonb(OLD) ->> 'facility_id')::UUID;
        v_record_id := to_jsonb(OLD) ->> 'id';

        -- Recursively sanitize secrets from previous state
        v_old_json := public.fn_sanitize_audit_jsonb(to_jsonb(OLD));

        INSERT INTO public.audit_logs (
            facility_id,
            table_name,
            record_id,
            action,
            actor_id,
            actor_email,
            ip_address,
            source,
            previous_state,
            new_state,
            changed_fields,
            timestamp
        ) VALUES (
            v_facility_id,
            TG_TABLE_NAME,
            v_record_id,
            TG_OP,
            v_actor_id,
            v_actor_email,
            v_ip_addr,
            v_source,
            v_old_json,
            NULL,
            NULL,
            NOW()
        );
        RETURN OLD;

    -- Handle UPDATE
    ELSIF TG_OP = 'UPDATE' THEN
        v_facility_id := COALESCE(
            (to_jsonb(NEW) ->> 'facility_id')::UUID,
            (to_jsonb(OLD) ->> 'facility_id')::UUID
        );
        v_record_id := to_jsonb(NEW) ->> 'id';

        -- Recursively sanitize secrets from both states
        v_old_json := public.fn_sanitize_audit_jsonb(to_jsonb(OLD));
        v_new_json := public.fn_sanitize_audit_jsonb(to_jsonb(NEW));

        -- Suppress no-op updates where state is unchanged
        IF v_old_json IS DISTINCT FROM v_new_json THEN
            -- Compute changed fields JSONB diff
            FOR v_key IN SELECT jsonb_object_keys(v_new_json)
            LOOP
                IF (v_old_json -> v_key) IS DISTINCT FROM (v_new_json -> v_key) THEN
                    v_diff := v_diff || jsonb_build_object(
                        v_key, jsonb_build_object(
                            'old', v_old_json -> v_key,
                            'new', v_new_json -> v_key
                        )
                    );
                END IF;
            END LOOP;

            INSERT INTO public.audit_logs (
                facility_id,
                table_name,
                record_id,
                action,
                actor_id,
                actor_email,
                ip_address,
                source,
                previous_state,
                new_state,
                changed_fields,
                timestamp
            ) VALUES (
                v_facility_id,
                TG_TABLE_NAME,
                v_record_id,
                TG_OP,
                v_actor_id,
                v_actor_email,
                v_ip_addr,
                v_source,
                v_old_json,
                v_new_json,
                v_diff,
                NOW()
            );
        END IF;
        RETURN NEW;

    -- Handle INSERT
    ELSIF TG_OP = 'INSERT' THEN
        v_facility_id := (to_jsonb(NEW) ->> 'facility_id')::UUID;
        v_record_id := to_jsonb(NEW) ->> 'id';

        -- Recursively sanitize secrets
        v_new_json := public.fn_sanitize_audit_jsonb(to_jsonb(NEW));

        INSERT INTO public.audit_logs (
            facility_id,
            table_name,
            record_id,
            action,
            actor_id,
            actor_email,
            ip_address,
            source,
            previous_state,
            new_state,
            changed_fields,
            timestamp
        ) VALUES (
            v_facility_id,
            TG_TABLE_NAME,
            v_record_id,
            TG_OP,
            v_actor_id,
            v_actor_email,
            v_ip_addr,
            v_source,
            NULL,
            v_new_json,
            NULL,
            NOW()
        );
        RETURN NEW;
    END IF;

    RETURN NULL;
EXCEPTION WHEN OTHERS THEN
    -- TIER 1 CLINICAL FAIL-SAFE: Under no circumstances may an audit failure abort clinical surgery writes
    RAISE WARNING 'fn_audit_log_trigger exception on %: %', TG_TABLE_NAME, SQLERRM;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

REVOKE ALL ON FUNCTION public.fn_audit_log_trigger() FROM PUBLIC, anon;

-- ==============================================================================
-- 4. HARDENED MANUAL EVENT RPC (STRICT VALIDATION & NO IMPERSONATION)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.fn_log_manual_audit_event(
    p_facility_id UUID,
    p_table_name TEXT,
    p_record_id TEXT,
    p_action TEXT,
    p_source TEXT DEFAULT 'UI',
    p_change_reason TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::jsonb,
    p_correlation_id TEXT DEFAULT NULL
)
RETURNS UUID
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
    v_log_id UUID;
    v_actor_id UUID;
    v_actor_email TEXT;
    v_ip_addr INET;
    v_clean_metadata JSONB;
BEGIN
    -- 1. Enforce authenticated actor (Zero anonymous events)
    v_actor_id := auth.uid();
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required: manual audit events cannot be dispatched anonymously.';
    END IF;

    v_actor_email := auth.jwt() ->> 'email';

    -- 2. Verify actor has active membership in requested facility (Tenancy Guard)
    IF p_facility_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.facility_memberships 
        WHERE user_id = v_actor_id 
          AND facility_id = p_facility_id 
          AND is_active = TRUE
    ) THEN
        RAISE EXCEPTION 'Access denied: user % is not an active member of facility %', v_actor_id, p_facility_id;
    END IF;

    -- 3. Validate action allowlist (Clients cannot forge trigger actions or financial freezing)
    IF p_action NOT IN ('LOGIN', 'LOGOUT', 'EXPORT', 'VIEW_PHI', 'OVERRIDE', 'AI_ANALYSIS') THEN
        RAISE EXCEPTION 'Invalid action: % is not an authorized manual audit action.', p_action;
    END IF;

    -- 4. Validate source allowlist
    IF p_source NOT IN ('UI', 'AI_AGENT') THEN
        RAISE EXCEPTION 'Invalid source: % is not an authorized client event source.', p_source;
    END IF;

    -- 5. If source is AI_AGENT, verify user holds AI simulation/insights permission
    IF p_source = 'AI_AGENT' AND p_facility_id IS NOT NULL THEN
        IF NOT (
            public.has_permission(p_facility_id, 'ai.run_simulation')
            OR public.has_permission(p_facility_id, 'ai.auto_schedule')
            OR public.has_permission(p_facility_id, 'ai.run_insights')
            OR public.user_has_facility_role(p_facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'clinical_manager', 'clinical_director'])
        ) THEN
            RAISE EXCEPTION 'Privilege violation: actor lacks permission to emit AI_AGENT audit telemetry.';
        END IF;
    END IF;

    -- 6. Extract IP address safely from request headers
    BEGIN
        v_ip_addr := (current_setting('request.headers', true)::json ->> 'x-forwarded-for')::inet;
    EXCEPTION WHEN OTHERS THEN
        v_ip_addr := NULL;
    END;

    -- 7. Recursively sanitize user-supplied metadata
    v_clean_metadata := public.fn_sanitize_audit_jsonb(COALESCE(p_metadata, '{}'::jsonb));

    -- 8. Insert verified immutable record
    INSERT INTO public.audit_logs (
        facility_id,
        table_name,
        record_id,
        action,
        actor_id,
        actor_email,
        ip_address,
        source,
        change_reason,
        metadata,
        correlation_id,
        timestamp
    ) VALUES (
        p_facility_id,
        p_table_name,
        p_record_id,
        p_action,
        v_actor_id,
        v_actor_email,
        v_ip_addr,
        p_source,
        p_change_reason,
        v_clean_metadata,
        p_correlation_id,
        NOW()
    )
    RETURNING id INTO v_log_id;

    RETURN v_log_id;
END;
$$ LANGUAGE plpgsql;

REVOKE ALL ON FUNCTION public.fn_log_manual_audit_event FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_log_manual_audit_event TO authenticated;

-- ==============================================================================
-- 5. DUAL-RESOLUTION RLS POLICY WITH FACILITY-LEVEL ISOLATION
-- ==============================================================================

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.audit_logs FROM anon;
GRANT SELECT ON public.audit_logs TO authenticated;

DROP POLICY IF EXISTS "Authorized Roles Can View Audit Logs" ON public.audit_logs;
CREATE POLICY "Authorized Roles Can View Audit Logs"
ON public.audit_logs
FOR SELECT
TO authenticated
USING (
    -- 1. Facility-Scoped Records (Strict Tenancy Boundary)
    (
        facility_id IS NOT NULL 
        AND facility_id IN (SELECT facility_id FROM public.get_auth_user_facilities())
        AND (
            public.has_permission(facility_id, 'audit.view_clinical')
            OR public.has_permission(facility_id, 'audit.view_financial')
            OR public.has_permission(facility_id, 'audit.view_security')
            OR public.user_has_facility_role(
                facility_id, 
                ARRAY['super_admin', 'org_admin', 'facility_admin', 'clinical_manager', 'clinical_director', 'cfo', 'biller']
            )
        )
    )
    OR
    -- 2. Organization / System Records (facility_id IS NULL)
    (
        facility_id IS NULL 
        AND public.user_has_facility_role(NULL, ARRAY['super_admin', 'org_admin'])
    )
);

-- Note: STRICTLY 0 INSERT, UPDATE, OR DELETE POLICIES GRANTED TO AUTHENTICATED USERS.

-- ==============================================================================
-- 6. IMMUTABILITY TRIGGER (DEFENSE-IN-DEPTH AGAINST MUTATION & CASCADE DELETION)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.fn_prevent_audit_log_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    RAISE EXCEPTION 'Security Invariant Violation: public.audit_logs is an append-only ledger. % operations are strictly forbidden.', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_audit_logs_immutability ON public.audit_logs;
CREATE TRIGGER trg_protect_audit_logs_immutability
BEFORE UPDATE OR DELETE OR TRUNCATE ON public.audit_logs
FOR EACH STATEMENT EXECUTE FUNCTION public.fn_prevent_audit_log_mutation();

COMMIT;
