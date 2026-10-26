/**
 * ============================================================================
 * MODULE: cptImplantMappingService.js
 * PHASE: 52 - CPT to Implant Mapping & Pre-Bill Completeness
 * PLATFORM: ASCANALYST Enterprise Healthcare OS
 * ============================================================================
 */

import { supabase, db } from './supabase.js';

// ==============================================================================
// 1. GLOBAL BASELINE IN-MEMORY FALLBACK CATALOG
// Authoritative multi-specialty clinical baseline (AAOS, NASS, ASCRS, NANS, ASPS)
// ==============================================================================

export const GLOBAL_BASELINE_MAPPINGS = [
  // Orthopedics - Total Hip Arthroplasty (CPT 27130)
  {
    id: 'm-27130-01',
    cpt_code: '27130',
    procedure_name: 'Total Hip Arthroplasty',
    specialty: 'Orthopedics',
    component_code: 'HIP_CUP',
    component_name: 'Acetabular Shell / Cup',
    category_code: 'ORTHO_HIP',
    category_name: 'Hip Joint Arthroplasty',
    facility_id: null,
    is_facility_override: false,
    requirement_type: 'required',
    quantity_calculation_method: 'fixed',
    expected_quantity_min: 1,
    expected_quantity_max: 1,
    default_quantity: 1,
    mapping_source: 'clinical_guideline',
    clinical_evidence_citation: 'AAOS Clinical Practice Guideline for Total Hip Arthroplasty (2020); CMS LCD L33394',
    confidence_score: 1.00,
    review_status: 'verified',
    effective_date: '2020-01-01',
    is_active: true
  },
  {
    id: 'm-27130-02',
    cpt_code: '27130',
    procedure_name: 'Total Hip Arthroplasty',
    specialty: 'Orthopedics',
    component_code: 'HIP_STEM',
    component_name: 'Femoral Hip Stem',
    category_code: 'ORTHO_HIP',
    category_name: 'Hip Joint Arthroplasty',
    facility_id: null,
    is_facility_override: false,
    requirement_type: 'required',
    quantity_calculation_method: 'fixed',
    expected_quantity_min: 1,
    expected_quantity_max: 1,
    default_quantity: 1,
    mapping_source: 'clinical_guideline',
    clinical_evidence_citation: 'AAOS Clinical Practice Guideline for Total Hip Arthroplasty (2020); CMS LCD L33394',
    confidence_score: 1.00,
    review_status: 'verified',
    effective_date: '2020-01-01',
    is_active: true
  },
  {
    id: 'm-27130-03',
    cpt_code: '27130',
    procedure_name: 'Total Hip Arthroplasty',
    specialty: 'Orthopedics',
    component_code: 'HIP_LINER',
    component_name: 'Acetabular Liner / Insert',
    category_code: 'ORTHO_HIP',
    category_name: 'Hip Joint Arthroplasty',
    facility_id: null,
    is_facility_override: false,
    requirement_type: 'required',
    quantity_calculation_method: 'fixed',
    expected_quantity_min: 1,
    expected_quantity_max: 1,
    default_quantity: 1,
    mapping_source: 'clinical_guideline',
    clinical_evidence_citation: 'AAOS Clinical Practice Guideline for Total Hip Arthroplasty (2020); CMS LCD L33394',
    confidence_score: 1.00,
    review_status: 'verified',
    effective_date: '2020-01-01',
    is_active: true
  },
  {
    id: 'm-27130-04',
    cpt_code: '27130',
    procedure_name: 'Total Hip Arthroplasty',
    specialty: 'Orthopedics',
    component_code: 'HIP_HEAD',
    component_name: 'Femoral Modular Head',
    category_code: 'ORTHO_HIP',
    category_name: 'Hip Joint Arthroplasty',
    facility_id: null,
    is_facility_override: false,
    requirement_type: 'required',
    quantity_calculation_method: 'fixed',
    expected_quantity_min: 1,
    expected_quantity_max: 1,
    default_quantity: 1,
    mapping_source: 'clinical_guideline',
    clinical_evidence_citation: 'AAOS Clinical Practice Guideline for Total Hip Arthroplasty (2020); CMS LCD L33394',
    confidence_score: 1.00,
    review_status: 'verified',
    effective_date: '2020-01-01',
    is_active: true
  },
  {
    id: 'm-27130-05',
    cpt_code: '27130',
    procedure_name: 'Total Hip Arthroplasty',
    specialty: 'Orthopedics',
    component_code: 'HIP_SCREW',
    component_name: 'Acetabular Cancellous Screw',
    category_code: 'ORTHO_HIP',
    category_name: 'Hip Joint Arthroplasty',
    facility_id: null,
    is_facility_override: false,
    requirement_type: 'optional',
    quantity_calculation_method: 'surgeon_discretion',
    expected_quantity_min: 0,
    expected_quantity_max: 4,
    default_quantity: 1,
    mapping_source: 'clinical_guideline',
    clinical_evidence_citation: 'AAOS Hip Reconstruction Guidelines for Supplemental Fixation',
    confidence_score: 0.90,
    review_status: 'verified',
    effective_date: '2020-01-01',
    is_active: true
  },

  // Orthopedics - Total Knee Arthroplasty (CPT 27447)
  {
    id: 'm-27447-01',
    cpt_code: '27447',
    procedure_name: 'Total Knee Arthroplasty',
    specialty: 'Orthopedics',
    component_code: 'KNEE_FEMORAL',
    component_name: 'Femoral Knee Component',
    category_code: 'ORTHO_KNEE',
    category_name: 'Knee Joint Reconstruction',
    facility_id: null,
    is_facility_override: false,
    requirement_type: 'required',
    quantity_calculation_method: 'laterality_dependent',
    expected_quantity_min: 1,
    expected_quantity_max: 1,
    default_quantity: 1,
    mapping_source: 'clinical_guideline',
    clinical_evidence_citation: 'AAOS Clinical Practice Guideline for Knee Osteoarthritis (2021)',
    confidence_score: 1.00,
    review_status: 'verified',
    effective_date: '2020-01-01',
    is_active: true
  },
  {
    id: 'm-27447-02',
    cpt_code: '27447',
    procedure_name: 'Total Knee Arthroplasty',
    specialty: 'Orthopedics',
    component_code: 'KNEE_TIBIAL_TRAY',
    component_name: 'Tibial Baseplate / Tray',
    category_code: 'ORTHO_KNEE',
    category_name: 'Knee Joint Reconstruction',
    facility_id: null,
    is_facility_override: false,
    requirement_type: 'required',
    quantity_calculation_method: 'laterality_dependent',
    expected_quantity_min: 1,
    expected_quantity_max: 1,
    default_quantity: 1,
    mapping_source: 'clinical_guideline',
    clinical_evidence_citation: 'AAOS Clinical Practice Guideline for Knee Osteoarthritis (2021)',
    confidence_score: 1.00,
    review_status: 'verified',
    effective_date: '2020-01-01',
    is_active: true
  },
  {
    id: 'm-27447-03',
    cpt_code: '27447',
    procedure_name: 'Total Knee Arthroplasty',
    specialty: 'Orthopedics',
    component_code: 'KNEE_TIBIAL_INSERT',
    component_name: 'Tibial Polyethylene Insert',
    category_code: 'ORTHO_KNEE',
    category_name: 'Knee Joint Reconstruction',
    facility_id: null,
    is_facility_override: false,
    requirement_type: 'required',
    quantity_calculation_method: 'laterality_dependent',
    expected_quantity_min: 1,
    expected_quantity_max: 1,
    default_quantity: 1,
    mapping_source: 'clinical_guideline',
    clinical_evidence_citation: 'AAOS Clinical Practice Guideline for Knee Osteoarthritis (2021)',
    confidence_score: 1.00,
    review_status: 'verified',
    effective_date: '2020-01-01',
    is_active: true
  },
  {
    id: 'm-27447-04',
    cpt_code: '27447',
    procedure_name: 'Total Knee Arthroplasty',
    specialty: 'Orthopedics',
    component_code: 'KNEE_PATELLA',
    component_name: 'Patellar Resurfacing Button',
    category_code: 'ORTHO_KNEE',
    category_name: 'Knee Joint Reconstruction',
    facility_id: null,
    is_facility_override: false,
    requirement_type: 'optional',
    quantity_calculation_method: 'surgeon_discretion',
    expected_quantity_min: 0,
    expected_quantity_max: 1,
    default_quantity: 1,
    mapping_source: 'clinical_guideline',
    clinical_evidence_citation: 'AAOS Knee Guidelines for Patellar Resurfacing',
    confidence_score: 0.85,
    review_status: 'verified',
    effective_date: '2020-01-01',
    is_active: true
  },

  // Spine - Anterior Cervical Discectomy & Fusion (CPT 22551)
  {
    id: 'm-22551-01',
    cpt_code: '22551',
    procedure_name: 'Anterior Cervical Discectomy & Fusion (ACDF)',
    specialty: 'Spine',
    component_code: 'SPINE_ACDF_CAGE',
    component_name: 'Cervical Interbody Spacer / Cage',
    category_code: 'SPINE_ACDF',
    category_name: 'Anterior Cervical Spine',
    facility_id: null,
    is_facility_override: false,
    requirement_type: 'required',
    quantity_calculation_method: 'fixed',
    expected_quantity_min: 1,
    expected_quantity_max: 1,
    default_quantity: 1,
    mapping_source: 'clinical_guideline',
    clinical_evidence_citation: 'NASS Evidence-Based Clinical Guidelines for Multilevel Cervical Fusion',
    confidence_score: 1.00,
    review_status: 'verified',
    effective_date: '2020-01-01',
    is_active: true
  },
  {
    id: 'm-22551-02',
    cpt_code: '22551',
    procedure_name: 'Anterior Cervical Discectomy & Fusion (ACDF)',
    specialty: 'Spine',
    component_code: 'SPINE_ACDF_PLATE',
    component_name: 'Anterior Cervical Fixation Plate',
    category_code: 'SPINE_ACDF',
    category_name: 'Anterior Cervical Spine',
    facility_id: null,
    is_facility_override: false,
    requirement_type: 'required',
    quantity_calculation_method: 'fixed',
    expected_quantity_min: 1,
    expected_quantity_max: 1,
    default_quantity: 1,
    mapping_source: 'clinical_guideline',
    clinical_evidence_citation: 'NASS Evidence-Based Clinical Guidelines for Multilevel Cervical Fusion',
    confidence_score: 1.00,
    review_status: 'verified',
    effective_date: '2020-01-01',
    is_active: true
  },
  {
    id: 'm-22551-03',
    cpt_code: '22551',
    procedure_name: 'Anterior Cervical Discectomy & Fusion (ACDF)',
    specialty: 'Spine',
    component_code: 'SPINE_ACDF_SCREW',
    component_name: 'Cervical Bone Fixation Screw',
    category_code: 'SPINE_ACDF',
    category_name: 'Anterior Cervical Spine',
    facility_id: null,
    is_facility_override: false,
    requirement_type: 'required',
    quantity_calculation_method: 'fixed',
    expected_quantity_min: 4,
    expected_quantity_max: 8,
    default_quantity: 4,
    mapping_source: 'clinical_guideline',
    clinical_evidence_citation: 'NASS Cervical Anterior Plate Screw Constructs (2 screws per vertebra)',
    confidence_score: 1.00,
    review_status: 'verified',
    effective_date: '2020-01-01',
    is_active: true
  },
  {
    id: 'm-22551-04',
    cpt_code: '22551',
    procedure_name: 'Anterior Cervical Discectomy & Fusion (ACDF)',
    specialty: 'Spine',
    component_code: 'SPINE_DBM_GRAFT',
    component_name: 'Demineralized Bone Matrix Biologic',
    category_code: 'SPINE_ACDF',
    category_name: 'Anterior Cervical Spine',
    facility_id: null,
    is_facility_override: false,
    requirement_type: 'conditional',
    quantity_calculation_method: 'fixed',
    expected_quantity_min: 1,
    expected_quantity_max: 1,
    default_quantity: 1,
    condition_expression: 'autograft_harvested = FALSE',
    mapping_source: 'clinical_guideline',
    clinical_evidence_citation: 'NASS Clinical Guidelines for Biologic Bone Grafts in Spine Fusion',
    confidence_score: 0.90,
    review_status: 'verified',
    effective_date: '2020-01-01',
    is_active: true
  },

  // Spine - Lumbar Interbody Fusion / TLIF (CPT 22633)
  {
    id: 'm-22633-01',
    cpt_code: '22633',
    procedure_name: 'Lumbar Interbody Arthrodesis (TLIF / PLIF)',
    specialty: 'Spine',
    component_code: 'SPINE_LUMBAR_CAGE',
    component_name: 'Lumbar Interbody Spacer',
    category_code: 'SPINE_LUMBAR',
    category_name: 'Lumbar Interbody Spine',
    facility_id: null,
    is_facility_override: false,
    requirement_type: 'required',
    quantity_calculation_method: 'surgeon_discretion',
    expected_quantity_min: 1,
    expected_quantity_max: 2,
    default_quantity: 1,
    mapping_source: 'clinical_guideline',
    clinical_evidence_citation: 'NASS Lumbar Interbody Arthrodesis Guidelines (1 for TLIF, 2 for PLIF)',
    confidence_score: 1.00,
    review_status: 'verified',
    effective_date: '2020-01-01',
    is_active: true
  },
  {
    id: 'm-22633-02',
    cpt_code: '22633',
    procedure_name: 'Lumbar Interbody Arthrodesis (TLIF / PLIF)',
    specialty: 'Spine',
    component_code: 'SPINE_PEDICLE_SCREW',
    component_name: 'Pedicle Fixation Screw',
    category_code: 'SPINE_LUMBAR',
    category_name: 'Lumbar Interbody Spine',
    facility_id: null,
    is_facility_override: false,
    requirement_type: 'required',
    quantity_calculation_method: 'fixed',
    expected_quantity_min: 4,
    expected_quantity_max: 4,
    default_quantity: 4,
    mapping_source: 'clinical_guideline',
    clinical_evidence_citation: 'NASS Lumbar Pedicle Screw Fixation Guidelines (2 screws per level bilaterally)',
    confidence_score: 1.00,
    review_status: 'verified',
    effective_date: '2020-01-01',
    is_active: true
  },
  {
    id: 'm-22633-03',
    cpt_code: '22633',
    procedure_name: 'Lumbar Interbody Arthrodesis (TLIF / PLIF)',
    specialty: 'Spine',
    component_code: 'SPINE_ROD',
    component_name: 'Spinal Fixation Rod',
    category_code: 'SPINE_LUMBAR',
    category_name: 'Lumbar Interbody Spine',
    facility_id: null,
    is_facility_override: false,
    requirement_type: 'required',
    quantity_calculation_method: 'fixed',
    expected_quantity_min: 2,
    expected_quantity_max: 2,
    default_quantity: 2,
    mapping_source: 'clinical_guideline',
    clinical_evidence_citation: 'NASS Lumbar Spinal Rod Guidelines (1 left rod, 1 right rod)',
    confidence_score: 1.00,
    review_status: 'verified',
    effective_date: '2020-01-01',
    is_active: true
  },
  {
    id: 'm-22633-04',
    cpt_code: '22633',
    procedure_name: 'Lumbar Interbody Arthrodesis (TLIF / PLIF)',
    specialty: 'Spine',
    component_code: 'SPINE_SET_SCREW',
    component_name: 'Pedicle Locking Cap / Set Screw',
    category_code: 'SPINE_LUMBAR',
    category_name: 'Lumbar Interbody Spine',
    facility_id: null,
    is_facility_override: false,
    requirement_type: 'required',
    quantity_calculation_method: 'fixed',
    expected_quantity_min: 4,
    expected_quantity_max: 4,
    default_quantity: 4,
    mapping_source: 'clinical_guideline',
    clinical_evidence_citation: 'NASS Locking Set Screws for Pedicle Screw Housing (1 per screw)',
    confidence_score: 1.00,
    review_status: 'verified',
    effective_date: '2020-01-01',
    is_active: true
  },

  // Ophthalmology - Cataract (CPT 66984 & CPT 66982)
  {
    id: 'm-66984-01',
    cpt_code: '66984',
    procedure_name: 'Extracapsular Cataract Extraction with IOL',
    specialty: 'Ophthalmology',
    component_code: 'IOL_MONOFOCAL',
    component_name: 'Monofocal Intraocular Lens',
    category_code: 'OPHTH_CATARACT',
    category_name: 'Cataract & Lens Replacement',
    facility_id: null,
    is_facility_override: false,
    requirement_type: 'required',
    quantity_calculation_method: 'fixed',
    expected_quantity_min: 1,
    expected_quantity_max: 1,
    default_quantity: 1,
    mapping_source: 'clinical_guideline',
    clinical_evidence_citation: 'ASCRS Clinical Practice Guidelines for Standard Cataract Surgery',
    confidence_score: 1.00,
    review_status: 'verified',
    effective_date: '2020-01-01',
    is_active: true
  },
  {
    id: 'm-66982-01',
    cpt_code: '66982',
    procedure_name: 'Complex Cataract Extraction with IOL',
    specialty: 'Ophthalmology',
    component_code: 'OPHTH_CTR',
    component_name: 'Capsular Tension Ring',
    category_code: 'OPHTH_CATARACT',
    category_name: 'Cataract & Lens Replacement',
    facility_id: null,
    is_facility_override: false,
    requirement_type: 'conditional',
    quantity_calculation_method: 'fixed',
    expected_quantity_min: 1,
    expected_quantity_max: 1,
    default_quantity: 1,
    condition_expression: 'zonular_instability = TRUE',
    mapping_source: 'clinical_guideline',
    clinical_evidence_citation: 'ASCRS Complex Cataract Extraction Guidelines for Capsular Tension Ring',
    confidence_score: 0.95,
    review_status: 'verified',
    effective_date: '2020-01-01',
    is_active: true
  },

  // Pain Management - Neurostimulator (CPT 63685 & CPT 63650)
  {
    id: 'm-63685-01',
    cpt_code: '63685',
    procedure_name: 'Insertion of Spinal Neurostimulator Pulse Generator (IPG)',
    specialty: 'Pain Management',
    component_code: 'SCS_PULSE_GEN',
    component_name: 'Implantable Pulse Generator (IPG)',
    category_code: 'PAIN_SCS',
    category_name: 'Spinal Cord Stimulation',
    facility_id: null,
    is_facility_override: false,
    requirement_type: 'required',
    quantity_calculation_method: 'fixed',
    expected_quantity_min: 1,
    expected_quantity_max: 1,
    default_quantity: 1,
    mapping_source: 'cms_lcd',
    clinical_evidence_citation: 'NANS Neuromodulation Guidelines; CMS LCD L36035 for SCS Generator Placement',
    confidence_score: 0.95,
    review_status: 'verified',
    effective_date: '2020-01-01',
    is_active: true
  },
  {
    id: 'm-63650-01',
    cpt_code: '63650',
    procedure_name: 'Percutaneous Implantation of Neurostimulator Array',
    specialty: 'Pain Management',
    component_code: 'SCS_PERC_LEAD',
    component_name: 'Percutaneous Stimulation Lead',
    category_code: 'PAIN_SCS',
    category_name: 'Spinal Cord Stimulation',
    facility_id: null,
    is_facility_override: false,
    requirement_type: 'required',
    quantity_calculation_method: 'per_unit',
    expected_quantity_min: 1,
    expected_quantity_max: 1,
    default_quantity: 1,
    mapping_source: 'cms_lcd',
    clinical_evidence_citation: 'NANS Neuromodulation Guidelines; CMS LCD L36035 for SCS Epidural Array',
    confidence_score: 0.95,
    review_status: 'verified',
    effective_date: '2020-01-01',
    is_active: true
  },

  // Plastic Surgery - Breast (CPT 19340 & CPT 19357)
  {
    id: 'm-19340-01',
    cpt_code: '19340',
    procedure_name: 'Immediate Insertion of Breast Prosthesis',
    specialty: 'Plastic Surgery',
    component_code: 'BREAST_IMPLANT_SILICONE',
    component_name: 'Silicone Gel Breast Implant',
    category_code: 'PLASTICS_BREAST',
    category_name: 'Breast Reconstruction / Augmentation',
    facility_id: null,
    is_facility_override: false,
    requirement_type: 'required',
    quantity_calculation_method: 'laterality_dependent',
    expected_quantity_min: 1,
    expected_quantity_max: 1,
    default_quantity: 1,
    mapping_source: 'clinical_guideline',
    clinical_evidence_citation: 'ASPS Practice Parameter for Immediate Breast Reconstruction',
    confidence_score: 0.95,
    review_status: 'verified',
    effective_date: '2020-01-01',
    is_active: true
  },
  {
    id: 'm-19357-01',
    cpt_code: '19357',
    procedure_name: 'Tissue Expander Placement in Breast Reconstruction',
    specialty: 'Plastic Surgery',
    component_code: 'BREAST_TISSUE_EXPANDER',
    component_name: 'Breast Tissue Expander with Magnetic Port',
    category_code: 'PLASTICS_BREAST',
    category_name: 'Breast Reconstruction / Augmentation',
    facility_id: null,
    is_facility_override: false,
    requirement_type: 'required',
    quantity_calculation_method: 'laterality_dependent',
    expected_quantity_min: 1,
    expected_quantity_max: 1,
    default_quantity: 1,
    mapping_source: 'clinical_guideline',
    clinical_evidence_citation: 'ASPS Practice Guidelines for Staged Breast Reconstruction with Expander',
    confidence_score: 0.95,
    review_status: 'verified',
    effective_date: '2020-01-01',
    is_active: true
  }
];

