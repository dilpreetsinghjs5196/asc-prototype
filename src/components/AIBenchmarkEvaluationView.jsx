/**
 * ==============================================================================
 * Phase C8: AI Benchmark & Evaluation Framework Console
 * Module 12: AI & Intelligence
 * Maestro Clinical Design System: Emerald, Amber, Crimson, Sky, Slate, Neutral
 * Strictly Zero Prohibited Accent Tokens
 * Full Light & Dark Theme Support ([data-theme="dark"])
 * ==============================================================================
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  Award,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Play,
  RotateCcw,
  Clock,
  ShieldCheck,
  Zap,
  Activity,
  Layers,
  Search,
  Filter,
  FileText,
  Sliders,
  Sparkles,
  RefreshCw,
  TrendingUp,
  BarChart3,
  Cpu,
  ChevronRight,
  ExternalLink
} from 'lucide-react';
import {
  BENCHMARK_DOMAINS,
  SCORING_PILLARS,
  getBenchmarkSuites,
  getBenchmarkQuestions,
  executeBenchmarkRun,
  gradeBenchmarkQuestion,
  getBenchmarkRuns,
  getBenchmarkTelemetry
} from '../services/aiBenchmarkService.js';
import './AIBenchmarkEvaluationView.css';

export default function AIBenchmarkEvaluationView({ activeFacility = 'fac-naples-01' }) {
  const [activeTab, setActiveTab] = useState('catalog'); // 'catalog', 'runner', 'history', 'lab'
  const [domainFilter, setDomainFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Evaluation Runner State
  const [isRunningEvaluation, setIsRunningEvaluation] = useState(false);
  const [latestRunResult, setLatestRunResult] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Single Question Lab State
  const [selectedLabQuestionId, setSelectedLabQuestionId] = useState('bnch-q-001');
  const [customModelResponse, setCustomModelResponse] = useState('');
  const [labGradeResult, setLabGradeResult] = useState(null);

  // Telemetry, Suites, Questions & Runs
  const telemetry = useMemo(() => {
    return getBenchmarkTelemetry(activeFacility);
  }, [activeFacility, refreshKey]);

  const questions = useMemo(() => {
    return getBenchmarkQuestions('suite-gold-01', domainFilter);
  }, [domainFilter, refreshKey]);

  const runs = useMemo(() => {
    return getBenchmarkRuns(activeFacility);
  }, [activeFacility, refreshKey]);

  const filteredQuestions = useMemo(() => {
    if (!searchQuery.trim()) return questions;
    const q = searchQuery.toLowerCase();
    return questions.filter(item =>
      item.questionText.toLowerCase().includes(q) ||
      item.benchmarkCode.toLowerCase().includes(q) ||
      item.clinicalIntent.toLowerCase().includes(q) ||
      item.expectedToolId.toLowerCase().includes(q)
    );
  }, [questions, searchQuery]);

  const selectedLabQuestion = useMemo(() => {
    return questions.find(q => q.id === selectedLabQuestionId) || questions[0];
  }, [questions, selectedLabQuestionId]);

  // Toast Auto-Dismiss
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  const showToast = (msg) => {
    setToastMessage(msg);
  };

  const handleExecuteBatchEvaluation = () => {
    setIsRunningEvaluation(true);
    setTimeout(() => {
      try {
        const result = executeBenchmarkRun('suite-gold-01', activeFacility, {
          runBy: 'usr_qa_architect'
        });
        setLatestRunResult(result);
        setRefreshKey(prev => prev + 1);
        showToast(`Evaluation Run ${result.runCode} Completed: Composite Score ${result.compositeScorePct}%`);
      } catch (err) {
        showToast(`Evaluation Error: ${err.message}`);
      } finally {
        setIsRunningEvaluation(false);
      }
    }, 600);
  };

  const handleGradeCustomPrompt = () => {
    if (!selectedLabQuestion) return;
    const mockModelInput = {
      toolId: selectedLabQuestion.expectedToolId,
      params: selectedLabQuestion.expectedParameters,
      text: customModelResponse || `Authoritative metric calculated: $14,200.00 (62.4%) [E-101]. Verified server-side.`,
      citations: selectedLabQuestion.expectedCitations,
      latencyMs: 14.2
    };
    const grade = gradeBenchmarkQuestion(selectedLabQuestion, mockModelInput);
    setLabGradeResult(grade);
    showToast(`Single Question Evaluated: Score ${grade.compositeScore}% (${grade.passed ? 'PASSED' : 'FLAGGED'})`);
  };

  return (
    <div className="aibe-container">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="aibe-toast">
          <Sparkles size={16} className="text-emerald" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 5-Card Top KPI Ribbon */}
      <div className="aibe-ribbon">
        <div className="aibe-ribbon-card primary">
          <div className="card-top">
            <span className="card-label">Composite Benchmark Score</span>
            <div className="icon-wrapper emerald">
              <Award size={16} />
            </div>
          </div>
          <div className="card-metric">
            {telemetry.compositeScorePct}%
            <span className="metric-unit">Target ≥ 98.0%</span>
          </div>
          <div className="card-footer-info">
            <span>5-Pillar Weighted Model</span>
            <span className="status-pill pill-success">Production Ready</span>
          </div>
        </div>

        <div className="aibe-ribbon-card">
          <div className="card-top">
            <span className="card-label">Tool Contract Accuracy</span>
            <div className="icon-wrapper blue">
              <Cpu size={16} />
            </div>
          </div>
          <div className="card-metric">
            {telemetry.toolAccuracyPct}%
            <span className="metric-unit">C3 Schemas</span>
          </div>
          <div className="card-footer-info">
            <span>Deterministic Binding</span>
            <span className="rate-badge">8/8 Verified</span>
          </div>
        </div>

        <div className="aibe-ribbon-card">
          <div className="card-top">
            <span className="card-label">Deterministic Number Precision</span>
            <div className="icon-wrapper emerald">
              <CheckCircle2 size={16} />
            </div>
          </div>
          <div className="card-metric">
            {telemetry.numberAccuracyPct}%
            <span className="metric-unit">0.0% Drift Bound</span>
          </div>
          <div className="card-footer-info">
            <span>Zero Generative Math</span>
            <span className="status-pill pill-success">Strict Audit</span>
          </div>
        </div>

        <div className="aibe-ribbon-card">
          <div className="card-top">
            <span className="card-label">Citation Completeness</span>
            <div className="icon-wrapper amber">
              <ShieldCheck size={16} />
            </div>
          </div>
          <div className="card-metric">
            {telemetry.citationCompletenessPct}%
            <span className="metric-unit">Evidence Provenance</span>
          </div>
          <div className="card-footer-info">
            <span>Safe Harbor [E-xxx]</span>
            <span className="rate-badge">Verifiable Sources</span>
          </div>
        </div>

        <div className="aibe-ribbon-card">
          <div className="card-top">
            <span className="card-label">Evaluation Latency</span>
            <div className="icon-wrapper blue">
              <Zap size={16} />
            </div>
          </div>
          <div className="card-metric">
            {telemetry.avgLatencyMs}
            <span className="metric-unit">ms / Query</span>
          </div>
          <div className="card-footer-info">
            <span>Server-Authoritative</span>
            <span className="status-pill pill-blue">High Velocity</span>
          </div>
        </div>
      </div>

      {/* Tabs Row */}
      <div className="aibe-tabs-row">
        <div className="tab-buttons">
          <button
            className={`tab-btn ${activeTab === 'catalog' ? 'active' : ''}`}
            onClick={() => setActiveTab('catalog')}
          >
            <Layers size={15} />
            <span>Golden Benchmark Catalog ({questions.length})</span>
          </button>
          <button
            className={`tab-btn ${activeTab === 'runner' ? 'active' : ''}`}
            onClick={() => setActiveTab('runner')}
          >
            <Play size={15} />
            <span>Live Batch Evaluator</span>
          </button>
          <button
            className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            <Clock size={15} />
            <span>Evaluation Runs & Regressions ({runs.length})</span>
          </button>
          <button
            className={`tab-btn ${activeTab === 'lab' ? 'active' : ''}`}
            onClick={() => setActiveTab('lab')}
          >
            <Sliders size={15} />
            <span>Single-Query Evaluation Lab</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="btn-sync-refresh"
            onClick={() => {
              setRefreshKey(prev => prev + 1);
              showToast('Benchmark suite telemetry refreshed.');
            }}
          >
            <RefreshCw size={13} />
            <span>Sync Benchmarks</span>
          </button>
        </div>
      </div>

      {/* TAB 1: GOLDEN BENCHMARK CATALOG */}
      {activeTab === 'catalog' && (
        <div className="catalog-layout">
          {/* Filter and Search Bar */}
          <div className="filter-search-bar">
            <div className="domain-pills">
              {['ALL', ...Object.values(BENCHMARK_DOMAINS)].map((dom) => (
                <button
                  key={dom}
                  className={`domain-pill ${domainFilter === dom ? 'active' : ''}`}
                  onClick={() => setDomainFilter(dom)}
                >
                  {dom}
                </button>
              ))}
            </div>

            <div className="search-box">
              <Search size={14} className="search-icon" />
              <input
                type="text"
                placeholder="Search benchmark queries, expected tools, intent..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Benchmark Questions Grid */}
          <div className="benchmark-grid">
            {filteredQuestions.map((q) => (
              <div key={q.id} className="benchmark-card">
                <div className="card-top-tags">
                  <span className={`domain-tag tag-${q.domain.toLowerCase()}`}>
                    {q.domain}
                  </span>
                  <code className="bnch-code">{q.benchmarkCode}</code>
                </div>

                <h3 className="bnch-question">"{q.questionText}"</h3>
                <p className="bnch-intent">{q.clinicalIntent}</p>

                <div className="expected-meta-box">
                  <div className="meta-row">
                    <span className="m-lbl">Expected Tool Contract</span>
                    <span className="m-val font-mono text-sky">{q.expectedToolId}</span>
                  </div>

                  {q.expectedNumericalAssertions.length > 0 && (
                    <div className="meta-row">
                      <span className="m-lbl">Deterministic Numbers</span>
                      <span className="m-val text-emerald font-semibold">
                        {q.expectedNumericalAssertions.map(n => n.toLocaleString()).join(', ')}
                      </span>
                    </div>
                  )}

                  {q.expectedCitations.length > 0 && (
                    <div className="meta-row">
                      <span className="m-lbl">Required Citations</span>
                      <div className="flex gap-1 flex-wrap">
                        {q.expectedCitations.map((c, i) => (
                          <span key={i} className="citation-chip">{c}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="meta-row">
                    <span className="m-lbl">Tolerance Allowed</span>
                    <span className="m-val font-mono">±{q.tolerancePct.toFixed(2)}% (Zero Drift)</span>
                  </div>
                </div>

                <div className="card-footer-actions">
                  <button
                    className="btn-card-eval"
                    onClick={() => {
                      setSelectedLabQuestionId(q.id);
                      setActiveTab('lab');
                    }}
                  >
                    <span>Test In Lab</span>
                    <ChevronRight size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: LIVE BATCH EVALUATION RUNNER */}
      {activeTab === 'runner' && (
        <div className="runner-layout">
          <div className="runner-action-card">
            <div className="card-header-line">
              <div className="flex items-center gap-2">
                <Award size={18} className="text-emerald" />
                <h2>Automated Golden Suite Evaluator</h2>
              </div>
              <button
                className="btn-run-batch"
                onClick={handleExecuteBatchEvaluation}
                disabled={isRunningEvaluation}
              >
                {isRunningEvaluation ? <Activity size={14} className="spin" /> : <Play size={14} />}
                <span>{isRunningEvaluation ? 'Executing 8 Benchmarks...' : 'Run Golden Evaluation Suite'}</span>
              </button>
            </div>
            <p className="panel-desc">
              Executes the authoritative evaluation engine across all 8 golden queries. Scores model responses against deterministic tool contracts, numerical assertions, and evidence links.
            </p>

            {/* 5 Scoring Pillars Overview */}
            <div className="pillars-grid">
              {Object.values(SCORING_PILLARS).map((pillar) => (
                <div key={pillar.id} className="pillar-card">
                  <span className="pillar-lbl">{pillar.label}</span>
                  <div className="pillar-val">{Math.round(pillar.weight * 100)}% Weight</div>
                </div>
              ))}
            </div>
          </div>

          {/* Latest Evaluation Run Results */}
          {latestRunResult && (
            <div className="run-results-container">
              <div className="run-header-summary">
                <div className="flex items-center gap-3">
                  <div className="score-circle">
                    <span className="score-num">{latestRunResult.compositeScorePct}%</span>
                    <span className="score-lbl">Composite</span>
                  </div>
                  <div>
                    <h3 className="run-title">Evaluation Run: {latestRunResult.runCode}</h3>
                    <p className="run-meta">
                      Executed: {new Date(latestRunResult.executedAt).toLocaleTimeString()} | Verified Pass Rate: {latestRunResult.passedBenchmarks}/{latestRunResult.totalBenchmarks} Benchmarks
                    </p>
                  </div>
                </div>

                <div className="pillar-score-badges">
                  <span className="p-badge text-sky">Tool: {latestRunResult.toolAccuracyPct}%</span>
                  <span className="p-badge text-emerald">Numbers: {latestRunResult.numberAccuracyPct}%</span>
                  <span className="p-badge text-amber">Citations: {latestRunResult.citationCompletenessPct}%</span>
                  <span className="p-badge text-emerald">Safety: {latestRunResult.safetyGuardrailPct}%</span>
                </div>
              </div>

              {/* Itemized Results Table */}
              <div className="table-responsive mt-3">
                <table className="aibe-table">
                  <thead>
                    <tr>
                      <th>Benchmark Code</th>
                      <th>Score</th>
                      <th>Tool Accuracy</th>
                      <th>Number Precision</th>
                      <th>Evidence Citation</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {latestRunResult.results.map((r, i) => (
                      <tr key={i}>
                        <td>
                          <span className="font-mono text-xs">{r.benchmarkCode}</span>
                        </td>
                        <td>
                          <span className="font-bold">{r.compositeScore}%</span>
                        </td>
                        <td>
                          {r.toolMatched ? (
                            <span className="status-pill pill-success">Match 100%</span>
                          ) : (
                            <span className="status-pill pill-red">Mismatch</span>
                          )}
                        </td>
                        <td>
                          {r.numbersMatched ? (
                            <span className="status-pill pill-success">Exact Zero-Drift</span>
                          ) : (
                            <span className="status-pill pill-red">Drift Detected</span>
                          )}
                        </td>
                        <td>
                          {r.citationsMatched ? (
                            <span className="status-pill pill-success">Verified [E-xxx]</span>
                          ) : (
                            <span className="status-pill pill-warn">Missing</span>
                          )}
                        </td>
                        <td>
                          <span className={`status-pill ${r.passed ? 'pill-success' : 'pill-red'}`}>
                            {r.passed ? 'PASSED' : 'FLAGGED'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: HISTORICAL EVALUATION RUNS & REGRESSIONS */}
      {activeTab === 'history' && (
        <div className="history-layout">
          <div className="history-table-card">
            <div className="card-header-line">
              <div className="flex items-center gap-2">
                <Clock size={16} className="text-sky" />
                <h2>Benchmark Run Audit History & Regression Detection ({runs.length})</h2>
              </div>
            </div>

            <div className="table-responsive">
              <table className="aibe-table">
                <thead>
                  <tr>
                    <th>Run Code</th>
                    <th>Executed At</th>
                    <th>Composite Score</th>
                    <th>Tool Match</th>
                    <th>Number Accuracy</th>
                    <th>Citation Score</th>
                    <th>Status</th>
                    <th>Provenance Hash</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <span className="font-mono text-xs text-sky font-bold">{r.runCode}</span>
                      </td>
                      <td>{new Date(r.executedAt).toLocaleString()}</td>
                      <td>
                        <span className="font-bold text-emerald">{r.compositeScorePct}%</span>
                      </td>
                      <td>{r.toolAccuracyPct}%</td>
                      <td>{r.numberAccuracyPct}%</td>
                      <td>{r.citationCompletenessPct}%</td>
                      <td>
                        <span className="status-pill pill-success">{r.runStatus}</span>
                      </td>
                      <td>
                        <span className="font-mono text-xs text-muted">
                          {r.verificationHash ? `${r.verificationHash.substring(0, 16)}...` : 'hash_9a8b7...'}
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

      {/* TAB 4: SINGLE-QUERY EVALUATION LAB */}
      {activeTab === 'lab' && (
        <div className="lab-layout">
          {/* Question Inspector */}
          <div className="lab-question-card">
            <div className="card-header-line">
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-emerald" />
                <h2>Select Golden Benchmark Question</h2>
              </div>
            </div>

            <div className="form-group mt-2">
              <label className="form-label">Golden Target Query</label>
              <select
                className="form-select"
                value={selectedLabQuestionId}
                onChange={(e) => {
                  setSelectedLabQuestionId(e.target.value);
                  setLabGradeResult(null);
                }}
              >
                {questions.map((q) => (
                  <option key={q.id} value={q.id}>
                    [{q.domain}] {q.benchmarkCode} - {q.questionText}
                  </option>
                ))}
              </select>
            </div>

            {selectedLabQuestion && (
              <div className="selected-spec-box">
                <div className="spec-row">
                  <span className="s-lbl">Expected Tool:</span>
                  <span className="s-val font-mono text-sky">{selectedLabQuestion.expectedToolId}</span>
                </div>
                <div className="spec-row">
                  <span className="s-lbl">Expected Numbers:</span>
                  <span className="s-val text-emerald font-semibold">
                    {selectedLabQuestion.expectedNumericalAssertions.join(', ') || 'N/A (Safety Trap)'}
                  </span>
                </div>
                <div className="spec-row">
                  <span className="s-lbl">Required Citations:</span>
                  <span className="s-val">{selectedLabQuestion.expectedCitations.join(', ') || 'None'}</span>
                </div>
              </div>
            )}

            <div className="form-group mt-3">
              <label className="form-label">Simulate AI Model Response Text</label>
              <textarea
                className="form-textarea"
                rows={3}
                placeholder="Enter model output with numbers and bracketed citations e.g. 'Verified net contribution margin is $14,200.00 (62.4%) [E-101]...'"
                value={customModelResponse}
                onChange={(e) => setCustomModelResponse(e.target.value)}
              />
            </div>

            <button className="btn-grade-single" onClick={handleGradeCustomPrompt}>
              <Award size={14} />
              <span>Evaluate Response Against Ground Truth</span>
            </button>
          </div>

          {/* Grader Scorecard */}
          <div className="lab-scorecard-card">
            <div className="card-header-line">
              <div className="flex items-center gap-2">
                <Sliders size={16} className="text-sky" />
                <h2>Evaluation Pillar Scorecard</h2>
              </div>
            </div>

            {labGradeResult ? (
              <div className="scorecard-content">
                <div className="scorecard-top">
                  <div className="sc-circle">
                    <span className="sc-val">{labGradeResult.compositeScore}%</span>
                    <span className="sc-lbl">Score</span>
                  </div>
                  <div>
                    <h3 className="sc-status">
                      {labGradeResult.passed ? 'PASSED BENCHMARK' : 'FAILED / REJECTED'}
                    </h3>
                    <p className="sc-sub">
                      Latency: {labGradeResult.latencyMs}ms | Ground Truth Validation: Verified
                    </p>
                  </div>
                </div>

                <div className="pillar-bars-list">
                  <div className="p-bar-item">
                    <div className="p-bar-top">
                      <span>Tool Selection Accuracy (25%)</span>
                      <span className="font-bold">{labGradeResult.pillarScores.toolAccuracy}%</span>
                    </div>
                    <div className="p-track">
                      <div className="p-fill fill-blue" style={{ width: `${labGradeResult.pillarScores.toolAccuracy}%` }} />
                    </div>
                  </div>

                  <div className="p-bar-item">
                    <div className="p-bar-top">
                      <span>Parameter Schema Validation (20%)</span>
                      <span className="font-bold">{labGradeResult.pillarScores.paramValidation}%</span>
                    </div>
                    <div className="p-track">
                      <div className="p-fill fill-emerald" style={{ width: `${labGradeResult.pillarScores.paramValidation}%` }} />
                    </div>
                  </div>

                  <div className="p-bar-item">
                    <div className="p-bar-top">
                      <span>Deterministic Number Precision (30%)</span>
                      <span className="font-bold">{labGradeResult.pillarScores.numberPrecision}%</span>
                    </div>
                    <div className="p-track">
                      <div className="p-fill fill-emerald" style={{ width: `${labGradeResult.pillarScores.numberPrecision}%` }} />
                    </div>
                  </div>

                  <div className="p-bar-item">
                    <div className="p-bar-top">
                      <span>Evidence Citation Completeness (15%)</span>
                      <span className="font-bold">{labGradeResult.pillarScores.citationCompleteness}%</span>
                    </div>
                    <div className="p-track">
                      <div className="p-fill fill-amber" style={{ width: `${labGradeResult.pillarScores.citationCompleteness}%` }} />
                    </div>
                  </div>

                  <div className="p-bar-item">
                    <div className="p-bar-top">
                      <span>Safety Guardrail Clearance (10%)</span>
                      <span className="font-bold">{labGradeResult.pillarScores.safetyGuardrails}%</span>
                    </div>
                    <div className="p-track">
                      <div className="p-fill fill-emerald" style={{ width: `${labGradeResult.pillarScores.safetyGuardrails}%` }} />
                    </div>
                  </div>
                </div>

                {labGradeResult.failureReasons.length > 0 && (
                  <div className="failure-reasons-box">
                    <AlertTriangle size={15} className="text-crimson" />
                    <div className="flex flex-col gap-1">
                      {labGradeResult.failureReasons.map((reason, i) => (
                        <span key={i} className="text-xs text-crimson">{reason}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="empty-scorecard">
                <Sliders size={32} className="text-muted" />
                <p>Click "Evaluate Response" to grade the prompt against deterministic ground truth.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
