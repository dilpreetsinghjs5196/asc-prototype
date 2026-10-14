import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { db } from '../lib/supabase';
import { Upload, Database, CheckCircle, Loader, FileSpreadsheet, Edit2, Trash2, X, Plus, Search } from 'lucide-react';
import Swal from 'sweetalert2';

export default function OTCostManagement() {
  const [data, setData] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [dbData, setDbData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(100);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Edit State
  const [editingRowId, setEditingRowId] = useState(null);
  const [editFormData, setEditFormData] = useState({});

  // Add State
  const [isAddingRecord, setIsAddingRecord] = useState(false);
  const [newRecordData, setNewRecordData] = useState({
    cpt_codes: '',
    supply_cost: 0,
    implant_cost: 0,
    labour_cost: 0,
    or_room_cost: 0,
    medication_cost: 0,
    tray_cost: 0
  });

  // Columns to extract as per user requirements
  const targetColumns = {
    cpt_hcpcs_code: 'cpt_codes',
    supplies_cost: 'supply_cost',
    implants_cost: 'implant_cost',
    actual_labor_cost: 'labour_cost',
    actual_room_cost: 'or_room_cost',
    medications_cost: 'medication_cost',
    tray_cost: 'tray_cost'
  };

  const fetchData = async () => {
    setIsLoading(true);
    try {
      if (db.getOTExtraCosts) {
        const result = await db.getOTExtraCosts();
        setDbData(result);
        setCurrentPage(1); // Reset to first page on refresh
      }
    } catch (error) {
      console.error('Error fetching OT extra costs:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchData();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const [sortField, setSortField] = useState('cpt_codes');
  const [sortDirection, setSortDirection] = useState('asc');

  const filteredDbData = dbData.filter(row => 
    row.cpt_codes?.toLowerCase().includes(searchQuery.toLowerCase())
  ).sort((a, b) => {
    if (!sortField) return 0;
    
    let valA = a[sortField];
    let valB = b[sortField];

    // Handle numeric sorting for cost fields
    if (sortField !== 'cpt_codes') {
      valA = Number(valA) || 0;
      valB = Number(valB) || 0;
    } else {
      valA = String(valA || '').toLowerCase();
      valB = String(valB || '').toLowerCase();
    }
    
    if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
    if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
    setCurrentPage(1);
  };

  const indexOfLastRow = currentPage * rowsPerPage;
  const indexOfFirstRow = indexOfLastRow - rowsPerPage;
  const currentDbData = filteredDbData.slice(indexOfFirstRow, indexOfLastRow);
  const totalPages = Math.ceil(filteredDbData.length / rowsPerPage) || 1;

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
      setEditingRowId(null); // Cancel any edits when changing page
    }
  };

  const handleEditClick = (row) => {
    setEditingRowId(row.id);
    setEditFormData({ ...row });
  };

  const handleCancelEdit = () => {
    setEditingRowId(null);
    setEditFormData({});
  };

  const handleSaveEdit = async () => {
    try {
      if (db.updateOTExtraCost) {
        await db.updateOTExtraCost(editingRowId, editFormData);
        Swal.fire('Success', 'Record updated successfully', 'success');
        setEditingRowId(null);
        fetchData();
      }
    } catch (error) {
      console.error('Error updating record:', error);
      Swal.fire('Error', 'Failed to update record', 'error');
    }
  };

  const handleDelete = async (id) => {
    const result = await Swal.fire({
      title: 'Are you sure?',
      text: "You won't be able to revert this!",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#475569',
      confirmButtonText: 'Yes, delete it!'
    });

    if (result.isConfirmed) {
      try {
        if (db.deleteOTExtraCost) {
          await db.deleteOTExtraCost(id);
          Swal.fire('Deleted!', 'Record has been deleted.', 'success');
          fetchData();
        }
      } catch (error) {
        console.error('Error deleting record:', error);
        Swal.fire('Error', 'Failed to delete record', 'error');
      }
    }
  };

  const handleAddRecord = async (e) => {
    e.preventDefault();
    try {
      if (!newRecordData.cpt_codes) {
        Swal.fire('Error', 'CPT Code is required', 'error');
        return;
      }
      
      if (db.upsertOTExtraCosts) {
        await db.upsertOTExtraCosts([newRecordData]);
        Swal.fire('Success', 'Record added successfully', 'success');
        setIsAddingRecord(false);
        setNewRecordData({
          cpt_codes: '',
          supply_cost: 0,
          implant_cost: 0,
          labour_cost: 0,
          or_room_cost: 0,
          medication_cost: 0,
          tray_cost: 0
        });
        fetchData();
      }
    } catch (error) {
      console.error('Error adding record:', error);
      Swal.fire('Error', 'Failed to add record', 'error');
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsUploading(true);
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const bstr = event.target.result;
        const workbook = XLSX.read(bstr, { type: 'binary' });
        
        // Assuming data is in the first sheet or a sheet named 'Costed_Fee_Schedule'
        const sheetName = workbook.SheetNames.includes('Costed_Fee_Schedule') 
          ? 'Costed_Fee_Schedule' 
          : workbook.SheetNames[0];
          
        const worksheet = workbook.Sheets[sheetName];
        
        // Convert to JSON
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: null });
        
        // Process and extract only the needed columns
        const processedData = jsonData.map(row => {
          const newRow = {};
          
          // Map exact keys from excel to db column names
          Object.keys(targetColumns).forEach(excelCol => {
             const dbCol = targetColumns[excelCol];
             let val = row[excelCol];
             
             // Handle numeric conversions for cost columns
             if (dbCol !== 'cpt_codes') {
               if (typeof val === 'string') {
                 // Remove $ and commas
                 val = val.replace(/[$,]/g, '');
               }
               val = parseFloat(val) || 0.00;
             } else {
               val = val ? String(val).trim() : '';
             }
             
             newRow[dbCol] = val;
          });
          
          return newRow;
        }).filter(row => row.cpt_codes); // filter out empty rows
        
        setData(processedData);
        Swal.fire('Success', `Successfully extracted ${processedData.length} rows from Excel.`, 'success');
      } catch (error) {
        console.error("Error reading excel:", error);
        Swal.fire('Error', 'Failed to parse Excel file. Make sure it has the required columns.', 'error');
      } finally {
        setIsUploading(false);
      }
    };

    reader.readAsBinaryString(file);
  };

  const handleSaveToDB = async () => {
    if (data.length === 0) return;
    
    setIsSaving(true);
    try {
      if (db.upsertOTExtraCosts) {
        await db.upsertOTExtraCosts(data);
        Swal.fire('Success', `Successfully saved ${data.length} records to the database.`, 'success');
        fetchData(); // Refresh table
        setData([]); // Clear upload data
      } else {
        Swal.fire('Error', 'Database function not implemented yet.', 'error');
      }
    } catch (error) {
      console.error('Error saving to DB:', error);
      Swal.fire('Error', error.message || 'Failed to save to database.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="ot-cost-management">
      <div className="dashboard-header" style={{ marginBottom: '20px' }}>
        <div>
          <h2 className="dashboard-title">OT Cost Management</h2>
          <p className="dashboard-subtitle">Upload and manage procedure costs based on CPT codes</p>
        </div>
      </div>

      <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px' }}>
        
        {/* Upload Section */}
        <div className="dashboard-card">
          <div className="card-header">
            <h3 className="card-title"><Upload size={18} /> Import Excel Data</h3>
          </div>
          
          <div style={{ padding: '20px 0', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              Upload your Excel sheet to extract and save the following columns: <br/>
              <strong>cpt_hcpcs_code, supplies_cost, implants_cost, actual_labor_cost, actual_room_cost, medications_cost, tray_cost</strong>
            </p>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
               <label className="btn-header btn-primary" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                 <FileSpreadsheet size={16} />
                 {isUploading ? 'Parsing...' : 'Select Excel File'}
                 <input 
                   type="file" 
                   accept=".xlsx, .xls, .csv" 
                   onChange={handleFileUpload} 
                   style={{ display: 'none' }}
                   disabled={isUploading || isSaving}
                 />
               </label>
               
               {data.length > 0 && (
                 <button 
                   className="btn-header" 
                   style={{ backgroundColor: 'var(--color-green)', color: 'white', borderColor: 'var(--color-green)', display: 'flex', alignItems: 'center', gap: '8px' }}
                   onClick={handleSaveToDB}
                   disabled={isSaving}
                 >
                   <Database size={16} />
                   {isSaving ? 'Saving to DB...' : `Save ${data.length} records to DB`}
                 </button>
               )}
            </div>
          </div>

          {/* Preview extracted data */}
          {data.length > 0 && (
            <div style={{ marginTop: '20px' }}>
              <h4 style={{ fontSize: '0.95rem', marginBottom: '10px', color: 'var(--text-primary)' }}>Extracted Data Preview (Showing top 5)</h4>
              <div className="custom-table-container">
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>CPT Code</th>
                      <th>Supply Cost</th>
                      <th>Implant Cost</th>
                      <th>Labor Cost</th>
                      <th>Room Cost</th>
                      <th>Medication Cost</th>
                      <th>Tray Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.slice(0, 5).map((row, idx) => (
                      <tr key={idx}>
                        <td style={{ fontWeight: '600' }}>{row.cpt_codes}</td>
                        <td>${row.supply_cost?.toFixed(2)}</td>
                        <td>${row.implant_cost?.toFixed(2)}</td>
                        <td>${row.labour_cost?.toFixed(2)}</td>
                        <td>${row.or_room_cost?.toFixed(2)}</td>
                        <td>${row.medication_cost?.toFixed(2)}</td>
                        <td>${row.tray_cost?.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Database View Section */}
        <div className="dashboard-card">
          <div className="card-header">
            <h3 className="card-title"><Database size={18} /> Database Records (Total: {dbData.length} rows)</h3>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="btn-header btn-primary" onClick={() => setIsAddingRecord(true)}>
                <Plus size={14} /> Add Record
              </button>
              <button className="btn-header" onClick={fetchData} disabled={isLoading}>
                 {isLoading ? <Loader size={14} className="spin" /> : 'Refresh'}
              </button>
            </div>
          </div>
          
          <div style={{ marginTop: '16px' }}>
            {isLoading && dbData.length === 0 ? (
               <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading records...</div>
            ) : dbData.length === 0 ? (
               <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-body)', borderRadius: '8px', border: '1px dashed var(--border-color)' }}>
                  No records found in database. Please upload an Excel file to populate data.
               </div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '4px 8px', width: '250px' }}>
                    <Search size={16} style={{ color: 'var(--text-muted)', marginRight: '8px' }} />
                    <input 
                      type="text"
                      placeholder="Search CPT Code..."
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setCurrentPage(1);
                      }}
                      style={{ background: 'none', border: 'none', color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none', width: '100%' }}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Rows per page:</label>
                  <select 
                    value={rowsPerPage} 
                    onChange={(e) => {
                      setRowsPerPage(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="date-range-selector"
                    style={{ padding: '4px 8px', fontSize: '0.8rem', backgroundColor: 'var(--bg-card)' }}
                  >
                    <option value={10}>10</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={500}>500</option>
                  </select>
                </div>
              </div>
                <div className="custom-table-container">
                  <table className="custom-table">
                    <thead style={{ position: 'sticky', top: 0, backgroundColor: 'var(--bg-card)', zIndex: 1 }}>
                      <tr>
                        <th onClick={() => handleSort('cpt_codes')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                          CPT Code {sortField === 'cpt_codes' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                        </th>
                        <th onClick={() => handleSort('supply_cost')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                          Supply Cost {sortField === 'supply_cost' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                        </th>
                        <th onClick={() => handleSort('implant_cost')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                          Implant Cost {sortField === 'implant_cost' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                        </th>
                        <th onClick={() => handleSort('labour_cost')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                          Labor Cost {sortField === 'labour_cost' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                        </th>
                        <th onClick={() => handleSort('or_room_cost')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                          Room Cost {sortField === 'or_room_cost' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                        </th>
                        <th onClick={() => handleSort('medication_cost')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                          Medication Cost {sortField === 'medication_cost' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                        </th>
                        <th onClick={() => handleSort('tray_cost')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                          Tray Cost {sortField === 'tray_cost' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                        </th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentDbData.map((row, idx) => (
                        <tr key={row.id || idx}>
                          {editingRowId === row.id ? (
                            <>
                              <td style={{ fontWeight: '600', color: 'var(--color-blue)' }}>
                                {row.cpt_codes}
                              </td>
                              <td>
                                <input 
                                  type="number" 
                                  value={editFormData.supply_cost}
                                  onChange={(e) => setEditFormData({...editFormData, supply_cost: parseFloat(e.target.value) || 0})}
                                  style={{ width: '80px', padding: '4px', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                                />
                              </td>
                              <td>
                                <input 
                                  type="number" 
                                  value={editFormData.implant_cost}
                                  onChange={(e) => setEditFormData({...editFormData, implant_cost: parseFloat(e.target.value) || 0})}
                                  style={{ width: '80px', padding: '4px', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                                />
                              </td>
                              <td>
                                <input 
                                  type="number" 
                                  value={editFormData.labour_cost}
                                  onChange={(e) => setEditFormData({...editFormData, labour_cost: parseFloat(e.target.value) || 0})}
                                  style={{ width: '80px', padding: '4px', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                                />
                              </td>
                              <td>
                                <input 
                                  type="number" 
                                  value={editFormData.or_room_cost}
                                  onChange={(e) => setEditFormData({...editFormData, or_room_cost: parseFloat(e.target.value) || 0})}
                                  style={{ width: '80px', padding: '4px', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                                />
                              </td>
                              <td>
                                <input 
                                  type="number" 
                                  value={editFormData.medication_cost}
                                  onChange={(e) => setEditFormData({...editFormData, medication_cost: parseFloat(e.target.value) || 0})}
                                  style={{ width: '80px', padding: '4px', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                                />
                              </td>
                              <td>
                                <input 
                                  type="number" 
                                  value={editFormData.tray_cost}
                                  onChange={(e) => setEditFormData({...editFormData, tray_cost: parseFloat(e.target.value) || 0})}
                                  style={{ width: '80px', padding: '4px', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                                />
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                  <button onClick={handleSaveEdit} className="btn-header" style={{ color: 'var(--color-green)', borderColor: 'var(--color-green)', padding: '4px 8px' }}>
                                    <CheckCircle size={14} />
                                  </button>
                                  <button onClick={handleCancelEdit} className="btn-header" style={{ color: 'var(--text-secondary)', padding: '4px 8px' }}>
                                    <X size={14} />
                                  </button>
                                </div>
                              </td>
                            </>
                          ) : (
                            <>
                              <td style={{ fontWeight: '600', color: 'var(--color-blue)' }}>{row.cpt_codes}</td>
                              <td>${Number(row.supply_cost).toFixed(2)}</td>
                              <td>${Number(row.implant_cost).toFixed(2)}</td>
                              <td>${Number(row.labour_cost).toFixed(2)}</td>
                              <td>${Number(row.or_room_cost).toFixed(2)}</td>
                              <td>${Number(row.medication_cost).toFixed(2)}</td>
                              <td>${Number(row.tray_cost).toFixed(2)}</td>
                              <td style={{ textAlign: 'right' }}>
                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                  <button onClick={() => handleEditClick(row)} style={{ background: 'none', border: 'none', color: 'var(--color-blue)', cursor: 'pointer' }}>
                                    <Edit2 size={16} />
                                  </button>
                                  <button onClick={() => handleDelete(row.id)} style={{ background: 'none', border: 'none', color: 'var(--color-red)', cursor: 'pointer' }}>
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '15px' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    Showing {filteredDbData.length > 0 ? indexOfFirstRow + 1 : 0} to {Math.min(indexOfLastRow, filteredDbData.length)} of {filteredDbData.length} records
                    {searchQuery ? " (filtered from " + dbData.length + ")" : ""}
                  </span>
                  <div style={{ display: 'flex', gap: '5px' }}>
                    <button 
                      onClick={() => handlePageChange(currentPage - 1)} 
                      disabled={currentPage === 1}
                      className="btn-header"
                      style={{ padding: '4px 10px', fontSize: '0.8rem', opacity: currentPage === 1 ? 0.5 : 1 }}
                    >
                      Previous
                    </button>
                    <span style={{ padding: '4px 10px', fontSize: '0.85rem', backgroundColor: 'var(--bg-card)', borderRadius: '4px' }}>
                      Page {currentPage} of {totalPages}
                    </span>
                    <button 
                      onClick={() => handlePageChange(currentPage + 1)} 
                      disabled={currentPage === totalPages}
                      className="btn-header"
                      style={{ padding: '4px 10px', fontSize: '0.8rem', opacity: currentPage === totalPages ? 0.5 : 1 }}
                    >
                      Next
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

      </div>

      {/* ADD RECORD MODAL */}
      {isAddingRecord && (
        <div className="modal-overlay" onClick={() => setIsAddingRecord(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ width: '500px', maxWidth: '95%' }}>
            <div className="modal-header">
              <h3 style={{ fontSize: '1.1rem', color: 'var(--text-primary)', fontWeight: '700' }}>
                Add New Procedure Cost
              </h3>
              <button className="modal-close" onClick={() => setIsAddingRecord(false)}>×</button>
            </div>

            <form onSubmit={handleAddRecord} className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>CPT Code *</label>
                <input 
                  type="text" 
                  required
                  value={newRecordData.cpt_codes}
                  onChange={(e) => setNewRecordData({...newRecordData, cpt_codes: e.target.value})}
                  className="date-range-selector"
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Supply Cost</label>
                  <input 
                    type="number" 
                    step="0.01"
                    value={newRecordData.supply_cost}
                    onChange={(e) => setNewRecordData({...newRecordData, supply_cost: parseFloat(e.target.value) || 0})}
                    className="date-range-selector"
                    style={{ width: '100%' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Implant Cost</label>
                  <input 
                    type="number" 
                    step="0.01"
                    value={newRecordData.implant_cost}
                    onChange={(e) => setNewRecordData({...newRecordData, implant_cost: parseFloat(e.target.value) || 0})}
                    className="date-range-selector"
                    style={{ width: '100%' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Labor Cost</label>
                  <input 
                    type="number" 
                    step="0.01"
                    value={newRecordData.labour_cost}
                    onChange={(e) => setNewRecordData({...newRecordData, labour_cost: parseFloat(e.target.value) || 0})}
                    className="date-range-selector"
                    style={{ width: '100%' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Room Cost</label>
                  <input 
                    type="number" 
                    step="0.01"
                    value={newRecordData.or_room_cost}
                    onChange={(e) => setNewRecordData({...newRecordData, or_room_cost: parseFloat(e.target.value) || 0})}
                    className="date-range-selector"
                    style={{ width: '100%' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Medication Cost</label>
                  <input 
                    type="number" 
                    step="0.01"
                    value={newRecordData.medication_cost}
                    onChange={(e) => setNewRecordData({...newRecordData, medication_cost: parseFloat(e.target.value) || 0})}
                    className="date-range-selector"
                    style={{ width: '100%' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Tray Cost</label>
                  <input 
                    type="number" 
                    step="0.01"
                    value={newRecordData.tray_cost}
                    onChange={(e) => setNewRecordData({...newRecordData, tray_cost: parseFloat(e.target.value) || 0})}
                    className="date-range-selector"
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button type="button" className="btn-header" onClick={() => setIsAddingRecord(false)}>Cancel</button>
                <button type="submit" className="btn-header btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle size={14} /> Save Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
