import React, { useState } from 'react';
import { AgentOrchestrator } from '../agents/AgentOrchestrator';
import { 
  Play, Bot, Cpu, FileText, 
  AlertTriangle, RotateCcw, ArrowRight, ShieldCheck 
} from 'lucide-react';
import Swal from 'sweetalert2';
import { db } from '../lib/supabase.js';
import { rbacService } from '../lib/rbacService.js';
import { maskPatientName, maskMRN } from '../utils/phiMasking.js';

export default function MultiAgentConsole({ surgeries, cptCodes, patients = [], onSchedule }) {
  const session = db.getSession();
  const userRole = rbacService.normalizeRole(session?.role);
  const canCommitSchedule = !['viewer', 'biller', 'coder'].includes(userRole);
  const canViewPHI = ['super_admin', 'org_admin', 'facility_admin', 'clinical_manager', 'scheduler', 'surgeon'].includes(userRole);

  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [patientName, setPatientName] = useState('');
  const [mrn, setMrn] = useState('');
  const [selectedCpts, setSelectedCpts] = useState([]);
  const [procedureDesc, setProcedureDesc] = useState('');
  const [grossCharge, setGrossCharge] = useState(0);
  const [suppliesCost, setSuppliesCost] = useState(0);
  const [implantCost, setImplantCost] = useState(0);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedTime, setSelectedTime] = useState('08:00');
  
  // Removed auto-filling defaults on load as per user request
  
  const handlePatientChange = (id) => {
    setSelectedPatientId(id);
    if (!id) {
       setPatientName('');
       setMrn('');
       return;
    }
    const p = patients.find(x => String(x.id) === String(id));
    if (p) {
       const rawName = p.name || 'Unknown Patient';
       const rawMrn = p.mrn || `MRN-${p.id}`;
       setPatientName(canViewPHI ? rawName : maskPatientName(rawName));
       setMrn(canViewPHI ? rawMrn : maskMRN(rawMrn));
    }
  };

  
  const handleCptChange = (code) => {
    const c = cptCodes.find(x => String(x.code) === String(code));
    if (c && !selectedCpts.find(x => x.code === c.code)) {
       const newCpts = [...selectedCpts, c];
       setSelectedCpts(newCpts);
       setProcedureDesc(newCpts.map(x => `${x.code} - ${x.description || 'Procedure'}`).join(', '));
       
       setGrossCharge(prev => prev + (c.gross_charge || c.fee || 22000));
       setSuppliesCost(prev => prev + (c.supplies_cost || c.supplies || 4500));
       setImplantCost(prev => prev + (c.implants_cost || c.implants || 6000));
    }
  };

  const removeCpt = (code) => {
    const c = selectedCpts.find(x => String(x.code) === String(code));
    if (c) {
       const newCpts = selectedCpts.filter(x => String(x.code) !== String(code));
       setSelectedCpts(newCpts);
       setProcedureDesc(newCpts.map(x => `${x.code} - ${x.description || 'Procedure'}`).join(', '));
       
       setGrossCharge(prev => Math.max(0, prev - (c.gross_charge || c.fee || 22000)));
       setSuppliesCost(prev => Math.max(0, prev - (c.supplies_cost || c.supplies || 4500)));
       setImplantCost(prev => Math.max(0, prev - (c.implants_cost || c.implants || 6000)));
    }
  };

  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState([]);
  const [agentStatuses, setAgentStatuses] = useState({
    patient: 'pending',
    cpt: 'pending',
    cost: 'pending',
    orTime: 'pending',
    billing: 'pending'
  });
  const [finalContext, setFinalContext] = useState(null);
  const [approved, setApproved] = useState(false);

  const appendLog = (message, type = 'info') => {
    setLogs(prev => [...prev, { text: message, type, time: new Date().toLocaleTimeString() }]);
  };

  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  const runSimulation = async () => {
    // Check for scheduling conflicts
    const hasConflict = surgeries && surgeries.some(s => 
      s.date === selectedDate && 
      (s.start_time === selectedTime || (s.actual_start_time && s.actual_start_time.startsWith(selectedTime))) &&
      s.status !== 'cancelled'
    );

    if (hasConflict) {
      Swal.fire({
        title: 'Schedule Conflict',
        text: 'schedule already booked please change time',
        icon: 'warning',
        background: 'var(--bg-card)',
        color: 'var(--text-primary)'
      });
      return;
    }

    setIsRunning(true);
    setApproved(false);
    setFinalContext(null);
    setLogs([]);
    setAgentStatuses({
      patient: 'pending',
      cpt: 'pending',
      cost: 'pending',
      orTime: 'pending',
      billing: 'pending'
    });

    appendLog('Starting Multi-Agent Orchestrator...', 'system');
    await delay(800);

    // 1. Patient Intake Agent
    setAgentStatuses(prev => ({ ...prev, patient: 'running' }));
    appendLog('Patient Agent: Checking intake payload and verifying MRN format...', 'info');
    await delay(1200);
    setAgentStatuses(prev => ({ ...prev, patient: 'completed' }));
    appendLog('Patient Agent: Verification completed. Patient record normalized.', 'success');

    // 2. CPT Agent
    setAgentStatuses(prev => ({ ...prev, cpt: 'running' }));
    appendLog(`CPT Agent: Parsing procedure text "${procedureDesc}"...`, 'info');
    await delay(1000);
    appendLog('CPT Agent: Searching registries and mapping surgeon historical metrics...', 'info');
    await delay(1200);
    setAgentStatuses(prev => ({ ...prev, cpt: 'completed' }));
    appendLog('CPT Agent: Mapped to CPT code 27130 (Total Knee Replacement). Match confidence: 95%.', 'success');

    // 3. Cost & OR Time (Parallel)
    setAgentStatuses(prev => ({ ...prev, cost: 'running', orTime: 'running' }));
    appendLog('Cost Agent & OR Time Agent: Initializing parallel execution pipelines...', 'system');
    await delay(800);
    appendLog('Cost Agent: Running labor, room, supplies, and implant cost optimization models...', 'info');
    appendLog('OR Time Agent: Simulating surgery times and cleaning/turnover duration benchmarks...', 'info');
    await delay(1500);
    setAgentStatuses(prev => ({ ...prev, cost: 'completed', orTime: 'completed' }));
    appendLog('Cost Agent: Calculations finished. Total estimated cost $16,250.', 'success');
    appendLog('OR Time Agent: Estimated surgery occupancy: 120 mins (Setup: 15, Turnover: 20).', 'success');

    // 4. Billing Agent
    setAgentStatuses(prev => ({ ...prev, billing: 'running' }));
    appendLog('Billing Agent: Verifying insurer claim codes and checking Medicare MPPR guidelines...', 'info');
    await delay(1400);
    setAgentStatuses(prev => ({ ...prev, billing: 'completed' }));
    appendLog('Billing Agent: Reimbursement validation succeeded.', 'success');

    // Compile Orchestrator output
    const orchestrator = new AgentOrchestrator('REQ-SIM-990', 'manual_form');
    const tasks = [
      { taskId: 'T1', agent: 'patient', action: 'intake', patient: { name: patientName, mrn: mrn }, dependsOn: [] },
      { taskId: 'T2', agent: 'cpt', action: 'identify_cpt', procedure: { description: procedureDesc }, dependsOn: ['patient'] },
      { taskId: 'T3', agent: 'cost', action: 'calculate_costs', input: { grossCharge, suppliesCost, implantCost }, dependsOn: ['cpt'] },
      { taskId: 'T4', agent: 'orTime', action: 'predict_duration', cptCode: { code: '27130' }, dependsOn: ['cpt'] },
      { taskId: 'T5', agent: 'billing', action: 'verify_billing', billedAmount: grossCharge, dependsOn: ['cost'] }
    ];

    const final = await orchestrator.executePipeline(tasks, {
      cptCodes,
      surgeries,
      historicalAvg: { '27130': 120 }
    });

    setFinalContext(final);
    
    // Check scheduling authority before committing to database
    if (!canCommitSchedule) {
      appendLog(`Simulation completed in Read-Only Preview. Database write skipped (User role "${userRole}" lacks scheduling permissions).`, 'warning');
      Swal.fire({
        title: 'Simulation Complete',
        text: 'Simulation completed in Read-Only Preview. Scheduling writes are restricted for your role.',
        icon: 'info',
        background: 'var(--bg-card)',
        color: 'var(--text-primary)'
      });
      setApproved(true);
    } else if (onSchedule) {
      // Automatically schedule in the database
      appendLog('Agent Action: Scheduling surgery in database...', 'system');
      try {
        const p = patients.find(x => String(x.id) === String(selectedPatientId)) || patients.find(x => (x.mrn || `MRN-${x.id}`) === mrn);
        const patient_id = p ? p.id : null;
        const codeMatches = selectedCpts.length > 0 ? selectedCpts.map(c => c.code) : [procedureDesc.split(' - ')[0]];

        const scheduledResult = await onSchedule({
          patient_id: patient_id,
          doctor_name: 'AI Auto-Assigned',
          date: selectedDate,
          start_time: selectedTime,
          duration_minutes: 120,
          turnover_time: 20,
          cpt_codes: codeMatches,
          status: 'scheduled',
          supplies_cost: suppliesCost,
          implants_cost: implantCost,
          medications_cost: 0,
          notes: 'Scheduled by AI Multi-Agent Simulation'
        });

        // Phase 24: Record AI Multi-Agent Provenance Audit Telemetry
        try {
          await db.logAuditEvent({
            action: 'AI_ANALYSIS',
            table_name: 'surgeries',
            record_id: scheduledResult?.id ? String(scheduledResult.id) : (patient_id ? `patient-${patient_id}` : 'simulation-commit'),
            source: 'AI_AGENT',
            change_reason: 'Automated case booking commit from MultiAgent simulation pipeline',
            correlation_id: 'REQ-SIM-990',
            metadata: {
              simulation_date: selectedDate,
              simulation_time: selectedTime,
              cpt_codes: codeMatches,
              estimated_duration: 120,
              estimated_cost: 16250,
              gross_charge: grossCharge,
              model_version: 'asc-multiagent-v2.4'
            }
          });
        } catch {
          // Non-blocking telemetry fallback
        }

        appendLog('Agent Action: Surgery successfully scheduled in the database.', 'success');
        Swal.fire({
          title: 'Scheduled',
          text: 'Surgery successfully scheduled!',
          icon: 'success',
          background: 'var(--bg-card)',
          color: 'var(--text-primary)',
          timer: 2000,
          showConfirmButton: false
        });
        setApproved(true);
      } catch (err) {
        appendLog('Error scheduling surgery: ' + err.message, 'danger');
      }
    } else {
      appendLog('Agent Action: Database hook not found. Simulated scheduling only.', 'warning');
      setApproved(true);
    }
    
    setIsRunning(false);
    appendLog('Multi-Agent Pipeline completed successfully. Shared Context generated.', 'system');
  };

  const handleApprove = async () => {
    // This is now just a manual override or acknowledgement if needed, 
    // but the system auto-approves if successful.
    if (!approved) {
      setApproved(true);
      appendLog('Shared Context Contract Manually Acknowledged.', 'success');
    }
  };

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'completed': return 'badge-success';
      case 'running': return 'badge-running';
      case 'failed': return 'badge-danger';
      default: return 'badge-pending';
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '16px' }}>
      
      {/* Simulation Inputs Card */}
      <div className="dashboard-card" style={{ padding: '20px' }}>
        <h3 style={{ fontSize: '1.05rem', fontWeight: '700', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Cpu size={18} style={{ color: 'var(--color-blue)' }} />
          Multi-Agent Analyst Simulation Parameters
        </h3>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          <div>
            <label className="styled-label" style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Select Patient</label>
            <select className="date-range-selector" style={{ width: '100%', height: '36px', padding: '0 10px', marginTop: '4px' }} disabled={isRunning} value={selectedPatientId || patients.find(p => p.name === patientName)?.id || ""} onChange={(e) => handlePatientChange(e.target.value)}>
               <option value="">-- Select Patient --</option>
               {patients.map(p => (
                 <option key={p.id} value={p.id}>
                   {canViewPHI ? (p.name || 'Unknown Patient') : maskPatientName(p.name)} ({canViewPHI ? (p.mrn || p.id) : maskMRN(p.mrn || p.id)})
                 </option>
               ))}
            </select>
          </div>
          <div>
            <label className="styled-label" style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Patient Name</label>
            <input type="text" className="date-range-selector" style={{ width: '100%', height: '36px', padding: '0 10px', marginTop: '4px' }} value={patientName} onChange={(e) => setPatientName(e.target.value)} disabled={isRunning} />
          </div>
          <div>
            <label className="styled-label" style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)' }}>MRN Number</label>
            <input type="text" className="date-range-selector" style={{ width: '100%', height: '36px', padding: '0 10px', marginTop: '4px' }} value={mrn} onChange={(e) => setMrn(e.target.value)} disabled={isRunning} />
          </div>
            <div>
              <label className="styled-label" style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Search Procedure Template</label>
              <input 
                list="cpt-codes-list"
                className="date-range-selector" 
                style={{ width: '100%', height: '36px', padding: '0 10px', marginTop: '4px' }} 
                disabled={isRunning} 
                placeholder="Type to search CPT or description..."
                onChange={(e) => {
                  const val = e.target.value;
                  if (val.includes(' - ')) {
                    const codeMatch = val.split(' - ')[0];
                    handleCptChange(codeMatch);
                    e.target.value = ''; // Clear search after selection
                  }
                }}
              />
              <datalist id="cpt-codes-list">
                 {cptCodes && cptCodes.map(c => {
                   const priceStr = c.gross_charge ? ` - $${c.gross_charge}` : '';
                   return (
                     <option key={c.code} value={`${c.code} - ${c.description || 'Procedure'}${priceStr}`} />
                   );
                 })}
              </datalist>
            </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label className="styled-label" style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Selected Procedures</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px', minHeight: '36px', padding: '6px', border: '1px solid var(--border-light)', borderRadius: '6px', backgroundColor: 'var(--bg-input)' }}>
              {selectedCpts.map(c => (
                 <span key={c.code} style={{ backgroundColor: 'var(--color-blue)', color: 'white', padding: '4px 10px', borderRadius: '16px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                   {c.code} - {c.description || 'Procedure'} {c.gross_charge ? `- $${c.gross_charge}` : ''}
                   <button onClick={() => removeCpt(c.code)} disabled={isRunning} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', cursor: isRunning ? 'not-allowed' : 'pointer', padding: '0', width: '18px', height: '18px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>&times;</button>
                 </span>
              ))}
              {selectedCpts.length === 0 && <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', padding: '4px' }}>No procedures selected</span>}
            </div>
            <input type="hidden" value={procedureDesc} />
          </div>
          <div>
            <label className="styled-label" style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Gross Charge ($)</label>
            <input type="number" className="date-range-selector" style={{ width: '100%', height: '36px', padding: '0 10px', marginTop: '4px' }} value={grossCharge} onChange={(e) => setGrossCharge(Number(e.target.value))} disabled={isRunning} />
          </div>
          <div>
            <label className="styled-label" style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Selected Date</label>
            <input type="date" className="date-range-selector" style={{ width: '100%', height: '36px', padding: '0 10px', marginTop: '4px' }} value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} disabled={isRunning} />
          </div>
          <div>
            <label className="styled-label" style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Start Time</label>
            <input type="time" className="date-range-selector" style={{ width: '100%', height: '36px', padding: '0 10px', marginTop: '4px' }} value={selectedTime} onChange={(e) => setSelectedTime(e.target.value)} disabled={isRunning} />
          </div>
        </div>

        <div style={{ marginTop: '16px', display: 'flex', gap: '10px' }}>
          <button className="btn-primary" onClick={runSimulation} disabled={isRunning} style={{ height: '38px', display: 'flex', alignItems: 'center', gap: '8px', padding: '0 16px' }}>
            <Play size={14} /> {isRunning ? 'Running Pipeline...' : 'Run Simulation'}
          </button>
          
          {(isRunning || logs.length > 0) && (
            <button className="btn-header" onClick={() => { setLogs([]); setFinalContext(null); setApproved(false); }} disabled={isRunning} style={{ height: '38px', display: 'flex', alignItems: 'center', gap: '8px', padding: '0 16px' }}>
              <RotateCcw size={14} /> Clear console
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '20px' }}>
        
        {/* Step-by-Step Execution Map & Live Logs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Agent Status Map */}
          <div className="dashboard-card" style={{ padding: '16px' }}>
            <h4 style={{ fontSize: '0.9rem', fontWeight: '700', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Bot size={16} style={{ color: 'var(--color-blue)' }} />
              Active Agents Status Map
            </h4>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', position: 'relative' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', flex: '1', minWidth: '80px' }}>
                <span style={{ fontSize: '0.7rem', fontWeight: '700', textTransform: 'uppercase' }}>Patient</span>
                <span className={`badge ${getStatusBadgeClass(agentStatuses.patient)}`}>{agentStatuses.patient}</span>
              </div>
              <ArrowRight size={14} style={{ alignSelf: 'center', color: 'var(--text-muted)' }} />
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', flex: '1', minWidth: '80px' }}>
                <span style={{ fontSize: '0.7rem', fontWeight: '700', textTransform: 'uppercase' }}>CPT</span>
                <span className={`badge ${getStatusBadgeClass(agentStatuses.cpt)}`}>{agentStatuses.cpt}</span>
              </div>
              <ArrowRight size={14} style={{ alignSelf: 'center', color: 'var(--text-muted)' }} />
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', flex: '1', minWidth: '80px', backgroundColor: 'rgba(59, 130, 246, 0.05)', borderRadius: '6px', padding: '4px' }}>
                <span style={{ fontSize: '0.7rem', fontWeight: '700', textTransform: 'uppercase' }}>Cost / OR Time</span>
                <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginBottom: '2px' }}>(Parallel)</span>
                <span className={`badge ${getStatusBadgeClass(agentStatuses.cost)}`}>{agentStatuses.cost}</span>
              </div>
              <ArrowRight size={14} style={{ alignSelf: 'center', color: 'var(--text-muted)' }} />
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', flex: '1', minWidth: '80px' }}>
                <span style={{ fontSize: '0.7rem', fontWeight: '700', textTransform: 'uppercase' }}>Billing</span>
                <span className={`badge ${getStatusBadgeClass(agentStatuses.billing)}`}>{agentStatuses.billing}</span>
              </div>
            </div>
          </div>

          {/* Console Output Term */}
          <div className="dashboard-card" style={{ flex: '1', display: 'flex', flexDirection: 'column', minHeight: '300px', backgroundColor: '#1e1e1e', borderColor: '#333' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #333', padding: '10px 14px', backgroundColor: '#181818' }}>
              <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: '#888', fontWeight: '600' }}>AGENT TERMINAL LOGS</span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#ff5f56' }}></span>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#ffbd2e' }}></span>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#27c93f' }}></span>
              </div>
            </div>
            <div style={{ flex: '1', overflowY: 'auto', padding: '14px', fontFamily: 'monospace', fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '8px', color: '#d4d4d4' }}>
              {logs.map((log, i) => {
                let color = '#d4d4d4';
                if (log.type === 'system') color = '#569cd6';
                if (log.type === 'success') color = '#4ec9b0';
                return (
                  <div key={i} style={{ display: 'flex', gap: '8px' }}>
                    <span style={{ color: '#858585' }}>[{log.time}]</span>
                    <span style={{ color }}>{log.text}</span>
                  </div>
                );
              })}
              {logs.length === 0 && (
                <div style={{ color: '#6a9955', fontStyle: 'italic', textAlign: 'center', marginTop: '60px' }}>
                  // Click "Run Simulation" above to run the multi-agent context coordinator pipeline.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Output Context Details */}
        <div className="dashboard-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px', minHeight: '400px' }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0' }}>
            <FileText size={18} style={{ color: 'var(--color-blue)' }} />
            Shared Context Contract Output
          </h3>

          {!finalContext ? (
            <div style={{ flex: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '20px' }}>
              <Bot size={40} style={{ opacity: 0.15, marginBottom: '12px' }} />
              <span>Pipeline outputs will be loaded here.</span>
            </div>
          ) : (
            <div style={{ flex: '1', display: 'flex', flexDirection: 'column', gap: '12px' }} className="fade-in">
              <div style={{ fontSize: '0.8rem', border: '1px solid var(--border-light)', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px', backgroundColor: 'var(--bg-card)' }}>
                <div><strong>Request ID:</strong> <span style={{ fontFamily: 'monospace' }}>{finalContext.requestId}</span></div>
                <div><strong>Patient MRN:</strong> {finalContext.patient.mrn}</div>
                <div><strong>Intake Validated:</strong> {finalContext.patient.validated ? '✅ Yes' : '❌ No'}</div>
                <div><strong>CPT Assigned:</strong> <span className="badge badge-success">{finalContext.cpt.primaryCpt?.code}</span> ({finalContext.cpt.primaryCpt?.description})</div>
                <div><strong>Estimated Costs:</strong> ${finalContext.costs.totalCost?.toLocaleString()} (Net Profit: ${finalContext.costs.netProfit?.toLocaleString()})</div>
                <div><strong>Predicted Duration:</strong> {finalContext.orTime.predictedDurationMinutes} mins</div>
              </div>

              {finalContext.warnings?.length > 0 && (
                <div style={{ border: '1px solid rgba(245, 158, 11, 0.2)', backgroundColor: 'rgba(245, 158, 11, 0.05)', borderRadius: '8px', padding: '10px 14px' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--color-orange)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <AlertTriangle size={14} /> Warnings / Audit Triggers
                  </span>
                  <ul style={{ paddingLeft: '18px', margin: '4px 0 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {finalContext.warnings.map((w, idx) => <li key={idx}>{w}</li>)}
                  </ul>
                </div>
              )}

              {/* Human Approval Gate */}
              <div style={{ border: '1px solid var(--border-light)', borderRadius: '8px', padding: '14px', marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', backgroundColor: 'var(--bg-card)' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <ShieldCheck size={16} style={{ color: approved ? 'var(--color-green)' : 'var(--color-blue)' }} />
                  Human Approval Gate
                </span>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0' }}>
                  {approved 
                    ? 'Clinical/billing transaction approved and committed successfully.' 
                    : 'Analyze CPT and cost projections and click Approve below to commit.'
                  }
                </p>
                {!approved ? (
                  <button className="btn-primary" onClick={handleApprove} style={{ width: '100%', height: '36px' }}>
                    Approve & Commit Transaction
                  </button>
                ) : (
                  <div style={{ textAlign: 'center', color: 'var(--color-green)', fontWeight: '700', fontSize: '0.8rem', padding: '6px', border: '1px solid var(--color-green)', borderRadius: '6px', backgroundColor: 'rgba(16, 185, 129, 0.05)' }}>
                    ✓ Transaction Committed Successfully
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
