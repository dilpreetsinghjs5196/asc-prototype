import React, { useState, useMemo } from 'react';
import {
  Code2,
  Database,
  Cpu,
  Sliders,
  Play,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Search,
  Filter,
  RefreshCw,
  FileCheck,
  X,
  Layers,
  Zap,
  Clock,
  ChevronRight,
  TrendingUp,
  DollarSign,
  Activity,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  BarChart3,
  Calendar,
  Save,
  Check
} from 'lucide-react';
import {
  TOOL_DOMAINS,
  RISK_TIERS,
  REGISTERED_TOOL_SCHEMAS,
  SEED_CONSTRUCT_STANDARDIZATION_DATA,
  validateToolCall,
  executeToolByName,
  simulateOrBlockReallocation,
  simulateConstructStandardization,
  saveScenarioSimulation,
  getToolDefinitionsTelemetry,
  SAVED_SCENARIO_SIMULATIONS
} from '../services/aiToolDefinitionsService';
import './AIToolDefinitionsView.css';

export default function AIToolDefinitionsView() {
  const [activeTab, setActiveTab] = useState('schemas'); // 'schemas', 'tester', 'simulators', 'history'
  const [domainFilter, setDomainFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSchema, setSelectedSchema] = useState(null); // Schema Inspector Modal
  
  // Tester State
  const [testerToolId, setTesterToolId] = useState('case_financial_ledger_query');
  const [testerParams, setTesterParams] = useState({ minMarginPct: 50, limit: 10 });
  const [testerResult, setTesterResult] = useState(null);
  const [isExecuting, setIsExecuting] = useState(false);

  // Simulator State: OR Block Reallocation
  const [reallocParams, setReallocParams] = useState({
    sourceSurgeonId: 'SURG-012',
    targetSurgeonId: 'SURG-003',
    reallocatedHoursWeekly: 8,
    durationWeeks: 26
  });
  const [reallocResult, setReallocResult] = useState(() => {
    try {
      return simulateOrBlockReallocation({
        sourceSurgeonId: 'SURG-012',
        targetSurgeonId: 'SURG-003',
        reallocatedHoursWeekly: 8,
        durationWeeks: 26
      });
    } catch {
      return null;
    }
  });

  // Simulator State: Construct Standardization
  const [constructParams, setConstructParams] = useState({
    constructCategory: 'SPINE_PEDICLE_SCREW_CONSTRUCT',
    standardizedVendorId: 'stryker',
    targetComplianceRatePct: 85,
    annualConstructVolume: 120
  });
  const [constructResult, setConstructResult] = useState(() => {
    try {
      return simulateConstructStandardization({
        constructCategory: 'SPINE_PEDICLE_SCREW_CONSTRUCT',
        standardizedVendorId: 'stryker',
        targetComplianceRatePct: 85,
        annualConstructVolume: 120
      });
    } catch {
      return null;
    }
  });

  const [savedSimulations, setSavedSimulations] = useState(SAVED_SCENARIO_SIMULATIONS);
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  const telemetry = useMemo(() => {
    return getToolDefinitionsTelemetry();
  }, [savedSimulations]);

  // Filtered Tool Schemas
  const filteredSchemas = useMemo(() => {
    return Object.values(REGISTERED_TOOL_SCHEMAS).filter(s => {
      const matchesDomain = domainFilter === 'ALL' || s.domain === domainFilter;
      const matchesSearch = !searchQuery || 
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.description.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesDomain && matchesSearch;
    });
  }, [domainFilter, searchQuery]);

  // Execute Live Tool Test
  const handleRunToolTest = () => {
    setIsExecuting(true);
    setTimeout(() => {
      const res = executeToolByName(testerToolId, testerParams);
      setTesterResult(res);
      setIsExecuting(false);
      if (res.status === 'SUCCESS') {
        showToast(`Successfully executed ${testerToolId}`);
      } else {
        showToast(`Execution warning: ${res.errors?.join(', ') || 'Failed'}`);
      }
    }, 150);
  };

  // Re-run OR Reallocation Simulation
  const handleRunReallocSimulation = () => {
    try {
      const res = simulateOrBlockReallocation(reallocParams);
      setReallocResult(res);
      showToast('OR Block Reallocation simulation recalculated');
    } catch (err) {
      showToast(`Simulation error: ${err.message}`);
    }
  };

  // Re-run Construct Standardization Simulation
  const handleRunConstructSimulation = () => {
    try {
      const res = simulateConstructStandardization(constructParams);
      setConstructResult(res);
      showToast('Construct Standardization simulation recalculated');
    } catch (err) {
      showToast(`Simulation error: ${err.message}`);
    }
  };

  // Save Simulation to Ledger
  const handleSaveSimulation = (simData) => {
    if (!simData) return;
    const saved = saveScenarioSimulation(simData);
    setSavedSimulations([...SAVED_SCENARIO_SIMULATIONS]);
    showToast(`Simulation '${saved.title}' saved to auditable ledger!`);
  };

  return (
    <div className="aitd-container">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="aitd-toast">
          <CheckCircle2 size={16} className="text-emerald-500" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top 5-Card Executive Metric Ribbon */}
      <div className="aitd-ribbon">
        <div className="aitd-ribbon-card primary">
          <div className="card-top">
            <span className="card-label">Registered Schemas</span>
            <div className="icon-wrapper blue"><Code2 size={16} /></div>
          </div>
          <div className="card-metric">{telemetry.totalRegisteredTools} <span className="metric-unit">Contracts</span></div>
          <div className="card-footer-info">
            <span>Draft-07 Verified</span>
            <span className="status-pill pill-success">100% Validated</span>
          </div>
        </div>

        <div className="aitd-ribbon-card">
          <div className="card-top">
            <span className="card-label">Active Query Domains</span>
            <div className="icon-wrapper emerald"><Database size={16} /></div>
          </div>
          <div className="card-metric">{telemetry.activeQueryDomains} <span className="metric-unit">Domains</span></div>
          <div className="card-footer-info">
            <span>Case, Surgeon, Payer, OR</span>
            <span className="status-pill pill-success">Full Coverage</span>
          </div>
        </div>

        <div className="aitd-ribbon-card">
          <div className="card-top">
            <span className="card-label">Predictive Simulators</span>
            <div className="icon-wrapper amber"><Sliders size={16} /></div>
          </div>
          <div className="card-metric">{telemetry.activeScenarioEngines} <span className="metric-unit">Engines</span></div>
          <div className="card-footer-info">
            <span>Block & Implant Models</span>
            <span className="status-pill pill-warn">What-If Active</span>
          </div>
        </div>

        <div className="aitd-ribbon-card">
          <div className="card-top">
            <span className="card-label">Contract Health</span>
            <div className="icon-wrapper emerald"><ShieldCheck size={16} /></div>
          </div>
          <div className="card-metric">{telemetry.schemaHealthPct}% <span className="metric-unit">Passed</span></div>
          <div className="card-footer-info">
            <span>Type & Range Checking</span>
            <span className="status-pill pill-success">Zero Drift</span>
          </div>
        </div>

        <div className="aitd-ribbon-card">
          <div className="card-top">
            <span className="card-label">Deterministic Latency</span>
            <div className="icon-wrapper blue"><Activity size={16} /></div>
          </div>
          <div className="card-metric">{telemetry.avgDeterministicLatencyMs} <span className="metric-unit">ms</span></div>
          <div className="card-footer-info">
            <span>Server-Authoritative</span>
            <span className="rate-badge">Ultra-Fast</span>
          </div>
        </div>
      </div>

      {/* Main Navigation Tabs */}
      <div className="aitd-tabs-row">
        <div className="tab-buttons">
          <button
            className={`tab-btn ${activeTab === 'schemas' ? 'active' : ''}`}
            onClick={() => setActiveTab('schemas')}
          >
            <Layers size={16} />
            <span>Tool Schemas Catalog ({telemetry.totalRegisteredTools})</span>
          </button>
          <button
            className={`tab-btn ${activeTab === 'tester' ? 'active' : ''}`}
            onClick={() => setActiveTab('tester')}
          >
            <Play size={16} />
            <span>Interactive Query Tester</span>
          </button>
          <button
            className={`tab-btn ${activeTab === 'simulators' ? 'active' : ''}`}
            onClick={() => setActiveTab('simulators')}
          >
            <Sliders size={16} />
            <span>What-If Scenario Simulators</span>
          </button>
          <button
            className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            <Clock size={16} />
            <span>Saved Simulations ({savedSimulations.length})</span>
          </button>
        </div>
      </div>

      {/* TAB 1: TOOL SCHEMAS CATALOG */}
      {activeTab === 'schemas' && (
        <div className="tab-pane">
          {/* Filter Bar */}
          <div className="catalog-filter-bar">
            <div className="domain-pills">
              {['ALL', 'CASE', 'SURGEON', 'PAYER', 'CPT', 'OR', 'RCM', 'SCENARIO'].map(d => (
                <button
                  key={d}
                  className={`domain-pill ${domainFilter === d ? 'active' : ''}`}
                  onClick={() => setDomainFilter(d)}
                >
                  {d}
                </button>
              ))}
            </div>
            <div className="search-box">
              <Search size={15} className="search-icon" />
              <input
                type="text"
                placeholder="Search schemas, fields, handlers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Schemas Grid */}
          <div className="schemas-grid">
            {filteredSchemas.map((schema) => {
              const reqProps = schema.inputSchema?.required || [];
              const propKeys = Object.keys(schema.inputSchema?.properties || {});

              return (
                <div key={schema.id} className="schema-card">
                  <div className="schema-card-header">
                    <span className={`domain-tag tag-${schema.domain.toLowerCase()}`}>{schema.domain}</span>
                    <span className="rate-limit-badge">{schema.rateLimitRpm} RPM</span>
                  </div>
                  <h3 className="schema-name">{schema.name}</h3>
                  <code className="schema-id">{schema.id}</code>
                  <p className="schema-desc">{schema.description}</p>

                  <div className="schema-meta-grid">
                    <div className="meta-item">
                      <span className="meta-label">Permission Gate</span>
                      <span className="meta-val font-mono">{schema.requiredPermission}</span>
                    </div>
                    <div className="meta-item">
                      <span className="meta-label">Risk Tier</span>
                      <span className={`risk-badge risk-${schema.riskTier.toLowerCase()}`}>
                        {schema.riskTier === 'PROPOSED_MUTATION' ? 'HITL Dual-Key' : 'Read-Only'}
                      </span>
                    </div>
                    <div className="meta-item">
                      <span className="meta-label">Parameters</span>
                      <span className="meta-val">{propKeys.length} defined ({reqProps.length} required)</span>
                    </div>
                    <div className="meta-item">
                      <span className="meta-label">Handler</span>
                      <span className="meta-val font-mono">{schema.handlerFunction}</span>
                    </div>
                  </div>

                  <div className="schema-actions">
                    <button 
                      className="btn-schema-inspect"
                      onClick={() => setSelectedSchema(schema)}
                    >
                      <Code2 size={14} />
                      <span>Inspect Schema</span>
                    </button>
                    <button 
                      className="btn-schema-test"
                      onClick={() => {
                        setTesterToolId(schema.id);
                        setActiveTab('tester');
                      }}
                    >
                      <Play size={14} />
                      <span>Test Query</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: INTERACTIVE QUERY TESTER */}
      {activeTab === 'tester' && (
        <div className="tab-pane">
          <div className="tester-layout">
            {/* Left Config Panel */}
            <div className="tester-config-card">
              <div className="panel-header">
                <Play size={18} className="text-sky-400" />
                <h2>Authoritative Tool Execution</h2>
              </div>
              <p className="panel-desc">
                Execute parameterized queries through the deterministic engine to inspect server responses, calculated financials, and cryptographic provenance.
              </p>

              <div className="form-group">
                <label>Select Tool Schema</label>
                <select 
                  value={testerToolId}
                  onChange={(e) => {
                    setTesterToolId(e.target.value);
                    setTesterResult(null);
                  }}
                  className="select-input"
                >
                  {Object.values(REGISTERED_TOOL_SCHEMAS).map(s => (
                    <option key={s.id} value={s.id}>
                      [{s.domain}] {s.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Dynamic Sample Parameters based on selected tool */}
              <div className="form-group">
                <label>Input Parameters (JSON)</label>
                <textarea
                  className="params-textarea font-mono"
                  rows={6}
                  value={JSON.stringify(testerParams, null, 2)}
                  onChange={(e) => {
                    try {
                      setTesterParams(JSON.parse(e.target.value));
                    } catch {
                      // allow editing
                    }
                  }}
                />
              </div>

              <div className="sample-presets-row">
                <span className="presets-label">Quick Presets:</span>
                <button 
                  className="btn-preset"
                  onClick={() => {
                    setTesterToolId('case_financial_ledger_query');
                    setTesterParams({ minMarginPct: 50, limit: 5 });
                  }}
                >
                  Case Ledger
                </button>
                <button 
                  className="btn-preset"
                  onClick={() => {
                    setTesterToolId('case_cost_composition');
                    setTesterParams({ caseId: 'CASE-2026-1049' });
                  }}
                >
                  Cost Breakdown
                </button>
                <button 
                  className="btn-preset"
                  onClick={() => {
                    setTesterToolId('surgeon_scorecard_query');
                    setTesterParams({ timeframe: 'LAST_90_DAYS' });
                  }}
                >
                  Surgeon Scores
                </button>
                <button 
                  className="btn-preset"
                  onClick={() => {
                    setTesterToolId('payer_contract_performance_query');
                    setTesterParams({ lookbackDays: 90 });
                  }}
                >
                  Payer DSO
                </button>
                <button 
                  className="btn-preset"
                  onClick={() => {
                    setTesterToolId('denials_carc_frequency');
                    setTesterParams({ carcGroup: 'CO', limit: 5 });
                  }}
                >
                  CARC Denials
                </button>
              </div>

              <button 
                className="btn-execute-primary"
                onClick={handleRunToolTest}
                disabled={isExecuting}
              >
                {isExecuting ? <RefreshCw className="animate-spin" size={16} /> : <Play size={16} />}
                <span>{isExecuting ? 'Executing Query...' : 'Execute Deterministic Query'}</span>
              </button>
            </div>

            {/* Right Results Panel */}
            <div className="tester-results-card">
              <div className="panel-header">
                <Activity size={18} className="text-emerald-400" />
                <h2>Execution Output & Cryptographic Provenance</h2>
                {testerResult && (
                  <span className={`status-badge ${testerResult.status === 'SUCCESS' ? 'badge-emerald' : 'badge-amber'}`}>
                    {testerResult.status}
                  </span>
                )}
              </div>

              {!testerResult ? (
                <div className="empty-results-state">
                  <Play size={40} className="text-slate-600 mb-2" />
                  <p>Configure parameters on the left and click "Execute Deterministic Query" to view server output.</p>
                </div>
              ) : (
                <div className="results-content">
                  {/* Provenance Row */}
                  <div className="provenance-strip">
                    <div className="prov-item">
                      <span className="prov-label">Execution Hash:</span>
                      <code className="prov-hash">{testerResult.executionHash || 'N/A'}</code>
                    </div>
                    <div className="prov-item">
                      <span className="prov-label">Timestamp:</span>
                      <span>{testerResult.executedAt ? new Date(testerResult.executedAt).toLocaleTimeString() : 'Just now'}</span>
                    </div>
                  </div>

                  {/* Formatted Output Viewer */}
                  <div className="json-viewer-box">
                    <pre className="font-mono text-xs">
                      {JSON.stringify(testerResult.data || testerResult, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: WHAT-IF SCENARIO SIMULATORS */}
      {activeTab === 'simulators' && (
        <div className="tab-pane">
          <div className="simulators-grid">
            {/* SIMULATOR 1: OR Block Reallocation */}
            <div className="sim-card">
              <div className="sim-header">
                <div className="sim-icon-box bg-blue">
                  <Clock size={20} className="text-sky-400" />
                </div>
                <div>
                  <h3 className="sim-title">OR Block Reallocation Simulator</h3>
                  <p className="sim-subtitle">Model shifting underutilized block hours to high-yield surgical services</p>
                </div>
                <span className="risk-badge risk-proposed_mutation">Tier 3 HITL</span>
              </div>

              {/* Controls */}
              <div className="sim-controls-grid">
                <div className="form-group">
                  <label>Relinquishing Surgeon (Source)</label>
                  <select 
                    value={reallocParams.sourceSurgeonId}
                    onChange={(e) => setReallocParams({ ...reallocParams, sourceSurgeonId: e.target.value })}
                    className="select-input"
                  >
                    <option value="SURG-012">Dr. Bradley Miller (Orthopedics - 54% Util, $1,120/hr)</option>
                    <option value="SURG-007">Dr. Cliff Burmiester (Orthopedics - 82% Util, $1,980/hr)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Receiving Surgeon (Target)</label>
                  <select 
                    value={reallocParams.targetSurgeonId}
                    onChange={(e) => setReallocParams({ ...reallocParams, targetSurgeonId: e.target.value })}
                    className="select-input"
                  >
                    <option value="SURG-003">Dr. Marcus Vance (Spine - 88% Util, $2,244/hr)</option>
                    <option value="SURG-018">Dr. Elena Rostova (Ophth - 91% Util, $2,450/hr)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Reallocated Hours Weekly ({reallocParams.reallocatedHoursWeekly} hrs/wk)</label>
                  <input 
                    type="range" 
                    min={2} 
                    max={16} 
                    step={2}
                    value={reallocParams.reallocatedHoursWeekly}
                    onChange={(e) => setReallocParams({ ...reallocParams, reallocatedHoursWeekly: Number(e.target.value) })}
                    className="slider-input"
                  />
                </div>

                <div className="form-group">
                  <label>Simulation Horizon ({reallocParams.durationWeeks} weeks)</label>
                  <input 
                    type="range" 
                    min={12} 
                    max={52} 
                    step={4}
                    value={reallocParams.durationWeeks}
                    onChange={(e) => setReallocParams({ ...reallocParams, durationWeeks: Number(e.target.value) })}
                    className="slider-input"
                  />
                </div>
              </div>

              <div className="sim-action-row">
                <button className="btn-recalc" onClick={handleRunReallocSimulation}>
                  <RefreshCw size={14} />
                  <span>Recalculate Projections</span>
                </button>
              </div>

              {/* Simulation Projected Results */}
              {reallocResult && (
                <div className="sim-results-box">
                  <h4 className="results-header">Projected Financial & Operational Lift</h4>
                  <div className="lift-kpis-grid">
                    <div className="lift-kpi card-emerald">
                      <span className="lift-label">Net Margin Lift ($)</span>
                      <span className="lift-val text-emerald-400">
                        +${reallocResult.deltaImpact.netMarginLift.toLocaleString()}
                      </span>
                      <span className="lift-sub">Over {reallocParams.durationWeeks} Weeks</span>
                    </div>

                    <div className="lift-kpi card-blue">
                      <span className="lift-label">Incremental Cases</span>
                      <span className="lift-val text-sky-400">
                        +{reallocResult.deltaImpact.deltaCases} Procedures
                      </span>
                      <span className="lift-sub">Net Surgical Volume Lift</span>
                    </div>

                    <div className="lift-kpi card-amber">
                      <span className="lift-label">Facility Utilization Lift</span>
                      <span className="lift-val text-amber-400">
                        +{reallocResult.deltaImpact.facilityUtilizationLiftPct}%
                      </span>
                      <span className="lift-sub">Center-Wide Capacity</span>
                    </div>
                  </div>

                  <div className="sim-details-table">
                    <div className="table-row">
                      <span>Total OR Hours Shifted:</span>
                      <strong>{reallocResult.inputs.totalHoursShifted} Hours</strong>
                    </div>
                    <div className="table-row">
                      <span>Source Opportunity Cost (Lost Margin):</span>
                      <span className="text-slate-400">-${reallocResult.projected.sourceLostContribution.toLocaleString()}</span>
                    </div>
                    <div className="table-row">
                      <span>Target Incremental Margin Gained:</span>
                      <span className="text-emerald-400">+${reallocResult.projected.targetGainedContribution.toLocaleString()}</span>
                    </div>
                    <div className="table-row">
                      <span>Statistical Confidence Score:</span>
                      <span className="text-sky-400">{reallocResult.confidenceScore}%</span>
                    </div>
                  </div>

                  <div className="sim-footer-actions">
                    <button 
                      className="btn-save-sim"
                      onClick={() => handleSaveSimulation(reallocResult)}
                    >
                      <Save size={14} />
                      <span>Save & Queue for Phase C2 HITL Approval</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* SIMULATOR 2: Construct Standardization */}
            <div className="sim-card">
              <div className="sim-header">
                <div className="sim-icon-box bg-emerald">
                  <DollarSign size={20} className="text-emerald-400" />
                </div>
                <div>
                  <h3 className="sim-title">Construct Standardization Simulator</h3>
                  <p className="sim-subtitle">Model implant vendor consolidation, rebate capture, and cost reduction</p>
                </div>
                <span className="risk-badge risk-proposed_mutation">Tier 3 HITL</span>
              </div>

              {/* Controls */}
              <div className="sim-controls-grid">
                <div className="form-group">
                  <label>Clinical Construct Category</label>
                  <select 
                    value={constructParams.constructCategory}
                    onChange={(e) => setConstructParams({ ...constructParams, constructCategory: e.target.value })}
                    className="select-input"
                  >
                    <option value="SPINE_PEDICLE_SCREW_CONSTRUCT">Spine Pedicle Screw & Rod Construct</option>
                    <option value="ACL_RECONSTRUCTION_ANCHORS">ACL Reconstruction Suture Anchors</option>
                    <option value="TOTAL_KNEE_ARTHROPLASTY_IMPLANTS">Total Knee Primary Implants</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Standardized Primary Vendor</label>
                  <select 
                    value={constructParams.standardizedVendorId}
                    onChange={(e) => setConstructParams({ ...constructParams, standardizedVendorId: e.target.value })}
                    className="select-input"
                  >
                    <option value="stryker">Stryker Orthopedics / Spine</option>
                    <option value="depuy">DePuy Synthes (Johnson & Johnson)</option>
                    <option value="arthrex">Arthrex Sports Medicine</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Target Compliance Rate ({constructParams.targetComplianceRatePct}%)</label>
                  <input 
                    type="range" 
                    min={50} 
                    max={100} 
                    step={5}
                    value={constructParams.targetComplianceRatePct}
                    onChange={(e) => setConstructParams({ ...constructParams, targetComplianceRatePct: Number(e.target.value) })}
                    className="slider-input"
                  />
                </div>

                <div className="form-group">
                  <label>Annual Construct Volume ({constructParams.annualConstructVolume} Cases)</label>
                  <input 
                    type="range" 
                    min={50} 
                    max={300} 
                    step={10}
                    value={constructParams.annualConstructVolume}
                    onChange={(e) => setConstructParams({ ...constructParams, annualConstructVolume: Number(e.target.value) })}
                    className="slider-input"
                  />
                </div>
              </div>

              <div className="sim-action-row">
                <button className="btn-recalc" onClick={handleRunConstructSimulation}>
                  <RefreshCw size={14} />
                  <span>Recalculate Projections</span>
                </button>
              </div>

              {/* Construct Results */}
              {constructResult && (
                <div className="sim-results-box">
                  <h4 className="results-header">Projected Annual Supply Savings & Rebate Yield</h4>
                  <div className="lift-kpis-grid">
                    <div className="lift-kpi card-emerald">
                      <span className="lift-label">Net Annual Savings ($)</span>
                      <span className="lift-val text-emerald-400">
                        +${constructResult.deltaImpact.netAnnualizedSavings.toLocaleString()}
                      </span>
                      <span className="lift-sub">{constructResult.deltaImpact.savingsPercentage}% Total Spend Reduction</span>
                    </div>

                    <div className="lift-kpi card-blue">
                      <span className="lift-label">Gross Direct Savings</span>
                      <span className="lift-val text-sky-400">
                        +${constructResult.deltaImpact.grossDirectSavings.toLocaleString()}
                      </span>
                      <span className="lift-sub">Unit Purchase Price Delta</span>
                    </div>

                    <div className="lift-kpi card-amber">
                      <span className="lift-label">Vendor Volume Rebate</span>
                      <span className="lift-val text-amber-400">
                        +${constructResult.deltaImpact.projectedVendorRebate.toLocaleString()}
                      </span>
                      <span className="lift-sub">Tier Capture ({constructResult.projected.rebateTierPct}%)</span>
                    </div>
                  </div>

                  <div className="sim-details-table">
                    <div className="table-row">
                      <span>Baseline Annual Spend:</span>
                      <strong>${constructResult.baseline.baselineAnnualSpend.toLocaleString()}</strong>
                    </div>
                    <div className="table-row">
                      <span>Projected Post-Standardization Spend:</span>
                      <span className="text-slate-300">${constructResult.projected.projectedAnnualSpend.toLocaleString()}</span>
                    </div>
                    <div className="table-row">
                      <span>Compliant Physician Procedures:</span>
                      <span>{constructResult.inputs.compliantVolume} / {constructResult.inputs.annualConstructVolume} ({constructParams.targetComplianceRatePct}%)</span>
                    </div>
                    <div className="table-row">
                      <span>Contracted Unit Cost:</span>
                      <span className="text-emerald-400">${constructResult.projected.standardizedUnitCost.toLocaleString()} (was ${constructResult.baseline.currentBlendedCost.toLocaleString()})</span>
                    </div>
                  </div>

                  <div className="sim-footer-actions">
                    <button 
                      className="btn-save-sim"
                      onClick={() => handleSaveSimulation(constructResult)}
                    >
                      <Save size={14} />
                      <span>Save & Queue for Phase C2 HITL Approval</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: SAVED SIMULATIONS HISTORY */}
      {activeTab === 'history' && (
        <div className="tab-pane">
          <div className="history-card">
            <div className="panel-header">
              <Clock size={18} className="text-sky-400" />
              <h2>Auditable Scenario Simulations Ledger</h2>
              <span className="count-badge">{savedSimulations.length} Records</span>
            </div>
            <p className="panel-desc">
              All what-if scenario simulations are stamped with parameter snapshots, calculated deltas, and cryptographic SHA-256 provenance hashes.
            </p>

            <div className="table-wrapper">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Scenario Title</th>
                    <th>Type</th>
                    <th>Projected Delta Impact</th>
                    <th>Confidence</th>
                    <th>Created By</th>
                    <th>Timestamp</th>
                    <th>Provenance Signature</th>
                  </tr>
                </thead>
                <tbody>
                  {savedSimulations.map((sim) => (
                    <tr key={sim.id}>
                      <td className="font-semibold text-slate-200">
                        {sim.title}
                        <div className="text-xs text-slate-500">{sim.description}</div>
                      </td>
                      <td>
                        <span className={`type-tag tag-${sim.scenarioType.toLowerCase()}`}>
                          {sim.scenarioType}
                        </span>
                      </td>
                      <td>
                        {sim.deltaImpact?.netMarginLift ? (
                          <span className="font-semibold text-emerald-400">
                            +${sim.deltaImpact.netMarginLift.toLocaleString()} Net Lift ({sim.deltaImpact.deltaCases} cases)
                          </span>
                        ) : sim.deltaImpact?.netAnnualizedSavings ? (
                          <span className="font-semibold text-emerald-400">
                            +${sim.deltaImpact.netAnnualizedSavings.toLocaleString()} Savings ({sim.deltaImpact.savingsPercentage}%)
                          </span>
                        ) : (
                          <span className="text-slate-400">Recorded</span>
                        )}
                      </td>
                      <td>
                        <span className="confidence-pill">{sim.confidenceScore}%</span>
                      </td>
                      <td className="text-xs text-slate-400">{sim.createdBy}</td>
                      <td className="text-xs text-slate-400">{new Date(sim.createdAt).toLocaleDateString()}</td>
                      <td>
                        <code className="signature-hash">{sim.provenanceHash.slice(0, 16)}...</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SCHEMA INSPECTOR MODAL */}
      {selectedSchema && (
        <div className="modal-overlay" onClick={() => setSelectedSchema(null)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="flex items-center gap-2">
                <Code2 size={20} className="text-sky-400" />
                <h3 className="modal-title">JSON Schema: {selectedSchema.name}</h3>
              </div>
              <button className="modal-close-btn" onClick={() => setSelectedSchema(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <div className="schema-overview-bar">
                <div className="overview-item">
                  <span className="label">Tool ID:</span>
                  <code className="val font-mono">{selectedSchema.id}</code>
                </div>
                <div className="overview-item">
                  <span className="label">Domain:</span>
                  <span className={`domain-tag tag-${selectedSchema.domain.toLowerCase()}`}>{selectedSchema.domain}</span>
                </div>
                <div className="overview-item">
                  <span className="label">Required Permission:</span>
                  <span className="val font-mono">{selectedSchema.requiredPermission}</span>
                </div>
                <div className="overview-item">
                  <span className="label">Rate Limit:</span>
                  <span className="val">{selectedSchema.rateLimitRpm} RPM</span>
                </div>
              </div>

              <h4 className="section-title">Input Parameter Schema (Draft-07)</h4>
              <div className="schema-code-box">
                <pre className="font-mono text-xs">
                  {JSON.stringify(selectedSchema.inputSchema, null, 2)}
                </pre>
              </div>

              <h4 className="section-title mt-4">Output Contract Schema</h4>
              <div className="schema-code-box">
                <pre className="font-mono text-xs">
                  {JSON.stringify(selectedSchema.outputSchema, null, 2)}
                </pre>
              </div>
            </div>

            <div className="modal-footer">
              <button 
                className="btn-primary"
                onClick={() => {
                  setTesterToolId(selectedSchema.id);
                  setSelectedSchema(null);
                  setActiveTab('tester');
                }}
              >
                <Play size={14} />
                <span>Test in Playground</span>
              </button>
              <button 
                className="btn-secondary"
                onClick={() => setSelectedSchema(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
