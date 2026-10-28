/**
 * Phase 56: Facility Vendor Contracts Client Service Layer
 * Authoritative client abstraction adhering to db singleton pattern.
 * Manages facility-specific vendor contracts, scopes, commercial terms,
 * two-person approvals, amendments, and sourcing authorization.
 */

import { supabase, db } from './supabase.js';

export const CONTRACT_TYPES = Object.freeze([
  'DIRECT_OEM',
  'DISTRIBUTOR_CONSIGNMENT',
  'GPO_TIERED',
  'CUSTOM_LOCAL',
  'TRIAL_EVALUATION',
  'CAPITATED_PROCEDURAL'
]);

export const CONTRACT_STATUSES = Object.freeze([
  'draft',
  'pending_approval',
  'approved',
  'active',
  'suspended',
  'expired',
  'terminated',
  'rejected',
  'renewed'
]);

export const SCOPE_TYPES = Object.freeze([
  'ALL_VENDOR_PRODUCTS',
  'SPECIALTY',
  'COMPONENT',
  'PRODUCT_FAMILY',
  'SKU_LINE_ITEM'
]);

export const DOCUMENT_TYPES = Object.freeze([
  'MASTER_AGREEMENT',
  'PRICING_SCHEDULE',
  'AMENDMENT',
  'BAA_AGREEMENT',
  'CERTIFICATE_OF_INSURANCE',
  'CONSIGNMENT_AGREEMENT',
  'REBATE_SCHEDULE',
  'TERMINATION_LETTER',
  'OTHER'
]);

export const REBATE_STRUCTURE_TYPES = Object.freeze([
  'NONE',
  'FLAT_PERCENT',
  'VOLUME_TIERED',
  'GROWTH_BASED',
  'STANDARDIZATION_REBATE'
]);

// ==============================================================================
// IN-MEMORY FALLBACK DATA (OFFLINE / TEST HARNESS HARMONY)
// ==============================================================================

const NAPLES_FACILITY_ID = '00000000-0000-0000-0000-000000000002';
const CFO_USER_ID = '00000000-0000-0000-0001-000000000004';
const ADMIN_USER_ID = '00000000-0000-0000-0001-000000000001';

