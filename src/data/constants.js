// System Constants for SKA Ispat TMT Order-to-Dispatch System

export const TMT_BRANDS = [
  {
    id: 'sarthak',
    firm_id: 1,
    name: 'Sarthak TMT',
    code: 'SRTK',
    color: '#a81b1e',
    badgeClass: 'bg-red-50 text-red-800 border-red-200',
    isOwnBrand: true,
  },
  {
    id: 'jsw',
    firm_id: 2,
    name: 'JSW One',
    code: 'JSW',
    color: '#2563eb',
    badgeClass: 'bg-blue-50 text-blue-800 border-blue-200',
    isOwnBrand: false,
  },
  {
    id: 'essar',
    firm_id: 3,
    name: 'Essar Steel',
    code: 'ESSR',
    color: '#d97706',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
    isOwnBrand: false,
  },
];

export const TMT_SIZES = ['8mm', '10mm', '12mm', '16mm', '20mm', '25mm', '32mm'];

export const JSW_ONE_PRODUCTS = [
  'JSW One TMT IS 1786 : 2008 Fe 550 8mm',
  'JSW One TMT IS 1786 : 2008 Fe 550 10mm',
  'JSW One TMT IS 1786 : 2008 Fe 550 12mm',
  'JSW One TMT IS 1786 : 2008 Fe 550 16mm',
  'JSW One TMT IS 1786 : 2008 Fe 550 20mm',
  'JSW One TMT IS 1786 : 2008 Fe 550 25mm',
  'JSW One TMT IS 1786 : 2008 Fe 550 32mm',
];

export const ONE_HELIX_PRODUCTS = [
  'One Helix IS TMT 1786:2008 Fe 550 8mm',
  'One Helix IS TMT 1786:2008 Fe 550 10mm',
  'One Helix IS TMT 1786:2008 Fe 550 12mm',
  'One Helix IS TMT 1786:2008 Fe 550 16mm',
  'One Helix IS TMT 1786:2008 Fe 550 20mm',
  'One Helix IS TMT 1786:2008 Fe 550 25mm',
  'One Helix IS TMT 1786:2008 Fe 550 32mm',
];

export const ESSAR_PRODUCTS = [
  'ESSAR Steel IS TMT 1786:2008 Fe 550 8mm',
  'ESSAR Steel IS TMT 1786:2008 Fe 550 10mm',
  'ESSAR Steel IS TMT 1786:2008 Fe 550 12mm',
  'ESSAR Steel IS TMT 1786:2008 Fe 550 16mm',
  'ESSAR Steel IS TMT 1786:2008 Fe 550 20mm',
  'ESSAR Steel IS TMT 1786:2008 Fe 550 25mm',
  'ESSAR Steel IS TMT 1786:2008 Fe 550 32mm',
];

export const FIRMS_LIST = [
  { id: 1, name: 'Sarthak TMT (SKAI Spat)', brandId: 'sarthak' },
  { id: 2, name: 'JSW One', brandId: 'jsw' },
  { id: 3, name: 'Essar Steel', brandId: 'essar' },
  { id: 6, name: 'ESSAR', brandId: 'essar' },
];

// Firm access is built from the firms table (id, name, type):
//  - type "Distributor" -> Sarthak TMT data (all distributor firms belong to Sarthak)
//  - type "Company"     -> its own firm, shown by its name (e.g. JSW, ESSAR)
// users.firm_id holds a comma separated list of firm ids, e.g. "2,6". Empty = all firms.

const ALL_BRAND_IDS = ['sarthak', 'jsw', 'essar'];

// Used only when the firms table cannot be read
const DEFAULT_FIRMS = [
  { id: 1, name: 'Sarthak TMT', type: 'Distributor' },
  { id: 2, name: 'JSW', type: 'Company' },
  { id: 6, name: 'ESSAR', type: 'Company' },
];

const isDistributorFirm = (firm) => {
  const type = String(firm?.type || '').toLowerCase().trim();
  if (type) return type === 'distributor';
  return /sarthak|skai/i.test(firm?.name || ''); // untyped fallback rows
};

const brandForCompany = (name) => {
  if (/jsw/i.test(name || '')) return 'jsw';
  if (/essar/i.test(name || '')) return 'essar';
  return null; // company without its own data view yet
};

/**
 * Firm access options from firms table rows:
 * [{ key, label, brandId, storeId, ids }]
 *  - one "Sarthak TMT" option covering every distributor firm id (saved as the lowest distributor id)
 *  - one option per company (companies of the same brand are grouped)
 */
