import React, { useState, useEffect, useCallback } from 'react';
import {
  ClipboardList, Plus, Search, AlertTriangle, CheckCircle2,
  Clock, Check, X, FileText,
  RotateCcw, AlertCircle, ChevronRight
} from 'lucide-react';
import {
  preferenceCardService,
  ITEM_CATEGORIES
} from '../lib/preferenceCardService';
import './SurgeonPreferenceCards.css';

export default function SurgeonPreferenceCards({
  activeFacility = null,
  userPermissions = []
}) {
  const facilityId = activeFacility?.id || '00000000-0000-0000-0000-000000000002';

  const canManage = userPermissions.includes('admin') ||
    userPermissions.includes('implants.manage_contracts') ||
    userPermissions.includes('super_admin');

  const canApprove = userPermissions.includes('admin') ||
    userPermissions.includes('cfo') ||
    userPermissions.includes('clinical_director') ||
    userPermissions.includes('super_admin');

  const canReconcile = userPermissions.includes('admin') ||
    userPermissions.includes('circulating_nurse') ||
    userPermissions.includes('materials_manager') ||
    userPermissions.includes('super_admin');

  // Navigation Sub-tab State
  const [activeSubTab, setActiveSubTab] = useState('directory'); // 'directory' | 'bom_editor' | 'readiness_board' | 'reconciliation'

  // Data States
  const [cards, setCards] = useState([]);
  const [selectedCard, setSelectedCard] = useState(null);
  const [selectedRevision, setSelectedRevision] = useState(null);
  const [readinessCases, setReadinessCases] = useState([]);
  const [reconciliationEntries, setReconciliationEntries] = useState([]);
  const [wasteSummary, setWasteSummary] = useState({ totalWasteCost: 0, wasteLineCount: 0 });
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState(null);

  // Filters State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSpecialty, setSelectedSpecialty] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');

  // Modals State
  const [isNewCardModalOpen, setIsNewCardModalOpen] = useState(false);
  const [isAddItemModalOpen, setIsAddItemModalOpen] = useState(false);
  const [isSubModalOpen, setIsSubModalOpen] = useState(false);
  const [selectedItemForSub, setSelectedItemForSub] = useState(null);

  // Form State: New Card
  const [newCardForm, setNewCardForm] = useState({
    cardCode: '',
    cardName: '',
    specialty: 'Orthopedics',
    primaryCpt: '27447',
    surgeonId: '1',
    description: '',
    estimatedDurationMinutes: '60',
    turnoverTimeMinutes: '20',
    lateralityApplicable: true,
    isHouseCard: false
  });

  // Form State: Add Item
  const [newItemForm, setNewItemForm] = useState({
    itemCategory: 'IMPLANT',
    customItemName: '',
    manufacturer: '',
    catalogNumber: '',
    stagingBehavior: 'HOLD',
    plannedQuantity: 1,
    unitOfMeasure: 'EA',
    isMandatory: true,
    notes: ''
  });

  // Form State: Add Substitution
  const [newSubForm, setNewSubForm] = useState({
    substituteItemName: '',
    substituteCatalogNumber: '',
    substitutionTier: 'TIER_1_OEM_EQUIVALENT',
    isAutoSubstituteAllowed: true,
    clinicalJustification: 'Phase 55 Preferred clinical alternative'
  });

  // Load Data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const cardsRes = await preferenceCardService.getPreferenceCards({
        facilityId,
        specialty: selectedSpecialty || null,
        status: selectedStatus || null,
        search: searchQuery || ''
      });

      if (cardsRes.success) {
        setCards(cardsRes.cards);
        if (!selectedCard && cardsRes.cards.length > 0) {
          setSelectedCard(cardsRes.cards[0]);
          setSelectedRevision(cardsRes.cards[0].revisions?.[0] || null);
        }
      }

      const readinessRes = await preferenceCardService.getCaseReadinessList({ facilityId });
      if (readinessRes.success) {
        setReadinessCases(readinessRes.cases);
      }

      const reconRes = await preferenceCardService.getCaseReconciliationLedger({ facilityId });
      if (reconRes.success) {
        setReconciliationEntries(reconRes.entries);
        setWasteSummary({
          totalWasteCost: reconRes.totalWasteCost,
          wasteLineCount: reconRes.wasteLineCount
        });
      }
    } catch (err) {
      console.error('Error loading preference card data:', err);
    } finally {
      setLoading(false);
    }
  }, [facilityId, selectedSpecialty, selectedStatus, searchQuery, selectedCard]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle Card Selection
  const handleSelectCard = (card) => {
    setSelectedCard(card);
    const activeRev = card.revisions?.find(r => r.status === 'active') || card.revisions?.[0] || null;
    setSelectedRevision(activeRev);
  };

  // Create New Card Draft
  const handleCreateCard = async (e) => {
    e.preventDefault();
    try {
      const res = await preferenceCardService.saveCardDraft({
        ...newCardForm,
        facilityId
      });
      if (res.success) {
        setActionMessage({ type: 'success', text: `Draft Preference Card ${res.card.cardCode} successfully created.` });
        setIsNewCardModalOpen(false);
        loadData();
      }
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message || 'Failed to create preference card' });
    }
  };

  // Add Item to BOM
  const handleAddItem = async (e) => {
    e.preventDefault();
    if (!selectedRevision) return;
    try {
      const res = await preferenceCardService.addCardItem(selectedRevision.id, newItemForm);
      if (res.success) {
        setActionMessage({ type: 'success', text: `Added ${newItemForm.customItemName} to BOM.` });
        setIsAddItemModalOpen(false);
        setNewItemForm({
          itemCategory: 'IMPLANT',
          customItemName: '',
          manufacturer: '',
          catalogNumber: '',
          stagingBehavior: 'HOLD',
          plannedQuantity: 1,
          unitOfMeasure: 'EA',
          isMandatory: true,
          notes: ''
        });
        loadData();
      }
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message || 'Failed to add item' });
    }
  };

  // Configure Substitution
  const handleAddSubstitution = async (e) => {
    e.preventDefault();
    if (!selectedItemForSub) return;
    try {
      const res = await preferenceCardService.configureSubstitution(selectedItemForSub.id, newSubForm);
      if (res.success) {
        setActionMessage({ type: 'success', text: `Added substitution: ${newSubForm.substituteItemName}` });
        setIsSubModalOpen(false);
        loadData();
      }
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message || 'Failed to add substitution' });
    }
  };

  // Approve Revision
  const handleApproveRevision = async (revId) => {
    try {
      const res = await preferenceCardService.approveCardRevision(revId, 'Clinical Director protocol signoff');
      if (res.success) {
        setActionMessage({ type: 'success', text: 'Card Revision approved and activated.' });
        loadData();
      }
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message || 'Failed to approve revision' });
    }
  };

  // Submit for Approval
  const handleSubmitApproval = async (revId) => {
    try {
      const res = await preferenceCardService.submitForApproval(revId, 'Submitted for Clinical Director signoff');
      if (res.success) {
        setActionMessage({ type: 'success', text: 'Revision submitted for clinical approval.' });
        loadData();
      }
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message || 'Submission failed' });
    }
  };

  // Freeze Case Pre-Op Readiness Snapshot
  const handleFreezeSnapshot = async (surgeryId) => {
    try {
      const res = await preferenceCardService.freezeCasePreferenceSnapshot(surgeryId);
      if (res.success) {
        setActionMessage({ type: 'success', text: `Case #${surgeryId} BOM Snapshot frozen. Ready for incision.` });
        loadData();
      }
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message || 'Snapshot freeze failed' });
    }
  };

  // Calculate Metrics
  const activeCardsCount = cards.filter(c => c.isActive).length;
  const readyCasesCount = readinessCases.filter(c => c.readinessStatus === 'CASE_READY').length;
  const totalCasesCount = readinessCases.length || 1;
  const readinessRate = Math.round((readyCasesCount / totalCasesCount) * 100);

  return (
    <div className="pref-card-container">
      {/* Top Header */}
      <div className="pref-card-header">
        <div className="pref-title-group">
          <h2>
            <ClipboardList size={26} color="#38bdf8" />
            Surgeon Preference Cards & Procedural BOM
          </h2>
          <p>
            Authoritative clinical staging, OPEN vs HOLD governance, pre-op readiness snapshots, and post-op waste reconciliation.
          </p>
        </div>

        <div className="pref-actions">
          {canManage && (
            <button
              className="btn-primary-pref"
              onClick={() => setIsNewCardModalOpen(true)}
            >
              <Plus size={16} />
              New Preference Card Draft
            </button>
          )}
          <button
            className="btn-secondary-pref"
            onClick={loadData}
            title="Refresh clinical dataset"
          >
            <RotateCcw size={16} />
            Refresh
          </button>
        </div>
      </div>

      {/* Action Banner Notification */}
      {actionMessage && (
        <div
          style={{
            padding: '0.75rem 1rem',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: actionMessage.type === 'error' ? '#4c0519' : '#064e3b',
            color: actionMessage.type === 'error' ? '#fda4af' : '#6ee7b7',
            border: `1px solid ${actionMessage.type === 'error' ? '#e11d48' : '#10b981'}`
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {actionMessage.type === 'error' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
            <span>{actionMessage.text}</span>
          </div>
          <button
            onClick={() => setActionMessage(null)}
            style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer' }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* KPI Metrics Summary */}
      <div className="pref-metrics-grid">
        <div className="pref-metric-card blue">
          <div className="pref-metric-title">
            <ClipboardList size={14} />
            Active Preference Cards
          </div>
          <div className="pref-metric-val">{activeCardsCount}</div>
          <div className="pref-metric-sub">Across 4 surgical specialties</div>
        </div>

        <div className="pref-metric-card emerald">
          <div className="pref-metric-title">
            <CheckCircle2 size={14} />
            Pre-Op Readiness Rate
          </div>
          <div className="pref-metric-val">{readinessRate}%</div>
          <div className="pref-metric-sub">{readyCasesCount} of {readinessCases.length} scheduled cases verified</div>
        </div>

        <div className="pref-metric-card amber">
          <div className="pref-metric-title">
            <Clock size={14} />
            Staging Governance
          </div>
          <div className="pref-metric-val">42% OPEN / 58% HOLD</div>
          <div className="pref-metric-sub">Minimizes field contamination</div>
        </div>

        <div className="pref-metric-card rose">
          <div className="pref-metric-title">
            <AlertCircle size={14} />
            Contaminated Waste Ledger
          </div>
          <div className="pref-metric-val">${wasteSummary.totalWasteCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          <div className="pref-metric-sub">{wasteSummary.wasteLineCount} premature unbox incidents flagged</div>
        </div>
      </div>

      {loading && (
        <div style={{ fontSize: '0.8rem', color: '#38bdf8', padding: '0.25rem 0' }}>
          Synchronizing clinical preference cards...
        </div>
      )}

      {/* Main Tab Navigation */}
      <div className="pref-tabs-nav">
        <button
          className={`pref-tab-btn ${activeSubTab === 'directory' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('directory')}
        >
          <ClipboardList size={16} />
          Master Card Directory
        </button>

        <button
          className={`pref-tab-btn ${activeSubTab === 'bom_editor' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('bom_editor')}
        >
          <FileText size={16} />
          Interactive BOM & Staging Editor
        </button>

        <button
          className={`pref-tab-btn ${activeSubTab === 'readiness_board' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('readiness_board')}
        >
          <CheckCircle2 size={16} />
          Pre-Op Case Readiness Board
        </button>

        <button
          className={`pref-tab-btn ${activeSubTab === 'reconciliation' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('reconciliation')}
        >
          <RotateCcw size={16} />
          Post-Op Consumption & Waste
        </button>
      </div>

      {/* SUB-TAB 1: MASTER CARD DIRECTORY */}
      {activeSubTab === 'directory' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Filters Bar */}
          <div className="pref-filter-bar">
            <div className="pref-search-box">
              <Search size={16} color="#64748b" />
              <input
                type="text"
                placeholder="Search by card code, name, surgeon, or primary CPT..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <select
              className="pref-select-filter"
              value={selectedSpecialty}
              onChange={(e) => setSelectedSpecialty(e.target.value)}
            >
              <option value="">All Specialties</option>
              <option value="Orthopedics">Orthopedics</option>
              <option value="Ophthalmology">Ophthalmology</option>
              <option value="Pain Management">Pain Management</option>
              <option value="General Surgery">General Surgery</option>
            </select>

            <select
              className="pref-select-filter"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="draft">Draft</option>
              <option value="pending_approval">Pending Approval</option>
            </select>
          </div>

          {/* Cards Grid */}
          <div className="pref-card-grid">
            {cards.map(card => {
              const activeRev = card.revisions?.find(r => r.status === 'active') || card.revisions?.[0];
              const isSelected = selectedCard?.id === card.id;

              return (
                <div
                  key={card.id}
                  className={`pref-card-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => handleSelectCard(card)}
                >
                  <div>
                    <div className="pref-card-top">
                      <span className="pref-code-badge">{card.cardCode}</span>
                      {card.isHouseCard && (
                        <span className="pref-badge-house">HOUSE MASTER</span>
                      )}
                    </div>

                    <div className="pref-card-name">{card.cardName}</div>
                    <div className="pref-cpt-sub">
                      <span>CPT {card.primaryCpt}</span>
                      <span>•</span>
                      <span>{card.specialty}</span>
                    </div>
                  </div>

                  <div className="pref-card-meta">
                    <div className="pref-meta-item">
                      <span>Attending Surgeon</span>
                      <span>{card.surgeonName}</span>
                    </div>
                    <div className="pref-meta-item">
                      <span>Est. Duration</span>
                      <span>{card.estimatedDurationMinutes}m + {card.turnoverTimeMinutes}m</span>
                    </div>
                    <div className="pref-meta-item">
                      <span>Active Revision</span>
                      <span>Rev {card.activeRevisionNumber || 1} ({activeRev?.status || 'active'})</span>
                    </div>
                    <div className="pref-meta-item">
                      <span>Staging Split</span>
                      <span>{activeRev?.openItemCount || 0} OPEN / {activeRev?.holdItemCount || 0} HOLD</span>
                    </div>
                  </div>

                  <div className="pref-card-footer">
                    <span style={{ color: '#64748b' }}>
                      {card.facilityName}
                    </span>
                    <button
                      className="btn-secondary-pref"
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectCard(card);
                        setActiveSubTab('bom_editor');
                      }}
                    >
                      View BOM <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SUB-TAB 2: INTERACTIVE BOM & STAGING EDITOR */}
      {activeSubTab === 'bom_editor' && selectedCard && (
        <div className="pref-split-editor">
          {/* Left Panel: Card Header & Revision Governance */}
          <div className="pref-sidebar-panel">
            <div>
              <div className="pref-panel-section-title">
                <span>Card Identity</span>
                <span className="pref-code-badge">{selectedCard.cardCode}</span>
              </div>
              <h3 style={{ margin: '0.25rem 0', color: '#f8fafc', fontSize: '1.125rem' }}>
                {selectedCard.cardName}
              </h3>
              <p style={{ margin: '0.25rem 0 0 0', color: '#94a3b8', fontSize: '0.8rem' }}>
                {selectedCard.description}
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.8rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #1f2937', paddingBottom: '0.35rem' }}>
                <span style={{ color: '#64748b' }}>Attending Surgeon:</span>
                <span style={{ fontWeight: 600 }}>{selectedCard.surgeonName}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #1f2937', paddingBottom: '0.35rem' }}>
                <span style={{ color: '#64748b' }}>Primary CPT:</span>
                <span style={{ fontWeight: 600, color: '#38bdf8' }}>{selectedCard.primaryCpt}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #1f2937', paddingBottom: '0.35rem' }}>
                <span style={{ color: '#64748b' }}>Specialty:</span>
                <span>{selectedCard.specialty}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #1f2937', paddingBottom: '0.35rem' }}>
                <span style={{ color: '#64748b' }}>Laterality Support:</span>
                <span>{selectedCard.lateralityApplicable ? 'Yes (Left/Right)' : 'Standard'}</span>
              </div>
            </div>

            {/* Revisions History */}
            <div>
              <div className="pref-panel-section-title">
                <span>Revisions History</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {selectedCard.revisions?.map(rev => {
                  const isCurrent = selectedRevision?.id === rev.id;
                  return (
                    <div
                      key={rev.id}
                      onClick={() => setSelectedRevision(rev)}
                      style={{
                        padding: '0.625rem',
                        borderRadius: '0.375rem',
                        backgroundColor: isCurrent ? '#0c2847' : '#0f172a',
                        border: `1px solid ${isCurrent ? '#0284c7' : '#1e293b'}`,
                        cursor: 'pointer',
                        fontSize: '0.75rem'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                        <span style={{ color: '#f8fafc' }}>Revision #{rev.revisionNumber}</span>
                        <span style={{
                          textTransform: 'uppercase',
                          color: rev.status === 'active' ? '#4ade80' : rev.status === 'draft' ? '#fcd34d' : '#94a3b8'
                        }}>
                          {rev.status}
                        </span>
                      </div>
                      <div style={{ color: '#94a3b8', marginTop: '0.25rem' }}>{rev.changeSummary}</div>
                      {rev.approvedAt && (
                        <div style={{ color: '#64748b', fontSize: '0.7rem', marginTop: '0.2rem' }}>
                          Approved: {rev.approvedAt.split('T')[0]}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Revision Actions */}
            {selectedRevision && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {selectedRevision.status === 'draft' && (
                  <button
                    className="btn-primary-pref"
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={() => handleSubmitApproval(selectedRevision.id)}
                  >
                    Submit for Approval
                  </button>
                )}
                {selectedRevision.status === 'pending_approval' && canApprove && (
                  <button
                    className="btn-primary-pref"
                    style={{ width: '100%', justifyContent: 'center', backgroundColor: '#059669', borderColor: '#10b981' }}
                    onClick={() => handleApproveRevision(selectedRevision.id)}
                  >
                    Approve & Activate Revision
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Right Panel: Procedural Bill of Materials (BOM) */}
          <div className="pref-main-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '1.125rem' }}>
                  Procedural Bill of Materials
                </h3>
                <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                  Viewing Revision #{selectedRevision?.revisionNumber || 1} • {selectedRevision?.items?.length || 0} staged items
                </span>
              </div>

              {canManage && (
                <button
                  className="btn-primary-pref"
                  onClick={() => setIsAddItemModalOpen(true)}
                >
                  <Plus size={16} /> Add Item to BOM
                </button>
              )}
            </div>

            {/* Items Table */}
            <div style={{ overflowX: 'auto' }}>
              <table className="pref-bom-table">
                <thead>
                  <tr>
                    <th>Item Description</th>
                    <th>Manufacturer / Catalog</th>
                    <th>Staging Protocol</th>
                    <th>Qty</th>
                    <th>Pre-Approved Substitutions</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedRevision?.items?.map(item => (
                    <tr key={item.id}>
                      <td>
                        <div className="item-name-cell">{item.customItemName}</div>
                        <div className="item-sku-sub">
                          <span className="item-cat-tag">{item.itemCategory}</span>
                          {item.lateralityModifier !== 'STANDARD' && (
                            <span style={{ color: '#38bdf8', fontWeight: 600 }}>[{item.lateralityModifier}] </span>
                          )}
                          {item.notes}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 500 }}>{item.manufacturer || '—'}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{item.catalogNumber || '—'}</div>
                      </td>
                      <td>
                        {item.stagingBehavior === 'OPEN' ? (
                          <span className="badge-open">OPEN (TABLE)</span>
                        ) : (
                          <span className="badge-hold">HOLD (CORE)</span>
                        )}
                      </td>
                      <td>
                        <span style={{ fontWeight: 700 }}>{item.plannedQuantity}</span> {item.unitOfMeasure}
                      </td>
                      <td>
                        {item.substitutions && item.substitutions.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            {item.substitutions.map(sub => (
                              <div
                                key={sub.id}
                                style={{
                                  fontSize: '0.75rem',
                                  padding: '0.25rem 0.5rem',
                                  borderRadius: '0.25rem',
                                  backgroundColor: '#0c2847',
                                  border: '1px solid #0284c7',
                                  color: '#7dd3fc'
                                }}
                              >
                                <strong>{sub.substitutionTier.replace('TIER_', 'T')}:</strong> {sub.substituteItemName}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>None Configured</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '0.375rem' }}>
                          <button
                            className="btn-secondary-pref"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                            title="Configure clinical substitution"
                            onClick={() => {
                              setSelectedItemForSub(item);
                              setIsSubModalOpen(true);
                            }}
                          >
                            + Sub
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 3: PRE-OP CASE READINESS BOARD */}
      {activeSubTab === 'readiness_board' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '1.125rem' }}>
                Pre-Op OR Case Readiness Board
              </h3>
              <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                T-24h scheduling freeze snapshots, sterile table verification, and stockout alerts.
              </span>
            </div>
          </div>

          <div className="readiness-board-grid">
            {readinessCases.map(c => {
              const statusClass = c.readinessStatus === 'CASE_READY' ? 'ready' :
                c.readinessStatus === 'SUPPLY_BREACH' ? 'breach' : 'pulled';

              return (
                <div key={c.surgeryId} className={`case-readiness-card ${statusClass}`}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <span className="pref-code-badge">Case #{c.surgeryId}</span>
                      <h4 style={{ margin: '0.35rem 0 0 0', color: '#f8fafc', fontSize: '1rem' }}>
                        {c.patientName}
                      </h4>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                        {c.procedureName} (CPT {c.primaryCpt})
                      </div>
                    </div>

                    {c.readinessStatus === 'CASE_READY' && <span className="badge-ready">CASE READY</span>}
                    {c.readinessStatus === 'ITEMS_PULLED' && <span className="badge-pulled">ITEMS PULLED</span>}
                    {c.readinessStatus === 'SUPPLY_BREACH' && <span className="badge-breach">SUPPLY BREACH</span>}
                    {c.readinessStatus === 'PENDING_PREP' && <span className="badge-pending">PENDING PREP</span>}
                  </div>

                  <div className="pref-card-meta">
                    <div className="pref-meta-item">
                      <span>OR Room & Time</span>
                      <span>{c.orRoom} • {c.caseTime}</span>
                    </div>
                    <div className="pref-meta-item">
                      <span>Attending Surgeon</span>
                      <span>{c.surgeonName}</span>
                    </div>
                    <div className="pref-meta-item">
                      <span>Preference Card</span>
                      <span>{c.cardCode}</span>
                    </div>
                    <div className="pref-meta-item">
                      <span>Staging Requirement</span>
                      <span>{c.openItemCount} OPEN / {c.holdItemCount} HOLD</span>
                    </div>
                  </div>

                  <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic' }}>
                    Notes: {c.notes}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.5rem', borderTop: '1px solid #1f2937' }}>
                    <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                      {c.verifiedBy ? `Verified: ${c.verifiedBy}` : 'Unverified'}
                    </span>
                    {c.readinessStatus !== 'CASE_READY' && (
                      <button
                        className="btn-primary-pref"
                        style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                        onClick={() => handleFreezeSnapshot(c.surgeryId)}
                      >
                        <Check size={14} /> Freeze & Ready
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SUB-TAB 4: POST-OP RECONCILIATION & WASTE */}
      {activeSubTab === 'reconciliation' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '1.125rem' }}>
              Post-Op Planned vs. Actual Usage Reconciliation Ledger
            </h3>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
              Line-by-line consumption variance against Phase 23 case devices and Phase 57 actual acquisition costs. {canReconcile && '• Reconciler Role Active'}
            </span>
          </div>

          <div style={{ overflowX: 'auto', backgroundColor: '#111827', borderRadius: '0.5rem', border: '1px solid #1f2937' }}>
            <table className="reconciliation-table">
              <thead>
                <tr>
                  <th>Surgery / Patient</th>
                  <th>Item Description</th>
                  <th>Planned Staging</th>
                  <th>Planned</th>
                  <th>Opened</th>
                  <th>Implanted</th>
                  <th>Wasted</th>
                  <th>Disposition</th>
                  <th style={{ textAlign: 'right' }}>Waste Cost</th>
                </tr>
              </thead>
              <tbody>
                {reconciliationEntries.map(entry => (
                  <tr key={entry.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: '#f8fafc' }}>Case #{entry.surgeryId}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{entry.surgeonName}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: '#f8fafc' }}>{entry.itemDescription}</div>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{entry.notes}</div>
                    </td>
                    <td>
                      {entry.plannedStaging === 'OPEN' ? (
                        <span className="badge-open">OPEN</span>
                      ) : (
                        <span className="badge-hold">HOLD</span>
                      )}
                    </td>
                    <td>{entry.plannedQuantity}</td>
                    <td>{entry.actualQuantityOpened}</td>
                    <td>{entry.actualQuantityImplanted}</td>
                    <td>
                      <span style={{ color: entry.actualQuantityWasted > 0 ? '#fda4af' : 'inherit', fontWeight: entry.actualQuantityWasted > 0 ? 700 : 400 }}>
                        {entry.actualQuantityWasted}
                      </span>
                    </td>
                    <td>
                      <span className={`disposition-chip ${entry.dispositionCode}`}>
                        {entry.dispositionCode.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: entry.wasteEstimatedCost > 0 ? '#fda4af' : '#4ade80' }}>
                      ${Number(entry.wasteEstimatedCost || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL 1: NEW PREFERENCE CARD DRAFT */}
      {isNewCardModalOpen && (
        <div className="pref-modal-overlay">
          <div className="pref-modal-content">
            <div className="pref-modal-header">
              <h3>Create New Preference Card Draft</h3>
              <button className="pref-modal-close-btn" onClick={() => setIsNewCardModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateCard} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-row">
                <div className="form-group">
                  <label>Card Code *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. PREF-ORTHO-TKA-02"
                    value={newCardForm.cardCode}
                    onChange={(e) => setNewCardForm(prev => ({ ...prev, cardCode: e.target.value.toUpperCase() }))}
                  />
                </div>
                <div className="form-group">
                  <label>Primary CPT Code *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 27447"
                    value={newCardForm.primaryCpt}
                    onChange={(e) => setNewCardForm(prev => ({ ...prev, primaryCpt: e.target.value }))}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Card Name / Procedure Construct *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Primary Total Knee Arthroplasty (Persona Cruciate Retaining)"
                  value={newCardForm.cardName}
                  onChange={(e) => setNewCardForm(prev => ({ ...prev, cardName: e.target.value }))}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Surgical Specialty</label>
                  <select
                    value={newCardForm.specialty}
                    onChange={(e) => setNewCardForm(prev => ({ ...prev, specialty: e.target.value }))}
                  >
                    <option value="Orthopedics">Orthopedics</option>
                    <option value="Ophthalmology">Ophthalmology</option>
                    <option value="Pain Management">Pain Management</option>
                    <option value="General Surgery">General Surgery</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Attending Surgeon</label>
                  <select
                    value={newCardForm.surgeonId}
                    onChange={(e) => setNewCardForm(prev => ({ ...prev, surgeonId: e.target.value }))}
                  >
                    <option value="1">Dr. Kelly Malinoski (Orthopedics)</option>
                    <option value="2">Dr. Andrew Bonett (Ophthalmology)</option>
                    <option value="3">Dr. Paul Gardner (Orthopedics)</option>
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Est. Duration (Min)</label>
                  <input
                    type="number"
                    min="5"
                    value={newCardForm.estimatedDurationMinutes}
                    onChange={(e) => setNewCardForm(prev => ({ ...prev, estimatedDurationMinutes: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label>Turnover (Min)</label>
                  <input
                    type="number"
                    min="0"
                    value={newCardForm.turnoverTimeMinutes}
                    onChange={(e) => setNewCardForm(prev => ({ ...prev, turnoverTimeMinutes: e.target.value }))}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Clinical Description & Instructions</label>
                <textarea
                  rows="3"
                  placeholder="Procedural details, patient positioning, skin prep..."
                  value={newCardForm.description}
                  onChange={(e) => setNewCardForm(prev => ({ ...prev, description: e.target.value }))}
                />
              </div>

              <div className="pref-modal-actions">
                <button
                  type="button"
                  className="btn-secondary-pref"
                  onClick={() => setIsNewCardModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary-pref"
                >
                  Create Card Draft
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: ADD ITEM TO BOM */}
      {isAddItemModalOpen && (
        <div className="pref-modal-overlay">
          <div className="pref-modal-content">
            <div className="pref-modal-header">
              <h3>Add Item to Procedural BOM</h3>
              <button className="pref-modal-close-btn" onClick={() => setIsAddItemModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddItem} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-row">
                <div className="form-group">
                  <label>Item Category *</label>
                  <select
                    value={newItemForm.itemCategory}
                    onChange={(e) => setNewItemForm(prev => ({ ...prev, itemCategory: e.target.value }))}
                  >
                    {ITEM_CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Staging Protocol *</label>
                  <select
                    value={newItemForm.stagingBehavior}
                    onChange={(e) => setNewItemForm(prev => ({ ...prev, stagingBehavior: e.target.value }))}
                  >
                    <option value="HOLD">HOLD (Staged in Core, unopened)</option>
                    <option value="OPEN">OPEN (Opened onto Sterile Table)</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Item Description / Clinical Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Triathlon CR Femoral Component Size 4 Left"
                  value={newItemForm.customItemName}
                  onChange={(e) => setNewItemForm(prev => ({ ...prev, customItemName: e.target.value }))}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Manufacturer</label>
                  <input
                    type="text"
                    placeholder="e.g. Stryker Orthopaedics"
                    value={newItemForm.manufacturer}
                    onChange={(e) => setNewItemForm(prev => ({ ...prev, manufacturer: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label>Catalog / Part Number</label>
                  <input
                    type="text"
                    placeholder="e.g. 5520-F-401"
                    value={newItemForm.catalogNumber}
                    onChange={(e) => setNewItemForm(prev => ({ ...prev, catalogNumber: e.target.value }))}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Planned Qty</label>
                  <input
                    type="number"
                    min="1"
                    value={newItemForm.plannedQuantity}
                    onChange={(e) => setNewItemForm(prev => ({ ...prev, plannedQuantity: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label>Unit of Measure</label>
                  <input
                    type="text"
                    value={newItemForm.unitOfMeasure}
                    onChange={(e) => setNewItemForm(prev => ({ ...prev, unitOfMeasure: e.target.value }))}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Clinical Notes / Sizing Criteria</label>
                <input
                  type="text"
                  placeholder="e.g. Unbox only after depth gauge measurement confirmed"
                  value={newItemForm.notes}
                  onChange={(e) => setNewItemForm(prev => ({ ...prev, notes: e.target.value }))}
                />
              </div>

              <div className="pref-modal-actions">
                <button
                  type="button"
                  className="btn-secondary-pref"
                  onClick={() => setIsAddItemModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary-pref"
                >
                  Add Item to BOM
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: PRE-APPROVED SUBSTITUTION */}
      {isSubModalOpen && selectedItemForSub && (
        <div className="pref-modal-overlay">
          <div className="pref-modal-content">
            <div className="pref-modal-header">
              <h3>Configure Clinical Substitution</h3>
              <button className="pref-modal-close-btn" onClick={() => setIsSubModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
              Base Item: <strong style={{ color: '#f8fafc' }}>{selectedItemForSub.customItemName}</strong>
            </div>

            <form onSubmit={handleAddSubstitution} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group">
                <label>Substitute Item Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Persona Anatomical Tibial Baseplate Size E"
                  value={newSubForm.substituteItemName}
                  onChange={(e) => setNewSubForm(prev => ({ ...prev, substituteItemName: e.target.value }))}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Substitute Catalog Number</label>
                  <input
                    type="text"
                    placeholder="e.g. 42-5200-005-01"
                    value={newSubForm.substituteCatalogNumber}
                    onChange={(e) => setNewSubForm(prev => ({ ...prev, substituteCatalogNumber: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label>Substitution Tier</label>
                  <select
                    value={newSubForm.substitutionTier}
                    onChange={(e) => setNewSubForm(prev => ({ ...prev, substitutionTier: e.target.value }))}
                  >
                    <option value="TIER_1_OEM_EQUIVALENT">Tier 1: OEM Equivalent (Same Mfr)</option>
                    <option value="TIER_2_CONTRACT_FORMULARY">Tier 2: Contract Formulary (Cross-OEM)</option>
                    <option value="TIER_3_EMERGENCY_SUBSTITUTE">Tier 3: Emergency Substitute</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Clinical Justification & Equivalence Notes</label>
                <input
                  type="text"
                  value={newSubForm.clinicalJustification}
                  onChange={(e) => setNewSubForm(prev => ({ ...prev, clinicalJustification: e.target.value }))}
                />
              </div>

              <div className="pref-modal-actions">
                <button
                  type="button"
                  className="btn-secondary-pref"
                  onClick={() => setIsSubModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary-pref"
                >
                  Save Substitution
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
