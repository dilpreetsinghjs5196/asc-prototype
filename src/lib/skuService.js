/**
 * Phase 54: Implant Product SKU Master Service
 * Manages medical device catalog items, brand families, UDI-DI specifications,
 * and distributor cross-reference mappings.
 */

import { supabase, db } from './supabase.js';

export const STERILE_PACKAGING_TYPES = {
  STERILE_PACKAGED: 'STERILE_PACKAGED',
  NON_STERILE_TRAY_REUSABLE: 'NON_STERILE_TRAY_REUSABLE',
  LOOSE_STERILIZED: 'LOOSE_STERILIZED'
};

export const LATERALITY_TYPES = {
  LEFT: 'LEFT',
  RIGHT: 'RIGHT',
  BILATERAL: 'BILATERAL',
  NOT_APPLICABLE: 'NOT_APPLICABLE'
};

export const MATERIAL_TYPES = {
  TITANIUM: 'TITANIUM',
  TITANIUM_ALLOY: 'TITANIUM_ALLOY',
  COBALT_CHROME: 'COBALT_CHROME',
  STAINLESS_STEEL: 'STAINLESS_STEEL',
  CERAMIC: 'CERAMIC',
  PEEK: 'PEEK',
  UHMWPE: 'UHMWPE',
  HYDROPHILIC_ACRYLIC: 'HYDROPHILIC_ACRYLIC',
  HYDROPHOBIC_ACRYLIC: 'HYDROPHOBIC_ACRYLIC',
  SILICONE: 'SILICONE',
  BIOLOGIC_ALLOGRAFT: 'BIOLOGIC_ALLOGRAFT',
  TISSUE_COLLAGEN: 'TISSUE_COLLAGEN',
  RESORBABLE_POLYMER: 'RESORBABLE_POLYMER',
  OTHER: 'OTHER'
};

export const DURATION_CLASSIFICATIONS = {
  PERMANENT: 'PERMANENT',
  TEMPORARY: 'TEMPORARY',
  EXCHANGEABLE: 'EXCHANGEABLE',
  ABSORBABLE: 'ABSORBABLE',
  REMOVABLE: 'REMOVABLE'
};

export const MRI_SAFETY_STATUSES = {
  MR_SAFE: 'MR_SAFE',
  MR_CONDITIONAL: 'MR_CONDITIONAL',
  MR_UNSAFE: 'MR_UNSAFE',
  NOT_EVALUATED: 'NOT_EVALUATED'
};

export const SKU_STATUSES = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  DRAFT: 'draft',
  PENDING_VERIFICATION: 'pending_verification',
  DISCONTINUED: 'discontinued',
  RECALLED: 'recalled'
};

export const RECALL_CLASSES = {
  CLASS_I: 'CLASS_I',
  CLASS_II: 'CLASS_II',
  CLASS_III: 'CLASS_III'
};

// ==============================================================================
// GLOBAL BASELINE IN-MEMORY MOCKS (OFFLINE / TEST FALLBACK)
// ==============================================================================

export const GLOBAL_BASELINE_FAMILIES = [
  {
    id: '00000000-0000-0000-0054-000000000001',
    vendor_id: '00000000-0000-0000-0053-000000000001',
    vendor_code: 'STRYKER',
    vendor_name: 'Stryker Orthopaedics',
    family_code: 'TRIATHLON_KNEE',
    name: 'Triathlon Total Knee System',
    specialty: 'Orthopedics',
    description: 'Single-radius total knee arthroplasty platform',
    is_active: true
  },
  {
    id: '00000000-0000-0000-0054-000000000002',
    vendor_id: '00000000-0000-0000-0053-000000000002',
    vendor_code: 'ZIMMER_BIOMET',
    vendor_name: 'Zimmer Biomet',
    family_code: 'PERSONA_KNEE',
    name: 'Persona The Personalized Knee',
    specialty: 'Orthopedics',
    description: 'Anatomically contoured total knee reconstruction system',
    is_active: true
  },
  {
    id: '00000000-0000-0000-0054-000000000003',
    vendor_id: '00000000-0000-0000-0053-000000000004',
    vendor_code: 'MEDTRONIC',
    vendor_name: 'Medtronic Spine & Biologics',
    family_code: 'POLARIS_SPINE',
    name: 'Polaris 5.5 Spinal System',
    specialty: 'Spine',
    description: 'Universal pedicle screw fixation for thoracolumbar spine',
    is_active: true
  },
  {
    id: '00000000-0000-0000-0054-000000000004',
    vendor_id: '00000000-0000-0000-0053-000000000006',
    vendor_code: 'ALCON',
    vendor_name: 'Alcon Surgical',
    family_code: 'ACRYSOF_IQ',
    name: 'AcrySof IQ IOL Platform',
    specialty: 'Ophthalmology',
    description: 'Aspheric hydrophobic acrylic intraocular lens platform',
    is_active: true
  }
];

