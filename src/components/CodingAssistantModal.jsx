import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../lib/supabase';
import { Wand2, CheckCircle2, XCircle, AlertTriangle, Loader, RefreshCw, FileText, ShieldCheck } from 'lucide-react';
import Swal from 'sweetalert2';

export default function CodingAssistantModal({
  isOpen,
  onClose,
  caseId,
  clinicalNotes = '',
  preOpDiagnosis = '',
  procedureName = '',
  onApplyCandidate
}) {
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState([]);
  const [documentHash, setDocumentHash] = useState(null);
  const [error, setError] = useState(null);
  const [approvedIds, setApprovedIds] = useState(new Set());
  const [rejectedIds, setRejectedIds] = useState(new Set());

  const analyzeDocumentation = useCallback(async () => {
    const text = `${clinicalNotes || ''} ${preOpDiagnosis || ''} ${procedureName || ''}`.trim();
    if (!text) {
      setError('Please enter Clinical / Operative Notes or a Pre-Op Diagnosis before running the AI Coding Assistant.');
      setCandidates([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await db.runAICodingAssistant({
        caseId: caseId || 'draft-case',
        clinicalNotes,
        preOpDiagnosis,
        procedureName
      });

      if (res && res.success) {
        setCandidates(res.candidates || []);
        setDocumentHash(res.document_hash || null);
      } else {
        setError(res?.error || 'Failed to analyze documentation.');
      }
    } catch (err) {
      console.error('Coding assistant error:', err);
      setError('An error occurred during AI analysis. You may continue to code manually.');
    } finally {
      setLoading(false);
    }
  }, [caseId, clinicalNotes, preOpDiagnosis, procedureName]);

  useEffect(() => {
    if (isOpen) {
      setApprovedIds(new Set());
      setRejectedIds(new Set());
      analyzeDocumentation();
    }
  }, [isOpen, analyzeDocumentation]);

  if (!isOpen) return null;

  const handleApprove = async (cand) => {
    try {
      await db.commitCodingCandidate(cand.id, 'Approved via AI Coding Assistant review drawer');
      setApprovedIds(prev => new Set([...prev, cand.id]));
      if (onApplyCandidate) {
        onApplyCandidate({
          code: cand.cpt_code,
          description: cand.description,
          modifiers: cand.suggested_modifiers || [],
          laterality: cand.suggested_laterality || 'NOT_APPLICABLE',
          is_primary: cand.is_primary_recommendation
        });
      }
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: `CPT ${cand.cpt_code} Approved & Added to Case`,
        showConfirmButton: false,
        timer: 2000,
        background: 'var(--bg-card)',
        color: 'var(--text-primary)'
      });
    } catch (err) {
      console.error('Approval failed:', err);
      Swal.fire({
        icon: 'error',
        title: 'Approval Error',
        text: err.message || 'Failed to approve CPT candidate.',
        background: 'var(--bg-card)',
        color: 'var(--text-primary)'
      });
    }
  };

  const handleReject = async (cand) => {
    const { value: reason } = await Swal.fire({
      title: `Reject CPT ${cand.cpt_code}`,
      input: 'text',
      inputLabel: 'Rejection Rationale',
      inputPlaceholder: 'e.g., Bundled into primary procedure per NCCI',
      showCancelButton: true,
      confirmButtonText: 'Confirm Rejection',
      confirmButtonColor: '#ef4444',
      background: 'var(--bg-card)',
      color: 'var(--text-primary)'
    });

    if (reason !== undefined) {
      try {
        await db.rejectCodingCandidate(cand.id, reason || 'Rejected by coder review');
        setRejectedIds(prev => new Set([...prev, cand.id]));
      } catch (err) {
        console.error('Rejection failed:', err);
      }
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5, 11, 24, 0.75)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '850px',
          maxWidth: '95vw',
          maxHeight: '90vh',
          backgroundColor: 'var(--bg-app, #0b1329)',
          border: '1px solid var(--border-color, #1e293b)',
          borderRadius: '14px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid var(--border-color, #1e293b)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-card, #0f172a)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(168, 85, 247, 0.2))',
                border: '1px solid rgba(168, 85, 247, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#c084fc'
              }}
            >
              <Wand2 size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-primary, #fff)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                AI CPT Coding Assistant
                <span style={{ fontSize: '0.68rem', padding: '2px 8px', borderRadius: '12px', background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', fontWeight: '600' }}>
                  Audited & Verified
                </span>
              </h3>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: 'var(--text-secondary, #94a3b8)' }}>
                Analyzes clinical operative notes to propose candidates with exact document citations. Requires human approval.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={analyzeDocumentation}
              disabled={loading}
              className="btn-header"
              style={{
                height: '32px',
                padding: '0 12px',
                fontSize: '0.78rem',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: loading ? 'not-allowed' : 'pointer'
              }}
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Re-analyze
            </button>
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted, #64748b)',
                fontSize: '1.4rem',
                cursor: 'pointer',
                padding: '4px 8px',
                lineHeight: 1
              }}
            >
              ×
            </button>
          </div>
        </div>

        {/* Subheader: Document Provenance */}
        <div
          style={{
            padding: '10px 24px',
            background: 'rgba(59, 130, 246, 0.04)',
            borderBottom: '1px solid var(--border-color, #1e293b)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.74rem',
            color: 'var(--text-secondary, #94a3b8)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <FileText size={13} style={{ color: 'var(--color-blue, #3b82f6)' }} />
            <span>Document Notes Hash:</span>
            <code style={{ background: 'var(--bg-card)', padding: '1px 6px', borderRadius: '4px', color: '#93c5fd', fontFamily: 'monospace' }}>
              {documentHash ? documentHash.slice(0, 16) + '...' : 'computing...'}
            </code>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ShieldCheck size={13} style={{ color: 'var(--color-green, #10b981)' }} />
            <span>Zero PHI / HIPAA Safe Harbor Sanitized</span>
          </div>
        </div>

        {/* Content Body */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {error && (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: '8px',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#f87171',
                fontSize: '0.82rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <AlertTriangle size={16} />
              {error}
            </div>
          )}

          {loading ? (
            <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <Loader size={28} className="animate-spin" style={{ margin: '0 auto 12px auto', color: 'var(--color-blue, #3b82f6)' }} />
              <div style={{ fontWeight: '600', fontSize: '0.95rem', color: 'var(--text-primary)' }}>Analyzing Clinical Documentation...</div>
              <div style={{ fontSize: '0.8rem', marginTop: '4px', color: 'var(--text-muted)' }}>
                Extracting anatomical structures, surgical approaches, and matching against 2026 CPT Master Catalog
              </div>
            </div>
          ) : candidates.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '1rem', fontWeight: '600', color: 'var(--text-secondary)' }}>No CPT candidates proposed</div>
              <p style={{ fontSize: '0.82rem', margin: '6px 0 0 0' }}>
                Ensure your clinical notes specify the operative approach, anatomical site, or surgical technique.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Identified Candidates ({candidates.length})
                </span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  All candidates require human coder review
                </span>
              </div>

              {candidates.map((cand, idx) => {
                const isApproved = approvedIds.has(cand.id) || cand.review_decision === 'approved';
                const isRejected = rejectedIds.has(cand.id) || cand.review_decision === 'rejected';
                const confScore = Math.round((cand.confidence_score || 0.5) * 100);
                const confColor = confScore >= 90 ? 'var(--color-green, #10b981)' : (confScore >= 75 ? 'var(--color-blue, #3b82f6)' : '#f59e0b');

                return (
                  <div
                    key={cand.id || idx}
                    style={{
                      backgroundColor: 'var(--bg-card, #0f172a)',
                      border: isApproved
                        ? '1px solid rgba(16, 185, 129, 0.5)'
                        : isRejected
                        ? '1px solid rgba(239, 68, 68, 0.3)'
                        : '1px solid var(--border-color, #1e293b)',
                      borderRadius: '10px',
                      padding: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                      opacity: isRejected ? 0.6 : 1,
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {/* Top Row: Code, Primary Tag, Confidence, Laterality */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span
                          style={{
                            fontFamily: 'monospace',
                            fontSize: '1rem',
                            fontWeight: '800',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            background: 'rgba(59, 130, 246, 0.15)',
                            color: 'var(--color-blue, #3b82f6)',
                            border: '1px solid rgba(59, 130, 246, 0.3)'
                          }}
                        >
                          {cand.cpt_code}
                        </span>

                        {cand.is_primary_recommendation && (
                          <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px', background: 'rgba(168, 85, 247, 0.15)', color: '#c084fc', fontWeight: '700' }}>
                            PRIMARY
                          </span>
                        )}

                        {cand.suggested_laterality && cand.suggested_laterality !== 'NOT_APPLICABLE' && (
                          <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px', background: 'rgba(59, 130, 246, 0.1)', color: '#60a5fa', fontWeight: '600' }}>
                            {cand.suggested_laterality}
                          </span>
                        )}

                        {cand.suggested_modifiers && cand.suggested_modifiers.length > 0 && (
                          <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px', background: 'var(--bg-subtab)', color: 'var(--text-secondary)', fontWeight: '600' }}>
                            Mod: {cand.suggested_modifiers.join(', ')}
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Confidence:</span>
                          <span style={{ fontSize: '0.8rem', fontWeight: '700', color: confColor }}>
                            {confScore}%
                          </span>
                        </div>

                        {isApproved && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: '700', color: 'var(--color-green, #10b981)' }}>
                            <CheckCircle2 size={14} /> Approved
                          </span>
                        )}

                        {isRejected && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: '700', color: '#ef4444' }}>
                            <XCircle size={14} /> Rejected
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Description */}
                    <div style={{ fontSize: '0.86rem', fontWeight: '600', color: 'var(--text-primary)' }}>
                      {cand.description || `CPT Code ${cand.cpt_code}`}
                    </div>

                    {/* Excerpt Citation */}
                    {cand.documentation_excerpt && (
                      <div
                        style={{
                          padding: '8px 12px',
                          borderRadius: '6px',
                          background: 'rgba(255, 255, 255, 0.02)',
                          borderLeft: '3px solid var(--color-blue, #3b82f6)',
                          fontSize: '0.78rem',
                          color: 'var(--text-secondary)',
                          fontStyle: 'italic'
                        }}
                      >
                        "{cand.documentation_excerpt}"
                      </div>
                    )}

                    {/* Rationale */}
                    {cand.clinical_rationale && (
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        <strong style={{ color: 'var(--text-muted)' }}>Rationale: </strong>
                        {cand.clinical_rationale}
                      </div>
                    )}

                    {/* Warnings */}
                    {cand.identified_warnings && cand.identified_warnings.length > 0 && (
                      <div
                        style={{
                          padding: '6px 10px',
                          borderRadius: '6px',
                          background: 'rgba(245, 158, 11, 0.08)',
                          border: '1px solid rgba(245, 158, 11, 0.25)',
                          fontSize: '0.74rem',
                          color: '#fbbf24',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        <AlertTriangle size={13} />
                        <span>{cand.identified_warnings.join('; ')}</span>
                      </div>
                    )}

                    {/* Action Buttons */}
                    {!isApproved && !isRejected && (
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px', paddingTop: '8px', borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}>
                        <button
                          type="button"
                          onClick={() => handleReject(cand)}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '6px',
                            background: 'transparent',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            color: '#ef4444',
                            fontSize: '0.76rem',
                            fontWeight: '600',
                            cursor: 'pointer'
                          }}
                        >
                          ✗ Reject Candidate
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApprove(cand)}
                          style={{
                            padding: '6px 14px',
                            borderRadius: '6px',
                            background: 'var(--color-blue, #3b82f6)',
                            border: 'none',
                            color: '#fff',
                            fontSize: '0.76rem',
                            fontWeight: '700',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}
                        >
                          <CheckCircle2 size={13} /> Approve & Add to Case
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 24px',
            borderTop: '1px solid var(--border-color, #1e293b)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-card, #0f172a)',
            fontSize: '0.75rem',
            color: 'var(--text-muted)'
          }}
        >
          <span>Compliance Rule: Model recommendations are advisory only and cannot independently submit claims.</span>
          <button
            onClick={onClose}
            className="btn-header"
            style={{ padding: '6px 16px', fontSize: '0.8rem', cursor: 'pointer' }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
