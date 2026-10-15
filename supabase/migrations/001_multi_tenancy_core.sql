-- ==============================================================================
-- MIGRATION: 001_multi_tenancy_core.sql (HARDENED, AUDITED & PRODUCTION-READY)
-- TARGET: Matches exact 10 live tables from Supabase Dashboard:
--         chatbot_questions, cpt_codes, or_block_schedule, ot_extra_cost,
--         patients, settings, staff, surgeons, surgeries, users.
-- DESCRIPTION:
--   1. Creates public.organizations, public.facilities, public.facility_memberships.
--   2. Seeds initial organization (Naples Health Network) and 2 facilities.
--   3. Adds facility_id to operational tables and safely backfills existing data.
--   4. Seeds memberships (admin@asc.com & verified surgeons) and deploys onboarding trigger.
--   5. Establishes shared catalog support (CPT codes and Chatbot FAQ).
--   6. Enforces facility immutability via BEFORE UPDATE trigger (prevent_facility_relocation).
--   7. Deploys PostgreSQL RLS helper functions with explicit search_path.
--   8. Drops prototype anonymous policies and explicitly enables RLS on EVERY domain table.
--   9. Deploys granular, role-aware CRUD policies (restricts DELETE/UPDATE; blocks viewer mutations).
--   10. Secures public.users with column-level grants, protecting plaintext passwords.
-- AUTHOR: ASCANALYST Architecture & Security Team
-- DATE: 2026-10-15
-- ==============================================================================

BEGIN;

-- 1. Enable Cryptographic UUID Generator if not enabled
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 2. CREATE MULTI-TENANCY HIERARCHY TABLES
-- ==============================================================================

-- 2.1 Organizations (Parent Enterprise Tenant)
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    tax_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.2 Facilities (Physical Surgery Centers / HOPDs)
CREATE TABLE IF NOT EXISTS public.facilities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    license_number TEXT,
    timezone TEXT NOT NULL DEFAULT 'America/New_York',
    address TEXT,
    city TEXT,
    state TEXT,
    zip TEXT,
    phone TEXT,
    tax_id TEXT,
    npi TEXT,
    apply_medicare_mppr BOOLEAN NOT NULL DEFAULT false,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_facilities_org_id ON public.facilities(organization_id);

