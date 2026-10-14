import React, { useMemo } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';
import { DollarSign, Clock, TrendingUp } from 'lucide-react';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444']; // Highly Profitable, Profitable, Break-even, Unprofitable

export default function CommandCenter({ surgeries = [], onTabChange, timeframe = 'Month', filterDate = new Date(), includeAdvancedCosts = false }) {

  // Filter surgeries based on timeframe and selected date
  const filteredSurgeries = useMemo(() => {
    if (timeframe === 'All') return surgeries;

    const now = filterDate || new Date();
    return surgeries.filter(s => {
      if (!s.date) return false;
      const sDate = new Date(s.date);
      if (timeframe === 'Day') {
        return sDate.toDateString() === now.toDateString();
      }
      if (timeframe === 'Week') {
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(now.getDate() - 7);
        return sDate >= oneWeekAgo && sDate <= now;
      }
      if (timeframe === 'Month') {
        return sDate.getMonth() === now.getMonth() && sDate.getFullYear() === now.getFullYear();
      }
      if (timeframe === 'Year') {
        return sDate.getFullYear() === now.getFullYear();
      }
      return true;
    });
  }, [surgeries, timeframe, filterDate]);

  // Helper to accurately derive total costs per case from real-time surgery log data
  const getCaseCost = (s, includeOverhead) => {
    const directMedical = (parseFloat(s.supplies_cost) || 0) + 
                          (parseFloat(s.implants_cost) || 0) + 
                          (parseFloat(s.medications_cost) || 0) + 
                          (parseFloat(s.tray_cost) || 0);
    const overhead = (parseFloat(s.actual_room_cost) || 0) + 
                     (parseFloat(s.actual_labor_cost) || 0);
    return directMedical + (includeOverhead ? overhead : 0);
  };

  // Helper to accurately derive Net Revenue (Gross Billed Charges minus Insurance Write-Offs & Charity adjustments)
  const getCaseRevenue = (s) => {
    if (s.is_probono) return 0;
    if (s.revenue !== undefined && !isNaN(s.revenue)) return parseFloat(s.revenue);
    const raw = parseFloat(s.expected_reimbursement) || 0;
    const writeOff = parseFloat(s.write_off) || 0;
    return Math.max(0, raw - writeOff);
  };

  // Calculate KPIs
  const kpis = useMemo(() => {
    let totalRevenue = 0;
    let totalCosts = 0;
    let totalDurationMins = 0;
    let totalTurnoverMins = 0;
    let turnoverCount = 0;

    const totalAvailableMins =
      timeframe === 'Day' ? 2 * 8 * 60 :
      timeframe === 'Week' ? 2 * 8 * 5 * 60 :
      timeframe === 'Month' ? 2 * 8 * 20 * 60 :
      2 * 8 * 250 * 60;

    filteredSurgeries.forEach(s => {
      const revenue = getCaseRevenue(s);
      const totalSurgCost = getCaseCost(s, includeAdvancedCosts);

      totalRevenue += revenue;
      totalCosts += totalSurgCost;

      const duration = parseFloat(s.actual_duration_minutes) || parseFloat(s.duration_minutes) || 60;
      totalDurationMins += duration;

      const turnover = parseFloat(s.turnover_time);
      if (!isNaN(turnover)) {
        totalTurnoverMins += turnover;
        turnoverCount++;
      }
    });

    const ebitda = totalRevenue - totalCosts;
    const ebitdaPercent = totalRevenue > 0 ? (ebitda / totalRevenue) * 100 : 0;
    const orUtil = totalAvailableMins > 0 ? (totalDurationMins / totalAvailableMins) * 100 : 0;

    // Profitable Utilization (simplified for prototype: % of time spent on profitable cases)
    let profitableMins = 0;
    filteredSurgeries.forEach(s => {
      const revenue = getCaseRevenue(s);
      const totalSurgCost = getCaseCost(s, includeAdvancedCosts);
      if (revenue > totalSurgCost) {
        const duration = parseFloat(s.actual_duration_minutes) || parseFloat(s.duration_minutes) || 60;
        profitableMins += duration;
      }
    });

    const totalHours = totalDurationMins / 60;
    const revPerHour = totalHours > 0 ? totalRevenue / totalHours : 0;
    const marginPerHour = totalHours > 0 ? ebitda / totalHours : 0;
    const avgTurnover = turnoverCount > 0 ? Math.round(totalTurnoverMins / turnoverCount) : 0;

    return {
      totalRevenue,
      ebitda,
      ebitdaPercent: ebitdaPercent.toFixed(1),
      orUtil: Math.round(orUtil),
      profitableUtil: Math.round(totalAvailableMins > 0 ? (profitableMins / totalAvailableMins) * 100 : 0),
      revPerHour: Math.round(revPerHour),
      marginPerHour: Math.round(marginPerHour),
      avgTurnover
    };
  }, [filteredSurgeries, timeframe, includeAdvancedCosts]);

  // Surgeon Performance Data
  const surgeonPerf = useMemo(() => {
    const perfMap = {};
    filteredSurgeries.forEach(s => {
      const doc = s.doctor_name || 'Unknown Surgeon';
      if (!perfMap[doc]) perfMap[doc] = { name: doc, netMargin: 0 };

      const revenue = getCaseRevenue(s);
      const totalSurgCost = getCaseCost(s, includeAdvancedCosts);

      perfMap[doc].netMargin += (revenue - totalSurgCost);
    });

    return Object.values(perfMap)
      .sort((a, b) => b.netMargin - a.netMargin)
      .slice(0, 6); // Top 6 for optimal chart spacing without crowding
  }, [filteredSurgeries, includeAdvancedCosts]);

  // Case Profitability Distribution
  const caseProfitability = useMemo(() => {
    let highlyProfitable = 0;
    let profitable = 0;
    let breakEven = 0;
    let unprofitable = 0;

    filteredSurgeries.forEach(s => {
      const revenue = getCaseRevenue(s);
      const totalSurgCost = getCaseCost(s, includeAdvancedCosts);

      const margin = revenue > 0 ? ((revenue - totalSurgCost) / revenue) * 100 : -100;

      if (margin >= 25) highlyProfitable++;
      else if (margin >= 10) profitable++;
      else if (margin >= 0) breakEven++;
      else unprofitable++;
    });

    return [
      { name: 'Highly Profitable', value: highlyProfitable },
      { name: 'Profitable', value: profitable },
      { name: 'Break-even', value: breakEven },
      { name: 'Unprofitable', value: unprofitable }
    ];
  }, [filteredSurgeries, includeAdvancedCosts]);

  // OR Utilization Trend (Monthly)
  const orUtilTrend = useMemo(() => {
    const trendMap = {};
    surgeries.forEach(s => {
      if (!s.date) return;
      const d = new Date(s.date);
      const monthYear = d.toLocaleString('default', { month: 'short' }) + ' ' + d.getFullYear();

      if (!trendMap[monthYear]) {
        trendMap[monthYear] = { name: monthYear, totalMins: 0, profMins: 0, dateObj: d };
      }

      const duration = parseFloat(s.actual_duration_minutes) || parseFloat(s.duration_minutes) || 60;
      trendMap[monthYear].totalMins += duration;

      const revenue = getCaseRevenue(s);
      const totalSurgCost = getCaseCost(s, includeAdvancedCosts);

      if (revenue > totalSurgCost) {
        trendMap[monthYear].profMins += duration;
      }
    });

    const sortedMonths = Object.values(trendMap).sort((a, b) => a.dateObj - b.dateObj).slice(-6);

    const monthlyAvailable = 2 * 8 * 20 * 60;
    return sortedMonths.map(m => ({
      name: m.name.split(' ')[0],
      util: Math.round((m.totalMins / monthlyAvailable) * 100),
      profUtil: Math.round((m.profMins / monthlyAvailable) * 100)
    }));
  }, [surgeries, includeAdvancedCosts]);


  const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, index: _index }) => {
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    if (percent < 0.05) return null;
    return (
      <text x={x} y={y} fill="var(--text-primary)" fontSize={11} fontWeight={700} textAnchor="middle" dominantBaseline="central">
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  return (
    <div className="dashboard-content">
      {/* 6 KPI Cards Row */}
      <div className="kpi-row">
        <div className="kpi-card">
          <div className="kpi-card-header">
            <span className="kpi-label">EBITDA Margin</span>
            <div className="kpi-icon-container blue"><DollarSign size={12} /></div>
          </div>
          <span className="kpi-value" style={{ color: parseFloat(kpis.ebitdaPercent) >= 0 ? 'var(--color-green)' : 'var(--color-red)' }}>
            {kpis.ebitdaPercent}%
          </span>
          <div className="kpi-trend positive" style={{ visibility: 'hidden' }}>
            Trend
          </div>
          <div className="sparkline-container">
            <svg viewBox="0 0 100 30" width="100%" height="100%" preserveAspectRatio="none">
              <path d="M0,25 L20,20 L40,15 L60,22 L80,18 L100,12" fill="none" stroke="var(--color-blue)" strokeWidth="2" />
            </svg>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-header">
            <span className="kpi-label">Operating Room Utilization</span>
            <div className="kpi-icon-container blue"><Clock size={12} /></div>
          </div>
          <span className="kpi-value">{kpis.orUtil}%</span>
          <div className="kpi-trend positive" style={{ visibility: 'hidden' }}>
            Trend
          </div>
          <div className="sparkline-container">
            <svg viewBox="0 0 100 30" width="100%" height="100%" preserveAspectRatio="none">
              <path d="M0,25 Q15,10 30,22 T60,8 T90,12 T100,5" fill="none" stroke="var(--color-blue)" strokeWidth="2" />
            </svg>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-header">
            <span className="kpi-label">Profitable OR Utilization</span>
            <div className="kpi-icon-container green"><TrendingUp size={12} /></div>
          </div>
          <span className="kpi-value">{kpis.profitableUtil}%</span>
          <div className="kpi-trend positive" style={{ visibility: 'hidden' }}>
            Trend
          </div>
          <div className="sparkline-container">
            <svg viewBox="0 0 100 30" width="100%" height="100%" preserveAspectRatio="none">
              <path d="M0,25 Q30,12 60,20 T100,8" fill="none" stroke="var(--color-green)" strokeWidth="2" />
            </svg>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-header">
            <span className="kpi-label">Revenue per OR Hour</span>
            <div className="kpi-icon-container blue"><DollarSign size={12} /></div>
          </div>
          <span className="kpi-value">${kpis.revPerHour.toLocaleString()}</span>
          <div className="kpi-trend positive" style={{ visibility: 'hidden' }}>
            Trend
          </div>
          <div className="sparkline-container">
            <svg viewBox="0 0 100 30" width="100%" height="100%" preserveAspectRatio="none">
              <path d="M0,28 L30,24 L60,18 L100,10" fill="none" stroke="var(--color-green)" strokeWidth="2" />
            </svg>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-header">
            <span className="kpi-label">Net Margin per OR Hour</span>
            <div className="kpi-icon-container green"><TrendingUp size={12} /></div>
          </div>
          <span className="kpi-value" style={{ color: kpis.marginPerHour >= 0 ? 'var(--color-green)' : 'var(--color-red)' }}>
            {kpis.marginPerHour >= 0 ? '$' : '-$'}{Math.abs(kpis.marginPerHour).toLocaleString()}
          </span>
          <div className="kpi-trend negative" style={{ visibility: 'hidden' }}>
            Trend
          </div>
          <div className="sparkline-container">
            <svg viewBox="0 0 100 30" width="100%" height="100%" preserveAspectRatio="none">
              <path d="M0,10 L30,12 L60,22 L100,28" fill="none" stroke="var(--color-red)" strokeWidth="2" />
            </svg>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-header">
            <span className="kpi-label">Average Turnover Time</span>
            <div className="kpi-icon-container orange"><Clock size={12} /></div>
          </div>
          <span className="kpi-value">{kpis.avgTurnover}</span>
          <div className="kpi-trend positive" style={{ visibility: 'hidden' }}>
            Trend
          </div>
          <div className="sparkline-container">
            <svg viewBox="0 0 100 30" width="100%" height="100%" preserveAspectRatio="none">
              <path d="M0,25 L20,20 L40,15 L60,22 L80,18 L100,12" fill="none" stroke="var(--color-orange)" strokeWidth="2" />
            </svg>
          </div>
        </div>
      </div>

      {/* Sub-tabs menu */}
      <div className="subtabs-menu">
        <button className="subtab-item active" onClick={() => onTabChange('dashboard')}>Overview</button>
        <button className="subtab-item" onClick={() => onTabChange('or')}>ORPerformance</button>
        <button className="subtab-item" onClick={() => onTabChange('surgeons')}>Surgeon Performance</button>
        <button className="subtab-item" onClick={() => onTabChange('patients')}>Patient Registry</button>
        {/* <button className="subtab-item" onClick={() => onTabChange('financial')}>Financial Performance</button> */}
        {/* <button className="subtab-item" onClick={() => onTabChange('cpt')}>Case Profitability</button> */}
        <button className="subtab-item" onClick={() => onTabChange('cancellations')}>Case Cancellations</button>
        {/* <button className="subtab-item" onClick={() => onTabChange('supply')}>Supply Chain</button> */}
        <button className="subtab-item" onClick={() => onTabChange('ai')}>AI Insights</button>
      </div>

      {/* Middle Section: Trend, Surgeon and Case Donut Grid */}
      <div className="three-column-row">

        {/* OR Utilization Trend */}
        <div className="dashboard-card">
          <div className="card-header">
            <h3 className="card-title">OR Utilization (Last 6 Months)</h3>
          </div>
          <div style={{ width: '100%', height: '220px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={orUtilTrend} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={10} tickLine={false} />
                <YAxis stroke="var(--text-muted)" fontSize={10} domain={[0, 100]} tickLine={false} />
                <Tooltip contentStyle={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)', fontSize: '11px', color: 'var(--text-primary)', borderRadius: '8px', boxShadow: 'var(--shadow-card)' }} />
                <Line type="monotone" dataKey="util" stroke="var(--color-blue)" strokeWidth={2.5} name="OR Utilization %" dot={{ r: 4 }} />
                <Line type="monotone" dataKey="profUtil" stroke="var(--color-green)" strokeWidth={2} name="Profitable Utilization %" dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Surgeon Performance */}
        <div className="dashboard-card">
          <div className="card-header">
            <h3 className="card-title">Top Surgeon Performance (Net Margin)</h3>
          </div>
          <div style={{ width: '100%', height: '220px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={surgeonPerf} layout="vertical" margin={{ top: 5, right: 15, left: 20, bottom: 5 }}>
                <XAxis type="number" stroke="var(--text-muted)" fontSize={10} tickLine={false} />
                <YAxis dataKey="name" type="category" stroke="var(--text-muted)" fontSize={11} fontWeight={500} width={135} tickLine={false} tickFormatter={(str) => str.length > 18 ? `${str.substring(0, 16)}...` : str} />
                <Tooltip contentStyle={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)', fontSize: '11px', color: 'var(--text-primary)', borderRadius: '8px', boxShadow: 'var(--shadow-card)' }} formatter={(value) => value >= 0 ? `$${Math.round(value).toLocaleString()}` : `-$${Math.abs(Math.round(value)).toLocaleString()}`} labelFormatter={(label) => label} />
                <Bar
                  dataKey="netMargin"
                  fill="var(--color-blue)"
                  radius={[0, 4, 4, 0]}
                  barSize={14}
                  name="Net Margin"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Case Profitability */}
        <div className="dashboard-card">
          <div className="card-header">
            <h3 className="card-title">Case Profitability Analysis</h3>
          </div>
          <div style={{ width: '100%', height: '220px', display: 'flex', alignItems: 'center' }}>
            <ResponsiveContainer width="44%" height="100%">
              <PieChart>
                <Pie
                  data={caseProfitability}
                  cx="50%"
                  cy="50%"
                  innerRadius={36}
                  outerRadius={58}
                  paddingAngle={4}
                  dataKey="value"
                  labelLine={false}
                  label={renderCustomizedLabel}
                >
                  {caseProfitability.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)', fontSize: '11px', color: 'var(--text-primary)', borderRadius: '8px', boxShadow: 'var(--shadow-card)' }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="custom-legend" style={{ width: '56%', fontSize: '10.5px', paddingLeft: '4px', paddingRight: '12px' }}>
              {caseProfitability.map((entry, index) => (
                <div key={index} className="legend-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '6px', backgroundColor: 'var(--bg-subtab)', padding: '5px 8px', borderRadius: '6px', border: '1px solid var(--border-light)', whiteSpace: 'nowrap' }}>
                  <div className="legend-color" style={{ width: '8px', height: '8px', backgroundColor: COLORS[index], borderRadius: '50%', marginRight: '6px', flexShrink: 0 }}></div>
                  <div className="legend-text" style={{ color: 'var(--text-primary)', fontWeight: '600', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginRight: '6px' }}>{entry.name}</div>
                  <div className="legend-value" style={{ color: 'var(--text-primary)', fontWeight: '700', flexShrink: 0 }}>{entry.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
