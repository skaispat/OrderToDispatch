import { useState, useEffect, useMemo, useCallback } from 'react';
import { Pagination } from '../components/common/Pagination';
import { trackingHistoryApi } from '../api/trackingHistoryApi';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import {
  Search,
  AlertTriangle,
  RefreshCw,
  Download,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  MapPin,
  User,
} from 'lucide-react';

// Daily report of sales visits from tracking_history.
// Columns that are never filled in tracking_history (next_date_of_call, payment_yes_no, sales_person_id)
// are not shown; latitude / longitude are shown as one map link.

const pad = (n) => String(n).padStart(2, '0');
const toISODate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayISO = () => toISODate(new Date());

const shiftDay = (iso, days) => {
  const [y, m, d] = iso.split('-').map(Number);
  return toISODate(new Date(y, m - 1, d + days));
};

const fmtDate = (iso) => {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return y && m && d ? `${d}-${m}-${y}` : String(iso);
};

const fmtDayHeading = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', {
    weekday: 'long',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const fmtTime = (ts) => {
  if (!ts) return '—';
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true });
};

// Text columns can hold blanks or the literal text "null"
const clean = (v) => {
  const t = v === null || v === undefined ? '' : String(v).trim();
  return t.toLowerCase() === 'null' ? '' : t;
};

