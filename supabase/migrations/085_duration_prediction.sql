-- ==============================================================================
-- Migration: 085_duration_prediction.sql
-- Phase A8: Duration Prediction Models (P50/P75/P80/P90)
-- Module: Module 10: OR Scheduling & Utilization Optimization
-- Description: Creates statistical duration prediction models, percentile distributions,
--              case prediction logs, analytical views, and RLS multi-tenancy.
-- ==============================================================================

-- 1. Surgical Case Duration Prediction Models Table
CREATE TABLE IF NOT EXISTS public.or_case_duration_prediction_models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    surgeon_id UUID,
    surgeon_name VARCHAR(255) NOT NULL,
    specialty_code VARCHAR(64) NOT NULL,
    primary_cpt_code VARCHAR(16) NOT NULL,
    procedure_name VARCHAR(255) NOT NULL,
    sample_size INTEGER NOT NULL DEFAULT 0,
    min_duration_minutes INTEGER NOT NULL DEFAULT 0,
    p50_duration_minutes INTEGER NOT NULL DEFAULT 0,
    p75_duration_minutes INTEGER NOT NULL DEFAULT 0,
    p80_duration_minutes INTEGER NOT NULL DEFAULT 0,
    p90_duration_minutes INTEGER NOT NULL DEFAULT 0,
    max_duration_minutes INTEGER NOT NULL DEFAULT 0,
    mean_duration_minutes NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    std_dev_minutes NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    coefficient_of_variation NUMERIC(5, 3) NOT NULL DEFAULT 0.000,
    confidence_level VARCHAR(32) NOT NULL DEFAULT 'INSUFFICIENT', -- 'HIGH', 'MODERATE', 'LOW', 'INSUFFICIENT'
    model_tier VARCHAR(32) NOT NULL DEFAULT 'TIER_1_SURGEON_CPT', -- 'TIER_1_SURGEON_CPT', 'TIER_2_SURGEON_SPECIALTY', 'TIER_3_FACILITY_CPT', 'TIER_4_BENCHMARK'
    last_trained_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_or_duration_prediction_model UNIQUE (facility_id, surgeon_name, primary_cpt_code)
);

-- 2. Case Duration Predictions Log Table
CREATE TABLE IF NOT EXISTS public.or_case_duration_predictions_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    case_id VARCHAR(64) NOT NULL,
    surgery_date DATE NOT NULL,
    surgeon_name VARCHAR(255) NOT NULL,
    primary_cpt_code VARCHAR(16) NOT NULL,
    procedure_name VARCHAR(255) NOT NULL,
    scheduled_duration_minutes INTEGER NOT NULL,
    predicted_p50_minutes INTEGER NOT NULL,
    predicted_p75_minutes INTEGER NOT NULL,
    predicted_p80_minutes INTEGER NOT NULL,
    predicted_p90_minutes INTEGER NOT NULL,
    selected_percentile VARCHAR(16) NOT NULL DEFAULT 'P80', -- 'P50', 'P75', 'P80', 'P90'
    recommended_duration_minutes INTEGER NOT NULL,
    complexity_adjustment_minutes INTEGER NOT NULL DEFAULT 0,
    actual_duration_minutes INTEGER,
    prediction_error_minutes INTEGER, -- (actual - recommended)
    confidence_level VARCHAR(32) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Indexes for Query Acceleration
CREATE INDEX IF NOT EXISTS idx_ocdpm_facility_surgeon ON public.or_case_duration_prediction_models (facility_id, surgeon_name);
CREATE INDEX IF NOT EXISTS idx_ocdpm_facility_cpt ON public.or_case_duration_prediction_models (facility_id, primary_cpt_code);
CREATE INDEX IF NOT EXISTS idx_ocdpm_facility_confidence ON public.or_case_duration_prediction_models (facility_id, confidence_level);
CREATE INDEX IF NOT EXISTS idx_ocdpl_facility_date ON public.or_case_duration_predictions_log (facility_id, surgery_date);
CREATE INDEX IF NOT EXISTS idx_ocdpl_facility_cpt ON public.or_case_duration_predictions_log (facility_id, primary_cpt_code);

-- 4. Analytical View: Prediction Model Accuracy & Coverage
CREATE OR REPLACE VIEW public.vw_or_duration_prediction_accuracy AS
SELECT
    facility_id,
    COUNT(*) AS total_predicted_cases,
    COUNT(*) FILTER (WHERE confidence_level = 'HIGH') AS high_confidence_cases,
    ROUND(
        (COUNT(*) FILTER (WHERE confidence_level = 'HIGH')::NUMERIC / NULLIF(COUNT(*), 0) * 100),
        1
    ) AS high_confidence_coverage_pct,
    ROUND(AVG(ABS(prediction_error_minutes)), 1) AS mean_absolute_error_minutes,
    COUNT(*) FILTER (WHERE actual_duration_minutes <= recommended_duration_minutes) AS completed_within_target_count,
    ROUND(
        (COUNT(*) FILTER (WHERE actual_duration_minutes <= recommended_duration_minutes)::NUMERIC / NULLIF(COUNT(actual_duration_minutes), 0) * 100),
        1
    ) AS completed_within_target_pct
FROM public.or_case_duration_predictions_log
GROUP BY facility_id;

-- 5. Analytical View: Procedure CPT Benchmark Percentiles
CREATE OR REPLACE VIEW public.vw_or_duration_models_by_cpt AS
SELECT
    facility_id,
    primary_cpt_code,
    procedure_name,
    specialty_code,
    COUNT(DISTINCT surgeon_name) AS surgeons_count,
    SUM(sample_size) AS total_historical_cases,
    ROUND(AVG(p50_duration_minutes), 0) AS consensus_p50_minutes,
    ROUND(AVG(p80_duration_minutes), 0) AS consensus_p80_minutes,
    ROUND(AVG(p90_duration_minutes), 0) AS consensus_p90_minutes,
    ROUND(AVG(coefficient_of_variation), 3) AS avg_coefficient_of_variation
FROM public.or_case_duration_prediction_models
GROUP BY facility_id, primary_cpt_code, procedure_name, specialty_code;

-- 6. Row-Level Security (RLS) Multi-Tenancy Enforcement
ALTER TABLE public.or_case_duration_prediction_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.or_case_duration_predictions_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY rls_or_case_duration_prediction_models_facility ON public.or_case_duration_prediction_models
    FOR ALL
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

CREATE POLICY rls_or_case_duration_predictions_log_facility ON public.or_case_duration_predictions_log
    FOR ALL
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

