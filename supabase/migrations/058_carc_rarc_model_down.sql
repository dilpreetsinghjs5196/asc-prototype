-- Rollback Migration: 058_carc_rarc_model_down.sql
-- Description: Clean teardown of Phase 84 CARC/RARC tables, views, and policies in reverse dependency order.

DROP VIEW IF EXISTS public.vw_rcm_actionable_denial_queue CASCADE;
DROP VIEW IF EXISTS public.vw_rcm_carc_frequency_analysis CASCADE;

DROP TABLE IF EXISTS public.rcm_claim_denial_interpretations CASCADE;
DROP TABLE IF EXISTS public.rcm_carc_rarc_mapping_rules CASCADE;
DROP TABLE IF EXISTS public.rcm_rarc_master CASCADE;
DROP TABLE IF EXISTS public.rcm_carc_master CASCADE;
