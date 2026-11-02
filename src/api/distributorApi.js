import { supabase, fetchAllRows } from './client';

export const distributorApi = {
  // Query distributor table directly from Supabase database
  async getDistributors(filters = {}) {
    const buildQuery = () => {
      let query = supabase.from('distributor').select('*', { count: 'exact' });

      if (filters.state && filters.state !== 'all') {
        query = query.eq('state', filters.state);
      }
      if (filters.sales_person_id) {
        query = query.eq('sales_person_id', filters.sales_person_id);
      }
      if (filters.search) {
        query = query.ilike('name', `%${filters.search}%`);
      }

      return query.order('id', { ascending: true });
    };

    let data = [];
    try {
      data = await fetchAllRows(buildQuery);
    } catch (error) {
      console.warn('[distributorApi] Query distributor table error:', error.message);
      return [];
    }

    return (data || []).map((d) => ({
      ...d,
      id: d.id,
      name: d.name || d.distributor_name || d.firm_name || `Distributor #${d.id}`,
      phone: d.phone || '',
      address: d.address || '',
      state: d.state || '',
      sales_person_id: d.sales_person_id,
      created_at: d.created_at,
    }));
  },

  async getDistributorById(id) {
    const list = await this.getDistributors();
    return list.find((d) => String(d.id) === String(id)) || null;
  },

  async createDistributor(payload) {
    const dbPayload = {
      name: payload.name,
      phone: payload.phone || null,
      address: payload.address || null,
      state: payload.state || 'Maharashtra',
      sales_person_id: payload.sales_person_id
        ? parseInt(payload.sales_person_id, 10)
        : null,
    };

    const { data, error } = await supabase
      .from('distributor')
      .insert([dbPayload])
      .select()
      .single();

    if (error) {
      console.error('[distributorApi] Insert distributor error:', error);
      throw new Error(error.message);
    }

    return data;
  },

  async updateDistributor(id, updates) {
    const { data, error } = await supabase
      .from('distributor')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[distributorApi] Update distributor error:', error);
      throw new Error(error.message);
    }
    return data;
  },

  async deleteDistributor(id) {
    const { error } = await supabase
      .from('distributor')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[distributorApi] Delete distributor error:', error);
      throw new Error(error.message);
    }
    return true;
  },
};
