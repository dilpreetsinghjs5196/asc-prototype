/**
 * Phase 64: Multiple Procedure Payment Rules (MPPR) Client Service
 * Statutory Authorities: 42 CFR § 416.171-172, CMS Pub 100-04 Ch. 14 § 40.5
 * Deterministic multi-line sequencing, ranking, device offset protection, and endoscopy base-code deductions.
 */

import { supabase, db } from './supabase.js';
import { medicareDeviceService } from './medicareDeviceService.js';

export const DEFAULT_MPPR_RULE_SETS = [
  {
    id: '30000000-0000-0000-0000-000000000001',
    rule_set_code: 'MEDICARE_ASC_416_172',
    name: 'Medicare ASC Statutory Reduction (42 CFR § 416.172)',
    payment_system: 'Medicare_ASC',
    ranking_metric: 'ALLOWABLE_DESC',
    protect_device_offset: true,
    exempt_add_on_codes: true,
    exempt_ancillary_codes: true,
    tiers: [
      { tier_rank: 1, multiplier_percentage: 1.0000, description: 'Primary surgical procedure paid at 100%' },
      { tier_rank: 2, multiplier_percentage: 0.5000, description: 'Secondary surgical procedure paid at 50% service portion' }
    ]
  },
  {
    id: '30000000-0000-0000-0000-000000000002',
    rule_set_code: 'COM_STD_CASCADE',
    name: 'Commercial Standard 100/50/25/0 Cascade',
    payment_system: 'Commercial',
    ranking_metric: 'ALLOWABLE_DESC',
    protect_device_offset: false,
    exempt_add_on_codes: true,
    exempt_ancillary_codes: true,
    tiers: [
      { tier_rank: 1, multiplier_percentage: 1.0000, description: 'Rank 1 paid at 100% allowable' },
      { tier_rank: 2, multiplier_percentage: 0.5000, description: 'Rank 2 paid at 50% allowable' },
      { tier_rank: 3, multiplier_percentage: 0.2500, description: 'Rank 3 paid at 25% allowable' },
      { tier_rank: 4, multiplier_percentage: 0.0000, description: 'Rank 4+ bundled / $0.00 allowable' }
    ]
  },
  {
    id: '30000000-0000-0000-0000-000000000003',
    rule_set_code: 'COM_SYM_50',
    name: 'Commercial Symmetric 100/50/50/50 Cascade',
    payment_system: 'Commercial',
    ranking_metric: 'ALLOWABLE_DESC',
    protect_device_offset: false,
    exempt_add_on_codes: true,
    exempt_ancillary_codes: true,
    tiers: [
      { tier_rank: 1, multiplier_percentage: 1.0000, description: 'Rank 1 paid at 100% allowable' },
      { tier_rank: 2, multiplier_percentage: 0.5000, description: 'Rank 2+ paid at 50% allowable' }
    ]
  }
];

export const CMS_ENDOSCOPY_FAMILIES = [
  { family_id: 15, family_name: 'Lower GI Endoscopy (Colonoscopy)', member_cpt_code: '45378', base_cpt_code: '45378' },
  { family_id: 15, family_name: 'Lower GI Endoscopy (Colonoscopy)', member_cpt_code: '45380', base_cpt_code: '45378' },
  { family_id: 15, family_name: 'Lower GI Endoscopy (Colonoscopy)', member_cpt_code: '45381', base_cpt_code: '45378' },
  { family_id: 15, family_name: 'Lower GI Endoscopy (Colonoscopy)', member_cpt_code: '45384', base_cpt_code: '45378' },
  { family_id: 15, family_name: 'Lower GI Endoscopy (Colonoscopy)', member_cpt_code: '45385', base_cpt_code: '45378' },
  { family_id: 14, family_name: 'Upper GI Endoscopy (EGD)', member_cpt_code: '43235', base_cpt_code: '43235' },
  { family_id: 14, family_name: 'Upper GI Endoscopy (EGD)', member_cpt_code: '43239', base_cpt_code: '43235' },
  { family_id: 14, family_name: 'Upper GI Endoscopy (EGD)', member_cpt_code: '43248', base_cpt_code: '43235' },
  { family_id: 1,  family_name: 'Bronchoscopy', member_cpt_code: '31622', base_cpt_code: '31622' },
  { family_id: 1,  family_name: 'Bronchoscopy', member_cpt_code: '31623', base_cpt_code: '31622' },
  { family_id: 1,  family_name: 'Bronchoscopy', member_cpt_code: '31624', base_cpt_code: '31622' }
];

