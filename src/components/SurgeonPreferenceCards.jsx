import React, { useState, useEffect, useCallback } from 'react';
import {
  ClipboardList, Plus, Search, AlertTriangle, CheckCircle2,
  Clock, X, FileText,
  RotateCcw, AlertCircle, ChevronRight, Lock,
  Trash2, ShieldCheck
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
  const [activeSubTab, setActiveSubTab] = useState('bom_editor'); // Default to interactive BOM for immediate clinical access

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
  const [selectedBomCategory, setSelectedBomCategory] = useState('ALL');

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
    lateralityModifier: 'STANDARD',
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
        } else if (selectedCard) {
          const updated = cardsRes.cards.find(c => c.id === selectedCard.id) || cardsRes.cards[0];
          setSelectedCard(updated);
          setSelectedRevision(updated?.revisions?.find(r => r.status === 'active') || updated?.revisions?.[0] || null);
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

  // Quick Toggle OPEN vs HOLD on Item (Immutable state update)
  const handleToggleStaging = (item) => {
    const nextStaging = item.stagingBehavior === 'OPEN' ? 'HOLD' : 'OPEN';
    if (selectedRevision) {
      const updatedItems = (selectedRevision.items || []).map(i =>
        i.id === item.id ? { ...i, stagingBehavior: nextStaging } : i
      );
      const openCount = updatedItems.filter(i => i.stagingBehavior === 'OPEN').length;
      const holdCount = updatedItems.filter(i => i.stagingBehavior === 'HOLD').length;

      setSelectedRevision(prev => ({
        ...prev,
        items: updatedItems,
        openItemCount: openCount,
        holdItemCount: holdCount
      }));

      setActionMessage({
        type: 'success',
        text: `Switched ${item.customItemName} to ${nextStaging} staging protocol.`
      });
    }
  };

  // Remove Item
  const handleRemoveItem = async (itemId, itemName) => {
    try {
      const res = await preferenceCardService.removeCardItem(itemId);
      if (res.success) {
        setActionMessage({ type: 'success', text: `Removed ${itemName} from BOM.` });
        loadData();
      }
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message || 'Failed to remove item' });
    }
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
        setSelectedCard(res.card);
        setSelectedRevision(res.card.revisions?.[0] || null);
        setActiveSubTab('bom_editor');
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
          lateralityModifier: 'STANDARD',
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

  // Filtered BOM Items
  const filteredBomItems = selectedRevision?.items?.filter(item => {
    if (selectedBomCategory === 'ALL') return true;
    return item.itemCategory === selectedBomCategory;
  }) || [];

  // Metrics Calculations
  const activeCardsCount = cards.filter(c => c.isActive).length;
  const readyCasesCount = readinessCases.filter(c => c.readinessStatus === 'CASE_READY').length;
  const totalCasesCount = readinessCases.length || 1;
  const readinessRate = Math.round((readyCasesCount / totalCasesCount) * 100);

  return (
    <div className="pref-card-container">
      {/* 1. TOP HEADER & GLOBAL ACTIONS */}
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

      {/* 2. ACTION NOTIFICATION BANNER */}
      {actionMessage && (
        <div
          style={{
            padding: '0.75rem 1.15rem',
            borderRadius: '0.5rem',
            fontSize: '0.875rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: actionMessage.type === 'error' ? 'rgba(244, 63, 94, 0.15)' : 'rgba(16, 185, 129, 0.15)',
            color: actionMessage.type === 'error' ? '#fda4af' : '#6ee7b7',
            border: `1px solid ${actionMessage.type === 'error' ? '#f43f5e' : '#10b981'}`
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            {actionMessage.type === 'error' ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
            <span style={{ fontWeight: 500 }}>{actionMessage.text}</span>
          </div>
          <button
            onClick={() => setActionMessage(null)}
            style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', padding: '0.2rem' }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* 3. KPI SUMMARY CARDS */}
      <div className="pref-metrics-grid">
        <div className="pref-metric-card blue">
          <div className="pref-metric-title">
            <ClipboardList size={15} color="#38bdf8" />
            Active Preference Cards
          </div>
          <div className="pref-metric-val">{activeCardsCount}</div>
          <div className="pref-metric-sub">Across 4 surgical specialties • 100% CPT mapped</div>
        </div>

        <div className="pref-metric-card emerald">
          <div className="pref-metric-title">
            <CheckCircle2 size={15} color="#34d399" />
            Pre-Op Case Readiness Rate
          </div>
          <div className="pref-metric-val">{readinessRate}%</div>
          <div className="pref-metric-sub">{readyCasesCount} of {readinessCases.length} scheduled cases verified & locked</div>
        </div>

        <div className="pref-metric-card amber">
          <div className="pref-metric-title">
            <Clock size={15} color="#fbbf24" />
            Staging Governance Ratio
          </div>
          <div className="pref-metric-val">42% OPEN / 58% HOLD</div>
          <div className="pref-metric-sub">58% staged in room core to eliminate opened waste</div>
        </div>

        <div className="pref-metric-card rose">
          <div className="pref-metric-title">
            <AlertCircle size={15} color="#fb7185" />
            Contaminated Waste Ledger
          </div>
          <div className="pref-metric-val">${wasteSummary.totalWasteCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          <div className="pref-metric-sub">{wasteSummary.wasteLineCount} premature unbox incidents audited</div>
        </div>
      </div>

      {loading && (
        <div style={{ fontSize: '0.8rem', color: '#38bdf8', padding: '0.25rem 0' }}>
          Synchronizing clinical preference cards...
        </div>
      )}

      {/* 4. WORKSPACE NAVIGATION TABS */}
      <div className="pref-tabs-nav">
        <button
          className={`pref-tab-btn ${activeSubTab === 'bom_editor' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('bom_editor')}
        >
          <FileText size={16} />
          Interactive BOM & Staging Editor
          <span className="pref-tab-badge">{selectedRevision?.items?.length || 0}</span>
        </button>

        <button
          className={`pref-tab-btn ${activeSubTab === 'directory' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('directory')}
        >
          <ClipboardList size={16} />
          Master Card Directory
          <span className="pref-tab-badge">{cards.length}</span>
        </button>

        <button
          className={`pref-tab-btn ${activeSubTab === 'readiness_board' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('readiness_board')}
        >
          <CheckCircle2 size={16} />
          Pre-Op Case Readiness Board
          <span className="pref-tab-badge">{readinessCases.length}</span>
        </button>

        <button
          className={`pref-tab-btn ${activeSubTab === 'reconciliation' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('reconciliation')}
        >
          <RotateCcw size={16} />
          Post-Op Consumption & Waste
          <span className="pref-tab-badge">{reconciliationEntries.length}</span>
        </button>
      </div>

      {/* ==============================================================================
          SUB-TAB 2: REDESIGNED FULL-WIDTH INTERACTIVE BOM & STAGING EDITOR
          ============================================================================== */}
      {activeSubTab === 'bom_editor' && selectedCard && (
        <div className="bom-workspace-container">
          {/* Card Hero Header Across Full Width */}
          <div className="bom-card-hero">
            <div className="bom-hero-top">
              <div className="bom-hero-title-area">
                <div className="bom-hero-badges">
                  <span className="pref-code-badge">{selectedCard.cardCode}</span>
                  {selectedCard.isHouseCard && (
                    <span className="pref-badge-house">FACILITY HOUSE MASTER</span>
                  )}
                  <span className="cpt-pill">CPT {selectedCard.primaryCpt}</span>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                    {selectedCard.specialty}
                  </span>
                </div>

                <h3 className="bom-hero-title">
                  {selectedCard.cardName}
                </h3>
                <p className="bom-hero-desc">
                  {selectedCard.description}
                </p>
              </div>

              {/* Revision Switcher & Card Actions */}
              <div className="bom-hero-actions">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Switch Card:</span>
                  <select
                    className="pref-select-filter"
                    value={selectedCard.id}
                    onChange={(e) => {
                      const c = cards.find(item => item.id === e.target.value);
                      if (c) handleSelectCard(c);
                    }}
                  >
                    {cards.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.cardCode} — {c.cardName.substring(0, 45)}...
                      </option>
                    ))}
                  </select>
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
            </div>

            {/* Quick Metadata Stats Strip */}
            <div className="bom-hero-stats-row">
              <div className="bom-pills-cluster">
                <div className="bom-pill-item">
                  <span>Attending Surgeon:</span>
                  <strong>{selectedCard.surgeonName}</strong>
                </div>
                <div className="bom-pill-item">
                  <span>Est. Duration:</span>
                  <strong>{selectedCard.estimatedDurationMinutes}m (+{selectedCard.turnoverTimeMinutes}m turnover)</strong>
                </div>
                <div className="bom-pill-item">
                  <span>Laterality:</span>
                  <strong>{selectedCard.lateralityApplicable ? 'Yes (Side Specific)' : 'Standard'}</strong>
                </div>
                <div className="bom-pill-item">
                  <span>Facility:</span>
                  <strong>{selectedCard.facilityName}</strong>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                {selectedRevision && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}>
                    <span style={{ color: '#94a3b8' }}>Revision #{selectedRevision.revisionNumber}:</span>
                    <span style={{
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      padding: '0.2rem 0.5rem',
                      borderRadius: '0.25rem',
                      backgroundColor: selectedRevision.status === 'active' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                      color: selectedRevision.status === 'active' ? '#34d399' : '#fbbf24',
                      border: `1px solid ${selectedRevision.status === 'active' ? '#10b981' : '#f59e0b'}`
                    }}>
                      {selectedRevision.status}
                    </span>
                  </div>
                )}

                {selectedRevision?.status === 'draft' && (
                  <button
                    className="btn-secondary-pref"
                    style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
                    onClick={() => handleSubmitApproval(selectedRevision.id)}
                  >
                    Submit for Approval
                  </button>
                )}

                {selectedRevision?.status === 'pending_approval' && canApprove && (
                  <button
                    className="btn-primary-pref"
                    style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', backgroundColor: '#059669', borderColor: '#10b981' }}
                    onClick={() => handleApproveRevision(selectedRevision.id)}
                  >
                    <ShieldCheck size={14} /> Approve & Activate
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Full Width Bill of Materials Table */}
          <div className="bom-table-container">
            <div className="bom-table-top-bar">
              <div className="bom-table-title">
                <FileText size={18} color="#38bdf8" />
                Procedural Bill of Materials (BOM)
                <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 400 }}>
                  ({filteredBomItems.length} of {selectedRevision?.items?.length || 0} staged items)
                </span>
              </div>

              {/* Category Filter Pills */}
              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                {['ALL', ...ITEM_CATEGORIES].map(cat => (
                  <button
                    key={cat}
                    onClick={() => setSelectedBomCategory(cat)}
                    style={{
                      background: selectedBomCategory === cat ? '#0284c7' : '#1e293b',
                      color: selectedBomCategory === cat ? '#ffffff' : '#94a3b8',
                      border: `1px solid ${selectedBomCategory === cat ? '#38bdf8' : '#334155'}`,
                      padding: '0.25rem 0.55rem',
                      borderRadius: '0.35rem',
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {cat.replace(/_/g, ' ')}
                  </button>
                ))}
              </div>
            </div>

            <div className="bom-table-scroll">
              <table className="pref-bom-table">
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}>#</th>
                    <th style={{ minWidth: '280px' }}>Item & Clinical Specification</th>
                    <th style={{ minWidth: '180px' }}>Manufacturer / Catalog</th>
                    <th style={{ minWidth: '160px' }}>Staging Protocol (Click to Toggle)</th>
                    <th style={{ minWidth: '80px' }}>Planned</th>
                    <th style={{ minWidth: '240px' }}>Pre-Approved Clinical Substitutions</th>
                    <th style={{ minWidth: '110px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBomItems.map((item, idx) => (
                    <tr key={item.id}>
                      <td style={{ color: '#64748b', fontWeight: 600 }}>{idx + 1}</td>
                      <td>
                        <div className="bom-item-name">{item.customItemName}</div>
                        <div className="bom-item-submeta">
                          <span className={`cat-badge ${item.itemCategory}`}>
                            {item.itemCategory.replace(/_/g, ' ')}
                          </span>
                          {item.lateralityModifier !== 'STANDARD' && (
                            <span className="laterality-tag">
                              [{item.lateralityModifier}]
                            </span>
                          )}
                          {item.notes && (
                            <span className="item-clinical-notes">
                              {item.notes}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: '#f8fafc' }}>{item.manufacturer || '—'}</div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontFamily: 'monospace' }}>
                          Ref: {item.catalogNumber || '—'}
                        </div>
                      </td>
                      <td>
                        <div
                          className="staging-pill"
                          onClick={() => handleToggleStaging(item)}
                          style={{ cursor: 'pointer' }}
                          title="Click to toggle OPEN vs HOLD staging protocol"
                        >
                          {item.stagingBehavior === 'OPEN' ? (
                            <span className="badge-open">
                              <CheckCircle2 size={13} /> OPEN (TABLE PREP)
                            </span>
                          ) : (
                            <span className="badge-hold">
                              <Lock size={13} /> HOLD (OR CORE)
                            </span>
                          )}
                          <span className="staging-subtext">
                            {item.stagingBehavior === 'OPEN' ? 'Open onto sterile table' : 'Staged in core cart; unopened'}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 700, fontSize: '1rem', color: '#f8fafc' }}>
                          {item.plannedQuantity}
                          <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 500, marginLeft: '0.25rem' }}>
                            {item.unitOfMeasure}
                          </span>
                        </div>
                      </td>
                      <td>
                        {item.substitutions && item.substitutions.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                            {item.substitutions.map(sub => (
                              <div key={sub.id} className="substitution-cardlet">
                                <span className="sub-tier-label">
                                  {sub.substitutionTier.replace(/_/g, ' ')}
                                </span>
                                <span className="sub-item-name">
                                  {sub.substituteItemName}
                                </span>
                                <span className="sub-part-num">
                                  Catalog: {sub.substituteCatalogNumber || 'N/A'}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setSelectedItemForSub(item);
                              setIsSubModalOpen(true);
                            }}
                            style={{
                              background: 'transparent',
                              border: '1px dashed #334155',
                              color: '#94a3b8',
                              padding: '0.35rem 0.65rem',
                              borderRadius: '0.35rem',
                              fontSize: '0.75rem',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.35rem'
                            }}
                          >
                            <Plus size={13} /> Pre-approve Alternative
                          </button>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '0.35rem' }}>
                          <button
                            className="btn-secondary-pref"
                            style={{ padding: '0.3rem 0.55rem', fontSize: '0.75rem' }}
                            title="Add Alternative Substitution"
                            onClick={() => {
                              setSelectedItemForSub(item);
                              setIsSubModalOpen(true);
                            }}
                          >
                            + Sub
                          </button>
                          {canManage && (
                            <button
                              className="btn-secondary-pref"
                              style={{ padding: '0.3rem 0.55rem', color: '#fda4af', borderColor: '#4c0519' }}
                              title="Delete Item"
                              onClick={() => handleRemoveItem(item.id, item.customItemName)}
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}

                  {filteredBomItems.length === 0 && (
                    <tr>
                      <td colSpan="7" style={{ textAlign: 'center', padding: '2.5rem', color: '#64748b' }}>
                        No procedural items staged in this category. Click <strong>"Add Item to BOM"</strong> above to stage equipment or implants.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==============================================================================
          SUB-TAB 1: MASTER CARD DIRECTORY (PREMIUM CARDS GRID)
          ============================================================================== */}
      {activeSubTab === 'directory' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
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
              const totalItems = (activeRev?.openItemCount || 0) + (activeRev?.holdItemCount || 0) || 1;
              const openPct = Math.round(((activeRev?.openItemCount || 0) / totalItems) * 100);
              const holdPct = 100 - openPct;

              return (
                <div
                  key={card.id}
                  className={`pref-card-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => handleSelectCard(card)}
                >
                  <div>
                    <div className="pref-card-top">
                      <span className="pref-code-badge">{card.cardCode}</span>
                      {card.isHouseCard ? (
                        <span className="pref-badge-house">HOUSE MASTER</span>
                      ) : (
                        <span style={{ fontSize: '0.7rem', color: '#38bdf8', fontWeight: 600 }}>
                          Surgeon Customized
                        </span>
                      )}
                    </div>

                    <div className="pref-card-name">{card.cardName}</div>
                    <div className="pref-cpt-sub">
                      <span className="cpt-pill">CPT {card.primaryCpt}</span>
                      <span>•</span>
                      <span>{card.specialty}</span>
                    </div>
                  </div>

                  {/* Staging Split Visual Bar */}
                  <div className="pref-split-bar-container">
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#94a3b8' }}>
                      <span>Staging Split:</span>
                      <span><strong>{activeRev?.openItemCount || 0} OPEN</strong> / <strong>{activeRev?.holdItemCount || 0} HOLD</strong></span>
                    </div>
                    <div className="pref-split-bar">
                      <div className="pref-split-bar-open" style={{ width: `${openPct}%` }} title={`${openPct}% OPEN`} />
                      <div className="pref-split-bar-hold" style={{ width: `${holdPct}%` }} title={`${holdPct}% HOLD`} />
                    </div>
                  </div>

                  <div className="pref-card-meta">
                    <div className="pref-meta-item">
                      <span>Attending Surgeon</span>
                      <span>{card.surgeonName}</span>
                    </div>
                    <div className="pref-meta-item">
                      <span>Est. Duration</span>
                      <span>{card.estimatedDurationMinutes}m (+{card.turnoverTimeMinutes}m)</span>
                    </div>
                    <div className="pref-meta-item">
                      <span>Active Revision</span>
                      <span>Rev #{card.activeRevisionNumber || 1} ({activeRev?.status || 'active'})</span>
                    </div>
                    <div className="pref-meta-item">
                      <span>Total Items</span>
                      <span>{activeRev?.itemCount || activeRev?.items?.length || 0} staged items</span>
                    </div>
                  </div>

                  <div className="pref-card-footer">
                    <span style={{ color: '#64748b', fontSize: '0.75rem' }}>
                      {card.facilityName}
                    </span>
                    <button
                      className="btn-primary-pref"
                      style={{ padding: '0.35rem 0.85rem', fontSize: '0.75rem' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectCard(card);
                        setActiveSubTab('bom_editor');
                      }}
                    >
                      Open Clinical BOM <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ==============================================================================
          SUB-TAB 3: PRE-OP CASE READINESS BOARD
          ============================================================================== */}
      {activeSubTab === 'readiness_board' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '1.15rem', fontWeight: 700 }}>
                OR Command Center: Pre-Op Case Readiness Board
              </h3>
              <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                T-24h scheduling freeze snapshots, sterile back table staging verification, and automated supply breach alerts.
              </span>
            </div>
          </div>

          <div className="readiness-board-grid">
            {readinessCases.map(c => {
              const statusClass = c.readinessStatus === 'CASE_READY' ? 'ready' :
                c.readinessStatus === 'SUPPLY_BREACH' ? 'breach' : 'pulled';

              return (
                <div key={c.surgeryId} className={`case-readiness-card ${statusClass}`}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span className="pref-code-badge">{c.orRoom} • {c.caseTime}</span>
                        <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Case #{c.surgeryId}</span>
                      </div>
                      <h4 style={{ margin: '0.45rem 0 0.15rem 0', color: '#f8fafc', fontSize: '1.05rem', fontWeight: 700 }}>
                        {c.patientName}
                      </h4>
                      <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                        {c.procedureName} <span className="cpt-pill">CPT {c.primaryCpt}</span>
                      </div>
                    </div>

                    <div>
                      {c.readinessStatus === 'CASE_READY' && <span className="badge-ready">CASE READY</span>}
                      {c.readinessStatus === 'ITEMS_PULLED' && <span className="badge-pulled">ITEMS PULLED</span>}
                      {c.readinessStatus === 'SUPPLY_BREACH' && <span className="badge-breach">SUPPLY BREACH</span>}
                      {c.readinessStatus === 'PENDING_PREP' && <span className="badge-pending">PENDING PREP</span>}
                    </div>
                  </div>

                  <div className="pref-card-meta">
                    <div className="pref-meta-item">
                      <span>Attending Surgeon</span>
                      <span>{c.surgeonName}</span>
                    </div>
                    <div className="pref-meta-item">
                      <span>Laterality</span>
                      <span>{c.laterality || 'Standard'}</span>
                    </div>
                    <div className="pref-meta-item">
                      <span>Assigned Preference Card</span>
                      <span>{c.cardCode}</span>
                    </div>
                    <div className="pref-meta-item">
                      <span>Staging Requirement</span>
                      <span><strong>{c.openItemCount} OPEN</strong> / <strong>{c.holdItemCount} HOLD</strong></span>
                    </div>
                  </div>

                  <div style={{
                    fontSize: '0.775rem',
                    color: c.readinessStatus === 'SUPPLY_BREACH' ? '#fda4af' : '#94a3b8',
                    backgroundColor: c.readinessStatus === 'SUPPLY_BREACH' ? 'rgba(244, 63, 94, 0.1)' : '#090d16',
                    padding: '0.65rem',
                    borderRadius: '0.375rem',
                    border: `1px solid ${c.readinessStatus === 'SUPPLY_BREACH' ? 'rgba(244, 63, 94, 0.3)' : '#1a2538'}`
                  }}>
                    <strong>Clinical Note:</strong> {c.notes}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.75rem', borderTop: '1px solid #1a2538' }}>
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      {c.verifiedBy ? `Verified: ${c.verifiedBy}` : 'Awaiting scrub tech signoff'}
                    </span>
                    {c.readinessStatus !== 'CASE_READY' && (
                      <button
                        className="btn-primary-pref"
                        style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
                        onClick={() => handleFreezeSnapshot(c.surgeryId)}
                      >
                        <Lock size={13} /> Freeze & Verify Table
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ==============================================================================
          SUB-TAB 4: POST-OP RECONCILIATION & WASTE
          ============================================================================== */}
      {activeSubTab === 'reconciliation' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '1.15rem', fontWeight: 700 }}>
              Post-Op Planned vs. Actual Usage Reconciliation Ledger
            </h3>
            <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
              Line-by-line consumption variance against Phase 23 case devices and Phase 57 actual acquisition costs. {canReconcile && '• Reconciler Role Active'}
            </span>
          </div>

          <div style={{ overflowX: 'auto', backgroundColor: '#0b1120', borderRadius: '0.75rem', border: '1px solid #1e293b', boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)' }}>
            <table className="reconciliation-table">
              <thead>
                <tr>
                  <th>Surgery & Patient</th>
                  <th>Item Description</th>
                  <th>Category</th>
                  <th>Planned Staging</th>
                  <th>Planned</th>
                  <th>Opened</th>
                  <th>Implanted</th>
                  <th>Wasted</th>
                  <th>Clinical Disposition</th>
                  <th style={{ textAlign: 'right' }}>Waste Cost ($)</th>
                </tr>
              </thead>
              <tbody>
                {reconciliationEntries.map(entry => (
                  <tr key={entry.id}>
                    <td>
                      <div style={{ fontWeight: 700, color: '#f8fafc' }}>Case #{entry.surgeryId}</div>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{entry.surgeonName}</div>
                      <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{entry.caseDate}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: '#f8fafc' }}>{entry.itemDescription}</div>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic', marginTop: '0.2rem' }}>
                        {entry.notes}
                      </div>
                    </td>
                    <td>
                      <span className={`cat-badge ${entry.itemCategory}`}>
                        {entry.itemCategory.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td>
                      {entry.plannedStaging === 'OPEN' ? (
                        <span className="badge-open">OPEN</span>
                      ) : (
                        <span className="badge-hold">HOLD</span>
                      )}
                    </td>
                    <td style={{ fontWeight: 600 }}>{entry.plannedQuantity}</td>
                    <td style={{ fontWeight: 600 }}>{entry.actualQuantityOpened}</td>
                    <td style={{ fontWeight: 600, color: '#34d399' }}>{entry.actualQuantityImplanted}</td>
                    <td>
                      <span style={{
                        color: entry.actualQuantityWasted > 0 ? '#fda4af' : 'inherit',
                        fontWeight: entry.actualQuantityWasted > 0 ? 800 : 400
                      }}>
                        {entry.actualQuantityWasted}
                      </span>
                    </td>
                    <td>
                      <span className={`disposition-chip ${entry.dispositionCode}`}>
                        {entry.dispositionCode.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td style={{
                      textAlign: 'right',
                      fontWeight: 700,
                      fontSize: '0.95rem',
                      color: entry.wasteEstimatedCost > 0 ? '#fda4af' : '#34d399'
                    }}>
                      ${Number(entry.wasteEstimatedCost || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==============================================================================
          MODAL 1: NEW PREFERENCE CARD DRAFT
          ============================================================================== */}
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

      {/* ==============================================================================
          MODAL 2: ADD ITEM TO BOM
          ============================================================================== */}
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
                <label>Laterality Modifier</label>
                <select
                  value={newItemForm.lateralityModifier}
                  onChange={(e) => setNewItemForm(prev => ({ ...prev, lateralityModifier: e.target.value }))}
                >
                  <option value="STANDARD">Standard (Any Laterality)</option>
                  <option value="LEFT_ONLY">Left Side Only</option>
                  <option value="RIGHT_ONLY">Right Side Only</option>
                  <option value="BILATERAL_DOUBLE">Bilateral Double Setup</option>
                </select>
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

      {/* ==============================================================================
          MODAL 3: PRE-APPROVED SUBSTITUTION
          ============================================================================== */}
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
              Base Staged Item: <strong style={{ color: '#f8fafc' }}>{selectedItemForSub.customItemName}</strong>
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
