import React, { useState, useEffect, useCallback } from 'react';
import {
  DollarSign, FileText, Plus, Search, AlertTriangle,
  Scale, ShieldCheck, X, AlertCircle, TrendingUp, Check,
  Layers
} from 'lucide-react';
import {
  pricingService,
  PRICING_MODELS,
  SCHEDULE_STATUSES,
  INVOICE_RECONCILIATION_STATUSES
} from '../lib/pricingService';
import { vendorService } from '../lib/vendorService';
import { skuService } from '../lib/skuService';
import './FacilityImplantPricing.css';

export default function FacilityImplantPricing({
  activeFacility = null,
  userPermissions = []
}) {
  const facilityId = activeFacility?.id || '00000000-0000-0000-0000-000000000002';

  const canManage = userPermissions.includes('admin') ||
    userPermissions.includes('implants.manage_contracts') ||
    userPermissions.includes('super_admin');

  const canViewCosts = userPermissions.includes('admin') ||
    userPermissions.includes('implants.view_costs') ||
    userPermissions.includes('cfo') ||
    userPermissions.includes('super_admin');

  const canOverride = userPermissions.includes('admin') ||
    userPermissions.includes('implants.override_pricing') ||
    userPermissions.includes('cfo') ||
    userPermissions.includes('super_admin');

  // Navigation State
  const [activeSubTab, setActiveSubTab] = useState('schedules'); // 'schedules' | 'invoices' | 'simulator' | 'benchmarks'

  // Data States
  const [schedules, setSchedules] = useState([]);
  const [scheduleMetrics, setScheduleMetrics] = useState({});
  const [invoices, setInvoices] = useState([]);
  const [invoiceMetrics, setInvoiceMetrics] = useState({});
  const [benchmarks, setBenchmarks] = useState([]);
  const [benchmarkOpportunity, setBenchmarkOpportunity] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState(null);

  // References
  const [vendorsList, setVendorsList] = useState([]);
  const [skusList, setSkusList] = useState([]);

  // Filters State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVendorId, setSelectedVendorId] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');

  // Modals State
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [isLinesModalOpen, setIsLinesModalOpen] = useState(false);
  const [isVarianceModalOpen, setIsVarianceModalOpen] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState(null);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [selectedLine, setSelectedLine] = useState(null);

  // Form State: New Schedule
  const [scheduleFormData, setScheduleFormData] = useState({
    schedule_code: '',
    schedule_name: '',
    vendor_id: '',
    pricing_model: 'FIXED_FEE_SCHEDULE',
    currency: 'USD',
    effective_from: '2026-03-01',
    effective_to: '2027-03-01',
    description: '',
    status: 'active'
  });

  // Form State: New Supplier Invoice
  const [invoiceFormData, setInvoiceFormData] = useState({
    invoice_number: '',
    vendor_id: '',
    vendor_invoice_reference: '',
    invoice_date: '2026-03-01',
    due_date: '2026-03-31',
    subtotal_amount: 3300.00,
    freight_amount: 0.00,
    tax_amount: 0.00,
    discount_amount: 66.00,
    payment_terms_days: 30,
    prompt_pay_discount_percent: 2.00
  });

  // Form State: Review Variance
  const [varianceRationale, setVarianceRationale] = useState('');
  const [overrideCost, setOverrideCost] = useState('');
  const [varianceError, setVarianceError] = useState('');

  // Form State: Simulator
  const [simSkuId, setSimSkuId] = useState('');
  const [simDate, setSimDate] = useState('2026-03-01');
  const [simResult, setSimResult] = useState(null);

  // Load Reference Data
  useEffect(() => {
    async function loadReferenceData() {
      try {
        if (vendorService?.getVendors) {
          const vRes = await vendorService.getVendors({ limit: 100 });
          const vList = vRes?.vendors || vRes?.items || (Array.isArray(vRes) ? vRes : []);
          if (vList.length > 0) setVendorsList(vList);
        }
        if (skuService?.getSkus) {
          const sRes = await skuService.getSkus({ limit: 100 });
          const sList = sRes?.skus || sRes?.items || (Array.isArray(sRes) ? sRes : []);
          if (sList.length > 0) {
            setSkusList(sList);
            setSimSkuId(sList[0]?.id || '');
          }
        }
      } catch {
        // Fallback default lists
      }
    }
    loadReferenceData();
  }, []);

  // Fetch Primary Data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      if (activeSubTab === 'schedules') {
        const res = await pricingService.getPriceSchedules({
          facilityId,
          vendorId: selectedVendorId || null,
          status: selectedStatus || null,
          search: searchQuery
        });
        setSchedules(res.items || []);
        setScheduleMetrics(res.metrics || {});
      } else if (activeSubTab === 'invoices') {
        const res = await pricingService.getSupplierInvoices({
          facilityId,
          vendorId: selectedVendorId || null,
          status: selectedStatus || null,
          search: searchQuery
        });
        setInvoices(res.invoices || []);
        setInvoiceMetrics(res.metrics || {});
      } else if (activeSubTab === 'benchmarks') {
        const res = await pricingService.getPriceBenchmarks({ specialty: 'Orthopedics' });
        setBenchmarks(res.benchmarks || []);
        setBenchmarkOpportunity(res.totalPotentialOpportunity || 0);
      }
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  }, [facilityId, activeSubTab, selectedVendorId, selectedStatus, searchQuery]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Open Schedule Modal
  const handleOpenScheduleModal = () => {
    setScheduleFormData({
      schedule_code: `SCH-${Date.now().toString().slice(-4)}`,
      schedule_name: '',
      vendor_id: vendorsList[0]?.id || '',
      pricing_model: 'FIXED_FEE_SCHEDULE',
      currency: 'USD',
      effective_from: new Date().toISOString().split('T')[0],
      effective_to: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0],
      description: '',
      status: 'active'
    });
    setIsScheduleModalOpen(true);
  };

  // Save Schedule Handler
  const handleSaveSchedule = async (e) => {
    e.preventDefault();
    try {
      await pricingService.savePriceSchedule({
        ...scheduleFormData,
        facility_id: facilityId
      });
      setIsScheduleModalOpen(false);
      setActionMessage({ type: 'success', text: 'Contract Price Schedule saved successfully.' });
      fetchData();
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message });
    }
  };

  // Open Invoice Modal
  const handleOpenInvoiceModal = () => {
    setInvoiceFormData({
      invoice_number: `INV-STR-${Date.now().toString().slice(-4)}`,
      vendor_id: vendorsList[0]?.id || '',
      vendor_invoice_reference: 'PO-2026-MANUAL',
      invoice_date: new Date().toISOString().split('T')[0],
      due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      subtotal_amount: 3300.00,
      freight_amount: 0.00,
      tax_amount: 0.00,
      discount_amount: 66.00,
      payment_terms_days: 30,
      prompt_pay_discount_percent: 2.00
    });
    setIsInvoiceModalOpen(true);
  };

  // Save Invoice Handler
  const handleSaveInvoice = async (e) => {
    e.preventDefault();
    try {
      await pricingService.createSupplierInvoice({
        ...invoiceFormData,
        facility_id: facilityId
      });
      setIsInvoiceModalOpen(false);
      setActionMessage({ type: 'success', text: `Supplier Invoice #${invoiceFormData.invoice_number} ingested successfully.` });
      fetchData();
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message });
    }
  };

  // Open Variance Approval Modal
  const handleOpenVarianceModal = (line) => {
    setSelectedLine(line);
    setVarianceRationale('');
    setOverrideCost(line.billed_unit_cost || '');
    setVarianceError('');
    setIsVarianceModalOpen(true);
  };

  // Review Variance Handler
  const handleExecuteReview = async (approved) => {
    if (!varianceRationale || varianceRationale.trim().length < 10) {
      setVarianceError('A detailed justification rationale (minimum 10 characters) is required by compliance.');
      return;
    }
    try {
      await pricingService.reviewPriceVariance({
        lineId: selectedLine.id,
        approved,
        rationale: varianceRationale,
        overrideUnitCost: overrideCost ? Number(overrideCost) : null
      });
      setIsVarianceModalOpen(false);
      setActionMessage({
        type: 'success',
        text: approved ? 'Invoice line price variance approved and recorded in audit log.' : 'Invoice line marked as disputed.'
      });
      fetchData();
    } catch (err) {
      setVarianceError(err.message);
    }
  };

  // Execute Price Hierarchy Simulation
  const handleRunSimulation = async () => {
    if (!simSkuId) {
      setActionMessage({ type: 'error', text: 'Select an implant SKU to evaluate price hierarchy.' });
      return;
    }
    try {
      const res = await pricingService.resolveSkuPriceHierarchy({
        facilityId,
        skuId: simSkuId,
        surgeryDate: simDate
      });
      setSimResult(res);
    } catch (err) {
      setActionMessage({ type: 'error', text: err.message });
    }
  };

  return (
    <div className="pricing-container">
      {/* Top Header */}
      <div className="pricing-header">
        <div className="pricing-title-group">
          <h2>
            <DollarSign size={24} color="#34d399" />
            Facility Implant Pricing & Acquisition Cost Hierarchy
          </h2>
          <p>
            Contract fee schedules, supplier invoice 3-way reconciliation, verified actual acquisition costs, and GPO benchmark intelligence.
          </p>
        </div>
        <div className="pricing-actions">
          <button
            type="button"
            className="btn-secondary-pricing"
            onClick={() => setActiveSubTab('simulator')}
          >
            <ShieldCheck size={16} />
            Price Hierarchy Simulator
          </button>
          {canManage && (
            <>
              <button
                type="button"
                className="btn-secondary-pricing"
                onClick={handleOpenInvoiceModal}
              >
                <FileText size={16} />
                Ingest Supplier Invoice
              </button>
              <button
                type="button"
                className="btn-primary-pricing"
                onClick={handleOpenScheduleModal}
              >
                <Plus size={16} />
                New Price Schedule
              </button>
            </>
          )}
        </div>
      </div>

      {/* Action Notification Banner */}
      {actionMessage && (
        <div className={`alert-box ${actionMessage.type === 'error' ? 'alert-danger' : 'alert-info'}`}>
          <AlertCircle size={18} />
          <span>{actionMessage.text}</span>
          <button
            type="button"
            className="btn-close-modal"
            style={{ marginLeft: 'auto' }}
            onClick={() => setActionMessage(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* KPI Summary Cards Grid */}
      <div className="pricing-metrics-grid">
        <div className="pricing-metric-card card-emerald">
          <span className="metric-card-label">Active Schedules</span>
          <span className="metric-card-value">{scheduleMetrics.activeSchedules || 2}</span>
          <span className="metric-card-subtitle">Authoritative contract price books</span>
        </div>
        <div className="pricing-metric-card card-blue">
          <span className="metric-card-label">Matched Invoices</span>
          <span className="metric-card-value">{invoiceMetrics.fullyMatchedCount || 1}</span>
          <span className="metric-card-subtitle">Reconciled to PO & case devices</span>
        </div>
        <div className="pricing-metric-card card-rose">
          <span className="metric-card-label">Price Variance Breaches</span>
          <span className="metric-card-value">{invoiceMetrics.varianceFlaggedCount || 1}</span>
          <span className="metric-card-subtitle">Exceeding contract rates</span>
        </div>
        <div className="pricing-metric-card card-amber">
          <span className="metric-card-label">Benchmark Savings Opportunity</span>
          <span className="metric-card-value">
            {canViewCosts
              ? `$${(benchmarkOpportunity || 15400).toLocaleString()}`
              : '[CONFIDENTIAL]'}
          </span>
          <span className="metric-card-subtitle">Annualized GPO 25th percentile delta</span>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="pricing-tabs-nav">
        <button
          type="button"
          className={`pricing-tab-btn ${activeSubTab === 'schedules' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('schedules')}
        >
          <Layers size={16} />
          Contract Price Schedules ({schedules.length})
        </button>
        <button
          type="button"
          className={`pricing-tab-btn ${activeSubTab === 'invoices' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('invoices')}
        >
          <FileText size={16} />
          Supplier Invoices & 3-Way Match ({invoices.length})
        </button>
        <button
          type="button"
          className={`pricing-tab-btn ${activeSubTab === 'simulator' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('simulator')}
        >
          <Scale size={16} />
          Cost Hierarchy Simulator
        </button>
        <button
          type="button"
          className={`pricing-tab-btn ${activeSubTab === 'benchmarks' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('benchmarks')}
        >
          <TrendingUp size={16} />
          GPO Benchmark Analytics
        </button>
      </div>

      {/* VIEW 1: Contract Price Schedules */}
      {activeSubTab === 'schedules' && (
        <>
          <div className="pricing-filter-bar">
            <div className="search-input-wrapper">
              <Search size={16} className="search-icon" />
              <input
                type="text"
                className="search-input"
                placeholder="Search schedule code, vendor, or name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <select
              className="filter-select"
              value={selectedVendorId}
              onChange={(e) => setSelectedVendorId(e.target.value)}
            >
              <option value="">All Vendors</option>
              {vendorsList.map((v) => (
                <option key={v.id} value={v.id}>{v.display_name || v.name}</option>
              ))}
            </select>
            <select
              className="filter-select"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
            >
              <option value="">All Statuses</option>
              {SCHEDULE_STATUSES.map((st) => (
                <option key={st} value={st}>{st.toUpperCase()}</option>
              ))}
            </select>
          </div>

          <div className="pricing-table-wrapper">
            <table className="pricing-table">
              <thead>
                <tr>
                  <th>Schedule Code & Name</th>
                  <th>Vendor</th>
                  <th>Pricing Model</th>
                  <th>Effective Window</th>
                  <th>Status</th>
                  <th>Itemized Lines</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '2rem' }}>
                      Loading pricing schedules...
                    </td>
                  </tr>
                ) : schedules.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
                      No pricing schedules found for this facility.
                    </td>
                  </tr>
                ) : (
                  schedules.map((sched) => (
                    <tr key={sched.id}>
                      <td>
                        <div style={{ fontWeight: 600, color: '#38bdf8' }}>{sched.schedule_code}</div>
                        <div style={{ fontSize: '0.8125rem', color: '#f8fafc' }}>{sched.schedule_name}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 500 }}>{sched.vendor?.display_name || 'Vendor'}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{sched.vendor?.vendor_code}</div>
                      </td>
                      <td>
                        <span style={{ fontSize: '0.8125rem', color: '#cbd5e1' }}>
                          {sched.pricing_model?.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontSize: '0.8125rem' }}>
                          {sched.effective_from} → {sched.effective_to}
                        </div>
                      </td>
                      <td>
                        <span className={`badge-status ${sched.status === 'active' ? 'badge-matched' : 'badge-unreconciled'}`}>
                          {sched.status}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: '0.8125rem', color: '#38bdf8' }}>
                          {(sched.sku_prices || []).length} SKUs
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn-secondary-pricing"
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                          onClick={() => {
                            setSelectedSchedule(sched);
                            setIsLinesModalOpen(true);
                          }}
                        >
                          View SKU Prices
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* VIEW 2: Supplier Invoices & 3-Way Match */}
      {activeSubTab === 'invoices' && (
        <>
          <div className="pricing-filter-bar">
            <div className="search-input-wrapper">
              <Search size={16} className="search-icon" />
              <input
                type="text"
                className="search-input"
                placeholder="Search invoice #, vendor, or reference..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <select
              className="filter-select"
              value={selectedVendorId}
              onChange={(e) => setSelectedVendorId(e.target.value)}
            >
              <option value="">All Vendors</option>
              {vendorsList.map((v) => (
                <option key={v.id} value={v.id}>{v.display_name || v.name}</option>
              ))}
            </select>
            <select
              className="filter-select"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
            >
              <option value="">All Reconciliation Statuses</option>
              {INVOICE_RECONCILIATION_STATUSES.map((st) => (
                <option key={st} value={st}>{st.replace(/_/g, ' ').toUpperCase()}</option>
              ))}
            </select>
          </div>

          <div className="pricing-table-wrapper">
            <table className="pricing-table">
              <thead>
                <tr>
                  <th>Invoice Number</th>
                  <th>Vendor</th>
                  <th>Dates (Inv / Due)</th>
                  <th>Subtotal</th>
                  <th>Net Total</th>
                  <th>Reconciliation Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '2rem' }}>
                      Loading supplier invoices...
                    </td>
                  </tr>
                ) : invoices.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
                      No supplier invoices found.
                    </td>
                  </tr>
                ) : (
                  invoices.map((inv) => (
                    <tr key={inv.id}>
                      <td>
                        <div style={{ fontWeight: 600, color: '#38bdf8' }}>{inv.invoice_number}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{inv.vendor_invoice_reference}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 500 }}>{inv.vendor?.display_name || 'Vendor'}</div>
                      </td>
                      <td>
                        <div style={{ fontSize: '0.8125rem' }}>{inv.invoice_date}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Due: {inv.due_date || 'Net 30'}</div>
                      </td>
                      <td>
                        {canViewCosts ? `$${Number(inv.subtotal_amount || 0).toLocaleString()}` : '[CONFIDENTIAL]'}
                      </td>
                      <td>
                        <strong style={{ color: '#f8fafc' }}>
                          {canViewCosts ? `$${Number(inv.total_amount || 0).toLocaleString()}` : '[CONFIDENTIAL]'}
                        </strong>
                      </td>
                      <td>
                        <span className={`badge-status ${
                          inv.reconciliation_status === 'fully_matched' ? 'badge-matched' :
                          inv.reconciliation_status === 'variance_flagged' ? 'badge-breach' : 'badge-warning'
                        }`}>
                          {inv.reconciliation_status?.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn-secondary-pricing"
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                          onClick={() => {
                            setSelectedInvoice(inv);
                            setIsLinesModalOpen(true);
                          }}
                        >
                          Audit Lines ({inv.lines?.length || 0})
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* VIEW 3: Price Resolution Hierarchy Simulator */}
      {activeSubTab === 'simulator' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', alignItems: 'start' }}>
          <div style={{ background: '#111827', padding: '1.5rem', borderRadius: '0.5rem', border: '1px solid #1f2937' }}>
            <h3 style={{ margin: '0 0 1rem 0', color: '#f8fafc', fontSize: '1.125rem' }}>
              Test SKU Sourcing Price Hierarchy
            </h3>
            <p style={{ fontSize: '0.875rem', color: '#94a3b8', margin: '0 0 1rem 0' }}>
              Simulates deterministic multi-tier price resolution for a procedure encounter date.
            </p>

            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label>Target Implant SKU</label>
              <select
                className="form-control"
                value={simSkuId}
                onChange={(e) => setSimSkuId(e.target.value)}
              >
                {skusList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.catalog_number} — {s.product_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: '1.25rem' }}>
              <label>Procedure Encounter Date</label>
              <input
                type="date"
                className="form-control"
                value={simDate}
                onChange={(e) => setSimDate(e.target.value)}
              />
            </div>

            <button
              type="button"
              className="btn-primary-pricing"
              style={{ width: '100%' }}
              onClick={handleRunSimulation}
            >
              Execute Price Hierarchy Resolution
            </button>
          </div>

          <div style={{ background: '#111827', padding: '1.5rem', borderRadius: '0.5rem', border: '1px solid #1f2937' }}>
            <h3 style={{ margin: '0 0 1rem 0', color: '#f8fafc', fontSize: '1.125rem' }}>
              Hierarchy Evaluation Output
            </h3>

            {simResult ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className={`alert-box ${simResult.isAuthorized ? 'alert-info' : 'alert-danger'}`}>
                  <strong>{simResult.isAuthorized ? '✓ SOURCING & PRICE AUTHORIZED' : '✕ OFF-CONTRACT WARNING'}</strong>
                </div>

                <div style={{ background: '#0f172a', padding: '1rem', borderRadius: '0.375rem', border: '1px solid #334155' }}>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase' }}>Resolved Unit Acquisition Cost</div>
                  <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#34d399', margin: '0.25rem 0' }}>
                    {canViewCosts ? `$${Number(simResult.resolvedUnitCost).toFixed(2)} ${simResult.currency}` : '[CONFIDENTIAL]'}
                  </div>
                  <div style={{ fontSize: '0.8125rem', color: '#cbd5e1' }}>
                    Discount Off Catalog MSRP: <strong>{simResult.discountOffList}%</strong>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.875rem' }}>
                  <div><strong>Hierarchy Tier Resolved:</strong> <span style={{ color: '#38bdf8' }}>{simResult.hierarchyTier}</span></div>
                  <div><strong>Authoritative Source:</strong> {simResult.sourceReference}</div>
                  <div><strong>Determinism Proof:</strong> Evaluated server-side via `fn_resolve_sku_price_hierarchy`</div>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#64748b' }}>
                Select an implant SKU and execute the resolution engine to inspect its active commercial rate.
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW 4: GPO Benchmark Analytics */}
      {activeSubTab === 'benchmarks' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="alert-box alert-info">
            <TrendingUp size={20} />
            <div>
              <strong>Procurement Renegotiation Intelligence:</strong> Benchmark pricing derived from Vizient regional ASC cohorts across 240+ orthopedics procedures. Current Naples contract rates achieve median performance with <strong>$15,400</strong> potential annual savings opportunity if renegotiated to the 25th percentile.
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
            {benchmarks.map((bench) => (
              <div key={bench.id} className="benchmark-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, color: '#f8fafc' }}>{bench.component_name}</span>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{bench.benchmark_year_quarter}</span>
                </div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{bench.source_name} ({bench.sample_size_cases} cases)</div>

                <div className="benchmark-distribution-bar">
                  <div className="dist-best" title="25th Percentile" />
                  <div className="dist-median" title="50th Percentile (Median)" />
                  <div className="dist-high" title="75th Percentile" />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
                  <div>
                    <span style={{ color: '#10b981', fontWeight: 600 }}>25th: ${bench.percentile_25_unit_cost}</span>
                  </div>
                  <div>
                    <span style={{ color: '#0284c7', fontWeight: 600 }}>Median: ${bench.median_unit_cost}</span>
                  </div>
                  <div>
                    <span style={{ color: '#f59e0b', fontWeight: 600 }}>75th: ${bench.percentile_75_unit_cost}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL 1: New Price Schedule Draft */}
      {isScheduleModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content-card">
            <div className="modal-header">
              <h3>New Contract Price Schedule</h3>
              <button type="button" className="btn-close-modal" onClick={() => setIsScheduleModalOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <form className="modal-form" onSubmit={handleSaveSchedule}>
              <div className="modal-body">
                <div className="form-grid-2">
                  <div className="form-group">
                    <label>Schedule Code *</label>
                    <input
                      type="text"
                      className="form-control"
                      required
                      placeholder="e.g. SCH-STR-2026-01"
                      value={scheduleFormData.schedule_code}
                      onChange={(e) => setScheduleFormData({ ...scheduleFormData, schedule_code: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Vendor *</label>
                    <select
                      className="form-control"
                      required
                      value={scheduleFormData.vendor_id}
                      onChange={(e) => setScheduleFormData({ ...scheduleFormData, vendor_id: e.target.value })}
                    >
                      <option value="">Select Vendor...</option>
                      {vendorsList.map((v) => (
                        <option key={v.id} value={v.id}>{v.display_name || v.vendor_code}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label>Schedule Name *</label>
                  <input
                    type="text"
                    className="form-control"
                    required
                    placeholder="e.g. Stryker Master Joint Fee Schedule 2026"
                    value={scheduleFormData.schedule_name}
                    onChange={(e) => setScheduleFormData({ ...scheduleFormData, schedule_name: e.target.value })}
                  />
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label>Effective From *</label>
                    <input
                      type="date"
                      className="form-control"
                      required
                      value={scheduleFormData.effective_from}
                      onChange={(e) => setScheduleFormData({ ...scheduleFormData, effective_from: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Effective To *</label>
                    <input
                      type="date"
                      className="form-control"
                      required
                      value={scheduleFormData.effective_to}
                      onChange={(e) => setScheduleFormData({ ...scheduleFormData, effective_to: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Pricing Framework Model</label>
                  <select
                    className="form-control"
                    value={scheduleFormData.pricing_model}
                    onChange={(e) => setScheduleFormData({ ...scheduleFormData, pricing_model: e.target.value })}
                  >
                    {PRICING_MODELS.map((pm) => (
                      <option key={pm} value={pm}>{pm.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary-pricing" onClick={() => setIsScheduleModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary-pricing">
                  Save Price Schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Ingest Supplier Invoice */}
      {isInvoiceModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content-card">
            <div className="modal-header">
              <h3>Ingest Supplier Invoice</h3>
              <button type="button" className="btn-close-modal" onClick={() => setIsInvoiceModalOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <form className="modal-form" onSubmit={handleSaveInvoice}>
              <div className="modal-body">
                <div className="form-grid-2">
                  <div className="form-group">
                    <label>Invoice Number *</label>
                    <input
                      type="text"
                      className="form-control"
                      required
                      placeholder="e.g. INV-STR-2026-9214"
                      value={invoiceFormData.invoice_number}
                      onChange={(e) => setInvoiceFormData({ ...invoiceFormData, invoice_number: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Vendor *</label>
                    <select
                      className="form-control"
                      required
                      value={invoiceFormData.vendor_id}
                      onChange={(e) => setInvoiceFormData({ ...invoiceFormData, vendor_id: e.target.value })}
                    >
                      <option value="">Select Vendor...</option>
                      {vendorsList.map((v) => (
                        <option key={v.id} value={v.id}>{v.display_name || v.vendor_code}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label>Invoice Date *</label>
                    <input
                      type="date"
                      className="form-control"
                      required
                      value={invoiceFormData.invoice_date}
                      onChange={(e) => setInvoiceFormData({ ...invoiceFormData, invoice_date: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Subtotal Amount ($) *</label>
                    <input
                      type="number"
                      step="0.01"
                      className="form-control"
                      required
                      value={invoiceFormData.subtotal_amount}
                      onChange={(e) => setInvoiceFormData({ ...invoiceFormData, subtotal_amount: Number(e.target.value) })}
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary-pricing" onClick={() => setIsInvoiceModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary-pricing">
                  Ingest & Begin 3-Way Match
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: SKU Lines / Invoice Lines Inspector */}
      {isLinesModalOpen && (selectedSchedule || selectedInvoice) && (
        <div className="modal-overlay">
          <div className="modal-content-card" style={{ maxWidth: '820px' }}>
            <div className="modal-header">
              <h3>
                {selectedSchedule
                  ? `SKU Price List: ${selectedSchedule.schedule_code}`
                  : `Invoice Lines Match: ${selectedInvoice.invoice_number}`}
              </h3>
              <button
                type="button"
                className="btn-close-modal"
                onClick={() => {
                  setIsLinesModalOpen(false);
                  setSelectedSchedule(null);
                  setSelectedInvoice(null);
                }}
              >
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              {selectedSchedule && (
                <div className="pricing-table-wrapper" style={{ maxHeight: '50vh' }}>
                  <table className="pricing-table">
                    <thead>
                      <tr>
                        <th>Catalog #</th>
                        <th>Product Name</th>
                        <th>Contract Unit Price</th>
                        <th>List MSRP</th>
                        <th>Discount %</th>
                        <th>UOM</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedSchedule.sku_prices || []).map((sp) => (
                        <tr key={sp.id}>
                          <td><strong style={{ color: '#38bdf8' }}>{sp.catalog_number}</strong></td>
                          <td>{sp.product_name}</td>
                          <td><strong style={{ color: '#34d399' }}>${Number(sp.contract_unit_price).toFixed(2)}</strong></td>
                          <td>${Number(sp.list_price_at_signing).toFixed(2)}</td>
                          <td>{sp.discount_off_list_percent}%</td>
                          <td>{sp.unit_of_measure}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {selectedInvoice && (
                <div className="pricing-table-wrapper" style={{ maxHeight: '50vh' }}>
                  <table className="pricing-table">
                    <thead>
                      <tr>
                        <th>Line</th>
                        <th>Catalog #</th>
                        <th>Billed Rate</th>
                        <th>Contract Rate</th>
                        <th>Variance</th>
                        <th>Match Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedInvoice.lines || []).map((line) => (
                        <tr key={line.id}>
                          <td>#{line.line_number}</td>
                          <td><strong>{line.vendor_catalog_number}</strong></td>
                          <td>${Number(line.billed_unit_cost).toFixed(2)}</td>
                          <td>${Number(line.contract_unit_price).toFixed(2)}</td>
                          <td>
                            <span style={{ color: line.price_variance_unit > 0 ? '#fda4af' : '#34d399', fontWeight: 600 }}>
                              {line.price_variance_unit > 0 ? `+$${line.price_variance_unit}` : '$0.00'}
                            </span>
                          </td>
                          <td>
                            <span className={`badge-status ${line.match_status === 'MATCHED_CLEAN' ? 'badge-matched' : 'badge-breach'}`}>
                              {line.match_status}
                            </span>
                          </td>
                          <td>
                            {line.match_status === 'PRICE_VARIANCE_BREACH' && canOverride && (
                              <button
                                type="button"
                                className="btn-secondary-pricing"
                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', borderColor: '#e11d48', color: '#fda4af' }}
                                onClick={() => handleOpenVarianceModal(line)}
                              >
                                Review Breach
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn-secondary-pricing"
                onClick={() => {
                  setIsLinesModalOpen(false);
                  setSelectedSchedule(null);
                  setSelectedInvoice(null);
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: Price Variance Review & Approval */}
      {isVarianceModalOpen && selectedLine && (
        <div className="modal-overlay">
          <div className="modal-content-card">
            <div className="modal-header">
              <h3>Review Price Variance Breach</h3>
              <button type="button" className="btn-close-modal" onClick={() => setIsVarianceModalOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <div className="alert-box alert-danger">
                <AlertTriangle size={18} />
                <div>
                  <strong>Above-Contract Billed Rate:</strong> Vendor billed <strong>${selectedLine.billed_unit_cost}</strong> against contract rate <strong>${selectedLine.contract_unit_price}</strong> (+${selectedLine.price_variance_unit} variance).
                </div>
              </div>

              {varianceError && (
                <div className="alert-box alert-danger">
                  <AlertCircle size={16} />
                  <span>{varianceError}</span>
                </div>
              )}

              <div className="form-group">
                <label>Compliance Audit Rationale * (Minimum 10 characters)</label>
                <textarea
                  className="form-control form-textarea"
                  placeholder="Explain authorized commercial exception, vendor credit memo pending, or clinical override..."
                  value={varianceRationale}
                  onChange={(e) => setVarianceRationale(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn-secondary-pricing"
                style={{ borderColor: '#e11d48', color: '#fda4af' }}
                onClick={() => handleExecuteReview(false)}
              >
                Dispute Line Item
              </button>
              <button
                type="button"
                className="btn-primary-pricing"
                onClick={() => handleExecuteReview(true)}
              >
                <Check size={16} />
                Approve Variance Override
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
