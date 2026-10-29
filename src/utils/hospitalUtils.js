// Helper to compare dates consistently as "YYYY-MM-DD" strings to avoid timezone shifts
export const isDateInRange = (dateStr, startStr, endStr) => {
    if (!dateStr) return false;

    const normalize = (d) => {
        if (!d) return '';
        if (d instanceof Date) return formatDateLocal(d);
        if (d.includes('T')) return d.split('T')[0];
        // Handle MM/DD/YYYY
        if (d.includes('/')) {
            const parts = d.split('/');
            if (parts.length === 3) {
                const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
                return `${year}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
            }
        }
        return d;
    };

    const d = normalize(dateStr);
    const s = normalize(startStr);
    const e = normalize(endStr);

    return d >= s && d <= e;
};

// Format Date object to YYYY-MM-DD in local time
export const formatDateLocal = (date) => {
    if (!date || isNaN(date.getTime())) return '';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

// Normalize any date string to YYYY-MM-DD
export const normalizeDate = (dateStr) => {
    if (!dateStr) return '';
    if (dateStr instanceof Date) return formatDateLocal(dateStr);
    if (dateStr.includes('T')) return dateStr.split('T')[0];
    if (dateStr.includes('/')) {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
            const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
            return `${year}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
        }
    }
    return dateStr;
};

// Utility function to format surgeon name as "Dr. LastName FirstName"
export const formatSurgeonName = (surgeon) => {
    if (!surgeon) return 'Unknown';

    // Handle both new format (firstname, lastname) and old format (name)
    if (surgeon.firstname && surgeon.lastname) {
        return `Dr. ${surgeon.lastname} ${surgeon.firstname}`;
    } else if (surgeon.first_name && surgeon.last_name) {
        return `Dr. ${surgeon.last_name} ${surgeon.first_name}`;
    } else if (surgeon.name) {
        // Fallback for old format - try to parse
        const nameParts = surgeon.name.replace(/^Dr\.?\s*/i, '').trim().split(' ');
        if (nameParts.length >= 2) {
            const firstName = nameParts[0];
            const lastName = nameParts.slice(1).join(' ');
            return `Dr. ${lastName} ${firstName}`;
        }
        return surgeon.name.startsWith('Dr.') ? surgeon.name : `Dr. ${surgeon.name}`;
    }

    return 'Unknown';
};

// Calculate OR cost based on duration
// Calculate OR cost based on duration
export const calculateORCost = (durationMinutes) => {
    if (!durationMinutes || durationMinutes <= 0) return 0;

    if (durationMinutes <= 60) {
        // Proportional rate for first hour: $1500 / 60 min = $25 per minute
        // 15 min = $375
        // 30 min = $750
        // 45 min = $1125
        // 60 min = $1500
        return durationMinutes * 25;
    }

    // Base rate for first full hour
    let cost = 1500;

    // Remaining minutes after first hour
    let remainingMinutes = durationMinutes - 60;

    // Next 60 minutes (up to 2 hours total): $300 for each additional 30 minutes
    // This means 61-90 mins = +$300, 91-120 mins = +$600
    const secondHourMinutes = Math.min(remainingMinutes, 60);
    const secondHourBlocks = Math.ceil(secondHourMinutes / 30);
    cost += secondHourBlocks * 300;

    remainingMinutes -= secondHourMinutes;

    if (remainingMinutes > 0) {
        // After 2 hours: $400 for each additional 30 minutes
        const additionalBlocks = Math.ceil(remainingMinutes / 30);
        cost += additionalBlocks * 400;
    }

    return cost;
};

// Calculate Medicare revenue with MPPR (Multiple Procedure Payment Reduction)
// Pays 100% for highest-value code, 50% for eligible subsequent surgical codes.
// Add-on codes (+) are exempt (100%), and device-intensive codes protect the device offset.
// Calculate Medicare revenue with MPPR (Multiple Procedure Payment Reduction)
// Supports both string CPT arrays ['29881'] and normalized line objects [{ code: '29881', units: 1, modifiers: ['RT'] }]
// Pays 100% for highest-value code, 50% for eligible subsequent surgical codes.
// Add-on codes (+) are exempt (100%), bilateral modifier 50 receives 150%, and device-intensive codes protect device offset.
export const calculateMedicareRevenue = (cptCodesArray, cptDatabase, applyMPPR = false, options = {}) => {
    if (!cptCodesArray || cptCodesArray.length === 0) return 0;

    // Parse input into normalized line items (supporting both string codes and full objects)
    const normalizedLines = cptCodesArray.map(item => {
        if (typeof item === 'string') {
            return { code: item.trim(), units: 1, modifiers: [], laterality: 'NOT_APPLICABLE' };
        }
        return {
            ...item,
            code: String(item.code || item.cpt_code || '').trim(),
            units: Math.max(1, parseInt(item.units) || 1),
            modifiers: Array.isArray(item.modifiers) ? item.modifiers : (item.modifier_code ? [item.modifier_code] : []),
            laterality: item.laterality || 'NOT_APPLICABLE'
        };
    }).filter(l => Boolean(l.code));

    if (normalizedLines.length === 0) return 0;

    // Get matching CPT catalog objects
    const resolvedLines = normalizedLines.map(line => {
        const catalogItem = (Array.isArray(cptDatabase) && cptDatabase.length > 0)
            ? cptDatabase.find(c => String(c.code) === String(line.code))
            : null;
        const source = catalogItem ? { ...line, ...catalogItem } : line;
        return {
            ...source,
            units: line.units || source.units || 1,
            modifiers: line.modifiers || source.modifiers || [],
            laterality: line.laterality || source.laterality || 'NOT_APPLICABLE'
        };
    }).filter(l => Boolean(l && (l.gross_charge !== undefined || l.reimbursement !== undefined || l.contracted_reimbursement !== undefined)));

    if (resolvedLines.length === 0) return 0;

    // Helper to get base allowable price (Authoritative Reimbursement/Wage-Adjusted Rate prioritized over Gross Charge)
    const getBasePrice = (cpt) => {
        let rawRate = 0;
        if (cpt.wage_adjusted_rate !== undefined && cpt.wage_adjusted_rate !== null) {
            rawRate = parseFloat(cpt.wage_adjusted_rate);
        } else if (cpt.contracted_reimbursement !== undefined && cpt.contracted_reimbursement !== null) {
            rawRate = parseFloat(cpt.contracted_reimbursement);
        } else if (cpt.reimbursement !== undefined && cpt.reimbursement !== null) {
            rawRate = parseFloat(cpt.reimbursement);
        } else if (cpt.gross_charge !== undefined && cpt.gross_charge !== null) {
            rawRate = parseFloat(cpt.gross_charge);
        }
        const isBilateral = (cpt.modifiers && cpt.modifiers.includes('50')) || cpt.laterality === 'BILATERAL';
        return isBilateral ? rawRate * 1.50 : rawRate;
    };

    // If MPPR is disabled, return sum of base price * units
    if (!applyMPPR) {
        return resolvedLines.reduce((sum, cpt) => sum + (getBasePrice(cpt) * cpt.units), 0);
    }

    // Payer scoping: If options specify a commercial or non-Medicare payer, do not apply Medicare MPPR
    const payerType = options?.payerType || options?.payer_type || 'Medicare';
    const isMedicare = ['Medicare', 'Medicare Advantage', 'Medicaid'].some(p => 
        String(payerType).toLowerCase().includes(p.toLowerCase())
    );

    if (!isMedicare && options?.strictPayerCheck) {
        return resolvedLines.reduce((sum, cpt) => sum + (getBasePrice(cpt) * cpt.units), 0);
    }

    // Sort by base price (highest first) for MPPR ranking
    const sortedCpts = [...resolvedLines].sort((a, b) => getBasePrice(b) - getBasePrice(a));

    let totalRevenue = 0;
    let eligibleRank = 1;

    sortedCpts.forEach((cpt) => {
        const price = getBasePrice(cpt);
        const units = Math.max(1, parseInt(cpt.units) || 1);
        const isAncillaryExempt = cpt.payment_indicator === 'Z2' || cpt.payment_indicator === 'K2';
        const isAddOn = String(cpt.code || '').startsWith('+') || Boolean(cpt.is_add_on) || Boolean(cpt.is_mppr_exempt) || isAncillaryExempt;
        const isDeviceIntensive = cpt.payment_indicator === 'J8' || cpt.procedure_indicator === 'J8' || Boolean(cpt.is_device_intensive) || (cpt.device_offset_amount && parseFloat(cpt.device_offset_amount) > 0);
        let deviceOffset = parseFloat(cpt.device_offset_amount || 0);
        if (isDeviceIntensive && (!deviceOffset || deviceOffset <= 0) && price > 0) {
            const pct = parseFloat(cpt.device_offset_percentage || 0.35);
            deviceOffset = Math.round(price * pct * 100) / 100;
        }

        if (isAddOn) {
            // Add-on codes are exempt from reduction across all units
            totalRevenue += price * units;
        } else if (eligibleRank === 1) {
            // First eligible code: 1st unit gets 100%, subsequent units of same line get 50%
            totalRevenue += price + (price * 0.50 * (units - 1));
            eligibleRank++;
        } else {
            // Subsequent eligible codes get 50%
            if (isDeviceIntensive && deviceOffset > 0 && deviceOffset < price) {
                const servicePortion = price - deviceOffset;
                totalRevenue += (deviceOffset + (servicePortion * 0.50)) * units;
            } else {
                totalRevenue += price * 0.50 * units;
            }
            eligibleRank++;
        }
    });

    return totalRevenue;
};

// Calculate labor cost based on duration (Standard: 30% of OR Cost)
export const calculateLaborCost = (durationMinutes) => {
    if (!durationMinutes || durationMinutes <= 0) return 0;

    // Get OR Cost
    const orCost = calculateORCost(durationMinutes);

    // Return 30% of OR Cost
    return orCost * 0.3;
};

// Cosmetic fee calculator based on duration
export const calculateCosmeticFees = (durationMinutes) => {
    // CSC Facility Fee rates
    const facilityRates = {
        30: 750, 60: 1500, 90: 1800, 120: 2100, 150: 2500,
        180: 2900, 210: 3300, 240: 3700, 270: 4100, 300: 4500,
        330: 4900, 360: 5300, 390: 5700, 420: 6100, 480: 6500, 540: 6900
    };

    // Quantum Anesthesia rates
    const anesthesiaRates = {
        30: 600, 60: 750, 90: 900, 120: 1050, 150: 1200,
        180: 1350, 210: 1500, 240: 1650, 270: 1800, 300: 1950,
        330: 2100, 360: 2250, 390: 2400, 420: 2550, 480: 2700, 540: 2850
    };

    // Round up to nearest 30 minutes for fee lookup
    const lookupDuration = Math.ceil(durationMinutes / 30) * 30;

    return {
        facilityFee: facilityRates[lookupDuration] || 0,
        anesthesiaFee: anesthesiaRates[lookupDuration] || 0
    };
};

// Format currency
export const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount);
};