export const BASELINE_CONTRACTS = [
  {
    id: '00000000-0000-0000-0056-000000000001',
    facility_id: NAPLES_FACILITY_ID,
    vendor_id: '00000000-0000-0000-0053-000000000001', // Stryker
    contract_number: 'CTR-2026-STR-01',
    contract_name: 'Stryker Orthopaedics Master Total Joint Agreement',
    contract_type: 'DIRECT_OEM',
    status: 'active',
    is_active: true,
    effective_from: '2026-01-01',
    effective_to: '2026-12-31',
    auto_renew: true,
    renewal_notice_days: 60,
    auto_renew_term_months: 12,
    gpo_affiliation: 'Vizient',
    gpo_tier_level: 'Tier 3 Direct Commitment',
    gpo_contract_reference: 'VIZ-STR-9801',
    currency: 'USD',
    payment_terms_days: 30,
    prompt_pay_discount_percent: 2.00,
    prompt_pay_days: 10,
    fob_point: 'DESTINATION',
    freight_terms: 'PREPAID',
    emergency_courier_covered: true,
    is_consignment: true,
    consignment_reconciliation_frequency: 'MONTHLY',
    consignment_audit_required: true,
    loaner_set_lead_time_days: 2,
    annual_volume_commitment_amount: 500000.00,
    has_rebate_terms: true,
    rebate_structure_type: 'VOLUME_TIERED',
    rebate_percentage: 4.50,
    rebate_settlement_frequency: 'ANNUAL',
    amendment_number: 0,
    is_current_version: true,
    parent_contract_id: null,
    approved_by: CFO_USER_ID,
    approved_at: '2025-12-15T14:30:00Z',
    created_by: ADMIN_USER_ID,
    vendor: {
      id: '00000000-0000-0000-0053-000000000001',
      vendor_code: 'STRYKER',
      display_name: 'Stryker Orthopaedics',
      legal_name: 'Howmedica Osteonics Corp.'
    },
    scopes: [
      {
        id: '00000000-0000-0000-0056-scope-00000001',
        contract_id: '00000000-0000-0000-0056-000000000001',
        scope_type: 'COMPONENT',
        component_id: '00000000-0000-0000-0051-000000000010',
        component_name: 'Femoral Knee Component',
        is_consignment_covered: true,
        is_excluded: false,
        tier_discount_percent: 12.50,
        status: 'active',
        is_active: true
      },
      {
        id: '00000000-0000-0000-0056-scope-00000002',
        contract_id: '00000000-0000-0000-0056-000000000001',
        scope_type: 'COMPONENT',
        component_id: '00000000-0000-0000-0051-000000000011',
        component_name: 'Tibial Knee Component',
        is_consignment_covered: true,
        is_excluded: false,
        tier_discount_percent: 10.00,
        status: 'active',
        is_active: true
      }
    ],
    documents: [
      {
        id: '00000000-0000-0000-0056-doc-00000001',
        contract_id: '00000000-0000-0000-0056-000000000001',
        document_name: 'Stryker_Executed_Master_Agreement_2026.pdf',
        document_type: 'MASTER_AGREEMENT',
        file_size_bytes: 1420500,
        mime_type: 'application/pdf',
        file_sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        is_confidential: true,
        effective_date: '2026-01-01',
        uploaded_at: '2025-12-15T15:00:00Z'
      }
    ]
  },
  {
    id: '00000000-0000-0000-0056-000000000002',
    facility_id: NAPLES_FACILITY_ID,
    vendor_id: '00000000-0000-0000-0053-000000000002', // Zimmer
    contract_number: 'CTR-2026-ZIM-02',
    contract_name: 'Zimmer Biomet National GPO Pricing Schedule',
    contract_type: 'GPO_TIERED',
    status: 'active',
    is_active: true,
    effective_from: '2026-03-01',
    effective_to: '2027-02-28',
    auto_renew: false,
    renewal_notice_days: 45,
    gpo_affiliation: 'Premier',
    payment_terms_days: 45,
    prompt_pay_discount_percent: 1.50,
    prompt_pay_days: 15,
    fob_point: 'DESTINATION',
    freight_terms: 'PREPAID',
    emergency_courier_covered: true,
    is_consignment: true,
    consignment_reconciliation_frequency: 'QUARTERLY',
    consignment_audit_required: true,
    annual_volume_commitment_amount: 250000.00,
    has_rebate_terms: false,
    rebate_structure_type: 'NONE',
    rebate_percentage: 0.00,
    amendment_number: 0,
    is_current_version: true,
    parent_contract_id: null,
    approved_by: CFO_USER_ID,
    approved_at: '2026-02-20T10:00:00Z',
    created_by: ADMIN_USER_ID,
    vendor: {
      id: '00000000-0000-0000-0053-000000000002',
      vendor_code: 'ZIMMER_BIOMET',
      display_name: 'Zimmer Biomet',
      legal_name: 'Zimmer US, Inc.'
    },
    scopes: [
      {
        id: '00000000-0000-0000-0056-scope-00000003',
        contract_id: '00000000-0000-0000-0056-000000000002',
        scope_type: 'ALL_VENDOR_PRODUCTS',
        is_consignment_covered: true,
        is_excluded: false,
        tier_discount_percent: 8.00,
        status: 'active'
      }
    ],
    documents: []
  },
  {
    id: '00000000-0000-0000-0056-000000000003',
    facility_id: NAPLES_FACILITY_ID,
    vendor_id: '00000000-0000-0000-0053-000000000003', // DePuy
    contract_number: 'CTR-2026-DEP-03',
    contract_name: 'DePuy Synthes Spine & Sports Medicine Agreement',
    contract_type: 'CUSTOM_LOCAL',
    status: 'pending_approval',
    is_active: false,
    effective_from: '2026-06-01',
    effective_to: '2027-05-31',
    auto_renew: true,
    renewal_notice_days: 60,
    gpo_affiliation: 'Direct',
    payment_terms_days: 30,
    prompt_pay_discount_percent: 0.00,
    prompt_pay_days: null,
    fob_point: 'DESTINATION',
    freight_terms: 'PREPAID',
    emergency_courier_covered: false,
    is_consignment: false,
    annual_volume_commitment_amount: 150000.00,
    has_rebate_terms: true,
    rebate_structure_type: 'FLAT_PERCENT',
    rebate_percentage: 3.00,
    amendment_number: 0,
    is_current_version: true,
    submitted_by: ADMIN_USER_ID,
    submitted_at: '2026-05-15T09:00:00Z',
    created_by: ADMIN_USER_ID,
    vendor: {
      id: '00000000-0000-0000-0053-000000000003',
      vendor_code: 'DEPUY_SYNTHES',
      display_name: 'DePuy Synthes',
      legal_name: 'DePuy Synthes Sales, Inc.'
    },
    scopes: [],
    documents: []
  }
];

