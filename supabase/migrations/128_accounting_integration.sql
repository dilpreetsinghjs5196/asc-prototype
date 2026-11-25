-- ==============================================================================
-- Migration: 128_accounting_integration.sql
-- Module 15: Enterprise Healthcare Integrations (Phase F6)
-- Description: General Ledger (GL) ERP Integration (NetSuite, QuickBooks, Sage),
--              Chart of Accounts (COA) Mapping, Double-Entry Journal Entry Engine,
--              Bank & Sub-Ledger Reconciliation, and Financial Balancing Provenance.
-- ==============================================================================

-- 1. Accounting Connector Configuration Table
CREATE TABLE IF NOT EXISTS public.accounting_connector_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    accounting_vendor VARCHAR(64) NOT NULL DEFAULT 'NETSUITE' CHECK (
        accounting_vendor IN ('NETSUITE', 'QUICKBOOKS_ONLINE', 'SAGE_INTACCT', 'WORKDAY', 'DYNAMICS_365')
    ),
    gateway_mode VARCHAR(32) NOT NULL DEFAULT 'REST_API' CHECK (
        gateway_mode IN ('REST_API', 'SFTP_EXPORT', 'HYBRID')
    ),
    api_endpoint_url VARCHAR(255) NOT NULL,
    subsidiary_company_id VARCHAR(64) NOT NULL,
    client_id VARCHAR(128) NOT NULL,
    client_secret_encrypted TEXT,
    auto_post_schedule VARCHAR(32) NOT NULL DEFAULT 'NIGHTLY_CLOSE',
    current_accounting_period VARCHAR(16) NOT NULL DEFAULT '2026-02',
    lock_closed_periods BOOLEAN NOT NULL DEFAULT TRUE,
    connection_status VARCHAR(24) NOT NULL DEFAULT 'CONNECTED' CHECK (
        connection_status IN ('CONNECTED', 'POSTING', 'PAUSED', 'ERROR', 'DISCONNECTED')
    ),
    health_status VARCHAR(24) NOT NULL DEFAULT 'HEALTHY' CHECK (
        health_status IN ('HEALTHY', 'DEGRADED', 'UNHEALTHY')
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_accounting_config UNIQUE (facility_id)
);

-- 2. Chart of Accounts Mapping Table
CREATE TABLE IF NOT EXISTS public.accounting_chart_of_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    account_code VARCHAR(32) NOT NULL,
    account_name VARCHAR(128) NOT NULL,
    account_type VARCHAR(32) NOT NULL CHECK (
        account_type IN ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'CONTRA_REVENUE', 'EXPENSE')
    ),
    category_mapping VARCHAR(48) NOT NULL CHECK (
        category_mapping IN (
            'OPERATING_CASH', 'ACCOUNTS_RECEIVABLE', 'ALLOWANCE_DOUBTFUL_ACCOUNTS',
            'PROCEDURAL_REVENUE', 'IMPLANT_REVENUE', 'SUPPLY_REVENUE',
            'CONTRACTUAL_ADJUSTMENT', 'BAD_DEBT_WRITEOFF', 'PATIENT_REFUND_LIABILITY'
        )
    ),
    normal_balance VARCHAR(8) NOT NULL CHECK (normal_balance IN ('DEBIT', 'CREDIT')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_account_code UNIQUE (facility_id, account_code)
);

-- 3. Accounting Journal Batches Table
CREATE TABLE IF NOT EXISTS public.accounting_journal_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    batch_control_number VARCHAR(64) NOT NULL,
    period_code VARCHAR(16) NOT NULL,
    batch_type VARCHAR(32) NOT NULL CHECK (
        batch_type IN ('DAILY_CASH_POSTING', 'ACCRUED_BILLING', 'MONTH_END_ADJUSTMENT', 'REVENUE_RECOGNITION')
    ),
    status VARCHAR(24) NOT NULL DEFAULT 'POSTED' CHECK (
        status IN ('DRAFT', 'VALIDATING', 'POSTED', 'RECONCILED', 'VOIDED', 'EXPORT_FAILED')
    ),
    total_debit NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    total_credit NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    variance_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    is_balanced BOOLEAN NOT NULL DEFAULT TRUE,
    line_count INT NOT NULL DEFAULT 0,
    duration_ms INT NOT NULL DEFAULT 0,
    sha256_sync_seal VARCHAR(128) NOT NULL,
    posted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_journal_batch UNIQUE (facility_id, batch_control_number)
);