// Calculate all metrics for a surgery consistently across the app
export const getSurgeryMetrics = (surgery, cptCodes, settings = {}, procedureGroupItems = [], billing = []) => {
    const isCosmetic = surgery.payment_model === 'Cosmetic_Fixed' || 
        Boolean(surgery.is_cosmetic) || 
        (surgery.notes && surgery.notes.includes('Fixed Facility Fee Case'));
    const isProbono = surgery.payment_model === 'Pro_Bono' || !!(surgery.is_probono || surgery.isProbono);

    // Prioritize immutable frozen snapshot from Phase 37 migration / billing freeze
    const rawSnap = surgery.surgery_financial_snapshots;
    const snapshot = Array.isArray(rawSnap) ? rawSnap[0] : rawSnap;
    if (snapshot && (surgery.status === 'Completed' || surgery.status === 'Billed')) {
        const frozenRevenue = parseFloat(snapshot.expected_reimbursement || snapshot.gross_revenue || surgery.expected_reimbursement || 0);
        const frozenNetMargin = parseFloat(snapshot.net_margin || 0);
        const frozenLabor = parseFloat(snapshot.labor_cost || surgery.actual_labor_cost || 0);
        const frozenRoom = parseFloat(snapshot.room_cost || surgery.actual_room_cost || 0);
        const frozenSupplies = parseFloat(snapshot.supplies_cost || surgery.supplies_cost || 0);
        const frozenAnesthesia = parseFloat(snapshot.anesthesia_cost || 0);
        const writeOff = parseFloat(snapshot.write_off_amount || surgery.write_off || surgery.writeOff || 0);

        return {
            cptRevenue: frozenRevenue,
            facilityRevenue: 0,
            anesthesiaRevenue: frozenAnesthesia,
            totalRevenue: frozenRevenue,
            netProfit: frozenNetMargin,
            supplyCosts: frozenSupplies,
            internalRoomCost: frozenRoom,
            laborCost: frozenLabor,
            writeOff,
            isCosmetic,
            isProbono,
            isFrozenSnapshot: true
        };
    }

    let cptTotal = 0;
    let orCost = 0; // Billable Facility Fee
    let internalRoomCost;
    let laborCost;
    let totalValue;
    let netProfit;
    let anesthesiaRevenue = 0;
    const writeOff = parseFloat(surgery.write_off || surgery.writeOff || 0);

    // 1. Calculate Supply Costs with fallback for old records
    let supplyCosts = (parseFloat(surgery.supplies_cost) || 0) +
        (parseFloat(surgery.implants_cost) || 0) +
        (parseFloat(surgery.medications_cost) || 0);

    // Fallback: If no supplies cost but CPT codes exist, try to infer from procedure group
    if (supplyCosts === 0 && !isCosmetic && surgery.cpt_codes && surgery.cpt_codes.length > 0) {
        let inferedGroup = '';
        for (const code of surgery.cpt_codes) {
            const cpt = cptCodes.find(c => String(c.code) === String(code));
            if (cpt && cpt.procedure_group) {
                inferedGroup = cpt.procedure_group;
                break;
            }
        }
        if (inferedGroup && procedureGroupItems.length > 0) {
            const groupItems = procedureGroupItems.filter(i => i.procedure_group === inferedGroup);
            supplyCosts = groupItems.reduce((sum, item) => sum + (parseFloat(item.unit_price || 0) * parseFloat(item.quantity_per_case || 0)), 0);
        }
    }

    const duration = parseInt(surgery.actual_duration_minutes || surgery.duration_minutes || surgery.durationMinutes || 0);
    const turnover = parseInt(surgery.turnover_time || surgery.turnoverTime || 0);

    if (isCosmetic) {
        // Priority 1: Read structured numeric columns from Migration 009
        let facilityFee = parseFloat(surgery.cosmetic_facility_fee || 0);
        let anesthesiaFee = parseFloat(surgery.cosmetic_anesthesia_fee || 0);

        // Priority 2: Fallback to regex parsing on surgery.notes for historical legacy records
        if (facilityFee === 0 && anesthesiaFee === 0 && surgery.notes) {
            const facilityMatch = surgery.notes.match(/(?:Facility|Cosmetic|CSC|Faculty)(?:\s+Fee)?:\s*\$?\s*([\d,.]+)/i);
            const anesthesiaMatch = surgery.notes.match(/(?:Anesthesia|Quantum)(?:\s+Fee)?:\s*\$?\s*([\d,.]+)/i);
            facilityFee = facilityMatch ? parseFloat(facilityMatch[1].replace(/,/g, '')) : 0;
            anesthesiaFee = anesthesiaMatch ? parseFloat(anesthesiaMatch[1].replace(/,/g, '')) : 0;
        }

        // Priority 3: Fallback to piecewise duration defaults if still zero
        if (facilityFee === 0 && anesthesiaFee === 0) {
            const defaults = calculateCosmeticFees(duration);
            facilityFee = defaults.facilityFee;
            anesthesiaFee = defaults.anesthesiaFee;
        }

        orCost = facilityFee;
        anesthesiaRevenue = anesthesiaFee;
        
        // Even for cosmetic, calculate internal costs to track true efficiency
        internalRoomCost = calculateORCost(duration + turnover);
        laborCost = calculateLaborCost(duration + turnover);
        
        totalValue = (facilityFee + anesthesiaRevenue + supplyCosts) - writeOff;
        
        // If pro-bono, everything is zeroed out
        if (isProbono) {
            totalValue = 0;
            internalRoomCost = 0;
            laborCost = 0;
            supplyCosts = 0;
            anesthesiaRevenue = 0;
        }

        // Actual margin is Revenue minus all costs (including internal room/labor)
        netProfit = totalValue - (internalRoomCost + laborCost + supplyCosts + anesthesiaRevenue);
    } else {
        const payerType = surgery.patients?.payer_type || surgery.patients?.insurance_type || surgery.payer_type || surgery.insurance_provider || 'Medicare';
        cptTotal = calculateMedicareRevenue(
            surgery.cpt_codes || surgery.cptCodes || [], 
            cptCodes, 
            Boolean(settings?.apply_medicare_mppr),
            { payerType }
        );
        internalRoomCost = calculateORCost(duration + turnover); // Full room usage cost

        // Check structured self-pay anesthesia fee, fallback to notes regex
        if (parseFloat(surgery.self_pay_anesthesia_fee || 0) > 0) {
            anesthesiaRevenue = parseFloat(surgery.self_pay_anesthesia_fee);
        } else if (surgery.notes && surgery.notes.includes('Self-Pay Anesthesia')) {
            const match = surgery.notes.match(/Self-Pay Anesthesia(?: \(([^)]+)\))?:?\s*\$?\s*([\d,]+)/i);
            if (match) {
                anesthesiaRevenue = parseFloat(match[2].replace(/,/g, ''));
            }
        }
        laborCost = calculateLaborCost(duration + turnover);

        // For non-cosmetic (Insurance), revenue is the CPT reimbursement + pass-throughs
        // We DO NOT add a theoretical 'orCost' facility fee on top of CPTs
        totalValue = (cptTotal + anesthesiaRevenue + supplyCosts) - writeOff;

        // If pro-bono, everything is zeroed out
        if (isProbono) {
            totalValue = 0;
            internalRoomCost = 0;
            laborCost = 0;
            supplyCosts = 0;
            anesthesiaRevenue = 0;
        }

        // Anesthesia and supplies are pass-through costs
        netProfit = totalValue - (internalRoomCost + laborCost + supplyCosts + anesthesiaRevenue);
    }

    // Unification: Match with actual billing record to enforce Net Profit = Actual Billing Cost
    const caseBilling = Array.isArray(billing) ? billing.find(b => b.surgery_id === surgery.id) : null;
    const actualBillingCost = caseBilling ? parseFloat(caseBilling.total_amount || 0) : null;

    if (actualBillingCost !== null) {
        totalValue = actualBillingCost;
        netProfit = actualBillingCost - (internalRoomCost + laborCost + supplyCosts + anesthesiaRevenue);
    }

    return {
        cptRevenue: cptTotal,
        facilityRevenue: orCost,
        anesthesiaRevenue: anesthesiaRevenue,
        totalRevenue: totalValue,
        netProfit,
        supplyCosts,
        internalRoomCost,
        laborCost,
        writeOff,
        isCosmetic,
        isProbono
    };
};
/**
 * Redacts PHI (Protected Health Information) from strings or objects
 * @param {string|object} data The data to redact
 * @returns {string|object} The redacted data
 */
