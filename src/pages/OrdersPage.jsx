import React, { useState, useEffect, useMemo } from 'react';
import { OrdersTable } from '../components/orders/OrdersTable';
import { CreateOrderModal } from '../components/orders/CreateOrderModal';
import { CreateProjectOrderModal } from '../components/projectOrders/CreateProjectOrderModal';
import { ProjectOrderDetailModal } from '../components/projectOrders/ProjectOrderDetailModal';
import { DispatchModal } from '../components/dispatch/DispatchModal';
import { StatusBadge } from '../components/common/StatusBadge';
import { Pagination } from '../components/common/Pagination';
import { ordersApi } from '../api/ordersApi';
import { projectOrdersApi } from '../api/projectOrdersApi';
import { dispatchApi, withDispatchStatus } from '../api/dispatchApi';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { Search, Plus, User, AlertTriangle, RefreshCw, Eye, Truck } from 'lucide-react';
import { resolveBrandForUser } from '../data/constants';

export const OrdersPage = () => {
  const { selectedBrand, refreshKey } = useApp();
  const { user, firmAccess, isDistributor, isASM, isSalesPerson, canAccessAllFirms, canEdit, distributorFirmId, isProjectManager, firmCatalog } =
    useAuth();
  const canCreateOrders = canEdit('orders');
  const canDispatch = canEdit('dispatch');
  // Sarthak project orders (project_orders, OR/<FY>/SAR/<n>) are booked from the Sarthak order form
  const sarthakFirmId = firmCatalog?.[0]?.storeId || 1;

  const [orders, setOrders] = useState([]);
  const [projectOrders, setProjectOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeSubTab, setActiveSubTab] = useState('standard'); // 'standard' (Retail) or 'project'
  const [selectedProjectOrder, setSelectedProjectOrder] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('pending'); // 'pending' | 'delivered'
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [orderFormType, setOrderFormType] = useState('standard'); // Sarthak form: 'standard' | 'project'
  const [dispatchModalOrder, setDispatchModalOrder] = useState(null);

  // Pagination for Project Orders view
  const [projectPage, setProjectPage] = useState(1);
  const [projectPageSize, setProjectPageSize] = useState(15);

  const isSalesRole = isASM || isSalesPerson;
  // Users without an assigned firm can view all firms in orders
  const effectiveBrand = useMemo(() => {
    return resolveBrandForUser(firmAccess, selectedBrand);
  }, [firmAccess, selectedBrand]);

  // Sales users without Sarthak firm access, and distributors, see only their own Sarthak orders.
  // Sales users given Sarthak in Firm Access see all Sarthak orders.
  const ownOrdersOnly = (isSalesRole || isDistributor) && Boolean(firmAccess?.ownSarthakOnly) && effectiveBrand === 'sarthak';

  const isJSWSelected =
    effectiveBrand === 'jsw' ||
    Number(firmAccess?.firmId) === 2;
  const isEssarSelected =
    effectiveBrand === 'essar' ||
    [3, 6].includes(Number(firmAccess?.firmId));

  const isProjectBrand = isJSWSelected || isEssarSelected;
  const hideSpecificationColumn = isJSWSelected || isEssarSelected;
  const hidePartyColumn =
    [2, 6].includes(Number(firmAccess?.firmId)) ||
    isEssarSelected ||
    isJSWSelected;

  // Loads retail orders (orders) and project orders (project_orders) for the current view.
  // Status comes from the dispatch table: pending / partially dispatched / delivered.
  const loadOrderLists = async () => {
    if (ownOrdersOnly) {
      const filters = {};
      if (isSalesRole && user?.emp_id) {
        filters.salesPersonId = user.emp_id;
      } else if (isDistributor) {
        const dId = distributorFirmId || user?.emp_id;
        filters.distributorId = dId;
        filters.distributorIds = [distributorFirmId, user?.emp_id].filter(Boolean);
      }
      return { retail: await ordersApi.getOrders(filters), project: [] };
    }
    if (effectiveBrand === 'jsw' || effectiveBrand === 'essar') {
      return { retail: [], project: await projectOrdersApi.getProjectOrders(effectiveBrand) };
    }
    if (effectiveBrand === 'sarthak') {
      const [retail, project] = await Promise.all([
        ordersApi.getOrders({ brandId: 'sarthak' }),
        projectOrdersApi.getProjectOrders('sarthak'),
      ]);
      return { retail, project };
    }
    // effectiveBrand === 'all'
    const [retail, project] = await Promise.all([ordersApi.getOrders({}), projectOrdersApi.getProjectOrders()]);
    return { retail, project };
  };

  const fetchOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const [lists, totals] = await Promise.all([
        loadOrderLists(),
        // Orders still load if dispatch totals cannot be read
        dispatchApi.getDispatchTotals().catch((err) => {
          console.warn('Could not load dispatch totals:', err);
          return { retail: new Map(), project: new Map() };
        }),
      ]);
      setOrders(withDispatchStatus(lists.retail, totals, 'retail'));
      setProjectOrders(withDispatchStatus(lists.project, totals, 'project'));
    } catch (err) {
      console.error('Error fetching orders:', err);
      setError(err?.message || 'Failed to load orders. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [effectiveBrand, isDistributor, isSalesRole, ownOrdersOnly, user, refreshKey]);

  // Status tabs: Pending = not fully dispatched (incl. partially dispatched), Delivered = fully dispatched
  const matchesStatus = (o) => {
    const st = (o.status || 'pending').toLowerCase();
    return statusFilter === 'delivered' ? st === 'delivered' : st !== 'delivered';
  };

  const openDispatch = (order, dispatchType) => {
    if (!canDispatch) return;
    setDispatchModalOrder({ ...order, dispatchType });
  };

  // Search for standard orders (status tab applied separately so tab counters follow the search)
  const searchedOrders = orders.filter((o) => {
    const search = searchTerm.toLowerCase();
    return (
      o.id?.toLowerCase().includes(search) ||
      o.distributorName?.toLowerCase().includes(search) ||
      o.dealerName?.toLowerCase().includes(search) ||
      o.po_number?.toLowerCase().includes(search) ||
      o.city?.toLowerCase().includes(search) ||
      o.deliverySite?.toLowerCase().includes(search) ||
      o.brand_name?.toLowerCase().includes(search) ||
      o.brandId?.toLowerCase().includes(search) ||
      o.status?.toLowerCase().includes(search) ||
      String(o.sales_person_id || '').includes(search) ||
      String(o.distributor_id || '').includes(search) ||
      String(o.firm_id || '').includes(search) ||
      String(o.dealer_id || '').includes(search)
    );
  });

  // Search for project orders
  const searchedProjectOrders = projectOrders.filter((o) => {
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

  const filteredOrders = searchedOrders.filter(matchesStatus);
  const filteredProjectOrders = searchedProjectOrders.filter(matchesStatus);

  // Reset project page on filters change
  useEffect(() => {
    setProjectPage(1);
  }, [searchTerm, statusFilter, activeSubTab, effectiveBrand]);

  const paginatedProjectOrders = useMemo(() => {
    const start = (projectPage - 1) * projectPageSize;
    return filteredProjectOrders.slice(start, start + projectPageSize);
  }, [filteredProjectOrders, projectPage, projectPageSize]);

  const statuses = [
    { id: 'pending', label: 'Pending Orders' },
    { id: 'delivered', label: 'Delivered Orders' },
  ];

  // Retail / Project sub-tabs: Sarthak TMT view (retail = Sarthak standard orders) and the all-firms view.
  // Not shown to users who only see their own bookings.
  const showSubTabs =
    !isDistributor &&
    ((effectiveBrand === 'all' && canAccessAllFirms && !isSalesRole) || (effectiveBrand === 'sarthak' && !ownOrdersOnly));

  const isViewingProjectOrders = isProjectBrand || (showSubTabs && activeSubTab === 'project');

  // Counters for the Pending / Delivered tabs of the list currently shown
  const statusCounts = useMemo(() => {
    const list = isViewingProjectOrders ? searchedProjectOrders : searchedOrders;
    const delivered = list.filter((o) => String(o.status || '').toLowerCase() === 'delivered').length;
    return { pending: list.length - delivered, delivered };
  }, [isViewingProjectOrders, searchedOrders, searchedProjectOrders]);

  // Only the Project Manager position can book Sarthak project orders
  const canBookSarthakProject =
    isProjectManager && canCreateOrders && !isProjectBrand && !isDistributor && !ownOrdersOnly;

  const openOrderModal = () => {
    setOrderFormType('standard');
    setIsOrderModalOpen(true);
  };

  // Switch shown at the top of the Sarthak order form (Project Managers only)
  const orderTypeSwitch = canBookSarthakProject ? (
    <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200">
      {[
        { id: 'standard', label: 'Retail Order' },
        { id: 'project', label: 'Project Order' },
      ].map((t) => (
        <button
          type="button"
          key={t.id}
          onClick={() => setOrderFormType(t.id)}
          aria-pressed={orderFormType === t.id}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${orderFormType === t.id ? 'bg-white text-[#a81b1e] shadow-xs border border-slate-200' : 'text-slate-600 hover:text-slate-900'
            }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  ) : null;

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex items-start sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-2xl font-extrabold text-slate-900 tracking-tight leading-tight">
            {ownOrdersOnly
              ? 'My Orders'
              : effectiveBrand === 'jsw'
                ? 'JSW Project Orders'
                : effectiveBrand === 'essar'
                  ? 'ESSAR Project Orders'
                  : effectiveBrand === 'sarthak'
                    ? 'Sarthak TMT Orders'
                    : 'Orders & Indents'}
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            {ownOrdersOnly && !isDistributor
              ? `Live sales orders, managed by Sales Officer for Sarthak TMT`
              : ownOrdersOnly
                ? `Live order details, diameter schedules, and dispatch status for ${user?.full_name || user?.username || 'your account'}`
                : effectiveBrand === 'jsw'
                  ? 'Direct purchase orders for JSW One & One Helix'
                  : effectiveBrand === 'essar'
                    ? 'Direct purchase orders for ESSAR Steel'
                    : firmAccess?.isRestricted
                      ? `Retail and Project Orders of Sarthak TMT`
                      : 'Manage rebar bookings across all authorized corporate brands and firms'}
          </p>
        </div>

        {!canCreateOrders ? (
          <div className="shrink-0 px-2.5 sm:px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-[11px] sm:text-xs font-bold shadow-2xs whitespace-nowrap">
            <span>View-Only Access</span>
          </div>
        ) : (
          <button
            onClick={openOrderModal}
            className="shrink-0 flex items-center justify-center gap-1.5 rounded-lg bg-[#a81b1e] hover:bg-[#8e1518] px-3 sm:px-4 py-2 text-xs font-bold text-white shadow-xs transition cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            {isDistributor ? 'Book Indent' : isProjectBrand ? 'New Project Order' : 'Book Order'}
          </button>
        )}
      </div>

      {/* Error Alert Banner */}
      {error && (
        <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-red-200 bg-red-50 text-xs text-[#a81b1e]">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span><strong>Failed to load orders:</strong> {error}</span>
          </div>
          <button
            onClick={() => fetchOrders()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#a81b1e] hover:bg-[#8e1518] text-white font-bold transition cursor-pointer shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        </div>
      )}

      {/* Sub-Tabs: Retail / Project orders (Sarthak TMT view and All Firms view) */}
      {showSubTabs && (
        <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveSubTab('standard')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 transition cursor-pointer ${activeSubTab === 'standard'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
          >
            {effectiveBrand === 'sarthak' ? 'Retail Orders' : 'Retail Orders (Sarthak TMT)'}
            <span className={`ml-1.5 inline-flex min-w-[1.25rem] justify-center px-1.5 py-0.5 rounded-full text-[10px] font-bold ${activeSubTab === 'standard' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>{loading ? '–' : filteredOrders.length}</span>
          </button>
          <button
            onClick={() => setActiveSubTab('project')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 transition cursor-pointer ${activeSubTab === 'project'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
          >
            {effectiveBrand === 'sarthak' ? 'Project Orders' : 'Project Orders (All Firms)'}
            <span className={`ml-1.5 inline-flex min-w-[1.25rem] justify-center px-1.5 py-0.5 rounded-full text-[10px] font-bold ${activeSubTab === 'project' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>{loading ? '–' : filteredProjectOrders.length}</span>
          </button>
        </div>
      )}

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white p-3 shadow-xs">
        {/* Status Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0 scrollbar-none">
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
              <span
                className={`ml-1.5 inline-flex min-w-[1.25rem] justify-center px-1.5 py-0.5 rounded-full text-[10px] font-bold ${statusFilter === s.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
              >
                {loading ? '–' : statusCounts[s.id] ?? 0}
              </span>
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder={
              isViewingProjectOrders
                ? 'Search PO #, order ID, product...'
                : 'Search order ID, destination, site...'
            }
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 py-2 sm:py-1.5 text-xs text-slate-900 focus:border-[#a81b1e] focus:bg-white focus:outline-none"
          />
        </div>
      </div>

      {/* Orders Table */}
      {isViewingProjectOrders ? (
        loading ? (
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
                    <th className="py-3 px-3.5 text-right">Action</th>
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
        ) : filteredProjectOrders.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 sm:p-12 text-center text-slate-400 shadow-xs">
            <p className="font-semibold text-slate-600">
              {searchTerm
                ? 'No project orders found matching criteria.'
                : 'No project orders registered for this firm view yet.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Mobile Card List (Visible on screens < 768px) */}
            <div className="block md:hidden space-y-3">
              {paginatedProjectOrders.map((o) => {
                const items = o.items || [];
                const previewItems = items
                  .slice(0, 2)
                  .map((it) => `${it.productName} (${it.size})`)
                  .join(', ');
                const orderSubtype =
                  o.product_details?.subtype ||
                  o.product_details?.brand ||
                  (isEssarSelected || [3, 6].includes(Number(o.firm_id))
                    ? 'ESSAR Steel'
                    : isJSWSelected || Number(o.firm_id) === 2
                      ? 'JSW One'
                      : o.firm_name || 'Project Order');

                return (
                  <div
                    key={o.id}
                    className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-2xs space-y-3 transition hover:border-slate-300"
                  >
                    {/* Header: ID, Date, Status */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <button
                          onClick={() => setSelectedProjectOrder(o)}
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

                      {orderSubtype && (
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-extrabold ${orderSubtype === 'One Helix'
                            ? 'bg-purple-100 text-purple-800 border border-purple-200'
                            : orderSubtype === 'ESSAR Steel' || orderSubtype === 'ESSAR' || isEssarSelected
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : 'bg-blue-100 text-blue-800 border border-blue-200'
                            }`}
                        >
                          {orderSubtype}
                        </span>
                      )}
                    </div>

                    {/* Metrics Box: Tonnage & Total Value */}
                    <div className="grid grid-cols-2 gap-2 p-2.5 rounded-lg bg-slate-50 border border-slate-100 text-xs">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-500 block">Tonnage</span>
                        <span className="font-mono font-bold text-slate-900 text-sm">
                          {(o.total_qty || 0).toFixed(2)} MT
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] uppercase font-bold text-slate-500 block">Order Value</span>
                        <span className="font-mono font-black text-slate-900 text-sm">
                          ₹{(o.total_value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                        </span>
                      </div>
                    </div>

                    {/* Line Items & View button */}
                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
                      <p className="text-[11px] text-slate-500 truncate max-w-[180px]">
                        {previewItems || `${items.length} items`}
                      </p>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => setSelectedProjectOrder(o)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs transition cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          View
                        </button>
                        {canDispatch && o.status !== 'delivered' && (
                          <button
                            onClick={() => openDispatch(o, 'project')}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#a81b1e] hover:bg-[#8e1518] text-white font-bold text-xs transition cursor-pointer"
                          >
                            <Truck className="w-3.5 h-3.5" />
                            Dispatch
                          </button>
                        )}
                      </div>
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
                      <th className="py-3 px-3.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {paginatedProjectOrders.map((o) => {
                      const items = o.items || [];
                      const previewItems = items
                        .slice(0, 2)
                        .map((it) => `${it.productName} (${it.size})`)
                        .join(', ');
                      const orderSubtype =
                        o.product_details?.subtype ||
                        o.product_details?.brand ||
                        (isEssarSelected || [3, 6].includes(Number(o.firm_id))
                          ? 'ESSAR Steel'
                          : isJSWSelected || Number(o.firm_id) === 2
                            ? 'JSW One'
                            : o.firm_name || 'Project Order');

                      return (
                        <tr
                          key={o.id}
                          className="hover:bg-slate-50/80 transition cursor-pointer"
                          onClick={() => setSelectedProjectOrder(o)}
                        >
                          <td className="py-3 px-3.5 font-medium text-slate-900">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedProjectOrder(o);
                              }}
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
                                <span className="font-bold text-slate-900 truncate max-w-xs">
                                  {o.party_name || '—'}
                                </span>
                              </div>
                            </td>
                          )}

                          <td className="py-3 px-3.5 font-mono text-slate-700">{o.po_number || '—'}</td>

                          <td className="py-3 px-3.5">
                            {hideSpecificationColumn ? (
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-extrabold ${orderSubtype === 'One Helix'
                                  ? 'bg-purple-100 text-purple-800 border border-purple-200'
                                  : orderSubtype === 'ESSAR Steel' || orderSubtype === 'ESSAR' || isEssarSelected
                                    ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                    : 'bg-blue-100 text-blue-800 border border-blue-200'
                                  }`}
                              >
                                {orderSubtype}
                              </span>
                            ) : (
                              <span className="text-slate-700 font-medium truncate max-w-xs block">
                                {o.specification || o.product_details?.specification || '—'}
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-3.5 text-slate-600">
                            <span className="truncate max-w-xs block text-[11px]">
                              {previewItems || 'Standard Rebar'}
                              {items.length > 2 && (
                                <span className="text-slate-400 font-normal"> +{items.length - 2} more</span>
                              )}
                            </span>
                          </td>

                          <td className="py-3 px-3.5 text-right font-mono font-bold text-slate-900">
                            {(o.total_qty || 0).toFixed(2)} MT
                            {o.dispatched_qty > 0 && (
                              <p className="text-[10px] font-semibold text-amber-700">Pending {(o.pending_qty || 0).toFixed(2)} MT</p>
                            )}
                          </td>

                          <td className="py-3 px-3.5 text-right font-mono font-black text-slate-900">
                            ₹{(o.total_value || 0).toLocaleString('en-IN')}
                          </td>

                          <td className="py-3 px-3.5 text-center">
                            <StatusBadge status={o.status || 'pending'} />
                          </td>

                          <td className="py-3 px-3.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedProjectOrder(o);
                                }}
                                className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] transition cursor-pointer"
                              >
                                View
                              </button>
                              {canDispatch && o.status !== 'delivered' && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openDispatch(o, 'project');
                                  }}
                                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#a81b1e] hover:bg-[#8e1518] text-white font-bold text-[11px] transition cursor-pointer"
                                >
                                  <Truck className="w-3 h-3" />
                                  Dispatch
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Desktop Pagination for project orders */}
              <Pagination
                currentPage={projectPage}
                totalItems={filteredProjectOrders.length}
                pageSize={projectPageSize}
                onPageChange={(page) => setProjectPage(page)}
                onPageSizeChange={(size) => setProjectPageSize(size)}
                pageSizeOptions={[10, 15, 25, 50, 100]}
              />
            </div>

            {/* Mobile Pagination for project orders */}
            <div className="block md:hidden bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <Pagination
                currentPage={projectPage}
                totalItems={filteredProjectOrders.length}
                pageSize={projectPageSize}
                onPageChange={(page) => setProjectPage(page)}
                onPageSizeChange={(size) => setProjectPageSize(size)}
                pageSizeOptions={[10, 15, 25, 50]}
              />
            </div>
          </div>
        )
      ) : (
        <OrdersTable
          orders={filteredOrders}
          loading={loading}
          onOpenDispatch={canDispatch ? (order) => openDispatch(order, 'retail') : undefined}
        />
      )}

      {/* Modals */}
      {isProjectBrand ? (
        <CreateProjectOrderModal
          isOpen={isOrderModalOpen && canCreateOrders}
          onClose={() => setIsOrderModalOpen(false)}
          defaultFirmId={effectiveBrand === 'jsw' ? 2 : effectiveBrand === 'essar' ? 6 : firmAccess?.firmId}
          onOrderCreated={() => {
            projectOrdersApi.getProjectOrders(effectiveBrand).then((data) => {
              setProjectOrders(data || []);
            });
          }}
        />
      ) : canBookSarthakProject && orderFormType === 'project' ? (
        <CreateProjectOrderModal
          isOpen={isOrderModalOpen}
          onClose={() => setIsOrderModalOpen(false)}
          sarthakProject
          defaultFirmId={sarthakFirmId}
          headerSlot={orderTypeSwitch}
          onOrderCreated={() => setActiveSubTab('project')}
        />
      ) : (
        <CreateOrderModal
          isOpen={isOrderModalOpen && canCreateOrders}
          onClose={() => setIsOrderModalOpen(false)}
          defaultBrand={effectiveBrand === 'all' ? selectedBrand : effectiveBrand}
          headerSlot={orderTypeSwitch}
        />
      )}

      <ProjectOrderDetailModal
        isOpen={Boolean(selectedProjectOrder)}
        onClose={() => setSelectedProjectOrder(null)}
        order={selectedProjectOrder}
      />

      <DispatchModal
        isOpen={Boolean(dispatchModalOrder) && canDispatch}
        onClose={() => setDispatchModalOrder(null)}
        selectedOrder={dispatchModalOrder}
      />
    </div>
  );
};
