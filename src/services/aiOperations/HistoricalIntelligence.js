/**
 * Historical Intelligence Module
 * Analyzes all historical surgery data and builds intelligence profiles 
 * for every CPT and Surgeon.
 */

import { calculateNetProfit } from './FinancialEngine';

// Helper to extract CPT codes from a surgery record
const extractCodes = (surgery) => {
    let rawCodes = surgery.cpt_codes || surgery.cptCodes || [];
    let codes = [];
    if (typeof rawCodes === 'string') {
        if (rawCodes.trim().startsWith('[')) {
            try { codes = JSON.parse(rawCodes); } catch { codes = rawCodes.split(',').map(c => c.trim()); }
        } else {
            codes = rawCodes.split(',').map(c => c.trim());
        }
    } else if (Array.isArray(rawCodes)) {
        codes = rawCodes;
    } else if (rawCodes != null) {
        codes = [String(rawCodes)];
    }
    return codes;
};

// Math helpers
const getMedian = (arr) => {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const getMode = (arr) => {
    if (arr.length === 0) return null;
    const frequency = {};
    let maxFreq = 0;
    let mode = arr[0];
    for (const item of arr) {
        frequency[item] = (frequency[item] || 0) + 1;
        if (frequency[item] > maxFreq) {
            maxFreq = frequency[item];
            mode = item;
        }
    }
    return mode;
};

const getAverage = (arr) => arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;

export const buildCPTProfiles = (cptCodes, surgeries) => {
    const profiles = {};

    cptCodes.forEach(cpt => {
        profiles[cpt.code] = {
            code: cpt.code,
            description: cpt.description,
            category: cpt.category,
            baseGrossCharge: parseFloat(cpt.gross_charge || cpt.reimbursement || 0),
            durations: [],
            turnovers: [],
            suppliesCosts: [],
            implantCosts: [],
            totalScheduled: 0,
            totalCancelled: 0,
        };
    });

    surgeries.forEach(s => {
        const codes = extractCodes(s);
        const duration = parseFloat(s.duration_minutes || s.durationMinutes || 0);
        const turnover = parseFloat(s.turnover_minutes || s.turnoverMinutes || 30);
        const supplies = parseFloat(s.supplies_cost) || 0;
        const implants = parseFloat(s.implants_cost) || 0;
        const isCancelled = (s.status || '').toLowerCase() === 'cancelled';

        // Distribute stats if multiple CPTs were performed
        const durationPerCode = duration / (codes.length || 1);
        const suppliesPerCode = supplies / (codes.length || 1);
        const implantsPerCode = implants / (codes.length || 1);

        codes.forEach(code => {
            if (profiles[code]) {
                profiles[code].totalScheduled++;
                if (isCancelled) {
                    profiles[code].totalCancelled++;
                } else {
                    if (durationPerCode > 0) profiles[code].durations.push(durationPerCode);
                    profiles[code].turnovers.push(turnover);
                    profiles[code].suppliesCosts.push(suppliesPerCode);
                    profiles[code].implantCosts.push(implantsPerCode);
                }
            }
        });
    });

    // Finalize CPT Profiles
    const finalizedProfiles = {};
    Object.values(profiles).forEach(p => {
        const casesPerformed = p.durations.length;
        const avgDuration = getAverage(p.durations) || 60;
        const avgSupplies = getAverage(p.suppliesCosts) || 200;
        const avgImplant = getAverage(p.implantCosts) || 0;
        
        // Calculate detailed Net Profit using FinancialEngine
        const financialMetrics = calculateNetProfit({
            grossCharge: p.baseGrossCharge,
            durationMinutes: avgDuration,
            suppliesCost: avgSupplies,
            implantCost: avgImplant
        });

        finalizedProfiles[p.code] = {
            code: p.code,
            casesPerformed,
            averageDuration: avgDuration,
            medianDuration: getMedian(p.durations) || 60,
            averageTurnover: getAverage(p.turnovers) || 30,
            averageGrossCharge: p.baseGrossCharge,
            averageNetProfit: financialMetrics.netProfit,
            averageSuppliesCost: avgSupplies,
            averageImplantCost: avgImplant,
            cancellationRate: p.totalScheduled > 0 ? (p.totalCancelled / p.totalScheduled) * 100 : 0,
            // Confidence based on volume (e.g. 20+ cases = 99%)
            confidenceScore: Math.min(99, Math.max(50, casesPerformed * 5)) 
        };
    });

    return finalizedProfiles;
};

export const buildSurgeonProfiles = (surgeonsList, surgeries) => {
    const profiles = {};

    // For "All" dropdown cases or unexpected formats, we filter surgeonsList 
    // to actual strings
    const validSurgeons = surgeonsList.filter(s => s !== 'All');

    validSurgeons.forEach(surgeon => {
        profiles[surgeon] = {
            name: surgeon,
            orAssignments: [],
            startTimes: [],
            durations: [],
            cptDistribution: {},
            datesPerformed: new Set(),
            specialties: [],
            totalScheduled: 0,
            totalCancelled: 0,
            dailyProfits: {} // map of date -> profit
        };
    });

    surgeries.forEach(s => {
        const sName = s.surgeons ? `${s.surgeons.firstname} ${s.surgeons.lastname}`.trim() : (s.doctorName || s.surgeon_name || s.doctor_name);
        
        if (sName && profiles[sName]) {
            const p = profiles[sName];
            const isCancelled = (s.status || '').toLowerCase() === 'cancelled';
            const date = s.date || 'unknown';
            const duration = parseFloat(s.duration_minutes || s.durationMinutes || 60);

            p.totalScheduled++;
            if (isCancelled) {
                p.totalCancelled++;
            } else {
                p.durations.push(duration);
                if (s.or_room || s.or) p.orAssignments.push(s.or_room || s.or);
                if (s.start_time || s.startTime) p.startTimes.push(s.start_time || s.startTime);
                if (s.surgeons && s.surgeons.specialty) p.specialties.push(s.surgeons.specialty);
                p.datesPerformed.add(date);

                const codes = extractCodes(s);
                codes.forEach(c => {
                    p.cptDistribution[c] = (p.cptDistribution[c] || 0) + 1;
                });

                // Mock profit for daily tracking based on a generic margin
                const mockProfit = duration * 20; // Generic rough profit estimate
                p.dailyProfits[date] = (p.dailyProfits[date] || 0) + mockProfit;
            }
        }
    });

    // Finalize Surgeon Profiles
    const finalizedProfiles = {};
    Object.values(profiles).forEach(p => {
        const casesPerformed = p.durations.length;
        const totalDays = p.datesPerformed.size || 1;
        
        finalizedProfiles[p.name] = {
            name: p.name,
            preferredOR: getMode(p.orAssignments) || 'N/A',
            preferredStartTime: getMode(p.startTimes) || 'N/A',
            averageCasesPerDay: casesPerformed / totalDays,
            averageDuration: getAverage(p.durations) || 60,
            averageDailyProfit: getAverage(Object.values(p.dailyProfits)) || 0,
            preferredSpecialties: getMode(p.specialties) || 'General',
            historicalCptDistribution: p.cptDistribution,
            cancellationPercentage: p.totalScheduled > 0 ? (p.totalCancelled / p.totalScheduled) * 100 : 0,
            // Average OR Utilization (cases per day * avg duration) / 480 mins (8 hours)
            averageORUtilization: Math.min(100, (((casesPerformed / totalDays) * (getAverage(p.durations) || 60)) / 480) * 100)
        };
    });

    return finalizedProfiles;
};
