/**
 * REAL ASC Case-Level Scheduling Engine
 * Treats normalized historical data as the pool of available cases.
 * Generates true OR schedules by assigning actual cases to time slots.
 */

/**
 * REAL ASC Case-Level Scheduling Engine
 * Treats normalized historical data as the pool of available cases.
 * Generates true OR schedules by assigning actual cases to true future dates.
 */

const VALID_ASC_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

export const generateOptimizationModels = (normalizedData, config) => {
  const { activeORs, dailyMinutes, targetUtilization, maxSurgeonDays } = config;

  // 1. Build Surgeon Intelligence
  const surgeonProfiles = {};
  const cptProfiles = {};
  
  // Array of cases we can schedule from
  const availableCases = [...normalizedData].filter(c => c.caseDurationMinutes > 0);
  
  const totalAvailableCases = availableCases.length;

  availableCases.forEach(row => {
    // Surgeon
    if (!surgeonProfiles[row.surgeonName]) {
      surgeonProfiles[row.surgeonName] = {
        name: row.surgeonName,
        specialty: row.specialty,
        totalCases: 0,
        totalMinutes: 0,
        durations: [],
        weekdayDistribution: {
          'Monday': 0, 'Tuesday': 0, 'Wednesday': 0, 'Thursday': 0, 'Friday': 0, 'Saturday': 0, 'Sunday': 0
        },
        scheduledDays: new Set()
      };
    }
    const sProfile = surgeonProfiles[row.surgeonName];
    sProfile.totalCases++;
    sProfile.totalMinutes += row.caseDurationMinutes;
    sProfile.durations.push(row.caseDurationMinutes);
    
    const dayOfWeek = new Date(row.historicalDate).toLocaleDateString('en-US', { weekday: 'long' });
    if (sProfile.weekdayDistribution[dayOfWeek] !== undefined) {
      sProfile.weekdayDistribution[dayOfWeek]++;
    } else {
      sProfile.weekdayDistribution[dayOfWeek] = 1;
    }
    
    // CPT
    if (!cptProfiles[row.cptCode]) {
      cptProfiles[row.cptCode] = {
        code: row.cptCode,
        procedureName: row.procedureName,
        totalCases: 0,
        durations: []
      };
    }
    const cProfile = cptProfiles[row.cptCode];
    cProfile.totalCases++;
    cProfile.durations.push(row.caseDurationMinutes);
  });

  // Calculate averages/medians and dynamically detect allowed future days
  Object.values(surgeonProfiles).forEach(sp => {
    sp.averageDuration = Math.round(sp.totalMinutes / sp.totalCases) || 60;
    
    // All days historically worked
    sp.historicalOperatingDays = Object.keys(sp.weekdayDistribution).filter(day => sp.weekdayDistribution[day] > 0);
    
    // Intersect with ASC allowed days
    let validFutureDays = sp.historicalOperatingDays.filter(day => VALID_ASC_DAYS.includes(day));
    
    // Rank deterministically (by frequency, then alphabetically) to respect maxSurgeonDays
    validFutureDays.sort((a, b) => {
      const diff = sp.weekdayDistribution[b] - sp.weekdayDistribution[a];
      if (diff !== 0) return diff;
      return a.localeCompare(b);
    });
    
    // Slice to max allowed
    sp.allowedFutureDays = validFutureDays.slice(0, maxSurgeonDays);
  });

  // Calculate ASC Capacity for a 3-week horizon (15 valid days)
  const daysInHorizon = 15; 
  const dailyCapacity = activeORs * dailyMinutes; 
  const weeklyAvailableMinutes = dailyCapacity * daysInHorizon;

  // Generate Future Calendar Dates (starting from next available Monday)
  // For prototype determinism, let's just pick a fixed base date or dynamic.
  // Using a fixed near-future date for consistency in demo, e.g. next week Monday.
  const baseDate = new Date();
  baseDate.setDate(baseDate.getDate() + ((1 + 7 - baseDate.getDay()) % 7 || 7)); // Next Monday
  
  const futureCalendar = [];
  for (let i = 0; i < 21; i++) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + i);
    const dayName = d.toLocaleDateString('en-US', { weekday: 'long' });
    if (VALID_ASC_DAYS.includes(dayName)) {
      futureCalendar.push({
        dateStr: d.toISOString().split('T')[0],
        dayOfWeek: dayName
      });
    }
  }

  // Time manipulation helper
  const addMinutes = (timeStr, minsToAdd) => {
    const [h, m] = timeStr.split(':').map(Number);
    const date = new Date();
    date.setHours(h, m, 0, 0);
    date.setMinutes(date.getMinutes() + minsToAdd);
    return date.toTimeString().substring(0, 5);
  };

  const validateUniqueCaseAssignment = (schedule) => {
    const assignedIds = new Set();
    const errors = [];
    
    let totalScheduledMinutes = 0;

    schedule.forEach(row => {
      // Hard Constraint: ASC strictly Mon-Fri
      if (!VALID_ASC_DAYS.includes(row.day)) {
        errors.push(`ASC day violation: ${row.day} is not a valid operating day.`);
      }

      // Hard Constraint: Surgeon allowed days
      const sProfile = surgeonProfiles[row.surgeon];
      if (sProfile && !sProfile.allowedFutureDays.includes(row.day)) {
        errors.push(`Surgeon violation: ${row.surgeon} is scheduled on ${row.day}, but their allowed future days are: ${sProfile.allowedFutureDays.join(', ')}.`);
      }

      // OR Capacity Constraint
      if (row.minutes > dailyMinutes) {
        errors.push(`Capacity violation: ${row.or} on ${row.day} exceeds ${dailyMinutes} minutes (${row.minutes} min).`);
      }
      
      totalScheduledMinutes += row.minutes;

      row.casesList?.forEach(c => {
        // Hard Constraint: No duplicate source cases
        if (assignedIds.has(c.sourceCaseId)) {
          errors.push(`Duplicate violation: Historical case ${c.sourceCaseId} is assigned more than once`);
        }
        assignedIds.add(c.sourceCaseId);
      });
    });

    const calculatedUtil = (totalScheduledMinutes / weeklyAvailableMinutes) * 100;

    return {
      valid: errors.length === 0,
      errors,
      calculatedUtil
    };
  };

  const calculateScore = (modelType, overallUtilization, targetUtilization, validation) => {
    if (!validation.valid) return { score: 0, status: 'INVALID' };

    let score = 80;
    const utilDiff = Math.abs(overallUtilization - targetUtilization);
    
    // Penalize heavily for missing utilization target
    score -= (utilDiff * 0.5);

    if (modelType === 'High Utilization') score += 5;
    if (modelType === 'Conservative') score += (utilDiff > 20 ? -10 : 2); // Rewards lower utilization slightly
    if (modelType === 'Revenue Optimized') score += 4;
    if (modelType === 'Balanced') score += 3;
    if (modelType === 'Surgeon Balanced') score += 3;

    return { score: Math.max(0, Math.min(100, score)).toFixed(1), status: 'VALID' };
  };

  const generateSchedule = (modelType) => {
    const scheduleSummary = [];
    let pool = [...availableCases]; // Clone pool for this model
    
    // Group cases by surgeon first to enforce block scheduling (prevent interleaving), 
    // then apply model-specific sorting logic within the blocks.
    pool.sort((a, b) => {
      // 1. Group by surgeon
      if (a.surgeonName !== b.surgeonName) {
        return a.surgeonName.localeCompare(b.surgeonName);
      }
      
      // 2. Sort within the surgeon's block based on model objective
      if (modelType === 'High Utilization') {
        return b.caseDurationMinutes - a.caseDurationMinutes; // Best-Fit Decreasing
      } else if (modelType === 'Revenue Optimized') {
        return (b.chargeAmount || 0) - (a.chargeAmount || 0);
      } else if (modelType === 'Surgeon Balanced') {
        return surgeonProfiles[a.surgeonName].totalCases - surgeonProfiles[b.surgeonName].totalCases;
      } else {
        return a.caseDurationMinutes - b.caseDurationMinutes; // Balanced / Conservative
      }
    });

    let totalScheduledMinutes = 0;
    let scheduledCaseCount = 0;
    let futureCaseCounter = 1;
    
    // Reset surgeon scheduled days tracking
    Object.values(surgeonProfiles).forEach(sp => sp.scheduledDays.clear());

    futureCalendar.forEach(calDay => {
      const { dateStr: futureDate, dayOfWeek: day } = calDay;
      const surgeonDailyCount = {};

      for (let orIndex = 1; orIndex <= activeORs; orIndex++) {
        const orName = `OR-${orIndex}`;
        let currentOrMinutes = 0;
        let currentTime = '08:00';
        
        let targetForThisOR = dailyMinutes * (targetUtilization / 100);
        if (modelType === 'High Utilization') targetForThisOR = dailyMinutes * 0.95; // Try to pack
        if (modelType === 'Conservative') targetForThisOR = dailyMinutes * (Math.max(40, targetUtilization - 10) / 100);

        // We will assign cases to this OR until we hit target or run out of valid cases
        const dailyAssignedCases = [];
        let assignedSurgeon = null;

        for (let i = 0; i < pool.length; i++) {
          if (currentOrMinutes >= targetForThisOR) break;
          
          const candidateCase = pool[i];
          const sProfile = surgeonProfiles[candidateCase.surgeonName];

          // Hard constraint: Surgeon strictly allowed on this future weekday
          if (!sProfile.allowedFutureDays.includes(day)) {
            continue;
          }

          // Hard constraint: Limit to historical volume for this specific weekday (throttle)
          const historicalLimit = sProfile.weekdayDistribution[day] || 0;
          const currentAssignedCount = surgeonDailyCount[candidateCase.surgeonName] || 0;
          if (currentAssignedCount >= historicalLimit) {
            continue;
          }

          // Hard constraint: Max surgeon days
          if (!sProfile.scheduledDays.has(day) && sProfile.scheduledDays.size >= maxSurgeonDays) {
            continue; // Can't schedule this surgeon on a new day
          }

          // Hard constraint: Don't exceed OR capacity
          if (currentOrMinutes + candidateCase.caseDurationMinutes > dailyMinutes) {
            continue;
          }

          // Soft constraint: block scheduling preference
          if (assignedSurgeon && assignedSurgeon !== candidateCase.surgeonName) {
            if (modelType !== 'High Utilization' && modelType !== 'Revenue Optimized') {
              continue; 
            }
          }

          // Schedule case
          const startTime = currentTime;
          const endTime = addMinutes(startTime, candidateCase.caseDurationMinutes);
          
          dailyAssignedCases.push({
            futureScheduleCaseId: `FUT-${String(futureCaseCounter++).padStart(4, '0')}`,
            sourceCaseId: candidateCase.caseId,
            surgeon: candidateCase.surgeonName,
            cptCode: candidateCase.cptCode,
            procedureName: candidateCase.procedureName,
            specialty: candidateCase.specialty,
            duration: candidateCase.caseDurationMinutes,
            historicalDate: candidateCase.historicalDate,
            historicalDay: new Date(candidateCase.historicalDate).toLocaleDateString('en-US', { weekday: 'long' }),
            futureDate: futureDate,
            futureWeekday: day,
            or: orName,
            startTime,
            endTime
          });

          // Update tracking
          currentOrMinutes += candidateCase.caseDurationMinutes;
          currentTime = addMinutes(endTime, 15); // 15 min turnover time assumed
          sProfile.scheduledDays.add(day);
          assignedSurgeon = candidateCase.surgeonName;
          surgeonDailyCount[candidateCase.surgeonName] = (surgeonDailyCount[candidateCase.surgeonName] || 0) + 1;
          
          // Remove from pool
          pool.splice(i, 1);
          i--; // Adjust index after removal
        }

        if (dailyAssignedCases.length > 0) {
          totalScheduledMinutes += currentOrMinutes;
          scheduledCaseCount += dailyAssignedCases.length;
          
          // Group by surgeon for summary view
          const casesBySurgeon = {};
          dailyAssignedCases.forEach(c => {
            if (!casesBySurgeon[c.surgeon]) {
              casesBySurgeon[c.surgeon] = { cases: [], totalMinutes: 0, specialty: c.specialty };
            }
            casesBySurgeon[c.surgeon].cases.push(c);
            casesBySurgeon[c.surgeon].totalMinutes += c.duration;
          });

          Object.keys(casesBySurgeon).forEach(sName => {
            scheduleSummary.push({
              futureDate,
              day,
              or: orName,
              surgeon: sName,
              specialty: casesBySurgeon[sName].specialty,
              cases: casesBySurgeon[sName].cases.length,
              minutes: casesBySurgeon[sName].totalMinutes,
              utilization: Math.round((casesBySurgeon[sName].totalMinutes / dailyMinutes) * 100),
              casesList: casesBySurgeon[sName].cases
            });
          });
        }
      }
    });

    // Validation
    const validation = validateUniqueCaseAssignment(scheduleSummary);
    const weeklyUtilization = validation.calculatedUtil;
    const { score } = calculateScore(modelType, weeklyUtilization, targetUtilization, validation);

    return {
      id: modelType.toLowerCase().replace(' ', '_'),
      name: modelType,
      score: score,
      valid: validation.valid,
      validationErrors: validation.errors,
      utilization: weeklyUtilization.toFixed(1),
      scheduledCases: scheduledCaseCount,
      scheduledMinutes: totalScheduledMinutes,
      schedule: scheduleSummary,
      risk: modelType === 'Conservative' ? 'Low' : (weeklyUtilization > 90 ? 'High' : 'Medium')
    };
  };

  const generatedModels = [
    generateSchedule('Balanced'),
    generateSchedule('High Utilization'),
    generateSchedule('Conservative'),
    generateSchedule('Revenue Optimized'),
    generateSchedule('Surgeon Balanced')
  ];

  // Filter valid models and sort by score
  const validModels = generatedModels.filter(m => m.valid && parseFloat(m.score) > 0);
  validModels.sort((a, b) => parseFloat(b.score) - parseFloat(a.score));

  let recommendedModel = validModels.length > 0 ? validModels[0] : null;
  
  if (config.optimizationObjective && validModels.some(m => m.name === config.optimizationObjective)) {
    recommendedModel = validModels.find(m => m.name === config.optimizationObjective);
  }

  return {
    configuration: config,
    sourceData: {
      totalCases: totalAvailableCases,
      uniqueCases: totalAvailableCases,
      surgeons: Object.keys(surgeonProfiles).length
    },
    surgeonIntelligence: surgeonProfiles,
    capacity: {
      dailyCapacity,
      weeklyAvailableMinutes,
      activeORs,
      operatingDays: daysInHorizon
    },
    models: generatedModels,
    recommendedModel: recommendedModel
  };
};
