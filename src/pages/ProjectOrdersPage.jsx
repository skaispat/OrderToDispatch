import React, { useState, useEffect, useMemo } from 'react';
import { projectOrdersApi } from '../api/projectOrdersApi';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { CreateProjectOrderModal } from '../components/projectOrders/CreateProjectOrderModal';
import { ProjectOrderDetailModal } from '../components/projectOrders/ProjectOrderDetailModal';
import { StatusBadge } from '../components/common/StatusBadge';
import { Pagination } from '../components/common/Pagination';
import {
  Building,
  Plus,
  Search,
  FileText,
  User,
  Layers,
  Calendar,
  Eye,
  Package,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';

export const ProjectOrdersPage = () => {
  const { user, firmAccess, canEdit } = useAuth();
  const canCreateOrders = canEdit('orders');
  const { refreshKey } = useApp();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);

  const loadOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await projectOrdersApi.getProjectOrders(firmAccess?.firmId);
      setOrders(data || []);
    } catch (err) {
      console.error('Error loading project orders:', err);
      setError(err?.message || 'Failed to load project orders. Please check network connection.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, [firmAccess?.firmId, refreshKey]);

  // 3 tabs as requested by user
  const statuses = [
    { id: 'all', label: 'All Orders' },
    { id: 'pending', label: 'Pending Orders' },
    { id: 'delivered', label: 'Delivered Orders' },
  ];

  const isJSWFirm = Number(firmAccess?.firmId) === 2;
  const isEssarFirm =
    [3, 6].includes(Number(firmAccess?.firmId));
  const hideSpecificationColumn = isJSWFirm || isEssarFirm;
  const hidePartyColumn =
    [2, 6].includes(Number(firmAccess?.firmId)) ||
    isEssarFirm ||
    isJSWFirm;

  // Filtering
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      // Status filter
      if (statusFilter !== 'all') {
        const orderStatus = (o.status || 'pending').toLowerCase();
        if (statusFilter === 'pending' && orderStatus !== 'pending') return false;
        if (statusFilter === 'delivered' && orderStatus !== 'delivered') return false;
      }

      // Search filter
      if (!searchTerm) return true;
      const q = searchTerm.toLowerCase();
      const party = (o.party_name || '').toLowerCase();
      const po = (o.po_number || '').toLowerCase();
      const orderId = (o.order_id || '').toLowerCase();
      const subtype = (o.product_details?.subtype || o.product_details?.brand || '').toLowerCase();
      const spec = (o.specification || o.product_details?.specification || o.product_details?.remarks || '').toLowerCase();
      const itemsStr = (o.items || [])
        .map((it) => `${it.productName} ${it.size}`)
        .join(' ')
        .toLowerCase();

      return (
        (!hidePartyColumn && party.includes(q)) ||
        po.includes(q) ||
        orderId.includes(q) ||
        subtype.includes(q) ||
        spec.includes(q) ||
        itemsStr.includes(q)
      );
    });
  }, [orders, statusFilter, searchTerm, hidePartyColumn]);

  // Reset to first page when search/filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, searchTerm]);

  // Paginated project orders
  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredOrders.slice(start, start + pageSize);
  }, [filteredOrders, currentPage, pageSize]);

  // Summary Metrics
  const totalTonnage = orders.reduce((acc, o) => acc + (o.total_qty || 0), 0);
  const totalValue = orders.reduce((acc, o) => acc + (o.total_value || 0), 0);
  const uniqueParties = new Set(orders.map((o) => o.party_name).filter(Boolean)).size;

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              Project Orders
            </h1>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200">
              Manager: {user?.full_name || user?.username}
            </span>

          </div>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Direct client purchase orders and project indents managed for {firmAccess?.firmName || 'your assigned firm'}
          </p>
        </div>

        {canCreateOrders && (
          <button
            onClick={() => setIsCreateOpen(true)}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-[#a81b1e] hover:bg-[#8e1518] px-4 py-2 text-xs font-bold text-white shadow-xs transition cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            New Project Order
          </button>
        )}
      </div>

      {/* Error Alert Banner */}
      {error && (
        <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-red-200 bg-red-50 text-xs text-[#a81b1e]">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span><strong>Failed to load project orders:</strong> {error}</span>
          </div>
          <button
            onClick={() => loadOrders()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#a81b1e] hover:bg-[#8e1518] text-white font-bold transition cursor-pointer shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="p-3 sm:p-4 rounded-xl border border-slate-200 bg-white shadow-xs animate-pulse">
              <div className="flex items-center justify-between mb-2">
                <div className="h-3 w-16 sm:w-20 bg-slate-200 rounded" />
                <div className="w-4 h-4 bg-slate-200 rounded" />
              </div>
              <div className="h-6 sm:h-7 w-20 sm:w-28 bg-slate-200 rounded mt-1.5" />
            </div>
          ))
        ) : (
          <>
            <div className="p-3 sm:p-4 rounded-xl border border-slate-200 bg-white shadow-xs">
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="text-[10px] font-bold uppercase">Total Orders</span>
                <Package className="w-4 h-4 text-slate-400" />
              </div>
              <p className="text-lg sm:text-2xl font-black text-slate-900">{orders.length}</p>
            </div>

            <div className="p-3 sm:p-4 rounded-xl border border-slate-200 bg-white shadow-xs">
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="text-[10px] font-bold uppercase">Total Booked MT</span>
                <Layers className="w-4 h-4 text-[#a81b1e]" />
              </div>
              <p className="text-lg sm:text-2xl font-black text-slate-900">
                {totalTonnage.toFixed(2)}{' '}
                <span className="text-xs font-semibold text-slate-500">MT</span>
              </p>
            </div>

            <div className="p-3 sm:p-4 rounded-xl border border-slate-200 bg-white shadow-xs">
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="text-[10px] font-bold uppercase">Total Order Value</span>
                <Building className="w-4 h-4 text-emerald-600" />
              </div>
              <p className="text-lg sm:text-2xl font-black text-emerald-600">
                ₹{' '}
                {totalValue >= 10000000
                  ? `${(totalValue / 10000000).toFixed(2)} Cr`
                  : totalValue >= 100000
                    ? `${(totalValue / 100000).toFixed(2)} L`
                    : totalValue.toLocaleString('en-IN')}
              </p>
            </div>

            <div className="p-3 sm:p-4 rounded-xl border border-slate-200 bg-white shadow-xs">
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="text-[10px] font-bold uppercase">
                  {hidePartyColumn ? 'Total Lines' : 'Client Accounts'}
                </span>
                {hidePartyColumn ? <Layers className="w-4 h-4 text-blue-500" /> : <User className="w-4 h-4 text-blue-500" />}
              </div>
              <p className="text-lg sm:text-2xl font-black text-slate-900">
                {hidePartyColumn
                  ? orders.reduce((sum, o) => sum + (o.items?.length || 1), 0)
                  : uniqueParties}
              </p>
            </div>
          </>
        )}
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white p-3 shadow-xs">
        {/* Status Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 scrollbar-none">
          {statuses.map((s) => (
            <button
              key={s.id}
              onClick={() => setStatusFilter(s.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer shrink-0 ${statusFilter === s.id
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Search Bar */}
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder={hidePartyColumn ? 'Search PO #, order ID, specification...' : 'Search party, PO #, order ID...'}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 py-1.5 text-xs text-slate-900 focus:border-[#a81b1e] focus:bg-white focus:outline-none"
          />
        </div>
      </div>

      {/* Responsive Project Orders View */}
      {loading ? (
        <div className="space-y-3">
          {/* Mobile Loading Skeleton */}
          <div className="block md:hidden space-y-3">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} className="p-4 rounded-xl border border-slate-200 bg-white animate-pulse space-y-3">
                <div className="flex items-center justify-between">
                  <div className="h-4 w-28 bg-slate-200 rounded" />
                  <div className="h-5 w-16 bg-slate-200 rounded-full" />
                </div>
                <div className="h-3 w-40 bg-slate-100 rounded" />
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <div className="h-8 bg-slate-100 rounded" />
                  <div className="h-8 bg-slate-100 rounded" />
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Loading Skeleton */}
          <div className="hidden md:block overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-3 px-3.5">Order ID & Date</th>
                  {!hidePartyColumn && <th className="py-3 px-3.5">Party / Client Name</th>}
                  <th className="py-3 px-3.5">PO Number</th>
                  <th className="py-3 px-3.5">{hideSpecificationColumn ? 'Brand / Series' : 'Specification'}</th>
                  <th className="py-3 px-3.5">Products Summary</th>
                  <th className="py-3 px-3.5 text-right">Tonnage</th>
                  <th className="py-3 px-3.5 text-right">Total Value</th>
                  <th className="py-3 px-3.5 text-center">Status</th>
                  <th className="py-3 px-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {Array.from({ length: 5 }).map((_, idx) => (
                  <tr key={idx} className="animate-pulse">
                    <td className="py-3 px-3.5"><div className="h-3.5 w-24 bg-slate-200 rounded mb-1.5" /><div className="h-2.5 w-16 bg-slate-100 rounded" /></td>
                    {!hidePartyColumn && <td className="py-3 px-3.5"><div className="h-3.5 w-28 bg-slate-200 rounded" /></td>}
                    <td className="py-3 px-3.5"><div className="h-3.5 w-16 bg-slate-100 rounded font-mono" /></td>
                    <td className="py-3 px-3.5"><div className="h-5 w-20 bg-slate-200 rounded" /></td>
                    <td className="py-3 px-3.5"><div className="h-3.5 w-36 bg-slate-100 rounded" /></td>
                    <td className="py-3 px-3.5 text-right"><div className="h-3.5 w-14 bg-slate-200 rounded ml-auto" /></td>
                    <td className="py-3 px-3.5 text-right"><div className="h-3.5 w-16 bg-slate-200 rounded ml-auto" /></td>
                    <td className="py-3 px-3.5 text-center"><div className="h-4 w-14 bg-slate-100 rounded mx-auto" /></td>
                    <td className="py-3 px-3.5 text-right"><div className="h-6 w-12 bg-slate-200 rounded ml-auto" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 sm:p-12 text-center text-slate-400 shadow-xs">
          <p className="font-semibold text-slate-600">
            {searchTerm
              ? 'No project orders found matching criteria.'
              : `No project orders registered under ${firmAccess?.firmName || 'your firm'} yet.`}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {searchTerm ? 'Try adjusting your search terms' : 'Click "New Project Order" to create one.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Mobile Card List (Visible on screens < 768px) */}
          <div className="block md:hidden space-y-3">
            {paginatedOrders.map((o) => {
              const items = o.items || [];
              const previewItems = items
                .slice(0, 2)
                .map((it) => `${it.productName} (${it.size})`)
                .join(', ');
              const orderSubtype = o.product_details?.subtype || o.product_details?.brand || (isEssarFirm ? 'ESSAR Steel' : isJSWFirm ? 'JSW One' : null);

              return (
                <div
                  key={o.id}
                  className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-2xs space-y-3 transition hover:border-slate-300"
                >
                  {/* Card Header: Order ID & Status */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <button
                        onClick={() => setSelectedOrder(o)}
                        className="text-left font-extrabold text-sm text-slate-900 hover:text-[#a81b1e] cursor-pointer font-mono"
                      >
                        {o.order_id}
                      </button>
                      <p className="text-[11px] text-slate-400 font-mono mt-0.5">{o.date}</p>
                    </div>

                    <StatusBadge status={o.status || 'pending'} />
                  </div>

                  {/* Party / Client info (if visible) */}
                  {!hidePartyColumn && o.party_name && (
                    <div className="flex items-center gap-1.5 text-xs text-slate-800 font-bold">
                      <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{o.party_name}</span>
                    </div>
                  )}

                  {/* PO Number & Brand / Series Pill */}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-1 border-t border-slate-100">
                    <div className="text-slate-500 font-mono">
                      PO: <strong className="text-slate-800">{o.po_number || '—'}</strong>
                    </div>

                    {orderSubtype ? (
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-extrabold ${
                          orderSubtype === 'One Helix'
                            ? 'bg-purple-100 text-purple-800 border border-purple-200'
                            : orderSubtype === 'ESSAR Steel' || orderSubtype === 'ESSAR' || isEssarFirm
                            ? 'bg-amber-100 text-amber-800 border border-amber-200'
                            : 'bg-blue-100 text-blue-800 border border-blue-200'
                        }`}
                      >
                        {orderSubtype}
                      </span>
                    ) : (
                      o.specification && (
                        <span className="text-[11px] text-slate-600 truncate max-w-[150px]">
                          {o.specification}
                        </span>
                      )
                    )}
                  </div>

                  {/* Metrics Box: Tonnage & Total Value */}
                  <div className="grid grid-cols-2 gap-2 p-2.5 rounded-lg bg-slate-50 border border-slate-100 text-xs">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-500 block">Tonnage</span>
                      <span className="font-mono font-bold text-slate-900 text-sm">
                        {o.total_qty.toFixed(2)} MT
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] uppercase font-bold text-slate-500 block">Order Value</span>
                      <span className="font-mono font-black text-slate-900 text-sm">
                        ₹{o.total_value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                  </div>

                  {/* Line Items & View button */}
                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
                    <p className="text-[11px] text-slate-500 truncate max-w-[180px]">
                      {previewItems || `${items.length} items`}
                    </p>

                    <button
                      onClick={() => setSelectedOrder(o)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs transition cursor-pointer shrink-0"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      View
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Table (Hidden on screens < 768px) */}
          <div className="hidden md:block overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-3.5">Order ID & Date</th>
                    {!hidePartyColumn && <th className="py-3 px-3.5">Party / Client Name</th>}
                    <th className="py-3 px-3.5">PO Number</th>
                    <th className="py-3 px-3.5">{hideSpecificationColumn ? 'Brand / Series' : 'Specification'}</th>
                    <th className="py-3 px-3.5">Products Summary</th>
                    <th className="py-3 px-3.5 text-right">Tonnage</th>
                    <th className="py-3 px-3.5 text-right">Total Value</th>
                    <th className="py-3 px-3.5 text-center">Status</th>
                    <th className="py-3 px-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {paginatedOrders.map((o) => {
                    const items = o.items || [];
                    const previewItems = items
                      .slice(0, 2)
                      .map((it) => `${it.productName} (${it.size})`)
                      .join(', ');
                    const orderSubtype = o.product_details?.subtype || o.product_details?.brand || (isEssarFirm ? 'ESSAR Steel' : isJSWFirm ? 'JSW One' : null);

                    return (
                      <tr key={o.id} className="hover:bg-slate-50/80 transition">
                        <td className="py-3 px-3.5 font-medium text-slate-900">
                          <button
                            onClick={() => setSelectedOrder(o)}
                            className="text-left font-bold text-slate-900 hover:text-[#a81b1e] hover:underline cursor-pointer flex items-center gap-1"
                          >
                            <span className="font-mono">{o.order_id}</span>
                          </button>
                          <p className="text-[10px] font-mono text-slate-400">{o.date}</p>
                        </td>

                        {!hidePartyColumn && (
                          <td className="py-3 px-3.5">
                            <div className="flex items-center gap-1.5">
                              <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span className="font-bold text-slate-900 truncate max-w-xs">{o.party_name || '—'}</span>
                            </div>
                          </td>
                        )}

                        <td className="py-3 px-3.5 font-mono text-slate-700">
                          {o.po_number || '—'}
                        </td>

                        <td className="py-3 px-3.5 text-slate-700 font-medium">
                          {hideSpecificationColumn ? (
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-extrabold ${orderSubtype === 'One Helix'
                                ? 'bg-purple-100 text-purple-800 border border-purple-200'
                                : orderSubtype === 'ESSAR Steel' || orderSubtype === 'ESSAR' || isEssarFirm
                                  ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                  : 'bg-blue-100 text-blue-800 border border-blue-200'
                                }`}
                            >
                              {orderSubtype || (isEssarFirm ? 'ESSAR Steel' : 'JSW One')}
                            </span>
                          ) : (
                            <span className="truncate max-w-[180px] block" title={o.specification || '—'}>
                              {o.specification || '—'}
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-3.5">
                          <div className="space-y-0.5">
                            <p className="text-slate-800 text-[11px] font-medium truncate max-w-xs">
                              {previewItems || 'TMT Products'}
                              {items.length > 2 && (
                                <span className="text-[10px] text-slate-400 ml-1">+{items.length - 2} more</span>
                              )}
                            </p>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {items.length} {items.length === 1 ? 'line item' : 'line items'}
                            </span>
                          </div>
                        </td>

                        <td className="py-3 px-3.5 text-right font-mono font-bold text-slate-900">
                          {o.total_qty.toFixed(2)} MT
                        </td>

                        <td className="py-3 px-3.5 text-right font-mono font-black text-slate-900">
                          ₹{o.total_value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>

                        <td className="py-3 px-3.5 text-center">
                          <StatusBadge status={o.status || 'pending'} />
                        </td>

                        <td className="py-3 px-3.5 text-right">
                          <button
                            onClick={() => setSelectedOrder(o)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 transition cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            View
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Desktop Row Pagination */}
            <Pagination
              currentPage={currentPage}
              totalItems={filteredOrders.length}
              pageSize={pageSize}
              onPageChange={(page) => setCurrentPage(page)}
              onPageSizeChange={(size) => setPageSize(size)}
              pageSizeOptions={[10, 15, 25, 50, 100]}
            />
          </div>

          {/* Mobile Row Pagination */}
          <div className="block md:hidden bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <Pagination
              currentPage={currentPage}
              totalItems={filteredOrders.length}
              pageSize={pageSize}
              onPageChange={(page) => setCurrentPage(page)}
              onPageSizeChange={(size) => setPageSize(size)}
              pageSizeOptions={[10, 15, 25, 50]}
            />
          </div>
        </div>
      )}

      {/* Modals */}
      <CreateProjectOrderModal
        isOpen={isCreateOpen && canCreateOrders}
        onClose={() => setIsCreateOpen(false)}
        onOrderCreated={loadOrders}
      />

      {selectedOrder && (
        <ProjectOrderDetailModal
          isOpen={Boolean(selectedOrder)}
          onClose={() => setSelectedOrder(null)}
          order={selectedOrder}
        />
      )}
    </div>
  );
};
