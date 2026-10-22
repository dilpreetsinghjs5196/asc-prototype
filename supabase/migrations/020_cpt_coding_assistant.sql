-- ==============================================================================
-- MIGRATION 020: CPT CODING ASSISTANT & HUMAN-IN-THE-LOOP APPROVAL (PHASE 43)
-- ==============================================================================
-- Description: Establishes production AI coding assistant infrastructure:
--              1. cpt_coding_sessions (tracks document hashing, encounter context, model version)
--              2. cpt_coding_candidates (isolated AI recommendations with document excerpts & confidence)
--              3. cpt_coding_reviews (immutable audit trail of human coder decisions)
--              4. fn_commit_cpt_coding_candidate (atomic approval & promotion to surgery_procedures)
--              5. fn_reject_cpt_coding_candidate (coder rejection with rationale logging)
--              6. Row Level Security (RLS) policies enforcing multi-tenant isolation.
-- Author: Antigravity Agentic Platform
-- Date: 2026-10-22
-- ==============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 1. CODING SESSIONS TABLE
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.cpt_coding_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    source_document_text TEXT NOT NULL,
    source_document_hash VARCHAR(64) NOT NULL, -- SHA-256 hash of operative notes
    model_name VARCHAR(100) NOT NULL DEFAULT 'gemini-2.5-flash',
    prompt_version VARCHAR(50) NOT NULL DEFAULT 'v1.0.0',
    session_status VARCHAR(20) NOT NULL DEFAULT 'completed'
        CHECK (session_status IN ('in_progress', 'completed', 'failed', 'stale')),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ccs_case ON public.cpt_coding_sessions(case_id);
CREATE INDEX IF NOT EXISTS idx_ccs_facility ON public.cpt_coding_sessions(facility_id);
CREATE INDEX IF NOT EXISTS idx_ccs_created_at ON public.cpt_coding_sessions(created_at DESC);

-- ==============================================================================
-- 2. CODING CANDIDATES TABLE
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.cpt_coding_candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.cpt_coding_sessions(id) ON DELETE CASCADE,
    cpt_master_id UUID REFERENCES public.cpt_master(id) ON DELETE SET NULL,
    cpt_code VARCHAR(10) NOT NULL,
    sequence_rank INTEGER NOT NULL DEFAULT 1,
    is_primary_recommendation BOOLEAN NOT NULL DEFAULT false,
    confidence_score NUMERIC(3, 2) NOT NULL DEFAULT 0.50
        CHECK (confidence_score >= 0.00 AND confidence_score <= 1.00),
    documentation_excerpt TEXT, -- Exact verbatim excerpt from clinical notes supporting code
    clinical_rationale TEXT, -- Narrative clinical justification
    identified_warnings TEXT[] NOT NULL DEFAULT '{}',
    suggested_modifiers TEXT[] NOT NULL DEFAULT '{}',
    suggested_laterality VARCHAR(20) NOT NULL DEFAULT 'NOT_APPLICABLE'
        CHECK (suggested_laterality IN ('LEFT', 'RIGHT', 'BILATERAL', 'NOT_APPLICABLE', 'UNSPECIFIED')),
    review_decision VARCHAR(25) NOT NULL DEFAULT 'pending'
        CHECK (review_decision IN ('pending', 'approved', 'rejected', 'modified', 'clarification_requested')),
    reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    review_rationale TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_session_cpt UNIQUE (session_id, cpt_code)
);

CREATE INDEX IF NOT EXISTS idx_ccc_session ON public.cpt_coding_candidates(session_id);
CREATE INDEX IF NOT EXISTS idx_ccc_cpt_code ON public.cpt_coding_candidates(cpt_code);
CREATE INDEX IF NOT EXISTS idx_ccc_decision ON public.cpt_coding_candidates(review_decision);

