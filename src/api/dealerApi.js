import { supabase, fetchAllRows } from './client';

export const dealerApi = {
  // Query dealer table directly from Supabase database
  async getDealers(filters = {}) {
    const buildQuery = () => {
      let query = supabase.from('dealer').select('*', { count: 'exact' });

      if (filters.distributor_id) {
        query = query.eq('distributor_id', filters.distributor_id);
      }
      if (filters.sales_person_id) {
        query = query.eq('sales_person_id', filters.sales_person_id);
      }
      if (filters.state && filters.state !== 'all') {
        query = query.eq('state', filters.state);
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
      console.warn('[dealerApi] Query dealer table error:', error.message);
      return [];
    }

    return (data || []).map((d) => ({
      ...d,
      id: d.id,
      name: d.name || d.dealer_name || `Dealer #${d.id}`,
      phone: d.phone || '',
      address: d.address || '',
      state: d.state || '',
      area_name: d.area_name || '',
      distributor_id: d.distributor_id,
      sales_person_id: d.sales_person_id,
      created_at: d.created_at,
    }));
  },

  async getDealerById(id) {
    const list = await this.getDealers();
    return list.find((d) => String(d.id) === String(id)) || null;
  },

  async createDealer(payload) {
    const dbPayload = {
      name: payload.name,
      phone: payload.phone || null,
      address: payload.address || null,
      state: payload.state || 'Maharashtra',
      area_name: payload.area_name || null,
      distributor_id: payload.distributor_id ? parseInt(payload.distributor_id, 10) : null,
      sales_person_id: payload.sales_person_id ? parseInt(payload.sales_person_id, 10) : null,
    };

    const { data, error } = await supabase
      .from('dealer')
      .insert([dbPayload])
      .select()
      .single();

    if (error) {
      console.error('[dealerApi] Insert dealer error:', error);
      throw new Error(error.message);
    }

    return data;
  },

  async updateDealer(id, updates) {
    const { data, error } = await supabase
      .from('dealer')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[dealerApi] Update dealer error:', error);
      throw new Error(error.message);
    }
    return data;
  },

  async deleteDealer(id) {
    const { error } = await supabase
      .from('dealer')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[dealerApi] Delete dealer error:', error);
      throw new Error(error.message);
    }
    return true;
  },
};