export function buildFirmCatalog(firms) {
  const rows = (Array.isArray(firms) && firms.length ? firms : DEFAULT_FIRMS)
    .map((f) => ({ ...f, id: Number(f.id) }))
    .filter((f) => Number.isInteger(f.id) && f.id > 0)
    .sort((a, b) => a.id - b.id);

  const distributorIds = rows.filter(isDistributorFirm).map((f) => f.id);
  const catalog = [
    {
      key: 'sarthak',
      label: 'Sarthak TMT',
      brandId: 'sarthak',
      storeId: distributorIds[0] || 1,
      ids: distributorIds.length ? distributorIds : [1],
    },
  ];

  for (const firm of rows.filter((f) => !isDistributorFirm(f))) {
    const brandId = brandForCompany(firm.name);
    const sameBrand = brandId && catalog.find((o) => o.brandId === brandId);
    if (sameBrand) {
      sameBrand.ids.push(firm.id);
      continue;
    }
    catalog.push({ key: String(firm.id), label: firm.name || `Firm #${firm.id}`, brandId, storeId: firm.id, ids: [firm.id] });
  }
  return catalog;
}

/** Catalog option a stored firm id belongs to (or null when unknown) */
export function firmOptionForId(catalog, id) {
  return catalog.find((o) => o.ids.includes(Number(id))) || null;
}

/** "2, 6" | 2 | [2, 6] | null -> [2, 6] (unique positive integers, invalid parts dropped) */
export function parseFirmIds(value) {
  if (value === null || value === undefined) return [];
  const parts = Array.isArray(value) ? value : String(value).split(',');
  const ids = [];
  for (const part of parts) {
    const n = Number(String(part).trim());
    if (Number.isInteger(n) && n > 0 && !ids.includes(n)) ids.push(n);
  }
  return ids;
}

/** [2, 6] -> "2,6"; [] -> null (all firms) */
export function serializeFirmIds(ids) {
  const clean = parseFirmIds(ids);
  return clean.length ? clean.join(',') : null;
}

/**
 * Decides which firm's DATA a user sees. Which PAGES they can open (and view/edit) is
 * controlled separately by Settings > Page Access (see data/pageAccess.js).
 * 1. No position -> no data (unauthorized)
 * 2. Distributor -> only their own orders / dealers
 * 3. ASM / Sales -> Sarthak TMT, only their own booked orders
 * 4. Super Admin -> all firms
 * 5. firm_id (comma separated, Settings > Page Access) -> only those firms
 *    (distributor-type firms = Sarthak TMT, company-type firms = that company; `firms` = firms table rows)
 * 6. No firm_id -> all firms
 */
