/**
 * ============================================================================
 * MODULE: vendorService.js
 * PHASE: 53 - Implant Vendor Master, Manufacturer Taxonomy & Sourcing Governance
 * PLATFORM: ASCANALYST Enterprise Healthcare OS
 * ============================================================================
 */

import { supabase, db } from './supabase.js';

// ==============================================================================
// 1. DOMAIN ENUMS & CONSTANTS
// ==============================================================================

export const VENDOR_TYPES = Object.freeze({
  MANUFACTURER: 'MANUFACTURER',
  DISTRIBUTOR: 'DISTRIBUTOR',
  GPO_CONGLOMERATE: 'GPO_CONGLOMERATE',
  SALES_AGENCY: 'SALES_AGENCY',
  TISSUE_BANK: 'TISSUE_BANK'
});

export const VENDOR_STATUSES = Object.freeze({
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  ARCHIVED: 'archived',
  PENDING_VERIFICATION: 'pending_verification'
});

export const RELATIONSHIP_TYPES = Object.freeze({
  AUTHORIZED_DISTRIBUTOR: 'AUTHORIZED_DISTRIBUTOR',
  EXCLUSIVE_DISTRIBUTOR: 'EXCLUSIVE_DISTRIBUTOR',
  LOCAL_REP_AGENCY: 'LOCAL_REP_AGENCY',
  GPO_CONTRACT_DISTRIBUTOR: 'GPO_CONTRACT_DISTRIBUTOR',
  PARENT_SUBSIDIARY: 'PARENT_SUBSIDIARY'
});

// ==============================================================================
// 2. GLOBAL BASELINE IN-MEMORY FALLBACK CATALOG
// Authoritative baseline for tests, offline mode, and seed synchronization
// ==============================================================================

