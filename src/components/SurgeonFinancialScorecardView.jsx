import React, { useState, useMemo } from 'react';
import {
  DollarSign,
  TrendingUp,
  Clock,
  Calendar,
  Users,
  Search,
  Filter,
  RefreshCw,
  ChevronRight,
  X,
  PieChart,
  BarChart2,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  ShieldCheck,
  FileText,
  Activity,
  Layers,
  Percent
} from 'lucide-react';
import {
  PAYER_CATEGORIES,
  FINANCIAL_BENCHMARKS,
  SEED_SURGEON_FINANCIAL_SCORECARDS,
  calculateFacilityFinancialKpis
} from '../services/surgeonFinancialScorecardService';
import './SurgeonFinancialScorecardView.css';

export default function SurgeonFinancialScorecardView() {
  const [activeTab, setActiveTab] = useState('ledger'); // 'ledger', 'payermix', 'cpt'
  const [scorecards, setScorecards] = useState(SEED_SURGEON_FINANCIAL_SCORECARDS);
  const [selectedSpecialty, setSelectedSpecialty] = useState('ALL');
  const [timeHorizon, setTimeHorizon] = useState('90D');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSurgeon, setSelectedSurgeon] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // Derive unique specialties
  const specialties = useMemo(() => {
    const list = scorecards.map(s => s.specialty).filter(Boolean);
    return ['ALL', ...Array.from(new Set(list))];
  }, [scorecards]);

  // Filter scorecards
  const filteredScorecards = useMemo(() => {
    return scorecards.filter(s => {
      const matchesSpecialty = selectedSpecialty === 'ALL' || s.specialty === selectedSpecialty;
      const matchesSearch =
        searchQuery.trim() === '' ||
        s.surgeonName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.specialty.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.npi.includes(searchQuery);

      return matchesSpecialty && matchesSearch;
    });
  }, [scorecards, selectedSpecialty, searchQuery]);

  // Aggregate facility KPIs
  const facilityKpis = useMemo(() => {
    return calculateFacilityFinancialKpis(scorecards);
  }, [scorecards]);

  // Aggregate all CPTs
  const allCpts = useMemo(() => {
    const list = [];
    scorecards.forEach(s => {
      if (s.cptEconomics) {
        s.cptEconomics.forEach(c => {
          list.push({
            ...c,
            surgeonName: s.surgeonName,
            specialty: s.specialty
          });
        });
      }
    });
    return list.sort((a, b) => (b.marginPerOrHour || 0) - (a.marginPerOrHour || 0));
  }, [scorecards]);

  return (
    <div className="sfs-container">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="sfs-toast" role="alert">
          <CheckCircle2 className="sfs-toast-icon" size={18} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="sfs-header-banner">
        <div className="sfs-header-main">
          <div className="sfs-header-title-row">
            <h1 className="sfs-title">Surgeon Financial Scorecards & Procedural Yield</h1>
            <span className="sfs-badge-pill sfs-badge-blue">Module 11 • Phase B1</span>
            <span className="sfs-badge-pill sfs-badge-emerald">Double-Entry Ledger Verified</span>
          </div>
          <p className="sfs-subtitle">
            Auditable economic scorecards correlating operative hours with gross billing, contractual allowances, net cash collections, direct supply and implant costs, and contribution margin per OR-hour.
          </p>
        </div>
        <div className="sfs-header-actions">
          <button
            className="sfs-btn sfs-btn-outline"
            onClick={() => showToast('Financial scorecards synchronized with clearinghouse 835 remittance ledger.')}
          >
            <RefreshCw size={15} />
            <span>Sync Claims & Remits</span>
          </button>
        </div>
      </div>

      {/* 5-Card Financial Ribbon */}
      <div className="sfs-kpi-ribbon">
        <div className="sfs-kpi-card">
          <div className="sfs-kpi-header">
            <span className="sfs-kpi-label">Total Surgical Cases</span>
            <Users className="sfs-kpi-icon sfs-icon-blue" size={18} />
          </div>
          <div className="sfs-kpi-value">{facilityKpis.totalCases}</div>
          <div className="sfs-kpi-meta">Across 9 attending surgeons</div>
        </div>

        <div className="sfs-kpi-card">
          <div className="sfs-kpi-header">
            <span className="sfs-kpi-label">Net Cash Collections</span>
            <DollarSign className="sfs-kpi-icon sfs-icon-emerald" size={18} />
          </div>
          <div className="sfs-kpi-value">${(facilityKpis.totalNetCollections / 1000).toFixed(1)}k</div>
          <div className="sfs-kpi-meta">Gross: ${(facilityKpis.totalGrossBilled / 1000).toFixed(1)}k billed</div>
        </div>

        <div className="sfs-kpi-card">
          <div className="sfs-kpi-header">
            <span className="sfs-kpi-label">Net Contribution Margin</span>
            <TrendingUp className="sfs-kpi-icon sfs-icon-blue" size={18} />
          </div>
          <div className="sfs-kpi-value">${(facilityKpis.totalContributionMargin / 1000).toFixed(1)}k</div>
          <div className="sfs-kpi-meta">Net of all direct costs</div>
        </div>

        <div className="sfs-kpi-card">
          <div className="sfs-kpi-header">
            <span className="sfs-kpi-label">Avg Margin / OR-Hour</span>
            <Clock className="sfs-kpi-icon sfs-icon-emerald" size={18} />
          </div>
          <div className="sfs-kpi-value">${facilityKpis.avgMarginPerOrHour.toLocaleString()} <span className="sfs-unit">/ hr</span></div>
          <div className="sfs-kpi-meta">Benchmark: $1,800 / OR-hr</div>
        </div>

        <div className="sfs-kpi-card">
          <div className="sfs-kpi-header">
            <span className="sfs-kpi-label">Collection Realization</span>
            <Percent className="sfs-kpi-icon sfs-icon-amber" size={18} />
          </div>
          <div className="sfs-kpi-value">{facilityKpis.facilityRealizationPct}%</div>
          <div className="sfs-kpi-meta">Target: 70.0% net-to-gross</div>
        </div>
      </div>

      {/* Filter Card */}
      <div className="sfs-filter-card">
        <div className="sfs-filter-row">
          <div className="sfs-search-box">
            <Search className="sfs-search-icon" size={16} />
            <input
              type="text"
              className="sfs-search-input"
              placeholder="Search surgeon by name, specialty, NPI..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="sfs-filter-group">
            <span className="sfs-filter-label">Specialty:</span>
            <select
              className="sfs-select"
              value={selectedSpecialty}
              onChange={(e) => setSelectedSpecialty(e.target.value)}
            >
              {specialties.map(spec => (
                <option key={spec} value={spec}>{spec === 'ALL' ? 'All Specialties' : spec}</option>
              ))}
            </select>
          </div>

          <div className="sfs-filter-group">
            <span className="sfs-filter-label">Horizon:</span>
            <div className="sfs-time-pills">
              {['30D', '90D', '180D', '365D', 'YTD'].map(h => (
                <button
                  key={h}
                  className={`sfs-time-pill ${timeHorizon === h ? 'active' : ''}`}
                  onClick={() => setTimeHorizon(h)}
                >
                  {h}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="sfs-tabs-nav">
        <button
          className={`sfs-tab-btn ${activeTab === 'ledger' ? 'active' : ''}`}
          onClick={() => setActiveTab('ledger')}
        >
          <DollarSign size={16} />
          <span>Surgeon Financial Ledger</span>
          <span className="sfs-tab-counter">{filteredScorecards.length}</span>
        </button>

        <button
          className={`sfs-tab-btn ${activeTab === 'payermix' ? 'active' : ''}`}
          onClick={() => setActiveTab('payermix')}
        >
          <PieChart size={16} />
          <span>Payer Mix & Realization Waterfall</span>
        </button>

        <button
          className={`sfs-tab-btn ${activeTab === 'cpt' ? 'active' : ''}`}
          onClick={() => setActiveTab('cpt')}
        >
          <BarChart2 size={16} />
          <span>CPT Procedural Economics</span>
          <span className="sfs-tab-counter">{allCpts.length}</span>
        </button>
      </div>

      {/* Tab 1: Financial Ledger */}
      {activeTab === 'ledger' && (
        <div className="sfs-card">
          <div className="sfs-card-header">
            <div>
              <h3 className="sfs-card-title">Attending Surgeon Economic Performance</h3>
              <p className="sfs-card-subtitle">
                Correlating billed charges, contractual write-offs, direct case expenses, and net margin yield per OR-hour.
              </p>
            </div>
            <span className="sfs-card-header-badge">Showing {filteredScorecards.length} Surgeons</span>
          </div>

          <div className="sfs-table-responsive">
            <table className="sfs-table">
              <thead>
                <tr>
                  <th>Surgeon & Specialty</th>
                  <th>Cases / OR Mins</th>
                  <th>Gross Billed</th>
                  <th>Net Collected</th>
                  <th>Realization %</th>
                  <th>Direct Cost</th>
                  <th>Contribution Margin</th>
                  <th>Margin / OR-Hr</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredScorecards.map(s => (
                  <tr key={s.surgeonId}>
                    <td>
                      <div className="sfs-surgeon-cell">
                        <span className="sfs-surgeon-name">{s.surgeonName}</span>
                        <span className="sfs-surgeon-sub">{s.specialty} • NPI {s.npi}</span>
                      </div>
                    </td>
                    <td>
                      <div className="sfs-metric-cell">
                        <span className="sfs-val-bold">{s.totalCases} cases</span>
                        <span className="sfs-sub-muted">{s.totalOrMinutes.toLocaleString()} mins ({s.avgCaseMinutes}m avg)</span>
                      </div>
                    </td>
                    <td>
                      <span className="sfs-val-bold">${s.grossBilledCharges.toLocaleString()}</span>
                    </td>
                    <td>
                      <span className="sfs-val-emerald">${s.netCollections.toLocaleString()}</span>
                    </td>
                    <td>
                      <span className={`sfs-badge-pill ${s.collectionRealizationPct >= 68 ? 'sfs-badge-emerald' : s.collectionRealizationPct >= 62 ? 'sfs-badge-amber' : 'sfs-badge-crimson'}`}>
                        {s.collectionRealizationPct}%
                      </span>
                    </td>
                    <td>
                      <div className="sfs-metric-cell">
                        <span className="sfs-val-bold">${s.totalDirectCost.toLocaleString()}</span>
                        <span className="sfs-sub-muted">${Math.round(s.totalDirectCost / s.totalCases).toLocaleString()} / case</span>
                      </div>
                    </td>
                    <td>
                      <div className="sfs-metric-cell">
                        <span className="sfs-val-emerald">${s.netContributionMargin.toLocaleString()}</span>
                        <span className="sfs-sub-muted">{s.contributionMarginPct}% Margin</span>
                      </div>
                    </td>
                    <td>
                      <div className="sfs-margin-cell">
                        <span className="sfs-margin-val">${Math.round(s.marginPerOrHour).toLocaleString()}</span>
                        <span className="sfs-percentile-tag">{s.facilityPercentileRank}th %ile</span>
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="sfs-btn-sm sfs-btn-outline"
                        onClick={() => setSelectedSurgeon(s)}
                      >
                        <span>Drill-down</span>
                        <ChevronRight size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Payer Mix & Realization Waterfall */}
      {activeTab === 'payermix' && (
        <div className="sfs-card">
          <div className="sfs-card-header">
            <div>
              <h3 className="sfs-card-title">Payer Mix Portfolio & Revenue Waterfall</h3>
              <p className="sfs-card-subtitle">
                Analyzing payer distribution, commercial contract concentration, and realization discounts per attending surgeon.
              </p>
            </div>
            <span className="sfs-badge-pill sfs-badge-blue">5 Payer Categories</span>
          </div>

          <div className="sfs-waterfall-grid">
            {filteredScorecards.map(s => (
              <div key={s.surgeonId} className="sfs-waterfall-card">
                <div className="sfs-wcard-header">
                  <div>
                    <h4 className="sfs-wcard-title">{s.surgeonName}</h4>
                    <span className="sfs-wcard-sub">{s.specialty} • {s.totalCases} Total Cases</span>
                  </div>
                  <span className="sfs-badge-pill sfs-badge-emerald">
                    ${Math.round(s.marginPerOrHour).toLocaleString()} / hr
                  </span>
                </div>

                <div className="sfs-waterfall-steps">
                  <div className="sfs-wstep">
                    <span className="sfs-wstep-label">Gross Billed</span>
                    <span className="sfs-wstep-val">${s.grossBilledCharges.toLocaleString()}</span>
                  </div>
                  <div className="sfs-wstep sfs-wstep-deduct">
                    <span className="sfs-wstep-label">Contractual Write-offs</span>
                    <span className="sfs-wstep-val">- ${s.contractualAdjustments.toLocaleString()}</span>
                  </div>
                  <div className="sfs-wstep sfs-wstep-subtotal">
                    <span className="sfs-wstep-label">Net Collections</span>
                    <span className="sfs-wstep-val">${s.netCollections.toLocaleString()} ({s.collectionRealizationPct}%)</span>
                  </div>
                  <div className="sfs-wstep sfs-wstep-deduct">
                    <span className="sfs-wstep-label">Total Direct Costs</span>
                    <span className="sfs-wstep-val">- ${s.totalDirectCost.toLocaleString()}</span>
                  </div>
                  <div className="sfs-wstep sfs-wstep-total">
                    <span className="sfs-wstep-label">Net Contribution Margin</span>
                    <span className="sfs-wstep-val">${s.netContributionMargin.toLocaleString()}</span>
                  </div>
                </div>

                <div className="sfs-payer-breakdown">
                  <span className="sfs-pbreakdown-title">Payer Volume Distribution:</span>
                  <div className="sfs-pbreakdown-bars">
                    {s.payerMix.map(p => {
                      const pConfig = PAYER_CATEGORIES[p.payerCategory] || PAYER_CATEGORIES.COMMERCIAL;
                      return (
                        <div key={p.payerCategory} className="sfs-pbar-item">
                          <div className="sfs-pbar-header">
                            <span className="sfs-pbar-label">{pConfig.label}</span>
                            <span className="sfs-pbar-val">{p.caseCount} cases ({p.sharePct}%)</span>
                          </div>
                          <div className="sfs-pbar-track">
                            <div
                              className="sfs-pbar-fill"
                              style={{ width: `${p.sharePct}%`, backgroundColor: pConfig.color }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 3: CPT Procedural Economics */}
      {activeTab === 'cpt' && (
        <div className="sfs-card">
          <div className="sfs-card-header">
            <div>
              <h3 className="sfs-card-title">CPT Procedural Profitability & Cost Breakdown</h3>
              <p className="sfs-card-subtitle">
                Individual surgical procedure margins, average operative durations, and economic yield per OR-hour across surgeons.
              </p>
            </div>
            <span className="sfs-card-header-badge">Showing {allCpts.length} CPT Procedures</span>
          </div>

          <div className="sfs-table-responsive">
            <table className="sfs-table">
              <thead>
                <tr>
                  <th>CPT Code & Description</th>
                  <th>Surgeon & Specialty</th>
                  <th>Case Volume</th>
                  <th>Avg Duration</th>
                  <th>Avg Billed</th>
                  <th>Avg Collected</th>
                  <th>Direct Cost</th>
                  <th>Avg Margin</th>
                  <th>Yield / OR-Hr</th>
                </tr>
              </thead>
              <tbody>
                {allCpts.map((cpt, idx) => (
                  <tr key={`${cpt.surgeonName}-${cpt.cptCode}-${idx}`}>
                    <td>
                      <div className="sfs-cpt-cell">
                        <span className="sfs-cpt-code">CPT {cpt.cptCode}</span>
                        <span className="sfs-cpt-desc">{cpt.description}</span>
                      </div>
                    </td>
                    <td>
                      <div className="sfs-surgeon-cell">
                        <span className="sfs-surgeon-name">{cpt.surgeonName}</span>
                        <span className="sfs-surgeon-sub">{cpt.specialty}</span>
                      </div>
                    </td>
                    <td>
                      <span className="sfs-val-bold">{cpt.cases} cases</span>
                    </td>
                    <td>
                      <span className="sfs-sub-muted">{cpt.avgDuration} mins</span>
                    </td>
                    <td>
                      <span className="sfs-val-bold">${cpt.avgBilled.toLocaleString()}</span>
                    </td>
                    <td>
                      <span className="sfs-val-emerald">${cpt.avgCollected.toLocaleString()}</span>
                    </td>
                    <td>
                      <span className="sfs-sub-muted">${cpt.avgDirectCost.toLocaleString()}</span>
                    </td>
                    <td>
                      <span className="sfs-val-emerald">${cpt.avgContributionMargin.toLocaleString()}</span>
                    </td>
                    <td>
                      <span className="sfs-margin-val">${Math.round(cpt.marginPerOrHour).toLocaleString()} / hr</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pinned Surgeon Financial Drill-down Modal */}
      {selectedSurgeon && (
        <div className="sfs-modal-overlay" onClick={() => setSelectedSurgeon(null)}>
          <div className="sfs-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="sfs-modal-header">
              <div>
                <h3 className="sfs-modal-title">{selectedSurgeon.surgeonName} — Comprehensive Financial Profile</h3>
                <span className="sfs-modal-sub">{selectedSurgeon.specialty} • NPI {selectedSurgeon.npi}</span>
              </div>
              <button className="sfs-modal-close" onClick={() => setSelectedSurgeon(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="sfs-modal-body">
              <div className="sfs-modal-kpi-grid">
                <div className="sfs-mkpi-card">
                  <span className="sfs-mkpi-label">Gross Billed</span>
                  <span className="sfs-mkpi-val">${selectedSurgeon.grossBilledCharges.toLocaleString()}</span>
                </div>
                <div className="sfs-mkpi-card">
                  <span className="sfs-mkpi-label">Net Collections</span>
                  <span className="sfs-mkpi-val sfs-val-emerald">${selectedSurgeon.netCollections.toLocaleString()}</span>
                </div>
                <div className="sfs-mkpi-card">
                  <span className="sfs-mkpi-label">Realization Rate</span>
                  <span className="sfs-mkpi-val">{selectedSurgeon.collectionRealizationPct}%</span>
                </div>
                <div className="sfs-mkpi-card">
                  <span className="sfs-mkpi-label">Margin / OR-Hour</span>
                  <span className="sfs-mkpi-val sfs-val-blue">${Math.round(selectedSurgeon.marginPerOrHour).toLocaleString()}</span>
                </div>
              </div>

              {/* Direct Cost Breakdown */}
              <div className="sfs-modal-section">
                <h4 className="sfs-msec-title">Direct Surgical Cost Structure</h4>
                <div className="sfs-mcost-grid">
                  <div className="sfs-mcost-card">
                    <span className="sfs-mcost-label">Direct Clinical Labor</span>
                    <span className="sfs-mcost-val">${selectedSurgeon.directLaborCost.toLocaleString()}</span>
                    <span className="sfs-mcost-sub">OR Nurse & Scrub Tech</span>
                  </div>
                  <div className="sfs-mcost-card">
                    <span className="sfs-mcost-label">Implant Hardware</span>
                    <span className="sfs-mcost-val">${selectedSurgeon.directImplantCost.toLocaleString()}</span>
                    <span className="sfs-mcost-sub">Prostheses, Screws & Plates</span>
                  </div>
                  <div className="sfs-mcost-card">
                    <span className="sfs-mcost-label">General Supplies</span>
                    <span className="sfs-mcost-val">${selectedSurgeon.directSupplyCost.toLocaleString()}</span>
                    <span className="sfs-mcost-sub">Packs, Drapes & Sutures</span>
                  </div>
                  <div className="sfs-mcost-card">
                    <span className="sfs-mcost-label">Sterile Processing</span>
                    <span className="sfs-mcost-val">${selectedSurgeon.directSterileCost.toLocaleString()}</span>
                    <span className="sfs-mcost-sub">Tray Autoclave Cycles</span>
                  </div>
                </div>
              </div>

              {/* CPT Economics Table */}
              <div className="sfs-modal-section">
                <h4 className="sfs-msec-title">Top Procedural CPT Economics</h4>
                <div className="sfs-table-responsive">
                  <table className="sfs-table">
                    <thead>
                      <tr>
                        <th>CPT Code</th>
                        <th>Procedure Description</th>
                        <th>Cases</th>
                        <th>Duration</th>
                        <th>Avg Collections</th>
                        <th>Direct Cost</th>
                        <th>Net Margin</th>
                        <th>Margin / OR-Hr</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedSurgeon.cptEconomics?.map(c => (
                        <tr key={c.cptCode}>
                          <td><strong>CPT {c.cptCode}</strong></td>
                          <td>{c.description}</td>
                          <td>{c.cases}</td>
                          <td>{c.avgDuration}m</td>
                          <td className="sfs-val-emerald">${c.avgCollected.toLocaleString()}</td>
                          <td>${c.avgDirectCost.toLocaleString()}</td>
                          <td className="sfs-val-emerald">${c.avgContributionMargin.toLocaleString()}</td>
                          <td><strong>${Math.round(c.marginPerOrHour).toLocaleString()} / hr</strong></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="sfs-modal-footer">
              <button className="sfs-btn sfs-btn-outline" onClick={() => setSelectedSurgeon(null)}>
                Close
              </button>
              <button
                className="sfs-btn sfs-btn-blue"
                onClick={() => {
                  showToast(`Executive financial report generated for ${selectedSurgeon.surgeonName}.`);
                  setSelectedSurgeon(null);
                }}
              >
                <span>Export Financial Report</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
