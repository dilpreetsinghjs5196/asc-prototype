-- ==============================================================================
-- MIGRATION 017: CPT MASTER & CODE-YEAR VERSIONING NORMALIZATION
-- ==============================================================================
-- Description: Phase 40 CPT Master Data Model Normalization:
--              1. Establishes annual regulatory release catalog (public.cpt_release_years).
--              2. Creates canonical CPT/HCPCS master catalog (public.cpt_master).
--              3. Creates temporal rate versioning table (public.cpt_code_versions).
--              4. Enforces 350% gross charge rule trigger (ROUND(reimbursement * 3.50, 0)).
--              5. Reconciles 151-day regulatory gap by backdating Sep 2026 update to 2026-05-01.
--              6. Migrates baseline CMS catalog to global tenancy (facility_id = NULL).
--              7. Deploys staged import pipeline tables (cpt_import_batches, cpt_import_staging).
--              8. Implements authoritative resolution function fn_resolve_cpt_pricing.
--              9. Implements atomic commit stored procedure fn_commit_cpt_import_batch.
--              10. Configures Row Level Security (RLS) for tenant isolation & global catalog read.
--              11. Deploys backward-compatibility view v_cpt_codes_compat.
-- Specification: docs/phases/40_CPT_MASTER_SPEC.md
-- Target Engine: Supabase PostgreSQL 15+
-- ==============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 1. ANNUAL REGULATORY RELEASE CATALOG
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.cpt_release_years (
    year INTEGER PRIMARY KEY CHECK (year >= 2020 AND year <= 2040),
    release_label TEXT NOT NULL,
    cms_publication_date DATE NOT NULL,
    effective_start_date DATE NOT NULL,
    effective_end_date DATE,
    is_current BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed Standard Release Years
INSERT INTO public.cpt_release_years (year, release_label, cms_publication_date, effective_start_date, effective_end_date, is_current)
VALUES 
    (2024, 'CMS ASC Payment Final Rule 2024', '2023-11-02', '2024-01-01', '2024-12-31', false),
    (2025, 'CMS ASC Payment Final Rule 2025', '2024-11-01', '2025-01-01', '2025-12-31', false),
    (2026, 'CMS ASC Payment Final Rule 2026', '2025-11-03', '2026-01-01', '2026-12-31', true)
ON CONFLICT (year) DO UPDATE SET
    release_label = EXCLUDED.release_label,
    effective_start_date = EXCLUDED.effective_start_date,
    is_current = EXCLUDED.is_current,
    updated_at = NOW();

-- ==============================================================================
-- 2. CANONICAL CPT/HCPCS MASTER DIRECTORY (STATIC IDENTITY LAYER)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.cpt_master (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(10) NOT NULL UNIQUE,
    code_type TEXT NOT NULL DEFAULT 'CPT' 
        CHECK (code_type IN ('CPT', 'HCPCS_II', 'CATEGORY_II', 'CATEGORY_III', 'CUSTOM')),
    description TEXT NOT NULL,
    short_descriptor TEXT,
    long_descriptor TEXT,
    specialty TEXT NOT NULL DEFAULT 'General',
    procedure_group TEXT NOT NULL DEFAULT 'General Procedures',
    body_part TEXT,
    average_duration_minutes INTEGER NOT NULL DEFAULT 60 CHECK (average_duration_minutes >= 5),
    typical_turnover_minutes INTEGER NOT NULL DEFAULT 15 CHECK (typical_turnover_minutes >= 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cpt_master_code ON public.cpt_master(code);
CREATE INDEX IF NOT EXISTS idx_cpt_master_specialty ON public.cpt_master(specialty);
CREATE INDEX IF NOT EXISTS idx_cpt_master_active ON public.cpt_master(is_active);

-- ==============================================================================
-- 3. TEMPORAL RATE & REGULATORY VERSIONING TABLE
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.cpt_code_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cpt_master_id UUID NOT NULL REFERENCES public.cpt_master(id) ON DELETE RESTRICT,
    facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE, -- NULL = National CMS Standard
    code_year INTEGER NOT NULL REFERENCES public.cpt_release_years(year),
    reimbursement NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (reimbursement >= 0.00),
    gross_charge NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (gross_charge >= 0.00),
    effective_date DATE NOT NULL,
    termination_date DATE,
    procedure_indicator VARCHAR(10),
    payment_indicator VARCHAR(10),
    is_active BOOLEAN NOT NULL DEFAULT true,
    provenance_source TEXT NOT NULL DEFAULT 'CMS_ANNUAL_UPDATE',
    import_batch_id UUID,
    legacy_cpt_id BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT chk_cpt_version_dates CHECK (termination_date IS NULL OR termination_date >= effective_date)
);

CREATE INDEX IF NOT EXISTS idx_cpt_versions_lookup 
    ON public.cpt_code_versions(cpt_master_id, facility_id, effective_date, termination_date);
CREATE INDEX IF NOT EXISTS idx_cpt_versions_year 
    ON public.cpt_code_versions(code_year);
CREATE INDEX IF NOT EXISTS idx_cpt_versions_facility 
    ON public.cpt_code_versions(facility_id);

-- ==============================================================================
-- 4. 350% GROSS CHARGE & ACTIVE SYNCHRONIZATION TRIGGERS
-- ==============================================================================

-- Trigger Function: Enforce 350% Whole-Dollar Gross Charge Rule
CREATE OR REPLACE FUNCTION public.fn_enforce_cpt_gross_charge()
RETURNS TRIGGER AS $$
BEGIN
    -- If reimbursement > 0 and gross charge is not explicitly provided, calculate 350% rounded to whole dollars
    IF NEW.reimbursement > 0 AND (NEW.gross_charge IS NULL OR NEW.gross_charge = 0.00) THEN
        NEW.gross_charge := ROUND(NEW.reimbursement * 3.50, 0);
    END IF;

    -- Synchronize temporal is_active flag
    IF NEW.termination_date IS NOT NULL AND NEW.termination_date < CURRENT_DATE THEN
        NEW.is_active := false;
    ELSE
        NEW.is_active := true;
    END IF;

    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cpt_version_gross_charge ON public.cpt_code_versions;
CREATE TRIGGER trg_cpt_version_gross_charge
BEFORE INSERT OR UPDATE ON public.cpt_code_versions
FOR EACH ROW EXECUTE FUNCTION public.fn_enforce_cpt_gross_charge();

-- ==============================================================================
-- 5. IMPORT STAGING & BATCH AUDIT INFRASTRUCTURE
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.cpt_import_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE, -- NULL = Global Catalog
    code_year INTEGER NOT NULL,
    filename TEXT NOT NULL,
    file_checksum TEXT,
    total_rows_detected INTEGER NOT NULL DEFAULT 0,
    valid_rows_count INTEGER NOT NULL DEFAULT 0,
    error_rows_count INTEGER NOT NULL DEFAULT 0,
    import_status TEXT NOT NULL DEFAULT 'Pending_Validation' 
        CHECK (import_status IN ('Pending_Validation', 'Validated', 'Committed', 'Rolled_Back', 'Failed')),
    imported_by UUID REFERENCES auth.users(id),
    validated_at TIMESTAMPTZ,
    committed_at TIMESTAMPTZ,
    error_summary JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.cpt_import_staging (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES public.cpt_import_batches(id) ON DELETE CASCADE,
    row_number INTEGER NOT NULL,
    code VARCHAR(10) NOT NULL,
    description TEXT,
    reimbursement NUMERIC(12, 2),
    calculated_350_gross_charge NUMERIC(12, 2),
    effective_date DATE NOT NULL,
    termination_date DATE,
    specialty TEXT,
    procedure_indicator TEXT,
    validation_status TEXT NOT NULL DEFAULT 'Pending' 
        CHECK (validation_status IN ('Pending', 'Valid', 'Duplicate_In_Batch', 'Overlap_Conflict', 'Invalid_Rate')),
    validation_error_message TEXT,
    diff_status TEXT NOT NULL DEFAULT 'Unchanged' 
        CHECK (diff_status IN ('Unchanged', 'New_Code', 'Rate_Change', 'Terminated', 'Reactivated')),
    previous_reimbursement NUMERIC(12, 2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cpt_staging_batch ON public.cpt_import_staging(batch_id, validation_status);

-- ==============================================================================
-- 6. AUTHORITATIVE RATE RESOLUTION STORED FUNCTION
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.fn_resolve_cpt_pricing(
    p_facility_id UUID,
    p_cpt_code VARCHAR,
    p_dos DATE DEFAULT CURRENT_DATE,
    p_payer_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_master_id UUID;
    v_contracted_rate NUMERIC(12, 2) := NULL;
    v_reimbursement NUMERIC(12, 2) := NULL;
    v_gross_charge NUMERIC(12, 2) := NULL;
    v_rate_source TEXT := 'CMS_NATIONAL_STANDARD';
    v_version_id UUID := NULL;
    v_procedure_indicator TEXT := NULL;
BEGIN
    -- 1. Locate canonical master CPT entry
    SELECT id INTO v_master_id 
    FROM public.cpt_master 
    WHERE code = p_cpt_code AND is_active = true
    LIMIT 1;

    -- If not yet migrated to cpt_master, check legacy cpt_codes
    IF v_master_id IS NULL THEN
        SELECT id, reimbursement, gross_charge, procedure_indicator
        INTO v_version_id, v_reimbursement, v_gross_charge, v_procedure_indicator
        FROM public.cpt_codes
        WHERE code = p_cpt_code
          AND (facility_id IS NULL OR facility_id = p_facility_id)
          AND p_dos >= effective_date
          AND (termination_date IS NULL OR p_dos <= termination_date)
        ORDER BY (facility_id IS NOT NULL) DESC, effective_date DESC
        LIMIT 1;

        IF v_reimbursement IS NOT NULL THEN
            RETURN jsonb_build_object(
                'success', true,
                'code', p_cpt_code,
                'master_id', NULL,
                'version_id', v_version_id,
                'rate_source', 'LEGACY_CPT_CODES',
                'contracted_reimbursement', v_reimbursement,
                'baseline_gross_charge', COALESCE(v_gross_charge, ROUND(v_reimbursement * 3.50, 0)),
                'date_of_service', p_dos
            );
        END IF;

        RETURN jsonb_build_object(
            'success', false, 
            'error', 'CPT code ' || p_cpt_code || ' not recognized for date ' || p_dos::text
        );
    END IF;

    -- 2. Check Contracted Payer Fee Schedule (Tier 1)
    IF p_payer_id IS NOT NULL THEN
        SELECT pfs.contracted_rate, pfs.id INTO v_contracted_rate, v_version_id
        FROM public.payer_fee_schedules pfs
        WHERE pfs.facility_id = p_facility_id
          AND pfs.payer_id = p_payer_id
          AND pfs.cpt_code_id IN (SELECT id FROM public.cpt_codes WHERE code = p_cpt_code)
          AND p_dos >= pfs.effective_start_date
          AND (pfs.effective_end_date IS NULL OR p_dos <= pfs.effective_end_date)
        ORDER BY pfs.effective_start_date DESC LIMIT 1;

        IF v_contracted_rate IS NOT NULL THEN
            v_rate_source := 'PAYER_CONTRACT';
        END IF;
    END IF;

    -- 3. Check Facility-Specific Custom Override (Tier 2)
    IF v_contracted_rate IS NULL THEN
        SELECT v.reimbursement, v.gross_charge, v.id, v.procedure_indicator
        INTO v_reimbursement, v_gross_charge, v_version_id, v_procedure_indicator
        FROM public.cpt_code_versions v
        WHERE v.cpt_master_id = v_master_id
          AND v.facility_id = p_facility_id
          AND p_dos >= v.effective_date
          AND (v.termination_date IS NULL OR p_dos <= v.termination_date)
        ORDER BY v.effective_date DESC LIMIT 1;

        IF v_reimbursement IS NOT NULL THEN
            v_rate_source := 'FACILITY_OVERRIDE';
            v_contracted_rate := v_reimbursement;
        END IF;
    END IF;

    -- 4. Check National CMS Standard Catalog (Tier 3)
    IF v_reimbursement IS NULL THEN
        SELECT v.reimbursement, v.gross_charge, v.id, v.procedure_indicator
        INTO v_reimbursement, v_gross_charge, v_version_id, v_procedure_indicator
        FROM public.cpt_code_versions v
        WHERE v.cpt_master_id = v_master_id
          AND v.facility_id IS NULL
          AND p_dos >= v.effective_date
          AND (v.termination_date IS NULL OR p_dos <= v.termination_date)
        ORDER BY v.effective_date DESC LIMIT 1;

        IF v_reimbursement IS NOT NULL THEN
            v_rate_source := 'CMS_NATIONAL_STANDARD';
            v_contracted_rate := v_reimbursement;
        END IF;
    END IF;

    IF v_gross_charge IS NULL AND v_reimbursement IS NOT NULL THEN
        v_gross_charge := ROUND(v_reimbursement * 3.50, 0);
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'code', p_cpt_code,
        'master_id', v_master_id,
        'version_id', v_version_id,
        'rate_source', v_rate_source,
        'contracted_reimbursement', COALESCE(v_contracted_rate, 0.00),
        'baseline_gross_charge', COALESCE(v_gross_charge, 0.00),
        'procedure_indicator', v_procedure_indicator,
        'date_of_service', p_dos
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================================================
-- 7. ATOMIC STAGED IMPORT COMMIT STORED PROCEDURE
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.fn_commit_cpt_import_batch(p_batch_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_batch RECORD;
    v_item RECORD;
    v_master_id UUID;
    v_inserted_versions INTEGER := 0;
BEGIN
    SELECT * INTO v_batch FROM public.cpt_import_batches WHERE id = p_batch_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Import batch % not found', p_batch_id;
    END IF;

    IF v_batch.import_status = 'Committed' THEN
        RAISE EXCEPTION 'Batch % has already been committed', p_batch_id;
    END IF;

    FOR v_item IN 
        SELECT * FROM public.cpt_import_staging 
        WHERE batch_id = p_batch_id AND validation_status = 'Valid'
        ORDER BY row_number ASC
    LOOP
        -- Upsert Master Directory Item
        INSERT INTO public.cpt_master (code, description, specialty, procedure_group)
        VALUES (
            v_item.code, 
            COALESCE(v_item.description, 'Procedure ' || v_item.code), 
            COALESCE(v_item.specialty, 'General'),
            'General Procedures'
        )
        ON CONFLICT (code) DO UPDATE SET
            description = EXCLUDED.description,
            specialty = CASE WHEN EXCLUDED.specialty <> 'General' THEN EXCLUDED.specialty ELSE cpt_master.specialty END,
            updated_at = NOW()
        RETURNING id INTO v_master_id;

        -- Terminate existing active version if overlap exists
        UPDATE public.cpt_code_versions
        SET termination_date = (v_item.effective_date - 1),
            is_active = false,
            updated_at = NOW()
        WHERE cpt_master_id = v_master_id
          AND (facility_id IS NOT DISTINCT FROM v_batch.facility_id)
          AND termination_date IS NULL
          AND effective_date < v_item.effective_date;

        -- Insert new temporal version
        INSERT INTO public.cpt_code_versions (
            cpt_master_id,
            facility_id,
            code_year,
            reimbursement,
            gross_charge,
            effective_date,
            termination_date,
            procedure_indicator,
            is_active,
            provenance_source,
            import_batch_id
        ) VALUES (
            v_master_id,
            v_batch.facility_id,
            v_batch.code_year,
            COALESCE(v_item.reimbursement, 0.00),
            COALESCE(v_item.calculated_350_gross_charge, ROUND(COALESCE(v_item.reimbursement, 0.00) * 3.50, 0)),
            v_item.effective_date,
            v_item.termination_date,
            v_item.procedure_indicator,
            true,
            v_batch.filename,
            p_batch_id
        );

        v_inserted_versions := v_inserted_versions + 1;
    END LOOP;

    -- Update batch header
    UPDATE public.cpt_import_batches
    SET import_status = 'Committed',
        committed_at = NOW()
    WHERE id = p_batch_id;

    RETURN jsonb_build_object(
        'success', true,
        'batch_id', p_batch_id,
        'versions_committed', v_inserted_versions
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================================================
-- 8. RECONCILE 151-DAY TEMPORAL GAP & MULTI-TENANT BACKFILL
-- ==============================================================================

-- A. Bridge 151-Day Regulatory Gap (2026-05-01 to 2026-09-28)
-- In accordance with Decision 1, backdate Sep 2026 update to 2026-05-01 for continuous coverage
UPDATE public.cpt_codes
SET effective_date = '2026-05-01'
WHERE effective_date = '2026-09-29';

-- B. Reconcile Tenancy to Global Shared CMS Standard (Decision 2)
-- Standard CMS codes have facility_id = NULL so all existing and future facilities inherit the catalog
UPDATE public.cpt_codes
SET facility_id = NULL
WHERE facility_id = '00000000-0000-0000-0000-000000000002';

-- C. Populate Canonical cpt_master from cpt_codes
INSERT INTO public.cpt_master (code, code_type, description, specialty, procedure_group, body_part, average_duration_minutes, typical_turnover_minutes, is_active)
SELECT DISTINCT ON (code)
    code,
    CASE 
        WHEN code ~ '^[0-9]{4}[TF]$' THEN 'CATEGORY_III'
        WHEN code ~ '^[A-V][0-9]{4}$' THEN 'HCPCS_II'
        ELSE 'CPT'
    END AS code_type,
    COALESCE(description, 'Procedure ' || code) AS description,
    COALESCE(category, 'General') AS specialty,
    COALESCE(procedure_group, 'General Procedures') AS procedure_group,
    body_part,
    COALESCE(average_duration, 60)::INTEGER AS average_duration_minutes,
    COALESCE(turnover_time, 15)::INTEGER AS typical_turnover_minutes,
    true AS is_active
FROM public.cpt_codes
ORDER BY code, id DESC
ON CONFLICT (code) DO NOTHING;

-- D. Populate cpt_code_versions from cpt_codes
INSERT INTO public.cpt_code_versions (
    cpt_master_id,
    facility_id,
    code_year,
    reimbursement,
    gross_charge,
    effective_date,
    termination_date,
    procedure_indicator,
    payment_indicator,
    is_active,
    provenance_source,
    legacy_cpt_id
)
SELECT 
    m.id AS cpt_master_id,
    NULL AS facility_id, -- Global CMS Catalog
    CASE 
        WHEN c.termination_date IS NOT NULL AND c.termination_date <= '2026-04-30' THEN 2025
        ELSE 2026
    END AS code_year,
    COALESCE(c.reimbursement, 0.00),
    COALESCE(c.gross_charge, ROUND(COALESCE(c.reimbursement, 0.00) * 3.50, 0)),
    COALESCE(c.effective_date, '2025-01-01'::DATE),
    c.termination_date,
    c.procedure_indicator,
    c.payment_indicator,
    (c.termination_date IS NULL OR c.termination_date >= CURRENT_DATE) AS is_active,
    COALESCE(c.original_filename, 'CMS_BASELINE_IMPORT'),
    c.id AS legacy_cpt_id
FROM public.cpt_codes c
JOIN public.cpt_master m ON c.code = m.code
ON CONFLICT DO NOTHING;

-- ==============================================================================
-- 9. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE public.cpt_release_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cpt_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cpt_code_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cpt_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cpt_import_staging ENABLE ROW LEVEL SECURITY;

-- cpt_release_years: Global read-only
CREATE POLICY "cpt_release_years_read_all"
ON public.cpt_release_years FOR SELECT TO authenticated
USING (true);

-- cpt_master: Readable by all authenticated staff
CREATE POLICY "cpt_master_read_all"
ON public.cpt_master FOR SELECT TO authenticated
USING (true);

-- cpt_master: Manageable by super_admin
CREATE POLICY "cpt_master_manage_admin"
ON public.cpt_master FOR ALL TO authenticated
USING (user_has_facility_role(NULL, ARRAY['super_admin']))
WITH CHECK (user_has_facility_role(NULL, ARRAY['super_admin']));

-- cpt_code_versions: Shared national (facility_id IS NULL) + tenant overrides
CREATE POLICY "cpt_versions_read_scoped"
ON public.cpt_code_versions FOR SELECT TO authenticated
USING (facility_id IS NULL OR facility_id IN (SELECT get_auth_user_facilities()));

CREATE POLICY "cpt_versions_manage_tenant"
ON public.cpt_code_versions FOR ALL TO authenticated
USING (
    (facility_id IS NULL AND user_has_facility_role(NULL, ARRAY['super_admin']))
    OR (
        facility_id IS NOT NULL 
        AND facility_id IN (SELECT get_auth_user_facilities())
        AND user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'cfo', 'biller'])
    )
)
WITH CHECK (
    (facility_id IS NULL AND user_has_facility_role(NULL, ARRAY['super_admin']))
    OR (
        facility_id IS NOT NULL 
        AND facility_id IN (SELECT get_auth_user_facilities())
        AND user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'cfo', 'biller'])
    )
);

-- cpt_import_batches & staging: Scoped to user's facility
CREATE POLICY "cpt_import_batches_scoped"
ON public.cpt_import_batches FOR ALL TO authenticated
USING (facility_id IS NULL OR facility_id IN (SELECT get_auth_user_facilities()))
WITH CHECK (facility_id IS NULL OR facility_id IN (SELECT get_auth_user_facilities()));

CREATE POLICY "cpt_import_staging_scoped"
ON public.cpt_import_staging FOR ALL TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.cpt_import_batches b
        WHERE b.id = batch_id 
          AND (b.facility_id IS NULL OR b.facility_id IN (SELECT get_auth_user_facilities()))
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.cpt_import_batches b
        WHERE b.id = batch_id 
          AND (b.facility_id IS NULL OR b.facility_id IN (SELECT get_auth_user_facilities()))
    )
);

-- ==============================================================================
-- 10. BACKWARD-COMPATIBILITY VIEW
-- ==============================================================================

CREATE OR REPLACE VIEW public.v_cpt_codes_compat AS
SELECT 
    v.legacy_cpt_id AS id,
    m.code,
    m.description,
    v.reimbursement,
    v.gross_charge,
    m.specialty AS category,
    m.procedure_group,
    v.effective_date,
    v.termination_date,
    v.code_year::text AS version_year,
    v.procedure_indicator,
    v.payment_indicator,
    v.is_active,
    v.facility_id,
    m.average_duration_minutes AS average_duration,
    m.typical_turnover_minutes AS turnover_time,
    m.body_part
FROM public.cpt_code_versions v
JOIN public.cpt_master m ON v.cpt_master_id = m.id;

COMMIT;
