import { supabase } from './client';

export const inventoryApi = {
  async getInventory(brandId = 'all') {
    try {
      let query = supabase.from('inventory').select('*');
      if (brandId && brandId !== 'all') {
        query = query.eq('brand_id', brandId);
      }
      const { data, error } = await query;
      if (error) {
        // Return empty array if inventory table is not present
        return [];
      }
      return data || [];
    } catch {
      return [];
    }
  },

  async updateStock(brandId, size, additionalMT) {
    try {
      const { data, error } = await supabase.from('inventory').insert([
        {
          brand_id: brandId,
          size,
          quantity_mt: parseFloat(additionalMT),
          updated_at: new Date().toISOString(),
        },
      ]);
      if (error) throw error;
      return data;
    } catch (err) {
      console.error('Error updating stock in inventory table:', err);
      throw err;
    }
  },
};
