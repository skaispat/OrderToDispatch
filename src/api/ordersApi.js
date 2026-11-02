import { supabase, fetchAllRows } from './client';
import { distributorApi } from './distributorApi';
import { dealerApi } from './dealerApi';
import { usersApi } from './usersApi';

export const ordersApi = {
  // Query orders table directly from Supabase database
  async getOrders(filters = {}) {
    const buildQuery = () => {
      let query = supabase.from('orders').select('*', { count: 'exact' });

      if (filters.brandId && filters.brandId !== 'all') {
        if (!filters.salesPersonId && !filters.distributorId && !filters.distributorIds) {
          query = query.ilike('brand_name', `%${filters.brandId}%`);
        }
      }
      if (filters.distributorIds && Array.isArray(filters.distributorIds) && filters.distributorIds.length > 0) {
        const orClauses = filters.distributorIds
          .map((id) => `distributor_id.eq.${id},firm_id.eq.${id}`)
          .join(',');
        query = query.or(orClauses);
      } else if (filters.distributorId) {
        const dId = parseInt(filters.distributorId, 10);
        if (!isNaN(dId)) {
          query = query.or(`distributor_id.eq.${dId},firm_id.eq.${dId}`);
        } else {
          query = query.eq('distributor_id', filters.distributorId);
        }
      }
      if (filters.dealerId) {
        query = query.eq('dealer_id', filters.dealerId);
      }
      if (filters.salesPersonId) {
        query = query.eq('sales_person_id', filters.salesPersonId);
      }

      return query.order('id', { ascending: false });
    };

    let dbOrders = [];
    try {
      dbOrders = await fetchAllRows(buildQuery);
    } catch (e) {
      console.warn('[ordersApi] Orders query error:', e);
    }

    // Load distributors, dealers, and users for foreign key lookups
    let distMap = {};
    let dealerMap = {};
    let userMap = {};
    try {
      const [allDists, allDealers, allUsers] = await Promise.all([
        distributorApi.getDistributors().catch(() => []),
        dealerApi.getDealers().catch(() => []),
        usersApi.getUsers().catch(() => []),
      ]);
      (allDists || []).forEach((d) => {
        distMap[d.id] = d;
      });
      (allDealers || []).forEach((d) => {
        dealerMap[d.id] = d;
      });
      (allUsers || []).forEach((u) => {
        userMap[u.emp_id] = u;
      });
    } catch (err) {
      console.warn('[ordersApi] Lookup fetch error:', err);
    }

    let mapped = dbOrders.map((o) => {
      const brandStr = (o.brand_name || '').toLowerCase();
      const brandId = brandStr.includes('jsw')
        ? 'jsw'
        : brandStr.includes('essar')
        ? 'essar'
        : 'sarthak';

      const orderQty = parseFloat(o.order_qty || 0);
      const price = parseFloat(o.order_value || 0);
      const totalOrderValue = parseFloat(
        o.total_order_value !== undefined && o.total_order_value !== null
          ? o.total_order_value
          : orderQty * price
      );

      const dist = distMap[o.distributor_id];
      const dealer = dealerMap[o.dealer_id];
      const salesUser = userMap[o.sales_person_id];

      const distributorName =
        dist?.name || (o.distributor_id ? `Distributor #${o.distributor_id}` : '—');
      const dealerName =
        dealer?.name || (o.dealer_id ? `Dealer #${o.dealer_id}` : 'Self');
      const salesPersonName =
        salesUser?.full_name || salesUser?.username || '';

      const formattedOrderId = o.order_id || `ORD-${o.id}`;

      return {
        id: formattedOrderId,
        order_id: formattedOrderId,
        db_id: o.id,
        date: (o.created_at || new Date().toISOString()).slice(0, 10),
        created_at: o.created_at,
        brand_name: o.brand_name || 'Sarthak TMT',
        brandId,
        firm_id: o.firm_id,
        distributor_id: o.distributor_id,
        distributorId: o.distributor_id,
        distributorName,
        dealer_id: o.dealer_id,
        dealerId: o.dealer_id,
        dealerName,
        sales_person_id: o.sales_person_id,
        salesPersonId: o.sales_person_id,
        sales_person_name: salesPersonName,
        salesPersonName: salesPersonName,
        po_number: o.po_number || '',
        product_description: o.product_description || '',
        order_qty: orderQty,
        orderedMT: orderQty,
        order_value: price,
        price,
        total_order_value: totalOrderValue,
        totalValue: totalOrderValue,
        status: o.status || 'pending',
      };
    });

    // In-memory filters
    if (filters.brandId && filters.brandId !== 'all') {
      if (!filters.salesPersonId && !filters.distributorId && !filters.distributorIds) {
        mapped = mapped.filter(
          (o) =>
            o.brandId === filters.brandId ||
            (o.brand_name || '').toLowerCase().includes(filters.brandId.toLowerCase())
        );
      }
    }
    if (filters.salesPersonId) {
      mapped = mapped.filter(
        (o) => String(o.sales_person_id) === String(filters.salesPersonId)
      );
    }
    if (filters.distributorIds && Array.isArray(filters.distributorIds) && filters.distributorIds.length > 0) {
      const idStrs = filters.distributorIds.map((id) => String(id));
      mapped = mapped.filter(
        (o) =>
          idStrs.includes(String(o.distributor_id)) ||
          idStrs.includes(String(o.firm_id)) ||
          idStrs.includes(String(o.distributorId))
      );
    } else if (filters.distributorId) {
      const targetId = String(filters.distributorId);
      mapped = mapped.filter(
        (o) =>
          String(o.distributor_id) === targetId ||
          String(o.firm_id) === targetId ||
          String(o.distributorId) === targetId
      );
    }
    if (filters.dealerId) {
      mapped = mapped.filter(
        (o) => String(o.dealer_id) === String(filters.dealerId)
      );
    }
    if (filters.status && filters.status !== 'all') {
      mapped = mapped.filter(
        (o) => (o.status || 'pending').toLowerCase() === filters.status.toLowerCase()
      );
    }

    return mapped;
  },

  async getOrderById(id) {
    const orders = await this.getOrders();
    return (
      orders.find(
        (o) => String(o.id) === String(id) || String(o.db_id) === String(id)
      ) || null
    );
  },

  getCurrentFinancialYear(dateInput = new Date()) {
    const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
    const validDate = isNaN(d.getTime()) ? new Date() : d;
    const year = validDate.getFullYear();
    const month = validDate.getMonth() + 1; // 1 to 12
    const startYear = month >= 4 ? year : year - 1;
    const endYear = (startYear + 1).toString().slice(-2);
    return `${startYear}-${endYear}`;
  },

  async generateNextOrderId(dateInput = new Date()) {
    const fy = this.getCurrentFinancialYear(dateInput);
    const prefix = `OR/${fy}/SAR/`;

    try {
      const { data, error } = await supabase
        .from('orders')
        .select('order_id, id')
        .order('id', { ascending: false });

      if (error) {
        console.warn('[ordersApi] Error querying order_id list:', error.message);
      }

      let maxSeq = 0;
      if (data && data.length > 0) {
        data.forEach((row) => {
          const val = row.order_id;
          if (!val || typeof val !== 'string') return;
          if (val.startsWith(prefix)) {
            const numPart = val.slice(prefix.length);
            const parsed = parseInt(numPart, 10);
            if (!isNaN(parsed) && parsed > maxSeq) {
              maxSeq = parsed;
            }
          } else {
            const match = val.match(/^OR\/[^/]+\/SAR\/(\d+)$/i);
            if (match) {
              const parsed = parseInt(match[1], 10);
              if (!isNaN(parsed) && parsed > maxSeq) {
                maxSeq = parsed;
              }
            }
          }
        });
      }

      const nextSeq = maxSeq + 1;
      return `${prefix}${nextSeq}`;
    } catch (err) {
      console.error('[ordersApi] Failed to generate next order_id:', err);
      return `${prefix}1`;
    }
  },

  async createOrder(orderPayload) {
    const rawQty = parseFloat(orderPayload.order_qty || 0);
    const rawPrice = parseFloat(orderPayload.order_value || 0);
    const rawTotalValue = parseFloat(
      orderPayload.total_order_value !== undefined && orderPayload.total_order_value !== null
        ? orderPayload.total_order_value
        : rawQty * rawPrice
    );

    const effectiveDate = orderPayload.date || orderPayload.created_at || new Date().toISOString();

    // Generate formatted order_id: OR/{current_finance_year}/SAR/1...
    // 1 increment of last generated order_id
    const generatedOrderId = orderPayload.order_id || (await this.generateNextOrderId(effectiveDate));

    // Database columns strictly matching public.orders table definition:
    const dbPayload = {
      order_id: generatedOrderId,
      distributor_id: orderPayload.distributor_id
        ? parseInt(orderPayload.distributor_id, 10)
        : null,
      dealer_id: orderPayload.dealer_id ? parseInt(orderPayload.dealer_id, 10) : null,
      sales_person_id: orderPayload.sales_person_id
        ? parseInt(orderPayload.sales_person_id, 10)
        : null,
      po_number: orderPayload.po_number || null,
      brand_name: orderPayload.brand_name || 'Sarthak TMT',
      product_description: orderPayload.product_description || null,
      order_qty: rawQty,
      order_value: rawPrice,
      total_order_value: rawTotalValue,
      created_at: orderPayload.date
        ? new Date(orderPayload.date).toISOString()
        : orderPayload.created_at || new Date().toISOString(),
      firm_id: null,
    };

    const { data, error } = await supabase
      .from('orders')
      .insert([dbPayload])
      .select()
      .single();

    if (error) {
      console.error('[ordersApi] Order insert error:', error);
      throw new Error(error.message);
    }

    return data;
  },

  async updateOrderStatus(orderId, newStatus, additionalData = {}) {
    try {
      const strId = String(orderId);
      let query = supabase.from('orders').update({ status: newStatus, ...additionalData });

      if (strId.startsWith('ORD-')) {
        const numId = parseInt(strId.replace('ORD-', ''), 10);
        query = query.eq('id', numId);
      } else if (strId.includes('/')) {
        query = query.eq('order_id', strId);
      } else if (!isNaN(parseInt(strId, 10))) {
        query = query.eq('id', parseInt(strId, 10));
      } else {
        query = query.eq('order_id', strId);
      }

      const { error } = await query;
      if (error) {
        console.warn('[ordersApi] Update status error:', error);
        throw new Error(error.message);
      }
    } catch (err) {
      console.warn('[ordersApi] Update status error:', err);
      throw err;
    }
    return { success: true };
  },

  async getOrderStats(filters = 'all') {
    const filterObj =
      typeof filters === 'string' ? { brandId: filters } : filters || {};
    const orders = await this.getOrders(filterObj);

    const totalOrderedMT = orders.reduce(
      (acc, o) => acc + parseFloat(o.order_qty || 0),
      0
    );
    const totalOrderValue = orders.reduce(
      (acc, o) => acc + parseFloat(o.total_order_value || 0),
      0
    );

    const statusCounts = orders.reduce((acc, o) => {
      const s = o.status || 'pending';
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {});

    const totalDeliveredMT = orders
      .filter((o) => (o.status || '').toLowerCase() === 'delivered')
      .reduce((acc, o) => acc + parseFloat(o.order_qty || 0), 0);
    const totalPendingMT = Math.max(0, totalOrderedMT - totalDeliveredMT);

    return {
      totalOrders: orders.length,
      totalOrderedMT: Number(totalOrderedMT.toFixed(2)),
      totalDeliveredMT: Number(totalDeliveredMT.toFixed(2)),
      totalPendingMT: Number(totalPendingMT.toFixed(2)),
      totalOrderValue: Number(totalOrderValue.toFixed(2)),
      statusCounts,
    };
  },
};
