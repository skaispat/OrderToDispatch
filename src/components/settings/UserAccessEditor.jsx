import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { evaluateUserFirmAccess, parseFirmIds, firmOptionForId, serializeFirmIds } from '../../data/constants';
import { APP_PAGES, ACCESS_LEVELS, PAGE_ACCESS_COLUMN, normalizePageAccess, isSuperAdminUser } from '../../data/pageAccess';
import {
  Eye,
  Pencil,
  Ban,
  LayoutDashboard,
  ShoppingCart,
  Truck,
  CalendarCheck,
  MapPin,
  CalendarDays,
  Building2,
  Settings,
  Lock,
  CheckCircle2,
  ShieldCheck,
  AlertTriangle,
  Factory,
} from 'lucide-react';

const PAGE_ICONS = {
  dashboard: LayoutDashboard,
  orders: ShoppingCart,
  dispatch: Truck,
  attendance: CalendarCheck,
  'sales-visits': MapPin,
  'daily-sales-visit': CalendarDays,
  distributors: Building2,
  firms: Factory,
};

const LEVEL_OPTIONS = [
  { id: ACCESS_LEVELS.NONE, label: 'No Access', icon: Ban, active: 'bg-slate-700 text-white border-slate-700' },
  { id: ACCESS_LEVELS.VIEW, label: 'View', icon: Eye, active: 'bg-blue-600 text-white border-blue-600' },
  { id: ACCESS_LEVELS.EDIT, label: 'Edit', icon: Pencil, active: 'bg-emerald-600 text-white border-emerald-600' },
];

export const EMPTY_ACCESS = { pages: {}, firms: [] };

/**
 * How Firm Access works for a user:
 *  - 'admin'       Super Admin: always all firms (not editable)
 *  - 'distributor' own distributor firm (Sarthak data) is always kept; company firms can be added
 *  - 'sales'       pick firms; Sarthak ticked = all Sarthak orders, nothing selected = own Sarthak bookings only
 *  - 'standard'    pick firms; nothing selected = All Firms
 */
export const firmMode = (u, firmRows) => {
  if (isSuperAdminUser(u)) return 'admin';
  const scope = evaluateUserFirmAccess(u, firmRows);
  if (scope.isDistributorOnly) return 'distributor';
  if (scope.isSalesScope) return 'sales';
  return 'standard';
};

// Firm options selected for a user, as catalog storeIds. Any distributor firm id counts as Sarthak TMT.
const toCatalogIds = (catalog, ids) => {
  const result = [];
  for (const id of ids) {
    const option = firmOptionForId(catalog, id);
    if (option && !result.includes(option.storeId)) result.push(option.storeId);
  }
  return result;
};

/** Access currently stored on a user row */
export const accessFromUser = (u, catalog, firmRows) => {
  const pages = normalizePageAccess(u?.[PAGE_ACCESS_COLUMN]);
  const ids = parseFirmIds(u?.firm_id);
  if (firmMode(u, firmRows) === 'distributor') {
    // Their own distributor firm is the Sarthak link; only extra company firms are editable
    const own = evaluateUserFirmAccess(u, firmRows).distributorFirmId;
    const sarthakId = catalog[0]?.storeId;
    return { pages, firms: toCatalogIds(catalog, ids.filter((id) => id !== own)).filter((id) => id !== sarthakId) };
  }
  return { pages, firms: toCatalogIds(catalog, ids) };
};

/**
 * Column updates for saving access: sales_access (pages) and firm_id (firms).
 * For distributors, distributorFirmId (their own distributor firm) is always kept first in firm_id.
 */
export const accessUpdates = (u, access, firmRows, { distributorFirmId } = {}) => {
  const updates = { [PAGE_ACCESS_COLUMN]: normalizePageAccess(access.pages) };
  const mode = firmMode(u, firmRows);
  if (mode === 'admin') return updates;
  if (mode === 'distributor') {
    const own = parseFirmIds(distributorFirmId)[0];
    updates.firm_id = serializeFirmIds([...(own ? [own] : []), ...access.firms]);
  } else {
    updates.firm_id = serializeFirmIds(access.firms);
  }
  return updates;
};