-- 2.3 Facility Memberships (RBAC linking auth.users to Facilities)
-- Aligned with all 10 planned specification roles:
-- Super Admin, Organization Admin, Facility Administrator, CFO/Finance,
-- Clinical Manager/Director, Scheduler, Biller/RCM, Coder, Surgeon, Viewer/Read Only.
CREATE TABLE IF NOT EXISTS public.facility_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (
        role IN (
            'super_admin',
            'org_admin',
            'facility_admin',
            'cfo',
            'finance',
            'clinical_manager',
            'clinical_director',
            'scheduler',
            'biller',
            'billing_rcm',
            'coder',
            'surgeon',
            'viewer',
            'read_only'
        )
    ),
    is_active BOOLEAN NOT NULL DEFAULT true,
    title TEXT,
    department TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_facility_user_membership UNIQUE (facility_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_memberships_user ON public.facility_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_facility ON public.facility_memberships(facility_id);
CREATE INDEX IF NOT EXISTS idx_memberships_user_active ON public.facility_memberships(user_id, is_active);

-- ==============================================================================
-- 3. SEED DEFAULT INITIAL TENANTS & DETERMINISTIC FACILITY IDENTIFIERS
-- ==============================================================================

-- 3.1 Default Organization: Naples Health Network
INSERT INTO public.organizations (id, name, tax_id)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Naples Health Network',
    '59-9876543'
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    updated_at = NOW();

-- 3.2 Primary Facility: Naples Surgery Center (Data Owner for existing 234 surgeries, 222 patients)
INSERT INTO public.facilities (
    id,
    organization_id,
    name,
    license_number,
    timezone,
    address,
    city,
    state,
    zip,
    phone,
    tax_id,
    npi,
    apply_medicare_mppr
) VALUES (
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    'Naples Surgery Center',
    'ASC-FL-90412',
    'America/New_York',
    '123 Medical Blvd',
    'Naples',
    'FL',
    '34102',
    '(555) 123-4567',
    '59-1234567',
    '1234567890',
    false
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    updated_at = NOW();

-- 3.3 Secondary Facility: South Florida Outpatient Pavilion (Multi-Facility Network Testing)
INSERT INTO public.facilities (
    id,
    organization_id,
    name,
    license_number,
    timezone,
    address,
    city,
    state,
    zip,
    phone,
    tax_id,
    npi,
    apply_medicare_mppr
) VALUES (
    '00000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000001',
    'South Florida Outpatient Pavilion',
    'ASC-FL-90881',
    'America/New_York',
    '450 Ocean View Way',
    'Fort Myers',
    'FL',
    '33901',
    '(555) 987-6543',
    '59-7654321',
    '1987654321',
    true
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    updated_at = NOW();

-- ==============================================================================
-- 4. BIND EXISTING OPERATIONAL TABLES TO FACILITY TENANCY (DATA BACKFILL)
-- (Must execute BEFORE membership seeding so s.facility_id exists on public.surgeons)
-- ==============================================================================

-- 4.1 public.surgeons
ALTER TABLE public.surgeons 
ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE;
UPDATE public.surgeons SET facility_id = '00000000-0000-0000-0000-000000000002' WHERE facility_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_surgeons_facility ON public.surgeons(facility_id);

-- 4.2 public.patients (Preserves 222 Existing Patients)
ALTER TABLE public.patients 
ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE;
UPDATE public.patients SET facility_id = '00000000-0000-0000-0000-000000000002' WHERE facility_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_patients_facility ON public.patients(facility_id);

-- 4.3 public.cpt_codes (Shared National Catalog: Facility ID Nullable)
ALTER TABLE public.cpt_codes 
ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE;
-- Existing 8,991 CMS standard codes remain with facility_id = NULL for global read across all facilities
CREATE INDEX IF NOT EXISTS idx_cpt_codes_facility ON public.cpt_codes(facility_id);

-- 4.4 public.surgeries (Preserves 234 Existing Clinical Cases)
ALTER TABLE public.surgeries 
ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE;
UPDATE public.surgeries SET facility_id = '00000000-0000-0000-0000-000000000002' WHERE facility_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_surgeries_facility ON public.surgeries(facility_id);
CREATE INDEX IF NOT EXISTS idx_surgeries_facility_date ON public.surgeries(facility_id, date);

-- 4.5 public.or_block_schedule (Preserves 247 Block Times)
ALTER TABLE public.or_block_schedule 
ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE;
UPDATE public.or_block_schedule SET facility_id = '00000000-0000-0000-0000-000000000002' WHERE facility_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_or_block_facility ON public.or_block_schedule(facility_id);

-- 4.6 public.ot_extra_cost (Preserves 4,189 Expense Rules)
ALTER TABLE public.ot_extra_cost 
ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE;
UPDATE public.ot_extra_cost SET facility_id = '00000000-0000-0000-0000-000000000002' WHERE facility_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_ot_extra_cost_facility ON public.ot_extra_cost(facility_id);

-- 4.7 public.staff (Preserves 18 Staff Roster Profiles)
ALTER TABLE public.staff 
ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE;
UPDATE public.staff SET facility_id = '00000000-0000-0000-0000-000000000002' WHERE facility_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_staff_facility ON public.staff(facility_id);

-- 4.8 public.chatbot_questions (Shared Clinical Knowledge Base: Facility ID Nullable)
ALTER TABLE public.chatbot_questions 
ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE;
-- Existing 30 questions remain with facility_id = NULL for global access
CREATE INDEX IF NOT EXISTS idx_chatbot_questions_facility ON public.chatbot_questions(facility_id);

-- 4.9 public.settings
ALTER TABLE public.settings 
ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE;
UPDATE public.settings SET facility_id = '00000000-0000-0000-0000-000000000002' WHERE facility_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_settings_facility ON public.settings(facility_id);

-- 4.10 Agent Telemetry & Context Tables (Safe Check If Ever Present)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'agent_runs') THEN
        ALTER TABLE public.agent_runs ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE;
        UPDATE public.agent_runs SET facility_id = '00000000-0000-0000-0000-000000000002' WHERE facility_id IS NULL;
        CREATE INDEX IF NOT EXISTS idx_agent_runs_facility ON public.agent_runs(facility_id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'agent_tasks') THEN
        ALTER TABLE public.agent_tasks ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE;
        UPDATE public.agent_tasks SET facility_id = '00000000-0000-0000-0000-000000000002' WHERE facility_id IS NULL;
        CREATE INDEX IF NOT EXISTS idx_agent_tasks_facility ON public.agent_tasks(facility_id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'agent_events') THEN
        ALTER TABLE public.agent_events ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE;
        UPDATE public.agent_events SET facility_id = '00000000-0000-0000-0000-000000000002' WHERE facility_id IS NULL;
        CREATE INDEX IF NOT EXISTS idx_agent_events_facility ON public.agent_events(facility_id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'agent_context') THEN
        ALTER TABLE public.agent_context ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE;
        UPDATE public.agent_context SET facility_id = '00000000-0000-0000-0000-000000000002' WHERE facility_id IS NULL;
        CREATE INDEX IF NOT EXISTS idx_agent_context_facility ON public.agent_context(facility_id);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'agent_approvals') THEN
        ALTER TABLE public.agent_approvals ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE;
        UPDATE public.agent_approvals SET facility_id = '00000000-0000-0000-0000-000000000002' WHERE facility_id IS NULL;
        CREATE INDEX IF NOT EXISTS idx_agent_approvals_facility ON public.agent_approvals(facility_id);
    END IF;
END $$;

-- ==============================================================================
-- 5. MEMBERSHIP SEEDING & ONBOARDING TRIGGER ON auth.users
-- ==============================================================================

-- 5.1 Seed Membership for existing admin if already present in auth.users (LEAST PRIVILEGE: PRIMARY FACILITY ONLY)
INSERT INTO public.facility_memberships (facility_id, user_id, role, is_active)
SELECT 
    '00000000-0000-0000-0000-000000000002'::UUID,
    u.id,
    'facility_admin',
    true
FROM auth.users u
WHERE u.email = 'admin@asc.com'
ON CONFLICT (facility_id, user_id) DO UPDATE SET is_active = true, role = 'facility_admin';

-- 5.2 Safe Idempotent Backfill for existing GoTrue Surgeons (Now s.facility_id exists)
INSERT INTO public.facility_memberships (facility_id, user_id, role, is_active)
SELECT DISTINCT s.facility_id, u.id, 'surgeon', true
FROM auth.users u
JOIN public.surgeons s ON LOWER(u.email) = LOWER(s.email)
WHERE s.facility_id IS NOT NULL
ON CONFLICT (facility_id, user_id) DO UPDATE SET is_active = true, role = 'surgeon';

-- 5.3 Automated Membership Onboarding Trigger on auth.users
-- Automatically assigns membership based on verified evidence:
-- - admin@asc.com -> Assigned only to primary facility (Naples Surgery Center)
-- - Surgeons -> Assigned dynamically to all facilities where they have a verified surgeon record
CREATE OR REPLACE FUNCTION public.handle_new_facility_user()
RETURNS TRIGGER AS $$
DECLARE
    v_surgeon_record RECORD;
BEGIN
    -- 1. Explicit Administrator Provisioning (Primary Facility Only)
    IF NEW.email = 'admin@asc.com' THEN
        INSERT INTO public.facility_memberships (facility_id, user_id, role, is_active)
        VALUES ('00000000-0000-0000-0000-000000000002'::UUID, NEW.id, 'facility_admin', true)
        ON CONFLICT (facility_id, user_id) DO UPDATE SET is_active = true, role = 'facility_admin';
    END IF;

    -- 2. Verified Surgeon Provisioning: Match email to existing surgeon records
    FOR v_surgeon_record IN
        SELECT DISTINCT facility_id 
        FROM public.surgeons 
        WHERE LOWER(email) = LOWER(NEW.email)
          AND facility_id IS NOT NULL
    LOOP
        INSERT INTO public.facility_memberships (facility_id, user_id, role, is_active)
        VALUES (v_surgeon_record.facility_id, NEW.id, 'surgeon', true)
        ON CONFLICT (facility_id, user_id) DO UPDATE SET is_active = true, role = 'surgeon';
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created_tenancy ON auth.users;
CREATE TRIGGER on_auth_user_created_tenancy
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_facility_user();

-- ==============================================================================
-- 6. POSTGRESQL ROW LEVEL SECURITY (RLS) HELPER FUNCTIONS & IMMUTABILITY TRIGGER
-- ==============================================================================

-- 6.1 Return set of facility IDs the authenticated user has active membership in
CREATE OR REPLACE FUNCTION public.get_auth_user_facilities()
RETURNS TABLE (facility_id UUID)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT fm.facility_id
    FROM public.facility_memberships fm
    WHERE fm.user_id = auth.uid()
      AND fm.is_active = TRUE;
$$;

-- 6.2 Return user's specific role for a facility
CREATE OR REPLACE FUNCTION public.get_auth_user_role(p_facility_id UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT fm.role
    FROM public.facility_memberships fm
    WHERE fm.user_id = auth.uid()
      AND fm.facility_id = p_facility_id
      AND fm.is_active = TRUE
    LIMIT 1;
$$;

-- 6.3 Boolean check if authenticated user possesses any of the specified roles
CREATE OR REPLACE FUNCTION public.user_has_facility_role(p_facility_id UUID, p_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.facility_memberships fm
        WHERE fm.user_id = auth.uid()
          AND fm.facility_id = p_facility_id
          AND fm.role = ANY(p_roles)
          AND fm.is_active = TRUE
    );
$$;

-- 6.4 Cross-Facility Relocation Prevention Trigger Function
-- Enforces that facility_id cannot be changed during UPDATE on clinical and operational tables
-- unless the authenticated user is an enterprise administrator (super_admin or org_admin).
CREATE OR REPLACE FUNCTION public.prevent_facility_relocation()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.facility_id IS DISTINCT FROM OLD.facility_id THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.facility_memberships fm
            WHERE fm.user_id = auth.uid()
              AND fm.facility_id = OLD.facility_id
              AND fm.role IN ('super_admin', 'org_admin')
              AND fm.is_active = TRUE
        ) THEN
            RAISE EXCEPTION 'Cross-facility relocation of records is forbidden. facility_id is immutable for non-enterprise administrators.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Attach Immutability Triggers to Operational Tables
DROP TRIGGER IF EXISTS trg_prevent_facility_relocation_surgeries ON public.surgeries;
CREATE TRIGGER trg_prevent_facility_relocation_surgeries
    BEFORE UPDATE ON public.surgeries
    FOR EACH ROW EXECUTE FUNCTION public.prevent_facility_relocation();

DROP TRIGGER IF EXISTS trg_prevent_facility_relocation_patients ON public.patients;
CREATE TRIGGER trg_prevent_facility_relocation_patients
    BEFORE UPDATE ON public.patients
    FOR EACH ROW EXECUTE FUNCTION public.prevent_facility_relocation();

DROP TRIGGER IF EXISTS trg_prevent_facility_relocation_surgeons ON public.surgeons;
CREATE TRIGGER trg_prevent_facility_relocation_surgeons
    BEFORE UPDATE ON public.surgeons
    FOR EACH ROW EXECUTE FUNCTION public.prevent_facility_relocation();

DROP TRIGGER IF EXISTS trg_prevent_facility_relocation_or_block ON public.or_block_schedule;
CREATE TRIGGER trg_prevent_facility_relocation_or_block
    BEFORE UPDATE ON public.or_block_schedule
    FOR EACH ROW EXECUTE FUNCTION public.prevent_facility_relocation();

DROP TRIGGER IF EXISTS trg_prevent_facility_relocation_ot_extra_cost ON public.ot_extra_cost;
CREATE TRIGGER trg_prevent_facility_relocation_ot_extra_cost
    BEFORE UPDATE ON public.ot_extra_cost
    FOR EACH ROW EXECUTE FUNCTION public.prevent_facility_relocation();

DROP TRIGGER IF EXISTS trg_prevent_facility_relocation_staff ON public.staff;
CREATE TRIGGER trg_prevent_facility_relocation_staff
    BEFORE UPDATE ON public.staff
    FOR EACH ROW EXECUTE FUNCTION public.prevent_facility_relocation();

DROP TRIGGER IF EXISTS trg_prevent_facility_relocation_settings ON public.settings;
CREATE TRIGGER trg_prevent_facility_relocation_settings
    BEFORE UPDATE ON public.settings
    FOR EACH ROW EXECUTE FUNCTION public.prevent_facility_relocation();

-- ==============================================================================
-- 7. DROP ALL OPEN ANONYMOUS POLICIES (FROM schema_setup & create_ot_extra_cost)
-- ==============================================================================

DROP POLICY IF EXISTS "Allow anon all on settings" ON public.settings;
DROP POLICY IF EXISTS "Allow anon all on surgeons" ON public.surgeons;
DROP POLICY IF EXISTS "Allow anon all on patients" ON public.patients;
DROP POLICY IF EXISTS "Allow anon all on cpt_codes" ON public.cpt_codes;
DROP POLICY IF EXISTS "Allow anon all on surgeries" ON public.surgeries;
DROP POLICY IF EXISTS "Allow anon all on or_block_schedule" ON public.or_block_schedule;
DROP POLICY IF EXISTS "Allow anon all on ot_extra_cost" ON public.ot_extra_cost;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.ot_extra_cost;
DROP POLICY IF EXISTS "Enable insert for all users" ON public.ot_extra_cost;
DROP POLICY IF EXISTS "Enable update for all users" ON public.ot_extra_cost;
DROP POLICY IF EXISTS "Allow anon all on staff" ON public.staff;
DROP POLICY IF EXISTS "Allow anon all on chatbot_questions" ON public.chatbot_questions;
DROP POLICY IF EXISTS "Allow anon all on users" ON public.users;
DROP POLICY IF EXISTS "Allow read users for transitional auth" ON public.users;

-- Drop previous agent table open policies if present
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow anon all on agent_runs') THEN
        DROP POLICY "Allow anon all on agent_runs" ON public.agent_runs;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow anon all on agent_tasks') THEN
        DROP POLICY "Allow anon all on agent_tasks" ON public.agent_tasks;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow anon all on agent_events') THEN
        DROP POLICY "Allow anon all on agent_events" ON public.agent_events;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow anon all on agent_context') THEN
        DROP POLICY "Allow anon all on agent_context" ON public.agent_context;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow anon all on agent_approvals') THEN
        DROP POLICY "Allow anon all on agent_approvals" ON public.agent_approvals;
    END IF;
END $$;

-- ==============================================================================
-- 8. EXPLICITLY ENABLE ROW LEVEL SECURITY ON EVERY TABLE (DEFENSE-IN-DEPTH)
-- ==============================================================================

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facility_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.surgeries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.surgeons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cpt_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.or_block_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ot_extra_cost ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatbot_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'agent_runs') THEN
        ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'agent_tasks') THEN
        ALTER TABLE public.agent_tasks ENABLE ROW LEVEL SECURITY;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'agent_events') THEN
        ALTER TABLE public.agent_events ENABLE ROW LEVEL SECURITY;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'agent_context') THEN
        ALTER TABLE public.agent_context ENABLE ROW LEVEL SECURITY;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'agent_approvals') THEN
        ALTER TABLE public.agent_approvals ENABLE ROW LEVEL SECURITY;
    END IF;
