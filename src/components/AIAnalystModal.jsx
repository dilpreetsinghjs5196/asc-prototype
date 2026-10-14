import React, { useState, useEffect } from 'react';
import { calculateORCost, formatCurrency } from '../utils/hospitalUtils';
import './AIAnalystModal.css';

const AIAnalystModal = ({ isOpen, onClose, surgeries = [], cptCodes = [], settings = {} }) => {
    const [utilizationTarget, setUtilizationTarget] = useState(80);
    const [numberOfORs, setNumberOfORs] = useState(1);
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [selectedSurgeon, setSelectedSurgeon] = useState('All');
    const [isOptimizing, setIsOptimizing] = useState(false);
    const [recommendation, setRecommendation] = useState(null);
    const [errorMsg, setErrorMsg] = useState(null);

    // Get unique categories from CPT codes
    const categories = ['All', ...new Set(cptCodes.map(c => c.category).filter(Boolean))];

    // Get unique surgeons from historical surgeries
    const surgeonsList = ['All', ...new Set(surgeries.map(s => {
        if (s.surgeons) return `${s.surgeons.firstname} ${s.surgeons.lastname}`.trim();
        return s.doctorName || s.surgeon_name || s.doctor_name;
    }).filter(Boolean))].sort();

    // Reset state when modal opens
    useEffect(() => {
        if (isOpen) {
            const timer = setTimeout(() => {
                setRecommendation(null);
                setErrorMsg(null);
                setUtilizationTarget(80);
                setNumberOfORs(1);
                setSelectedCategory('All');
                setSelectedSurgeon('All');
            }, 0);
            return () => clearTimeout(timer);
        }
    }, [isOpen]);

    const calculateAverageDurations = () => {
        const durationMap = {};
        const countMap = {};

        // Initialize with defaults or historical data
        cptCodes.forEach(cpt => {
            durationMap[cpt.code] = 60; // Default 60 mins
            countMap[cpt.code] = 0;
        });

        surgeries.forEach(s => {
            const duration = s.duration_minutes || s.durationMinutes || 60;
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

            // Distribute duration among codes (simple approximation: split evenly)
            const durationPerCode = duration / (codes.length || 1);

            codes.forEach(code => {
                if (durationMap[code] !== undefined) {
                    if (countMap[code] === 0) durationMap[code] = 0; // Reset default if we have data
                    durationMap[code] += durationPerCode;
                    countMap[code]++;
                }
            });
        });

        // Finalize averages
        Object.keys(durationMap).forEach(code => {
            if (countMap[code] > 0) {
                durationMap[code] = Math.round(durationMap[code] / countMap[code]);
            }
        });

        return durationMap;
    };

    const handleOptimize = () => {
        setIsOptimizing(true);
        setErrorMsg(null);

        // Simulate AI "thinking" time
        setTimeout(() => {
            try {
                const avgDurations = calculateAverageDurations();
                const MINUTES_PER_OR = 480; // 8-hour day per OR
                const totalAvailableMinutes = MINUTES_PER_OR * numberOfORs;
                const targetMinutes = (utilizationTarget / 100) * totalAvailableMinutes;

                // Calculate average supplies cost per surgery
                const avgSuppliesCost = surgeries.length > 0
                    ? surgeries.reduce((sum, s) => sum + ((parseFloat(s.supplies_cost) || 0) + (parseFloat(s.implants_cost) || 0) + (parseFloat(s.medications_cost) || 0)), 0) / surgeries.length
                    : 500; // Default $500 if no data

                // Filter CPT codes by selected category and surgeon
                const filteredCptCodes = cptCodes.filter(cpt => {
                    const matchCategory = selectedCategory === 'All' || cpt.category === selectedCategory;
                    let matchSurgeon = true;
                    
                    if (selectedSurgeon !== 'All') {
                        // Find surgeries performed by this surgeon
                        const surgeonSurgeries = surgeries.filter(s => {
                            const sName = s.surgeons ? `${s.surgeons.firstname} ${s.surgeons.lastname}`.trim() : (s.doctorName || s.surgeon_name || s.doctor_name);
                            return sName === selectedSurgeon;
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
                        
                        matchSurgeon = surgeonCpts.has(cpt.code);
                    }
                    
                    return matchCategory && matchSurgeon;
                });
                console.log("AI Analyst selected category:", selectedCategory, "selected surgeon:", selectedSurgeon);
                console.log("Filtered CPT codes count:", filteredCptCodes.length, "Total CPTs:", cptCodes.length);

                // Prepare items for knapsack-like problem
                // We want to maximize PROFIT (Revenue - OR Cost - Labor Cost - Supplies Cost) within Time Constraint
                let items = filteredCptCodes.map(cpt => {
                    // Priority: 1) CPT average_duration, 2) Historical average, 3) Default 60 min
                    const duration = cpt.average_duration || avgDurations[cpt.code] || 60;
                    const estimatedORCost = calculateORCost(duration);
                    
                    // Estimate labor cost (30% of OR cost as approximation)
                    const estimatedLaborCost = estimatedORCost * 0.3;
                    
                    // Use average supplies cost, but cap it at 40% of reimbursement so low-paying procedures aren't instantly rendered massively unprofitable by high-cost outliers like total joints
                    const reimbursement = parseFloat(cpt.gross_charge || cpt.reimbursement || 0);
                    const estimatedSuppliesCost = Math.min(avgSuppliesCost, reimbursement * 0.4) || 200;

                    const totalCost = estimatedORCost + estimatedLaborCost + estimatedSuppliesCost;
                    const estimatedProfit = reimbursement - totalCost;
                    
                    return {
                        ...cpt,
                        duration,
                        estimatedORCost,
                        estimatedLaborCost,
                        estimatedSuppliesCost,
                        totalCost,
                        estimatedProfit,
                        reimbursement,
                        efficiency: estimatedProfit / duration
                    };
                });
                
                // Sort by efficiency (Profit per Minute) descending
                items.sort((a, b) => b.efficiency - a.efficiency);
                console.log("Profitable items:", items.filter(i => i.estimatedProfit > 0).length);

                let currentMinutes = 0;
                let currentRevenue = 0;
                let currentORCost = 0;
                let currentLaborCost = 0;
                let currentSuppliesCost = 0;
                const selectedSurgeries = [];
                const cptCounts = {};
                const maxCptCount = 3 * numberOfORs; // Prevent endless duplication, force variety

                // Greedy approach: Add most efficient surgeries that fit
                let attempts = 0;
                while (currentMinutes < targetMinutes && attempts < 100) {
                    let added = false;
                    for (const item of items) {
                        const currentCount = cptCounts[item.code] || 0;
                        // Only add if it fits AND hasn't exceeded limits (even if profit is negative, we still need to schedule the best available)
                        if (currentMinutes + item.duration <= targetMinutes + 30 && currentCount < maxCptCount) {
                            selectedSurgeries.push({ ...item });
                            cptCounts[item.code] = currentCount + 1;
                            currentMinutes += item.duration;
                            currentRevenue += item.reimbursement;
                            currentORCost += item.estimatedORCost;
                            currentLaborCost += item.estimatedLaborCost;
                            currentSuppliesCost += item.estimatedSuppliesCost;
                            added = true;
                            break;
                        }
                    }
                    if (!added) break; // Nothing fits anymore
                    attempts++;
                }

                // Group identical surgeries and sort by gross charge (reimbursement) descending
                const groupedSurgeriesMap = {};
                selectedSurgeries.forEach(item => {
                    if (!groupedSurgeriesMap[item.code]) {
                        groupedSurgeriesMap[item.code] = { 
                            ...item, 
                            quantity: 0, 
                            totalGroupCost: 0, 
                            totalGroupProfit: 0, 
                            totalGroupDuration: 0, 
                            totalGroupRevenue: 0 
                        };
                    }
                    groupedSurgeriesMap[item.code].quantity += 1;
                    groupedSurgeriesMap[item.code].totalGroupCost += item.totalCost;
                    groupedSurgeriesMap[item.code].totalGroupProfit += item.estimatedProfit;
                    groupedSurgeriesMap[item.code].totalGroupDuration += item.duration;
                    groupedSurgeriesMap[item.code].totalGroupRevenue += item.reimbursement;
                });
                
                const groupedSurgeries = Object.values(groupedSurgeriesMap);
                groupedSurgeries.sort((a, b) => b.reimbursement - a.reimbursement);

                // Apply MPPR if enabled in settings
                // When enabled, assume average 15% reduction due to multiple procedures being combined
                // When disabled, no reduction
                const mpprFactor = settings?.apply_medicare_mppr ? 0.85 : 1.0;
                const adjustedRevenue = currentRevenue * mpprFactor;

                // 2. Availability Factor: Not all recommended procedures will be available (70% realistic)
                const availabilityFactor = 0.70;
                const realisticRevenue = adjustedRevenue * availabilityFactor;

                // Recalculate profit with realistic revenue
                const realisticProfit = realisticRevenue - (currentORCost + currentLaborCost + currentSuppliesCost);

                setRecommendation({
                    surgeries: groupedSurgeries,
                    totalMinutes: currentMinutes,
                    totalRevenue: realisticRevenue,  // Use realistic revenue
                    optimisticRevenue: currentRevenue,  // Keep original for reference
                    totalProfit: realisticProfit,  // Use realistic profit
                    totalORCost: currentORCost,
                    totalLaborCost: currentLaborCost,
                    totalSuppliesCost: currentSuppliesCost,
                    totalCost: currentORCost + currentLaborCost + currentSuppliesCost,
                    utilization: Math.round((currentMinutes / totalAvailableMinutes) * 100),
                    numberOfORs: numberOfORs,
                    totalAvailableMinutes: totalAvailableMinutes,
                    mpprFactor: mpprFactor,
                    availabilityFactor: availabilityFactor,
                    selectedCategory: selectedCategory
                });

            } catch (err) {
                console.error("Optimization error:", err);
                setErrorMsg(err.message || String(err));
            } finally {
                setIsOptimizing(false);
            }
        }, 1500);
    };

    if (!isOpen) return null;

    return (
        <div className="ai-modal-overlay">
            <div className="ai-modal-content">
                <div className="ai-modal-header">
                    <div className="ai-title-group">
                        <div className="ai-icon-large">✨</div>
                        <div className="ai-modal-title">
                            <h2>ASC Analyst</h2>
                            <p>Smart Schedule Optimization</p>
                        </div>
                    </div>
                    <button className="btn-close" onClick={onClose}>×</button>
                </div>

                <div className="ai-modal-body">
                    <div className="optimization-controls">
                        <div className="control-row">
                            <div className="control-group">
                                <label>Number of ORs</label>
                                <select
                                    value={numberOfORs}
                                    onChange={(e) => setNumberOfORs(parseInt(e.target.value))}
                                    style={{
                                        padding: '0.5rem 1rem',
                                        borderRadius: '8px',
                                        border: '1px solid #cbd5e1',
                                        fontSize: '0.95rem',
                                        cursor: 'pointer',
                                        minWidth: '120px'
                                    }}
                                >
                                    <option value="1">1 OR</option>
                                    <option value="2">2 ORs</option>
                                    <option value="3">3 ORs</option>
                                    <option value="4">4 ORs</option>
                                </select>
                            </div>
                            <div className="control-group">
                                <label>Surgeon</label>
                                <select
                                    value={selectedSurgeon}
                                    onChange={(e) => setSelectedSurgeon(e.target.value)}
                                    style={{
                                        padding: '0.5rem 1rem',
                                        borderRadius: '8px',
                                        border: '1px solid #cbd5e1',
                                        fontSize: '0.95rem',
                                        cursor: 'pointer',
                                        minWidth: '180px'
                                    }}
                                >
                                    {surgeonsList.map(s => (
                                        <option key={s} value={s}>{s}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="control-group">
                                <label>Surgery Category</label>
                                <select
                                    value={selectedCategory}
                                    onChange={(e) => setSelectedCategory(e.target.value)}
                                    style={{
                                        padding: '0.5rem 1rem',
                                        borderRadius: '8px',
                                        border: '1px solid #cbd5e1',
                                        fontSize: '0.95rem',
                                        cursor: 'pointer',
                                        minWidth: '180px'
                                    }}
                                >
                                    {categories.map(cat => (
                                        <option key={cat} value={cat}>{cat}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="control-group">
                                <label>Target OR Utilization</label>
                                <div className="slider-container">
                                    <input
                                        type="range"
                                        min="50"
                                        max="100"
                                        value={utilizationTarget}
                                        onChange={(e) => setUtilizationTarget(e.target.value)}
                                        className="utilization-slider"
                                    />
                                    <span className="utilization-value">{utilizationTarget}%</span>
                                </div>
                            </div>
                            <button
                                className="btn-optimize"
                                onClick={handleOptimize}
                                disabled={isOptimizing}
                            >
                                {isOptimizing ? 'Optimizing...' : 'Generate Optimal Schedule'}
                            </button>
                        </div>
                    </div>

                    {isOptimizing ? (
                        <div className="ai-loading">
                            <div className="spinner"></div>
                            <p>Analyzing historical data and CPT efficiency...</p>
                        </div>
                    ) : recommendation ? (
                        <div className="optimization-results">
                            <div className="results-summary">
                                <div className="result-card">
                                    <div className="result-label">Realistic Revenue</div>
                                    <div className="result-value highlight">{formatCurrency(recommendation.totalRevenue)}</div>
                                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '0.25rem' }}>
                                        Adjusted for MPPR (15% discount) & availability (70%)
                                    </div>
                                </div>
                                <div className="result-card">
                                    <div className="result-label">Total Costs</div>
                                    <div className="result-value" style={{ color: '#ef4444' }}>{formatCurrency(recommendation.totalCost)}</div>
                                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem' }}>
                                        OR: {formatCurrency(recommendation.totalORCost)} |
                                        Labor: {formatCurrency(recommendation.totalLaborCost)} |
                                        Supplies: {formatCurrency(recommendation.totalSuppliesCost)}
                                    </div>
                                </div>
                                <div className="result-card">
                                    <div className="result-label">Est. Profit</div>
                                    <div className="result-value highlight" style={{ color: '#10b981' }}>{formatCurrency(recommendation.totalProfit)}</div>
                                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem' }}>
                                        Margin: {recommendation.totalRevenue > 0 ? ((recommendation.totalProfit / recommendation.totalRevenue) * 100).toFixed(1) : 0}%
                                    </div>
                                </div>
                                <div className="result-card">
                                    <div className="result-label">Total Time</div>
                                    <div className="result-value">
                                        {Math.floor(recommendation.totalMinutes / 60)}h {recommendation.totalMinutes % 60}m
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem' }}>
                                        {recommendation.numberOfORs} OR{recommendation.numberOfORs > 1 ? 's' : ''} × {Math.floor(recommendation.totalAvailableMinutes / recommendation.numberOfORs / 60)}h = {Math.floor(recommendation.totalAvailableMinutes / 60)}h capacity
                                    </div>
                                </div>
                                <div className="result-card">
                                    <div className="result-label">Utilization</div>
                                    <div className="result-value">{recommendation.utilization}%</div>
                                </div>
                            </div>

                            <h3>Recommended Procedures</h3>
                            <div style={{
                                background: '#fef3c7',
                                border: '1px solid #fbbf24',
                                borderRadius: '8px',
                                padding: '0.75rem 1rem',
                                marginBottom: '1rem',
                                fontSize: '0.875rem',
                                color: '#92400e'
                            }}>
                                <strong>⚠️ Important:</strong> Revenue projections assume each procedure is performed as a <strong>single-procedure surgery</strong>.
                                If multiple procedures are combined in one surgery, Medicare's MPPR (Multiple Procedure Payment Reduction) will apply:
                                100% for the highest-value procedure, 50% for additional procedures. Actual revenue may be lower.
                            </div>
                            <p style={{ color: '#64748b', marginBottom: '1rem' }}>
                                Based on historical efficiency, scheduling these procedures will maximize profit while hitting your utilization target.
                            </p>

                            <div className="recommendations-list">
                                {recommendation.surgeries.map((item, idx) => (
                                    <div key={idx} className="recommendation-item">
                                        <div className="rec-info">
                                            <span className="rec-code">{item.code}</span>
                                            <span className="rec-desc">
                                                {item.description}
                                                {item.quantity > 1 && (
                                                    <strong style={{ color: 'var(--color-blue)', marginLeft: '8px', fontSize: '0.9rem', backgroundColor: 'rgba(29, 78, 216, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                                                        x{item.quantity}
                                                    </strong>
                                                )}
                                            </span>
                                        </div>
                                        <div className="rec-metrics">
                                            <div className="rec-metric">
                                                <span>Total Est. Time</span>
                                                <span>{item.totalGroupDuration} min</span>
                                            </div>
                                            <div className="rec-metric">
                                                <span>Total Gross Charge</span>
                                                <span style={{ color: '#059669', fontWeight: '600' }}>{formatCurrency(item.totalGroupRevenue)}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="ai-intro">
                            {errorMsg && (
                                <div style={{ background: '#fef2f2', border: '1px solid #f87171', color: '#b91c1c', padding: '1rem', borderRadius: '8px', marginBottom: '1rem' }}>
                                    <strong>Error during optimization:</strong> {errorMsg}
                                </div>
                            )}
                            <p>
                                Use the AI Analyst to calculate the optimal mix of surgeries for a specific day.
                                Set your target utilization (e.g., 80%) and the AI will recommend specific CPT codes
                                to maximize profit based on historical duration data and OR costs.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AIAnalystModal;
