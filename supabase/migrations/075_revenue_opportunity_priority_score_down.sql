-- ==============================================================================
-- DOWN MIGRATION: 075_revenue_opportunity_priority_score_down.sql
-- DESCRIPTION: Rollback Phase 98 Revenue Opportunity Priority Score schema objects.
-- PLATFORM: Supabase PostgreSQL 15+
-- ==============================================================================

BEGIN;

DROP VIEW IF EXISTS public.vw_revenue_opportunities_summary CASCADE;
DROP VIEW IF EXISTS public.vw_revenue_opportunities_active CASCADE;

DROP POLICY IF EXISTS rops_items_isolation ON public.revenue_opportunity_priority_items;
DROP POLICY IF EXISTS rops_rules_isolation ON public.revenue_opportunity_score_rules;

DROP TABLE IF EXISTS public.revenue_opportunity_priority_items CASCADE;
DROP TABLE IF EXISTS public.revenue_opportunity_score_rules CASCADE;

COMMIT;

