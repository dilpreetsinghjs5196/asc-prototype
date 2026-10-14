import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://xeqbfrxoozaltcxvitfa.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhlcWJmcnhvb3phbHRjeHZpdGZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1MDI1OTUsImV4cCI6MjA5NzA3ODU5NX0.E_2qNlf3_rpgCPk06oIIqG5OzQnneFfGoPGDLEjz-3Y';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  // Let's get one patient and one surgeon first
  const { data: patients } = await supabase.from('patients').select('id').limit(1);
  const { data: surgeons } = await supabase.from('surgeons').select('id, name, lastname, firstname').limit(1);

  if (!patients || patients.length === 0 || !surgeons || surgeons.length === 0) {
    console.log('No patient or surgeon found to link.');
    return;
  }

  const patientId = patients[0].id;
  const surgeonId = surgeons[0].id;
  const doctorName = `Dr. ${surgeons[0].lastname || ''} ${surgeons[0].firstname || ''}`.trim();

  console.log('Using patientId:', patientId, 'surgeonId:', surgeonId, 'doctorName:', doctorName);

  const payload = {
    patient_id: patientId,
    surgeon_id: surgeonId,
    doctor_name: doctorName,
    date: '2026-06-26',
    start_time: '14:00',
    duration_minutes: 60,
    turnover_time: 20,
    cpt_codes: ['99912'],
    status: 'scheduled',
    or_room: 'OR 1'
  };

  const { data, error } = await supabase
    .from('surgeries')
    .insert([payload])
    .select();

  if (error) {
    console.error('Insert surgery error:', error);
  } else {
    console.log('Insert surgery success:', data);
    // Delete it so we don't leave trash
    const { error: delError } = await supabase
      .from('surgeries')
      .delete()
      .eq('id', data[0].id);
    console.log('Cleaned up:', delError ? 'failed' : 'success');
  }
}

run();