export const redactPHI = (data) => {
    if (typeof data === 'string') {
        // Simple regex-based redaction for names and common patterns could go here, 
        // but it's safer to redact specific fields in objects.
        return data;
    }

    if (Array.isArray(data)) {
        return data.map(item => redactPHI(item));
    }

    if (typeof data === 'object' && data !== null) {
        const redacted = { ...data };
        const phiFields = ['name', 'firstname', 'lastname', 'dob', 'mrn', 'address', 'phone', 'email', 'ssn', 'insurance_id'];
        
        phiFields.forEach(field => {
            if (redacted[field]) {
                if (field === 'name' || field === 'firstname' || field === 'lastname') {
                    // "John Doe" -> "J*** D***"
                    const parts = String(redacted[field]).split(' ');
                    redacted[field] = parts.map(p => p.charAt(0) + '***').join(' ');
                } else {
                    redacted[field] = '***REDACTED***';
                }
            }
        });
        return redacted;
    }

    return data;
};

// ==============================================================================
// PHASE 44: CPT MODIFIERS, UNITS & LATERALITY DETERMINISTIC RULES
// ==============================================================================

export const CANONICAL_ASC_MODIFIERS = [
    { code: '50', name: 'Bilateral Procedure', category: 'bilateral', description: 'Bilateral procedure in same operative session (150% allowable)' },
    { code: 'RT', name: 'Right Side', category: 'anatomical', description: 'Right side of paired anatomical structure' },
    { code: 'LT', name: 'Left Side', category: 'anatomical', description: 'Left side of paired anatomical structure' },
    { code: '59', name: 'Distinct Procedural Service', category: 'distinct_service', description: 'Procedure distinct/independent from other services on same day' },
    { code: 'XS', name: 'Separate Structure', category: 'distinct_service', description: 'Service performed on a separate organ or incision' },
    { code: 'XE', name: 'Separate Encounter', category: 'distinct_service', description: 'Service performed during a distinct operative encounter on same day' },
    { code: 'XP', name: 'Separate Practitioner', category: 'distinct_service', description: 'Service performed by a different performing physician' },
    { code: 'XU', name: 'Unusual Non-Overlapping', category: 'distinct_service', description: 'Service that does not overlap usual components of main service' },
    { code: '51', name: 'Multiple Procedures', category: 'informational', description: 'Multiple procedures; informational in Medicare ASC' },
    { code: '52', name: 'Reduced Services', category: 'discontinued', description: 'Procedural service reduced or eliminated' },
    { code: '58', name: 'Staged Procedure', category: 'staged', description: 'Staged or related procedure during postoperative period' },
    { code: '73', name: 'Discontinued Prior to Anesthesia', category: 'discontinued', description: 'Discontinued prior to anesthesia administration (50% facility fee)' },
    { code: '74', name: 'Discontinued After Anesthesia', category: 'discontinued', description: 'Discontinued after anesthesia administration (100% facility fee)' },
    { code: '76', name: 'Repeat Procedure Same MD', category: 'repeat', description: 'Repeat procedure by same performing provider on same day' },
    { code: '77', name: 'Repeat Procedure Other MD', category: 'repeat', description: 'Repeat procedure by different performing provider on same day' },
    { code: '78', name: 'Unplanned Return to OR', category: 'staged', description: 'Unplanned return to OR for related procedure during post-op period' },
    { code: '79', name: 'Unrelated Procedure Post-Op', category: 'staged', description: 'Unrelated procedure by same physician during post-op period' }
];

