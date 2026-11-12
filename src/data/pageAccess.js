/**
 * Page access control for the Order-to-Dispatch portal.
 *
 * Access is stored per user in the `sales_access` column of the `users` table as JSON,
 * e.g. { "dashboard": "view", "orders": "edit" }. Pages that are missing (or hold any
 * unrecognised value) are treated as NO access, so the system always fails closed.
 *
 * Which firm's data a user sees comes from `users.firm_id` (FK to firms): a firm -> that firm only,
 * empty -> all firms. Both are managed in Settings > Page Access.
 *
 * Super Admin always has full (edit) access to every page and is the only position that
 * can open Settings. All other users only see the pages granted to them.
 */

export const PAGE_ACCESS_COLUMN = 'sales_access';

export const ACCESS_LEVELS = {
  NONE: 'none',
  VIEW: 'view',
  EDIT: 'edit',
};

// Pages that can be granted from Settings > Page Access (Settings itself is Super Admin only)
export const APP_PAGES = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    description: 'Order & dispatch overview and tonnage stats',
    viewHelp: 'See stats and recent orders',
    editHelp: null,
    supportsEdit: false,
  },
  {
    id: 'orders',
    label: 'Orders & Indents',
    description: 's and JSW / ESSAR project orders',
    viewHelp: 'See orders and order details',
    editHelp: 'Book new orders / project orders and approve pending orders',
    supportsEdit: true,
  },
  {
    id: 'dispatch',
    label: 'Dispatch Summary',
    description: 'Dispatches saved against retail and project orders',
    viewHelp: 'See dispatch summary',
    editHelp: 'Dispatch orders from the Orders page',
    supportsEdit: true,
  },
  {
    id: 'pendency',
    label: 'Pendency Report',
    description: 'Retail and project orders with quantity still to dispatch',
    viewHelp: 'See pending quantity per order',
    editHelp: null,
    supportsEdit: false,
  },
  {
    id: 'attendance',
    label: 'Attendance',
    description: 'Sales team attendance (punch in / out)',
    viewHelp: 'See attendance records',
    editHelp: 'Punch in / punch out (sales staff)',
    supportsEdit: true,
  },
  {
    id: 'sales-visits',
    label: 'Sales Visits',
    description: 'Dealer / site visit reports',
    viewHelp: 'See visit reports',
    editHelp: 'Log new visit reports',
    supportsEdit: true,
  },
  {
    id: 'distributors',
    label: 'Distributors & Dealers',
    description: 'Distributor and dealer network',
    viewHelp: 'See distributors and dealers',
    editHelp: 'Add distributors and dealers',
    supportsEdit: true,
  },
  {
    id: 'firms',
    label: 'Firms',
    description: 'Company and distributor firms',
    viewHelp: 'See the firms list',
    editHelp: 'Add new firms',
    supportsEdit: true,
  },
];

const PAGE_IDS = new Set(APP_PAGES.map((p) => p.id));
const PAGE_BY_ID = Object.fromEntries(APP_PAGES.map((p) => [p.id, p]));

// Sidebar tab aliases that share a page permission
const TAB_TO_PAGE = {
  dealers: 'distributors',
};

export const resolvePageId = (tabId) => TAB_TO_PAGE[tabId] || tabId;

/**
 * Converts whatever is stored in the database (object, JSON string, null, garbage)
 * into a clean { pageId: 'view' | 'edit' } map. Unknown pages and values are dropped.
 */
export function normalizePageAccess(raw) {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return {};
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  const clean = {};
  for (const [pageId, level] of Object.entries(value)) {
    if (!PAGE_IDS.has(pageId)) continue;
    const lvl = String(level || '').toLowerCase().trim();
    if (lvl === ACCESS_LEVELS.EDIT) {
      clean[pageId] = PAGE_BY_ID[pageId].supportsEdit ? ACCESS_LEVELS.EDIT : ACCESS_LEVELS.VIEW;
    } else if (lvl === ACCESS_LEVELS.VIEW) {
      clean[pageId] = ACCESS_LEVELS.VIEW;
    }
  }
  return clean;
}

export function isSuperAdminUser(user) {
  if (!user) return false;
  const pos = String(user.position || '').toLowerCase().trim();
  return pos.includes('super admin') || pos.includes('superadmin');
}

/** Returns 'none' | 'view' | 'edit' for the given user and page/tab id. */
export function getPageAccessLevel(user, tabId) {
  if (!user) return ACCESS_LEVELS.NONE;
  const pageId = resolvePageId(tabId);
  if (isSuperAdminUser(user)) {
    return pageId === 'settings' || PAGE_IDS.has(pageId) ? ACCESS_LEVELS.EDIT : ACCESS_LEVELS.NONE;
  }
  if (pageId === 'settings') return ACCESS_LEVELS.NONE;
  // Users without a position are never granted access (they are hidden from Settings > Page Access)
  if (!String(user.position || '').trim()) return ACCESS_LEVELS.NONE;
  return normalizePageAccess(user[PAGE_ACCESS_COLUMN])[pageId] || ACCESS_LEVELS.NONE;
}