-- ==============================================================================
-- 3. CODING REVIEWS AUDIT PROVENANCE TABLE
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.cpt_coding_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id UUID NOT NULL REFERENCES public.cpt_coding_candidates(id) ON DELETE CASCADE,
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    reviewer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action VARCHAR(30) NOT NULL
        CHECK (action IN ('approved', 'rejected', 'modified', 'clarification_requested')),
    previous_status VARCHAR(25) NOT NULL,
    new_status VARCHAR(25) NOT NULL,
    review_rationale TEXT,
    committed_procedure_id UUID REFERENCES public.surgery_procedures(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ccr_candidate ON public.cpt_coding_reviews(candidate_id);
CREATE INDEX IF NOT EXISTS idx_ccr_facility ON public.cpt_coding_reviews(facility_id);
CREATE INDEX IF NOT EXISTS idx_ccr_reviewer ON public.cpt_coding_reviews(reviewer_id);

-- ==============================================================================
-- 4. AUTHORITATIVE CANDIDATE COMMIT RPC
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.fn_commit_cpt_coding_candidate(
    p_candidate_id UUID,
    p_review_rationale TEXT DEFAULT NULL,
    p_override_modifiers TEXT[] DEFAULT NULL,
    p_override_laterality VARCHAR(20) DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_cand RECORD;
    v_session RECORD;
    v_case RECORD;
    v_cpt RECORD;
    v_proc_id UUID;
    v_user_id UUID := auth.uid();
BEGIN
    -- 1. Fetch candidate and verify state
    SELECT * INTO v_cand FROM public.cpt_coding_candidates WHERE id = p_candidate_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Candidate not found');
    END IF;

    IF v_cand.review_decision = 'approved' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Candidate already approved');
    END IF;

    -- 2. Fetch session and case
    SELECT * INTO v_session FROM public.cpt_coding_sessions WHERE id = v_cand.session_id;
    SELECT * INTO v_case FROM public.cases WHERE id = v_session.case_id;

    -- 3. Verify user has facility access and permissions
    IF v_user_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.facility_memberships fm
        WHERE fm.facility_id = v_session.facility_id 
          AND fm.user_id = v_user_id 
          AND fm.role IN ('super_admin', 'facility_admin', 'clinical_coder', 'director_of_nursing')
          AND fm.is_active = true
    ) AND (auth.jwt()->>'role') != 'service_role' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Access Denied: Insufficient coding permissions');
    END IF;

    -- 4. Verify CPT is active on Date of Service
    SELECT m.id AS master_id, m.code, m.description, v.gross_charge, v.reimbursement
    INTO v_cpt
    FROM public.cpt_master m
    JOIN public.cpt_code_versions v ON v.cpt_master_id = m.id
    WHERE m.code = v_cand.cpt_code
      AND m.is_active = true
      AND (v.effective_date <= v_case.scheduled_start_time::DATE)
      AND (v.termination_date IS NULL OR v.termination_date >= v_case.scheduled_start_time::DATE)
    ORDER BY v.effective_date DESC
    LIMIT 1;

    -- Fallback to latest version if no version active on exact scheduled date
    IF NOT FOUND THEN
        SELECT m.id AS master_id, m.code, m.description, v.gross_charge, v.reimbursement
        INTO v_cpt
        FROM public.cpt_master m
        JOIN public.cpt_code_versions v ON v.cpt_master_id = m.id
        WHERE m.code = v_cand.cpt_code
          AND m.is_active = true
        ORDER BY v.effective_date DESC
        LIMIT 1;
    END IF;

    IF NOT FOUND THEN
        -- Legacy cpt_codes fallback
        SELECT id AS master_id, code, description, gross_charge, reimbursement
        INTO v_cpt
        FROM public.cpt_codes
        WHERE code = v_cand.cpt_code AND is_active = true
        LIMIT 1;
    END IF;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'CPT code is inactive or unpriced');
    END IF;

    -- 5. Insert into official surgery_procedures line items
    INSERT INTO public.surgery_procedures (
        case_id,
        facility_id,
        cpt_code_id,
        cpt_code,
        procedure_description,
        is_primary,
        units,
        modifiers,
        laterality,
        coding_status,
        source_system,
        line_gross_charge,
        line_expected_reimbursement,
        coded_by,
        coded_at,
        created_at
    )
    VALUES (
        v_case.id,
        v_session.facility_id,
        v_cpt.master_id,
        v_cpt.code,
        v_cpt.description,
        v_cand.is_primary_recommendation,
        1,
        COALESCE(p_override_modifiers, v_cand.suggested_modifiers),
        COALESCE(p_override_laterality, v_cand.suggested_laterality),
        'Coded',
        'AI_ASSISTED',
        COALESCE(v_cpt.gross_charge, 0.00),
        COALESCE(v_cpt.reimbursement, 0.00),
        v_user_id,
        NOW(),
        NOW()
    )
    RETURNING id INTO v_proc_id;

    -- 6. Update candidate status
    UPDATE public.cpt_coding_candidates
    SET review_decision = 'approved',
        reviewed_by = v_user_id,
        reviewed_at = NOW(),
        review_rationale = p_review_rationale,
        updated_at = NOW()
    WHERE id = p_candidate_id;

    -- 7. Record immutable audit log
    INSERT INTO public.cpt_coding_reviews (
        candidate_id,
        facility_id,
        reviewer_id,
        action,
        previous_status,
        new_status,
        review_rationale,
        committed_procedure_id,
        created_at
    )
    VALUES (
        p_candidate_id,
        v_session.facility_id,
        v_user_id,
        'approved',
        v_cand.review_decision,
        'approved',
        p_review_rationale,
        v_proc_id,
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'candidate_id', p_candidate_id,
        'procedure_id', v_proc_id,
        'cpt_code', v_cpt.code
    );
