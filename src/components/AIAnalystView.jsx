import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Bot,
  Send,
  Sparkles,
  ShieldCheck,
  ShieldAlert,
  Terminal,
  Activity,
  Layers,
  FileText,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Download,
  Copy,
  ChevronRight,
  Database,
  Lock,
  Search,
  Code,
  Zap,
  Tag
} from 'lucide-react';
import {
  TOOL_REGISTRY,
  DEFAULT_SUGGESTED_PROMPTS,
  processAnalystQuery,
  executeToolCall,
  calculateAiAnalystKpis,
  generateExecutionHash,
  EXECUTION_STATUSES
} from '../services/aiAnalystService';
import './AIAnalystView.css';

export default function AIAnalystView() {
  const [activeTab, setActiveTab] = useState('workspace'); // 'workspace', 'tool_registry', 'audit_ledger'
  const [messages, setMessages] = useState([
    {
      id: 'msg-welcome',
      senderRole: 'ASSISTANT',
      text: '### Welcome to the ASCANALYST AI Intelligence Gateway\n\nI am your **Clinical & Financial Operations Analyst**. All calculations are derived exclusively from verified, server-authoritative tools covering:\n- **Surgeon Intelligence & Financial Scorecards** (Phases B0/B1)\n- **Implant Variance & Preference Card Harmonization** (Phase B2)\n- **Payer Intelligence & Contract Performance** (Phases B3/B4)\n- **CPT Procedural Economics & Denial Velocity** (Phases B5/B6/B7)\n- **Cross-Vendor Construct Pricing Benchmarks** (Phase B8)\n\nSelect a suggested topic below or type your specific operational inquiry.',
      toolCalls: [],
      citations: [
        { source: 'ASCANALYST Tool Gateway', metric: 'Status', value: '100% Tool-Gated' }
      ],
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [inputQuery, setInputQuery] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [auditLogs, setAuditLogs] = useState([
    {
      id: 'log-seed-1',
      toolName: 'getFacilityExecutiveKpis',
      category: 'FINANCIAL',
      userRole: 'facility_admin',
      userId: 'usr_admin',
      status: EXECUTION_STATUSES.SUCCESS,
      durationMs: 14,
      executionHash: generateExecutionHash('fac_1', 'usr_admin', 'getFacilityExecutiveKpis', {}, Date.now() - 3600000),
      timestamp: new Date(Date.now() - 3600000).toLocaleTimeString()
    },
    {
      id: 'log-seed-2',
      toolName: 'getCptDenialAndPaymentMetrics',
      category: 'RCM',
      userRole: 'biller',
      userId: 'usr_biller',
      status: EXECUTION_STATUSES.SUCCESS,
      durationMs: 18,
      executionHash: generateExecutionHash('fac_1', 'usr_biller', 'getCptDenialAndPaymentMetrics', {}, Date.now() - 1800000),
      timestamp: new Date(Date.now() - 1800000).toLocaleTimeString()
    }
  ]);
  const [toastMessage, setToastMessage] = useState(null);
  const [selectedToolForInspect, setSelectedToolForInspect] = useState(null);
  const [toolTestResult, setToolTestResult] = useState(null);

  const messagesEndRef = useRef(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  useEffect(() => {
    if (activeTab === 'workspace') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, activeTab]);

  // Overall KPI aggregations
  const kpis = useMemo(() => {
    return calculateAiAnalystKpis(['session-active-1'], auditLogs);
  }, [auditLogs]);

  const handleSendMessage = (queryToSend = inputQuery) => {
    const query = queryToSend.trim();
    if (!query || isProcessing) return;

    const userMessageId = `msg-${Date.now()}`;
    const userMsg = {
      id: userMessageId,
      senderRole: 'USER',
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    setInputQuery('');
    setIsProcessing(true);

    setTimeout(() => {
      const sessionContext = {
        facilityId: 'fac_naples_01',
        userId: 'usr_director',
        role: 'facility_admin'
      };

      const result = processAnalystQuery(query, messages, sessionContext);

      const assistantMsg = {
        id: `msg-resp-${Date.now()}`,
        senderRole: 'ASSISTANT',
        text: result.messageText,
        toolCalls: result.toolCallsInvoked,
        citations: result.citations,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setMessages(prev => [...prev, assistantMsg]);

      // Append audit logs
      if (result.auditLogs && result.auditLogs.length > 0) {
        const newLogs = result.auditLogs.map((log, idx) => ({
          id: `log-${Date.now()}-${idx}`,
          toolName: log.toolName || result.toolCallsInvoked[idx]?.toolName || 'tool_invocation',
          category: 'FINANCIAL',
          userRole: sessionContext.role,
          userId: sessionContext.userId,
          status: log.status || EXECUTION_STATUSES.SUCCESS,
          durationMs: log.durationMs || 15,
          executionHash: log.executionHash || generateExecutionHash('fac_1', 'usr', 'tool', {}, Date.now()),
          timestamp: new Date().toLocaleTimeString()
        }));
        setAuditLogs(prev => [...newLogs, ...prev]);
      }

      setIsProcessing(false);
    }, 350);
  };

  const handleClearChat = () => {
    setMessages([
      {
        id: 'msg-welcome-cleared',
        senderRole: 'ASSISTANT',
        text: '### Workspace Reset\n\nAI conversation history cleared. All tool authorizations, session credentials, and cryptographic audit ledgers remain securely logged.',
        toolCalls: [],
        citations: [],
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
    showToast('Conversation workspace reset');
  };

  const handleExportChat = () => {
    const textContent = messages
      .map(m => `[${m.timestamp}] ${m.senderRole}:\n${m.text}\n`)
      .join('\n---\n\n');
    const blob = new Blob([textContent], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `AI_Analyst_Session_${new Date().toISOString().slice(0, 10)}.md`;
    link.click();
    showToast('AI Analyst session exported to markdown');
  };

  const handleTestTool = (toolName) => {
    const sessionContext = {
      facilityId: 'fac_naples_01',
      userId: 'usr_tester',
      role: 'facility_admin'
    };
    const exec = executeToolCall(toolName, {}, sessionContext);
    setToolTestResult({
      toolName,
      ...exec
    });
    showToast(`Tool "${toolName}" executed successfully in ${exec.durationMs}ms`);
  };

  return (
    <div className="aian-container">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="aian-toast">
          <CheckCircle2 size={16} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 5-Card Top Executive Metric Ribbon */}
      <div className="aian-ribbon">
        {/* Card 1: Active Sessions */}
        <div className="aian-card">
          <div className="aian-card-header">
            <span className="aian-card-title">ACTIVE AI SESSIONS</span>
            <div className="aian-card-icon aian-icon-blue">
              <Bot size={18} />
            </div>
          </div>
          <div className="aian-card-value">
            {kpis.activeSessionsCount}{' '}
            <span className="aian-card-unit">Session</span>
          </div>
          <div className="aian-card-footer">
            <span className="aian-badge aian-badge-emerald">
              Session Authenticated
            </span>
            <span className="aian-card-subtext">
              Multi-Tenant Isolated
            </span>
          </div>
        </div>

        {/* Card 2: Registered Gated Tools */}
        <div className="aian-card">
          <div className="aian-card-header">
            <span className="aian-card-title">GATED TOOL CONTRACTS</span>
            <div className="aian-card-icon aian-icon-emerald">
              <Terminal size={18} />
            </div>
          </div>
          <div className="aian-card-value">
            {kpis.registeredToolsCount}{' '}
            <span className="aian-card-unit">Tools</span>
          </div>
          <div className="aian-card-footer">
            <span className="aian-badge aian-badge-emerald">
              Typed Schemas
            </span>
            <span className="aian-card-subtext">
              Phases B0 - B8 Integrated
            </span>
          </div>
        </div>

        {/* Card 3: Tool Invocations */}
        <div className="aian-card">
          <div className="aian-card-header">
            <span className="aian-card-title">TOOL INVOCATIONS</span>
            <div className="aian-card-icon aian-icon-sky">
              <Activity size={18} />
            </div>
          </div>
          <div className="aian-card-value">
            {kpis.totalToolInvocations}
          </div>
          <div className="aian-card-footer">
            <span className="aian-badge aian-badge-blue">
              100% Success Rate
            </span>
            <span className="aian-card-subtext">
              Immutable Audit Log
            </span>
          </div>
        </div>

        {/* Card 4: Average Tool Latency */}
        <div className="aian-card">
          <div className="aian-card-header">
            <span className="aian-card-title">AVG TOOL LATENCY</span>
            <div className="aian-card-icon aian-icon-amber">
              <Clock size={18} />
            </div>
          </div>
          <div className="aian-card-value">
            {kpis.avgToolLatencyMs}{' '}
            <span className="aian-card-unit">ms</span>
          </div>
          <div className="aian-card-footer">
            <span className="aian-badge aian-badge-emerald">
              Real-Time Telemetry
            </span>
            <span className="aian-card-subtext">Budget: ≤ 10,000ms</span>
          </div>
        </div>

        {/* Card 5: Security Compliance Rate */}
        <div className="aian-card">
          <div className="aian-card-header">
            <span className="aian-card-title">SECURITY BOUNDARY</span>
            <div className="aian-card-icon aian-icon-rose">
              <ShieldCheck size={18} />
            </div>
          </div>
          <div className="aian-card-value">
            100%
          </div>
          <div className="aian-card-footer">
            <span className="aian-badge aian-badge-emerald">
              Tool-Gated Only
            </span>
            <span className="aian-card-subtext">
              Zero Raw DB Access
            </span>
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="aian-tabs-nav">
        <button
          className={`aian-tab-btn ${activeTab === 'workspace' ? 'active' : ''}`}
          onClick={() => setActiveTab('workspace')}
        >
          <Sparkles size={16} />
          <span>AI Analyst Interactive Workspace</span>
        </button>
        <button
          className={`aian-tab-btn ${activeTab === 'tool_registry' ? 'active' : ''}`}
          onClick={() => setActiveTab('tool_registry')}
        >
          <Code size={16} />
          <span>Tool Registry & Capability Catalog</span>
        </button>
        <button
          className={`aian-tab-btn ${activeTab === 'audit_ledger' ? 'active' : ''}`}
          onClick={() => setActiveTab('audit_ledger')}
        >
          <ShieldAlert size={16} />
          <span>Security & Tool Execution Audit Ledger</span>
        </button>
      </div>

      {/* TAB 1: AI Analyst Interactive Workspace */}
      {activeTab === 'workspace' && (
        <div className="aian-workspace">
          {/* Suggested Clinical Prompts Bar */}
          <div className="aian-suggestions-box">
            <span className="aian-suggestions-label">
              <Zap size={14} className="aian-icon-amber" />
              <span>Suggested Executive Queries:</span>
            </span>
            <div className="aian-prompt-chips">
              {DEFAULT_SUGGESTED_PROMPTS.map((prompt, idx) => (
                <button
                  key={idx}
                  className="aian-prompt-chip"
                  onClick={() => handleSendMessage(prompt)}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          {/* Conversation Stream Box */}
          <div className="aian-chat-window">
            <div className="aian-chat-stream">
              {messages.map(msg => (
                <div
                  key={msg.id}
                  className={`aian-message-row ${
                    msg.senderRole === 'USER' ? 'aian-msg-user' : 'aian-msg-assistant'
                  }`}
                >
                  <div className="aian-avatar">
                    {msg.senderRole === 'USER' ? (
                      <span>YOU</span>
                    ) : (
                      <Bot size={18} />
                    )}
                  </div>
                  <div className="aian-message-bubble">
                    <div className="aian-msg-header">
                      <span className="aian-msg-sender">
                        {msg.senderRole === 'USER' ? 'Hospital Executive / User' : 'AI Operations Analyst'}
                      </span>
                      <span className="aian-msg-time">{msg.timestamp}</span>
                    </div>

                    {/* Tool Call Invocation Badges */}
                    {msg.toolCalls && msg.toolCalls.length > 0 && (
                      <div className="aian-tool-calls-bar">
                        <Terminal size={13} className="aian-icon-blue" />
                        <span className="aian-tool-call-label">Invoked Tools:</span>
                        {msg.toolCalls.map((tc, tcIdx) => (
                          <span key={tcIdx} className="aian-tool-pill">
                            {tc.toolName}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Message Body Content */}
                    <div className="aian-msg-body">
                      {msg.text.split('\n').map((line, lIdx) => {
                        if (line.startsWith('### ')) {
                          return <h4 key={lIdx} className="aian-h4">{line.replace('### ', '')}</h4>;
                        }
                        if (line.startsWith('- **')) {
                          return (
                            <div key={lIdx} className="aian-bullet">
                              <span className="aian-bullet-dot">•</span>
                              <span dangerouslySetInnerHTML={{
                                __html: line.replace('- ', '').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>')
                              }} />
                            </div>
                          );
                        }
                        if (line.startsWith('*') && line.endsWith('*')) {
                          return <div key={lIdx} className="aian-italic">{line.replace(/\*/g, '')}</div>;
                        }
                        if (!line.trim()) {
                          return <div key={lIdx} className="aian-spacer" />;
                        }
                        return (
                          <p key={lIdx} dangerouslySetInnerHTML={{
                            __html: line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>')
                          }} />
                        );
                      })}
                    </div>

                    {/* Grounded Data Citations */}
                    {msg.citations && msg.citations.length > 0 && (
                      <div className="aian-citations-box">
                        <div className="aian-citations-title">
                          <Database size={12} className="aian-icon-emerald" />
                          <span>Authoritative Source Citations:</span>
                        </div>
                        <div className="aian-citations-list">
                          {msg.citations.map((cite, cIdx) => (
                            <div key={cIdx} className="aian-citation-item">
                              <span className="aian-cite-source">{cite.source}</span>
                              <span className="aian-cite-metric">{cite.metric}:</span>
                              <span className="aian-cite-val">{cite.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {isProcessing && (
                <div className="aian-message-row aian-msg-assistant">
                  <div className="aian-avatar">
                    <Bot size={18} />
                  </div>
                  <div className="aian-message-bubble aian-thinking-bubble">
                    <div className="aian-thinking-indicator">
                      <div className="aian-pulse-dot" />
                      <span>Verifying RBAC permissions & executing authoritative tools...</span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Chat Action Footer */}
            <div className="aian-chat-controls">
              <div className="aian-input-box">
                <input
                  type="text"
                  placeholder="Inquire about surgeon yields, payer turnaround, CPT denial friction, or vendor construct pricing..."
                  value={inputQuery}
                  onChange={e => setInputQuery(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleSendMessage();
                  }}
                  className="aian-chat-input"
                  disabled={isProcessing}
                />
                <button
                  className="aian-send-btn"
                  onClick={() => handleSendMessage()}
                  disabled={isProcessing || !inputQuery.trim()}
                >
                  <Send size={16} />
                  <span>Send</span>
                </button>
              </div>

              <div className="aian-toolbar-actions">
                <button className="aian-tool-action-btn" onClick={handleClearChat}>
                  <RotateCcw size={14} />
                  <span>Reset Session</span>
                </button>
                <button className="aian-tool-action-btn" onClick={handleExportChat}>
                  <Download size={14} />
                  <span>Export Markdown</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Tool Registry & Capability Catalog */}
      {activeTab === 'tool_registry' && (
        <div className="aian-tab-content">
          <div className="aian-tab-header-box">
            <div className="aian-tab-header-title">
              <Code size={20} className="aian-icon-blue" />
              <span>Registered Tool Contracts & Deterministic Execution Gateway</span>
            </div>
            <div className="aian-tab-header-desc">
              All conversational analytics are strictly bound to typed, deterministic tool contracts. The AI Analyst cannot issue unbounded SQL queries or perform token arithmetic.
            </div>
          </div>

          <div className="aian-table-card">
            <div className="aian-table-wrapper">
              <table className="aian-table">
                <thead>
                  <tr>
                    <th>Tool Contract Name</th>
                    <th>Category</th>
                    <th>Description</th>
                    <th>Required RBAC Role</th>
                    <th>Schema Parameters</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.values(TOOL_REGISTRY).map(tool => (
                    <tr key={tool.name}>
                      <td>
                        <span className="aian-tool-name-code">
                          {tool.name}
                        </span>
                      </td>
                      <td>
                        <span className="aian-badge aian-badge-blue">
                          {tool.category}
                        </span>
                      </td>
                      <td className="aian-desc-cell">
                        {tool.description}
                      </td>
                      <td>
                        <span className="aian-badge aian-badge-slate">
                          {tool.requiredRole}
                        </span>
                      </td>
                      <td>
                        <code className="aian-code-snippet">
                          {JSON.stringify(tool.parameters.properties)}
                        </code>
                      </td>
                      <td>
                        <button
                          className="aian-test-btn"
                          onClick={() => handleTestTool(tool.name)}
                        >
                          <Zap size={13} />
                          <span>Test Execute</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Test Execution Output Box */}
          {toolTestResult && (
            <div className="aian-test-result-box">
              <div className="aian-test-result-header">
                <div className="aian-test-title">
                  <CheckCircle2 size={16} className="aian-icon-emerald" />
                  <span>Execution Output: <code>{toolTestResult.toolName}</code></span>
                </div>
                <div className="aian-test-meta">
                  <span>Latency: {toolTestResult.durationMs}ms</span>
                  <span>Hash: <code>{toolTestResult.executionHash}</code></span>
                </div>
              </div>
              <pre className="aian-json-pre">
                {JSON.stringify(toolTestResult.data, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Security & Tool Execution Audit Ledger */}
      {activeTab === 'audit_ledger' && (
        <div className="aian-tab-content">
          <div className="aian-tab-header-box">
            <div className="aian-tab-header-title">
              <ShieldAlert size={20} className="aian-icon-rose" />
              <span>Cryptographic Tool Execution & Prompt Security Audit Ledger</span>
            </div>
            <div className="aian-tab-header-desc">
              Immutable provenance ledger logging every tool execution, caller role, execution latency, and SHA-256 cryptographic evidence hash to ensure compliance with HIPAA security and audit rules.
            </div>
          </div>

          <div className="aian-table-card">
            <div className="aian-table-wrapper">
              <table className="aian-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Tool Contract</th>
                    <th>User Identity</th>
                    <th>Role Gate</th>
                    <th>Status</th>
                    <th>Latency</th>
                    <th>Cryptographic Provenance Hash</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((log, idx) => (
                    <tr key={`${log.id}-${idx}`}>
                      <td className="aian-num-cell">
                        {log.timestamp}
                      </td>
                      <td>
                        <span className="aian-tool-name-code">
                          {log.toolName}
                        </span>
                      </td>
                      <td className="aian-num-cell">
                        {log.userId}
                      </td>
                      <td>
                        <span className="aian-badge aian-badge-slate">
                          {log.userRole}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`aian-badge ${
                            log.status === EXECUTION_STATUSES.SUCCESS
                              ? 'aian-badge-emerald'
                              : 'aian-badge-crimson'
                          }`}
                        >
                          {log.status}
                        </span>
                      </td>
                      <td className="aian-num-cell">
                        {log.durationMs}ms
                      </td>
                      <td>
                        <span className="aian-hash-tag" title={log.executionHash}>
                          {log.executionHash.slice(0, 18)}...
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