-- 4. Accounting Journal Lines Table
CREATE TABLE IF NOT EXISTS public.accounting_journal_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    batch_id UUID NOT NULL REFERENCES public.accounting_journal_batches(id) ON DELETE CASCADE,
    line_number INT NOT NULL,
    account_code VARCHAR(32) NOT NULL,
    account_name VARCHAR(128) NOT NULL,
    department_code VARCHAR(32) NOT NULL DEFAULT 'OR_SURGICAL',
    debit_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    credit_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    description TEXT NOT NULL,
    reference_id VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Accounting Reconciliation Records Table
CREATE TABLE IF NOT EXISTS public.accounting_reconciliation_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    reconciliation_code VARCHAR(64) NOT NULL,
    reconciliation_date DATE NOT NULL,
    subledger_cash_amount NUMERIC(14,2) NOT NULL,
    gl_bank_deposit_amount NUMERIC(14,2) NOT NULL,
    variance_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00,
    status VARCHAR(24) NOT NULL DEFAULT 'RECONCILED' CHECK (
        status IN ('RECONCILED', 'VARIANCE_FLAGGED', 'UNDER_INVESTIGATION')
    ),
    reconciled_by VARCHAR(64) NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unq_facility_recon_code UNIQUE (facility_id, reconciliation_code)
);

-- 6. Accounting Exception Logs Table
CREATE TABLE IF NOT EXISTS public.accounting_exception_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    batch_id UUID REFERENCES public.accounting_journal_batches(id) ON DELETE SET NULL,
    exception_code VARCHAR(32) NOT NULL,
    exception_category VARCHAR(32) NOT NULL CHECK (
        exception_category IN ('IMBALANCE_VARIANCE', 'UNMAPPED_COA', 'CLOSED_PERIOD', 'EXPORT_TIMEOUT')
    ),
    severity VARCHAR(16) NOT NULL CHECK (severity IN ('CRITICAL', 'WARNING', 'INFO')),
    offending_account VARCHAR(64),
    resolution_action VARCHAR(64) NOT NULL DEFAULT 'PENDING_FINANCE_REVIEW',
    is_resolved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Accounting Provenance Ledger Table
CREATE TABLE IF NOT EXISTS public.accounting_provenance_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
    batch_id UUID REFERENCES public.accounting_journal_batches(id) ON DELETE CASCADE,
    event_type VARCHAR(48) NOT NULL,
    records_impacted INT NOT NULL DEFAULT 0,
    sha256_seal VARCHAR(128) NOT NULL,
    operator_id VARCHAR(64) NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_acc_config_fac ON public.accounting_connector_configs(facility_id);