END $$;

-- ==============================================================================
-- 9. DEPLOY STRICT, ROLE-AWARE ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

-- 9.1 Organizations
DROP POLICY IF EXISTS "Auth Users Can View Their Organizations" ON public.organizations;
CREATE POLICY "Auth Users Can View Their Organizations"
ON public.organizations
FOR SELECT
TO authenticated
USING (
    id IN (
        SELECT f.organization_id 
        FROM public.facilities f 
        WHERE f.id IN (SELECT get_auth_user_facilities())
    )
);

-- 9.2 Facilities
DROP POLICY IF EXISTS "Auth Users Can View Their Facilities" ON public.facilities;
CREATE POLICY "Auth Users Can View Their Facilities"
ON public.facilities
FOR SELECT
TO authenticated
USING (
    id IN (SELECT get_auth_user_facilities())
);

DROP POLICY IF EXISTS "Facility Admin Can Update Facility Settings" ON public.facilities;
CREATE POLICY "Facility Admin Can Update Facility Settings"
ON public.facilities
FOR UPDATE
TO authenticated
USING (
    user_has_facility_role(id, ARRAY['super_admin', 'org_admin', 'facility_admin'])
)
WITH CHECK (
    user_has_facility_role(id, ARRAY['super_admin', 'org_admin', 'facility_admin'])
);

