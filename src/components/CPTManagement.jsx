import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  Plus,
  Edit,
  Trash2,
  Stethoscope,
  CheckCircle,
  Loader,
  ChevronDown,
  ChevronUp,
  Building2
} from 'lucide-react';
import { db } from '../lib/supabase';
import CPTAgentTestRunner from './CPTAgentTestRunner';

// Hardcoded unique categories found in database to ensure the dropdown options are instantly available
const CATEGORIES_LIST = [
  'Orthopedics',
  'Otolaryngology (ENT)',
  'Gastroenterology',
  'Urology',
  'Neurology',
  'Plastic / Cosmetic',
  'Dermatology',
  'Breast Oncology',
  'Pain Management',
  'Thoracic Surgery',
  'Ophthalmology',
  'Podiatry',
  'Cardiology',
  'Radiology',
  'Orthopedics / Musculoskeletal',
  'Anesthesiology',
  'Emerging Technology (T-Code)',
  'Radiology / Imaging',
  'General'
];

const PROCEDURE_GROUPS = [
  'Orthopedics Procedures',
  'Otolaryngology (ENT) Procedures',
  'Gastroenterology Procedures',
  'Urology Procedures',
  'Neurology Procedures',
  'Plastic / Cosmetic Procedures',
  'Dermatology Procedures',
  'Breast Oncology Procedures',
  'Pain Management Procedures',
  'Thoracic Surgery Procedures',
  'Ophthalmology Procedures',
  'Podiatry Procedures',
  'Cardiology Procedures',
  'Orthopedics / Musculoskeletal Procedures',
  'Anesthesiology Procedures',
  'Emerging Technology (T-Code) Procedures',
  'Radiology / Imaging Procedures',
  'General Procedures'
];

const INDICATORS = ['A2', 'J8', 'G2', 'P3', 'N1', 'S', 'A', 'P2'];

