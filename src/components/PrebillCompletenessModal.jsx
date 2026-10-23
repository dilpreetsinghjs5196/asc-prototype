import React, { useState, useEffect, useCallback } from 'react';
import { 
  X, CheckCircle2, AlertTriangle, AlertOctagon, ShieldAlert, 
  FileText, Cpu, DollarSign, Check, RefreshCw, Key
} from 'lucide-react';
import { db } from '../lib/supabase';
import { rbacService } from '../lib/rbacService';

export default function PrebillCompletenessModal({ isOpen, onClose, surgery, onSignoffComplete }) {
  const [loading, setLoading] = useState(true);
  const [evaluating, setEvaluating] = useState(false);
  const [runData, setRunData] = useState(null);
  const [findings, setFindings] = useState([]);
  const [devices, setDevices] = useState([]);
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [selectedFinding, setSelectedFinding] = useState(null);
  const [overrideReason, setOverrideReason] = useState('');
  const [actionError, setActionError] = useState('');
  const [userPerms, setUserPerms] = useState([]);

  const loadPermissions = useCallback(async () => {
    const perms = await rbacService.getPermissionsForUser(surgery?.facility_id);
    setUserPerms(perms || []);
  }, [surgery?.facility_id]);

  const loadAuditData = useCallback(async () => {
    if (!surgery?.id) return;
    setLoading(true);
    setActionError('');
    try {
      // 1. Fetch devices
      const devList = await db.getCaseDevices(surgery.id);
      setDevices(devList || []);

      // 2. Fetch latest completeness run
      let run = await db.getLatestCompletenessRun(surgery.id);
      if (!run) {
        // Run evaluation if none exists
        run = await db.evaluateChargeCompleteness(surgery.id);
      }
      setRunData(run);

      if (run?.id || run?.run_id) {
        const fList = await db.getCompletenessFindings(run.id || run.run_id);
        setFindings(fList || []);
      }
    } catch (err) {
      console.error('Error loading completeness audit:', err);
      setActionError('Failed to load charge completeness findings: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [surgery?.id]);

  useEffect(() => {
    if (isOpen && surgery?.id) {
      loadAuditData();
      loadPermissions();
    }
  }, [isOpen, surgery?.id, loadAuditData, loadPermissions]);

  const handleReevaluate = async () => {
    setEvaluating(true);
    setActionError('');
    try {
      const res = await db.evaluateChargeCompleteness(surgery.id);
      setRunData(res);
      if (res?.run_id) {
        const fList = await db.getCompletenessFindings(res.run_id);
        setFindings(fList || []);
      }
    } catch (err) {
      console.error('Error running completeness evaluation:', err);
      setActionError('Evaluation failed: ' + err.message);
    } finally {
      setEvaluating(false);
    }
  };

  const handleOpenOverride = (finding) => {
    setSelectedFinding(finding);
    setOverrideReason('');
    setOverrideModalOpen(true);
  };

  const handleSubmitOverride = async (e) => {
    e.preventDefault();
    if (!overrideReason.trim()) {
      setActionError('Override reason is mandatory.');
      return;
    }
    try {
      const session = db.getSession();
      await db.overrideCompletenessFinding(selectedFinding.id, overrideReason, session?.user?.id);
      setOverrideModalOpen(false);
      await loadAuditData();
    } catch (err) {
      setActionError('Failed to save override: ' + err.message);
    }
  };

  const handleSignoff = async () => {
    if (!canSignoff) return;
    try {
      const session = db.getSession();
      await db.clearCompletenessRun(runData.id || runData.run_id, 'Signed off in pre-bill completeness review', session?.user?.id);
      if (onSignoffComplete) onSignoffComplete(surgery.id);
      onClose();
    } catch (err) {
      setActionError('Sign-off failed: ' + err.message);
    }
  };

  if (!isOpen || !surgery) return null;

  const canOverride = rbacService.hasPermission(userPerms, 'billing.override_blocker');
  const canSignoff = rbacService.hasPermission(userPerms, 'billing.signoff_prebill') && 
                     (runData?.blocker_count === 0 || runData?.is_cleared);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-4xl w-full shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-500/10 border border-blue-500/20 rounded-lg text-blue-400">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-3">
                Pre-Bill Charge Completeness Review
                <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                  runData?.overall_status === 'clean' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                  runData?.overall_status === 'blocked' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
                  runData?.overall_status === 'overridden' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' :
                  'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                }`}>
                  {runData?.overall_status?.toUpperCase() || 'EVALUATING'}
                </span>
              </h2>
              <p className="text-sm text-slate-400">
                Case #{surgery.id} • {surgery.patient_name || 'Patient'} • DOS: {surgery.date || 'Today'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleReevaluate}
              disabled={evaluating}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors flex items-center gap-1.5 text-xs"
              title="Rerun Completeness Engine"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${evaluating ? 'animate-spin' : ''}`} />
              Re-evaluate
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {actionError && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-400 text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              {actionError}
            </div>
          )}

          {/* Metric Summary Bar */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-slate-800/50 border border-slate-700/50 p-4 rounded-lg">
              <span className="text-xs text-slate-400 font-medium">Total Findings</span>
              <div className="text-2xl font-bold text-white mt-1">
                {runData?.total_findings || 0}
              </div>
            </div>
            <div className="bg-slate-800/50 border border-slate-700/50 p-4 rounded-lg">
              <span className="text-xs text-rose-400 font-medium">Active Blockers</span>
              <div className="text-2xl font-bold text-rose-400 mt-1">
                {runData?.blocker_count || 0}
              </div>
            </div>
            <div className="bg-slate-800/50 border border-slate-700/50 p-4 rounded-lg">
              <span className="text-xs text-amber-400 font-medium">Warnings</span>
              <div className="text-2xl font-bold text-amber-400 mt-1">
                {runData?.warning_count || 0}
              </div>
            </div>
            <div className="bg-slate-800/50 border border-slate-700/50 p-4 rounded-lg">
              <span className="text-xs text-blue-400 font-medium">Logged Devices</span>
              <div className="text-2xl font-bold text-blue-400 mt-1">
                {devices.length}
              </div>
            </div>
          </div>

          {/* Findings Section */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-400" />
              Pre-Bill Completeness Findings
            </h3>

            {loading ? (
              <div className="p-8 text-center text-slate-400">Loading audit findings...</div>
            ) : findings.length === 0 ? (
              <div className="p-6 bg-emerald-500/5 border border-emerald-500/20 rounded-lg text-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                <p className="text-emerald-300 font-medium text-sm">No Charge Completeness Issues Found</p>
                <p className="text-slate-400 text-xs mt-1">This encounter satisfies all 12 pre-bill completeness validation rules.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {findings.map((f) => {
                  const isBlocker = f.severity === 'BLOCKER' || f.severity === 'ERROR';
                  return (
                    <div 
                      key={f.id}
                      className={`p-4 rounded-lg border flex items-start justify-between gap-4 transition-all ${
                        f.is_overridden ? 'bg-slate-800/30 border-purple-500/30 opacity-75' :
                        isBlocker ? 'bg-rose-500/5 border-rose-500/20' : 'bg-amber-500/5 border-amber-500/20'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5">
                          {f.is_overridden ? (
                            <Check className="w-4 h-4 text-purple-400" />
                          ) : isBlocker ? (
                            <AlertOctagon className="w-4 h-4 text-rose-400" />
                          ) : (
                            <AlertTriangle className="w-4 h-4 text-amber-400" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono font-bold text-slate-300 bg-slate-800 px-2 py-0.5 rounded">
                              {f.rule_id}
                            </span>
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${
                              isBlocker ? 'bg-rose-500/20 text-rose-300' : 'bg-amber-500/20 text-amber-300'
                            }`}>
                              {f.severity}
                            </span>
                            <span className="text-xs text-slate-400">({f.rule_category})</span>
                            {f.is_overridden && (
                              <span className="text-[10px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded font-medium">
                                OVERRIDDEN
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-slate-200 mt-1 font-medium">{f.finding_message}</p>
                          {f.resolution_guidance && (
                            <p className="text-xs text-slate-400 mt-1">
                              <span className="text-slate-500">Guidance:</span> {f.resolution_guidance}
                            </p>
                          )}
                          {f.is_overridden && (
                            <p className="text-xs text-purple-300 mt-1.5 italic bg-purple-900/20 p-1.5 rounded border border-purple-500/20">
                              Override Justification: "{f.override_reason}"
                            </p>
                          )}
                        </div>
                      </div>

                      {isBlocker && !f.is_overridden && canOverride && (
                        <button
                          onClick={() => handleOpenOverride(f)}
                          className="px-2.5 py-1 text-xs font-medium rounded bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 transition-colors flex items-center gap-1 flex-shrink-0"
                        >
                          <Key className="w-3 h-3" />
                          Override
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Itemized Devices & Implants Section */}
          <div className="space-y-3 pt-4 border-t border-slate-800">
            <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <Cpu className="w-4 h-4 text-emerald-400" />
              Itemized Case Devices & Implants ({devices.length})
            </h3>
            {devices.length === 0 ? (
              <p className="text-xs text-slate-500 italic">No itemized devices recorded on this surgical case.</p>
            ) : (
              <div className="border border-slate-800 rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-800/60 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="p-2.5">Device Name</th>
                      <th className="p-2.5">HCPCS Code</th>
                      <th className="p-2.5">Manufacturer</th>
                      <th className="p-2.5">Serial / Lot</th>
                      <th className="p-2.5 text-right">Qty</th>
                      <th className="p-2.5 text-right">Unit Cost</th>
                      <th className="p-2.5 text-right">Charge</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {devices.map((d) => (
                      <tr key={d.id} className="hover:bg-slate-800/30">
                        <td className="p-2.5 font-medium text-white">{d.device_name}</td>
                        <td className="p-2.5 font-mono text-blue-400">{d.hcpcs_code || '—'}</td>
                        <td className="p-2.5">{d.manufacturer || '—'}</td>
                        <td className="p-2.5 text-slate-400">{d.serial_number || d.lot_number || '—'}</td>
                        <td className="p-2.5 text-right">{d.quantity}</td>
                        <td className="p-2.5 text-right font-mono">${parseFloat(d.unit_cost || 0).toFixed(2)}</td>
                        <td className="p-2.5 text-right font-mono font-medium text-emerald-400">
                          ${parseFloat(d.charge_amount || 0).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-slate-800 flex items-center justify-between bg-slate-900/50">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <DollarSign className="w-4 h-4 text-slate-400" />
            Statutory AMA CPT® & CMS ASC Addenda Compliant Pre-Bill Engine
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors"
            >
              Close
            </button>
            <button
              onClick={handleSignoff}
              disabled={!canSignoff}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                canSignoff 
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20' 
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              Sign-Off & Clear for Billing
            </button>
          </div>
        </div>
      </div>

      {/* Override Dialog Modal */}
      {overrideModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl max-w-lg w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Key className="w-5 h-5 text-purple-400" />
                Override Completeness Blocker
              </h3>
              <button 
                onClick={() => setOverrideModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg text-xs text-purple-300">
              <span className="font-bold">{selectedFinding?.rule_id}:</span> {selectedFinding?.finding_message}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Mandatory Clinical / Billing Override Justification:
              </label>
              <textarea
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                rows={3}
                placeholder="Document payer exception, emergency clinical circumstance, or authorized director sign-off..."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-purple-500"
                required
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setOverrideModalOpen(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmitOverride}
                className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium"
              >
                Commit Override
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
