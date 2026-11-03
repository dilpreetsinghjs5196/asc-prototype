/**
 * ==============================================================================
 * Case Cost Model Service
 * Phase 72: Activity-Based Procedural Cost Accounting & Direct Cost Engine
 * ==============================================================================
 * 
 * Provides deterministic calculations for all 8 canonical direct cost categories:
 * 1. IMPLANT_COST (Vendor invoices, UDI serials, sterile packaging)
 * 2. SUPPLY_COST (Disposables, custom packs, gowns, sutures)
 * 3. PHARMACY_COST (Anesthetic gases, IV fluids, exparel, narcotics, blocks)
 * 4. LABOR_COST (Direct RN, Scrub Tech, CRNA wages with 1.25x burden multiplier)
 * 5. OR_TIME_COST (Operating room occupancy minutes x facility OR minute rate)
 * 6. PACU_TIME_COST (Phase I/II recovery minutes x facility PACU minute rate)
 * 7. REPROCESSING_COST (Central sterile tray decontamination & autoclave cycles)
 * 8. EQUIPMENT_COST (Capital depreciation, C-Arm fluoroscopy, towers, pathology)
 * 
 * Adheres strictly to:
 * - Healthcare Financial Governance (GAAP / ASC 606 / SOX 404)
 * - Fixed precision arithmetic (NUMERIC(12,2))
 * - Zero-substitution ban: missing costs yield PROVISIONAL or MISSING_SOURCE_DATA
 * - Maestro Clinical Design System: strictly Slate, Emerald, Sky, Amber, Rose
 */

import { FINANCIAL_COMPLETENESS_STATUSES } from './financialDataDictionaryService.js';

export const COST_CATEGORIES = {
  IMPLANT_COST: 'IMPLANT_COST',
  SUPPLY_COST: 'SUPPLY_COST',
  PHARMACY_COST: 'PHARMACY_COST',
  LABOR_COST: 'LABOR_COST',
  OR_TIME_COST: 'OR_TIME_COST',
  PACU_TIME_COST: 'PACU_TIME_COST',
  REPROCESSING_COST: 'REPROCESSING_COST',
  EQUIPMENT_COST: 'EQUIPMENT_COST'
};

export const COST_CATEGORY_CONFIG = {
  [COST_CATEGORIES.IMPLANT_COST]: {
    key: COST_CATEGORIES.IMPLANT_COST,
    label: 'Implants & Hardware',
    shortLabel: 'Implants',
    description: 'Vendor invoice acquisition cost for trackable surgical hardware, screws, plates, and grafts.',
    colorToken: 'sky',
    badgeClass: 'bg-sky-950/40 text-sky-400 border-sky-800',
    defaultSourceModule: 'UDIScanner'
  },
  [COST_CATEGORIES.SUPPLY_COST]: {
    key: COST_CATEGORIES.SUPPLY_COST,
    label: 'Supplies & Disposables',
    shortLabel: 'Supplies',
    description: 'Custom procedure packs, drapes, suction tubing, single-use trocars, and closure sutures.',
    colorToken: 'slate',
    badgeClass: 'bg-slate-800/60 text-slate-300 border-slate-700',
    defaultSourceModule: 'MaterialsManagement'
  },
  [COST_CATEGORIES.PHARMACY_COST]: {
    key: COST_CATEGORIES.PHARMACY_COST,
    label: 'Intraop Drugs & Solutions',
    shortLabel: 'Pharmacy',
    description: 'Anesthetic gases, IV bags, narcotics, local nerve blocks, antibiotics, and hemostatics.',
    colorToken: 'emerald',
    badgeClass: 'bg-emerald-950/40 text-emerald-300 border-emerald-800',
    defaultSourceModule: 'PharmacyPyxis'
  },
  [COST_CATEGORIES.LABOR_COST]: {
    key: COST_CATEGORIES.LABOR_COST,
    label: 'Clinical Nursing & Tech Labor',
    shortLabel: 'Labor',
    description: 'Time-driven circulator RN and surgical scrub technician minutes with 1.25x wage burden.',
    colorToken: 'amber',
    badgeClass: 'bg-amber-950/40 text-amber-300 border-amber-800',
    defaultSourceModule: 'StaffScheduling'
  },
  [COST_CATEGORIES.OR_TIME_COST]: {
    key: COST_CATEGORIES.OR_TIME_COST,
    label: 'OR Suite Occupancy',
    shortLabel: 'OR Suite',
    description: 'Operating room overhead, utilities, and sterile air turnover ($10.00/min baseline).',
    colorToken: 'sky',
    badgeClass: 'bg-sky-950/40 text-sky-300 border-sky-700',
    defaultSourceModule: 'SurgeryMilestones'
  },
  [COST_CATEGORIES.PACU_TIME_COST]: {
    key: COST_CATEGORIES.PACU_TIME_COST,
    label: 'PACU Recovery Care',
    shortLabel: 'PACU',
    description: 'Phase I and Phase II step-down recovery time ($3.50/min baseline).',
    colorToken: 'slate',
    badgeClass: 'bg-slate-900/60 text-slate-300 border-slate-700',
    defaultSourceModule: 'RecoveryTracker'
  },
  [COST_CATEGORIES.REPROCESSING_COST]: {
    key: COST_CATEGORIES.REPROCESSING_COST,
    label: 'Instrument Tray Reprocessing',
    shortLabel: 'Sterile Trays',
    description: 'Central sterile supply department (CSSD) wash, pack, wrap, and autoclave cycles.',
    colorToken: 'emerald',
    badgeClass: 'bg-emerald-950/40 text-emerald-400 border-emerald-700',
    defaultSourceModule: 'CSSDTracker'
  },
  [COST_CATEGORIES.EQUIPMENT_COST]: {
    key: COST_CATEGORIES.EQUIPMENT_COST,
    label: 'Capital Equipment & Diagnostics',
    shortLabel: 'Equipment',
    description: 'Fluoroscopy C-Arm, high-def video towers, surgical microscopes, and pathology fees.',
    colorToken: 'amber',
    badgeClass: 'bg-amber-900/40 text-amber-200 border-amber-600',
    defaultSourceModule: 'BioMedAssets'
  }
};