-- 9.3 Facility Memberships
DROP POLICY IF EXISTS "Users Can View Their Own Memberships" ON public.facility_memberships;
CREATE POLICY "Users Can View Their Own Memberships"
ON public.facility_memberships
FOR SELECT
TO authenticated
USING (
    user_id = auth.uid() OR
    user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin'])
);

DROP POLICY IF EXISTS "Facility Admin Can Manage Memberships" ON public.facility_memberships;
CREATE POLICY "Facility Admin Can Manage Memberships"
ON public.facility_memberships
FOR ALL
TO authenticated
USING (
    user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin'])
)
WITH CHECK (
    user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin'])
);

-- 9.4 Surgeries: Strict Tenant Scoping with Role-Aware CRUD & Delete Protection
DROP POLICY IF EXISTS "Tenant Scoped Surgeries Read" ON public.surgeries;
CREATE POLICY "Tenant Scoped Surgeries Read"
ON public.surgeries
FOR SELECT
TO authenticated
USING (
    facility_id IN (SELECT get_auth_user_facilities())
);

DROP POLICY IF EXISTS "Tenant Scoped Surgeries Insert" ON public.surgeries;
CREATE POLICY "Tenant Scoped Surgeries Insert"
ON public.surgeries
FOR INSERT
TO authenticated
WITH CHECK (
    facility_id IN (SELECT get_auth_user_facilities())
    AND user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'clinical_manager', 'clinical_director', 'scheduler', 'surgeon', 'biller', 'billing_rcm'])
);

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