export const INCOMPATIBLE_MODIFIER_PAIRS = [
    { a: 'RT', b: 'LT', message: 'Modifiers RT and LT cannot appear on the same procedure line.' },
    { a: '50', b: 'RT', message: 'Modifier 50 represents bilateral service and cannot combine with unilateral modifier RT.' },
    { a: '50', b: 'LT', message: 'Modifier 50 represents bilateral service and cannot combine with unilateral modifier LT.' },
    { a: '73', b: '74', message: 'Modifiers 73 and 74 are mutually exclusive. A procedure cannot be discontinued both prior to (73) and after (74) anesthesia.' },
    { a: '73', b: '50', message: 'Modifier 73 cannot be billed with bilateral modifier 50.' },
    { a: '76', b: '77', message: 'Modifiers 76 and 77 are mutually exclusive. Repeat procedure cannot be reported simultaneously by same (76) and other (77) physician.' },
    { a: '59', b: 'XE', message: 'Modifier 59 is redundant when specific subset XE is reported.' },
    { a: '59', b: 'XS', message: 'Modifier 59 is redundant when specific subset XS is reported.' },
    { a: '59', b: 'XP', message: 'Modifier 59 is redundant when specific subset XP is reported.' },
    { a: '59', b: 'XU', message: 'Modifier 59 is redundant when specific subset XU is reported.' }
];