const num = (v) => {
  const n = parseFloat(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

const mapUrl = (v) => {
  const lat = parseFloat(v.latitude);
  const lng = parseFloat(v.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) ? `https://www.google.com/maps?q=${lat},${lng}` : null;
};

const STATUS_STYLES = {
  hot: 'bg-red-50 text-[#a81b1e] border-red-200',
  warm: 'bg-amber-50 text-amber-800 border-amber-200',
  cold: 'bg-sky-50 text-sky-800 border-sky-200',
};

const StatusPill = ({ status }) => {
  if (!status) return <span className="text-slate-400">—</span>;
  const style = STATUS_STYLES[status.toLowerCase()] || 'bg-slate-50 text-slate-700 border-slate-200';
  return <span className={`inline-flex px-1.5 py-0.5 rounded border text-[10px] font-bold whitespace-nowrap ${style}`}>{status}</span>;
};

export const DailySalesVisitPage = () => {
  const { refreshKey } = useApp();
  const { user, isSuperAdmin, isASM, isSalesPerson } = useAuth();

  // Sales staff see their own visits; everyone else with access sees all visits (same as Sales Visits)
  const isAdminView = isSuperAdmin || !(isASM || isSalesPerson);
  const userName = user?.full_name || user?.username || '';

  const [day, setDay] = useState(todayISO());
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [salesPersons, setSalesPersons] = useState([]);
  const [selectedPerson, setSelectedPerson] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [lastVisitDay, setLastVisitDay] = useState(null);

  const personFilter = isAdminView ? (selectedPerson !== 'all' ? selectedPerson : undefined) : userName;

  const loadDay = useCallback(async () => {
    setLoading(true);
    setError(null);
    setLastVisitDay(null);
    try {
      const rows = await trackingHistoryApi.getVisits({ date: day, salesPersonName: personFilter });
      // Paged reads can return a row twice if visits are added while loading
      const seen = new Set();
      const unique = (rows || []).filter((v) => !seen.has(v.id) && seen.add(v.id));
      setVisits(unique);

      // Nothing on this day: find the latest day with visits so the user can jump to it
      if (unique.length === 0) {
        const latest = await trackingHistoryApi
          .getVisits({ salesPersonName: personFilter, limit: 1 })
          .catch(() => []);
        const ts = latest?.[0]?.created_at;
        if (ts) setLastVisitDay(toISODate(new Date(ts)));
      }
    } catch (err) {
      console.error('[DailySalesVisitPage] load error:', err);
      setError(err?.message || 'Failed to load sales visits.');
      setVisits([]);
    } finally {
      setLoading(false);
    }
  }, [day, personFilter]);

  useEffect(() => {
    loadDay();
  }, [loadDay, refreshKey]);

  useEffect(() => {
    if (!isAdminView) return;
    trackingHistoryApi.getSalesPersonsList().then(setSalesPersons).catch(() => setSalesPersons([]));
  }, [isAdminView, refreshKey]);

  useEffect(() => {
    setPage(1);
  }, [day, selectedPerson, searchTerm]);

  // Rows prepared for display (oldest visit of the day first)
  const rows = useMemo(
    () =>
      visits
        .map((v) => ({
          id: v.id,
          time: fmtTime(v.created_at),
          createdAt: v.created_at,
          salesPerson: clean(v.sales_person_name),
          type: clean(v.select_value),
          name: clean(v.deler_distributer_site_name),
          code: clean(v.dealer_code),
          area: clean(v.area_name),
          stage: clean(v.stage),
          status: clean(v.status),
          lastCall: clean(v.last_date_of_call),
          customerSays: clean(v.what_did_customer_says),
          nextAction: clean(v.next_action),
          orderQty: clean(v.order_qty),
          products: clean(v.order_products),
          orderValue: clean(v.value_of_order),
          map: mapUrl(v),
        }))
        .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))),
    [visits]
  );

  const filteredRows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.salesPerson, r.type, r.name, r.code, r.area, r.stage, r.status, r.customerSays, r.nextAction, r.products]
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [rows, searchTerm]);

  const pagedRows = useMemo(
    () => filteredRows.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize),
    [filteredRows, page, pageSize]
  );

  // Visits per sales person for the day
  const perPerson = useMemo(() => {
    const map = new Map();
    for (const r of filteredRows) {
      const key = r.salesPerson || 'Unknown';
      const cur = map.get(key) || { name: key, visits: 0, orders: 0, qty: 0 };
      cur.visits += 1;
      if (num(r.orderQty) > 0) {
        cur.orders += 1;
        cur.qty += num(r.orderQty);
      }
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.visits - a.visits);
  }, [filteredRows]);

  const exportCsv = () => {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = [
      'Date', 'Time', 'Sales Person', 'Type', 'Dealer / Distributor / Site', 'Dealer Code', 'Area', 'Stage', 'Status',
      'Last Call Date', 'Customer Says', 'Next Action', 'Order Qty', 'Order Products', 'Order Value', 'Location',
    ];
    const lines = filteredRows.map((r) =>
      [
        fmtDate(day), r.time, r.salesPerson, r.type, r.name, r.code, r.area, r.stage, r.status,
        r.lastCall ? fmtDate(r.lastCall) : '', r.customerSays, r.nextAction, r.orderQty, r.products, r.orderValue, r.map || '',
      ]
        .map(esc)
        .join(',')
    );
    const csv = '﻿' + [header.map(esc).join(','), ...lines].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `daily-sales-visit-${day}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const isToday = day === todayISO();
  const dash = <span className="text-slate-400">—</span>;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-2xl font-extrabold text-slate-900 tracking-tight leading-tight">Daily Sales Visit</h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            {isAdminView ? 'Dealer, distributor and site visits.' : `Your visits, day by day (${userName})`}
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

      {/* Day picker */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white p-3 shadow-xs">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDay((d) => shiftDay(d, -1))}
            title="Previous day"
            className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <CalendarDays className="w-4 h-4 text-[#a81b1e] shrink-0" />
            <input
              type="date"
              value={day}
              max={todayISO()}
              onChange={(e) => e.target.value && setDay(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-bold text-slate-900 focus:border-[#a81b1e] focus:outline-none"
            />
          </div>
          <button
            onClick={() => setDay((d) => shiftDay(d, 1))}
            disabled={isToday}
            title="Next day"
            className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          {!isToday && (
            <button
              onClick={() => setDay(todayISO())}
              className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-[#a81b1e] bg-red-50 border border-red-200 hover:bg-red-100 cursor-pointer"
            >
              Today
            </button>
          )}
          <span className="hidden lg:inline text-xs font-semibold text-slate-500 ml-1">{fmtDayHeading(day)}</span>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
          {isAdminView && (
            <select
              value={selectedPerson}
              onChange={(e) => setSelectedPerson(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 sm:py-1.5 text-xs text-slate-900 focus:border-[#a81b1e] focus:outline-none"
            >
              <option value="all">All Sales Persons</option>
              {salesPersons.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          )}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search dealer, area, stage..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 py-2 sm:py-1.5 text-xs text-slate-900 focus:border-[#a81b1e] focus:bg-white focus:outline-none"
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-red-200 bg-red-50 text-xs text-[#a81b1e]">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              <strong>Failed to load visits:</strong> {error}
            </span>
          </div>
          <button
            onClick={loadDay}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#a81b1e] hover:bg-[#8e1518] text-white font-bold transition cursor-pointer shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        </div>
      )}

      {/* Per sales person */}
      {!loading && isAdminView && perPerson.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {perPerson.map((p) => (
            <button
              key={p.name}
              onClick={() => setSelectedPerson(p.name === 'Unknown' ? 'all' : p.name)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs shadow-2xs hover:border-[#a81b1e] cursor-pointer"
              title="Show only this sales person"
            >
              <User className="w-3.5 h-3.5 text-slate-400" />
              <span className="font-bold text-slate-900">{p.name}</span>
              <span className="text-slate-500">
                {p.visits} visit{p.visits === 1 ? '' : 's'}
                {p.orders > 0 && ` · ${p.orders} order${p.orders === 1 ? '' : 's'} (${p.qty.toLocaleString('en-IN')} MT)`}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Visits */}
      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-5 bg-slate-100 rounded animate-pulse" />
          ))}
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 sm:p-12 text-center shadow-xs space-y-3">
          <p className="font-semibold text-slate-600">
            {searchTerm ? 'No visits match your search on this day.' : `No sales visits on ${fmtDayHeading(day)}.`}
          </p>
          {!searchTerm && lastVisitDay && lastVisitDay !== day && (
            <button
              onClick={() => setDay(lastVisitDay)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#a81b1e] hover:bg-[#8e1518] text-white text-xs font-bold cursor-pointer"
            >
              <CalendarDays className="w-3.5 h-3.5" />
              Go to last visit day ({fmtDate(lastVisitDay)})
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {/* Mobile cards */}
          <div className="block md:hidden space-y-3">
            {pagedRows.map((r) => (
              <div key={r.id} className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-2xs space-y-2.5 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-extrabold text-sm text-slate-900 break-words">{r.name || '—'}</p>
                    <p className="text-[11px] text-slate-500">
                      {[r.type, r.code, r.area].filter(Boolean).join(' · ') || '—'}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="font-mono text-[11px] text-slate-500">{r.time}</span>
                    <StatusPill status={r.status} />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600">
                  {isAdminView && r.salesPerson && (
                    <span>
                      By <strong className="text-slate-800">{r.salesPerson}</strong>
                    </span>
                  )}
                  {r.stage && (
                    <span>
                      Stage: <strong className="text-slate-800">{r.stage}</strong>
                    </span>
                  )}
                  {r.lastCall && <span>Last call: {fmtDate(r.lastCall)}</span>}
                </div>
                {r.customerSays && (
                  <p className="p-2 rounded-lg bg-slate-50 border border-slate-100 text-slate-700">
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">Customer says</span>
                    {r.customerSays}
                  </p>
                )}
                {r.nextAction && (
                  <p className="text-slate-700">
                    <span className="font-bold text-slate-500">Next action:</span> {r.nextAction}
                  </p>
                )}
                {(r.orderQty || r.products || r.orderValue) && (
                  <p className="p-2 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-900">
                    <span className="font-bold">Order:</span> {r.orderQty ? `${r.orderQty} MT` : ''} {r.products}
                    {r.orderValue && ` · ₹${num(r.orderValue).toLocaleString('en-IN')}`}
                  </p>
                )}
                {r.map && (
                  <a
                    href={r.map}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-[#a81b1e] hover:underline"
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    View location
                  </a>
                )}
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
                    <th className="py-3 px-3 whitespace-nowrap">Time</th>
                    {isAdminView && <th className="py-3 px-3 whitespace-nowrap">Sales Person</th>}
                    <th className="py-3 px-3">Dealer / Distributor / Site</th>
                    <th className="py-3 px-3">Area</th>
                    <th className="py-3 px-3">Stage</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3 whitespace-nowrap">Last Call</th>
                    <th className="py-3 px-3">Customer Says</th>
                    <th className="py-3 px-3">Next Action</th>
                    <th className="py-3 px-3">Order</th>
                    <th className="py-3 px-3 text-center">Location</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {pagedRows.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/80 align-top">
                      <td className="py-3 px-3 font-mono text-slate-600 whitespace-nowrap">{r.time}</td>
                      {isAdminView && (
                        <td className="py-3 px-3 font-bold text-slate-800 whitespace-nowrap">{r.salesPerson || dash}</td>
                      )}
                      <td className="py-3 px-3">
                        <p className="font-bold text-slate-900 max-w-[14rem] break-words">{r.name || '—'}</p>
                        <p className="text-[10px] text-slate-500">{[r.type, r.code].filter(Boolean).join(' · ')}</p>
                      </td>
                      <td className="py-3 px-3 text-slate-700 max-w-[10rem] break-words">{r.area || dash}</td>
                      <td className="py-3 px-3 text-slate-700 whitespace-nowrap">{r.stage || dash}</td>
                      <td className="py-3 px-3">
                        <StatusPill status={r.status} />
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-600 whitespace-nowrap">
                        {r.lastCall ? fmtDate(r.lastCall) : dash}
                      </td>
                      <td className="py-3 px-3 text-slate-700 max-w-[14rem] break-words">{r.customerSays || dash}</td>
                      <td className="py-3 px-3 text-slate-700 max-w-[10rem] break-words">{r.nextAction || dash}</td>
                      <td className="py-3 px-3 text-slate-700">
                        {r.orderQty || r.products || r.orderValue ? (
                          <div className="whitespace-nowrap">
                            {r.orderQty && <p className="font-mono font-bold text-emerald-700">{r.orderQty} MT</p>}
                            {r.products && <p className="text-[11px]">{r.products}</p>}
                            {r.orderValue && (
                              <p className="font-mono text-[11px] text-slate-500">₹{num(r.orderValue).toLocaleString('en-IN')}</p>
                            )}
                          </div>
                        ) : (
                          dash
                        )}
                      </td>
                      <td className="py-3 px-3 text-center">
                        {r.map ? (
                          <a
                            href={r.map}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Open visit location in Google Maps"
                            className="inline-flex p-1.5 rounded-lg text-[#a81b1e] hover:bg-red-50"
                          >
                            <MapPin className="w-4 h-4" />
                          </a>
                        ) : (
                          dash
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
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
