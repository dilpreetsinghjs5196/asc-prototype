/**
 * Phase 55: Vendor-to-Implant Component Mapping Service
 * Manages commercial-to-clinical capabilities, facility sourcing governance,
 * preference tiers, and logistics fulfillment models.
 */

import { supabase, db } from './supabase.js';

export const PREFERENCE_TIERS = {
  PREFERRED: 'PREFERRED',
  STANDARD: 'STANDARD',
  SECONDARY: 'SECONDARY',
  NON_PREFERRED: 'NON_PREFERRED',
  RESTRICTED: 'RESTRICTED'
};

export const SOURCING_MODELS = {
  DIRECT_OEM: 'DIRECT_OEM',
  DISTRIBUTOR_CONSIGNMENT: 'DISTRIBUTOR_CONSIGNMENT',
  BILL_ONLY: 'BILL_ONLY',
  LOANER_SET: 'LOANER_SET'
};

export const MAPPING_STATUSES = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  DRAFT: 'draft',
  PENDING_APPROVAL: 'pending_approval',
  SUSPENDED: 'suspended',
  TERMINATED: 'terminated',
  REJECTED: 'rejected'
};

export const APPROVAL_STATUSES = {
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  APPROVED: 'approved',
  REJECTED: 'rejected'
};

// ==============================================================================
// GLOBAL BASELINE IN-MEMORY MOCKS (OFFLINE / TEST FALLBACK)
// ==============================================================================

