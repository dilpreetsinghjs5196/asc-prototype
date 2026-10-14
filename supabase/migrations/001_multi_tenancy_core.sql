-- ==============================================================================
-- MIGRATION: 001_multi_tenancy_core.sql
-- DESCRIPTION: Core Multi-Tenancy (Organizations, Facilities, Memberships),
--              Tenant FKs on all tables, RLS helper functions, and Drop of Anonymous Policies.
-- AUTHOR: ASCANALYST Architecture Team
-- DATE: 2026-10-14
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
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.2 Facilities (Physical Surgery Centers / HOPDs)
CREATE TABLE IF NOT EXISTS public.facilities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    license_number TEXT,
    timezone TEXT DEFAULT 'America/New_York',
    address TEXT,
    city TEXT,
    state TEXT,
    zip TEXT,
    phone TEXT,
    tax_id TEXT,
    npi TEXT,
    apply_medicare_mppr BOOLEAN DEFAULT false,
    settings JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookup by organization
CREATE INDEX IF NOT EXISTS idx_facilities_org_id ON public.facilities(organization_id);

-- 2.3 Facility Memberships (RBAC linking auth.users to Facilities)
CREATE TABLE IF NOT EXISTS public.facility_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (
        role IN (
            'super_admin',
            'org_admin',
            'facility_admin',
            'clinical_director',
            'biller',
            'surgeon',
            'viewer'
        )
    ),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_facility_user_membership UNIQUE (facility_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_memberships_user ON public.facility_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_facility ON public.facility_memberships(facility_id);

-- ==============================================================================
-- 3. SEED DEFAULT INITIAL TENANT & FACILITY
-- ==============================================================================

-- Default Organization: Naples Health Network
INSERT INTO public.organizations (id, name, tax_id)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Naples Health Network',
    '59-9876543'
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    updated_at = NOW();

-- Primary Default Facility: Naples Surgery Center
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

-- Secondary Facility (for Multi-Facility Network Testing & Tenant Isolation)
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
-- 4. BIND EXISTING OPERATIONAL TABLES TO FACILITY TENANCY
-- ==============================================================================

-- 4.1 public.surgeons
ALTER TABLE public.surgeons 
ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE;
UPDATE public.surgeons SET facility_id = '00000000-0000-0000-0000-000000000002' WHERE facility_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_surgeons_facility ON public.surgeons(facility_id);

-- 4.2 public.patients
ALTER TABLE public.patients 
ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE;
UPDATE public.patients SET facility_id = '00000000-0000-0000-0000-000000000002' WHERE facility_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_patients_facility ON public.patients(facility_id);

-- 4.3 public.cpt_codes
ALTER TABLE public.cpt_codes 
ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE;
UPDATE public.cpt_codes SET facility_id = '00000000-0000-0000-0000-000000000002' WHERE facility_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_cpt_codes_facility ON public.cpt_codes(facility_id);

-- 4.4 public.surgeries
ALTER TABLE public.surgeries 
ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE;
UPDATE public.surgeries SET facility_id = '00000000-0000-0000-0000-000000000002' WHERE facility_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_surgeries_facility ON public.surgeries(facility_id);
CREATE INDEX IF NOT EXISTS idx_surgeries_facility_date ON public.surgeries(facility_id, date);

-- 4.5 public.or_block_schedule
ALTER TABLE public.or_block_schedule 
ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE;
UPDATE public.or_block_schedule SET facility_id = '00000000-0000-0000-0000-000000000002' WHERE facility_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_or_block_facility ON public.or_block_schedule(facility_id);

-- 4.6 public.ot_extra_cost
ALTER TABLE public.ot_extra_cost 
ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE;
UPDATE public.ot_extra_cost SET facility_id = '00000000-0000-0000-0000-000000000002' WHERE facility_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_ot_extra_cost_facility ON public.ot_extra_cost(facility_id);

-- 4.7 public.staff
ALTER TABLE public.staff 
ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE;
UPDATE public.staff SET facility_id = '00000000-0000-0000-0000-000000000002' WHERE facility_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_staff_facility ON public.staff(facility_id);

-- 4.8 public.chatbot_questions
ALTER TABLE public.chatbot_questions 
ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE;
UPDATE public.chatbot_questions SET facility_id = '00000000-0000-0000-0000-000000000002' WHERE facility_id IS NULL;

-- 4.9 public.settings
ALTER TABLE public.settings 
ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE;
UPDATE public.settings SET facility_id = '00000000-0000-0000-0000-000000000002' WHERE facility_id IS NULL;

-- 4.10 Agent telemetry & context tables (if existing)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'agent_runs') THEN
        ALTER TABLE public.agent_runs ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE;
        UPDATE public.agent_runs SET facility_id = '00000000-0000-0000-0000-000000000002' WHERE facility_id IS NULL;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'agent_tasks') THEN
        ALTER TABLE public.agent_tasks ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE;
        UPDATE public.agent_tasks SET facility_id = '00000000-0000-0000-0000-000000000002' WHERE facility_id IS NULL;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'agent_events') THEN
        ALTER TABLE public.agent_events ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE;
        UPDATE public.agent_events SET facility_id = '00000000-0000-0000-0000-000000000002' WHERE facility_id IS NULL;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'agent_context') THEN
        ALTER TABLE public.agent_context ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE;
        UPDATE public.agent_context SET facility_id = '00000000-0000-0000-0000-000000000002' WHERE facility_id IS NULL;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'agent_approvals') THEN
        ALTER TABLE public.agent_approvals ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE;
        UPDATE public.agent_approvals SET facility_id = '00000000-0000-0000-0000-000000000002' WHERE facility_id IS NULL;
    END IF;