CREATE INDEX IF NOT EXISTS idx_acc_coa_fac_cat ON public.accounting_chart_of_accounts(facility_id, category_mapping);
CREATE INDEX IF NOT EXISTS idx_acc_batches_fac_date ON public.accounting_journal_batches(facility_id, posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_acc_lines_batch ON public.accounting_journal_lines(batch_id);
CREATE INDEX IF NOT EXISTS idx_acc_recon_fac_date ON public.accounting_reconciliation_records(facility_id, reconciliation_date DESC);
CREATE INDEX IF NOT EXISTS idx_acc_exceptions_fac_res ON public.accounting_exception_logs(facility_id, is_resolved);
CREATE INDEX IF NOT EXISTS idx_acc_provenance_fac ON public.accounting_provenance_ledger(facility_id, created_at DESC);

-- Enable Row Level Security (RLS) on all tables
ALTER TABLE public.accounting_connector_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_chart_of_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_journal_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_reconciliation_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_exception_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_provenance_ledger ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies
DROP POLICY IF EXISTS p_acc_config_tenant ON public.accounting_connector_configs;
CREATE POLICY p_acc_config_tenant ON public.accounting_connector_configs
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS p_acc_coa_tenant ON public.accounting_chart_of_accounts;
CREATE POLICY p_acc_coa_tenant ON public.accounting_chart_of_accounts
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS p_acc_batches_tenant ON public.accounting_journal_batches;
CREATE POLICY p_acc_batches_tenant ON public.accounting_journal_batches
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS p_acc_lines_tenant ON public.accounting_journal_lines;
CREATE POLICY p_acc_lines_tenant ON public.accounting_journal_lines
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS p_acc_recon_tenant ON public.accounting_reconciliation_records;
CREATE POLICY p_acc_recon_tenant ON public.accounting_reconciliation_records
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS p_acc_exceptions_tenant ON public.accounting_exception_logs;
CREATE POLICY p_acc_exceptions_tenant ON public.accounting_exception_logs
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

DROP POLICY IF EXISTS p_acc_provenance_tenant ON public.accounting_provenance_ledger;
CREATE POLICY p_acc_provenance_tenant ON public.accounting_provenance_ledger
    USING (facility_id = NULLIF(current_setting('app.current_facility_id', true), '')::uuid);

-- Real-time Telemetry Aggregation View
CREATE OR REPLACE VIEW public.vw_accounting_integration_telemetry AS
SELECT
    c.facility_id,
    c.accounting_vendor,
    c.gateway_mode,
    c.connection_status,
    c.health_status,
    c.current_accounting_period,
    COALESCE(COUNT(b.id) FILTER (WHERE b.posted_at >= NOW() - INTERVAL '30 days'), 0)::INT AS journal_batches_posted_30d,
    COALESCE(SUM(b.total_debit) FILTER (WHERE b.posted_at >= NOW() - INTERVAL '30 days'), 0.00)::NUMERIC(14,2) AS total_debits_posted_30d,
    ROUND(
        COALESCE(
            COUNT(b.id) FILTER (WHERE b.is_balanced = TRUE)::NUMERIC /
            NULLIF(COUNT(b.id), 0) * 100,
            100.0
        ),
        1
    )::NUMERIC(5,1) AS double_entry_balance_pct,
    COALESCE(SUM(r.gl_bank_deposit_amount) FILTER (WHERE r.status = 'RECONCILED' AND r.reconciliation_date >= DATE_TRUNC('month', CURRENT_DATE)), 0.00)::NUMERIC(14,2) AS reconciled_cash_mtd,
    COALESCE(AVG(b.duration_ms) FILTER (WHERE b.posted_at >= NOW() - INTERVAL '30 days'), 185.0)::INT AS avg_erp_latency_ms,
    COALESCE(COUNT(e.id) FILTER (WHERE e.is_resolved = FALSE), 0)::INT AS active_exceptions_count,
    MAX(b.posted_at) AS last_journal_post_at,
    (SELECT sha256_sync_seal FROM public.accounting_journal_batches WHERE facility_id = c.facility_id ORDER BY created_at DESC LIMIT 1) AS latest_sync_seal
FROM public.accounting_connector_configs c
LEFT JOIN public.accounting_journal_batches b ON c.facility_id = b.facility_id
LEFT JOIN public.accounting_reconciliation_records r ON c.facility_id = r.facility_id
LEFT JOIN public.accounting_exception_logs e ON c.facility_id = e.facility_id
GROUP BY c.facility_id, c.accounting_vendor, c.gateway_mode, c.connection_status, c.health_status, c.current_accounting_period;

-- Seed Data for Naples Surgery Center (fac-naples-01 / 00000000-0000-0000-0000-000000000002)
DO $$
DECLARE
    naples_id UUID;
    batch_1_id UUID := gen_random_uuid();
    batch_2_id UUID := gen_random_uuid();
BEGIN
    SELECT id INTO naples_id FROM public.facilities
    WHERE id = '00000000-0000-0000-0000-000000000002' OR name ILIKE '%Naples%'
    LIMIT 1;

    IF naples_id IS NOT NULL THEN
        -- Seed Active Accounting ERP Configuration
        INSERT INTO public.accounting_connector_configs (
            facility_id, accounting_vendor, gateway_mode, api_endpoint_url,
            subsidiary_company_id, client_id, client_secret_encrypted,
            auto_post_schedule, current_accounting_period, lock_closed_periods,
            connection_status, health_status
        ) VALUES (
            naples_id,
            'NETSUITE',
            'REST_API',
            'https://api.netsuite.com/app/suiteconnect/v1/journal',
            'SUB-NAPLES-ASC-01',
            'ns_client_naples_asc_prod',
            'enc_v2_99a80b12cd83749102837491823749182374918237491823749182374918237',
            'NIGHTLY_CLOSE',
            '2026-02',
            TRUE,
            'CONNECTED',
            'HEALTHY'
        ) ON CONFLICT (facility_id) DO UPDATE SET
            accounting_vendor = EXCLUDED.accounting_vendor,
            connection_status = EXCLUDED.connection_status,
            health_status = EXCLUDED.health_status;

        -- Seed Chart of Accounts
        INSERT INTO public.accounting_chart_of_accounts (
            facility_id, account_code, account_name, account_type, category_mapping, normal_balance, is_active
        ) VALUES
        (naples_id, '1010', 'First Horizon Operating Cash', 'ASSET', 'OPERATING_CASH', 'DEBIT', TRUE),
        (naples_id, '1100', 'Accounts Receivable - Patient & Insurance', 'ASSET', 'ACCOUNTS_RECEIVABLE', 'DEBIT', TRUE),
        (naples_id, '1150', 'Allowance for Doubtful Accounts', 'ASSET', 'ALLOWANCE_DOUBTFUL_ACCOUNTS', 'CREDIT', TRUE),
        (naples_id, '2010', 'Patient Credit Balance & Refund Liability', 'LIABILITY', 'PATIENT_REFUND_LIABILITY', 'CREDIT', TRUE),
        (naples_id, '4010', 'Gross Surgical Procedure Revenue', 'REVENUE', 'PROCEDURAL_REVENUE', 'CREDIT', TRUE),
        (naples_id, '4020', 'Gross Implant & Hardware Revenue', 'REVENUE', 'IMPLANT_REVENUE', 'CREDIT', TRUE),
        (naples_id, '4030', 'Gross Medical Supply Revenue', 'REVENUE', 'SUPPLY_REVENUE', 'CREDIT', TRUE),
        (naples_id, '4090', 'Contractual Allowances & Payer Discounts', 'CONTRA_REVENUE', 'CONTRACTUAL_ADJUSTMENT', 'DEBIT', TRUE),
        (naples_id, '4095', 'Bad Debt Expense & Uncollectible Write-Offs', 'EXPENSE', 'BAD_DEBT_WRITEOFF', 'DEBIT', TRUE)
        ON CONFLICT (facility_id, account_code) DO NOTHING;

        -- Seed Journal Batch 1: Daily Cash Collections & Remittance Posting
        -- Balanced: Debit 1010 ($89,450.00), Credit 1100 ($89,450.00) -> Variance = $0.00
        INSERT INTO public.accounting_journal_batches (
            id, facility_id, batch_control_number, period_code, batch_type, status,
            total_debit, total_credit, variance_amount, is_balanced, line_count,
            duration_ms, sha256_sync_seal, posted_at
        ) VALUES (
            batch_1_id,
            naples_id,
            'GL-BAT-20260224-01',
            '2026-02',
            'DAILY_CASH_POSTING',
            'POSTED',
            89450.00,
            89450.00,
            0.00,
            TRUE,
            2,
            175,
            'sha256_acc_9a189fbc01234567890abcdef1234567890abcdef1234567890abcdef12',
            NOW() - INTERVAL '6 hours'
        ) ON CONFLICT DO NOTHING;

        -- Seed Journal Batch 1 Lines
        INSERT INTO public.accounting_journal_lines (
            facility_id, batch_id, line_number, account_code, account_name,
            department_code, debit_amount, credit_amount, description, reference_id
        ) VALUES
        (naples_id, batch_1_id, 1, '1010', 'First Horizon Operating Cash', 'OR_ADMIN', 89450.00, 0.00, 'Daily 835 ERA EFT Cash Settlement', 'BAT-835-20260224-01'),
        (naples_id, batch_1_id, 2, '1100', 'Accounts Receivable - Patient & Insurance', 'OR_SURGICAL', 0.00, 89450.00, 'A/R Relief for Cash Settlement', 'BAT-835-20260224-01')
        ON CONFLICT DO NOTHING;

        -- Seed Journal Batch 2: Accrued Gross Revenue & Contractual Adjustment
        -- Balanced: Debit 1100 ($142,650.00) & Debit 4090 ($42,100.00); Credit 4010 ($124,500.00) & Credit 4020 ($60,250.00)
        -- Sum Debits: 142,650.00 (A/R Net? Or Gross Revenue):
        -- Let's balance precisely:
        -- Debit 1100 A/R (Gross Billed): $142,650.00
        -- Credit 4010 Surgical Revenue: $105,400.00
        -- Credit 4020 Implant Revenue: $37,250.00
        -- Total Debits = $142,650.00, Total Credits = $142,650.00. Variance = $0.00
        INSERT INTO public.accounting_journal_batches (
            id, facility_id, batch_control_number, period_code, batch_type, status,
            total_debit, total_credit, variance_amount, is_balanced, line_count,
            duration_ms, sha256_sync_seal, posted_at
        ) VALUES (
            batch_2_id,
            naples_id,
            'GL-BAT-20260224-02',
            '2026-02',
            'ACCRUED_BILLING',
            'POSTED',
            142650.00,
            142650.00,
            0.00,
            TRUE,
            3,
            210,
            'sha256_acc_8b290acd1234567890abcdef1234567890abcdef1234567890abcdef13',
            NOW() - INTERVAL '3 hours'
        ) ON CONFLICT DO NOTHING;

        -- Seed Journal Batch 2 Lines
        INSERT INTO public.accounting_journal_lines (
            facility_id, batch_id, line_number, account_code, account_name,
            department_code, debit_amount, credit_amount, description, reference_id
        ) VALUES
        (naples_id, batch_2_id, 1, '1100', 'Accounts Receivable - Patient & Insurance', 'OR_SURGICAL', 142650.00, 0.00, 'Gross Claim Billing Accrual 837 Batch', 'BAT-837I-20260224-01'),
        (naples_id, batch_2_id, 2, '4010', 'Gross Surgical Procedure Revenue', 'OR_SURGICAL', 0.00, 105400.00, 'Surgical Procedure Fees (28 Encounters)', 'BAT-837I-20260224-01'),
        (naples_id, batch_2_id, 3, '4020', 'Gross Implant & Hardware Revenue', 'OR_SURGICAL', 0.00, 37250.00, 'Implant Construct Pass-Throughs', 'BAT-837I-20260224-01')
        ON CONFLICT DO NOTHING;

        -- Seed Bank Reconciliation Record (Balanced: Subledger $89,450.00 == Bank $89,450.00)
        INSERT INTO public.accounting_reconciliation_records (
            facility_id, reconciliation_code, reconciliation_date, subledger_cash_amount,
            gl_bank_deposit_amount, variance_amount, status, reconciled_by, notes
        ) VALUES (
            naples_id,
            'REC-20260224-01',
            CURRENT_DATE - INTERVAL '1 day',
            89450.00,
            89450.00,
            0.00,
            'RECONCILED',
            'finance_lead@naplesasc.com',
            'Automated daily settlement matched First Horizon EFT batch trace EFT-99102938102.'
        ) ON CONFLICT (facility_id, reconciliation_code) DO NOTHING;

        -- Seed Provenance Record
        INSERT INTO public.accounting_provenance_ledger (
            facility_id, batch_id, event_type, records_impacted, sha256_seal, operator_id, metadata
        ) VALUES (
            naples_id,
            batch_1_id,
            'GL_JOURNAL_POSTED',
            2,
            'sha256_acc_9a189fbc01234567890abcdef1234567890abcdef1234567890abcdef12',
            'accounting_scheduler',
            '{"erp": "NETSUITE", "subsidiary": "SUB-NAPLES-ASC-01", "period": "2026-02", "debit_total": 89450.00}'::jsonb
        ) ON CONFLICT DO NOTHING;

    END IF;
END $$;
