import { createClient } from '@supabase/supabase-js';
import { ENV } from './env.js';

const supabaseUrl = ENV.supabaseUrl || '';
const supabaseAnonKey = ENV.supabaseAnonKey || '';

export const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey)
  : new Proxy({}, {
      get(target, prop) {
        if (typeof prop === 'symbol' || prop === 'toJSON' || prop === 'then' || prop === '$$typeof') {
          return undefined;
        }
        throw new Error(`Supabase client.${String(prop)} accessed without valid environment configuration.`);
      }
    });

export const db = {
  // Fetch list of surgeons
  async getSurgeons() {
    const { data, error } = await supabase
      .from('surgeons')
      .select('*')
      .order('id', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  // Fetch list of patients
  async getPatients() {
    const { data, error } = await supabase
      .from('patients')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  // Fetch CPT codes list
  async getCPTCodes() {
    let allCodes = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
        const { data, error } = await supabase
            .from('cpt_codes')
            .select('*')
            .is('termination_date', null)
            .order('code', { ascending: true })
            .range(page * pageSize, (page + 1) * pageSize - 1);

        if (error) throw error;

        if (data && data.length > 0) {
            allCodes = [...allCodes, ...data];
            if (data.length < pageSize) {
                hasMore = false;
            } else {
                page++;
            }
        } else {
            hasMore = false;
        }
    }
    return allCodes;
  },

  // Fetch surgeries, joining surgeon and patient details
  async getSurgeries() {
    try {
      const { data, error } = await supabase
        .from('surgeries')
        .select('*, patients(*), surgeons(*)')
        .order('date', { ascending: false });
      if (!error && data) return data;
    } catch {
      // Ignore join error and proceed to fallback
    }

    // Fallback: direct select without requiring foreign keys in schema cache
    const { data, error } = await supabase
      .from('surgeries')
      .select('*')
      .order('date', { ascending: false });
    if (error) throw error;

    // Attach patient and surgeon details client-side
    try {
      const [{ data: patientsData }, { data: surgeonsData }] = await Promise.all([
        supabase.from('patients').select('*'),
        supabase.from('surgeons').select('*')
      ]);
      const patientMap = new Map((patientsData || []).map(p => [String(p.id), p]));
      const surgeonMap = new Map((surgeonsData || []).map(s => [String(s.id), s]));

      return (data || []).map(surg => ({
        ...surg,
        patients: patientMap.get(String(surg.patient_id)) || null,
        surgeons: surgeonMap.get(String(surg.surgeon_id)) || null
      }));
    } catch {
      return data || [];
    }
  },

  // Fetch OR Block Schedule
  async getORBlockSchedule() {
    const { data, error } = await supabase
      .from('or_block_schedule')
      .select('*')
      .order('id', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  // Add a new patient
  async addPatient(patient) {
    const payload = {
      ...patient,
      facility_id: patient.facility_id || this.getActiveFacility()?.id || '00000000-0000-0000-0000-000000000002'
    };
    const { data, error } = await supabase
      .from('patients')
      .insert([payload])
      .select();
    if (error) throw error;
    return data?.[0] || null;
  },

  // Update an existing patient
  async updatePatient(id, updates) {
    const { data, error } = await supabase
      .from('patients')
      .update(updates)
      .eq('id', id)
      .select();
    if (error) throw error;
    return data?.[0] || null;
  },

  // Delete a patient
  async deletePatient(id) {
    const { error } = await supabase
      .from('patients')
      .delete()
      .eq('id', id);
    if (error) throw error;
    return true;
  },

  // Add a new surgeon
  async addSurgeon(surgeon) {
    const payload = {
      ...surgeon,
      facility_id: surgeon.facility_id || this.getActiveFacility()?.id || '00000000-0000-0000-0000-000000000002'
    };
    const { data, error } = await supabase
      .from('surgeons')
      .insert([payload])
      .select();
    if (error) throw error;
    return data?.[0] || null;
  },

  // Update an existing surgeon
  async updateSurgeon(id, updates) {
    const { data, error } = await supabase
      .from('surgeons')
      .update(updates)
      .eq('id', id)
      .select();
    if (error) throw error;
    return data?.[0] || null;
  },

  // Delete a surgeon
  async deleteSurgeon(id) {
    const { error } = await supabase
      .from('surgeons')
      .delete()
      .eq('id', id);
    if (error) throw error;
    return true;
  },

  // Add a new surgery
  async addSurgery(surgery) {
    const payload = {
      ...surgery,
      facility_id: surgery.facility_id || this.getActiveFacility()?.id || '00000000-0000-0000-0000-000000000002'
    };
    const { data, error } = await supabase
      .from('surgeries')
      .insert([payload])
      .select();
    if (error) throw error;
    return data?.[0] || null;
  },

  // Update an existing surgery
  async updateSurgery(id, updates) {
    const { data, error } = await supabase
      .from('surgeries')
      .update(updates)
      .eq('id', id)
      .select();
    if (error) throw error;
    return data?.[0] || null;
  },

  // Delete a surgery
  async deleteSurgery(id) {
    const { error } = await supabase
      .from('surgeries')
      .delete()
      .eq('id', id);
    if (error) throw error;
    return true;
  },

  // Add a new OR block schedule
  async addORBlockSchedule(schedule) {
    const { data: maxData, error: maxError } = await supabase
      .from('or_block_schedule')
      .select('id')
      .order('id', { ascending: false })
      .limit(1);
    
    if (maxError) throw maxError;
    
    const maxId = maxData && maxData.length > 0 ? maxData[0].id : 0;
    const nextId = maxId + 1;
    
    const payload = { 
      ...schedule, 
      id: nextId,
      facility_id: schedule.facility_id || this.getActiveFacility()?.id || '00000000-0000-0000-0000-000000000002'
    };

    const { data, error } = await supabase
      .from('or_block_schedule')
      .insert([payload])
      .select()
      .single();
    if (error) throw error;
    return data || null;
  },

  // Update an existing OR block schedule
  async updateORBlockSchedule(id, updates) {
    const { data, error } = await supabase
      .from('or_block_schedule')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data || null;
  },

  // Delete an OR block schedule
  async deleteORBlockSchedule(id) {
    const { error } = await supabase
      .from('or_block_schedule')
      .delete()
      .eq('id', id);
    if (error) throw error;
    return true;
  },

  // Fetch all staff
  async getStaff() {
    const { data, error } = await supabase
      .from('staff')
      .select('*')
      .order('lastname', { ascending: true });
    if (error) throw error;
    return data || [];
  },

  // Fetch distinct batches
  async getCPTBatches() {
    let allDates = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
        const { data, error } = await supabase
            .from('cpt_codes')
            .select('effective_date, termination_date')
            .range(page * pageSize, (page + 1) * pageSize - 1);

        if (error) throw error;

        if (data && data.length > 0) {
            allDates = [...allDates, ...data];
            if (data.length < pageSize) {
                hasMore = false;
            } else {
                page++;
            }
        } else {
            hasMore = false;
        }
    }
    
    // Get unique batches and counts
    const batchMap = new Map();
    for (const d of allDates) {
      const key = `${d.effective_date}|${d.termination_date}`;
      if (!batchMap.has(key)) {
        batchMap.set(key, { effective_date: d.effective_date, termination_date: d.termination_date, count: 0 });
      }
      batchMap.get(key).count++;
    }
    const batches = Array.from(batchMap.values());
    
    // Sort batches: latest first (null termination date first, then descending effective date)
    batches.sort((a, b) => {
       if (a.termination_date === null && b.termination_date !== null) return -1;
       if (a.termination_date !== null && b.termination_date === null) return 1;
       if (a.termination_date === b.termination_date) {
           return new Date(b.effective_date) - new Date(a.effective_date);
       }
       return new Date(b.termination_date) - new Date(a.termination_date);
    });
    
    return batches;
  },

  // Fetch CPT codes list with server-side filtering, search, and pagination
  async getCPTCodesPaged({ search = '', category = 'All', page = 1, limit = 10, sortField = 'code', sortDirection = 'asc', status = 'all', effective_date, termination_date }) {
    let query = supabase
      .from('cpt_codes')
      .select('*', { count: 'exact' });

    if (search) {
      query = query.or(`code.ilike.%${search}%,description.ilike.%${search}%`);
    }

    if (category && category !== 'All') {
      query = query.eq('category', category);
    }

    if (status === 'latest') {
      query = query.is('termination_date', null);
    } else if (status === 'historical') {
      query = query.not('termination_date', 'is', null);
    } else if (status === 'batch') {
      if (effective_date === null) query = query.is('effective_date', null);
      else query = query.eq('effective_date', effective_date);
      
      if (termination_date === null) query = query.is('termination_date', null);
      else query = query.eq('termination_date', termination_date);
    }

    query = query.order(sortField, { ascending: sortDirection === 'asc' });

    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    const { data, count, error } = await query;
    if (error) throw error;

    return {
      cptCodes: data || [],
      totalCount: count || 0
    };
  },

  // Add a new CPT code
  async addCPTCode(cpt) {
    const { data: maxData, error: maxError } = await supabase
      .from('cpt_codes')
      .select('id')
      .order('id', { ascending: false })
      .limit(1);
    if (maxError) throw maxError;
    const maxId = maxData.length > 0 ? maxData[0].id : 0;
    const nextId = maxId + 1;

    const payload = {
      ...cpt,
      id: nextId,
      facility_id: cpt.facility_id || this.getActiveFacility()?.id || '00000000-0000-0000-0000-000000000002',
      reimbursement: cpt.reimbursement !== null && cpt.reimbursement !== undefined ? cpt.reimbursement : 0,
      cost: cpt.cost !== null && cpt.cost !== undefined ? cpt.cost : 0,
      gross_charge: cpt.gross_charge !== null && cpt.gross_charge !== undefined ? cpt.gross_charge : 0,
      average_duration: cpt.average_duration !== null && cpt.average_duration !== undefined ? cpt.average_duration : 0,
      turnover_time: cpt.turnover_time !== null && cpt.turnover_time !== undefined ? cpt.turnover_time : 0
    };

    const { data, error } = await supabase
      .from('cpt_codes')
      .insert([payload])
      .select();
    if (error) throw error;
    return data?.[0] || null;
  },

  // Update an existing CPT code
  async updateCPTCode(id, updates) {
    const payload = { ...updates };
    if (updates.reimbursement === null || updates.reimbursement === undefined) payload.reimbursement = 0;
    if (updates.cost === null || updates.cost === undefined) payload.cost = 0;
    if (updates.gross_charge === null || updates.gross_charge === undefined) payload.gross_charge = 0;
    if (updates.average_duration === null || updates.average_duration === undefined) payload.average_duration = 0;
    if (updates.turnover_time === null || updates.turnover_time === undefined) payload.turnover_time = 0;

    const { data, error } = await supabase
      .from('cpt_codes')
      .update(payload)
      .eq('id', id)
      .select();
    if (error) throw error;
    return data?.[0] || null;
  },

  // Delete a CPT code
  async deleteCPTCode(id) {
    const { error } = await supabase
      .from('cpt_codes')
      .delete()
      .eq('id', id);
    if (error) throw error;
    return true;
  },

  // Bulk update dates for a group of CPT codes
  async bulkUpdateCPTGroup(status, updates) {
    let query = supabase.from('cpt_codes').update(updates);
    if (status === 'latest') {
      query = query.is('termination_date', null);
    } else if (status === 'historical') {
      query = query.not('termination_date', 'is', null);
    } else {
      throw new Error('Invalid status for bulk update');
    }
    const { error } = await query;
    if (error) throw error;
    return true;
  },

  // ==================== SETTINGS ====================
  async getSettings() {
    const { data, error } = await supabase
      .from('settings')
      .select('*')
      .limit(1);

    // Don't throw error if no rows found, just return null
    if (error) {
      if (error.code === 'PGRST116' || error.code === '42P01') return null;
      console.error('Error fetching settings:', error);
      throw error;
    }

    return data && data.length > 0 ? data[0] : null;
  },

  async updateSettings(updates) {
    // Get the first (and only) settings record
    const { data: existing } = await supabase
      .from('settings')
      .select('id')
      .limit(1)
      .single();

    if (existing) {
      const { data, error } = await supabase
        .from('settings')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } else {
      // Insert if no settings exist
      const { data, error } = await supabase
        .from('settings')
        .insert([updates])
        .select()
        .single();

      if (error) throw error;
      return data;
    }
  },

  // ==================== OT EXTRA COST ====================
  async getOTExtraCosts() {
    let allCosts = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
        const { data, error } = await supabase
            .from('ot_extra_cost')
            .select('*')
            .order('cpt_codes', { ascending: true })
            .range(page * pageSize, (page + 1) * pageSize - 1);
            
        if (error) {
           console.error("Error fetching OT extra costs:", error);
           throw error;
        }

        if (data && data.length > 0) {
            allCosts = [...allCosts, ...data];
            if (data.length < pageSize) {
                hasMore = false;
            } else {
                page++;
            }
        } else {
            hasMore = false;
        }
    }
    return allCosts;
  },

  async upsertOTExtraCosts(records) {
    // We can upsert by cpt_codes if we set it as unique, or just insert
    // Since Supabase `upsert` requires a primary key or unique constraint,
    // and we might not have a unique constraint on cpt_codes in their schema,
    // we will use standard insert, or upsert if they added the unique constraint.
    // For now we will do a basic insert for new records, or delete existing and insert.
    
    // As a robust approach:
    for (const record of records) {
       // Check if exists
       const { data: existing } = await supabase
         .from('ot_extra_cost')
         .select('id')
         .eq('cpt_codes', record.cpt_codes)
         .limit(1);
         
       if (existing && existing.length > 0) {
         // Update
         const { error: updateError } = await supabase
           .from('ot_extra_cost')
           .update(record)
           .eq('id', existing[0].id);
         if (updateError) throw updateError;
       } else {
         // Insert
         const payload = {
           ...record,
           facility_id: record.facility_id || this.getActiveFacility()?.id || '00000000-0000-0000-0000-000000000002'
         };
         const { error: insertError } = await supabase
           .from('ot_extra_cost')
           .insert([payload]);
         if (insertError) throw insertError;
       }
    }
    return true;
  },

  async updateOTExtraCost(id, updates) {
    const { data, error } = await supabase
      .from('ot_extra_cost')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteOTExtraCost(id) {
    const { data, error } = await supabase
      .from('ot_extra_cost')
      .delete()
      .eq('id', id)
      .select();
      
    if (error) throw error;
    
    // Supabase returns an empty array if no rows were deleted (e.g., due to RLS policies)
    if (!data || data.length === 0) {
      throw new Error("Record could not be deleted. Please check Supabase Row Level Security (RLS) policies for the 'ot_extra_cost' table to ensure DELETE operations are allowed.");
    }
    
    return true;
  },

  // ==================== USERS & AUTHENTICATION ====================
  async getUsers() {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, email, role, avatar, created_at')
        .order('id', { ascending: true });
      if (error) {
        if (error.code === 'PGRST205' || error.code === '42P01') {
          return [{ id: 1, name: 'Admin Director', email: 'admin@asc.com', role: 'admin' }];
        }
        throw error;
      }
      return data || [];
    } catch {
      return [{ id: 1, name: 'Admin Director', email: 'admin@asc.com', role: 'admin' }];
    }
  },

  // Multi-Tenancy Facility Management
  async getFacilities() {
    try {
      const { data, error } = await supabase
        .from('facilities')
        .select('*, organizations(id, name)')
        .order('name', { ascending: true });

      if (!error && data && data.length > 0) {
        return data.map(f => ({
          id: f.id,
          name: f.name,
          organization_id: f.organization_id,
          organization_name: f.organizations?.name || 'Naples Health Network',
          address: `${f.address || ''}, ${f.city || ''}, ${f.state || ''} ${f.zip || ''}`.trim(),
          timezone: f.timezone || 'America/New_York',
          apply_medicare_mppr: Boolean(f.apply_medicare_mppr)
        }));
      }
    } catch (e) {
      console.warn('Failed to fetch facilities from DB, using defaults:', e);
    }
    return DEFAULT_FACILITIES;
  },

  getActiveFacility() {
    try {
      const saved = localStorage.getItem('asc_active_facility');
      if (saved) return JSON.parse(saved);
    } catch {
      // Fallback
    }
    return DEFAULT_FACILITIES[0];
  },

  setActiveFacility(facility) {
    try {
      localStorage.setItem('asc_active_facility', JSON.stringify(facility));
    } catch (e) {
      console.warn('Could not save active facility:', e);
    }
  },

  async login({ email, password, role = 'auto' }) {
    const trimmedEmail = (email || '').trim().toLowerCase();
    const trimmedPassword = (password || '').trim();

    if (!trimmedEmail) throw new Error('Please enter your email address.');
    if (!trimmedPassword) throw new Error('Please enter your password.');

    // 1. ATTEMPT NATIVE SUPABASE GOTRUE AUTHENTICATION
    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password: trimmedPassword
      });

      if (!authError && authData?.user) {
        const authUser = authData.user;
        let detectedRole = authUser.user_metadata?.role || (role !== 'auto' ? role : 'admin');
        let userFacilities = [];

        // Query facility memberships for this GoTrue user
        try {
          const { data: memberships } = await supabase
            .from('facility_memberships')
            .select('role, facility_id, facilities(*, organizations(name))')
            .eq('user_id', authUser.id)
            .eq('is_active', true);

          if (memberships && memberships.length > 0) {
            detectedRole = memberships[0].role;
            userFacilities = memberships.map(m => ({
              id: m.facility_id,
              name: m.facilities?.name || 'Surgical Facility',
              organization_id: m.facilities?.organization_id,
              organization_name: m.facilities?.organizations?.name || 'Healthcare Network',
              role: m.role
            }));
            if (userFacilities[0]) {
              this.setActiveFacility(userFacilities[0]);
            }
          }
        } catch (memErr) {
          console.warn('Could not load user memberships:', memErr);
        }

        const userObj = {
          id: authUser.id,
          name: authUser.user_metadata?.name || authUser.email?.split('@')[0] || 'Authenticated User',
          email: authUser.email,
          role: detectedRole,
          avatar: authUser.user_metadata?.avatar || null,
          facilities: userFacilities.length > 0 ? userFacilities : DEFAULT_FACILITIES
        };

        this.saveSession(userObj);
        return { user: userObj, role: detectedRole, facilities: userObj.facilities };
      }
      if (authError && !ENV.enableDemoAuth) {
        throw new Error(authError.message || authError.error_description || 'Invalid email or password.');
      }
    } catch (gotrueErr) {
      if (!ENV.enableDemoAuth) {
        const msg = gotrueErr?.message || gotrueErr?.error_description || (typeof gotrueErr === 'string' ? gotrueErr : 'Invalid email or password.');
        throw new Error(msg);
      }
      console.warn('GoTrue signInWithPassword fallback:', gotrueErr?.message);
    }

    // 2. FALLBACK AUTHENTICATION (Gated: strictly disabled in production builds)
    if (ENV.enableDemoAuth) {
      // 2a. Fallback Admin Authentication (For unmigrated accounts / development seed)
      if (role === 'admin' || role === 'auto') {
        try {
          const { data, error } = await supabase
            .from('users')
            .select('*')
            .ilike('email', trimmedEmail)
            .limit(1);

          if (!error && data && data.length > 0) {
            const adminUser = data[0];
            if (adminUser.password === trimmedPassword || trimmedPassword === 'admin123') {
              const userObj = {
                id: adminUser.id,
                name: adminUser.name || 'Admin Director',
                email: adminUser.email,
                role: 'admin',
                avatar: adminUser.avatar || null,
                facilities: DEFAULT_FACILITIES
              };
              this.saveSession(userObj);
              return { user: userObj, role: 'admin', facilities: DEFAULT_FACILITIES };
            } else {
              if (role === 'admin') throw new Error('Invalid administrator password.');
            }
          } else if (error && (error.code === 'PGRST205' || error.code === '42P01')) {
            if (trimmedEmail === 'admin@asc.com' && (trimmedPassword === 'admin123' || trimmedPassword === 'admin')) {
              const userObj = {
                id: 1,
                name: 'Admin Director',
                email: 'admin@asc.com',
                role: 'admin',
                avatar: null,
                facilities: DEFAULT_FACILITIES
              };
              this.saveSession(userObj);
              return { user: userObj, role: 'admin', facilities: DEFAULT_FACILITIES };
            }
            if (role === 'admin') throw new Error('Invalid administrator email or password.');
          } else if (role === 'admin') {
            if (trimmedEmail === 'admin@asc.com' && (trimmedPassword === 'admin123' || trimmedPassword === 'admin')) {
              const userObj = {
                id: 1,
                name: 'Admin Director',
                email: 'admin@asc.com',
                role: 'admin',
                avatar: null,
                facilities: DEFAULT_FACILITIES
              };
              this.saveSession(userObj);
              return { user: userObj, role: 'admin', facilities: DEFAULT_FACILITIES };
            }
            throw new Error('No administrator account found with this email.');
          }
        } catch (err) {
          if (role === 'admin') throw err;
        }
      }

      // 2b. Fallback Surgeon Authentication
      if (role === 'surgeon' || role === 'auto') {
        try {
          const { data: surgeons, error: surgError } = await supabase
            .from('surgeons')
            .select('*')
            .ilike('email', trimmedEmail)
            .limit(1);

          if (surgError) throw surgError;

          if (surgeons && surgeons.length > 0) {
            const surgeon = surgeons[0];
            const hasPasswordSet = Boolean(surgeon.password && surgeon.password.trim());
            const passwordMatches = hasPasswordSet
              ? (surgeon.password === trimmedPassword || trimmedPassword === 'surgeon123')
              : true;

            if (!passwordMatches) {
              throw new Error('Invalid password for this surgeon profile.');
            }

            const fullName = `Dr. ${(surgeon.lastname || '').trim()} ${(surgeon.firstname || '').trim()}`.trim();
            const userObj = {
              id: surgeon.id,
              name: fullName || 'Surgeon',
              firstname: surgeon.firstname,
              lastname: surgeon.lastname,
              email: surgeon.email,
              specialty: surgeon.specialty || 'Surgery',
              license_number: surgeon.license_number,
              phone: surgeon.phone,
              role: 'surgeon',
              avatar: null,
              surgeonData: surgeon,
              facilities: DEFAULT_FACILITIES
            };

            this.saveSession(userObj);
            return { user: userObj, role: 'surgeon', facilities: DEFAULT_FACILITIES };
          } else if (role === 'surgeon') {
            throw new Error('No surgeon found with this email address.');
          }
        } catch (err) {
          if (role === 'surgeon') throw err;
        }
      }
    }

    throw new Error('Invalid credentials or account role.');
  },

  saveSession(user) {
    try {
      localStorage.setItem('asc_auth_user', JSON.stringify(user));
    } catch (e) {
      console.warn('Could not save session to localStorage:', e);
    }
  },

  getSession() {
    try {
      const data = localStorage.getItem('asc_auth_user');
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  },

  async updatePassword(newPassword) {
    try {
      const { data, error } = await supabase.auth.updateUser({
        password: newPassword
      });
      if (error) throw error;
      return data;
    } catch (err) {
      console.warn('Native updatePassword error:', err);
      throw err;
    }
  },

  async updateUser(id, updates) {
    try {
      const payload = { ...updates, updated_at: new Date().toISOString() };
      const { data, error } = await supabase
        .from('users')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST205' || error.code === '42P01') {
          return { id, ...updates };
        }
        throw error;
      }
      return data || { id, ...updates };
    } catch (err) {
      console.warn('updateUser fallback:', err);
      return { id, ...updates };
    }
  },

  async clearSession() {
    try {
      await supabase.auth.signOut().catch(() => {});
      localStorage.removeItem('asc_auth_user');
      localStorage.removeItem('asc_active_facility');
    } catch (e) {
      console.warn('Could not clear session:', e);
    }
  },

  // ============================================================================
  // PHASE 2: NORMALIZED CLINICAL & AUDIT METHODS
  // ============================================================================

  // Operating Rooms
  async getOperatingRooms(facilityId) {
    try {
      const activeFac = facilityId || this.getActiveFacility()?.id;
      let query = supabase
        .from('operating_rooms')
        .select('*')
        .eq('is_active', true)
        .order('room_number', { ascending: true });

      if (activeFac) {
        query = query.eq('facility_id', activeFac);
      }

      const { data, error } = await query;
      if (!error && data && data.length > 0) return data;
    } catch (err) {
      console.warn('getOperatingRooms fallback:', err);
    }
    const activeFac = facilityId || this.getActiveFacility()?.id;
    return DEFAULT_OPERATING_ROOMS.filter(r => !activeFac || r.facility_id === activeFac);
  },

  async addOperatingRoom(room) {
    const { data, error } = await supabase
      .from('operating_rooms')
      .insert([room])
      .select();
    if (error) throw error;
    return data?.[0] || null;
  },

  async updateOperatingRoom(id, updates) {
    const { data, error } = await supabase
      .from('operating_rooms')
      .update(updates)
      .eq('id', id)
      .select();
    if (error) throw error;
    return data?.[0] || null;
  },

  // Normalized Surgery Procedures (1NF)
  async getSurgeryProcedures(surgeryId) {
    try {
      const { data, error } = await supabase
        .from('surgery_procedures')
        .select('*, cpt_codes(*)')
        .eq('surgery_id', surgeryId)
        .order('sequence_rank', { ascending: true });
      if (!error && data) return data;
    } catch (err) {
      console.warn('getSurgeryProcedures query error:', err);
    }
    return [];
  },

  async addSurgeryProcedure(procedure) {
    const { data, error } = await supabase
      .from('surgery_procedures')
      .insert([procedure])
      .select();
    if (error) throw error;
    return data?.[0] || null;
  },

  async updateSurgeryProcedure(id, updates) {
    const { data, error } = await supabase
      .from('surgery_procedures')
      .update(updates)
      .eq('id', id)
      .select();
    if (error) throw error;
    return data?.[0] || null;
  },

  async deleteSurgeryProcedure(id) {
    const { error } = await supabase
      .from('surgery_procedures')
      .delete()
      .eq('id', id);
    if (error) throw error;
    return true;
  },

  // Payers & Fee Schedules
  async getPayers(facilityId) {
    try {
      const activeFac = facilityId || this.getActiveFacility()?.id;
      let query = supabase
        .from('payers')
        .select('*')
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (activeFac) {
        query = query.eq('facility_id', activeFac);
      }

      const { data, error } = await query;
      if (!error && data && data.length > 0) return data;
    } catch (err) {
      console.warn('getPayers fallback:', err);
    }
    const activeFac = facilityId || this.getActiveFacility()?.id;
    return DEFAULT_PAYERS.filter(p => !activeFac || p.facility_id === activeFac);
  },

  async getPayerFeeSchedules(payerId, facilityId) {
    try {
      let query = supabase
        .from('payer_fee_schedules')
        .select('*, cpt_codes(*)')
        .order('created_at', { ascending: false });

      if (payerId) query = query.eq('payer_id', payerId);
      if (facilityId) query = query.eq('facility_id', facilityId);

      const { data, error } = await query;
      if (!error && data) return data;
    } catch (err) {
      console.warn('getPayerFeeSchedules fallback:', err);
    }
    return [];
  },

  // Audit Logs (Read-only ledger queries & manual events)
  async getAuditLogs(facilityId, limit = 50) {
    try {
      const activeFac = facilityId || this.getActiveFacility()?.id;
      let query = supabase
        .from('audit_logs')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(limit);

      if (activeFac) {
        query = query.eq('facility_id', activeFac);
      }

      const { data, error } = await query;
      if (!error && data) return data;
    } catch (err) {
      console.warn('getAuditLogs fallback:', err);
    }
    return [];
  },

  async logAuditEvent(entry) {
    try {
      const activeFac = entry.facility_id || this.getActiveFacility()?.id;
      const payload = {
        ...entry,
        facility_id: activeFac,
        timestamp: new Date().toISOString()
      };
      const { data, error } = await supabase
        .from('audit_logs')
        .insert([payload])
        .select();
      if (!error && data) return data[0];
    } catch (err) {
      console.warn('logAuditEvent failed:', err);
    }
    return null;
  },

  // Surgery Financial Snapshots (Frozen truth)
  async getSurgeryFinancialSnapshot(surgeryId) {
    try {
      const { data, error } = await supabase
        .from('surgery_financial_snapshots')
        .select('*')
        .eq('surgery_id', surgeryId)
        .maybeSingle();
      if (!error && data) return data;
    } catch (err) {
      console.warn('getSurgeryFinancialSnapshot fallback:', err);
    }
    return null;
  },

  async saveSurgeryFinancialSnapshot(snapshot) {
    const { data, error } = await supabase
      .from('surgery_financial_snapshots')
      .upsert(snapshot, { onConflict: 'surgery_id' })
      .select();
    if (error) throw error;
    return data?.[0] || null;
  }
};

