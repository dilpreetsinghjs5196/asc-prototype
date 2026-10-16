import React, { useState, useEffect } from 'react';
import { 
  Activity, Search, RefreshCw, Download, 
  Eye, Shield, AlertTriangle, CheckCircle2, Bot, 
  Server, Laptop, Clock, X, ChevronLeft, 
  ChevronRight, Database
} from 'lucide-react';
import { db } from '../lib/supabase';
import { rbacService } from '../lib/rbacService';

export default function AuditLogViewer({ activeFacility, _theme }) {
  const session = db.getSession();
  const userRole = rbacService.normalizeRole(session?.role);
  const canExport = ['super_admin', 'org_admin', 'facility_admin', 'cfo', 'compliance_auditor', 'auditor'].includes(userRole);

  // Filter States
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [totalCount, setTotalCount] = useState(0);

  const [actionFilter, setActionFilter] = useState('ALL');
  const [sourceFilter, setSourceFilter] = useState('ALL');
  const [tableFilter, setTableFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('30d'); // 'today', '7d', '30d', 'all'
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [refreshKey, setRefreshKey] = useState(0);

  // Diff Modal State
  const [selectedLog, setSelectedLog] = useState(null);
  const [activeModalTab, setActiveModalTab] = useState('diff'); // 'diff', 'previous', 'new', 'metadata'

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        const facilityId = activeFacility?.id;
        const now = new Date();
        let startDate;
        if (dateFilter === 'today') {
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        } else if (dateFilter === '7d') {
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
        } else if (dateFilter === '30d') {
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
        }

        const options = {
          limit: pageSize,
          offset: (currentPage - 1) * pageSize,
          tableName: tableFilter !== 'ALL' ? tableFilter : undefined,
          action: actionFilter !== 'ALL' ? actionFilter : undefined,
          source: sourceFilter !== 'ALL' ? sourceFilter : undefined,
          startDate: startDate,
          search: searchQuery.trim() || undefined
        };

        const fetchedLogs = await db.getAuditLogs(facilityId, options);
        if (!cancelled) {
          setLogs(fetchedLogs || []);
          setTotalCount(fetchedLogs?.totalCount ?? (fetchedLogs ? fetchedLogs.length : 0));
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load audit logs:', err);
          setError('Unable to retrieve audit records. Please verify security permissions.');
          setLogs([]);
          setLoading(false);
        }
      }
    }

    Promise.resolve().then(() => {
      if (!cancelled) {
        setLoading(true);
        setError(null);
        loadData();
      }
    });

    return () => {
      cancelled = true;
    };
  }, [activeFacility, actionFilter, sourceFilter, tableFilter, searchQuery, dateFilter, currentPage, pageSize, refreshKey]);

  const handleRefresh = () => setRefreshKey(prev => prev + 1);

  // Handle Export CSV
  const handleExportCSV = () => {
    if (!canExport || logs.length === 0) return;

    const headers = ['Timestamp', 'Action', 'Source', 'Entity Table', 'Record ID', 'Actor Email', 'IP Address', 'Correlation ID'];
    const rows = logs.map(l => [
      `"${new Date(l.timestamp).toISOString()}"`,
      `"${l.action || ''}"`,
      `"${l.source || 'SYSTEM'}"`,
      `"${l.table_name || ''}"`,
      `"${l.record_id || ''}"`,
      `"${l.actor_email || 'System'}"`,
      `"${l.ip_address || ''}"`,
      `"${l.correlation_id || ''}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `audit_trail_${activeFacility?.name || 'facility'}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Record audit event for export (Phase 24/25 hardened telemetry)
    if (db.logExportAuditEvent) {
      db.logExportAuditEvent({
        exportType: 'CSV',
        tableName: 'audit_logs',
        recordCount: logs.length,
        facilityId: activeFacility?.id,
        filterMetadata: {
          format: 'CSV',
          actionFilter,
          sourceFilter,
          tableFilter
        }
      });
    } else {
      db.logAuditEvent({
        action: 'EXPORT',
        table_name: 'audit_logs',
        record_id: `export-${logs.length}`,
        source: 'UI',
        metadata: { record_count: logs.length, format: 'CSV' }
      });
    }
  };

  const getActionBadge = (action) => {
    const act = String(action || '').toUpperCase();
    let badgeClass;
    let icon = <Activity size={12} />;

    switch (act) {
      case 'INSERT':
        badgeClass = 'badge-insert';
        icon = <CheckCircle2 size={12} />;
        break;
      case 'UPDATE':
        badgeClass = 'badge-update';
        icon = <RefreshCw size={12} />;
        break;
      case 'DELETE':
        badgeClass = 'badge-delete';
        icon = <AlertTriangle size={12} />;
        break;
      case 'FREEZE':
        badgeClass = 'badge-freeze';
        icon = <Shield size={12} />;
        break;
      case 'AI_ANALYSIS':
      case 'EXECUTE':
        badgeClass = 'badge-ai';
        icon = <Bot size={12} />;
        break;
      case 'EXPORT':
        badgeClass = 'badge-export';
        icon = <Download size={12} />;
        break;
      case 'LOGIN':
      case 'LOGOUT':
        badgeClass = 'badge-auth';
        icon = <Clock size={12} />;
        break;
      default:
        badgeClass = 'badge-secondary';
    }

    return (
      <span className={`audit-action-badge ${badgeClass}`}>
        {icon}
        <span>{act}</span>
      </span>
    );
  };

  const getSourceBadge = (source) => {
    const src = String(source || 'SYSTEM').toUpperCase();
    if (src === 'AI_AGENT') {
      return (
        <span className="audit-source-pill source-ai" title="Dispatched by AI Multi-Agent Engine">
          <Bot size={12} /> AI Agent
        </span>
      );
    }
    if (src === 'UI') {
      return (
        <span className="audit-source-pill source-ui" title="User Interface Action">
          <Laptop size={12} /> UI
        </span>
      );
    }
    return (
      <span className="audit-source-pill source-system" title="Database Trigger or Background Job">
        <Server size={12} /> System
      </span>
    );
  };

  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  return (
    <div className="audit-viewer-container">
      {/* Header & Controls Card */}
      <div className="dashboard-card audit-header-card">
        <div className="audit-title-row">
          <div className="audit-title-meta">
            <h2 className="audit-main-title">
              <Shield size={22} style={{ color: 'var(--color-blue, #3b82f6)' }} />
              Enterprise Compliance Audit Ledger
            </h2>
            <p className="audit-subtitle">
              HIPAA § 164.312(b) Immutable Transaction Audit Trail, Field-Level Diffs, and AI Provenance
            </p>
          </div>
          <div className="audit-actions-right">
            <button 
              className="btn-header"
              onClick={handleRefresh}
              disabled={loading}
              title="Refresh Audit Records"
            >
              <RefreshCw size={14} className={loading ? 'spin' : ''} />
              <span>Refresh</span>
            </button>
            {canExport && (
              <button 
                className="btn-header btn-primary"
                onClick={handleExportCSV}
                disabled={loading || logs.length === 0}
                title="Export Filtered Audit Trail"
              >
                <Download size={14} />
                <span>Export CSV</span>
              </button>
            )}
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="audit-filter-toolbar">
          {/* Action Filter */}
          <div className="audit-filter-item">
            <label className="audit-filter-label">Action</label>
            <select 
              className="date-range-selector audit-select"
              value={actionFilter}
              onChange={(e) => { setActionFilter(e.target.value); setCurrentPage(1); }}
            >
              <option value="ALL">All Actions</option>
              <option value="INSERT">INSERT</option>
              <option value="UPDATE">UPDATE</option>
              <option value="DELETE">DELETE</option>
              <option value="FREEZE">FREEZE</option>
              <option value="AI_ANALYSIS">AI_ANALYSIS</option>
              <option value="EXPORT">EXPORT</option>
              <option value="LOGIN">LOGIN</option>
              <option value="OVERRIDE">OVERRIDE</option>
            </select>
          </div>

          {/* Source Filter */}
          <div className="audit-filter-item">
            <label className="audit-filter-label">Source</label>
            <select 
              className="date-range-selector audit-select"
              value={sourceFilter}
              onChange={(e) => { setSourceFilter(e.target.value); setCurrentPage(1); }}
            >
              <option value="ALL">All Sources</option>
              <option value="UI">UI (User Client)</option>
              <option value="AI_AGENT">AI Agent</option>
              <option value="SYSTEM">System Trigger</option>
              <option value="API">API Integration</option>
            </select>
          </div>

          {/* Entity Table Filter */}
          <div className="audit-filter-item">
            <label className="audit-filter-label">Entity Table</label>
            <select 
              className="date-range-selector audit-select"
              value={tableFilter}
              onChange={(e) => { setTableFilter(e.target.value); setCurrentPage(1); }}
            >
              <option value="ALL">All Entities</option>
              <option value="surgeries">surgeries</option>
              <option value="patients">patients</option>
              <option value="surgeons">surgeons</option>
              <option value="operating_rooms">operating_rooms</option>
              <option value="cpt_codes">cpt_codes</option>
              <option value="or_block_schedule">or_block_schedule</option>
              <option value="staff">staff</option>
              <option value="payers">payers</option>
              <option value="surgery_financial_snapshots">financial_snapshots</option>
            </select>
          </div>

          {/* Timeframe Filter */}
          <div className="audit-filter-item">
            <label className="audit-filter-label">Timeframe</label>
            <select 
              className="date-range-selector audit-select"
              value={dateFilter}
              onChange={(e) => { setDateFilter(e.target.value); setCurrentPage(1); }}
            >
              <option value="today">Today</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="all">All Time</option>
            </select>
          </div>

          {/* Substring Search */}
          <div className="audit-filter-item audit-search-item">
            <label className="audit-filter-label">Search</label>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Search actor, record ID, or table..."
                className="date-range-selector audit-search-input"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              />
              {searchQuery && (
                <button
                  className="audit-search-clear-btn"
                  onClick={() => { setSearchQuery(''); setCurrentPage(1); }}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Ledger Table Card */}
      <div className="dashboard-card audit-table-card">
        {error && (
          <div className="audit-error-banner">
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        )}

        <div className="custom-table-container audit-table-wrapper">
          <table className="custom-table audit-table">
            <thead>
              <tr>
                <th style={{ width: '170px' }}>Timestamp</th>
                <th style={{ width: '130px' }}>Action</th>
                <th style={{ width: '110px' }}>Source</th>
                <th style={{ width: '140px' }}>Entity</th>
                <th style={{ width: '120px' }}>Record ID</th>
                <th>Actor</th>
                <th style={{ width: '120px' }}>IP Address</th>
                <th style={{ width: '110px', textAlign: 'center' }}>Details</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '40px' }}>
                    <div className="audit-loading-spinner">
                      <RefreshCw size={24} className="spin" style={{ color: 'var(--color-blue, #3b82f6)' }} />
                      <span style={{ marginTop: '12px', display: 'block', color: 'var(--text-secondary)' }}>
                        Querying immutable audit ledger...
                      </span>
                    </div>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: '48px' }}>
                    <Database size={36} style={{ color: 'var(--text-muted)', marginBottom: '12px' }} />
                    <div style={{ fontWeight: '600', color: 'var(--text-primary)', marginBottom: '4px' }}>
                      No Audit Records Found
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      No events matched the selected action, source, or timeframe filters.
                    </div>
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const recordDate = new Date(log.timestamp);
                  const formattedDate = recordDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
                  const formattedTime = recordDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });

                  return (
                    <tr key={log.id} className="audit-table-row">
                      <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{formattedDate}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{formattedTime}</div>
                      </td>
                      <td>{getActionBadge(log.action)}</td>
                      <td>{getSourceBadge(log.source)}</td>
                      <td>
                        <span className="audit-entity-tag">
                          {log.table_name}
                        </span>
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                        #{log.record_id}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div className="audit-actor-avatar">
                            {log.actor_email ? log.actor_email.charAt(0).toUpperCase() : 'S'}
                          </div>
                          <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '180px' }} title={log.actor_email || 'System'}>
                            {log.actor_email || 'System / Trigger'}
                          </span>
                        </div>
                      </td>
                      <td style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                        {log.ip_address || 'Internal'}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          className="btn-header audit-view-btn"
                          onClick={() => {
                            setSelectedLog(log);
                            setActiveModalTab(log.changed_fields && Object.keys(log.changed_fields).length > 0 ? 'diff' : 'details');
                          }}
                          title="Inspect Before/After State Diff"
                        >
                          <Eye size={13} />
                          <span>Diff</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="audit-table-footer">
          <div className="audit-footer-left">
            <span>Rows per page:</span>
            <select
              className="date-range-selector audit-select"
              style={{ width: '70px', padding: '2px 8px', height: '30px' }}
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span style={{ marginLeft: '12px' }}>
              Showing {logs.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}–{Math.min(currentPage * pageSize, totalCount)} of {totalCount} events
            </span>
          </div>

          <div className="audit-footer-right">
            <button
              className="btn-header"
              style={{ padding: '0 10px', height: '30px' }}
              disabled={currentPage === 1 || loading}
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            >
              <ChevronLeft size={14} /> Previous
            </button>
            <span style={{ padding: '0 8px', fontWeight: '600' }}>
              Page {currentPage} of {totalPages}
            </span>
            <button
              className="btn-header"
              style={{ padding: '0 10px', height: '30px' }}
              disabled={currentPage >= totalPages || loading}
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Visual State Diff & Provenance Modal */}
      {selectedLog && (
        <div className="audit-modal-backdrop" onClick={() => setSelectedLog(null)}>
          <div className="audit-modal-card" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="audit-modal-header">
              <div className="audit-modal-header-meta">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {getActionBadge(selectedLog.action)}
                  <span style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                    {selectedLog.table_name} #{selectedLog.record_id}
                  </span>
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Logged {new Date(selectedLog.timestamp).toLocaleString()} by {selectedLog.actor_email || 'System'} ({selectedLog.source})
                </div>
              </div>
              <button 
                className="audit-modal-close-btn"
                onClick={() => setSelectedLog(null)}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Navigation Tabs */}
            <div className="audit-modal-tabs">
              <button 
                className={`audit-modal-tab ${activeModalTab === 'diff' ? 'active' : ''}`}
                onClick={() => setActiveModalTab('diff')}
              >
                State Diff {selectedLog.changed_fields ? `(${Object.keys(selectedLog.changed_fields).length} fields)` : ''}
              </button>
              <button 
                className={`audit-modal-tab ${activeModalTab === 'previous' ? 'active' : ''}`}
                onClick={() => setActiveModalTab('previous')}
              >
                Previous State (OLD)
              </button>
              <button 
                className={`audit-modal-tab ${activeModalTab === 'new' ? 'active' : ''}`}
                onClick={() => setActiveModalTab('new')}
              >
                New State (NEW)
              </button>
              <button 
                className={`audit-modal-tab ${activeModalTab === 'metadata' ? 'active' : ''}`}
                onClick={() => setActiveModalTab('metadata')}
              >
                Metadata & Provenance
              </button>
            </div>

            {/* Modal Body */}
            <div className="audit-modal-body">
              {activeModalTab === 'diff' && (
                <div className="audit-diff-view">
                  {selectedLog.action === 'INSERT' ? (
                    <div className="audit-diff-notice notice-insert">
                      <CheckCircle2 size={16} />
                      <span>Record was created (INSERT). View New State tab for initialized values.</span>
                    </div>
                  ) : selectedLog.action === 'DELETE' ? (
                    <div className="audit-diff-notice notice-delete">
                      <AlertTriangle size={16} />
                      <span>Record was deleted (DELETE). View Previous State tab for purged record state.</span>
                    </div>
                  ) : selectedLog.changed_fields && Object.keys(selectedLog.changed_fields).length > 0 ? (
                    <div className="audit-diff-table-container">
                      <table className="audit-diff-table">
                        <thead>
                          <tr>
                            <th style={{ width: '25%' }}>Field Name</th>
                            <th style={{ width: '37.5%' }}>Previous Value (OLD)</th>
                            <th style={{ width: '37.5%' }}>New Value (NEW)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(selectedLog.changed_fields).map(([key, diff]) => (
                            <tr key={key}>
                              <td className="diff-key-cell">{key}</td>
                              <td className="diff-old-cell">
                                <pre>{JSON.stringify(diff?.old, null, 2)}</pre>
                              </td>
                              <td className="diff-new-cell">
                                <pre>{JSON.stringify(diff?.new, null, 2)}</pre>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="audit-diff-empty">
                      <span>No direct field-level diff stored for this operation. Inspect full states below.</span>
                    </div>
                  )}
                </div>
              )}

              {activeModalTab === 'previous' && (
                <div className="audit-json-box">
                  <pre>{selectedLog.previous_state ? JSON.stringify(selectedLog.previous_state, null, 2) : 'null (No previous state)'}</pre>
                </div>
              )}

              {activeModalTab === 'new' && (
                <div className="audit-json-box">
                  <pre>{selectedLog.new_state ? JSON.stringify(selectedLog.new_state, null, 2) : 'null (Record was deleted)'}</pre>
                </div>
              )}

              {activeModalTab === 'metadata' && (
                <div className="audit-metadata-container">
                  <div className="audit-meta-row">
                    <span className="audit-meta-label">Audit Log ID:</span>
                    <span className="audit-meta-value">{selectedLog.id}</span>
                  </div>
                  <div className="audit-meta-row">
                    <span className="audit-meta-label">Facility ID:</span>
                    <span className="audit-meta-value">{selectedLog.facility_id || 'Global / Organization'}</span>
                  </div>
                  <div className="audit-meta-row">
                    <span className="audit-meta-label">Actor User ID:</span>
                    <span className="audit-meta-value">{selectedLog.actor_id || 'System Process'}</span>
                  </div>
                  <div className="audit-meta-row">
                    <span className="audit-meta-label">Correlation ID:</span>
                    <span className="audit-meta-value">{selectedLog.correlation_id || 'None'}</span>
                  </div>
                  <div className="audit-meta-row">
                    <span className="audit-meta-label">Change Reason:</span>
                    <span className="audit-meta-value">{selectedLog.change_reason || 'Not specified'}</span>
                  </div>
                  <div style={{ marginTop: '16px' }}>
                    <span className="audit-meta-label" style={{ display: 'block', marginBottom: '6px' }}>Custom Telemetry Metadata:</span>
                    <div className="audit-json-box" style={{ maxHeight: '200px' }}>
                      <pre>{JSON.stringify(selectedLog.metadata || {}, null, 2)}</pre>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="audit-modal-footer">
              <button 
                className="btn-header"
                onClick={() => setSelectedLog(null)}
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
