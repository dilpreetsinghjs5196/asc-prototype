import React, { useState, useEffect } from 'react';
import {
  Clock, X, ArrowRight, Shield, AlertTriangle,
  CheckCircle2, Calendar, Tag, DollarSign, Activity,
  ChevronDown, ChevronUp, Bot, Laptop, Server, RefreshCw
} from 'lucide-react';
import { db } from '../lib/supabase';

// Status badge color mapping
const STATUS_COLORS = {
  Draft: { bg: 'rgba(156, 163, 175, 0.15)', text: '#9ca3af', border: 'rgba(156, 163, 175, 0.4)' },
  Scheduled: { bg: 'rgba(59, 130, 246, 0.15)', text: '#60a5fa', border: 'rgba(59, 130, 246, 0.4)' },
  'Pre-Op': { bg: 'rgba(234, 179, 8, 0.15)', text: '#facc15', border: 'rgba(234, 179, 8, 0.4)' },
  'In-OR': { bg: 'rgba(168, 85, 247, 0.15)', text: '#c084fc', border: 'rgba(168, 85, 247, 0.4)' },
  Closing: { bg: 'rgba(236, 72, 153, 0.15)', text: '#f472b6', border: 'rgba(236, 72, 153, 0.4)' },
  PACU: { bg: 'rgba(20, 184, 166, 0.15)', text: '#2dd4bf', border: 'rgba(20, 184, 166, 0.4)' },
  Completed: { bg: 'rgba(16, 185, 129, 0.15)', text: '#34d399', border: 'rgba(16, 185, 129, 0.4)' },
  Billed: { bg: 'rgba(99, 102, 241, 0.15)', text: '#818cf8', border: 'rgba(99, 102, 241, 0.4)' },
  Cancelled: { bg: 'rgba(239, 68, 68, 0.15)', text: '#f87171', border: 'rgba(239, 68, 68, 0.4)' },
  Void: { bg: 'rgba(107, 114, 128, 0.2)', text: '#9ca3af', border: 'rgba(107, 114, 128, 0.5)' }
};

// Event icon resolver
const getEventIcon = (eventType) => {
  switch (eventType) {
    case 'CASE_CREATED':
      return <Calendar size={14} style={{ color: '#60a5fa' }} />;
    case 'CASE_COMPLETED':
      return <CheckCircle2 size={14} style={{ color: '#34d399' }} />;
    case 'CASE_CANCELLED':
    case 'CASE_VOIDED':
      return <AlertTriangle size={14} style={{ color: '#f87171' }} />;
    case 'CASE_RESCHEDULED':
      return <Clock size={14} style={{ color: '#facc15' }} />;
    case 'CPT_CODES_CHANGED':
    case 'PROCEDURE_LINE_UPDATED':
      return <Tag size={14} style={{ color: '#c084fc' }} />;
    case 'FINANCIAL_SNAPSHOT_FROZEN':
      return <DollarSign size={14} style={{ color: '#10b981' }} />;
    case 'ADMIN_OVERRIDE':
      return <Shield size={14} style={{ color: '#fbbf24' }} />;
    default:
      return <Activity size={14} style={{ color: '#38bdf8' }} />;
  }
};

// Source icon resolver
const getSourceBadge = (source) => {
  switch (source) {
    case 'AI_AGENT':
      return <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.65rem', color: '#c084fc' }}><Bot size={10} /> AI</span>;
    case 'SYSTEM':
    case 'BACKGROUND_JOB':
      return <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.65rem', color: '#9ca3af' }}><Server size={10} /> SYSTEM</span>;
    default:
      return <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.65rem', color: '#60a5fa' }}><Laptop size={10} /> UI</span>;
  }
};

