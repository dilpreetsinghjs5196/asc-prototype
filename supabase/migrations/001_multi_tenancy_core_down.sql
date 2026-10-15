-- ==============================================================================
-- ROLLBACK MIGRATION: 001_multi_tenancy_core_down.sql (SECURE & HARDENED)
-- TARGET: Reverses 001_multi_tenancy_core.sql cleanly while preventing open data exposure.
--
-- ⚠️ DESTRUCTIVE ROLLBACK WARNING & DATA RETENTION CONSEQUENCES:
-- 1. DROP COLUMN facility_id: All facility-specific tenant assignments on operational
--    records (surgeries, patients, surgeons, block schedule, extra costs, staff, settings)
--    will be permanently dropped. Data collected in multiple facilities will collapse
--    into a single un-partitioned namespace.
-- 2. CASCADE DROP ON TENANCY HIERARCHY: public.organizations, public.facilities, and
--    public.facility_memberships will be dropped with CASCADE, removing all RBAC links.
-- 3. OPERATIONAL RECORD RETENTION: Raw table data (clinical cases, patient demographics,
--    CPT catalogs) is NOT dropped, but tenancy metadata is irreversibly lost.
-- 4. NO UNRESTRICTED ANONYMOUS ACCESS: Unlike the prototype development rollback,
--    this down migration NEVER restores wide-open anonymous access (anon USING true).
--    It enforces an authenticated-only baseline (fail-closed for anonymous visitors).
-- ==============================================================================

BEGIN;

-- 1. Drop Onboarding and Relocation Prevention Triggers & Functions
DROP TRIGGER IF EXISTS on_auth_user_created_tenancy ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_facility_user();

DROP TRIGGER IF EXISTS trg_prevent_facility_relocation_surgeries ON public.surgeries;
DROP TRIGGER IF EXISTS trg_prevent_facility_relocation_patients ON public.patients;
DROP TRIGGER IF EXISTS trg_prevent_facility_relocation_surgeons ON public.surgeons;
DROP TRIGGER IF EXISTS trg_prevent_facility_relocation_or_block ON public.or_block_schedule;
DROP TRIGGER IF EXISTS trg_prevent_facility_relocation_ot_extra_cost ON public.ot_extra_cost;
DROP TRIGGER IF EXISTS trg_prevent_facility_relocation_staff ON public.staff;
DROP TRIGGER IF EXISTS trg_prevent_facility_relocation_settings ON public.settings;
DROP FUNCTION IF EXISTS public.prevent_facility_relocation();

-- 2. Drop Tenant-Scoped RLS Policies
DROP POLICY IF EXISTS "Tenant Scoped Settings Manage" ON public.settings;
DROP POLICY IF EXISTS "Tenant Scoped Settings Read" ON public.settings;
DROP POLICY IF EXISTS "Tenant Scoped Settings Access" ON public.settings;

DROP POLICY IF EXISTS "Facility Admin Can Manage Chatbot Questions" ON public.chatbot_questions;
DROP POLICY IF EXISTS "Shared And Tenant Scoped Chatbot Questions Read" ON public.chatbot_questions;
DROP POLICY IF EXISTS "Tenant Scoped Chatbot Questions Access" ON public.chatbot_questions;

DROP POLICY IF EXISTS "Tenant Scoped Staff Manage" ON public.staff;
DROP POLICY IF EXISTS "Tenant Scoped Staff Read" ON public.staff;
DROP POLICY IF EXISTS "Tenant Scoped Staff Access" ON public.staff;

DROP POLICY IF EXISTS "Tenant Scoped Extra Costs Manage" ON public.ot_extra_cost;
DROP POLICY IF EXISTS "Tenant Scoped Extra Costs Read" ON public.ot_extra_cost;
DROP POLICY IF EXISTS "Tenant Scoped Extra Costs Access" ON public.ot_extra_cost;

DROP POLICY IF EXISTS "Tenant Scoped Block Schedule Manage" ON public.or_block_schedule;
DROP POLICY IF EXISTS "Tenant Scoped Block Schedule Read" ON public.or_block_schedule;
DROP POLICY IF EXISTS "Tenant Scoped Block Schedule Access" ON public.or_block_schedule;

DROP POLICY IF EXISTS "Facility Staff Can Manage CPT Codes" ON public.cpt_codes;
DROP POLICY IF EXISTS "Facility Admin Can Manage CPT Codes" ON public.cpt_codes;
DROP POLICY IF EXISTS "Shared And Tenant Scoped CPT Codes Read" ON public.cpt_codes;
DROP POLICY IF EXISTS "Tenant Scoped CPT Codes Access" ON public.cpt_codes;

DROP POLICY IF EXISTS "Tenant Scoped Surgeons Delete" ON public.surgeons;
DROP POLICY IF EXISTS "Tenant Scoped Surgeons Update" ON public.surgeons;
DROP POLICY IF EXISTS "Tenant Scoped Surgeons Insert" ON public.surgeons;
DROP POLICY IF EXISTS "Tenant Scoped Surgeons Read" ON public.surgeons;
DROP POLICY IF EXISTS "Tenant Scoped Surgeons Access" ON public.surgeons;

DROP POLICY IF EXISTS "Tenant Scoped Patients Delete" ON public.patients;
DROP POLICY IF EXISTS "Tenant Scoped Patients Update" ON public.patients;
DROP POLICY IF EXISTS "Tenant Scoped Patients Insert" ON public.patients;
DROP POLICY IF EXISTS "Tenant Scoped Patients Read" ON public.patients;
DROP POLICY IF EXISTS "Tenant Scoped Patients Access" ON public.patients;