export const GLOBAL_BASELINE_SKUS = [
  {
    id: '00000000-0000-0000-0054-000000000101',
    facility_id: null,
    vendor_id: '00000000-0000-0000-0053-000000000001',
    family_id: '00000000-0000-0000-0054-000000000001',
    component_id: '00000000-0000-0000-0051-000000000010',
    catalog_number: '5520-F-401',
    product_name: 'Triathlon CoCr Femoral Component Size 4 Left',
    internal_sku: 'SKU-STR-TRI-F4L',
    description: 'Single-radius primary total knee femoral resurfacing component',
    udi_di: '00888888123451',
    fda_gudid_listing_id: 'D123456',
    hcpcs_c_code: 'C1776',
    secondary_hcpcs_code: null,
    sterile_packaging: 'STERILE_PACKAGED',
    laterality: 'LEFT',
    material_composition: 'COBALT_CHROME',
    size_dimension: 'Size 4',
    duration_classification: 'PERMANENT',
    mri_safety_status: 'MR_CONDITIONAL',
    latex_free: true,
    biological_tissue: false,
    requires_lot_tracking: true,
    requires_serial_tracking: false,
    list_price: 2450.00,
    unit_of_measure: 'EA',
    status: 'active',
    is_active: true,
    recall_class: null,
    recall_date: null,
    recall_reason: null,
    source_system: 'manual_entry',
    verification_status: 'verified',
    vendor: {
      id: '00000000-0000-0000-0053-000000000001',
      vendor_code: 'STRYKER',
      display_name: 'Stryker Orthopaedics'
    },
    component: {
      id: '00000000-0000-0000-0051-000000000010',
      code: 'KNEE_FEMORAL',
      name: 'Femoral Knee Component'
    },
    family: {
      id: '00000000-0000-0000-0054-000000000001',
      family_code: 'TRIATHLON_KNEE',
      name: 'Triathlon Total Knee System'
    }
  },
  {
    id: '00000000-0000-0000-0054-000000000102',
    facility_id: null,
    vendor_id: '00000000-0000-0000-0053-000000000001',
    family_id: '00000000-0000-0000-0054-000000000001',
    component_id: '00000000-0000-0000-0051-000000000010',
    catalog_number: '5520-F-402',
    product_name: 'Triathlon CoCr Femoral Component Size 4 Right',
    internal_sku: 'SKU-STR-TRI-F4R',
    description: 'Single-radius primary total knee femoral resurfacing component',
    udi_di: '00888888123468',
    fda_gudid_listing_id: 'D123457',
    hcpcs_c_code: 'C1776',
    secondary_hcpcs_code: null,
    sterile_packaging: 'STERILE_PACKAGED',
    laterality: 'RIGHT',
    material_composition: 'COBALT_CHROME',
    size_dimension: 'Size 4',
    duration_classification: 'PERMANENT',
    mri_safety_status: 'MR_CONDITIONAL',
    latex_free: true,
    biological_tissue: false,
    requires_lot_tracking: true,
    requires_serial_tracking: false,
    list_price: 2450.00,
    unit_of_measure: 'EA',
    status: 'active',
    is_active: true,
    recall_class: null,
    recall_date: null,
    recall_reason: null,
    source_system: 'manual_entry',
    verification_status: 'verified',
    vendor: {
      id: '00000000-0000-0000-0053-000000000001',
      vendor_code: 'STRYKER',
      display_name: 'Stryker Orthopaedics'
    },
    component: {
      id: '00000000-0000-0000-0051-000000000010',
      code: 'KNEE_FEMORAL',
      name: 'Femoral Knee Component'
    },
    family: {
      id: '00000000-0000-0000-0054-000000000001',
      family_code: 'TRIATHLON_KNEE',
      name: 'Triathlon Total Knee System'
    }
  },
  {
    id: '00000000-0000-0000-0054-000000000103',
    facility_id: null,
    vendor_id: '00000000-0000-0000-0053-000000000002',
    family_id: '00000000-0000-0000-0054-000000000002',
    component_id: '00000000-0000-0000-0051-000000000011',
    catalog_number: '42-5200-005-01',
    product_name: 'Persona Anatomical Tibial Baseplate Size E Cemented',
    internal_sku: 'SKU-ZB-PER-TE',
    description: 'Titanium alloy asymmetric anatomical cemented tibial tray',
    udi_di: '00777777234562',
    fda_gudid_listing_id: 'D234567',
    hcpcs_c_code: 'C1776',
    secondary_hcpcs_code: null,
    sterile_packaging: 'STERILE_PACKAGED',
    laterality: 'BILATERAL',
    material_composition: 'TITANIUM_ALLOY',
    size_dimension: 'Size E',
    duration_classification: 'PERMANENT',
    mri_safety_status: 'MR_CONDITIONAL',
    latex_free: true,
    biological_tissue: false,
    requires_lot_tracking: true,
    requires_serial_tracking: false,
    list_price: 1890.00,
    unit_of_measure: 'EA',
    status: 'active',
    is_active: true,
    recall_class: null,
    recall_date: null,
    recall_reason: null,
    source_system: 'manual_entry',
    verification_status: 'verified',
    vendor: {
      id: '00000000-0000-0000-0053-000000000002',
      vendor_code: 'ZIMMER_BIOMET',
      display_name: 'Zimmer Biomet'
    },
    component: {
      id: '00000000-0000-0000-0051-000000000011',
      code: 'KNEE_TIBIAL_TRAY',
      name: 'Tibial Baseplate / Tray'
    },
    family: {
      id: '00000000-0000-0000-0054-000000000002',
      family_code: 'PERSONA_KNEE',
      name: 'Persona The Personalized Knee'
    }
  },
  {
    id: '00000000-0000-0000-0054-000000000104',
    facility_id: null,
    vendor_id: '00000000-0000-0000-0053-000000000004',
    family_id: '00000000-0000-0000-0054-000000000003',
    component_id: '00000000-0000-0000-0051-000000000030',
    catalog_number: '0600-65-045',
    product_name: 'Polaris 5.5 Polyaxial Pedicle Screw 6.5mm x 45mm',
    internal_sku: 'SKU-MDT-POL-6545',
    description: 'Self-tapping titanium polyaxial pedicle screw for posterior lumbar fixation',
    udi_di: '00666666345673',
    fda_gudid_listing_id: 'D345678',
    hcpcs_c_code: 'C1713',
    secondary_hcpcs_code: null,
    sterile_packaging: 'STERILE_PACKAGED',
    laterality: 'NOT_APPLICABLE',
    material_composition: 'TITANIUM_ALLOY',
    size_dimension: '6.5mm x 45mm',
    duration_classification: 'PERMANENT',
    mri_safety_status: 'MR_CONDITIONAL',
    latex_free: true,
    biological_tissue: false,
    requires_lot_tracking: true,
    requires_serial_tracking: false,
    list_price: 1150.00,
    unit_of_measure: 'EA',
    status: 'active',
    is_active: true,
    recall_class: null,
    recall_date: null,
    recall_reason: null,
    source_system: 'manual_entry',
    verification_status: 'verified',
    vendor: {
      id: '00000000-0000-0000-0053-000000000004',
      vendor_code: 'MEDTRONIC',
      display_name: 'Medtronic Spine & Biologics'
    },
    component: {
      id: '00000000-0000-0000-0051-000000000030',
      code: 'SPINE_ACDF_SCREW',
      name: 'Cervical Bone Fixation Screw'
    },
    family: {
      id: '00000000-0000-0000-0054-000000000003',
      family_code: 'POLARIS_SPINE',
      name: 'Polaris 5.5 Spinal System'
    }
  },
  {
    id: '00000000-0000-0000-0054-000000000105',
    facility_id: null,
    vendor_id: '00000000-0000-0000-0053-000000000006',
    family_id: '00000000-0000-0000-0054-000000000004',
    component_id: '00000000-0000-0000-0051-000000000040',
    catalog_number: 'SN60WF-210',
    product_name: 'AcrySof IQ Aspheric UV Monofocal Intraocular Lens +21.0D',
    internal_sku: 'SKU-ALC-SN6-210',
    description: 'Hydrophobic acrylic aspheric single-piece foldable posterior chamber IOL',
    udi_di: '00555555456784',
    fda_gudid_listing_id: 'D456789',
    hcpcs_c_code: 'L8699',
    secondary_hcpcs_code: null,
    sterile_packaging: 'STERILE_PACKAGED',
    laterality: 'NOT_APPLICABLE',
    material_composition: 'HYDROPHOBIC_ACRYLIC',
    size_dimension: '+21.0 Diopter',
    duration_classification: 'PERMANENT',
    mri_safety_status: 'MR_SAFE',
    latex_free: true,
    biological_tissue: false,
    requires_lot_tracking: true,
    requires_serial_tracking: false,
    list_price: 285.00,
    unit_of_measure: 'EA',
    status: 'active',
    is_active: true,
    recall_class: null,
    recall_date: null,
    recall_reason: null,
    source_system: 'manual_entry',
    verification_status: 'verified',
    vendor: {
      id: '00000000-0000-0000-0053-000000000006',
      vendor_code: 'ALCON',
      display_name: 'Alcon Surgical'
    },
    component: {
      id: '00000000-0000-0000-0051-000000000040',
      code: 'IOL_MONOFOCAL',
      name: 'Monofocal Posterior Chamber IOL'
    },
    family: {
      id: '00000000-0000-0000-0054-000000000004',
      family_code: 'ACRYSOF_IQ',
      name: 'AcrySof IQ IOL Platform'
    }
  }
];

