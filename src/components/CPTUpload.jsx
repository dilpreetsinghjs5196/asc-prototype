import React, { useState } from 'react';
import { Upload, FileText, CheckCircle, AlertTriangle, Loader } from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase, db } from '../lib/supabase';
import './CPTUpload.css';

const CPTUpload = () => {
  const [file, setFile] = useState(null);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleFileUpload = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      parseExcel(selectedFile);
    }
  };

  const parseExcel = (file) => {
    setLoading(true);
    setError(null);
    setSuccess(false);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const buffer = e.target.result;
        const workbook = XLSX.read(buffer, { type: 'array' });
        
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        const parsedData = [];
        
        for (let i = 4; i < rawData.length; i++) {
          const row = rawData[i];
          if (row && row[0]) {
            const code = String(row[0]).trim();
            const description = row[1] ? String(row[1]).trim() : '';
            const reimbursement = row[5] !== undefined && row[5] !== '' ? parseFloat(row[5]) : null;
            // 350% Gross Charge from column H (index 7) or calculated as ROUND(reimbursement * 3.5, 0)
            let grossCharge = row[7] !== undefined && row[7] !== '' ? parseFloat(row[7]) : null;
            if ((grossCharge === null || isNaN(grossCharge)) && reimbursement !== null && !isNaN(reimbursement)) {
              grossCharge = Math.round(reimbursement * 3.5);
            }
            
            // Only add rows that have a valid code AND a valid gross charge
            if (code && grossCharge !== null && !isNaN(grossCharge)) {
              parsedData.push({
                code: code,
                description: description,
                reimbursement: isNaN(reimbursement) ? 0 : reimbursement,
                gross_charge: grossCharge,
                effective_date: new Date().toISOString().split('T')[0],
                termination_date: null
              });
            }
          }
        }
        
        setData(parsedData);
        setLoading(false);
      } catch (err) {
        console.error("Error parsing Excel:", err);
        setError("Failed to parse the Excel file. Please ensure it has the correct format.");
        setLoading(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleUploadToDB = async () => {
    if (data.length === 0) return;
    
    setLoading(true);
    setError(null);
    setSuccess(false);
    setProgress(0);
    
    try {
      const activeFacility = db.getActiveFacility()?.id || null;
      const effectiveDateStr = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

      // Fetch existing codes in chunks to identify rate changes & prior versions
      const existingMap = {};
      const chunkSize = 200;
      
      for (let i = 0; i < data.length; i += chunkSize) {
        const chunk = data.slice(i, i + chunkSize);
        const codes = chunk.map(d => d.code);
        
        const { data: existingRecords } = await supabase
          .from('cpt_codes')
          .select('id, code, reimbursement, gross_charge, termination_date, effective_date')
          .in('code', codes)
          .order('effective_date', { ascending: false });
          
        if (existingRecords) {
          existingRecords.forEach(record => {
            if (!existingMap[record.code]) {
              existingMap[record.code] = record;
            }
          });
        }
      }

      // Fetch max ID to maintain sequence compatibility
      const { data: maxIdData } = await supabase
        .from('cpt_codes')
        .select('id')
        .order('id', { ascending: false })
        .limit(1);
        
      let nextId = maxIdData && maxIdData.length > 0 ? maxIdData[0].id + 1 : 1;

      // 1. Terminate previous versions that are currently active
      const codesToTerminate = [];
      data.forEach(item => {
        const existing = existingMap[item.code];
        if (existing && !existing.termination_date) {
          codesToTerminate.push(existing.id);
        }
      });

      if (codesToTerminate.length > 0) {
        for (let i = 0; i < codesToTerminate.length; i += 200) {
          const chunkIds = codesToTerminate.slice(i, i + 200);
          await supabase
            .from('cpt_codes')
            .update({ termination_date: yesterday, is_active: false })
            .in('id', chunkIds);
        }
      }

      // 2. Insert new versions in chunks with 350% gross charge rule
      const payloads = data.map(item => {
        const existing = existingMap[item.code] || {};
        return {
          id: nextId++,
          facility_id: activeFacility, // NULL for global standard catalog or tenant facility
          is_active: true,
          turnover_time: 30,
          procedure_group: item.procedure_group || existing.procedure_group || (item.category ? `${item.category} Procedures` : 'General Procedures'),
          category: item.category || existing.category || 'General',
          body_part: item.body_part || existing.body_part || null,
          code: item.code,
          description: item.description || existing.description || '',
          reimbursement: item.reimbursement !== null ? item.reimbursement : (existing.reimbursement ?? 0),
          // Enforce whole-dollar 350% gross charge rule
          gross_charge: item.gross_charge ? item.gross_charge : Math.round(Number(item.reimbursement || 0) * 3.5),
          effective_date: effectiveDateStr,
          termination_date: null,
          cost: existing.cost !== undefined ? existing.cost : 0,
          original_filename: file?.name || 'CPT_EXCEL_UPLOAD'
        };
      });

      let insertedCount = 0;
      for (let i = 0; i < payloads.length; i += chunkSize) {
        const batch = payloads.slice(i, i + chunkSize);
        const { error: insertError } = await supabase.from('cpt_codes').insert(batch);
        if (insertError) {
          console.error("Batch insert error:", insertError);
          throw insertError;
        }
        insertedCount += batch.length;
        setProgress(Math.round((insertedCount / payloads.length) * 100));
      }
      
      setSuccess(true);
      setData([]);
      setFile(null);
    } catch (err) {
      console.error("Database upload error:", err);
      setError("Failed to upload data to the database: " + (err.message || String(err)));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="cpt-upload-container p-6">
      <div className="card">
        <div className="card-header">
          <h3>Upload CPT Codes Excel File</h3>
        </div>
        <div className="card-body">
          <div className="upload-section">
            <input
              type="file"
              id="file-upload"
              accept=".xlsx, .xls"
              onChange={handleFileUpload}
              className="hidden-input"
            />
            <label htmlFor="file-upload" className="upload-dropzone">
              <Upload size={32} className="upload-icon" />
              <h4>{file ? file.name : "Click or drag to upload"}</h4>
              <p>Supports .xlsx and .xls formats</p>
            </label>
          </div>

          {loading && (
            <div className="status-message loading" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Loader className="spin" size={18} /> Processing...
              </div>
              {progress > 0 && (
                <div style={{ width: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
                    <span>Uploading to database</span>
                    <span>{progress}%</span>
                  </div>
                  <div style={{ width: '100%', height: '8px', backgroundColor: 'rgba(59, 130, 246, 0.2)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ width: `${progress}%`, height: '100%', backgroundColor: '#3b82f6', transition: 'width 0.2s' }}></div>
                  </div>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="status-message error">
              <AlertTriangle size={18} /> {error}
            </div>
          )}

          {success && (
            <div className="status-message success">
              <CheckCircle size={18} /> Data successfully uploaded to database!
            </div>
          )}

          {data.length > 0 && !loading && !success && (
            <div className="preview-section">
              <div className="preview-header">
                <h4>Preview Data ({data.length} records found)</h4>
                <button 
                  className="btn btn-primary"
                  onClick={handleUploadToDB}
                >
                  <FileText size={16} /> Import to Database
                </button>
              </div>
              
              <div className="table-container">
                <table className="preview-table">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Description</th>
                      <th>Reimbursement ($)</th>
                      <th>Gross Charge ($)</th>
                      <th>Effective Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.slice(0, 10).map((row, idx) => (
                      <tr key={idx}>
                        <td>{row.code}</td>
                        <td>{row.description}</td>
                        <td>{row.reimbursement !== null ? row.reimbursement.toFixed(2) : '-'}</td>
                        <td>{row.gross_charge !== null ? row.gross_charge.toFixed(2) : '-'}</td>
                        <td>{row.effective_date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {data.length > 10 && (
                  <div className="table-footer">
                    Showing first 10 rows of {data.length} total.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CPTUpload;