const PAIRED_ANATOMY_KEYWORDS = ['knee', 'shoulder', 'eye', 'ear', 'hip', 'wrist', 'elbow', 'hand', 'foot', 'breast', 'ankle', 'finger', 'toe', 'cataract', 'carpal', 'rotator'];
const MIDLINE_ANATOMY_KEYWORDS = ['colon', 'spine', 'stomach', 'gallbladder', 'appendix', 'endoscopy', 'liver', 'rectum', 'esophagus', 'throat', 'tongue', 'tonsil', 'back'];

/**
 * Validates a single procedure line against Phase 44 deterministic rules
 */
export const validateProcedureLineClient = (line, allLines = [], cptCatalog = []) => {
    const errors = [];
    const warnings = [];

    if (!line) {
        return { isValid: false, status: 'error', errors: [{ code: 'REQ-001', message: 'Procedure line is required' }], warnings: [] };
    }

    const codeStr = String(line.code || '');
    const units = parseInt(line.units, 10) || 1;
    const modifiers = Array.isArray(line.modifiers) ? line.modifiers : [];
    const laterality = String(line.laterality || 'NOT_APPLICABLE').toUpperCase();

    // Catalog lookup for anatomical context
    const catalogItem = cptCatalog.find(c => String(c.code) === codeStr) || {};
    const descriptor = String(catalogItem.description || line.description || '').toLowerCase();
    const bodyPart = String(catalogItem.body_part || line.body_part || '').toLowerCase();
    const combinedText = `${descriptor} ${bodyPart}`;

    const isPaired = PAIRED_ANATOMY_KEYWORDS.some(k => combinedText.includes(k));
    const isMidline = !isPaired && MIDLINE_ANATOMY_KEYWORDS.some(k => combinedText.includes(k));

    // LAT-001: Midline structure marked with laterality
    if (isMidline && ['LEFT', 'RIGHT', 'BILATERAL'].includes(laterality)) {
        errors.push({
            code: 'LAT-001',
            message: `Laterality is not applicable to midline procedure "${catalogItem.description || codeStr}". Must be NOT_APPLICABLE.`
        });
    }

    // LAT-002: Paired structure marked NOT_APPLICABLE
    if (isPaired && laterality === 'NOT_APPLICABLE') {
        errors.push({
            code: 'LAT-002',
            message: `Paired anatomical procedure "${catalogItem.description || codeStr}" requires specific laterality (LEFT, RIGHT, or BILATERAL).`
        });
    }

    // Modifiers vs Laterality Alignment
    if (modifiers.includes('RT') && ['LEFT', 'BILATERAL'].includes(laterality)) {
        errors.push({ code: 'LAT-004', message: 'Modifier RT contradicts assigned laterality.' });
    }
    if (modifiers.includes('LT') && ['RIGHT', 'BILATERAL'].includes(laterality)) {
        errors.push({ code: 'LAT-005', message: 'Modifier LT contradicts assigned laterality.' });
    }
    if (modifiers.includes('50') && laterality !== 'BILATERAL') {
        errors.push({ code: 'LAT-006', message: 'Modifier 50 requires laterality to be BILATERAL.' });
    }

    // BILAT-001: Modifier 50 with units > 1
    if (modifiers.includes('50') && units > 1) {
        errors.push({
            code: 'BILAT-001',
            message: 'Modifier 50 requires units = 1. Doubled units with modifier 50 cause improper 300% billing inflation.'
        });
    }

    // Inherently bilateral descriptor check (e.g., bilateral oophorectomy, screening)
    if (descriptor.includes('bilateral') && !descriptor.includes('unilateral or bilateral')) {
        if (modifiers.includes('50')) {
            errors.push({
                code: 'BILAT-002',
                message: `CPT code ${codeStr} is inherently bilateral. Modifier 50 is prohibited.`
            });
        }
    }

    // Maximum 4 modifiers (EDI 837P loop 2400 SV101 limit)
    if (modifiers.length > 4) {
        errors.push({ code: 'MOD-006', message: 'Exceeds maximum of 4 modifiers per procedure line.' });
    }

    // Mutually exclusive modifier pairs
    INCOMPATIBLE_MODIFIER_PAIRS.forEach(({ a, b, message }) => {
        if (modifiers.includes(a) && modifiers.includes(b)) {
            errors.push({ code: 'MOD-CONFLICT', message });
        }
    });

    // MUE Limits Check
    const mueValue = parseInt(catalogItem.mue_value || line.mue_value, 10) || 1;
    if (units > mueValue && mueValue > 0) {
        warnings.push({
            code: 'MUE-002',
            message: `Units (${units}) exceed standard CMS MUE cap (${mueValue}) for CPT ${codeStr}. Requires clinical review.`
        });
    }

    // Duplicate Line Detection
    if (allLines.length > 1) {
        const matchingLines = allLines.filter(l => String(l.code) === codeStr);
        if (matchingLines.length > 1) {
            const hasDistinctLaterality = matchingLines.some(l => (l.modifiers || []).includes('RT')) && matchingLines.some(l => (l.modifiers || []).includes('LT'));
            const hasRepeatMod = modifiers.includes('76') || modifiers.includes('77');
            if (!hasDistinctLaterality && !hasRepeatMod) {
                errors.push({
                    code: 'DUP-001',
                    message: `Duplicate CPT code ${codeStr} on encounter requires repeat modifier (76/77) or distinct laterality (RT/LT).`
                });
            }
        }
    }

    const isValid = errors.length === 0;
    const status = errors.length > 0 ? 'error' : (warnings.length > 0 ? 'warning' : 'valid');

    return { isValid, status, errors, warnings };
};

