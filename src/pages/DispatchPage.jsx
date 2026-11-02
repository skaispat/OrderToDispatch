import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { dispatchApi, formatIST } from '../api/dispatchApi';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { resolveBrandForUser } from '../data/constants';
import { BrandBadge } from '../components/common/BrandBadge';
import { Pagination } from '../components/common/Pagination';
import { Modal } from '../components/common/Modal';
import { Truck, Building2, AlertTriangle, RefreshCw, Search, User, CalendarDays, Eye } from 'lucide-react';

const fmtMT = (n) => `${(Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 })} MT`;
const fmtINR = (n) => (Number(n) > 0 ? `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—');

const DetailRow = ({ label, children }) => (
  <div className="flex justify-between gap-3 py-1.5 border-b border-slate-100 last:border-0">
    <span className="text-slate-500 font-medium shrink-0">{label}</span>
    <span className="font-semibold text-slate-900 text-right break-words">{children || '—'}</span>
  </div>
);

const TYPE_TABS = [
  { id: 'all', label: 'All' },
  { id: 'retail', label: 'Retail Orders' },
  { id: 'project', label: 'Project Orders' },
];

const TypeBadge = ({ type }) => (
  <span
    className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-extrabold border ${
      type === 'project' ? 'bg-purple-50 text-purple-800 border-purple-200' : 'bg-blue-50 text-blue-800 border-blue-200'
    }`}
  >
    {type === 'project' ? 'Project' : 'Retail'}
  </span>
);

