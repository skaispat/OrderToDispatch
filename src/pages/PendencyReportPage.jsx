import { useState, useEffect, useMemo } from 'react';
import { Pagination } from '../components/common/Pagination';
import { ordersApi } from '../api/ordersApi';
import { projectOrdersApi } from '../api/projectOrdersApi';
import { dispatchApi, withDispatchStatus } from '../api/dispatchApi';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { resolveBrandForUser } from '../data/constants';
import { Search, AlertTriangle, RefreshCw, Download } from 'lucide-react';

// Orders with less than this left to dispatch count as fully dispatched
const QTY_EPSILON = 0.001;

const fmtQty = (n) => (Number(n) || 0).toFixed(2);

const fmtDate = (iso) => {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return y && m && d ? `${d}-${m}-${y}` : iso;
};

const fmtRate = (n) => `₹${(Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

// Rate per MT label: one rate, or "min – max" when an order's items / lots have different rates
const rateLabel = (rates) => {
  const list = [...new Set(rates.map((r) => Number(r) || 0).filter((r) => r > 0))].sort((a, b) => a - b);
  if (list.length === 0) return '—';
  if (list.length === 1) return fmtRate(list[0]);
  return `${fmtRate(list[0])} – ${fmtRate(list[list.length - 1])}`;
};

// Project order rates: item / lot rates, else order value / order qty
const projectRates = (o) => {
  const rates = (o.items || []).map((it) => parseFloat(it.rate) || 0).filter((r) => r > 0);
  if (rates.length) return rates;
  const qty = Number(o.total_qty) || 0;
  return qty > 0 && Number(o.total_value) > 0 ? [Number(o.total_value) / qty] : [];
};

// Retail party: distributor (and dealer when booked for one), else the firm / brand
const retailParty = (o) => {
  const dist = o.distributorName && o.distributorName !== '—' ? o.distributorName : '';
  const dealer = o.dealerName && o.dealerName !== 'Self' ? o.dealerName : '';
  if (dist && dealer) return `${dist} / ${dealer}`;
  return dist || dealer || o.brand_name || '—';
};

// Sarthak project party: project_party_details, else project_orders.party_name
const projectParty = (o, partyMap) => partyMap.get(Number(o.db_id)) || o.party_name || '—';

export const PendencyReportPage = () => {
  const { selectedBrand, refreshKey } = useApp();
  const { user, firmAccess, isDistributor, isASM, isSalesPerson, distributorFirmId } = useAuth();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all'); // 'all' | 'retail' | 'project'
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const isSalesRole = isASM || isSalesPerson;
  // Same data scope as the Orders page: ASMs see Sarthak retail orders only
  const hideProjectOrders = isASM;
  const effectiveBrand = useMemo(
    () => (hideProjectOrders ? 'sarthak' : resolveBrandForUser(firmAccess, selectedBrand)),
    [firmAccess, selectedBrand, hideProjectOrders]
  );
  const ownOrdersOnly =
    (isSalesRole || isDistributor) && Boolean(firmAccess?.ownSarthakOnly) && effectiveBrand === 'sarthak';

  const loadLists = async () => {
    if (ownOrdersOnly) {
      const filters = {};
      if (isSalesRole && user?.emp_id) {
        filters.salesPersonId = user.emp_id;
      } else if (isDistributor) {
        filters.distributorId = distributorFirmId || user?.emp_id;
        filters.distributorIds = [distributorFirmId, user?.emp_id].filter(Boolean);
      }
      return { retail: await ordersApi.getOrders(filters), project: [] };
    }
    if (hideProjectOrders) {
      return { retail: await ordersApi.getOrders({ brandId: 'sarthak' }), project: [] };
    }
    // The report covers every firm the user may see (Sarthak, JSW, ESSAR), not only the brand picked in the header
    const allowed = firmAccess?.canAccessAllFirms ? null : firmAccess?.allowedBrands || [firmAccess?.brandId || 'sarthak'];
    const showRetail = !allowed || allowed.includes('sarthak');
    const [retail, project] = await Promise.all([
      showRetail ? ordersApi.getOrders(allowed ? { brandId: 'sarthak' } : {}) : Promise.resolve([]),
      projectOrdersApi.getProjectOrders(),
    ]);
    return { retail, project: allowed ? project.filter((o) => allowed.includes(o.brandId)) : project };
  };

  const fetchReport = async () => {
    setLoading(true);
    setError(null);
    try {
      // Dispatched qty must be known, otherwise every order would wrongly show as fully pending
      const [lists, totals, partyMap] = await Promise.all([
        loadLists(),
        dispatchApi.getDispatchTotals(),
        projectOrdersApi.getPartyDetailsMap().catch((err) => {
          console.warn('Could not load project party details:', err);
          return new Map();
        }),
      ]);

      const retail = withDispatchStatus(lists.retail, totals, 'retail').map((o) => ({
        key: `R-${o.db_id}`,
        type: 'retail',
        orderId: o.order_id,
        date: o.date,
        firm: o.brand_name || 'Sarthak TMT',
        party: retailParty(o),
        rate: rateLabel([o.order_value]),
        orderQty: Number(o.order_qty) || 0,
        dispatchQty: o.dispatched_qty,
        pendingQty: o.pending_qty,
      }));
      const project = withDispatchStatus(lists.project, totals, 'project').map((o) => ({
        key: `P-${o.db_id}`,
        type: 'project',
        orderId: o.order_id,
        date: o.date,
        firm: o.firm_name || o.brand_name || '—',
        brandId: o.brandId,
        // JSW / ESSAR orders show their firm name in the party column
        party:
          o.brandId === 'jsw' || o.brandId === 'essar'
            ? o.firm_name || o.brand_name || '—'
            : projectParty(o, partyMap),
        rate: rateLabel(projectRates(o)),
        orderQty: Number(o.total_qty) || 0,
        dispatchQty: o.dispatched_qty,
        pendingQty: o.pending_qty,
      }));

      // Fully dispatched orders are left out
      const pending = [...retail, ...project]
        .filter((r) => r.pendingQty > QTY_EPSILON)
        .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.orderId).localeCompare(String(a.orderId)));
      setRows(pending);
    } catch (err) {
      console.error('Error loading pendency report:', err);
      setError(err?.message || 'Failed to load the pendency report. Please try again.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveBrand, ownOrdersOnly, hideProjectOrders, isDistributor, isSalesRole, user, refreshKey]);

  const filteredRows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return rows.filter((r) => {
      if (typeFilter !== 'all' && r.type !== typeFilter) return false;
      if (!q) return true;
      return (
        String(r.orderId || '').toLowerCase().includes(q) ||
        String(r.party || '').toLowerCase().includes(q) ||
        String(r.firm || '').toLowerCase().includes(q) ||
        fmtDate(r.date).includes(q)
      );
    });
  }, [rows, searchTerm, typeFilter]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, typeFilter, effectiveBrand]);

  const pagedRows = useMemo(
    () => filteredRows.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize),
    [filteredRows, page, pageSize]
  );

  const totals = useMemo(
    () =>
      filteredRows.reduce(
        (acc, r) => ({
          orderQty: acc.orderQty + r.orderQty,
          dispatchQty: acc.dispatchQty + r.dispatchQty,
          pendingQty: acc.pendingQty + r.pendingQty,
        }),
        { orderQty: 0, dispatchQty: 0, pendingQty: 0 }
      ),
    [filteredRows]
  );

  const typeCounts = useMemo(
    () => ({
      all: rows.length,
      retail: rows.filter((r) => r.type === 'retail').length,
      project: rows.filter((r) => r.type === 'project').length,
    }),
    [rows]
  );

  const showTypeFilter = typeCounts.retail > 0 && typeCounts.project > 0;

  const exportCsv = () => {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['Order ID', 'Order Date', 'Type', 'Party / Firm / Distributor', 'Rate / MT', 'Order Qty (MT)', 'Dispatch Qty (MT)', 'Pending Qty (MT)'];
    const typeLabel = (r) =>
      r.type === 'project' && (r.brandId === 'jsw' || r.brandId === 'essar') ? r.firm : r.type === 'project' ? 'Project' : 'Retail';
    const lines = filteredRows.map((r) =>
      [r.orderId, fmtDate(r.date), typeLabel(r), r.party, r.rate.replace(/₹/g, 'Rs '), fmtQty(r.orderQty), fmtQty(r.dispatchQty), fmtQty(r.pendingQty)]
        .map(esc)
        .join(',')
    );
    const csv = '﻿' + [header.map(esc).join(','), ...lines].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `pendency-report-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // Retail / Project for Sarthak orders; JSW and ESSAR orders show their own firm name
  const TypeBadge = ({ row }) => {
    const isCompany = row.type === 'project' && (row.brandId === 'jsw' || row.brandId === 'essar');
    const label = isCompany ? row.firm : row.type === 'project' ? 'Project' : 'Retail';
    const style =
      row.brandId === 'essar' && isCompany
        ? 'bg-amber-50 text-amber-800 border border-amber-200'
        : isCompany
          ? 'bg-purple-50 text-purple-800 border border-purple-200'
          : row.type === 'project'
            ? 'bg-blue-50 text-blue-700 border border-blue-200'
            : 'bg-red-50 text-[#a81b1e] border border-red-200';
    return <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold whitespace-nowrap ${style}`}>{label}</span>;
  };

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex items-start sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-2xl font-extrabold text-slate-900 tracking-tight leading-tight">Pendency Report</h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            {hideProjectOrders || ownOrdersOnly
              ? 'Retail orders with quantity still to be dispatched'
              : 'Retail and project orders with quantity still to be dispatched'}
          </p>
        </div>
        <button
          onClick={exportCsv}
          disabled={loading || filteredRows.length === 0}
          className="shrink-0 flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 shadow-xs transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </button>
      </div>

      {error && (
        <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-red-200 bg-red-50 text-xs text-[#a81b1e]">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              <strong>Failed to load report:</strong> {error}
            </span>
          </div>
          <button
            onClick={() => fetchReport()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#a81b1e] hover:bg-[#8e1518] text-white font-bold transition cursor-pointer shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        </div>
      )}

      {/* Totals */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Pending Orders', value: filteredRows.length, unit: 'Orders', color: 'text-slate-900' },
          { label: 'Order Qty', value: fmtQty(totals.orderQty), unit: 'MT', color: 'text-blue-600' },
          { label: 'Dispatched Qty', value: fmtQty(totals.dispatchQty), unit: 'MT', color: 'text-[#a81b1e]' },
          { label: 'Pending Qty', value: fmtQty(totals.pendingQty), unit: 'MT', color: 'text-amber-600' },
        ].map((c) => (
          <div key={c.label} className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{c.label}</p>
            {loading ? (
              <div className="h-6 w-20 bg-slate-200 rounded mt-2 animate-pulse" />
            ) : (
              <p className={`mt-1 text-xl font-extrabold font-mono ${c.color}`}>
                {c.value} <span className="text-xs font-bold text-slate-400">{c.unit}</span>
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white p-3 shadow-xs">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          {showTypeFilter &&
            [
              { id: 'all', label: 'All Orders' },
              { id: 'retail', label: 'Retail' },
              { id: 'project', label: 'Project' },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setTypeFilter(t.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer shrink-0 ${typeFilter === t.id ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
              >
                {t.label}
                <span
                  className={`ml-1.5 inline-flex min-w-[1.25rem] justify-center px-1.5 py-0.5 rounded-full text-[10px] font-bold ${typeFilter === t.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                    }`}
                >
                  {typeCounts[t.id]}
                </span>
              </button>
            ))}
        </div>
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search order ID, party, date..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 py-2 sm:py-1.5 text-xs text-slate-900 focus:border-[#a81b1e] focus:bg-white focus:outline-none"
          />
        </div>
      </div>

      {/* Report */}
      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-5 bg-slate-100 rounded animate-pulse" />
          ))}
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 sm:p-12 text-center shadow-xs">
          <p className="font-semibold text-slate-600">
            {searchTerm || typeFilter !== 'all' ? 'No pending orders match your search.' : 'No pending orders. Everything has been dispatched.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Mobile cards */}
          <div className="block md:hidden space-y-3">
            {pagedRows.map((r) => (
              <div key={r.key} className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-2xs space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono font-extrabold text-sm text-slate-900 break-all">{r.orderId}</p>
                    <p className="text-[11px] text-slate-400 font-mono mt-0.5">{fmtDate(r.date)}</p>
                  </div>
                  <TypeBadge row={r} />
                </div>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-bold text-slate-800 min-w-0">{r.party}</p>
                  <p className="text-[11px] text-slate-500 shrink-0 text-right">
                    Rate: <strong className="font-mono text-slate-900">{r.rate}</strong> / MT
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-2 p-2.5 rounded-lg bg-slate-50 border border-slate-100 text-xs">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">Order</span>
                    <span className="font-mono font-bold text-slate-900">{fmtQty(r.orderQty)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">Dispatched</span>
                    <span className="font-mono font-bold text-[#a81b1e]">{fmtQty(r.dispatchQty)}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">Pending</span>
                    <span className="font-mono font-black text-amber-700">{fmtQty(r.pendingQty)}</span>
                  </div>
                </div>
              </div>
            ))}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <Pagination
                currentPage={page}
                totalItems={filteredRows.length}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
                pageSizeOptions={[10, 25, 50]}
              />
            </div>
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-3.5">Order ID</th>
                    <th className="py-3 px-3.5">Order Date</th>
                    <th className="py-3 px-3.5">Party / Firm / Distributor</th>
                    <th className="py-3 px-3.5 text-right whitespace-nowrap">Rate / MT</th>
                    <th className="py-3 px-3.5 text-right">Order Qty (MT)</th>
                    <th className="py-3 px-3.5 text-right">Dispatch Qty (MT)</th>
                    <th className="py-3 px-3.5 text-right">Pending Qty (MT)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {pagedRows.map((r) => (
                    <tr key={r.key} className="hover:bg-slate-50/80">
                      <td className="py-3 px-3.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-900">{r.orderId}</span>
                          <TypeBadge row={r} />
                        </div>
                      </td>
                      <td className="py-3 px-3.5 font-mono text-slate-600 whitespace-nowrap">{fmtDate(r.date)}</td>
                      <td className="py-3 px-3.5 font-bold text-slate-800">
                        <span className="block max-w-xs truncate" title={r.party}>
                          {r.party}
                        </span>
                      </td>
                      <td className="py-3 px-3.5 text-right font-mono font-bold text-slate-900 whitespace-nowrap">{r.rate}</td>
                      <td className="py-3 px-3.5 text-right font-mono text-slate-900">{fmtQty(r.orderQty)}</td>
                      <td className="py-3 px-3.5 text-right font-mono text-[#a81b1e]">{fmtQty(r.dispatchQty)}</td>
                      <td className="py-3 px-3.5 text-right font-mono font-black text-amber-700">{fmtQty(r.pendingQty)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 border-t border-slate-200 font-bold">
                  <tr>
                    <td colSpan={4} className="py-3 px-3.5 text-slate-600">
                      Total ({filteredRows.length} orders)
                    </td>
                    <td className="py-3 px-3.5 text-right font-mono text-slate-900">{fmtQty(totals.orderQty)}</td>
                    <td className="py-3 px-3.5 text-right font-mono text-[#a81b1e]">{fmtQty(totals.dispatchQty)}</td>
                    <td className="py-3 px-3.5 text-right font-mono font-black text-amber-700">{fmtQty(totals.pendingQty)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <Pagination
              currentPage={page}
              totalItems={filteredRows.length}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              pageSizeOptions={[10, 25, 50, 100]}
            />
          </div>
        </div>
      )}
    </div>
  );
};