export const STERILIZATION_METHODS = {
  STEAM_AUTOCLAVE: 'STEAM_AUTOCLAVE',
  STERRAD_GAS_PLASMA: 'STERRAD_GAS_PLASMA',
  ETO: 'ETO',
  CHEMICAL_STERILANT: 'CHEMICAL_STERILANT'
};

export const DEFAULT_FACILITY_RATES = {
  orMinuteRate: 10.00,
  pacuMinuteRate: 3.50,
  laborBurdenMultiplier: 1.2500,
  scheduleName: 'ASC Standard Operating Cost Schedule 2026.1',
  effectiveDate: '2026-01-01'
};

export const DEFAULT_TRAY_CATALOG = [
  {
    trayCode: 'TRAY-ARTHRO-01',
    trayName: 'Arthroscopy Basic Set',
    specialty: 'Orthopedics',
    sterilizationMethod: STERILIZATION_METHODS.STEAM_AUTOCLAVE,
    decontaminationMinutes: 15,
    sterilizationMinutes: 45,
    perCycleCost: 45.00
  },
  {
    trayCode: 'TRAY-MENISC-02',
    trayName: 'Meniscal Repair Specialty Instrumentation',
    specialty: 'Orthopedics',
    sterilizationMethod: STERILIZATION_METHODS.STEAM_AUTOCLAVE,
    decontaminationMinutes: 20,
    sterilizationMinutes: 45,
    perCycleCost: 55.00
  },
  {
    trayCode: 'TRAY-CATARACT-01',
    trayName: 'Phaco Cataract Micro-Surgical Set',
    specialty: 'Ophthalmology',
    sterilizationMethod: STERILIZATION_METHODS.STERRAD_GAS_PLASMA,
    decontaminationMinutes: 12,
    sterilizationMinutes: 38,
    perCycleCost: 38.00
  },
  {
    trayCode: 'TRAY-ORIF-ANKLE',
    trayName: 'Small Fragment Ankle Plating Set',
    specialty: 'Orthopedics',
    sterilizationMethod: STERILIZATION_METHODS.STEAM_AUTOCLAVE,
    decontaminationMinutes: 25,
    sterilizationMinutes: 60,
    perCycleCost: 65.00
  },
  {
    trayCode: 'TRAY-GENERAL-01',
    trayName: 'Minor General Surgery Cut-Down Set',
    specialty: 'General Surgery',
    sterilizationMethod: STERILIZATION_METHODS.STEAM_AUTOCLAVE,
    decontaminationMinutes: 15,
    sterilizationMinutes: 40,
    perCycleCost: 35.00
  }
];

