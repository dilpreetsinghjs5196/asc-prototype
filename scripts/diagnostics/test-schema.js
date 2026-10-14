import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://xeqbfrxoozaltcxvitfa.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhlcWJmcnhvb3phbHRjeHZpdGZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1MDI1OTUsImV4cCI6MjA5NzA3ODU5NX0.E_2qNlf3_rpgCPk06oIIqG5OzQnneFfGoPGDLEjz-3Y';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkSchema() {
  const { data, error } = await supabase
    .from('cpt_codes')
    .select('*')
    .limit(1);

  if (error) {
    console.error('Error fetching cpt_codes:', error);
  } else {
    console.log('CPT codes row keys:', data.length > 0 ? Object.keys(data[0]) : 'No data');
    console.log('CPT codes row:', data[0]);
  }
}

checkSchema();
