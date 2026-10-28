-- ==============================================================================
-- MIGRATION DOWN: 034_surgeon_preference_cards_down.sql
-- DESCRIPTION: Safely tear down Phase 58 Surgeon Preference Cards tables,
--              procedures, column extensions, and RLS policies.
-- PLATFORM: Supabase PostgreSQL 15+
-- ==============================================================================

BEGIN;

-- 1. Drop Stored Procedure
DROP FUNCTION IF EXISTS public.fn_resolve_case_preference_card(UUID, BIGINT, VARCHAR, DATE);

-- 2. Drop Added Foreign Keys and Columns on Existing Tables
ALTER TABLE IF EXISTS public.case_devices
    DROP COLUMN IF EXISTS waste_reason,
    DROP COLUMN IF EXISTS disposition_code,
    DROP COLUMN IF EXISTS substituted_from_sku_id,
    DROP COLUMN IF EXISTS is_substitution,
    DROP COLUMN IF EXISTS staging_behavior,
    DROP COLUMN IF EXISTS preference_card_item_id;

ALTER TABLE IF EXISTS public.surgeries
    DROP COLUMN IF EXISTS preference_verified_by,
    DROP COLUMN IF EXISTS preference_verified_at,
    DROP COLUMN IF EXISTS preference_readiness_status,
    DROP COLUMN IF EXISTS preference_card_revision_id;

-- 3. Drop Tables in Reverse Dependency Order
DROP TABLE IF EXISTS public.case_preference_reconciliations CASCADE;
DROP TABLE IF EXISTS public.case_preference_snapshots CASCADE;
DROP TABLE IF EXISTS public.preference_card_substitutions CASCADE;
DROP TABLE IF EXISTS public.preference_card_items CASCADE;
DROP TABLE IF EXISTS public.preference_card_procedures CASCADE;
DROP TABLE IF EXISTS public.surgeon_preference_card_revisions CASCADE;
DROP TABLE IF EXISTS public.surgeon_preference_cards CASCADE;

COMMIT;