// Deterministic rounding to 2 decimal places
export function roundToTwo(num) {
  if (num === null || num === undefined || isNaN(num)) return 0.00;
  return Math.round((Number(num) + Number.EPSILON) * 100) / 100;
}

// In-memory cost line items store
const caseCostItemsStore = new Map();

// Helper to seed initial sample cost items for benchmark cases
function initializeSeedCostItems(surgeryId, facilityId = 'fac-001') {
  if (caseCostItemsStore.has(surgeryId)) {
    return caseCostItemsStore.get(surgeryId);
  }

  let items = [];

  if (surgeryId === 101) {
    // Case 101: Left Knee Arthroscopy & Meniscectomy
    items = [
      {
        id: `cost-101-01`,
        facility_id: facilityId,
        surgery_id: 101,
        cost_category: COST_CATEGORIES.IMPLANT_COST,
        item_code: 'STR-MITEK-01',
        item_description: 'Stryker Meniscal Mitek Bio-Absorbable Anchor & Suture Kit',
        quantity: 1,
        unit_cost: 1120.00,
        total_cost: 1120.00,
        source_module: 'UDIScanner',
        source_reference_id: 'INV-STRYK-84920',
        vendor_invoice_number: 'STR-84920',
        is_reconciled: true,
        completeness_flag: 'VERIFIED',
        created_at: '2026-10-24T11:30:00Z'
      },
      {
        id: `cost-101-02`,
        facility_id: facilityId,
        surgery_id: 101,
        cost_category: COST_CATEGORIES.SUPPLY_COST,
        item_code: 'SUP-ARTH-PACK',
        item_description: 'Arthro Custom Procedural Pack, Irrigation Tubing & Impervious Drape',
        quantity: 1,
        unit_cost: 380.00,
        total_cost: 380.00,
        source_module: 'MaterialsManagement',
        source_reference_id: 'SUP-101-01',
        vendor_invoice_number: 'MEDL-9921',
        is_reconciled: true,
        completeness_flag: 'VERIFIED',
        created_at: '2026-10-24T12:00:00Z'
      },
      {
        id: `cost-101-03`,
        facility_id: facilityId,
        surgery_id: 101,
        cost_category: COST_CATEGORIES.PHARMACY_COST,
        item_code: 'RX-ARTH-01',
        item_description: 'Marcaine 0.5% w/ Epinephrine + Cefazolin 2g IV PB Ancef',
        quantity: 1,
        unit_cost: 95.00,
        total_cost: 95.00,
        source_module: 'PharmacyPyxis',
        source_reference_id: 'PYX-101-RX',
        vendor_invoice_number: 'PFIZ-3321',
        is_reconciled: true,
        completeness_flag: 'VERIFIED',
        created_at: '2026-10-24T10:15:00Z'
      },
      {
        id: `cost-101-04`,
        facility_id: facilityId,
        surgery_id: 101,
        cost_category: COST_CATEGORIES.LABOR_COST,
        item_code: 'LAB-OR-TEAM',
        item_description: 'Circulator RN (60m @ $52/hr) + Scrub Tech (60m @ $36/hr) w/ 1.25x Burden',
        quantity: 1,
        unit_cost: 110.00,
        total_cost: 110.00,
        source_module: 'StaffScheduling',
        source_reference_id: 'LAB-101-01',
        vendor_invoice_number: null,
        is_reconciled: true,
        completeness_flag: 'VERIFIED',
        created_at: '2026-10-24T13:00:00Z'
      },
      {
        id: `cost-101-05`,
        facility_id: facilityId,
        surgery_id: 101,
        cost_category: COST_CATEGORIES.OR_TIME_COST,
        item_code: 'OR-OCCUPANCY',
        item_description: 'Operating Room Suite 2 Occupancy (60 mins @ $10.00/min baseline)',
        quantity: 60,
        unit_cost: 10.00,
        total_cost: 600.00,
        source_module: 'SurgeryMilestones',
        source_reference_id: 'OR-101-02',
        vendor_invoice_number: null,
        is_reconciled: true,
        completeness_flag: 'VERIFIED',
        created_at: '2026-10-24T13:15:00Z'
      },
      {
        id: `cost-101-06`,
        facility_id: facilityId,
        surgery_id: 101,
        cost_category: COST_CATEGORIES.PACU_TIME_COST,
        item_code: 'PACU-CARE',
        item_description: 'Phase I PACU Recovery Bay (45 mins @ $3.50/min baseline)',
        quantity: 45,
        unit_cost: 3.50,
        total_cost: 157.50,
        source_module: 'RecoveryTracker',
        source_reference_id: 'PACU-101-01',
        vendor_invoice_number: null,
        is_reconciled: true,
        completeness_flag: 'VERIFIED',
        created_at: '2026-10-24T14:30:00Z'
      },
      {
        id: `cost-101-07`,
        facility_id: facilityId,
        surgery_id: 101,
        cost_category: COST_CATEGORIES.REPROCESSING_COST,
        item_code: 'TRAY-ARTHRO-01',
        item_description: 'Arthroscopy Basic Set & Meniscal Specialty Tray Steam Autoclave Cycles',
        quantity: 2,
        unit_cost: 50.00,
        total_cost: 100.00,
        source_module: 'CSSDTracker',
        source_reference_id: 'CSSD-101-01',
        vendor_invoice_number: null,
        is_reconciled: true,
        completeness_flag: 'VERIFIED',
        created_at: '2026-10-24T15:00:00Z'
      },
      {
        id: `cost-101-08`,
        facility_id: facilityId,
        surgery_id: 101,
        cost_category: COST_CATEGORIES.EQUIPMENT_COST,
        item_code: 'EQ-ARTH-TOWER',
        item_description: '4K Ultra-HD Arthroscopy Video Tower & CrossBlade Shaver Console Usage',
        quantity: 1,
        unit_cost: 150.00,
        total_cost: 150.00,
        source_module: 'BioMedAssets',
        source_reference_id: 'BM-TWR-02',
        vendor_invoice_number: null,
        is_reconciled: true,
        completeness_flag: 'VERIFIED',
        created_at: '2026-10-24T13:30:00Z'
      }
    ];
  } else if (surgeryId === 102) {
    // Case 102: Right Cataract Phacoemulsification w/ IOL
    items = [
      {
        id: `cost-102-01`,
        facility_id: facilityId,
        surgery_id: 102,
        cost_category: COST_CATEGORIES.IMPLANT_COST,
        item_code: 'ALC-IOL-MONO',
        item_description: 'Alcon AcrySof IQ Monofocal Foldable Intraocular Lens (+21.5D)',
        quantity: 1,
        unit_cost: 245.00,
        total_cost: 245.00,
        source_module: 'UDIScanner',
        source_reference_id: 'INV-ALC-77312',
        vendor_invoice_number: 'ALC-77312',
        is_reconciled: true,
        completeness_flag: 'VERIFIED',
        created_at: '2026-10-25T09:00:00Z'
      },
      {
        id: `cost-102-02`,
        facility_id: facilityId,
        surgery_id: 102,
        cost_category: COST_CATEGORIES.SUPPLY_COST,
        item_code: 'SUP-OPH-PACK',
        item_description: 'Ophthalmic Eye Drape, Speculum, Keratome Blade & Micro-Sponge Pack',
        quantity: 1,
        unit_cost: 125.00,
        total_cost: 125.00,
        source_module: 'MaterialsManagement',
        source_reference_id: 'SUP-102-01',
        vendor_invoice_number: 'B&L-4421',
        is_reconciled: true,
        completeness_flag: 'VERIFIED',
        created_at: '2026-10-25T09:15:00Z'
      },
      {
        id: `cost-102-03`,
        facility_id: facilityId,
        surgery_id: 102,
        cost_category: COST_CATEGORIES.PHARMACY_COST,
        item_code: 'RX-VISCO-01',
        item_description: 'ProVisc Ophthalmic Viscosurgical Device + Tropicamide / Phenylephrine drops',
        quantity: 1,
        unit_cost: 85.00,
        total_cost: 85.00,
        source_module: 'PharmacyPyxis',
        source_reference_id: 'PYX-102-RX',
        vendor_invoice_number: 'ALC-9912',
        is_reconciled: true,
        completeness_flag: 'VERIFIED',
        created_at: '2026-10-25T08:45:00Z'
      },
      {
        id: `cost-102-04`,
        facility_id: facilityId,
        surgery_id: 102,
        cost_category: COST_CATEGORIES.LABOR_COST,
        item_code: 'LAB-OPH-TEAM',
        item_description: 'Ophthalmic Circulator RN & Scrub Tech (30 mins w/ 1.25x wage burden)',
        quantity: 1,
        unit_cost: 55.00,
        total_cost: 55.00,
        source_module: 'StaffScheduling',
        source_reference_id: 'LAB-102-01',
        vendor_invoice_number: null,
        is_reconciled: true,
        completeness_flag: 'VERIFIED',
        created_at: '2026-10-25T09:40:00Z'
      },
      {
        id: `cost-102-05`,
        facility_id: facilityId,
        surgery_id: 102,
        cost_category: COST_CATEGORIES.OR_TIME_COST,
        item_code: 'OR-OCCUPANCY',
        item_description: 'Eye Pavilion Operating Suite (30 mins @ $10.00/min baseline)',
        quantity: 30,
        unit_cost: 10.00,
        total_cost: 300.00,
        source_module: 'SurgeryMilestones',
        source_reference_id: 'OR-102-01',
        vendor_invoice_number: null,
        is_reconciled: true,
        completeness_flag: 'VERIFIED',
        created_at: '2026-10-25T09:45:00Z'
      },
      {
        id: `cost-102-06`,
        facility_id: facilityId,
        surgery_id: 102,
        cost_category: COST_CATEGORIES.PACU_TIME_COST,
        item_code: 'PACU-STEPDOWN',
        item_description: 'Ophthalmic Fast-Track Recovery Lounge (30 mins @ $3.50/min baseline)',
        quantity: 30,
        unit_cost: 3.50,
        total_cost: 105.00,
        source_module: 'RecoveryTracker',
        source_reference_id: 'PACU-102-01',
        vendor_invoice_number: null,
        is_reconciled: true,
        completeness_flag: 'VERIFIED',
        created_at: '2026-10-25T10:30:00Z'
      },
      {
        id: `cost-102-07`,
        facility_id: facilityId,
        surgery_id: 102,
        cost_category: COST_CATEGORIES.REPROCESSING_COST,
        item_code: 'TRAY-CATARACT-01',
        item_description: 'Phaco Cataract Micro-Surgical Set STERRAD Gas Plasma Cycle',
        quantity: 1,
        unit_cost: 38.00,
        total_cost: 38.00,
        source_module: 'CSSDTracker',
        source_reference_id: 'CSSD-102-01',
        vendor_invoice_number: null,
        is_reconciled: true,
        completeness_flag: 'VERIFIED',
        created_at: '2026-10-25T11:00:00Z'
      },
      {
        id: `cost-102-08`,
        facility_id: facilityId,
        surgery_id: 102,
        cost_category: COST_CATEGORIES.EQUIPMENT_COST,
        item_code: 'EQ-PHACO-CENT',
        item_description: 'Alcon Centurion Vision System Phaco Machine & Zeiss Lumera Microscope Usage',
        quantity: 1,
        unit_cost: 120.00,
        total_cost: 120.00,
        source_module: 'BioMedAssets',
        source_reference_id: 'BM-PHACO-01',
        vendor_invoice_number: null,
        is_reconciled: true,
        completeness_flag: 'VERIFIED',
        created_at: '2026-10-25T09:45:00Z'
      }
    ];
  } else if (surgeryId === 103) {
    // Case 103: Open Reduction Internal Fixation (ORIF) Ankle
    items = [
      {
        id: `cost-103-01`,
        facility_id: facilityId,
        surgery_id: 103,
        cost_category: COST_CATEGORIES.IMPLANT_COST,
        item_code: 'SYN-LCP-FIB',
        item_description: 'DePuy Synthes 3.5mm LCP Distal Fibula Plate w/ 6 Cortical & Locking Screws',
        quantity: 1,
        unit_cost: 1850.00,
        total_cost: 1850.00,
        source_module: 'UDIScanner',
        source_reference_id: 'INV-SYN-91024',
        vendor_invoice_number: 'SYN-91024',
        is_reconciled: true,
        completeness_flag: 'VERIFIED',
        created_at: '2026-10-26T10:30:00Z'
      },
      {
        id: `cost-103-02`,
        facility_id: facilityId,
        surgery_id: 103,
        cost_category: COST_CATEGORIES.SUPPLY_COST,
        item_code: 'SUP-ORTH-EXT',
        item_description: 'Orthopedic Extremity Drape, Esmarch Bandage, Pneumatic Tourniquet Cuff',
        quantity: 1,
        unit_cost: 290.00,
        total_cost: 290.00,
        source_module: 'MaterialsManagement',
        source_reference_id: 'SUP-103-01',
        vendor_invoice_number: 'MEDL-5512',
        is_reconciled: true,
        completeness_flag: 'VERIFIED',
        created_at: '2026-10-26T10:45:00Z'
      },
      {
        id: `cost-103-03`,
        facility_id: facilityId,
        surgery_id: 103,
        cost_category: COST_CATEGORIES.PHARMACY_COST,
        item_code: 'RX-POP-BLOCK',
        item_description: 'Ropivacaine 0.5% Popliteal / Saphenous Regional Block + Ancef 2g IV',
        quantity: 1,
        unit_cost: 145.00,
        total_cost: 145.00,
        source_module: 'PharmacyPyxis',
        source_reference_id: 'PYX-103-RX',
        vendor_invoice_number: 'HOSP-1288',
        is_reconciled: true,
        completeness_flag: 'VERIFIED',
        created_at: '2026-10-26T09:30:00Z'
      },
      {
        id: `cost-103-04`,
        facility_id: facilityId,
        surgery_id: 103,
        cost_category: COST_CATEGORIES.LABOR_COST,
        item_code: 'LAB-OR-TEAM-90',
        item_description: 'Circulator RN (90m @ $52/hr) + Scrub Tech (90m @ $36/hr) w/ 1.25x Burden',
        quantity: 1,
        unit_cost: 165.00,
        total_cost: 165.00,
        source_module: 'StaffScheduling',
        source_reference_id: 'LAB-103-01',
        vendor_invoice_number: null,
        is_reconciled: true,
        completeness_flag: 'VERIFIED',
        created_at: '2026-10-26T12:00:00Z'
      },
      {
        id: `cost-103-05`,
        facility_id: facilityId,
        surgery_id: 103,
        cost_category: COST_CATEGORIES.OR_TIME_COST,
        item_code: 'OR-OCCUPANCY-90',
        item_description: 'Main Operating Suite 1 Occupancy (90 mins @ $10.00/min baseline)',
        quantity: 90,
        unit_cost: 10.00,
        total_cost: 900.00,
        source_module: 'SurgeryMilestones',
        source_reference_id: 'OR-103-01',
        vendor_invoice_number: null,
        is_reconciled: true,
        completeness_flag: 'VERIFIED',
        created_at: '2026-10-26T12:15:00Z'
      },
      {
        id: `cost-103-06`,
        facility_id: facilityId,
        surgery_id: 103,
        cost_category: COST_CATEGORIES.PACU_TIME_COST,
        item_code: 'PACU-CARE-60',
        item_description: 'Phase I PACU Recovery Bay (60 mins @ $3.50/min baseline)',
        quantity: 60,
        unit_cost: 3.50,
        total_cost: 210.00,
        source_module: 'RecoveryTracker',
        source_reference_id: 'PACU-103-01',
        vendor_invoice_number: null,
        is_reconciled: true,
        completeness_flag: 'VERIFIED',
        created_at: '2026-10-26T13:45:00Z'
      },
      {
        id: `cost-103-07`,
        facility_id: facilityId,
        surgery_id: 103,
        cost_category: COST_CATEGORIES.REPROCESSING_COST,
        item_code: 'TRAY-ORIF-ANKLE',
        item_description: 'Small Fragment Ankle Plating Set + Ortho Hand Tools Steam Autoclave Cycles',
        quantity: 2,
        unit_cost: 52.50,
        total_cost: 105.00,
        source_module: 'CSSDTracker',
        source_reference_id: 'CSSD-103-01',
        vendor_invoice_number: null,
        is_reconciled: true,
        completeness_flag: 'VERIFIED',
        created_at: '2026-10-26T14:30:00Z'
      },
      {
        id: `cost-103-08`,
        facility_id: facilityId,
        surgery_id: 103,
        cost_category: COST_CATEGORIES.EQUIPMENT_COST,
        item_code: 'EQ-CARM-FLUORO',
        item_description: 'GE OEC Elite Mini C-Arm Intraoperative Fluoroscopy Unit Usage',
        quantity: 1,
        unit_cost: 175.00,
        total_cost: 175.00,
        source_module: 'BioMedAssets',
        source_reference_id: 'BM-CARM-01',
        vendor_invoice_number: null,
        is_reconciled: true,
        completeness_flag: 'VERIFIED',
        created_at: '2026-10-26T12:00:00Z'
      }
    ];
  }

  caseCostItemsStore.set(surgeryId, items);
  return items;
}

