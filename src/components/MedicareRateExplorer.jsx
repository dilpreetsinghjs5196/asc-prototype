import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  Scale,
  FileText,
  Building,
  RefreshCw,
  Calculator,
  ShieldCheck,
  AlertOctagon,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  MapPin,
  PlusCircle,
  ExternalLink,
  Eye,
  Cpu,
  X,
  Layers,
  Plus,
  Trash2,
  ListOrdered
} from 'lucide-react';
import { medicareRateService, DEFAULT_CBSA } from '../lib/medicareRateService';
import { geographicWageService, CBSA_VERIFICATION_SOURCES } from '../lib/geographicWageService';
import { medicareDeviceService, CMS_DEVICE_CATEGORIES } from '../lib/medicareDeviceService';
import { mpprService, DEFAULT_MPPR_RULE_SETS, CMS_ENDOSCOPY_FAMILIES } from '../lib/mpprService';
import './MedicareRateExplorer.css';

export default function MedicareRateExplorer({ activeFacility }) {
  const [activeTab, setActiveTab] = useState('addenda');
  const [cbsaSettings, setCbsaSettings] = useState(DEFAULT_CBSA);
  const [wageIndices, setWageIndices] = useState([]);
  const [releases, setReleases] = useState([]);

  // Catalog State for CPT/HCPCS codes
  const [rates, setRates] = useState([]);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [piFilter, setPiFilter] = useState('All');
  const [versionFilter, setVersionFilter] = useState('active'); // 'active' (4,335 codes), 'historical', or 'all'
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Calculator State
  const [calcCode, setCalcCode] = useState('29881');
  const [calcResult, setCalcResult] = useState(null);
  const [calcLoading, setCalcLoading] = useState(false);

  // Phase 61: Payment Indicators & Claim Rules State
  const [indicatorDefs, setIndicatorDefs] = useState([]);
  const [claimRules, setClaimRules] = useState([]);
  const [testPiCode, setTestPiCode] = useState('29881');
  const [testPiResult, setTestPiResult] = useState(null);
  const [testPiLoading, setTestPiLoading] = useState(false);

  // Phase 62: Geographic Wage Adjustment State
  const [geoHistory, setGeoHistory] = useState([]);
  const [cbsaSearch, setCbsaSearch] = useState('');
  const [cbsaStateFilter, setCbsaStateFilter] = useState('All');
  const [cbsaPage, setCbsaPage] = useState(1);
  const [cbsaPageSize] = useState(10);
  const [selectedCbsa, setSelectedCbsa] = useState(null);
  const [selectedCounties, setSelectedCounties] = useState([]);
  const [countySearch, setCountySearch] = useState('');
  const [countySearchResults, setCountySearchResults] = useState([]);
  const [isAssignmentModalOpen, setIsAssignmentModalOpen] = useState(false);
  const [assignmentSaving, setAssignmentSaving] = useState(false);
  const [assignmentFeedback, setAssignmentFeedback] = useState(null);
  const [assignmentForm, setAssignmentForm] = useState({
    cbsa_code: '34940',
    cbsa_name: 'Naples-Immokalee-Marco Island, FL',
    state_code: 'FL',
    medicare_provider_number: '10-ASC02',
    effective_start_date: new Date().toISOString().split('T')[0],
    verification_source: 'CMS_PROVIDER_ENROLLMENT_855A',
    verification_document_url: 'https://medicare.gov/provider/tie-in.pdf',
    ascqr_compliant: true
  });

  // Geographic Wage Simulator State
  const [simCpt, setSimCpt] = useState('29881');
  const [simCbsa, setSimCbsa] = useState('34940');
  const [simNatRate, setSimNatRate] = useState(1650.00);
  const [simIsDev, setSimIsDev] = useState(false);
  const [simDevPct, setSimDevPct] = useState(0.35);
  const [simAscqr, setSimAscqr] = useState(true);
  const [simResult, setSimResult] = useState(null);

  // Phase 63: Device-Intensive Payment Rules State
  const [deviceProcedures, setDeviceProcedures] = useState([]);
  const [deviceCategories, setDeviceCategories] = useState([]);
  const [deviceCrosswalk, setDeviceCrosswalk] = useState([]);
  const [deviceSearch, setDeviceSearch] = useState('');
  const [devicePage, setDevicePage] = useState(1);
  const [devicePageSize] = useState(10);
  const [deviceTotalCount, setDeviceTotalCount] = useState(0);
  const [deviceTotalPages, setDeviceTotalPages] = useState(1);
  const [deviceLoading, setDeviceLoading] = useState(false);

  // Phase 63 Interactive Device Simulator State
  const [devSimCode, setDevSimCode] = useState('27447');
  const [devSimRate, setDevSimRate] = useState(10500.00);
  const [devSimOffset, setDevSimOffset] = useState(0.3315);
  const [devSimWage, setDevSimWage] = useState(0.9412);
  const [devSimAscqr, setDevSimAscqr] = useState(true);
  const [devSimMpprSecondary, setDevSimMpprSecondary] = useState(false);
  const [devSimResult, setDevSimResult] = useState(null);

  // Phase 63 Margin Reconciliation State
  const [marginResult, setMarginResult] = useState(null);
  const [marginLoading, setMarginLoading] = useState(false);

  // Phase 64: Multiple Procedure Payment Rules (MPPR) State
  const [mpprRuleSets, setMpprRuleSets] = useState(DEFAULT_MPPR_RULE_SETS);
  const [selectedRuleSet, setSelectedRuleSet] = useState('MEDICARE_ASC_416_172');
  const [mpprEndoscopyFamilies, setMpprEndoscopyFamilies] = useState(CMS_ENDOSCOPY_FAMILIES);
  const [mpprEndoscopySearch, setMpprEndoscopySearch] = useState('');
  const [mpprWageIndex, setMpprWageIndex] = useState(0.9412);
  const [mpprAscqr, setMpprAscqr] = useState(true);
  const [mpprSnapshotLoading, setMpprSnapshotLoading] = useState(false);
  const [mpprAuditFeedback, setMpprAuditFeedback] = useState(null);

  // Claim Simulator Procedure Lines
  const [mpprLines, setMpprLines] = useState([
    {
      id: 1,
      cpt_code: '29881',
      description: 'Knee arthroscopy, meniscectomy medial or lateral',
      payment_indicator: 'A2',
      national_unadjusted_rate: 1650.00,
      device_offset_percentage: 0,
      units: 1,
      modifier_code: null,
      modifiers: [],
      gross_charge: 5200.00
    },
    {
      id: 2,
      cpt_code: '29877',
      description: 'Knee arthroscopy, debridement/shaving articular cartilage',
      payment_indicator: 'A2',
      national_unadjusted_rate: 1420.00,
      device_offset_percentage: 0,
      units: 1,
      modifier_code: null,
      modifiers: [],
      gross_charge: 4400.00
    }
  ]);

  // New Line Input State
  const [newLineForm, setNewLineForm] = useState({
    cpt_code: '',
    description: '',
    payment_indicator: 'A2',
    national_unadjusted_rate: 1500.00,
    device_offset_percentage: 0,
    units: 1,
    modifiers: [],
    gross_charge: 4500.00
  });

  // MPPR Calculation Output State
  const [mpprCalcResult, setMpprCalcResult] = useState(null);

  // Run MPPR calculation on state change
  useEffect(() => {
    if (mpprLines && mpprLines.length > 0) {
      const isComm = selectedRuleSet.startsWith('COM_');
      const res = mpprService.calculateEncounterMppr({
        procedureLines: mpprLines,
        wageIndex: parseFloat(mpprWageIndex) || 1.0,
        ascqrCompliant: mpprAscqr,
        ruleSetCode: selectedRuleSet,
        isCommercial: isComm
      });
      setMpprCalcResult(res);
    } else {
      setMpprCalcResult({
        totalGrossCharges: 0,
        totalUnreducedAllowable: 0,
        totalMpprSavings: 0,
        totalFinalAllowable: 0,
        lines: []
      });
    }
  }, [mpprLines, mpprWageIndex, mpprAscqr, selectedRuleSet]);

  // Load Rule Sets and Endoscopy Families from DB on mount
  useEffect(() => {
    mpprService.getRuleSets().then(sets => {
      if (sets && sets.length > 0) setMpprRuleSets(sets);
    }).catch(console.error);

    mpprService.getEndoscopyFamilies().then(fams => {
      if (fams && fams.length > 0) setMpprEndoscopyFamilies(fams);
    }).catch(console.error);
  }, []);

  // Quick Preset Scenarios Handler
  const handleLoadPresetScenario = (scenarioKey) => {
    setMpprAuditFeedback(null);
    if (scenarioKey === 'dual_ortho') {
      setSelectedRuleSet('MEDICARE_ASC_416_172');
      setMpprLines([
        {
          id: 1,
          cpt_code: '29881',
          description: 'Knee arthroscopy, meniscectomy medial or lateral',
          payment_indicator: 'A2',
          national_unadjusted_rate: 1650.00,
          device_offset_percentage: 0,
          units: 1,
          modifiers: [],
          gross_charge: 5200.00
        },
        {
          id: 2,
          cpt_code: '29877',
          description: 'Knee arthroscopy, debridement/shaving articular cartilage',
          payment_indicator: 'A2',
          national_unadjusted_rate: 1420.00,
          device_offset_percentage: 0,
          units: 1,
          modifiers: [],
          gross_charge: 4400.00
        }
      ]);
    } else if (scenarioKey === 'device_secondary') {
      setSelectedRuleSet('MEDICARE_ASC_416_172');
      setMpprLines([
        {
          id: 1,
          cpt_code: '22856',
          description: 'Total disc arthroplasty, anterior, cervical single interspace',
          payment_indicator: 'J8',
          national_unadjusted_rate: 14200.00,
          device_offset_percentage: 0.4250,
          units: 1,
          modifiers: [],
          gross_charge: 28500.00
        },
        {
          id: 2,
          cpt_code: '27447',
          description: 'Arthroplasty, knee, condyle and plateau; medial and lateral compartments',
          payment_indicator: 'J8',
          national_unadjusted_rate: 10500.00,
          device_offset_percentage: 0.3315,
          units: 1,
          modifiers: [],
          gross_charge: 22000.00
        }
      ]);
    } else if (scenarioKey === 'endoscopy_family') {
      setSelectedRuleSet('MEDICARE_ASC_416_172');
      setMpprLines([
        {
          id: 1,
          cpt_code: '45381',
          description: 'Colonoscopy with submucosal injection',
          payment_indicator: 'A2',
          national_unadjusted_rate: 950.00,
          device_offset_percentage: 0,
          units: 1,
          modifiers: [],
          gross_charge: 3200.00
        },
        {
          id: 2,
          cpt_code: '45380',
          description: 'Colonoscopy with single or multiple biopsy',
          payment_indicator: 'A2',
          national_unadjusted_rate: 820.00,
          device_offset_percentage: 0,
          units: 1,
          modifiers: [],
          gross_charge: 2800.00
        }
      ]);
    } else if (scenarioKey === 'bilateral_50') {
      setSelectedRuleSet('MEDICARE_ASC_416_172');
      setMpprLines([
        {
          id: 1,
          cpt_code: '27447',
          description: 'Total knee arthroplasty (Bilateral modifier 50)',
          payment_indicator: 'J8',
          national_unadjusted_rate: 10500.00,
          device_offset_percentage: 0.3315,
          units: 1,
          modifiers: ['50'],
          gross_charge: 34000.00
        }
      ]);
    } else if (scenarioKey === 'commercial_cascade') {
      setSelectedRuleSet('COM_STD_CASCADE');
      setMpprLines([
        {
          id: 1,
          cpt_code: '29881',
          description: 'Knee arthroscopy meniscectomy',
          payment_indicator: 'A2',
          national_unadjusted_rate: 1650.00,
          device_offset_percentage: 0,
          units: 1,
          modifiers: [],
          gross_charge: 5200.00
        },
        {
          id: 2,
          cpt_code: '29877',
          description: 'Knee arthroscopy debridement',
          payment_indicator: 'A2',
          national_unadjusted_rate: 1420.00,
          device_offset_percentage: 0,
          units: 1,
          modifiers: ['51'],
          gross_charge: 4400.00
        },
        {
          id: 3,
          cpt_code: '29870',
          description: 'Diagnostic knee arthroscopy',
          payment_indicator: 'A2',
          national_unadjusted_rate: 1100.00,
          device_offset_percentage: 0,
          units: 1,
          modifiers: ['51'],
          gross_charge: 3600.00
        },
        {
          id: 4,
          cpt_code: '29871',
          description: 'Knee arthroscopy infection drainage',
          payment_indicator: 'A2',
          national_unadjusted_rate: 950.00,
          device_offset_percentage: 0,
          units: 1,
          modifiers: ['51'],
          gross_charge: 3100.00
        }
      ]);
    }
  };

  // Add line handler
  const handleAddClaimLine = (e) => {
    e?.preventDefault();
    if (!newLineForm.cpt_code.trim()) return;
    const newId = mpprLines.length > 0 ? Math.max(...mpprLines.map(l => l.id)) + 1 : 1;
    const addedLine = {
      id: newId,
      cpt_code: newLineForm.cpt_code.trim().toUpperCase(),
      description: newLineForm.description.trim() || `Procedure ${newLineForm.cpt_code.trim().toUpperCase()}`,
      payment_indicator: newLineForm.payment_indicator,
      national_unadjusted_rate: parseFloat(newLineForm.national_unadjusted_rate) || 0,
      device_offset_percentage: parseFloat(newLineForm.device_offset_percentage) || 0,
      units: parseInt(newLineForm.units, 10) || 1,
      modifiers: [...newLineForm.modifiers],
      gross_charge: parseFloat(newLineForm.gross_charge) || 0
    };
    setMpprLines([...mpprLines, addedLine]);
    setNewLineForm({
      cpt_code: '',
      description: '',
      payment_indicator: 'A2',
      national_unadjusted_rate: 1500.00,
      device_offset_percentage: 0,
      units: 1,
      modifiers: [],
      gross_charge: 4500.00
    });
  };

  // Remove line handler
  const handleRemoveClaimLine = (lineId) => {
    setMpprLines(mpprLines.filter(l => l.id !== lineId));
  };

  // Toggle modifier on new line form
  const handleToggleModifier = (mod) => {
    if (newLineForm.modifiers.includes(mod)) {
      setNewLineForm({ ...newLineForm, modifiers: newLineForm.modifiers.filter(m => m !== mod) });
    } else {
      setNewLineForm({ ...newLineForm, modifiers: [...newLineForm.modifiers, mod] });
    }
  };

  // Save immutable snapshot handler
  const handleRecordMpprSnapshot = async () => {
    setMpprSnapshotLoading(true);
    setMpprAuditFeedback(null);
    try {
      const snapData = {
        surgery_id: 1,
        rule_set_code: selectedRuleSet,
        total_gross_charges: mpprCalcResult.totalGrossCharges,
        total_unreduced_allowable: mpprCalcResult.totalUnreducedAllowable,
        total_mppr_savings: mpprCalcResult.totalMpprSavings,
        total_final_allowable: mpprCalcResult.totalFinalAllowable,
        calculation_payload: mpprCalcResult,
        lines: mpprCalcResult.lines.map((l, idx) => ({
          line_number: idx + 1,
          cpt_code: l.cpt_code,
          units: l.units,
          modifiers: l.modifiers,
          payment_indicator: l.payment_indicator,
          unreduced_allowable: l.unreduced_allowable,
          rank_order: l.rank_order,
          multiplier_percentage: l.multiplier_percentage,
          protected_device_offset: l.protected_device_offset,
          reduced_service_portion: l.reduced_service_portion,
          final_line_allowable: l.final_line_allowable,
          calculation_rationale: l.calculation_rationale
        }))
      };
      const res = await mpprService.recordSnapshot(snapData);
      setMpprAuditFeedback({
        type: 'success',
        message: `Encounter snapshot verified and recorded (Hash: ${res?.snapshot_hash ? res.snapshot_hash.substring(0, 16) + '...' : 'SECURE_SHA256_STAMP'}, Tenant: Active Facility)`
      });
    } catch (err) {
      setMpprAuditFeedback({
        type: 'error',
        message: 'Could not record snapshot: ' + (err.message || 'Server error')
      });
    } finally {
      setMpprSnapshotLoading(false);
    }
  };

  // Load facility settings, CBSA indices, and CMS releases
  const loadMetadata = useCallback(async () => {
    try {
      const facId = activeFacility?.id || '00000000-0000-0000-0000-000000000002';
      const [facSettings, indices, rels, defs, rules, devCats, devXwalk] = await Promise.all([
        medicareRateService.getFacilityMedicareSettings(facId),
        medicareRateService.getWageIndices(2026),
        medicareRateService.getReleases(),
        medicareRateService.getIndicatorDefinitions(2026),
        medicareRateService.getIndicatorClaimRules(),
        medicareDeviceService.getDeviceCategories(),
        medicareDeviceService.getDeviceCrosswalk()
      ]);

      setCbsaSettings(facSettings || DEFAULT_CBSA);
      setWageIndices(indices || []);
      setReleases(rels || []);
      setIndicatorDefs(defs || []);
      setClaimRules(rules || []);
      setDeviceCategories(devCats || []);
      setDeviceCrosswalk(devXwalk || []);
    } catch (err) {
      console.error('Error loading Medicare metadata:', err);
    }
  }, [activeFacility]);

  // Fetch Addenda catalog rows with pagination, search, and version status
  const fetchRates = useCallback(async (searchQuery, targetPage, targetPageSize, targetPi, targetVersion) => {
    setRatesLoading(true);
    try {
      const res = await medicareRateService.getAddendaCatalog({
        search: searchQuery,
        page: targetPage,
        limit: targetPageSize,
        paymentIndicator: targetPi,
        status: targetVersion
      });
      setRates(res.items || []);
      setTotalCount(res.totalCount || 0);
      setTotalPages(res.totalPages || 1);
    } catch (err) {
      console.error('Error fetching addenda catalog:', err);
    } finally {
      setRatesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMetadata();
  }, [loadMetadata]);

  // Trigger rate query with 250ms debounce on search
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchRates(searchTerm, page, pageSize, piFilter, versionFilter);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchTerm, page, pageSize, piFilter, versionFilter, fetchRates]);

  const handleTestIndicator = async (e) => {
    e?.preventDefault();
    if (!testPiCode.trim()) return;
    setTestPiLoading(true);
    try {
      const res = await medicareRateService.interpretIndicator(testPiCode.trim());
      setTestPiResult(res);
    } catch (err) {
      console.error('Error interpreting payment indicator:', err);
    } finally {
      setTestPiLoading(false);
    }
  };

  const handleRunCalculation = async (e) => {
    e?.preventDefault();
    setCalcLoading(true);
    try {
      const wageIdx = cbsaSettings?.wage_index || DEFAULT_CBSA.wageIndex;
      const res = await medicareRateService.resolveBaseRate({
        dos: new Date().toISOString().split('T')[0],
        code: calcCode.trim(),
        facilityId: activeFacility?.id,
        wageIndexOverride: wageIdx
      });
      setCalcResult(res);
    } catch (err) {
      console.error('Error running rate calculation:', err);
    } finally {
      setCalcLoading(false);
    }
  };

  const renderBadge = (pi) => {
    if (pi === 'J8') return <span className="pi-badge pi-badge-device">J8 Device</span>;
    if (pi === 'N1') return <span className="pi-badge pi-badge-packaged">N1 Packaged</span>;
    if (pi === 'Z2' || pi === 'K2') return <span className="pi-badge pi-badge-ancillary">{pi} Ancillary</span>;
    if (pi === 'N/A') return <span className="pi-badge pi-badge-unresolved">Non-Covered</span>;
    return <span className="pi-badge pi-badge-standard">{pi} Standard</span>;
  };

  // Helper for live wage adjustment calculation
  const computeAdjusted = (unadjusted, pi, isDev, devPct) => {
    if (pi === 'N1') return 0;
    const wage = cbsaSettings?.wage_index || DEFAULT_CBSA.wageIndex;
    if (isDev && devPct > 0) {
      const dev = unadjusted * devPct;
      const srv = unadjusted - dev;
      return dev + (srv * 0.50 * wage) + (srv * 0.50);
    }
    return (unadjusted * 0.50 * wage) + (unadjusted * 0.50);
  };

  // Phase 63: Fetch Device-Intensive Procedures
  const fetchDeviceProcedures = useCallback(async (query, targetPage) => {
    setDeviceLoading(true);
    try {
      const res = await medicareDeviceService.getDeviceIntensiveProcedures({
        search: query,
        page: targetPage,
        limit: devicePageSize
      });
      setDeviceProcedures(res.items || []);
      setDeviceTotalCount(res.totalCount || 0);
      setDeviceTotalPages(res.totalPages || 1);
    } catch (err) {
      console.error('Error fetching device-intensive procedures:', err);
    } finally {
      setDeviceLoading(false);
    }
  }, [devicePageSize]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchDeviceProcedures(deviceSearch, devicePage);
    }, 200);
    return () => clearTimeout(timer);
  }, [deviceSearch, devicePage, fetchDeviceProcedures]);

  // Phase 63: Interactive Device Offset & MPPR Calculation Effect
  useEffect(() => {
    if (devSimMpprSecondary) {
      const res = medicareDeviceService.calculateMpprSecondaryJ8Payment({
        nationalRate: devSimRate,
        offsetPercentage: devSimOffset,
        wageIndex: devSimWage,
        ascqrCompliant: devSimAscqr
      });
      setDevSimResult(res);
    } else {
      const res = medicareDeviceService.calculateStatutoryDeviceAdjustment({
        nationalRate: devSimRate,
        offsetPercentage: devSimOffset,
        wageIndex: devSimWage,
        ascqrCompliant: devSimAscqr
      });
      setDevSimResult(res);
    }
  }, [devSimRate, devSimOffset, devSimWage, devSimAscqr, devSimMpprSecondary]);

  // Phase 63: Reconcile Case Device Margin
  const handleReconcileDeviceMargin = async (surgId) => {
    setMarginLoading(true);
    try {
      const res = await medicareDeviceService.reconcileCaseDeviceMargin(surgId);
      setMarginResult(res);
    } catch (err) {
      console.error('Error reconciling case margin:', err);
    } finally {
      setMarginLoading(false);
    }
  };

  // Simulator calculation effect
  useEffect(() => {
    const selIndex = wageIndices.find(w => w.cbsa_code === simCbsa);
    const wageValue = selIndex ? parseFloat(selIndex.wage_index) : 0.9412;
    const res = geographicWageService.calculateStatutoryWageAdjustment({
      nationalUnadjustedRate: simNatRate,
      wageIndex: wageValue,
      isDeviceIntensive: simIsDev,
      deviceOffsetPercentage: simDevPct,
      ascqrCompliant: simAscqr
    });
    setSimResult(res);
  }, [simCpt, simCbsa, simNatRate, simIsDev, simDevPct, simAscqr, wageIndices]);

  // Handle drill-down for CBSA counties
  const handleSelectCbsa = async (cbsa) => {
    setSelectedCbsa(cbsa);
    const counties = await geographicWageService.getCBSACountyDelineations(cbsa.cbsa_code);
    setSelectedCounties(counties);
  };

  // Handle County quick lookup
  const handleCountySearch = async (term) => {
    setCountySearch(term);
    if (!term || term.trim().length < 2) {
      setCountySearchResults([]);
      return;
    }
    const results = await geographicWageService.lookupCBSAByCountyOrFIPS(term);
    setCountySearchResults(results);
  };

  // Handle assignment modal submit
  const handleSaveAssignment = async (e) => {
    e.preventDefault();
    setAssignmentSaving(true);
    setAssignmentFeedback(null);
    try {
      const facId = activeFacility?.id || '00000000-0000-0000-0000-000000000002';
      await geographicWageService.saveFacilityGeographicAssignment(facId, assignmentForm);
      setAssignmentFeedback({ type: 'success', message: 'Geographic assignment successfully updated and audited.' });
      setIsAssignmentModalOpen(false);
      // Reload history & settings
      const history = await geographicWageService.getFacilityGeographicHistory(facId);
      setGeoHistory(history || []);
      setCbsaSettings(prev => ({ ...prev, cbsa_code: assignmentForm.cbsa_code, cbsa_name: assignmentForm.cbsa_name, ascqr_compliant: assignmentForm.ascqr_compliant }));
    } catch (err) {
      setAssignmentFeedback({ type: 'error', message: err.message || 'Failed to save geographic assignment.' });
    } finally {
      setAssignmentSaving(false);
    }
  };

  // Filter national CBSAs
  const filteredCBSAs = wageIndices.filter(w => {
    const code = String(w?.cbsa_code || '');
    const name = String(w?.cbsa_name || '').toLowerCase();
    const search = (cbsaSearch || '').toLowerCase();
    const matchSearch = !cbsaSearch || code.includes(search) || name.includes(search);
    const matchState = cbsaStateFilter === 'All' || w?.state_code === cbsaStateFilter;
    return matchSearch && matchState;
  });

  const totalCbsaPages = Math.ceil(filteredCBSAs.length / cbsaPageSize) || 1;
  const paginatedCBSAs = filteredCBSAs.slice((cbsaPage - 1) * cbsaPageSize, cbsaPage * cbsaPageSize);

  // Active facility geographic assignment
  const activeGeo = geoHistory.find(h => h.is_active) || {
    cbsa_code: cbsaSettings?.cbsa_code || DEFAULT_CBSA.code,
    cbsa_name: cbsaSettings?.cbsa_name || DEFAULT_CBSA.name,
    medicare_provider_number: cbsaSettings?.medicare_provider_number || '10-ASC02',
    state_code: 'FL',
    wage_index: cbsaSettings?.wage_index || DEFAULT_CBSA.wageIndex,
    is_verified: true,
    verification_source: 'CMS_PROVIDER_ENROLLMENT_855A',
    verification_document_url: 'https://medicare.gov/provider/10-ASC02-tie-in.pdf',
    ascqr_compliant: cbsaSettings?.ascqr_compliant !== false,
    effective_start_date: '2024-01-01'
  };

  return (
    <div className="medicare-explorer-container">
      {/* Header */}
      <div className="medicare-header">
        <div>
          <h2>
            <Scale size={24} color="#2563eb" />
            Medicare ASC Base Rate Engine & Addenda
          </h2>
          <p className="medicare-subtitle">
            Statutory 42 CFR § 416.171 Rate Resolution, Geographic Wage Adjustment & Addenda Explorer
          </p>
        </div>
        <div className="medicare-facility-chip">
          <Building size={16} color="#475569" />
          <span>{activeFacility?.name || 'Naples Surgery Center'}</span>
          <span style={{ color: '#059669', marginLeft: '4px' }}>
            (CBSA: {cbsaSettings.cbsa_code || DEFAULT_CBSA.code} • Wage Index: {cbsaSettings.wage_index || DEFAULT_CBSA.wageIndex})
          </span>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="medicare-stats-grid">
        <div className="medicare-stat-card">
          <span className="medicare-stat-label">Active CMS Release</span>
          <span className="medicare-stat-value">CY 2026 Q1</span>
          <span className="medicare-stat-sub">Rule: CMS-1830-FC Final</span>
        </div>
        <div className="medicare-stat-card">
          <span className="medicare-stat-label">ASC Conversion Factor</span>
          <span className="medicare-stat-value">$53.5140</span>
          <span className="medicare-stat-sub">+2.9% Statutory Update</span>
        </div>
        <div className="medicare-stat-card">
          <span className="medicare-stat-label">Labor / Non-Labor Share</span>
          <span className="medicare-stat-value">50% / 50%</span>
          <span className="medicare-stat-sub">Statutory Constant (42 CFR 416.172)</span>
        </div>
        <div className="medicare-stat-card">
          <span className="medicare-stat-label">ASCQR Quality Status</span>
          <span className="medicare-stat-value" style={{ color: '#059669' }}>Compliant</span>
          <span className="medicare-stat-sub">Full Rate Update (No 2% Penalty)</span>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="medicare-tabs">
        <button
          className={`medicare-tab-btn ${activeTab === 'addenda' ? 'active' : ''}`}
          onClick={() => setActiveTab('addenda')}
        >
          <FileText size={16} />
          Addenda AA & BB Catalog
        </button>
        <button
          className={`medicare-tab-btn ${activeTab === 'calculator' ? 'active' : ''}`}
          onClick={() => setActiveTab('calculator')}
        >
          <Calculator size={16} />
          Rate Resolver & Explainability
        </button>
        <button
          className={`medicare-tab-btn ${activeTab === 'cbsa' ? 'active' : ''}`}
          onClick={() => setActiveTab('cbsa')}
        >
          <Building size={16} />
          CBSA Wage Indices
        </button>
        <button
          className={`medicare-tab-btn ${activeTab === 'releases' ? 'active' : ''}`}
          onClick={() => setActiveTab('releases')}
        >
          <RefreshCw size={16} />
          CMS Releases & Transmittals
        </button>
        <button
          className={`medicare-tab-btn ${activeTab === 'indicators' ? 'active' : ''}`}
          onClick={() => setActiveTab('indicators')}
        >
          <ShieldCheck size={16} />
          Payment Indicators & Rules
        </button>
        <button
          className={`medicare-tab-btn ${activeTab === 'device_intensive' ? 'active' : ''}`}
          onClick={() => setActiveTab('device_intensive')}
        >
          <Cpu size={16} />
          Device-Intensive Rules (J8)
        </button>
        <button
          className={`medicare-tab-btn ${activeTab === 'mppr' ? 'active' : ''}`}
          onClick={() => setActiveTab('mppr')}
        >
          <Layers size={16} />
          Multiple Procedure Rules (MPPR)
        </button>
      </div>

      {/* Tab 1: Addenda Catalog */}
      {activeTab === 'addenda' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Controls Bar */}
          <div className="medicare-controls-bar">
            <div className="medicare-search-bar" style={{ flex: 1, minWidth: '260px' }}>
              <Search size={18} color="#64748b" />
              <input
                type="text"
                placeholder="Search CPT/HCPCS codes by code or description (e.g. 0101T, 29881, Cataract)..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setPage(1);
                }}
                className="medicare-search-input"
              />
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              {/* Version / Batch Filter */}
              <select
                value={versionFilter}
                onChange={(e) => {
                  setVersionFilter(e.target.value);
                  setPage(1);
                }}
                className="medicare-select"
                title="Select Catalog Version"
                style={{ fontWeight: 600, borderColor: versionFilter === 'active' ? '#059669' : '#cbd5e1' }}
              >
                <option value="active">Active Version (4,335 codes)</option>
                <option value="historical">Historical Version (4,656 codes)</option>
                <option value="all">All Versions (8,991 records)</option>
              </select>

              {/* Payment Indicator Filter */}
              <select
                value={piFilter}
                onChange={(e) => {
                  setPiFilter(e.target.value);
                  setPage(1);
                }}
                className="medicare-select"
                title="Filter by Payment Indicator"
              >
                <option value="All">All Payment Indicators</option>
                <option value="A2">A2 - Standard Surgical</option>
                <option value="J8">J8 - Device-Intensive</option>
                <option value="N1">N1 - Packaged ($0)</option>
                <option value="Z2">Z2 - Radiology Ancillary</option>
                <option value="K2">K2 - Drugs & Biologicals</option>
              </select>

              {/* Rows Per Page */}
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="medicare-select"
                title="Rows per page"
              >
                <option value={25}>25 per page</option>
                <option value={50}>50 per page</option>
                <option value={100}>100 per page</option>
              </select>

              {/* Total Active Badge */}
              <div className="medicare-total-pill">
                <strong>{totalCount.toLocaleString()}</strong>
                <span>
                  {versionFilter === 'active' ? 'Active Codes' : versionFilter === 'historical' ? 'Historical Codes' : 'Total Records'}
                </span>
              </div>
            </div>
          </div>

          <div className="medicare-table-container">
            <table className="medicare-table">
              <thead>
                <tr>
                  <th>CPT / HCPCS</th>
                  <th>Description</th>
                  <th>Payment Indicator</th>
                  <th>Version Status</th>
                  <th style={{ textAlign: 'right' }}>National Unadj Rate</th>
                  <th style={{ textAlign: 'right' }}>Wage-Adjusted Baseline</th>
                  <th>Methodology Notes</th>
                </tr>
              </thead>
              <tbody>
                {ratesLoading ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '2.5rem', color: '#64748b' }}>
                      <RefreshCw size={18} className="animate-spin" style={{ display: 'inline-block', marginRight: '8px', verticalAlign: 'middle' }} />
                      Loading Medicare rate catalog...
                    </td>
                  </tr>
                ) : rates.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '2.5rem', color: '#64748b' }}>
                      No CPT codes match the search or filter criteria.
                    </td>
                  </tr>
                ) : (
                  rates.map((r, idx) => {
                    const adjusted = computeAdjusted(
                      r.national_unadjusted_rate,
                      r.payment_indicator,
                      r.is_device_intensive,
                      r.device_offset_percentage || 0
                    );
                    const isTerminated = Boolean(r.termination_date);
                    return (
                      <tr key={`${r.code}_${r.effective_date || ''}_${idx}`}>
                        <td style={{ fontWeight: 700, fontFamily: 'monospace' }}>
                          <span
                            style={{ cursor: 'pointer', color: '#2563eb', textDecoration: 'underline' }}
                            onClick={() => {
                              setCalcCode(r.code);
                              setActiveTab('calculator');
                            }}
                            title="Click to resolve and explain rate"
                          >
                            {r.code}
                          </span>
                        </td>
                        <td>{r.description}</td>
                        <td>{renderBadge(r.payment_indicator)}</td>
                        <td>
                          {isTerminated ? (
                            <span className="pi-badge pi-badge-packaged" title={`Terminated on ${r.termination_date}`}>
                              Superseded
                            </span>
                          ) : (
                            <span className="pi-badge pi-badge-device" title={`Effective from ${r.effective_date || '2026-05-01'}`}>
                              Active
                            </span>
                          )}
                        </td>
                        <td className="currency-cell unadjusted-rate">
                          ${(r.national_unadjusted_rate || 0).toFixed(2)}
                        </td>
                        <td className="currency-cell adjusted-rate">
                          ${(adjusted || 0).toFixed(2)}
                        </td>
                        <td style={{ fontSize: '0.8rem', color: '#64748b' }}>
                          {isTerminated ? (
                            <span style={{ color: '#94a3b8' }}>Terminated ({r.termination_date})</span>
                          ) : r.is_device_intensive ? (
                            <span>{((r.device_offset_percentage || 0) * 100).toFixed(0)}% Device Protected from Wage Index</span>
                          ) : r.payment_indicator === 'N1' ? (
                            <span>Bundled into Primary Procedure APC</span>
                          ) : (
                            <span>50% Labor Adjusted at {cbsaSettings?.wage_index || DEFAULT_CBSA.wageIndex}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalCount > 0 && (
            <div className="medicare-pagination">
              <span className="medicare-pagination-info">
                Showing <strong>{((page - 1) * pageSize) + 1}</strong> – <strong>{Math.min(page * pageSize, totalCount)}</strong> of <strong>{totalCount.toLocaleString()}</strong> codes
                {versionFilter === 'active' && <span style={{ color: '#059669', marginLeft: '6px' }}>(CY 2026 Active Catalog)</span>}
              </span>
              <div className="medicare-pagination-btns">
                <button
                  type="button"
                  className="medicare-page-btn"
                  disabled={page <= 1 || ratesLoading}
                  onClick={() => setPage(1)}
                  title="First Page"
                >
                  &laquo; First
                </button>
                <button
                  type="button"
                  className="medicare-page-btn"
                  disabled={page <= 1 || ratesLoading}
                  onClick={() => setPage(prev => Math.max(1, prev - 1))}
                  title="Previous Page"
                >
                  &lsaquo; Prev
                </button>
                <span className="medicare-page-current">
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  className="medicare-page-btn"
                  disabled={page >= totalPages || ratesLoading}
                  onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
                  title="Next Page"
                >
                  Next &rsaquo;
                </button>
                <button
                  type="button"
                  className="medicare-page-btn"
                  disabled={page >= totalPages || ratesLoading}
                  onClick={() => setPage(totalPages)}
                  title="Last Page"
                >
                  Last &raquo;
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Rate Calculator & Explainability */}
      {activeTab === 'calculator' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
          <div className="medicare-calc-card">
            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>
              Deterministic Rate Resolver
            </h3>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
              Resolves statutory payment breakdown for any CPT code using authoritative 42 CFR 416 formulas.
            </p>
            <form onSubmit={handleRunCalculation} style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <input
                type="text"
                value={calcCode}
                onChange={(e) => setCalcCode(e.target.value)}
                placeholder="Enter CPT Code (e.g. 28465)"
                style={{
                  flex: 1,
                  padding: '0.5rem 0.75rem',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  fontFamily: 'monospace',
                  fontWeight: 700
                }}
              />
              <button
                type="submit"
                disabled={calcLoading}
                style={{
                  backgroundColor: '#2563eb',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '0.5rem 1rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                {calcLoading ? 'Calculating...' : 'Resolve Rate'}
              </button>
            </form>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem' }}>
              <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Quick Presets:</div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {['29881', '28465', '66984', '0101T', '12001', '73721'].map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => { setCalcCode(p); }}
                    style={{
                      background: '#f1f5f9',
                      border: '1px solid #cbd5e1',
                      borderRadius: '4px',
                      padding: '0.25rem 0.5rem',
                      fontSize: '0.75rem',
                      fontFamily: 'monospace',
                      cursor: 'pointer'
                    }}
                  >
                    CPT {p}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {calcResult && (
            <div className="medicare-calc-card">
              <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>
                Mathematical Explainability Breakdown
              </h3>
              <div className="medicare-calc-row">
                <span>CPT / HCPCS Code:</span>
                <strong>{calcResult.code}</strong>
              </div>
              <div className="medicare-calc-row">
                <span>Payment Indicator (PI):</span>
                <span>{renderBadge(calcResult.payment_indicator)}</span>
              </div>
              <div className="medicare-calc-row">
                <span>National Unadjusted Rate:</span>
                <span className="currency-cell">${(calcResult.national_unadjusted_rate || 0).toFixed(2)}</span>
              </div>
              {calcResult.is_device_intensive && (
                <>
                  <div className="medicare-calc-row" style={{ color: '#059669' }}>
                    <span>Device Portion (100% Protected):</span>
                    <span className="currency-cell">${(calcResult.device_offset_amount || 0).toFixed(2)}</span>
                  </div>
                  <div className="medicare-calc-row">
                    <span>Non-Device Service Portion:</span>
                    <span className="currency-cell">${(calcResult.service_portion_unadjusted || 0).toFixed(2)}</span>
                  </div>
                </>
              )}
              <div className="medicare-calc-row">
                <span>Geographic Wage Index (CBSA {calcResult.cbsa_code}):</span>
                <span>{(calcResult.wage_index_applied || DEFAULT_CBSA.wageIndex).toFixed(4)}</span>
              </div>
              <div className="medicare-calc-row">
                <span>Labor Adjustment Formula:</span>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                  (Rate × 50% × {calcResult.wage_index_applied}) + (Rate × 50%)
                </span>
              </div>
              <div className="medicare-calc-row medicare-calc-total">
                <span>Authoritative Base Rate:</span>
                <span>${(calcResult.wage_adjusted_rate || 0).toFixed(2)}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: CBSA Wage Indices & Geographic Model (Phase 62) */}
      {activeTab === 'cbsa' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Active Facility Assignment Card */}
          <div className="geo-facility-card">
            <div className="geo-facility-header">
              <div>
                <h3 className="geo-title">
                  <MapPin size={20} color="#2563eb" />
                  Facility Medicare Geographic Assignment
                </h3>
                <p className="geo-desc">
                  Authoritative effective-dated CBSA configuration for {activeFacility?.name || 'Naples Surgery Center'} under 42 CFR § 416.171(b).
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button
                  type="button"
                  className="geo-btn-primary"
                  onClick={() => {
                    setAssignmentForm({
                      cbsa_code: activeGeo.cbsa_code || '34940',
                      cbsa_name: activeGeo.cbsa_name || 'Naples-Immokalee-Marco Island, FL',
                      state_code: activeGeo.state_code || 'FL',
                      medicare_provider_number: activeGeo.medicare_provider_number || '10-ASC02',
                      effective_start_date: new Date().toISOString().split('T')[0],
                      verification_source: 'CMS_PROVIDER_ENROLLMENT_855A',
                      verification_document_url: activeGeo.verification_document_url || '',
                      ascqr_compliant: activeGeo.ascqr_compliant !== false
                    });
                    setIsAssignmentModalOpen(true);
                  }}
                >
                  <PlusCircle size={15} />
                  Update Assignment
                </button>
              </div>
            </div>

            {assignmentFeedback && (
              <div style={{
                padding: '0.75rem 1rem',
                borderRadius: '6px',
                fontSize: '0.85rem',
                fontWeight: 600,
                background: assignmentFeedback.type === 'success' ? '#ecfdf5' : '#fff1f2',
                color: assignmentFeedback.type === 'success' ? '#059669' : '#dc2626',
                border: `1px solid ${assignmentFeedback.type === 'success' ? '#a7f3d0' : '#fecdd3'}`
              }}>
                {assignmentFeedback.message}
              </div>
            )}

            <div className="geo-grid-2">
              <div className="geo-card">
                <h4 className="geo-card-title">
                  <Building size={16} color="#2563eb" />
                  Active CBSA & Provider Profile
                </h4>
                <div className="geo-key-value-list">
                  <div className="geo-kv-row">
                    <span className="geo-kv-label">Assigned CBSA:</span>
                    <span className="geo-kv-val" style={{ fontFamily: 'monospace' }}>
                      {activeGeo.cbsa_code} — {activeGeo.cbsa_name}
                    </span>
                  </div>
                  <div className="geo-kv-row">
                    <span className="geo-kv-label">Medicare Provider Number (CCN):</span>
                    <span className="geo-kv-val" style={{ fontFamily: 'monospace' }}>{activeGeo.medicare_provider_number}</span>
                  </div>
                  <div className="geo-kv-row">
                    <span className="geo-kv-label">Effective Date:</span>
                    <span className="geo-kv-val">{activeGeo.effective_start_date} to {activeGeo.effective_end_date || 'Present (Active)'}</span>
                  </div>
                  <div className="geo-kv-row">
                    <span className="geo-kv-label">ASC Quality Reporting (ASCQR):</span>
                    <span>
                      {activeGeo.ascqr_compliant !== false ? (
                        <span className="geo-badge-verified"><ShieldCheck size={12} /> Compliant (100% Rate)</span>
                      ) : (
                        <span className="geo-badge-unverified"><AlertOctagon size={12} /> Non-Compliant (-2% Penalty)</span>
                      )}
                    </span>
                  </div>
                </div>
              </div>

              <div className="geo-card">
                <h4 className="geo-card-title">
                  <ShieldCheck size={16} color="#059669" />
                  Verification & Audit Provenance
                </h4>
                <div className="geo-key-value-list">
                  <div className="geo-kv-row">
                    <span className="geo-kv-label">Verification Status:</span>
                    <span>
                      {activeGeo.is_verified ? (
                        <span className="geo-badge-verified"><CheckCircle2 size={12} /> Verified Authoritative</span>
                      ) : (
                        <span className="geo-badge-unverified"><AlertTriangle size={12} /> Pending Document Review</span>
                      )}
                    </span>
                  </div>
                  <div className="geo-kv-row">
                    <span className="geo-kv-label">Verification Source:</span>
                    <span className="geo-kv-val">{activeGeo.verification_source || 'CMS_PROVIDER_ENROLLMENT_855A'}</span>
                  </div>
                  <div className="geo-kv-row">
                    <span className="geo-kv-label">Applied Wage Index:</span>
                    <span className="geo-kv-val" style={{ color: '#2563eb', fontWeight: 700 }}>
                      {parseFloat(activeGeo.wage_index || 0.9412).toFixed(4)}
                    </span>
                  </div>
                  <div className="geo-kv-row">
                    <span className="geo-kv-label">Document Reference:</span>
                    <span>
                      {activeGeo.verification_document_url ? (
                        <a href={activeGeo.verification_document_url} target="_blank" rel="noreferrer" style={{ color: '#2563eb', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem', fontWeight: 600 }}>
                          Tie-In Notice <ExternalLink size={12} />
                        </a>
                      ) : (
                        <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>None attached</span>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Historical Assignments Timeline */}
            {geoHistory.length > 1 && (
              <div style={{ marginTop: '0.5rem' }}>
                <h5 style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Effective-Dated Assignment History
                </h5>
                <div className="medicare-table-container">
                  <table className="medicare-table">
                    <thead>
                      <tr>
                        <th>Effective Start</th>
                        <th>Effective End</th>
                        <th>CBSA Code & Title</th>
                        <th>Provider CCN</th>
                        <th>Verification</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {geoHistory.map(h => (
                        <tr key={h.id || h.effective_start_date}>
                          <td style={{ fontWeight: 600 }}>{h.effective_start_date}</td>
                          <td>{h.effective_end_date || 'Current'}</td>
                          <td>{h.cbsa_code} — {h.cbsa_name}</td>
                          <td style={{ fontFamily: 'monospace' }}>{h.medicare_provider_number}</td>
                          <td>
                            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{h.verification_source}</span>
                          </td>
                          <td>
                            {h.is_active ? (
                              <span className="pi-badge pi-badge-device">Active</span>
                            ) : (
                              <span className="pi-badge pi-badge-packaged">Superseded</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Interactive 50/50 Geographic Calculation Simulator */}
          <div className="medicare-calc-card" style={{ background: '#ffffff', borderColor: '#cbd5e1' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1.15rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Calculator size={18} color="#2563eb" />
                  Statutory 50/50 ASC Wage Adjustment Simulator (42 CFR § 416.171)
                </h3>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
                  Simulates statutory Medicare ASC wage adjustment with device offset carve-out and quality penalty factors.
                </p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
              <div className="geo-form-group">
                <label className="geo-form-label">Procedure Code (CPT/HCPCS):</label>
                <select
                  className="geo-form-select"
                  value={simCpt}
                  onChange={(e) => {
                    const code = e.target.value;
                    setSimCpt(code);
                    if (code === '29881') {
                      setSimNatRate(1650.00);
                      setSimIsDev(false);
                      setSimDevPct(0);
                    } else if (code === '28465') {
                      setSimNatRate(4671.46);
                      setSimIsDev(true);
                      setSimDevPct(0.35);
                    } else if (code === '45378') {
                      setSimNatRate(435.50);
                      setSimIsDev(false);
                      setSimDevPct(0);
                    } else if (code === 'K2_ASP') {
                      setSimNatRate(500.00);
                      setSimIsDev(false);
                      setSimDevPct(0);
                    } else if (code === 'N1_PKG') {
                      setSimNatRate(0.00);
                      setSimIsDev(false);
                      setSimDevPct(0);
                    }
                  }}
                >
                  <option value="29881">29881 — Knee Arthroscopy ($1,650.00)</option>
                  <option value="28465">28465 — Tarsal Fracture Repair ($4,671.46 - J8 Device)</option>
                  <option value="45378">45378 — Diagnostic Colonoscopy ($435.50)</option>
                  <option value="K2_ASP">J0135 — Adalimumab Injection (K2 Drug - $500.00)</option>
                  <option value="N1_PKG">11042 — Packaged Sub-procedure (N1 - $0.00)</option>
                </select>
              </div>

              <div className="geo-form-group">
                <label className="geo-form-label">Target CBSA Wage Index:</label>
                <select
                  className="geo-form-select"
                  value={simCbsa}
                  onChange={(e) => setSimCbsa(e.target.value)}
                >
                  {wageIndices.slice(0, 30).map(w => (
                    <option key={w.cbsa_code} value={w.cbsa_code}>
                      {w.cbsa_code} — {String(w.cbsa_name || '').split(',')[0]} ({parseFloat(w.wage_index || 1.0).toFixed(4)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="geo-form-group">
                <label className="geo-form-label">National Unadjusted Rate ($):</label>
                <input
                  type="number"
                  step="0.01"
                  className="geo-form-input"
                  value={simNatRate}
                  onChange={(e) => setSimNatRate(parseFloat(e.target.value) || 0)}
                />
              </div>

              <div className="geo-form-group">
                <label className="geo-form-label">ASCQR Compliance:</label>
                <select
                  className="geo-form-select"
                  value={simAscqr ? 'compliant' : 'non_compliant'}
                  onChange={(e) => setSimAscqr(e.target.value === 'compliant')}
                >
                  <option value="compliant">Compliant (Full Statutory Rate)</option>
                  <option value="non_compliant">Non-Compliant (-2.0% Reduction Factor)</option>
                </select>
              </div>
            </div>

            {/* Live Calculation Step-by-Step Display */}
            {simResult && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
                <div className="geo-step-box">
                  <span className="geo-step-title">1. National Base</span>
                  <span className="geo-step-value">${simResult.nationalUnadjustedRate.toFixed(2)}</span>
                  <span className="geo-step-note">Unadjusted Baseline</span>
                </div>
                <div className="geo-step-box">
                  <span className="geo-step-title">2. Device Offset</span>
                  <span className="geo-step-value" style={{ color: simResult.deviceOffsetAmount > 0 ? '#d97706' : '#64748b' }}>
                    ${simResult.deviceOffsetAmount.toFixed(2)}
                  </span>
                  <span className="geo-step-note">{simResult.isDeviceIntensive ? '100% Wage Protected' : 'No implant offset'}</span>
                </div>
                <div className="geo-step-box">
                  <span className="geo-step-title">3. Net Service Share</span>
                  <span className="geo-step-value">${simResult.servicePortionUnadjusted.toFixed(2)}</span>
                  <span className="geo-step-note">Subject to 50/50 Math</span>
                </div>
                <div className="geo-step-box">
                  <span className="geo-step-title">4. Adjusted Service</span>
                  <span className="geo-step-value" style={{ color: '#2563eb' }}>${simResult.servicePortionAdjusted.toFixed(2)}</span>
                  <span className="geo-step-note">Labor + Non-Labor</span>
                </div>
                <div className="geo-step-box" style={{ background: '#f8fafc', borderColor: '#2563eb' }}>
                  <span className="geo-step-title" style={{ color: '#2563eb' }}>Final Facility Rate</span>
                  <span className="geo-step-value" style={{ color: '#059669', fontSize: '1.35rem' }}>
                    ${simResult.allowableRate.toFixed(2)}
                  </span>
                  <span className="geo-step-note" style={{ color: simResult.dollarVariance >= 0 ? '#059669' : '#dc2626', fontWeight: 600 }}>
                    {simResult.dollarVariance >= 0 ? `+$${simResult.dollarVariance.toFixed(2)}` : `-$${Math.abs(simResult.dollarVariance).toFixed(2)}`} ({simResult.percentageVariance}%)
                  </span>
                </div>
              </div>
            )}

            {simResult && (
              <div style={{ fontSize: '0.8rem', color: '#64748b', fontStyle: 'italic', background: '#f8fafc', padding: '0.5rem 0.75rem', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                <strong>Statutory Trace:</strong> {simResult.formulaDescription}
              </div>
            )}
          </div>

          {/* National CBSA Wage Index Table */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1.1rem', color: '#0f172a' }}>
                  National CBSA Wage Index Catalog (CY 2026)
                </h3>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
                  Official CMS-1823-FC wage indices across all Core Based Statistical Areas.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <div style={{ position: 'relative', minWidth: '220px' }}>
                  <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: '#94a3b8' }} />
                  <input
                    type="text"
                    className="geo-form-input"
                    style={{ paddingLeft: '32px' }}
                    placeholder="Search code, city, state..."
                    value={cbsaSearch}
                    onChange={(e) => {
                      setCbsaSearch(e.target.value);
                      setCbsaPage(1);
                    }}
                  />
                </div>

                <select
                  className="geo-form-select"
                  value={cbsaStateFilter}
                  onChange={(e) => {
                    setCbsaStateFilter(e.target.value);
                    setCbsaPage(1);
                  }}
                >
                  <option value="All">All States</option>
                  <option value="FL">Florida (FL)</option>
                  <option value="CA">California (CA)</option>
                  <option value="NY">New York (NY)</option>
                  <option value="TX">Texas (TX)</option>
                  <option value="IL">Illinois (IL)</option>
                  <option value="GA">Georgia (GA)</option>
                </select>
              </div>
            </div>

            <div className="medicare-table-container">
              <table className="medicare-table">
                <thead>
                  <tr>
                    <th>CBSA Code</th>
                    <th>Core Based Statistical Area Name</th>
                    <th>State</th>
                    <th style={{ textAlign: 'right' }}>Wage Index</th>
                    <th>Pre-Floor</th>
                    <th>Rural Floor</th>
                    <th>Reclassified</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedCBSAs.map((w) => (
                    <tr key={w.cbsa_code}>
                      <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{w.cbsa_code}</td>
                      <td>{w.cbsa_name}</td>
                      <td>{w.state_code}</td>
                      <td className="currency-cell" style={{ fontWeight: 700, color: '#2563eb' }}>
                        {parseFloat(w.wage_index || 1.0).toFixed(4)}
                      </td>
                      <td style={{ fontSize: '0.82rem', color: '#64748b' }}>
                        {parseFloat(w.pre_floor_wage_index || w.wage_index || 1.0).toFixed(4)}
                      </td>
                      <td>
                        {w.is_rural_floor ? (
                          <span className="pi-badge pi-badge-device">Rural Floor</span>
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>No</span>
                        )}
                      </td>
                      <td>
                        {w.is_reclassified ? (
                          <span className="pi-badge pi-badge-ancillary">Reclassified</span>
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Standard</span>
                        )}
                      </td>
                      <td>
                        {w.cbsa_code === activeGeo.cbsa_code ? (
                          <span className="pi-badge pi-badge-device">Active Facility CBSA</span>
                        ) : (
                          <span className="pi-badge pi-badge-standard">Reference</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.35rem' }}>
                          <button
                            type="button"
                            className="geo-btn-secondary"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                            onClick={() => handleSelectCbsa(w)}
                          >
                            <Eye size={12} /> Counties
                          </button>
                          <button
                            type="button"
                            className="geo-btn-secondary"
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', color: '#2563eb', borderColor: '#bfdbfe' }}
                            onClick={() => {
                              setSimCbsa(w.cbsa_code);
                              window.scrollTo({ top: 400, behavior: 'smooth' });
                            }}
                          >
                            Simulate
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* CBSA Pagination Bar */}
            <div className="medicare-pagination">
              <span className="medicare-pagination-info">
                Showing <strong>{(cbsaPage - 1) * cbsaPageSize + 1}</strong> to <strong>{Math.min(cbsaPage * cbsaPageSize, filteredCBSAs.length)}</strong> of <strong>{filteredCBSAs.length}</strong> CBSAs
              </span>
              <div className="medicare-pagination-btns">
                <button
                  type="button"
                  className="medicare-page-btn"
                  disabled={cbsaPage <= 1}
                  onClick={() => setCbsaPage(prev => Math.max(1, prev - 1))}
                >
                  Previous
                </button>
                <span className="medicare-page-current">Page {cbsaPage} of {totalCbsaPages}</span>
                <button
                  type="button"
                  className="medicare-page-btn"
                  disabled={cbsaPage >= totalCbsaPages}
                  onClick={() => setCbsaPage(prev => Math.min(totalCbsaPages, prev + 1))}
                >
                  Next
                </button>
              </div>
            </div>
          </div>

          {/* OMB Bulletin 23-01 County Crosswalk Quick Lookup */}
          <div className="geo-card" style={{ background: '#ffffff', borderColor: '#cbd5e1' }}>
            <h4 className="geo-card-title">
              <Search size={16} color="#2563eb" />
              OMB County-to-CBSA Crosswalk Lookup (OMB Bulletin No. 23-01)
            </h4>
            <p className="geo-desc">
              Search any US county or 5-digit FIPS code to verify official Medicare Core Based Statistical Area assignment.
            </p>
            <div style={{ maxWidth: '400px' }}>
              <input
                type="text"
                className="geo-form-input"
                style={{ width: '100%' }}
                placeholder="Type county name or FIPS (e.g. Collier, 12021, Miami-Dade)..."
                value={countySearch}
                onChange={(e) => handleCountySearch(e.target.value)}
              />
            </div>

            {countySearchResults.length > 0 && (
              <div className="medicare-table-container">
                <table className="medicare-table">
                  <thead>
                    <tr>
                      <th>County FIPS</th>
                      <th>County Name</th>
                      <th>State</th>
                      <th>Resolved CBSA Code</th>
                      <th>CBSA Metropolitan Title</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {countySearchResults.map((c) => (
                      <tr key={c.fips_county_code}>
                        <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{c.fips_county_code}</td>
                        <td style={{ fontWeight: 600 }}>{c.county_name}</td>
                        <td>{c.state_code}</td>
                        <td style={{ fontFamily: 'monospace', fontWeight: 700, color: '#2563eb' }}>{c.cbsa_code}</td>
                        <td>{c.cbsa_title}</td>
                        <td>
                          <button
                            type="button"
                            className="geo-btn-secondary"
                            style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                            onClick={() => {
                              setSimCbsa(c.cbsa_code);
                              window.scrollTo({ top: 400, behavior: 'smooth' });
                            }}
                          >
                            Use in Simulator
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Selected CBSA Counties Drill-Down Drawer */}
            {selectedCbsa && (
              <div style={{ marginTop: '1rem', padding: '1rem', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <h5 style={{ margin: 0, fontSize: '0.9rem', color: '#0f172a' }}>
                    Counties delineated in CBSA {selectedCbsa?.cbsa_code} ({selectedCbsa?.cbsa_name || 'Selected CBSA'})
                  </h5>
                  <button
                    type="button"
                    className="geo-modal-close"
                    onClick={() => setSelectedCbsa(null)}
                  >
                    <X size={16} />
                  </button>
                </div>
                {selectedCounties.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {selectedCounties.map(cty => (
                      <span
                        key={cty.fips_county_code}
                        style={{
                          background: '#ffffff',
                          border: '1px solid #cbd5e1',
                          borderRadius: '4px',
                          padding: '0.35rem 0.65rem',
                          fontSize: '0.8rem',
                          color: '#334155'
                        }}
                      >
                        <strong>{cty.county_name}</strong> ({cty.fips_county_code}) — {cty.metropolitan_flag}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
                    Standard OMB single-county delineation for {selectedCbsa.cbsa_name}.
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Update Assignment Modal */}
          {isAssignmentModalOpen && (
            <div className="geo-modal-backdrop">
              <div className="geo-modal-container">
                <div className="geo-modal-header">
                  <h3>
                    <MapPin size={20} color="#2563eb" />
                    Update Facility Medicare Geographic Assignment
                  </h3>
                  <button
                    type="button"
                    className="geo-modal-close"
                    onClick={() => setIsAssignmentModalOpen(false)}
                  >
                    <X size={18} />
                  </button>
                </div>

                <form onSubmit={handleSaveAssignment} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div className="geo-form-group">
                    <label className="geo-form-label">Core Based Statistical Area (CBSA):</label>
                    <select
                      className="geo-form-select"
                      value={assignmentForm.cbsa_code}
                      onChange={(e) => {
                        const code = e.target.value;
                        const match = wageIndices.find(w => w.cbsa_code === code);
                        setAssignmentForm(prev => ({
                          ...prev,
                          cbsa_code: code,
                          cbsa_name: match ? match.cbsa_name : prev.cbsa_name,
                          state_code: match ? match.state_code : prev.state_code
                        }));
                      }}
                      required
                    >
                      {wageIndices.map(w => (
                        <option key={w.cbsa_code} value={w.cbsa_code}>
                          {w.cbsa_code} — {w.cbsa_name || ''} ({parseFloat(w.wage_index || 1.0).toFixed(4)})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="geo-form-group">
                    <label className="geo-form-label">CMS Certification Number (CCN / Provider Number):</label>
                    <input
                      type="text"
                      className="geo-form-input"
                      value={assignmentForm.medicare_provider_number}
                      onChange={(e) => setAssignmentForm(prev => ({ ...prev, medicare_provider_number: e.target.value }))}
                      required
                      placeholder="e.g. 10-ASC02"
                    />
                  </div>

                  <div className="geo-form-group">
                    <label className="geo-form-label">Effective Start Date:</label>
                    <input
                      type="date"
                      className="geo-form-input"
                      value={assignmentForm.effective_start_date}
                      onChange={(e) => setAssignmentForm(prev => ({ ...prev, effective_start_date: e.target.value }))}
                      required
                    />
                  </div>

                  <div className="geo-form-group">
                    <label className="geo-form-label">Verification Documentation Source:</label>
                    <select
                      className="geo-form-select"
                      value={assignmentForm.verification_source}
                      onChange={(e) => setAssignmentForm(prev => ({ ...prev, verification_source: e.target.value }))}
                    >
                      {CBSA_VERIFICATION_SOURCES.map(src => (
                        <option key={src.id} value={src.id}>{src.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="geo-form-group">
                    <label className="geo-form-label">Verification Document URL / Link:</label>
                    <input
                      type="url"
                      className="geo-form-input"
                      value={assignmentForm.verification_document_url}
                      onChange={(e) => setAssignmentForm(prev => ({ ...prev, verification_document_url: e.target.value }))}
                      placeholder="https://medicare.gov/provider/10-ASC02-tie-in.pdf"
                    />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                    <input
                      type="checkbox"
                      id="geo_ascqr"
                      checked={assignmentForm.ascqr_compliant}
                      onChange={(e) => setAssignmentForm(prev => ({ ...prev, ascqr_compliant: e.target.checked }))}
                    />
                    <label htmlFor="geo_ascqr" style={{ fontSize: '0.85rem', color: '#0f172a', fontWeight: 600 }}>
                      Facility is ASCQR Quality Compliant (No 2.0% statutory rate penalty)
                    </label>
                  </div>

                  <div className="geo-form-actions">
                    <button
                      type="button"
                      className="geo-btn-secondary"
                      onClick={() => setIsAssignmentModalOpen(false)}
                      disabled={assignmentSaving}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="geo-btn-primary"
                      disabled={assignmentSaving}
                    >
                      {assignmentSaving ? 'Auditing & Saving...' : 'Save & Enforce CBSA Assignment'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 4: Releases */}
      {activeTab === 'releases' && (
        <div className="medicare-table-container">
          <table className="medicare-table">
            <thead>
              <tr>
                <th>Release Year</th>
                <th>Quarter</th>
                <th>Rule Type</th>
                <th>Conversion Factor</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {releases.map((rel) => (
                <tr key={rel.id || rel.release_year}>
                  <td style={{ fontWeight: 700 }}>CY {rel.release_year}</td>
                  <td>{rel.release_quarter}</td>
                  <td>{rel.rule_type}</td>
                  <td className="currency-cell">${parseFloat(rel.conversion_factor || 53.514).toFixed(4)}</td>
                  <td>
                    {rel.is_active ? (
                      <span className="pi-badge pi-badge-device">Published & Active</span>
                    ) : (
                      <span className="pi-badge pi-badge-packaged">Superseded</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 5: Payment Indicators & Claim Rules (Phase 61) */}
      {activeTab === 'indicators' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Hero Indicator KPI Summary */}
          <div className="medicare-stats-grid">
            <div className="medicare-stat-card">
              <span className="medicare-stat-label">Statutory Indicators</span>
              <strong className="medicare-stat-value" style={{ color: '#2563eb' }}>
                {indicatorDefs.length || 12} Indicators
              </strong>
              <span className="medicare-stat-sub">Addenda AA, BB & EE (CY 2026)</span>
            </div>
            <div className="medicare-stat-card">
              <span className="medicare-stat-label">Pre-Bill Claim Rules</span>
              <strong className="medicare-stat-value" style={{ color: '#059669' }}>
                {claimRules.length || 5} Active Rules
              </strong>
              <span className="medicare-stat-sub">SCRUB-20 to SCRUB-24 Active</span>
            </div>
            <div className="medicare-stat-card">
              <span className="medicare-stat-label">Inpatient-Only (IPO) Rule</span>
              <strong className="medicare-stat-value" style={{ color: '#dc2626' }}>
                Indicator C Hard Block
              </strong>
              <span className="medicare-stat-sub">42 CFR § 416.166 Fail-Closed</span>
            </div>
            <div className="medicare-stat-card">
              <span className="medicare-stat-label">Device Offset Protection</span>
              <strong className="medicare-stat-value" style={{ color: '#d97706' }}>
                Indicator J8 Protected
              </strong>
              <span className="medicare-stat-sub">Implant portion exempt from wage index</span>
            </div>
          </div>

          {/* Interactive Live Indicator Interpreter Workbench */}
          <div className="medicare-calc-card" style={{ background: '#ffffff', borderColor: '#cbd5e1' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <h3 style={{ margin: '0 0 0.25rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.15rem' }}>
                  <ShieldCheck size={20} color="#2563eb" />
                  Live Payment Indicator & Scrub Rule Interpreter
                </h3>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
                  Queries authoritative RPC <code>fn_interpret_cms_indicator</code> in real time with fail-closed safety.
                </p>
              </div>
              {/* Quick Code Test Chips */}
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="medicare-tab-btn"
                  style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem', background: '#f1f5f9', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                  onClick={() => { setTestPiCode('29881'); }}
                >
                  29881 (A2)
                </button>
                <button
                  type="button"
                  className="medicare-tab-btn"
                  style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem', background: '#f1f5f9', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                  onClick={() => { setTestPiCode('28465'); }}
                >
                  28465 (J8)
                </button>
                <button
                  type="button"
                  className="medicare-tab-btn"
                  style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem', background: '#f1f5f9', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                  onClick={() => { setTestPiCode('12001'); }}
                >
                  12001 (N1)
                </button>
                <button
                  type="button"
                  className="medicare-tab-btn"
                  style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem', background: '#fee2e2', color: '#991b1b', borderRadius: '4px', border: '1px solid #fecaca' }}
                  onClick={() => { setTestPiCode('99999'); }}
                >
                  99999 (Unlisted)
                </button>
              </div>
            </div>

            <form onSubmit={handleTestIndicator} style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="Enter CPT/HCPCS code (e.g. 29881, 28465, 0101T, 99999)..."
                value={testPiCode}
                onChange={(e) => setTestPiCode(e.target.value.toUpperCase())}
                className="medicare-calc-input"
                style={{ flex: 1, minWidth: '220px' }}
              />
              <button type="submit" disabled={testPiLoading} className="medicare-calc-btn">
                {testPiLoading ? 'Interpreting...' : 'Interpret Indicator (Live RPC)'}
              </button>
            </form>

            {testPiResult && (
              <div style={{ marginTop: '1rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                  <div style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>CPT / HCPCS Code</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', fontFamily: 'monospace' }}>{testPiResult.code}</div>
                    <div style={{ fontSize: '0.8rem', color: '#475569' }}>{testPiResult.short_name}</div>
                  </div>

                  <div style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Payment Indicator</div>
                    <div style={{ marginTop: '0.25rem' }}>{renderBadge(testPiResult.indicator_code)}</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>Addendum: {testPiResult.addendum_source || 'AA'}</div>
                  </div>

                  <div style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Coverage & Methodology</div>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem', color: testPiResult.is_covered ? '#059669' : '#dc2626' }}>
                      {testPiResult.coverage_category}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{testPiResult.payment_methodology}</div>
                  </div>

                  <div style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Pre-Bill Claim Action</div>
                    <div style={{ marginTop: '0.25rem' }}>
                      {testPiResult.claim_scrub_action === 'BLOCK_FATAL' ? (
                        <span className="pi-badge pi-badge-unresolved" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                          <AlertOctagon size={12} /> FATAL CLAIM BLOCK
                        </span>
                      ) : testPiResult.claim_scrub_action === 'CHECK_DEVICE' ? (
                        <span className="pi-badge pi-badge-device" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                          <CheckCircle2 size={12} /> CHECK DEVICE C-CODE
                        </span>
                      ) : testPiResult.claim_scrub_action === 'BUNDLE_APC' ? (
                        <span className="pi-badge pi-badge-packaged" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                          PACKAGED APC
                        </span>
                      ) : (
                        <span className="pi-badge pi-badge-standard" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                          <CheckCircle2 size={12} /> ALLOW CLAIM LINE
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>Rule: {testPiResult.scrub_rule_code}</div>
                  </div>
                </div>

                <div style={{ marginTop: '0.75rem', padding: '0.5rem 0.75rem', background: '#f1f5f9', borderRadius: '4px', fontSize: '0.78rem', color: '#475569', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span><strong>Statutory Citation:</strong> {testPiResult.statutory_citation || '42 CFR 416.166'} • <strong>Release:</strong> {testPiResult.release_label}</span>
                  {testPiResult.is_covered && (
                    <button
                      type="button"
                      style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                      onClick={() => {
                        setCalcCode(testPiResult.code);
                        setActiveTab('calculator');
                      }}
                    >
                      Open in Rate Resolver <ArrowRight size={14} />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Statutory Indicator Directory Table */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a' }}>CMS Payment Indicator Reference Catalog</h3>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
              Statutory ASC payment methodology rules established under 42 CFR § 416.166 and Addenda AA, BB & EE.
            </p>
            <div className="medicare-table-container">
              <table className="medicare-table">
                <thead>
                  <tr>
                    <th>Indicator</th>
                    <th>Short Description</th>
                    <th>Addendum</th>
                    <th>Coverage Category</th>
                    <th>Payment Methodology</th>
                    <th>MPPR</th>
                    <th>Device Intensive</th>
                    <th>Catalog Action</th>
                  </tr>
                </thead>
                <tbody>
                  {indicatorDefs.map((d) => (
                    <tr key={d.indicator_code}>
                      <td>{renderBadge(d.indicator_code)}</td>
                      <td style={{ fontWeight: 600 }}>{d.short_name}</td>
                      <td>Addendum {d.addendum_source}</td>
                      <td>
                        <span style={{ color: d.coverage_category === 'Covered_Surgical' ? '#059669' : d.coverage_category === 'Inpatient_Only' ? '#dc2626' : '#475569', fontWeight: 600 }}>
                          {d.coverage_category}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.85rem' }}>{d.payment_methodology}</td>
                      <td>{d.is_mppr_eligible ? 'Yes (50%)' : 'Exempt'}</td>
                      <td>{d.is_device_intensive ? 'Yes (Offset Protected)' : 'No'}</td>
                      <td>
                        <button
                          type="button"
                          className="medicare-tab-btn"
                          style={{ padding: '0.25rem 0.6rem', fontSize: '0.78rem', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: '4px' }}
                          onClick={() => {
                            setPiFilter(d.indicator_code);
                            setActiveTab('addenda');
                          }}
                        >
                          Filter Catalog
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pre-Bill Claim Scrubbing Rules Engine Table */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a' }}>Pre-Bill Claim Scrubbing Rules Engine</h3>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
              Automated compliance validators deployed in Migration 037 enforcing statutory CMS billing constraints.
            </p>
            <div className="medicare-table-container">
              <table className="medicare-table">
                <thead>
                  <tr>
                    <th>Rule ID</th>
                    <th>Indicator</th>
                    <th>Severity</th>
                    <th>Rule Description</th>
                    <th>Remediation Guidance</th>
                  </tr>
                </thead>
                <tbody>
                  {claimRules.map((cr) => (
                    <tr key={cr.rule_identifier}>
                      <td style={{ fontFamily: 'monospace', fontWeight: 700, color: '#2563eb' }}>{cr.rule_identifier}</td>
                      <td>{renderBadge(cr.indicator_code)}</td>
                      <td>
                        <span className={cr.severity === 'FATAL' ? 'pi-badge pi-badge-unresolved' : 'pi-badge pi-badge-ancillary'}>
                          {cr.severity}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.85rem', fontWeight: 600 }}>{cr.rule_description}</td>
                      <td style={{ fontSize: '0.82rem', color: '#475569' }}>{cr.remediation_guidance}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 6: Device-Intensive Payment Rules & C-Code Crosswalk (Phase 63) */}
      {activeTab === 'device_intensive' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Hero KPI Grid */}
          <div className="medicare-stats-grid">
            <div className="medicare-stat-card">
              <span className="medicare-stat-label">Device Threshold</span>
              <strong className="medicare-stat-value" style={{ color: '#2563eb' }}>
                &gt; 30.00% Offset
              </strong>
              <span className="medicare-stat-sub">42 CFR § 416.171(b)(2) Statutory Invariant</span>
            </div>
            <div className="medicare-stat-card">
              <span className="medicare-stat-label">Wage Index Protection</span>
              <strong className="medicare-stat-value" style={{ color: '#059669' }}>
                100% Wage Exempt
              </strong>
              <span className="medicare-stat-sub">Implant offset exempt from geographic index</span>
            </div>
            <div className="medicare-stat-card">
              <span className="medicare-stat-label">Secondary MPPR Protection</span>
              <strong className="medicare-stat-value" style={{ color: '#d97706' }}>
                Service Share Only
              </strong>
              <span className="medicare-stat-sub">Device offset paid at 100% on secondary lines</span>
            </div>
            <div className="medicare-stat-card">
              <span className="medicare-stat-label">C-Code Packaging</span>
              <strong className="medicare-stat-value" style={{ color: '#475569' }}>
                $0.00 Allowable
              </strong>
              <span className="medicare-stat-sub">100% packaged into primary procedure APC</span>
            </div>
          </div>

          {/* Interactive Statutory Device Offset & MPPR Simulator */}
          <div className="medicare-calc-card" style={{ background: '#ffffff', borderColor: '#cbd5e1' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1.15rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Cpu size={18} color="#2563eb" />
                  Statutory 42 CFR § 416.171(b)(2) Device Offset &amp; MPPR Simulator
                </h3>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
                  Simulates statutory device offset carve-out, geographic wage index exemption, and MPPR secondary procedure protection.
                </p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
              <div className="geo-form-group">
                <label className="geo-form-label">Procedure Preset (J8 Device-Intensive):</label>
                <select
                  className="geo-form-select"
                  value={devSimCode}
                  onChange={(e) => {
                    const code = e.target.value;
                    setDevSimCode(code);
                    if (code === '27447') {
                      setDevSimRate(10500.00);
                      setDevSimOffset(0.3315);
                    } else if (code === '27130') {
                      setDevSimRate(11200.00);
                      setDevSimOffset(0.3420);
                    } else if (code === '63685') {
                      setDevSimRate(28000.00);
                      setDevSimOffset(0.8245);
                    } else if (code === '33249') {
                      setDevSimRate(32500.00);
                      setDevSimOffset(0.7420);
                    } else if (code === '28465') {
                      setDevSimRate(4671.46);
                      setDevSimOffset(0.3500);
                    }
                  }}
                >
                  <option value="27447">27447 — Total Knee Arthroplasty ($10,500.00 • 33.15%)</option>
                  <option value="27130">27130 — Total Hip Arthroplasty ($11,200.00 • 34.20%)</option>
                  <option value="63685">63685 — Neurostimulator Generator ($28,000.00 • 82.45%)</option>
                  <option value="33249">33249 — Transvenous ICD Generator ($32,500.00 • 74.20%)</option>
                  <option value="28465">28465 — Tarsal Bone Fracture Repair ($4,671.46 • 35.00%)</option>
                </select>
              </div>

              <div className="geo-form-group">
                <label className="geo-form-label">National Unadjusted Rate ($):</label>
                <input
                  type="number"
                  step="0.01"
                  className="geo-form-input"
                  value={devSimRate}
                  onChange={(e) => setDevSimRate(parseFloat(e.target.value) || 0)}
                />
              </div>

              <div className="geo-form-group">
                <label className="geo-form-label">CMS Device Offset Fraction (0.30 - 0.99):</label>
                <input
                  type="number"
                  step="0.0001"
                  min="0.3000"
                  max="0.9999"
                  className="geo-form-input"
                  value={devSimOffset}
                  onChange={(e) => setDevSimOffset(parseFloat(e.target.value) || 0)}
                />
              </div>

              <div className="geo-form-group">
                <label className="geo-form-label">Facility Wage Index:</label>
                <input
                  type="number"
                  step="0.0001"
                  className="geo-form-input"
                  value={devSimWage}
                  onChange={(e) => setDevSimWage(parseFloat(e.target.value) || 1.0)}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', marginBottom: '1.25rem', padding: '0.75rem', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', fontWeight: 600, color: '#0f172a', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={devSimAscqr}
                  onChange={(e) => setDevSimAscqr(e.target.checked)}
                />
                ASCQR Quality Compliant (No 2% Penalty)
              </label>

              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', fontWeight: 600, color: '#2563eb', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={devSimMpprSecondary}
                  onChange={(e) => setDevSimMpprSecondary(e.target.checked)}
                />
                Simulate as Secondary Procedure under MPPR (50% cut strictly on service share)
              </label>
            </div>

            {/* Step-by-Step Mathematical Trace */}
            {devSimResult && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
                <div className="geo-step-box">
                  <span className="geo-step-title">1. National Base</span>
                  <span className="geo-step-value">${(devSimResult.nationalRate || 0).toFixed(2)}</span>
                  <span className="geo-step-note">Unadjusted Baseline</span>
                </div>
                <div className="geo-step-box">
                  <span className="geo-step-title">2. Device Offset</span>
                  <span className="geo-step-value" style={{ color: '#d97706' }}>
                    ${(devSimResult.deviceOffsetAmount || 0).toFixed(2)}
                  </span>
                  <span className="geo-step-note">{((devSimResult.offsetPercentage || 0) * 100).toFixed(2)}% (100% Wage Exempt)</span>
                </div>
                <div className="geo-step-box">
                  <span className="geo-step-title">3. Net Service Portion</span>
                  <span className="geo-step-value">${(devSimResult.servicePortionUnadjusted || 0).toFixed(2)}</span>
                  <span className="geo-step-note">Subject to 50/50 Math</span>
                </div>
                <div className="geo-step-box">
                  <span className="geo-step-title">4. Adjusted Service</span>
                  <span className="geo-step-value" style={{ color: '#2563eb' }}>
                    ${(devSimMpprSecondary ? devSimResult.secondaryServiceShare : devSimResult.servicePortionAdjusted || 0).toFixed(2)}
                  </span>
                  <span className="geo-step-note">{devSimMpprSecondary ? 'Halved under MPPR (50%)' : 'Labor + Non-Labor'}</span>
                </div>
                <div className="geo-step-box" style={{ background: '#f8fafc', borderColor: '#2563eb' }}>
                  <span className="geo-step-title" style={{ color: '#2563eb' }}>Final Facility Rate</span>
                  <span className="geo-step-value" style={{ color: '#059669', fontSize: '1.35rem' }}>
                    ${(devSimMpprSecondary ? devSimResult.secondaryAllowableRate : devSimResult.allowableRate || 0).toFixed(2)}
                  </span>
                  <span className="geo-step-note" style={{ color: '#059669', fontWeight: 600 }}>
                    {devSimMpprSecondary ? `MPPR Savings: ${(devSimResult.mpprSavings || 0).toFixed(2)}` : 'Authoritative Rate'}
                  </span>
                </div>
              </div>
            )}

            {devSimResult && (
              <div style={{ fontSize: '0.8rem', color: '#64748b', fontStyle: 'italic', background: '#f8fafc', padding: '0.5rem 0.75rem', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                <strong>Statutory Trace:</strong> {devSimResult.formulaDescription}
              </div>
            )}
          </div>

          {/* Official CMS Device-Intensive Procedures Directory Table */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1.1rem', color: '#0f172a' }}>
                  Official CMS Device-Intensive Procedures Catalog (CY 2026)
                </h3>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
                  Statutory empirical device offset percentages from CMS-1823-FC Addendum AA.
                </p>
              </div>

              <div style={{ position: 'relative', minWidth: '240px' }}>
                <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: '#94a3b8' }} />
                <input
                  type="text"
                  className="geo-form-input"
                  style={{ paddingLeft: '32px' }}
                  placeholder="Search CPT or APC code..."
                  value={deviceSearch}
                  onChange={(e) => {
                    setDeviceSearch(e.target.value);
                    setDevicePage(1);
                  }}
                />
              </div>
            </div>

            <div className="medicare-table-container">
              <table className="medicare-table">
                <thead>
                  <tr>
                    <th>CPT Code</th>
                    <th>Procedure Descriptor</th>
                    <th>Indicator</th>
                    <th style={{ textAlign: 'right' }}>National Rate</th>
                    <th style={{ textAlign: 'right' }}>Empirical Offset %</th>
                    <th style={{ textAlign: 'right' }}>Protected Device Portion</th>
                    <th style={{ textAlign: 'right' }}>Service Portion</th>
                    <th>APC Group</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {deviceLoading ? (
                    <tr>
                      <td colSpan="9" style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                        Loading device-intensive catalog...
                      </td>
                    </tr>
                  ) : deviceProcedures.length === 0 ? (
                    <tr>
                      <td colSpan="9" style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                        No device-intensive procedures matching filter.
                      </td>
                    </tr>
                  ) : (
                    deviceProcedures.map((p) => {
                      const offsetPct = parseFloat(p.device_offset_percentage || 0);
                      const natRate = parseFloat(p.national_unadjusted_rate || 0);
                      const devAmt = parseFloat(p.device_offset_amount || (natRate * offsetPct));
                      const srvPortion = parseFloat(p.service_portion_unadjusted || (natRate - devAmt));
                      return (
                        <tr key={p.cpt_code}>
                          <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{p.cpt_code}</td>
                          <td>{p.description || 'Device-Intensive Procedure'}</td>
                          <td><span className="pi-badge pi-badge-device">J8 Device</span></td>
                          <td className="currency-cell">${natRate.toFixed(2)}</td>
                          <td className="currency-cell" style={{ fontWeight: 700, color: '#d97706' }}>
                            {(offsetPct * 100).toFixed(2)}%
                          </td>
                          <td className="currency-cell" style={{ color: '#059669', fontWeight: 600 }}>
                            ${devAmt.toFixed(2)}
                          </td>
                          <td className="currency-cell">${srvPortion.toFixed(2)}</td>
                          <td style={{ fontFamily: 'monospace' }}>{p.apc_code || '5115'}</td>
                          <td>
                            <button
                              type="button"
                              className="geo-btn-secondary"
                              style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', color: '#2563eb', borderColor: '#bfdbfe' }}
                              onClick={() => {
                                setDevSimCode(p.cpt_code);
                                setDevSimRate(natRate);
                                setDevSimOffset(offsetPct);
                                window.scrollTo({ top: 350, behavior: 'smooth' });
                              }}
                            >
                              Use in Simulator
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="medicare-pagination">
              <span className="medicare-pagination-info">
                Showing <strong>{(devicePage - 1) * devicePageSize + 1}</strong> to <strong>{Math.min(devicePage * devicePageSize, deviceTotalCount)}</strong> of <strong>{deviceTotalCount}</strong> device procedures
              </span>
              <div className="medicare-pagination-btns">
                <button
                  type="button"
                  className="medicare-page-btn"
                  disabled={devicePage <= 1}
                  onClick={() => setDevicePage(prev => Math.max(1, prev - 1))}
                >
                  Previous
                </button>
                <span className="medicare-page-current">Page {devicePage} of {deviceTotalPages}</span>
                <button
                  type="button"
                  className="medicare-page-btn"
                  disabled={devicePage >= deviceTotalPages}
                  onClick={() => setDevicePage(prev => Math.min(deviceTotalPages, prev + 1))}
                >
                  Next
                </button>
              </div>
            </div>
          </div>

          {/* CMS Device Categories (HCPCS Level II C-Codes) Master Table */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.5rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#0f172a' }}>
                CMS HCPCS Level II Device Categories (C-Codes)
              </h3>
              <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b' }}>
                All implant hardware C-codes receive $0.00 separate allowable (packaged into primary APC).
              </p>
              <div className="medicare-table-container">
                <table className="medicare-table">
                  <thead>
                    <tr>
                      <th>HCPCS Code</th>
                      <th>Category Descriptor</th>
                      <th>Clinical Construct</th>
                      <th>Packaging Rule</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(deviceCategories.length > 0 ? deviceCategories : CMS_DEVICE_CATEGORIES).map((c) => (
                      <tr key={c.category_code}>
                        <td style={{ fontFamily: 'monospace', fontWeight: 700, color: '#2563eb' }}>{c.category_code}</td>
                        <td style={{ fontWeight: 600 }}>{c.category_title}</td>
                        <td style={{ fontSize: '0.8rem', color: '#475569' }}>{c.clinical_construct}</td>
                        <td>
                          <span className="pi-badge pi-badge-packaged">
                            $0.00 Packaged
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* CPT-to-Device Category Crosswalk */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#0f172a' }}>
                CPT-to-Device Category Mandatory Crosswalk
              </h3>
              <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b' }}>
                CMS Device-to-Procedure Edits enforced by pre-bill claim rule SCRUB-21.
              </p>
              <div className="medicare-table-container">
                <table className="medicare-table">
                  <thead>
                    <tr>
                      <th>Primary CPT</th>
                      <th>Mandatory C-Code</th>
                      <th>Minimum Units</th>
                      <th>Claim Scrub Edit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deviceCrosswalk.map((x, idx) => (
                      <tr key={`${x.cpt_code}_${x.device_category_code}_${idx}`}>
                        <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{x.cpt_code}</td>
                        <td style={{ fontFamily: 'monospace', color: '#2563eb', fontWeight: 600 }}>
                          {x.device_category_code}
                        </td>
                        <td>{x.minimum_quantity || 1} unit(s)</td>
                        <td>
                          <span className="pi-badge pi-badge-device" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                            <CheckCircle2 size={12} /> SCRUB-21 Active
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Case Device Margin Reconciliation Workbench */}
          <div className="geo-card" style={{ background: '#ffffff', borderColor: '#cbd5e1' }}>
            <h4 className="geo-card-title">
              <Scale size={16} color="#2563eb" />
              Case Device Reimbursement vs Vendor Invoice Cost Margin Reconciliation
            </h4>
            <p className="geo-desc">
              Compares the CMS statutory device offset allowance against actual acquisition costs allocated on vendor invoices.
            </p>

            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1rem' }}>
              <button
                type="button"
                className="geo-btn-primary"
                disabled={marginLoading}
                onClick={() => handleReconcileDeviceMargin(1)}
              >
                {marginLoading ? 'Reconciling...' : 'Run Case Margin Audit (Sample Case 27447)'}
              </button>
            </div>

            {marginResult && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', background: '#f8fafc', padding: '1rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>CPT Code &amp; Indicator</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>{marginResult.cpt_code} ({marginResult.payment_indicator})</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>CMS Device Allowance</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#059669' }}>
                    ${parseFloat(marginResult.device_offset_allowance || 0).toFixed(2)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>Actual Invoice Acquisition Cost</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#dc2626' }}>
                    ${parseFloat(marginResult.actual_acquisition_cost || 0).toFixed(2)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>Device Net Margin Variance</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: marginResult.net_margin >= 0 ? '#059669' : '#dc2626' }}>
                    {marginResult.net_margin >= 0 ? '+' : ''}${parseFloat(marginResult.net_margin || 0).toFixed(2)} ({marginResult.margin_percentage}%)
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>Financial Health Status</div>
                  <div style={{ marginTop: '0.25rem' }}>
                    <span className={marginResult.reconciliation_status === 'SURPLUS' ? 'pi-badge pi-badge-device' : 'pi-badge pi-badge-unresolved'}>
                      {marginResult.reconciliation_status}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 7: Multiple Procedure Payment Rules (MPPR) */}
      {activeTab === 'mppr' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Header Banner */}
          <div className="medicare-card" style={{ borderLeft: '4px solid #2563eb' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <h3 style={{ margin: '0 0 0.35rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.2rem', color: '#0f172a' }}>
                  <Layers size={20} color="#2563eb" />
                  Multiple Procedure Payment Rules (MPPR) &amp; Reductions
                </h3>
                <div style={{ fontSize: '0.875rem', color: '#64748b', maxWidth: '880px', lineHeight: 1.5 }}>
                  Statutory 100%/50% multi-procedure discounting pursuant to <strong>42 CFR § 416.172</strong>.
                  Automates deterministic allowable-based ranking, 100% protection of J8 device offsets, endoscopy base-code deductions,
                  single-line bilateral 150% pricing, and commercial cascading matrices.
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span className="pi-badge pi-badge-device" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <ShieldCheck size={13} />
                  42 CFR § 416.172 Compliant
                </span>
                <span className="pi-badge pi-badge-covered" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <CheckCircle2 size={13} />
                  Zero Chargemaster Leakage
                </span>
              </div>
            </div>
          </div>

          {/* KPI Metrics */}
          {mpprCalcResult && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '1rem' }}>
              <div className="medicare-card" style={{ padding: '1rem', borderTop: '3px solid #64748b' }}>
                <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 600 }}>
                  Total Gross Charges
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#0f172a', marginTop: '0.25rem' }}>
                  ${mpprCalcResult.totalGrossCharges.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                  Billed chargemaster total
                </div>
              </div>

              <div className="medicare-card" style={{ padding: '1rem', borderTop: '3px solid #2563eb' }}>
                <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 600 }}>
                  Unreduced Allowable
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#2563eb', marginTop: '0.25rem' }}>
                  ${mpprCalcResult.totalUnreducedAllowable.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.2rem' }}>
                  Sum of single-unit allowable rates
                </div>
              </div>

              <div className="medicare-card" style={{ padding: '1rem', borderTop: '3px solid #dc2626' }}>
                <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 600 }}>
                  MPPR Reductions / Deductions
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#dc2626', marginTop: '0.25rem' }}>
                  -${mpprCalcResult.totalMpprSavings.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#dc2626', marginTop: '0.2rem' }}>
                  {mpprCalcResult.totalUnreducedAllowable > 0 
                    ? `${((mpprCalcResult.totalMpprSavings / mpprCalcResult.totalUnreducedAllowable) * 100).toFixed(1)}% reduction variance`
                    : 'No reduction applied'}
                </div>
              </div>

              <div className="medicare-card" style={{ padding: '1rem', borderTop: '3px solid #059669' }}>
                <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 600 }}>
                  Net Expected Reimbursement
                </div>
                <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#059669', marginTop: '0.25rem' }}>
                  ${mpprCalcResult.totalFinalAllowable.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#059669', marginTop: '0.2rem' }}>
                  Effective encounter payment
                </div>
              </div>
            </div>
          )}

          {/* Preset Scenarios Toolbar */}
          <div className="medicare-card" style={{ padding: '0.85rem 1.25rem', background: '#f8fafc' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>
                <ListOrdered size={16} color="#2563eb" />
                <span>Regulatory Test Scenarios:</span>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="geo-btn-secondary"
                  style={{ fontSize: '0.8rem', padding: '0.35rem 0.65rem' }}
                  onClick={() => handleLoadPresetScenario('dual_ortho')}
                >
                  Dual Knee Arthroscopy (29881 + 29877)
                </button>
                <button
                  type="button"
                  className="geo-btn-secondary"
                  style={{ fontSize: '0.8rem', padding: '0.35rem 0.65rem' }}
                  onClick={() => handleLoadPresetScenario('device_secondary')}
                >
                  J8 Offset Protection (22856 + 27447)
                </button>
                <button
                  type="button"
                  className="geo-btn-secondary"
                  style={{ fontSize: '0.8rem', padding: '0.35rem 0.65rem' }}
                  onClick={() => handleLoadPresetScenario('endoscopy_family')}
                >
                  Endoscopy Base Deduction (45381 + 45380)
                </button>
                <button
                  type="button"
                  className="geo-btn-secondary"
                  style={{ fontSize: '0.8rem', padding: '0.35rem 0.65rem' }}
                  onClick={() => handleLoadPresetScenario('bilateral_50')}
                >
                  Bilateral 150% (27447 Mod 50)
                </button>
                <button
                  type="button"
                  className="geo-btn-secondary"
                  style={{ fontSize: '0.8rem', padding: '0.35rem 0.65rem' }}
                  onClick={() => handleLoadPresetScenario('commercial_cascade')}
                >
                  Commercial 100/50/25/0 Cascade
                </button>
              </div>
            </div>
          </div>

          {/* Interactive Claim Simulator Container */}
          <div className="medicare-card">
            <h4 style={{ margin: '0 0 1rem 0', fontSize: '1rem', fontWeight: 600, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Calculator size={18} color="#2563eb" />
              Interactive Multi-Line Claim Simulator
            </h4>

            {/* Encounter Config Bar */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', padding: '1rem', background: '#f8fafc', borderRadius: '6px', marginBottom: '1.25rem', border: '1px solid #e2e8f0' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>
                  Reduction Rule Set &amp; Payment System
                </label>
                <select
                  value={selectedRuleSet}
                  onChange={(e) => setSelectedRuleSet(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                >
                  {mpprRuleSets.map(rs => (
                    <option key={rs.rule_set_code} value={rs.rule_set_code}>
                      {rs.name} ({rs.rule_set_code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>
                  Facility CBSA Wage Index
                </label>
                <input
                  type="number"
                  step="0.0001"
                  min="0.5"
                  max="2.5"
                  value={mpprWageIndex}
                  onChange={(e) => setMpprWageIndex(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '0.35rem' }}>
                  Quality Reporting (ASCQR)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: '#0f172a', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={mpprAscqr}
                    onChange={(e) => setMpprAscqr(e.target.checked)}
                  />
                  <span>ASCQR Compliant (No 2.0% Penalty)</span>
                </label>
              </div>
            </div>

            {/* Claim Lines List */}
            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#334155' }}>
                  Claim Procedure Lines ({mpprLines.length})
                </span>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  Ranked automatically by allowable descending (highest to lowest)
                </span>
              </div>

              <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                <table className="medicare-table" style={{ margin: 0 }}>
                  <thead>
                    <tr>
                      <th style={{ width: '60px' }}>Line #</th>
                      <th style={{ width: '100px' }}>CPT Code</th>
                      <th>Description</th>
                      <th style={{ width: '80px' }}>PI</th>
                      <th style={{ width: '100px', textAlign: 'right' }}>Nat. Rate</th>
                      <th style={{ width: '90px', textAlign: 'right' }}>Device %</th>
                      <th style={{ width: '100px' }}>Modifiers</th>
                      <th style={{ width: '70px', textAlign: 'center' }}>Units</th>
                      <th style={{ width: '110px', textAlign: 'right' }}>Gross Charge</th>
                      <th style={{ width: '70px', textAlign: 'center' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mpprLines.map((line, idx) => (
                      <tr key={line.id}>
                        <td style={{ fontWeight: 600, color: '#64748b' }}>{idx + 1}</td>
                        <td style={{ fontWeight: 700, color: '#0f172a' }}>{line.cpt_code}</td>
                        <td style={{ fontSize: '0.8rem', color: '#475569' }}>{line.description}</td>
                        <td>
                          <span className={line.payment_indicator === 'J8' ? 'pi-badge pi-badge-device' : 'pi-badge pi-badge-covered'}>
                            {line.payment_indicator}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>
                          ${line.national_unadjusted_rate.toFixed(2)}
                        </td>
                        <td style={{ textAlign: 'right', color: line.device_offset_percentage > 0 ? '#059669' : '#94a3b8' }}>
                          {(line.device_offset_percentage * 100).toFixed(2)}%
                        </td>
                        <td>
                          {line.modifiers && line.modifiers.length > 0 ? (
                            <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                              {line.modifiers.map(m => (
                                <span key={m} style={{ background: '#e2e8f0', color: '#0f172a', padding: '0.1rem 0.35rem', borderRadius: '3px', fontSize: '0.75rem', fontWeight: 600 }}>
                                  {m}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>None</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 600 }}>{line.units}</td>
                        <td style={{ textAlign: 'right', color: '#64748b' }}>
                          ${line.gross_charge.toFixed(2)}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => handleRemoveClaimLine(line.id)}
                            style={{ background: 'transparent', border: 'none', color: '#dc2626', cursor: 'pointer', padding: '0.25rem' }}
                            title="Remove line"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {mpprLines.length === 0 && (
                      <tr>
                        <td colSpan={10} style={{ textAlign: 'center', padding: '1.5rem', color: '#94a3b8' }}>
                          No claim procedure lines entered. Add a line below or click a regulatory test scenario above.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Add Procedure Line Form */}
            <form onSubmit={handleAddClaimLine} style={{ background: '#f8fafc', padding: '1rem', borderRadius: '6px', border: '1px solid #e2e8f0', marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Plus size={16} color="#2563eb" />
                Add Procedure Line to Simulated Encounter
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>
                    CPT / HCPCS
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 29881"
                    value={newLineForm.cpt_code}
                    onChange={(e) => setNewLineForm({ ...newLineForm, cpt_code: e.target.value })}
                    style={{ width: '100%', padding: '0.4rem 0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>
                    Payment Indicator
                  </label>
                  <select
                    value={newLineForm.payment_indicator}
                    onChange={(e) => setNewLineForm({ ...newLineForm, payment_indicator: e.target.value })}
                    style={{ width: '100%', padding: '0.4rem 0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                  >
                    <option value="A2">A2 (Standard Surgical)</option>
                    <option value="J8">J8 (Device-Intensive)</option>
                    <option value="G2">G2 (Non-Office Surgical)</option>
                    <option value="N1">N1 (Packaged / $0.00)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>
                    Unadjusted Rate ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={newLineForm.national_unadjusted_rate}
                    onChange={(e) => setNewLineForm({ ...newLineForm, national_unadjusted_rate: e.target.value })}
                    style={{ width: '100%', padding: '0.4rem 0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>
                    Device Offset %
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    min="0"
                    max="1"
                    value={newLineForm.device_offset_percentage}
                    onChange={(e) => setNewLineForm({ ...newLineForm, device_offset_percentage: e.target.value })}
                    style={{ width: '100%', padding: '0.4rem 0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>
                    Units
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="99"
                    value={newLineForm.units}
                    onChange={(e) => setNewLineForm({ ...newLineForm, units: e.target.value })}
                    style={{ width: '100%', padding: '0.4rem 0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>
                    Gross Charge ($)
                  </label>
                  <input
                    type="number"
                    step="1"
                    value={newLineForm.gross_charge}
                    onChange={(e) => setNewLineForm({ ...newLineForm, gross_charge: e.target.value })}
                    style={{ width: '100%', padding: '0.4rem 0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                  />
                </div>
              </div>

              {/* Modifiers Checkboxes */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569' }}>Modifiers:</span>
                {['50', '51', '73', '74', 'RT', 'LT'].map(mod => (
                  <label key={mod} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem', color: '#334155', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={newLineForm.modifiers.includes(mod)}
                      onChange={() => handleToggleModifier(mod)}
                    />
                    <span>{mod}</span>
                  </label>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="submit"
                  className="geo-btn-primary"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem' }}
                >
                  <Plus size={15} />
                  Add Line to Claim
                </button>
              </div>
            </form>

            {/* Reimbursement Calculation Audit Ledger */}
            {mpprCalcResult && mpprCalcResult.lines && mpprCalcResult.lines.length > 0 && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: '#0f172a' }}>
                    Deterministic Line-by-Line Reimbursement Ledger
                  </h4>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      type="button"
                      className="geo-btn-secondary"
                      disabled={mpprSnapshotLoading}
                      onClick={handleRecordMpprSnapshot}
                      style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                    >
                      <ShieldCheck size={14} color="#059669" />
                      {mpprSnapshotLoading ? 'Recording...' : 'Record Immutable Audit Snapshot'}
                    </button>
                  </div>
                </div>

                {mpprAuditFeedback && (
                  <div style={{
                    padding: '0.75rem 1rem',
                    borderRadius: '6px',
                    marginBottom: '1rem',
                    fontSize: '0.85rem',
                    background: mpprAuditFeedback.type === 'success' ? '#ecfdf5' : '#fef2f2',
                    border: mpprAuditFeedback.type === 'success' ? '1px solid #a7f3d0' : '1px solid #fecaca',
                    color: mpprAuditFeedback.type === 'success' ? '#047857' : '#b91c1c'
                  }}>
                    {mpprAuditFeedback.message}
                  </div>
                )}

                <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                  <table className="medicare-table" style={{ margin: 0 }}>
                    <thead>
                      <tr>
                        <th style={{ width: '50px' }}>Rank</th>
                        <th style={{ width: '90px' }}>CPT</th>
                        <th style={{ width: '80px' }}>Modifiers</th>
                        <th style={{ width: '110px', textAlign: 'right' }}>Unreduced Rate</th>
                        <th style={{ width: '80px', textAlign: 'center' }}>Multiplier</th>
                        <th style={{ width: '110px', textAlign: 'right' }}>Protected Device</th>
                        <th style={{ width: '110px', textAlign: 'right' }}>Paid Service</th>
                        <th style={{ width: '120px', textAlign: 'right' }}>Final Allowable</th>
                        <th>Statutory Calculation Audit Rationale</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mpprCalcResult.lines.map((l, idx) => (
                        <tr key={idx} style={{ background: l.rank_order === 1 ? '#eff6ff' : '#ffffff' }}>
                          <td style={{ fontWeight: 700, color: l.rank_order === 1 ? '#1d4ed8' : '#64748b' }}>
                            #{l.rank_order}
                          </td>
                          <td style={{ fontWeight: 700, color: '#0f172a' }}>
                            {l.cpt_code}
                            <span style={{ fontSize: '0.7rem', color: '#64748b', marginLeft: '0.25rem' }}>
                              ({l.payment_indicator})
                            </span>
                          </td>
                          <td>
                            {l.modifiers && l.modifiers.length > 0 ? (
                              <div style={{ display: 'flex', gap: '0.2rem' }}>
                                {l.modifiers.map(m => (
                                  <span key={m} style={{ background: '#e2e8f0', padding: '0.05rem 0.3rem', borderRadius: '3px', fontSize: '0.7rem', fontWeight: 600 }}>
                                    {m}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>-</span>
                            )}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>
                            ${l.unreduced_allowable.toFixed(2)}
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 700, color: l.multiplier_percentage === 1 ? '#059669' : '#d97706' }}>
                            {(l.multiplier_percentage * 100).toFixed(0)}%
                          </td>
                          <td style={{ textAlign: 'right', color: l.protected_device_offset > 0 ? '#059669' : '#94a3b8', fontWeight: 600 }}>
                            ${l.protected_device_offset.toFixed(2)}
                          </td>
                          <td style={{ textAlign: 'right', color: '#475569' }}>
                            ${l.reduced_service_portion.toFixed(2)}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: '#059669', fontSize: '0.95rem' }}>
                            ${l.final_line_allowable.toFixed(2)}
                          </td>
                          <td style={{ fontSize: '0.75rem', color: '#334155', lineHeight: 1.4 }}>
                            {l.calculation_rationale}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* CMS Endoscopy Families & Commercial Matrix Accordions / Grids */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '1.25rem' }}>
            {/* Endoscopy Families */}
            <div className="medicare-card">
              <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', fontWeight: 600, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Eye size={18} color="#2563eb" />
                CMS CY 2026 Endoscopy Families (42 CFR § 416.172(c))
              </h4>
              <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '0.75rem' }}>
                When multiple endoscopies in the same family are performed, payment is determined by deducting the base code rate from the member procedure rate.
              </div>

              <div style={{ marginBottom: '0.75rem' }}>
                <input
                  type="text"
                  placeholder="Filter by CPT code or family name..."
                  value={mpprEndoscopySearch}
                  onChange={(e) => setMpprEndoscopySearch(e.target.value)}
                  style={{ width: '100%', padding: '0.4rem 0.65rem', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                />
              </div>

              <div style={{ maxHeight: '280px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                <table className="medicare-table" style={{ margin: 0 }}>
                  <thead>
                    <tr>
                      <th style={{ width: '70px' }}>Fam #</th>
                      <th>Family Category</th>
                      <th style={{ width: '90px' }}>Member CPT</th>
                      <th style={{ width: '90px' }}>Base CPT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mpprEndoscopyFamilies
                      .filter(f => {
                        const q = mpprEndoscopySearch.toLowerCase();
                        return !q || f.family_name.toLowerCase().includes(q) || f.member_cpt_code.includes(q) || f.base_cpt_code.includes(q);
                      })
                      .map((fam, idx) => (
                        <tr key={idx}>
                          <td style={{ fontWeight: 600, color: '#64748b' }}>{fam.family_id}</td>
                          <td style={{ fontSize: '0.8rem', color: '#0f172a' }}>{fam.family_name}</td>
                          <td style={{ fontWeight: 700, color: '#2563eb' }}>{fam.member_cpt_code}</td>
                          <td style={{ fontWeight: 600, color: '#059669' }}>{fam.base_cpt_code}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Regulatory Rules & Cascades Reference */}
            <div className="medicare-card">
              <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', fontWeight: 600, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Scale size={18} color="#2563eb" />
                Medicare ASC vs Commercial Cascades Comparison
              </h4>
              <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '0.75rem' }}>
                Key operational and billing policy divergence across payers:
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', fontSize: '0.825rem' }}>
                <div style={{ padding: '0.65rem', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '0.2rem' }}>
                    1. Procedure Ranking Metric
                  </div>
                  <div style={{ color: '#475569' }}>
                    Medicare ASC: Strictly single-unit allowable rate descending. Gross chargemaster charge ranking is prohibited.
                    Commercial Payers: Default to allowable rate descending; legacy contracts may attempt gross-charge sequencing.
                  </div>
                </div>

                <div style={{ padding: '0.65rem', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '0.2rem' }}>
                    2. Device Offset Protection (J8 Procedures)
                  </div>
                  <div style={{ color: '#475569' }}>
                    Medicare ASC: 100% of device offset is protected and exempt from multiple procedure discounting. 50% discount strictly applied to service portion.
                    Commercial: Subject to payer contract terms; carve-outs must be separately specified.
                  </div>
                </div>

                <div style={{ padding: '0.65rem', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '0.2rem' }}>
                    3. Modifier 51 Billing Instructions
                  </div>
                  <div style={{ color: '#475569' }}>
                    Medicare ASC: Modifier 51 is PROHIBITED (MAC claims systems auto-sequence and reduce).
                    Commercial: Modifier 51 is REQUIRED on secondary procedures to avoid immediate duplicate-line rejection.
                  </div>
                </div>

                <div style={{ padding: '0.65rem', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '0.2rem' }}>
                    4. Bilateral Procedures (Modifier 50)
                  </div>
                  <div style={{ color: '#475569' }}>
                    Medicare ASC: Billed on 1 line with 1 unit; reimbursed at 150% allowable.
                    Commercial: Paid at 150% on 1 line or 100%/50% across two lines depending on payer claims manual.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