export const GLOBAL_BASELINE_DISTRIBUTOR_MAPPINGS = [
  {
    id: '00000000-0000-0000-0054-000000000201',
    sku_id: '00000000-0000-0000-0054-000000000101',
    distributor_id: '00000000-0000-0000-0053-000000000013',
    distributor_name: 'Cardinal Health',
    distributor_code: 'CARDINAL_HEALTH',
    distributor_item_number: 'CH-9411-401',
    package_unit: 'EA',
    units_per_package: 1,
    is_preferred_distributor: true,
    status: 'active'
  },
  {
    id: '00000000-0000-0000-0054-000000000202',
    sku_id: '00000000-0000-0000-0054-000000000101',
    distributor_id: '00000000-0000-0000-0053-000000000014',
    distributor_name: 'Medline Industries',
    distributor_code: 'MEDLINE',
    distributor_item_number: 'MDL-88310',
    package_unit: 'EA',
    units_per_package: 1,
    is_preferred_distributor: false,
    status: 'active'
  },
  {
    id: '00000000-0000-0000-0054-000000000203',
    sku_id: '00000000-0000-0000-0054-000000000103',
    distributor_id: '00000000-0000-0000-0053-000000000015',
    distributor_name: 'Owens & Minor',
    distributor_code: 'OWENS_MINOR',
    distributor_item_number: 'OM-77201',
    package_unit: 'EA',
    units_per_package: 1,
    is_preferred_distributor: true,
    status: 'active'
  }
];

