import { supabase, fetchAllRows } from './client';

export const attendanceApi = {
  /**
   * Fetch attendance records with optional filtering
   */
  async getAttendance(filters = {}) {
    const buildQuery = () => {
      let query = supabase.from('attendance').select('*', { count: 'exact' });

      if (filters.salesPersonName && filters.salesPersonName !== 'all') {
        query = query.ilike('sales_person_name', `%${filters.salesPersonName.trim()}%`);
      }

      if (filters.status && filters.status !== 'all') {
        query = query.eq('status', filters.status.toUpperCase());
      }

      if (filters.date) {
        // filters.date is formatted as YYYY-MM-DD
        query = query
          .gte('date_and_time', `${filters.date} 00:00:00`)
          .lte('date_and_time', `${filters.date} 23:59:59`);
      } else {
        // Date range (YYYY-MM-DD, inclusive)
        if (filters.dateFrom) query = query.gte('date_and_time', `${filters.dateFrom} 00:00:00`);
        if (filters.dateTo) query = query.lte('date_and_time', `${filters.dateTo} 23:59:59`);
      }

      return query.order('id', { ascending: false });
    };

    if (filters.limit) {
      const { data, error } = await buildQuery().limit(filters.limit);
      if (error) {
        console.error('[attendanceApi] getAttendance error:', error.message);
        throw error;
      }
      return data || [];
    }

    try {
      const data = await fetchAllRows(buildQuery);
      return data || [];
    } catch (error) {
      console.error('[attendanceApi] getAttendance error:', error.message);
      throw error;
    }
  },

  /**
   * Get the current attendance status for a sales person (to determine if punched IN or OUT)
   */
  async getTodayStatus(salesPersonName) {
    if (!salesPersonName) return { lastStatus: null, lastRecord: null, isPunchedIn: false };

    const { data, error } = await supabase
      .from('attendance')
      .select('*')
      .ilike('sales_person_name', `%${salesPersonName.trim()}%`)
      .order('id', { ascending: false })
      .limit(1);

    if (error) {
      console.warn('[attendanceApi] getTodayStatus error:', error.message);
      return { lastStatus: null, lastRecord: null, isPunchedIn: false };
    }

    const last = data?.[0] || null;
    if (!last) return { lastStatus: null, lastRecord: null, isPunchedIn: false };

    // Check if the record belongs to today (IST)
    const nowIst = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const recordDateStr = (last.date_and_time || last.timestamp || '').slice(0, 10);
    const isToday = recordDateStr === nowIst;

    const isPunchedIn = isToday && String(last.status || '').toUpperCase() === 'IN';

    return {
      lastStatus: last.status,
      lastRecord: last,
      isToday,
      isPunchedIn,
    };
  },

  /**
   * Mark IN / OUT attendance record
   */
  async markAttendance(payload) {
    const lat = payload.latitude ? String(payload.latitude).trim() : null;
    const lng = payload.longitude ? String(payload.longitude).trim() : null;

    const mapLink = lat && lng
      ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
      : null;

    const dbPayload = {
      status: String(payload.status || 'IN').toUpperCase(),
      sales_person_name: payload.sales_person_name ? String(payload.sales_person_name).trim() : 'Sales Person',
      latitude: lat,
      longitude: lng,
      map_link: mapLink,
      address: payload.address ? String(payload.address).trim() : null,
      reason: payload.reason ? String(payload.reason).trim() : null,
    };

    const { data, error } = await supabase
      .from('attendance')
      .insert([dbPayload])
      .select();

    if (error) {
      console.error('[attendanceApi] markAttendance error:', error.message);
      // Give clean, user-friendly message if triggered by prevent_duplicate_in_status
      if (error.message?.includes('duplicate') || error.message?.includes('prevent_duplicate')) {
        throw new Error('Attendance already marked IN today. Please punch OUT before punching IN again.');
      }
      throw error;
    }

    return data?.[0];
  },

  /**
   * Fetch distinct sales person names for filtering
   */
  async getSalesPersonsList() {
    try {
      const data = await fetchAllRows(() =>
        supabase.from('attendance').select('sales_person_name', { count: 'exact' }).not('sales_person_name', 'is', null)
      );
      const names = [...new Set((data || []).map((d) => d.sales_person_name?.trim()).filter(Boolean))];
      names.sort();
      return names;
    } catch {
      return [];
    }
  },
};