/** Short texts for tables: pages granted and firms */
export const accessSummary = (u, firmRows) => {
  if (isSuperAdminUser(u)) return { pages: 'All pages', firms: 'All Firms', count: APP_PAGES.length };
  const pages = normalizePageAccess(u?.[PAGE_ACCESS_COLUMN]);
  const count = APP_PAGES.filter((p) => pages[p.id]).length;
  return {
    pages: count === 0 ? 'No access' : `${count} page${count > 1 ? 's' : ''}`,
    firms: evaluateUserFirmAccess(u, firmRows).firmName,
    count,
  };
};

/**
 * Page access + firm access editor used in the Add / Edit Employee modals.
 * `user` is the user being edited with the position / role currently chosen in the form.
 */
export const UserAccessEditor = ({ user, value, onChange, disabled = false }) => {
  const { firms: firmRows, firmCatalog } = useAuth();
  const access = value || EMPTY_ACCESS;

  if (!String(user?.position || '').trim()) {
    return (
      <div className="flex items-start gap-2 p-3 rounded-xl border border-amber-200 bg-amber-50 text-xs text-amber-900">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
        <span>Select a position first. Users without a position cannot be given any access.</span>
      </div>
    );
  }

  if (isSuperAdminUser(user)) {
    return (
      <div className="flex items-start gap-2 p-3 rounded-xl border border-emerald-200 bg-emerald-50 text-xs text-emerald-900">
        <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-emerald-700" />
        <span>Super Admin always has full access to every page, all firms and Settings.</span>
      </div>
    );
  }

  const mode = firmMode(user, firmRows);
  const sarthakId = firmCatalog[0]?.storeId;
  const grantedCount = APP_PAGES.filter((p) => access.pages[p.id]).length;

  const setPages = (pages) => onChange({ ...access, pages });
  const setLevel = (pageId, level) => {
    const pages = { ...access.pages };
    if (level === ACCESS_LEVELS.NONE) delete pages[pageId];
    else pages[pageId] = level;
    setPages(pages);
  };
  const setAllPages = (level) => {
    const pages = {};
    if (level !== ACCESS_LEVELS.NONE) {
      for (const page of APP_PAGES) {
        pages[page.id] = level === ACCESS_LEVELS.EDIT && !page.supportsEdit ? ACCESS_LEVELS.VIEW : level;
      }
    }
    setPages(pages);
  };
  const toggleFirm = (storeId) => {
    const firms = access.firms.includes(storeId) ? access.firms.filter((id) => id !== storeId) : [...access.firms, storeId];
    // Standard users: every firm ticked is the same as All Firms
    onChange({ ...access, firms: mode === 'standard' && firms.length === firmCatalog.length ? [] : firms });
  };

  return (
    <div className="space-y-4">
      {/* Firm access */}
      <section className="space-y-2">
        <div>
          <h4 className="text-xs font-extrabold uppercase tracking-wide text-slate-700">Firm Access</h4>
          <p className="text-[11px] text-slate-500">
            {mode === 'distributor'
              ? 'Their own distributor firm (Sarthak TMT) is always included. Add company firms to also show their project orders.'
              : mode === 'sales'
                ? 'Tick Sarthak TMT to show all Sarthak orders. Company firms show that firm\'s project orders. Nothing selected = only their own Sarthak bookings.'
                : "Which firm's orders, dispatches and stats this user sees."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {mode === 'standard' && (
            <button
              type="button"
              onClick={() => onChange({ ...access, firms: [] })}
              disabled={disabled}
              aria-pressed={access.firms.length === 0}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-bold transition cursor-pointer disabled:opacity-50 ${
                access.firms.length === 0
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {access.firms.length === 0 && <CheckCircle2 className="w-3.5 h-3.5" />}
              All Firms
            </button>
          )}
            {firmCatalog.map((o) => {
              // Distributors always keep Sarthak (their own firm)
              const lockedOn = mode === 'distributor' && o.storeId === sarthakId;
              const checked = lockedOn || access.firms.includes(o.storeId);
              const noDataView = !o.brandId;
              return (
                <button
                  type="button"
                  key={o.key}
                  onClick={() => toggleFirm(o.storeId)}
                  disabled={disabled || noDataView || lockedOn}
                  aria-pressed={checked}
                  title={
                    noDataView
                      ? 'No orders / dispatch view exists for this company yet'
                      : lockedOn
                        ? 'Their own distributor firm (always included)'
                        : o.brandId === 'sarthak'
                        ? 'Sarthak TMT data (includes all distributor firms)'
                        : undefined
                  }
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-bold transition cursor-pointer ${lockedOn ? 'disabled:opacity-100' : 'disabled:opacity-50'} disabled:cursor-not-allowed ${
                    checked ? 'bg-red-50 text-[#a81b1e] border-[#a81b1e]' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <span
                    className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${
                      checked ? 'bg-[#a81b1e] border-[#a81b1e]' : 'border-slate-300 bg-white'
                    }`}
                  >
                    {checked && <span className="w-1.5 h-1.5 rounded-sm bg-white" />}
                  </span>
                  {o.label}
                  {noDataView && <span className="text-[10px] font-semibold text-slate-400">(no data)</span>}
                  {lockedOn && <Lock className="w-3 h-3" />}
                </button>
              );
            })}
        </div>
        {(mode === 'distributor' ? access.firms.length > 0 : access.firms.length > 1) && (
          <p className="text-[11px] text-slate-500">This user can switch between the selected firms from the top bar.</p>
        )}
      </section>

      {/* Page access */}
      <section className="space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div>
            <h4 className="text-xs font-extrabold uppercase tracking-wide text-slate-700">
              Page Access <span className="text-slate-400 font-bold">({grantedCount}/{APP_PAGES.length})</span>
            </h4>
            <p className="text-[11px] text-slate-500">Pages shown in this user's sidebar and what they can do there.</p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setAllPages(ACCESS_LEVELS.VIEW)}
              disabled={disabled}
              className="px-2.5 py-1 rounded-md border border-blue-200 bg-blue-50 text-[11px] font-bold text-blue-800 hover:bg-blue-100 transition cursor-pointer disabled:opacity-50"
            >
              View all
            </button>
            <button
              type="button"
              onClick={() => setAllPages(ACCESS_LEVELS.EDIT)}
              disabled={disabled}
              className="px-2.5 py-1 rounded-md border border-emerald-200 bg-emerald-50 text-[11px] font-bold text-emerald-800 hover:bg-emerald-100 transition cursor-pointer disabled:opacity-50"
            >
              Edit all
            </button>
            <button
              type="button"
              onClick={() => setAllPages(ACCESS_LEVELS.NONE)}
              disabled={disabled}
              className="px-2.5 py-1 rounded-md border border-slate-200 bg-white text-[11px] font-bold text-slate-600 hover:bg-slate-50 transition cursor-pointer disabled:opacity-50"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
          {APP_PAGES.map((page) => {
            const Icon = PAGE_ICONS[page.id] || LayoutDashboard;
            const level = access.pages[page.id] || ACCESS_LEVELS.NONE;
            const help =
              level === ACCESS_LEVELS.EDIT ? page.editHelp : level === ACCESS_LEVELS.VIEW ? page.viewHelp : 'Hidden from sidebar';
            return (
              <div key={page.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5">
                <div className="flex items-start gap-2.5 min-w-0">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
                      level === ACCESS_LEVELS.NONE ? 'bg-slate-50 border-slate-200 text-slate-400' : 'bg-red-50 border-red-200 text-[#a81b1e]'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900">{page.label}</p>
                    <p className="text-[11px] text-slate-500">{help}</p>
                  </div>
                </div>

                <div role="radiogroup" aria-label={`${page.label} access`} className="flex items-center gap-1 shrink-0 self-start sm:self-auto">
                  {LEVEL_OPTIONS.map((opt) => {
                    const OptIcon = opt.icon;
                    const unsupported = opt.id === ACCESS_LEVELS.EDIT && !page.supportsEdit;
                    const active = level === opt.id;
                    return (
                      <button
                        type="button"
                        key={opt.id}
                        role="radio"
                        aria-checked={active}
                        onClick={() => setLevel(page.id, opt.id)}
                        disabled={disabled || unsupported}
                        title={unsupported ? 'This page is view-only' : undefined}
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md border text-[11px] font-bold transition cursor-pointer disabled:cursor-not-allowed ${
                          unsupported
                            ? 'bg-slate-50 text-slate-300 border-slate-100'
                            : active
                              ? opt.active
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <OptIcon className="w-3 h-3" />
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Settings: always Super Admin only */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 bg-slate-50/60">
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border bg-slate-50 border-slate-200 text-slate-400">
                <Settings className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-900">Settings</p>
                <p className="text-[11px] text-slate-500">Users, firms and access management</p>
              </div>
            </div>
            <span className="flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-slate-200 bg-white text-[11px] font-bold text-slate-500 self-start sm:self-auto">
              <Lock className="w-3 h-3" />
              Super Admin only
            </span>
          </div>
        </div>
      </section>
    </div>
  );
};
