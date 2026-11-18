-- ==============================================================================
-- Migration 106: AI Benchmark & Evaluation Framework
-- Phase C8: Module 12 AI & Intelligence
-- ==============================================================================

-- 1. Benchmark Suites Table
CREATE TABLE IF NOT EXISTS public.ai_benchmark_suites (
    id VARCHAR(64) PRIMARY KEY,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    suite_code VARCHAR(32) NOT NULL UNIQUE,
    name VARCHAR(128) NOT NULL,
    description TEXT NOT NULL,
    target_model VARCHAR(64) NOT NULL DEFAULT 'gemini-2.5-flash',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_benchmark_suites_facility ON public.ai_benchmark_suites(facility_id, is_active);

-- 2. Benchmark Questions Table (Golden ground-truth evaluation queries)
CREATE TABLE IF NOT EXISTS public.ai_benchmark_questions (
    id VARCHAR(64) PRIMARY KEY,
    suite_id VARCHAR(64) NOT NULL REFERENCES public.ai_benchmark_suites(id) ON DELETE CASCADE,
    benchmark_code VARCHAR(32) NOT NULL UNIQUE,
    domain VARCHAR(32) NOT NULL CHECK (domain IN ('CASE', 'SURGEON', 'IMPLANT', 'PAYER', 'CPT', 'OR', 'SCENARIO', 'HALLUCINATION_TRAP')),
    question_text TEXT NOT NULL,
    clinical_intent VARCHAR(128) NOT NULL,
    expected_tool_id VARCHAR(64) NOT NULL,
    expected_parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
    expected_numerical_assertions JSONB NOT NULL DEFAULT '[]'::jsonb,
    expected_citations JSONB NOT NULL DEFAULT '[]'::jsonb,
    tolerance_pct NUMERIC(4, 2) NOT NULL DEFAULT 0.00,
    is_hallucination_trap BOOLEAN NOT NULL DEFAULT FALSE,
    weight NUMERIC(4, 2) NOT NULL DEFAULT 1.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_benchmark_questions_suite ON public.ai_benchmark_questions(suite_id, domain);

-- 3. Benchmark Runs Table (Executed evaluations and composite grading)
CREATE TABLE IF NOT EXISTS public.ai_benchmark_runs (
    id VARCHAR(64) PRIMARY KEY,
    suite_id VARCHAR(64) NOT NULL REFERENCES public.ai_benchmark_suites(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    run_code VARCHAR(32) NOT NULL,
    run_by VARCHAR(64) NOT NULL,
    total_benchmarks INTEGER NOT NULL,
    passed_benchmarks INTEGER NOT NULL,
    failed_benchmarks INTEGER NOT NULL,
    composite_score_pct NUMERIC(5, 2) NOT NULL,
    tool_accuracy_pct NUMERIC(5, 2) NOT NULL,
    number_accuracy_pct NUMERIC(5, 2) NOT NULL,
    citation_completeness_pct NUMERIC(5, 2) NOT NULL,
    safety_guardrail_pct NUMERIC(5, 2) NOT NULL,
    avg_latency_ms NUMERIC(8, 2) NOT NULL DEFAULT 0.0,
    run_status VARCHAR(32) NOT NULL DEFAULT 'COMPLETED' CHECK (run_status IN ('RUNNING', 'COMPLETED', 'FAILED')),
    verification_hash VARCHAR(64) NOT NULL,
    executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_benchmark_runs_facility ON public.ai_benchmark_runs(facility_id, executed_at DESC);

-- 4. Benchmark Results Table (Per-question evaluation breakdown)
CREATE TABLE IF NOT EXISTS public.ai_benchmark_results (
    id VARCHAR(64) PRIMARY KEY,
    run_id VARCHAR(64) NOT NULL REFERENCES public.ai_benchmark_runs(id) ON DELETE CASCADE,
    question_id VARCHAR(64) NOT NULL REFERENCES public.ai_benchmark_questions(id) ON DELETE CASCADE,
    passed BOOLEAN NOT NULL,
    actual_tool_id VARCHAR(64),
    tool_matched BOOLEAN NOT NULL,
    params_matched BOOLEAN NOT NULL,
    numbers_matched BOOLEAN NOT NULL,
    citations_matched BOOLEAN NOT NULL,
    safety_passed BOOLEAN NOT NULL,
    actual_response_summary TEXT,
    failure_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
    latency_ms NUMERIC(8, 2) NOT NULL DEFAULT 0.0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_benchmark_results_run ON public.ai_benchmark_results(run_id, passed);

-- 5. Telemetry Aggregation View
CREATE OR REPLACE VIEW public.vw_ai_benchmark_suite_telemetry AS
SELECT
    r.facility_id,
    COUNT(DISTINCT r.id) AS total_evaluation_runs,
    COALESCE(ROUND(AVG(r.composite_score_pct), 1), 0.0) AS avg_composite_score_pct,
    COALESCE(ROUND(AVG(r.tool_accuracy_pct), 1), 0.0) AS avg_tool_accuracy_pct,
    COALESCE(ROUND(AVG(r.number_accuracy_pct), 1), 0.0) AS avg_number_accuracy_pct,
    COALESCE(ROUND(AVG(r.citation_completeness_pct), 1), 0.0) AS avg_citation_completeness_pct,
    COALESCE(ROUND(AVG(r.safety_guardrail_pct), 1), 0.0) AS avg_safety_guardrail_pct,
    COALESCE(ROUND(AVG(r.avg_latency_ms), 1), 0.0) AS avg_run_latency_ms,
    MAX(r.executed_at) AS last_evaluated_at
FROM public.ai_benchmark_runs r
GROUP BY r.facility_id;

-- 6. Row-Level Security Policies (Multi-Tenancy Isolation)
ALTER TABLE public.ai_benchmark_suites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_benchmark_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_benchmark_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_benchmark_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_benchmark_suites_facility_isolation
ON public.ai_benchmark_suites
FOR ALL
USING (
    facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
)
WITH CHECK (
    facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
);

CREATE POLICY ai_benchmark_questions_facility_isolation
ON public.ai_benchmark_questions
FOR ALL
USING (
    suite_id IN (
        SELECT id FROM public.ai_benchmark_suites
        WHERE facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
    )
);

CREATE POLICY ai_benchmark_runs_facility_isolation
ON public.ai_benchmark_runs
FOR ALL
USING (
    facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
)
WITH CHECK (
    facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
);

CREATE POLICY ai_benchmark_results_facility_isolation
ON public.ai_benchmark_results
FOR ALL
USING (
    run_id IN (
        SELECT id FROM public.ai_benchmark_runs
        WHERE facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid
    )
);
