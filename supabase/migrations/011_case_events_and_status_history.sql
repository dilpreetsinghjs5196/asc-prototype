-- ==============================================================================
-- MIGRATION 011: CASE EVENTS LEDGER, STATUS HISTORY & FSM RECONCILIATION
-- ==============================================================================
-- Description: Establishes production-grade 1NF normalized Case Events subsystem:
--              1. Creates immutable public.case_events table with strict check constraints.
--              2. Attaches compound performance indexes for sub-millisecond timeline queries.
--              3. Refactors fn_validate_case_status_transition() to support controlled fast-completion.
--              4. Attaches automated atomic trigger fn_capture_case_status_event() to surgeries.
--              5. Attaches automated reschedule trigger fn_capture_case_reschedule_event() to surgeries.
--              6. Enforces statement-level append-only immutability trigger.
--              7. Implements tenant-scoped Row Level Security (RLS) policies.
--              8. Deterministic idempotent backfill for existing historical case events.
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. CREATE NORMALIZED CASE EVENTS TABLE
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.case_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE RESTRICT,
    surgery_id BIGINT NOT NULL REFERENCES public.surgeries(id) ON DELETE RESTRICT,
    event_type TEXT NOT NULL,
    from_status TEXT,
    to_status TEXT,
    actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    actor_email TEXT,
    actor_role TEXT,
    source TEXT NOT NULL DEFAULT 'UI',
    reason_code TEXT,
    reason_text TEXT,
    event_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    correlation_id TEXT,
    case_version INTEGER NOT NULL DEFAULT 1,
    snapshot_id UUID REFERENCES public.surgery_financial_snapshots(id) ON DELETE SET NULL,
    payload JSONB DEFAULT '{}'::jsonb
);

-- Constraints
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_case_events_type' AND conrelid = 'public.case_events'::regclass
    ) THEN
        ALTER TABLE public.case_events
            ADD CONSTRAINT chk_case_events_type CHECK (event_type IN (
                'CASE_CREATED',
                'STATUS_TRANSITIONED',
                'CASE_RESCHEDULED',
                'CLINICAL_DETAILS_UPDATED',
                'CPT_CODES_CHANGED',
                'PROCEDURE_LINE_UPDATED',
                'FINANCIAL_SNAPSHOT_FROZEN',
                'CASE_CANCELLED',
                'CASE_COMPLETED',
                'CASE_BILLED',
                'CASE_VOIDED',
                'ADMIN_OVERRIDE'
            ));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_case_events_source' AND conrelid = 'public.case_events'::regclass
    ) THEN
        ALTER TABLE public.case_events
            ADD CONSTRAINT chk_case_events_source CHECK (
                source IN ('UI', 'API', 'IMPORT', 'AI_AGENT', 'SYSTEM', 'BACKGROUND_JOB')
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_case_events_from_status' AND conrelid = 'public.case_events'::regclass
    ) THEN
        ALTER TABLE public.case_events
            ADD CONSTRAINT chk_case_events_from_status CHECK (
                from_status IS NULL OR from_status IN ('Draft', 'Scheduled', 'Pre-Op', 'In-OR', 'Closing', 'PACU', 'Completed', 'Billed', 'Cancelled', 'Void')
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_case_events_to_status' AND conrelid = 'public.case_events'::regclass
    ) THEN
        ALTER TABLE public.case_events
            ADD CONSTRAINT chk_case_events_to_status CHECK (
                to_status IS NULL OR to_status IN ('Draft', 'Scheduled', 'Pre-Op', 'In-OR', 'Closing', 'PACU', 'Completed', 'Billed', 'Cancelled', 'Void')
            );
    END IF;
END $$;

