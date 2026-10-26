import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Layers, Search, Plus, X, ChevronRight,
  Tag, CheckCircle2, AlertCircle, Filter,
  Activity, RefreshCw
} from 'lucide-react';
import {
  implantService,
  DURATION_METADATA,
  DURATION_CLASSIFICATIONS,
  COMPONENT_TYPES
} from '../lib/implantService.js';
import { rbacService } from '../lib/rbacService.js';
import './ImplantTaxonomyExplorer.css';

const SPECIALTY_TABS = [
  'All',
  'Orthopedics',
  'Spine',
  'Ophthalmology',
  'Pain Management',
  'Plastic Surgery',
  'Podiatry'
];

export default function ImplantTaxonomyExplorer({ isOpen = true, onClose = null }) {
  const [selectedSpecialty, setSelectedSpecialty] = useState('All');
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [components, setComponents] = useState([]);
  const [selectedComponent, setSelectedComponent] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [durationFilter, setDurationFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionMessage, setActionMessage] = useState(null);

  // New Custom Component Form State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCompData, setNewCompData] = useState({
    code: '',
    name: '',
    component_type: 'structural',
    default_duration: 'permanent',
    description: '',
    requires_serial_tracking: false,
    requires_lot_tracking: true,
    allows_biological_tissue: false
  });

  const canManageCatalog = useMemo(() => {
    return rbacService?.hasPermission ? rbacService.hasPermission('implants.manage_catalog') : true;
  }, []);

  // Load Categories on specialty change
  const loadCategories = useCallback(async () => {
    setLoading(true);
    try {
      const spec = selectedSpecialty === 'All' ? null : selectedSpecialty;
      const data = await implantService.getCategories(spec);
      setCategories(data || []);
      if (data && data.length > 0) {
        setSelectedCategory(prev => {
          if (prev && data.some(c => c.id === prev.id)) {
            return prev;
          }
          return data[0];
        });
      } else {
        setSelectedCategory(null);
        setComponents([]);
      }
    } catch (err) {
      console.error('Failed to load implant categories:', err);
      setActionMessage({ type: 'error', text: err.message || 'Failed to load categories.' });
    } finally {
      setLoading(false);
    }
  }, [selectedSpecialty]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  // Load Components when selected category changes
  const loadComponents = useCallback(async () => {
    if (!selectedCategory) {
      setComponents([]);
      setSelectedComponent(null);
      return;
    }
    try {
      const data = await implantService.getComponentsByCategory(selectedCategory.id);
      setComponents(data || []);
      if (data && data.length > 0) {
        setSelectedComponent(data[0]);
      } else {
        setSelectedComponent(null);
      }
    } catch (err) {
      console.error('Failed to load components:', err);
    }
  }, [selectedCategory]);

  useEffect(() => {
    loadComponents();
  }, [loadComponents]);

  // Filtered components based on search and duration
  const filteredComponents = useMemo(() => {
    return components.filter(comp => {
      const matchesSearch = !searchQuery ||
        comp.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        comp.code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        comp.description?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesDuration = durationFilter === 'ALL' || comp.default_duration === durationFilter;

      return matchesSearch && matchesDuration;
    });
  }, [components, searchQuery, durationFilter]);

  // Handle Create Custom Component
  const handleCreateComponent = async (e) => {
    e.preventDefault();
    if (!selectedCategory) return;
    setIsSubmitting(true);
    setActionMessage(null);

    try {
      await implantService.saveComponent({
        ...newCompData,
        category_id: selectedCategory.id
      });
      setShowAddModal(false);
      setNewCompData({
        code: '',
        name: '',
        component_type: 'structural',
        default_duration: 'permanent',
        description: '',
        requires_serial_tracking: false,
        requires_lot_tracking: true,
        allows_biological_tissue: false
      });
      setActionMessage({ type: 'success', text: `Component "${newCompData.name}" created successfully.` });
      await loadComponents();
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message || 'Failed to create component.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Safe Deactivation
  const handleDeactivateComponent = async (comp) => {
    if (!window.confirm(`Are you sure you want to deactivate component "${comp.name}"?`)) return;
    try {
      await implantService.deactivateComponent(comp.id);
      setActionMessage({ type: 'success', text: `Component "${comp.name}" deactivated.` });
      await loadComponents();
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message || 'Deactivation failed.' });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="implant-explorer-modal" role="dialog" aria-modal="true">
      <div className="implant-explorer-container">
        {/* Header */}
        <header className="implant-explorer-header">
          <div className="implant-header-title-group">
            <div className="implant-header-icon">
              <Layers size={22} />
            </div>
            <div>
              <h2 className="implant-header-title">Implant Taxonomy & Component Master</h2>
              <p className="implant-header-subtitle">
                Deterministic medical device hierarchy, clinical component types, and FDA/ISO duration governance
              </p>
            </div>
          </div>
          <div className="implant-header-actions">
            {canManageCatalog && (
              <button
                type="button"
                className="btn-add-component"
                onClick={() => setShowAddModal(true)}
                disabled={!selectedCategory}
              >
                <Plus size={16} />
                <span>Add Component</span>
              </button>
            )}
            {onClose && (
              <button
                type="button"
                className="btn-close-modal"
                onClick={onClose}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            )}
          </div>
        </header>

        {/* Surgical Specialty Tabs */}
        <div className="implant-specialty-bar">
          {SPECIALTY_TABS.map(spec => (
            <button
              key={spec}
              type="button"
              className={`specialty-tab ${selectedSpecialty === spec ? 'active' : ''}`}
              onClick={() => setSelectedSpecialty(spec)}
            >
              {spec}
            </button>
          ))}
        </div>

        {/* Secondary Filter & Search Bar */}
        <div className="implant-controls-bar">
          <div className="implant-search-box">
            <Search size={16} className="implant-search-icon" />
            <input
              type="text"
              className="implant-search-input"
              placeholder="Search components by code, name, or role..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="implant-filters-group">
            <Filter size={16} color="var(--text-secondary)" />
            <select
              className="implant-select"
              value={durationFilter}
              onChange={(e) => setDurationFilter(e.target.value)}
            >
              <option value="ALL">All Durations</option>
              <option value={DURATION_CLASSIFICATIONS.PERMANENT}>Permanent (&gt;30 Days)</option>
              <option value={DURATION_CLASSIFICATIONS.TEMPORARY}>Temporary (&le;30 Days)</option>
              <option value={DURATION_CLASSIFICATIONS.RESORBABLE}>Synthetic Resorbable</option>
              <option value={DURATION_CLASSIFICATIONS.BIOABSORBABLE}>Biologic Bioabsorbable</option>
              <option value={DURATION_CLASSIFICATIONS.EXCHANGEABLE}>Exchangeable / Modular</option>
            </select>
            <button
              type="button"
              className="btn-close-modal"
              onClick={loadCategories}
              title="Refresh Catalog"
            >
              <RefreshCw size={16} />
            </button>
          </div>
        </div>

        {/* Action / Error Banner */}
        {actionMessage && (
          <div style={{
            padding: '0.65rem 1.5rem',
            background: actionMessage.type === 'error' ? '#fee2e2' : '#dcfce7',
            color: actionMessage.type === 'error' ? '#991b1b' : '#166534',
            fontSize: '0.85rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            borderBottom: '1px solid var(--border-color)'
          }}>
            {actionMessage.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
            <span>{actionMessage.text}</span>
            <button
              type="button"
              style={{ marginLeft: 'auto', background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit' }}
              onClick={() => setActionMessage(null)}
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Main 3-Pane Explorer Layout */}
        <div className={`implant-main-content ${!selectedComponent ? 'no-inspector' : ''}`}>
          {/* Left Pane: Categories Tree */}
          <div className="implant-categories-pane">
            <div className="pane-section-header">
              Surgical Categories ({categories.length})
            </div>
            {loading ? (
              <div className="empty-state-card">
                <RefreshCw size={24} className="spin" />
                <span>Loading categories...</span>
              </div>
            ) : categories.length === 0 ? (
              <div className="empty-state-card">
                <Tag size={28} className="empty-icon" />
                <span>No categories found for {selectedSpecialty}</span>
              </div>
            ) : (
              categories.map(cat => (
                <div
                  key={cat.id}
                  className={`category-list-item ${selectedCategory?.id === cat.id ? 'selected' : ''}`}
                  onClick={() => setSelectedCategory(cat)}
                >
                  <div className="category-item-info">
                    <span className="category-item-name">{cat.name}</span>
                    <span className="category-item-meta">
                      {cat.code} • {cat.anatomy_region || cat.specialty}
                    </span>
                  </div>
                  <ChevronRight size={16} color="var(--text-secondary)" />
                </div>
              ))
            )}
          </div>

          {/* Middle Pane: Components Specifications Table */}
          <div className="implant-components-pane">
            <div className="components-table-header">
              <span>Code</span>
              <span>Clinical Name</span>
              <span>Role</span>
              <span>Duration</span>
              <span>Tracking</span>
              <span>Action</span>
            </div>

            {filteredComponents.length === 0 ? (
              <div className="empty-state-card">
                <Activity size={32} className="empty-icon" />
                <span>No components match current criteria</span>
              </div>
            ) : (
              filteredComponents.map(comp => {
                const durMeta = DURATION_METADATA[comp.default_duration] || DURATION_METADATA.permanent;
                return (
                  <div
                    key={comp.id || comp.code}
                    className={`component-row ${selectedComponent?.code === comp.code ? 'selected' : ''}`}
                    onClick={() => setSelectedComponent(comp)}
                  >
                    <span className="component-code">{comp.code}</span>
                    <span className="component-name-cell">{comp.name}</span>
                    <span>
                      <span className="component-type-tag">{comp.component_type}</span>
                    </span>
                    <span>
                      <span className={`badge-duration ${durMeta.badgeClass}`}>
                        {comp.default_duration}
                      </span>
                    </span>
                    <div className="tracking-badges-cell">
                      {comp.requires_lot_tracking && <span className="mini-badge mini-badge-lot" title="Lot Tracking Required">LOT</span>}
                      {comp.requires_serial_tracking && <span className="mini-badge mini-badge-serial" title="Serial Tracking Required">SER</span>}
                      {comp.allows_biological_tissue && <span className="mini-badge mini-badge-tissue" title="Biologic Tissue Tracking">TISSUE</span>}
                    </div>
                    <div>
                      {canManageCatalog && comp.is_active && (
                        <button
                          type="button"
                          className="btn-close-modal"
                          style={{ width: '28px', height: '28px' }}
                          title="Deactivate Component"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeactivateComponent(comp);
                          }}
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Right Pane: Component Inspector */}
          {selectedComponent && (
            <aside className="implant-inspector-pane">
              <div className="inspector-header">
                <h3 className="inspector-title">Component Specification</h3>
                <span className="component-code">{selectedComponent.code}</span>
              </div>

              <div className="inspector-body">
                <div className="inspector-card">
                  <span className="inspector-card-title">Clinical Role & Anatomy</span>
                  <div className="inspector-field">
                    <span className="inspector-label">Name</span>
                    <span className="inspector-value">{selectedComponent.name}</span>
                  </div>
                  <div className="inspector-field">
                    <span className="inspector-label">Component Type</span>
                    <span className="inspector-value" style={{ textTransform: 'capitalize' }}>
                      {selectedComponent.component_type}
                    </span>
                  </div>
                  <div className="inspector-field">
                    <span className="inspector-label">Category</span>
                    <span className="inspector-value">{selectedCategory?.name}</span>
                  </div>
                  <div className="inspector-field">
                    <span className="inspector-label">Specialty</span>
                    <span className="inspector-value">{selectedCategory?.specialty}</span>
                  </div>
                </div>

                <div className="inspector-card">
                  <span className="inspector-card-title">Duration & Regulatory Governance</span>
                  <div className="inspector-field">
                    <span className="inspector-label">Classification</span>
                    <span className="inspector-value" style={{ textTransform: 'capitalize' }}>
                      {selectedComponent.default_duration}
                    </span>
                  </div>
                  <div className="inspector-field">
                    <span className="inspector-label">Regulatory Standard</span>
                    <span className="inspector-value" style={{ fontSize: '0.75rem' }}>
                      {DURATION_METADATA[selectedComponent.default_duration]?.regulatoryRef || 'FDA 21 CFR § 812.3'}
                    </span>
                  </div>
                  <div className="inspector-field">
                    <span className="inspector-label">FDA Mandate</span>
                    <span className="inspector-value">
                      {DURATION_METADATA[selectedComponent.default_duration]?.requiresUdi ? 'UDI Required' : 'Standard Label'}
                    </span>
                  </div>
                </div>

                <div className="inspector-card">
                  <span className="inspector-card-title">Clinical Traceability Invariants</span>
                  <div className="inspector-field">
                    <span className="inspector-label">Lot Number Tracking</span>
                    <span className="inspector-value">{selectedComponent.requires_lot_tracking ? 'Enforced' : 'Optional'}</span>
                  </div>
                  <div className="inspector-field">
                    <span className="inspector-label">Serial Number Tracking</span>
                    <span className="inspector-value">{selectedComponent.requires_serial_tracking ? 'Enforced' : 'Optional'}</span>
                  </div>
                  <div className="inspector-field">
                    <span className="inspector-label">Biological Tissue Matrix</span>
                    <span className="inspector-value">{selectedComponent.allows_biological_tissue ? 'Yes (Allograft/Xenograft)' : 'No'}</span>
                  </div>
                </div>

                {selectedComponent.description && (
                  <div className="inspector-card">
                    <span className="inspector-card-title">Clinical Guidance</span>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      {selectedComponent.description}
                    </p>
                  </div>
                )}
              </div>
            </aside>
          )}
        </div>

        {/* Modal: Add Custom Component */}
        {showAddModal && (
          <div className="implant-form-overlay">
            <form className="implant-form-dialog" onSubmit={handleCreateComponent}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>
                  Add Custom Component to {selectedCategory?.name}
                </h3>
                <button
                  type="button"
                  className="btn-close-modal"
                  onClick={() => setShowAddModal(false)}
                >
                  <X size={16} />
                </button>
              </div>

              <div className="form-group">
                <label>Component Code *</label>
                <input
                  type="text"
                  className="form-input"
                  required
                  placeholder="e.g. HIP_CUSTOM_STEM"
                  value={newCompData.code}
                  onChange={(e) => setNewCompData({ ...newCompData, code: e.target.value.toUpperCase() })}
                />
              </div>

              <div className="form-group">
                <label>Clinical Display Name *</label>
                <input
                  type="text"
                  className="form-input"
                  required
                  placeholder="e.g. Customized Lateral Hip Stem"
                  value={newCompData.name}
                  onChange={(e) => setNewCompData({ ...newCompData, name: e.target.value })}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="form-group">
                  <label>Component Type</label>
                  <select
                    className="form-select"
                    value={newCompData.component_type}
                    onChange={(e) => {
                      const val = e.target.value;
                      const isBio = val === 'biologic';
                      setNewCompData({
                        ...newCompData,
                        component_type: val,
                        default_duration: isBio ? 'bioabsorbable' : newCompData.default_duration,
                        allows_biological_tissue: isBio ? true : newCompData.allows_biological_tissue
                      });
                    }}
                  >
                    {COMPONENT_TYPES.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Duration Classification</label>
                  <select
                    className="form-select"
                    value={newCompData.default_duration}
                    onChange={(e) => setNewCompData({ ...newCompData, default_duration: e.target.value })}
                  >
                    {Object.values(DURATION_CLASSIFICATIONS).map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Clinical Description</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Operational notes or indications"
                  value={newCompData.description}
                  onChange={(e) => setNewCompData({ ...newCompData, description: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.25rem' }}>
                <label className="form-checkbox-row">
                  <input
                    type="checkbox"
                    checked={newCompData.requires_lot_tracking}
                    onChange={(e) => setNewCompData({ ...newCompData, requires_lot_tracking: e.target.checked })}
                  />
                  <span>Requires Lot Number Tracking</span>
                </label>
                <label className="form-checkbox-row">
                  <input
                    type="checkbox"
                    checked={newCompData.requires_serial_tracking}
                    onChange={(e) => setNewCompData({ ...newCompData, requires_serial_tracking: e.target.checked })}
                  />
                  <span>Requires Serial / UDI Tracking</span>
                </label>
                <label className="form-checkbox-row">
                  <input
                    type="checkbox"
                    checked={newCompData.allows_biological_tissue}
                    onChange={(e) => setNewCompData({ ...newCompData, allows_biological_tissue: e.target.checked })}
                  />
                  <span>Biological Tissue (Requires tissue graft protocol)</span>
                </label>
              </div>

              <div className="form-actions-row">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowAddModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Saving...' : 'Save Component'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
