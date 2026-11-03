import React, { useState, useMemo } from 'react';
import {
  Layers,
  DollarSign,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Filter,
  Plus,
  Trash2,
  ShieldCheck,
  Calendar,
  Clock,
  Package,
  Activity,
  Box,
  FileText,
  Search,
  X,
  Sparkles,
  Info
} from 'lucide-react';
import {
  caseCostModelService,
  COST_CATEGORIES,
  COST_CATEGORY_CONFIG,
  DEFAULT_FACILITY_RATES
} from '../lib/caseCostModelService.js';
import './CaseCostModelView.css';

const SAMPLE_CASES = [
  {
    id: 101,
    patient: 'Marcus Vance',
    mrn: 'MRN-78491',
    procedure: 'Left Knee Arthroscopy & Meniscectomy',
    date: '2026-10-24',
    surgeon: 'Dr. Sarah Lin, MD',
    facility: 'ASC North Suite 2',
    payer: 'Blue Cross PPO'
  },
  {
    id: 102,
    patient: 'Eleanor Rigby',
    mrn: 'MRN-88210',
    procedure: 'Right Cataract Phacoemulsification w/ IOL',
    date: '2026-10-25',
    surgeon: 'Dr. James Thorne, MD',
    facility: 'ASC Eye Pavilion',
    payer: 'Medicare Part B'
  },
  {
    id: 103,
    patient: 'David Kowalski',
    mrn: 'MRN-64022',
    procedure: 'Open Reduction Internal Fixation (ORIF) Ankle',
    date: '2026-10-26',
    surgeon: 'Dr. Robert Chen, MD',
    facility: 'ASC Main Suite 1',
    payer: 'Aetna HMO'
  }
];

