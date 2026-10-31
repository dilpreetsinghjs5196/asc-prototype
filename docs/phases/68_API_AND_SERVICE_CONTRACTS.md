# PHASE 68 — API AND SERVICE CONTRACTS
## Server-Side Endpoints, PostgreSQL RPC Signatures, and Client Service Layer

> **Phase:** 68 — Expected Reimbursement Engine  
> **Author:** Principal Backend Architect, Senior API Designer  
> **Status:** SPECIFICATION & CONTRACT DESIGN ONLY  
> **Target Version:** ASCANALYST v2026.1  

---

## 1. POSTGRESQL STORED PROCEDURE SIGNATURES

All production financial calculations run server-side inside PostgreSQL `SECURITY DEFINER` functions with fixed `search_path = public, pg_temp`.

### 1.1 RPC 1: `public.fn_calculate_expected_reimbursement`
Calculates the authoritative expected reimbursement for an encounter, validates contracts, and commits an immutable snapshot.

```sql
CREATE OR REPLACE FUNCTION public.fn_calculate_expected_reimbursement(
    p_surgery_id BIGINT,
    p_contract_version_id UUID DEFAULT NULL,
    p_date_of_service DATE DEFAULT NULL,
    p_payer_id UUID DEFAULT NULL,
    p_dry_run BOOLEAN DEFAULT FALSE,
    p_recalculation_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp;
```

#### Return Payload (`JSONB`):
```json
{
  "calculation_id": "8f3e2b1a-9c4d-4e5f-a6b7-c8d9e0f1a2b3",
  "surgery_id": 1042,
  "facility_id": "00000000-0000-0000-0000-000000000002",
  "date_of_service": "2026-11-15",
  "calculation_sequence": 1,
  "calculation_status": "CALCULATED",
  "contract_id": "20000000-0000-0000-0000-000000000001",
  "contract_version_id": "30000000-0000-0000-0000-000000000001",
  "contract_title": "BCBS Commercial PPO 2026",
  "total_gross_billed": 23000.00,
  "total_contract_allowable": 11179.10,
  "estimated_patient_responsibility": 3035.82,
  "estimated_payer_reimbursement": 8143.28,
  "facility_acquisition_cost": 5175.00,
  "expected_contribution_margin": 6004.10,
  "contribution_margin_pct": 0.5371,
  "stop_loss_triggered": false,
  "mppr_rule_set_code": "COM_STD_CASCADE",
  "calculation_hash": "a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e",
  "lines": [
    {
      "line_number": 1,
      "cpt_code": "29827",
      "modifiers": [],
      "units": 1.0,
      "line_gross_charge": 14500.00,
      "applied_methodology": "PERCENT_OF_MEDICARE",
      "base_benchmark_rate": 3348.57,
      "contract_multiplier": 1.8000,
      "mppr_rank": 1,
      "mppr_discount_pct": 1.0000,
      "j8_device_offset_deducted": 0.00,
      "line_contract_allowable": 6027.43,
      "line_patient_responsibility": 1637.54,
      "line_payer_reimbursement": 4389.89,
      "calculation_trace": "Medicare baseline $3,348.57 * 1.8000 = $6,027.43 (Rank 1 at 100%)"
    },
    {
      "line_number": 2,
      "cpt_code": "23430",
      "modifiers": [],
      "units": 1.0,
      "line_gross_charge": 8500.00,
      "applied_methodology": "PERCENT_OF_MEDICARE",
      "base_benchmark_rate": 4707.41,
      "contract_multiplier": 1.8000,
      "mppr_rank": 2,
      "mppr_discount_pct": 0.5000,
      "j8_device_offset_deducted": 2100.00,
      "line_contract_allowable": 2346.67,
      "line_patient_responsibility": 637.53,
      "line_payer_reimbursement": 1709.14,
      "calculation_trace": "J8 offset $2,100 deducted: ($4,707.41 - $2,100.00) * 1.8000 * 0.50 MPPR = $2,346.67"
    },
    {
      "line_number": 3,
      "cpt_code": "IMPLANT-CARVEOUT",
      "procedure_description": "2 Suture Anchors + 1 Tenodesis Screw",
      "units": 3.0,
      "line_gross_charge": 0.00,
      "applied_methodology": "IMPLANT_CARVE_OUT",
      "base_benchmark_rate": 2550.00,
      "contract_multiplier": 1.1000,
      "line_contract_allowable": 2805.00,
      "line_patient_responsibility": 760.75,
      "line_payer_reimbursement": 2044.25,
      "calculation_trace": "Verified invoice $2,550.00 + 10% contract markup = $2,805.00"
    }
  ]
}
```

