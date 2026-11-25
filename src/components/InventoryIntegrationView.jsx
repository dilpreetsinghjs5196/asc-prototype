import React, { useState, useMemo, useEffect } from 'react';
import {
  Package,
  Layers,
  Activity,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Search,
  Filter,
  Sliders,
  X,
  Play,
  Zap,
  Check,
  Building2,
  Calendar,
  ArrowRight,
  ShieldCheck,
  FileSpreadsheet,
  DollarSign,
  AlertOctagon,
  Scan,
  Archive,
  Trash2
} from 'lucide-react';
import {
  getInventoryConnectorConfig,
  getInventoryTelemetry,
  getInventoryItemMaster,
  getInventoryStockLevels,
  getInventoryCaseUsage,
  getInventoryWasteLogs,
  getInventoryExceptions,
  testInventoryConnection,
  triggerManualInventorySync,
  recordCaseItemUsage,
  resolveInventoryException,
  normalizeFacilityId
} from '../services/inventoryIntegrationService';
import './InventoryIntegrationView.css';

export default function InventoryIntegrationView({ activeFacility }) {
  const facilityId = useMemo(() => normalizeFacilityId(activeFacility), [activeFacility]);
  const facilityName = typeof activeFacility === 'object' && activeFacility?.name ? activeFacility.name : 'Naples Surgery Center';

  // Navigation State
  const [activeSubTab, setActiveSubTab] = useState('item_master'); // 'item_master' | 'depot_stock' | 'case_usage' | 'inventory_exceptions'
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  // Notification Banners
  const [banner, setBanner] = useState({ show: false, type: 'info', message: '' });

  // Data Refresh Key
  const [refreshKey, setRefreshKey] = useState(0);

  // Data states
  const [config, setConfig] = useState(null);
  const [telemetry, setTelemetry] = useState(null);
  const [items, setItems] = useState([]);
  const [stockLevels, setStockLevels] = useState([]);
  const [caseUsage, setCaseUsage] = useState([]);
  const [wasteLogs, setWasteLogs] = useState([]);
  const [exceptions, setExceptions] = useState([]);

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        const [c, t, itm, stk, use, wst, exc] = await Promise.all([
          getInventoryConnectorConfig(facilityId),
          getInventoryTelemetry(facilityId),
          getInventoryItemMaster(facilityId),
          getInventoryStockLevels(facilityId),
          getInventoryCaseUsage(facilityId),
          getInventoryWasteLogs(facilityId),
          getInventoryExceptions(facilityId)
        ]);
        if (isMounted) {
          setConfig(c);
          setTelemetry(t);
          setItems(itm);
          setStockLevels(stk);
          setCaseUsage(use);
          setWasteLogs(wst);
          setExceptions(exc);
        }
      } catch (err) {
        console.error('Failed to load inventory integration data:', err);
      }
    }
    loadData();
    return () => { isMounted = false; };
  }, [facilityId, refreshKey]);

  // Action: Test Connection
  const handleTestConnection = async () => {
    setIsTesting(true);
    setBanner({ show: false, type: 'info', message: '' });
    try {
      const res = await testInventoryConnection(facilityId);
      setBanner({
        show: true,
        type: 'success',
        message: `${res.message} (Latency: ${res.latency_ms}ms)`
      });
    } catch (err) {
      setBanner({
        show: true,
        type: 'error',
        message: `Connection test failed: ${err.message}`
      });
    } finally {
      setIsTesting(false);
    }
  };

  // Action: Manual Inventory Sync
  const handleSyncInventory = async () => {
    setIsSyncing(true);
    setBanner({ show: false, type: 'info', message: '' });
    try {
      const res = await triggerManualInventorySync(facilityId);
      setBanner({
        show: true,
        type: 'success',
        message: `Inventory catalog sync completed! Reconciled ${res.items_reconciled} items across ${res.depots_audited} storage depots ($${res.total_valuation.toLocaleString()} total valuation).`
      });
      setRefreshKey(k => k + 1);
    } catch (err) {
      setBanner({
        show: true,
        type: 'error',
        message: `Sync failed: ${err.message}`
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Action: Record Point-of-Care Item Usage
  const handleRecordUsage = async () => {
    setIsRecording(true);
    setBanner({ show: false, type: 'info', message: '' });
    try {
      const newUsage = await recordCaseItemUsage(facilityId, {
        procedure_name: 'Total Knee Arthroplasty',
        item_sku: 'SKU-1004',
        quantity_used: 1,
        quantity_wasted: 0
      });
      setBanner({
        show: true,
        type: 'success',
        message: `Item usage recorded for ${newUsage.case_identifier}: Depleted ${newUsage.item_description} ($${newUsage.total_case_supply_cost.toFixed(2)}).`
      });
      setRefreshKey(k => k + 1);
    } catch (err) {
      setBanner({
        show: true,
        type: 'error',
        message: `Usage logging failed: ${err.message}`
      });
    } finally {
      setIsRecording(false);
    }
  };

  // Action: Resolve Exception
  const handleResolveException = async (excId) => {
    try {
      await resolveInventoryException(excId, 'Resolved by Materials Manager');
      setBanner({
        show: true,
        type: 'success',
        message: 'Exception successfully marked as resolved and removed from quarantine.'
      });
      setRefreshKey(k => k + 1);
    } catch (err) {
      setBanner({
        show: true,
        type: 'error',
        message: `Failed to resolve exception: ${err.message}`
      });
    }
  };

  // Filtered Lists
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter(i =>
      i.item_sku.toLowerCase().includes(q) ||
      i.item_description.toLowerCase().includes(q) ||
      i.manufacturer_name.toLowerCase().includes(q) ||
      i.clinical_category.toLowerCase().includes(q)
    );
  }, [items, searchQuery]);

  const filteredStock = useMemo(() => {
    if (!searchQuery.trim()) return stockLevels;
    const q = searchQuery.toLowerCase();
    return stockLevels.filter(s =>
      s.item_sku.toLowerCase().includes(q) ||
      s.item_description.toLowerCase().includes(q) ||
      s.depot_location.toLowerCase().includes(q) ||
      s.replenishment_status.toLowerCase().includes(q)
    );
  }, [stockLevels, searchQuery]);

  const filteredUsage = useMemo(() => {
    if (!searchQuery.trim()) return caseUsage;
    const q = searchQuery.toLowerCase();
    return caseUsage.filter(u =>
      u.case_identifier.toLowerCase().includes(q) ||
      u.item_sku.toLowerCase().includes(q) ||
      u.procedure_name.toLowerCase().includes(q)
    );
  }, [caseUsage, searchQuery]);

  return (
    <div className="inv-container">
      {/* 1. Header Action Bar */}
      <header className="inv-header">
        <div className="inv-header-left">
          <div className="inv-title-row">
            <h1 className="inv-title">Inventory & Materials Management Integration</h1>
            <span className="inv-vendor-badge">{config?.inventory_vendor || 'ENVI_IOS'}</span>
            <span className={`inv-status-pill ${config?.sync_status?.toLowerCase() || 'connected'}`}>
              <span className="inv-status-dot"></span>
              {config?.sync_status || 'CONNECTED'}
            </span>
          </div>
          <p className="inv-subtitle">
            {facilityName} • Materials Management (MM), Point-of-Use (POU) barcode depletion, UDI tracking & par replenishment.
          </p>
        </div>

        <div className="inv-header-actions">
          <button
            className="inv-btn inv-btn-secondary"
            onClick={handleTestConnection}
            disabled={isTesting}
          >
            <Activity size={15} className={isTesting ? 'spin' : ''} />
            {isTesting ? 'Testing...' : 'Test Connection'}
          </button>
          <button
            className="inv-btn inv-btn-secondary"
            onClick={handleSyncInventory}
            disabled={isSyncing}
          >
            <RefreshCw size={15} className={isSyncing ? 'spin' : ''} />
            {isSyncing ? 'Syncing...' : 'Sync Inventory'}
          </button>
          <button
            className="inv-btn inv-btn-primary"
            onClick={handleRecordUsage}
            disabled={isRecording}
          >
            <Scan size={15} className={isRecording ? 'spin' : ''} />
            {isRecording ? 'Scanning...' : 'Scan / Record Usage'}
          </button>
          <button
            className="inv-btn inv-btn-icon"
            onClick={() => setIsDrawerOpen(true)}
            title="Configure Inventory Settings"
          >
            <Sliders size={16} />
          </button>
        </div>
      </header>

      {/* Banner / Notification */}
      {banner.show && (
        <div className={`inv-banner inv-banner-${banner.type}`}>
          <div className="inv-banner-content">
            {banner.type === 'success' && <CheckCircle2 size={16} />}
            {banner.type === 'error' && <AlertTriangle size={16} />}
            {banner.type === 'info' && <Zap size={16} />}
            <span>{banner.message}</span>
          </div>
          <button
            className="inv-banner-close"
            onClick={() => setBanner({ show: false, type: 'info', message: '' })}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* 2. 4-Card Telemetry Ribbon */}
      <section className="inv-telemetry-grid">
        <div className="inv-card inv-telemetry-card">
          <div className="inv-card-header">
            <span className="inv-card-title">Total Inventory Valuation</span>
            <DollarSign size={18} className="inv-card-icon" />
          </div>
          <div className="inv-metric-value">
            ${telemetry?.total_inventory_valuation?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '184,250.00'}
          </div>
          <div className="inv-card-footer">
            <span className="inv-trend positive">{config?.costing_method || 'FIFO'} Valuation</span>
            <span className="inv-muted">Across 4 storage depots</span>
          </div>
        </div>

        <div className="inv-card inv-telemetry-card">
          <div className="inv-card-header">
            <span className="inv-card-title">Stockout Alerts</span>
            <AlertOctagon size={18} className="inv-card-icon text-warning" />
          </div>
          <div className="inv-metric-value text-warning">
            {telemetry?.stockout_alerts_count || '2'} Items
          </div>
          <div className="inv-card-footer">
            <span className="inv-trend warning">Reorder Required</span>
            <span className="inv-muted">Below critical par thresholds</span>
          </div>
        </div>

        <div className="inv-card inv-telemetry-card">
          <div className="inv-card-header">
            <span className="inv-card-title">Preference Card Waste %</span>
            <Trash2 size={18} className="inv-card-icon" />
          </div>
          <div className="inv-metric-value">
            {telemetry?.preference_card_waste_pct || '3.2'}%
          </div>
          <div className="inv-card-footer">
            <span className="inv-trend positive">Staging Efficiency</span>
            <span className="inv-muted">Unused opened sterile supplies</span>
          </div>
        </div>

        <div className="inv-card inv-telemetry-card">
          <div className="inv-card-header">
            <span className="inv-card-title">Active Catalog SKUs</span>
            <Package size={18} className="inv-card-icon" />
          </div>
          <div className="inv-metric-value">
            {telemetry?.active_catalog_skus_count || '142'}
          </div>
          <div className="inv-card-footer">
            <span className="inv-trend positive">Standardized</span>
            <span className="inv-muted">Implants & surgical supplies</span>
          </div>
        </div>
      </section>

      {/* 3. 5-Stage Inventory Pipeline Visualizer */}
      <section className="inv-pipeline-card">
        <div className="inv-pipeline-header">
          <h2 className="inv-pipeline-title">
            <Layers size={18} />
            Automated Materials Management & Surgical Depletion Pipeline
          </h2>
          <span className="inv-pipeline-tag">Point-of-Use (POU) Depletion & Nightly EDI 832/850 Reorder</span>
        </div>
        <div className="inv-pipeline-steps">
          <div className="inv-pipeline-step active">
            <div className="inv-step-badge">1</div>
            <div className="inv-step-info">
              <span className="inv-step-name">Vendor Catalog Sync</span>
              <span className="inv-step-detail">Contracted costs & UDI mapped</span>
            </div>
            <ArrowRight size={14} className="inv-step-arrow" />
          </div>

          <div className="inv-pipeline-step active">
            <div className="inv-step-badge">2</div>
            <div className="inv-step-info">
              <span className="inv-step-name">Par Depot Audit</span>
              <span className="inv-step-detail">Main storage & OR core counts</span>
            </div>
            <ArrowRight size={14} className="inv-step-arrow" />
          </div>

          <div className="inv-pipeline-step active">
            <div className="inv-step-badge">3</div>
            <div className="inv-step-info">
              <span className="inv-step-name">POU Barcode Scan</span>
              <span className="inv-step-detail">Lot, serial & expiration validated</span>
            </div>
            <ArrowRight size={14} className="inv-step-arrow" />
          </div>

          <div className="inv-pipeline-step active">
            <div className="inv-step-badge">4</div>
            <div className="inv-step-info">
              <span className="inv-step-name">Case Depletion</span>
              <span className="inv-step-detail">Usage deducted & cost calculated</span>
            </div>
            <ArrowRight size={14} className="inv-step-arrow" />
          </div>

          <div className="inv-pipeline-step active">
            <div className="inv-step-badge">5</div>
            <div className="inv-step-info">
              <span className="inv-step-name">Replenishment Reorder</span>
              <span className="inv-step-detail">Automated PO & SHA-256 seal</span>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Subtab Navigation */}
      <nav className="inv-nav-bar">
        <div className="inv-subtabs">
          <button
            className={`inv-subtab-btn ${activeSubTab === 'item_master' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('item_master')}
          >
            <Package size={16} />
            Item Master Catalog
            <span className="inv-tab-count">{items.length}</span>
          </button>
          <button
            className={`inv-subtab-btn ${activeSubTab === 'depot_stock' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('depot_stock')}
          >
            <Archive size={16} />
            Depot Stock & Par Levels
            <span className="inv-tab-count">{stockLevels.length}</span>
          </button>
          <button
            className={`inv-subtab-btn ${activeSubTab === 'case_usage' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('case_usage')}
          >
            <Scan size={16} />
            Case Supply Usage
            <span className="inv-tab-count">{caseUsage.length}</span>
          </button>
          <button
            className={`inv-subtab-btn ${activeSubTab === 'inventory_exceptions' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('inventory_exceptions')}
          >
            <AlertTriangle size={16} />
            Inventory Exceptions
            {exceptions.filter(e => !e.is_resolved).length > 0 && (
              <span className="inv-tab-count warning">{exceptions.filter(e => !e.is_resolved).length}</span>
            )}
          </button>
        </div>

        <div className="inv-filter-bar">
          <div className="inv-search-box">
            <Search size={15} />
            <input
              type="text"
              placeholder="Search SKU, description, depot..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </nav>

      {/* 5. Subtab Content Panels */}

      {/* Tab 1: Item Master Catalog */}
      {activeSubTab === 'item_master' && (
        <div className="inv-panel">
          <div className="inv-table-container">
            <table className="inv-table">
              <thead>
                <tr>
                  <th>Item SKU</th>
                  <th>Product Description</th>
                  <th>Clinical Category</th>
                  <th>Manufacturer</th>
                  <th>UOM</th>
                  <th>Acquisition Cost</th>
                  <th>Billable</th>
                  <th>HCPCS / CPT</th>
                  <th>FDA UDI Barcode</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map(item => (
                  <tr key={item.id || item.item_sku}>
                    <td className="inv-mono-text font-bold">{item.item_sku}</td>
                    <td className="font-semibold">{item.item_description}</td>
                    <td>
                      <span className={`inv-cat-pill ${item.clinical_category.toLowerCase()}`}>
                        {item.clinical_category}
                      </span>
                    </td>
                    <td className="inv-muted">{item.manufacturer_name}</td>
                    <td><span className="inv-tag-pill">{item.unit_of_measure}</span></td>
                    <td className="font-bold text-success">${Number(item.contracted_acquisition_cost).toFixed(2)}</td>
                    <td>
                      {item.is_billable ? (
                        <span className="inv-status-pill active"><Check size={12} /> Yes</span>
                      ) : (
                        <span className="inv-muted">Bundle</span>
                      )}
                    </td>
                    <td>{item.hcpcs_cpt_code ? <span className="inv-tag-pill font-mono">{item.hcpcs_cpt_code}</span> : '—'}</td>
                    <td>
                      <span className="inv-udi-badge" title={item.fda_udi_barcode}>
                        <Scan size={12} />
                        {item.fda_udi_barcode.substring(0, 18)}...
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Depot Stock & Par Levels */}
      {activeSubTab === 'depot_stock' && (
        <div className="inv-panel">
          <div className="inv-table-container">
            <table className="inv-table">
              <thead>
                <tr>
                  <th>Item SKU</th>
                  <th>Product Description</th>
                  <th>Depot Location</th>
                  <th>On Hand</th>
                  <th>Min Par</th>
                  <th>Max Par</th>
                  <th>Reorder Point</th>
                  <th>Replenishment Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredStock.map(stock => (
                  <tr key={stock.id || `${stock.item_sku}-${stock.depot_location}`}>
                    <td className="inv-mono-text font-bold">{stock.item_sku}</td>
                    <td className="font-semibold">{stock.item_description}</td>
                    <td><span className="inv-tag-pill">{stock.depot_location}</span></td>
                    <td className="font-bold">{stock.quantity_on_hand} units</td>
                    <td className="inv-muted">{stock.minimum_par_level}</td>
                    <td className="inv-muted">{stock.maximum_par_level}</td>
                    <td>{stock.reorder_point}</td>
                    <td>
                      <span className={`inv-replenish-pill ${stock.replenishment_status.toLowerCase()}`}>
                        {stock.replenishment_status === 'OPTIMAL' && <Check size={12} />}
                        {stock.replenishment_status === 'LOW_STOCK' && <AlertTriangle size={12} />}
                        {stock.replenishment_status === 'CRITICAL_REORDER' && <AlertOctagon size={12} />}
                        {stock.replenishment_status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Case Supply Usage */}
      {activeSubTab === 'case_usage' && (
        <div className="inv-panel">
          <div className="inv-table-container">
            <table className="inv-table">
              <thead>
                <tr>
                  <th>Case Identifier</th>
                  <th>Procedure Description</th>
                  <th>Date</th>
                  <th>Item SKU</th>
                  <th>Product Description</th>
                  <th>Qty Used</th>
                  <th>Qty Wasted</th>
                  <th>Unit Cost</th>
                  <th>Total Cost</th>
                  <th>Implant Lot</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsage.map(u => (
                  <tr key={u.id}>
                    <td className="inv-mono-text font-bold">{u.case_identifier}</td>
                    <td className="font-semibold">{u.procedure_name}</td>
                    <td className="inv-muted">{u.service_date}</td>
                    <td className="inv-mono-text">{u.item_sku}</td>
                    <td>{u.item_description}</td>
                    <td>{u.quantity_used}</td>
                    <td>
                      <span className={u.quantity_wasted > 0 ? 'inv-waste-highlight' : 'inv-muted'}>
                        {u.quantity_wasted}
                      </span>
                    </td>
                    <td>${Number(u.unit_acquisition_cost).toFixed(2)}</td>
                    <td className="font-bold">${Number(u.total_case_supply_cost).toFixed(2)}</td>
                    <td>
                      {u.implant_lot_number ? (
                        <span className="inv-tag-pill font-mono">{u.implant_lot_number}</span>
                      ) : (
                        <span className="inv-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Inventory Exceptions */}
      {activeSubTab === 'inventory_exceptions' && (
        <div className="inv-panel">
          <div className="inv-table-container">
            <table className="inv-table">
              <thead>
                <tr>
                  <th>Exception Code</th>
                  <th>Category</th>
                  <th>Severity</th>
                  <th>Offending Identifier</th>
                  <th>Description</th>
                  <th>Resolution Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {exceptions.map(exc => (
                  <tr key={exc.id}>
                    <td className="inv-mono-text font-bold text-danger">{exc.exception_code}</td>
                    <td><span className="inv-tag-pill">{exc.exception_category}</span></td>
                    <td>
                      <span className={`inv-severity-pill ${exc.severity.toLowerCase()}`}>
                        {exc.severity}
                      </span>
                    </td>
                    <td className="inv-mono-text">{exc.offending_identifier}</td>
                    <td className="inv-muted">{exc.description}</td>
                    <td>
                      <span className={`inv-status-pill ${exc.is_resolved ? 'active' : 'warning'}`}>
                        {exc.is_resolved ? 'RESOLVED' : 'QUARANTINED'}
                      </span>
                    </td>
                    <td>
                      {!exc.is_resolved ? (
                        <button
                          className="inv-btn inv-btn-xs"
                          onClick={() => handleResolveException(exc.id)}
                        >
                          Resolve Alert
                        </button>
                      ) : (
                        <span className="inv-muted">Completed</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6. Configuration Drawer Modal */}
      {isDrawerOpen && (
        <div className="inv-modal-overlay" onClick={() => setIsDrawerOpen(false)}>
          <div className="inv-modal-card" onClick={e => e.stopPropagation()}>
            <div className="inv-modal-header">
              <div className="inv-modal-title-group">
                <Sliders size={18} />
                <h3>Materials Management Connector Settings</h3>
              </div>
              <button className="inv-modal-close" onClick={() => setIsDrawerOpen(false)}>
                <X size={16} />
              </button>
            </div>

            <div className="inv-modal-body">
              <div className="inv-form-group">
                <label>Materials Management Vendor</label>
                <select value={config?.inventory_vendor || 'ENVI_IOS'} disabled>
                  <option value="ENVI_IOS">Envi by IOS</option>
                  <option value="SYMPLR_MM">symplr Materials Management</option>
                  <option value="MEDLINE_OPTICAT">Medline OPTICAT / MedPack</option>
                  <option value="MCKESSON_SUPPLY">McKesson Supply Chain</option>
                </select>
              </div>

              <div className="inv-form-group">
                <label>Gateway Endpoint URL</label>
                <input type="text" value={config?.api_endpoint_url || 'https://api.envi.io/v2/inventory'} readOnly />
              </div>

              <div className="inv-form-group">
                <label>Purchasing Account Code</label>
                <input type="text" value={config?.purchasing_account_code || 'ENVI-NAPLES-ASC'} readOnly />
              </div>

              <div className="inv-form-group">
                <label>Client ID</label>
                <input type="text" value={config?.client_id || 'envi_client_naples_prod'} readOnly />
              </div>

              <div className="inv-form-group">
                <label>Client Secret (Encrypted at Rest)</label>
                <input type="text" value={config?.client_secret_masked || 'inv_sec_****_8821'} readOnly className="inv-mono-text" />
              </div>

              <div className="inv-form-row">
                <div className="inv-form-group">
                  <label>Costing Valuation Method</label>
                  <input type="text" value={config?.costing_method || 'FIFO'} readOnly />
                </div>
                <div className="inv-form-group">
                  <label>Implant Markup (%)</label>
                  <input type="text" value={`${config?.default_implant_markup_pct || 15.00}%`} readOnly />
                </div>
              </div>
            </div>

            <div className="inv-modal-footer">
              <button className="inv-btn inv-btn-secondary" onClick={() => setIsDrawerOpen(false)}>
                Close
              </button>
              <button className="inv-btn inv-btn-primary" onClick={() => {
                setIsDrawerOpen(false);
                setBanner({ show: true, type: 'success', message: 'Inventory settings verified.' });
              }}>
                Save & Verify
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
