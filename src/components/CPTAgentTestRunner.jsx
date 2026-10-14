import React, { useState, useMemo } from 'react';
import { executeCPTTask } from '../agents/CPTAgent';
import { Bot, Play } from 'lucide-react';

export default function CPTAgentTestRunner({ surgeries, cptCodes }) {
  const [procedureDesc, setProcedureDesc] = useState('');
  const [bodyPart, setBodyPart] = useState('');
  const [surgeonName, setSurgeonName] = useState('');
  const [result, setResult] = useState(null);
  const [isRunning, setIsRunning] = useState(false);

  const MOCK_SPECIALTIES = {
    'Dr. Malinoski Kelly': 'Orthopedics',
    'Kelly Malinoski': 'Orthopedics',
    'Dr. Shell Masouras Troy': 'General Surgery',
    'Dr. Arcos George': 'Orthopedics',
    'Dr. Baccaro Leopoldo': 'Cardiology',
    'Dr. Basile Andrea': 'Gastroenterology',
    'Dr. Bonett Andrew': 'Orthopedics',
    'Dr. Burchhardt Daniela': 'Otolaryngology',
    'Dr. Burmiester Cliff': 'Otolaryngology',
    'Dr. McGee Christie': 'Gastroenterology',
    'Dr. Prysi Mark': 'General Surgery',
    'Dr. Walsh Mark': 'General Surgery'
  };

  // Extract unique surgeons and their specialties
  const surgeonSpecialties = {};
  const uniqueSurgeons = ['All', ...new Set(surgeries.map(s => {
    const name = s.surgeons ? `${s.surgeons.firstname} ${s.surgeons.lastname}`.trim() : (s.doctorName || s.surgeon_name || s.doctor_name);
    if (name) {
      if (s.surgeons && s.surgeons.specialty) {
        surgeonSpecialties[name] = s.surgeons.specialty;
      } else if (MOCK_SPECIALTIES[name]) {
        surgeonSpecialties[name] = MOCK_SPECIALTIES[name];
      }
    }
    return name;
  }).filter(Boolean))].sort();

  // Infer category when procedure description changes
  const inferredCategory = useMemo(() => {
    if (procedureDesc.length < 4) {
      return null;
    }
    
    const procLower = procedureDesc.toLowerCase();
    // Use the same suffix stripping logic as the agent for better matching
    const stem = procLower.split(/[\s,]+/)[0].replace(/(ment|plasty|scopy|ectomy|otomy|ostomy|ation|ing|ed|es|s)$/, '');
    
    const matches = cptCodes.filter(c => {
      const descLower = c.description.toLowerCase();
      return descLower.includes(procLower) || (stem.length >= 4 && descLower.includes(stem));
    });

    if (matches.length > 0) {
       const categories = matches.map(m => m.category).filter(Boolean);
       if (categories.length > 0) {
          const counts = {};
          let maxCount = 0;
          let mode = categories[0];
          for (let c of categories) {
             counts[c] = (counts[c] || 0) + 1;
             if (counts[c] > maxCount) {
                maxCount = counts[c];
                mode = c;
             }
          }
          return mode;
       }
    }
    return null;
  }, [procedureDesc, cptCodes]);

  // Filter surgeons based on inferred category
  const filteredSurgeons = uniqueSurgeons.filter(s => {
    if (s === 'All') return true;
    if (!inferredCategory) return true;
    
    const specialty = surgeonSpecialties[s];
    if (!specialty) return true; // keep if unknown

    const catLower = inferredCategory.toLowerCase();
    const specLower = specialty.toLowerCase();

    // Handle common abbreviations/mappings
    if (catLower.includes('ortho') && specLower.includes('ortho')) return true;
    if (catLower.includes('gastro') && specLower.includes('gastro')) return true;
    if (catLower.includes('neuro') && specLower.includes('neuro')) return true;
    if (catLower.includes('cardio') && specLower.includes('cardio')) return true;
    if (catLower.includes('ent') && specLower.includes('otolaryngology')) return true;
    if (catLower.includes('otolaryngology') && specLower.includes('ent')) return true;
    
    // Direct substring match
    if (catLower.includes(specLower) || specLower.includes(catLower)) return true;

    return false;
  });

  const handleRunAgent = async () => {
    setIsRunning(true);
    
    // Construct Task Contract as per Section 4
    const taskContext = {
      taskId: `TASK-CPT-${Math.floor(Math.random() * 10000)}`,
      requestId: `REQ-${Date.now()}`,
      agent: 'cpt',
      action: 'identify_cpt',
      status: 'pending',
      patient: { id: "PAT-TEST" },
      procedure: {
        description: procedureDesc,
        bodyPart: bodyPart,
        laterality: ""
      },
      diagnosis: [],
      surgeon: { id: surgeonName || 'All' },
      context: { facility: "ASC", dateOfService: new Date().toISOString() }
    };

    const systemContext = { cptCodes, surgeries };

    // Execute Agent
    try {
      const agentResult = await executeCPTTask(taskContext, systemContext);
      setResult(agentResult);
    } catch (e) {
      console.error(e);
      setResult({ error: e.message });
    }
    
    setIsRunning(false);
  };

  return (
    <div style={{ backgroundColor: 'var(--bg-card)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border-color)', marginTop: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <Bot size={24} style={{ color: 'var(--color-blue)' }} />
        <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-primary)' }}>CPT Codes Agent</h3>
      </div>
      
      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '20px' }}>
        Test the CPT Code Agent logic defined in <strong>cpt-codes-agent-workflow.md</strong>.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Procedure Description</label>
          <input 
            type="text" 
            value={procedureDesc}
            onChange={(e) => setProcedureDesc(e.target.value)}
            placeholder="e.g. Total Knee Replacement"
            style={{ padding: '10px', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.9rem' }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Body Part (Optional)</label>
          <input 
            type="text" 
            value={bodyPart}
            onChange={(e) => setBodyPart(e.target.value)}
            placeholder="e.g. Knee"
            style={{ padding: '10px', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.9rem' }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)' }}>
            Surgeon Context
            {inferredCategory && <span style={{ marginLeft: '8px', color: 'var(--color-blue)', fontSize: '0.7rem' }}>(Auto-filtered by: {inferredCategory})</span>}
          </label>
          <select 
            value={surgeonName}
            onChange={(e) => setSurgeonName(e.target.value)}
            style={{ padding: '10px', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.9rem', backgroundColor: 'var(--bg-main)', color: 'var(--text-primary)' }}
          >
            <option value="">Select Surgeon (Optional)</option>
            {filteredSurgeons.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      <button 
        onClick={handleRunAgent}
        disabled={!procedureDesc || isRunning}
        style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '10px 20px', borderRadius: '8px', border: 'none',
          backgroundColor: (!procedureDesc || isRunning) ? 'var(--border-color)' : 'var(--color-blue)',
          color: '#fff', fontWeight: '600', cursor: (!procedureDesc || isRunning) ? 'not-allowed' : 'pointer',
          marginBottom: '24px'
        }}
      >
        <Play size={16} />
        {isRunning ? 'Analyzing Context...' : 'Run CPT Agent'}
      </button>

      {/* SECTION 14: AI AGENT ACTIVITY OUTPUT */}
      {result && (
        <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
             <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: result.status === 'completed' ? 'var(--color-green)' : 'var(--color-red)' }}></div>
             <h4 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>CPT Codes Agent - {result.status === 'completed' ? 'Completed' : 'Failed'}</h4>
          </div>

          <div style={{ backgroundColor: '#1e293b', color: '#e2e8f0', padding: '16px', borderRadius: '8px', fontSize: '0.85rem', fontFamily: 'monospace' }}>
            <p style={{ margin: '0 0 12px 0' }}><strong>Task:</strong><br/>Identify CPT for {procedureDesc}</p>
            <p style={{ margin: '0 0 12px 0' }}><strong>Input:</strong><br/>{procedureDesc} {bodyPart && `(${bodyPart})`} {surgeonName && surgeonName !== 'All' ? `by ${surgeonName}` : ''}</p>
            
            <p style={{ margin: '0 0 12px 0' }}><strong>Result:</strong><br/>
              {result.result ? (
                <>
                  1 primary candidate ({result.result.primaryCpt.code})<br/>
                  <span style={{ color: 'var(--color-green)' }}>&nbsp;&nbsp;↳ Gross Charge: ${Number(result.result.primaryCpt.grossCharge).toLocaleString()} | Cost: ${Number(result.result.primaryCpt.cost).toLocaleString()}</span><br/>
                  {result.result.alternatives.length} alternatives
                </>
              ) : "No reliable match found."}
            </p>
            
            <p style={{ margin: '0 0 12px 0' }}><strong>Confidence:</strong><br/>
              {result.confidence !== undefined ? `${(result.confidence * 100).toFixed(0)}%` : 'N/A'}
            </p>

            {result.result && result.result.evidence && (
              <p style={{ margin: '0 0 12px 0' }}>
                Registry Match: {result.result.evidence.registryMatch ? '✓' : '✗'}<br/>
                Historical Match: {result.result.evidence.historicalMatch ? '✓' : '✗'}<br/>
                Surgeon History: {result.result.evidence.surgeonHistoryMatch ? '✓' : '✗'}
              </p>
            )}

            <p style={{ margin: '0 0 12px 0' }}><strong>Status:</strong><br/>
              {result.requiresHumanReview ? <span style={{ color: '#ef4444' }}>Human Review Required</span> : <span style={{ color: '#10b981' }}>Validated</span>}
            </p>

            <p style={{ margin: '0 0 12px 0' }}><strong>Next:</strong><br/>
              {result.nextRecommendedAgents?.map(a => <span key={a} style={{display:'block'}}>{a}</span>)}
            </p>
            
            {result.warnings && result.warnings.length > 0 && (
              <div style={{ marginTop: '12px', color: '#f59e0b' }}>
                <strong>Warnings:</strong>
                <ul style={{ margin: '4px 0 0 0', paddingLeft: '20px' }}>
                  {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </div>
            )}
          </div>

          <div style={{ marginTop: '20px' }}>
             <h5 style={{ margin: '0 0 8px 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Raw JSON Output Contract</h5>
             <pre style={{ backgroundColor: '#0f172a', color: '#cbd5e1', padding: '16px', borderRadius: '8px', fontSize: '0.75rem', overflowX: 'auto', margin: 0, border: '1px solid #334155' }}>
               {JSON.stringify(result, null, 2)}
             </pre>
          </div>
        </div>
      )}
    </div>
  );
}
