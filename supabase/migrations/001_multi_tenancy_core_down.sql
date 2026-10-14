-- ==============================================================================
-- ROLLBACK MIGRATION: 001_multi_tenancy_core_down.sql
-- DESCRIPTION: Reversible down-migration for 001_multi_tenancy_core.sql
-- ==============================================================================

BEGIN;

-- 1. Drop Tenant-Scoped RLS Policies
DROP POLICY IF EXISTS "Tenant Scoped Settings Access" ON public.settings;
DROP POLICY IF EXISTS "Tenant Scoped Chatbot Questions Access" ON public.chatbot_questions;
DROP POLICY IF EXISTS "Tenant Scoped Staff Access" ON public.staff;
DROP POLICY IF EXISTS "Tenant Scoped Extra Costs Access" ON public.ot_extra_cost;
DROP POLICY IF EXISTS "Tenant Scoped Block Schedule Access" ON public.or_block_schedule;
DROP POLICY IF EXISTS "Tenant Scoped CPT Codes Access" ON public.cpt_codes;
DROP POLICY IF EXISTS "Tenant Scoped Surgeons Access" ON public.surgeons;
DROP POLICY IF EXISTS "Tenant Scoped Patients Access" ON public.patients;
DROP POLICY IF EXISTS "Tenant Scoped Surgeries Access" ON public.surgeries;
DROP POLICY IF EXISTS "Facility Admin Can Manage Memberships" ON public.facility_memberships;
DROP POLICY IF EXISTS "Users Can View Their Own Memberships" ON public.facility_memberships;
DROP POLICY IF EXISTS "Facility Admin Can Update Facility Settings" ON public.facilities;
DROP POLICY IF EXISTS "Auth Users Can View Their Facilities" ON public.facilities;
DROP POLICY IF EXISTS "Auth Users Can View Their Organizations" ON public.organizations;

-- 2. Restore Prototype Anonymous Access Policies
CREATE POLICY "Allow anon all on settings" ON public.settings FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon all on surgeons" ON public.surgeons FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon all on patients" ON public.patients FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon all on cpt_codes" ON public.cpt_codes FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon all on surgeries" ON public.surgeries FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon all on or_block_schedule" ON public.or_block_schedule FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon all on ot_extra_cost" ON public.ot_extra_cost FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon all on staff" ON public.staff FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon all on chatbot_questions" ON public.chatbot_questions FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon all on users" ON public.users FOR ALL TO anon USING (true) WITH CHECK (true);

-- 3. Drop Helper Functions
DROP FUNCTION IF EXISTS public.user_has_facility_role(UUID, TEXT[]);
DROP FUNCTION IF EXISTS public.get_auth_user_role(UUID);
DROP FUNCTION IF EXISTS public.get_auth_user_facilities();

-- 4. Remove facility_id Foreign Key Columns from Domain Tables
ALTER TABLE public.settings DROP COLUMN IF EXISTS facility_id;
ALTER TABLE public.chatbot_questions DROP COLUMN IF EXISTS facility_id;
ALTER TABLE public.staff DROP COLUMN IF EXISTS facility_id;
ALTER TABLE public.ot_extra_cost DROP COLUMN IF EXISTS facility_id;
ALTER TABLE public.or_block_schedule DROP COLUMN IF EXISTS facility_id;
ALTER TABLE public.surgeries DROP COLUMN IF EXISTS facility_id;
ALTER TABLE public.cpt_codes DROP COLUMN IF EXISTS facility_id;
ALTER TABLE public.patients DROP COLUMN IF EXISTS facility_id;
ALTER TABLE public.surgeons DROP COLUMN IF EXISTS facility_id;

-- 5. Drop Multi-Tenancy Hierarchy Tables
DROP TABLE IF EXISTS public.facility_memberships CASCADE;
DROP TABLE IF EXISTS public.facilities CASCADE;
DROP TABLE IF EXISTS public.organizations CASCADE;

COMMIT;