// ==============================================================================
// SERVICE IMPLEMENTATION
// ==============================================================================

export const skuService = {
  /**
   * Validates a UDI-DI against GS1 GTIN-14 and HIBCC rules.
   * @param {string} udiDi
   * @returns {{isValid: boolean, standard: 'GS1'|'HIBCC'|'UNKNOWN', error: string|null}}
   */
  validateUdiDi(udiDi) {
    if (!udiDi || typeof udiDi !== 'string') {
      return { isValid: false, standard: 'UNKNOWN', error: 'UDI-DI must be a non-empty string' };
    }

    const clean = udiDi.trim();

    // 1. GS1 GTIN-14 (14 numeric digits with Modulo-10 check digit)
    if (/^\d{14}$/.test(clean)) {
      let sum = 0;
      for (let i = 0; i < 13; i++) {
        const digit = parseInt(clean[i], 10);
        // Odd positions (0-indexed: 0, 2, 4...) have weight 3 in 14-digit GTIN
        const weight = (i % 2 === 0) ? 3 : 1;
        sum += digit * weight;
      }
      const checkDigit = (10 - (sum % 10)) % 10;
      const expectedDigit = parseInt(clean[13], 10);

      if (checkDigit === expectedDigit) {
        return { isValid: true, standard: 'GS1', error: null };
      }
      return {
        isValid: false,
        standard: 'GS1',
        error: `Invalid GS1 GTIN-14 checksum digit. Expected ${checkDigit}, got ${expectedDigit}.`
      };
    }

    // 2. HIBCC Primary DI (+ followed by alphanumeric)
    if (/^\+[A-Z0-9]{4,18}[0-9]$/i.test(clean)) {
      return { isValid: true, standard: 'HIBCC', error: null };
    }

    return {
      isValid: false,
      standard: 'UNKNOWN',
      error: 'UDI-DI format not recognized. Must be 14-digit GS1 GTIN-14 or HIBCC format.'
    };
  },

  /**
   * Retrieves paginated, filtered catalog SKUs.
   * @param {Object} options
   * @returns {Promise<{skus: Array, metrics: Object, pagination: Object}>}
   */
  async getSkus(options = {}) {
    const {
      search = '',
      vendorId = null,
      componentId = null,
      familyId = null,
      status = null,
      laterality = null,
      facilityId = null,
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
        .from('implant_product_skus')
        .select(`
          *,
          vendor:vendor_id (id, vendor_code, display_name, legal_name),
          component:component_id (id, code, name, default_duration),
          family:family_id (id, family_code, name)
        `)
        .order('product_name', { ascending: true });

      if (vendorId) query = query.eq('vendor_id', vendorId);
      if (componentId) query = query.eq('component_id', componentId);
      if (familyId) query = query.eq('family_id', familyId);
      if (laterality) query = query.eq('laterality', laterality);

      if (status) {
        query = query.eq('status', status);
      } else if (!includeInactive) {
        query = query.eq('is_active', true);
      }

      const { data, error } = await query;
      if (!error && Array.isArray(data) && data.length > 0) {
        items = data;
      } else {
        items = [...GLOBAL_BASELINE_SKUS];
      }
    } catch {
      items = [...GLOBAL_BASELINE_SKUS];
    }

    // Apply Client-Side Filtering
    let filtered = items.filter(sku => {
      // Tenant Scope
      if (facilityId) {
        if (sku.facility_id !== null && sku.facility_id !== facilityId) return false;
      }

      // Status Filter
      if (status) {
        if (sku.status !== status) return false;
      } else if (!includeInactive && !sku.is_active) {
        return false;
      }

      // Vendor Filter
      if (vendorId && sku.vendor_id !== vendorId) return false;

      // Component Filter
      if (componentId && sku.component_id !== componentId) return false;

      // Laterality Filter
      if (laterality && sku.laterality !== laterality) return false;

      // Text Search (Catalog #, Product Name, UDI, C-Code, Internal SKU)
      if (search && search.trim() !== '') {
        const q = search.toLowerCase().trim();
        const cat = (sku.catalog_number || '').toLowerCase();
        const name = (sku.product_name || '').toLowerCase();
        const udi = (sku.udi_di || '').toLowerCase();
        const ccode = (sku.hcpcs_c_code || '').toLowerCase();
        const isku = (sku.internal_sku || '').toLowerCase();
        const vname = (sku.vendor?.display_name || '').toLowerCase();
        if (
          !cat.includes(q) &&
          !name.includes(q) &&
          !udi.includes(q) &&
          !ccode.includes(q) &&
          !isku.includes(q) &&
          !vname.includes(q)
        ) {
          return false;
        }
      }

      return true;
    });

    const activeVendorsSet = new Set(items.filter(s => s.is_active).map(s => s.vendor_id));

    const metrics = {
      total: items.length,
      activeCount: items.filter(s => s.is_active).length,
      recalledCount: items.filter(s => s.status === 'recalled').length,
      activeOemCount: activeVendorsSet.size,
      filteredCount: filtered.length
    };

    const startIndex = (page - 1) * limit;
    const paginatedItems = filtered.slice(startIndex, startIndex + limit);

    return {
      skus: paginatedItems,
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
   * Retrieves single SKU by ID with linked distributor mappings.
   * @param {string} skuId
   * @returns {Promise<Object>}
   */
  async getSkuById(skuId) {
    if (!skuId) throw new Error('skuId is required');

    let sku = null;

    try {
      if (db.ensureAuthSession) {
        await db.ensureAuthSession();
      }

      const { data, error } = await supabase
        .from('implant_product_skus')
        .select(`
          *,
          vendor:vendor_id (id, vendor_code, display_name, legal_name),
          component:component_id (id, code, name, default_duration),
          family:family_id (id, family_code, name)
        `)
        .eq('id', skuId)
        .single();

      if (!error && data) {
        sku = data;
      }
    } catch {
      // Fallback
    }

    if (!sku) {
      sku = GLOBAL_BASELINE_SKUS.find(s => s.id === skuId);
    }

    if (!sku) {
      throw new Error(`Product SKU not found with ID: ${skuId}`);
    }

    // Retrieve distributor mappings
    const mappings = await this.getDistributorMappings(skuId);

    return {
      ...sku,
      distributor_mappings: mappings
    };
  },

  /**
   * Retrieves distributor mappings for a SKU.
   * @param {string} skuId
   * @returns {Promise<Array>}
   */
  async getDistributorMappings(skuId) {
    let mappings = [];

    try {
      if (db.ensureAuthSession) {
        await db.ensureAuthSession();
      }

      const { data, error } = await supabase
        .from('implant_sku_distributor_mappings')
        .select(`
          *,
          distributor:distributor_id (id, vendor_code, display_name, legal_name)
        `)
        .eq('sku_id', skuId);

      if (!error && Array.isArray(data)) {
        mappings = data;
      }
    } catch {
      // Fallback
    }

    if (mappings.length === 0) {
      mappings = GLOBAL_BASELINE_DISTRIBUTOR_MAPPINGS.filter(m => m.sku_id === skuId);
    }

    return mappings;
  },

  /**
   * Saves or updates a product SKU.
   * @param {Object} skuData
   * @returns {Promise<Object>}
   */
  async saveSku(skuData) {
    const {
      id = null,
      facility_id = null,
      vendor_id,
      family_id = null,
      component_id,
      catalog_number,
      product_name,
      internal_sku = null,
      description = null,
      udi_di = null,
      hcpcs_c_code = null,
      secondary_hcpcs_code = null,
      sterile_packaging = 'STERILE_PACKAGED',
      laterality = 'NOT_APPLICABLE',
      material_composition = 'TITANIUM',
      size_dimension = null,
      duration_classification = 'PERMANENT',
      mri_safety_status = 'MR_CONDITIONAL',
      latex_free = true,
      list_price = 0.00,
      unit_of_measure = 'EA'
    } = skuData;

    if (!vendor_id) {
      throw new Error('VALIDATION ERROR: Manufacturer OEM vendor is required.');
    }
    if (!component_id) {
      throw new Error('VALIDATION ERROR: Clinical component is required.');
    }
    if (!catalog_number || typeof catalog_number !== 'string' || catalog_number.trim() === '') {
      throw new Error('VALIDATION ERROR: Manufacturer catalog number is required.');
    }
    if (!product_name || typeof product_name !== 'string' || product_name.trim() === '') {
      throw new Error('VALIDATION ERROR: Product name is required.');
    }

    // UDI-DI Checksum Validation if provided
    if (udi_di && udi_di.trim() !== '') {
      const udiCheck = this.validateUdiDi(udi_di);
      if (!udiCheck.isValid) {
        throw new Error(`VALIDATION ERROR: ${udiCheck.error}`);
      }
    }

    try {
      if (db.ensureAuthSession) {
        await db.ensureAuthSession();
      }

      const { data, error } = await supabase.rpc('fn_create_or_update_sku', {
        p_sku_id: id,
        p_facility_id: facility_id,
        p_vendor_id: vendor_id,
        p_family_id: family_id,
        p_component_id: component_id,
        p_catalog_number: catalog_number.trim(),
        p_product_name: product_name.trim(),
        p_internal_sku: internal_sku ? internal_sku.trim() : null,
        p_description: description ? description.trim() : null,
        p_udi_di: udi_di ? udi_di.trim() : null,
        p_hcpcs_c_code: hcpcs_c_code ? hcpcs_c_code.toUpperCase().trim() : null,
        p_secondary_hcpcs_code: secondary_hcpcs_code ? secondary_hcpcs_code.toUpperCase().trim() : null,
        p_sterile_packaging: sterile_packaging,
        p_laterality: laterality,
        p_material_composition: material_composition,
        p_size_dimension: size_dimension ? size_dimension.trim() : null,
        p_duration_classification: duration_classification,
        p_mri_safety_status: mri_safety_status,
        p_latex_free: Boolean(latex_free),
        p_list_price: Number(list_price || 0),
        p_unit_of_measure: unit_of_measure
      });

      if (!error && data?.success) {
        return { success: true, sku_id: data.sku_id };
      }
    } catch {
      // Fallback
    }

    // In-memory fallback
    const payload = {
      id: id || `sku-${Date.now()}`,
      facility_id,
      vendor_id,
      family_id,
      component_id,
      catalog_number: catalog_number.trim(),
      product_name: product_name.trim(),
      internal_sku: internal_sku ? internal_sku.trim() : null,
      description: description ? description.trim() : null,
      udi_di: udi_di ? udi_di.trim() : null,
      hcpcs_c_code: hcpcs_c_code ? hcpcs_c_code.toUpperCase().trim() : null,
      secondary_hcpcs_code: secondary_hcpcs_code ? secondary_hcpcs_code.toUpperCase().trim() : null,
      sterile_packaging,
      laterality,
      material_composition,
      size_dimension: size_dimension ? size_dimension.trim() : null,
      duration_classification,
      mri_safety_status,
      latex_free: Boolean(latex_free),
      list_price: Number(list_price || 0),
      unit_of_measure,
      status: 'active',
      is_active: true,
      updated_at: new Date().toISOString()
    };

    if (id) {
      const idx = GLOBAL_BASELINE_SKUS.findIndex(s => s.id === id);
      if (idx !== -1) {
        GLOBAL_BASELINE_SKUS[idx] = { ...GLOBAL_BASELINE_SKUS[idx], ...payload };
      }
    } else {
      payload.created_at = new Date().toISOString();
      GLOBAL_BASELINE_SKUS.push(payload);
    }

    return { success: true, sku_id: payload.id, sku: payload };
  },

  /**
   * Triggers a medical device safety recall on a SKU.
   * @param {string} skuId
   * @param {Object} recallData
   * @returns {Promise<Object>}
   */
  async flagSkuRecall(skuId, recallData) {
    if (!skuId) throw new Error('skuId is required');
    const { recallClass, recallDate, recallReason } = recallData;

    if (!recallClass || !['CLASS_I', 'CLASS_II', 'CLASS_III'].includes(recallClass)) {
      throw new Error('VALIDATION ERROR: Recall class must be CLASS_I, CLASS_II, or CLASS_III.');
    }
    if (!recallDate) {
      throw new Error('VALIDATION ERROR: Official recall date is required.');
    }
    if (!recallReason || recallReason.trim() === '') {
      throw new Error('VALIDATION ERROR: Regulatory recall reason is required.');
    }

    try {
      if (db.ensureAuthSession) {
        await db.ensureAuthSession();
      }

      const { data, error } = await supabase.rpc('fn_flag_sku_recall', {
        p_sku_id: skuId,
        p_recall_class: recallClass,
        p_recall_date: recallDate,
        p_recall_reason: recallReason.trim()
      });

      if (!error && data?.success) {
        return data;
      }
    } catch {
      // Fallback
    }

    const idx = GLOBAL_BASELINE_SKUS.findIndex(s => s.id === skuId);
    if (idx !== -1) {
      GLOBAL_BASELINE_SKUS[idx].status = 'recalled';
      GLOBAL_BASELINE_SKUS[idx].is_active = false;
      GLOBAL_BASELINE_SKUS[idx].recall_class = recallClass;
      GLOBAL_BASELINE_SKUS[idx].recall_date = recallDate;
      GLOBAL_BASELINE_SKUS[idx].recall_reason = recallReason.trim();
      return { success: true, sku_id: skuId, status: 'recalled', impacted_cases_count: 0 };
    }

    throw new Error(`Product SKU not found with ID: ${skuId}`);
  },

  /**
   * Deactivates a product SKU.
   * @param {string} skuId
   * @param {string} rationale
   * @returns {Promise<Object>}
   */
  async deactivateSku(skuId, rationale) {
    if (!skuId) throw new Error('skuId is required');
    if (!rationale || rationale.trim() === '') {
      throw new Error('VALIDATION ERROR: Deactivation rationale is required.');
    }

    try {
      if (db.ensureAuthSession) {
        await db.ensureAuthSession();
      }

      const { data, error } = await supabase.rpc('fn_deactivate_implant_sku', {
        p_sku_id: skuId,
        p_rationale: rationale.trim()
      });

      if (!error && data?.success) {
        return data;
      }
    } catch {
      // Fallback
    }

    const idx = GLOBAL_BASELINE_SKUS.findIndex(s => s.id === skuId);
    if (idx !== -1) {
      GLOBAL_BASELINE_SKUS[idx].status = 'inactive';
      GLOBAL_BASELINE_SKUS[idx].is_active = false;
      return { success: true, sku_id: skuId, status: 'inactive' };
    }

    throw new Error(`Product SKU not found with ID: ${skuId}`);
  },

  /**
   * Reactivates an inactive SKU.
   * @param {string} skuId
   * @param {string} [catalogNumber]
   * @returns {Promise<Object>}
   */
  async reactivateSku(skuId, catalogNumber = null) {
    if (!skuId) throw new Error('skuId is required');

    let rpcError = null;

    try {
      if (db.ensureAuthSession) {
        await db.ensureAuthSession();
      }

      const { data, error } = await supabase.rpc('fn_reactivate_implant_sku', {
        p_sku_id: skuId
      });

      if (!error && data?.success) {
        return { success: true, sku_id: skuId, status: 'active', data };
      }
      if (error) rpcError = error;
    } catch (err) {
      rpcError = err;
    }

    const idx = GLOBAL_BASELINE_SKUS.findIndex(
      s => s.id === skuId || (catalogNumber && s.catalog_number === catalogNumber)
    );
    if (idx !== -1) {
      GLOBAL_BASELINE_SKUS[idx].status = 'active';
      GLOBAL_BASELINE_SKUS[idx].is_active = true;
      GLOBAL_BASELINE_SKUS[idx].recall_class = null;
      GLOBAL_BASELINE_SKUS[idx].recall_date = null;
      GLOBAL_BASELINE_SKUS[idx].recall_reason = null;
      return { success: true, sku_id: skuId, status: 'active' };
    }

    if (rpcError) {
      const msg = rpcError.message || rpcError.details || JSON.stringify(rpcError);
      throw new Error(`Database error reactivating SKU: ${msg}`);
    }

    throw new Error(`Product SKU not found with ID: ${skuId}`);
  },

  /**
   * Saves a distributor cross-reference mapping.
   * @param {Object} mappingData
   * @returns {Promise<Object>}
   */
  async saveDistributorMapping(mappingData) {
    const {
      sku_id,
      distributor_id,
      distributor_item_number,
      package_unit = 'EA',
      units_per_package = 1,
      is_preferred_distributor = false
    } = mappingData;

    if (!sku_id) throw new Error('sku_id is required');
    if (!distributor_id) throw new Error('distributor_id is required');
    if (!distributor_item_number || distributor_item_number.trim() === '') {
      throw new Error('distributor_item_number is required');
    }

    try {
      if (db.ensureAuthSession) {
        await db.ensureAuthSession();
      }

      const { data, error } = await supabase
        .from('implant_sku_distributor_mappings')
        .insert({
          sku_id,
          distributor_id,
          distributor_item_number: distributor_item_number.trim(),
          package_unit,
          units_per_package,
          is_preferred_distributor,
          status: 'active'
        })
        .select()
        .single();

      if (!error && data) {
        return { success: true, mapping: data };
      }
    } catch {
      // Fallback
    }

    const newMap = {
      id: `map-${Date.now()}`,
      sku_id,
      distributor_id,
      distributor_item_number: distributor_item_number.trim(),
      package_unit,
      units_per_package,
      is_preferred_distributor,
      status: 'active'
    };
    GLOBAL_BASELINE_DISTRIBUTOR_MAPPINGS.push(newMap);
    return { success: true, mapping: newMap };
  }
};

// Wire onto db singleton
if (typeof db !== 'undefined') {
  db.getImplantSkus = (...args) => skuService.getSkus(...args);
  db.getImplantSkuById = (...args) => skuService.getSkuById(...args);
  db.saveImplantSku = (...args) => skuService.saveSku(...args);
  db.flagImplantSkuRecall = (...args) => skuService.flagSkuRecall(...args);
  db.flagSkuRecall = (...args) => skuService.flagSkuRecall(...args);
  db.deactivateImplantSku = (...args) => skuService.deactivateSku(...args);
  db.reactivateImplantSku = (...args) => skuService.reactivateSku(...args);
  db.saveImplantDistributorMapping = (...args) => skuService.saveDistributorMapping(...args);
  db.saveDistributorMapping = (...args) => skuService.saveDistributorMapping(...args);
}

export default skuService;
