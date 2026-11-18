import React, { useState, useMemo } from 'react';
import {
  Cpu,
  ShieldCheck,
  ShieldAlert,
  Activity,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Search,
  Filter,
  RefreshCw,
  Play,
  Terminal,
  Lock,
  Unlock,
  Hash,
  Clock,
  Sliders,
  ChevronRight,
  X,
  Layers,
  Zap,
  DollarSign,
  Scale,
  Award
} from 'lucide-react';
import {
  TOOL_DOMAINS,
  EXECUTION_STATUSES,
  CIRCUIT_STATES,
  REGISTERED_TOOL_DEFINITIONS,
  SEED_TOOL_EXECUTIONS,
  calculateGatewayTelemetry,
  dispatchToolCall,
  getCircuitBreakerState,
  resetCircuitBreaker,
  recordToolFailure
} from '../services/aiToolGatewayService';
import './AIToolGatewayView.css';

export default function AIToolGatewayView() {
  const [activeTab, setActiveTab] = useState('registry'); // 'registry', 'executions', 'resilience'
  const [searchQuery, setSearchQuery] = useState('');
  const [domainFilter, setDomainFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selectedTool, setSelectedTool] = useState(null); // Schema Modal
  const [testToolId, setTestToolId] = useState('cpt_economics_activity_based_margins');
  const [testParamsJson, setTestParamsJson] = useState('{\n  "economicQuadrant": "PRIME_YIELD_ANCHOR"\n}');
  const [testResult, setTestResult] = useState(null);
  const [isDispatching, setIsDispatching] = useState(false);
  const [executions, setExecutions] = useState(SEED_TOOL_EXECUTIONS);
  const [breakerTick, setBreakerTick] = useState(0); // Trigger re-render of breaker states
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // Telemetry KPIs
  const telemetry = useMemo(() => {
    return calculateGatewayTelemetry(executions);
  }, [executions, breakerTick]);

  // Registered Tools list
  const toolsList = useMemo(() => {
    return Object.values(REGISTERED_TOOL_DEFINITIONS);
  }, []);

  // Filtered Tools
  const filteredTools = useMemo(() => {
    return toolsList.filter(tool => {
      const matchesDomain = domainFilter === 'ALL' || tool.domain === domainFilter;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        tool.name.toLowerCase().includes(q) ||
        tool.id.toLowerCase().includes(q) ||
        tool.description.toLowerCase().includes(q);
      return matchesDomain && matchesSearch;
    });
  }, [toolsList, domainFilter, searchQuery]);

  // Filtered Executions
  const filteredExecutions = useMemo(() => {
    return executions.filter(exec => {
      const matchesStatus = statusFilter === 'ALL' || exec.executionStatus === statusFilter;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        exec.toolId.toLowerCase().includes(q) ||
        exec.userRole.toLowerCase().includes(q) ||
        exec.provenanceHash.toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [executions, statusFilter, searchQuery]);

  // Handle Interactive Dispatch Test
  const handleExecuteTest = () => {
    setIsDispatching(true);
    let parsedParams = {};
    try {
      if (testParamsJson.trim()) {
        parsedParams = JSON.parse(testParamsJson);
      }
    } catch {
      setTestResult({
        status: EXECUTION_STATUSES.VALIDATION_ERROR,
        errorMessage: 'Invalid JSON format in parameters textarea',
        latencyMs: 0
      });
      setIsDispatching(false);
      return;
    }

    setTimeout(() => {
      const response = dispatchToolCall(testToolId, parsedParams, {
        facilityId: '00000000-0000-0000-0000-000000000001',
        userId: 'usr_gateway_tester',
        role: 'facility_admin'
      });
      setTestResult(response);
      setIsDispatching(false);

      // Append to local live ledger
      const newExec = {
        id: `exec-${Date.now().toString().slice(-4)}`,
        facilityId: '00000000-0000-0000-0000-000000000001',
        userId: 'usr_gateway_tester',
        userRole: 'facility_admin',
        toolId: response.toolId,
        parametersPayload: parsedParams,
        recordsReturned: response.recordsReturned || 0,
        executionStatus: response.status,
        latencyMs: response.latencyMs,
        provenanceHash: response.provenanceHash,
        createdAt: new Date().toISOString()
      };
      setExecutions(prev => [newExec, ...prev]);
      showToast(`Executed ${response.toolId} (${response.status}) in ${response.latencyMs}ms`);
    }, 180);
  };

  const handleSimulateFailure = (toolId) => {
    recordToolFailure(toolId, '00000000-0000-0000-0000-000000000001');
    setBreakerTick(t => t + 1);
    const breaker = getCircuitBreakerState(toolId, '00000000-0000-0000-0000-000000000001');
    showToast(`Recorded fault on ${toolId}. Breaker status: ${breaker.state} (Failures: ${breaker.consecutiveFailures})`);
  };

  const handleResetBreaker = (toolId) => {
    resetCircuitBreaker(toolId, '00000000-0000-0000-0000-000000000001');
    setBreakerTick(t => t + 1);
    showToast(`Circuit breaker reset to CLOSED for ${toolId}`);
  };

  const getDomainBadge = (domain) => {
    switch (domain) {
      case TOOL_DOMAINS.CLINICAL:
        return <span className="domain-badge clinical">Clinical</span>;
      case TOOL_DOMAINS.FINANCIAL:
        return <span className="domain-badge financial">Financial</span>;
      case TOOL_DOMAINS.RCM:
        return <span className="domain-badge rcm">RCM / Billing</span>;
      case TOOL_DOMAINS.SUPPLY_CHAIN:
        return <span className="domain-badge supply">Supply Chain</span>;
      default:
        return <span className="domain-badge governance">Governance</span>;
    }
  };

  const getStatusPill = (status) => {
    switch (status) {
      case EXECUTION_STATUSES.SUCCESS:
        return <span className="status-pill pill-success"><CheckCircle2 size={12} /> Success</span>;
      case EXECUTION_STATUSES.PERMISSION_DENIED:
        return <span className="status-pill pill-danger"><Lock size={12} /> Denied</span>;
      case EXECUTION_STATUSES.CIRCUIT_OPEN:
        return <span className="status-pill pill-alert"><Zap size={12} /> Circuit Open</span>;
      case EXECUTION_STATUSES.RATE_LIMITED:
        return <span className="status-pill pill-warn"><Clock size={12} /> Throttled</span>;
      default:
        return <span className="status-pill pill-warn"><AlertTriangle size={12} /> {status}</span>;
    }
  };

  return (
    <div className="aitg-container">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="aitg-toast">
          <CheckCircle2 size={16} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top 5-Card Executive Metric Ribbon */}
      <div className="aitg-ribbon">
        <div className="aitg-ribbon-card primary">
          <div className="card-top">
            <span className="card-label">Registered Tool Contracts</span>
            <div className="icon-wrapper blue"><Cpu size={16} /></div>
          </div>
          <div className="card-metric">{telemetry.totalRegisteredTools} <span className="metric-unit">Active</span></div>
          <div className="card-footer-info">
            <span>Server-Authoritative</span>
            <span className="status-pill pill-success">100% Gated</span>
          </div>
        </div>

        <div className="aitg-ribbon-card">
          <div className="card-top">
            <span className="card-label">24-Hour Gateway Volume</span>
            <div className="icon-wrapper emerald"><Activity size={16} /></div>
          </div>
          <div className="card-metric">{telemetry.totalInvocations24h.toLocaleString()} <span className="metric-unit">Calls</span></div>
          <div className="card-footer-info">
            <span>Facility Throttle: 60 RPM</span>
            <span className="rate-badge">0 Throttles</span>
          </div>
        </div>

        <div className="aitg-ribbon-card">
          <div className="card-top">
            <span className="card-label">Authorization Reliability</span>
            <div className="icon-wrapper emerald"><ShieldCheck size={16} /></div>
          </div>
          <div className="card-metric">{telemetry.gatewaySuccessRatePct}%</div>
          <div className="card-footer-info">
            <span>Zero Unchecked Calls</span>
            <span className="status-pill pill-success">RBAC Enforced</span>
          </div>
        </div>

        <div className="aitg-ribbon-card">
          <div className="card-top">
            <span className="card-label">Avg Execution Latency</span>
            <div className="icon-wrapper slate"><Clock size={16} /></div>
          </div>
          <div className="card-metric">{telemetry.avgGatewayLatencyMs} <span className="metric-unit">ms</span></div>
          <div className="card-footer-info">
            <span>Safe Harbor Redaction</span>
            <span className="rate-badge">Sub-20ms</span>
          </div>
        </div>

        <div className="aitg-ribbon-card">
          <div className="card-top">
            <span className="card-label">Circuit Breaker Health</span>
            <div className={`icon-wrapper ${telemetry.openCircuitBreakersCount === 0 ? 'emerald' : 'crimson'}`}>
              <Zap size={16} />
            </div>
          </div>
          <div className="card-metric">{telemetry.circuitBreakerHealthStatus}</div>
          <div className="card-footer-info">
            <span>Active Breakers: {telemetry.openCircuitBreakersCount} Tripped</span>
            <span className={`status-pill ${telemetry.openCircuitBreakersCount === 0 ? 'pill-success' : 'pill-alert'}`}>
              {telemetry.openCircuitBreakersCount === 0 ? 'Protected' : 'Tripped'}
            </span>
          </div>
        </div>
      </div>

      {/* Tab Navigation Row */}
      <div className="aitg-tabs-row">
        <div className="tab-buttons">
          <button
            className={`tab-btn ${activeTab === 'registry' ? 'active' : ''}`}
            onClick={() => setActiveTab('registry')}
          >
            <Layers size={15} />
            Tool Contracts Matrix ({toolsList.length})
          </button>
          <button
            className={`tab-btn ${activeTab === 'executions' ? 'active' : ''}`}
            onClick={() => setActiveTab('executions')}
          >
            <Terminal size={15} />
            Live Execution Ledger & Provenance
          </button>
          <button
            className={`tab-btn ${activeTab === 'resilience' ? 'active' : ''}`}
            onClick={() => setActiveTab('resilience')}
          >
            <ShieldCheck size={15} />
            Circuit Breakers & Rate Limits
          </button>
        </div>
        <div className="quick-actions">
          <button className="action-btn" onClick={() => setBreakerTick(t => t + 1)}>
            <RefreshCw size={14} />
            Refresh Telemetry
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="aitg-filters-bar">
        <div className="search-box">
          <Search size={15} className="search-icon" />
          <input
            type="text"
            placeholder={activeTab === 'registry' ? "Search tools, domains, or parameters..." : "Search execution logs, hashes, or roles..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="clear-search" onClick={() => setSearchQuery('')}>
              <X size={14} />
            </button>
          )}
        </div>

        {activeTab === 'registry' && (
          <div className="filter-group">
            <Filter size={14} />
            <select value={domainFilter} onChange={(e) => setDomainFilter(e.target.value)}>
              <option value="ALL">All Domains (5)</option>
              <option value={TOOL_DOMAINS.CLINICAL}>Clinical (4)</option>
              <option value={TOOL_DOMAINS.FINANCIAL}>Financial (3)</option>
              <option value={TOOL_DOMAINS.RCM}>RCM / Billing (2)</option>
              <option value={TOOL_DOMAINS.SUPPLY_CHAIN}>Supply Chain (2)</option>
              <option value={TOOL_DOMAINS.GOVERNANCE}>Governance (1)</option>
            </select>
          </div>
        )}

        {activeTab === 'executions' && (
          <div className="filter-group">
            <Filter size={14} />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="ALL">All Statuses</option>
              <option value={EXECUTION_STATUSES.SUCCESS}>Success</option>
              <option value={EXECUTION_STATUSES.PERMISSION_DENIED}>Permission Denied</option>
              <option value={EXECUTION_STATUSES.VALIDATION_ERROR}>Validation Error</option>
              <option value={EXECUTION_STATUSES.CIRCUIT_OPEN}>Circuit Open</option>
            </select>
          </div>
        )}

        <div className="results-count">
          Showing {activeTab === 'registry' ? filteredTools.length : filteredExecutions.length} entries
        </div>
      </div>

      {/* TAB 1: Tool Registry & Contract Matrix */}
      {activeTab === 'registry' && (
        <div className="aitg-table-card">
          <div className="aitg-card-header">
            <div>
              <h3>Server-Authoritative AI Tool Definitions Registry</h3>
              <p>Strictly typed contracts mediating LLM intent into deterministic calculation engines. Raw SQL execution prohibited.</p>
            </div>
          </div>
          <div className="aitg-table-responsive">
            <table className="aitg-table">
              <thead>
                <tr>
                  <th>Tool Contract Name & ID</th>
                  <th>Domain</th>
                  <th>Required Role</th>
                  <th>Rate Limit</th>
                  <th>Max Result Rows</th>
                  <th>Safe Harbor Projector</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredTools.map(tool => (
                  <tr key={tool.id}>
                    <td>
                      <div className="tool-identity">
                        <span className="tool-name">{tool.name}</span>
                        <code className="tool-id">{tool.id}</code>
                      </div>
                    </td>
                    <td>{getDomainBadge(tool.domain)}</td>
                    <td><span className="role-tag">{tool.requiredRole}</span></td>
                    <td><strong>{tool.rateLimitRpm}</strong> RPM</td>
                    <td>{tool.maxResultRows} rows</td>
                    <td>
                      <span className="projection-count">
                        {tool.projectionFields?.length || 0} whitelisted fields
                      </span>
                    </td>
                    <td>
                      <button
                        className="btn-inspect-schema"
                        onClick={() => setSelectedTool(tool)}
                      >
                        <Terminal size={13} />
                        Inspect Schema
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: Live Execution Ledger & Provenance Runner */}
      {activeTab === 'executions' && (
        <div className="aitg-executions-layout">
          {/* Interactive Tool Dispatch Runner */}
          <div className="aitg-runner-card">
            <div className="aitg-card-header">
              <div>
                <h3>Interactive Tool Dispatch Console</h3>
                <p>Execute registered tool contracts with real-time validation, RBAC verification, and result shaping.</p>
              </div>
            </div>
            <div className="runner-body">
              <div className="runner-field">
                <label>Select Tool Contract:</label>
                <select
                  value={testToolId}
                  onChange={(e) => {
                    setTestToolId(e.target.value);
                    const def = REGISTERED_TOOL_DEFINITIONS[e.target.value];
                    if (def?.parameterSchema?.properties) {
                      const sample = {};
                      for (const [k, v] of Object.entries(def.parameterSchema.properties)) {
                        if (v.enum) sample[k] = v.enum[0];
                        else if (v.type === 'string') sample[k] = '27447';
                        else if (v.type === 'number') sample[k] = 10;
                        else if (v.type === 'boolean') sample[k] = true;
                      }
                      setTestParamsJson(JSON.stringify(sample, null, 2));
                    } else {
                      setTestParamsJson('{}');
                    }
                  }}
                >
                  {toolsList.map(t => (
                    <option key={t.id} value={t.id}>{t.name} ({t.id})</option>
                  ))}
                </select>
              </div>

              <div className="runner-field">
                <label>JSON Parameters Payload:</label>
                <textarea
                  rows={4}
                  value={testParamsJson}
                  onChange={(e) => setTestParamsJson(e.target.value)}
                  placeholder="{}"
                />
              </div>

              <div className="runner-actions">
                <button
                  className="btn-dispatch"
                  onClick={handleExecuteTest}
                  disabled={isDispatching}
                >
                  <Play size={14} />
                  {isDispatching ? 'Validating & Dispatching...' : 'Dispatch Gateway Call'}
                </button>
              </div>

              {testResult && (
                <div className={`runner-result-box ${testResult.status === EXECUTION_STATUSES.SUCCESS ? 'success' : 'error'}`}>
                  <div className="result-header">
                    <span className="result-title">Gateway Output:</span>
                    {getStatusPill(testResult.status)}
                    <span className="latency-badge">{testResult.latencyMs}ms</span>
                  </div>
                  {testResult.errorMessage && (
                    <div className="result-error-msg">{testResult.errorMessage}</div>
                  )}
                  {testResult.data && (
                    <pre className="result-json">
                      {JSON.stringify(testResult.data.slice(0, 3), null, 2)}
                    </pre>
                  )}
                  {testResult.provenanceHash && (
                    <div className="result-provenance">
                      <Hash size={12} />
                      <code>{testResult.provenanceHash}</code>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Chronological Execution Ledger Table */}
          <div className="aitg-table-card">
            <div className="aitg-card-header">
              <div>
                <h3>Immutable Cryptographic Execution Ledger</h3>
                <p>Auditable trail of all tool invocations with parameters payload, Safe Harbor redactions, and SHA-256 provenance hashes.</p>
              </div>
            </div>
            <div className="aitg-table-responsive">
              <table className="aitg-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>User & Role</th>
                    <th>Tool Contract</th>
                    <th>Latency</th>
                    <th>Status</th>
                    <th>Parameters Payload</th>
                    <th>Provenance SHA-256</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredExecutions.map(exec => (
                    <tr key={exec.id}>
                      <td>
                        <span className="timestamp-text">
                          {new Date(exec.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      </td>
                      <td>
                        <div className="user-role-cell">
                          <span className="user-id">{exec.userId}</span>
                          <span className="role-tag">{exec.userRole}</span>
                        </div>
                      </td>
                      <td>
                        <code className="tool-id">{exec.toolId}</code>
                      </td>
                      <td>
                        <span className="latency-badge">{exec.latencyMs}ms</span>
                      </td>
                      <td>{getStatusPill(exec.executionStatus)}</td>
                      <td>
                        <code className="payload-preview">
                          {JSON.stringify(exec.parametersPayload)}
                        </code>
                      </td>
                      <td>
                        <div className="provenance-hash-cell" title={exec.provenanceHash}>
                          <Hash size={12} />
                          <code>{exec.provenanceHash.slice(0, 16)}...</code>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Circuit Breakers & Resilience Health */}
      {activeTab === 'resilience' && (
        <div className="aitg-breakers-grid">
          {toolsList.map(tool => {
            const breaker = getCircuitBreakerState(tool.id, '00000000-0000-0000-0000-000000000001');
            const isClosed = breaker.state === CIRCUIT_STATES.CLOSED;
            return (
              <div key={tool.id} className={`breaker-card ${isClosed ? 'normal' : 'tripped'}`}>
                <div className="breaker-header">
                  <div className="breaker-title-block">
                    <span className="breaker-tool-name">{tool.name}</span>
                    <code className="breaker-tool-id">{tool.id}</code>
                  </div>
                  <span className={`breaker-state-badge ${breaker.state.toLowerCase()}`}>
                    {breaker.state === CIRCUIT_STATES.CLOSED && <ShieldCheck size={12} />}
                    {breaker.state === CIRCUIT_STATES.OPEN && <Zap size={12} />}
                    {breaker.state === CIRCUIT_STATES.HALF_OPEN && <Clock size={12} />}
                    {breaker.state}
                  </span>
                </div>

                <div className="breaker-stats">
                  <div className="stat-item">
                    <span className="stat-label">Consecutive Failures:</span>
                    <span className="stat-value">{breaker.consecutiveFailures} / 5</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Rate Limit Ceiling:</span>
                    <span className="stat-value">{tool.rateLimitRpm} RPM</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Trip Threshold:</span>
                    <span className="stat-value">5 Failures / 60s</span>
                  </div>
                </div>

                <div className="breaker-actions">
                  <button
                    className="btn-breaker-fault"
                    onClick={() => handleSimulateFailure(tool.id)}
                    title="Simulate backend fault to test circuit breaker trip protocol"
                  >
                    <AlertTriangle size={13} />
                    Simulate Fault
                  </button>
                  <button
                    className="btn-breaker-reset"
                    onClick={() => handleResetBreaker(tool.id)}
                    title="Reset circuit breaker state to CLOSED"
                  >
                    <Unlock size={13} />
                    Reset Breaker
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Schema Inspection Modal */}
      {selectedTool && (
        <div className="aitg-modal-overlay" onClick={() => setSelectedTool(null)}>
          <div className="aitg-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="aitg-modal-header">
              <div>
                <h3>{selectedTool.name}</h3>
                <code>{selectedTool.id}</code>
              </div>
              <button className="btn-modal-close" onClick={() => setSelectedTool(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="aitg-modal-body">
              <div className="modal-section">
                <h4>Description</h4>
                <p>{selectedTool.description}</p>
              </div>

              <div className="modal-section">
                <h4>Contract Metadata</h4>
                <div className="meta-grid">
                  <div><strong>Domain:</strong> {selectedTool.domain}</div>
                  <div><strong>Required Role:</strong> {selectedTool.requiredRole}</div>
                  <div><strong>Rate Limit:</strong> {selectedTool.rateLimitRpm} RPM</div>
                  <div><strong>Max Result Rows:</strong> {selectedTool.maxResultRows}</div>
                </div>
              </div>

              <div className="modal-section">
                <h4>JSON Schema Parameter Specification</h4>
                <pre className="schema-json">
                  {JSON.stringify(selectedTool.parameterSchema, null, 2)}
                </pre>
              </div>

              <div className="modal-section">
                <h4>Safe Harbor Projection Whitelist</h4>
                <div className="projection-tags">
                  {selectedTool.projectionFields?.map(field => (
                    <span key={field} className="proj-tag">{field}</span>
                  ))}
                </div>
              </div>
            </div>
            <div className="aitg-modal-footer">
              <button className="btn-modal-done" onClick={() => setSelectedTool(null)}>
                Close Schema Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