/**
 * Authoritative ASC Revenue Calculation (Phase 44 Production Logic)
 * Enforces 150% single-line bilateral rule, discontinued procedure adjustments, and MPPR.
 */
export const calculateAuthoritativeAscRevenue = (procedureLines, cptDatabase = [], options = {}) => {
    if (!Array.isArray(procedureLines) || procedureLines.length === 0) return 0;

    const resolvedLines = procedureLines.map(line => {
        const item = typeof line === 'string' ? { code: line.trim() } : line;
        const catalogItem = cptDatabase.find(c => String(c.code) === String(item.code));
        return {
            ...catalogItem,
            ...item,
            units: Math.max(1, parseInt(item.units, 10) || 1),
            modifiers: Array.isArray(item.modifiers) ? item.modifiers : [],
            laterality: item.laterality || 'NOT_APPLICABLE'
        };
    });

    const applyMPPR = options.applyMPPR !== false;
    let totalRevenue = 0;

    // Helper to compute line base price with bilateral and discontinued modifiers
    const getAdjustedLinePrice = (line) => {
        const rawRate = parseFloat(line.gross_charge !== undefined ? line.gross_charge : (line.contracted_reimbursement !== undefined ? line.contracted_reimbursement : (line.reimbursement || 0)));
        const isBilateral = (line.modifiers && line.modifiers.includes('50')) || line.laterality === 'BILATERAL';
        const isDiscontinuedPre = line.modifiers && line.modifiers.includes('73');

        if (isDiscontinuedPre) {
            return rawRate * 0.50; // Modifier 73: 50% facility fee
        }
        if (isBilateral) {
            return rawRate * 1.50; // Modifier 50: 150% allowable
        }
        return rawRate;
    };

    if (!applyMPPR) {
        return resolvedLines.reduce((sum, line) => {
            const price = getAdjustedLinePrice(line);
            const isBilateral = (line.modifiers && line.modifiers.includes('50')) || line.laterality === 'BILATERAL';
            // Under statutory single-line bilateral billing, 150% applies to 1 unit
            const effectiveUnits = isBilateral ? 1 : line.units;
            return sum + (price * effectiveUnits);
        }, 0);
    }

    // Sort by adjusted line price descending for MPPR ranking
    const sortedLines = [...resolvedLines].sort((a, b) => getAdjustedLinePrice(b) - getAdjustedLinePrice(a));
    let eligibleRank = 1;

    sortedLines.forEach(line => {
        const price = getAdjustedLinePrice(line);
        const isBilateral = (line.modifiers && line.modifiers.includes('50')) || line.laterality === 'BILATERAL';
        const effectiveUnits = isBilateral ? 1 : line.units;
        const isAddOn = String(line.code || '').startsWith('+') || Boolean(line.is_add_on) || Boolean(line.is_mppr_exempt);

        if (isAddOn) {
            totalRevenue += price * effectiveUnits;
        } else if (eligibleRank === 1) {
            // Rank 1 gets 100% on first unit, 50% on subsequent units
            totalRevenue += price + (price * 0.50 * (effectiveUnits - 1));
            eligibleRank++;
        } else {
            // Rank 2+ gets 50% under MPPR
            totalRevenue += price * 0.50 * effectiveUnits;
            eligibleRank++;
        }
    });

    return Math.round(totalRevenue * 100) / 100;
};