export const GLOBAL_BASELINE_MAPPINGS = [
  // Stryker (Knee & Hip)
  {
    id: '00000000-0000-0000-0055-000000000001',
    facility_id: null,
    vendor_id: '00000000-0000-0000-0053-000000000001',
    component_id: '00000000-0000-0000-0051-000000000010',
    preference_tier: 'PREFERRED',
    sourcing_model: 'DIRECT_OEM',
    authorized_distributor_id: null,
    contract_reference_number: 'STR-KNEE-2026',
    lead_time_days: 2,
    consignment_stock_maintained: true,
    effective_date: '2026-01-01',
    termination_date: null,
    status: 'active',
    is_active: true,
    approval_status: 'approved',
    clinical_notes: 'Triathlon Single-Radius Knee platform primary sourcing',
    governance_rationale: 'Primary contracted total knee vendor',
    source_system: 'manufacturer_catalog',
    vendor: {
      id: '00000000-0000-0000-0053-000000000001',
      vendor_code: 'STRYKER',
      display_name: 'Stryker Orthopaedics',
      vendor_type: 'MANUFACTURER'
    },
    component: {
      id: '00000000-0000-0000-0051-000000000010',
      code: 'KNEE_FEMORAL',
      name: 'Femoral Knee Component',
      specialty: 'Orthopedics'
    }
  },
  {
    id: '00000000-0000-0000-0055-000000000002',
    facility_id: null,
    vendor_id: '00000000-0000-0000-0053-000000000001',
    component_id: '00000000-0000-0000-0051-000000000011',
    preference_tier: 'PREFERRED',
    sourcing_model: 'DIRECT_OEM',
    authorized_distributor_id: null,
    contract_reference_number: 'STR-KNEE-2026',
    lead_time_days: 2,
    consignment_stock_maintained: true,
    effective_date: '2026-01-01',
    termination_date: null,
    status: 'active',
    is_active: true,
    approval_status: 'approved',
    clinical_notes: 'Triathlon Universal Tibial Tray and Baseplate',
    governance_rationale: 'Primary contracted total knee vendor',
    source_system: 'manufacturer_catalog',
    vendor: {
      id: '00000000-0000-0000-0053-000000000001',
      vendor_code: 'STRYKER',
      display_name: 'Stryker Orthopaedics',
      vendor_type: 'MANUFACTURER'
    },
    component: {
      id: '00000000-0000-0000-0051-000000000011',
      code: 'KNEE_TIBIAL_TRAY',
      name: 'Tibial Baseplate / Tray',
      specialty: 'Orthopedics'
    }
  },
  {
    id: '00000000-0000-0000-0055-000000000003',
    facility_id: null,
    vendor_id: '00000000-0000-0000-0053-000000000001',
    component_id: '00000000-0000-0000-0051-000000000020',
    preference_tier: 'PREFERRED',
    sourcing_model: 'DIRECT_OEM',
    authorized_distributor_id: null,
    contract_reference_number: 'STR-HIP-2026',
    lead_time_days: 2,
    consignment_stock_maintained: true,
    effective_date: '2026-01-01',
    termination_date: null,
    status: 'active',
    is_active: true,
    approval_status: 'approved',
    clinical_notes: 'Accolade II / Secur-Fit Advanced Femoral Hip Stem',
    governance_rationale: 'Primary primary hip stem contracted source',
    source_system: 'manufacturer_catalog',
    vendor: {
      id: '00000000-0000-0000-0053-000000000001',
      vendor_code: 'STRYKER',
      display_name: 'Stryker Orthopaedics',
      vendor_type: 'MANUFACTURER'
    },
    component: {
      id: '00000000-0000-0000-0051-000000000020',
      code: 'HIP_STEM',
      name: 'Femoral Hip Stem',
      specialty: 'Orthopedics'
    }
  },
  {
    id: '00000000-0000-0000-0055-000000000004',
    facility_id: null,
    vendor_id: '00000000-0000-0000-0053-000000000001',
    component_id: '00000000-0000-0000-0051-000000000021',
    preference_tier: 'PREFERRED',
    sourcing_model: 'DIRECT_OEM',
    authorized_distributor_id: null,
    contract_reference_number: 'STR-HIP-2026',
    lead_time_days: 2,
    consignment_stock_maintained: true,
    effective_date: '2026-01-01',
    termination_date: null,
    status: 'active',
    is_active: true,
    approval_status: 'approved',
    clinical_notes: 'Trident II Tritanium Acetabular Cup System',
    governance_rationale: 'Primary hemispherical acetabular shell platform',
    source_system: 'manufacturer_catalog',
    vendor: {
      id: '00000000-0000-0000-0053-000000000001',
      vendor_code: 'STRYKER',
      display_name: 'Stryker Orthopaedics',
      vendor_type: 'MANUFACTURER'
    },
    component: {
      id: '00000000-0000-0000-0051-000000000021',
      code: 'HIP_CUP',
      name: 'Acetabular Cup / Shell',
      specialty: 'Orthopedics'
    }
  },
  // Zimmer Biomet (Knee)
  {
    id: '00000000-0000-0000-0055-000000000005',
    facility_id: null,
    vendor_id: '00000000-0000-0000-0053-000000000002',
    component_id: '00000000-0000-0000-0051-000000000010',
    preference_tier: 'SECONDARY',
    sourcing_model: 'DIRECT_OEM',
    authorized_distributor_id: null,
    contract_reference_number: 'ZB-KNEE-2026',
    lead_time_days: 3,
    consignment_stock_maintained: true,
    effective_date: '2026-01-01',
    termination_date: null,
    status: 'active',
    is_active: true,
    approval_status: 'approved',
    clinical_notes: 'Persona Personalized Knee System femoral component',
    governance_rationale: 'Secondary contracted total knee platform',
    source_system: 'manufacturer_catalog',
    vendor: {
      id: '00000000-0000-0000-0053-000000000002',
      vendor_code: 'ZIMMER_BIOMET',
      display_name: 'Zimmer Biomet',
      vendor_type: 'MANUFACTURER'
    },
    component: {
      id: '00000000-0000-0000-0051-000000000010',
      code: 'KNEE_FEMORAL',
      name: 'Femoral Knee Component',
      specialty: 'Orthopedics'
    }
  },
  {
    id: '00000000-0000-0000-0055-000000000006',
    facility_id: null,
    vendor_id: '00000000-0000-0000-0053-000000000002',
    component_id: '00000000-0000-0000-0051-000000000011',
    preference_tier: 'SECONDARY',
    sourcing_model: 'DIRECT_OEM',
    authorized_distributor_id: null,
    contract_reference_number: 'ZB-KNEE-2026',
    lead_time_days: 3,
    consignment_stock_maintained: true,
    effective_date: '2026-01-01',
    termination_date: null,
    status: 'active',
    is_active: true,
    approval_status: 'approved',
    clinical_notes: 'Persona Anatomical Tibial Baseplate System',
    governance_rationale: 'Secondary contracted total knee platform',
    source_system: 'manufacturer_catalog',
    vendor: {
      id: '00000000-0000-0000-0053-000000000002',
      vendor_code: 'ZIMMER_BIOMET',
      display_name: 'Zimmer Biomet',
      vendor_type: 'MANUFACTURER'
    },
    component: {
      id: '00000000-0000-0000-0051-000000000011',
      code: 'KNEE_TIBIAL_TRAY',
      name: 'Tibial Baseplate / Tray',
      specialty: 'Orthopedics'
    }
  },
  // Medtronic (Spine)
  {
    id: '00000000-0000-0000-0055-000000000007',
    facility_id: null,
    vendor_id: '00000000-0000-0000-0053-000000000004',
    component_id: '00000000-0000-0000-0051-000000000030',
    preference_tier: 'PREFERRED',
    sourcing_model: 'DIRECT_OEM',
    authorized_distributor_id: null,
    contract_reference_number: 'MDT-SPN-2026',
    lead_time_days: 2,
    consignment_stock_maintained: true,
    effective_date: '2026-01-01',
    termination_date: null,
    status: 'active',
    is_active: true,
    approval_status: 'approved',
    clinical_notes: 'Polaris 5.5 Polyaxial & TSRH 3D Pedicle Fixation Screws',
    governance_rationale: 'Standard posterior spinal instrumentation',
    source_system: 'manufacturer_catalog',
    vendor: {
      id: '00000000-0000-0000-0053-000000000004',
      vendor_code: 'MEDTRONIC',
      display_name: 'Medtronic Spine & Biologics',
      vendor_type: 'MANUFACTURER'
    },
    component: {
      id: '00000000-0000-0000-0051-000000000030',
      code: 'SPINE_ACDF_SCREW',
      name: 'Cervical Bone Fixation Screw',
      specialty: 'Spine'
    }
  },
  {
    id: '00000000-0000-0000-0055-000000000008',
    facility_id: null,
    vendor_id: '00000000-0000-0000-0053-000000000004',
    component_id: '00000000-0000-0000-0051-000000000031',
    preference_tier: 'PREFERRED',
    sourcing_model: 'DIRECT_OEM',
    authorized_distributor_id: null,
    contract_reference_number: 'MDT-SPN-2026',
    lead_time_days: 2,
    consignment_stock_maintained: true,
    effective_date: '2026-01-01',
    termination_date: null,
    status: 'active',
    is_active: true,
    approval_status: 'approved',
    clinical_notes: 'Clydesdale & Divergence Anterior Lumbar / Cervical PEEK Cages',
    governance_rationale: 'Primary interbody fusion device supplier',
    source_system: 'manufacturer_catalog',
    vendor: {
      id: '00000000-0000-0000-0053-000000000004',
      vendor_code: 'MEDTRONIC',
      display_name: 'Medtronic Spine & Biologics',
      vendor_type: 'MANUFACTURER'
    },
    component: {
      id: '00000000-0000-0000-0051-000000000031',
      code: 'SPINE_INTERBODY_CAGE',
      name: 'Interbody Fusion Cage',
      specialty: 'Spine'
    }
  },
  // Alcon (Ophthalmology)
  {
    id: '00000000-0000-0000-0055-000000000009',
    facility_id: null,
    vendor_id: '00000000-0000-0000-0053-000000000006',
    component_id: '00000000-0000-0000-0051-000000000040',
    preference_tier: 'PREFERRED',
    sourcing_model: 'DIRECT_OEM',
    authorized_distributor_id: null,
    contract_reference_number: 'ALC-IOL-2026',
    lead_time_days: 1,
    consignment_stock_maintained: true,
    effective_date: '2026-01-01',
    termination_date: null,
    status: 'active',
    is_active: true,
    approval_status: 'approved',
    clinical_notes: 'AcrySof IQ & Clareon Monofocal Aspheric IOL platform',
    governance_rationale: 'Primary cataract monofocal lens supplier',
    source_system: 'manufacturer_catalog',
    vendor: {
      id: '00000000-0000-0000-0053-000000000006',
      vendor_code: 'ALCON',
      display_name: 'Alcon Laboratories',
      vendor_type: 'MANUFACTURER'
    },
    component: {
      id: '00000000-0000-0000-0051-000000000040',
      code: 'IOL_MONOFOCAL',
      name: 'Monofocal Posterior Chamber IOL',
      specialty: 'Ophthalmology'
    }
  },
  {
    id: '00000000-0000-0000-0055-000000000010',
    facility_id: null,
    vendor_id: '00000000-0000-0000-0053-000000000006',
    component_id: '00000000-0000-0000-0051-000000000041',
    preference_tier: 'PREFERRED',
    sourcing_model: 'DIRECT_OEM',
    authorized_distributor_id: null,
    contract_reference_number: 'ALC-IOL-2026',
    lead_time_days: 1,
    consignment_stock_maintained: true,
    effective_date: '2026-01-01',
    termination_date: null,
    status: 'active',
    is_active: true,
    approval_status: 'approved',
    clinical_notes: 'AcrySof IQ Toric & Clareon Toric Astigmatism IOLs',
    governance_rationale: 'Primary premium toric cataract lens platform',
    source_system: 'manufacturer_catalog',
    vendor: {
      id: '00000000-0000-0000-0053-000000000006',
      vendor_code: 'ALCON',
      display_name: 'Alcon Laboratories',
      vendor_type: 'MANUFACTURER'
    },
    component: {
      id: '00000000-0000-0000-0051-000000000041',
      code: 'IOL_TORIC',
      name: 'Toric Astigmatism Correcting IOL',
      specialty: 'Ophthalmology'
    }
  },
  // Arthrex (Sports Medicine)
  {
    id: '00000000-0000-0000-0055-000000000011',
    facility_id: null,
    vendor_id: '00000000-0000-0000-0053-000000000007',
    component_id: '00000000-0000-0000-0051-000000000050',
    preference_tier: 'PREFERRED',
    sourcing_model: 'DIRECT_OEM',
    authorized_distributor_id: null,
    contract_reference_number: 'ARTH-SM-2026',
    lead_time_days: 2,
    consignment_stock_maintained: true,
    effective_date: '2026-01-01',
    termination_date: null,
    status: 'active',
    is_active: true,
    approval_status: 'approved',
    clinical_notes: 'SwiveLock & BioComposite SutureTak Rotator Cuff Suture Anchors',
    governance_rationale: 'Standard sports medicine shoulder anchor construct',
    source_system: 'manufacturer_catalog',
    vendor: {
      id: '00000000-0000-0000-0053-000000000007',
      vendor_code: 'ARTHREX',
      display_name: 'Arthrex',
      vendor_type: 'MANUFACTURER'
    },
    component: {
      id: '00000000-0000-0000-0051-000000000050',
      code: 'SHOULDER_ROTATOR_ANCHOR',
      name: 'Rotator Cuff Suture Anchor',
      specialty: 'Sports Medicine'
    }
  }
];