export const DEFAULT_FACILITIES = [
  {
    id: '00000000-0000-0000-0000-000000000002',
    name: 'Naples Surgery Center',
    organization_id: '00000000-0000-0000-0000-000000000001',
    organization_name: 'Naples Health Network',
    address: '123 Medical Blvd, Naples, FL 34102',
    timezone: 'America/New_York',
    apply_medicare_mppr: false
  },
  {
    id: '00000000-0000-0000-0000-000000000003',
    name: 'South Florida Outpatient Pavilion',
    organization_id: '00000000-0000-0000-0000-000000000001',
    organization_name: 'Naples Health Network',
    address: '450 Ocean View Way, Fort Myers, FL 33901',
    timezone: 'America/New_York',
    apply_medicare_mppr: true
  }
];

export const DEFAULT_OPERATING_ROOMS = [
  {
    id: '10000000-0000-0000-0000-000000000001',
    facility_id: '00000000-0000-0000-0000-000000000002',
    name: 'OR 1',
    room_number: 1,
    hourly_cost_rate: 1500.0,
    is_active: true
  },
  {
    id: '10000000-0000-0000-0000-000000000002',
    facility_id: '00000000-0000-0000-0000-000000000002',
    name: 'OR 2',
    room_number: 2,
    hourly_cost_rate: 1500.0,
    is_active: true
  },
  {
    id: '10000000-0000-0000-0000-000000000003',
    facility_id: '00000000-0000-0000-0000-000000000002',
    name: 'OR 3',
    room_number: 3,
    hourly_cost_rate: 1500.0,
    is_active: true
  },
  {
    id: '10000000-0000-0000-0000-000000000004',
    facility_id: '00000000-0000-0000-0000-000000000002',
    name: 'OR 4',
    room_number: 4,
    hourly_cost_rate: 1500.0,
    is_active: true
  },
  {
    id: '10000000-0000-0000-0000-000000000005',
    facility_id: '00000000-0000-0000-0000-000000000003',
    name: 'Suite A',
    room_number: 1,
    hourly_cost_rate: 1650.0,
    is_active: true
  },
  {
    id: '10000000-0000-0000-0000-000000000006',
    facility_id: '00000000-0000-0000-0000-000000000003',
    name: 'Suite B',
    room_number: 2,
    hourly_cost_rate: 1650.0,
    is_active: true
  }
];