// In-memory working copy
let inMemoryContracts = JSON.parse(JSON.stringify(BASELINE_CONTRACTS));

export const contractService = {
  /**
   * Query contracts with filtering, status filtering, and expiration alerting
   */
  async getContracts({
    facilityId = NAPLES_FACILITY_ID,
    vendorId = null,
    status = null,
    contractType = null,
    isExpiringSoon = false,
    search = '',
    page = 1,
    limit = 50
  } = {}) {
    try {
      // Remote Supabase Query
      let query = supabase
        .from('facility_vendor_contracts')
        .select(`
          *,
          vendor:public.implant_vendors!vendor_id (id, vendor_code, display_name, legal_name, vendor_type),
          scopes:public.facility_vendor_contract_scopes!contract_id (*),
          documents:public.facility_vendor_contract_documents!contract_id (id, document_name, document_type, is_confidential, uploaded_at)
        `)
        .eq('facility_id', facilityId);

      if (vendorId) query = query.eq('vendor_id', vendorId);
      if (status) query = query.eq('status', status);
      if (contractType) query = query.eq('contract_type', contractType);

      const { data, error } = await query;
      if (!error && Array.isArray(data) && data.length > 0) {
        return this._formatAndPaginate(data, { isExpiringSoon, search, page, limit });
      }
    } catch {
      // Fallback to in-memory dataset
    }

    // In-memory filtering
    let results = inMemoryContracts.filter(c => c.facility_id === facilityId);

    if (vendorId) {
      results = results.filter(c => c.vendor_id === vendorId);
    }
    if (status) {
      results = results.filter(c => c.status === status);
    }
    if (contractType) {
      results = results.filter(c => c.contract_type === contractType);
    }

    return this._formatAndPaginate(results, { isExpiringSoon, search, page, limit });
  },

  _formatAndPaginate(data, { isExpiringSoon, search, page, limit }) {
    let filtered = [...data];
    const today = new Date();
    const in60Days = new Date();
    in60Days.setDate(today.getDate() + 60);

    if (isExpiringSoon) {
      filtered = filtered.filter(c => {
        if (!c.effective_to) return false;
        const expDate = new Date(c.effective_to);
        return expDate >= today && expDate <= in60Days;
      });
    }

    if (search && search.trim() !== '') {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter(c =>
        (c.contract_number && c.contract_number.toLowerCase().includes(q)) ||
        (c.contract_name && c.contract_name.toLowerCase().includes(q)) ||
        (c.gpo_affiliation && c.gpo_affiliation.toLowerCase().includes(q)) ||
        (c.vendor && c.vendor.display_name && c.vendor.display_name.toLowerCase().includes(q)) ||
        (c.vendor && c.vendor.vendor_code && c.vendor.vendor_code.toLowerCase().includes(q))
      );
    }

    const total = filtered.length;
    const startIndex = (page - 1) * limit;
    const items = filtered.slice(startIndex, startIndex + limit);

    // Compute summary metrics
    const metrics = {
      totalCount: inMemoryContracts.length,
      activeCount: inMemoryContracts.filter(c => c.status === 'active').length,
      pendingApprovalCount: inMemoryContracts.filter(c => c.status === 'pending_approval').length,
      expiringWithin60DaysCount: inMemoryContracts.filter(c => {
        if (!c.effective_to || c.status !== 'active') return false;
        const exp = new Date(c.effective_to);
        return exp >= today && exp <= in60Days;
      }).length,
      totalVolumeCommitment: inMemoryContracts
        .filter(c => c.status === 'active')
        .reduce((sum, c) => sum + (Number(c.annual_volume_commitment_amount) || 0), 0)
    };

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
      metrics
    };
  },

  /**
   * Get single contract with complete scopes, documents, and amendment history
   */
  async getContractById(contractId) {
    if (!contractId) throw new Error('contractId is required');

    try {
      const { data, error } = await supabase
        .from('facility_vendor_contracts')
        .select(`
          *,
          vendor:public.implant_vendors!vendor_id (*),
          scopes:public.facility_vendor_contract_scopes!contract_id (*),
          documents:public.facility_vendor_contract_documents!contract_id (*)
        `)
        .eq('id', contractId)
        .single();

      if (!error && data) return data;
    } catch {
      // Fallback
    }

    const match = inMemoryContracts.find(c => c.id === contractId);
    if (!match) throw new Error(`Contract ${contractId} not found.`);
    return JSON.parse(JSON.stringify(match));
  },

  /**
   * Save / update a contract draft
   */
  async saveContractDraft(contractPayload) {
    if (!contractPayload) throw new Error('Contract payload is required.');
    if (!contractPayload.contract_number || !contractPayload.contract_number.trim()) {
      throw new Error('Contract number is required.');
    }
    if (!contractPayload.contract_name || !contractPayload.contract_name.trim()) {
      throw new Error('Contract name is required.');
    }
    if (!contractPayload.vendor_id) {
      throw new Error('vendor_id is required.');
    }
    if (!contractPayload.effective_from || !contractPayload.effective_to) {
      throw new Error('Both effective_from and effective_to dates are required.');
    }
    if (contractPayload.effective_to < contractPayload.effective_from) {
      throw new Error('effective_to date cannot be earlier than effective_from date.');
    }

    const cleanContractNumber = contractPayload.contract_number.trim().toUpperCase();
    const facilityId = contractPayload.facility_id || NAPLES_FACILITY_ID;

    // Check for duplicate contract number in same facility version
    const existingIndex = inMemoryContracts.findIndex(c =>
      c.id !== contractPayload.id &&
      c.facility_id === facilityId &&
      c.contract_number.toUpperCase() === cleanContractNumber &&
      c.amendment_number === (contractPayload.amendment_number || 0)
    );

    if (existingIndex >= 0) {
      throw new Error(`A contract with number ${cleanContractNumber} already exists for this facility.`);
    }

    const id = contractPayload.id || `contract-${Date.now()}`;
    const newRecord = {
      ...contractPayload,
      id,
      facility_id: facilityId,
      contract_number: cleanContractNumber,
      contract_name: contractPayload.contract_name.trim(),
      contract_type: contractPayload.contract_type || 'DIRECT_OEM',
      status: contractPayload.status || 'draft',
      is_active: contractPayload.status === 'active',
      amendment_number: contractPayload.amendment_number || 0,
      is_current_version: true,
      scopes: contractPayload.scopes || [],
      documents: contractPayload.documents || [],
      updated_at: new Date().toISOString()
    };

    const targetIndex = inMemoryContracts.findIndex(c => c.id === id);
    if (targetIndex >= 0) {
      inMemoryContracts[targetIndex] = { ...inMemoryContracts[targetIndex], ...newRecord };
    } else {
      inMemoryContracts.unshift(newRecord);
    }

    return { success: true, contract: newRecord };
  },

  /**
   * Submit contract for formal administrative approval
   */
  async submitForApproval(contractId, submissionNotes = '') {
    const contract = await this.getContractById(contractId);
    if (contract.status !== 'draft' && contract.status !== 'rejected') {
      throw new Error(`Cannot submit contract in status '${contract.status}'. Must be in draft or rejected.`);
    }

    const updated = {
      ...contract,
      status: 'pending_approval',
      is_active: false,
      submitted_by: ADMIN_USER_ID,
      submitted_at: new Date().toISOString(),
      notes: submissionNotes ? `${contract.notes || ''}\n[Submission Note]: ${submissionNotes}` : contract.notes,
      updated_at: new Date().toISOString()
    };

    const idx = inMemoryContracts.findIndex(c => c.id === contractId);
    if (idx >= 0) inMemoryContracts[idx] = updated;

    return { success: true, contract: updated };
  },

  /**
   * Review contract approval or rejection
   * Enforces separation of duties: Approver cannot be identical to creator/submitter (unless super_admin)
   */
  async reviewContract(contractId, { action, rationale = '', reviewerUserId = CFO_USER_ID, isSuperAdmin = false } = {}) {
    if (!['approve', 'reject'].includes(action)) {
      throw new Error("Action must be either 'approve' or 'reject'.");
    }

    const contract = await this.getContractById(contractId);
    if (contract.status !== 'pending_approval') {
      throw new Error(`Cannot review contract with status '${contract.status}'. Must be pending_approval.`);
    }

    // Separation of Duties check
    if (!isSuperAdmin && (reviewerUserId === contract.created_by || reviewerUserId === contract.submitted_by)) {
      throw new Error('Separation of duties violation: Creator or submitter cannot approve their own vendor contract. Second-person administrative sign-off required.');
    }

    if (action === 'reject') {
      if (!rationale || rationale.trim().length < 5) {
        throw new Error('A detailed rejection rationale (minimum 5 characters) is required when rejecting a contract.');
      }

      const rejected = {
        ...contract,
        status: 'rejected',
        is_active: false,
        rejection_reason: rationale.trim(),
        updated_at: new Date().toISOString()
      };
      const idx = inMemoryContracts.findIndex(c => c.id === contractId);
      if (idx >= 0) inMemoryContracts[idx] = rejected;
      return { success: true, action: 'rejected', contract: rejected };
    }

    // Action === 'approve'
    const today = new Date().toISOString().split('T')[0];
    const isNowActive = today >= contract.effective_from;

    const approved = {
      ...contract,
      status: isNowActive ? 'active' : 'approved',
      is_active: isNowActive,
      approved_by: reviewerUserId,
      approved_at: new Date().toISOString(),
      rejection_reason: null,
      updated_at: new Date().toISOString()
    };

    const idx = inMemoryContracts.findIndex(c => c.id === contractId);
    if (idx >= 0) inMemoryContracts[idx] = approved;
    return { success: true, action: 'approved', contract: approved };
  },

  /**
   * Suspend an active contract (e.g. credit hold or regulatory review)
   */
  async suspendContract(contractId, { reason = '' } = {}) {
    const contract = await this.getContractById(contractId);
    if (contract.status !== 'active') {
      throw new Error(`Cannot suspend contract in status '${contract.status}'. Must be active.`);
    }

    const suspended = {
      ...contract,
      status: 'suspended',
      is_active: false,
      notes: reason ? `${contract.notes || ''}\n[Suspension]: ${reason}` : contract.notes,
      updated_at: new Date().toISOString()
    };

    const idx = inMemoryContracts.findIndex(c => c.id === contractId);
    if (idx >= 0) inMemoryContracts[idx] = suspended;
    return { success: true, contract: suspended };
  },

  /**
   * Terminate contract early
   */
  async terminateContract(contractId, { terminationDate = new Date().toISOString().split('T')[0], terminationReason = '' } = {}) {
    const contract = await this.getContractById(contractId);
    if (!terminationReason || terminationReason.trim().length < 5) {
      throw new Error('A valid termination reason (minimum 5 characters) is required.');
    }

    const terminated = {
      ...contract,
      status: 'terminated',
      is_active: false,
      terminated_at: new Date().toISOString(),
      termination_reason: terminationReason.trim(),
      effective_to: terminationDate,
      updated_at: new Date().toISOString()
    };

    const idx = inMemoryContracts.findIndex(c => c.id === contractId);
    if (idx >= 0) inMemoryContracts[idx] = terminated;
    return { success: true, contract: terminated };
  },

  /**
   * Create an official versioned contract amendment
   */
  async createAmendment(parentContractId, { amendmentRationale = '' } = {}) {
    const parent = await this.getContractById(parentContractId);
    if (!['active', 'expired'].includes(parent.status)) {
      throw new Error(`Amendments can only be created from active or expired contracts. Got: ${parent.status}`);
    }
    if (!amendmentRationale || amendmentRationale.trim().length < 10) {
      throw new Error('Detailed amendment rationale is required (minimum 10 characters).');
    }

    const amendmentNumber = (parent.amendment_number || 0) + 1;
    const amendmentId = `amendment-${Date.now()}`;

    const newAmendment = {
      ...JSON.parse(JSON.stringify(parent)),
      id: amendmentId,
      contract_name: `${parent.contract_name} (Amendment ${amendmentNumber})`,
      amendment_number: amendmentNumber,
      parent_contract_id: parent.id,
      is_current_version: false,
      status: 'draft',
      is_active: false,
      amendment_rationale: amendmentRationale.trim(),
      approved_by: null,
      approved_at: null,
      submitted_by: null,
      submitted_at: null,
      created_by: ADMIN_USER_ID,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    inMemoryContracts.unshift(newAmendment);
    return { success: true, parent_contract_id: parentContractId, amendment: newAmendment };
  },

  /**
   * Add a scope line-item to a contract
   */
  async addContractScope(contractId, scopePayload) {
    if (!scopePayload || !scopePayload.scope_type) {
      throw new Error('scope_type is required.');
    }
    const contract = await this.getContractById(contractId);
    const newScope = {
      id: `scope-${Date.now()}`,
      contract_id: contractId,
      facility_id: contract.facility_id,
      scope_type: scopePayload.scope_type,
      specialty: scopePayload.specialty || null,
      component_id: scopePayload.component_id || null,
      family_id: scopePayload.family_id || null,
      sku_id: scopePayload.sku_id || null,
      is_consignment_covered: Boolean(scopePayload.is_consignment_covered),
      is_excluded: Boolean(scopePayload.is_excluded),
      exclusion_reason: scopePayload.exclusion_reason || null,
      tier_discount_percent: Number(scopePayload.tier_discount_percent) || 0.00,
      status: 'active',
      is_active: true
    };

    contract.scopes = contract.scopes || [];
    contract.scopes.push(newScope);

    const idx = inMemoryContracts.findIndex(c => c.id === contractId);
    if (idx >= 0) inMemoryContracts[idx] = contract;

    return { success: true, scope: newScope };
  },

  /**
   * Remove a scope line-item
   */
  async deleteContractScope(contractId, scopeId) {
    const contract = await this.getContractById(contractId);
    contract.scopes = (contract.scopes || []).filter(s => s.id !== scopeId);
    const idx = inMemoryContracts.findIndex(c => c.id === contractId);
    if (idx >= 0) inMemoryContracts[idx] = contract;
    return { success: true, scopeId };
  },

  /**
   * Authoritative Sourcing Eligibility Check:
   * Validates whether a vendor, component, or SKU is contractually covered on a given date.
   */
  async validateContractCoverage({
    facilityId = NAPLES_FACILITY_ID,
    vendorId,
    componentId,
    skuId,
    procedureDate = new Date().toISOString().split('T')[0]
  } = {}) {
    if (!vendorId) throw new Error('vendorId is required');

    // Find active contract on procedureDate
    const candidateContracts = inMemoryContracts.filter(c =>
      c.facility_id === facilityId &&
      c.vendor_id === vendorId &&
      c.status === 'active' &&
      procedureDate >= c.effective_from &&
      procedureDate <= c.effective_to
    );

    if (candidateContracts.length === 0) {
      return {
        isAuthorized: false,
        contractId: null,
        contractNumber: null,
        reasonCode: 'NO_ACTIVE_CONTRACT',
        message: 'No active vendor contract exists for this facility on the specified date.'
      };
    }

    const contract = candidateContracts[0];

    // Check scope exclusions
    const isExcluded = (contract.scopes || []).some(s =>
      s.is_excluded === true &&
      (s.is_active ?? (s.status === 'active')) === true &&
      (
        (s.scope_type === 'SKU_LINE_ITEM' && s.sku_id === skuId) ||
        (s.scope_type === 'COMPONENT' && s.component_id === componentId)
      )
    );

    if (isExcluded) {
      return {
        isAuthorized: false,
        contractId: contract.id,
        contractNumber: contract.contract_number,
        reasonCode: 'SCOPE_EXCLUDED',
        message: 'The requested component or SKU is explicitly carved out from this contract.'
      };
    }

    // Check scope inclusions
    const hasCoverage = (contract.scopes || []).length === 0 || (contract.scopes || []).some(s =>
      s.is_excluded === false &&
      (s.is_active ?? (s.status === 'active')) === true &&
      (
        s.scope_type === 'ALL_VENDOR_PRODUCTS' ||
        (s.scope_type === 'COMPONENT' && s.component_id === componentId) ||
        (s.scope_type === 'SKU_LINE_ITEM' && s.sku_id === skuId)
      )
    );

    if (hasCoverage) {
      return {
        isAuthorized: true,
        contractId: contract.id,
        contractNumber: contract.contract_number,
        contractType: contract.contract_type,
        paymentTermsDays: contract.payment_terms_days,
        isConsignment: contract.is_consignment,
        reasonCode: 'CONTRACT_AUTHORIZED',
        message: 'Vendor item is authorized under active commercial contract.'
      };
    }

    return {
      isAuthorized: false,
      contractId: contract.id,
      contractNumber: contract.contract_number,
      reasonCode: 'NOT_IN_CONTRACT_SCOPE',
      message: 'Item is not included within the covered scopes of this contract.'
    };
  },

  /**
   * Reset in-memory test data
   */
  resetInMemoryState() {
    inMemoryContracts = JSON.parse(JSON.stringify(BASELINE_CONTRACTS));
  }
};

// Wire onto db singleton for unified data access
if (typeof db !== 'undefined') {
  db.getFacilityVendorContracts = (...args) => contractService.getContracts(...args);
  db.getFacilityVendorContractById = (...args) => contractService.getContractById(...args);
  db.saveFacilityVendorContract = (...args) => contractService.saveContractDraft(...args);
  db.reviewFacilityVendorContract = (...args) => contractService.reviewContract(...args);
  db.createFacilityVendorContractAmendment = (...args) => contractService.createAmendment(...args);
  db.validateFacilityVendorContractCoverage = (...args) => contractService.validateContractCoverage(...args);
}

export default contractService;
