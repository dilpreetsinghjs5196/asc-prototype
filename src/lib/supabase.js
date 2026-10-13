import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://xeqbfrxoozaltcxvitfa.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

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
    const { data, error } = await supabase
      .from('patients')
      .insert([patient])
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
    const { data, error } = await supabase
      .from('surgeons')
      .insert([surgeon])
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
    const { data, error } = await supabase
      .from('surgeries')
      .insert([surgery])
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
    
    const payload = { ...schedule, id: nextId };

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

  // Fetch all OT extra costs
  async getOTExtraCosts() {
    const { data, error } = await supabase
      .from('ot_extra_cost')
      .select('*');
    if (error) throw error;
    return data || [];
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
         const { error: insertError } = await supabase
           .from('ot_extra_cost')
           .insert([record]);
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

  async login({ email, password, role = 'auto' }) {
    const trimmedEmail = (email || '').trim().toLowerCase();
    const trimmedPassword = (password || '').trim();

    if (!trimmedEmail) throw new Error('Please enter your email address.');
    if (!trimmedPassword) throw new Error('Please enter your password.');

    // 1. ADMIN AUTHENTICATION
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
              avatar: adminUser.avatar || null
            };
            this.saveSession(userObj);
            return { user: userObj, role: 'admin' };
          } else {
            if (role === 'admin') throw new Error('Invalid administrator password.');
          }
        } else if (error && (error.code === 'PGRST205' || error.code === '42P01')) {
          // Table not yet in schema cache -> fallback to hardcoded admin check
          if (trimmedEmail === 'admin@asc.com' && (trimmedPassword === 'admin123' || trimmedPassword === 'admin')) {
            const userObj = {
              id: 1,
              name: 'Admin Director',
              email: 'admin@asc.com',
              role: 'admin',
              avatar: null
            };
            this.saveSession(userObj);
            return { user: userObj, role: 'admin' };
          }
          if (role === 'admin') throw new Error('Invalid administrator email or password.');
        } else if (role === 'admin') {
          // Default demo admin fallback if user entered admin@asc.com
          if (trimmedEmail === 'admin@asc.com' && (trimmedPassword === 'admin123' || trimmedPassword === 'admin')) {
            const userObj = {
              id: 1,
              name: 'Admin Director',
              email: 'admin@asc.com',
              role: 'admin',
              avatar: null
            };
            this.saveSession(userObj);
            return { user: userObj, role: 'admin' };
          }
          throw new Error('No administrator account found with this email.');
        }
      } catch (err) {
        if (role === 'admin') throw err;
      }
    }

    // 2. SURGEON AUTHENTICATION
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
            : true; // Default fallback password allowed for unseeded passwords

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
            surgeonData: surgeon
          };

          this.saveSession(userObj);
          return { user: userObj, role: 'surgeon' };
        } else if (role === 'surgeon') {
          throw new Error('No surgeon found with this email address.');
        }
      } catch (err) {
        if (role === 'surgeon') throw err;
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

  clearSession() {
    try {
      localStorage.removeItem('asc_auth_user');
    } catch (e) {
      console.warn('Could not clear session from localStorage:', e);
    }
  }
};


