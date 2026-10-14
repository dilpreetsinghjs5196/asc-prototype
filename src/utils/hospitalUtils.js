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
// Pays 100% for highest-value code, 50% for all subsequent codes
export const calculateMedicareRevenue = (cptCodesArray, cptDatabase, applyMPPR = false) => {
    if (!cptCodesArray || cptCodesArray.length === 0) return 0;

    // Get full CPT code objects with reimbursement values
    const cptObjects = cptCodesArray
        .map(code => cptDatabase.find(c => c.code === code))
        .filter(Boolean); // Remove any not found

    if (cptObjects.length === 0) return 0;

    // Helper to get the best price (Gross Charge if available, else Reimbursement)
    const getPrice = (cpt) => {
        // Preference: gross_charge (350% rate requested by user)
        // Fallback: reimbursement (Original Medicare rate)
        return parseFloat(cpt.gross_charge || cpt.reimbursement || 0);
    };

    // If MPPR is disabled, return simple sum
    if (!applyMPPR) {
        return cptObjects.reduce((sum, cpt) => sum + getPrice(cpt), 0);
    }

    // Sort by price (highest first) for MPPR
    const sortedCpts = [...cptObjects].sort((a, b) => getPrice(b) - getPrice(a));

    // Calculate total with MPPR
    let totalRevenue = 0;

    sortedCpts.forEach((cpt, index) => {
        const price = getPrice(cpt);
        if (index === 0) {
            // First (highest value) code gets 100%
            totalRevenue += price;
        } else {
            // All subsequent codes get 50%
            totalRevenue += price * 0.5;
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
    const isCosmetic = surgery.notes && surgery.notes.includes('Fixed Facility Fee Case');
    const isProbono = !!(surgery.is_probono || surgery.isProbono);
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
        // Parse cosmetic fees from notes or use calculated defaults
        let facilityFee = 0;
        let anesthesiaFee = 0;

        if (surgery.notes) {
            const facilityMatch = surgery.notes.match(/(?:Facility|Cosmetic|CSC|Faculty)(?:\s+Fee)?:\s*\$?\s*([\d,.]+)/i);
            const anesthesiaMatch = surgery.notes.match(/(?:Anesthesia|Quantum)(?:\s+Fee)?:\s*\$?\s*([\d,.]+)/i);
            facilityFee = facilityMatch ? parseFloat(facilityMatch[1].replace(/,/g, '')) : 0;
            anesthesiaFee = anesthesiaMatch ? parseFloat(anesthesiaMatch[1].replace(/,/g, '')) : 0;
        }

        // Fallback to defaults if not in notes
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
        cptTotal = calculateMedicareRevenue(surgery.cpt_codes || surgery.cptCodes || [], cptCodes, settings?.apply_medicare_mppr || false);
        internalRoomCost = calculateORCost(duration + turnover); // Full room usage cost

        if (surgery.notes && surgery.notes.includes('Self-Pay Anesthesia')) {
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