export const DispatchPage = () => {
  const { selectedBrand, refreshKey } = useApp();
  const { user, firmAccess, isASM, isSalesPerson, isDistributor, distributorFirmId } = useAuth();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [typeTab, setTypeTab] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [detailRow, setDetailRow] = useState(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  const isSalesRole = isASM || isSalesPerson;
  const effectiveBrand = resolveBrandForUser(firmAccess, selectedBrand);
  // Same rule as the Orders page: these users only see dispatches of their own Sarthak orders
  const ownOrdersOnly = (isSalesRole || isDistributor) && Boolean(firmAccess?.ownSarthakOnly) && effectiveBrand === 'sarthak';

  // Retail / Project tabs only on the Sarthak view (and All Firms); JSW / ESSAR only have project orders
  const showTypeTabs = !ownOrdersOnly && (effectiveBrand === 'sarthak' || effectiveBrand === 'all');
  const activeType = showTypeTabs ? typeTab : 'all';

  const fetchDispatches = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await dispatchApi.getDispatchedOrders());
    } catch (err) {
      console.error('Error fetching dispatched orders:', err);
      setError(err?.message || 'Failed to load dispatched orders.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDispatches();
  }, [fetchDispatches, refreshKey]);

  // Firm / own-orders scope (same data the user can see on the Orders page)
  const scopedRows = useMemo(() => {
    return rows.filter((r) => {
      if (ownOrdersOnly) {
        if (r.type !== 'retail') return false;
        if (isSalesRole) return String(r.sales_person_id) === String(user?.emp_id);
        const ids = [distributorFirmId, user?.emp_id].filter(Boolean).map(String);
        return ids.includes(String(r.distributor_id));
      }
      return effectiveBrand === 'all' || r.brandId === effectiveBrand;
    });
  }, [rows, ownOrdersOnly, isSalesRole, user, distributorFirmId, effectiveBrand]);

  // Search + date filters (type tab applied separately so the tab counters follow these filters)
  const searchedRows = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    return scopedRows.filter((r) => {
      if (fromDate && (r.dispatch_date || '') < fromDate) return false;
      if (toDate && (r.dispatch_date || '') > toDate) return false;
      if (!q) return true;
      return (
        String(r.order_id).toLowerCase().includes(q) ||
        String(r.party).toLowerCase().includes(q) ||
        String(r.po_number).toLowerCase().includes(q) ||
        String(r.products).toLowerCase().includes(q) ||
        String(r.dealer || '').toLowerCase().includes(q) ||
        String(r.sales_person || '').toLowerCase().includes(q) ||
        String(r.submitted_by).toLowerCase().includes(q) ||
        String(r.id).includes(q)
      );
    });
  }, [scopedRows, fromDate, toDate, searchTerm]);

  const filteredRows = useMemo(
    () => (activeType === 'all' ? searchedRows : searchedRows.filter((r) => r.type === activeType)),
    [searchedRows, activeType]
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [activeType, searchTerm, fromDate, toDate, effectiveBrand]);

  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, currentPage, pageSize]);

  const tabCount = (id) => (id === 'all' ? searchedRows.length : searchedRows.filter((r) => r.type === id).length);
  const hasFilters = Boolean(searchTerm || fromDate || toDate);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-2xl font-extrabold text-slate-900">Dispatched Orders</h1>
          <p className="text-xs text-slate-500 font-medium">Every dispatch saved against retail and project orders</p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {firmAccess?.isRestricted && (
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-900 text-xs font-bold shadow-xs">
              <Building2 className="w-3.5 h-3.5 text-amber-700" />
              <span>Assigned Firm: {firmAccess.firmName}</span>
            </div>
          )}
          <button
            onClick={fetchDispatches}
            title="Refresh"
            className="p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#a81b1e]' : ''}`} />
          </button>
        </div>
      </div>

      {/* Error Alert Banner */}
      {error && (
        <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-red-200 bg-red-50 text-xs text-[#a81b1e]">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              <strong>Failed to load dispatched orders:</strong> {error}
            </span>
          </div>
          <button
            onClick={fetchDispatches}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#a81b1e] hover:bg-[#8e1518] text-white font-bold transition cursor-pointer shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200/80 bg-white p-3 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {showTypeTabs ? (
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {TYPE_TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTypeTab(t.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer shrink-0 ${
                  typeTab === t.id ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                {t.label}
                <span
                  className={`ml-1.5 inline-flex min-w-[1.25rem] justify-center px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                    typeTab === t.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {loading && rows.length === 0 ? '–' : tabCount(t.id)}
                </span>
              </button>
            ))}
          </div>
          ) : (
            <p className="text-xs font-bold text-slate-700">
              {searchedRows.length} dispatch{searchedRows.length === 1 ? '' : 'es'}
            </p>
          )}
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search order ID, party, PO, product..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 py-2 sm:py-1.5 text-xs text-slate-900 focus:border-[#a81b1e] focus:bg-white focus:outline-none"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <CalendarDays className="w-4 h-4 text-slate-400" />
          <label className="flex items-center gap-1.5 text-slate-600 font-semibold">
            From
            <input
              type="date"
              value={fromDate}
              max={toDate || undefined}
              onChange={(e) => setFromDate(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 focus:border-[#a81b1e] focus:outline-none"
            />
          </label>
          <label className="flex items-center gap-1.5 text-slate-600 font-semibold">
            To
            <input
              type="date"
              value={toDate}
              min={fromDate || undefined}
              onChange={(e) => setToDate(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 focus:border-[#a81b1e] focus:outline-none"
            />
          </label>
          {hasFilters && (
            <button
              onClick={() => {
                setSearchTerm('');
                setFromDate('');
                setToDate('');
              }}
              className="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 cursor-pointer"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* List */}
      {loading && rows.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-xs text-slate-400 shadow-xs">
          Loading dispatched orders...
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 sm:p-12 text-center text-slate-400 shadow-xs">
          <Truck className="w-10 h-10 mx-auto mb-2 text-slate-300" />
          <p className="font-semibold text-slate-600">
            {hasFilters || activeType !== 'all' ? 'No dispatches match these filters.' : 'No orders have been dispatched yet.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Mobile cards */}
          <div className="block md:hidden space-y-3">
            {paginatedRows.map((r) => (
              <div key={r.id} className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-2xs space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-extrabold text-sm text-slate-900 font-mono truncate">{r.order_id}</p>
                    <p className="text-[11px] text-slate-400">Dispatch #{r.id} &bull; {r.dispatch_date}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <TypeBadge type={r.type} />
                    <BrandBadge brandId={r.brandId} />
                  </div>
                </div>

                <div className="space-y-1 text-xs">
                  {r.party && (
                    <div className="flex items-center gap-1.5 text-slate-800 font-bold">
                      <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{r.party}</span>
                    </div>
                  )}
                  <div className="flex justify-between gap-2 text-slate-500">
                    <span>
                      PO: <strong className="text-slate-800 font-mono">{r.po_number || '—'}</strong>
                    </span>
                    <span>
                      Value: <strong className="text-slate-800">{fmtINR(r.order_value)}</strong>
                    </span>
                  </div>
                  {r.products && <p className="text-[11px] text-slate-500 truncate">{r.products}</p>}
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="p-2 rounded-lg bg-slate-50 border border-slate-100">
                    <span className="text-[10px] text-slate-500 font-bold uppercase block">Order</span>
                    <p className="font-bold text-slate-900">{fmtMT(r.order_qty)}</p>
                  </div>
                  <div className="p-2 rounded-lg bg-red-50 border border-red-200">
                    <span className="text-[10px] text-[#a81b1e] font-bold uppercase block">Dispatched</span>
                    <p className="font-black text-[#a81b1e]">{fmtMT(r.dispatch_qty)}</p>
                  </div>
                  <div className="p-2 rounded-lg bg-amber-50 border border-amber-200">
                    <span className="text-[10px] text-amber-700 font-bold uppercase block">Pending</span>
                    <p className="font-bold text-amber-800">{fmtMT(r.pending_qty)}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
                  <p className="text-[11px] text-slate-500 min-w-0 truncate">
                    By <strong className="text-slate-700">{r.submitted_by || '—'}</strong> &bull; {formatIST(r.created_at)}
                  </p>
                  <button
                    onClick={() => setDetailRow(r)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs transition cursor-pointer shrink-0"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    View
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-3.5 whitespace-nowrap">Dispatch Date</th>
                    <th className="py-3 px-3.5">Order</th>
                    <th className="py-3 px-3.5">Party / Distributor</th>
                    <th className="py-3 px-3.5 whitespace-nowrap">PO Number</th>
                    <th className="py-3 px-3.5">Products</th>
                    <th className="py-3 px-3.5 text-right whitespace-nowrap">Order Value</th>
                    <th className="py-3 px-3.5 text-right whitespace-nowrap">Order Qty</th>
                    <th className="py-3 px-3.5 text-right">Dispatched</th>
                    <th className="py-3 px-3.5 text-right whitespace-nowrap">Pending After</th>
                    <th className="py-3 px-3.5 whitespace-nowrap">Submitted By</th>
                    <th className="py-3 px-3.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedRows.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/80 transition">
                      <td className="py-3 px-3.5">
                        <p className="font-bold text-slate-900 font-mono">{r.dispatch_date || '—'}</p>
                        <p className="text-[10px] text-slate-400">#{r.id}</p>
                      </td>
                      <td className="py-3 px-3.5">
                        <p className="font-bold text-slate-900 font-mono whitespace-nowrap">{r.order_id}</p>
                        <p className="text-[10px] text-slate-400 font-mono">Ordered {r.order_date || '—'}</p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <TypeBadge type={r.type} />
                          <BrandBadge brandId={r.brandId} />
                        </div>
                      </td>
                      <td className="py-3 px-3.5">
                        <p className="font-semibold text-slate-800 truncate max-w-[180px]">{r.party || '—'}</p>
                        {r.type === 'retail' && (
                          <p className="text-[10px] text-slate-400 truncate max-w-[180px]">Dealer: {r.dealer || 'Self'}</p>
                        )}
                      </td>
                      <td className="py-3 px-3.5 font-mono text-slate-700 whitespace-nowrap">{r.po_number || '—'}</td>
                      <td className="py-3 px-3.5 text-slate-600">
                        <span className="block truncate max-w-[200px] text-[11px]" title={r.products}>
                          {r.products || '—'}
                        </span>
                      </td>
                      <td className="py-3 px-3.5 text-right font-mono font-bold text-slate-900 whitespace-nowrap">{fmtINR(r.order_value)}</td>
                      <td className="py-3 px-3.5 text-right font-mono text-slate-700">{fmtMT(r.order_qty)}</td>
                      <td className="py-3 px-3.5 text-right font-mono font-black text-[#a81b1e]">{fmtMT(r.dispatch_qty)}</td>
                      <td className="py-3 px-3.5 text-right font-mono font-bold text-amber-700">{fmtMT(r.pending_qty)}</td>
                      <td className="py-3 px-3.5">
                        <p className="font-semibold text-slate-800">{r.submitted_by || '—'}</p>
                        <p className="text-[10px] text-slate-400 whitespace-nowrap">{formatIST(r.created_at)}</p>
                      </td>
                      <td className="py-3 px-3.5 text-right">
                        <button
                          onClick={() => setDetailRow(r)}
                          className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] transition cursor-pointer"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              currentPage={currentPage}
              totalItems={filteredRows.length}
              pageSize={pageSize}
              onPageChange={(page) => setCurrentPage(page)}
              onPageSizeChange={(size) => setPageSize(size)}
              pageSizeOptions={[10, 15, 25, 50, 100]}
            />
          </div>

          <div className="block md:hidden bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <Pagination
              currentPage={currentPage}
              totalItems={filteredRows.length}
              pageSize={pageSize}
              onPageChange={(page) => setCurrentPage(page)}
              onPageSizeChange={(size) => setPageSize(size)}
              pageSizeOptions={[10, 15, 25, 50]}
            />
          </div>
        </div>
      )}

      {/* Full order + dispatch details */}
      <Modal
        isOpen={Boolean(detailRow)}
        onClose={() => setDetailRow(null)}
        title={detailRow ? `Dispatch #${detailRow.id} - ${detailRow.order_id}` : ''}
        maxWidth="max-w-2xl"
      >
        {detailRow && (
          <div className="space-y-4 text-xs">
            <div className="flex flex-wrap items-center gap-1.5">
              <TypeBadge type={detailRow.type} />
              <BrandBadge brandId={detailRow.brandId} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <section className="rounded-xl border border-slate-200 p-3">
                <h3 className="text-[11px] font-extrabold uppercase text-slate-500 mb-1">Order Details</h3>
                <DetailRow label="Order ID">
                  <span className="font-mono">{detailRow.order_id}</span>
                </DetailRow>
                <DetailRow label="Order Date">{detailRow.order_date}</DetailRow>
                <DetailRow label="Brand">{detailRow.brand_name}</DetailRow>
                <DetailRow label={detailRow.type === 'project' ? 'Party / Client' : 'Distributor'}>{detailRow.party}</DetailRow>
                {detailRow.type === 'retail' && <DetailRow label="Dealer">{detailRow.dealer}</DetailRow>}
                {detailRow.type === 'retail' && <DetailRow label="Sales Person">{detailRow.sales_person}</DetailRow>}
                <DetailRow label="PO Number">
                  <span className="font-mono">{detailRow.po_number}</span>
                </DetailRow>
                {detailRow.type === 'retail' && <DetailRow label="Product">{detailRow.products}</DetailRow>}
                {detailRow.type === 'retail' && detailRow.rate > 0 && (
                  <DetailRow label="Rate">{fmtINR(detailRow.rate)} / MT</DetailRow>
                )}
                {detailRow.specification && <DetailRow label="Specification">{detailRow.specification}</DetailRow>}
                <DetailRow label="Order Value">{fmtINR(detailRow.order_value)}</DetailRow>
              </section>

              <section className="rounded-xl border border-red-200 bg-red-50/30 p-3">
                <h3 className="text-[11px] font-extrabold uppercase text-[#a81b1e] mb-1">Dispatch Details</h3>
                <DetailRow label="Dispatch No.">#{detailRow.id}</DetailRow>
                <DetailRow label="Dispatch Date">{detailRow.dispatch_date}</DetailRow>
                <DetailRow label="Order Qty">{fmtMT(detailRow.order_qty)}</DetailRow>
                <DetailRow label="Dispatched">
                  <span className="text-[#a81b1e]">{fmtMT(detailRow.dispatch_qty)}</span>
                </DetailRow>
                <DetailRow label="Pending After">
                  <span className="text-amber-700">{fmtMT(detailRow.pending_qty)}</span>
                </DetailRow>
                <DetailRow label="Submitted By">{detailRow.submitted_by}</DetailRow>
                <DetailRow label="Entry Time (IST)">{formatIST(detailRow.created_at)}</DetailRow>
              </section>
            </div>

            {detailRow.items?.length > 0 && (
              <section className="space-y-1.5">
                <h3 className="text-[11px] font-extrabold uppercase text-slate-500">Products</h3>
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-left text-[11px]">
                    <thead className="bg-slate-50 font-bold uppercase text-slate-500">
                      <tr>
                        <th className="py-2 px-3">Product</th>
                        <th className="py-2 px-3">Size</th>
                        <th className="py-2 px-3 text-right">Qty</th>
                        <th className="py-2 px-3 text-right">Rate</th>
                        <th className="py-2 px-3 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {detailRow.items.map((it, idx) => (
                        <tr key={idx}>
                          <td className="py-2 px-3 font-semibold text-slate-800">{it.product}</td>
                          <td className="py-2 px-3 text-slate-600">{it.size || '—'}</td>
                          <td className="py-2 px-3 text-right font-mono">{fmtMT(it.qty)}</td>
                          <td className="py-2 px-3 text-right font-mono">{fmtINR(it.rate)}</td>
                          <td className="py-2 px-3 text-right font-mono font-bold">{fmtINR(it.qty * it.rate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};
