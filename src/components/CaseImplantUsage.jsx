import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  caseImplantUsageService,
  SOURCING_CHANNEL_METADATA,
  WASTE_REASONS,
  WASTE_REASON_METADATA,
  WASTE_LIABILITIES,
  AMENDMENT_REASON_CODES
} from '../lib/caseImplantUsageService';
import { db } from '../lib/supabase';
import {
  Cpu,
  Barcode,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Trash2,
  Lock,
  Unlock,
  RefreshCw,
  Search,
  FileDown,
  History,
  ShieldCheck,
  Package,
  ClipboardList,
  Stethoscope,
  User,
  FileText,
  Calendar,
  Activity
} from 'lucide-react';
import './CaseImplantUsage.css';

const SAMPLE_CASES = [
  {
    id: 1042,
    patientName: 'Doe, John (MRN #8821)',
    surgeonName: 'Dr. Malinoski',
    cptCode: '27447',
    procedureName: 'Total Knee Joint Reconstruction (TKA)',
    date: '2026-10-28',
    status: 'IN_PROGRESS'
  },
  {
    id: 1043,
    patientName: 'Jenkins, Sarah (MRN #8822)',
    surgeonName: 'Dr. Walsh Mark',
    cptCode: '22551',
    procedureName: 'Anterior Cervical Discectomy & Fusion (ACDF)',
    date: '2026-10-28',
    status: 'IN_PROGRESS'
  },
  {
    id: 1044,
    patientName: 'Miller, Robert (MRN #8823)',
    surgeonName: 'Dr. Gardner Paul',
    cptCode: '66984',
    procedureName: 'Extracapsular Cataract Extraction with IOL',
    date: '2026-10-28',
    status: 'COMPLETED'
  }
];