export const mpprService = {
  /**
   * Deterministic client/server hybrid calculation of multi-line encounter MPPR.
   */
  calculateEncounterMppr({
    procedureLines = [],
    wageIndex = 1.0000,
    ascqrCompliant = true,
    ruleSetCode = 'MEDICARE_ASC_416_172',
    isCommercial = false
  } = {}) {
    if (!Array.isArray(procedureLines) || procedureLines.length === 0) {
      return {
        totalGrossCharges: 0,
        totalUnreducedAllowable: 0,
        totalMpprSavings: 0,
        totalFinalAllowable: 0,
        lines: []
      };
    }

    const ruleSet = DEFAULT_MPPR_RULE_SETS.find(r => r.rule_set_code === ruleSetCode) || DEFAULT_MPPR_RULE_SETS[0];

    // 1. Normalize line items
    const normalized = procedureLines.map((l, idx) => {
      const code = String(l.code || l.cpt_code || '').trim();
      const units = Math.max(1, parseInt(l.units, 10) || 1);
      const modifiers = Array.isArray(l.modifiers) ? l.modifiers : (l.modifier_code ? [l.modifier_code] : []);
      const grossCharge = parseFloat(l.gross_charge || 0);
      const paymentIndicator = l.payment_indicator || l.procedure_indicator || (code.startsWith('C') ? 'N1' : 'A2');
      const nationalRate = parseFloat(l.national_unadjusted_rate || l.wage_adjusted_rate || l.reimbursement || l.contracted_reimbursement || 0);
      const isDeviceIntensive = paymentIndicator === 'J8' || Boolean(l.is_device_intensive) || (l.device_offset_percentage !== undefined && parseFloat(l.device_offset_percentage) > 0);
      const offsetPct = l.device_offset_percentage !== undefined ? parseFloat(l.device_offset_percentage) : (isDeviceIntensive ? 0.3315 : 0);
      const isAddOn = code.startsWith('+') || Boolean(l.is_add_on);
      const isPackaged = paymentIndicator === 'N1' || (code.startsWith('C') && code.length === 5) || Boolean(l.is_packaged);
      const isAncillary = paymentIndicator === 'Z2' || paymentIndicator === 'K2';
      const isBilateral = modifiers.includes('50') || l.laterality === 'BILATERAL';
      const isDiscontinuedPre = modifiers.includes('73');

      // Compute base wage-adjusted allowable and protected device offset
      let deviceOffsetAmount = 0;
      let servicePortionUnadjusted = nationalRate;
      let servicePortionAdjusted = nationalRate;
      let singleUnitAllowable = nationalRate;

      if (isPackaged) {
        singleUnitAllowable = 0;
        servicePortionAdjusted = 0;
      } else if (isDeviceIntensive && nationalRate > 0) {
        const statutory = medicareDeviceService.calculateStatutoryDeviceAdjustment({
          nationalRate,
          offsetPercentage: offsetPct,
          wageIndex,
          ascqrCompliant
        });
        deviceOffsetAmount = statutory.deviceOffsetAmount;
        servicePortionUnadjusted = statutory.servicePortionUnadjusted;
        servicePortionAdjusted = statutory.servicePortionAdjusted;
        singleUnitAllowable = statutory.allowableRate;
      } else if (nationalRate > 0) {
        servicePortionAdjusted = (nationalRate * 0.50 * wageIndex) + (nationalRate * 0.50);
        if (!ascqrCompliant) {
          servicePortionAdjusted = Math.round(servicePortionAdjusted * 0.98 * 100) / 100;
        }
        singleUnitAllowable = Math.round(servicePortionAdjusted * 100) / 100;
      }

      // Pre-ranking Modifier Adjustments
      if (isDiscontinuedPre) {
        singleUnitAllowable = Math.round(singleUnitAllowable * 0.50 * 100) / 100;
        servicePortionAdjusted = Math.round(servicePortionAdjusted * 0.50 * 100) / 100;
      } else if (isBilateral) {
        // Modifier 50 receives 150% allowable on single line
        singleUnitAllowable = Math.round(singleUnitAllowable * 1.50 * 100) / 100;
        servicePortionAdjusted = Math.round(servicePortionAdjusted * 1.50 * 100) / 100;
      }

      return {
        line_number: idx + 1,
        cpt_code: code,
        units,
        modifiers,
        gross_charge: grossCharge,
        payment_indicator: paymentIndicator,
        national_unadjusted_rate: nationalRate,
        device_offset_amount: deviceOffsetAmount,
        service_portion_unadjusted: servicePortionUnadjusted,
        wage_adjusted_service_share: servicePortionAdjusted,
        single_unit_allowable: singleUnitAllowable,
        is_add_on: isAddOn,
        is_packaged: isPackaged,
        is_ancillary: isAncillary,
        is_device_intensive: isDeviceIntensive,
        is_bilateral: isBilateral
      };
    });

    // 2. Separate lines into ranking pool vs exempt/packaged
    // Strict Ranking Invariant: Only procedures with positive allowable enter ranking pool, sorted by Allowable DESC
    const rankingPool = normalized.filter(l => !l.is_packaged && !l.is_add_on && !l.is_ancillary && l.single_unit_allowable > 0);
    rankingPool.sort((a, b) => {
      if (b.single_unit_allowable !== a.single_unit_allowable) {
        return b.single_unit_allowable - a.single_unit_allowable;
      }
      return a.cpt_code.localeCompare(b.cpt_code);
    });

    // Assign rank orders
    rankingPool.forEach((item, rIdx) => {
      item.rank_order = rIdx + 1;
    });

    // 3. Process All Lines with Deterministic Reductions
    let totalGrossCharges = 0;
    let totalUnreducedAllowable = 0;
    let totalFinalAllowable = 0;
    let totalMpprSavings = 0;

    const processedLines = normalized.map(line => {
      totalGrossCharges += line.gross_charge;
      const initialLineAllowable = Math.round(line.single_unit_allowable * line.units * 100) / 100;
      totalUnreducedAllowable += initialLineAllowable;

      let multiplier;
      let reducedServiceShare = line.wage_adjusted_service_share;
      let finalLineAllowable;
      let savings;
      let rationale;

      if (line.is_packaged) {
        multiplier = 0.0000;
        reducedServiceShare = 0;
        finalLineAllowable = 0;
        savings = 0;
        rationale = 'Packaged Item (N1): Bundled into primary surgical APC ($0.00 separate allowable).';
      } else if (line.is_add_on) {
        multiplier = 1.0000;
        reducedServiceShare = line.wage_adjusted_service_share;
        finalLineAllowable = initialLineAllowable;
        savings = 0;
        rationale = 'Add-on code exempt from MPPR reduction (100% allowable).';
      } else if (line.is_bilateral) {
        multiplier = 1.5000;
        reducedServiceShare = line.wage_adjusted_service_share;
        finalLineAllowable = initialLineAllowable;
        savings = 0;
        rationale = 'Bilateral procedure (Modifier 50): Reimbursed at 150% allowable on single line.';
      } else if (line.is_ancillary) {
        multiplier = 1.0000;
        reducedServiceShare = line.wage_adjusted_service_share;
        finalLineAllowable = initialLineAllowable;
        savings = 0;
        rationale = `Covered Ancillary (${line.payment_indicator}): Exempt from surgical MPPR.`;
      } else {
        const rank = line.rank_order || 1;

        if (isCommercial) {
          // Commercial Cascade (e.g. 100/50/25/0)
          const tier = ruleSet.tiers.find(t => t.tier_rank === rank) || { multiplier_percentage: 0.0000 };
          multiplier = tier.multiplier_percentage;
          finalLineAllowable = Math.round(initialLineAllowable * multiplier * 100) / 100;
          savings = Math.round((initialLineAllowable - finalLineAllowable) * 100) / 100;
          rationale = `Commercial Rank ${rank}: Reimbursed at ${(multiplier * 100).toFixed(0)}% per contract cascade.`;
        } else {
          // Medicare ASC Statutory Rules (42 CFR § 416.172)
          if (rank === 1) {
            multiplier = 1.0000;
            if (line.units === 1) {
              finalLineAllowable = line.single_unit_allowable;
              savings = 0;
              rationale = 'Primary Surgical Procedure (Rank 1): Paid at 100% allowable.';
            } else {
              // Unit 1 gets 100%, subsequent units get 50%
              const u1 = line.single_unit_allowable;
              const subUnits = Math.round(line.single_unit_allowable * 0.50 * (line.units - 1) * 100) / 100;
              finalLineAllowable = u1 + subUnits;
              savings = Math.round((initialLineAllowable - finalLineAllowable) * 100) / 100;
              rationale = `Primary Procedure: Unit 1 paid at 100%, remaining ${line.units - 1} units paid at 50%.`;
            }
          } else {
            // Rank 2+ Secondary Surgical Lines
            multiplier = 0.5000;
            if (line.is_device_intensive && line.device_offset_amount > 0) {
              // Statutory J8 Carve-Out Protection: Device offset 100% paid, service portion halved
              reducedServiceShare = Math.round(line.wage_adjusted_service_share * 0.50 * 100) / 100;
              const singleSecondary = Math.round((line.device_offset_amount + reducedServiceShare) * 100) / 100;
              finalLineAllowable = Math.round(singleSecondary * line.units * 100) / 100;
              savings = Math.round((initialLineAllowable - finalLineAllowable) * 100) / 100;
              rationale = `Secondary J8 (Rank ${rank}): Protected Device Offset ($${line.device_offset_amount.toFixed(2)}) at 100% + Service Share at 50%.`;
            } else {
              // Standard Surgical 50% Cut
              reducedServiceShare = Math.round(line.wage_adjusted_service_share * 0.50 * 100) / 100;
              finalLineAllowable = Math.round(line.single_unit_allowable * 0.50 * line.units * 100) / 100;
              savings = Math.round((initialLineAllowable - finalLineAllowable) * 100) / 100;
              rationale = `Secondary Surgical Procedure (Rank ${rank}): Standard 50% MPPR reduction under 42 CFR § 416.172.`;
            }
          }
        }
      }

      totalFinalAllowable += finalLineAllowable;
      totalMpprSavings += savings;

      return {
        line_number: line.line_number,
        cpt_code: line.cpt_code,
        units: line.units,
        modifiers: line.modifiers,
        gross_charge: line.gross_charge,
        payment_indicator: line.payment_indicator,
        national_unadjusted_rate: line.national_unadjusted_rate,
        device_offset_amount: line.device_offset_amount,
        protected_device_offset: line.device_offset_amount,
        unreduced_allowable: initialLineAllowable,
        wage_adjusted_service_share: line.wage_adjusted_service_share,
        rank_order: line.rank_order || 0,
        reduction_multiplier: multiplier,
        multiplier_percentage: multiplier,
        reduced_service_share: reducedServiceShare,
        reduced_service_portion: reducedServiceShare,
        final_line_allowable: finalLineAllowable,
        reduction_discount_amount: savings,
        reduction_rationale: rationale,
        calculation_rationale: rationale
      };
    });

    processedLines.sort((a, b) => {
      if (a.rank_order && b.rank_order) return a.rank_order - b.rank_order;
      if (a.rank_order) return -1;
      if (b.rank_order) return 1;
      return a.line_number - b.line_number;
    });

    return {
      ruleSetCode: ruleSet.rule_set_code,
      ruleSetName: ruleSet.name,
      wageIndex,
      ascqrCompliant,
      totalGrossCharges: Math.round(totalGrossCharges * 100) / 100,
      totalUnreducedAllowable: Math.round(totalUnreducedAllowable * 100) / 100,
      totalMpprSavings: Math.round(totalMpprSavings * 100) / 100,
      totalFinalAllowable: Math.round(totalFinalAllowable * 100) / 100,
      lines: processedLines
    };
  },

  /**
   * Endoscopy Family Base-Code Reimbursement Deduction (42 CFR § 416.172(c))
   */
  calculateEndoscopyFamilyPayment({ primaryRate, secondaryRate, baseCodeRate, memberRate, baseRate }) {
    const member = parseFloat(memberRate !== undefined ? memberRate : (secondaryRate !== undefined ? secondaryRate : 0));
    const base = parseFloat(baseRate !== undefined ? baseRate : (baseCodeRate !== undefined ? baseCodeRate : 0));
    const primary = parseFloat(primaryRate !== undefined ? primaryRate : member);

    const primaryPayment = primary;
    const secondaryPayment = Math.max(0, Math.round((member - base) * 100) / 100);
    const totalPayment = Math.round((primaryPayment + secondaryPayment) * 100) / 100;
    const mpprSavings = Math.round((member - secondaryPayment) * 100) / 100;

    return {
      primaryPayment,
      secondaryPayment,
      finalPayment: secondaryPayment,
      memberPayment: secondaryPayment,
      familyBaseRate: base,
      baseCodeRate: base,
      deductionAmount: base,
      totalPayment,
      mpprSavings,
      formulaDescription: `Endoscopy Family: Primary paid at $${primary.toFixed(2)} (100%) + Secondary difference ($${member.toFixed(2)} - $${base.toFixed(2)} base) = $${secondaryPayment.toFixed(2)} (Total $${totalPayment.toFixed(2)})`
    };
  },

  /**
   * Look up endoscopy family base code for a given CPT code
   */
  lookupEndoscopyBaseCode(cptCode) {
    const code = String(cptCode || '').trim();
    const match = CMS_ENDOSCOPY_FAMILIES.find(f => f.member_cpt_code === code);
    return match ? match.base_cpt_code : null;
  },

  /**
   * Fetch active MPPR Rule Sets from database
   */
  async getRuleSets(facilityId) {
    try {
      if (supabase && typeof supabase.from === 'function') {
        const query = supabase.from('multiple_procedure_rule_sets').select('*');
        if (facilityId) {
          query.or(`facility_id.is.null,facility_id.eq.${facilityId}`);
        }
        const { data, error } = await query;
        if (!error && Array.isArray(data) && data.length > 0) {
          return data;
        }
      }
    } catch (err) {
      console.warn('Fallback to DEFAULT_MPPR_RULE_SETS:', err);
    }
    return DEFAULT_MPPR_RULE_SETS;
  },

  /**
   * Fetch CMS Endoscopy Families from database
   */
  async getEndoscopyFamilies() {
    try {
      if (supabase && typeof supabase.from === 'function') {
        const { data, error } = await supabase.from('cms_endoscopy_families').select('*').order('family_id');
        if (!error && Array.isArray(data) && data.length > 0) {
          return data;
        }
      }
    } catch (err) {
      console.warn('Fallback to CMS_ENDOSCOPY_FAMILIES:', err);
    }
    return CMS_ENDOSCOPY_FAMILIES;
  },

  /**
   * Fetch immutable calculation snapshot by surgery ID
   */
  async getSnapshotBySurgeryId(surgeryId) {
    if (!surgeryId) return null;
    try {
      if (supabase && typeof supabase.from === 'function') {
        const { data, error } = await supabase
          .from('mppr_calculation_snapshots')
          .select('*, mppr_calculation_lines(*)')
          .eq('surgery_id', surgeryId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!error && data) {
          return data;
        }
      }
    } catch (err) {
      console.warn('getSnapshotBySurgeryId fallback:', err);
    }
    return null;
  }
};

// Wire onto db singleton
if (db) {
  db.mpprService = mpprService;
  db.calculateEncounterMppr = mpprService.calculateEncounterMppr.bind(mpprService);
  db.getMpprRuleSets = mpprService.getRuleSets.bind(mpprService);
  db.getEndoscopyFamilies = mpprService.getEndoscopyFamilies.bind(mpprService);
  db.getSnapshotBySurgeryId = mpprService.getSnapshotBySurgeryId.bind(mpprService);
}
