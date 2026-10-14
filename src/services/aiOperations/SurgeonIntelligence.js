/**
 * Surgeon Intelligence Module
 * Analyzes surgeon performance and extracts historical capabilities.
 */

export const getUniqueSurgeons = (surgeries) => {
    return ['All', ...new Set(surgeries.map(s => {
        if (s.surgeons) return `${s.surgeons.firstname} ${s.surgeons.lastname}`.trim();
        return s.doctorName || s.surgeon_name || s.doctor_name;
    }).filter(Boolean))].sort();
};

export const hasSurgeonPerformedCpt = (surgeries, surgeonName, cptCode) => {
    if (surgeonName === 'All') return true;

    // Find surgeries performed by this surgeon
    const surgeonSurgeries = surgeries.filter(s => {
        const sName = s.surgeons ? `${s.surgeons.firstname} ${s.surgeons.lastname}`.trim() : (s.doctorName || s.surgeon_name || s.doctor_name);
        return sName === surgeonName;
    });
    
    // Collect all CPT codes performed by this surgeon historically
    const surgeonCpts = new Set();
    surgeonSurgeries.forEach(s => {
        let rawCodes = s.cpt_codes || s.cptCodes || [];
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
        codes.forEach(c => surgeonCpts.add(c));
    });
    
    return surgeonCpts.has(cptCode);
};