DROP POLICY IF EXISTS "Tenant Scoped Surgeries Delete" ON public.surgeries;
CREATE POLICY "Tenant Scoped Surgeries Delete"
ON public.surgeries
FOR DELETE
TO authenticated
USING (
    facility_id IN (SELECT get_auth_user_facilities())
    AND user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin'])
);

-- 9.5 Patients: Role-Aware CRUD (Prevents unauthorized modification or deletion)
DROP POLICY IF EXISTS "Tenant Scoped Patients Access" ON public.patients;
DROP POLICY IF EXISTS "Tenant Scoped Patients Read" ON public.patients;
CREATE POLICY "Tenant Scoped Patients Read"
ON public.patients
FOR SELECT
TO authenticated
USING (
    facility_id IN (SELECT get_auth_user_facilities())
);

DROP POLICY IF EXISTS "Tenant Scoped Patients Insert" ON public.patients;
CREATE POLICY "Tenant Scoped Patients Insert"
ON public.patients
FOR INSERT
TO authenticated
WITH CHECK (
    facility_id IN (SELECT get_auth_user_facilities())
    AND user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'clinical_manager', 'clinical_director', 'scheduler', 'biller', 'billing_rcm'])
);

DROP POLICY IF EXISTS "Tenant Scoped Patients Update" ON public.patients;
CREATE POLICY "Tenant Scoped Patients Update"
ON public.patients
FOR UPDATE
TO authenticated
USING (
    facility_id IN (SELECT get_auth_user_facilities())
    AND user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'clinical_manager', 'clinical_director', 'scheduler', 'biller', 'billing_rcm'])
)
WITH CHECK (
    facility_id IN (SELECT get_auth_user_facilities())
    AND user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'clinical_manager', 'clinical_director', 'scheduler', 'biller', 'billing_rcm'])
);

