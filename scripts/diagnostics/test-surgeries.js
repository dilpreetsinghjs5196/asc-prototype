import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://xeqbfrxoozaltcxvitfa.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhlcWJmcnhvb3phbHRjeHZpdGZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1MDI1OTUsImV4cCI6MjA5NzA3ODU5NX0.E_2qNlf3_rpgCPk06oIIqG5OzQnneFfGoPGDLEjz-3Y';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkSurgeries() {
  const { data, error } = await supabase
    .from('surgeries')
    .select('*, patients(*), surgeons(*)');

  if (error) {
    console.error('Error fetching surgeries:', error);
  } else {
    let totalRev = 0;
    let totalMargin = 0;
    data.forEach(surg => {
      const revenue = Number(surg.expected_reimbursement || 0);
      const supplies = Number(surg.supplies_cost || 0);
      const implants = Number(surg.implants_cost || 0);
      const labor = Number(surg.actual_labor_cost || 0);
      const roomCost = Number(surg.actual_room_cost || 0);
      const meds = Number(surg.medications_cost || 0);
      
      let trayCost = Number(surg.tray_cost || 0);
      if (trayCost === 0 && surg.notes) {
        const m = surg.notes.match(/\[Tray Cost:\s*([\d.]+)\]/);
        if (m) trayCost = parseFloat(m[1]);
      }
      const margin = revenue - (supplies + implants + labor + roomCost + meds + trayCost);
      totalRev += revenue;
      totalMargin += margin;
    });
    console.log('Total Cases:', data.length);
    console.log('Total Revenue:', totalRev);
    console.log('Total Margin:', totalMargin);
    console.log('EBITDA:', ((totalMargin / totalRev) * 100).toFixed(1));
  }
}

checkSurgeries();
