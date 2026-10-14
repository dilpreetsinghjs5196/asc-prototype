import * as XLSX from 'xlsx';
import * as fs from 'fs';

try {
  const buf = fs.readFileSync('e:\\medicalAI\\files\\case logs\\CASE LOG (3).xlsx');
  const workbook = XLSX.read(buf, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  // Parse with header: 1 to get an array of arrays
  const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  
  let headerRowIndex = -1;
  for (let i = 0; i < rawData.length; i++) {
    const row = rawData[i];
    const rowString = row.join(' ').toLowerCase();
    if (rowString.includes('surgeon') || rowString.includes('date') || rowString.includes('cpt') || rowString.includes('physician')) {
      headerRowIndex = i;
      break;
    }
  }
  
  if (headerRowIndex !== -1) {
    console.log("Found header at row", headerRowIndex);
    console.log("Header:", rawData[headerRowIndex]);
    console.log("First data row:", rawData[headerRowIndex + 1]);
  } else {
    console.log("Could not find a recognizable header row.");
  }
} catch (e) {
  console.error("Error reading file:", e.message);
}
