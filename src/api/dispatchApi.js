import { supabase, fetchAllRows } from './client';
import { distributorApi } from './distributorApi';
import { dealerApi } from './dealerApi';

// Quantities are in MT; keep 3 decimals (kg precision) and ignore float noise
const QTY_EPSILON = 0.0005;
const roundQty = (n) => Math.round((Number(n) || 0) * 1000) / 1000;

const todayISO = () => {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

// Total MT of a project order, computed the same way as the project orders list
const projectOrderQty = (row) => {
  let details = row?.product_details;
  if (typeof details === 'string') {
    try {
      details = JSON.parse(details);
    } catch {
      details = {};
    }
  }
  details = details || {};
  const items = Array.isArray(details.items) ? details.items : [];
  let total = items.reduce((acc, it) => acc + (parseFloat(it.qty) || 0), 0);
  if (total === 0) total = parseFloat(details.totalQty) || parseFloat(details.qty) || 0;
  return roundQty(total);
};

const orderColumn = (type) => {
  if (type === 'retail') return 'retail_order_id';
  if (type === 'project') return 'project_order';
  throw new Error('Unknown order type for dispatch.');
};

export const dispatchApi = {
  async getDispatches(filters = {}) {
    let query = supabase.from('dispatch').select('*');

    if (filters.retailOrderId) query = query.eq('retail_order_id', Number(filters.retailOrderId));
    if (filters.projectOrderId) query = query.eq('project_order', Number(filters.projectOrderId));

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) {
      console.error('Error fetching dispatch:', error);
      throw error;
    }
    return data || [];
  },

  /** Dispatch rows of one order, oldest first. type: 'retail' (orders) | 'project' (project_orders) */
  async getOrderDispatches(type, orderDbId) {
    const { data, error } = await supabase
      .from('dispatch')
      .select('id, created_at, dispatch_date, dispatch_qty, order_qty, pending_qty, submitted_by')
      .eq(orderColumn(type), Number(orderDbId))
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching order dispatches:', error);
      throw error;
    }
    return data || [];
  },

  /**
   * Total dispatched MT per order, for list views:
   * { retail: Map<orders.id, MT>, project: Map<project_orders.id, MT> }
   */
  async getDispatchTotals() {
    const rows = await fetchAllRows(() =>
      supabase.from('dispatch').select('retail_order_id, project_order, dispatch_qty', { count: 'exact' }).order('id')
    );
    const retail = new Map();
    const project = new Map();
    for (const r of rows) {
      const qty = Number(r.dispatch_qty) || 0;
      if (r.retail_order_id) retail.set(Number(r.retail_order_id), roundQty((retail.get(Number(r.retail_order_id)) || 0) + qty));
      if (r.project_order) project.set(Number(r.project_order), roundQty((project.get(Number(r.project_order)) || 0) + qty));
    }
    return { retail, project };
  },

  /** Order quantity straight from the database (never trust the value shown on screen) */
  async getOrderQty(type, orderDbId) {
    if (type === 'retail') {
      const { data, error } = await supabase.from('orders').select('id, order_qty').eq('id', Number(orderDbId)).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Order not found. It may have been deleted.');
      return roundQty(parseFloat(data.order_qty) || 0);
    }
    const { data, error } = await supabase
      .from('project_orders')
      .select('id, product_details')
      .eq('id', Number(orderDbId))
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Project order not found. It may have been deleted.');
    return projectOrderQty(data);
  },

  /**
   * Saves one dispatch for a retail order (orders) or project order (project_orders).
   * - Order qty and already-dispatched qty are re-read from the database before saving
   * - Dispatch qty must be > 0 and not more than the remaining qty
   * - pending_qty = remaining after this dispatch
   * - After saving, totals are checked again; if two dispatches were saved at the same
   *   moment and the order became over-dispatched, this dispatch is removed again
   */
  async createDispatch({ type, orderDbId, dispatchQty, dispatchDate, submittedBy }) {
    const column = orderColumn(type);
    const id = Number(orderDbId);
    if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid order reference.');

    const qty = roundQty(dispatchQty);
    if (!Number.isFinite(Number(dispatchQty)) || qty <= 0) throw new Error('Dispatch quantity must be greater than 0.');

    const date = String(dispatchDate || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(date).getTime())) {
      throw new Error('Please enter a valid dispatch date.');
    }
    if (date > todayISO()) throw new Error('Dispatch date cannot be in the future.');

    const who = String(submittedBy || '').trim();
    if (!who) throw new Error('Could not identify the logged in user. Please log in again.');

    const orderQty = await this.getOrderQty(type, id);
    if (orderQty <= 0) throw new Error('This order has no quantity to dispatch.');

    const previous = await this.getOrderDispatches(type, id);
    const alreadyDispatched = roundQty(previous.reduce((acc, r) => acc + (Number(r.dispatch_qty) || 0), 0));
    const remaining = roundQty(orderQty - alreadyDispatched);

    if (remaining <= QTY_EPSILON) throw new Error('This order is already fully dispatched.');
    if (qty - remaining > QTY_EPSILON) {
      throw new Error(`Dispatch quantity (${qty} MT) is more than the pending quantity (${remaining} MT).`);
    }

    const row = {
      [column]: id,
      order_qty: orderQty,
      dispatch_qty: qty,
      dispatch_date: date,
      pending_qty: Math.max(0, roundQty(remaining - qty)),
      submitted_by: who,
    };

    const { data, error } = await supabase.from('dispatch').insert([row]).select().single();
    if (error) {
      console.error('Error creating dispatch:', error);
      if (error.code === '23503') throw new Error('The order no longer exists. Please refresh the page.');
      throw error;
    }

    // Guard against two users dispatching the same order at the same moment
    try {
      const after = await this.getOrderDispatches(type, id);
      const total = roundQty(after.reduce((acc, r) => acc + (Number(r.dispatch_qty) || 0), 0));
      if (total - orderQty > QTY_EPSILON) {
        await supabase.from('dispatch').delete().eq('id', data.id);
        throw new Error('Another dispatch was saved for this order at the same time. Please refresh and try again.');
      }
    } catch (checkErr) {
      if (checkErr?.message?.startsWith('Another dispatch')) throw checkErr;
      console.warn('[dispatchApi] Post-save check failed:', checkErr);
    }

    return data;
  },

  /**
   * Dispatched orders list (Dispatched Orders page): every dispatch row joined with its full order
   * from `orders` (retail_order_id) or `project_orders` (project_order).
   * Each row: dispatch fields + { type, order_id, order_db_id, order_date, brandId, brand_name, party,
   *   po_number, products, items, order_value, rate, specification, distributor/dealer/sales person names }
   */
  async getDispatchedOrders() {
    const [rows, distributors, dealers, salesUsers] = await Promise.all([
      fetchAllRows(() =>
        supabase
          .from('dispatch')
          .select(
            '*, retail:orders!dispatch_retail_order_id_fkey(*), project:project_orders!dispatch_project_order_fkey(*)',
            { count: 'exact' }
          )
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
      ),
      distributorApi.getDistributors().catch(() => []),
      dealerApi.getDealers().catch(() => []),
      // Names only (never load passwords or other user columns)
      supabase
        .from('users')
        .select('emp_id, full_name, username')
        .then(({ data }) => data || [], () => []),
    ]);

    const distributorNames = new Map((distributors || []).map((d) => [String(d.id), d.name]));
    const dealerNames = new Map((dealers || []).map((d) => [String(d.id), d.name || d.dealer_name]));
    const userNames = new Map((salesUsers || []).map((u) => [String(u.emp_id), u.full_name || u.username]));

    return (rows || []).map((r) => {
      const isProject = Boolean(r.project_order);
      const o = (isProject ? r.project : r.retail) || {};

      const base = {
        id: r.id,
        created_at: r.created_at,
        dispatch_date: r.dispatch_date,
        dispatch_qty: roundQty(r.dispatch_qty),
        order_qty: roundQty(r.order_qty),
        pending_qty: roundQty(r.pending_qty),
        submitted_by: r.submitted_by || '',
        type: isProject ? 'project' : 'retail',
        order_db_id: isProject ? r.project_order : r.retail_order_id,
        order_id: o.order_id || (isProject ? `PRJ-${r.project_order}` : `ORD-${r.retail_order_id}`),
        order_date: String(o.created_at || '').slice(0, 10),
        po_number: o.po_number || '',
      };

      if (isProject) {
        let details = o.product_details;
        if (typeof details === 'string') {
          try {
            details = JSON.parse(details);
          } catch {
            details = {};
          }
        }
        details = details || {};
        const items = Array.isArray(details.items) ? details.items : [];
        const orderId = String(o.order_id || '');
        const firmId = Number(o.firm_id);
        let brandId = 'other';
        if (/sarthak/i.test(o.brand_type || '') || orderId.includes('/SAR/')) brandId = 'sarthak';
        else if (firmId === 2 || /jsw/i.test(orderId)) brandId = 'jsw';
        else if ([3, 6].includes(firmId) || /essar/i.test(orderId)) brandId = 'essar';

        const value =
          parseFloat(details.totalValue) ||
          items.reduce((acc, it) => acc + (parseFloat(it.total) || (parseFloat(it.qty) || 0) * (parseFloat(it.rate) || 0)), 0);

        return {
          ...base,
          brandId,
          brand_name: details.subtype || details.brand || o.brand_type || '',
          party: o.party_name || '',
          items: items.map((it) => ({
            product: it.productName || 'TMT Rebar',
            size: it.size || '',
            qty: roundQty(it.qty),
            rate: parseFloat(it.rate) || 0,
          })),
          products: items.map((it) => `${it.productName || 'TMT'}${it.size ? ` (${it.size})` : ''}`).join(', '),
          specification: details.specification || details.remarks || '',
          order_value: Math.round(value * 100) / 100,
          firm_id: o.firm_id ?? null,
          sales_person_id: null,
          distributor_id: null,
        };
      }

      const brand = String(o.brand_name || '').toLowerCase();
      const qty = parseFloat(o.order_qty) || 0;
      const rate = parseFloat(o.order_value) || 0;
      const total =
        o.total_order_value !== null && o.total_order_value !== undefined ? parseFloat(o.total_order_value) || 0 : qty * rate;

      return {
        ...base,
        brandId: brand.includes('jsw') ? 'jsw' : brand.includes('essar') ? 'essar' : 'sarthak',
        brand_name: o.brand_name || 'Sarthak TMT',
        party:
          distributorNames.get(String(o.distributor_id)) || (o.distributor_id ? `Distributor #${o.distributor_id}` : ''),
        dealer: o.dealer_id ? dealerNames.get(String(o.dealer_id)) || `Dealer #${o.dealer_id}` : 'Self',
        sales_person: o.sales_person_id ? userNames.get(String(o.sales_person_id)) || `Emp #${o.sales_person_id}` : '',
        products: o.product_description || '',
        items: [],
        specification: '',
        rate,
        order_value: Math.round(total * 100) / 100,
        firm_id: o.firm_id ?? null,
        sales_person_id: o.sales_person_id,
        distributor_id: o.distributor_id,
      };
    });
  },
};
export { roundQty as roundDispatchQty, todayISO as todayDispatchDate };

