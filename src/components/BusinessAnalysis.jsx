import React, { useState, useMemo } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Lightbulb, 
  CheckCircle2, 
  AlertOctagon, 
  ArrowRight,
  Activity
} from 'lucide-react';
import './BusinessAnalysis.css';

const BusinessAnalysis = ({ surgeries = [], orMetrics = {} }) => {
  
  // Calculate dynamic OR data
  const dynamicOrData = useMemo(() => {
    if (!surgeries || surgeries.length === 0) return [];
    
    // Group surgeries by OR
    const orGroups = {};
    surgeries.forEach(surg => {
      const orName = surg.or_room || surg.or;
      if (!orName) return;
      if (!orGroups[orName]) {
        orGroups[orName] = {
          name: orName,
          surgeries: [],
          turnoverSum: 0,
          turnoverCount: 0,
          overtimeMinutes: 0,
          cancellations: 0,
          utilization: 0,
        };
      }
      orGroups[orName].surgeries.push(surg);
      
      // Calculate specific metrics
      if (surg.turnover_time || surg.turnoverTime) {
        orGroups[orName].turnoverSum += parseInt(surg.turnover_time || surg.turnoverTime, 10);
        orGroups[orName].turnoverCount++;
      } else {
        orGroups[orName].turnoverSum += 20;
        orGroups[orName].turnoverCount++;
      }
      
      const dur = parseInt(surg.duration_minutes || surg.durationMinutes || 0, 10);
      const actualDur = parseInt(surg.actual_duration_minutes || surg.actualDurationMinutes || 0, 10);
      if (actualDur > dur) {
        orGroups[orName].overtimeMinutes += (actualDur - dur);
      }
      
      if (surg.status?.toLowerCase() === 'cancelled') {
        orGroups[orName].cancellations++;
      }
    });
    
    // Convert to array and format
    const results = Object.keys(orGroups).map(orName => {
      const data = orGroups[orName];
      const avgTurnover = data.turnoverCount > 0 ? Math.round(data.turnoverSum / data.turnoverCount) : 0;
      const cancellationRate = data.surgeries.length > 0 ? Math.round((data.cancellations / data.surgeries.length) * 100) : 0;
      
      // Get utilization from passed orMetrics
      let utilization = 0;
      if (orMetrics.roomUtilization && Array.isArray(orMetrics.roomUtilization)) {
        const utilData = orMetrics.roomUtilization.find(u => u.room === orName);
        if (utilData) utilization = utilData.val;
      } else if (orMetrics.roomUtilization && !Array.isArray(orMetrics.roomUtilization)) {
        const utilObj = orMetrics.roomUtilization[orName];
        if (utilObj) {
           utilization = Math.round((utilObj.used / utilObj.total) * 100);
        }
      }
      
      const good = [];
      const bad = [];
      const improvements = [];
      
      // Dynamic Rules
      if (utilization >= 75) {
        good.push(`High block utilization (${utilization}%) consistently meets target.`);
      } else {
        bad.push(`Low overall block utilization (${utilization}%).`);
        improvements.push(`Review block allocation for ${orName} and repurpose underutilized blocks for add-on cases.`);
      }
      
      if (avgTurnover <= 25) {
        good.push(`Turnover time is excellent (averaging ${avgTurnover} mins).`);
      } else {
        bad.push(`Turnover time averages ${avgTurnover} mins (target is 25 mins).`);
        improvements.push(`Implement parallel processing for turnover: have cleaning staff and anesthesia tech enter simultaneously.`);
      }
      
      if (data.overtimeMinutes > 60) {
        bad.push(`Significant overtime detected (${Math.round(data.overtimeMinutes / 60)} hrs total).`);
        improvements.push(`Investigate scheduling accuracy for long cases and adjust block durations to prevent overrun.`);
      } else {
        good.push(`Accurate case duration estimations with minimal overtime.`);
      }
      
      if (cancellationRate > 5) {
        bad.push(`High cancellation rate (${cancellationRate}%).`);
        improvements.push(`Introduce stricter pre-op testing checklists and automated patient reminders 3 days prior.`);
      } else {
        good.push(`Low cancellation rate (${cancellationRate}%).`);
      }
      
      // Fallbacks if empty
      if (good.length === 0) good.push("Consistent daily operations without major disruptions.");
      if (bad.length === 0) bad.push("No major bottlenecks detected in recent data.");
      if (improvements.length === 0) improvements.push("Continue monitoring KPIs to maintain current performance levels.");
      
      return {
        id: orName,
        name: `Operating Room - ${orName}`,
        utilization: utilization,
        good,
        bad,
        improvements
      };
    });
    
    return results.sort((a, b) => a.id.localeCompare(b.id));
  }, [surgeries, orMetrics]);

  const [selectedOrId, setSelectedOrId] = useState('');
  const activeOrId = (selectedOrId && dynamicOrData.some(or => or.id === selectedOrId))
    ? selectedOrId
    : (dynamicOrData[0]?.id || '');
  
  const currentOr = dynamicOrData.find(or => or.id === activeOrId);

  if (!dynamicOrData || dynamicOrData.length === 0) {
    return (
      <div className="business-analysis-container" style={{ padding: '40px', textAlign: 'center' }}>
        <Activity size={48} color="var(--color-blue)" style={{ opacity: 0.5, marginBottom: '20px' }} />
        <h3>No OR Data Available</h3>
        <p style={{ color: 'var(--text-secondary)' }}>Please ensure there are scheduled surgeries in the selected timeframe to generate the analysis.</p>
      </div>
    );
  }

  if (!currentOr) return null;

  return (
    <div className="business-analysis-container">
      <div className="analysis-header">
        <div className="analysis-title-group">
          <Activity className="analysis-title-icon" size={24} />
          <h2>OR Performance & Strategic Analysis</h2>
        </div>
        <p className="analysis-subtitle">
          Identify system strengths, pinpoint bottlenecks, and review actionable improvements tailored for each Operating Room based on real-time data.
        </p>
      </div>

      <div className="or-selector-tabs">
        {dynamicOrData.map(or => (
          <button
            key={or.id}
            className={`or-tab ${activeOrId === or.id ? 'active' : ''}`}
            onClick={() => setSelectedOrId(or.id)}
          >
            {or.id}
          </button>
        ))}
      </div>

      <div className="analysis-content">
        <div className="analysis-overview-card">
          <h3>{currentOr.name}</h3>
          <div className="utilization-badge">
            Utilization: <span className={currentOr.utilization >= 80 ? 'high' : 'low'}>{currentOr.utilization}%</span>
          </div>
        </div>

        <div className="analysis-grid">
          {/* The Good */}
          <div className="analysis-card good-card">
            <div className="card-header good-header">
              <CheckCircle2 size={20} />
              <h3>SYSTEM STRENGTHS (THE GOOD)</h3>
            </div>
            <ul className="analysis-list">
              {currentOr.good.map((item, index) => (
                <li key={index}>
                  <TrendingUp size={16} className="list-icon" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* The Bad */}
          <div className="analysis-card bad-card">
            <div className="card-header bad-header">
              <AlertOctagon size={20} />
              <h3>BOTTLENECKS (THE BAD)</h3>
            </div>
            <ul className="analysis-list">
              {currentOr.bad.map((item, index) => (
                <li key={index}>
                  <TrendingDown size={16} className="list-icon" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Improvements */}
        <div className="analysis-card improvements-card">
          <div className="card-header improvements-header">
            <Lightbulb size={20} />
            <h3>ACTIONABLE IMPROVEMENTS</h3>
          </div>
          <div className="improvements-list">
            {currentOr.improvements.map((item, index) => (
              <div key={index} className="improvement-item">
                <div className="improvement-step">{index + 1}</div>
                <div className="improvement-text">
                  <p>{item}</p>
                </div>
                <ArrowRight size={16} className="improvement-arrow" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BusinessAnalysis;
