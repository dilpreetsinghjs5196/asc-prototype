import React, { useState, useMemo } from 'react';
import {
  Clock,
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Search,
  Filter,
  RefreshCw,
  Info,
  Calendar,
  Sliders,
  Award,
  BarChart3,
  Calculator,
  ShieldCheck,
  Layers,
  ChevronRight,
  X,
  FileCheck,
  Activity,
  Zap
} from 'lucide-react';
import {
  CONFIDENCE_LEVELS,
  MODEL_TIERS,
  PERCENTILE_PROFILES,
  COMPLEXITY_MODIFIERS,
  calculatePercentile,
  calculateDistributionStatistics,
  determineConfidenceLevel,
  predictCaseDuration,
  calculatePredictionError,
  calculateFacilityPredictionKpis,
  filterPredictionModels,
  SEED_DURATION_MODELS,
  SEED_PREDICTION_LOGS
} from '../services/durationPredictionService';
import './DurationPredictionView.css';

export default function DurationPredictionView() {
  const [activeSubTab, setActiveSubTab] = useState('models'); // 'models', 'calculator', 'ledger'
  const [models, setModels] = useState(SEED_DURATION_MODELS);
  const [predictionLogs, setPredictionLogs] = useState(SEED_PREDICTION_LOGS);
  const [toastMessage, setToastMessage] = useState(null);

  // Filters for Models View
  const [searchTerm, setSearchTerm] = useState('');
  const [surgeonFilter, setSurgeonFilter] = useState('ALL');
  const [specialtyFilter, setSpecialtyFilter] = useState('ALL');
  const [confidenceFilter, setConfidenceFilter] = useState('ALL');

  // Interactive Calculator State
  const [calcSurgeon, setCalcSurgeon] = useState(SEED_DURATION_MODELS[0].surgeonName);
  const [calcCpt, setCalcCpt] = useState(SEED_DURATION_MODELS[0].primaryCptCode);
  const [calcPercentile, setCalcPercentile] = useState('P80');
  const [calcBmi, setCalcBmi] = useState(false);
  const [calcRevision, setCalcRevision] = useState(false);
  const [calcDual, setCalcDual] = useState(false);

  // Modal State: Model Inspection / Retraining
  const [showModelModal, setShowModelModal] = useState(false);
  const [selectedModel, setSelectedModel] = useState(null);
  const [modalFormData, setModalFormData] = useState({
    p50DurationMinutes: 0,
    p80DurationMinutes: 0,
    p90DurationMinutes: 0,
    schedulingInsight: ''
  });

  const showToast = (text) => {
    setToastMessage(text);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Facility-wide aggregated KPIs
  const kpis = useMemo(() => {
    return calculateFacilityPredictionKpis(models, predictionLogs);
  }, [models, predictionLogs]);

  // Unique dropdown lists
  const availableSurgeons = useMemo(() => {
    const set = new Set(models.map(m => m.surgeonName));
    return Array.from(set).sort();
  }, [models]);

  const availableSpecialties = useMemo(() => {
    const set = new Set(models.map(m => m.specialtyCode));
    return Array.from(set).sort();
  }, [models]);

  // Filtered Models
  const filteredModels = useMemo(() => {
    return filterPredictionModels(models, {
      surgeon: surgeonFilter,
      specialty: specialtyFilter,
      confidence: confidenceFilter,
      searchQuery: searchTerm
    });
  }, [models, surgeonFilter, specialtyFilter, confidenceFilter, searchTerm]);

  // Real-time calculation output for Calculator tab
  const calculatedPrediction = useMemo(() => {
    return predictCaseDuration(
      calcSurgeon,
      calcCpt,
      {
        targetPercentile: calcPercentile,
        hasHighBmi: calcBmi,
        isRevision: calcRevision,
        isDualProcedure: calcDual
      },
      models
    );
  }, [calcSurgeon, calcCpt, calcPercentile, calcBmi, calcRevision, calcDual, models]);

  // Open Model Inspection Modal
  const handleOpenModelModal = (model) => {
    setSelectedModel(model);
    setModalFormData({
      p50DurationMinutes: model.p50DurationMinutes,
      p80DurationMinutes: model.p80DurationMinutes,
      p90DurationMinutes: model.p90DurationMinutes,
      schedulingInsight: model.schedulingInsight || ''
    });
    setShowModelModal(true);
  };

  // Save Model Adjustments
  const handleSaveModel = (e) => {
    e.preventDefault();
    if (!selectedModel) return;

    setModels(prev =>
      prev.map(m => {
        if (m.id === selectedModel.id) {
          return {
            ...m,
            p50DurationMinutes: Number(modalFormData.p50DurationMinutes),
            p80DurationMinutes: Number(modalFormData.p80DurationMinutes),
            p90DurationMinutes: Number(modalFormData.p90DurationMinutes),
            schedulingInsight: modalFormData.schedulingInsight,
            lastTrainedAt: new Date().toISOString()
          };
        }
        return m;
      })
    );

    showToast(`Updated duration model for ${selectedModel.surgeonName} - CPT ${selectedModel.primaryCptCode}`);
    setShowModelModal(false);
    setSelectedModel(null);
  };

  return (
    <div className="dp-container">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="dp-toast">
          <CheckCircle2 size={18} className="dp-toast-icon" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="dp-header-banner">
        <div className="dp-header-main">
          <div className="dp-header-title-row">
            <h1 className="dp-title">Surgical Duration Prediction Engine (P50/P75/P80/P90)</h1>
            <span className="dp-badge dp-badge-neutral">Phase A8 • Module 10</span>
          </div>
          <p className="dp-subtitle">
            Statistical percentile distributions, hierarchical sample size tiers, patient clinical complexity modifiers, and overtime risk mitigation modeling.
          </p>
        </div>
        <div className="dp-header-actions">
          <button
            type="button"
            className="dp-btn dp-btn-secondary"
            onClick={() => {
              setModels(SEED_DURATION_MODELS);
              setPredictionLogs(SEED_PREDICTION_LOGS);
              showToast('Data reset to baseline clinical seeds.');
            }}
          >
            <RefreshCw size={14} />
            <span>Reset Baseline</span>
          </button>
        </div>
      </div>

      {/* 5-Card Operational Ribbon */}
      <div className="dp-kpi-grid">
        <div className="dp-kpi-card">
          <div className="dp-kpi-header">
            <span className="dp-kpi-label">High Confidence Coverage</span>
            <span className="dp-kpi-icon-wrap bg-emerald-light">
              <ShieldCheck size={16} className="text-emerald" />
            </span>
          </div>
          <div className="dp-kpi-value-row">
            <span className="dp-kpi-value">{kpis.highConfidenceCoveragePct}%</span>
            <span className="dp-pill dp-pill-emerald">N &ge; 20 Cases</span>
          </div>
          <div className="dp-kpi-footer">
            <span>{kpis.highConfidenceModels} of {kpis.totalModels} models high confidence</span>
          </div>
        </div>

        <div className="dp-kpi-card">
          <div className="dp-kpi-header">
            <span className="dp-kpi-label">Mean Prediction Error</span>
            <span className="dp-kpi-icon-wrap bg-blue-light">
              <Clock size={16} className="text-blue" />
            </span>
          </div>
          <div className="dp-kpi-value-row">
            <span className="dp-kpi-value">{kpis.meanAbsoluteErrorMinutes} m</span>
            <span className="dp-pill dp-pill-neutral">MAPE Error</span>
          </div>
          <div className="dp-kpi-footer">
            <span>Average variance from scheduled booking</span>
          </div>
        </div>

        <div className="dp-kpi-card">
          <div className="dp-kpi-header">
            <span className="dp-kpi-label">P80 Window Completion</span>
            <span className="dp-kpi-icon-wrap bg-emerald-light">
              <Award size={16} className="text-emerald" />
            </span>
          </div>
          <div className="dp-kpi-value-row">
            <span className="dp-kpi-value">{kpis.completedWithinTargetPct}%</span>
            <span className="dp-pill dp-pill-emerald">Target &ge; 80%</span>
          </div>
          <div className="dp-kpi-footer">
            <span>{kpis.completedWithinTargetCount} of {kpis.evaluatedLogsCount} cases completed within target</span>
          </div>
        </div>

        <div className="dp-kpi-card">
          <div className="dp-kpi-header">
            <span className="dp-kpi-label">Calibrated CPT Models</span>
            <span className="dp-kpi-icon-wrap bg-blue-light">
              <BarChart3 size={16} className="text-blue" />
            </span>
          </div>
          <div className="dp-kpi-value-row">
            <span className="dp-kpi-value">{kpis.totalModels}</span>
            <span className="dp-pill dp-pill-neutral">Tier 1 &amp; Tier 2</span>
          </div>
          <div className="dp-kpi-footer">
            <span>Statistical percentiles trained on historical actuals</span>
          </div>
        </div>

        <div className="dp-kpi-card">
          <div className="dp-kpi-header">
            <span className="dp-kpi-label">Overtime Shields Active</span>
            <span className="dp-kpi-icon-wrap bg-amber-light">
              <AlertTriangle size={16} className="text-amber" />
            </span>
          </div>
          <div className="dp-kpi-value-row">
            <span className="dp-kpi-value">{kpis.overtimeRiskMitigatedCount} cases</span>
            <span className="dp-pill dp-pill-amber">P90 / Complexity</span>
          </div>
          <div className="dp-kpi-footer">
            <span>Cases booked with conservative buffer</span>
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="dp-subtabs-bar">
        <button
          type="button"
          className={`dp-subtab-btn ${activeSubTab === 'models' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('models')}
        >
          <BarChart3 size={15} />
          <span>CPT Duration Prediction Models</span>
          <span className="dp-subtab-badge">{models.length}</span>
        </button>

        <button
          type="button"
          className={`dp-subtab-btn ${activeSubTab === 'calculator' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('calculator')}
        >
          <Calculator size={15} />
          <span>Case Intake Duration Calculator</span>
        </button>

        <button
          type="button"
          className={`dp-subtab-btn ${activeSubTab === 'ledger' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('ledger')}
        >
          <Clock size={15} />
          <span>Historical Prediction Accuracy Ledger</span>
          <span className="dp-subtab-badge">{predictionLogs.length}</span>
        </button>
      </div>

      {/* SUB-VIEW 1: CPT DURATION PREDICTION MODELS */}
      {activeSubTab === 'models' && (
        <div className="dp-view-section">
          {/* Filter Bar */}
          <div className="dp-filter-bar">
            <div className="dp-search-box">
              <Search size={15} className="dp-search-icon" />
              <input
                type="text"
                placeholder="Search surgeon, CPT code, or procedure description..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="dp-search-input"
              />
              {searchTerm && (
                <button type="button" onClick={() => setSearchTerm('')} className="dp-clear-search">
                  <X size={13} />
                </button>
              )}
            </div>

            <div className="dp-filter-group">
              <label className="dp-filter-label">Surgeon:</label>
              <select
                value={surgeonFilter}
                onChange={(e) => setSurgeonFilter(e.target.value)}
                className="dp-select"
              >
                <option value="ALL">All Surgeons</option>
                {availableSurgeons.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div className="dp-filter-group">
              <label className="dp-filter-label">Specialty:</label>
              <select
                value={specialtyFilter}
                onChange={(e) => setSpecialtyFilter(e.target.value)}
                className="dp-select"
              >
                <option value="ALL">All Specialties</option>
                {availableSpecialties.map(spec => (
                  <option key={spec} value={spec}>{spec.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>

            <div className="dp-filter-group">
              <label className="dp-filter-label">Confidence:</label>
              <select
                value={confidenceFilter}
                onChange={(e) => setConfidenceFilter(e.target.value)}
                className="dp-select"
              >
                <option value="ALL">All Levels</option>
                <option value="HIGH">High (N &ge; 20)</option>
                <option value="MODERATE">Moderate (10–19)</option>
                <option value="LOW">Low (5–9)</option>
                <option value="INSUFFICIENT">Insufficient (&lt; 5)</option>
              </select>
            </div>

            {(searchTerm || surgeonFilter !== 'ALL' || specialtyFilter !== 'ALL' || confidenceFilter !== 'ALL') && (
              <button
                type="button"
                className="dp-btn dp-btn-ghost"
                onClick={() => {
                  setSearchTerm('');
                  setSurgeonFilter('ALL');
                  setSpecialtyFilter('ALL');
                  setConfidenceFilter('ALL');
                }}
              >
                Clear Filters
              </button>
            )}
          </div>

          {/* Models Table */}
          <div className="dp-card dp-table-card">
            <div className="dp-card-header">
              <div className="dp-card-title-group">
                <h3 className="dp-card-title">Surgeon-Specific CPT Percentile Distribution Models</h3>
                <span className="dp-card-hint">
                  Statistical percentile durations computed from historical in-room actuals. P80 is the recommended operational standard.
                </span>
              </div>
              <span className="dp-table-count">Showing {filteredModels.length} models</span>
            </div>

            <div className="dp-table-responsive">
              <table className="dp-table">
                <thead>
                  <tr>
                    <th>Surgeon Name</th>
                    <th>CPT &amp; Procedure Description</th>
                    <th className="text-right">Sample (N)</th>
                    <th className="text-right">P50 (Median)</th>
                    <th className="text-right">P75</th>
                    <th className="text-right">P80 (Target)</th>
                    <th className="text-right">P90 (Shield)</th>
                    <th className="text-center">Dispersion (CV)</th>
                    <th className="text-center">Confidence</th>
                    <th>Model Tier &amp; Insight</th>
                    <th className="text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredModels.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="dp-empty-cell">
                        <AlertCircle size={24} className="text-muted" />
                        <p>No duration prediction models match the selected filter criteria.</p>
                      </td>
                    </tr>
                  ) : (
                    filteredModels.map((m) => {
                      const confDef = CONFIDENCE_LEVELS[m.confidenceLevel] || CONFIDENCE_LEVELS.INSUFFICIENT;
                      const tierDef = MODEL_TIERS[m.modelTier] || MODEL_TIERS.TIER_1_SURGEON_CPT;

                      return (
                        <tr key={m.id} className="dp-table-row">
                          <td>
                            <div className="dp-cell-strong">{m.surgeonName}</div>
                            <div className="dp-cell-sub">{m.specialtyCode.replace(/_/g, ' ')}</div>
                          </td>
                          <td>
                            <div className="dp-cpt-pill">CPT {m.primaryCptCode}</div>
                            <div className="dp-cell-proc" title={m.procedureName}>{m.procedureName}</div>
                          </td>
                          <td className="text-right font-mono font-bold">
                            {m.sampleSize}
                          </td>
                          <td className="text-right font-mono text-blue font-bold">
                            {m.p50DurationMinutes} m
                          </td>
                          <td className="text-right font-mono text-muted">
                            {m.p75DurationMinutes} m
                          </td>
                          <td className="text-right font-mono text-emerald font-bold dp-bg-target">
                            {m.p80DurationMinutes} m
                          </td>
                          <td className="text-right font-mono text-amber font-bold">
                            {m.p90DurationMinutes} m
                          </td>
                          <td className="text-center font-mono">
                            <span className={`dp-pill ${m.coefficientOfVariation <= 0.15 ? 'dp-pill-emerald' : 'dp-pill-amber'}`}>
                              {m.coefficientOfVariation.toFixed(3)}
                            </span>
                          </td>
                          <td className="text-center">
                            <span className={`dp-badge ${confDef.badgeClass}`}>
                              {confDef.label}
                            </span>
                          </td>
                          <td>
                            <div className="dp-tier-pill">{tierDef.label}</div>
                            <div className="dp-insight-text" title={m.schedulingInsight}>{m.schedulingInsight}</div>
                          </td>
                          <td className="text-center">
                            <button
                              type="button"
                              className="dp-btn dp-btn-secondary dp-btn-xs"
                              onClick={() => handleOpenModelModal(m)}
                              title="Inspect percentile curve or override model parameters"
                            >
                              <Sliders size={12} />
                              <span>Inspect</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-VIEW 2: CASE INTAKE DURATION CALCULATOR */}
      {activeSubTab === 'calculator' && (
        <div className="dp-view-section">
          {/* Methodological Context Box */}
          <div className="dp-alert-info">
            <Calculator size={18} className="dp-alert-icon" />
            <div className="dp-alert-content">
              <strong>Interactive Surgical Duration Prediction Sandbox</strong>
              <p>
                Select a surgeon, CPT procedure, target percentile strategy, and patient-specific risk modifiers.
                The calculator dynamically computes the recommended booking duration with additive risk buffers to prevent room overtime.
              </p>
            </div>
          </div>

          <div className="dp-calc-grid">
            {/* Input Controls Card */}
            <div className="dp-card dp-calc-form-card">
              <div className="dp-card-header">
                <h3 className="dp-card-title">Case Scheduling Intake Parameters</h3>
              </div>
              <div className="dp-calc-body">
                {/* Surgeon */}
                <div className="dp-form-group">
                  <label className="dp-form-label">Primary Surgeon</label>
                  <select
                    className="dp-form-select"
                    value={calcSurgeon}
                    onChange={(e) => setCalcSurgeon(e.target.value)}
                  >
                    {availableSurgeons.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                {/* CPT Procedure */}
                <div className="dp-form-group">
                  <label className="dp-form-label">Primary CPT Procedure</label>
                  <select
                    className="dp-form-select"
                    value={calcCpt}
                    onChange={(e) => setCalcCpt(e.target.value)}
                  >
                    {models.map(m => (
                      <option key={m.id} value={m.primaryCptCode}>
                        CPT {m.primaryCptCode} &mdash; {m.procedureName} ({m.surgeonName})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Target Percentile Strategy */}
                <div className="dp-form-group">
                  <label className="dp-form-label">Operational Percentile Target</label>
                  <div className="dp-percentile-radio-group">
                    {Object.values(PERCENTILE_PROFILES).map(p => (
                      <label
                        key={p.code}
                        className={`dp-radio-card ${calcPercentile === p.code ? 'active' : ''}`}
                      >
                        <input
                          type="radio"
                          name="calcPercentile"
                          value={p.code}
                          checked={calcPercentile === p.code}
                          onChange={(e) => setCalcPercentile(e.target.value)}
                          className="dp-radio-input"
                        />
                        <div className="dp-radio-content">
                          <span className="dp-radio-title">{p.label}</span>
                          <span className="dp-radio-desc">{p.description}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Clinical Complexity Modifiers */}
                <div className="dp-form-group">
                  <label className="dp-form-label">Clinical Complexity Modifiers</label>
                  <div className="dp-checkbox-group">
                    <label className="dp-checkbox-label">
                      <input
                        type="checkbox"
                        checked={calcBmi}
                        onChange={(e) => setCalcBmi(e.target.checked)}
                      />
                      <span>Patient BMI &ge; 35 (+10% duration buffer)</span>
                    </label>
                    <label className="dp-checkbox-label">
                      <input
                        type="checkbox"
                        checked={calcRevision}
                        onChange={(e) => setCalcRevision(e.target.checked)}
                      />
                      <span>Prior Scarring / Revision Surgery (+15% duration buffer)</span>
                    </label>
                    <label className="dp-checkbox-label">
                      <input
                        type="checkbox"
                        checked={calcDual}
                        onChange={(e) => setCalcDual(e.target.checked)}
                      />
                      <span>Dual / Bilateral Operative Sites (+30% duration buffer)</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Prediction Output Card */}
            <div className="dp-card dp-calc-result-card">
              <div className="dp-card-header">
                <h3 className="dp-card-title">Recommended Case Booking Duration</h3>
                <span className="dp-badge dp-badge-emerald">Deterministic AI Target</span>
              </div>
              <div className="dp-result-body">
                <div className="dp-result-highlight">
                  <span className="dp-result-huge">{calculatedPrediction.recommendedDuration}</span>
                  <span className="dp-result-unit">MINUTES</span>
                </div>

                <div className="dp-result-breakdown">
                  <div className="dp-breakdown-row">
                    <span>Base {calculatedPrediction.targetPercentile} Duration:</span>
                    <strong>{calculatedPrediction.baseDuration} minutes</strong>
                  </div>
                  <div className="dp-breakdown-row">
                    <span>Complexity Risk Buffer:</span>
                    <strong className={calculatedPrediction.complexityBufferMinutes > 0 ? 'text-amber' : 'text-muted'}>
                      +{calculatedPrediction.complexityBufferMinutes} minutes
                    </strong>
                  </div>
                  <div className="dp-breakdown-row">
                    <span>Model Confidence Level:</span>
                    <span className={`dp-badge ${CONFIDENCE_LEVELS[calculatedPrediction.confidenceLevel]?.badgeClass}`}>
                      {CONFIDENCE_LEVELS[calculatedPrediction.confidenceLevel]?.label}
                    </span>
                  </div>
                  <div className="dp-breakdown-row">
                    <span>Model Architecture Tier:</span>
                    <span className="dp-tier-pill">{MODEL_TIERS[calculatedPrediction.modelTier]?.label}</span>
                  </div>
                </div>

                <div className="dp-percentile-ladder">
                  <div className="dp-ladder-step">
                    <span className="dp-ladder-label">P50 (Median)</span>
                    <span className="dp-ladder-val">{calculatedPrediction.model?.p50DurationMinutes || 0}m</span>
                  </div>
                  <div className="dp-ladder-step">
                    <span className="dp-ladder-label">P75 (Quartile)</span>
                    <span className="dp-ladder-val">{calculatedPrediction.model?.p75DurationMinutes || 0}m</span>
                  </div>
                  <div className={`dp-ladder-step ${calcPercentile === 'P80' ? 'active-step' : ''}`}>
                    <span className="dp-ladder-label">P80 (Target)</span>
                    <span className="dp-ladder-val">{calculatedPrediction.model?.p80DurationMinutes || 0}m</span>
                  </div>
                  <div className={`dp-ladder-step ${calcPercentile === 'P90' ? 'active-step' : ''}`}>
                    <span className="dp-ladder-label">P90 (Shield)</span>
                    <span className="dp-ladder-val">{calculatedPrediction.model?.p90DurationMinutes || 0}m</span>
                  </div>
                </div>

                <button
                  type="button"
                  className="dp-btn dp-btn-primary dp-btn-block"
                  onClick={() => showToast(`Applied ${calculatedPrediction.recommendedDuration}m booking template to surgery schedule intake.`)}
                >
                  <FileCheck size={16} />
                  <span>Apply Duration to Intake Scheduling</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-VIEW 3: HISTORICAL PREDICTION ACCURACY LEDGER */}
      {activeSubTab === 'ledger' && (
        <div className="dp-view-section">
          {/* Methodological Context Box */}
          <div className="dp-alert-info">
            <Activity size={18} className="dp-alert-icon" />
            <div className="dp-alert-content">
              <strong>Post-Operative Accuracy &amp; Variance Tracking</strong>
              <p>
                Compares predicted case booking durations against post-operative actual in-room minutes.
                Cases completing within the predicted window validate schedule stability and eliminate downstream delays.
              </p>
            </div>
          </div>

          <div className="dp-card dp-table-card">
            <div className="dp-card-header">
              <div className="dp-card-title-group">
                <h3 className="dp-card-title">Case Duration Prediction vs Actuals Ledger</h3>
                <span className="dp-card-hint">
                  Detailed comparison of scheduled booking, model prediction, and actual in-room surgical times.
                </span>
              </div>
              <span className="dp-table-count">Showing {predictionLogs.length} cases</span>
            </div>

            <div className="dp-table-responsive">
              <table className="dp-table">
                <thead>
                  <tr>
                    <th>Case ID / Date</th>
                    <th>Surgeon Name</th>
                    <th>CPT &amp; Procedure Description</th>
                    <th className="text-right">Scheduled</th>
                    <th className="text-right">Predicted Target</th>
                    <th className="text-center">Percentile</th>
                    <th className="text-right">Actual In-Room</th>
                    <th className="text-center">Error (&Delta;)</th>
                    <th className="text-center">Prediction Status</th>
                    <th className="text-center">Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {predictionLogs.map((log) => {
                    const isWithin = log.actualDurationMinutes <= log.recommendedDurationMinutes;
                    const confDef = CONFIDENCE_LEVELS[log.confidenceLevel] || CONFIDENCE_LEVELS.HIGH;

                    return (
                      <tr key={log.id} className="dp-table-row">
                        <td>
                          <div className="dp-cell-strong">{log.caseId}</div>
                          <div className="dp-cell-sub">{log.surgeryDate}</div>
                        </td>
                        <td>
                          <div className="dp-cell-strong">{log.surgeonName}</div>
                        </td>
                        <td>
                          <div className="dp-cpt-pill">CPT {log.primaryCptCode}</div>
                          <div className="dp-cell-proc" title={log.procedureName}>{log.procedureName}</div>
                        </td>
                        <td className="text-right font-mono text-muted">
                          {log.scheduledDurationMinutes} m
                        </td>
                        <td className="text-right font-mono font-bold text-blue">
                          {log.recommendedDurationMinutes} m
                        </td>
                        <td className="text-center font-mono">
                          <span className="dp-pill dp-pill-neutral">{log.selectedPercentile}</span>
                        </td>
                        <td className="text-right font-mono font-bold">
                          {log.actualDurationMinutes} m
                        </td>
                        <td className="text-center font-mono">
                          <span className={`dp-variance-tag ${log.predictionErrorMinutes > 0 ? 'tag-crimson' : 'tag-emerald'}`}>
                            {log.predictionErrorMinutes > 0 ? `+${log.predictionErrorMinutes}` : log.predictionErrorMinutes} m
                          </span>
                        </td>
                        <td className="text-center">
                          {isWithin ? (
                            <span className="dp-badge badge-emerald">Within Target</span>
                          ) : (
                            <span className="dp-badge badge-crimson">Exceeded Target</span>
                          )}
                        </td>
                        <td className="text-center">
                          <span className={`dp-badge ${confDef.badgeClass}`}>
                            {confDef.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* INSPECT / RETRAIN DURATION MODEL MODAL */}
      {showModelModal && selectedModel && (
        <div className="dp-modal-overlay" onClick={() => setShowModelModal(false)}>
          <div className="dp-modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="dp-modal-header">
              <div className="dp-modal-title-row">
                <Sliders size={20} className="text-blue" />
                <h2 className="dp-modal-title">Duration Model Percentile Curve &amp; Calibration</h2>
              </div>
              <button
                type="button"
                className="dp-modal-close-btn"
                onClick={() => setShowModelModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveModel} className="dp-modal-form">
              <div className="dp-modal-body">
                {/* Summary Card */}
                <div className="dp-modal-summary-card">
                  <div className="dp-summary-row">
                    <span className="dp-summary-label">Surgeon:</span>
                    <strong className="dp-summary-val">{selectedModel.surgeonName}</strong>
                  </div>
                  <div className="dp-summary-row">
                    <span className="dp-summary-label">Procedure:</span>
                    <span className="dp-summary-val">CPT {selectedModel.primaryCptCode} &mdash; {selectedModel.procedureName}</span>
                  </div>
                  <div className="dp-summary-row">
                    <span className="dp-summary-label">Historical Sample Size:</span>
                    <strong className="dp-summary-val">{selectedModel.sampleSize} surgical cases</strong>
                  </div>
                  <div className="dp-summary-row">
                    <span className="dp-summary-label">Coefficient of Variation:</span>
                    <strong className="dp-summary-val">{selectedModel.coefficientOfVariation.toFixed(3)}</strong>
                  </div>
                </div>

                {/* Percentile Inputs */}
                <div className="dp-grid-3">
                  <div className="dp-form-group">
                    <label className="dp-form-label">P50 (Median) Minutes</label>
                    <input
                      type="number"
                      className="dp-form-input"
                      value={modalFormData.p50DurationMinutes}
                      onChange={(e) => setModalFormData({ ...modalFormData, p50DurationMinutes: e.target.value })}
                      required
                    />
                  </div>
                  <div className="dp-form-group">
                    <label className="dp-form-label">P80 (Target) Minutes</label>
                    <input
                      type="number"
                      className="dp-form-input"
                      value={modalFormData.p80DurationMinutes}
                      onChange={(e) => setModalFormData({ ...modalFormData, p80DurationMinutes: e.target.value })}
                      required
                    />
                  </div>
                  <div className="dp-form-group">
                    <label className="dp-form-label">P90 (Shield) Minutes</label>
                    <input
                      type="number"
                      className="dp-form-input"
                      value={modalFormData.p90DurationMinutes}
                      onChange={(e) => setModalFormData({ ...modalFormData, p90DurationMinutes: e.target.value })}
                      required
                    />
                  </div>
                </div>

                {/* Scheduling Insight Notes */}
                <div className="dp-form-group">
                  <label className="dp-form-label">
                    Clinical Scheduling Insight &amp; Model Rationale
                  </label>
                  <textarea
                    rows={3}
                    className="dp-form-textarea"
                    placeholder="Document clinical guidance for intake schedulers..."
                    value={modalFormData.schedulingInsight}
                    onChange={(e) => setModalFormData({ ...modalFormData, schedulingInsight: e.target.value })}
                  />
                </div>
              </div>

              {/* Pinned Modal Footer */}
              <div className="dp-modal-footer">
                <button
                  type="button"
                  className="dp-btn dp-btn-secondary"
                  onClick={() => setShowModelModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="dp-btn dp-btn-primary"
                >
                  <CheckCircle2 size={15} />
                  <span>Save Model Parameters</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