/**
 * Adds dispatched_qty / pending_qty and a dispatch-based status to orders:
 * 'pending' (nothing dispatched), 'partial' (some dispatched), 'delivered' (fully dispatched).
 * type: 'retail' (uses order_qty) | 'project' (uses total_qty). totals: result of getDispatchTotals().
 */
export function withDispatchStatus(orders, totals, type) {
  const map = type === 'project' ? totals?.project : totals?.retail;
  return (orders || []).map((o) => {
    const orderQty = roundQty(type === 'project' ? o.total_qty : o.order_qty);
    const dispatched = roundQty(map?.get(Number(o.db_id)) || 0);
    const pending = Math.max(0, roundQty(orderQty - dispatched));
    let status = o.status || 'pending';
    if (dispatched > QTY_EPSILON) status = pending <= QTY_EPSILON ? 'delivered' : 'partial';
    return { ...o, dispatched_qty: dispatched, pending_qty: pending, pendingMT: pending, deliveredMT: dispatched, status };
  });
}

/**
 * Formats a dispatch created_at in IST, e.g. "02 Nov 2026, 12:17 PM".
 * Works for both column types: timestamptz values (with "+00:00"/"Z") are converted to IST,
 * IST wall-clock values without an offset (timestamp column) are shown as they are.
 */
export function formatIST(value) {
  if (!value) return '';
  const str = String(value);
  const hasOffset = /([zZ]|[+-]\d{2}:?\d{2})$/.test(str);
  if (!hasOffset) {
    const m = str.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
    if (!m) return str;
    const [, y, mo, d, h, mi] = m;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const hour = Number(h);
    const h12 = hour % 12 || 12;
    return `${d} ${months[Number(mo) - 1]} ${y}, ${String(h12).padStart(2, '0')}:${mi} ${hour < 12 ? 'AM' : 'PM'}`;
  }
  const date = new Date(str);
  if (Number.isNaN(date.getTime())) return str;
  return date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}