END;
$$;

-- ==============================================================================
-- 5. CANDIDATE REJECTION RPC
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.fn_reject_cpt_coding_candidate(
    p_candidate_id UUID,
    p_rejection_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_cand RECORD;
    v_session RECORD;
    v_user_id UUID := auth.uid();
BEGIN
    SELECT * INTO v_cand FROM public.cpt_coding_candidates WHERE id = p_candidate_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Candidate not found');
    END IF;

    SELECT * INTO v_session FROM public.cpt_coding_sessions WHERE id = v_cand.session_id;

    -- Update candidate decision
    UPDATE public.cpt_coding_candidates
    SET review_decision = 'rejected',
        reviewed_by = v_user_id,
        reviewed_at = NOW(),
        review_rationale = p_rejection_reason,
        updated_at = NOW()
    WHERE id = p_candidate_id;

    -- Audit log
    INSERT INTO public.cpt_coding_reviews (
        candidate_id,
        facility_id,
        reviewer_id,
        action,
        previous_status,
        new_status,
        review_rationale,
        created_at
    )
    VALUES (
        p_candidate_id,
        v_session.facility_id,
        v_user_id,
        'rejected',
        v_cand.review_decision,
        'rejected',
        p_rejection_reason,
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'candidate_id', p_candidate_id,
        'review_decision', 'rejected'
    );
END;
$$;

-- ==============================================================================
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE public.cpt_coding_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cpt_coding_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cpt_coding_reviews ENABLE ROW LEVEL SECURITY;

-- 6.1 cpt_coding_sessions RLS
CREATE POLICY rls_ccs_select ON public.cpt_coding_sessions
    FOR SELECT TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.facility_memberships fm
            WHERE fm.facility_id = cpt_coding_sessions.facility_id
              AND fm.user_id = auth.uid()
              AND fm.is_active = true
        )
        OR EXISTS (
            SELECT 1 FROM public.users u 
            WHERE u.id::text = auth.uid()::text AND u.role = 'super_admin'
        )
        OR (auth.jwt()->>'role') = 'service_role'
    );

