import React, { useState, useEffect, useMemo } from 'react';
import {
  Layers,
  Search,
  CheckCircle2,
  AlertTriangle,
  Info,
  X,
  Plus,
  GitFork,
  ArrowRight,
  BookOpen,
  Filter
} from 'lucide-react';
import { cptImplantMappingService, CPT_CANONICAL_PROCEDURES } from '../lib/cptImplantMappingService.js';
import './CptImplantMappingMatrix.css';

export default function CptImplantMappingMatrix({
  activeFacility = null,
  userPermissions = ['implants.view_catalog', 'implants.manage_catalog']
}) {
  const [mappings, setMappings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSpecialty, setSelectedSpecialty] = useState('All');
  const [selectedRequirement, setSelectedRequirement] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMapping, setSelectedMapping] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [modalFormData, setModalFormData] = useState({
    cpt_code: '',
    procedure_name: '',
    specialty: 'Orthopedics',
    component_code: '',
    component_name: '',
    requirement_type: 'required',
    quantity_calculation_method: 'fixed',
    expected_quantity_min: 1,
    expected_quantity_max: 1,
    default_quantity: 1,
    clinical_evidence_citation: 'Institutional Clinical Consensus'
  });

  const canManageCatalog = userPermissions.includes('implants.manage_catalog') || userPermissions.includes('admin');

  // Load mappings on mount and when filter criteria change
  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      setLoading(true);
      try {
        const data = await cptImplantMappingService.getAllMappings({
          specialty: selectedSpecialty,
          requirementType: selectedRequirement,
          search: searchQuery,
          facilityId: activeFacility?.id
        });
        if (isMounted) {
          setMappings(data);
          if (data.length > 0) {
            setSelectedMapping(prev => prev || data[0]);
          }
        }
      } catch (err) {
        console.error('Failed to load CPT implant mappings:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadData();
    return () => { isMounted = false; };
  }, [selectedSpecialty, selectedRequirement, searchQuery, activeFacility]);

  // Derived metrics
  const metrics = useMemo(() => {
    const total = mappings.length;
    const requiredCount = mappings.filter(m => m.requirement_type === 'required').length;
    const verifiedCount = mappings.filter(m => m.review_status === 'verified').length;
    const specialties = new Set(mappings.map(m => m.specialty)).size;
    return { total, requiredCount, verifiedCount, specialties };
  }, [mappings]);

  const handleRowClick = (item) => {
    setSelectedMapping(item);
    setIsDrawerOpen(true);
  };

  const handleOpenAddModal = () => {
    setModalFormData({
      cpt_code: '',
      procedure_name: '',
      specialty: 'Orthopedics',
      component_code: '',
      component_name: '',
      requirement_type: 'required',
      quantity_calculation_method: 'fixed',
      expected_quantity_min: 1,
      expected_quantity_max: 1,
      default_quantity: 1,
      clinical_evidence_citation: 'Facility Clinical Governance Review'
    });
    setIsAddModalOpen(true);
  };

  const handleSaveModal = async (e) => {
    e.preventDefault();
    if (!modalFormData.cpt_code || !modalFormData.component_name) {
      alert('CPT Code and Component Name are mandatory.');
      return;
    }

    try {
      const saved = await cptImplantMappingService.saveMapping({
        ...modalFormData,
        facility_id: activeFacility?.id || 'local-override-facility',
        component_code: modalFormData.component_code.toUpperCase(),
        is_active: true
      });
      setMappings(prev => [saved, ...prev]);
      setSelectedMapping(saved);
      setIsAddModalOpen(false);
    } catch (err) {
      alert(`Failed to save mapping: ${err.message}`);
    }
  };

  const handleDeactivate = async (item) => {
    if (!window.confirm(`Deactivate mapping for CPT ${item.cpt_code} -> ${item.component_name}?`)) {
      return;
    }
    await cptImplantMappingService.deactivateMapping(item.id);
    setMappings(prev => prev.filter(m => m.id !== item.id));
    if (selectedMapping?.id === item.id) {
      setSelectedMapping(null);
      setIsDrawerOpen(false);
    }
  };

  return (
    <div className="cpt-implant-matrix-page">
      {/* 1. Construct Architecture Action Bar */}
      <div className="matrix-page-header">
        <div className="matrix-header-info">
          <div className="matrix-title-badge">
            <GitFork size={14} className="matrix-badge-icon" />
            <span>MULTI-COMPONENT PROCEDURAL CONSTRUCTS</span>
          </div>
          <p className="matrix-subtitle">
            <strong>Why multiple entries per CPT?</strong> Surgical procedures (e.g. Total Hip 27130, Total Knee 27447) require a multi-part implant construct. Each row specifies a required or conditional component necessary for full surgical assembly and pre-bill charge completeness.
          </p>
        </div>

        <div className="matrix-header-actions">
          {canManageCatalog && (
            <button className="btn-add-mapping" onClick={handleOpenAddModal}>
              <Plus size={16} />
              <span>Add Facility Mapping</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Key Metrics Bar */}
      <div className="matrix-metrics-grid">
        <div className="matrix-metric-card">
          <span className="metric-label">Total CPT Mappings</span>
          <span className="metric-val">{metrics.total}</span>
          <span className="metric-sub">Active relational pairs</span>
        </div>
        <div className="matrix-metric-card">
          <span className="metric-label">Mandatory Constructs</span>
          <span className="metric-val text-cyan">{metrics.requiredCount}</span>
          <span className="metric-sub">Pre-bill completeness blockers</span>
        </div>
        <div className="matrix-metric-card">
          <span className="metric-label">Verified Guideline Rate</span>
          <span className="metric-val text-emerald">
            {metrics.total > 0 ? Math.round((metrics.verifiedCount / metrics.total) * 100) : 100}%
          </span>
          <span className="metric-sub">AAOS / NASS / CMS citations</span>
        </div>
        <div className="matrix-metric-card">
          <span className="metric-label">Active Specialties</span>
          <span className="metric-val">{metrics.specialties || 6}</span>
          <span className="metric-sub">Surgical disciplines</span>
        </div>
      </div>

      {/* 3. Filter Bar */}
      <div className="matrix-filter-bar">
        <div className="search-box-wrapper">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            className="matrix-search-input"
            placeholder="Search CPT (e.g. 27130), procedure, or implant component..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="btn-clear-search" onClick={() => setSearchQuery('')}>
              <X size={14} />
            </button>
          )}
        </div>

        <div className="filter-group">
          <Filter size={15} className="filter-icon" />
          <span className="filter-label">Specialty:</span>
          {['All', 'Orthopedics', 'Spine', 'Ophthalmology', 'Pain Management', 'Plastic Surgery'].map(spec => (
            <button
              key={spec}
              className={`filter-pill ${selectedSpecialty === spec ? 'active' : ''}`}
              onClick={() => setSelectedSpecialty(spec)}
            >
              {spec}
            </button>
          ))}
        </div>

        <div className="filter-group">
          <span className="filter-label">Requirement:</span>
          {[
            { id: 'all', label: 'All' },
            { id: 'required', label: 'Required' },
            { id: 'optional', label: 'Optional' },
            { id: 'conditional', label: 'Conditional' }
          ].map(req => (
            <button
              key={req.id}
              className={`filter-pill ${selectedRequirement === req.id ? 'active' : ''}`}
              onClick={() => setSelectedRequirement(req.id)}
            >
              {req.label}
            </button>
          ))}
        </div>
      </div>

      {/* 4. Main Body: Matrix Table + Collapsible Inspector */}
      <div className="matrix-workspace-container">
        <div className={`matrix-table-container ${isDrawerOpen ? 'drawer-open' : ''}`}>
          {loading ? (
            <div className="matrix-loading-state">
              <div className="matrix-spinner" />
              <span>Loading CPT construct mappings...</span>
            </div>
          ) : mappings.length === 0 ? (
            <div className="matrix-empty-state">
              <Layers size={36} className="empty-icon" />
              <h4>No CPT Mappings Found</h4>
              <p>No active mappings match the selected specialty, requirement, and search filters.</p>
            </div>
          ) : (
            <table className="matrix-table">
              <thead>
                <tr>
                  <th style={{ width: '100px' }}>CPT Code</th>
                  <th style={{ width: '220px' }}>Procedure Description</th>
                  <th>Clinical Component</th>
                  <th style={{ width: '130px' }}>Requirement</th>
                  <th style={{ width: '110px' }}>Expected Qty</th>
                  <th style={{ width: '110px' }}>Calculation</th>
                  <th style={{ width: '100px' }}>Scope</th>
                  <th style={{ width: '70px', textAlign: 'center' }}>Details</th>
                </tr>
              </thead>
              <tbody>
                {mappings.map(item => {
                  const isSelected = selectedMapping?.id === item.id;
                  return (
                    <tr
                      key={item.id}
                      className={`matrix-row ${isSelected ? 'row-selected' : ''}`}
                      onClick={() => handleRowClick(item)}
                    >
                      <td>
                        <span className="cpt-code-pill">{item.cpt_code}</span>
                      </td>
                      <td>
                        <div className="procedure-desc-cell">
                          <span className="procedure-name">
                            {item.procedure_name || CPT_CANONICAL_PROCEDURES[item.cpt_code] || `Procedure ${item.cpt_code}`}
                          </span>
                          <span className="procedure-spec">{item.specialty} • Construct Component</span>
                        </div>
                      </td>
                      <td>
                        <div className="component-desc-cell">
                          <span className="comp-name">{item.component_name}</span>
                          <span className="comp-code">{item.component_code}</span>
                        </div>
                      </td>
                      <td>
                        <span className={`requirement-badge badge-${item.requirement_type}`}>
                          {item.requirement_type.toUpperCase()}
                        </span>
                      </td>
                      <td>
                        <span className="qty-value">
                          {item.expected_quantity_min === item.expected_quantity_max
                            ? item.default_quantity
                            : `${item.expected_quantity_min} - ${item.expected_quantity_max}`}
                        </span>
                      </td>
                      <td>
                        <span className="calc-method-text">{item.quantity_calculation_method}</span>
                      </td>
                      <td>
                        <span className={`scope-badge ${item.is_facility_override ? 'scope-facility' : 'scope-global'}`}>
                          {item.is_facility_override ? 'Facility' : 'Global'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          className="btn-inspect-row"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRowClick(item);
                          }}
                          title="Inspect Mapping Evidence"
                        >
                          <ArrowRight size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* 5. Collapsible Inspector Drawer */}
        {isDrawerOpen && selectedMapping && (
          <aside className="matrix-inspector-drawer">
            <div className="drawer-header">
              <div className="drawer-header-left">
                <BookOpen size={17} className="drawer-icon" />
                <h3 className="drawer-title">Construct Inspector</h3>
              </div>
              <button className="btn-close-drawer" onClick={() => setIsDrawerOpen(false)}>
                <X size={16} />
              </button>
            </div>

            <div className="drawer-content">
              {/* Primary Identity Card */}
              <div className="drawer-card identity-card">
                <div className="identity-cpt-header">
                  <span className="drawer-cpt-badge">{selectedMapping.cpt_code}</span>
                  <span className={`requirement-badge badge-${selectedMapping.requirement_type}`}>
                    {selectedMapping.requirement_type.toUpperCase()}
                  </span>
                </div>
                <h4 className="drawer-procedure-name">
                  {selectedMapping.procedure_name || `Procedure ${selectedMapping.cpt_code}`}
                </h4>
                <div className="drawer-divider" />
                <div className="drawer-meta-item">
                  <span className="meta-label">Target Component:</span>
                  <span className="meta-val font-semibold">{selectedMapping.component_name}</span>
                </div>
                <div className="drawer-meta-item">
                  <span className="meta-label">Component Code:</span>
                  <span className="meta-val font-mono text-cyan">{selectedMapping.component_code}</span>
                </div>
                <div className="drawer-meta-item">
                  <span className="meta-label">Category Anatomy:</span>
                  <span className="meta-val">{selectedMapping.category_name || selectedMapping.specialty}</span>
                </div>
              </div>

              {/* Requirement & Quantity Rules */}
              <div className="drawer-card">
                <h5 className="card-heading">Quantity & Calculation Governance</h5>
                <div className="drawer-meta-item">
                  <span className="meta-label">Calculation Method:</span>
                  <span className="meta-val font-medium">{selectedMapping.quantity_calculation_method}</span>
                </div>
                <div className="drawer-meta-item">
                  <span className="meta-label">Expected Range:</span>
                  <span className="meta-val">
                    [{selectedMapping.expected_quantity_min} min — {selectedMapping.expected_quantity_max} max]
                  </span>
                </div>
                <div className="drawer-meta-item">
                  <span className="meta-label">Default Quantity:</span>
                  <span className="meta-val font-semibold text-emerald">{selectedMapping.default_quantity} unit(s)</span>
                </div>
                {selectedMapping.condition_expression && (
                  <div className="condition-alert-box">
                    <AlertTriangle size={15} className="condition-icon" />
                    <div>
                      <span className="condition-label">Conditional Trigger:</span>
                      <p className="condition-text">{selectedMapping.condition_expression}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Evidence & Clinical Governance */}
              <div className="drawer-card">
                <h5 className="card-heading">Authoritative Evidence & Confidence</h5>
                <div className="confidence-meter-container">
                  <div className="meter-label-row">
                    <span>Clinical Confidence</span>
                    <span className="confidence-pct">
                      {Math.round(selectedMapping.confidence_score * 100)}%
                    </span>
                  </div>
                  <div className="meter-track">
                    <div
                      className="meter-fill"
                      style={{ width: `${selectedMapping.confidence_score * 100}%` }}
                    />
                  </div>
                </div>

                <div className="drawer-meta-item" style={{ marginTop: '12px' }}>
                  <span className="meta-label">Mapping Source:</span>
                  <span className="meta-val">{selectedMapping.mapping_source}</span>
                </div>
                <div className="drawer-meta-item">
                  <span className="meta-label">Review Status:</span>
                  <span className="status-indicator-tag">
                    <CheckCircle2 size={13} className="text-emerald" />
                    <span>{selectedMapping.review_status}</span>
                  </span>
                </div>
                <div className="citation-box">
                  <span className="citation-label">Evidence Citation:</span>
                  <p className="citation-text">{selectedMapping.clinical_evidence_citation}</p>
                </div>
              </div>

              {/* Pre-Bill Completeness Behavior Explanation */}
              <div className="drawer-card completeness-info-card">
                <div className="info-title-row">
                  <Info size={15} className="info-icon text-cyan" />
                  <span className="info-title">Pre-Bill Completeness Behavior</span>
                </div>
                <p className="info-description">
                  {selectedMapping.requirement_type === 'required'
                    ? 'Mandatory component construct. If omitted from case_devices during pre-bill scrubbing, engine generates BLOCKER DEV-003 and halts claim release.'
                    : selectedMapping.requirement_type === 'conditional'
                    ? 'Evaluated conditionally. Generates a warning if matching operative criteria are present without documented hardware.'
                    : 'Optional ancillary hardware. Omission does not block billing, but logged quantities must fall within expected bounds.'}
                </p>
              </div>

              {/* Action Buttons */}
              {canManageCatalog && selectedMapping.is_facility_override && (
                <div className="drawer-actions">
                  <button
                    className="btn-deactivate"
                    onClick={() => handleDeactivate(selectedMapping)}
                  >
                    Deactivate Facility Override
                  </button>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* 6. Add Custom Facility Mapping Modal */}
      {isAddModalOpen && (
        <div className="modal-overlay">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3 className="modal-title">Author Facility-Specific CPT Mapping</h3>
              <button className="btn-close-modal" onClick={() => setIsAddModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveModal} className="modal-form">
              <div className="form-row-2">
                <div className="form-group">
                  <label>CPT Procedure Code *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 27130"
                    value={modalFormData.cpt_code}
                    onChange={(e) => setModalFormData({ ...modalFormData, cpt_code: e.target.value.trim() })}
                  />
                </div>
                <div className="form-group">
                  <label>Procedure Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Total Hip Arthroplasty"
                    value={modalFormData.procedure_name}
                    onChange={(e) => setModalFormData({ ...modalFormData, procedure_name: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label>Component Code *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. HIP_SCREW"
                    value={modalFormData.component_code}
                    onChange={(e) => setModalFormData({ ...modalFormData, component_code: e.target.value.trim() })}
                  />
                </div>
                <div className="form-group">
                  <label>Component Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Acetabular Cancellous Screw"
                    value={modalFormData.component_name}
                    onChange={(e) => setModalFormData({ ...modalFormData, component_name: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-row-3">
                <div className="form-group">
                  <label>Requirement Type</label>
                  <select
                    value={modalFormData.requirement_type}
                    onChange={(e) => setModalFormData({ ...modalFormData, requirement_type: e.target.value })}
                  >
                    <option value="required">Required (Blocker)</option>
                    <option value="optional">Optional</option>
                    <option value="conditional">Conditional</option>
                    <option value="not_applicable">Not Applicable</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Calculation Method</label>
                  <select
                    value={modalFormData.quantity_calculation_method}
                    onChange={(e) => setModalFormData({ ...modalFormData, quantity_calculation_method: e.target.value })}
                  >
                    <option value="fixed">Fixed</option>
                    <option value="laterality_dependent">Laterality Dependent</option>
                    <option value="per_level">Per Level</option>
                    <option value="surgeon_discretion">Surgeon Discretion</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Default Quantity</label>
                  <input
                    type="number"
                    min="1"
                    value={modalFormData.default_quantity}
                    onChange={(e) => setModalFormData({
                      ...modalFormData,
                      default_quantity: parseInt(e.target.value, 10) || 1,
                      expected_quantity_max: Math.max(modalFormData.expected_quantity_max, parseInt(e.target.value, 10) || 1)
                    })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Clinical Evidence Citation</label>
                <textarea
                  rows="2"
                  value={modalFormData.clinical_evidence_citation}
                  onChange={(e) => setModalFormData({ ...modalFormData, clinical_evidence_citation: e.target.value })}
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={() => setIsAddModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-save">
                  Save Facility Mapping
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
