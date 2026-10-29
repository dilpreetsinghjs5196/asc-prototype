-- ==============================================================================
-- REVERSE MIGRATION 037: CMS PAYMENT INDICATORS & STATUTORY INTERPRETATION ENGINE
-- ==============================================================================
-- Description: Safely reverts objects introduced by migration 037:
--              1. Drops RLS policies on payment indicator tables.
--              2. Drops tables: cms_payment_indicator_overrides, cms_indicator_claim_rules, cms_payment_indicator_definitions.
--              3. Drops fn_interpret_cms_indicator function.
--              4. Removes columns payment_indicator, coverage_status, is_device_intensive from claim_lines.
-- ==============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.fn_interpret_cms_indicator(VARCHAR, DATE, VARCHAR);

DROP TABLE IF EXISTS public.cms_payment_indicator_overrides CASCADE;
DROP TABLE IF EXISTS public.cms_indicator_claim_rules CASCADE;
DROP TABLE IF EXISTS public.cms_payment_indicator_definitions CASCADE;

ALTER TABLE public.claim_lines
    DROP COLUMN IF EXISTS payment_indicator,
    DROP COLUMN IF EXISTS coverage_status,
    DROP COLUMN IF EXISTS is_device_intensive;

COMMIT;

