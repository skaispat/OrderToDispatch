import { supabase, fetchAllRows } from './client';

export const trackingHistoryApi = {
  /**
   * Fetch sales visits / tracking history records with optional filters
   */
  async getVisits(filters = {}) {
    const buildQuery = () => {
      let query = supabase.from('tracking_history').select('*', { count: 'exact' });

      if (filters.salesPersonName && filters.salesPersonName !== 'all') {
        query = query.ilike('sales_person_name', `%${filters.salesPersonName.trim()}%`);
      }

      if (filters.stage && filters.stage !== 'all') {
        query = query.ilike('stage', `%${filters.stage.trim()}%`);
      }

      if (filters.status && filters.status !== 'all') {
        query = query.ilike('status', `%${filters.status.trim()}%`);
      }

      if (filters.selectValue && filters.selectValue !== 'all') {
        query = query.ilike('select_value', `%${filters.selectValue.trim()}%`);
      }

      if (filters.search && filters.search.trim()) {
        const term = filters.search.trim();
        query = query.or(
          `deler_distributer_site_name.ilike.%${term}%,area_name.ilike.%${term}%,dealer_code.ilike.%${term}%,what_did_customer_says.ilike.%${term}%`
        );
      }

      if (filters.date) {
        // filters.date is YYYY-MM-DD
        const parts = String(filters.date).split('-').map(Number);
        if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
          const [y, m, d] = parts;
          const start = new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
          const end = new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();
          query = query.gte('created_at', start).lte('created_at', end);
        } else {
          query = query
            .gte('created_at', `${filters.date}T00:00:00.000Z`)
            .lte('created_at', `${filters.date}T23:59:59.999Z`);
        }
      } else if (filters.month && filters.month !== 'all') {
        // filters.month is YYYY-MM
        const parts = String(filters.month).split('-').map(Number);
        if (parts.length === 2 && parts[0] && parts[1]) {
          const [y, m] = parts;
          const start = new Date(y, m - 1, 1, 0, 0, 0, 0).toISOString();
          const end = new Date(y, m, 0, 23, 59, 59, 999).toISOString();
          query = query.gte('created_at', start).lte('created_at', end);
        }
      }

      return query.order('id', { ascending: false });
    };

    if (filters.limit) {
      const { data, error } = await buildQuery().limit(filters.limit);
      if (error) {
        console.error('[trackingHistoryApi] getVisits error:', error.message);
        throw error;
      }
      return data || [];
    }

    try {
      const data = await fetchAllRows(buildQuery);
      return data || [];
    } catch (error) {
      console.error('[trackingHistoryApi] getVisits error:', error.message);
      throw error;
    }
  },

  /**
   * Create a new sales visit report
   */
  async createVisit(payload) {
    const lat = payload.latitude ? String(payload.latitude).trim() : null;
    const lng = payload.longitude ? String(payload.longitude).trim() : null;

    const dbPayload = {
      dealer_code: payload.dealer_code ? String(payload.dealer_code).trim() : null,
      stage: payload.stage ? String(payload.stage).trim() : 'Follow-Up',
      status: payload.status ? String(payload.status).trim() : 'Hot',
      last_date_of_call: payload.last_date_of_call || new Date().toISOString().slice(0, 10),
      what_did_customer_says: payload.what_did_customer_says ? String(payload.what_did_customer_says).trim() : null,
      next_action: payload.next_action ? String(payload.next_action).trim() : null,
      next_date_of_call: payload.next_date_of_call || null,
      order_qty: payload.order_qty ? String(payload.order_qty).trim() : null,
      order_products: payload.order_products ? String(payload.order_products).trim() : null,
      value_of_order: payload.value_of_order ? String(payload.value_of_order).trim() : null,
      sales_person_name: payload.sales_person_name ? String(payload.sales_person_name).trim() : 'Sales Person',
      payment_yes_no: payload.payment_yes_no ? String(payload.payment_yes_no).trim() : null,
      deler_distributer_site_name: payload.deler_distributer_site_name ? String(payload.deler_distributer_site_name).trim() : null,
      area_name: payload.area_name ? String(payload.area_name).trim() : null,
      select_value: payload.select_value ? String(payload.select_value).trim() : 'Dealer',
      longitude: lng,
      latitude: lat,
      sales_person_id: payload.sales_person_id ? parseInt(payload.sales_person_id, 10) || null : null,
    };

    const { data, error } = await supabase
      .from('tracking_history')
      .insert([dbPayload])
      .select();

    if (error) {
      console.error('[trackingHistoryApi] createVisit error:', error.message);
      throw error;
    }

    return data?.[0];
  },

  /**
   * Fetch distinct sales person names who have logged visits
   */
  async getSalesPersonsList() {
    try {
      const data = await fetchAllRows(() =>
        supabase.from('tracking_history').select('sales_person_name', { count: 'exact' }).not('sales_person_name', 'is', null)
      );
      const names = [...new Set((data || []).map((d) => d.sales_person_name?.trim()).filter(Boolean))];
      names.sort();
      return names;
    } catch {
      return [];
    }
  },
};