DROP POLICY IF EXISTS "Tenant Scoped Patients Delete" ON public.patients;
CREATE POLICY "Tenant Scoped Patients Delete"
ON public.patients
FOR DELETE
TO authenticated
USING (
    facility_id IN (SELECT get_auth_user_facilities())
    AND user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin'])
);

-- 9.6 Surgeons: Role-Aware Management
DROP POLICY IF EXISTS "Tenant Scoped Surgeons Access" ON public.surgeons;
DROP POLICY IF EXISTS "Tenant Scoped Surgeons Read" ON public.surgeons;
CREATE POLICY "Tenant Scoped Surgeons Read"
ON public.surgeons
FOR SELECT
TO authenticated
USING (
    facility_id IN (SELECT get_auth_user_facilities())
);

DROP POLICY IF EXISTS "Tenant Scoped Surgeons Insert" ON public.surgeons;
CREATE POLICY "Tenant Scoped Surgeons Insert"
ON public.surgeons
FOR INSERT
TO authenticated
WITH CHECK (
    facility_id IN (SELECT get_auth_user_facilities())
    AND user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin'])
);

DROP POLICY IF EXISTS "Tenant Scoped Surgeons Update" ON public.surgeons;
CREATE POLICY "Tenant Scoped Surgeons Update"
ON public.surgeons
FOR UPDATE
TO authenticated
USING (
    facility_id IN (SELECT get_auth_user_facilities())
    AND user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'clinical_manager', 'clinical_director'])
)
WITH CHECK (
    facility_id IN (SELECT get_auth_user_facilities())
    AND user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'clinical_manager', 'clinical_director'])
);

DROP POLICY IF EXISTS "Tenant Scoped Surgeons Delete" ON public.surgeons;
CREATE POLICY "Tenant Scoped Surgeons Delete"
ON public.surgeons
FOR DELETE
TO authenticated
USING (
    facility_id IN (SELECT get_auth_user_facilities())
    AND user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin'])
);

-- 9.7 CPT Codes: Shared Standard Catalog + Tenant-Specific Custom Codes
DROP POLICY IF EXISTS "Shared And Tenant Scoped CPT Codes Read" ON public.cpt_codes;
CREATE POLICY "Shared And Tenant Scoped CPT Codes Read"
ON public.cpt_codes
FOR SELECT
TO authenticated
USING (
    facility_id IS NULL OR facility_id IN (SELECT get_auth_user_facilities())
);

DROP POLICY IF EXISTS "Facility Staff Can Manage CPT Codes" ON public.cpt_codes;
DROP POLICY IF EXISTS "Facility Admin Can Manage CPT Codes" ON public.cpt_codes;
CREATE POLICY "Facility Staff Can Manage CPT Codes"
ON public.cpt_codes
FOR ALL
TO authenticated
USING (
    facility_id IN (SELECT get_auth_user_facilities())
    AND user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'biller', 'billing_rcm', 'coder'])
)
WITH CHECK (
    facility_id IN (SELECT get_auth_user_facilities())
    AND user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'biller', 'billing_rcm', 'coder'])
);

-- 9.8 OR Block Schedule: Role-Aware Scheduling
DROP POLICY IF EXISTS "Tenant Scoped Block Schedule Access" ON public.or_block_schedule;
DROP POLICY IF EXISTS "Tenant Scoped Block Schedule Read" ON public.or_block_schedule;
CREATE POLICY "Tenant Scoped Block Schedule Read"
ON public.or_block_schedule
FOR SELECT
TO authenticated
USING (
    facility_id IN (SELECT get_auth_user_facilities())
);