CREATE POLICY rls_ccs_insert ON public.cpt_coding_sessions
    FOR INSERT TO authenticated WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.facility_memberships fm
            WHERE fm.facility_id = cpt_coding_sessions.facility_id
              AND fm.user_id = auth.uid()
              AND fm.is_active = true
        )
        OR EXISTS (
            SELECT 1 FROM public.users u 
            WHERE u.id::text = auth.uid()::text AND u.role IN ('super_admin', 'facility_admin', 'clinical_coder')
        )
        OR (auth.jwt()->>'role') = 'service_role'
    );

-- 6.2 cpt_coding_candidates RLS
CREATE POLICY rls_ccc_select ON public.cpt_coding_candidates
    FOR SELECT TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.cpt_coding_sessions s
            JOIN public.facility_memberships fm ON fm.facility_id = s.facility_id
            WHERE s.id = cpt_coding_candidates.session_id
              AND fm.user_id = auth.uid()
              AND fm.is_active = true
        )
        OR EXISTS (
            SELECT 1 FROM public.users u 
            WHERE u.id::text = auth.uid()::text AND u.role = 'super_admin'
        )
        OR (auth.jwt()->>'role') = 'service_role'
    );

CREATE POLICY rls_ccc_update ON public.cpt_coding_candidates
    FOR UPDATE TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.cpt_coding_sessions s
            JOIN public.facility_memberships fm ON fm.facility_id = s.facility_id
            WHERE s.id = cpt_coding_candidates.session_id
              AND fm.user_id = auth.uid()
              AND fm.is_active = true
        )
        OR EXISTS (
            SELECT 1 FROM public.users u 
            WHERE u.id::text = auth.uid()::text AND u.role IN ('super_admin', 'facility_admin', 'clinical_coder')
        )
        OR (auth.jwt()->>'role') = 'service_role'
    );

CREATE POLICY rls_ccc_insert ON public.cpt_coding_candidates
    FOR INSERT TO authenticated WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.cpt_coding_sessions s
            JOIN public.facility_memberships fm ON fm.facility_id = s.facility_id
            WHERE s.id = cpt_coding_candidates.session_id
              AND fm.user_id = auth.uid()
              AND fm.is_active = true
        )
        OR EXISTS (
            SELECT 1 FROM public.users u 
            WHERE u.id::text = auth.uid()::text AND u.role IN ('super_admin', 'facility_admin', 'clinical_coder')
        )
        OR (auth.jwt()->>'role') = 'service_role'
    );

-- 6.3 cpt_coding_reviews RLS (Append-Only)
CREATE POLICY rls_ccr_select ON public.cpt_coding_reviews
    FOR SELECT TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.facility_memberships fm
            WHERE fm.facility_id = cpt_coding_reviews.facility_id
              AND fm.user_id = auth.uid()
              AND fm.is_active = true
        )
        OR EXISTS (
            SELECT 1 FROM public.users u 
            WHERE u.id::text = auth.uid()::text AND u.role = 'super_admin'
        )
        OR (auth.jwt()->>'role') = 'service_role'
    );

CREATE POLICY rls_ccr_insert ON public.cpt_coding_reviews
    FOR INSERT TO authenticated WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.facility_memberships fm
            WHERE fm.facility_id = cpt_coding_reviews.facility_id
              AND fm.user_id = auth.uid()
              AND fm.is_active = true
        )
        OR EXISTS (
            SELECT 1 FROM public.users u 
            WHERE u.id::text = auth.uid()::text AND u.role IN ('super_admin', 'facility_admin', 'clinical_coder')
        )
        OR (auth.jwt()->>'role') = 'service_role'
    );

-- Disallow direct UPDATE or DELETE to preserve immutable audit trail
CREATE POLICY rls_ccr_no_update ON public.cpt_coding_reviews FOR UPDATE TO authenticated USING (false);
CREATE POLICY rls_ccr_no_delete ON public.cpt_coding_reviews FOR DELETE TO authenticated USING (false);

COMMIT;