export default function CaseCostModelView() {
  const [selectedCaseId, setSelectedCaseId] = useState(101);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showTrayCatalog, setShowTrayCatalog] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Form State for Adding Item
  const [newItemCategory, setNewItemCategory] = useState(COST_CATEGORIES.SUPPLY_COST);
  const [newItemCode, setNewItemCode] = useState('');
  const [newItemDesc, setNewItemDesc] = useState('');
  const [newItemQty, setNewItemQty] = useState('1');
  const [newItemUnitCost, setNewItemUnitCost] = useState('');
  const [newItemInvoice, setNewItemInvoice] = useState('');
  const [newItemCompleteness, setNewItemCompleteness] = useState('VERIFIED');

  const currentCase = useMemo(() => {
    return SAMPLE_CASES.find(c => c.id === selectedCaseId) || SAMPLE_CASES[0];
  }, [selectedCaseId]);

  // Retrieve cost items and calculated breakdown
  const costItems = useMemo(() => {
    return caseCostModelService.getCostItems(currentCase.id);
  }, [currentCase.id, refreshTrigger]);

  const costBreakdown = useMemo(() => {
    return caseCostModelService.getCaseCostBreakdown(currentCase.id);
  }, [currentCase.id, refreshTrigger]);

  const trayCatalog = useMemo(() => {
    return caseCostModelService.getTrayCatalog();
  }, []);

  // Filter cost items based on category pill and search query
  const filteredItems = useMemo(() => {
    return costItems.filter(item => {
      const matchesCategory = activeCategoryFilter === 'ALL' || item.cost_category === activeCategoryFilter;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q ||
        item.item_description.toLowerCase().includes(q) ||
        (item.item_code && item.item_code.toLowerCase().includes(q)) ||
        (item.vendor_invoice_number && item.vendor_invoice_number.toLowerCase().includes(q)) ||
        item.source_module.toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [costItems, activeCategoryFilter, searchQuery]);

  const handleAddCostItem = (e) => {
    e.preventDefault();
    setErrorMessage('');
    try {
      const qty = parseFloat(newItemQty);
      const unitCost = parseFloat(newItemUnitCost);

      if (isNaN(qty) || qty <= 0) {
        throw new Error('Please enter a valid quantity greater than 0.');
      }
      if (isNaN(unitCost) || unitCost < 0) {
        throw new Error('Please enter a valid unit cost ($0.00 or greater).');
      }
      if (!newItemDesc.trim()) {
        throw new Error('Item description is required.');
      }

      caseCostModelService.addCostItem({
        surgeryId: currentCase.id,
        costCategory: newItemCategory,
        itemCode: newItemCode.trim(),
        itemDescription: newItemDesc.trim(),
        quantity: qty,
        unitCost: unitCost,
        vendorInvoiceNumber: newItemInvoice.trim() || null,
        completenessFlag: newItemCompleteness
      });

      setSuccessMessage(`Direct cost item successfully added to Case #${currentCase.id}`);
      setShowAddModal(false);
      setRefreshTrigger(prev => prev + 1);

      // Reset form
      setNewItemCode('');
      setNewItemDesc('');
      setNewItemQty('1');
      setNewItemUnitCost('');
      setNewItemInvoice('');
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (err) {
      setErrorMessage(err.message || 'Failed to add cost item.');
    }
  };

  const handleRemoveItem = (itemId, description) => {
    if (window.confirm(`Are you sure you want to remove "${description}" from this case?`)) {
      caseCostModelService.removeCostItem(currentCase.id, itemId);
      setRefreshTrigger(prev => prev + 1);
      setSuccessMessage(`Cost line removed successfully.`);
      setTimeout(() => setSuccessMessage(''), 3000);
    }
  };

  // High-level grouping metrics
  const implantAndSupplyTotal = (costBreakdown.categoryBreakdown[COST_CATEGORIES.IMPLANT_COST] || 0) +
    (costBreakdown.categoryBreakdown[COST_CATEGORIES.SUPPLY_COST] || 0) +
    (costBreakdown.categoryBreakdown[COST_CATEGORIES.PHARMACY_COST] || 0);

  const clinicalLaborAndRoomTotal = (costBreakdown.categoryBreakdown[COST_CATEGORIES.LABOR_COST] || 0) +
    (costBreakdown.categoryBreakdown[COST_CATEGORIES.OR_TIME_COST] || 0);

  const pacuAndTrayTotal = (costBreakdown.categoryBreakdown[COST_CATEGORIES.PACU_TIME_COST] || 0) +
    (costBreakdown.categoryBreakdown[COST_CATEGORIES.REPROCESSING_COST] || 0) +
    (costBreakdown.categoryBreakdown[COST_CATEGORIES.EQUIPMENT_COST] || 0);

  return (
    <div className="case-cost-container">
      {/* Top Action & Case Selector Toolbar */}
      <div className="case-cost-topbar">
        <div className="topbar-left">
          <div className="case-selector-box">
            <span className="selector-label">Select Case:</span>
            <select
              className="case-dropdown"
              value={selectedCaseId}
              onChange={(e) => {
                setSelectedCaseId(Number(e.target.value));
                setActiveCategoryFilter('ALL');
                setSearchQuery('');
              }}
            >
              {SAMPLE_CASES.map(c => (
                <option key={c.id} value={c.id}>
                  Case #{c.id}: {c.patient} — {c.procedure}
                </option>
              ))}
            </select>
          </div>

          <div className="topbar-badges">
            <span className="badge-standard">
              <Clock size={13} />
              OR Rate: ${DEFAULT_FACILITY_RATES.orMinuteRate.toFixed(2)}/min
            </span>
            <span className="badge-standard">
              <Activity size={13} />
              PACU: ${DEFAULT_FACILITY_RATES.pacuMinuteRate.toFixed(2)}/min
            </span>
            <span className="badge-standard">
              <ShieldCheck size={13} />
              Burden: {DEFAULT_FACILITY_RATES.laborBurdenMultiplier}x
            </span>
          </div>
        </div>

        <div className="topbar-right">
          <button
            className={`action-btn btn-secondary ${showTrayCatalog ? 'active' : ''}`}
            onClick={() => setShowTrayCatalog(!showTrayCatalog)}
          >
            <Package size={15} />
            {showTrayCatalog ? 'Hide Tray Catalog' : 'CSSD Tray Catalog'}
          </button>
          <button
            className="action-btn btn-primary"
            onClick={() => {
              setErrorMessage('');
              setShowAddModal(true);
            }}
          >
            <Plus size={15} />
            + Add Cost Item
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

      {/* Case Meta Banner Card */}
      <div className="case-meta-card">
        <div className="meta-left">
          <div className="patient-avatar">
            {currentCase.patient.split(' ').map(n => n[0]).join('')}
          </div>
          <div className="patient-details">
            <div className="patient-title">
              <span className="patient-name">{currentCase.patient}</span>
              <span className="patient-mrn">{currentCase.mrn}</span>
              <span className="case-badge">Case #{currentCase.id}</span>
            </div>
            <div className="procedure-sub">
              <span className="proc-name">{currentCase.procedure}</span>
              <span className="meta-separator">•</span>
              <span className="proc-facility">{currentCase.facility}</span>
            </div>
          </div>
        </div>

        <div className="meta-right">
          <div className="meta-attribute">
            <span className="attr-label">Attending Surgeon</span>
            <span className="attr-value">{currentCase.surgeon}</span>
          </div>
          <div className="meta-attribute">
            <span className="attr-label">Primary Payer</span>
            <span className="attr-value text-sky">{currentCase.payer}</span>
          </div>
          <div className="meta-attribute">
            <span className="attr-label">Date of Service</span>
            <span className="attr-value">
              <Calendar size={13} className="inline mr-1 text-slate" />
              {currentCase.date}
            </span>
          </div>
          <div className="meta-attribute">
            <span className="attr-label">Data Completeness</span>
            <span className={`status-pill ${costBreakdown.completenessDetails.badgeClass}`}>
              <ShieldCheck size={13} className="mr-1" />
              {costBreakdown.completenessDetails.label}
            </span>
          </div>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="kpi-grid">
        {/* Total Direct Cost */}
        <div className="kpi-card highlight-kpi">
          <div className="kpi-header">
            <span className="kpi-title">Total Direct Case Cost</span>
            <DollarSign size={18} className="kpi-icon text-emerald" />
          </div>
          <div className="kpi-value text-emerald">
            {caseCostModelService.formatCurrency(costBreakdown.totalDirectCost)}
          </div>
          <div className="kpi-subtext">
            <span>Sum of all 8 direct cost categories</span>
            <span className="font-semibold text-slate-300">
              {costBreakdown.totalItemCount} items logged
            </span>
          </div>
        </div>

        {/* Implants, Supplies & Pharmacy */}
        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">Hardware & Disposables</span>
            <Box size={18} className="kpi-icon text-sky" />
          </div>
          <div className="kpi-value text-sky">
            {caseCostModelService.formatCurrency(implantAndSupplyTotal)}
          </div>
          <div className="kpi-subtext">
            <span>Implants, custom packs & pharmacy</span>
            <span className="text-sky font-semibold">
              {costBreakdown.totalDirectCost > 0
                ? `${((implantAndSupplyTotal / costBreakdown.totalDirectCost) * 100).toFixed(1)}%`
                : '0.0%'}
            </span>
          </div>
        </div>

        {/* Clinical Labor & OR Occupancy */}
        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">Intraop Labor & Suite Time</span>
            <Clock size={18} className="kpi-icon text-amber" />
          </div>
          <div className="kpi-value text-amber">
            {caseCostModelService.formatCurrency(clinicalLaborAndRoomTotal)}
          </div>
          <div className="kpi-subtext">
            <span>Direct RN/tech wages + OR minutes</span>
            <span className="text-amber font-semibold">
              {costBreakdown.totalDirectCost > 0
                ? `${((clinicalLaborAndRoomTotal / costBreakdown.totalDirectCost) * 100).toFixed(1)}%`
                : '0.0%'}
            </span>
          </div>
        </div>

        {/* PACU, Reprocessing & Equipment */}
        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-title">PACU, CSSD & Equipment</span>
            <Package size={18} className="kpi-icon text-slate" />
          </div>
          <div className="kpi-value text-slate-100">
            {caseCostModelService.formatCurrency(pacuAndTrayTotal)}
          </div>
          <div className="kpi-subtext">
            <span>Recovery bay, sterile trays & towers</span>
            <span className="text-slate-300 font-semibold">
              {costBreakdown.totalDirectCost > 0
                ? `${((pacuAndTrayTotal / costBreakdown.totalDirectCost) * 100).toFixed(1)}%`
                : '0.0%'}
            </span>
          </div>
        </div>
      </div>

      {/* 8-Category Cost Breakdown Grid */}
      <div className="category-grid-section">
        <div className="section-header">
          <div className="section-title-wrap">
            <h3 className="section-title">8-Category Activity-Based Procedural Cost Allocation</h3>
            <span className="section-desc">
              Deterministic allocation across intraoperative, sterile processing, and clinical staffing resources
            </span>
          </div>
          <span className="badge-standard">
            Fixed NUMERIC(12,2) Precision • Zero-Substitution Active
          </span>
        </div>

        <div className="category-cards-grid">
          {Object.keys(COST_CATEGORIES).map(catKey => {
            const config = COST_CATEGORY_CONFIG[catKey];
            const amount = costBreakdown.categoryBreakdown[catKey] || 0.00;
            const pct = costBreakdown.categoryPercentages[catKey] || 0.00;
            const count = costBreakdown.categoryCounts[catKey] || 0;
            const isSelected = activeCategoryFilter === catKey;

            return (
              <div
                key={catKey}
                className={`category-card ${isSelected ? 'selected' : ''}`}
                onClick={() => {
                  setActiveCategoryFilter(isSelected ? 'ALL' : catKey);
                }}
              >
                <div className="cat-card-top">
                  <span className={`cat-pill ${config.badgeClass}`}>
                    {config.shortLabel}
                  </span>
                  <span className="cat-pct">{pct.toFixed(1)}%</span>
                </div>

                <div className="cat-amount">
                  {caseCostModelService.formatCurrency(amount)}
                </div>

                <div className="cat-title">{config.label}</div>
                <div className="cat-desc">{config.description}</div>

                <div className="cat-card-footer">
                  <span className="cat-item-count">{count} line item{count === 1 ? '' : 's'}</span>
                  <span className="cat-click-hint">
                    {isSelected ? 'Clear filter' : 'Filter table →'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Sterile Tray Catalog View (Collapsible) */}
      {showTrayCatalog && (
        <div className="tray-catalog-card">
          <div className="tray-header">
            <div className="tray-title-box">
              <Package size={18} className="text-emerald" />
              <h4>Central Sterile Supply Department (CSSD) — Instrument Tray Catalog</h4>
            </div>
            <button
              className="alert-close text-slate-400 hover:text-white"
              onClick={() => setShowTrayCatalog(false)}
            >
              <X size={16} />
            </button>
          </div>
          <div className="table-responsive">
            <table className="tray-table">
              <thead>
                <tr>
                  <th>Tray Code</th>
                  <th>Tray Description</th>
                  <th>Specialty</th>
                  <th>Sterilization Method</th>
                  <th>Decon Minutes</th>
                  <th>Cycle Minutes</th>
                  <th>Per-Cycle Cost</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {trayCatalog.map(tray => (
                  <tr key={tray.trayCode}>
                    <td className="font-mono text-sky font-semibold">{tray.trayCode}</td>
                    <td className="text-slate-100 font-medium">{tray.trayName}</td>
                    <td className="text-slate-300">{tray.specialty}</td>
                    <td>
                      <span className="tray-method-badge">
                        {tray.sterilizationMethod}
                      </span>
                    </td>
                    <td className="text-slate-300">{tray.decontaminationMinutes} min</td>
                    <td className="text-slate-300">{tray.sterilizationMinutes} min</td>
                    <td className="font-semibold text-emerald">
                      {caseCostModelService.formatCurrency(tray.perCycleCost)}
                    </td>
                    <td>
                      <span className="status-pill bg-emerald-950/40 text-emerald-400 border-emerald-800">
                        Active
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Itemized Direct Cost Items Table */}
      <div className="items-section">
        <div className="items-toolbar">
          <div className="filter-pills">
            <button
              className={`filter-pill ${activeCategoryFilter === 'ALL' ? 'active' : ''}`}
              onClick={() => setActiveCategoryFilter('ALL')}
            >
              All Direct Costs ({costItems.length})
            </button>
            {Object.keys(COST_CATEGORIES).map(catKey => {
              const count = costBreakdown.categoryCounts[catKey] || 0;
              const config = COST_CATEGORY_CONFIG[catKey];
              return (
                <button
                  key={catKey}
                  className={`filter-pill ${activeCategoryFilter === catKey ? 'active' : ''}`}
                  onClick={() => setActiveCategoryFilter(catKey)}
                >
                  {config.shortLabel} ({count})
                </button>
              );
            })}
          </div>

          <div className="search-box">
            <Search size={14} className="search-icon" />
            <input
              type="text"
              placeholder="Search description, code, invoice..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
            {searchQuery && (
              <button className="clear-search-btn" onClick={() => setSearchQuery('')}>
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Responsive Table Wrapper */}
        <div className="table-responsive">
          <table className="cost-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Item Code & Description</th>
                <th>Source Module</th>
                <th>Vendor Invoice #</th>
                <th className="text-right">Qty</th>
                <th className="text-right">Unit Cost</th>
                <th className="text-right">Total Cost</th>
                <th>Completeness</th>
                <th className="text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan="9" className="empty-table-cell">
                    <AlertCircle size={28} className="text-slate-500 mb-2" />
                    <div>No direct cost items match the selected criteria.</div>
                    <span className="text-xs text-slate-400">
                      Try selecting another category or click "+ Add Cost Item" to record costs.
                    </span>
                  </td>
                </tr>
              ) : (
                filteredItems.map(item => {
                  const config = COST_CATEGORY_CONFIG[item.cost_category] || {
                    shortLabel: item.cost_category,
                    badgeClass: 'bg-slate-800 text-slate-300'
                  };

                  return (
                    <tr key={item.id} className="cost-row">
                      <td>
                        <span className={`cat-pill ${config.badgeClass}`}>
                          {config.shortLabel}
                        </span>
                      </td>
                      <td>
                        <div className="item-desc-cell">
                          <span className="item-code-tag">{item.item_code || 'N/A'}</span>
                          <span className="item-title">{item.item_description}</span>
                        </div>
                      </td>
                      <td>
                        <div className="source-cell">
                          <span className="source-mod">{item.source_module}</span>
                          <span className="source-ref-id">{item.source_reference_id}</span>
                        </div>
                      </td>
                      <td>
                        {item.vendor_invoice_number ? (
                          <span className="font-mono text-sky font-medium text-xs">
                            {item.vendor_invoice_number}
                          </span>
                        ) : (
                          <span className="text-slate-500 text-xs italic">Direct Staff/Facility</span>
                        )}
                      </td>
                      <td className="text-right font-mono font-medium text-slate-200">
                        {Number(item.quantity).toFixed(item.quantity % 1 === 0 ? 0 : 2)}
                      </td>
                      <td className="text-right font-mono text-slate-300">
                        {caseCostModelService.formatCurrency(item.unit_cost)}
                      </td>
                      <td className="text-right font-mono font-semibold text-emerald">
                        {caseCostModelService.formatCurrency(item.total_cost)}
                      </td>
                      <td>
                        <span
                          className={`status-pill ${
                            item.completeness_flag === 'VERIFIED'
                              ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800'
                              : item.completeness_flag === 'ESTIMATED'
                              ? 'bg-sky-950/40 text-sky-400 border-sky-800'
                              : 'bg-amber-950/40 text-amber-400 border-amber-800'
                          }`}
                        >
                          {item.completeness_flag}
                        </span>
                      </td>
                      <td className="text-center">
                        <button
                          className="row-action-btn delete-btn"
                          title="Remove cost item"
                          onClick={() => handleRemoveItem(item.id, item.item_description)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Direct Cost Item Modal */}
      {showAddModal && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <div className="modal-title-box">
                <Plus size={18} className="text-sky" />
                <h3>Add Direct Procedural Cost Item</h3>
              </div>
              <button
                className="alert-close text-slate-400 hover:text-white"
                onClick={() => setShowAddModal(false)}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleAddCostItem} className="modal-form">
              <div className="form-row">
                <div className="form-group flex-1">
                  <label className="form-label">Cost Category *</label>
                  <select
                    className="form-input"
                    value={newItemCategory}
                    onChange={(e) => setNewItemCategory(e.target.value)}
                  >
                    {Object.keys(COST_CATEGORIES).map(k => (
                      <option key={k} value={k}>
                        {COST_CATEGORY_CONFIG[k].label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group flex-1">
                  <label className="form-label">Completeness Flag</label>
                  <select
                    className="form-input"
                    value={newItemCompleteness}
                    onChange={(e) => setNewItemCompleteness(e.target.value)}
                  >
                    <option value="VERIFIED">VERIFIED (Invoiced / Actual)</option>
                    <option value="ESTIMATED">ESTIMATED (Standard Cost)</option>
                    <option value="PROVISIONAL">PROVISIONAL (Unverified)</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Item Code / Catalog SKU / UDI Barcode</label>
                <input
                  type="text"
                  placeholder="e.g. STR-MITEK-01 or PACK-001"
                  className="form-input font-mono text-sm"
                  value={newItemCode}
                  onChange={(e) => setNewItemCode(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Item Description / Clinical Narrative *</label>
                <input
                  type="text"
                  placeholder="e.g. Stryker Mitek Meniscal Anchor or Exparel 1.3% Vial"
                  className="form-input text-sm"
                  value={newItemDesc}
                  onChange={(e) => setNewItemDesc(e.target.value)}
                  required
                />
              </div>

              <div className="form-row">
                <div className="form-group flex-1">
                  <label className="form-label">Quantity *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    className="form-input font-mono"
                    value={newItemQty}
                    onChange={(e) => setNewItemQty(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group flex-1">
                  <label className="form-label">Unit Cost ($) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.00"
                    placeholder="0.00"
                    className="form-input font-mono"
                    value={newItemUnitCost}
                    onChange={(e) => setNewItemUnitCost(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Vendor Invoice Number (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. INV-STRYK-84920"
                  className="form-input font-mono text-sm"
                  value={newItemInvoice}
                  onChange={(e) => setNewItemInvoice(e.target.value)}
                />
                <span className="text-xs text-slate-400 mt-1 block">
                  Leave blank for internal facility suite, PACU, or clinical labor items.
                </span>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="action-btn btn-secondary"
                  onClick={() => setShowAddModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="action-btn btn-primary">
                  <Plus size={15} />
                  Record Cost Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
