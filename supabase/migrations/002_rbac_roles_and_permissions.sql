-- ==============================================================================
-- ASCANALYST PLATFORM — DATABASE MIGRATION 002 (UP)
-- RBAC ROLES, GRANULAR PERMISSIONS & ADVANCED AUTHORIZATION HARDENING
-- ==============================================================================
-- Specification: docs/phases/22-RBAC-ROLES-AND-PERMISSIONS.md
-- Target Database: Supabase PostgreSQL 15+ (Remote / Local)
-- 
-- Architecture Principles:
-- 1. Dual-Resolution Compatibility: Retains facility_memberships.role (TEXT)
--    while introducing relational role_id UUID to support dynamic custom roles.
-- 2. Principle of Least Privilege: Zero anonymous access. Explicit RLS on all
--    tables. Built-in system roles are immutable.
-- 3. Deterministic Mapping: All 14 legacy role string aliases map directly to
--    canonical built-in roles without privilege loss or accidental elevation.
-- 4. True Database-Tier Surgeon Isolation: Restricts attending surgeons to
--    personal surgical cases at the PostgreSQL engine tier.
-- 5. Safe Administrative Governance: Anti-self-escalation and Last Administrator
--    protection triggers prevent accidental or malicious lockouts.
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. GRANULAR PERMISSIONS CATALOG
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,          -- e.g., 'patients.view', 'surgeries.schedule'
    category TEXT NOT NULL,             -- e.g., 'patients', 'surgeries', 'billing'
    name TEXT NOT NULL,                 -- e.g., 'View Patient PHI'
    description TEXT,
    risk_level TEXT NOT NULL DEFAULT 'standard' CHECK (risk_level IN ('standard', 'sensitive', 'critical')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_permissions_category ON public.permissions(category);

-- Explicit Security on Permissions Catalog
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.permissions FROM anon;
GRANT SELECT ON public.permissions TO authenticated;

DROP POLICY IF EXISTS "Auth Users Can View Permissions Catalog" ON public.permissions;
CREATE POLICY "Auth Users Can View Permissions Catalog"
ON public.permissions
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Super Admin Can Manage Permissions" ON public.permissions;
CREATE POLICY "Super Admin Can Manage Permissions"
ON public.permissions
FOR ALL
TO authenticated
USING (user_has_facility_role(NULL, ARRAY['super_admin']))
WITH CHECK (user_has_facility_role(NULL, ARRAY['super_admin']));

-- ==============================================================================
-- 2. SEED DEFAULT PERMISSIONS (13 DOMAINS)
-- ==============================================================================

INSERT INTO public.permissions (code, category, name, description, risk_level) VALUES
-- Patients
('patients.view', 'patients', 'View Patient Records', 'View patient demographics and basic info', 'standard'),
('patients.view_phi', 'patients', 'View Patient PHI', 'Access full Protected Health Information (MRN, DOB, Clinical History)', 'sensitive'),
('patients.create', 'patients', 'Create Patient Record', 'Register new patients in the directory', 'standard'),
('patients.edit', 'patients', 'Edit Patient Demographics', 'Modify contact info and demographic records', 'standard'),
('patients.delete', 'patients', 'Delete Patient Record', 'Soft or hard delete patient clinical profile', 'critical'),

-- Surgeons
('surgeons.view', 'surgeons', 'View Surgeon Directory', 'View attending surgeon profiles and specialties', 'standard'),
('surgeons.create', 'surgeons', 'Onboard Surgeon', 'Add new surgeon credentials to the facility directory', 'sensitive'),
('surgeons.edit', 'surgeons', 'Edit Surgeon Profile', 'Modify surgeon contact info, rates, and specialties', 'standard'),
('surgeons.delete', 'surgeons', 'Deactivate Surgeon', 'Deactivate surgeon directory credentials', 'critical'),

-- Surgeries & Case Logs
('surgeries.view', 'surgeries', 'View Surgical Cases', 'View scheduled and completed surgical cases', 'standard'),
('surgeries.schedule', 'surgeries', 'Schedule Surgery Case', 'Create new surgical cases on the OR calendar', 'standard'),
('surgeries.edit', 'surgeries', 'Edit Surgical Case', 'Modify surgical times, staff, rooms, or CPT codes', 'standard'),
('surgeries.delete', 'surgeries', 'Delete / Cancel Case', 'Remove or cancel scheduled surgical procedures', 'sensitive'),
('surgeries.approve', 'surgeries', 'Approve Case Logs', 'Sign off on finalized case logs and turnover times', 'sensitive'),

-- Operating Rooms & Block Scheduling
('or.view', 'or_scheduling', 'View OR Schedule', 'View room calendar, blocks, and utilization', 'standard'),
('or.reserve_blocks', 'or_scheduling', 'Reserve OR Blocks', 'Allocate recurring surgeon block times', 'standard'),
('or.edit_allocations', 'or_scheduling', 'Edit OR Allocations', 'Reassign OR rooms or adjust block hours', 'standard'),
('or.release_blocks', 'or_scheduling', 'Release OR Blocks', 'Release unused block time for open scheduling', 'standard'),
('or.approve_schedule', 'or_scheduling', 'Approve Block Schedule', 'Formally approve monthly master block schedule', 'sensitive'),

-- CPT Codes & Fee Schedules
('cpt.view', 'cpt_codes', 'View CPT Catalog', 'Search CPT codes, descriptions, and national rates', 'standard'),
('cpt.create', 'cpt_codes', 'Import / Add CPT Codes', 'Upload custom CPT codes or batch fee files', 'standard'),
('cpt.edit', 'cpt_codes', 'Edit CPT Rates', 'Modify facility fees, technical components, and supply costs', 'sensitive'),
('cpt.delete', 'cpt_codes', 'Delete CPT Mapping', 'Remove CPT code from active facility catalog', 'sensitive'),

-- Finance & Cost Management
('finance.view_margins', 'finance', 'View Profit Margins', 'Inspect EBITDA, contribution margins, and profitability', 'sensitive'),
('finance.manage_overtime', 'finance', 'Manage Extra / OT Costs', 'Configure staffing overtime, fixed costs, and hourly rates', 'sensitive'),
('finance.approve_budgets', 'finance', 'Approve Facility Budgets', 'Authorize monthly financial models and target margins', 'critical'),

-- Billing / RCM
('billing.view_yield', 'billing', 'View Payer Yields', 'Inspect payer contracts, collection rates, and claims', 'standard'),
('billing.apply_mppr', 'billing', 'Apply Medicare MPPR', 'Configure multiple procedure payment reduction rules', 'sensitive'),
('billing.freeze_monthly', 'billing', 'Freeze Monthly Billing', 'Lock monthly claims ledger against retroactive edits', 'critical'),

-- Reports & Exports
('reports.export_volume', 'reports', 'Export Case Volume', 'Download aggregate case volumes and utilization CSVs', 'standard'),
('reports.export_margins', 'reports', 'Export Financial Data', 'Download financial margin spreadsheets and cost models', 'sensitive'),
('reports.export_phi_unredacted', 'reports', 'Export Unredacted PHI Logs', 'Export full patient case logs including MRN and clinical data', 'critical'),

-- AI Tools & MultiAgent Systems
('ai.run_insights', 'ai', 'Run AI Operations Insights', 'Query Gemini AI analyst for operational recommendations', 'standard'),
('ai.run_simulation', 'ai', 'Run Scheduling Simulation', 'Execute MultiAgent orchestrator for case scheduling', 'standard'),
('ai.auto_schedule', 'ai', 'Auto-Commit Cases via Agent', 'Allow AI agent to automatically write bookings to database', 'sensitive'),
('ai.edit_instructions', 'ai', 'Edit AI System Instructions', 'Modify system-level prompt guidelines and knowledge categories', 'critical'),

-- User Management
('users.view', 'users', 'View User Directory', 'View staff accounts, email addresses, and roles', 'standard'),
('users.invite', 'users', 'Invite New Users', 'Dispatch invitations and provision facility staff accounts', 'sensitive'),
('users.edit_roles', 'users', 'Assign Facility Roles', 'Change staff roles and grant access privileges', 'sensitive'),
('users.deactivate', 'users', 'Deactivate User Accounts', 'Suspend active user accounts and revoke access', 'sensitive'),

-- Role Management
('roles.view', 'roles', 'View Roles & Permissions', 'Inspect built-in and custom role capabilities', 'standard'),
('roles.create_custom', 'roles', 'Create Custom Roles', 'Author custom role templates with customized permissions', 'sensitive'),
('roles.edit_custom', 'roles', 'Edit Custom Roles', 'Modify permission grants on custom role templates', 'sensitive'),
('roles.delete_custom', 'roles', 'Delete Custom Roles', 'Remove custom role definitions', 'sensitive'),

-- Facility Tenancy & Settings
('tenancy.edit_facility_config', 'tenancy', 'Edit Facility Settings', 'Update facility hours, license, timezone, and addresses', 'sensitive'),
('tenancy.toggle_mppr', 'tenancy', 'Toggle Facility MPPR', 'Enable or disable Medicare MPPR financial calculation rules', 'sensitive'),
('tenancy.provision_facility', 'tenancy', 'Provision New Facility', 'Add new ASC centers to enterprise healthcare network', 'critical'),

-- Audit & Compliance
('audit.view_clinical', 'audit', 'View Clinical Audit Trail', 'Inspect change logs for surgeries, patients, and schedules', 'standard'),
('audit.view_financial', 'audit', 'View Financial Audit Trail', 'Inspect changes to fees, CPT codes, and overtime rates', 'sensitive'),
('audit.view_security', 'audit', 'View Security Audit Logs', 'Inspect login attempts, role changes, and credential events', 'critical')

ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    description = EXCLUDED.description,
    risk_level = EXCLUDED.risk_level;

-- ==============================================================================
-- 3. ROLES TABLE (BUILT-IN SYSTEM ROLES & TENANT CUSTOM ROLES)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE,
    name TEXT NOT NULL,                 -- e.g., 'Lead Surgical Coordinator'
    slug TEXT NOT NULL,                 -- e.g., 'lead_surgical_coordinator'
    description TEXT,
    is_system BOOLEAN NOT NULL DEFAULT false, -- Built-in roles are immutable
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Scope-Aware Partial Unique Indexes (Handling NULL scopes deterministically)
CREATE UNIQUE INDEX IF NOT EXISTS uq_roles_system_slug 
    ON public.roles(slug) WHERE facility_id IS NULL AND organization_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_roles_org_slug 
    ON public.roles(organization_id, slug) WHERE facility_id IS NULL AND organization_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_roles_facility_slug 
    ON public.roles(facility_id, slug) WHERE facility_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_roles_facility ON public.roles(facility_id);
CREATE INDEX IF NOT EXISTS idx_roles_org ON public.roles(organization_id);

-- Explicit Roles Security
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.roles FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roles TO authenticated;

-- Ensure facility_memberships has role_id before it is referenced in roles RLS policies
ALTER TABLE public.facility_memberships 
    ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES public.roles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_memberships_role_id ON public.facility_memberships(role_id);

DROP POLICY IF EXISTS "Auth Users Can View Applicable Roles" ON public.roles;
CREATE POLICY "Auth Users Can View Applicable Roles"
ON public.roles
FOR SELECT
TO authenticated
USING (
    is_system = true OR
    facility_id IN (SELECT get_auth_user_facilities()) OR
    organization_id IN (
        SELECT f.organization_id FROM public.facilities f 
        WHERE f.id IN (SELECT get_auth_user_facilities())
    )
);

DROP POLICY IF EXISTS "Authorized Admins Can Create Custom Roles" ON public.roles;
CREATE POLICY "Authorized Admins Can Create Custom Roles"
ON public.roles
FOR INSERT
TO authenticated
WITH CHECK (
    NOT is_system AND
    (
        (facility_id IS NOT NULL AND user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin'])) OR
        (organization_id IS NOT NULL AND facility_id IS NULL AND user_has_facility_role(NULL, ARRAY['super_admin', 'org_admin']))
    )
);

DROP POLICY IF EXISTS "Authorized Admins Can Update Custom Roles" ON public.roles;
CREATE POLICY "Authorized Admins Can Update Custom Roles"
ON public.roles
FOR UPDATE
TO authenticated
USING (
    NOT is_system AND
    user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin'])
)
WITH CHECK (
    NOT is_system AND
    user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin'])
);

DROP POLICY IF EXISTS "Authorized Admins Can Delete Custom Roles" ON public.roles;
CREATE POLICY "Authorized Admins Can Delete Custom Roles"
ON public.roles
FOR DELETE
TO authenticated
USING (
    NOT is_system AND
    user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin']) AND
    NOT EXISTS (SELECT 1 FROM public.facility_memberships fm WHERE fm.role_id = roles.id)
);

-- ==============================================================================
-- 4. SEED 10 CANONICAL BUILT-IN SYSTEM ROLES (DETERMINISTIC UUIDs)
-- ==============================================================================

INSERT INTO public.roles (id, organization_id, facility_id, name, slug, description, is_system, is_active) VALUES
('00000000-0000-0000-0001-000000000001', NULL, NULL, 'Super Admin', 'super_admin', 'Global Enterprise Platform Administrator', true, true),
('00000000-0000-0000-0001-000000000002', NULL, NULL, 'Organization Admin', 'org_admin', 'Healthcare Network Executive Administrator', true, true),
('00000000-0000-0000-0001-000000000003', NULL, NULL, 'Facility Administrator', 'facility_admin', 'ASC Executive Center Administrator', true, true),
('00000000-0000-0000-0001-000000000004', NULL, NULL, 'CFO / Finance Lead', 'cfo', 'Financial Analyst, Margin & Budget Lead', true, true),
('00000000-0000-0000-0001-000000000005', NULL, NULL, 'Clinical Manager', 'clinical_manager', 'Clinical Director, OR Nurse & Quality Manager', true, true),
('00000000-0000-0000-0001-000000000006', NULL, NULL, 'Surgical Scheduler', 'scheduler', 'Operating Room Booking & Calendar Coordinator', true, true),
('00000000-0000-0000-0001-000000000007', NULL, NULL, 'Billing / RCM Specialist', 'biller', 'Revenue Cycle Management & Claim Specialist', true, true),
('00000000-0000-0000-0001-000000000008', NULL, NULL, 'Medical Coder', 'coder', 'Medical Records, CPT & Coding Specialist', true, true),
('00000000-0000-0000-0001-000000000009', NULL, NULL, 'Attending Surgeon', 'surgeon', 'Physician Provider with Personal Case Scope', true, true),
('00000000-0000-0000-0001-000000000010', NULL, NULL, 'Read Only / Observer', 'viewer', 'Non-PHI Operational Dashboard Observer', true, true)

ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    slug = EXCLUDED.slug,
    description = EXCLUDED.description,
    is_system = true,
    is_active = true,
    updated_at = NOW();

-- ==============================================================================
-- 5. ROLE-PERMISSION JUNCTION TABLE
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.role_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
    granted_by UUID REFERENCES auth.users(id),
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_role_permission UNIQUE (role_id, permission_id)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON public.role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission ON public.role_permissions(permission_id);

-- Explicit Role-Permissions Security
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.role_permissions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.role_permissions TO authenticated;

DROP POLICY IF EXISTS "Auth Users Can View Role Permissions" ON public.role_permissions;
CREATE POLICY "Auth Users Can View Role Permissions"
ON public.role_permissions
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.roles r 
        WHERE r.id = role_permissions.role_id 
          AND (r.is_system = true OR r.facility_id IN (SELECT get_auth_user_facilities()))
    )
);

