import React, { useState, useMemo, useEffect } from 'react';
import {
  GitFork,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Search,
  Sliders,
  X,
  Play,
  RotateCcw,
  Layers,
  Scale,
  DollarSign,
  History,
  Check,
  FileCheck2
} from 'lucide-react';
import {
  getDmrConfig,
  updateDmrConfig,
  getDmrTelemetry,
  getDmrMatchingRules,
  getDmrSurvivorshipPolicies,
  getDmrCandidatePairs,
  getDmrGoldenRecords,
  getDmrMergeHistory,
  getDmrMatchRuns,
  mergeCandidatePair,
  markCandidatePairDistinct,
  revertGoldenMerge,
  runDuplicateMatchScan,
  normalizeFacilityId
} from '../services/duplicateMatchingService';
import './DuplicateMatchingRulesView.css';

export default function DuplicateMatchingRulesView({ activeFacility }) {
  const facilityId = useMemo(() => normalizeFacilityId(activeFacility), [activeFacility]);
  const facilityName = typeof activeFacility === 'object' && activeFacility?.name ? activeFacility.name : 'Naples Surgery Center';

  const [activeSubTab, setActiveSubTab] = useState('candidates'); // 'candidates' | 'rules' | 'golden' | 'audit'
  const [entityFilter, setEntityFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPairId, setSelectedPairId] = useState('d4200002-0000-4000-8000-000000000002');
  const [fieldOverrides, setFieldOverrides] = useState({});
  const [actionReason, setActionReason] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [banner, setBanner] = useState({ show: false, type: 'info', message: '' });
  const [refreshKey, setRefreshKey] = useState(0);

  const [config, setConfig] = useState(null);
  const [telemetry, setTelemetry] = useState(null);
  const [rules, setRules] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [pairs, setPairs] = useState([]);
  const [goldenRecords, setGoldenRecords] = useState([]);
  const [mergeHistory, setMergeHistory] = useState([]);
  const [matchRuns, setMatchRuns] = useState([]);

  const [draftThresholds, setDraftThresholds] = useState({
    auto_merge_threshold: 95,
    manual_review_threshold: 75,
    block_exact_collisions: true,
    enable_cross_source_blocking: true
  });

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        const [cfg, tel, rls, pol, prs, gld, hist, runs] = await Promise.all([
          getDmrConfig(facilityId),
          getDmrTelemetry(facilityId),
          getDmrMatchingRules(facilityId),
          getDmrSurvivorshipPolicies(facilityId),
          getDmrCandidatePairs(facilityId),
          getDmrGoldenRecords(facilityId),
          getDmrMergeHistory(facilityId),
          getDmrMatchRuns(facilityId)
        ]);
        if (!isMounted) return;
        setConfig(cfg);
        setTelemetry(tel);
        setRules(rls);
        setPolicies(pol);
        setPairs(prs);
        setGoldenRecords(gld);
        setMergeHistory(hist);
        setMatchRuns(runs);
        setDraftThresholds({
          auto_merge_threshold: cfg.auto_merge_threshold,
          manual_review_threshold: cfg.manual_review_threshold,
          block_exact_collisions: cfg.block_exact_collisions,
          enable_cross_source_blocking: cfg.enable_cross_source_blocking
        });
      } catch (err) {
        if (isMounted) {
          setBanner({ show: true, type: 'error', message: `Failed to load Duplicate & Matching governance data: ${err.message}` });
        }
      }
    }
    loadData();
    return () => { isMounted = false; };
  }, [facilityId, refreshKey]);

  const filteredPairs = useMemo(() => {
    return pairs.filter(pair => {
      if (entityFilter !== 'ALL' && pair.entity_type !== entityFilter) return false;
      if (statusFilter !== 'ALL' && pair.resolution_status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const hay = `${pair.pair_code} ${pair.entity_type} ${pair.source_module_a} ${pair.source_module_b} ${JSON.stringify(pair.record_a_snapshot)} ${JSON.stringify(pair.record_b_snapshot)}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [pairs, entityFilter, statusFilter, searchQuery]);

  const selectedPair = useMemo(() => {
    return filteredPairs.find(p => p.id === selectedPairId) || filteredPairs[0] || null;
  }, [filteredPairs, selectedPairId]);

  const selectedPolicy = useMemo(() => {
    if (!selectedPair) return null;
    return policies.find(p => p.entity_type === selectedPair.entity_type) || null;
  }, [policies, selectedPair]);

  const showToast = (type, message) => {
    setBanner({ show: true, type, message });
  };

  const handleRunScan = async () => {
    setIsScanning(true);
    try {
      const run = await runDuplicateMatchScan(facilityId, {
        entity_scope: entityFilter,
        executed_by: 'steward@naplessurgery.com'
      });
      setRefreshKey(k => k + 1);
      showToast('success', `Deduplication scan ${run.batch_control_number} evaluated ${run.pairs_evaluated} candidate pairs (${run.sha256_sync_seal.slice(0, 22)}...).`);
    } catch (err) {
      showToast('error', err.message);
    } finally {
      setIsScanning(false);
    }
  };

  const handleMergePair = async () => {
    if (!selectedPair) return;
    try {
      const res = await mergeCandidatePair(facilityId, selectedPair.id, {
        actor_email: 'steward@naplessurgery.com',
        actor_role: 'Data Operations Steward',
        field_overrides: fieldOverrides,
        reason: actionReason.trim() || `Confirmed match (${selectedPair.confidence_score}%) and promoted golden master`
      });
      setFieldOverrides({});
      setActionReason('');
      setRefreshKey(k => k + 1);
      showToast('success', `Merged ${res.pair.pair_code} into Golden Master ${res.golden_record.golden_code} (SHA-256 sealed).`);
    } catch (err) {
      showToast('error', err.message);
    }
  };

  const handleMarkDistinct = async () => {
    if (!selectedPair) return;
    try {
      const res = await markCandidatePairDistinct(facilityId, selectedPair.id, {
        actor_email: 'steward@naplessurgery.com',
        actor_role: 'Domain Owner',
        reason: actionReason.trim()
      });
      setActionReason('');
      setRefreshKey(k => k + 1);
      showToast('success', `Confirmed ${res.pair.pair_code} as DISTINCT_NON_MATCH.`);
    } catch (err) {
      showToast('error', err.message);
    }
  };

  const handleRevertMerge = async () => {
    if (!selectedPair) return;
    try {
      const res = await revertGoldenMerge(facilityId, selectedPair.id, {
        actor_email: 'steward@naplessurgery.com',
        actor_role: 'Data Operations Steward',
        reason: actionReason.trim()
      });
      setActionReason('');
      setRefreshKey(k => k + 1);
      showToast('success', `Reverted merge for ${res.pair.pair_code}; restored lineage snapshots and flagged REVERSED.`);
    } catch (err) {
      showToast('error', err.message);
    }
  };

  const handleSaveThresholds = async (e) => {
    e.preventDefault();
    try {
      await updateDmrConfig(facilityId, draftThresholds);
      setIsSettingsOpen(false);
      setRefreshKey(k => k + 1);
      showToast('success', 'Updated deterministic matching thresholds and blocking policies.');
    } catch (err) {
      showToast('error', err.message);
    }
  };

  const badgeClassForStatus = (status) => {
    switch (status) {
      case 'AUTO_MERGED':
      case 'MANUALLY_MERGED':
        return 'dmr-badge-emerald';
      case 'PENDING_REVIEW':
      case 'DEFERRED_HOLD':
        return 'dmr-badge-amber';
      case 'CONFIRMED_DISTINCT':
        return 'dmr-badge-sky';
      case 'REVERSED':
        return 'dmr-badge-rose';
      default:
        return 'dmr-badge-slate';
    }
  };

  const badgeClassForConfidence = (score) => {
    const val = Number(score || 0);
    if (val >= 95) return 'dmr-badge-emerald';
    if (val >= 85) return 'dmr-badge-sky';
    if (val >= 75) return 'dmr-badge-amber';
    return 'dmr-badge-slate';
  };

  const allComparisonFields = useMemo(() => {
    if (!selectedPair) return [];
    const aKeys = Object.keys(selectedPair.record_a_snapshot || {}).filter(k => k !== 'verified_at');
    const bKeys = Object.keys(selectedPair.record_b_snapshot || {}).filter(k => k !== 'verified_at');
    return Array.from(new Set([...aKeys, ...bKeys]));
  }, [selectedPair]);

  return (
    <div className="dmr-container">
      {/* Header Bar */}
      <div className="dmr-header-bar">
        <div className="dmr-header-title">
          <div className="dmr-title-icon">
            <GitFork size={20} />
          </div>
          <div>
            <h2>Duplicate Detection, Matching Rules & Survivorship</h2>
            <p className="dmr-subtitle">
              {facilityName} · Cross-System EMPI/Entity Matching, Weight Conservation, Golden Master Lineage & Reversible Merges
            </p>
          </div>
        </div>
        <div className="dmr-header-actions">
          <button
            className="dmr-btn-secondary"
            onClick={() => setIsSettingsOpen(true)}
            title="Configure matching thresholds and collision blocking"
          >
            <Sliders size={15} />
            Threshold Rules
          </button>
          <button
            className="dmr-btn-primary"
            onClick={handleRunScan}
            disabled={isScanning}
          >
            <Play size={15} />
            {isScanning ? 'Scanning Pool...' : 'Run Deduplication Scan'}
          </button>
        </div>
      </div>

      {/* Status Banner */}
      {banner.show && (
        <div className={`dmr-banner dmr-banner-${banner.type}`}>
          <div className="dmr-banner-content">
            {banner.type === 'error' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
            <span>{banner.message}</span>
          </div>
          <button className="dmr-banner-close" onClick={() => setBanner({ ...banner, show: false })}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Telemetry Ribbon */}
      {telemetry && (
        <div className="dmr-telemetry-grid">
          <div className="dmr-kpi-card">
            <div className="dmr-kpi-label">
              <AlertTriangle size={14} className="text-amber-600" />
              Pending Review Pairs
            </div>
            <div className="dmr-kpi-value">{telemetry.pending_review_count}</div>
            <div className="dmr-kpi-meta">
              Manual floor: {telemetry.manual_review_threshold}% · Auto-merge: ≥{telemetry.auto_merge_threshold}%
            </div>
          </div>

          <div className="dmr-kpi-card">
            <div className="dmr-kpi-label">
              <DollarSign size={14} className="text-emerald-600" />
              Financial Exposure Protected
            </div>
            <div className="dmr-kpi-value">
              ${Number(telemetry.total_exposure_protected_usd || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <div className="dmr-kpi-meta">
              Duplicate AP/Claims exposure under governance
            </div>
          </div>

          <div className="dmr-kpi-card">
            <div className="dmr-kpi-label">
              <Layers size={14} className="text-sky-600" />
              Active Golden Masters
            </div>
            <div className="dmr-kpi-value">{telemetry.active_golden_records_count}</div>
            <div className="dmr-kpi-meta">
              {telemetry.merged_pairs_count} merged pairs · {telemetry.confirmed_distinct_count} distinct
            </div>
          </div>

          <div className="dmr-kpi-card">
            <div className="dmr-kpi-label">
              <ShieldCheck size={14} className="text-emerald-600" />
              Mean Pair Confidence
            </div>
            <div className="dmr-kpi-value">{telemetry.avg_match_confidence}%</div>
            <div className="dmr-kpi-meta dmr-mono-truncate" title={telemetry.latest_sync_seal}>
              Seal: {telemetry.latest_sync_seal?.slice(0, 22)}...
            </div>
          </div>
        </div>
      )}

      {/* Subtab Bar + Filters */}
      <div className="dmr-controls-bar">
        <div className="dmr-subtabs">
          <button
            className={`dmr-subtab ${activeSubTab === 'candidates' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('candidates')}
          >
            <GitFork size={14} />
            Candidate Queue ({pairs.length})
          </button>
          <button
            className={`dmr-subtab ${activeSubTab === 'rules' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('rules')}
          >
            <Scale size={14} />
            Matching Rules & Weights ({rules.length})
          </button>
          <button
            className={`dmr-subtab ${activeSubTab === 'golden' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('golden')}
          >
            <FileCheck2 size={14} />
            Golden Masters ({goldenRecords.length})
          </button>
          <button
            className={`dmr-subtab ${activeSubTab === 'audit' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('audit')}
          >
            <History size={14} />
            Scan & Unmerge Ledger ({mergeHistory.length})
          </button>
        </div>

        <div className="dmr-filter-group">
          <div className="dmr-search-box">
            <Search size={14} />
            <input
              type="text"
              placeholder="Search pair ID, entity, MRN, EIN..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <select
            className="dmr-select"
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
          >
            <option value="ALL">All Entities</option>
            <option value="PATIENT">PATIENT</option>
            <option value="SURGICAL_CASE">SURGICAL_CASE</option>
            <option value="CLAIM">CLAIM</option>
            <option value="VENDOR">VENDOR</option>
            <option value="VENDOR_INVOICE">VENDOR_INVOICE</option>
            <option value="IMPLANT_SKU">IMPLANT_SKU</option>
          </select>
          <select
            className="dmr-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="ALL">All Statuses</option>
            <option value="PENDING_REVIEW">PENDING_REVIEW</option>
            <option value="AUTO_MERGED">AUTO_MERGED</option>
            <option value="MANUALLY_MERGED">MANUALLY_MERGED</option>
            <option value="CONFIRMED_DISTINCT">CONFIRMED_DISTINCT</option>
            <option value="REVERSED">REVERSED</option>
          </select>
        </div>
      </div>

      {/* Subtab 1: Candidate Queue + Side-by-Side Diff Comparator */}
      {activeSubTab === 'candidates' && (
        <div className="dmr-split-workspace">
          {/* Left Pane: Candidate List */}
          <div className="dmr-list-pane">
            {filteredPairs.length === 0 ? (
              <div className="dmr-empty-state">
                <CheckCircle2 size={28} />
                <p>No duplicate candidate pairs match the current filter.</p>
              </div>
            ) : (
              filteredPairs.map(pair => (
                <div
                  key={pair.id}
                  className={`dmr-pair-card ${selectedPair?.id === pair.id ? 'selected' : ''}`}
                  onClick={() => {
                    setSelectedPairId(pair.id);
                    setFieldOverrides({});
                    setActionReason('');
                  }}
                >
                  <div className="dmr-pair-card-top">
                    <span className="dmr-pair-code">{pair.pair_code}</span>
                    <span className={`dmr-badge ${badgeClassForConfidence(pair.confidence_score)}`}>
                      {Number(pair.confidence_score).toFixed(1)}%
                    </span>
                  </div>
                  <div className="dmr-pair-entity-row">
                    <span className="dmr-entity-pill">{pair.entity_type}</span>
                    <span className={`dmr-badge ${badgeClassForStatus(pair.resolution_status)}`}>
                      {pair.resolution_status}
                    </span>
                  </div>
                  <div className="dmr-pair-sources">
                    {pair.source_module_a} ↔ {pair.source_module_b}
                  </div>
                  {Number(pair.financial_exposure_usd) > 0 && (
                    <div className="dmr-pair-exposure">
                      Exposure: ${Number(pair.financial_exposure_usd).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Right Pane: Side-by-Side Comparator & Survivorship Resolver */}
          <div className="dmr-detail-pane">
            {!selectedPair ? (
              <div className="dmr-empty-state">Select a candidate pair to inspect field similarities and survivorship rules.</div>
            ) : (
              <div className="dmr-comparator">
                <div className="dmr-comp-header">
                  <div>
                    <div className="dmr-comp-title">
                      <h3>{selectedPair.pair_code} · {selectedPair.entity_type}</h3>
                      <span className={`dmr-badge ${badgeClassForConfidence(selectedPair.confidence_score)}`}>
                        {selectedPair.confidence_score}% · {selectedPair.match_classification}
                      </span>
                      <span className={`dmr-badge ${badgeClassForStatus(selectedPair.resolution_status)}`}>
                        {selectedPair.resolution_status}
                      </span>
                    </div>
                    <p className="dmr-comp-meta">
                      Source A: <strong>{selectedPair.source_record_a_id}</strong> ({selectedPair.source_module_a}) · Source B: <strong>{selectedPair.source_record_b_id}</strong> ({selectedPair.source_module_b})
                    </p>
                  </div>
                  <div className="dmr-seal-pill" title={selectedPair.sha256_sync_seal}>
                    Seal: {selectedPair.sha256_sync_seal.slice(0, 18)}...
                  </div>
                </div>

                {/* Survivorship Precedence Strip */}
                {selectedPolicy && (
                  <div className="dmr-policy-strip">
                    <span><strong>Survivorship Rank ({selectedPolicy.policy_code}):</strong></span>
                    <span className="dmr-precedence-chain">
                      {selectedPolicy.source_precedence.join(' > ')}
                    </span>
                  </div>
                )}

                {/* Field-by-Field Diff Table */}
                <div className="dmr-table-wrap">
                  <table className="dmr-table">
                    <thead>
                      <tr>
                        <th>Attribute Field</th>
                        <th>Record A ({selectedPair.source_module_a})</th>
                        <th>Record B ({selectedPair.source_module_b})</th>
                        <th>Points Contributed</th>
                        <th>Survivor Selection</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allComparisonFields.map(field => {
                        const valA = selectedPair.record_a_snapshot?.[field];
                        const valB = selectedPair.record_b_snapshot?.[field];
                        const pts = selectedPair.score_breakdown?.[field] ?? 0;
                        const isMatched = (selectedPair.matched_fields || []).includes(field);
                        const chosen = fieldOverrides[field] || 'AUTO';
                        return (
                          <tr key={field}>
                            <td className="dmr-field-name">
                              {field}
                              {isMatched && <span className="dmr-match-dot" title="High similarity match" />}
                            </td>
                            <td><code>{valA !== undefined && valA !== '' ? String(valA) : '—'}</code></td>
                            <td><code>{valB !== undefined && valB !== '' ? String(valB) : '—'}</code></td>
                            <td>{Number(pts).toFixed(2)} pts</td>
                            <td>
                              <select
                                className="dmr-mini-select"
                                value={chosen}
                                disabled={!['PENDING_REVIEW', 'DEFERRED_HOLD', 'REVERSED'].includes(selectedPair.resolution_status)}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setFieldOverrides(prev => {
                                    const next = { ...prev };
                                    if (v === 'AUTO') delete next[field];
                                    else next[field] = v;
                                    return next;
                                  });
                                }}
                              >
                                <option value="AUTO">Auto Survivorship Rule</option>
                                <option value="A">Force Record A</option>
                                <option value="B">Force Record B</option>
                              </select>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Action & Audit Controls */}
                <div className="dmr-action-footer">
                  <div className="dmr-reason-input-wrap">
                    <label>Stewardship / Audit Reason (required ≥5 chars for Distinct or Unmerge)</label>
                    <input
                      type="text"
                      className="dmr-reason-input"
                      placeholder="e.g., Confirmed shared EIN 13-4041511 across GL and POU; retain GL primary legal entity..."
                      value={actionReason}
                      onChange={(e) => setActionReason(e.target.value)}
                    />
                  </div>
                  <div className="dmr-action-buttons">
                    {['PENDING_REVIEW', 'DEFERRED_HOLD', 'REVERSED'].includes(selectedPair.resolution_status) && (
                      <>
                        <button className="dmr-btn-primary" onClick={handleMergePair}>
                          <Check size={15} />
                          Merge into Golden Master
                        </button>
                        <button className="dmr-btn-secondary" onClick={handleMarkDistinct}>
                          <X size={15} />
                          Confirm Distinct
                        </button>
                      </>
                    )}
                    {['AUTO_MERGED', 'MANUALLY_MERGED'].includes(selectedPair.resolution_status) && (
                      <button className="dmr-btn-rose" onClick={handleRevertMerge}>
                        <RotateCcw size={15} />
                        Unmerge & Revert
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Subtab 2: Matching Rules & Weight Conservation Matrix */}
      {activeSubTab === 'rules' && (
        <div className="dmr-card-panel">
          <h3>Entity Matching Rules & 100.00% Conserved Attribute Weights</h3>
          <div className="dmr-rules-grid">
            {rules.map(rule => {
              const totalWeight = Object.values(rule.field_weights || {}).reduce((s, w) => s + Number(w), 0);
              return (
                <div key={rule.id} className="dmr-rule-card">
                  <div className="dmr-rule-top">
                    <div>
                      <span className="dmr-pair-code">{rule.rule_code}</span>
                      <h4>{rule.rule_name}</h4>
                    </div>
                    <span className="dmr-badge dmr-badge-emerald">Σ = {totalWeight.toFixed(2)}%</span>
                  </div>
                  <div className="dmr-rule-meta">
                    <span>Entity: <strong>{rule.entity_type}</strong></span>
                    <span>Algorithm: <strong>{rule.match_algorithm}</strong></span>
                    <span>Version: <strong>{rule.version_tag}</strong></span>
                  </div>
                  <div className="dmr-blocking-row">
                    <span>Blocking Keys:</span>
                    {rule.blocking_keys.map(k => (
                      <code key={k} className="dmr-key-chip">{k}</code>
                    ))}
                  </div>
                  <div className="dmr-weights-list">
                    {Object.entries(rule.field_weights).map(([field, weight]) => (
                      <div key={field} className="dmr-weight-bar-row">
                        <span className="dmr-weight-label">{field}</span>
                        <div className="dmr-weight-track">
                          <div className="dmr-weight-fill" style={{ width: `${weight}%` }} />
                        </div>
                        <span className="dmr-weight-num">{Number(weight).toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Subtab 3: Golden Master Records & Field Provenance */}
      {activeSubTab === 'golden' && (
        <div className="dmr-card-panel">
          <h3>Canonical Golden Master Records ({goldenRecords.length})</h3>
          <div className="dmr-table-wrap">
            <table className="dmr-table">
              <thead>
                <tr>
                  <th>Golden Code</th>
                  <th>Entity Type</th>
                  <th>Canonical Key</th>
                  <th>Lineage Sources</th>
                  <th>Confidence</th>
                  <th>Status</th>
                  <th>SHA-256 Seal</th>
                </tr>
              </thead>
              <tbody>
                {goldenRecords.map(g => (
                  <tr key={g.id}>
                    <td className="dmr-pair-code">{g.golden_code}</td>
                    <td><span className="dmr-entity-pill">{g.entity_type}</span></td>
                    <td><code>{g.canonical_key}</code></td>
                    <td>{g.lineage_source_ids.join(', ')} ({g.merged_source_count})</td>
                    <td>{Number(g.confidence_score).toFixed(2)}%</td>
                    <td>
                      <span className={`dmr-badge ${g.is_active ? 'dmr-badge-emerald' : 'dmr-badge-rose'}`}>
                        {g.is_active ? 'ACTIVE_GOLDEN' : 'REVERTED_INACTIVE'}
                      </span>
                    </td>
                    <td className="dmr-mono-cell" title={g.sha256_sync_seal}>{g.sha256_sync_seal.slice(0, 20)}...</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Subtab 4: Scan Runs & Merge/Unmerge Audit Ledger */}
      {activeSubTab === 'audit' && (
        <div className="dmr-audit-stack">
          <div className="dmr-card-panel">
            <h3>Batch Deduplication Scan Runs</h3>
            <div className="dmr-table-wrap">
              <table className="dmr-table">
                <thead>
                  <tr>
                    <th>Batch Control #</th>
                    <th>Scope</th>
                    <th>Scanned</th>
                    <th>Evaluated</th>
                    <th>Exact Dups</th>
                    <th>Auto-Merged</th>
                    <th>Executed By</th>
                    <th>SHA-256 Seal</th>
                  </tr>
                </thead>
                <tbody>
                  {matchRuns.map(r => (
                    <tr key={r.id}>
                      <td className="dmr-pair-code">{r.batch_control_number}</td>
                      <td>{r.entity_scope}</td>
                      <td>{r.records_scanned}</td>
                      <td>{r.pairs_evaluated}</td>
                      <td>{r.exact_duplicates_found}</td>
                      <td>{r.auto_merged_count}</td>
                      <td>{r.executed_by}</td>
                      <td className="dmr-mono-cell" title={r.sha256_sync_seal}>{r.sha256_sync_seal.slice(0, 20)}...</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="dmr-card-panel">
            <h3>Immutable Merge & Unmerge Provenance Ledger</h3>
            <div className="dmr-table-wrap">
              <table className="dmr-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Pair</th>
                    <th>Action</th>
                    <th>Actor</th>
                    <th>Transition</th>
                    <th>Reason</th>
                    <th>SHA-256 Seal</th>
                  </tr>
                </thead>
                <tbody>
                  {mergeHistory.map(h => (
                    <tr key={h.id}>
                      <td>{new Date(h.created_at).toLocaleString()}</td>
                      <td className="dmr-pair-code">{h.pair_code || h.pair_id}</td>
                      <td>
                        <span className={`dmr-badge ${h.action_type === 'UNMERGE_REVERT' ? 'dmr-badge-rose' : 'dmr-badge-emerald'}`}>
                          {h.action_type}
                        </span>
                      </td>
                      <td>{h.actor_email}</td>
                      <td><code>{h.before_state_json?.resolution_status} → {h.after_state_json?.resolution_status}</code></td>
                      <td>{h.reason}</td>
                      <td className="dmr-mono-cell" title={h.sha256_seal}>{h.sha256_seal.slice(0, 20)}...</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Threshold Settings Modal */}
      {isSettingsOpen && config && (
        <div className="dmr-modal-backdrop">
          <div className="dmr-modal">
            <div className="dmr-modal-header">
              <h3>Matching Thresholds & Blocking Rules</h3>
              <button className="dmr-banner-close" onClick={() => setIsSettingsOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleSaveThresholds} className="dmr-modal-body">
              <div className="dmr-form-row">
                <label>Auto-Merge Threshold (%)</label>
                <input
                  type="number"
                  step="0.5"
                  min="75"
                  max="100"
                  value={draftThresholds.auto_merge_threshold}
                  onChange={(e) => setDraftThresholds({ ...draftThresholds, auto_merge_threshold: Number(e.target.value) })}
                />
              </div>
              <div className="dmr-form-row">
                <label>Manual Review Floor (%)</label>
                <input
                  type="number"
                  step="0.5"
                  min="50"
                  max="95"
                  value={draftThresholds.manual_review_threshold}
                  onChange={(e) => setDraftThresholds({ ...draftThresholds, manual_review_threshold: Number(e.target.value) })}
                />
              </div>
              <label className="dmr-checkbox-row">
                <input
                  type="checkbox"
                  checked={draftThresholds.block_exact_collisions}
                  onChange={(e) => setDraftThresholds({ ...draftThresholds, block_exact_collisions: e.target.checked })}
                />
                <span>Block exact primary-key duplicate collisions at ingestion boundary</span>
              </label>
              <label className="dmr-checkbox-row">
                <input
                  type="checkbox"
                  checked={draftThresholds.enable_cross_source_blocking}
                  onChange={(e) => setDraftThresholds({ ...draftThresholds, enable_cross_source_blocking: e.target.checked })}
                />
                <span>Enable cross-module blocking keys (SIS ↔ HST ↔ EDI ↔ AP)</span>
              </label>
              <div className="dmr-form-secret-note">
                Engine Key Mask: <code>{config.client_secret_encrypted}</code>
              </div>
              <div className="dmr-modal-footer">
                <button type="button" className="dmr-btn-secondary" onClick={() => setIsSettingsOpen(false)}>Cancel</button>
                <button type="submit" className="dmr-btn-primary">Save Policy Thresholds</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