END $$;

-- ==============================================================================
-- 5. POSTGRESQL ROW LEVEL SECURITY (RLS) HELPER FUNCTIONS
-- ==============================================================================

-- 5.1 Return set of facility IDs the authenticated user has active membership in
CREATE OR REPLACE FUNCTION public.get_auth_user_facilities()
RETURNS TABLE (facility_id UUID)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT fm.facility_id
    FROM public.facility_memberships fm
    WHERE fm.user_id = auth.uid()
      AND fm.is_active = TRUE;
$$;

-- 5.2 Return user's specific role for a facility
CREATE OR REPLACE FUNCTION public.get_auth_user_role(p_facility_id UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT fm.role
    FROM public.facility_memberships fm
    WHERE fm.user_id = auth.uid()
      AND fm.facility_id = p_facility_id
      AND fm.is_active = TRUE
    LIMIT 1;
$$;

-- 5.3 Boolean check if authenticated user possesses any of the specified roles
CREATE OR REPLACE FUNCTION public.user_has_facility_role(p_facility_id UUID, p_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
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

-- ==============================================================================
-- 6. DROP ALL 15 WIDE-OPEN ANONYMOUS POLICIES
-- ==============================================================================

DROP POLICY IF EXISTS "Allow anon all on settings" ON public.settings;
DROP POLICY IF EXISTS "Allow anon all on surgeons" ON public.surgeons;
DROP POLICY IF EXISTS "Allow anon all on patients" ON public.patients;
DROP POLICY IF EXISTS "Allow anon all on cpt_codes" ON public.cpt_codes;
DROP POLICY IF EXISTS "Allow anon all on surgeries" ON public.surgeries;
DROP POLICY IF EXISTS "Allow anon all on or_block_schedule" ON public.or_block_schedule;
DROP POLICY IF EXISTS "Allow anon all on ot_extra_cost" ON public.ot_extra_cost;
DROP POLICY IF EXISTS "Allow anon all on staff" ON public.staff;
DROP POLICY IF EXISTS "Allow anon all on chatbot_questions" ON public.chatbot_questions;
DROP POLICY IF EXISTS "Allow anon all on users" ON public.users;

-- Drop any previous agent table anonymous policies
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
-- 7. DEPLOY STRICT ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

-- Enable RLS on newly created multi-tenancy tables
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facility_memberships ENABLE ROW LEVEL SECURITY;

-- 7.1 Organizations: Authenticated users can view organizations of facilities they belong to
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

-- 7.2 Facilities: Authenticated users can view facilities they belong to
CREATE POLICY "Auth Users Can View Their Facilities"
ON public.facilities
FOR SELECT
TO authenticated
USING (
    id IN (SELECT get_auth_user_facilities())
);

-- Facility Admin can update facility configuration
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

-- 7.3 Facility Memberships: Users can view their own memberships
CREATE POLICY "Users Can View Their Own Memberships"
ON public.facility_memberships
FOR SELECT
TO authenticated
USING (
    user_id = auth.uid() OR
    user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin'])
);

-- Facility Admins can manage memberships
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

-- 7.4 Surgeries (Strict Tenant Scoping)
CREATE POLICY "Tenant Scoped Surgeries Access"
ON public.surgeries
FOR ALL
TO authenticated
USING (
    facility_id IN (SELECT get_auth_user_facilities())
)
WITH CHECK (
    facility_id IN (SELECT get_auth_user_facilities())
);

-- 7.5 Patients (Strict Tenant Scoping)
CREATE POLICY "Tenant Scoped Patients Access"
ON public.patients
FOR ALL
TO authenticated
USING (
    facility_id IN (SELECT get_auth_user_facilities())
)
WITH CHECK (
    facility_id IN (SELECT get_auth_user_facilities())
);

-- 7.6 Surgeons (Strict Tenant Scoping)
CREATE POLICY "Tenant Scoped Surgeons Access"
ON public.surgeons
FOR ALL
TO authenticated
USING (
    facility_id IN (SELECT get_auth_user_facilities())
)
WITH CHECK (
    facility_id IN (SELECT get_auth_user_facilities())
);

-- 7.7 CPT Codes (Strict Tenant Scoping)
CREATE POLICY "Tenant Scoped CPT Codes Access"
ON public.cpt_codes
FOR ALL
TO authenticated
USING (
    facility_id IN (SELECT get_auth_user_facilities())
)
WITH CHECK (
    facility_id IN (SELECT get_auth_user_facilities())
);

-- 7.8 OR Block Schedule (Strict Tenant Scoping)
CREATE POLICY "Tenant Scoped Block Schedule Access"
ON public.or_block_schedule
FOR ALL
TO authenticated
USING (
    facility_id IN (SELECT get_auth_user_facilities())
)
WITH CHECK (
    facility_id IN (SELECT get_auth_user_facilities())
);

-- 7.9 OT Extra Cost (Strict Tenant Scoping)
CREATE POLICY "Tenant Scoped Extra Costs Access"
ON public.ot_extra_cost
FOR ALL
TO authenticated
USING (
    facility_id IN (SELECT get_auth_user_facilities())
)
WITH CHECK (
    facility_id IN (SELECT get_auth_user_facilities())
);

-- 7.10 Staff (Strict Tenant Scoping)
CREATE POLICY "Tenant Scoped Staff Access"
ON public.staff
FOR ALL
TO authenticated
USING (
    facility_id IN (SELECT get_auth_user_facilities())
)
WITH CHECK (
    facility_id IN (SELECT get_auth_user_facilities())
);

-- 7.11 Chatbot Questions (Tenant Scoped or System Global if facility_id is null)
CREATE POLICY "Tenant Scoped Chatbot Questions Access"
ON public.chatbot_questions
FOR ALL
TO authenticated
USING (
    facility_id IS NULL OR facility_id IN (SELECT get_auth_user_facilities())
)
WITH CHECK (
    facility_id IN (SELECT get_auth_user_facilities())
);

-- 7.12 Settings (Strict Tenant Scoping)
CREATE POLICY "Tenant Scoped Settings Access"
ON public.settings
FOR ALL
TO authenticated
USING (
    facility_id IN (SELECT get_auth_user_facilities())
)
WITH CHECK (
    facility_id IN (SELECT get_auth_user_facilities())
);

COMMIT;
