import React, { useState } from 'react';
import { Upload, FileText, CheckCircle, AlertTriangle, Loader } from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
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
            // 350% Gross Charge is in column H (index 7)
            const grossCharge = row[7] !== undefined && row[7] !== '' ? parseFloat(row[7]) : null;
            
            // Only add rows that have a valid code AND a valid gross charge
            if (code && grossCharge !== null && !isNaN(grossCharge)) {
              parsedData.push({
                code: code,
                description: description,
                reimbursement: isNaN(reimbursement) ? null : reimbursement,
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
      // First, get all existing codes in batches
      const existingMap = {};
      const chunkSize = 100;
      
      for (let i = 0; i < data.length; i += chunkSize) {
        const chunk = data.slice(i, i + chunkSize);
        const codes = chunk.map(d => d.code);
        
        // Order by id descending to get the most recent version of the code
        const { data: existingRecords, error: fetchError } = await supabase
          .from('cpt_codes')
          .select('*')
          .in('code', codes)
          .order('id', { ascending: false });
          
        if (!fetchError && existingRecords) {
          existingRecords.forEach(record => {
            // Since it's ordered descending, the first one we see is the latest.
            if (!existingMap[record.code]) {
              existingMap[record.code] = record;
            }
          });
        }
      }

      // Fetch max ID to handle cases where Postgres sequence is out of sync
      const { data: maxIdData } = await supabase
        .from('cpt_codes')
        .select('id')
        .order('id', { ascending: false })
        .limit(1);
        
      let nextId = maxIdData && maxIdData.length > 0 ? maxIdData[0].id + 1 : 1;

      let processed = 0;
      for (const item of data) {
        const existing = existingMap[item.code] || {};
        
        // Remove fields from 'existing' that shouldn't be copied verbatim to a new row
        const { id: _id, created_at: _created_at, ...restExisting } = existing;
        
        // Use existing value if new value is empty/null, and preserve other required columns
        const payload = {
          id: nextId++,
          is_active: true,
          turnover_time: 30,
          procedure_group: 'General Procedures',
          category: 'General',
          ...restExisting,
          code: item.code,
          description: item.description || existing.description || '',
          reimbursement: item.reimbursement !== null ? item.reimbursement : (existing.reimbursement ?? 0),
          gross_charge: item.gross_charge !== null ? item.gross_charge : (existing.gross_charge ?? 0),
          effective_date: item.effective_date, // Always use new effective date (today)
          termination_date: null,
          cost: existing.cost !== undefined ? existing.cost : 0
        };
        
        // We ALWAYS insert a new row to preserve history (versioning)
        const { error: insertError } = await supabase.from('cpt_codes').insert([payload]);
        
        if (insertError) {
          console.error("Error inserting code", item.code, insertError);
          throw insertError;
        }

        processed++;
        setProgress(Math.round((processed / data.length) * 100));
      }
      
      setSuccess(true);
      setData([]);
      setFile(null);
    } catch (err) {
      console.error("Database upload error:", err);
      setError("Failed to upload data to the database.");
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