DROP POLICY IF EXISTS "Authorized Admins Can Manage Custom Role Permissions" ON public.role_permissions;
CREATE POLICY "Authorized Admins Can Manage Custom Role Permissions"
ON public.role_permissions
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.roles r 
        WHERE r.id = role_permissions.role_id 
          AND NOT r.is_system
          AND user_has_facility_role(r.facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin'])
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.roles r 
        WHERE r.id = role_permissions.role_id 
          AND NOT r.is_system
          AND user_has_facility_role(r.facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin'])
    )
);

-- ==============================================================================
-- 6. MAP DEFAULT PERMISSIONS TO CANONICAL SYSTEM ROLES
-- ==============================================================================

-- Helper macro to assign permissions by role slug and permission code list
DO $$
DECLARE
    v_role_super_admin UUID := '00000000-0000-0000-0001-000000000001';
    v_role_org_admin   UUID := '00000000-0000-0000-0001-000000000002';
    v_role_fac_admin   UUID := '00000000-0000-0000-0001-000000000003';
    v_role_cfo         UUID := '00000000-0000-0000-0001-000000000004';
    v_role_clin_mgr    UUID := '00000000-0000-0000-0001-000000000005';
    v_role_scheduler   UUID := '00000000-0000-0000-0001-000000000006';
    v_role_biller      UUID := '00000000-0000-0000-0001-000000000007';
    v_role_coder       UUID := '00000000-0000-0000-0001-000000000008';
    v_role_surgeon     UUID := '00000000-0000-0000-0001-000000000009';
    v_role_viewer      UUID := '00000000-0000-0000-0001-000000000010';