export default function CaseTimelineModal({ surgery, isOpen, onClose }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedPayloads, setExpandedPayloads] = useState({});

  useEffect(() => {
    if (!isOpen || !surgery?.id) return;
    let isCancelled = false;

    async function fetchTimeline() {
      setLoading(true);
      try {
        const fetchedEvents = await db.getCaseEvents(surgery.id);
        if (!isCancelled) {
          setEvents(fetchedEvents || []);
          setLoading(false);
        }
      } catch (err) {
        if (!isCancelled) {
          console.error('Failed to load case events timeline:', err);
          setEvents([]);
          setLoading(false);
        }
      }
    }

    fetchTimeline();
    return () => {
      isCancelled = true;
    };
  }, [surgery?.id, isOpen]);

  if (!isOpen || !surgery) return null;

  const togglePayload = (id) => {
    setExpandedPayloads(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const currentStatusStyle = STATUS_COLORS[surgery.status] || STATUS_COLORS.Scheduled;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(6px)',
      display: 'flex',
      justifyContent: 'flex-end',
      zIndex: 9999,
      animation: 'fadeIn 0.2s ease-out'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '560px',
        height: '100%',
        backgroundColor: 'var(--bg-card, #1e293b)',
        borderLeft: '1px solid var(--border-color, #334155)',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '-8px 0 24px rgba(0,0,0,0.5)',
        color: 'var(--text-primary, #f8fafc)'
      }}>
        {/* Drawer Header */}
        <div style={{
          padding: '18px 22px',
          borderBottom: '1px solid var(--border-color, #334155)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'rgba(255, 255, 255, 0.02)'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clock size={18} style={{ color: 'var(--color-blue, #3b82f6)' }} />
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '700' }}>
                Case Lifecycle History
              </h3>
              <span style={{
                fontSize: '0.72rem',
                padding: '2px 8px',
                borderRadius: '4px',
                fontWeight: '700',
                background: currentStatusStyle.bg,
                color: currentStatusStyle.text,
                border: `1px solid ${currentStatusStyle.border}`
              }}>
                {surgery.status}
              </span>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #94a3b8)', marginTop: '4px' }}>
              Case #{surgery.id} • Patient #{surgery.patient_id || 'N/A'} • {surgery.doctor_name || 'Dr. Assigned'}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted, #94a3b8)',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Timeline Body */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px 22px'
        }}>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '240px', gap: '10px' }}>
              <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', color: 'var(--color-blue, #3b82f6)' }} />
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted, #94a3b8)' }}>Loading case history...</span>
            </div>
          ) : events.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '40px 20px',
              background: 'rgba(255, 255, 255, 0.01)',
              borderRadius: '8px',
              border: '1px dashed var(--border-color, #334155)'
            }}>
              <Clock size={32} style={{ color: 'var(--text-muted, #94a3b8)', marginBottom: '10px', opacity: 0.5 }} />
              <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: '600' }}>No explicit case events recorded yet</p>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: 'var(--text-muted, #94a3b8)' }}>
                Lifecycle transitions, reschedules, and audits for this case will appear chronologically here.
              </p>
            </div>
          ) : (
            <div style={{ position: 'relative' }}>
              {/* Vertical timeline spine */}
              <div style={{
                position: 'absolute',
                left: '17px',
                top: '12px',
                bottom: '12px',
                width: '2px',
                backgroundColor: 'var(--border-color, #334155)',
                zIndex: 0
              }} />

              {/* Event items */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', position: 'relative', zIndex: 1 }}>
                {events.map((evt, idx) => {
                  const fromStyle = evt.from_status ? STATUS_COLORS[evt.from_status] : null;
                  const toStyle = evt.to_status ? STATUS_COLORS[evt.to_status] : null;
                  const isExpanded = !!expandedPayloads[evt.id];
                  const hasPayload = evt.payload && Object.keys(evt.payload).length > 0;

                  return (
                    <div
                      key={evt.id || idx}
                      style={{
                        display: 'flex',
                        gap: '14px',
                        alignItems: 'flex-start'
                      }}
                    >
                      {/* Event Icon Circle */}
                      <div style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        backgroundColor: 'var(--bg-card, #1e293b)',
                        border: '2px solid var(--border-color, #334155)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        boxShadow: '0 2px 6px rgba(0,0,0,0.3)'
                      }}>
                        {getEventIcon(evt.event_type)}
                      </div>

                      {/* Event Card */}
                      <div style={{
                        flex: 1,
                        background: 'rgba(255, 255, 255, 0.02)',
                        border: '1px solid var(--border-color, #334155)',
                        borderRadius: '8px',
                        padding: '12px 14px'
                      }}>
                        {/* Header: Event Type & Timestamp */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: '700', letterSpacing: '0.4px', textTransform: 'uppercase', color: 'var(--text-primary, #f8fafc)' }}>
                            {evt.event_type.replace(/_/g, ' ')}
                          </span>
                          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted, #94a3b8)' }}>
                            {new Date(evt.event_timestamp).toLocaleString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit'
                            })}
                          </span>
                        </div>

                        {/* Status Transition Badges */}
                        {(evt.from_status || evt.to_status) && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '6px 0' }}>
                            {fromStyle && (
                              <span style={{
                                fontSize: '0.68rem',
                                padding: '1px 6px',
                                borderRadius: '3px',
                                background: fromStyle.bg,
                                color: fromStyle.text,
                                border: `1px solid ${fromStyle.border}`
                              }}>
                                {evt.from_status}
                              </span>
                            )}
                            {evt.from_status && evt.to_status && (
                              <ArrowRight size={11} style={{ color: 'var(--text-muted, #94a3b8)' }} />
                            )}
                            {toStyle && (
                              <span style={{
                                fontSize: '0.68rem',
                                padding: '1px 6px',
                                borderRadius: '3px',
                                background: toStyle.bg,
                                color: toStyle.text,
                                border: `1px solid ${toStyle.border}`,
                                fontWeight: '700'
                              }}>
                                {evt.to_status}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Reason Text */}
                        {evt.reason_text && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #cbd5e1)', marginTop: '4px', fontStyle: 'italic' }}>
                            "{evt.reason_text}"
                          </div>
                        )}

                        {/* Actor & Source Footer */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.05)', fontSize: '0.68rem', color: 'var(--text-muted, #94a3b8)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span>Actor: <strong style={{ color: 'var(--text-secondary, #cbd5e1)' }}>{evt.actor_email || evt.actor_role || 'System'}</strong></span>
                            {evt.actor_role && (
                              <span style={{ background: 'rgba(255,255,255,0.06)', padding: '1px 4px', borderRadius: '3px' }}>
                                {evt.actor_role}
                              </span>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {getSourceBadge(evt.source)}
                            {hasPayload && (
                              <button
                                type="button"
                                onClick={() => togglePayload(evt.id)}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: 'var(--color-blue, #3b82f6)',
                                  cursor: 'pointer',
                                  padding: 0,
                                  fontSize: '0.68rem',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '2px'
                                }}
                              >
                                {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                                {isExpanded ? 'Hide' : 'Details'}
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Expandable Payload Diff */}
                        {isExpanded && hasPayload && (
                          <div style={{
                            marginTop: '8px',
                            padding: '8px',
                            background: 'rgba(0, 0, 0, 0.3)',
                            borderRadius: '4px',
                            fontSize: '0.7rem',
                            fontFamily: 'monospace',
                            overflowX: 'auto',
                            border: '1px solid var(--border-color, #334155)'
                          }}>
                            <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                              {JSON.stringify(evt.payload, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
