import { supabase, fetchAllRows } from './client';
import { PAGE_ACCESS_COLUMN, normalizePageAccess } from '../data/pageAccess';
import { parseFirmIds, serializeFirmIds } from '../data/constants';

export const usersApi = {
  // Query users
  async getUsers(filters = {}) {
    const buildQuery = () => {
      let query = supabase.from('users').select('*', { count: 'exact' });

      if (filters.role && filters.role !== 'all') {
        query = query.eq('role', filters.role);
      }
      if (filters.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }
      if (filters.department) {
        query = query.eq('department', filters.department);
      }

      return query.order('emp_id', { ascending: true });
    };

    try {
      const data = await fetchAllRows(buildQuery);
      return data || [];
    } catch (error) {
      console.error('Error fetching users:', error);
      throw error;
    }
  },

  async getUserById(emp_id) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('emp_id', emp_id)
      .single();

    if (error) {
      console.error('Error fetching user by id:', error);
      throw error;
    }
    return data;
  },

  async createUser(userData) {
    const { data, error } = await supabase
      .from('users')
      .insert([userData])
      .select()
      .single();

    if (error) {
      console.error('Error creating user:', error);
      throw error;
    }
    return data;
  },

  async updateUser(emp_id, updates) {
    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('emp_id', emp_id)
      .select()
      .single();

    if (error) {
      console.error('Error updating user:', error);
      throw error;
    }
    return data;
  },

  // Save page access (sales_access) and optionally firm access (firm_id) for one user
  // (Settings > Page Access). Only these columns are written.
  // firmIds: array of firm ids (saved as "2,6"), [] for All Firms, or undefined to leave firm_id unchanged.
  // validFirmIds: firm ids that may be assigned (from the firms table).
  async updateAccess(emp_id, { pageAccess, firmIds, validFirmIds } = {}) {
    const updates = { [PAGE_ACCESS_COLUMN]: normalizePageAccess(pageAccess) };
    if (firmIds !== undefined) {
      const ids = parseFirmIds(firmIds);
      if (Array.isArray(validFirmIds) && ids.some((id) => !validFirmIds.includes(id))) {
        throw new Error(`Invalid firm selection "${firmIds}".`);
      }
      updates.firm_id = serializeFirmIds(ids);
    }

    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('emp_id', emp_id)
      .select(`emp_id, firm_id, ${PAGE_ACCESS_COLUMN}`)
      .maybeSingle();

    if (error) {
      console.error('Error updating access:', error);
      if (error.code === '23503') {
        throw new Error('firm_id still has a foreign key to the firms table. Remove it to allow these firms.');
      }
      if (error.code === '22P02') {
        throw new Error('firm_id is still a number column. Change it to text to save multiple firms.');
      }
      throw error;
    }
    if (!data) {
      throw new Error(`User #${emp_id} was not updated (not found or blocked by database policy).`);
    }
    return {
      pageAccess: normalizePageAccess(data[PAGE_ACCESS_COLUMN]),
      firmIds: parseFirmIds(data.firm_id),
    };
  },

  async deleteUser(emp_id) {
    const { error } = await supabase
      .from('users')
      .delete()
      .eq('emp_id', emp_id);

    if (error) {
      console.error('Error deleting user:', error);
      throw error;
    }
    return true;
  },
};
