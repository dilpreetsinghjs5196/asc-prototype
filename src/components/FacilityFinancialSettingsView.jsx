import React, { useState, useMemo } from 'react';
import {
  Building2,
  DollarSign,
  Clock,
  ShieldCheck,
  Calendar,
  Layers,
  Plus,
  CheckCircle2,
  AlertCircle,
  FileText,
  UserCheck,
  Activity,
  Box,
  X,
  History,
  Lock,
  ArrowRight
} from 'lucide-react';
import {
  facilityFinancialSettingsService,
  CLINICAL_ROLES,
  CLINICAL_ROLE_CONFIG,
  SCHEDULE_STATUSES,
  STATUS_CONFIG
} from '../lib/facilityFinancialSettingsService.js';
import './FacilityFinancialSettingsView.css';

const SAMPLE_FACILITIES = [
  { id: 'fac-001', name: 'Naples Surgery Center', code: 'NSC-MAIN', location: 'ASC North Suite 2' },
  { id: 'fac-002', name: 'ASC Eye Pavilion', code: 'EYE-PAV', location: 'Building B Suite 100' },
  { id: 'fac-003', name: 'ASC Main Surgical Pavilion', code: 'MAIN-OR', location: 'Main Suite 1' }
];

export default function FacilityFinancialSettingsView() {
  const [selectedFacilityId, setSelectedFacilityId] = useState('fac-001');
  const [showDraftModal, setShowDraftModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Form State for New Draft Schedule
  const [newScheduleName, setNewScheduleName] = useState('ASC Mid-Year Budget Revision 2026');
  const [newVersionNum, setNewVersionNum] = useState('2026.2');
  const [newOrRate, setNewOrRate] = useState('10.50');
  const [newPacu1Rate, setNewPacu1Rate] = useState('3.75');
  const [newPacu2Rate, setNewPacu2Rate] = useState('2.15');
  const [newPreopRate, setNewPreopRate] = useState('2.65');
  const [newBurden, setNewBurden] = useState('1.2500');
  const [newIndirectPerCase, setNewIndirectPerCase] = useState('130.00');
  const [newEquipHourly, setNewEquipHourly] = useState('90.00');
  const [newStartDate, setNewStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [newNotes, setNewNotes] = useState('Updated facility labor burden and sterile supply index.');

  const currentFacility = useMemo(() => {
    return SAMPLE_FACILITIES.find(f => f.id === selectedFacilityId) || SAMPLE_FACILITIES[0];
  }, [selectedFacilityId]);

  // Retrieve active schedule & all historical schedules
  const activeSettings = useMemo(() => {
    return facilityFinancialSettingsService.getActiveFacilitySettings(currentFacility.id);
  }, [currentFacility.id, refreshTrigger]);

  const allSchedules = useMemo(() => {
    return facilityFinancialSettingsService.getAllFacilitySchedules(currentFacility.id);
  }, [currentFacility.id, refreshTrigger]);

  const handleCreateDraft = (e) => {
    e.preventDefault();
    setErrorMessage('');
    try {
      const orRate = parseFloat(newOrRate);
      const pacu1 = parseFloat(newPacu1Rate);
      const pacu2 = parseFloat(newPacu2Rate);
      const preop = parseFloat(newPreopRate);
      const burden = parseFloat(newBurden);
      const indirect = parseFloat(newIndirectPerCase);
      const equip = parseFloat(newEquipHourly);

      if (isNaN(orRate) || orRate <= 0) throw new Error('OR Minute Rate must be greater than $0.00');
      if (isNaN(burden) || burden < 1.0) throw new Error('Burden Multiplier cannot be less than 1.0000');
      if (!newNotes.trim()) throw new Error('Audit rationale/notes are mandatory for financial compliance.');

      const draft = facilityFinancialSettingsService.createDraftSchedule({
        facilityId: currentFacility.id,
        scheduleName: newScheduleName,
        versionNumber: newVersionNum,
        orMinuteRate: orRate,
        pacuPhase1MinuteRate: pacu1,
        pacuPhase2MinuteRate: pacu2,
        preopMinuteRate: preop,
        defaultLaborBurdenMultiplier: burden,
        indirectCostPerCase: indirect,
        equipmentDepreciationHourlyRate: equip,
        effectiveStartDate: newStartDate,
        notes: newNotes
      });

      setSuccessMessage(`Draft Version ${draft.versionNumber} successfully created.`);
      setShowDraftModal(false);
      setRefreshTrigger(prev => prev + 1);
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (err) {
      setErrorMessage(err.message || 'Failed to create draft schedule.');
    }
  };

  const handleSubmitForReview = (settingsId, versionNumber) => {
    try {
      facilityFinancialSettingsService.submitForApproval(currentFacility.id, settingsId);
      setSuccessMessage(`Version ${versionNumber} submitted for CFO executive review.`);
      setRefreshTrigger(prev => prev + 1);
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (err) {
      setErrorMessage(err.message);
    }
  };

  const handleApprove = (settingsId, versionNumber) => {
    try {
      facilityFinancialSettingsService.approveSchedule(currentFacility.id, settingsId, 'Jane Sterling, CFO');
      setSuccessMessage(`Version ${versionNumber} successfully approved and locked as ACTIVE schedule!`);
      setRefreshTrigger(prev => prev + 1);
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (err) {
      setErrorMessage(err.message);
    }
  };

  return (
    <div className="facility-settings-container">
      {/* Top Action & Facility Selector Toolbar */}
      <div className="settings-topbar">
        <div className="topbar-left">
          <div className="facility-selector-box">
            <span className="selector-label">Active Facility:</span>
            <select
              className="facility-dropdown"
              value={selectedFacilityId}
              onChange={(e) => setSelectedFacilityId(e.target.value)}
            >
              {SAMPLE_FACILITIES.map(f => (
                <option key={f.id} value={f.id}>
                  {f.name} ({f.code}) — {f.location}
                </option>
              ))}
            </select>
          </div>

          <div className="topbar-badges">
            <span className="badge-standard">
              <Lock size={13} />
              Version: {activeSettings.versionNumber}
            </span>
            <span className="status-pill bg-emerald-950/40 text-emerald-400 border-emerald-800">
              <ShieldCheck size={13} className="mr-1" />
              Active (Locked)
            </span>
          </div>
        </div>

        <div className="topbar-right">
          <button
            className="action-btn btn-primary"
            onClick={() => {
              setErrorMessage('');
              setShowDraftModal(true);
            }}
          >
            <Plus size={15} />
            + Draft New Version
          </button>
        </div>
      </div>

      {/* Alerts */}
      {successMessage && (
        <div className="alert-banner alert-success">
          <CheckCircle2 size={16} />
          <span>{successMessage}</span>
          <button className="alert-close" onClick={() => setSuccessMessage('')}>
            <X size={14} />
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="alert-banner alert-danger">
          <AlertCircle size={16} />
          <span>{errorMessage}</span>
          <button className="alert-close" onClick={() => setErrorMessage('')}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Facility Meta Header Card */}
      <div className="facility-meta-card">
        <div className="facility-meta-left">
          <div className="facility-avatar">
            <Building2 size={24} />
          </div>
          <div className="facility-details">
            <div className="facility-title">
              <span className="facility-name">{currentFacility.name}</span>
              <span className="facility-code">{currentFacility.code}</span>
              <span className="schedule-badge">{activeSettings.scheduleName}</span>
            </div>
            <div className="facility-sub">
              <span>{currentFacility.location}</span>
              <span className="meta-separator">•</span>
              <span>Effective Since: {activeSettings.effectiveStartDate}</span>
              <span className="meta-separator">•</span>
              <span className="text-emerald font-semibold">CFO Approved: {activeSettings.approvedBy}</span>
            </div>
          </div>
        </div>

        <div className="facility-meta-right">
          <div className="meta-attribute">
            <span className="attr-label">Effective Dates</span>
            <span className="attr-value">
              <Calendar size={13} className="inline mr-1 text-slate" />
              {activeSettings.effectiveStartDate} ➔ {activeSettings.effectiveEndDate || 'Present'}
            </span>
          </div>
          <div className="meta-attribute">
            <span className="attr-label">Board Approval Trace</span>
            <span className="attr-value text-sky">SOX 404 & HIPAA Locked</span>
          </div>
        </div>
      </div>

      {/* Active Baseline Rates KPI Grid */}
      <div className="kpi-grid">
        {/* OR Suite Minute Rate */}
        <div className="kpi-card highlight-kpi">
          <div className="kpi-header">
            <span className="kpi-title">OR Suite Minute Rate</span>
            <Clock size={18} className="kpi-icon text-emerald" />
          </div>
          <div className="kpi-value text-emerald">
            {facilityFinancialSettingsService.formatCurrency(activeSettings.orMinuteRate)}
            <span className="text-xs font-normal text-slate-400"> / min</span>
          </div>
          <div className="kpi-subtext">
            <span>Operating suite baseline rate</span>
            <span className="font-semibold text-slate-300">
              {facilityFinancialSettingsService.formatCurrency(activeSettings.orMinuteRate * 60)}/hr
            </span>
          </div>
        </div>

        {/* PACU Phase I & II Minute Rates */}
        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">PACU Recovery Rates</span>
            <Activity size={18} className="kpi-icon text-sky" />
          </div>
          <div className="kpi-value text-sky">
            {facilityFinancialSettingsService.formatCurrency(activeSettings.pacuPhase1MinuteRate)}
            <span className="text-xs font-normal text-slate-400"> / min (Phase I)</span>
          </div>
          <div className="kpi-subtext">
            <span>Phase II Step-down rate</span>
            <span className="text-sky font-semibold">
              {facilityFinancialSettingsService.formatCurrency(activeSettings.pacuPhase2MinuteRate)}/min
            </span>
          </div>
        </div>

        {/* Payroll Burden Multiplier */}
        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">Clinical Labor Burden</span>
            <ShieldCheck size={18} className="kpi-icon text-amber" />
          </div>
          <div className="kpi-value text-amber">
            {Number(activeSettings.defaultLaborBurdenMultiplier).toFixed(4)}x
          </div>
          <div className="kpi-subtext">
            <span>Taxes, benefits & malpractice</span>
            <span className="text-amber font-semibold">
              +{((activeSettings.defaultLaborBurdenMultiplier - 1) * 100).toFixed(1)}% loaded
            </span>
          </div>
        </div>

        {/* Indirect Overhead & Equipment */}
        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">Indirect Cost & Capital</span>
            <Box size={18} className="kpi-icon text-slate" />
          </div>
          <div className="kpi-value text-slate-100">
            {facilityFinancialSettingsService.formatCurrency(activeSettings.indirectCostPerCase)}
            <span className="text-xs font-normal text-slate-400"> / case</span>
          </div>
          <div className="kpi-subtext">
            <span>Capital equipment depreciation</span>
            <span className="text-slate-300 font-semibold">
              {facilityFinancialSettingsService.formatCurrency(activeSettings.equipmentDepreciationHourlyRate)}/hr
            </span>
          </div>
        </div>
      </div>

      {/* Clinical Role Wage Schedule Matrix */}
      <div className="wage-matrix-section">
        <div className="section-header">
          <div className="section-title-wrap">
            <h3 className="section-title">Clinical Role Wage & Loaded Labor Cost Schedule</h3>
            <span className="section-desc">
              Authoritative hourly baseline wages and payroll burden multipliers used in Case Cost Model (Phase 72)
            </span>
          </div>
          <span className="badge-standard">
            Fixed NUMERIC(10,2) • Multiplier &ge; 1.0000 Floor
          </span>
        </div>

        <div className="table-responsive">
          <table className="settings-table">
            <thead>
              <tr>
                <th>Clinical Role & Title</th>
                <th>Department</th>
                <th>Clinical Role Description</th>
                <th className="text-right">Base Hourly Wage</th>
                <th className="text-right">Burden Multiplier</th>
                <th className="text-right">Loaded Hourly Cost</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {activeSettings.roleWageRates.map(roleItem => {
                const cfg = CLINICAL_ROLE_CONFIG[roleItem.clinicalRole] || {
                  label: roleItem.clinicalRole,
                  department: 'Clinical',
                  description: 'Surgical team member'
                };

                return (
                  <tr key={roleItem.clinicalRole} className="settings-row">
                    <td>
                      <div className="role-cell">
                        <span className="role-name">{cfg.label}</span>
                        <span className="role-code">{roleItem.clinicalRole}</span>
                      </div>
                    </td>
                    <td>
                      <span className="dept-tag">{cfg.department}</span>
                    </td>
                    <td>
                      <span className="role-desc">{cfg.description}</span>
                    </td>
                    <td className="text-right font-mono text-slate-200">
                      {facilityFinancialSettingsService.formatCurrency(roleItem.baseHourlyWage)}/hr
                    </td>
                    <td className="text-right font-mono text-amber">
                      {Number(roleItem.roleBurdenMultiplier).toFixed(4)}x
                    </td>
                    <td className="text-right font-mono font-bold text-emerald">
                      {facilityFinancialSettingsService.formatCurrency(roleItem.effectiveHourlyCost)}/hr
                    </td>
                    <td>
                      <span className="status-pill bg-emerald-950/40 text-emerald-400 border-emerald-800">
                        Active
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Historical Versions & Effective Dating Timeline */}
      <div className="history-section">
        <div className="section-header">
          <div className="section-title-wrap">
            <h3 className="section-title">Effective Dating Version History & Governance Trace</h3>
            <span className="section-desc">
              Immutable version trail ensuring past surgical cases lock to their respective Date of Service schedule
            </span>
          </div>
          <span className="badge-standard">
            <History size={13} />
            Version Audited
          </span>
        </div>

        <div className="table-responsive">
          <table className="settings-table">
            <thead>
              <tr>
                <th>Version</th>
                <th>Schedule Name</th>
                <th>Effective Date Span</th>
                <th className="text-right">OR Rate</th>
                <th className="text-right">PACU Rate</th>
                <th className="text-right">Burden</th>
                <th>Status</th>
                <th>CFO Approval Trace</th>
                <th className="text-center">Lifecycle Action</th>
              </tr>
            </thead>
            <tbody>
              {allSchedules.map(sched => {
                const statusCfg = STATUS_CONFIG[sched.status] || {
                  label: sched.status,
                  badgeClass: 'bg-slate-800 text-slate-300'
                };

                return (
                  <tr key={sched.id} className="settings-row">
                    <td className="font-mono font-bold text-sky">
                      {sched.versionNumber}
                    </td>
                    <td>
                      <div className="sched-desc-cell">
                        <span className="font-semibold text-slate-100">{sched.scheduleName}</span>
                        <span className="text-xs text-slate-400">{sched.notes}</span>
                      </div>
                    </td>
                    <td className="font-mono text-xs text-slate-300 whitespace-nowrap">
                      {sched.effectiveStartDate} ➔ {sched.effectiveEndDate || 'Present'}
                    </td>
                    <td className="text-right font-mono text-emerald">
                      {facilityFinancialSettingsService.formatCurrency(sched.orMinuteRate)}/m
                    </td>
                    <td className="text-right font-mono text-sky">
                      {facilityFinancialSettingsService.formatCurrency(sched.pacuPhase1MinuteRate)}/m
                    </td>
                    <td className="text-right font-mono text-amber">
                      {Number(sched.defaultLaborBurdenMultiplier).toFixed(2)}x
                    </td>
                    <td>
                      <span className={`status-pill ${statusCfg.badgeClass}`}>
                        {statusCfg.label}
                      </span>
                    </td>
                    <td>
                      {sched.approvedBy ? (
                        <div className="approval-trace">
                          <span className="text-xs text-slate-200 font-semibold">{sched.approvedBy}</span>
                          <span className="text-2xs text-slate-400 font-mono">
                            {new Date(sched.approvedAt).toLocaleDateString()}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500 italic">Pending Authorization</span>
                      )}
                    </td>
                    <td className="text-center">
                      {sched.status === SCHEDULE_STATUSES.DRAFT && (
                        <button
                          className="action-btn btn-secondary text-xs py-1 px-2"
                          onClick={() => handleSubmitForReview(sched.id, sched.versionNumber)}
                        >
                          Submit Review →
                        </button>
                      )}
                      {sched.status === SCHEDULE_STATUSES.PENDING_APPROVAL && (
                        <button
                          className="action-btn btn-primary text-xs py-1 px-2"
                          onClick={() => handleApprove(sched.id, sched.versionNumber)}
                        >
                          <UserCheck size={12} />
                          Approve (CFO)
                        </button>
                      )}
                      {sched.status === SCHEDULE_STATUSES.ACTIVE && (
                        <span className="text-xs text-emerald font-semibold flex items-center justify-center gap-1">
                          <Lock size={12} />
                          Active Lock
                        </span>
                      )}
                      {sched.status === SCHEDULE_STATUSES.SUPERSEDED && (
                        <span className="text-xs text-slate-500">Archived</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Draft New Schedule Modal */}
      {showDraftModal && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <div className="modal-title-box">
                <Plus size={18} className="text-sky" />
                <h3>Draft New Facility Cost Schedule</h3>
              </div>
              <button
                className="alert-close text-slate-400 hover:text-white"
                onClick={() => setShowDraftModal(false)}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateDraft} className="modal-form">
              <div className="form-group">
                <label className="form-label">Schedule Name *</label>
                <input
                  type="text"
                  className="form-input text-sm"
                  value={newScheduleName}
                  onChange={(e) => setNewScheduleName(e.target.value)}
                  required
                />
              </div>

              <div className="form-row">
                <div className="form-group flex-1">
                  <label className="form-label">Version Number *</label>
                  <input
                    type="text"
                    className="form-input font-mono text-sm"
                    value={newVersionNum}
                    onChange={(e) => setNewVersionNum(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group flex-1">
                  <label className="form-label">Effective Start Date *</label>
                  <input
                    type="date"
                    className="form-input text-sm"
                    value={newStartDate}
                    onChange={(e) => setNewStartDate(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group flex-1">
                  <label className="form-label">OR Minute Rate ($) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.00"
                    className="form-input font-mono"
                    value={newOrRate}
                    onChange={(e) => setNewOrRate(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group flex-1">
                  <label className="form-label">PACU Phase I Rate ($) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.00"
                    className="form-input font-mono"
                    value={newPacu1Rate}
                    onChange={(e) => setNewPacu1Rate(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group flex-1">
                  <label className="form-label">PACU Phase II Rate ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.00"
                    className="form-input font-mono"
                    value={newPacu2Rate}
                    onChange={(e) => setNewPacu2Rate(e.target.value)}
                  />
                </div>

                <div className="form-group flex-1">
                  <label className="form-label">Labor Burden Multiplier *</label>
                  <input
                    type="number"
                    step="0.0001"
                    min="1.0000"
                    className="form-input font-mono"
                    value={newBurden}
                    onChange={(e) => setNewBurden(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group flex-1">
                  <label className="form-label">Indirect Cost per Case ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.00"
                    className="form-input font-mono"
                    value={newIndirectPerCase}
                    onChange={(e) => setNewIndirectPerCase(e.target.value)}
                  />
                </div>

                <div className="form-group flex-1">
                  <label className="form-label">Equipment Depreciation ($/hr)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.00"
                    className="form-input font-mono"
                    value={newEquipHourly}
                    onChange={(e) => setNewEquipHourly(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Revision Rationale / Audit Notes *</label>
                <textarea
                  className="form-input text-sm resize-none"
                  rows={2}
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  required
                />
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="action-btn btn-secondary"
                  onClick={() => setShowDraftModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="action-btn btn-primary">
                  <Plus size={15} />
                  Save Draft Schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
