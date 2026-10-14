import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://xeqbfrxoozaltcxvitfa.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhlcWJmcnhvb3phbHRjeHZpdGZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1MDI1OTUsImV4cCI6MjA5NzA3ODU5NX0.E_2qNlf3_rpgCPk06oIIqG5OzQnneFfGoPGDLEjz-3Y';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const tablesToCheck = ['agent_runs', 'agent_tasks', 'agent_events', 'agent_context', 'agent_approvals', 'agent_errors'];

async function verifyAgentTables() {
    console.log("Checking agent logging tables in Supabase database...\n");
    for (const table of tablesToCheck) {
        const { error } = await supabase
            .from(table)
            .select('*')
            .limit(1);

        if (error) {
            if (error.code === 'PGRST116' || error.message.includes('relation') || error.message.includes('does not exist')) {
                console.log(`❌ Table "${table}" does NOT exist.`);
            } else {
                console.log(`⚠️ Table "${table}" returned error:`, error.message);
            }
        } else {
            console.log(`✅ Table "${table}" exists.`);
        }
    }
}

verifyAgentTables();