DROP POLICY IF EXISTS "Tenant Scoped Surgeries Delete" ON public.surgeries;
DROP POLICY IF EXISTS "Tenant Scoped Surgeries Update" ON public.surgeries;
DROP POLICY IF EXISTS "Tenant Scoped Surgeries Insert" ON public.surgeries;
DROP POLICY IF EXISTS "Tenant Scoped Surgeries Read" ON public.surgeries;
DROP POLICY IF EXISTS "Tenant Scoped Surgeries Access" ON public.surgeries;

DROP POLICY IF EXISTS "Auth Users Can View User Profiles" ON public.users;
DROP POLICY IF EXISTS "Allow read users for transitional auth" ON public.users;

DROP POLICY IF EXISTS "Facility Admin Can Manage Memberships" ON public.facility_memberships;
DROP POLICY IF EXISTS "Users Can View Their Own Memberships" ON public.facility_memberships;
DROP POLICY IF EXISTS "Facility Admin Can Update Facility Settings" ON public.facilities;
DROP POLICY IF EXISTS "Auth Users Can View Their Facilities" ON public.facilities;
DROP POLICY IF EXISTS "Auth Users Can View Their Organizations" ON public.organizations;

-- Drop agent table policies if present
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Tenant Scoped Agent Runs Read') THEN
        DROP POLICY "Tenant Scoped Agent Runs Read" ON public.agent_runs;
        DROP POLICY "Tenant Scoped Agent Runs Manage" ON public.agent_runs;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Tenant Scoped Agent Tasks Read') THEN
        DROP POLICY "Tenant Scoped Agent Tasks Read" ON public.agent_tasks;
        DROP POLICY "Tenant Scoped Agent Tasks Manage" ON public.agent_tasks;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Tenant Scoped Agent Events Read') THEN
        DROP POLICY "Tenant Scoped Agent Events Read" ON public.agent_events;
        DROP POLICY "Tenant Scoped Agent Events Manage" ON public.agent_events;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Tenant Scoped Agent Context Read') THEN
        DROP POLICY "Tenant Scoped Agent Context Read" ON public.agent_context;
        DROP POLICY "Tenant Scoped Agent Context Manage" ON public.agent_context;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Tenant Scoped Agent Approvals Read') THEN
        DROP POLICY "Tenant Scoped Agent Approvals Read" ON public.agent_approvals;
        DROP POLICY "Tenant Scoped Agent Approvals Manage" ON public.agent_approvals;
    END IF;
END $$;

-- 3. Restore Secure Authenticated Baseline Policies (NEVER RESTORE OPEN ANONYMOUS ACCESS)
-- Enforces that only authenticated staff/users can interact with domain tables during rollback.
CREATE POLICY "Authenticated users baseline settings access" ON public.settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users baseline surgeons access" ON public.surgeons FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users baseline patients access" ON public.patients FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users baseline cpt_codes access" ON public.cpt_codes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users baseline surgeries access" ON public.surgeries FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users baseline or_block_schedule access" ON public.or_block_schedule FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users baseline ot_extra_cost access" ON public.ot_extra_cost FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users baseline staff access" ON public.staff FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users baseline chatbot_questions access" ON public.chatbot_questions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users baseline user profiles access" ON public.users FOR SELECT TO authenticated USING (true);

-- 4. Drop Helper Functions
DROP FUNCTION IF EXISTS public.user_has_facility_role(UUID, TEXT[]);
DROP FUNCTION IF EXISTS public.get_auth_user_role(UUID);
DROP FUNCTION IF EXISTS public.get_auth_user_facilities();

-- 5. Remove facility_id Foreign Key Columns from 9 Operational Tables
ALTER TABLE public.settings DROP COLUMN IF EXISTS facility_id;
ALTER TABLE public.chatbot_questions DROP COLUMN IF EXISTS facility_id;
ALTER TABLE public.staff DROP COLUMN IF EXISTS facility_id;
ALTER TABLE public.ot_extra_cost DROP COLUMN IF EXISTS facility_id;
ALTER TABLE public.or_block_schedule DROP COLUMN IF EXISTS facility_id;
ALTER TABLE public.surgeries DROP COLUMN IF EXISTS facility_id;
ALTER TABLE public.cpt_codes DROP COLUMN IF EXISTS facility_id;
ALTER TABLE public.patients DROP COLUMN IF EXISTS facility_id;
ALTER TABLE public.surgeons DROP COLUMN IF EXISTS facility_id;

-- 6. Remove facility_id from agent tables if present
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'agent_runs' AND column_name = 'facility_id') THEN
        ALTER TABLE public.agent_runs DROP COLUMN facility_id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'agent_tasks' AND column_name = 'facility_id') THEN
        ALTER TABLE public.agent_tasks DROP COLUMN facility_id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'agent_events' AND column_name = 'facility_id') THEN
        ALTER TABLE public.agent_events DROP COLUMN facility_id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'agent_context' AND column_name = 'facility_id') THEN
        ALTER TABLE public.agent_context DROP COLUMN facility_id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'agent_approvals' AND column_name = 'facility_id') THEN
        ALTER TABLE public.agent_approvals DROP COLUMN facility_id;
    END IF;
END $$;

-- 7. Drop Multi-Tenancy Hierarchy Tables
DROP TABLE IF EXISTS public.facility_memberships CASCADE;
DROP TABLE IF EXISTS public.facilities CASCADE;
DROP TABLE IF EXISTS public.organizations CASCADE;

COMMIT;