export const GLOBAL_BASELINE_VENDORS = [
  // 12 Global Medical Device Manufacturers
  {
    id: '00000000-0000-0000-0053-000000000001',
    facility_id: null,
    vendor_code: 'STRYKER',
    legal_name: 'Howmedica Osteonics Corp.',
    display_name: 'Stryker Orthopaedics',
    vendor_type: 'MANUFACTURER',
    specialties: ['Orthopedics', 'Spine', 'ENT'],
    tax_id_ein: '22-1234567',
    duns_number: '001234567',
    fda_establishment_identifier: 'FEI-1029384',
    business_email: 'orders@stryker.com',
    business_phone: '(800) 253-3210',
    website: 'https://www.stryker.com',
    rep_name: 'David Miller',
    rep_email: 'david.miller@stryker.com',
    rep_phone: '(239) 555-0191',
    address_line1: '325 Corporate Drive',
    city: 'Mahwah',
    state: 'NJ',
    postal_code: '07430',
    country: 'USA',
    source_system: 'manual_entry',
    status: 'active',
    is_active: true
  },
  {
    id: '00000000-0000-0000-0053-000000000002',
    facility_id: null,
    vendor_code: 'ZIMMER_BIOMET',
    legal_name: 'Zimmer US, Inc.',
    display_name: 'Zimmer Biomet',
    vendor_type: 'MANUFACTURER',
    specialties: ['Orthopedics', 'Spine', 'Dental', 'ENT'],
    tax_id_ein: '35-9876543',
    duns_number: '002345678',
    fda_establishment_identifier: 'FEI-2039485',
    business_email: 'support@zimmerbiomet.com',
    business_phone: '(800) 613-6131',
    website: 'https://www.zimmerbiomet.com',
    rep_name: 'Sarah Jenkins',
    rep_email: 'sarah.jenkins@zimmerbiomet.com',
    rep_phone: '(239) 555-0192',
    address_line1: '1800 W Center St',
    city: 'Warsaw',
    state: 'IN',
    postal_code: '46580',
    country: 'USA',
    source_system: 'manual_entry',
    status: 'active',
    is_active: true
  },
  {
    id: '00000000-0000-0000-0053-000000000003',
    facility_id: null,
    vendor_code: 'DEPUY_SYNTHES',
    legal_name: 'DePuy Synthes Sales, Inc.',
    display_name: 'DePuy Synthes',
    vendor_type: 'MANUFACTURER',
    specialties: ['Orthopedics', 'Spine', 'Trauma', 'Craniomaxillofacial'],
    tax_id_ein: '31-4567890',
    duns_number: '003456789',
    fda_establishment_identifier: 'FEI-3049586',
    business_email: 'customerservice@depuysynthes.com',
    business_phone: '(800) 526-4455',
    website: 'https://www.jnjmedtech.com',
    rep_name: 'Mark Taylor',
    rep_email: 'mtaylor@its.jnj.com',
    rep_phone: '(239) 555-0193',
    address_line1: '700 Orthopaedic Drive',
    city: 'Warsaw',
    state: 'IN',
    postal_code: '46582',
    country: 'USA',
    source_system: 'manual_entry',
    status: 'active',
    is_active: true
  },
  {
    id: '00000000-0000-0000-0053-000000000004',
    facility_id: null,
    vendor_code: 'MEDTRONIC',
    legal_name: 'Medtronic, Inc.',
    display_name: 'Medtronic Spine & Biologics',
    vendor_type: 'MANUFACTURER',
    specialties: ['Spine', 'Pain Management', 'Cardiovascular', 'ENT'],
    tax_id_ein: '41-5678901',
    duns_number: '004567890',
    fda_establishment_identifier: 'FEI-4059687',
    business_email: 'orders.spine@medtronic.com',
    business_phone: '(800) 933-2635',
    website: 'https://www.medtronic.com',
    rep_name: 'Elena Rostova',
    rep_email: 'elena.rostova@medtronic.com',
    rep_phone: '(239) 555-0194',
    address_line1: '710 Medtronic Parkway',
    city: 'Minneapolis',
    state: 'MN',
    postal_code: '55432',
    country: 'USA',
    source_system: 'manual_entry',
    status: 'active',
    is_active: true
  },
  {
    id: '00000000-0000-0000-0053-000000000005',
    facility_id: null,
    vendor_code: 'SMITH_NEPHEW',
    legal_name: 'Smith & Nephew, Inc.',
    display_name: 'Smith & Nephew',
    vendor_type: 'MANUFACTURER',
    specialties: ['Orthopedics', 'Sports Medicine', 'Trauma'],
    tax_id_ein: '62-6789012',
    duns_number: '005678901',
    fda_establishment_identifier: 'FEI-5069788',
    business_email: 'ortho.orders@smith-nephew.com',
    business_phone: '(800) 238-7542',
    website: 'https://www.smith-nephew.com',
    address_line1: '1450 Brooks Road',
    city: 'Memphis',
    state: 'TN',
    postal_code: '38116',
    country: 'USA',
    source_system: 'manual_entry',
    status: 'active',
    is_active: true
  },
  {
    id: '00000000-0000-0000-0053-000000000006',
    facility_id: null,
    vendor_code: 'ALCON',
    legal_name: 'Alcon Laboratories, Inc.',
    display_name: 'Alcon Surgical',
    vendor_type: 'MANUFACTURER',
    specialties: ['Ophthalmology'],
    tax_id_ein: '75-7890123',
    duns_number: '006789012',
    fda_establishment_identifier: 'FEI-6079889',
    business_email: 'custserv.surgical@alcon.com',
    business_phone: '(800) 862-5266',
    website: 'https://www.alcon.com',
    address_line1: '6201 South Freeway',
    city: 'Fort Worth',
    state: 'TX',
    postal_code: '76134',
    country: 'USA',
    source_system: 'manual_entry',
    status: 'active',
    is_active: true
  },
  {
    id: '00000000-0000-0000-0053-000000000007',
    facility_id: null,
    vendor_code: 'BAUSCH_LOMB',
    legal_name: 'Bausch & Lomb Americas Inc.',
    display_name: 'Bausch + Lomb',
    vendor_type: 'MANUFACTURER',
    specialties: ['Ophthalmology'],
    tax_id_ein: '16-8901234',
    duns_number: '007890123',
    fda_establishment_identifier: 'FEI-7089990',
    business_email: 'surgical.orders@bausch.com',
    business_phone: '(800) 338-2020',
    website: 'https://www.bausch.com',
    address_line1: '400 Somerset Corporate Blvd',
    city: 'Bridgewater',
    state: 'NJ',
    postal_code: '08807',
    country: 'USA',
    source_system: 'manual_entry',
    status: 'active',
    is_active: true
  },
  {
    id: '00000000-0000-0000-0053-000000000008',
    facility_id: null,
    vendor_code: 'ARTHREX',
    legal_name: 'Arthrex, Inc.',
    display_name: 'Arthrex Orthobiologics',
    vendor_type: 'MANUFACTURER',
    specialties: ['Orthopedics', 'Sports Medicine', 'Podiatry'],
    tax_id_ein: '59-9012345',
    duns_number: '008901234',
    fda_establishment_identifier: 'FEI-8090101',
    business_email: 'orders@arthrex.com',
    business_phone: '(800) 934-4404',
    website: 'https://www.arthrex.com',
    address_line1: '1370 Creekside Blvd',
    city: 'Naples',
    state: 'FL',
    postal_code: '34108',
    country: 'USA',
    source_system: 'manual_entry',
    status: 'active',
    is_active: true
  },
  {
    id: '00000000-0000-0000-0053-000000000009',
    facility_id: null,
    vendor_code: 'INTEGRA',
    legal_name: 'Integra LifeSciences Corp.',
    display_name: 'Integra LifeSciences',
    vendor_type: 'MANUFACTURER',
    specialties: ['Neurosurgery', 'Plastic Surgery', 'Reconstructive', 'ENT'],
    tax_id_ein: '22-0123456',
    duns_number: '009012345',
    fda_establishment_identifier: 'FEI-9101212',
    business_email: 'custserv@integralife.com',
    business_phone: '(800) 654-2873',
    website: 'https://www.integralife.com',
    address_line1: '1100 Campus Road',
    city: 'Princeton',
    state: 'NJ',
    postal_code: '08540',
    country: 'USA',
    source_system: 'manual_entry',
    status: 'active',
    is_active: true
  },
  {
    id: '00000000-0000-0000-0053-000000000010',
    facility_id: null,
    vendor_code: 'ABBOTT',
    legal_name: 'Abbott Laboratories',
    display_name: 'Abbott Neuromodulation',
    vendor_type: 'MANUFACTURER',
    specialties: ['Pain Management', 'Cardiovascular'],
    tax_id_ein: '36-1234560',
    duns_number: '010123456',
    fda_establishment_identifier: 'FEI-1122334',
    business_email: 'neuromodulation@abbott.com',
    business_phone: '(800) 727-7846',
    website: 'https://www.abbott.com',
    address_line1: '100 Abbott Park Road',
    city: 'Abbott Park',
    state: 'IL',
    postal_code: '60064',
    country: 'USA',
    source_system: 'manual_entry',
    status: 'active',
    is_active: true
  },
  {
    id: '00000000-0000-0000-0053-000000000011',
    facility_id: null,
    vendor_code: 'GLOBUS',
    legal_name: 'Globus Medical, Inc.',
    display_name: 'Globus Medical',
    vendor_type: 'MANUFACTURER',
    specialties: ['Spine', 'Orthopedics', 'Trauma'],
    tax_id_ein: '20-2345671',
    duns_number: '011234567',
    fda_establishment_identifier: 'FEI-2233445',
    business_email: 'spineorders@globusmedical.com',
    business_phone: '(866) 456-2871',
    website: 'https://www.globusmedical.com',
    address_line1: '2560 General Armistead Ave',
    city: 'Audubon',
    state: 'PA',
    postal_code: '19403',
    country: 'USA',
    source_system: 'manual_entry',
    status: 'active',
    is_active: true
  },
  {
    id: '00000000-0000-0000-0053-000000000012',
    facility_id: null,
    vendor_code: 'MTF_BIOLOGICS',
    legal_name: 'Musculoskeletal Transplant Foundation',
    display_name: 'MTF Biologics',
    vendor_type: 'TISSUE_BANK',
    specialties: ['Orthopedics', 'Spine', 'Plastic Surgery'],
    tax_id_ein: '22-3456782',
    duns_number: '012345678',
    fda_establishment_identifier: 'FEI-3344556',
    business_email: 'tissueorders@mtf.org',
    business_phone: '(800) 433-6676',
    website: 'https://www.mtfbiologics.org',
    address_line1: '125 May Street',
    city: 'Edison',
    state: 'NJ',
    postal_code: '08837',
    country: 'USA',
    source_system: 'manual_entry',
    status: 'active',
    is_active: true
  },

  // 3 Major National Healthcare Distributors
  {
    id: '00000000-0000-0000-0053-000000000013',
    facility_id: null,
    vendor_code: 'CARDINAL_HEALTH',
    legal_name: 'Cardinal Health 200, LLC',
    display_name: 'Cardinal Health',
    vendor_type: 'DISTRIBUTOR',
    specialties: ['Orthopedics', 'Spine', 'Ophthalmology', 'Pain Management', 'General'],
    tax_id_ein: '31-4561234',
    duns_number: '013456789',
    business_email: 'hospitalorders@cardinalhealth.com',
    business_phone: '(800) 964-5227',
    website: 'https://www.cardinalhealth.com',
    address_line1: '7000 Cardinal Place',
    city: 'Dublin',
    state: 'OH',
    postal_code: '43017',
    country: 'USA',
    source_system: 'manual_entry',
    status: 'active',
    is_active: true
  },
  {
    id: '00000000-0000-0000-0053-000000000014',
    facility_id: null,
    vendor_code: 'MEDLINE',
    legal_name: 'Medline Industries, LP',
    display_name: 'Medline Industries',
    vendor_type: 'DISTRIBUTOR',
    specialties: ['Orthopedics', 'Spine', 'Ophthalmology', 'Pain Management', 'General'],
    tax_id_ein: '36-2678901',
    duns_number: '014567890',
    business_email: 'surgicalorders@medline.com',
    business_phone: '(800) 633-5463',
    website: 'https://www.medline.com',
    address_line1: 'Three Lakes Drive',
    city: 'Northfield',
    state: 'IL',
    postal_code: '60093',
    country: 'USA',
    source_system: 'manual_entry',
    status: 'active',
    is_active: true
  },
  {
    id: '00000000-0000-0000-0053-000000000015',
    facility_id: null,
    vendor_code: 'OWENS_MINOR',
    legal_name: 'Owens & Minor Distribution, Inc.',
    display_name: 'Owens & Minor',
    vendor_type: 'DISTRIBUTOR',
    specialties: ['Orthopedics', 'Spine', 'Cardiovascular', 'General'],
    tax_id_ein: '54-0129876',
    duns_number: '015678901',
    business_email: 'supplychain@owens-minor.com',
    business_phone: '(804) 723-7000',
    website: 'https://www.owens-minor.com',
    address_line1: '9120 Lockwood Blvd',
    city: 'Mechanicsville',
    state: 'VA',
    postal_code: '23116',
    country: 'USA',
    source_system: 'manual_entry',
    status: 'active',
    is_active: true
  }
];

