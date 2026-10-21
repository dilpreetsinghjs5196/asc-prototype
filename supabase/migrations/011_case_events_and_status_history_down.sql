-- ==============================================================================
-- MIGRATION 011 DOWN: ROLLBACK CASE EVENTS & RESTORE PRE-011 FSM
-- ==============================================================================

BEGIN;

-- 1. Archive case_events prior to drop to ensure zero data loss
CREATE TABLE IF NOT EXISTS public.case_events_archive AS
SELECT * FROM public.case_events;

-- 2. Drop triggers on surgeries
DROP TRIGGER IF EXISTS trg_capture_case_status_event ON public.surgeries;
DROP TRIGGER IF EXISTS trg_capture_case_reschedule_event ON public.surgeries;

-- 3. Drop immutability trigger
DROP TRIGGER IF EXISTS trg_protect_case_events_immutability ON public.case_events;

-- 4. Drop trigger functions
DROP FUNCTION IF EXISTS public.fn_capture_case_status_event();
DROP FUNCTION IF EXISTS public.fn_capture_case_reschedule_event();

-- 5. Drop RLS policies
DROP POLICY IF EXISTS "Authorized Roles Can View Facility Case Events" ON public.case_events;
DROP POLICY IF EXISTS "Authorized Roles Can Insert Facility Case Events" ON public.case_events;

-- 6. Drop case_events table
DROP TABLE IF EXISTS public.case_events;

-- 7. Restore pre-011 FSM trigger definition
CREATE OR REPLACE FUNCTION public.fn_validate_case_status_transition()
RETURNS TRIGGER AS $$
DECLARE
    v_old_status TEXT;
    v_new_status TEXT;
    v_is_valid BOOLEAN := false;
BEGIN
    v_old_status := OLD.status;
    v_new_status := NEW.status;

    IF v_old_status = v_new_status THEN
        RETURN NEW;
    END IF;

    CASE v_old_status
        WHEN 'Draft' THEN
            v_is_valid := v_new_status IN ('Scheduled', 'Cancelled');
        WHEN 'Scheduled' THEN
            v_is_valid := v_new_status IN ('Pre-Op', 'Cancelled');
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
            v_is_valid := false;
        WHEN 'Void' THEN
            v_is_valid := false;
        ELSE
            v_is_valid := false;
    END CASE;

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

    IF v_new_status = 'Cancelled' AND NEW.cancelled_at IS NULL THEN
        NEW.cancelled_at := NOW();
        NEW.cancelled_by := auth.uid();
    END IF;

    NEW.version := COALESCE(OLD.version, 1) + 1;
    NEW.updated_by := auth.uid();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_validate_case_status_transition ON public.surgeries;
CREATE TRIGGER trg_validate_case_status_transition
    BEFORE UPDATE OF status ON public.surgeries
    FOR EACH ROW EXECUTE FUNCTION public.fn_validate_case_status_transition();

COMMIT;