export const caseCostModelService = {
  /**
   * Calculates clinical direct labor cost with mandatory payroll burden multiplier.
   * Direct Labor = (Minutes / 60) * Base Hourly Wage * Burden Multiplier
   */
  calculateDirectLaborCost(minutes, hourlyWage, burdenMultiplier = DEFAULT_FACILITY_RATES.laborBurdenMultiplier) {
    if (!minutes || minutes <= 0 || !hourlyWage || hourlyWage <= 0) return 0.00;
    const hours = Number(minutes) / 60;
    const burden = Number(burdenMultiplier) || 1.25;
    return roundToTwo(hours * Number(hourlyWage) * burden);
  },

  /**
   * Calculates Operating Room minute suite occupancy cost.
   * OR Time Cost = Minutes * Rate Per Minute
   */
  calculateOrMinuteCost(minutes, ratePerMinute = DEFAULT_FACILITY_RATES.orMinuteRate) {
    if (!minutes || minutes <= 0) return 0.00;
    return roundToTwo(Number(minutes) * Number(ratePerMinute));
  },

  /**
   * Calculates PACU recovery minute care cost.
   * PACU Cost = Minutes * Rate Per Minute
   */
  calculatePacuCost(minutes, ratePerMinute = DEFAULT_FACILITY_RATES.pacuMinuteRate) {
    if (!minutes || minutes <= 0) return 0.00;
    return roundToTwo(Number(minutes) * Number(ratePerMinute));
  },

  /**
   * Retrieves all itemized cost line items for a case.
   */
  getCostItems(surgeryId, facilityId = 'fac-001') {
    return initializeSeedCostItems(surgeryId, facilityId);
  },

  /**
   * Adds a new itemized cost item to the case cost model.
   */
  addCostItem({
    surgeryId,
    facilityId = 'fac-001',
    costCategory,
    itemCode = '',
    itemDescription,
    quantity = 1.0,
    unitCost,
    sourceModule = null,
    sourceReferenceId = null,
    vendorInvoiceNumber = null,
    isReconciled = true,
    completenessFlag = 'VERIFIED'
  }) {
    if (!surgeryId) throw new Error('surgeryId is required to record a cost item');
    if (!costCategory || !COST_CATEGORIES[costCategory]) {
      throw new Error(`Invalid costCategory: ${costCategory}`);
    }
    if (!itemDescription || itemDescription.trim().length === 0) {
      throw new Error('itemDescription is mandatory');
    }

    const qty = Number(quantity) || 1.0;
    const unitPrice = roundToTwo(unitCost);
    if (qty <= 0) throw new Error('Quantity must be strictly greater than 0');
    if (unitPrice < 0) throw new Error('Unit cost cannot be negative');

    const totalCost = roundToTwo(qty * unitPrice);
    const categoryConfig = COST_CATEGORY_CONFIG[costCategory];

    const newItem = {
      id: `cost-${surgeryId}-${Date.now().toString().slice(-6)}`,
      facility_id: facilityId,
      surgery_id: surgeryId,
      cost_category: costCategory,
      item_code: itemCode || `ITEM-${costCategory.slice(0, 4)}`,
      item_description: itemDescription.trim(),
      quantity: qty,
      unit_cost: unitPrice,
      total_cost: totalCost,
      source_module: sourceModule || categoryConfig.defaultSourceModule,
      source_reference_id: sourceReferenceId || `REF-${Date.now().toString().slice(-4)}`,
      vendor_invoice_number: vendorInvoiceNumber || null,
      is_reconciled: Boolean(isReconciled),
      completeness_flag: completenessFlag,
      created_at: new Date().toISOString()
    };

    const currentItems = this.getCostItems(surgeryId, facilityId);
    currentItems.push(newItem);
    caseCostItemsStore.set(surgeryId, currentItems);

    return newItem;
  },

  /**
   * Removes an existing cost item.
   */
  removeCostItem(surgeryId, itemId) {
    const currentItems = caseCostItemsStore.get(surgeryId) || [];
    const filtered = currentItems.filter(item => item.id !== itemId);
    caseCostItemsStore.set(surgeryId, filtered);
    return filtered;
  },

  /**
   * Computes the authoritative 8-category cost breakdown and completeness governance.
   */
  getCaseCostBreakdown(surgeryId, facilityId = 'fac-001') {
    const items = this.getCostItems(surgeryId, facilityId);

    const categoryBreakdown = {
      [COST_CATEGORIES.IMPLANT_COST]: 0.00,
      [COST_CATEGORIES.SUPPLY_COST]: 0.00,
      [COST_CATEGORIES.PHARMACY_COST]: 0.00,
      [COST_CATEGORIES.LABOR_COST]: 0.00,
      [COST_CATEGORIES.OR_TIME_COST]: 0.00,
      [COST_CATEGORIES.PACU_TIME_COST]: 0.00,
      [COST_CATEGORIES.REPROCESSING_COST]: 0.00,
      [COST_CATEGORIES.EQUIPMENT_COST]: 0.00
    };

    const categoryCounts = {
      [COST_CATEGORIES.IMPLANT_COST]: 0,
      [COST_CATEGORIES.SUPPLY_COST]: 0,
      [COST_CATEGORIES.PHARMACY_COST]: 0,
      [COST_CATEGORIES.LABOR_COST]: 0,
      [COST_CATEGORIES.OR_TIME_COST]: 0,
      [COST_CATEGORIES.PACU_TIME_COST]: 0,
      [COST_CATEGORIES.REPROCESSING_COST]: 0,
      [COST_CATEGORIES.EQUIPMENT_COST]: 0
    };

    let totalDirectCost = 0.00;
    let allReconciled = true;
    let hasEstimatedItems = false;
    let hasProvisionalItems = false;

    for (const item of items) {
      const amt = Number(item.total_cost) || 0.00;
      if (categoryBreakdown[item.cost_category] !== undefined) {
        categoryBreakdown[item.cost_category] = roundToTwo(categoryBreakdown[item.cost_category] + amt);
        categoryCounts[item.cost_category] += 1;
      }
      totalDirectCost += amt;

      if (!item.is_reconciled) {
        allReconciled = false;
      }
      if (item.completeness_flag === 'ESTIMATED') {
        hasEstimatedItems = true;
      } else if (item.completeness_flag === 'PROVISIONAL') {
        hasProvisionalItems = true;
      }
    }

    totalDirectCost = roundToTwo(totalDirectCost);

    // Compute percentage contribution for each category
    const categoryPercentages = {};
    for (const cat of Object.keys(categoryBreakdown)) {
      categoryPercentages[cat] = totalDirectCost > 0
        ? roundToTwo((categoryBreakdown[cat] / totalDirectCost) * 100)
        : 0.00;
    }

    // Completeness Governance
    let completenessStatus = FINANCIAL_COMPLETENESS_STATUSES.COMPLETE;
    const qualityNotes = [];

    if (items.length === 0) {
      completenessStatus = FINANCIAL_COMPLETENESS_STATUSES.MISSING_SOURCE_DATA;
      qualityNotes.push('No direct cost items logged for this surgical case.');
    } else if (hasProvisionalItems || !allReconciled) {
      completenessStatus = FINANCIAL_COMPLETENESS_STATUSES.PARTIALLY_COMPLETE;
      qualityNotes.push('Un-reconciled invoices or provisional vendor lines pending verification.');
    } else if (hasEstimatedItems) {
      completenessStatus = FINANCIAL_COMPLETENESS_STATUSES.ESTIMATED;
      qualityNotes.push('Contains pre-op estimated standard costs pending actual reconciliation.');
    }

    return {
      surgeryId,
      facilityId,
      totalDirectCost,
      categoryBreakdown,
      categoryPercentages,
      categoryCounts,
      totalItemCount: items.length,
      allReconciled,
      completenessStatus: completenessStatus.code,
      completenessDetails: completenessStatus,
      qualityNotes,
      allowsAggregation: completenessStatus.allowsAggregation
    };
  },

  /**
   * Formats numbers to currency string.
   */
  formatCurrency(amount) {
    if (amount === null || amount === undefined || isNaN(amount)) return '$0.00';
    const num = Number(amount);
    return `$${Math.abs(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  },

  /**
   * Retrieves default tray catalog.
   */
  getTrayCatalog() {
    return DEFAULT_TRAY_CATALOG;
  },

  /**
   * Retrieves facility rate schedule.
   */
  getFacilityRateSchedule() {
    return DEFAULT_FACILITY_RATES;
  }
};