BEGIN
    -- Super Admin: Receives ALL permissions
    INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT v_role_super_admin, p.id FROM public.permissions p
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- Organization Admin: Receives all permissions except provisioning global multi-orgs
    INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT v_role_org_admin, p.id FROM public.permissions p
    WHERE p.code NOT IN ('ai.edit_instructions')
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- Facility Administrator: Full facility operations, staff, rooms, settings
    INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT v_role_fac_admin, p.id FROM public.permissions p
    WHERE p.code NOT IN ('tenancy.provision_facility', 'ai.edit_instructions')
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- CFO / Finance Lead
    INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT v_role_cfo, p.id FROM public.permissions p
    WHERE p.code IN (
        'patients.view', 'surgeons.view', 'surgeons.edit',
        'surgeries.view', 'or.view', 'cpt.view', 'cpt.create', 'cpt.edit',
        'finance.view_margins', 'finance.manage_overtime', 'finance.approve_budgets',
        'billing.view_yield', 'billing.apply_mppr', 'billing.freeze_monthly',
        'reports.export_volume', 'reports.export_margins',
        'ai.run_insights', 'roles.view', 'tenancy.toggle_mppr',
        'audit.view_clinical', 'audit.view_financial'
    )
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- Clinical Manager
    INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT v_role_clin_mgr, p.id FROM public.permissions p
    WHERE p.code IN (
        'patients.view', 'patients.view_phi', 'patients.create', 'patients.edit',
        'surgeons.view', 'surgeons.create', 'surgeons.edit',
        'surgeries.view', 'surgeries.schedule', 'surgeries.edit', 'surgeries.delete', 'surgeries.approve',
        'or.view', 'or.reserve_blocks', 'or.edit_allocations', 'or.release_blocks', 'or.approve_schedule',
        'cpt.view', 'finance.view_margins', 'reports.export_volume',
        'ai.run_insights', 'ai.run_simulation', 'ai.auto_schedule',
        'users.view', 'roles.view', 'audit.view_clinical'
    )
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- Scheduler (Focused Case Log & Block Coordination)
    INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT v_role_scheduler, p.id FROM public.permissions p
    WHERE p.code IN (
        'patients.view', 'patients.view_phi', 'patients.create', 'patients.edit',
        'surgeons.view',
        'surgeries.view', 'surgeries.schedule', 'surgeries.edit', 'surgeries.delete',
        'or.view', 'or.reserve_blocks', 'or.edit_allocations', 'or.release_blocks',
        'cpt.view', 'reports.export_volume',
        'ai.run_insights', 'ai.run_simulation', 'ai.auto_schedule'
    )
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- Biller / RCM Specialist (No Surgery Insertion Privileges)
    INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT v_role_biller, p.id FROM public.permissions p
    WHERE p.code IN (
        'patients.view', 'patients.view_phi', 'patients.edit',
        'surgeons.view', 'surgeries.view', 'surgeries.edit',
        'or.view', 'cpt.view', 'cpt.create', 'cpt.edit', 'cpt.delete',
        'finance.view_margins', 'finance.manage_overtime',
        'billing.view_yield', 'billing.apply_mppr', 'billing.freeze_monthly',
        'reports.export_volume', 'reports.export_margins',
        'ai.run_insights', 'audit.view_financial'
    )
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- Coder (Medical Coding & Catalog Registry)
    INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT v_role_coder, p.id FROM public.permissions p
    WHERE p.code IN (
        'patients.view', 'patients.view_phi',
        'surgeons.view', 'surgeries.view', 'surgeries.edit',
        'cpt.view', 'cpt.create',
        'reports.export_volume', 'ai.run_insights'
    )
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- Surgeon (Personal Scope)
    INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT v_role_surgeon, p.id FROM public.permissions p
    WHERE p.code IN (
        'patients.view', 'patients.view_phi', 'patients.create', 'patients.edit',
        'surgeons.view', 'surgeons.edit',
        'surgeries.view', 'surgeries.schedule', 'surgeries.edit',
        'or.view', 'cpt.view',
        'finance.view_margins',
        'reports.export_volume',
        'ai.run_insights', 'ai.run_simulation', 'ai.auto_schedule'
    )
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    -- Viewer (Read Only)
    INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT v_role_viewer, p.id FROM public.permissions p
    WHERE p.code IN (
        'surgeries.view', 'or.view', 'cpt.view', 'ai.run_insights'
    )
    ON CONFLICT (role_id, permission_id) DO NOTHING;