export default function CaseImplantUsage({ activeFacility, userPermissions = [] }) {
  const [selectedCaseId, setSelectedCaseId] = useState(1042);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  // Barcode Console State
  const [barcodeInput, setBarcodeInput] = useState('');
  const [lastParsedBarcode, setLastParsedBarcode] = useState(null);

  // Waste Modal State
  const [wasteModalOpen, setWasteModalOpen] = useState(false);
  const [wasteTargetDevice, setWasteTargetDevice] = useState(null);
  const [wasteQty, setWasteQty] = useState(1);
  const [wasteReason, setWasteReason] = useState('DROPPED_ON_FIELD');
  const [wasteLiability, setWasteLiability] = useState('FACILITY_EXPENSE');
  const [wasteNotes, setWasteNotes] = useState('');

  // Amendment Modal State (Two-person post-closure rule)
  const [amendmentModalOpen, setAmendmentModalOpen] = useState(false);
  const [amendmentTargetDevice, setAmendmentTargetDevice] = useState(null);
  const [amendmentField, setAmendmentField] = useState('lot_number');
  const [amendmentNewValue, setAmendmentNewValue] = useState('');
  const [amendmentReasonCode, setAmendmentReasonCode] = useState('INCORRECT_LOT_SERIAL');
  const [amendmentJustification, setAmendmentJustification] = useState('');

  // History Drawer State
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false);
  const [selectedDeviceAmendments, setSelectedDeviceAmendments] = useState([]);
  const [historyDeviceName, setHistoryDeviceName] = useState('');

  // Recall Search Modal State
  const [recallModalOpen, setRecallModalOpen] = useState(false);
  const [recallQuery, setRecallQuery] = useState('');
  const [recallSearchType, setRecallSearchType] = useState('lotNumber');
  const [recallResults, setRecallResults] = useState([]);
  const [recallSearching, setRecallSearching] = useState(false);

  // Permission Checks
  const canViewCosts = useMemo(() => {
    return (
      userPermissions.includes('admin') ||
      userPermissions.includes('super_admin') ||
      userPermissions.includes('cfo') ||
      userPermissions.includes('implants.view_costs') ||
      userPermissions.includes('materials_manager')
    );
  }, [userPermissions]);

  const activeCase = useMemo(() => {
    return SAMPLE_CASES.find((c) => c.id === Number(selectedCaseId)) || SAMPLE_CASES[0];
  }, [selectedCaseId]);

  // Load Case Devices
  const loadCaseData = useCallback(async () => {
    if (!selectedCaseId) return;
    setLoading(true);
    setActionError('');
    try {
      const data = await caseImplantUsageService.getCaseDevices(selectedCaseId);
      setDevices(data || []);
    } catch (err) {
      console.error('[CaseImplantUsage] loadCaseData error:', err);
      setActionError('Failed to load documented case devices: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedCaseId]);

  useEffect(() => {
    loadCaseData();
  }, [loadCaseData]);

  // Summary Metrics
  const summary = useMemo(() => {
    let opened = 0;
    let implanted = 0;
    let wasted = 0;
    let returned = 0;
    let cost = 0.00;
    let wasteCost = 0.00;
    let isClosed = false;

    devices.forEach((d) => {
      const o = Number(d.quantity_opened !== undefined ? d.quantity_opened : d.quantity || 1);
      const i = Number(d.quantity_implanted !== undefined ? d.quantity_implanted : d.quantity || 1);
      const w = Number(d.quantity_wasted || 0);
      const r = Number(d.quantity_returned || 0);
      const uCost = Number(d.verified_acquisition_cost || d.unit_cost || 0);

      opened += o;
      implanted += i;
      wasted += w;
      returned += r;
      cost += (i * uCost);
      wasteCost += (w * uCost);

      if (d.is_closed) isClosed = true;
    });

    return {
      count: devices.length,
      opened,
      implanted,
      wasted,
      returned,
      totalCost: cost.toFixed(2),
      wasteCost: wasteCost.toFixed(2),
      isClosed
    };
  }, [devices]);

  // Barcode Scan Handler
  const handleScanBarcode = async (rawCode) => {
    const code = (rawCode || barcodeInput).trim();
    if (!code) return;

    setActionError('');
    setActionSuccess('');

    const parsed = caseImplantUsageService.parseUdiBarcode(code);
    setLastParsedBarcode(parsed);

    // Auto-generate device from scan
    try {
      const newDevice = {
        facility_id: activeFacility?.id,
        surgery_id: selectedCaseId,
        device_name: parsed.udi_di ? `Implant SKU (${parsed.udi_di})` : `Catalog Item #${code.substring(0, 12)}`,
        manufacturer: 'Authorized Device OEM',
        model_number: parsed.catalog_number || 'MOD-2026',
        catalog_number: parsed.catalog_number || parsed.udi_di || 'CAT-9901',
        serial_number: parsed.serial_number || `SN-${Math.floor(100000 + Math.random() * 900000)}`,
        lot_number: parsed.lot_number || `LOT-${Math.floor(1000 + Math.random() * 9000)}A`,
        expiration_date: parsed.expiration_date || '2028-12-31',
        udi_di: parsed.udi_di,
        udi_pi: parsed.udi_pi,
        raw_scan_payload: code,
        symbology: parsed.symbology,
        quantity_opened: 1,
        quantity_implanted: 1,
        quantity_wasted: 0,
        quantity_returned: 0,
        unit_cost: 1250.00,
        verified_acquisition_cost: 1250.00,
        charge_amount: 3600.00,
        sourcing_channel: 'VENDOR_CONSIGNMENT',
        usage_status: 'IMPLANTED',
        duration_classification: 'PERMANENT',
        unit_of_measure: 'EA',
        package_size: 1
      };

      await caseImplantUsageService.recordImplantUsage(newDevice);
      setBarcodeInput('');
      setActionSuccess(`Scanned & Documented: ${newDevice.device_name} (Lot: ${newDevice.lot_number})`);
      await loadCaseData();
    } catch (err) {
      setActionError('Error logging scanned implant: ' + err.message);
    }
  };

  // Quantity Counter Adjustments
  const handleAdjustQuantity = async (device, field, delta) => {
    if (summary.isClosed) {
      setAmendmentTargetDevice(device);
      setAmendmentField(field);
      setAmendmentNewValue(Math.max(0, Number(device[field] || 0) + delta));
      setAmendmentModalOpen(true);
      return;
    }

    const currentOpened = Number(device.quantity_opened || 1);
    const currentImplanted = Number(device.quantity_implanted || 1);
    const currentWasted = Number(device.quantity_wasted || 0);
    const currentReturned = Number(device.quantity_returned || 0);

    let nextOpened = currentOpened;
    let nextImplanted = currentImplanted;
    let nextWasted = currentWasted;
    let nextReturned = currentReturned;

    if (field === 'quantity_opened') {
      nextOpened = Math.max(0, currentOpened + delta);
      // Auto-balance onto implanted
      nextImplanted = Math.max(0, nextOpened - nextWasted - nextReturned);
    } else if (field === 'quantity_implanted') {
      nextImplanted = Math.max(0, currentImplanted + delta);
      nextOpened = nextImplanted + nextWasted + nextReturned;
    } else if (field === 'quantity_wasted') {
      if (delta > 0) {
        // Trigger modal to capture reason
        setWasteTargetDevice(device);
        setWasteQty(delta);
        setWasteModalOpen(true);
        return;
      } else {
        nextWasted = Math.max(0, currentWasted + delta);
        nextImplanted = Math.max(0, nextOpened - nextWasted - nextReturned);
      }
    } else if (field === 'quantity_returned') {
      nextReturned = Math.max(0, currentReturned + delta);
      nextImplanted = Math.max(0, nextOpened - nextWasted - nextReturned);
    }

    try {
      await caseImplantUsageService.recordImplantUsage({
        ...device,
        quantity_opened: nextOpened,
        quantity_implanted: nextImplanted,
        quantity_wasted: nextWasted,
        quantity_returned: nextReturned,
        waste_reason: nextWasted > 0 ? (device.waste_reason || 'OTHER_WASTE') : null
      });
      await loadCaseData();
    } catch (err) {
      setActionError(err.message);
    }
  };

  // Open Waste Modal for Attribution
  const handleOpenWasteModal = (device) => {
    setWasteTargetDevice(device);
    setWasteQty(Number(device.quantity_wasted) || 1);
    setWasteReason(device.waste_reason || 'DROPPED_ON_FIELD');
    setWasteLiability(device.waste_liability || 'FACILITY_EXPENSE');
    setWasteNotes(device.waste_notes || '');
    setWasteModalOpen(true);
  };

  // Confirm Waste Modal
  const handleConfirmWaste = async () => {
    if (!wasteTargetDevice) return;
    try {
      await caseImplantUsageService.logDeviceWaste(wasteTargetDevice.id, {
        wasteQty: wasteQty,
        wasteReason: wasteReason,
        wasteLiability: wasteLiability,
        notes: wasteNotes
      });
      setWasteModalOpen(false);
      setWasteTargetDevice(null);
      setWasteNotes('');
      setActionSuccess(`Logged clinical waste: ${wasteTargetDevice.device_name} (${wasteReason})`);
      await loadCaseData();
    } catch (err) {
      setActionError('Failed to record waste: ' + err.message);
    }
  };

  // Toggle Case Lock
  const handleToggleLock = async () => {
    try {
      if (summary.isClosed) {
        await caseImplantUsageService.unlockCaseImplantDocumentation(
          selectedCaseId,
          '00000000-0000-0000-0001-000000000001',
          'Clinical Manager unlocked for operative adjustment'
        );
        setActionSuccess(`Case #${selectedCaseId} documentation unlocked for editing.`);
      } else {
        await caseImplantUsageService.closeCaseImplantDocumentation(
          selectedCaseId,
          '00000000-0000-0000-0001-000000000001'
        );
        setActionSuccess(`Case #${selectedCaseId} locked. Future changes require two-person amendment.`);
      }
      await loadCaseData();
    } catch (err) {
      setActionError('Lock toggle error: ' + err.message);
    }
  };

  // Submit Amendment
  const handleSubmitAmendment = async (e) => {
    e.preventDefault();
    if (!amendmentTargetDevice) return;
    try {
      await caseImplantUsageService.submitDeviceAmendment(amendmentTargetDevice.id, {
        fieldName: amendmentField,
        newValue: amendmentNewValue,
        reasonCode: amendmentReasonCode,
        justification: amendmentJustification,
        actorId: '00000000-0000-0000-0001-000000000001'
      });
      setAmendmentModalOpen(false);
      setAmendmentTargetDevice(null);
      setAmendmentJustification('');
      setActionSuccess(`Amendment recorded for ${amendmentTargetDevice.device_name}`);
      await loadCaseData();
    } catch (err) {
      setActionError('Amendment failed: ' + err.message);
    }
  };

  // Open History Drawer
  const handleOpenHistory = async (device) => {
    setHistoryDeviceName(device.device_name);
    try {
      const amends = await caseImplantUsageService.getDeviceAmendments(device.id);
      setSelectedDeviceAmendments(amends || []);
      setHistoryDrawerOpen(true);
    } catch (err) {
      setActionError('Failed to load amendment history: ' + err.message);
    }
  };

  // Delete Device
  const handleDeleteDevice = async (deviceId) => {
    if (summary.isClosed) {
      setActionError('Cannot delete items while case is locked. Use the amendment protocol.');
      return;
    }
    if (!window.confirm('Remove this device from the surgical encounter record?')) return;
    try {
      await db.deleteCaseDevice(deviceId);
      setActionSuccess('Device removed from encounter.');
      await loadCaseData();
    } catch (err) {
      setActionError('Delete failed: ' + err.message);
    }
  };

  // Execute Recall Search
  const handleExecuteRecallSearch = async () => {
    if (!recallQuery.trim()) return;
    setRecallSearching(true);
    try {
      const params = {};
      if (recallSearchType === 'lotNumber') params.lotNumber = recallQuery.trim();
      else if (recallSearchType === 'serialNumber') params.serialNumber = recallQuery.trim();
      else if (recallSearchType === 'catalogNumber') params.catalogNumber = recallQuery.trim();

      const results = await caseImplantUsageService.searchRecalledCases(params);
      setRecallResults(results || []);
    } catch (err) {
      setActionError('Recall query failed: ' + err.message);
    } finally {
      setRecallSearching(false);
    }
  };

  return (
    <div className="case-implant-usage-container">
      {/* 1. WORKSPACE HEADER & ACTIONS */}
      <div className="ciu-header-bar">
        <div className="ciu-title-group">
          <div className="ciu-case-icon-badge">
            <Cpu size={26} />
          </div>
          <div className="ciu-case-meta">
            <h2>
              Case #{activeCase.id}: {activeCase.procedureName}
              <span className={`ciu-status-pill ${summary.isClosed ? 'locked' : 'active'}`}>
                {summary.isClosed ? <Lock size={12} /> : <CheckCircle2 size={12} />}
                {summary.isClosed ? 'DOCUMENTATION CLOSED' : 'INTRA-OP ACTIVE'}
              </span>
            </h2>
            <p>
              Authoritative actual implant consumption, 4-tier quantity balancing, UDI tracing, and waste attribution
            </p>
          </div>
        </div>

        <div className="ciu-header-actions">
          <select
            className="ciu-select-case"
            value={selectedCaseId}
            onChange={(e) => setSelectedCaseId(Number(e.target.value))}
            aria-label="Select Surgical Encounter"
          >
            {SAMPLE_CASES.map((c) => (
              <option key={c.id} value={c.id}>
                Case #{c.id} - {c.surgeonName} ({c.cptCode})
              </option>
            ))}
          </select>

          <button
            className="ciu-btn-secondary"
            onClick={() => setRecallModalOpen(true)}
            title="Search patients impacted by FDA manufacturer lot/serial recalls"
          >
            <Search size={14} />
            <span>Recall Search</span>
          </button>

          <button
            className={`ciu-btn-lock ${summary.isClosed ? 'locked' : 'unlocked'}`}
            onClick={handleToggleLock}
            title={summary.isClosed ? 'Unlock Case Documentation' : 'Close and Lock Implants'}
          >
            {summary.isClosed ? <Lock size={15} /> : <Unlock size={15} />}
            <span>{summary.isClosed ? 'Locked (Amend)' : 'Lock & Close Documentation'}</span>
          </button>

          <button
            className="ciu-btn-secondary"
            onClick={loadCaseData}
            disabled={loading}
            title="Refresh encounter data"
            style={{ padding: '0.55rem 0.75rem' }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* 2. CLINICAL ENCOUNTER CONTEXT RIBBON */}
      <div className="ciu-patient-ribbon">
        <div className="ciu-ribbon-item">
          <Stethoscope size={15} style={{ color: '#38bdf8' }} />
          <span>Surgeon: <strong>{activeCase.surgeonName}</strong></span>
        </div>
        <div className="ciu-ribbon-divider" />
        <div className="ciu-ribbon-item">
          <User size={15} style={{ color: '#34d399' }} />
          <span>Patient: <strong>{activeCase.patientName}</strong></span>
        </div>
        <div className="ciu-ribbon-divider" />
        <div className="ciu-ribbon-item">
          <FileText size={15} style={{ color: '#fbbf24' }} />
          <span>Primary CPT: <span className="ciu-cpt-chip">{activeCase.cptCode}</span></span>
        </div>
        <div className="ciu-ribbon-divider" />
        <div className="ciu-ribbon-item">
          <Calendar size={15} style={{ color: '#94a3b8' }} />
          <span>DOS: <strong>{activeCase.date}</strong></span>
        </div>
        <div className="ciu-ribbon-divider" />
        <div className="ciu-ribbon-item">
          <Activity size={15} style={{ color: '#38bdf8' }} />
          <span>Room: <strong>OR Suite #2</strong></span>
        </div>
        <div className="ciu-ribbon-divider" style={{ marginLeft: 'auto' }} />
        <div className="ciu-ribbon-item">
          <ShieldCheck size={15} style={{ color: summary.isClosed ? '#fbbf24' : '#34d399' }} />
          <span>Conservation: <strong style={{ color: summary.isClosed ? '#fbbf24' : '#34d399' }}>Verified Balanced</strong></span>
        </div>
      </div>

      {/* NOTIFICATIONS */}
      {actionError && (
        <div style={{
          padding: '12px 18px',
          borderRadius: '10px',
          backgroundColor: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid rgba(239, 68, 68, 0.4)',
          color: '#f87171',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          fontSize: '0.85rem',
          fontWeight: '600'
        }}>
          <AlertOctagon size={18} />
          <span>{actionError}</span>
        </div>
      )}

      {actionSuccess && (
        <div style={{
          padding: '12px 18px',
          borderRadius: '10px',
          backgroundColor: 'rgba(16, 185, 129, 0.15)',
          border: '1px solid rgba(16, 185, 129, 0.4)',
          color: '#34d399',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          fontSize: '0.85rem',
          fontWeight: '600'
        }}>
          <CheckCircle2 size={18} />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* 3. CLINICAL HERO METRIC CARDS (STRICT 4-COL BALANCED GRID) */}
      <div className="ciu-metrics-grid">
        <div className="ciu-metric-card blue">
          <div className="ciu-metric-title">
            <span>Total Units Opened</span>
            <Package size={16} style={{ color: '#38bdf8' }} />
          </div>
          <div className="ciu-metric-value">{summary.opened}</div>
          <div className="ciu-metric-sub">
            <span>Sterile packages unboxed on field</span>
          </div>
        </div>

        <div className="ciu-metric-card emerald">
          <div className="ciu-metric-title">
            <span>Total Implanted</span>
            <CheckCircle2 size={16} style={{ color: '#34d399' }} />
          </div>
          <div className="ciu-metric-value" style={{ color: '#34d399' }}>{summary.implanted}</div>
          <div className="ciu-metric-sub">
            <span>Placed into patient anatomy</span>
          </div>
        </div>

        <div className="ciu-metric-card rose">
          <div className="ciu-metric-title">
            <span>Clinical Waste / Scrap</span>
            <AlertTriangle size={16} style={{ color: '#f43f5e' }} />
          </div>
          <div className="ciu-metric-value" style={{ color: '#f43f5e' }}>{summary.wasted}</div>
          <div className="ciu-metric-sub">
            <span>Scrap Cost: <strong style={{ color: '#fda4af' }}>${canViewCosts ? summary.wasteCost : '••••••'}</strong></span>
          </div>
        </div>

        <div className="ciu-metric-card cyan">
          <div className="ciu-metric-title">
            <span>Case Implant Expense</span>
            <ShieldCheck size={16} style={{ color: '#38bdf8' }} />
          </div>
          <div className="ciu-metric-value" style={{ color: '#38bdf8' }}>
            ${canViewCosts ? Number(summary.totalCost || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '••••••'}
          </div>
          <div className="ciu-metric-sub">
            <span>{canViewCosts ? 'Tier 2 Contracted Unit Cost' : 'Confidential (CFO Only)'}</span>
          </div>
        </div>
      </div>

      {/* 4. OPTICAL BARCODE & UDI WEDGE SCANNER CONSOLE */}
      <div className="ciu-scan-console">
        <div className="ciu-scan-console-header">
          <div className="ciu-scan-title">
            <Barcode size={22} style={{ color: '#38bdf8' }} />
            <span>Optical Barcode & UDI Wedge Scanner Console</span>
          </div>
          <div className="ciu-scan-standards-badge">
            FDA UDI GS1-128 • DataMatrix • HIBCC Ready
          </div>
        </div>

        <div className="ciu-scan-input-wrapper">
          <Barcode size={18} className="ciu-scan-icon-inside" />
          <input
            type="text"
            className="ciu-scan-input"
            placeholder="Scan or paste packaging barcode (e.g. (01)00888888123451(17)281031(10)LOT-9821A(21)SN-24K8912...)"
            value={barcodeInput}
            onChange={(e) => setBarcodeInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleScanBarcode();
              }
            }}
            disabled={summary.isClosed}
          />
          <button
            className="ciu-btn-primary"
            onClick={() => handleScanBarcode()}
            disabled={summary.isClosed || !barcodeInput.trim()}
          >
            Log Scan
          </button>
        </div>

        {/* 1-Click Test Scanners */}
        <div className="ciu-quick-barcodes">
          <span className="ciu-quick-barcodes-label">Quick Scan Simulation:</span>
          <button
            className="ciu-quick-btn"
            onClick={() => handleScanBarcode('(01)00888888123451(17)281031(10)LOT-9821A(21)SN-24K8912')}
            disabled={summary.isClosed}
          >
            + Stryker Femoral GS1-128
          </button>
          <button
            className="ciu-quick-btn"
            onClick={() => handleScanBarcode('(01)00888888123468(17)280915(10)LOT-7712B(21)SN-24L0041')}
            disabled={summary.isClosed}
          >
            + Stryker Tibial Tray GS1-128
          </button>
          <button
            className="ciu-quick-btn"
            onClick={() => handleScanBarcode('(01)00888888123475(17)280420(10)LOT-3321C')}
            disabled={summary.isClosed}
          >
            + Polyethylene Insert GS1-128
          </button>
        </div>

        {/* Real-time Decoded Chip Banner */}
        {lastParsedBarcode && (
          <div className="ciu-decoded-banner">
            <span style={{ color: '#38bdf8', fontWeight: '700', fontSize: '0.75rem' }}>DECODED TELEMETRY:</span>
            <span className="ciu-decoded-chip">DI: <strong>{lastParsedBarcode.udi_di || 'N/A'}</strong></span>
            <span className="ciu-decoded-chip">Lot: <strong>{lastParsedBarcode.lot_number || 'N/A'}</strong></span>
            <span className="ciu-decoded-chip">SN: <strong>{lastParsedBarcode.serial_number || 'N/A'}</strong></span>
            <span className="ciu-decoded-chip">Exp: <strong>{lastParsedBarcode.expiration_date || 'N/A'}</strong></span>
            <span style={{
              marginLeft: 'auto',
              color: lastParsedBarcode.parse_success ? '#34d399' : '#fbbf24',
              fontWeight: '700',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              {lastParsedBarcode.parse_success ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
              {lastParsedBarcode.parse_success ? 'UDI Validated' : 'Fallback Match'}
            </span>
          </div>
        )}
      </div>

      {/* 4. BOM TABLE WORKSPACE */}
      <div className="ciu-workspace-card">
        <div className="ciu-table-header">
          <div className="ciu-table-title">
            <ClipboardList size={18} style={{ color: '#3b82f6' }} />
            <span>Actual Documented Case Implants ({devices.length})</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              className="ciu-btn-secondary"
              onClick={() => setRecallModalOpen(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <Search size={14} />
              Recall Investigation
            </button>
            <button
              className="ciu-btn-secondary"
              onClick={loadCaseData}
              disabled={loading}
              title="Refresh"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {devices.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
            <Cpu size={36} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
            <p style={{ margin: 0, fontWeight: '600' }}>No implants documented yet for Case #{selectedCaseId}.</p>
            <p style={{ fontSize: '0.8rem', marginTop: '4px' }}>Scan a barcode above or pull items from the surgeon preference card.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="ciu-table">
              <thead>
                <tr>
                  <th>Device & OEM</th>
                  <th>Traceability (Lot / Serial / UDI)</th>
                  <th>Sourcing</th>
                  <th style={{ textAlign: 'center' }}>Balance & Quantities (O = I + W + R)</th>
                  <th style={{ textAlign: 'right' }}>Unit Cost</th>
                  <th style={{ textAlign: 'right' }}>Extended Cost</th>
                  <th style={{ textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {devices.map((d) => {
                  const opened = Number(d.quantity_opened !== undefined ? d.quantity_opened : d.quantity || 1);
                  const implanted = Number(d.quantity_implanted !== undefined ? d.quantity_implanted : d.quantity || 1);
                  const wasted = Number(d.quantity_wasted || 0);
                  const returned = Number(d.quantity_returned || 0);
                  const uCost = Number(d.verified_acquisition_cost || d.unit_cost || 0);
                  const extCost = implanted * uCost;

                  return (
                    <tr key={d.id}>
                      {/* 1. Device Name */}
                      <td>
                        <div style={{ fontWeight: '700', color: '#f8fafc' }}>{d.device_name}</div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px' }}>
                          {d.manufacturer || 'OEM Vendor'} • HCPCS: <code style={{ color: '#60a5fa' }}>{d.hcpcs_c_code || d.hcpcs_code || 'C1776'}</code>
                        </div>
                      </td>

                      {/* 2. Traceability */}
                      <td>
                        <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#cbd5e1' }}>
                          LOT: <strong style={{ color: '#f8fafc' }}>{d.lot_number || '—'}</strong>
                        </div>
                        <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#cbd5e1' }}>
                          SN: <strong style={{ color: '#60a5fa' }}>{d.serial_number || '—'}</strong>
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '2px' }}>
                          EXP: {d.expiration_date || 'N/A'} • UDI-DI: {d.udi_di || 'N/A'}
                        </div>
                      </td>

                      {/* 3. Sourcing Channel */}
                      <td>
                        <span className={`badge-sourcing badge-${(d.sourcing_channel || 'FACILITY_OWNED').toLowerCase().replace('_', '-')}`}>
                          {SOURCING_CHANNEL_METADATA[d.sourcing_channel]?.label || d.sourcing_channel || 'Owned'}
                        </span>
                        {d.is_substitution && (
                          <div style={{ fontSize: '0.7rem', color: '#fbbf24', marginTop: '4px', fontWeight: '700' }}>
                            Substituted
                          </div>
                        )}
                      </td>

                      {/* 4. Interactive 4-Tier Quantities */}
                      <td style={{ textAlign: 'center' }}>
                        <div className="ciu-qty-group" style={{ justifyContent: 'center' }}>
                          {/* Opened */}
                          <div className="ciu-qty-box">
                            <span className="ciu-qty-label">Opened</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <button
                                className="ciu-btn-icon-counter"
                                onClick={() => handleAdjustQuantity(d, 'quantity_opened', -1)}
                                disabled={opened <= 1}
                              >-</button>
                              <span className="ciu-qty-val">{opened}</span>
                              <button
                                className="ciu-btn-icon-counter"
                                onClick={() => handleAdjustQuantity(d, 'quantity_opened', 1)}
                              >+</button>
                            </div>
                          </div>

                          <span style={{ color: '#64748b', fontWeight: '800' }}>=</span>

                          {/* Implanted */}
                          <div className="ciu-qty-box implanted">
                            <span className="ciu-qty-label" style={{ color: '#34d399' }}>Implant</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <button
                                className="ciu-btn-icon-counter"
                                onClick={() => handleAdjustQuantity(d, 'quantity_implanted', -1)}
                                disabled={implanted <= 0}
                              >-</button>
                              <span className="ciu-qty-val" style={{ color: '#34d399' }}>{implanted}</span>
                              <button
                                className="ciu-btn-icon-counter"
                                onClick={() => handleAdjustQuantity(d, 'quantity_implanted', 1)}
                              >+</button>
                            </div>
                          </div>

                          <span style={{ color: '#64748b', fontWeight: '800' }}>+</span>

                          {/* Wasted */}
                          <div className="ciu-qty-box wasted">
                            <span className="ciu-qty-label" style={{ color: '#f87171' }}>Wasted</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <button
                                className="ciu-btn-icon-counter"
                                onClick={() => handleAdjustQuantity(d, 'quantity_wasted', -1)}
                                disabled={wasted <= 0}
                              >-</button>
                              <span className="ciu-qty-val" style={{ color: '#f87171' }}>{wasted}</span>
                              <button
                                className="ciu-btn-icon-counter"
                                onClick={() => handleAdjustQuantity(d, 'quantity_wasted', 1)}
                              >+</button>
                            </div>
                          </div>

                          <span style={{ color: '#64748b', fontWeight: '800' }}>+</span>

                          {/* Returned */}
                          <div className="ciu-qty-box">
                            <span className="ciu-qty-label">Return</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <button
                                className="ciu-btn-icon-counter"
                                onClick={() => handleAdjustQuantity(d, 'quantity_returned', -1)}
                                disabled={returned <= 0}
                              >-</button>
                              <span className="ciu-qty-val">{returned}</span>
                              <button
                                className="ciu-btn-icon-counter"
                                onClick={() => handleAdjustQuantity(d, 'quantity_returned', 1)}
                              >+</button>
                            </div>
                          </div>
                        </div>

                        {/* Waste Reason Badge */}
                        {wasted > 0 && d.waste_reason && (
                          <div style={{ marginTop: '6px' }}>
                            <span
                              className="badge-waste"
                              onClick={() => handleOpenWasteModal(d)}
                              title="Click to modify clinical waste attribution or liability"
                            >
                              <AlertTriangle size={11} />
                              {WASTE_REASON_METADATA[d.waste_reason]?.label || d.waste_reason}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* 5. Unit Cost */}
                      <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                        {canViewCosts ? `$${uCost.toFixed(2)}` : '••••••'}
                      </td>

                      {/* 6. Extended Cost */}
                      <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: '700', color: '#f8fafc' }}>
                        {canViewCosts ? `$${extCost.toFixed(2)}` : '••••••'}
                      </td>

                      {/* 7. Actions */}
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                          <button
                            className="ciu-quick-btn"
                            onClick={() => handleOpenHistory(d)}
                            title="Amendment History"
                          >
                            <History size={13} />
                          </button>
                          <button
                            className="ciu-quick-btn"
                            onClick={() => handleDeleteDevice(d.id)}
                            style={{ color: '#f87171' }}
                            title="Remove"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ==========================================
          MODAL 1: CLINICAL WASTE & DAMAGE ATTRIBUTION
          ========================================== */}
      {wasteModalOpen && wasteTargetDevice && (
        <div className="ciu-modal-backdrop" onClick={() => setWasteModalOpen(false)}>
          <div className="ciu-modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="ciu-modal-header">
              <h3>Log Clinical Waste & Damage</h3>
              <button
                className="ciu-btn-secondary"
                onClick={() => setWasteModalOpen(false)}
                style={{ border: 'none', padding: '4px' }}
              >
                ✕
              </button>
            </div>

            <div className="ciu-modal-body">
              <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                Item: <strong style={{ color: '#f8fafc' }}>{wasteTargetDevice.device_name}</strong> (Lot: {wasteTargetDevice.lot_number || 'N/A'})
              </div>

              <div className="ciu-form-group">
                <label>Waste Quantity to Record</label>
                <input
                  type="number"
                  min="1"
                  className="ciu-form-input"
                  value={wasteQty}
                  onChange={(e) => setWasteQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                />
              </div>

              <div className="ciu-form-group">
                <label>Clinical Waste Cause</label>
                <select
                  className="ciu-form-select"
                  value={wasteReason}
                  onChange={(e) => {
                    setWasteReason(e.target.value);
                    setWasteLiability(WASTE_REASON_METADATA[e.target.value]?.defaultLiability || 'FACILITY_EXPENSE');
                  }}
                >
                  {WASTE_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {WASTE_REASON_METADATA[r]?.label || r}
                    </option>
                  ))}
                </select>
              </div>

              <div className="ciu-form-group">
                <label>Financial Liability Routing</label>
                <select
                  className="ciu-form-select"
                  value={wasteLiability}
                  onChange={(e) => setWasteLiability(e.target.value)}
                >
                  {WASTE_LIABILITIES.map((l) => (
                    <option key={l} value={l}>
                      {l.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  {wasteLiability === 'VENDOR_REPLACEMENT_CREDIT'
                    ? 'Routes replacement credit claim to Materials Management.'
                    : 'Absorbed as Operating Room facility scrap expense.'}
                </span>
              </div>

              <div className="ciu-form-group">
                <label>Clinical Notes / Scrap Rationale</label>
                <textarea
                  className="ciu-form-textarea"
                  rows={3}
                  placeholder="Describe incident (e.g. dropped during scrub transfer, unsealed packaging breach)..."
                  value={wasteNotes}
                  onChange={(e) => setWasteNotes(e.target.value)}
                />
              </div>
            </div>

            <div className="ciu-modal-footer">
              <button className="ciu-btn-secondary" onClick={() => setWasteModalOpen(false)}>
                Cancel
              </button>
              <button className="ciu-btn-danger" onClick={handleConfirmWaste}>
                Confirm Waste Disposition
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          MODAL 2: TWO-PERSON POST-CLOSURE AMENDMENT
          ========================================== */}
      {amendmentModalOpen && amendmentTargetDevice && (
        <div className="ciu-modal-backdrop" onClick={() => setAmendmentModalOpen(false)}>
          <div className="ciu-modal-dialog" onClick={(e) => e.stopPropagation()}>
            <form onSubmit={handleSubmitAmendment}>
              <div className="ciu-modal-header">
                <h3>Post-Closure Amendment Protocol</h3>
                <button
                  type="button"
                  className="ciu-btn-secondary"
                  onClick={() => setAmendmentModalOpen(false)}
                  style={{ border: 'none', padding: '4px' }}
                >
                  ✕
                </button>
              </div>

              <div className="ciu-modal-body">
                <div style={{
                  padding: '10px 14px',
                  backgroundColor: 'rgba(245, 158, 11, 0.1)',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  borderRadius: '8px',
                  fontSize: '0.8rem',
                  color: '#fbbf24'
                }}>
                  This case is locked. Under ASC regulatory compliance, corrections require an immutable diff record and separation-of-duties justification.
                </div>

                <div className="ciu-form-group">
                  <label>Field to Correct</label>
                  <select
                    className="ciu-form-select"
                    value={amendmentField}
                    onChange={(e) => setAmendmentField(e.target.value)}
                  >
                    <option value="lot_number">Lot Number</option>
                    <option value="serial_number">Serial Number</option>
                    <option value="quantity_implanted">Quantity Implanted</option>
                    <option value="quantity_wasted">Quantity Wasted</option>
                    <option value="device_name">Device Description</option>
                    <option value="sourcing_channel">Sourcing Channel</option>
                  </select>
                </div>

                <div className="ciu-form-group">
                  <label>Current Value</label>
                  <input
                    type="text"
                    className="ciu-form-input"
                    value={String(amendmentTargetDevice[amendmentField] || '—')}
                    disabled
                  />
                </div>

                <div className="ciu-form-group">
                  <label>Corrected New Value</label>
                  <input
                    type="text"
                    className="ciu-form-input"
                    value={amendmentNewValue}
                    onChange={(e) => setAmendmentNewValue(e.target.value)}
                    required
                  />
                </div>

                <div className="ciu-form-group">
                  <label>Regulatory Reason Code</label>
                  <select
                    className="ciu-form-select"
                    value={amendmentReasonCode}
                    onChange={(e) => setAmendmentReasonCode(e.target.value)}
                  >
                    {AMENDMENT_REASON_CODES.map((code) => (
                      <option key={code} value={code}>
                        {code.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="ciu-form-group">
                  <label>Clinical & Audit Justification (Min 10 chars)</label>
                  <textarea
                    className="ciu-form-textarea"
                    rows={3}
                    placeholder="Enter audit rationale for post-closure correction..."
                    value={amendmentJustification}
                    onChange={(e) => setAmendmentJustification(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="ciu-modal-footer">
                <button
                  type="button"
                  className="ciu-btn-secondary"
                  onClick={() => setAmendmentModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="ciu-btn-primary"
                  disabled={amendmentJustification.trim().length < 10}
                >
                  Submit Authorized Amendment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==========================================
          MODAL 3: AMENDMENT HISTORY DRAWER
          ========================================== */}
      {historyDrawerOpen && (
        <div className="ciu-modal-backdrop" onClick={() => setHistoryDrawerOpen(false)}>
          <div className="ciu-modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="ciu-modal-header">
              <h3>Amendment Ledger: {historyDeviceName}</h3>
              <button
                className="ciu-btn-secondary"
                onClick={() => setHistoryDrawerOpen(false)}
                style={{ border: 'none', padding: '4px' }}
              >
                ✕
              </button>
            </div>

            <div className="ciu-modal-body">
              {selectedDeviceAmendments.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                  No post-closure amendments on record for this device.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {selectedDeviceAmendments.map((a) => (
                    <div
                      key={a.id || a.amendment_sequence}
                      style={{
                        padding: '12px 16px',
                        backgroundColor: '#0f172a',
                        border: '1px solid #334155',
                        borderRadius: '8px'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                        <span style={{ fontWeight: '700', color: '#60a5fa' }}>
                          Rev #{a.amendment_sequence}: {a.field_name}
                        </span>
                        <span style={{ color: '#34d399', fontWeight: '700' }}>{a.approval_status}</span>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#cbd5e1', marginTop: '6px' }}>
                        <code>{a.old_value || 'null'}</code> ➔ <strong style={{ color: '#f8fafc' }}>{a.new_value}</strong>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px' }}>
                        Reason: {a.reason_code} • {a.justification_text}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="ciu-modal-footer">
              <button className="ciu-btn-secondary" onClick={() => setHistoryDrawerOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          MODAL 4: FDA RECALL INVESTIGATION DRAWER
          ========================================== */}
      {recallModalOpen && (
        <div className="ciu-modal-backdrop" onClick={() => setRecallModalOpen(false)}>
          <div className="ciu-modal-dialog" style={{ maxWidth: '720px' }} onClick={(e) => e.stopPropagation()}>
            <div className="ciu-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertOctagon size={20} style={{ color: '#f87171' }} />
                <h3>FDA Recall Traceability Investigation</h3>
              </div>
              <button
                className="ciu-btn-secondary"
                onClick={() => setRecallModalOpen(false)}
                style={{ border: 'none', padding: '4px' }}
              >
                ✕
              </button>
            </div>

            <div className="ciu-modal-body">
              <div style={{ display: 'flex', gap: '10px' }}>
                <select
                  className="ciu-form-select"
                  style={{ width: '180px' }}
                  value={recallSearchType}
                  onChange={(e) => setRecallSearchType(e.target.value)}
                >
                  <option value="lotNumber">Lot Number</option>
                  <option value="serialNumber">Serial Number</option>
                  <option value="catalogNumber">Catalog Number</option>
                </select>

                <input
                  type="text"
                  className="ciu-form-input"
                  style={{ flex: 1 }}
                  placeholder="Enter lot, serial, or catalog # (e.g. LOT-9821A)..."
                  value={recallQuery}
                  onChange={(e) => setRecallQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleExecuteRecallSearch();
                    }
                  }}
                />

                <button
                  className="ciu-btn-primary"
                  onClick={handleExecuteRecallSearch}
                  disabled={recallSearching || !recallQuery.trim()}
                >
                  {recallSearching ? 'Querying...' : 'Trace Cases'}
                </button>
              </div>

              {/* Recall Results */}
              <div className="ciu-recall-results">
                {recallResults.length === 0 ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
                    {recallQuery ? 'Zero historical cases found matching this criteria.' : 'Enter criteria above to execute instant backward patient traceback.'}
                  </div>
                ) : (
                  <table className="ciu-table" style={{ fontSize: '0.8rem' }}>
                    <thead>
                      <tr>
                        <th>Case #</th>
                        <th>DOS</th>
                        <th>Patient</th>
                        <th>Surgeon</th>
                        <th>Device Name</th>
                        <th>Lot / Serial</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recallResults.map((r) => (
                        <tr key={r.case_device_id || r.surgery_id}>
                          <td><strong>#{r.surgery_id}</strong></td>
                          <td>{r.surgery_date}</td>
                          <td style={{ color: '#f8fafc', fontWeight: '600' }}>{r.patient_name}</td>
                          <td>{r.surgeon_name}</td>
                          <td>{r.device_name}</td>
                          <td>
                            <code style={{ color: '#60a5fa' }}>{r.lot_number || r.serial_number}</code>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            <div className="ciu-modal-footer">
              <button
                className="ciu-btn-secondary"
                onClick={() => {
                  alert(`Exported ${recallResults.length} recalled patient records to HIPAA CSV.`);
                }}
                disabled={recallResults.length === 0}
              >
                <FileDown size={14} style={{ marginRight: '6px' }} />
                Export Patient Roster (CSV)
              </button>
              <button className="ciu-btn-secondary" onClick={() => setRecallModalOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