-- Indexes for Fast Timeline & Tenancy Queries
CREATE INDEX IF NOT EXISTS idx_case_events_surgery_timeline ON public.case_events(surgery_id, event_timestamp ASC);
CREATE INDEX IF NOT EXISTS idx_case_events_facility_type ON public.case_events(facility_id, event_type, event_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_case_events_correlation ON public.case_events(correlation_id) WHERE correlation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_case_events_actor ON public.case_events(actor_id);
CREATE INDEX IF NOT EXISTS idx_case_events_timestamp ON public.case_events(event_timestamp DESC);

-- ==============================================================================
-- 2. REFACTOR FINITE STATE MACHINE (FSM) TRIGGER: CONTROLLED FAST-COMPLETION
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.fn_validate_case_status_transition()
RETURNS TRIGGER AS $$
DECLARE
    v_old_status TEXT;
    v_new_status TEXT;
    v_is_valid BOOLEAN := false;
BEGIN
    v_old_status := OLD.status;
    v_new_status := NEW.status;

    -- If status did not change, allow update
    IF v_old_status = v_new_status THEN
        RETURN NEW;
    END IF;

    -- State Machine Transition Matrix
    CASE v_old_status
        WHEN 'Draft' THEN
            v_is_valid := v_new_status IN ('Scheduled', 'Cancelled');
        WHEN 'Scheduled' THEN
            -- Allow standard progression to Pre-Op, fast-completion to Completed, or Cancellation
            v_is_valid := v_new_status IN ('Pre-Op', 'Completed', 'Cancelled');
        WHEN 'Pre-Op' THEN
            v_is_valid := v_new_status IN ('In-OR', 'Cancelled');
        WHEN 'In-OR' THEN
            v_is_valid := v_new_status IN ('Closing', 'PACU');
        WHEN 'Closing' THEN
            v_is_valid := v_new_status IN ('PACU');
        WHEN 'PACU' THEN
            v_is_valid := v_new_status IN ('Completed');
        WHEN 'Completed' THEN
            v_is_valid := v_new_status IN ('Billed', 'Void');
        WHEN 'Billed' THEN
            v_is_valid := v_new_status IN ('Void');
        WHEN 'Cancelled' THEN
            -- Terminal state
            v_is_valid := false;
        WHEN 'Void' THEN
            -- Terminal state
            v_is_valid := false;
        ELSE
            v_is_valid := false;
    END CASE;

    -- Super Admin Override: Super admins can bypass transition matrix for audit corrections
    IF NOT v_is_valid THEN
        IF EXISTS (
            SELECT 1 FROM public.facility_memberships fm
            WHERE fm.user_id = auth.uid()
              AND fm.facility_id = NEW.facility_id
              AND fm.role = 'super_admin'
              AND fm.is_active = true
        ) THEN
            v_is_valid := true;
        END IF;
    END IF;

    IF NOT v_is_valid THEN
        RAISE EXCEPTION 'Invalid case status transition from % to % for surgical case %', 
            v_old_status, v_new_status, NEW.id;
    END IF;

    -- Automatically populate cancellation metadata if transitioning to Cancelled
    IF v_new_status = 'Cancelled' AND NEW.cancelled_at IS NULL THEN
        NEW.cancelled_at := NOW();
        NEW.cancelled_by := auth.uid();
    END IF;

    -- Automatically populate actual end time if transitioning to Completed and not set
    IF v_new_status = 'Completed' AND NEW.actual_end_time IS NULL THEN
        NEW.actual_end_time := NOW()::time;
    END IF;

    -- Increment internal concurrency version
    NEW.version := COALESCE(OLD.version, 1) + 1;
    NEW.updated_by := auth.uid();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Re-attach validation trigger
DROP TRIGGER IF EXISTS trg_validate_case_status_transition ON public.surgeries;
CREATE TRIGGER trg_validate_case_status_transition
    BEFORE UPDATE OF status ON public.surgeries
    FOR EACH ROW EXECUTE FUNCTION public.fn_validate_case_status_transition();

-- ==============================================================================
-- 3. AUTOMATED ATOMIC TRIGGER: CAPTURE CASE STATUS TRANSITIONS
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.fn_capture_case_status_event()
RETURNS TRIGGER AS $$
DECLARE
    v_actor_email TEXT;
    v_actor_role TEXT;
    v_source TEXT := 'UI';
    v_event_type TEXT;
    v_header_source TEXT;
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        -- Resolve caller identity from auth context
        BEGIN
            v_actor_email := auth.jwt() ->> 'email';
        EXCEPTION WHEN OTHERS THEN
            v_actor_email := NULL;
        END;

        -- Extract client header source if available
        BEGIN
            v_header_source := current_setting('request.headers', true)::json ->> 'x-source';
            IF v_header_source IS NOT NULL AND v_header_source <> '' THEN
                v_source := v_header_source;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            v_source := 'UI';
        END;

        -- If run from background / system script
        IF auth.uid() IS NULL THEN
            v_source := 'SYSTEM';
            v_actor_role := 'system';
        ELSE
            SELECT fm.role INTO v_actor_role
            FROM public.facility_memberships fm
            WHERE fm.user_id = auth.uid() 
              AND (fm.facility_id = NEW.facility_id OR fm.facility_id IS NULL)
              AND fm.is_active = true
            ORDER BY (fm.role = 'super_admin') DESC
            LIMIT 1;
            
            IF v_actor_role IS NULL THEN
                v_actor_role := 'staff';
            END IF;
        END IF;

        -- Map specific status event types
        IF NEW.status = 'Cancelled' THEN
            v_event_type := 'CASE_CANCELLED';
        ELSIF NEW.status = 'Completed' THEN
            v_event_type := 'CASE_COMPLETED';
        ELSIF NEW.status = 'Billed' THEN
            v_event_type := 'CASE_BILLED';
        ELSIF NEW.status = 'Void' THEN
            v_event_type := 'CASE_VOIDED';
        ELSE
            v_event_type := 'STATUS_TRANSITIONED';
        END IF;

        INSERT INTO public.case_events (
            facility_id,
            surgery_id,
            event_type,
            from_status,
            to_status,
            actor_id,
            actor_email,
            actor_role,
            source,
            reason_code,
            reason_text,
            case_version,
            event_timestamp,
            payload
        ) VALUES (
            NEW.facility_id,
            NEW.id,
            v_event_type,
            OLD.status,
            NEW.status,
            auth.uid(),
            v_actor_email,
            v_actor_role,
            v_source,
            NEW.cancellation_reason_code,
            NEW.cancellation_reason_text,
            NEW.version,
            NOW(),
            jsonb_build_object(
                'from_status', OLD.status,
                'to_status', NEW.status,
                'notes', NEW.notes,
                'actual_start_time', NEW.actual_start_time,
                'actual_end_time', NEW.actual_end_time
            )
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_capture_case_status_event ON public.surgeries;
CREATE TRIGGER trg_capture_case_status_event
    AFTER UPDATE OF status ON public.surgeries
    FOR EACH ROW EXECUTE FUNCTION public.fn_capture_case_status_event();

-- ==============================================================================
-- 4. AUTOMATED TRIGGER: CAPTURE CASE RESCHEDULE EVENTS
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.fn_capture_case_reschedule_event()
RETURNS TRIGGER AS $$
DECLARE
    v_actor_email TEXT;
    v_actor_role TEXT;
    v_source TEXT := 'UI';
BEGIN
    IF (OLD.date IS DISTINCT FROM NEW.date) OR 
       (OLD.scheduled_start_time IS DISTINCT FROM NEW.scheduled_start_time) OR
       (OLD.start_time IS DISTINCT FROM NEW.start_time) THEN

        BEGIN
            v_actor_email := auth.jwt() ->> 'email';
        EXCEPTION WHEN OTHERS THEN
            v_actor_email := NULL;
        END;

        IF auth.uid() IS NULL THEN
            v_source := 'SYSTEM';
            v_actor_role := 'system';
        ELSE
            SELECT fm.role INTO v_actor_role
            FROM public.facility_memberships fm
            WHERE fm.user_id = auth.uid() 
              AND (fm.facility_id = NEW.facility_id OR fm.facility_id IS NULL)
              AND fm.is_active = true
            ORDER BY (fm.role = 'super_admin') DESC
            LIMIT 1;

            v_actor_role := COALESCE(v_actor_role, 'staff');
        END IF;

        INSERT INTO public.case_events (
            facility_id,
            surgery_id,
            event_type,
            from_status,
            to_status,
            actor_id,
            actor_email,
            actor_role,
            source,
            reason_text,
            case_version,
            event_timestamp,
            payload
        ) VALUES (
            NEW.facility_id,
            NEW.id,
            'CASE_RESCHEDULED',
            OLD.status,
            NEW.status,
            auth.uid(),
            v_actor_email,
            v_actor_role,
            v_source,
            'Surgery date or start time rescheduled',
            NEW.version,
            NOW(),
            jsonb_build_object(
                'previous_date', OLD.date,
                'new_date', NEW.date,
                'previous_start_time', COALESCE(OLD.scheduled_start_time::text, OLD.start_time::text),
                'new_start_time', COALESCE(NEW.scheduled_start_time::text, NEW.start_time::text)
            )
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_capture_case_reschedule_event ON public.surgeries;
CREATE TRIGGER trg_capture_case_reschedule_event
    AFTER UPDATE OF date, scheduled_start_time, start_time ON public.surgeries
    FOR EACH ROW EXECUTE FUNCTION public.fn_capture_case_reschedule_event();

-- ==============================================================================
-- 5. STATEMENT-LEVEL IMMUTABILITY TRIGGER (PREVENT UPDATE / DELETE / TRUNCATE)
-- ==============================================================================

DROP TRIGGER IF EXISTS trg_protect_case_events_immutability ON public.case_events;
CREATE TRIGGER trg_protect_case_events_immutability
    BEFORE UPDATE OR DELETE OR TRUNCATE ON public.case_events
    FOR EACH STATEMENT EXECUTE FUNCTION public.fn_prevent_audit_log_mutation();

-- ==============================================================================
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE public.case_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.case_events FROM anon;
GRANT SELECT, INSERT ON public.case_events TO authenticated;

DROP POLICY IF EXISTS "Authorized Roles Can View Facility Case Events" ON public.case_events;
CREATE POLICY "Authorized Roles Can View Facility Case Events"
ON public.case_events
FOR SELECT
TO authenticated
USING (
    facility_id IN (SELECT facility_id FROM public.get_auth_user_facilities())
    OR EXISTS (
        SELECT 1 FROM public.facility_memberships fm
        WHERE fm.user_id = auth.uid() AND fm.role = 'super_admin' AND fm.is_active = true
    )
);

DROP POLICY IF EXISTS "Authorized Roles Can Insert Facility Case Events" ON public.case_events;
CREATE POLICY "Authorized Roles Can Insert Facility Case Events"
ON public.case_events
FOR INSERT
TO authenticated
WITH CHECK (
    facility_id IN (SELECT facility_id FROM public.get_auth_user_facilities())
    OR EXISTS (
        SELECT 1 FROM public.facility_memberships fm
        WHERE fm.user_id = auth.uid() AND fm.role = 'super_admin' AND fm.is_active = true
    )
);

-- ==============================================================================
-- 7. DETERMINISTIC IDEMPOTENT HISTORICAL BACKFILL
-- ==============================================================================

-- 7.1 Backfill CASE_CREATED for all existing historical surgeries
INSERT INTO public.case_events (
    facility_id,
    surgery_id,
    event_type,
    from_status,
    to_status,
    actor_id,
    actor_role,
    source,
    reason_text,
    case_version,
    event_timestamp,
    payload
)
SELECT 
    s.facility_id,
    s.id,
    'CASE_CREATED',
    NULL,
    COALESCE(s.status, 'Scheduled'),
    s.updated_by,
    'system',
    'IMPORT',
    'Historical creation backfill from Phase 31 case master records',
    1,
    COALESCE(s.created_at, NOW()),
    jsonb_build_object(
        'patient_id', s.patient_id,
        'doctor_name', s.doctor_name,
        'date', s.date,
        'start_time', s.start_time
    )
FROM public.surgeries s
WHERE NOT EXISTS (
    SELECT 1 FROM public.case_events ce 
    WHERE ce.surgery_id = s.id AND ce.event_type = 'CASE_CREATED'
);

-- 7.2 Backfill CASE_COMPLETED for all historical completed surgeries
INSERT INTO public.case_events (
    facility_id,
    surgery_id,
    event_type,
    from_status,
    to_status,
    actor_id,
    actor_role,
    source,
    reason_text,
    case_version,
    event_timestamp,
    payload
)
SELECT 
    s.facility_id,
    s.id,
    'CASE_COMPLETED',
    'Scheduled',
    'Completed',
    s.updated_by,
    'system',
    'IMPORT',
    'Historical completion backfill from Phase 31 case master records',
    COALESCE(s.version, 1),
    COALESCE(s.created_at + interval '2 hours', NOW()),
    jsonb_build_object(
        'actual_duration_minutes', s.actual_duration_minutes,
        'actual_room_cost', s.actual_room_cost,
        'actual_labor_cost', s.actual_labor_cost
    )
FROM public.surgeries s
WHERE s.status = 'Completed'
  AND NOT EXISTS (
      SELECT 1 FROM public.case_events ce 
      WHERE ce.surgery_id = s.id AND ce.event_type = 'CASE_COMPLETED'
  );

COMMIT;