export default function CPTManagement({
  cptCodes,
  surgeries,
  onAdd,
  onUpdate,
  onDelete,
  activeFacility,
  facilities = [],
  isSuperAdmin: propIsSuperAdmin
}) {
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [sortField, setSortField] = useState('code');
  const [sortDirection, setSortDirection] = useState('asc');
  const [refreshKey, setRefreshKey] = useState(0);
  const [batches, setBatches] = useState([]);
  const [batchesLoading, setBatchesLoading] = useState(true);

  // Batch states
  const [batchData, setBatchData] = useState({});
  const [batchExpanded, setBatchExpanded] = useState({});
  const [batchPage, setBatchPage] = useState({});
  const [batchSearchQuery, setBatchSearchQuery] = useState({});
  const [batchLoading, setBatchLoading] = useState({});
  const [batchTotalCount, setBatchTotalCount] = useState({});

  useEffect(() => {
    async function fetchBatches() {
      try {
        const data = await db.getCPTBatches();
        setBatches(data);
        
        // Initialize expanded state for first batch
        if (data.length > 0) {
           const firstKey = data[0].effective_date + '_' + data[0].termination_date;
           setBatchExpanded({ [firstKey]: true });
        }
      } catch (err) {
        console.error('Error fetching batches:', err);
      } finally {
        setBatchesLoading(false);
      }
    }
    fetchBatches();
  }, []);

  const fetchBatchCodes = useCallback(async (batch) => {
    const key = batch.effective_date + '_' + batch.termination_date;
    const page = batchPage[key] || 1;
    const search = batchSearchQuery[key] || '';
    
    setBatchLoading(prev => ({ ...prev, [key]: true }));
    try {
      const { cptCodes, totalCount } = await db.getCPTCodesPaged({
        search,
        category: categoryFilter,
        page,
        limit: 10,
        sortField,
        sortDirection,
        status: 'batch',
        effective_date: batch.effective_date,
        termination_date: batch.termination_date
      });
      setBatchData(prev => ({ ...prev, [key]: cptCodes }));
      setBatchTotalCount(prev => ({ ...prev, [key]: totalCount }));
    } catch (err) {
      console.error('Error fetching batch CPT codes:', err);
    } finally {
      setBatchLoading(prev => ({ ...prev, [key]: false }));
    }
  }, [batchPage, batchSearchQuery, categoryFilter, sortField, sortDirection]);

  // Effect to load batch data when a batch becomes expanded, or dependencies change
  useEffect(() => {
    batches.forEach(batch => {
      const key = batch.effective_date + '_' + batch.termination_date;
      if (batchExpanded[key]) {
        fetchBatchCodes(batch);
      }
    });
  }, [batches, batchExpanded, fetchBatchCodes, refreshKey]);


  // Super Admin & Facilities
  const session = db.getSession();
  const isSuperAdmin = propIsSuperAdmin !== undefined ? propIsSuperAdmin : (session?.role === 'super_admin');
  const [facilitiesList, setFacilitiesList] = useState(facilities || []);

  useEffect(() => {
    if (facilities && facilities.length > 0) {
      setFacilitiesList(facilities);
    } else {
      db.getFacilities().then(res => {
        if (res && res.length > 0) setFacilitiesList(res);
      }).catch(console.error);
    }
  }, [facilities]);

  // Form & Modal States
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCpt, setEditingCpt] = useState(null);
  const [form, setForm] = useState({
    code: '',
    description: '',
    reimbursement: '',
    cost: '',
    category: '',
    average_duration: '',
    turnover_time: '',
    body_part: '',
    procedure_group: '',
    procedure_indicator: '',
    gross_charge: '',
    active_published: true,
    active_code: true,
    facility_id: activeFacility?.id || ''
  });

  const [bulkEditStatus, setBulkEditStatus] = useState(null); // 'latest' or 'historical'
  const [bulkEditForm, setBulkEditForm] = useState({ effective_date: '', termination_date: '', version_year: '' });
  const [bulkEditLoading, setBulkEditLoading] = useState(false);

  // Handle sorting
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
    setBatchPage({});
  };

  // Open modal for add
  const handleOpenAdd = () => {
    setEditingCpt(null);
    setForm({
      code: '',
      description: '',
      reimbursement: '',
      cost: '',
      category: '',
      average_duration: '',
      turnover_time: '',
      body_part: '',
      procedure_group: '',
      procedure_indicator: '',
      gross_charge: '',
      active_published: true,
      active_code: true,
      facility_id: activeFacility?.id || (facilitiesList[0]?.id || '')
    });
    setModalOpen(true);
  };

  // Open modal for edit
  const handleOpenEdit = (cpt) => {
    setEditingCpt(cpt);
    setForm({
      code: cpt.code || '',
      description: cpt.description || '',
      reimbursement: cpt.reimbursement !== null && cpt.reimbursement !== undefined ? String(cpt.reimbursement) : '',
      cost: cpt.cost !== null && cpt.cost !== undefined ? String(cpt.cost) : '',
      category: cpt.category || '',
      average_duration: cpt.average_duration !== null && cpt.average_duration !== undefined ? String(cpt.average_duration) : '',
      turnover_time: cpt.turnover_time !== null && cpt.turnover_time !== undefined ? String(cpt.turnover_time) : '',
      body_part: cpt.body_part || '',
      procedure_group: cpt.procedure_group || '',
      procedure_indicator: cpt.procedure_indicator || '',
      gross_charge: cpt.gross_charge !== null && cpt.gross_charge !== undefined ? String(cpt.gross_charge) : '',
      active_published: cpt.is_active !== false,
      active_code: cpt.is_active !== false,
      facility_id: cpt.facility_id || activeFacility?.id || ''
    });
    setModalOpen(true);
  };

  // Handle Form Submit (Save)
  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validation
    const code = form.code.trim();
    const description = form.description.trim();

    if (!form.category) {
      alert('Category is required.');
      return;
    }
    if (!code || code.length > 10) {
      alert('CPT code is required and must be 10 characters or less.');
      return;
    }
    if (!description) {
      alert('Description is required.');
      return;
    }
    if (form.reimbursement === '') {
      alert('Reimbursement is required.');
      return;
    }

    const payload = {
      code,
      description,
      category: form.category,
      body_part: form.body_part.trim() || null,
      procedure_group: form.procedure_group || null,
      procedure_indicator: form.procedure_indicator || null,
      reimbursement: parseFloat(form.reimbursement),
      cost: form.cost === '' ? 0 : parseFloat(form.cost),
      average_duration: form.average_duration === '' ? 0 : parseInt(form.average_duration, 10),
      turnover_time: form.turnover_time === '' ? 0 : parseInt(form.turnover_time, 10),
      // Enforce authoritative whole-dollar 350% gross charge rule
      gross_charge: (form.gross_charge !== '' && !isNaN(parseFloat(form.gross_charge)) && parseFloat(form.gross_charge) > 0)
        ? parseFloat(form.gross_charge)
        : Math.round(parseFloat(form.reimbursement || 0) * 3.5),
      is_active: form.active_published && form.active_code,
      facility_id: form.facility_id || activeFacility?.id || null
    };

    try {
      if (editingCpt) {
        await onUpdate(editingCpt.id, payload);
      } else {
        await onAdd(payload);
      }
      setRefreshKey(prev => prev + 1);
      setModalOpen(false);
    } catch (err) {
      console.error(err);
    }
  };

  // Handle Delete
  const handleDelete = async (cpt) => {
    if (confirm(`Are you sure you want to permanently delete CPT Code: ${cpt.code}?`)) {
      try {
        await onDelete(cpt.id);
        setRefreshKey(prev => prev + 1);
      } catch (err) {
        console.error(err);
        alert('An error occurred while deleting CPT code.');
      }
    }
  };

  // Handle Bulk Update
  const handleBulkSubmit = async (e) => {
    e.preventDefault();
    if (!bulkEditStatus) return;
    setBulkEditLoading(true);
    
    const updates = {};
    if (bulkEditForm.effective_date) updates.effective_date = bulkEditForm.effective_date;
    else updates.effective_date = null;
    
    if (bulkEditForm.termination_date) updates.termination_date = bulkEditForm.termination_date;
    else updates.termination_date = null;
    
    if (bulkEditForm.version_year) updates.version_year = bulkEditForm.version_year;
    else updates.version_year = null;

    try {
      await db.bulkUpdateCPTGroup(bulkEditStatus, updates);
      setRefreshKey(prev => prev + 1);
      setBulkEditStatus(null);
    } catch (err) {
      console.error(err);
      alert('Error updating dates.');
    } finally {
      setBulkEditLoading(false);
    }
  };

  const renderPageNumbers = (currentPage, totalPages, setCurrentPage) => {
    const pages = [];
    const maxVisible = 5;
    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);

    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }

    if (start > 1) {
      pages.push(
        <button
          key={1}
          className={`btn-header ${currentPage === 1 ? 'btn-primary' : ''}`}
          style={{ height: '32px', width: '32px', padding: 0, minWidth: 'auto', justifyContent: 'center' }}
          onClick={() => setCurrentPage(1)}
        >
          1
        </button>
      );
      if (start > 2) {
        pages.push(<span key="ellipsis-start" style={{ padding: '0 4px', alignSelf: 'center' }}>...</span>);
      }
    }

    for (let i = start; i <= end; i++) {
      pages.push(
        <button
          key={i}
          className={`btn-header ${currentPage === i ? 'btn-primary' : ''}`}
          style={{ height: '32px', width: '32px', padding: 0, minWidth: 'auto', justifyContent: 'center' }}
          onClick={() => setCurrentPage(i)}
        >
          {i}
        </button>
      );
    }

    if (end < totalPages) {
      if (end < totalPages - 1) {
        pages.push(<span key="ellipsis-end" style={{ padding: '0 4px', alignSelf: 'center' }}>...</span>);
      }
      pages.push(
        <button
          key={totalPages}
          className={`btn-header ${currentPage === totalPages ? 'btn-primary' : ''}`}
          style={{ height: '32px', width: '32px', padding: 0, minWidth: 'auto', justifyContent: 'center' }}
          onClick={() => setCurrentPage(totalPages)}
        >
          {totalPages}
        </button>
      );
    }

    return pages;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Search and Filters Header */}
      <div className="dashboard-card" style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
          <div>
            <h3 className="card-title" style={{ fontSize: '1.05rem', fontWeight: '700', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Stethoscope size={18} style={{ color: 'var(--color-blue)' }} />
              CPT Codes Registry
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px', marginBottom: '0' }}>
              Manage clinical codes, expected reimbursement rates, base supply costs, and procedural duration benchmarks.
            </p>
          </div>

          <button
            onClick={handleOpenAdd}
            className="btn-header btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '36px' }}
          >
            <Plus size={16} /> Register CPT Code
          </button>
        </div>
      
      <div style={{ marginBottom: '24px' }}>
        <CPTAgentTestRunner cptCodes={cptCodes || Object.values(batchData).flat()} surgeries={surgeries || []} />
      </div>

      <div style={{
        display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-light)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '180px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Category:</span>
            <select
              className="date-range-selector"
              style={{ flex: '1', height: '36px', background: 'var(--bg-card)', padding: '0 8px' }}
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setBatchPage({});
              }}
            >
              <option value="All">All Categories</option>
              {CATEGORIES_LIST.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="content-card" style={{ position: 'relative', marginTop: '12px' }}>
        
        {(batchesLoading) && (
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(5, 11, 24, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
            borderRadius: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#fff', fontSize: '0.9rem', fontWeight: '600' }}>
              <Loader size={18} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} />
              Fetching records...
            </div>
            <style dangerouslySetInnerHTML={{
              __html: `
              @keyframes spin {
                to { transform: rotate(360deg); }
              }
            `}} />
          </div>
        )}

        <div>
          {(() => {
            const renderTableHeaders = () => (
              <thead>
                <tr>
                  <th onClick={() => handleSort('code')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                    Code {sortField === 'code' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                  </th>
                  <th>Description</th>
                  <th>Category</th>
                  <th>Procedure Group</th>
                  <th>Indicator</th>
                  <th>Body Part</th>
                  <th onClick={() => handleSort('average_duration')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                    Duration {sortField === 'average_duration' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                  </th>
                  <th>Turnover</th>
                  <th onClick={() => handleSort('gross_charge')} style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none' }}>
                    Gross Charge {sortField === 'gross_charge' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                  </th>
                  <th onClick={() => handleSort('reimbursement')} style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none' }}>
                    Reimbursement {sortField === 'reimbursement' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                  </th>
                  <th>Effective Date</th>
                  <th>End Date</th>
                  <th style={{ textAlign: 'center' }}>Status</th>
                  <th style={{ textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
            );

            const renderRows = (data, isHistorical = false) => {
              if (data.length === 0) {
                return (
                  <tbody>
                    <tr>
                      <td colSpan="14" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                        <div style={{ fontSize: '0.85rem' }}>No records found in this group</div>
                      </td>
                    </tr>
                  </tbody>
                );
              }
              
              return (
                <tbody>
                  {data.map(cpt => (
                    <tr key={cpt.id} className="clickable-row" style={isHistorical ? { backgroundColor: 'rgba(0,0,0,0.1)', opacity: 0.8 } : {}}>
                      <td style={{ fontWeight: '700', fontFamily: 'monospace', color: 'var(--color-blue)', letterSpacing: '0.5px' }}>
                        {cpt.code}
                        {cpt.facility_id === null && (
                          <span style={{ marginLeft: '6px', fontSize: '0.65rem', padding: '1px 5px', borderRadius: '4px', background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', fontWeight: '500' }} title="CMS National Standard Catalog">
                            CMS
                          </span>
                        )}
                      </td>
                      <td style={{ fontWeight: '500', color: 'var(--text-primary)' }}>{cpt.description}</td>
                      <td>{cpt.category || 'N/A'}</td>
                      <td>{cpt.procedure_group || 'N/A'}</td>
                      <td style={{ textAlign: 'center', fontWeight: '600', color: 'var(--text-primary)' }}>{cpt.procedure_indicator || 'N/A'}</td>
                      <td>{cpt.body_part || 'N/A'}</td>
                      <td>{cpt.average_duration ? `${cpt.average_duration} mins` : 'N/A'}</td>
                      <td>{cpt.turnover_time ? `${cpt.turnover_time} mins` : 'N/A'}</td>
                      <td style={{ textAlign: 'right', fontWeight: '600' }}>
                        {cpt.gross_charge ? `$${cpt.gross_charge.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '$0.00'}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: '600', color: 'var(--color-green)' }}>
                        {cpt.reimbursement ? `$${cpt.reimbursement.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '$0.00'}
                      </td>
                      <td style={{ fontSize: '0.8rem', color: isHistorical ? 'var(--text-muted)' : 'var(--text-secondary)' }}>{cpt.effective_date || 'N/A'}</td>
                      <td style={{ fontSize: '0.8rem', color: isHistorical ? 'var(--text-muted)' : 'var(--text-secondary)' }}>{cpt.termination_date || '-'}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`badge ${isHistorical ? 'badge-pending' : (cpt.is_active ? 'badge-scheduled' : 'badge-cancelled')}`} style={isHistorical ? { opacity: 0.7 } : {}}>
                          {isHistorical ? 'Historical' : (cpt.is_active ? 'Active' : 'Inactive')}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                          {!isHistorical && (
                            <button onClick={() => handleOpenEdit(cpt)} className="btn-header" style={{ padding: '4px 8px', minWidth: 'auto', display: 'flex', alignItems: 'center', gap: '4px', border: '1px solid rgba(59, 130, 246, 0.3)', color: 'var(--color-blue)' }} title="Edit CPT Details">
                              <Edit size={12} />
                            </button>
                          )}
                          <button onClick={() => handleDelete(cpt)} className="btn-header" style={{ padding: '4px 8px', minWidth: 'auto', display: 'flex', alignItems: 'center', gap: '4px', border: '1px solid rgba(244, 63, 94, 0.3)', color: 'var(--color-red)', opacity: isHistorical ? 0.5 : 1 }} title="Delete CPT Code">
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              );
            };

            const renderPagination = (currentPage, rowsPerPage, totalCount, setPage, setRowsPerPage) => {
              const totalPages = Math.ceil(totalCount / rowsPerPage) || 1;
              const startIndex = (currentPage - 1) * rowsPerPage;
              const endIndex = startIndex + rowsPerPage;
              
              return (
                <div className="table-footer" style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 20px',
                  borderTop: '1px solid var(--border-light)',
                  fontSize: '0.8rem',
                  color: 'var(--text-secondary)',
                  background: 'var(--bg-main)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>Rows per page:</span>
                    <select
                      className="date-range-selector"
                      style={{ height: '32px', background: 'var(--bg-card)', padding: '2px 8px', width: '70px', cursor: 'pointer' }}
                      value={rowsPerPage}
                      onChange={(e) => {
                        setRowsPerPage(Number(e.target.value));
                        setPage(1);
                      }}
                    >
                      <option value={10}>10</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                    <span style={{ marginLeft: '12px' }}>
                      Showing {totalCount > 0 ? startIndex + 1 : 0}–{Math.min(totalCount, endIndex)} of {totalCount} records
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button
                      className="btn-header"
                      style={{ height: '32px', padding: '0 10px', minWidth: 'auto', cursor: currentPage === 1 ? 'not-allowed' : 'pointer', opacity: currentPage === 1 ? 0.5 : 1 }}
                      disabled={currentPage === 1}
                      onClick={() => setPage(prev => Math.max(1, prev - 1))}
                    >
                      Previous
                    </button>

                    {renderPageNumbers(currentPage, totalPages, setPage)}

                    <button
                      className="btn-header"
                      style={{ height: '32px', padding: '0 10px', minWidth: 'auto', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer', opacity: currentPage === totalPages ? 0.5 : 1 }}
                      disabled={currentPage === totalPages}
                      onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
                    >
                      Next
                    </button>
                  </div>
                </div>
              );
            };

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                
                              {batchesLoading ? (
                 <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}><Loader size={24} className="animate-spin" style={{ margin: '0 auto 10px auto' }} /> Loading Batches...</div>
              ) : batches.map((batch, _index) => {
                const key = batch.effective_date + '_' + batch.termination_date;
                const isExpanded = !!batchExpanded[key];
                const isLoading = !!batchLoading[key];
                const data = batchData[key] || [];
                const totalCount = batchTotalCount[key] ?? batch.count ?? 0;
                const search = batchSearchQuery[key] || '';
                const page = batchPage[key] || 1;
                
                const title = batch.termination_date === null
                   ? 'ACTIVE CODES (Effective: ' + (batch.effective_date || 'N/A') + ')'
                   : 'HISTORICAL CODES (Effective: ' + (batch.effective_date || 'N/A') + ' to ' + batch.termination_date + ')';

                return (
                  <div key={key} style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden', marginBottom: '16px' }}>
                    <div
                      onClick={() => setBatchExpanded(prev => ({ ...prev, [key]: !prev[key] }))}
                      style={{
                        padding: '12px 16px',
                        background: 'var(--bg-card)',
                        borderLeft: '4px solid ' + (batch.termination_date === null ? 'var(--color-blue)' : 'var(--color-red)'),
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-primary)' }}>
                        {isExpanded ? <ChevronUp size={18} style={{ color: 'var(--color-blue)' }} /> : <ChevronDown size={18} style={{ color: 'var(--text-secondary)' }} />}
                        <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                          {title}
                        </h4>
                        <span style={{ fontSize: '0.75rem', padding: '2px 10px', background: 'var(--bg-subtab)', borderRadius: '12px', color: 'var(--text-secondary)', fontWeight: '600', border: '1px solid var(--border-light)' }}>
                          {totalCount} total codes
                        </span>
                      </div>
                      <div style={{ position: 'relative', width: '300px' }} onClick={e => e.stopPropagation()}>
                        <Search size={14} style={{ position: 'absolute', left: '10px', top: '9px', color: 'var(--text-muted)' }} />
                        <input
                          type="text"
                          placeholder="Search codes..."
                          className="date-range-selector"
                          style={{ width: '100%', paddingLeft: '32px', height: '32px', fontSize: '0.85rem' }}
                          value={search}
                          onChange={(e) => {
                            setBatchSearchQuery(prev => ({ ...prev, [key]: e.target.value }));
                            setBatchPage(prev => ({ ...prev, [key]: 1 }));
                          }}
                        />
                      </div>
                    </div>
                    
                    {isExpanded && (
                      <div className="custom-table-container" style={{ borderTop: '1px solid var(--border-light)', borderRadius: '0' }}>
                        <div style={{ position: 'relative' }}>
                          {isLoading && (
                            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(5,11,24,0.5)', zIndex: 5, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                              <Loader size={20} className="animate-spin" />
                            </div>
                          )}
                          <table className="custom-table">
                            {renderTableHeaders()}
                            {renderRows(data, batch.termination_date !== null)}
                          </table>
                        </div>
                        {renderPagination(page, 10, totalCount, (newPage) => setBatchPage(prev => ({ ...prev, [key]: newPage })), () => {})}
                      </div>
                    )}
                  </div>
                );
              })}

              </div>
            );
          })()}
        </div>
      </div>

      {/* Register / Edit CPT Modal */}
      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: '800px', maxWidth: '95%', background: 'var(--bg-app)', border: '1px solid var(--border-light)' }}>
            <div className="modal-header" style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-light)' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', color: 'var(--text-primary)', fontWeight: '700', margin: 0 }}>
                  {editingCpt ? 'Edit CPT Details' : 'Add New CPT'}
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                  Complete the details below to update the master price list
                </p>
              </div>
              <button className="modal-close" onClick={() => setModalOpen(false)} style={{ fontSize: '1.5rem', color: 'var(--text-muted)', hover: { color: '#fff' } }}>×</button>
            </div>

            <form onSubmit={handleSubmit} className="modal-body" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {isSuperAdmin && (
                <div style={{
                  padding: '12px 14px',
                  background: 'rgba(59, 130, 246, 0.06)',
                  borderRadius: '8px',
                  border: '1px solid rgba(59, 130, 246, 0.2)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px'
                }}>
                  <label style={{
                    fontSize: '0.78rem',
                    fontWeight: '700',
                    color: 'var(--color-blue, #3b82f6)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                    <Building2 size={14} /> Assign Facility (Super Admin)
                  </label>
                  <select
                    value={form.facility_id || activeFacility?.id || ''}
                    onChange={(e) => setForm({ ...form, facility_id: e.target.value })}
                    className="date-range-selector"
                    style={{ width: '100%', height: '38px', background: 'var(--bg-card, #1e293b)', color: 'var(--text-primary, #fff)', fontWeight: '600' }}
                  >
                    <option value="">Select Facility...</option>
                    {facilitiesList.map(f => (
                      <option key={f.id} value={f.id}>{f.name} ({f.location || f.code})</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Row 1 */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Category *</label>
                  <select
                    className="date-range-selector"
                    style={{ width: '100%', height: '38px', background: 'var(--bg-card)', padding: '0 10px' }}
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    required
                  >
                    <option value="" disabled>Select Category...</option>
                    {CATEGORIES_LIST.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)' }}>CPT Code *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 99213"
                    className="date-range-selector"
                    style={{ width: '100%', height: '38px' }}
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                    disabled={!!editingCpt}
                    maxLength={10}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Procedure Group</label>
                  <select
                    className="date-range-selector"
                    style={{ width: '100%', height: '38px', background: 'var(--bg-card)', padding: '0 10px' }}
                    value={form.procedure_group}
                    onChange={(e) => setForm({ ...form, procedure_group: e.target.value })}
                  >
                    <option value="">Select Group...</option>
                    {PROCEDURE_GROUPS.map(group => (
                      <option key={group} value={group}>{group}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 2 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', gridColumn: 'span 1' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Description *</label>
                  <input
                    type="text"
                    required
                    placeholder="Procedure name"
                    className="date-range-selector"
                    style={{ width: '100%', height: '38px' }}
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Indicator</label>
                  <select
                    className="date-range-selector"
                    style={{ width: '100%', height: '38px', background: 'var(--bg-card)', padding: '0 10px' }}
                    value={form.procedure_indicator}
                    onChange={(e) => setForm({ ...form, procedure_indicator: e.target.value })}
                  >
                    <option value="">Select...</option>
                    {INDICATORS.map(ind => (
                      <option key={ind} value={ind}>{ind}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Body Part</label>
                  <input
                    type="text"
                    placeholder="e.g. Hand, Knee"
                    className="date-range-selector"
                    style={{ width: '100%', height: '38px' }}
                    value={form.body_part}
                    onChange={(e) => setForm({ ...form, body_part: e.target.value })}
                  />
                </div>
              </div>

              {/* Row 3 */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Duration (Min)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="Duration in minutes"
                    className="date-range-selector"
                    style={{ width: '100%', height: '38px' }}
                    value={form.average_duration}
                    onChange={(e) => setForm({ ...form, average_duration: e.target.value })}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Turnover (Min)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="Turnover in minutes"
                    className="date-range-selector"
                    style={{ width: '100%', height: '38px' }}
                    value={form.turnover_time}
                    onChange={(e) => setForm({ ...form, turnover_time: e.target.value })}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Reimbursement *</label>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <span style={{ position: 'absolute', left: '12px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>$</span>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      required
                      placeholder="0.00"
                      className="date-range-selector"
                      style={{ width: '100%', height: '38px', paddingLeft: '24px' }}
                      value={form.reimbursement}
                      onChange={(e) => setForm({ ...form, reimbursement: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              {/* Row 4 */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', alignItems: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Gross Charge (350%)</label>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <span style={{ position: 'absolute', left: '12px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>$</span>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      placeholder="0.00"
                      className="date-range-selector"
                      style={{ width: '100%', height: '38px', paddingLeft: '24px' }}
                      value={form.gross_charge}
                      onChange={(e) => setForm({ ...form, gross_charge: e.target.value })}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingSelf: 'center', marginTop: '24px' }}>
                  <input
                    type="checkbox"
                    id="active_published"
                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                    checked={form.active_published}
                    onChange={(e) => setForm({ ...form, active_published: e.target.checked })}
                  />
                  <label htmlFor="active_published" style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-primary)', cursor: 'pointer', userSelect: 'none' }}>
                    Active / Published
                  </label>
                </div>

                <div></div> {/* Spacer */}
              </div>

              {/* Row 5 / Footer Actions */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: '16px',
                paddingTop: '20px',
                borderTop: '1px solid var(--border-light)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    id="active_code"
                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                    checked={form.active_code}
                    onChange={(e) => setForm({ ...form, active_code: e.target.checked })}
                  />
                  <label htmlFor="active_code" style={{ fontSize: '0.85rem', fontWeight: '600', color: '#fff', cursor: 'pointer', userSelect: 'none' }}>
                    Active Code
                  </label>
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                  <button
                    type="button"
                    className="btn-header"
                    style={{ height: '38px', padding: '0 18px' }}
                    onClick={() => setModalOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-header btn-primary"
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '38px', padding: '0 18px' }}
                  >
                    <CheckCircle size={14} />
                    {editingCpt ? 'Save Changes' : 'Add to Price List'}
                  </button>
                </div>
              </div>
              {/* Register / Edit CPT Modal and Bulk Edit Modal */}
            </form>
          </div>
        </div>
      )}

      {/* Bulk Edit Modal */}
      {bulkEditStatus && (
        <div className="modal-overlay" onClick={() => setBulkEditStatus(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: '400px', maxWidth: '95%', background: 'var(--bg-app)', border: '1px solid var(--border-light)' }}>
            <div className="modal-header" style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-light)' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', color: 'var(--text-primary)', fontWeight: '700', margin: 0 }}>
                  Bulk Edit Dates
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                  Update dates for all <span style={{textTransform: 'capitalize'}}>{bulkEditStatus}</span> CPT codes.
                </p>
              </div>
              <button className="modal-close" onClick={() => setBulkEditStatus(null)} style={{ fontSize: '1.5rem', color: 'var(--text-muted)' }}>×</button>
            </div>
            
            <form onSubmit={handleBulkSubmit} className="modal-body" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Effective Date (YYYY-MM-DD)</label>
                <input
                  type="date"
                  className="date-range-selector"
                  style={{ width: '100%', height: '38px' }}
                  value={bulkEditForm.effective_date}
                  onChange={(e) => setBulkEditForm({ ...bulkEditForm, effective_date: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Termination Date (YYYY-MM-DD)</label>
                <input
                  type="date"
                  className="date-range-selector"
                  style={{ width: '100%', height: '38px' }}
                  value={bulkEditForm.termination_date}
                  onChange={(e) => setBulkEditForm({ ...bulkEditForm, termination_date: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)' }}>Version Year</label>
                <input
                  type="text"
                  placeholder="e.g. 2025-2026"
                  className="date-range-selector"
                  style={{ width: '100%', height: '38px' }}
                  value={bulkEditForm.version_year}
                  onChange={(e) => setBulkEditForm({ ...bulkEditForm, version_year: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '10px' }}>
                <button type="button" onClick={() => setBulkEditStatus(null)} className="btn-secondary" style={{ height: '38px' }} disabled={bulkEditLoading}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" style={{ height: '38px' }} disabled={bulkEditLoading}>
                  {bulkEditLoading ? 'Applying...' : 'Apply Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