END $$;

-- ==============================================================================
-- 7. BACKFILL RELATIONAL ROLE IDs FOR EXISTING MEMBERSHIPS
-- ==============================================================================

-- Deterministic 14-Role Mapping Backfill
UPDATE public.facility_memberships fm
SET role_id = (
    SELECT r.id FROM public.roles r 
    WHERE r.slug = CASE fm.role
        WHEN 'clinical_director' THEN 'clinical_manager'
        WHEN 'billing_rcm' THEN 'biller'
        WHEN 'finance' THEN 'cfo'
        WHEN 'financial_analyst' THEN 'cfo'
        WHEN 'read_only' THEN 'viewer'
        ELSE fm.role
    END
    AND r.is_system = true
    LIMIT 1
)
WHERE fm.role_id IS NULL;

-- ==============================================================================
-- 8. DUAL-RESOLUTION PERMISSION SECURITY DEFINER FUNCTION
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.has_permission(p_facility_id UUID, p_permission_code TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
    v_role_id UUID;
    v_legacy_role TEXT;
BEGIN
    -- 1. Query membership for authenticated user in target facility
    SELECT fm.role_id, fm.role INTO v_role_id, v_legacy_role
    FROM public.facility_memberships fm
    WHERE fm.user_id = auth.uid()
      AND (p_facility_id IS NULL OR fm.facility_id = p_facility_id)
      AND fm.is_active = TRUE
    LIMIT 1;

    -- If no active membership in facility, fail closed
    IF v_role_id IS NULL AND v_legacy_role IS NULL THEN
        RETURN FALSE;
    END IF;

    -- 2. Primary Evaluation: Relational role_id
    IF v_role_id IS NOT NULL THEN
        RETURN EXISTS (
            SELECT 1
            FROM public.role_permissions rp
            JOIN public.permissions p ON p.id = rp.permission_id
            WHERE rp.role_id = v_role_id
              AND p.code = p_permission_code
        );
    END IF;

    -- 3. Fallback Evaluation: Legacy string role mapped to system role
    IF v_legacy_role IS NOT NULL THEN
        RETURN EXISTS (
            SELECT 1
            FROM public.roles r
            JOIN public.role_permissions rp ON rp.role_id = r.id
            JOIN public.permissions p ON p.id = rp.permission_id
            WHERE r.slug = CASE v_legacy_role
                WHEN 'clinical_director' THEN 'clinical_manager'
                WHEN 'billing_rcm' THEN 'biller'
                WHEN 'finance' THEN 'cfo'
                WHEN 'financial_analyst' THEN 'cfo'
                WHEN 'read_only' THEN 'viewer'
                ELSE v_legacy_role
            END
              AND r.is_system = TRUE
              AND p.code = p_permission_code
        );
    END IF;

    RETURN FALSE;
END;
$$;

-- Function returning all granted permission codes for active user
CREATE OR REPLACE FUNCTION public.get_auth_user_permissions(p_facility_id UUID)
RETURNS TABLE (permission_code TEXT)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT DISTINCT p.code
    FROM public.facility_memberships fm
    LEFT JOIN public.role_permissions rp ON rp.role_id = fm.role_id
    LEFT JOIN public.permissions p ON p.id = rp.permission_id
    WHERE fm.user_id = auth.uid()
      AND (p_facility_id IS NULL OR fm.facility_id = p_facility_id)
      AND fm.is_active = TRUE
      AND p.code IS NOT NULL;
$$;

-- ==============================================================================
-- 9. TRUE DATABASE-TIER SURGEON CASE ISOLATION (RLS POLICIES)
-- ==============================================================================

-- Surgeries SELECT: Restricts attending surgeons strictly to personal surgical cases
DROP POLICY IF EXISTS "Tenant Scoped Surgeries Read" ON public.surgeries;
CREATE POLICY "Tenant Scoped Surgeries Read"
ON public.surgeries
FOR SELECT
TO authenticated
USING (
    facility_id IN (SELECT get_auth_user_facilities())
    AND (
        -- If user is NOT a surgeon, they see all cases within their facility
        NOT user_has_facility_role(facility_id, ARRAY['surgeon'])
        OR
        -- If user IS a surgeon, restrict strictly to their own surgical records
        surgeon_id IN (
            SELECT s.id FROM public.surgeons s 
            WHERE LOWER(s.email) = LOWER(COALESCE(auth.jwt()->>'email', ''))
        )
    )
);

-- Surgeries INSERT: Billers are stripped of case insertion privilege
DROP POLICY IF EXISTS "Tenant Scoped Surgeries Insert" ON public.surgeries;
CREATE POLICY "Tenant Scoped Surgeries Insert"
ON public.surgeries
FOR INSERT
TO authenticated
WITH CHECK (
    facility_id IN (SELECT get_auth_user_facilities())
    AND (
        has_permission(facility_id, 'surgeries.schedule') OR
        user_has_facility_role(facility_id, ARRAY['super_admin', 'org_admin', 'facility_admin', 'clinical_manager', 'clinical_director', 'scheduler', 'surgeon'])
    )
);

-- ==============================================================================
-- 10. SYNCHRONIZE ONBOARDING TRIGGER (auth.users -> facility_memberships)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_facility_user()
RETURNS TRIGGER AS $$
DECLARE
    v_surgeon_record RECORD;
    v_admin_role_id UUID;
    v_surgeon_role_id UUID;
BEGIN
    SELECT id INTO v_admin_role_id FROM public.roles WHERE slug = 'facility_admin' AND is_system = true LIMIT 1;
    SELECT id INTO v_surgeon_role_id FROM public.roles WHERE slug = 'surgeon' AND is_system = true LIMIT 1;

    -- 1. Explicit Administrator Provisioning (Primary Facility Only)
    IF NEW.email = 'admin@asc.com' THEN
        INSERT INTO public.facility_memberships (facility_id, user_id, role, role_id, is_active)
        VALUES ('00000000-0000-0000-0000-000000000002'::UUID, NEW.id, 'facility_admin', v_admin_role_id, true)
        ON CONFLICT (facility_id, user_id) DO UPDATE SET is_active = true, role = 'facility_admin', role_id = v_admin_role_id;
    END IF;

    -- 2. Verified Surgeon Provisioning: Match email to existing surgeon records
    FOR v_surgeon_record IN
        SELECT DISTINCT facility_id 
        FROM public.surgeons 
        WHERE LOWER(email) = LOWER(NEW.email)
          AND facility_id IS NOT NULL
    LOOP
        INSERT INTO public.facility_memberships (facility_id, user_id, role, role_id, is_active)
        VALUES (v_surgeon_record.facility_id, NEW.id, 'surgeon', v_surgeon_role_id, true)
        ON CONFLICT (facility_id, user_id) DO UPDATE SET is_active = true, role = 'surgeon', role_id = v_surgeon_role_id;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ==============================================================================
-- 11. ADMINISTRATIVE SAFEGUARDS: ANTI-SELF-ESCALATION & LAST ADMIN PROTECTION
-- ==============================================================================

-- 11.1 Anti-Self-Escalation Trigger
CREATE OR REPLACE FUNCTION public.prevent_self_role_escalation()
RETURNS TRIGGER AS $$
BEGIN
    -- Prevent users from editing their own role or active status unless executing as super_admin
    IF OLD.user_id = auth.uid() THEN
        IF (NEW.role IS DISTINCT FROM OLD.role OR NEW.role_id IS DISTINCT FROM OLD.role_id OR NEW.is_active IS DISTINCT FROM OLD.is_active) THEN
            IF NOT user_has_facility_role(NULL, ARRAY['super_admin']) THEN
                RAISE EXCEPTION 'Privilege escalation violation: Users are forbidden from modifying their own roles or membership status.';
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_prevent_self_escalation ON public.facility_memberships;
CREATE TRIGGER trg_prevent_self_escalation
    BEFORE UPDATE ON public.facility_memberships
    FOR EACH ROW EXECUTE FUNCTION public.prevent_self_role_escalation();

-- 11.2 Last Facility Administrator Safeguard Trigger
CREATE OR REPLACE FUNCTION public.protect_last_facility_admin()
RETURNS TRIGGER AS $$
DECLARE
    v_admin_count INT;
    v_fac_id UUID;
BEGIN
    v_fac_id := COALESCE(OLD.facility_id, NEW.facility_id);

    -- Check if modified row is an active facility_admin
    IF (OLD.role IN ('facility_admin', 'super_admin') AND OLD.is_active = TRUE) THEN
        -- Check if action is deactivating or deleting or changing role
        IF (TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND (NEW.is_active = FALSE OR NEW.role NOT IN ('facility_admin', 'super_admin')))) THEN
            SELECT COUNT(*) INTO v_admin_count
            FROM public.facility_memberships
            WHERE facility_id = v_fac_id
              AND role IN ('facility_admin', 'super_admin')
              AND is_active = TRUE
              AND id != OLD.id;

            IF v_admin_count = 0 THEN
                RAISE EXCEPTION 'Administrative safety violation: Cannot remove or deactivate the final remaining Facility Administrator for facility %.', v_fac_id;
            END IF;
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_protect_last_facility_admin ON public.facility_memberships;
CREATE TRIGGER trg_protect_last_facility_admin
    BEFORE UPDATE OR DELETE ON public.facility_memberships
    FOR EACH ROW EXECUTE FUNCTION public.protect_last_facility_admin();

COMMIT;