export const GLOBAL_BASELINE_RELATIONSHIPS = [
  // Cardinal Health distributes Stryker, Zimmer Biomet, DePuy Synthes, Smith & Nephew
  { id: 'rel-01', distributor_id: '00000000-0000-0000-0053-000000000013', manufacturer_id: '00000000-0000-0000-0053-000000000001', relationship_type: 'AUTHORIZED_DISTRIBUTOR', territory_scope: 'National', is_active: true },
  { id: 'rel-02', distributor_id: '00000000-0000-0000-0053-000000000013', manufacturer_id: '00000000-0000-0000-0053-000000000002', relationship_type: 'AUTHORIZED_DISTRIBUTOR', territory_scope: 'National', is_active: true },
  { id: 'rel-03', distributor_id: '00000000-0000-0000-0053-000000000013', manufacturer_id: '00000000-0000-0000-0053-000000000003', relationship_type: 'AUTHORIZED_DISTRIBUTOR', territory_scope: 'National', is_active: true },
  { id: 'rel-04', distributor_id: '00000000-0000-0000-0053-000000000013', manufacturer_id: '00000000-0000-0000-0053-000000000005', relationship_type: 'AUTHORIZED_DISTRIBUTOR', territory_scope: 'National', is_active: true },

  // Medline distributes Arthrex, Integra, MTF Biologics
  { id: 'rel-05', distributor_id: '00000000-0000-0000-0053-000000000014', manufacturer_id: '00000000-0000-0000-0053-000000000008', relationship_type: 'AUTHORIZED_DISTRIBUTOR', territory_scope: 'National', is_active: true },
  { id: 'rel-06', distributor_id: '00000000-0000-0000-0053-000000000014', manufacturer_id: '00000000-0000-0000-0053-000000000009', relationship_type: 'AUTHORIZED_DISTRIBUTOR', territory_scope: 'National', is_active: true },
  { id: 'rel-07', distributor_id: '00000000-0000-0000-0053-000000000014', manufacturer_id: '00000000-0000-0000-0053-000000000012', relationship_type: 'AUTHORIZED_DISTRIBUTOR', territory_scope: 'National', is_active: true },

  // Owens & Minor distributes Medtronic, Abbott, Globus Medical
  { id: 'rel-08', distributor_id: '00000000-0000-0000-0053-000000000015', manufacturer_id: '00000000-0000-0000-0053-000000000004', relationship_type: 'AUTHORIZED_DISTRIBUTOR', territory_scope: 'National', is_active: true },
  { id: 'rel-09', distributor_id: '00000000-0000-0000-0053-000000000015', manufacturer_id: '00000000-0000-0000-0053-000000000010', relationship_type: 'AUTHORIZED_DISTRIBUTOR', territory_scope: 'National', is_active: true },
  { id: 'rel-10', distributor_id: '00000000-0000-0000-0053-000000000015', manufacturer_id: '00000000-0000-0000-0053-000000000011', relationship_type: 'AUTHORIZED_DISTRIBUTOR', territory_scope: 'National', is_active: true }
];