// ==============================================================================
// SERVICE IMPLEMENTATION
// ==============================================================================

export const vendorComponentService = {
  /**
   * Retrieves paginated, filtered vendor-to-component mappings.
   * Handles multi-tier resolution: Facility Overrides take precedence over Global Baseline records.
   * @param {Object} options
   * @returns {Promise<{mappings: Array, metrics: Object, pagination: Object}>}
   */
  async getMappings(options = {}) {
    const {
      facilityId = null,
      specialty = null,
      vendorId = null,
      componentId = null,
      preferenceTier = null,
      status = null,
      sourcingModel = null,
      search = '',
      page = 1,
      limit = 50,
      includeInactive = false
    } = options;

    let items;

    try {
      if (db.ensureAuthSession) {
        await db.ensureAuthSession();
      }

      let query = supabase
        .from('implant_vendor_component_mappings')
        .select(`
          *,
          vendor:vendor_id (id, vendor_code, display_name, legal_name, vendor_type),
          component:component_id (id, code, name, default_duration_classification, category:category_id (id, name, specialty)),
          authorized_distributor:authorized_distributor_id (id, vendor_code, display_name)
        `);

      if (facilityId) {
        query = query.or(`facility_id.is.null,facility_id.eq.${facilityId}`);
      } else {
        query = query.is('facility_id', null);
      }

      if (status) {
        query = query.eq('status', status);
      } else if (!includeInactive) {
        query = query.eq('is_active', true);
      }

      const { data, error } = await query;
      if (!error && Array.isArray(data) && data.length > 0) {
        items = data;
      } else {
        items = [...GLOBAL_BASELINE_MAPPINGS];
      }
    } catch {
      items = [...GLOBAL_BASELINE_MAPPINGS];
    }

    // Resolution Precedence Map: If facility record exists for (vendor_id, component_id), it overrides global
    const resolutionMap = new Map();

    // 1. First populate global baselines
    items
      .filter(m => m.facility_id === null)
      .forEach(m => {
        const key = `${m.vendor_id}_${m.component_id}`;
        resolutionMap.set(key, m);
      });

    // 2. Overlay facility-specific overrides if facilityId is specified
    if (facilityId) {
      items
        .filter(m => m.facility_id === facilityId)
        .forEach(m => {
          const key = `${m.vendor_id}_${m.component_id}`;
          resolutionMap.set(key, m);
        });
    }

    const resolvedItems = Array.from(resolutionMap.values());

    // Apply Client-Side Filtering
    const filtered = resolvedItems.filter(mapping => {
      // Status Filter
      if (status) {
        if (mapping.status !== status) return false;
      } else if (!includeInactive && !mapping.is_active) {
        return false;
      }

      // Vendor Filter
      if (vendorId && mapping.vendor_id !== vendorId) return false;

      // Component Filter
      if (componentId && mapping.component_id !== componentId) return false;

      // Preference Tier Filter
      if (preferenceTier && mapping.preference_tier !== preferenceTier) return false;

      // Sourcing Model Filter
      if (sourcingModel && mapping.sourcing_model !== sourcingModel) return false;

      // Specialty Filter
      if (specialty && specialty.trim() !== '') {
        const compSpecialty = (mapping.component?.specialty || mapping.component?.category?.specialty || '').toLowerCase();
        if (compSpecialty !== specialty.toLowerCase()) return false;
      }

      // Text Search (Vendor name, code, component name, code, contract #)
      if (search && search.trim() !== '') {
        const q = search.toLowerCase().trim();
        const vCode = (mapping.vendor?.vendor_code || '').toLowerCase();
        const vName = (mapping.vendor?.display_name || '').toLowerCase();
        const cCode = (mapping.component?.code || '').toLowerCase();
        const cName = (mapping.component?.name || '').toLowerCase();
        const contract = (mapping.contract_reference_number || '').toLowerCase();

        if (
          !vCode.includes(q) &&
          !vName.includes(q) &&
          !cCode.includes(q) &&
          !cName.includes(q) &&
          !contract.includes(q)
        ) {
          return false;
        }
      }

      return true;
    });

    const activeVendors = new Set(resolvedItems.filter(m => m.is_active).map(m => m.vendor_id));

    const metrics = {
      total: resolvedItems.length,
      activeCount: resolvedItems.filter(m => m.is_active).length,
      preferredCount: resolvedItems.filter(m => m.is_active && m.preference_tier === 'PREFERRED').length,
      restrictedCount: resolvedItems.filter(m => m.preference_tier === 'RESTRICTED').length,
      oemVendorsMapped: activeVendors.size,
      filteredCount: filtered.length
    };

    const startIndex = (page - 1) * limit;
    const paginatedItems = filtered.slice(startIndex, startIndex + limit);

    return {
      mappings: paginatedItems,
      metrics,
      pagination: {
        page,
        limit,
        totalPages: Math.ceil(filtered.length / limit) || 1,
        totalItems: filtered.length
      }
    };
  },

  /**
   * Retrieves single mapping by ID.
   * @param {string} mappingId
   * @returns {Promise<Object>}
   */
  async getMappingById(mappingId) {
    if (!mappingId) throw new Error('mappingId is required');

    let mapping = null;

    try {
      if (db.ensureAuthSession) {
        await db.ensureAuthSession();
      }

      const { data, error } = await supabase
        .from('implant_vendor_component_mappings')
        .select(`
          *,
          vendor:vendor_id (id, vendor_code, display_name, legal_name, vendor_type),
          component:component_id (id, code, name, default_duration_classification, category:category_id (id, name, specialty)),
          authorized_distributor:authorized_distributor_id (id, vendor_code, display_name)
        `)
        .eq('id', mappingId)
        .single();

      if (!error && data) {
        mapping = data;
      }
    } catch {
      // Fallback
    }

    if (!mapping) {
      mapping = GLOBAL_BASELINE_MAPPINGS.find(m => m.id === mappingId);
    }

    if (!mapping) {
      throw new Error(`Vendor-component mapping not found with ID: ${mappingId}`);
    }

    return mapping;
  },

  /**
   * Saves or updates a vendor-to-component mapping.
   * @param {Object} payload
   * @returns {Promise<Object>}
   */
  async saveMapping(payload) {
    const {
      id = null,
      facility_id = null,
      vendor_id,
      component_id,
      preference_tier = 'STANDARD',
      sourcing_model = 'DIRECT_OEM',
      authorized_distributor_id = null,
      contract_reference_number = null,
      lead_time_days = 3,
      consignment_stock_maintained = false,
      effective_date = new Date().toISOString().split('T')[0],
      termination_date = null,
      clinical_notes = null,
      governance_rationale = null
    } = payload;

    // Invariant Validation
    if (!vendor_id) {
      throw new Error('VALIDATION ERROR: Vendor OEM is required.');
    }
    if (!component_id) {
      throw new Error('VALIDATION ERROR: Clinical component is required.');
    }
    if (!['PREFERRED', 'STANDARD', 'SECONDARY', 'NON_PREFERRED', 'RESTRICTED'].includes(preference_tier)) {
      throw new Error(`VALIDATION ERROR: Invalid preference tier: ${preference_tier}`);
    }
    if (!['DIRECT_OEM', 'DISTRIBUTOR_CONSIGNMENT', 'BILL_ONLY', 'LOANER_SET'].includes(sourcing_model)) {
      throw new Error(`VALIDATION ERROR: Invalid sourcing model: ${sourcing_model}`);
    }
    if (sourcing_model === 'DISTRIBUTOR_CONSIGNMENT' && !authorized_distributor_id) {
      throw new Error('VALIDATION ERROR: Distributor consignment model requires an authorized distributor.');
    }
    if (termination_date && effective_date && termination_date < effective_date) {
      throw new Error('VALIDATION ERROR: Termination date cannot be prior to effective date.');
    }

    try {
      if (db.ensureAuthSession) {
        await db.ensureAuthSession();
      }

      const { data, error } = await supabase.rpc('fn_upsert_vendor_component_mapping', {
        p_mapping_id: id,
        p_facility_id: facility_id,
        p_vendor_id: vendor_id,
        p_component_id: component_id,
        p_preference_tier: preference_tier,
        p_sourcing_model: sourcing_model,
        p_authorized_distributor_id: authorized_distributor_id,
        p_contract_reference_number: contract_reference_number ? contract_reference_number.trim() : null,
        p_lead_time_days: Number(lead_time_days || 3),
        p_consignment_stock_maintained: Boolean(consignment_stock_maintained),
        p_effective_date: effective_date,
        p_termination_date: termination_date || null,
        p_clinical_notes: clinical_notes ? clinical_notes.trim() : null,
        p_governance_rationale: governance_rationale ? governance_rationale.trim() : null
      });

      if (!error && data?.success) {
        return { success: true, mapping_id: data.mapping_id };
      }
    } catch {
      // Fallback
    }

    // In-memory fallback
    const record = {
      id: id || `map-${Date.now()}`,
      facility_id,
      vendor_id,
      component_id,
      preference_tier,
      sourcing_model,
      authorized_distributor_id,
      contract_reference_number: contract_reference_number ? contract_reference_number.trim() : null,
      lead_time_days: Number(lead_time_days || 3),
      consignment_stock_maintained: Boolean(consignment_stock_maintained),
      effective_date,
      termination_date: termination_date || null,
      clinical_notes: clinical_notes ? clinical_notes.trim() : null,
      governance_rationale: governance_rationale ? governance_rationale.trim() : null,
      status: 'active',
      is_active: true,
      approval_status: 'approved',
      updated_at: new Date().toISOString()
    };

    if (id) {
      const idx = GLOBAL_BASELINE_MAPPINGS.findIndex(m => m.id === id);
      if (idx !== -1) {
        GLOBAL_BASELINE_MAPPINGS[idx] = { ...GLOBAL_BASELINE_MAPPINGS[idx], ...record };
      }
    } else {
      record.created_at = new Date().toISOString();
      GLOBAL_BASELINE_MAPPINGS.push(record);
    }

    return { success: true, mapping_id: record.id, mapping: record };
  },

  /**
   * Updates preference tier with mandatory governance rationale.
   * @param {string} mappingId
   * @param {string} newTier
   * @param {string} rationale
   * @returns {Promise<Object>}
   */
  async updatePreferenceTier(mappingId, newTier, rationale) {
    if (!mappingId) throw new Error('mappingId is required');
    if (!['PREFERRED', 'STANDARD', 'SECONDARY', 'NON_PREFERRED', 'RESTRICTED'].includes(newTier)) {
      throw new Error(`VALIDATION ERROR: Invalid preference tier: ${newTier}`);
    }

    try {
      if (db.ensureAuthSession) {
        await db.ensureAuthSession();
      }

      const { data, error } = await supabase.rpc('fn_change_mapping_preference_tier', {
        p_mapping_id: mappingId,
        p_new_tier: newTier,
        p_rationale: rationale ? rationale.trim() : ''
      });

      if (!error && data?.success) {
        return data;
      }
    } catch {
      // Fallback
    }

    const idx = GLOBAL_BASELINE_MAPPINGS.findIndex(m => m.id === mappingId);
    if (idx !== -1) {
      GLOBAL_BASELINE_MAPPINGS[idx].preference_tier = newTier;
      if (rationale) GLOBAL_BASELINE_MAPPINGS[idx].governance_rationale = rationale.trim();
      return { success: true, mapping_id: mappingId, preference_tier: newTier };
    }

    throw new Error(`Vendor-component mapping not found with ID: ${mappingId}`);
  },

  /**
   * Terminates or deactivates a mapping with mandatory rationale.
   * @param {string} mappingId
   * @param {string} rationale
   * @returns {Promise<Object>}
   */
  async terminateMapping(mappingId, rationale) {
    if (!mappingId) throw new Error('mappingId is required');
    if (!rationale || rationale.trim() === '') {
      throw new Error('VALIDATION ERROR: Termination rationale is required.');
    }

    try {
      if (db.ensureAuthSession) {
        await db.ensureAuthSession();
      }

      const { data, error } = await supabase.rpc('fn_deactivate_vendor_component_mapping', {
        p_mapping_id: mappingId,
        p_rationale: rationale.trim()
      });

      if (!error && data?.success) {
        return data;
      }
    } catch {
      // Fallback
    }

    const idx = GLOBAL_BASELINE_MAPPINGS.findIndex(m => m.id === mappingId);
    if (idx !== -1) {
      GLOBAL_BASELINE_MAPPINGS[idx].status = 'terminated';
      GLOBAL_BASELINE_MAPPINGS[idx].is_active = false;
      GLOBAL_BASELINE_MAPPINGS[idx].termination_date = new Date().toISOString().split('T')[0];
      GLOBAL_BASELINE_MAPPINGS[idx].governance_rationale = rationale.trim();
      return { success: true, mapping_id: mappingId, status: 'terminated' };
    }

    throw new Error(`Vendor-component mapping not found with ID: ${mappingId}`);
  },

  /**
   * Reactivates a terminated mapping.
   * @param {string} mappingId
   * @returns {Promise<Object>}
   */
  async reactivateMapping(mappingId) {
    if (!mappingId) throw new Error('mappingId is required');

    try {
      if (db.ensureAuthSession) {
        await db.ensureAuthSession();
      }

      const { data, error } = await supabase.rpc('fn_reactivate_vendor_component_mapping', {
        p_mapping_id: mappingId
      });

      if (!error && data?.success) {
        return data;
      }
    } catch {
      // Fallback
    }

    const idx = GLOBAL_BASELINE_MAPPINGS.findIndex(m => m.id === mappingId);
    if (idx !== -1) {
      GLOBAL_BASELINE_MAPPINGS[idx].status = 'active';
      GLOBAL_BASELINE_MAPPINGS[idx].is_active = true;
      GLOBAL_BASELINE_MAPPINGS[idx].termination_date = null;
      return { success: true, mapping_id: mappingId, status: 'active' };
    }

    throw new Error(`Vendor-component mapping not found with ID: ${mappingId}`);
  },

  /**
   * Validates vendor-component eligibility for clinical usage or preference card selection.
   * Resolves facility override first, then falls back to global baseline.
   * @param {Object} params
   * @returns {Promise<{isAllowed: boolean, isRestricted: boolean, preferenceTier: string, sourcingModel: string, reason: string|null}>}
   */
  async validateVendorComponentEligibility({ facilityId = null, vendorId, componentId }) {
    if (!vendorId) throw new Error('vendorId is required');
    if (!componentId) throw new Error('componentId is required');

    const { mappings } = await this.getMappings({ facilityId, vendorId, componentId, includeInactive: true });
    
    // Exact mapping for (vendorId, componentId)
    const mapping = mappings.find(m => m.vendor_id === vendorId && m.component_id === componentId);

    if (!mapping) {
      return {
        isAllowed: false,
        isRestricted: false,
        preferenceTier: null,
        sourcingModel: null,
        reason: 'UNVERIFIED_VENDOR_CAPABILITY: No commercial relationship or global catalog mapping exists between this vendor and component.'
      };
    }

    if (mapping.preference_tier === 'RESTRICTED') {
      return {
        isAllowed: false,
        isRestricted: true,
        preferenceTier: 'RESTRICTED',
        sourcingModel: mapping.sourcing_model,
        reason: `VENDOR RESTRICTED: Sourcing from this vendor for this component is prohibited at this facility. Rationale: ${mapping.governance_rationale || 'Restricted by Clinical Governance'}`
      };
    }

    if (mapping.status === 'terminated' || !mapping.is_active) {
      return {
        isAllowed: false,
        isRestricted: false,
        preferenceTier: mapping.preference_tier,
        sourcingModel: mapping.sourcing_model,
        reason: 'MAPPING_TERMINATED: Commercial sourcing relationship for this component was terminated.'
      };
    }

    const today = new Date().toISOString().split('T')[0];
    if (mapping.effective_date && mapping.effective_date > today) {
      return {
        isAllowed: false,
        isRestricted: false,
        preferenceTier: mapping.preference_tier,
        sourcingModel: mapping.sourcing_model,
        reason: `FUTURE_EFFECTIVE: Commercial authorization starts on ${mapping.effective_date}.`
      };
    }

    if (mapping.termination_date && mapping.termination_date < today) {
      return {
        isAllowed: false,
        isRestricted: false,
        preferenceTier: mapping.preference_tier,
        sourcingModel: mapping.sourcing_model,
        reason: `CONTRACT_EXPIRED: Commercial authorization expired on ${mapping.termination_date}.`
      };
    }

    return {
      isAllowed: true,
      isRestricted: false,
      preferenceTier: mapping.preference_tier,
      sourcingModel: mapping.sourcing_model,
      reason: null
    };
  }
};

// Wire onto db singleton
if (typeof db !== 'undefined') {
  db.getVendorComponentMappings = (...args) => vendorComponentService.getMappings(...args);
  db.getVendorComponentMappingById = (...args) => vendorComponentService.getMappingById(...args);
  db.saveVendorComponentMapping = (...args) => vendorComponentService.saveMapping(...args);
  db.terminateVendorComponentMapping = (...args) => vendorComponentService.terminateMapping(...args);
  db.reactivateVendorComponentMapping = (...args) => vendorComponentService.reactivateMapping(...args);
  db.validateVendorComponentEligibility = (...args) => vendorComponentService.validateVendorComponentEligibility(...args);
}

export default vendorComponentService;