---

### 1.2 RPC 2: `public.fn_get_reimbursement_explanation`
Retrieves the complete line-by-line structured explanation graph for an existing snapshot.

```sql
CREATE OR REPLACE FUNCTION public.fn_get_reimbursement_explanation(
    p_calculation_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp;
```

---

## 2. CLIENT SERVICE INTERFACE (`reimbursementService.js`)

```javascript
export const reimbursementService = {
  // Authoritative server-side calculation dispatch
  async calculateCaseReimbursement(surgeryId, options = {}) {
    const { contractVersionId, dos, payerId, dryRun = false } = options;
    const { data, error } = await supabase.rpc('fn_calculate_expected_reimbursement', {
      p_surgery_id: surgeryId,
      p_contract_version_id: contractVersionId || null,
      p_date_of_service: dos || null,
      p_payer_id: payerId || null,
      p_dry_run: Boolean(dryRun)
    });
    if (error) throw error;
    return data;
  },

  // Retrieve current active calculation for surgery
  async getLatestCaseCalculation(surgeryId) {
    const { data, error } = await supabase
      .from('reimbursement_calculations')
      .select('*, reimbursement_calculation_lines(*)')
      .eq('surgery_id', surgeryId)
      .eq('is_latest_calculation', true)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  // Retrieve historical recalculation lineage
  async getCaseCalculationHistory(surgeryId) {
    const { data, error } = await supabase
      .from('reimbursement_calculations')
      .select('id, calculation_sequence, calculation_status, total_contract_allowable, calculation_timestamp, recalculation_reason, calculated_by')
      .eq('surgery_id', surgeryId)
      .order('calculation_sequence', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  // Recalculate and generate next version sequence
  async recalculateCase(surgeryId, reason) {
    if (!reason) throw new Error('Recalculation reason is mandatory for financial auditability.');
    return await this.calculateCaseReimbursement(surgeryId, {
      dryRun: false,
      recalculationReason: reason
    });
  }
};
```

---

## 3. IDEMPOTENCY & ERROR HANDLING MATRIX

| Error Code | HTTP Status | Description | Recovery Action |
| :--- | :--- | :--- | :--- |
| `ACCESS_DENIED` | 403 Forbidden | User does not have access to facility | Terminate request, log security alert |
| `CONTRACT_NOT_FOUND` | 422 Unprocessable | No active approved contract covers facility & DOS | Set status to `CONTRACT_NOT_FOUND`, alert biller |
| `RATE_NOT_FOUND` | 422 Unprocessable | CPT code missing from exhibits, no default rule | Prompt user to upload contracted fee schedule |
| `BASELINE_NOT_AVAILABLE` | 422 Unprocessable | Medicare ASC addenda missing for DOS | Update CMS statutory addenda tables |
| `INVOICE_MISSING` | 422 Unprocessable | Implant carve-out requires invoice, but none logged | Mark `REQUIRED_DATA_MISSING`, route to materials |
| `MUTATION_BLOCKED` | 400 Bad Request | Attempted UPDATE/DELETE on immutable snapshot | Block mutation; invoke recalculation RPC |

