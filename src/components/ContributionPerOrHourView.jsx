import React, { useState, useMemo } from 'react';
import {
  Clock,
  TrendingUp,
  DollarSign,
  Layers,
  Award,
  AlertTriangle,
  Search,
  Filter,
  Download,
  CheckCircle2,
  HelpCircle,
  X,
  Building,
  User,
  Activity,
  ArrowUpRight,
  Maximize2
} from 'lucide-react';
import {
  contributionPerOrHourService,
  OR_YIELD_TIERS,
  OR_YIELD_TIER_CONFIG,
  DEFAULT_TARGET_HOURLY_HURDLE
} from '../lib/contributionPerOrHourService.js';
import './ContributionPerOrHourView.css';

export default function ContributionPerOrHourView() {
  const [targetHurdle, setTargetHurdle] = useState(DEFAULT_TARGET_HOURLY_HURDLE);
  const [activeTab, setActiveTab] = useState('case_matrix'); // case_matrix, surgeon_benchmarks, room_economics, specialty_matrix
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSpecialty, setSelectedSpecialty] = useState('ALL');
  const [selectedRoom, setSelectedRoom] = useState('ALL');
  const [selectedTier, setSelectedTier] = useState('ALL');
  const [inspectedCase, setInspectedCase] = useState(null);

  // Load baseline seed cases
  const allCases = useMemo(() => {
    return contributionPerOrHourService.getBaselineSampleCases();
  }, []);

  // Filter cases
  const filteredCases = useMemo(() => {
    return allCases.filter(c => {
      const matchesSearch =
        !searchTerm ||
        (c.patient && c.patient.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (c.surgeonName && c.surgeonName.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (c.procedure && c.procedure.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (c.cpt_codes && c.cpt_codes.includes(searchTerm)) ||
        (c.or_room && c.or_room.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesSpecialty = selectedSpecialty === 'ALL' || c.specialty === selectedSpecialty;
      const matchesRoom = selectedRoom === 'ALL' || c.or_room === selectedRoom;

      const yieldEval = contributionPerOrHourService.calculateCaseOrYield(c, targetHurdle);
      const matchesTier = selectedTier === 'ALL' || yieldEval.yieldTier === selectedTier;

      return matchesSearch && matchesSpecialty && matchesRoom && matchesTier;
    });
  }, [allCases, searchTerm, selectedSpecialty, selectedRoom, selectedTier, targetHurdle]);

  // Overall Facility KPIs
  const facilityKpis = useMemo(() => {
    return contributionPerOrHourService.calculateFacilityYieldKpis(filteredCases, targetHurdle);
  }, [filteredCases, targetHurdle]);

  // Rollups
  const roomMetrics = useMemo(() => {
    return contributionPerOrHourService.aggregateOrRoomYield(filteredCases, targetHurdle);
  }, [filteredCases, targetHurdle]);

  const surgeonBenchmarks = useMemo(() => {
    return contributionPerOrHourService.aggregateSurgeonYield(filteredCases, targetHurdle);
  }, [filteredCases, targetHurdle]);

  const specialtyMatrix = useMemo(() => {
    return contributionPerOrHourService.aggregateSpecialtyYield(filteredCases, targetHurdle);
  }, [filteredCases, targetHurdle]);

  // Unique filter lists
  const specialties = useMemo(() => {
    return ['ALL', ...new Set(allCases.map(c => c.specialty).filter(Boolean))];
  }, [allCases]);

  const rooms = useMemo(() => {
    return ['ALL', ...new Set(allCases.map(c => c.or_room).filter(Boolean))];
  }, [allCases]);

  // Export CSV handler
  const handleExportCsv = () => {
    const headers = [
      'Surgery ID',
      'Patient',
      'MRN',
      'Procedure',
      'CPT',
      'Surgeon',
      'Specialty',
      'OR Room',
      'OR Minutes',
      'Turnover Minutes',
      'Total Room Minutes',
      'Expected CM ($)',
      'CM Per OR Minute ($)',
      'CM Per OR Hour ($)',
      'Target Hurdle ($)',
      'Yield Variance ($)',
      'Yield Index',
      'Yield Tier',
      'Turnover Drag ($)'
    ];

    const rows = filteredCases.map(c => {
      const y = contributionPerOrHourService.calculateCaseOrYield(c, targetHurdle);
      return [
        c.id,
        `"${c.patient}"`,
        c.mrn,
        `"${c.procedure}"`,
        c.cpt_codes,
        `"${c.surgeonName}"`,
        `"${c.specialty}"`,
        `"${c.or_room}"`,
        y.orMinutes,
        y.turnoverMinutes,
        y.totalRoomMinutes,
        y.expectedContributionMargin,
        y.cmPerOrMinute,
        y.cmPerOrHour,
        y.targetHourlyHurdle,
        y.yieldVarianceHourly,
        y.yieldIndex,
        y.yieldTier,
        y.turnoverDragCost
      ];
    });

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `or_contribution_yield_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="or-yield-container">
      {/* Top Header Banner */}
      <div className="or-yield-topbar">
        <div className="topbar-left">
          <div className="header-icon-badge">
            <Clock className="w-5 h-5 text-sky-400" />
          </div>
          <div>
            <h1 className="or-yield-title">Contribution Per OR Hour & Financial Yield Engine</h1>
            <p className="or-yield-subtitle">
              Operating Room Capacity Economics, Procedural Throughput Density & Turnover Drag Analytics
            </p>
          </div>
        </div>

        <div className="topbar-right">
          <div className="hurdle-control-box">
            <label className="hurdle-label">Target Hurdle / Hr:</label>
            <div className="hurdle-input-wrapper">
              <span className="currency-prefix">$</span>
              <input
                type="number"
                min="500"
                max="5000"
                step="50"
                value={targetHurdle}
                onChange={e => setTargetHurdle(Number(e.target.value) || DEFAULT_TARGET_HOURLY_HURDLE)}
                className="hurdle-input"
              />
            </div>
          </div>

          <button onClick={handleExportCsv} className="action-btn export-btn" title="Export Yield Data to CSV">
            <Download className="w-4 h-4 text-emerald-400" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Banner */}
      <div className="kpi-banner-grid">
        {/* KPI 1: Facility Avg CM / OR Hour */}
        <div className="kpi-card highlight-card">
          <div className="kpi-header">
            <span className="kpi-label">Facility Avg CM / OR Hour</span>
            <DollarSign className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="kpi-value-row">
            <span className="kpi-value">
              ${facilityKpis.facilityAvgCmPerOrHour.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
            <span className="kpi-unit">/ OR Hr</span>
          </div>
          <div className="kpi-meta-row">
            <span className={`kpi-badge ${facilityKpis.hourlyVariance >= 0 ? 'badge-emerald' : 'badge-rose'}`}>
              {facilityKpis.hourlyVariance >= 0 ? '+' : ''}${facilityKpis.hourlyVariance.toLocaleString('en-US', { minimumFractionDigits: 2 })} vs Target
            </span>
            <span className="kpi-subtext">Hurdle: ${targetHurdle.toLocaleString('en-US')}/hr</span>
          </div>
        </div>

        {/* KPI 2: Total Utilized & Occupancy Hours */}
        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Utilized OR Volume</span>
            <Clock className="w-4 h-4 text-sky-400" />
          </div>
          <div className="kpi-value-row">
            <span className="kpi-value">{facilityKpis.totalOrHours}</span>
            <span className="kpi-unit">OR Hrs</span>
          </div>
          <div className="kpi-meta-row">
            <span className="kpi-badge badge-slate">{facilityKpis.totalCases} Surgeries</span>
            <span className="kpi-subtext">Turnover: {facilityKpis.totalTurnoverHours} hrs</span>
          </div>
        </div>

        {/* KPI 3: Prime Yield Share */}
        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Prime Yield Share (≥1.5x)</span>
            <Award className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="kpi-value-row">
            <span className="kpi-value">{facilityKpis.primeYieldPct}%</span>
            <span className="kpi-unit">of cases</span>
          </div>
          <div className="kpi-meta-row">
            <span className="kpi-badge badge-emerald">{facilityKpis.primeYieldCases} High-Velocity Cases</span>
            <span className="kpi-subtext">{facilityKpis.dilutiveCases} Dilutive</span>
          </div>
        </div>

        {/* KPI 4: Turnover Drag Leakage */}
        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Turnover Drag Leakage</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="kpi-value-row">
            <span className="kpi-value">
              ${facilityKpis.totalTurnoverDrag.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="kpi-meta-row">
            <span className="kpi-badge badge-amber">Exceeds 20m Target</span>
            <span className="kpi-subtext">Evaluated @ $15/min</span>
          </div>
        </div>
      </div>

      {/* Filter and Tab Navigation Bar */}
      <div className="controls-container">
        <div className="tab-navigation">
          <button
            className={`tab-btn ${activeTab === 'case_matrix' ? 'active' : ''}`}
            onClick={() => setActiveTab('case_matrix')}
          >
            <Layers className="w-4 h-4" />
            <span>Case Yield Matrix ({filteredCases.length})</span>
          </button>
          <button
            className={`tab-btn ${activeTab === 'surgeon_benchmarks' ? 'active' : ''}`}
            onClick={() => setActiveTab('surgeon_benchmarks')}
          >
            <User className="w-4 h-4" />
            <span>Surgeon Benchmarks ({surgeonBenchmarks.length})</span>
          </button>
          <button
            className={`tab-btn ${activeTab === 'room_economics' ? 'active' : ''}`}
            onClick={() => setActiveTab('room_economics')}
          >
            <Building className="w-4 h-4" />
            <span>OR Suite Economics ({roomMetrics.length})</span>
          </button>
          <button
            className={`tab-btn ${activeTab === 'specialty_matrix' ? 'active' : ''}`}
            onClick={() => setActiveTab('specialty_matrix')}
          >
            <Activity className="w-4 h-4" />
            <span>Specialty Matrix ({specialtyMatrix.length})</span>
          </button>
        </div>

        {/* Search and Filters */}
        <div className="filters-wrapper">
          <div className="search-box">
            <Search className="w-4 h-4 text-slate-400 search-icon" />
            <input
              type="text"
              placeholder="Search surgeon, patient, procedure, CPT, OR..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="search-input"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="clear-search-btn">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="dropdown-filter">
            <label className="filter-label">Specialty:</label>
            <select
              value={selectedSpecialty}
              onChange={e => setSelectedSpecialty(e.target.value)}
              className="filter-select"
            >
              {specialties.map(s => (
                <option key={s} value={s}>
                  {s === 'ALL' ? 'All Specialties' : s}
                </option>
              ))}
            </select>
          </div>

          <div className="dropdown-filter">
            <label className="filter-label">OR Suite:</label>
            <select
              value={selectedRoom}
              onChange={e => setSelectedRoom(e.target.value)}
              className="filter-select"
            >
              {rooms.map(r => (
                <option key={r} value={r}>
                  {r === 'ALL' ? 'All Rooms' : r}
                </option>
              ))}
            </select>
          </div>

          <div className="dropdown-filter">
            <label className="filter-label">Yield Tier:</label>
            <select
              value={selectedTier}
              onChange={e => setSelectedTier(e.target.value)}
              className="filter-select"
            >
              <option value="ALL">All Yield Tiers</option>
              {Object.values(OR_YIELD_TIERS).map(tierKey => (
                <option key={tierKey} value={tierKey}>
                  {OR_YIELD_TIER_CONFIG[tierKey].shortLabel}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main Tab Content */}
      <div className="tab-content-wrapper">
        {/* TAB 1: Case-Level Yield Matrix */}
        {activeTab === 'case_matrix' && (
          <div className="table-responsive">
            <table className="yield-table">
              <thead>
                <tr>
                  <th style={{ width: '80px' }}>Case ID</th>
                  <th style={{ width: '160px' }}>Patient / MRN</th>
                  <th style={{ width: '220px' }}>Procedure & CPT</th>
                  <th style={{ width: '160px' }}>Surgeon / Specialty</th>
                  <th style={{ width: '90px' }}>Room</th>
                  <th style={{ width: '90px', textAlign: 'right' }}>OR Mins</th>
                  <th style={{ width: '90px', textAlign: 'right' }}>Turnover</th>
                  <th style={{ width: '120px', textAlign: 'right' }}>Contribution Margin</th>
                  <th style={{ width: '130px', textAlign: 'right' }}>CM / OR Hour</th>
                  <th style={{ width: '90px', textAlign: 'center' }}>Yield Index</th>
                  <th style={{ width: '140px', textAlign: 'center' }}>Yield Tier</th>
                  <th style={{ width: '110px', textAlign: 'right' }}>Turnover Drag</th>
                  <th style={{ width: '80px', textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCases.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="empty-state-cell">
                      <div className="empty-state-box">
                        <AlertTriangle className="w-8 h-8 text-amber-400 mb-2" />
                        <p className="empty-title">No surgical cases match the selected filters.</p>
                        <p className="empty-subtitle">Try adjusting your search keywords, specialty, or yield tier filter.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredCases.map(c => {
                    const y = contributionPerOrHourService.calculateCaseOrYield(c, targetHurdle);
                    return (
                      <tr key={c.id} className="yield-row">
                        <td className="font-mono text-slate-400">#{c.id}</td>
                        <td>
                          <div className="patient-name">{c.patient}</div>
                          <div className="patient-mrn">{c.mrn}</div>
                        </td>
                        <td>
                          <div className="procedure-name" title={c.procedure}>{c.procedure}</div>
                          <span className="cpt-badge">CPT {c.cpt_codes}</span>
                        </td>
                        <td>
                          <div className="surgeon-name">{c.surgeonName}</div>
                          <div className="specialty-sub">{c.specialty}</div>
                        </td>
                        <td>
                          <span className="room-pill">{c.or_room}</span>
                        </td>
                        <td className="text-right font-mono text-slate-200">
                          {y.orMinutes}m
                        </td>
                        <td className="text-right font-mono">
                          <span className={y.turnoverMinutes > 20 ? 'text-amber-400 font-semibold' : 'text-slate-400'}>
                            {y.turnoverMinutes}m
                          </span>
                        </td>
                        <td className="text-right font-mono">
                          <span className={y.expectedContributionMargin >= 0 ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                            ${y.expectedContributionMargin.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </span>
                        </td>
                        <td className="text-right font-mono">
                          <span className={`yield-highlight ${y.cmPerOrHour >= targetHurdle ? 'text-emerald-300' : y.cmPerOrHour >= 0 ? 'text-amber-300' : 'text-rose-400'}`}>
                            ${y.cmPerOrHour.toLocaleString('en-US', { minimumFractionDigits: 2 })}/hr
                          </span>
                          <div className="minute-subtext">(${y.cmPerOrMinute}/min)</div>
                        </td>
                        <td className="text-center font-mono">
                          <span className={`index-pill ${y.yieldIndex >= 1.5 ? 'badge-emerald' : y.yieldIndex >= 1.0 ? 'badge-sky' : y.yieldIndex >= 0 ? 'badge-amber' : 'badge-rose'}`}>
                            {y.yieldIndex}x
                          </span>
                        </td>
                        <td className="text-center">
                          <span className={`tier-badge ${y.tierConfig.badgeClass}`}>
                            {y.tierConfig.shortLabel}
                          </span>
                        </td>
                        <td className="text-right font-mono">
                          {y.turnoverDragCost > 0 ? (
                            <span className="text-amber-400 font-medium">+${y.turnoverDragCost.toFixed(2)}</span>
                          ) : (
                            <span className="text-slate-500">$0.00</span>
                          )}
                        </td>
                        <td className="text-center">
                          <button
                            onClick={() => setInspectedCase({ caseRecord: c, yieldMetrics: y })}
                            className="inspect-btn"
                            title="Inspect Deterministic Formulas & Breakdown"
                          >
                            <Maximize2 className="w-3.5 h-3.5 text-sky-400" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 2: Surgeon Yield Benchmarks */}
        {activeTab === 'surgeon_benchmarks' && (
          <div className="table-responsive">
            <table className="yield-table">
              <thead>
                <tr>
                  <th style={{ width: '60px' }}>Rank</th>
                  <th style={{ width: '220px' }}>Surgeon</th>
                  <th style={{ width: '180px' }}>Primary Specialty</th>
                  <th style={{ width: '100px', textAlign: 'right' }}>Total Cases</th>
                  <th style={{ width: '120px', textAlign: 'right' }}>Total OR Hours</th>
                  <th style={{ width: '160px', textAlign: 'right' }}>Total Contribution</th>
                  <th style={{ width: '160px', textAlign: 'right' }}>Avg CM / OR Hour</th>
                  <th style={{ width: '140px', textAlign: 'center' }}>Target Hurdle Compliance</th>
                  <th style={{ width: '120px', textAlign: 'center' }}>Prime Cases</th>
                  <th style={{ width: '120px', textAlign: 'center' }}>Dilutive Cases</th>
                </tr>
              </thead>
              <tbody>
                {surgeonBenchmarks.map((s, idx) => (
                  <tr key={s.surgeonName} className="yield-row">
                    <td className="font-mono text-slate-400">#{idx + 1}</td>
                    <td>
                      <div className="surgeon-name font-semibold">{s.surgeonName}</div>
                    </td>
                    <td>
                      <span className="specialty-pill">{s.specialty}</span>
                    </td>
                    <td className="text-right font-mono text-slate-200">{s.totalCases}</td>
                    <td className="text-right font-mono text-slate-300">{s.totalOrHours} hrs</td>
                    <td className="text-right font-mono text-emerald-400 font-semibold">
                      ${s.totalExpectedCM.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="text-right font-mono">
                      <span className={`yield-highlight ${s.avgCmPerOrHour >= targetHurdle ? 'text-emerald-300' : 'text-amber-300'}`}>
                        ${s.avgCmPerOrHour.toLocaleString('en-US', { minimumFractionDigits: 2 })}/hr
                      </span>
                    </td>
                    <td className="text-center font-mono">
                      <span className={`index-pill ${s.hurdleCompliancePct >= 80 ? 'badge-emerald' : s.hurdleCompliancePct >= 50 ? 'badge-sky' : 'badge-amber'}`}>
                        {s.hurdleCompliancePct}%
                      </span>
                    </td>
                    <td className="text-center font-mono text-emerald-400 font-medium">
                      {s.primeYieldCases}
                    </td>
                    <td className="text-center font-mono">
                      {s.dilutiveCases > 0 ? (
                        <span className="text-rose-400 font-semibold">{s.dilutiveCases}</span>
                      ) : (
                        <span className="text-slate-500">0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 3: OR Suite Economics */}
        {activeTab === 'room_economics' && (
          <div className="table-responsive">
            <table className="yield-table">
              <thead>
                <tr>
                  <th style={{ width: '140px' }}>Operating Room</th>
                  <th style={{ width: '100px', textAlign: 'right' }}>Cases Evaluated</th>
                  <th style={{ width: '130px', textAlign: 'right' }}>Utilized OR Time</th>
                  <th style={{ width: '130px', textAlign: 'right' }}>Turnover Time</th>
                  <th style={{ width: '140px', textAlign: 'right' }}>Total Occupancy</th>
                  <th style={{ width: '160px', textAlign: 'right' }}>Total Contribution</th>
                  <th style={{ width: '160px', textAlign: 'right' }}>CM / Utilized OR Hr</th>
                  <th style={{ width: '160px', textAlign: 'right' }}>CM / Total Occupancy Hr</th>
                  <th style={{ width: '130px', textAlign: 'center' }}>Prime Yield %</th>
                  <th style={{ width: '140px', textAlign: 'right' }}>Turnover Drag</th>
                </tr>
              </thead>
              <tbody>
                {roomMetrics.map(rm => (
                  <tr key={rm.roomName} className="yield-row">
                    <td>
                      <span className="room-pill large-pill">{rm.roomName}</span>
                    </td>
                    <td className="text-right font-mono text-slate-200">{rm.totalCases}</td>
                    <td className="text-right font-mono text-slate-300">{rm.totalOrHours} hrs</td>
                    <td className="text-right font-mono text-amber-400 font-medium">
                      {roundToTwo(rm.totalTurnoverMinutes / 60)} hrs
                    </td>
                    <td className="text-right font-mono text-slate-400">{rm.totalOccupancyHours} hrs</td>
                    <td className="text-right font-mono text-emerald-400 font-semibold">
                      ${rm.totalExpectedCM.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="text-right font-mono">
                      <span className="text-emerald-300 font-bold">
                        ${rm.avgCmPerUtilizedHour.toLocaleString('en-US', { minimumFractionDigits: 2 })}/hr
                      </span>
                    </td>
                    <td className="text-right font-mono text-slate-300">
                      ${rm.avgCmPerOccupancyHour.toLocaleString('en-US', { minimumFractionDigits: 2 })}/hr
                    </td>
                    <td className="text-center font-mono">
                      <span className={`index-pill ${rm.primeYieldPct >= 50 ? 'badge-emerald' : 'badge-sky'}`}>
                        {rm.primeYieldPct}%
                      </span>
                    </td>
                    <td className="text-right font-mono text-amber-400">
                      ${rm.totalTurnoverDrag.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 4: Specialty Matrix */}
        {activeTab === 'specialty_matrix' && (
          <div className="table-responsive">
            <table className="yield-table">
              <thead>
                <tr>
                  <th style={{ width: '200px' }}>Specialty</th>
                  <th style={{ width: '100px', textAlign: 'right' }}>Total Cases</th>
                  <th style={{ width: '120px', textAlign: 'right' }}>Total OR Hours</th>
                  <th style={{ width: '130px', textAlign: 'right' }}>Avg Case Duration</th>
                  <th style={{ width: '130px', textAlign: 'right' }}>Avg Turnover</th>
                  <th style={{ width: '160px', textAlign: 'right' }}>Total Contribution</th>
                  <th style={{ width: '160px', textAlign: 'right' }}>Avg CM / OR Hour</th>
                  <th style={{ width: '130px', textAlign: 'center' }}>High-Yield %</th>
                </tr>
              </thead>
              <tbody>
                {specialtyMatrix.map(sp => (
                  <tr key={sp.specialty} className="yield-row">
                    <td>
                      <span className="specialty-pill font-semibold">{sp.specialty}</span>
                    </td>
                    <td className="text-right font-mono text-slate-200">{sp.totalCases}</td>
                    <td className="text-right font-mono text-slate-300">{sp.totalOrHours} hrs</td>
                    <td className="text-right font-mono text-slate-300">{sp.avgCaseMinutes} mins</td>
                    <td className="text-right font-mono text-slate-400">{sp.avgTurnoverMinutes} mins</td>
                    <td className="text-right font-mono text-emerald-400 font-semibold">
                      ${sp.totalExpectedCM.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="text-right font-mono">
                      <span className={`yield-highlight ${sp.avgCmPerOrHour >= targetHurdle ? 'text-emerald-300' : 'text-amber-300'}`}>
                        ${sp.avgCmPerOrHour.toLocaleString('en-US', { minimumFractionDigits: 2 })}/hr
                      </span>
                    </td>
                    <td className="text-center font-mono">
                      <span className={`index-pill ${sp.highYieldPct >= 50 ? 'badge-emerald' : 'badge-sky'}`}>
                        {sp.highYieldPct}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Inspect Deterministic Calculation Modal */}
      {inspectedCase && (
        <div className="modal-backdrop" onClick={() => setInspectedCase(null)}>
          <div className="modal-dialog" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-row">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <h3 className="modal-title">Deterministic OR Yield Audit Breakdown</h3>
              </div>
              <button onClick={() => setInspectedCase(null)} className="modal-close-btn">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="modal-body">
              {/* Header details */}
              <div className="modal-case-summary">
                <div className="summary-col">
                  <div className="sum-label">Patient</div>
                  <div className="sum-val">{inspectedCase.caseRecord.patient}</div>
                  <div className="sum-sub">{inspectedCase.caseRecord.mrn}</div>
                </div>
                <div className="summary-col">
                  <div className="sum-label">Procedure & CPT</div>
                  <div className="sum-val">{inspectedCase.caseRecord.procedure}</div>
                  <div className="sum-sub">CPT {inspectedCase.caseRecord.cpt_codes}</div>
                </div>
                <div className="summary-col">
                  <div className="sum-label">Surgeon / Room</div>
                  <div className="sum-val">{inspectedCase.caseRecord.surgeonName}</div>
                  <div className="sum-sub">{inspectedCase.caseRecord.or_room} • {inspectedCase.caseRecord.specialty}</div>
                </div>
              </div>

              {/* Step-by-step audit steps */}
              <div className="audit-steps-container">
                <h4 className="audit-section-heading">Deterministic Formula Execution Steps</h4>

                <div className="step-card">
                  <div className="step-num">Step 1</div>
                  <div className="step-details">
                    <div className="step-title">Perioperative Room Time Allocation</div>
                    <div className="step-formula">
                      OR Mins = <span className="val-text">{inspectedCase.yieldMetrics.orMinutes}m</span> • Turnover = <span className="val-text">{inspectedCase.yieldMetrics.turnoverMinutes}m</span>
                    </div>
                    <div className="step-result">
                      Total Room Occupancy = {inspectedCase.yieldMetrics.totalRoomMinutes} minutes ({roundToTwo(inspectedCase.yieldMetrics.totalRoomMinutes / 60)} hours)
                    </div>
                  </div>
                </div>

                <div className="step-card">
                  <div className="step-num">Step 2</div>
                  <div className="step-details">
                    <div className="step-title">Contribution Margin Per Minute Calculation</div>
                    <div className="step-formula">
                      CM per Min = Expected CM (${inspectedCase.yieldMetrics.expectedContributionMargin.toFixed(2)}) ÷ OR Minutes ({inspectedCase.yieldMetrics.orMinutes}m)
                    </div>
                    <div className="step-result">
                      Result = <span className="val-highlight">${inspectedCase.yieldMetrics.cmPerOrMinute.toFixed(2)} / OR Minute</span>
                    </div>
                  </div>
                </div>

                <div className="step-card">
                  <div className="step-num">Step 3</div>
                  <div className="step-details">
                    <div className="step-title">Contribution Margin Per Utilized OR Hour</div>
                    <div className="step-formula">
                      CM per Hour = (${inspectedCase.yieldMetrics.cmPerOrMinute.toFixed(2)} / min) × 60 minutes
                    </div>
                    <div className="step-result">
                      Result = <span className="val-highlight font-bold">${inspectedCase.yieldMetrics.cmPerOrHour.toFixed(2)} / OR Hour</span>
                    </div>
                  </div>
                </div>

                <div className="step-card">
                  <div className="step-num">Step 4</div>
                  <div className="step-details">
                    <div className="step-title">Facility Hurdle Rate Comparison & Yield Index</div>
                    <div className="step-formula">
                      Variance = ${inspectedCase.yieldMetrics.cmPerOrHour.toFixed(2)} - ${inspectedCase.yieldMetrics.targetHourlyHurdle.toFixed(2)} | Index = ${inspectedCase.yieldMetrics.cmPerOrHour.toFixed(2)} ÷ ${inspectedCase.yieldMetrics.targetHourlyHurdle.toFixed(2)}
                    </div>
                    <div className="step-result">
                      Hourly Variance = <span className={inspectedCase.yieldMetrics.yieldVarianceHourly >= 0 ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                        {inspectedCase.yieldMetrics.yieldVarianceHourly >= 0 ? '+' : ''}${inspectedCase.yieldMetrics.yieldVarianceHourly.toFixed(2)}/hr
                      </span> (Index: {inspectedCase.yieldMetrics.yieldIndex}x)
                    </div>
                  </div>
                </div>

                <div className="step-card">
                  <div className="step-num">Step 5</div>
                  <div className="step-details">
                    <div className="step-title">Turnover Drag Cost Penalty</div>
                    <div className="step-formula">
                      Threshold = 20.0 minutes standard | Excess = GREATEST(0, {inspectedCase.yieldMetrics.turnoverMinutes} - 20) = {Math.max(0, inspectedCase.yieldMetrics.turnoverMinutes - 20)}m
                    </div>
                    <div className="step-result">
                      Drag Cost @ $15.00/min = <span className="text-amber-400 font-semibold">${inspectedCase.yieldMetrics.turnoverDragCost.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                <div className="step-card highlight-step">
                  <div className="step-num">Tier</div>
                  <div className="step-details">
                    <div className="step-title">Authoritative Classification</div>
                    <div className="step-result">
                      <span className={`tier-badge ${inspectedCase.yieldMetrics.tierConfig.badgeClass}`}>
                        {inspectedCase.yieldMetrics.tierConfig.label}
                      </span>
                    </div>
                    <div className="step-desc text-slate-300 mt-1">
                      {inspectedCase.yieldMetrics.tierConfig.description}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button onClick={() => setInspectedCase(null)} className="modal-dismiss-btn">
                Close Audit Breakdown
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function roundToTwo(num) {
  if (num === null || num === undefined || isNaN(num)) return 0.00;
  return Math.round((Number(num) + Number.EPSILON) * 100) / 100;
}
