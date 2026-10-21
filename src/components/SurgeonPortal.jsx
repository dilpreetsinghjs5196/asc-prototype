import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../lib/supabase';
import './SurgeonPortal.css';
import UserProfile from './UserProfile';
import {
  CalendarDays,
  Clock,
  Activity,
  Stethoscope,
  TrendingUp,
  LogOut,
  Sun,
  Moon,
  Search,
  Package,
  Layers,
  Award,
  User
} from 'lucide-react';

export default function SurgeonPortal({ surgeon, onLogout, theme, setTheme }) {
  const [activeTab, setActiveTab] = useState('cases'); // 'cases' | 'blocks' | 'performance' | 'preference' | 'profile'
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = React.useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target)) {
        setAccountMenuOpen(false);
      }
    };
    if (accountMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [accountMenuOpen]);

  const [loading, setLoading] = useState(true);
  const [surgeries, setSurgeries] = useState([]);
  const [orBlocks, setORBlocks] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');

  const surgeonFullName = useMemo(() => {
    if (!surgeon) return 'Attending Surgeon';
    const last = (surgeon.lastname || '').trim();
    const first = (surgeon.firstname || '').trim();
    return `Dr. ${last} ${first}`.trim() || surgeon.name || 'Dr. Attending Surgeon';
  }, [surgeon]);

  const surgeonLastName = useMemo(() => {
    if (surgeon?.lastname) return surgeon.lastname.trim().toLowerCase();
    if (surgeon?.name) {
      const parts = surgeon.name.split(' ');
      return parts[parts.length - 1].toLowerCase();
    }
    return '';
  }, [surgeon]);

  useEffect(() => {
    async function loadSurgeonData() {
      try {
        setLoading(true);
        const [allSurgeries, allBlocks] = await Promise.all([
          db.getSurgeries().catch(() => []),
          db.getORBlockSchedule().catch(() => [])
        ]);

        // Filter surgeries belonging to this surgeon
        const mySurgeries = (allSurgeries || []).filter(s => {
          if (surgeon?.id && (String(s.surgeon_id) === String(surgeon.id))) return true;
          const docName = (s.doctor_name || s.doctor || '').toLowerCase();
          if (surgeonLastName && docName.includes(surgeonLastName)) return true;
          return false;
        });

        // Filter OR block schedule for this surgeon
        const myBlocks = (allBlocks || []).filter(b => {
          const provName = (b.provider_name || '').toLowerCase();
          if (surgeonLastName && provName.includes(surgeonLastName)) return true;
          return false;
        });

        setSurgeries(mySurgeries);
        setORBlocks(myBlocks);
      } catch (err) {
        console.error('Error loading surgeon data:', err);
      } finally {
        setLoading(false);
      }
    }

    loadSurgeonData();
  }, [surgeon, surgeonLastName]);

  // Compute personal KPIs
  const kpis = useMemo(() => {
    const totalCases = surgeries.length;
    let totalDuration = 0;
    let totalMargin = 0;
    let totalTurnover = 0;

    surgeries.forEach(s => {
      totalDuration += Number(s.duration_minutes || s.actual_duration_minutes || 60);
      totalTurnover += Number(s.turnover_time || 15);
      const rev = Number(s.expected_reimbursement || s.revenue || 0);
      const costs = Number(s.supplies_cost || 0) +
                    Number(s.implants_cost || 0) +
                    Number(s.actual_labor_cost || 0) +
                    Number(s.actual_room_cost || 0);
      totalMargin += (rev - costs);
    });

    const avgDuration = totalCases > 0 ? Math.round(totalDuration / totalCases) : 0;
    const avgTurnover = totalCases > 0 ? Math.round(totalTurnover / totalCases) : 0;
    const netMargin = totalMargin;

    return {
      cases: totalCases,
      avgDuration,
      avgTurnover,
      netMargin: Math.round(netMargin)
    };
  }, [surgeries]);

  // Filtered cases for list
  const filteredCases = useMemo(() => {
    return surgeries.filter(s => {
      const patientName = (s.patients?.name || s.patient_name || 'Patient').toLowerCase();
      const cpt = (s.cpt_codes || s.code || '').toLowerCase();
      const status = (s.status || 'Scheduled').toLowerCase();

      const matchesSearch = !searchQuery ||
        patientName.includes(searchQuery.toLowerCase()) ||
        cpt.includes(searchQuery.toLowerCase());

      const matchesStatus = filterStatus === 'All' ||
        status === filterStatus.toLowerCase();

      return matchesSearch && matchesStatus;
    });
  }, [surgeries, searchQuery, filterStatus]);

  // Aggregate CPT Breakdown
  const cptBreakdown = useMemo(() => {
    const map = new Map();
    surgeries.forEach(s => {
      const code = s.cpt_codes || s.code || 'Standard CPT';
      if (!map.has(code)) {
        map.set(code, { code, cases: 0, totalDuration: 0, totalMargin: 0 });
      }
      const item = map.get(code);
      item.cases += 1;
      item.totalDuration += Number(s.duration_minutes || 60);
      const rev = Number(s.expected_reimbursement || 5000);
      const costs = Number(s.supplies_cost || 1000) + Number(s.actual_room_cost || 1000);
      item.totalMargin += (rev - costs);
    });

    return Array.from(map.values());
  }, [surgeries]);

  return (
    <div className="surgeon-portal-container">
      {/* Top Navbar */}
      <header className="surgeon-navbar">
        <div className="surgeon-nav-brand">
          <div className="surgeon-nav-brand-icon">
            <Stethoscope size={22} />
          </div>
          <div>
            <div className="surgeon-nav-title">ASC Clinical Portal</div>
            <div className="surgeon-nav-badge">Attending Surgeon Workspace</div>
          </div>
        </div>

        <div className="surgeon-nav-actions">
          {setTheme && (
            <button
              className="login-theme-btn"
              style={{ position: 'static' }}
              onClick={() => setTheme(prev => prev === 'light' ? 'dark' : 'light')}
              title="Toggle Theme"
            >
              {theme === 'dark' ? <Moon size={15} color="#60a5fa" /> : <Sun size={15} color="#f59e0b" />}
              <span>{theme === 'dark' ? 'Dark' : 'Light'}</span>
            </button>
          )}

          <div className="surgeon-user-chip" onClick={() => setActiveTab('profile')} style={{ cursor: 'pointer' }} title="Edit Profile & Credentials">
            <div className="surgeon-avatar-circle">
              {surgeon?.firstname ? surgeon.firstname[0] : 'S'}
            </div>
            <div>
              <div className="surgeon-user-name">{surgeonFullName}</div>
              <div className="surgeon-user-spec">{surgeon?.specialty || 'Surgical Specialist'}</div>
            </div>
          </div>

          {/* Header Compact Account Avatar & Dropdown */}
          <div className="header-account-container" ref={accountMenuRef}>
            <button
              className="header-account-btn"
              onClick={() => setAccountMenuOpen(prev => !prev)}
              title="Surgeon Account & Credentials"
              style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}
            >
              {surgeon?.firstname ? surgeon.firstname[0] : 'S'}
            </button>

            {accountMenuOpen && (
              <div className="header-account-dropdown">
                <div className="dropdown-user-header">
                  <div className="dropdown-avatar" style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}>
                    {surgeon?.firstname ? surgeon.firstname[0] : 'S'}
                  </div>
                  <div className="dropdown-user-info">
                    <span className="dropdown-user-name">{surgeonFullName}</span>
                    <span className="dropdown-user-role" style={{ color: '#10b981' }}>
                      Attending Surgeon
                    </span>
                  </div>
                </div>

                <div className="dropdown-menu-items">
                  <button
                    className="dropdown-item"
                    onClick={() => {
                      setActiveTab('profile');
                      setAccountMenuOpen(false);
                    }}
                  >
                    <User size={15} style={{ color: '#10b981' }} />
                    <span>My Profile & Credentials</span>
                  </button>

                  <div className="dropdown-divider"></div>

                  <button
                    className="dropdown-item dropdown-item-danger"
                    onClick={() => {
                      setAccountMenuOpen(false);
                      onLogout();
                    }}
                  >
                    <LogOut size={15} />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          <button
            className="surgeon-logout-btn"
            onClick={onLogout}
            title="Sign out of Surgeon Portal"
          >
            <LogOut size={15} />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {/* Main Surgeon Workspace */}
      <main className="surgeon-portal-main">
        {/* Welcome Banner */}
        <div className="surgeon-banner-card">
          <div className="surgeon-banner-info">
            <h2>Welcome, {surgeonFullName}</h2>
            <div className="surgeon-banner-tags">
              <span className="surgeon-banner-tag tag-highlight">
                <Award size={13} style={{ display: 'inline', marginRight: '4px' }} />
                Specialty: {surgeon?.specialty || 'General Surgery'}
              </span>
              {surgeon?.license_number && (
                <span className="surgeon-banner-tag">
                  License: {surgeon.license_number}
                </span>
              )}
              {surgeon?.email && (
                <span className="surgeon-banner-tag">
                  Email: {surgeon.email}
                </span>
              )}
              <span className="surgeon-banner-tag">
                Credentialed ASC Attending
              </span>
            </div>
          </div>
        </div>

        {/* Surgeon Personal KPIs */}
        <div className="surgeon-kpi-grid">
          <div className="surgeon-kpi-card" style={{ '--kpi-accent': '#3b82f6' }}>
            <div className="surgeon-kpi-header">
              <span className="surgeon-kpi-label">Assigned Cases</span>
              <div className="surgeon-kpi-icon"><Activity size={16} /></div>
            </div>
            <div className="surgeon-kpi-value">{kpis.cases}</div>
            <div className="surgeon-kpi-sub">Total MTD & upcoming procedures</div>
          </div>

          <div className="surgeon-kpi-card" style={{ '--kpi-accent': '#10b981' }}>
            <div className="surgeon-kpi-header">
              <span className="surgeon-kpi-label">Avg Procedure Duration</span>
              <div className="surgeon-kpi-icon"><Clock size={16} /></div>
            </div>
            <div className="surgeon-kpi-value">{kpis.avgDuration} <span style={{ fontSize: '1rem' }}>mins</span></div>
            <div className="surgeon-kpi-sub" style={{ color: '#10b981' }}>Optimal efficiency</div>
          </div>

          <div className="surgeon-kpi-card" style={{ '--kpi-accent': '#f59e0b' }}>
            <div className="surgeon-kpi-header">
              <span className="surgeon-kpi-label">Avg Room Turnover</span>
              <div className="surgeon-kpi-icon"><TrendingUp size={16} /></div>
            </div>
            <div className="surgeon-kpi-value">{kpis.avgTurnover} <span style={{ fontSize: '1rem' }}>mins</span></div>
            <div className="surgeon-kpi-sub">vs facility baseline 24 mins</div>
          </div>

          <div className="surgeon-kpi-card" style={{ '--kpi-accent': '#8b5cf6' }}>
            <div className="surgeon-kpi-header">
              <span className="surgeon-kpi-label">Personal Net Margin</span>
              <div className="surgeon-kpi-icon"><Award size={16} /></div>
            </div>
            <div className="surgeon-kpi-value">${kpis.netMargin.toLocaleString()}</div>
            <div className="surgeon-kpi-sub">Net surgical contribution</div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="surgeon-portal-tabs">
          <button
            className={`surgeon-portal-tab ${activeTab === 'cases' ? 'active' : ''}`}
            onClick={() => setActiveTab('cases')}
          >
            <CalendarDays size={16} />
            My Surgical Cases ({surgeries.length})
          </button>

          <button
            className={`surgeon-portal-tab ${activeTab === 'blocks' ? 'active' : ''}`}
            onClick={() => setActiveTab('blocks')}
          >
            <Layers size={16} />
            My OR Block Allocations ({orBlocks.length})
          </button>

          <button
            className={`surgeon-portal-tab ${activeTab === 'performance' ? 'active' : ''}`}
            onClick={() => setActiveTab('performance')}
          >
            <Activity size={16} />
            My Performance & CPTs
          </button>

          <button
            className={`surgeon-portal-tab ${activeTab === 'preference' ? 'active' : ''}`}
            onClick={() => setActiveTab('preference')}
          >
            <Package size={16} />
            Preference Cards & Supplies
          </button>

          <button
            className={`surgeon-portal-tab ${activeTab === 'profile' ? 'active' : ''}`}
            onClick={() => setActiveTab('profile')}
          >
            <User size={16} />
            My Profile & Credentials
          </button>
        </div>

        {/* Tab 1: My Surgical Cases */}
        {activeTab === 'cases' && (
          <div className="surgeon-section-card">
            <div className="surgeon-section-title">
              <span>Surgical Schedule & Case Logs</span>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <div style={{ position: 'relative' }}>
                  <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    placeholder="Search patient or CPT..."
                    className="date-range-selector"
                    style={{ paddingLeft: '32px', width: '220px' }}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                <select
                  className="date-range-selector"
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                >
                  <option value="All">All Statuses</option>
                  <option value="Scheduled">Scheduled</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Completed">Completed</option>
                </select>
              </div>
            </div>

            {loading ? (
              <div style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>
                Loading your case records...
              </div>
            ) : filteredCases.length > 0 ? (
              <div className="custom-table-container">
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Time</th>
                      <th>Patient Name</th>
                      <th>CPT / Procedure</th>
                      <th>OR Room</th>
                      <th>Est. Duration</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCases.map((s, idx) => {
                      const patientName = s.patients?.name || s.patient_name || 'Patient Record';
                      const status = s.status || 'Scheduled';
                      return (
                        <tr key={s.id || idx}>
                          <td style={{ fontWeight: '600' }}>{s.date || 'Scheduled'}</td>
                          <td>{s.start_time || '07:30 AM'}</td>
                          <td style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{patientName}</td>
                          <td>
                            <span style={{ fontWeight: '700', color: 'var(--color-blue)' }}>{s.cpt_codes || '29827'}</span>
                            {s.cpt_description && <span style={{ marginLeft: '8px', color: 'var(--text-muted)' }}>({s.cpt_description})</span>}
                          </td>
                          <td>OR {s.or_room || 1}</td>
                          <td>{s.duration_minutes || 60} mins</td>
                          <td>
                            <span className={`case-badge ${status.toLowerCase() === 'completed' ? 'case-badge-completed' : status.toLowerCase() === 'in progress' ? 'case-badge-in-progress' : 'case-badge-scheduled'}`}>
                              {status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <CalendarDays size={36} style={{ opacity: 0.3, marginBottom: '12px' }} />
                <div style={{ fontSize: '0.95rem', fontWeight: '600' }}>No surgical cases match current criteria</div>
                <div style={{ fontSize: '0.78rem', marginTop: '4px' }}>New cases scheduled for your OR block will automatically appear here.</div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: OR Block Allocations */}
        {activeTab === 'blocks' && (
          <div className="surgeon-section-card">
            <div className="surgeon-section-title">
              <span>Reserved Operating Room Blocks</span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {orBlocks.length} Recurring Block Schedules Found
              </span>
            </div>

            {orBlocks.length > 0 ? (
              <div className="custom-table-container">
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Room</th>
                      <th>Day of Week</th>
                      <th>Week Pattern</th>
                      <th>Block Time Window</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orBlocks.map((b, idx) => (
                      <tr key={b.id || idx}>
                        <td style={{ fontWeight: '700', color: 'var(--color-blue)' }}>{b.room_name || 'OR 1'}</td>
                        <td style={{ fontWeight: '600' }}>{b.day_of_week || 'Tuesday'}</td>
                        <td>{b.week_of_month || 'Every Week'}</td>
                        <td>{b.start_time || '07:00 AM'} – {b.end_time || '01:00 PM'}</td>
                        <td>
                          <span className="case-badge case-badge-completed">Confirmed Block</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <Layers size={36} style={{ opacity: 0.3, marginBottom: '12px' }} />
                <div style={{ fontSize: '0.95rem', fontWeight: '600' }}>No recurring OR blocks currently allocated</div>
                <div style={{ fontSize: '0.78rem', marginTop: '4px' }}>Please contact the ASC Clinical Director to assign your dedicated block hours.</div>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Performance & CPT Breakdown */}
        {activeTab === 'performance' && (
          <div className="surgeon-section-card">
            <div className="surgeon-section-title">
              <span>Clinical Procedure Margins & Durations</span>
            </div>

            {cptBreakdown.length > 0 ? (
              <div className="custom-table-container">
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>CPT Code</th>
                      <th>Total Cases Done</th>
                      <th>Avg Procedure Duration</th>
                      <th>Total Contributed Margin</th>
                      <th>Avg Margin / Case</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cptBreakdown.map((item, idx) => (
                      <tr key={idx}>
                        <td style={{ fontWeight: '700', color: 'var(--color-blue)' }}>{item.code}</td>
                        <td>{item.cases}</td>
                        <td>{Math.round(item.totalDuration / item.cases)} mins</td>
                        <td style={{ color: 'var(--color-green)', fontWeight: '700' }}>
                          ${item.totalMargin.toLocaleString()}
                        </td>
                        <td style={{ fontWeight: '600' }}>
                          ${Math.round(item.totalMargin / item.cases).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <Activity size={36} style={{ opacity: 0.3, marginBottom: '12px' }} />
                <div>Performance metrics will calculate as cases are finalized.</div>
              </div>
            )}
          </div>
        )}

        {/* Tab 4: Preference Cards & Supplies */}
        {activeTab === 'preference' && (
          <div className="surgeon-section-card">
            <div className="surgeon-section-title">
              <span>Standard Surgical Preference Card Items</span>
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Standard instruments and disposables pre-loaded for your operative suites to ensure rapid room turnover.
            </p>

            {surgeon?.preference_cards && surgeon.preference_cards.length > 0 ? (
              <div className="custom-table-container">
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Item Description</th>
                      <th>Category</th>
                      <th>Standard Quantity</th>
                      <th>Baseline Cost</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {surgeon.preference_cards.map((item, idx) => (
                      <tr key={item.id || idx}>
                        <td style={{ fontWeight: '600' }}>{item.description || item.name}</td>
                        <td>{item.category || 'General'}</td>
                        <td>{item.quantity || 1}</td>
                        <td>${Number(item.cost || 0).toFixed(2)}</td>
                        <td><span className="case-badge case-badge-completed">{item.status || 'Active'}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{
                padding: '48px 24px',
                textAlign: 'center',
                backgroundColor: 'rgba(255, 255, 255, 0.02)',
                borderRadius: '8px',
                border: '1px dashed var(--border-color, rgba(255, 255, 255, 0.1))'
              }}>
                <Package size={32} style={{ opacity: 0.3, marginBottom: '12px', color: 'var(--text-muted)' }} />
                <div style={{ fontSize: '0.95rem', fontWeight: '600', color: 'var(--text-primary)' }}>
                  No Preference Cards Configured
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '6px', maxWidth: '440px', margin: '6px auto 0' }}>
                  No standardized preference cards or custom surgical packs have been linked to your surgeon profile yet. Contact materials management to configure standard instrumentation trays.
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 5: Profile & Credentials */}
        {activeTab === 'profile' && (
          <UserProfile
            user={surgeon}
            onUpdateUser={(_updated) => {
              // Session automatically saved in localStorage
            }}
            onBack={() => setActiveTab('cases')}
            onLogout={onLogout}
          />
        )}
      </main>
    </div>
  );
}