DROP POLICY IF EXISTS "Tenant Scoped Block Schedule Manage" ON public.or_block_schedule;
CREATE POLICY "Tenant Scoped Block Schedule Manage"
ON public.or_block_schedule
FOR ALL
TO authenticated
USING (
    facility_id IN (SELECT get_auth_user_facilities())
    AND user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'clinical_manager', 'clinical_director', 'scheduler'])
)
WITH CHECK (
    facility_id IN (SELECT get_auth_user_facilities())
    AND user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'clinical_manager', 'clinical_director', 'scheduler'])
);

-- 9.9 OT Extra Cost: Financial & Expense Scoping (CFO / Billing Restricted)
DROP POLICY IF EXISTS "Tenant Scoped Extra Costs Access" ON public.ot_extra_cost;
DROP POLICY IF EXISTS "Tenant Scoped Extra Costs Read" ON public.ot_extra_cost;
CREATE POLICY "Tenant Scoped Extra Costs Read"
ON public.ot_extra_cost
FOR SELECT
TO authenticated
USING (
    facility_id IN (SELECT get_auth_user_facilities())
);

DROP POLICY IF EXISTS "Tenant Scoped Extra Costs Manage" ON public.ot_extra_cost;
CREATE POLICY "Tenant Scoped Extra Costs Manage"
ON public.ot_extra_cost
FOR ALL
TO authenticated
USING (
    facility_id IN (SELECT get_auth_user_facilities())
    AND user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'cfo', 'finance', 'biller', 'billing_rcm'])
)
WITH CHECK (
    facility_id IN (SELECT get_auth_user_facilities())
    AND user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'cfo', 'finance', 'biller', 'billing_rcm'])
);

-- 9.10 Staff: Clinical Roster Management
DROP POLICY IF EXISTS "Tenant Scoped Staff Access" ON public.staff;
DROP POLICY IF EXISTS "Tenant Scoped Staff Read" ON public.staff;
CREATE POLICY "Tenant Scoped Staff Read"
ON public.staff
FOR SELECT
TO authenticated
USING (
    facility_id IN (SELECT get_auth_user_facilities())
);

DROP POLICY IF EXISTS "Tenant Scoped Staff Manage" ON public.staff;
CREATE POLICY "Tenant Scoped Staff Manage"
ON public.staff
FOR ALL
TO authenticated
USING (
    facility_id IN (SELECT get_auth_user_facilities())
    AND user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'clinical_manager', 'clinical_director'])
)
WITH CHECK (
    facility_id IN (SELECT get_auth_user_facilities())
    AND user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'clinical_manager', 'clinical_director'])
);

-- 9.11 Chatbot Questions: Shared Knowledge Base + Tenant Custom Questions
DROP POLICY IF EXISTS "Shared And Tenant Scoped Chatbot Questions Read" ON public.chatbot_questions;
CREATE POLICY "Shared And Tenant Scoped Chatbot Questions Read"
ON public.chatbot_questions
FOR SELECT
TO authenticated
USING (
    facility_id IS NULL OR facility_id IN (SELECT get_auth_user_facilities())
);

DROP POLICY IF EXISTS "Facility Admin Can Manage Chatbot Questions" ON public.chatbot_questions;
CREATE POLICY "Facility Admin Can Manage Chatbot Questions"
ON public.chatbot_questions
FOR ALL
TO authenticated
USING (
    facility_id IN (SELECT get_auth_user_facilities())
    AND user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin'])
)
WITH CHECK (
    facility_id IN (SELECT get_auth_user_facilities())
    AND user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin'])
);

-- 9.12 Settings: Facility Configuration (Admin Only)
DROP POLICY IF EXISTS "Tenant Scoped Settings Access" ON public.settings;
DROP POLICY IF EXISTS "Tenant Scoped Settings Read" ON public.settings;
CREATE POLICY "Tenant Scoped Settings Read"
ON public.settings
FOR SELECT
TO authenticated
USING (
    facility_id IN (SELECT get_auth_user_facilities())
);

DROP POLICY IF EXISTS "Tenant Scoped Settings Manage" ON public.settings;
CREATE POLICY "Tenant Scoped Settings Manage"
ON public.settings
FOR ALL
TO authenticated
USING (
    facility_id IN (SELECT get_auth_user_facilities())
    AND user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin'])
)
WITH CHECK (
    facility_id IN (SELECT get_auth_user_facilities())
    AND user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin'])
);

-- 9.13 Legacy Users Table: Column-Level Privilege Hardening & Credential Protection
-- Plaintext passwords are NEVER readable over the Supabase REST API.
REVOKE ALL ON public.users FROM anon, authenticated;
GRANT SELECT (id, name, email, role, avatar, created_at, updated_at) ON public.users TO authenticated;