export const CPT_CANONICAL_PROCEDURES = {
  '27130': 'Total Hip Arthroplasty (THA)',
  '27447': 'Total Knee Arthroplasty (TKA)',
  '22551': 'Anterior Cervical Discectomy & Fusion (ACDF)',
  '66984': 'Extracapsular Cataract Extraction with IOL',
  '66982': 'Complex Cataract Extraction with IOL',
  '63650': 'Percutaneous Spinal Cord Lead Implantation',
  '19340': 'Immediate Insertion of Breast Prosthesis',
  '19357': 'Breast Tissue Expander Placement'
};

// ==============================================================================
// 2. CPT IMPLANT MAPPING SERVICE LAYER
// ==============================================================================

export const cptImplantMappingService = {
  /**
   * Retrieves all CPT-to-implant mappings, applying optional filters
   */
  async getAllMappings(filters = {}) {
    const { specialty, requirementType, search, facilityId } = filters;
    try {
      let query = supabase
        .from('cpt_implant_mappings')
        .select(`
          id,
          cpt_code,
          facility_id,
          requirement_type,
          quantity_calculation_method,
          expected_quantity_min,
          expected_quantity_max,
          default_quantity,
          condition_expression,
          mapping_source,
          clinical_evidence_citation,
          confidence_score,
          review_status,
          effective_date,
          termination_date,
          version_number,
          is_active,
          created_at,
          updated_at,
          cpt:cpt_master(id, code, description),
          component:implant_components(id, code, name, component_type, default_duration),
          category:implant_categories(id, code, name, specialty)
        `)
        .eq('is_active', true);

      if (specialty && specialty !== 'All') {
        query = query.eq('category.specialty', specialty);
      }
      if (requirementType && requirementType !== 'all') {
        query = query.eq('requirement_type', requirementType);
      }
      if (search && search.trim().length > 0) {
        query = query.or(`cpt_code.ilike.%${search.trim()}%,component.name.ilike.%${search.trim()}%`);
      }

      const { data, error } = await query;
      if (!error && Array.isArray(data) && data.length > 0) {
        return data.map(item => ({
          ...item,
          procedure_name: item.cpt?.description || CPT_CANONICAL_PROCEDURES[item.cpt_code] || `Procedure ${item.cpt_code}`,
          component_code: item.component?.code || '',
          component_name: item.component?.name || '',
          component_type: item.component?.component_type || '',
          default_duration: item.component?.default_duration || '',
          category_code: item.category?.code || '',
          category_name: item.category?.name || '',
          specialty: item.category?.specialty || 'General',
          is_facility_override: Boolean(item.facility_id)
        }));
      }
    } catch (err) {
      console.warn('cptImplantMappingService.getAllMappings falling back to baseline:', err.message || err);
    }

    // Fallback in-memory catalog with client-side filtering
    return GLOBAL_BASELINE_MAPPINGS.filter(m => {
      if (!m.is_active) return false;
      if (specialty && specialty !== 'All' && m.specialty !== specialty) return false;
      if (requirementType && requirementType !== 'all' && m.requirement_type !== requirementType) return false;
      if (search && search.trim().length > 0) {
        const s = search.trim().toLowerCase();
        const matchCode = m.cpt_code.toLowerCase().includes(s);
        const matchComp = m.component_name.toLowerCase().includes(s);
        const matchProc = m.procedure_name.toLowerCase().includes(s);
        if (!matchCode && !matchComp && !matchProc) return false;
      }
      if (facilityId && m.facility_id && m.facility_id !== facilityId) return false;
      return true;
    });
  },

  /**
   * Resolves construct components for a specific CPT code and date of service
   * Priority: Facility Override > Global Baseline
   */
  async getMappingsByCpt(cptCode, facilityId = null, dateOfService = null) {
    const effectiveDos = dateOfService || new Date().toISOString().split('T')[0];
    try {
      const { data, error } = await supabase.rpc('fn_resolve_cpt_implant_requirements', {
        p_cpt_code: String(cptCode),
        p_facility_id: facilityId,
        p_dos: effectiveDos
      });

      if (!error && Array.isArray(data) && data.length > 0) {
        return data;
      }
    } catch (err) {
      console.warn(`fn_resolve_cpt_implant_requirements fallback for CPT ${cptCode}:`, err.message || err);
    }

    // In-memory fallback resolution
    const candidates = GLOBAL_BASELINE_MAPPINGS.filter(m => 
      m.cpt_code === String(cptCode) &&
      m.is_active === true &&
      m.review_status === 'verified' &&
      effectiveDos >= m.effective_date &&
      (!m.termination_date || effectiveDos <= m.termination_date)
    );

    // Group by component_code, prioritizing facility override if available
    const resolvedMap = new Map();
    for (const item of candidates) {
      const existing = resolvedMap.get(item.component_code);
      if (!existing || (item.facility_id && !existing.facility_id)) {
        resolvedMap.set(item.component_code, item);
      }
    }

    return Array.from(resolvedMap.values()).sort((a, b) => {
      const priority = { required: 1, conditional: 2, optional: 3, not_applicable: 4 };
      return (priority[a.requirement_type] || 5) - (priority[b.requirement_type] || 5);
    });
  },

  /**
   * Resolves multi-procedure surgical construct requirements with modifier scaling
   */
  async resolveEncounterConstruct(cptCodes = [], modifiers = [], facilityId = null, dateOfService = null) {
    const isBilateral = modifiers.includes('50');
    const combinedConstruct = [];

    for (const code of cptCodes) {
      const items = await this.getMappingsByCpt(code, facilityId, dateOfService);
      for (const item of items) {
        let expectedMin = item.expected_quantity_min;
        let expectedMax = item.expected_quantity_max;
        let defaultQty = item.default_quantity;

        if (item.quantity_calculation_method === 'laterality_dependent' && isBilateral) {
          expectedMin *= 2;
          expectedMax *= 2;
          defaultQty *= 2;
        }

        combinedConstruct.push({
          ...item,
          scaled_min: expectedMin,
          scaled_max: expectedMax,
          scaled_default: defaultQty
        });
      }
    }

    return combinedConstruct;
  },

  /**
   * Client-side pre-bill evaluation of case devices against CPT requirements
   */
  evaluateCaseDevices(procedures = [], caseDevices = []) {
    const findings = [];
    let blockers = 0;
    let warnings = 0;

    for (const proc of procedures) {
      const cptCode = String(proc.cpt_code || proc.code || '');
      const isBilateral = Array.isArray(proc.modifiers) && proc.modifiers.includes('50');
      const multiplier = isBilateral ? 2 : 1;

      // Find required mappings for this CPT
      const mappings = GLOBAL_BASELINE_MAPPINGS.filter(m => m.cpt_code === cptCode && m.is_active);

      for (const map of mappings) {
        // Look for matching documented device in case_devices
        const matchedDevices = caseDevices.filter(d => {
          const name = (d.device_name || '').toLowerCase();
          const notes = (d.notes || '').toLowerCase();
          const targetName = map.component_name.toLowerCase();
          const targetCode = map.component_code.toLowerCase();
          return name.includes(targetName) || notes.includes(targetCode);
        });

        const totalQty = matchedDevices.reduce((sum, d) => sum + (Number(d.quantity) || 1), 0);

        let targetMin = map.expected_quantity_min;
        let targetMax = map.expected_quantity_max;
        if (map.quantity_calculation_method === 'laterality_dependent') {
          targetMin *= multiplier;
          targetMax *= multiplier;
        }

        // Rule DEV-003: Required component missing
        if (map.requirement_type === 'required' && matchedDevices.length === 0) {
          findings.push({
            rule_id: 'DEV-003',
            severity: 'BLOCKER',
            message: `CPT ${cptCode} requires implant component "${map.component_name}" (${map.component_code}), but this component was not documented in case devices.`,
            resolution: 'Document the implanted construct in case devices or record a clinical exception before pre-bill release.'
          });
          blockers += 1;
        }

        // Rule DEV-005: Documented quantity out of bounds
        if (matchedDevices.length > 0 && (totalQty < targetMin || totalQty > targetMax)) {
          findings.push({
            rule_id: 'DEV-005',
            severity: 'WARNING',
            message: `Component "${map.component_name}" has ${totalQty} units documented, which falls outside expected clinical range [${targetMin} - ${targetMax}] for CPT ${cptCode}.`,
            resolution: 'Verify documented hardware quantities against the operative report.'
          });
          warnings += 1;
        }
      }
    }

    return {
      can_release_to_bill: blockers === 0,
      overall_status: blockers > 0 ? 'blocked' : (warnings > 0 ? 'warnings' : 'clean'),
      blocker_count: blockers,
      warning_count: warnings,
      findings
    };
  },

  /**
   * Saves a facility-level mapping override or updates an existing mapping
   */
  async saveMapping(mappingPayload, userId = null) {
    if (!mappingPayload.cpt_code || !mappingPayload.component_code) {
      throw new Error('CPT Code and Component are required fields.');
    }

    try {
      const { data, error } = await supabase
        .from('cpt_implant_mappings')
        .upsert({
          ...mappingPayload,
          updated_by: userId,
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (!error && data) return data;
    } catch (err) {
      console.warn('saveMapping remote error, updating local state:', err.message || err);
    }

    // Local state fallback
    const newRecord = {
      ...mappingPayload,
      id: mappingPayload.id || `m-local-${Date.now()}`,
      is_facility_override: true,
      review_status: mappingPayload.review_status || 'verified',
      is_active: true,
      updated_at: new Date().toISOString()
    };
    GLOBAL_BASELINE_MAPPINGS.unshift(newRecord);
    return newRecord;
  },

  /**
   * Deactivates a mapping
   */
  async deactivateMapping(mappingId, userId = null) {
    try {
      const { error } = await supabase
        .from('cpt_implant_mappings')
        .update({
          is_active: false,
          updated_by: userId,
          updated_at: new Date().toISOString()
        })
        .eq('id', mappingId);

      if (!error) return true;
    } catch (err) {
      console.warn('deactivateMapping remote error, updating local state:', err.message || err);
    }

    const idx = GLOBAL_BASELINE_MAPPINGS.findIndex(m => m.id === mappingId);
    if (idx !== -1) {
      GLOBAL_BASELINE_MAPPINGS[idx].is_active = false;
      return true;
    }
    return false;
  }
};

// Attach delegates to db singleton if present
if (typeof db !== 'undefined' && db) {
  db.cptImplantMappingService = cptImplantMappingService;
  db.getMappingsByCpt = (...args) => cptImplantMappingService.getMappingsByCpt(...args);
  db.getAllCptImplantMappings = (...args) => cptImplantMappingService.getAllMappings(...args);
  db.evaluateCaseDevicesCompleteness = (...args) => cptImplantMappingService.evaluateCaseDevices(...args);
}