export function evaluateUserFirmAccess(user, firms) {
  if (!user) {
    return {
      canAccessAllFirms: false,
      firmId: null,
      brandId: null,
      isRestricted: false,
      position: null,
      firmName: 'None',
      rule: 'No user session',
    };
  }

  const userRole = (user.role || 'user').trim().toLowerCase();
  const rawPosition = (user.position || '').trim().toLowerCase();
  const department = (user.department || '').trim().toLowerCase();
  const firmIds = parseFirmIds(user.firm_id);
  const catalog = buildFirmCatalog(firms);

  // Firms (brands) granted through firm_id. Unknown ids and companies without a data view are ignored.
  const grantedFirms = (ids) => {
    const list = [];
    for (const id of ids) {
      const option = firmOptionForId(catalog, id);
      if (!option || !option.brandId) continue;
      if (!list.some((a) => a.brandId === option.brandId)) {
        list.push({ firmId: option.storeId, brandId: option.brandId, firmName: option.label });
      }
    }
    return list;
  };
  const sarthakFirm = { firmId: catalog[0].storeId, brandId: 'sarthak', firmName: catalog[0].label };
  // Distributors / sales switch between their firms (no combined view); Sarthak listed first
  const sarthakFirst = (list) => [...list].sort((a, b) => (a.brandId === 'sarthak' ? -1 : b.brandId === 'sarthak' ? 1 : 0));
  const firmFields = (list) => ({
    firmId: list.length === 1 ? list[0].firmId : null,
    firmIds: list.map((a) => a.firmId),
    brandId: list[0].brandId,
    allowedBrands: list.map((a) => a.brandId),
    isMultiFirm: list.length > 1,
  });

  if (!rawPosition) {
    return {
      canAccessAllFirms: false,
      firmId: null,
      brandId: null,
      isRestricted: true,
      isProhibited: true,
      isUnauthorized: true,
      position: 'Unassigned',
      firmName: 'Unassigned',
      rule: 'No position assigned: no access',
    };
  }

  if (rawPosition.includes('distributor') || userRole === 'distributor') {
    // firm_id = their own distributor firm (Sarthak data) + any company firms granted in Firm Access
    const distributorFirmId =
      firmIds.find((id) => firmOptionForId(catalog, id)?.brandId === 'sarthak') ||
      firmIds.find((id) => !firmOptionForId(catalog, id)) ||
      null;
    const companies = grantedFirms(firmIds.filter((id) => id !== distributorFirmId)).filter((a) => a.brandId !== 'sarthak');
    const list = [sarthakFirm, ...companies];
    return {
      canAccessAllFirms: false,
      ...firmFields(list),
      firmId: distributorFirmId,
      distributorFirmId,
      isRestricted: true,
      isDistributorOnly: true,
      // Sarthak view always shows only their own orders
      ownSarthakOnly: true,
      position: user.position,
      firmName: list.map((a) => a.firmName).join(' + '),
      rule: 'Distributor: own Sarthak orders and dealers' + (list.length > 1 ? ' + granted company firms' : ''),
    };
  }

  const isSalesRole =
    rawPosition.includes('asm') ||
    rawPosition.includes('sales') ||
    rawPosition.includes('officer') ||
    userRole.includes('sales') ||
    department.includes('sales');
  if (isSalesRole) {
    // Nothing selected -> Sarthak, own booked orders only.
    // Sarthak granted in Firm Access -> all Sarthak orders. Company firms -> those firms' project orders.
    const granted = grantedFirms(firmIds);
    const list = granted.length ? sarthakFirst(granted) : [sarthakFirm];
    const ownSarthakOnly = !granted.some((a) => a.brandId === 'sarthak');
    return {
      canAccessAllFirms: false,
      ...firmFields(list),
      isRestricted: true,
      isASM: rawPosition.includes('asm') || rawPosition.includes('area sales manager'),
      position: user.position,
      firmName: list.map((a) => a.firmName).join(' + '),
      rule: (ownSarthakOnly ? 'Sales: own Sarthak bookings' : 'Sales: all Sarthak orders') + (list.some((a) => a.brandId !== 'sarthak') ? ' + granted company firms' : ''),
      isSalesScope: true,
      ownSarthakOnly,
    };
  }

  if (rawPosition.includes('super admin') || rawPosition.includes('superadmin')) {
    return {
      canAccessAllFirms: true,
      firmId: null,
      brandId: 'all',
      isRestricted: false,
      position: user.position,
      allowedBrands: ALL_BRAND_IDS,
      firmName: 'All Firms',
      rule: 'Super Admin: all firms',
      isSuperAdmin: true,
    };
  }

  // Firms from firm_id (comma separated). Empty, or every firm selected -> all firms
  const allowed = [];
  for (const id of firmIds) {
    const option = firmOptionForId(catalog, id);
    // Unknown ids, and companies without their own data view, are ignored
    if (!option || !option.brandId) continue;
    if (!allowed.some((a) => a.brandId === option.brandId)) {
      allowed.push({ firmId: option.storeId, brandId: option.brandId, firmName: option.label });
    }
  }
  // firm_id set but none recognised: never fall back to all firms
  if (firmIds.length > 0 && allowed.length === 0) {
    const sarthak = catalog[0];
    allowed.push({ firmId: sarthak.storeId, brandId: 'sarthak', firmName: sarthak.label });
  }

  if (allowed.length === 0 || ALL_BRAND_IDS.every((b) => allowed.some((a) => a.brandId === b))) {
    return {
      canAccessAllFirms: true,
      firmId: null,
      firmIds: [],
      brandId: 'all',
      allowedBrands: ALL_BRAND_IDS,
      isRestricted: false,
      position: user.position,
      firmName: 'All Firms',
      rule: 'All firms',
      isSuperAdmin: false,
    };
  }

  if (allowed.length === 1) {
    const only = allowed[0];
    return {
      canAccessAllFirms: false,
      firmId: only.firmId,
      firmIds: [only.firmId],
      brandId: only.brandId,
      allowedBrands: [only.brandId],
      isRestricted: true,
      position: user.position,
      firmName: only.firmName,
      rule: `Assigned firm only: ${only.firmName}`,
      isSuperAdmin: false,
    };
  }

  // Several firms: user can switch between them (no combined "All Firms" view)
  const names = allowed.map((a) => a.firmName).join(' + ');
  return {
    canAccessAllFirms: false,
    isMultiFirm: true,
    firmId: null,
    firmIds: allowed.map((a) => a.firmId),
    brandId: allowed[0].brandId,
    allowedBrands: allowed.map((a) => a.brandId),
    isRestricted: true,
    position: user.position,
    firmName: names,
    rule: `Assigned firms: ${names}`,
    isSuperAdmin: false,
  };
}

/** Firm (brand) a page should show: the selected one if the user may see it, otherwise their first firm. */
export function resolveBrandForUser(firmAccess, selectedBrand) {
  if (firmAccess?.canAccessAllFirms) return selectedBrand;
  const allowed = firmAccess?.allowedBrands || [];
  return allowed.includes(selectedBrand) ? selectedBrand : firmAccess?.brandId || 'sarthak';
}