DROP POLICY IF EXISTS "Auth Users Can View User Profiles" ON public.users;
CREATE POLICY "Auth Users Can View User Profiles"
ON public.users
FOR SELECT
TO authenticated
USING (true);

-- 9.14 Agent Telemetry & Workflow Execution Tables (Conditional RLS Policies)
DO $$
BEGIN
    -- agent_runs
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'agent_runs') THEN
        DROP POLICY IF EXISTS "Tenant Scoped Agent Runs Read" ON public.agent_runs;
        CREATE POLICY "Tenant Scoped Agent Runs Read" ON public.agent_runs
            FOR SELECT TO authenticated USING (facility_id IN (SELECT get_auth_user_facilities()));
        
        DROP POLICY IF EXISTS "Tenant Scoped Agent Runs Manage" ON public.agent_runs;
        CREATE POLICY "Tenant Scoped Agent Runs Manage" ON public.agent_runs
            FOR ALL TO authenticated
            USING (facility_id IN (SELECT get_auth_user_facilities()) AND user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'clinical_manager', 'clinical_director']))
            WITH CHECK (facility_id IN (SELECT get_auth_user_facilities()) AND user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'clinical_manager', 'clinical_director']));
    END IF;

    -- agent_tasks
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'agent_tasks') THEN
        DROP POLICY IF EXISTS "Tenant Scoped Agent Tasks Read" ON public.agent_tasks;
        CREATE POLICY "Tenant Scoped Agent Tasks Read" ON public.agent_tasks
            FOR SELECT TO authenticated USING (facility_id IN (SELECT get_auth_user_facilities()));
        
        DROP POLICY IF EXISTS "Tenant Scoped Agent Tasks Manage" ON public.agent_tasks;
        CREATE POLICY "Tenant Scoped Agent Tasks Manage" ON public.agent_tasks
            FOR ALL TO authenticated
            USING (facility_id IN (SELECT get_auth_user_facilities()) AND user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'clinical_manager', 'clinical_director']))
            WITH CHECK (facility_id IN (SELECT get_auth_user_facilities()) AND user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'clinical_manager', 'clinical_director']));
    END IF;

    -- agent_events
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'agent_events') THEN
        DROP POLICY IF EXISTS "Tenant Scoped Agent Events Read" ON public.agent_events;
        CREATE POLICY "Tenant Scoped Agent Events Read" ON public.agent_events
            FOR SELECT TO authenticated USING (facility_id IN (SELECT get_auth_user_facilities()));
        
        DROP POLICY IF EXISTS "Tenant Scoped Agent Events Manage" ON public.agent_events;
        CREATE POLICY "Tenant Scoped Agent Events Manage" ON public.agent_events
            FOR ALL TO authenticated
            USING (facility_id IN (SELECT get_auth_user_facilities()) AND user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'clinical_manager', 'clinical_director']))
            WITH CHECK (facility_id IN (SELECT get_auth_user_facilities()) AND user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'clinical_manager', 'clinical_director']));
    END IF;

    -- agent_context
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'agent_context') THEN
        DROP POLICY IF EXISTS "Tenant Scoped Agent Context Read" ON public.agent_context;
        CREATE POLICY "Tenant Scoped Agent Context Read" ON public.agent_context
            FOR SELECT TO authenticated USING (facility_id IN (SELECT get_auth_user_facilities()));
        
        DROP POLICY IF EXISTS "Tenant Scoped Agent Context Manage" ON public.agent_context;
        CREATE POLICY "Tenant Scoped Agent Context Manage" ON public.agent_context
            FOR ALL TO authenticated
            USING (facility_id IN (SELECT get_auth_user_facilities()) AND user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'clinical_manager', 'clinical_director']))
            WITH CHECK (facility_id IN (SELECT get_auth_user_facilities()) AND user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'clinical_manager', 'clinical_director']));
    END IF;

    -- agent_approvals
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'agent_approvals') THEN
        DROP POLICY IF EXISTS "Tenant Scoped Agent Approvals Read" ON public.agent_approvals;
        CREATE POLICY "Tenant Scoped Agent Approvals Read" ON public.agent_approvals
            FOR SELECT TO authenticated USING (facility_id IN (SELECT get_auth_user_facilities()));
        
        DROP POLICY IF EXISTS "Tenant Scoped Agent Approvals Manage" ON public.agent_approvals;
        CREATE POLICY "Tenant Scoped Agent Approvals Manage" ON public.agent_approvals
            FOR ALL TO authenticated
            USING (facility_id IN (SELECT get_auth_user_facilities()) AND user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'clinical_manager', 'clinical_director']))
            WITH CHECK (facility_id IN (SELECT get_auth_user_facilities()) AND user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'clinical_manager', 'clinical_director']));
    END IF;
END $$;

COMMIT;
