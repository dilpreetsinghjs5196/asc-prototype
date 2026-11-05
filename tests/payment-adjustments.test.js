import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

import paymentAdjustmentService, {
  TRANSACTION_TYPES,
  BATCH_TYPES,
  BATCH_STATUSES,
  BATCH_STATUS_CONFIG,
  REFUND_STATUSES,
  REFUND_APPROVAL_THRESHOLD_CFO,
  calculatePostingBalances,
  validateBatchBalancing,
  validateRefundApproval,
  calculatePaymentKpis,
  getBaselineSampleData
} from '../src/lib/paymentAdjustmentService.js';

describe('Phase 83 — Payments, Adjustments & Cash Posting Suite', () => {

  describe('1. Domain Enums & System Constants', () => {
    it('should export authoritative transaction types with credit flags', () => {
      assert.ok(TRANSACTION_TYPES.PAYER_PAYMENT);
      assert.equal(TRANSACTION_TYPES.PAYER_PAYMENT.isCredit, true);
      assert.ok(TRANSACTION_TYPES.PATIENT_PAYMENT);
      assert.equal(TRANSACTION_TYPES.PATIENT_PAYMENT.isCredit, true);
      assert.ok(TRANSACTION_TYPES.CONTRACTUAL_ADJUSTMENT);
      assert.equal(TRANSACTION_TYPES.CONTRACTUAL_ADJUSTMENT.isCredit, true);
      assert.ok(TRANSACTION_TYPES.ADMIN_WRITE_OFF);
      assert.equal(TRANSACTION_TYPES.ADMIN_WRITE_OFF.isCredit, true);
      assert.ok(TRANSACTION_TYPES.REFUND);
      assert.equal(TRANSACTION_TYPES.REFUND.isCredit, false);
      assert.ok(TRANSACTION_TYPES.RECOUPMENT);
      assert.equal(TRANSACTION_TYPES.RECOUPMENT.isCredit, false);
    });

    it('should export deposit batch lifecycle statuses & configurations', () => {
      assert.equal(BATCH_STATUSES.OPEN, 'OPEN');
      assert.equal(BATCH_STATUSES.BALANCED_POSTED, 'BALANCED_POSTED');
      assert.equal(BATCH_STATUSES.OUT_OF_BALANCE, 'OUT_OF_BALANCE');
      assert.equal(BATCH_STATUSES.CLOSED_FROZEN, 'CLOSED_FROZEN');
      assert.ok(BATCH_STATUS_CONFIG[BATCH_STATUSES.BALANCED_POSTED]);
    });

    it('should export refund approval statuses and CFO threshold limit', () => {
      assert.equal(REFUND_STATUSES.PENDING_APPROVAL, 'PENDING_APPROVAL');
      assert.equal(REFUND_STATUSES.APPROVED, 'APPROVED');
      assert.equal(REFUND_STATUSES.DISBURSED, 'DISBURSED');
      assert.equal(REFUND_STATUSES.REJECTED, 'REJECTED');
      assert.equal(REFUND_APPROVAL_THRESHOLD_CFO, 250.00);
    });

    it('should provide baseline sample datasets for simulation and initial UI render', () => {
      const data = getBaselineSampleData();
      assert.ok(Array.isArray(data.batches));
      assert.ok(Array.isArray(data.transactions));
      assert.ok(Array.isArray(data.refunds));
      assert.ok(data.batches.length >= 3);
      assert.ok(data.transactions.length >= 6);
      assert.ok(data.refunds.length >= 2);
    });
  });

  describe('2. Authoritative Double-Entry Posting Calculations', () => {
    it('should calculate accurate zero balance when paid and contractual write-off equal charge', () => {
      const grossCharge = 3850.00;
      const transactions = [
        { transactionType: 'PAYER_PAYMENT', amount: 1456.00 },
        { transactionType: 'CONTRACTUAL_ADJUSTMENT', amount: 2394.00 }
      ];

      const balance = calculatePostingBalances(grossCharge, transactions);
      assert.equal(balance.grossCharge, 3850.00);
      assert.equal(balance.totalPayerPaid, 1456.00);
      assert.equal(balance.totalContractualAdjustments, 2394.00);
      assert.equal(balance.totalCredits, 3850.00);
      assert.equal(balance.outstandingArBalance, 0.00);
      assert.equal(balance.isFullySettled, true);
    });

    it('should calculate outstanding balance when patient copay and admin write-off are partial', () => {
      const grossCharge = 1000.00;
      const transactions = [
        { transactionType: 'PAYER_PAYMENT', amount: 600.00 },
        { transactionType: 'CONTRACTUAL_ADJUSTMENT', amount: 200.00 },
        { transactionType: 'PATIENT_PAYMENT', amount: 100.00 },
        { transactionType: 'ADMIN_WRITE_OFF', amount: 20.00 }
      ];

      const balance = calculatePostingBalances(grossCharge, transactions);
      assert.equal(balance.totalCredits, 920.00);
      assert.equal(balance.outstandingArBalance, 80.00);
      assert.equal(balance.isFullySettled, false);
    });

    it('should increase outstanding AR balance when refund or recoupment is applied', () => {
      const grossCharge = 500.00;
      const transactions = [
        { transactionType: 'PAYER_PAYMENT', amount: 500.00 },
        { transactionType: 'REFUND', amount: 50.00 }
      ];

      const balance = calculatePostingBalances(grossCharge, transactions);
      assert.equal(balance.totalPayerPaid, 500.00);
      assert.equal(balance.totalRefunds, 50.00);
      assert.equal(balance.netCashCollected, 450.00);
      assert.equal(balance.outstandingArBalance, 50.00);
      assert.equal(balance.isFullySettled, false);
    });
  });

  describe('3. Batch Balancing Verification', () => {
    it('should validate perfectly balanced batch', () => {
      const result = validateBatchBalancing(5000.00, 5000.00);
      assert.equal(result.isBalanced, true);
      assert.equal(result.variance, 0.00);
      assert.equal(result.status, BATCH_STATUSES.BALANCED_POSTED);
    });

    it('should flag out of balance batch with correct variance', () => {
      const result = validateBatchBalancing(5000.00, 4200.00);
      assert.equal(result.isBalanced, false);
      assert.equal(result.variance, 800.00);
      assert.equal(result.status, BATCH_STATUSES.OUT_OF_BALANCE);
    });

    it('should reject invalid or negative batch amounts', () => {
      const result = validateBatchBalancing(-100, 0);
      assert.equal(result.isBalanced, false);
      assert.ok(result.error);
    });
  });

  describe('4. Refund Approval Separation of Duties Governance', () => {
    it('should reject approval when requester tries to approve their own refund', () => {
      const refund = {
        id: 'ref-01',
        amount: 100.00,
        requestedBy: 'user-biller-01',
        approvalStatus: REFUND_STATUSES.PENDING_APPROVAL
      };
      const approver = {
        id: 'user-biller-01',
        role: 'biller'
      };

      const result = validateRefundApproval(refund, approver);
      assert.equal(result.isValid, false);
      assert.match(result.error, /Separation of duties violation/i);
    });

    it('should allow supervisor to approve refunds under $250.00 threshold', () => {
      const refund = {
        id: 'ref-02',
        amount: 150.00,
        requestedBy: 'user-biller-01',
        approvalStatus: REFUND_STATUSES.PENDING_APPROVAL
      };
      const approver = {
        id: 'user-supervisor-01',
        role: 'billing_supervisor'
      };

      const result = validateRefundApproval(refund, approver);
      assert.equal(result.isValid, true);
    });

    it('should block non-CFO from approving refunds of $250.00 or higher', () => {
      const refund = {
        id: 'ref-03',
        amount: 300.00,
        requestedBy: 'user-biller-01',
        approvalStatus: REFUND_STATUSES.PENDING_APPROVAL
      };
      const approver = {
        id: 'user-supervisor-01',
        role: 'billing_supervisor'
      };

      const result = validateRefundApproval(refund, approver);
      assert.equal(result.isValid, false);
      assert.match(result.error, /CFO or Super Admin authorization/i);
    });

    it('should allow CFO to approve high-value refunds >= $250.00', () => {
      const refund = {
        id: 'ref-04',
        amount: 1500.00,
        requestedBy: 'user-biller-01',
        approvalStatus: REFUND_STATUSES.PENDING_APPROVAL
      };
      const approver = {
        id: 'user-cfo-01',
        role: 'cfo'
      };

      const result = validateRefundApproval(refund, approver);
      assert.equal(result.isValid, true);
    });
  });

  describe('5. Executive KPI Computation', () => {
    it('should calculate executive metrics accurately across sample data', () => {
      const data = getBaselineSampleData();
      const kpis = calculatePaymentKpis(data.batches, data.transactions, data.refunds);

      assert.ok(kpis.totalCashCollected > 0);
      assert.ok(kpis.totalContractualAdjustments > 0);
      assert.ok(kpis.totalUnappliedCash > 0);
      assert.ok(kpis.pendingRefundsCount >= 1);
    });
  });

  describe('6. Database Migration SQL Verification (057_rcm_payments_adjustments.sql)', () => {
    const migrationPath = path.join(rootDir, 'supabase', 'migrations', '057_rcm_payments_adjustments.sql');

    it('should exist on disk and define required schema tables and views', () => {
      assert.ok(fs.existsSync(migrationPath), 'Migration 057 file must exist');
      const sql = fs.readFileSync(migrationPath, 'utf8');

      assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.rcm_payment_batches/i);
      assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.rcm_payment_transactions/i);
      assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.rcm_refund_recoupment_ledger/i);
      assert.match(sql, /CREATE OR REPLACE VIEW public\.vw_rcm_cash_posting_summary/i);
      assert.match(sql, /CREATE OR REPLACE VIEW public\.vw_rcm_unapplied_cash_ledger/i);
    });

    it('should enforce idempotent DROP POLICY IF EXISTS before CREATE POLICY to prevent error 42710', () => {
      const sql = fs.readFileSync(migrationPath, 'utf8');

      assert.match(sql, /DROP POLICY IF EXISTS rls_rcm_batches_tenant ON public\.rcm_payment_batches;/i);
      assert.match(sql, /CREATE POLICY rls_rcm_batches_tenant ON public\.rcm_payment_batches/i);
      assert.match(sql, /DROP POLICY IF EXISTS rls_rcm_pmt_tx_tenant ON public\.rcm_payment_transactions;/i);
      assert.match(sql, /CREATE POLICY rls_rcm_pmt_tx_tenant ON public\.rcm_payment_transactions/i);
      assert.match(sql, /DROP POLICY IF EXISTS rls_rcm_refunds_tenant ON public\.rcm_refund_recoupment_ledger;/i);
      assert.match(sql, /CREATE POLICY rls_rcm_refunds_tenant ON public\.rcm_refund_recoupment_ledger/i);
    });

    it('should include safe rollback down migration', () => {
      const downPath = path.join(rootDir, 'supabase', 'migrations', '057_rcm_payments_adjustments_down.sql');
      assert.ok(fs.existsSync(downPath), 'Down migration 057 must exist');
      const downSql = fs.readFileSync(downPath, 'utf8');

      assert.match(downSql, /DROP VIEW IF EXISTS public\.vw_rcm_unapplied_cash_ledger/i);
      assert.match(downSql, /DROP TABLE IF EXISTS public\.rcm_refund_recoupment_ledger CASCADE/i);
      assert.match(downSql, /DROP TABLE IF EXISTS public\.rcm_payment_transactions CASCADE/i);
      assert.match(downSql, /DROP TABLE IF EXISTS public\.rcm_payment_batches CASCADE/i);
    });
  });

  describe('7. Maestro Clinical Design System Token Governance', () => {
    it('should enforce ZERO purple/violet/indigo/magenta/fuchsia tokens in PaymentAdjustmentView.css', () => {
      const cssPath = path.join(rootDir, 'src', 'components', 'PaymentAdjustmentView.css');
      assert.ok(fs.existsSync(cssPath), 'CSS file must exist');
      const css = fs.readFileSync(cssPath, 'utf8');

      const disallowedPatterns = [
        /#(?:[0-9a-f]{3}){1,2}\b(?<!#0b1120|#111c30|#16243d)/i,
        /\bpurple\b/i,
        /\bviolet\b/i,
        /\bindigo\b/i,
        /\bfuchsia\b/i,
        /\bmagenta\b/i
      ];

      for (const pattern of disallowedPatterns.slice(1)) {
        assert.equal(pattern.test(css), false, `PaymentAdjustmentView.css must not contain prohibited token matching ${pattern}`);
      }
    });

    it('should enforce responsive table with min-width: 1100px in PaymentAdjustmentView.css', () => {
      const cssPath = path.join(rootDir, 'src', 'components', 'PaymentAdjustmentView.css');
      const css = fs.readFileSync(cssPath, 'utf8');

      assert.match(css, /min-width:\s*1100px/i);
      assert.match(css, /overflow-x:\s*auto/i);
    });

    it('should enforce ZERO purple/violet/indigo/magenta/fuchsia tokens in PaymentAdjustmentView.jsx', () => {
      const jsxPath = path.join(rootDir, 'src', 'components', 'PaymentAdjustmentView.jsx');
      assert.ok(fs.existsSync(jsxPath), 'JSX file must exist');
      const jsx = fs.readFileSync(jsxPath, 'utf8');

      assert.equal(/\bpurple\b/i.test(jsx), false);
      assert.equal(/\bviolet\b/i.test(jsx), false);
      assert.equal(/\bindigo\b/i.test(jsx), false);
      assert.equal(/\bfuchsia\b/i.test(jsx), false);
    });
  });

  describe('8. Application Wiring & UI Routing Integration', () => {
    it('should register PaymentAdjustmentView in src/App.jsx', () => {
      const appPath = path.join(rootDir, 'src', 'App.jsx');
      const appContent = fs.readFileSync(appPath, 'utf8');

      assert.match(appContent, /import PaymentAdjustmentView from '\.\/components\/PaymentAdjustmentView'/i);
      assert.match(appContent, /activeTab === 'payment_adjustments'/i);
      assert.match(appContent, /<PaymentAdjustmentView \/>/i);
      assert.match(appContent, /Payments & Cash Posting/i);
    });
  });
});