// ==============================================================================
// 3. VENDOR SERVICE IMPLEMENTATION
// ==============================================================================

export const vendorService = {
  /**
   * Normalizes vendor legal name by uppercasing, stripping punctuation,
   * removing corporate suffixes, and collapsing spaces.
   * @param {string} name
   * @returns {string}
   */
  normalizeVendorName(name) {
    if (!name || typeof name !== 'string') return '';
    return name
      .toUpperCase()
      .replace(/[.,/#!$%^&*;:{}=\-_`~()'"?]/g, ' ')
      .replace(/\b(INC|INCORPORATED|LLC|CORP|CORPORATION|CO|COMPANY|LTD|LIMITED|GMBH|LP|DBA|HOLDINGS)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  },

  /**
   * Computes string similarity score using character bigrams (Dice coefficient).
   * Returns score between 0.00 and 1.00.
   * @param {string} str1
   * @param {string} str2
   * @returns {number}
   */
  calculateSimilarityScore(str1, str2) {
    const s1 = this.normalizeVendorName(str1);
    const s2 = this.normalizeVendorName(str2);

    if (!s1 || !s2) return 0.0;
    if (s1 === s2) return 1.0;

    const getBigrams = (str) => {
      const bigrams = new Map();
      for (let i = 0; i < str.length - 1; i++) {
        const bigram = str.substring(i, i + 2);
        bigrams.set(bigram, (bigrams.get(bigram) || 0) + 1);
      }
      return bigrams;
    };

    const b1 = getBigrams(s1);
    const b2 = getBigrams(s2);

    let intersection = 0;
    for (const [bigram, count] of b1.entries()) {
      if (b2.has(bigram)) {
        intersection += Math.min(count, b2.get(bigram));
      }
    }

    const total = (s1.length - 1) + (s2.length - 1);
    if (total <= 0) return 0.0;
    return parseFloat(((2 * intersection) / total).toFixed(3));
  },

  /**
   * Checks for duplicate vendor candidates by exact code, exact normalized name,
   * or fuzzy name similarity (threshold >= 0.85).
   * @param {string} legalName
   * @param {string} vendorCode
   * @param {string} [facilityId]
   * @param {Array<Object>} [existingList]
   * @returns {Object}
   */
  checkDuplicateCandidates(legalName, vendorCode, facilityId = null, existingList = null) {
    const vendors = existingList || GLOBAL_BASELINE_VENDORS;
    const normCode = (vendorCode || '').toUpperCase().trim();
    const normName = this.normalizeVendorName(legalName);

    let exactCodeMatch = null;
    let exactNameMatch = null;
    const candidateMatches = [];

    for (const v of vendors) {
      // Check tenant scope match (same facility or global)
      const sameScope = (v.facility_id === null && facilityId === null) ||
                         (v.facility_id === facilityId);
      if (!sameScope) continue;

      // 1. Exact Code Match
      if (v.vendor_code && v.vendor_code.toUpperCase().trim() === normCode) {
        exactCodeMatch = v;
      }

      // 2. Exact Normalized Name Match
      const existingNorm = this.normalizeVendorName(v.legal_name);
      if (existingNorm === normName) {
        exactNameMatch = v;
      }

      // 3. Fuzzy Similarity Match & Token Overlap (Checking both legal name and display name)
      const scoreLegal = this.calculateSimilarityScore(legalName, v.legal_name);
      const scoreDisplay = v.display_name ? this.calculateSimilarityScore(legalName, v.display_name) : 0;

      // Token overlap (e.g., "Zimmer Biomet Surgical" contains "Zimmer Biomet")
      const tokensCandidate = normName.split(/\s+/).filter(Boolean);
      const tokensLegal = existingNorm.split(/\s+/).filter(Boolean);
      const tokensDisplay = v.display_name ? this.normalizeVendorName(v.display_name).split(/\s+/).filter(Boolean) : [];

      let tokenMatchScore = 0;
      if (tokensDisplay.length >= 2 && tokensDisplay.every(t => tokensCandidate.includes(t))) {
        tokenMatchScore = Math.max(0.88, tokensDisplay.length / tokensCandidate.length);
      }
      if (tokensLegal.length >= 2 && tokensLegal.every(t => tokensCandidate.includes(t))) {
        tokenMatchScore = Math.max(0.88, tokensLegal.length / tokensCandidate.length);
      }

      const bestScore = Math.max(scoreLegal, scoreDisplay, tokenMatchScore);
      if (bestScore >= 0.85 && existingNorm !== normName) {
        candidateMatches.push({ vendor: v, score: bestScore });
      }
    }

    // Sort candidate matches by highest similarity first
    candidateMatches.sort((a, b) => b.score - a.score);

    return {
      hasExactCollision: Boolean(exactCodeMatch || exactNameMatch),
      exactCodeMatch,
      exactNameMatch,
      hasWarningCandidates: candidateMatches.length > 0,
      candidateMatches
    };
  },

  /**
   * Query vendors with search, filter, and pagination support.
   * @param {Object} [options]
   * @returns {Promise<Object>}
   */
  async getVendors(options = {}) {
    const {
      search = '',
      vendorType = null,
      specialty = null,
      status = null,
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
        .from('implant_vendors')
        .select('*')
        .order('display_name', { ascending: true });

      if (vendorType) {
        query = query.eq('vendor_type', vendorType);
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
        items = [...GLOBAL_BASELINE_VENDORS];
      }
    } catch {
      // Graceful fallback to baseline
      items = [...GLOBAL_BASELINE_VENDORS];
    }

    // Apply Client-Side Filtering on items
    let filtered = items.filter(v => {
      // 1. Tenant Scope Check
      if (facilityId) {
        if (v.facility_id !== null && v.facility_id !== facilityId) return false;
      }

      // 2. Status Check
      if (status) {
        if (v.status !== status) return false;
      } else if (!includeInactive && !v.is_active) {
        return false;
      }

      // 3. Vendor Type Filter
      if (vendorType && v.vendor_type !== vendorType) {
        return false;
      }

      // 4. Specialty Filter
      if (specialty) {
        const specList = Array.isArray(v.specialties) ? v.specialties : [];
        const hasSpec = specList.some(s => s.toLowerCase() === specialty.toLowerCase());
        if (!hasSpec) return false;
      }

      // 5. Search Text Filter (Code, Display Name, Legal Name, Tax ID, City, State, Rep)
      if (search && search.trim() !== '') {
        const q = search.toLowerCase().trim();
        const code = (v.vendor_code || '').toLowerCase();
        const disp = (v.display_name || '').toLowerCase();
        const legal = (v.legal_name || '').toLowerCase();
        const ein = (v.tax_id_ein || '').toLowerCase();
        const city = (v.city || '').toLowerCase();
        const state = (v.state || '').toLowerCase();
        const rep = (v.rep_name || '').toLowerCase();
        if (
          !code.includes(q) &&
          !disp.includes(q) &&
          !legal.includes(q) &&
          !ein.includes(q) &&
          !city.includes(q) &&
          !state.includes(q) &&
          !rep.includes(q)
        ) {
          return false;
        }
      }

      return true;
    });

    // Compute Metrics across all unfiltered available items
    const metrics = {
      total: items.length,
      activeManufacturers: items.filter(v => v.is_active && (v.vendor_type === VENDOR_TYPES.MANUFACTURER || v.vendor_type === VENDOR_TYPES.TISSUE_BANK)).length,
      activeDistributors: items.filter(v => v.is_active && v.vendor_type === VENDOR_TYPES.DISTRIBUTOR).length,
      activeTissueBanks: items.filter(v => v.is_active && v.vendor_type === VENDOR_TYPES.TISSUE_BANK).length,
      filteredCount: filtered.length
    };

    // Apply Pagination
    const startIndex = (page - 1) * limit;
    const paginatedItems = filtered.slice(startIndex, startIndex + limit);

    return {
      vendors: paginatedItems,
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
   * Retrieves single vendor details by ID along with linked relationships.
   * @param {string} vendorId
   * @returns {Promise<Object>}
   */
  async getVendorById(vendorId) {
    if (!vendorId) throw new Error('vendorId is required');

    let vendor = null;

    try {
      if (db.ensureAuthSession) {
        await db.ensureAuthSession();
      }

      const { data, error } = await supabase
        .from('implant_vendors')
        .select('*')
        .eq('id', vendorId)
        .single();

      if (!error && data) {
        vendor = data;
      }
    } catch {
      // Fallback to baseline
    }

    if (!vendor) {
      vendor = GLOBAL_BASELINE_VENDORS.find(v => v.id === vendorId);
    }

    if (!vendor) {
      throw new Error(`Vendor not found with ID: ${vendorId}`);
    }

    // Retrieve relationships
    const relationships = await this.getVendorRelationships(vendorId);

    return {
      ...vendor,
      relationships
    };
  },

  /**
   * Retrieves relationships where vendor is distributor or manufacturer.
   * @param {string} vendorId
   * @returns {Promise<Array<Object>>}
   */
  async getVendorRelationships(vendorId) {
    let rels = [];

    try {
      if (db.ensureAuthSession) {
        await db.ensureAuthSession();
      }

      const { data, error } = await supabase
        .from('implant_vendor_relationships')
        .select(`
          *,
          distributor:distributor_id (id, vendor_code, display_name, legal_name, vendor_type),
          manufacturer:manufacturer_id (id, vendor_code, display_name, legal_name, vendor_type)
        `)
        .or(`distributor_id.eq.${vendorId},manufacturer_id.eq.${vendorId}`);

      if (!error && Array.isArray(data)) {
        rels = data;
      }
    } catch {
      // Fallback
    }

    if (rels.length === 0) {
      rels = GLOBAL_BASELINE_RELATIONSHIPS
        .filter(r => r.distributor_id === vendorId || r.manufacturer_id === vendorId)
        .map(r => ({
          ...r,
          distributor: GLOBAL_BASELINE_VENDORS.find(v => v.id === r.distributor_id),
          manufacturer: GLOBAL_BASELINE_VENDORS.find(v => v.id === r.manufacturer_id)
        }));
    }

    return rels;
  },

  /**
   * Creates or updates a vendor record.
   * @param {Object} vendorData
   * @returns {Promise<Object>}
   */
  async saveVendor(vendorData) {
    const {
      id = null,
      facility_id = null,
      vendor_code,
      legal_name,
      display_name,
      vendor_type = 'MANUFACTURER',
      specialties = [],
      tax_id_ein = null,
      duns_number = null,
      fda_fei = null,
      business_email = null,
      business_phone = null,
      website = null,
      rep_name = null,
      rep_email = null,
      rep_phone = null,
      notes = null,
      status = null
    } = vendorData;

    // Validate Vendor Code Format
    const cleanCode = (vendor_code || '').toUpperCase().trim();
    if (!cleanCode || !/^[A-Z0-9_-]+$/.test(cleanCode)) {
      throw new Error('VALIDATION ERROR: Vendor code must contain only uppercase alphanumeric characters, dashes, and underscores.');
    }

    // Validate Legal Name
    if (!legal_name || typeof legal_name !== 'string' || legal_name.trim() === '') {
      throw new Error('VALIDATION ERROR: Legal entity name is required.');
    }

    // Duplicate Check
    const dupCheck = this.checkDuplicateCandidates(legal_name, cleanCode, facility_id);
    if (!id && dupCheck.hasExactCollision) {
      if (dupCheck.exactCodeMatch) {
        throw new Error(`CONFLICT: Vendor code "${cleanCode}" already exists.`);
      }
      if (dupCheck.exactNameMatch) {
        throw new Error(`CONFLICT: Vendor with normalized legal name "${legal_name}" already exists.`);
      }
    }

    try {
      if (db.ensureAuthSession) {
        await db.ensureAuthSession();
      }

      // Attempt authoritative RPC
      const { data, error } = await supabase.rpc('fn_create_or_update_vendor', {
        p_vendor_id: id,
        p_facility_id: facility_id,
        p_vendor_code: cleanCode,
        p_legal_name: legal_name.trim(),
        p_display_name: (display_name || legal_name).trim(),
        p_vendor_type: vendor_type,
        p_specialties: Array.isArray(specialties) ? specialties : [],
        p_tax_id_ein: tax_id_ein,
        p_duns_number: duns_number,
        p_fda_fei: fda_fei,
        p_business_email: business_email,
        p_business_phone: business_phone,
        p_website: website,
        p_rep_name: rep_name,
        p_rep_email: rep_email,
        p_rep_phone: rep_phone,
        p_notes: notes
      });

      if (!error && data?.success) {
        return { success: true, vendor_id: data.vendor_id };
      }
    } catch {
      // Fallback for offline / local test environment
    }

    if (id && status === 'active') {
      try {
        await this.reactivateVendor(id, cleanCode);
      } catch {
        // Non-blocking fallback
      }
    }

    // In-memory update for mock/test baseline
    const payload = {
      id: id || `vnd-${Date.now()}`,
      facility_id,
      vendor_code: cleanCode,
      legal_name: legal_name.trim(),
      display_name: (display_name || legal_name).trim(),
      vendor_type,
      specialties: Array.isArray(specialties) ? specialties : [],
      tax_id_ein,
      duns_number,
      fda_establishment_identifier: fda_fei,
      business_email,
      business_phone,
      website,
      rep_name,
      rep_email,
      rep_phone,
      notes,
      status: status || 'active',
      is_active: status ? status === 'active' : true,
      updated_at: new Date().toISOString()
    };

    if (id) {
      const idx = GLOBAL_BASELINE_VENDORS.findIndex(v => v.id === id);
      if (idx !== -1) {
        GLOBAL_BASELINE_VENDORS[idx] = { ...GLOBAL_BASELINE_VENDORS[idx], ...payload };
      }
    } else {
      payload.created_at = new Date().toISOString();
      GLOBAL_BASELINE_VENDORS.push(payload);
    }

    return { success: true, vendor_id: payload.id, vendor: payload };
  },

  /**
   * Deactivates a vendor with mandatory audit rationale.
   * @param {string} vendorId
   * @param {string} rationale
   * @returns {Promise<Object>}
   */
  async deactivateVendor(vendorId, rationale) {
    if (!vendorId) throw new Error('vendorId is required');
    if (!rationale || typeof rationale !== 'string' || rationale.trim() === '') {
      throw new Error('VALIDATION ERROR: Deactivation rationale is required.');
    }

    try {
      if (db.ensureAuthSession) {
        await db.ensureAuthSession();
      }

      const { data, error } = await supabase.rpc('fn_deactivate_implant_vendor', {
        p_vendor_id: vendorId,
        p_rationale: rationale.trim()
      });

      if (!error && data?.success) {
        return data;
      }
    } catch {
      // Fallback
    }

    const idx = GLOBAL_BASELINE_VENDORS.findIndex(v => v.id === vendorId);
    if (idx !== -1) {
      GLOBAL_BASELINE_VENDORS[idx].status = 'inactive';
      GLOBAL_BASELINE_VENDORS[idx].is_active = false;
      GLOBAL_BASELINE_VENDORS[idx].notes = (GLOBAL_BASELINE_VENDORS[idx].notes || '') +
        `\nDeactivated: ${rationale}`;
      return { success: true, vendor_id: vendorId, status: 'inactive' };
    }

    throw new Error(`Vendor not found with ID: ${vendorId}`);
  },

  /**
   * Reactivates an inactive vendor.
   * @param {string} vendorId
   * @param {string} [vendorCode]
   * @returns {Promise<Object>}
   */
  async reactivateVendor(vendorId, vendorCode = null) {
    if (!vendorId) throw new Error('vendorId is required');

    let rpcError = null;

    // 1. Authoritative RPC call (SECURITY DEFINER bypasses RLS for global & tenant vendors)
    try {
      if (db.ensureAuthSession) {
        await db.ensureAuthSession();
      }

      const { data, error } = await supabase.rpc('fn_reactivate_implant_vendor', {
        p_vendor_id: vendorId
      });

      if (!error && (data?.success || data === true)) {
        return { success: true, vendor_id: vendorId, status: 'active', data };
      }
      if (error) {
        rpcError = error;
      }
    } catch (err) {
      rpcError = err;
    }

    // 2. Direct table update fallback (if RPC is not yet created or direct update is permitted)
    try {
      const { data, error } = await supabase
        .from('implant_vendors')
        .update({
          status: 'active',
          is_active: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', vendorId)
        .select();

      if (!error && Array.isArray(data) && data.length > 0) {
        return { success: true, vendor_id: vendorId, vendor: data[0], status: 'active' };
      }
    } catch {
      // Fallback to baseline check
    }

    // 3. Fallback for mock baseline (in memory / offline / test mode)
    const idx = GLOBAL_BASELINE_VENDORS.findIndex(
      v => v.id === vendorId || (vendorCode && v.vendor_code === vendorCode)
    );
    if (idx !== -1) {
      GLOBAL_BASELINE_VENDORS[idx].status = 'active';
      GLOBAL_BASELINE_VENDORS[idx].is_active = true;
      return { success: true, vendor_id: vendorId, status: 'active' };
    }

    // If an RPC database error occurred, provide helpful troubleshooting context
    if (rpcError) {
      const errorMsg = rpcError.message || rpcError.details || JSON.stringify(rpcError);
      throw new Error(`Database error reactivating vendor: ${errorMsg}. Please ensure 'fn_reactivate_implant_vendor' is created in Supabase.`);
    }

    throw new Error(`Vendor not found with ID: ${vendorId}`);
  },

  /**
   * Saves or creates a distributor-to-manufacturer relationship.
   * @param {Object} relData
   * @returns {Promise<Object>}
   */
  async saveRelationship(relData) {
    const {
      id = null,
      facility_id = null,
      distributor_id,
      manufacturer_id,
      relationship_type = 'AUTHORIZED_DISTRIBUTOR',
      territory_scope = 'National',
      notes = null
    } = relData;

    if (!distributor_id || !manufacturer_id) {
      throw new Error('VALIDATION ERROR: Both distributor_id and manufacturer_id are required.');
    }

    if (distributor_id === manufacturer_id) {
      throw new Error('VALIDATION ERROR: A vendor cannot establish a distributor relationship with itself.');
    }

    try {
      if (db.ensureAuthSession) {
        await db.ensureAuthSession();
      }

      const payload = {
        facility_id,
        distributor_id,
        manufacturer_id,
        relationship_type,
        territory_scope,
        notes,
        is_active: true
      };

      if (id) {
        payload.id = id;
      }

      const { data, error } = await supabase
        .from('implant_vendor_relationships')
        .upsert(payload)
        .select()
        .single();

      if (!error && data) {
        return { success: true, relationship: data };
      }
    } catch {
      // Fallback
    }

    const mockRel = {
      id: id || `rel-${Date.now()}`,
      facility_id,
      distributor_id,
      manufacturer_id,
      relationship_type,
      territory_scope,
      notes,
      is_active: true,
      created_at: new Date().toISOString()
    };
    GLOBAL_BASELINE_RELATIONSHIPS.push(mockRel);

    return { success: true, relationship: mockRel };
  },

  /**
   * Deletes a relationship link by ID.
   * @param {string} relId
   * @returns {Promise<boolean>}
   */
  async deleteRelationship(relId) {
    if (!relId) throw new Error('relId is required');

    try {
      if (db.ensureAuthSession) {
        await db.ensureAuthSession();
      }

      const { error } = await supabase
        .from('implant_vendor_relationships')
        .delete()
        .eq('id', relId);

      if (!error) return true;
    } catch {
      // Fallback
    }

    const idx = GLOBAL_BASELINE_RELATIONSHIPS.findIndex(r => r.id === relId);
    if (idx !== -1) {
      GLOBAL_BASELINE_RELATIONSHIPS.splice(idx, 1);
      return true;
    }

    return true;
  },

  /**
   * Batch imports an array of vendor records idempotently.
   * @param {Array<Object>} rows
   * @param {Object} [options]
   * @returns {Promise<Object>}
   */
  async importVendorBatch(rows, _options = {}) {
    if (!Array.isArray(rows)) throw new Error('rows must be an array');

    const results = {
      total: rows.length,
      importedCount: 0,
      skippedCount: 0,
      errors: []
    };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        await this.saveVendor({
          ...row,
          source_system: 'csv_batch'
        });
        results.importedCount++;
      } catch (err) {
        results.skippedCount++;
        results.errors.push({
          rowNumber: i + 1,
          vendorCode: row.vendor_code || 'N/A',
          error: err.message || String(err)
        });
      }
    }

    return results;
  }
};

// ==============================================================================
// 4. ATTACH DELEGATES TO DB SINGLETON
// ==============================================================================

if (typeof db !== 'undefined' && db && typeof db === 'object') {
  db.vendorService = vendorService;
  db.getImplantVendors = (...args) => vendorService.getVendors(...args);
  db.getImplantVendorById = (...args) => vendorService.getVendorById(...args);
  db.saveImplantVendor = (...args) => vendorService.saveVendor(...args);
  db.deactivateImplantVendor = (...args) => vendorService.deactivateVendor(...args);
  db.reactivateImplantVendor = (...args) => vendorService.reactivateVendor(...args);
  db.getImplantVendorRelationships = (...args) => vendorService.getVendorRelationships(...args);
  db.saveImplantVendorRelationship = (...args) => vendorService.saveRelationship(...args);
}
