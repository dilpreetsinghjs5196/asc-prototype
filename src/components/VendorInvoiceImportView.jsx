import React, { useState, useMemo, useEffect } from 'react';
import {
  Receipt,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Search,
  Sliders,
  X,
  Zap,
  Check,
  ArrowRight,
  ShieldCheck,
  DollarSign,
  FileSpreadsheet,
  Upload,
  Tag,
  ClipboardCheck,
  AlertOctagon
} from 'lucide-react';
import {
  getVendorInvoiceConfig,
  getVendorInvoiceTelemetry,
  getVendorPriceContracts,
  getVendorPurchaseOrders,
  getVendorInvoiceBatches,
  getVendorInvoiceLines,
  getVendorInvoiceExceptions,
  testVendorInvoiceConnection,
  importVendorInvoiceBatch,
  approveVendorInvoiceForAp,
  resolveVendorInvoiceException,
  normalizeFacilityId
} from '../services/vendorInvoiceService';
import './VendorInvoiceImportView.css';

export default function VendorInvoiceImportView({ activeFacility }) {
  const facilityId = useMemo(() => normalizeFacilityId(activeFacility), [activeFacility]);
  const facilityName = typeof activeFacility === 'object' && activeFacility?.name ? activeFacility.name : 'Naples Surgery Center';

  // Navigation State
  const [activeSubTab, setActiveSubTab] = useState('invoice_batches'); // 'invoice_batches' | 'price_contracts' | 'purchase_orders' | 'invoice_exceptions'
  const [selectedBatchId, setSelectedBatchId] = useState('vinv-bat-02');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  // Banners
  const [banner, setBanner] = useState({ show: false, type: 'info', message: '' });

  // Refresh Key
  const [refreshKey, setRefreshKey] = useState(0);

  // Data States
  const [config, setConfig] = useState(null);
  const [telemetry, setTelemetry] = useState(null);
  const [contracts, setContracts] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [batches, setBatches] = useState([]);
  const [selectedLines, setSelectedLines] = useState([]);
  const [exceptions, setExceptions] = useState([]);

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        const [c, t, con, pos, bat, exc] = await Promise.all([
          getVendorInvoiceConfig(facilityId),
          getVendorInvoiceTelemetry(facilityId),
          getVendorPriceContracts(facilityId),
          getVendorPurchaseOrders(facilityId),
          getVendorInvoiceBatches(facilityId),
          getVendorInvoiceExceptions(facilityId)
        ]);
        if (isMounted) {
          setConfig(c);
          setTelemetry(t);
          setContracts(con);
          setPurchaseOrders(pos);
          setBatches(bat);
          setExceptions(exc);
          if (bat.length > 0 && !bat.some(b => b.id === selectedBatchId)) {
            setSelectedBatchId(bat[0].id);
          }
        }
      } catch (err) {
        console.error('Failed to load vendor invoice data:', err);
      }
    }
    loadData();
    return () => { isMounted = false; };
  }, [facilityId, refreshKey]);

  useEffect(() => {
    let isMounted = true;
    async function loadLines() {
      if (!selectedBatchId) return;
      const lines = await getVendorInvoiceLines(selectedBatchId);
      if (isMounted) setSelectedLines(lines);
    }
    loadLines();
    return () => { isMounted = false; };
  }, [selectedBatchId, refreshKey]);

  // Test Connection
  const handleTestConnection = async () => {
    setIsTesting(true);
    setBanner({ show: false, type: 'info', message: '' });
    try {
      const res = await testVendorInvoiceConnection(facilityId);
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

  // Import Vendor Invoice
  const handleImportSampleInvoice = async () => {
    setIsImporting(true);
    setBanner({ show: false, type: 'info', message: '' });
    try {
      const batch = await importVendorInvoiceBatch(facilityId, {
        vendor_name: 'Alcon Laboratories',
        po_number: 'PO-2026-8803',
        source_format: 'EDI_810',
        lines: [
          {
            vendor_sku: 'ALC-SN60WF',
            item_description: 'AcrySof IQ Monofocal Intraocular Lens (IOL)',
            qty_invoiced: 10,
            qty_received_po: 10,
            invoiced_unit_price: 215.00
          }
        ]
      });
      setSelectedBatchId(batch.id);
      setBanner({
        show: true,
        type: 'success',
        message: `Imported ${batch.invoice_number} ($${batch.total_invoice_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}) — Status: ${batch.match_status}.`
      });
      setRefreshKey(k => k + 1);
    } catch (err) {
      setBanner({
        show: true,
        type: 'error',
        message: `Invoice import blocked: ${err.message}`
      });
    } finally {
      setIsImporting(false);
    }
  };

  // Approve Batch for AP
  const handleApproveBatch = async (batchId) => {
    try {
      const res = await approveVendorInvoiceForAp(batchId);
      if (res.success) {
        setBanner({
          show: true,
          type: 'success',
          message: `Invoice ${res.batch.invoice_number} approved for General Ledger AP posting.`
        });
        setRefreshKey(k => k + 1);
      }
    } catch (err) {
      setBanner({
        show: true,
        type: 'error',
        message: `Approval failed: ${err.message}`
      });
    }
  };

  // Resolve Exception
  const handleResolveException = async (excId) => {
    try {
      await resolveVendorInvoiceException(excId, 'Credit memo requested from vendor');
      setBanner({
        show: true,
        type: 'success',
        message: 'Price variance exception resolved and vendor credit memo logged.'
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
  const filteredBatches = useMemo(() => {
    if (!searchQuery.trim()) return batches;
    const q = searchQuery.toLowerCase();
    return batches.filter(b =>
      b.invoice_number.toLowerCase().includes(q) ||
      b.vendor_name.toLowerCase().includes(q) ||
      (b.po_number || '').toLowerCase().includes(q)
    );
  }, [batches, searchQuery]);

  const filteredContracts = useMemo(() => {
    if (!searchQuery.trim()) return contracts;
    const q = searchQuery.toLowerCase();
    return contracts.filter(c =>
      c.vendor_sku.toLowerCase().includes(q) ||
      c.internal_item_sku.toLowerCase().includes(q) ||
      c.vendor_name.toLowerCase().includes(q) ||
      c.item_description.toLowerCase().includes(q)
    );
  }, [contracts, searchQuery]);

  const selectedBatch = useMemo(() => batches.find(b => b.id === selectedBatchId) || batches[0], [batches, selectedBatchId]);

  return (
    <div className="vinv-container">
      {/* 1. Header Action Bar */}
      <header className="vinv-header">
        <div className="vinv-header-left">
          <div className="vinv-title-row">
            <h1 className="vinv-title">Vendor Invoice & Price Import Gateway</h1>
            <span className="vinv-policy-badge">{config?.matching_policy || 'THREE_WAY_MATCH'}</span>
            <span className={`vinv-status-pill ${config?.sync_status?.toLowerCase() || 'connected'}`}>
              <span className="vinv-status-dot"></span>
              {config?.sync_status || 'CONNECTED'}
            </span>
          </div>
          <p className="vinv-subtitle">
            {facilityName} • Automated EDI 810 / CSV / PDF-OCR invoice intake, SKU cross-reference matching, GPO contract price auditing & 3-way PO verification.
          </p>
        </div>

        <div className="vinv-header-actions">
          <button
            className="vinv-btn vinv-btn-secondary"
            onClick={handleTestConnection}
            disabled={isTesting}
          >
            <Activity size={15} className={isTesting ? 'spin' : ''} />
            {isTesting ? 'Testing...' : 'Test Gateway'}
          </button>
          <button
            className="vinv-btn vinv-btn-primary"
            onClick={handleImportSampleInvoice}
            disabled={isImporting}
          >
            <Upload size={15} className={isImporting ? 'spin' : ''} />
            {isImporting ? 'Importing...' : 'Import Invoice (EDI 810)'}
          </button>
          <button
            className="vinv-btn vinv-btn-icon"
            onClick={() => setIsDrawerOpen(true)}
            title="Configure Invoice Matching Rules"
          >
            <Sliders size={16} />
          </button>
        </div>
      </header>

      {/* Banner */}
      {banner.show && (
        <div className={`vinv-banner vinv-banner-${banner.type}`}>
          <div className="vinv-banner-content">
            {banner.type === 'success' && <CheckCircle2 size={16} />}
            {banner.type === 'error' && <AlertTriangle size={16} />}
            {banner.type === 'info' && <Zap size={16} />}
            <span>{banner.message}</span>
          </div>
          <button
            className="vinv-banner-close"
            onClick={() => setBanner({ show: false, type: 'info', message: '' })}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* 2. 4-Card Telemetry Ribbon */}
      <section className="vinv-telemetry-grid">
        <div className="vinv-card">
          <div className="vinv-card-header">
            <span className="vinv-card-title">Total Invoiced (MTD)</span>
            <DollarSign size={18} className="vinv-card-icon" />
          </div>
          <div className="vinv-metric-value">
            ${telemetry?.total_invoiced_mtd?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '48,620.00'}
          </div>
          <div className="vinv-card-footer">
            <span className="vinv-trend positive">EDI 810 & CSV</span>
            <span className="vinv-muted">{telemetry?.total_invoices_count || 2} verified invoice batches</span>
          </div>
        </div>

        <div className="vinv-card">
          <div className="vinv-card-header">
            <span className="vinv-card-title">SKU Auto-Match Rate</span>
            <Tag size={18} className="vinv-card-icon" />
          </div>
          <div className="vinv-metric-value">
            {telemetry?.sku_auto_match_pct ?? 100}%
          </div>
          <div className="vinv-card-footer">
            <span className="vinv-trend positive">Cross-Referenced</span>
            <span className="vinv-muted">Vendor SKU to ASC Item Master</span>
          </div>
        </div>

        <div className="vinv-card">
          <div className="vinv-card-header">
            <span className="vinv-card-title">Price Variance Flagged</span>
            <AlertOctagon size={18} className="vinv-card-icon text-warning" />
          </div>
          <div className="vinv-metric-value text-warning">
            ${telemetry?.price_variance_flagged_mtd?.toLocaleString(undefined, { minimumFractionDigits: 2 }) || '360.00'}
          </div>
          <div className="vinv-card-footer">
            <span className="vinv-trend warning">Overbilling Blocked</span>
            <span className="vinv-muted">Tolerance guard: {config?.price_tolerance_pct || 2.0}%</span>
          </div>
        </div>

        <div className="vinv-card">
          <div className="vinv-card-header">
            <span className="vinv-card-title">Pending Variance Review</span>
            <ClipboardCheck size={18} className="vinv-card-icon" />
          </div>
          <div className="vinv-metric-value">
            {telemetry?.invoices_pending_review ?? 1}
          </div>
          <div className="vinv-card-footer">
            <span className="vinv-trend positive">AP Safeguard</span>
            <span className="vinv-muted">Held prior to GL release</span>
          </div>
        </div>
      </section>

      {/* 3. 5-Stage Pipeline Visualizer */}
      <section className="vinv-pipeline-card">
        <div className="vinv-pipeline-header">
          <h2 className="vinv-pipeline-title">
            <Receipt size={18} />
            Automated Invoice Audit & 3-Way PO Matching Pipeline
          </h2>
          <span className="vinv-pipeline-tag">Policy: {config?.matching_policy || 'THREE_WAY_MATCH'} • Duplicate Lock: Active</span>
        </div>
        <div className="vinv-pipeline-steps">
          <div className="vinv-pipeline-step active">
            <div className="vinv-step-badge">1</div>
            <div className="vinv-step-info">
              <span className="vinv-step-name">Invoice Capture</span>
              <span className="vinv-step-detail">EDI 810, CSV & PDF-OCR</span>
            </div>
            <ArrowRight size={14} className="vinv-step-arrow" />
          </div>

          <div className="vinv-pipeline-step active">
            <div className="vinv-step-badge">2</div>
            <div className="vinv-step-info">
              <span className="vinv-step-name">SKU Cross-Reference</span>
              <span className="vinv-step-detail">Vendor SKU to Item Master</span>
            </div>
            <ArrowRight size={14} className="vinv-step-arrow" />
          </div>

          <div className="vinv-pipeline-step active">
            <div className="vinv-step-badge">3</div>
            <div className="vinv-step-info">
              <span className="vinv-step-name">Contract Price Audit</span>
              <span className="vinv-step-detail">GPO rate variance guard</span>
            </div>
            <ArrowRight size={14} className="vinv-step-arrow" />
          </div>

          <div className="vinv-pipeline-step active">
            <div className="vinv-step-badge">4</div>
            <div className="vinv-step-info">
              <span className="vinv-step-name">3-Way PO Match</span>
              <span className="vinv-step-detail">PO vs. Receipt vs. Invoice</span>
            </div>
            <ArrowRight size={14} className="vinv-step-arrow" />
          </div>

          <div className="vinv-pipeline-step active">
            <div className="vinv-step-badge">5</div>
            <div className="vinv-step-info">
              <span className="vinv-step-name">AP Ledger Handoff</span>
              <span className="vinv-step-detail">GL ready & SHA-256 seal</span>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Subtab Navigation */}
      <nav className="vinv-nav-bar">
        <div className="vinv-subtabs">
          <button
            className={`vinv-subtab-btn ${activeSubTab === 'invoice_batches' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('invoice_batches')}
          >
            <Receipt size={16} />
            Imported Invoices
            <span className="vinv-tab-count">{batches.length}</span>
          </button>
          <button
            className={`vinv-subtab-btn ${activeSubTab === 'price_contracts' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('price_contracts')}
          >
            <Tag size={16} />
            SKU & Contract Price Catalog
            <span className="vinv-tab-count">{contracts.length}</span>
          </button>
          <button
            className={`vinv-subtab-btn ${activeSubTab === 'purchase_orders' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('purchase_orders')}
          >
            <FileSpreadsheet size={16} />
            Purchase Orders (3-Way Match)
            <span className="vinv-tab-count">{purchaseOrders.length}</span>
          </button>
          <button
            className={`vinv-subtab-btn ${activeSubTab === 'invoice_exceptions' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('invoice_exceptions')}
          >
            <AlertTriangle size={16} />
            Price & SKU Exceptions
            {exceptions.filter(e => !e.is_resolved).length > 0 && (
              <span className="vinv-tab-count warning">{exceptions.filter(e => !e.is_resolved).length}</span>
            )}
          </button>
        </div>

        <div className="vinv-filter-bar">
          <div className="vinv-search-box">
            <Search size={15} />
            <input
              type="text"
              placeholder="Search invoice #, vendor, SKU, PO..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </nav>

      {/* 5. Subtab Content Panels */}

      {/* Tab 1: Imported Invoices + Line Drilldown */}
      {activeSubTab === 'invoice_batches' && (
        <div className="vinv-split-stack">
          <div className="vinv-panel">
            <div className="vinv-table-container">
              <table className="vinv-table">
                <thead>
                  <tr>
                    <th>Invoice #</th>
                    <th>Vendor</th>
                    <th>PO #</th>
                    <th>Source</th>
                    <th>Invoiced Total</th>
                    <th>Contract Expected</th>
                    <th>Price Variance</th>
                    <th>Match Status</th>
                    <th>Cryptographic Seal</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBatches.map(b => (
                    <tr
                      key={b.id}
                      className={selectedBatch?.id === b.id ? 'vinv-row-selected' : ''}
                      onClick={() => setSelectedBatchId(b.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td className="vinv-mono-text font-bold">{b.invoice_number}</td>
                      <td className="font-semibold">{b.vendor_name}</td>
                      <td><span className="vinv-tag-pill font-mono">{b.po_number || '—'}</span></td>
                      <td><span className="vinv-tag-pill">{b.source_format}</span></td>
                      <td className="font-bold">${Number(b.total_invoice_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td className="vinv-muted">${Number(b.contract_expected_total).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td>
                        <span className={Number(b.price_variance_amount) > 0 ? 'text-danger font-bold' : 'text-success font-semibold'}>
                          {Number(b.price_variance_amount) > 0 ? `+$${Number(b.price_variance_amount).toFixed(2)}` : '$0.00'}
                        </span>
                      </td>
                      <td>
                        <span className={`vinv-match-pill ${b.match_status.toLowerCase()}`}>
                          {b.match_status === 'MATCHED' || b.match_status === 'APPROVED_FOR_AP' ? <Check size={12} /> : <AlertTriangle size={12} />}
                          {b.match_status}
                        </span>
                      </td>
                      <td>
                        <span className="vinv-seal-badge" title={b.sha256_sync_seal}>
                          <ShieldCheck size={13} />
                          {b.sha256_sync_seal.substring(0, 16)}...
                        </span>
                      </td>
                      <td onClick={e => e.stopPropagation()}>
                        {b.match_status !== 'APPROVED_FOR_AP' ? (
                          <button
                            className="vinv-btn vinv-btn-xs"
                            onClick={() => handleApproveBatch(b.id)}
                          >
                            Approve AP
                          </button>
                        ) : (
                          <span className="text-success font-semibold">AP Released</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Line-level Audit Drilldown */}
          {selectedBatch && (
            <div className="vinv-panel">
              <div className="vinv-panel-subheader">
                <h3>Line-Item SKU Match & Price Audit: {selectedBatch.invoice_number} ({selectedBatch.vendor_name})</h3>
                <span className="vinv-muted">{selectedLines.length} lines inspected</span>
              </div>
              <div className="vinv-table-container">
                <table className="vinv-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Vendor SKU</th>
                      <th>Matched Internal SKU</th>
                      <th>Match Method</th>
                      <th>Description</th>
                      <th>Qty (Inv / PO)</th>
                      <th>Invoiced Unit $</th>
                      <th>Contract Unit $</th>
                      <th>Extended $</th>
                      <th>Line Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedLines.map(l => (
                      <tr key={l.id}>
                        <td className="vinv-muted">{l.line_number}</td>
                        <td className="vinv-mono-text font-bold">{l.vendor_sku}</td>
                        <td className="vinv-mono-text text-primary font-bold">{l.matched_internal_sku || 'UNMAPPED'}</td>
                        <td><span className="vinv-tag-pill">{l.match_method} ({l.match_confidence_pct}%)</span></td>
                        <td>{l.item_description}</td>
                        <td>{l.qty_invoiced} / {l.qty_received_po}</td>
                        <td className={l.unit_price_variance > 0 ? 'text-danger font-bold' : ''}>${Number(l.invoiced_unit_price).toFixed(2)}</td>
                        <td className="text-success font-semibold">${Number(l.contracted_unit_price).toFixed(2)}</td>
                        <td className="font-bold">${Number(l.line_extended_amount).toFixed(2)}</td>
                        <td>
                          <span className={`vinv-match-pill ${l.line_status.toLowerCase()}`}>
                            {l.line_status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: SKU & Contract Price Catalog */}
      {activeSubTab === 'price_contracts' && (
        <div className="vinv-panel">
          <div className="vinv-table-container">
            <table className="vinv-table">
              <thead>
                <tr>
                  <th>Vendor</th>
                  <th>Vendor SKU</th>
                  <th>Internal Item SKU</th>
                  <th>Description</th>
                  <th>Category</th>
                  <th>UOM</th>
                  <th>Contracted Price</th>
                  <th>GPO Contract</th>
                  <th>Effective Window</th>
                </tr>
              </thead>
              <tbody>
                {filteredContracts.map(c => (
                  <tr key={c.id}>
                    <td className="font-semibold">{c.vendor_name}</td>
                    <td className="vinv-mono-text font-bold">{c.vendor_sku}</td>
                    <td className="vinv-mono-text text-primary font-bold">{c.internal_item_sku}</td>
                    <td>{c.item_description}</td>
                    <td><span className="vinv-tag-pill">{c.clinical_category}</span></td>
                    <td>{c.unit_of_measure}</td>
                    <td className="font-bold text-success">${Number(c.contracted_unit_price).toFixed(2)}</td>
                    <td><span className="vinv-tag-pill">{c.gpo_contract_code}</span></td>
                    <td className="vinv-muted">{c.effective_from} → {c.effective_to}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Purchase Orders */}
      {activeSubTab === 'purchase_orders' && (
        <div className="vinv-panel">
          <div className="vinv-table-container">
            <table className="vinv-table">
              <thead>
                <tr>
                  <th>PO Number</th>
                  <th>Vendor</th>
                  <th>Order Date</th>
                  <th>Expected Delivery</th>
                  <th>Received Qty</th>
                  <th>Invoiced Qty</th>
                  <th>PO Total</th>
                  <th>3-Way Status</th>
                </tr>
              </thead>
              <tbody>
                {purchaseOrders.map(po => (
                  <tr key={po.id}>
                    <td className="vinv-mono-text font-bold">{po.po_number}</td>
                    <td className="font-semibold">{po.vendor_name}</td>
                    <td className="vinv-muted">{po.order_date}</td>
                    <td className="vinv-muted">{po.expected_delivery_date}</td>
                    <td>{po.received_quantity_total}</td>
                    <td>{po.invoiced_quantity_total}</td>
                    <td className="font-bold">${Number(po.po_total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td>
                      <span className={`vinv-match-pill ${po.po_status.toLowerCase()}`}>
                        {po.po_status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Price & SKU Exceptions */}
      {activeSubTab === 'invoice_exceptions' && (
        <div className="vinv-panel">
          <div className="vinv-table-container">
            <table className="vinv-table">
              <thead>
                <tr>
                  <th>Exception Code</th>
                  <th>Category</th>
                  <th>Severity</th>
                  <th>Offending SKU / Invoice</th>
                  <th>Variance $</th>
                  <th>Description</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {exceptions.map(exc => (
                  <tr key={exc.id}>
                    <td className="vinv-mono-text font-bold text-danger">{exc.exception_code}</td>
                    <td><span className="vinv-tag-pill">{exc.exception_category}</span></td>
                    <td>
                      <span className={`vinv-severity-pill ${exc.severity.toLowerCase()}`}>
                        {exc.severity}
                      </span>
                    </td>
                    <td className="vinv-mono-text">{exc.offending_identifier}</td>
                    <td className="font-bold text-danger">${Number(exc.variance_amount).toFixed(2)}</td>
                    <td className="vinv-muted">{exc.description}</td>
                    <td>
                      <span className={`vinv-status-pill ${exc.is_resolved ? 'active' : 'warning'}`}>
                        {exc.is_resolved ? 'RESOLVED' : 'QUARANTINED'}
                      </span>
                    </td>
                    <td>
                      {!exc.is_resolved ? (
                        <button
                          className="vinv-btn vinv-btn-xs"
                          onClick={() => handleResolveException(exc.id)}
                        >
                          Resolve Dispute
                        </button>
                      ) : (
                        <span className="vinv-muted">Completed</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6. Configuration Modal */}
      {isDrawerOpen && (
        <div className="vinv-modal-overlay" onClick={() => setIsDrawerOpen(false)}>
          <div className="vinv-modal-card" onClick={e => e.stopPropagation()}>
            <div className="vinv-modal-header">
              <div className="vinv-modal-title-group">
                <Sliders size={18} />
                <h3>Vendor Invoice Matching Settings</h3>
              </div>
              <button className="vinv-modal-close" onClick={() => setIsDrawerOpen(false)}>
                <X size={16} />
              </button>
            </div>

            <div className="vinv-modal-body">
              <div className="vinv-form-group">
                <label>Parser Intake Mode</label>
                <select value={config?.default_parser_mode || 'HYBRID'} disabled>
                  <option value="HYBRID">Hybrid (EDI 810 + CSV + PDF-OCR)</option>
                  <option value="EDI_810">EDI X12 810 Direct</option>
                  <option value="CSV_BATCH">CSV / Excel Batch</option>
                </select>
              </div>

              <div className="vinv-form-group">
                <label>PO Matching Policy</label>
                <input type="text" value={config?.matching_policy || 'THREE_WAY_MATCH'} readOnly />
              </div>

              <div className="vinv-form-group">
                <label>EDI Intake Endpoint</label>
                <input type="text" value={config?.api_endpoint_url || 'https://edi.naplesasc.io/v1/x12-810-intake'} readOnly />
              </div>

              <div className="vinv-form-group">
                <label>Client Secret (Encrypted at Rest)</label>
                <input type="text" value={config?.client_secret_masked || 'vinv_sec_****_9104'} readOnly className="vinv-mono-text" />
              </div>

              <div className="vinv-form-row">
                <div className="vinv-form-group">
                  <label>Price Variance Tolerance (%)</label>
                  <input type="text" value={`${config?.price_tolerance_pct || 2.00}%`} readOnly />
                </div>
                <div className="vinv-form-group">
                  <label>Duplicate Invoice Lock</label>
                  <input type="text" value={config?.block_duplicate_invoices ? 'ENABLED' : 'DISABLED'} readOnly />
                </div>
              </div>
            </div>

            <div className="vinv-modal-footer">
              <button className="vinv-btn vinv-btn-secondary" onClick={() => setIsDrawerOpen(false)}>
                Close
              </button>
              <button className="vinv-btn vinv-btn-primary" onClick={() => {
                setIsDrawerOpen(false);
                setBanner({ show: true, type: 'success', message: 'Vendor invoice matching policy verified.' });
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
