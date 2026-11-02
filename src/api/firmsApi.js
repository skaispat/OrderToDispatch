import { supabase } from './client';

export const FIRM_TYPES = ['Company', 'Distributor'];

export const firmsApi = {
  // Query firms table (id, name, type, created_at)
  async getFirms() {
    const { data, error } = await supabase
      .from('firms')
      .select('*')
      .order('id', { ascending: true });

    if (error) {
      console.error('Error fetching firms:', error);
      throw error;
    }
    return data || [];
  },

  async getFirmById(firmId) {
    if (!firmId) return null;
    const { data, error } = await supabase
      .from('firms')
      .select('*')
      .eq('id', Number(firmId))
      .maybeSingle();

    if (error) {
      console.error('Error fetching firm:', error);
      throw error;
    }
    return data;
  },

  // Insert a firm. type: 'Company' (own firm data) or 'Distributor' (counts as Sarthak TMT data)
  async createFirm({ id, name, type }) {
    const cleanName = String(name || '').trim();
    if (!cleanName) throw new Error('Firm name is required.');
    if (!FIRM_TYPES.includes(type)) throw new Error('Firm type must be Company or Distributor.');

    const row = { name: cleanName, type };
    if (id !== undefined && id !== null && id !== '') {
      const numericId = Number(id);
      if (!Number.isInteger(numericId) || numericId <= 0) throw new Error('Firm ID must be a positive whole number.');
      row.id = numericId;
    }

    const { data, error } = await supabase.from('firms').insert([row]).select().single();

    if (error) {
      console.error('Error creating firm:', error);
      if (error.code === '23505') throw new Error('A firm with this ID already exists.');
      throw error;
    }
    return data;
  },
};