export const DEFAULT_PAYERS = [
  {
    id: '20000000-0000-0000-0000-000000000001',
    facility_id: '00000000-0000-0000-0000-000000000002',
    name: 'Medicare Florida (First Coast)',
    payer_type: 'Medicare',
    payer_code: 'CMS-FL',
    is_active: true
  },
  {
    id: '20000000-0000-0000-0000-000000000002',
    facility_id: '00000000-0000-0000-0000-000000000002',
    name: 'Florida Blue (BCBS)',
    payer_type: 'Commercial',
    payer_code: 'BCBS-FL',
    is_active: true
  },
  {
    id: '20000000-0000-0000-0000-000000000003',
    facility_id: '00000000-0000-0000-0000-000000000002',
    name: 'Aetna Healthcare',
    payer_type: 'Commercial',
    payer_code: 'AETNA',
    is_active: true
  },
  {
    id: '20000000-0000-0000-0000-000000000004',
    facility_id: '00000000-0000-0000-0000-000000000002',
    name: 'UnitedHealthcare Outpatient',
    payer_type: 'Commercial',
    payer_code: 'UHC-OPT',
    is_active: true
  },
  {
    id: '20000000-0000-0000-0000-000000000005',
    facility_id: '00000000-0000-0000-0000-000000000002',
    name: 'Self-Pay / Non-Insured',
    payer_type: 'Self-Pay',
    payer_code: 'SELFPAY',
    is_active: true
  }
];




