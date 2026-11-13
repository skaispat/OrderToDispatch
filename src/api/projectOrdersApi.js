import { supabase, fetchAllRows } from './client';
import { FIRMS_LIST } from '../data/constants';

// Order id tag of Sarthak project orders: OR/<FY>/SAR-P/<n> (older ones used SAR)
export const SARTHAK_PROJECT_TAG = 'SAR-P';
const LOCAL_STORAGE_KEY = 'skai_local_project_orders';
const FIRMS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache TTL

// In-memory caches to prevent redundant network queries
const firmNameCache = new Map();
let cachedFirmsMap = null;
let lastFirmsFetchTime = 0;

export const projectOrdersApi = {
  /**
   * Calculates the Indian Financial Year string (e.g., "2026-27" for Oct 2026)
   * Safely handles dates, strings, or invalid timestamps.
   */
  getCurrentFinancialYear(dateInput = new Date()) {
    const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
    const validDate = isNaN(d.getTime()) ? new Date() : d;
    const year = validDate.getFullYear();
    const month = validDate.getMonth() + 1; // 1 to 12
    const startYear = month >= 4 ? year : year - 1;
    const endYear = (startYear + 1).toString().slice(-2);
    return `${startYear}-${endYear}`;
  },

  /**
   * Retrieves corporate firm name by firm_id with in-memory caching.
   * Eliminates repeated round-trips to Supabase for static/configured firm data.
   */
  async getFirmName(firmId) {
    if (!firmId) return 'General';
    const numericId = Number(firmId);

    // 1. In-memory cache hit
    if (firmNameCache.has(numericId)) {
      return firmNameCache.get(numericId);
    }

    // 2. Fallback to FIRMS_LIST constant (0ms, zero network)
    const firmFromConfig = FIRMS_LIST.find((f) => Number(f.id) === numericId);
    if (firmFromConfig?.name) {
      const name = firmFromConfig.name.trim();
      firmNameCache.set(numericId, name);
      return name;
    }

    // 3. Query Supabase firms table if not in predefined list
    try {
      const { data, error } = await supabase
        .from('firms')
        .select('name')
        .eq('id', numericId)
        .maybeSingle();

      if (!error && data?.name) {
        const name = data.name.trim();
        firmNameCache.set(numericId, name);
        return name;
      }
    } catch (e) {
      console.warn('[projectOrdersApi] Query firm name error:', e);
    }

    // 4. Fallback to locally stored custom firms
    try {
      const stored = localStorage.getItem('skai_custom_firms');
      if (stored) {
        const custom = JSON.parse(stored);
        const match = custom.find((f) => Number(f.id) === numericId);
        if (match?.name) {
          const name = match.name.trim();
          firmNameCache.set(numericId, name);
          return name;
        }
      }
    } catch (e) { }

    const fallback = `Firm_${numericId}`;
    firmNameCache.set(numericId, fallback);
    return fallback;
  },

  /**
   * Retrieves all firms mapped by ID with in-memory TTL caching.
   */
  async getFirmsMap() {
    const now = Date.now();
    if (cachedFirmsMap && now - lastFirmsFetchTime < FIRMS_CACHE_TTL) {
      return cachedFirmsMap;
    }

    const map = new Map();
    // Seed with static constants first
    FIRMS_LIST.forEach((f) => {
      map.set(Number(f.id), f.name);
      firmNameCache.set(Number(f.id), f.name);
    });

    try {
      const { data: dbFirms, error } = await supabase.from('firms').select('id, name');
      if (!error && Array.isArray(dbFirms)) {
        dbFirms.forEach((f) => {
          map.set(Number(f.id), f.name);
          firmNameCache.set(Number(f.id), f.name);
        });
      }
    } catch (e) {
      // Non-fatal, constant map already seeded
    }

    cachedFirmsMap = map;
    lastFirmsFetchTime = now;
    return map;
  },

  /**
   * Generates order_id in format: OR/{financial_year}/{firm_tag}/{nextSeq}
   * Highly optimized: uses targeted query with index filter and limit to avoid full table scans.
   */
  async generateNextOrderId(dateInput = new Date(), firmId = null, tagOverride = null) {
    const fy = this.getCurrentFinancialYear(dateInput);
    const numericFirmId = Number(firmId);

    // Specifically format firm tag in order_id: JSW for JSW firms, ESSAR for Essar firms, SAR for Sarthak
    let firmTag = tagOverride;
    if (!firmTag) {
      const firmName = await this.getFirmName(firmId);
      firmTag = firmName;
      if (/jsw/i.test(firmName) || numericFirmId === 2) {
        firmTag = 'JSW';
      } else if (/essar/i.test(firmName) || numericFirmId === 3 || numericFirmId === 6) {
        firmTag = 'ESSAR';
      }
    }

    const prefix = `OR/${fy}/${firmTag}/`;
    // Older ids that share the same number series:
    // JSW used 'JSW One'; Sarthak project orders used 'SAR' before 'SAR-P' (numbering continues from them)
    const legacyPrefixes =
      firmTag === 'JSW' ? [`OR/${fy}/JSW One/`] : firmTag === SARTHAK_PROJECT_TAG ? [`OR/${fy}/SAR/`] : [];
    const allPrefixes = [prefix, ...legacyPrefixes];

    const seqOf = (val) => {
      if (!val || typeof val !== 'string') return 0;
      const p = allPrefixes.find((x) => val.startsWith(x));
      if (!p) return 0;
      const numPart = parseInt(val.slice(p.length), 10);
      return Number.isNaN(numPart) ? 0 : numPart;
    };

    try {
      // Only fetch order_id column and limit to latest 30 matching rows
      let query = supabase.from('project_orders').select('order_id');
      // Single prefix uses ilike directly (a firm-name tag may contain characters that break an .or() filter)
      query =
        allPrefixes.length > 1
          ? query.or(allPrefixes.map((x) => `order_id.ilike.${x}%`).join(','))
          : query.ilike('order_id', `${prefix}%`);
      const { data, error } = await query.order('id', { ascending: false }).limit(30);

      let maxSeq = 0;
      if (!error && Array.isArray(data)) {
        for (const row of data) maxSeq = Math.max(maxSeq, seqOf(row?.order_id));
      }

      // Also check local cache for any offline unsynced orders
      try {
        const local = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
        if (Array.isArray(local)) {
          for (const row of local) maxSeq = Math.max(maxSeq, seqOf(row?.order_id));
        }
      } catch (e) { }

      return `${prefix}${maxSeq + 1}`;
    } catch (err) {
      console.warn('[projectOrdersApi] Error generating order_id:', err);
      return `${prefix}1`;
    }
  },

  /**
   * Fetches all project orders, optionally filtered by firm_id.
   * Uses cached firms map and sanitizes all metrics cleanly.
  /**
   * Fetches all project orders, optionally filtered by firm_id or brand string ('jsw', 'essar').
   * Uses cached firms map and sanitizes all metrics cleanly.
   */
  async getProjectOrders(firmIdOrFilter = null) {
    let dbOrders = null;
    try {
      const buildQuery = () => {
        let query = supabase.from('project_orders').select('*', { count: 'exact' });
        if (Array.isArray(firmIdOrFilter)) {
          query = query.in('firm_id', firmIdOrFilter.map(Number));
        } else if (firmIdOrFilter === 'jsw') {
          query = query.or('firm_id.eq.2,order_id.ilike.%JSW%');
        } else if (firmIdOrFilter === 'essar') {
          query = query.or('firm_id.eq.6,firm_id.eq.3,order_id.ilike.%ESSAR%');
        } else if (firmIdOrFilter === 'sarthak') {
          query = query.or('brand_type.ilike.%sarthak%,order_id.ilike.%/SAR/%,order_id.ilike.%/SAR-P/%');
        } else if (
          firmIdOrFilter !== null &&
          firmIdOrFilter !== undefined &&
          firmIdOrFilter !== '' &&
          firmIdOrFilter !== 'all'
        ) {
          const numId = parseInt(firmIdOrFilter, 10);
          if (!isNaN(numId)) {
            query = query.eq('firm_id', numId);
          }
        }
        return query.order('id', { ascending: false });
      };

      const data = await fetchAllRows(buildQuery);
      if (Array.isArray(data)) {
        dbOrders = data;
        // Supabase query succeeded: clear stale local storage so duplicate ghost rows never appear
        try {
          localStorage.removeItem(LOCAL_STORAGE_KEY);
        } catch (e) { }
      }
    } catch (e) {
      console.warn('[projectOrdersApi] Network error fetching project_orders:', e);
    }

    let combined = [];
    if (dbOrders !== null) {
      combined = dbOrders;
    } else {
      // Offline fallback only if Supabase is completely unreachable
      try {
        const local = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
        combined = Array.isArray(firmIdOrFilter)
          ? local.filter((o) => firmIdOrFilter.map(Number).includes(Number(o.firm_id)))
          : firmIdOrFilter === 'jsw'
            ? local.filter((o) => Number(o.firm_id) === 2 || (o.order_id && o.order_id.includes('JSW')))
            : firmIdOrFilter === 'essar'
              ? local.filter((o) => [3, 6].includes(Number(o.firm_id)) || (o.order_id && o.order_id.includes('ESSAR')))
              : firmIdOrFilter && firmIdOrFilter !== 'all' && !isNaN(parseInt(firmIdOrFilter, 10))
                ? local.filter((o) => Number(o.firm_id) === Number(firmIdOrFilter))
                : local;
      } catch (e) { }
    }

    // Lookup firms map from in-memory cache
    const firmsMap = await this.getFirmsMap();

    // Map each order with calculated metrics and firm name
    return combined.map((o) => {
      const numFirmId = o.firm_id !== null && o.firm_id !== undefined ? Number(o.firm_id) : null;
      const firmName =
        (numFirmId ? firmsMap.get(numFirmId) : null) ||
        (numFirmId ? `Firm #${numFirmId}` : 'General Project');

      const isSarthak = /sarthak/i.test(o.brand_type || '') || /\/SAR(-P)?\//.test(o.order_id || '');
      const isJSW =
        !isSarthak && (numFirmId === 2 ||
          /jsw/i.test(o.order_id || '') ||
          /jsw/i.test(firmName) ||
          /jsw/i.test(o.brand_type || ''));
      const isEssar =
        !isSarthak && ([3, 6].includes(numFirmId) ||
          /essar/i.test(o.order_id || '') ||
          /essar/i.test(firmName));

      const brandId = isSarthak ? 'sarthak' : isJSW ? 'jsw' : isEssar ? 'essar' : 'other';
      const brandName = isSarthak ? 'Sarthak TMT' : isJSW ? 'JSW One' : isEssar ? 'Essar Steel' : firmName;

      let productDetails = o.product_details;
      if (typeof productDetails === 'string') {
        try {
          productDetails = JSON.parse(productDetails);
        } catch (e) {
          productDetails = { description: o.product_details };
        }
      }
      productDetails = productDetails || {};

      const items = Array.isArray(productDetails.items) ? productDetails.items : [];
      let totalQty = items.reduce((acc, it) => acc + (parseFloat(it.qty) || 0), 0);
      let totalValue = items.reduce(
        (acc, it) =>
          acc + (parseFloat(it.total) || (parseFloat(it.qty) || 0) * (parseFloat(it.rate) || 0)),
        0
      );

      // Fallback if stored at root of product_details
      if (totalQty === 0 && productDetails.totalQty) {
        totalQty = parseFloat(productDetails.totalQty) || 0;
      } else if (totalQty === 0 && productDetails.qty) {
        totalQty = parseFloat(productDetails.qty) || 0;
      }

      if (totalValue === 0 && productDetails.totalValue) {
        totalValue = parseFloat(productDetails.totalValue) || 0;
      }

      const spec = productDetails.specification || productDetails.remarks || null;

      // delivery_details jsonb { "1": {...}, "2": {...} } -> ordered list of records
      let deliveryDetails = o.delivery_details;
      if (typeof deliveryDetails === 'string') {
        try {
          deliveryDetails = JSON.parse(deliveryDetails);
        } catch (e) {
          deliveryDetails = null;
        }
      }
      // Numbered-key object { "1": {...}, "2": {...} } -> ordered list
      const toOrderedList = (obj) =>
        obj && typeof obj === 'object' && !Array.isArray(obj)
          ? Object.keys(obj)
            .sort((a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0))
            .filter((key) => obj[key] && typeof obj[key] === 'object')
            // key: the numbered key, used to match consignees / lots with dispatch.project_order_details
            .map((key) => ({ ...obj[key], key: String(key) }))
          : [];
      // Each consignee's lots { "1": { lot_no, qty, start_date, end_date } } -> lotsList
      const deliveries = toOrderedList(deliveryDetails).map((d) => ({ ...d, lotsList: toOrderedList(d.lots) }));

      return {
        ...o,
        db_id: o.id,
        order_id: o.order_id || `PRJ-${o.id}`,
        date: (o.created_at || new Date().toISOString()).slice(0, 10),
        party_name: o.party_name || null,
        po_number: o.po_number || '—',
        firm_id: numFirmId,
        firm_name: isSarthak ? 'Sarthak TMT' : firmName,
        brandId,
        brand_name: brandName,
        status: o.status || 'pending',
        specification: spec,
        product_details: productDetails,
        deliveries,
        items,
        total_qty: Number(Number.isFinite(totalQty) ? totalQty.toFixed(2) : '0.00'),
        total_value: Number(Number.isFinite(totalValue) ? totalValue.toFixed(2) : '0.00'),
      };
    });
  },

  /**
   * Creates a book order in Supabase with retry logic for race conditions on order_id.
   * payload.order_tag overrides the firm tag in the order id (e.g. 'SAR-P' -> OR/2026-27/SAR-P/1).
   * payload.brand_type is stored in project_orders.brand_type (e.g. 'Sarthak').
   * Errors are thrown so the user never sees an order as saved when the database rejected it.
   */
  async createProjectOrder(payload) {
    const effectiveDate = payload.created_at || payload.date || new Date().toISOString();
    const orderTag = payload.order_tag || null;
    let orderId =
      payload.order_id || (await this.generateNextOrderId(effectiveDate, payload.firm_id, orderTag));

    const numericFirmId = payload.firm_id ? parseInt(payload.firm_id, 10) : null;

    for (let attempt = 1; attempt <= 3; attempt++) {
      const dbPayload = {
        party_name: payload.party_name ? String(payload.party_name).trim() : null,
        po_number: payload.po_number ? String(payload.po_number).trim() : null,
        product_details: payload.product_details || {},
        firm_id: numericFirmId,
        order_id: orderId,
        created_at: new Date(effectiveDate).toISOString(),
        ...(payload.brand_type ? { brand_type: payload.brand_type } : {}),
        // Billing / shipping records keyed "1", "2", ... (sent only when the form has any)
        ...(payload.delivery_details && typeof payload.delivery_details === 'object'
          ? { delivery_details: payload.delivery_details }
          : {}),
      };

      const { data, error } = await supabase.from('project_orders').insert([dbPayload]).select().single();

      if (!error && data) {
        // Clear offline cache to avoid stale duplicate rows
        try {
          localStorage.removeItem(LOCAL_STORAGE_KEY);
        } catch (e) { }
        if (dbPayload.party_name) {
          await this.savePartyDetails(data.id, dbPayload.party_name);
        }
        return data;
      }

      // Unique constraint collision on order_id (someone saved the same number first): take the next number
      if (error && error.code === '23505' && attempt < 3) {
        console.warn('[projectOrdersApi] Order ID collision detected. Regenerating next sequence...');
        orderId = await this.generateNextOrderId(effectiveDate, payload.firm_id, orderTag);
        continue;
      }

      console.error('[projectOrdersApi] Failed to create project order:', error);
      throw new Error(error?.message || 'Could not save the project order. Please try again.');
    }
    throw new Error('Could not get a free order number. Please try again.');
  },

  /**
   * Distinct party / client names already saved in project_party_details, sorted A–Z
   * (case-insensitive duplicates collapse to the first spelling found).
   */
  async getPartyNames() {
    const rows = await fetchAllRows(() =>
      supabase
        .from('project_party_details')
        .select('party_name', { count: 'exact' })
        .not('party_name', 'is', null)
        .order('id', { ascending: false })
    );
    const byKey = new Map();
    for (const row of rows || []) {
      const name = String(row?.party_name || '').trim();
      if (name && !byKey.has(name.toLowerCase())) byKey.set(name.toLowerCase(), name);
    }
    return [...byKey.values()].sort((a, b) => a.localeCompare(b));
  },

  /**
   * Party names per project order from project_party_details: Map<project_orders.id, "Party A, Party B">
   */
  async getPartyDetailsMap() {
    const rows = await fetchAllRows(() =>
      supabase
        .from('project_party_details')
        .select('order_id, party_name', { count: 'exact' })
        .not('order_id', 'is', null)
        .order('id')
    );
    const byOrder = new Map();
    for (const row of rows || []) {
      const name = String(row?.party_name || '').trim();
      if (!name) continue;
      const key = Number(row.order_id);
      const list = byOrder.get(key) || [];
      if (!list.some((n) => n.toLowerCase() === name.toLowerCase())) list.push(name);
      byOrder.set(key, list);
    }
    return new Map([...byOrder].map(([k, list]) => [k, list.join(', ')]));
  },

  /**
   * Records the party / client of a project order in project_party_details (order_id -> project_orders.id).
   * If this fails, the just-created order is removed so the user can simply save again without a duplicate.
   */
  async savePartyDetails(projectOrderDbId, partyName) {
    const { error } = await supabase
      .from('project_party_details')
      .insert([{ order_id: projectOrderDbId, party_name: partyName }]);
    if (!error) return;

    console.error('[projectOrdersApi] Failed to save party details:', error);
    const { error: rollbackError } = await supabase.from('project_orders').delete().eq('id', projectOrderDbId);
    if (rollbackError) {
      // Order stays saved; only its project_party_details row is missing
      console.error('[projectOrdersApi] Could not roll back project order', projectOrderDbId, rollbackError);
      throw new Error(
        `The order was saved but its party details were not (${error.message}). Please do not save it again — contact the admin to add the party details.`
      );
    }
    throw new Error(`Could not save the party details: ${error.message}. The order was not saved, please try again.`);
  },

  /**
   * Updates an existing project order (order_id, firm and brand never change).
   * payload: { created_at, party_name, po_number, product_details, delivery_details (object or null) }
   * The party in project_party_details follows the order's party name.
   */
  async updateProjectOrder(id, payload) {
    const dbId = Number(id);
    if (!Number.isInteger(dbId) || dbId <= 0) throw new Error('Invalid project order reference.');

    const partyName = payload.party_name ? String(payload.party_name).trim() : null;
    const dbPayload = {
      party_name: partyName,
      po_number: payload.po_number ? String(payload.po_number).trim() : null,
      product_details: payload.product_details || {},
      delivery_details:
        payload.delivery_details && typeof payload.delivery_details === 'object' ? payload.delivery_details : null,
      ...(payload.created_at ? { created_at: new Date(payload.created_at).toISOString() } : {}),
    };

    const { data, error } = await supabase.from('project_orders').update(dbPayload).eq('id', dbId).select().single();
    if (error) {
      console.error('[projectOrdersApi] Failed to update project order:', error);
      if (error.code === 'PGRST116') throw new Error('Project order not found. It may have been deleted.');
      throw new Error(error.message || 'Could not update the project order. Please try again.');
    }

    try {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    } catch (e) { }

    // Keep project_party_details in step with the order's party (order still saved if this fails)
    if (partyName) {
      try {
        const { data: updated, error: partyError } = await supabase
          .from('project_party_details')
          .update({ party_name: partyName })
          .eq('order_id', dbId)
          .select('id');
        if (partyError) throw partyError;
        if (!updated || updated.length === 0) {
          const { error: insertError } = await supabase
            .from('project_party_details')
            .insert([{ order_id: dbId, party_name: partyName }]);
          if (insertError) throw insertError;
        }
      } catch (partyErr) {
        console.warn('[projectOrdersApi] Order updated, but party details were not:', partyErr);
      }
    }

    return data;
  },

  /**
   * Deletes a project order from Supabase and cleans local cache.
   */
  async deleteProjectOrder(id) {
    try {
      await supabase.from('project_orders').delete().eq('id', id);
    } catch (e) { }

    try {
      const local = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
      const filtered = local.filter((o) => String(o.id) !== String(id));
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(filtered));
    } catch (e) { }

    return true;
  },
};
