import React, { useState, useEffect, useMemo } from 'react';
import { StatCard } from '../components/common/StatCard';
import { OrdersTable } from '../components/orders/OrdersTable';
import { CreateOrderModal } from '../components/orders/CreateOrderModal';
import { CreateProjectOrderModal } from '../components/projectOrders/CreateProjectOrderModal';
import { ProjectOrderDetailModal } from '../components/projectOrders/ProjectOrderDetailModal';
import { DispatchModal } from '../components/dispatch/DispatchModal';
import { Pagination } from '../components/common/Pagination';
import { ordersApi } from '../api/ordersApi';
import { projectOrdersApi } from '../api/projectOrdersApi';
import { dispatchApi, withDispatchStatus } from '../api/dispatchApi';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { TMT_BRANDS, resolveBrandForUser } from '../data/constants';
import {
  Package,
  Truck,
  CheckCircle,
  Clock,
  Plus,
  AlertTriangle,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';

export const AdminDashboard = () => {
  const { selectedBrand, refreshKey, triggerRefresh } = useApp();
  const { user, firmAccess, isASM, isDistributor, isSalesPerson, isManager, isUnauthorizedUser, canAccessAllFirms, canEdit, distributorFirmId, isProjectManager } = useAuth();
  const canCreateOrders = canEdit('orders');
  const canDispatch = canEdit('dispatch');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rawStats, setStats] = useState(null);
  const [rawOrders, setOrders] = useState([]);
  const [rawProjectOrders, setProjectOrders] = useState([]);
  const [dispatchTotals, setDispatchTotals] = useState(null);
  const [dispatches, setDispatches] = useState([]);
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [dispatchModalOrder, setDispatchModalOrder] = useState(null);
  const [selectedProjectOrder, setSelectedProjectOrder] = useState(null);
  // 'standard' (Retail) or 'project'; Project Managers open on the Project tab
  const [activeAllTab, setActiveAllTab] = useState(isProjectManager ? 'project' : 'standard');

  // The user's position can resolve after the first render
  useEffect(() => {
    if (isProjectManager) setActiveAllTab('project');
  }, [isProjectManager]);

  // Pagination for project orders table
  const [dashboardPage, setDashboardPage] = useState(1);
  const [dashboardPageSize, setDashboardPageSize] = useState(15);

  const isSalesRole = isASM || isSalesPerson;

  // Users without an assigned firm can view all firms in dashboard
  const effectiveBrand = useMemo(() => {
    return resolveBrandForUser(firmAccess, selectedBrand);
  }, [firmAccess, selectedBrand]);

  // Sales users without Sarthak firm access, and distributors, see only their own Sarthak orders.
  // Sales users given Sarthak in Firm Access see all Sarthak orders.
  const ownOrdersOnly = (isSalesRole || isDistributor) && Boolean(firmAccess?.ownSarthakOnly) && effectiveBrand === 'sarthak';

  // In the manager / JSW / ESSAR views the main list holds project orders
  const ordersAreProject = isManager || effectiveBrand === 'jsw' || effectiveBrand === 'essar';

  // Dispatch status (pending / partially dispatched / delivered) comes from the dispatch table
  const orders = useMemo(
    () => withDispatchStatus(rawOrders, dispatchTotals, ordersAreProject ? 'project' : 'retail'),
    [rawOrders, dispatchTotals, ordersAreProject]
  );
  const projectOrders = useMemo(
    () => (ordersAreProject ? orders : withDispatchStatus(rawProjectOrders, dispatchTotals, 'project')),
    [ordersAreProject, orders, rawProjectOrders, dispatchTotals]
  );
  const stats = useMemo(() => {
    if (!rawStats) return rawStats;
    const sum = (list) => list.reduce((acc, o) => acc + (o.dispatched_qty || 0), 0);
    const delivered = sum(orders) + (ordersAreProject ? 0 : sum(projectOrders));
    const ordered = Number(rawStats.totalOrderedMT) || 0;
    return {
      ...rawStats,
      totalDeliveredMT: Number(delivered.toFixed(2)),
      totalPendingMT: Number(Math.max(0, ordered - delivered).toFixed(2)),
    };
  }, [rawStats, orders, projectOrders, ordersAreProject]);

  const isJSWSelected =
    effectiveBrand === 'jsw' ||
    Number(firmAccess?.firmId) === 2;
  const isEssarSelected =
    effectiveBrand === 'essar' ||
    [3, 6].includes(Number(firmAccess?.firmId));

  const hideSpecificationColumn = isJSWSelected || isEssarSelected;
  const hidePartyColumn =
    [2, 6].includes(Number(firmAccess?.firmId)) ||
    isEssarSelected ||
    isJSWSelected;

  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      setLoading(true);
      dispatchApi
        .getDispatchTotals()
        .then((totals) => {
          if (isMounted) setDispatchTotals(totals);
        })
        .catch((err) => console.warn('Could not load dispatch totals:', err));
      setError(null);
      try {
        if (isManager) {
          const prjOrders = await projectOrdersApi.getProjectOrders(firmAccess?.firmId);
          if (!isMounted) return;
          const totalMT = prjOrders.reduce((acc, o) => acc + (o.total_qty || 0), 0);
          const totalVal = prjOrders.reduce((acc, o) => acc + (o.total_value || 0), 0);
          setStats({
            totalOrders: prjOrders.length,
            totalOrderedMT: totalMT,
            totalOrderValue: totalVal,
            totalDeliveredMT: 0,
            totalPendingMT: totalMT,
          });
          setOrders(prjOrders);
          setProjectOrders(prjOrders);
          setDispatches([]);
          return;
        }

        if (ownOrdersOnly) {
          const orderFilters = {};
          if (isSalesRole && user?.emp_id) {
            orderFilters.salesPersonId = user.emp_id;
          } else if (isDistributor) {
            const dId = distributorFirmId || user?.emp_id;
            orderFilters.distributorId = dId;
            orderFilters.distributorIds = [distributorFirmId, user?.emp_id].filter(Boolean);
          }

          const distStatsFilter = {
            distributorId: distributorFirmId || user?.emp_id,
            distributorIds: [distributorFirmId, user?.emp_id].filter(Boolean),
          };

          const [orderStats, orderList, dispatchList] = await Promise.all([
            ordersApi.getOrderStats(
              isSalesRole && user?.emp_id
                ? { salesPersonId: user.emp_id }
                : distStatsFilter
            ),
            ordersApi.getOrders(orderFilters),
            dispatchApi.getDispatches({ brandId: 'sarthak' }),
          ]);
          if (!isMounted) return;
          setStats(orderStats);
          setOrders(orderList || []);
          setProjectOrders([]);
          setDispatches(dispatchList || []);
          return;
        }

        // For all-firms / single firm views:
        if (effectiveBrand === 'jsw') {
          const jswOrders = await projectOrdersApi.getProjectOrders('jsw');
          if (!isMounted) return;
          const totalMT = jswOrders.reduce((acc, o) => acc + (o.total_qty || 0), 0);
          const totalVal = jswOrders.reduce((acc, o) => acc + (o.total_value || 0), 0);
          const totalDelivered = jswOrders
            .filter((o) => (o.status || '').toLowerCase() === 'delivered')
            .reduce((acc, o) => acc + (o.total_qty || 0), 0);
          setStats({
            totalOrders: jswOrders.length,
            totalOrderedMT: totalMT,
            totalOrderValue: totalVal,
            totalDeliveredMT: totalDelivered,
            totalPendingMT: Math.max(0, totalMT - totalDelivered),
          });
          setOrders(jswOrders);
          setProjectOrders(jswOrders);
          setDispatches([]);
          return;
        }

        if (effectiveBrand === 'essar') {
          const essarOrders = await projectOrdersApi.getProjectOrders('essar');
          if (!isMounted) return;
          const totalMT = essarOrders.reduce((acc, o) => acc + (o.total_qty || 0), 0);
          const totalVal = essarOrders.reduce((acc, o) => acc + (o.total_value || 0), 0);
          const totalDelivered = essarOrders
            .filter((o) => (o.status || '').toLowerCase() === 'delivered')
            .reduce((acc, o) => acc + (o.total_qty || 0), 0);
          setStats({
            totalOrders: essarOrders.length,
            totalOrderedMT: totalMT,
            totalOrderValue: totalVal,
            totalDeliveredMT: totalDelivered,
            totalPendingMT: Math.max(0, totalMT - totalDelivered),
          });
          setOrders(essarOrders);
          setProjectOrders(essarOrders);
          setDispatches([]);
          return;
        }

        if (effectiveBrand === 'sarthak') {
          const [orderStats, orderList, dispatchList, sarthakProjects] = await Promise.all([
            ordersApi.getOrderStats('sarthak'),
            ordersApi.getOrders({ brandId: 'sarthak' }),
            dispatchApi.getDispatches({ brandId: 'sarthak' }),
            projectOrdersApi.getProjectOrders('sarthak'),
          ]);
          if (!isMounted) return;
          // Sarthak totals include Sarthak project orders (OR/<FY>/SAR/<n>)
          const prj = sarthakProjects || [];
          const prjMT = prj.reduce((acc, o) => acc + (o.total_qty || 0), 0);
          const prjVal = prj.reduce((acc, o) => acc + (o.total_value || 0), 0);
          const prjDelivered = prj
            .filter((o) => (o.status || '').toLowerCase() === 'delivered')
            .reduce((acc, o) => acc + (o.total_qty || 0), 0);
          setStats({
            ...orderStats,
            totalOrders: (orderList?.length || 0) + prj.length,
            totalOrderedMT: Number(((orderStats?.totalOrderedMT || 0) + prjMT).toFixed(2)),
            totalOrderValue: Number(((orderStats?.totalOrderValue || 0) + prjVal).toFixed(2)),
            totalDeliveredMT: Number(((orderStats?.totalDeliveredMT || 0) + prjDelivered).toFixed(2)),
            totalPendingMT: Math.max(0, Number(((orderStats?.totalPendingMT || 0) + Math.max(0, prjMT - prjDelivered)).toFixed(2))),
          });
          setOrders(orderList || []);
          setProjectOrders(prj);
          setDispatches(dispatchList || []);
          return;
        }

        // effectiveBrand === 'all' (all firms view)
        const [sarthakStats, sarthakOrders, dispatchList, allProjectOrders] = await Promise.all([
          ordersApi.getOrderStats('all'),
          ordersApi.getOrders({}),
          dispatchApi.getDispatches({ brandId: 'all' }),
          projectOrdersApi.getProjectOrders(),
        ]);
        if (!isMounted) return;

        const prjMT = (allProjectOrders || []).reduce((acc, o) => acc + (o.total_qty || 0), 0);
        const prjVal = (allProjectOrders || []).reduce((acc, o) => acc + (o.total_value || 0), 0);
        const prjDelivered = (allProjectOrders || [])
          .filter((o) => (o.status || '').toLowerCase() === 'delivered')
          .reduce((acc, o) => acc + (o.total_qty || 0), 0);

        const combinedStats = {
          totalOrders: (sarthakOrders?.length || 0) + (allProjectOrders?.length || 0),
          totalOrderedMT: Number(((sarthakStats?.totalOrderedMT || 0) + prjMT).toFixed(2)),
          totalOrderValue: Number(((sarthakStats?.totalOrderValue || 0) + prjVal).toFixed(2)),
          totalDeliveredMT: Number(((sarthakStats?.totalDeliveredMT || 0) + prjDelivered).toFixed(2)),
          totalPendingMT: Math.max(
            0,
            Number(
              (
                (sarthakStats?.totalPendingMT || 0) +
                Math.max(0, prjMT - prjDelivered)
              ).toFixed(2)
            )
          ),
        };

        setStats(combinedStats);
        setOrders(sarthakOrders || []);
        setProjectOrders(allProjectOrders || []);
        setDispatches(dispatchList || []);
      } catch (err) {
        console.error('Dashboard loadData error:', err);
        if (isMounted) setError(err?.message || 'Failed to load dashboard data. Please check connection and try again.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    if (isUnauthorizedUser) {
      setLoading(false);
      return;
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [effectiveBrand, refreshKey, isSalesRole, isDistributor, isManager, ownOrdersOnly, user, isUnauthorizedUser]);

  useEffect(() => {
    setDashboardPage(1);
  }, [effectiveBrand, activeAllTab]);

  // Restrict brand summary cards to the user's firm unless they can view all firms
  const visibleBrands = useMemo(() => {
    if (!canAccessAllFirms || effectiveBrand !== 'all') {
      return TMT_BRANDS.filter((b) => b.id === effectiveBrand);
    }
    return TMT_BRANDS;
  }, [canAccessAllFirms, effectiveBrand]);

  if (isUnauthorizedUser) {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-amber-200 bg-white p-6 sm:p-10 text-center shadow-xs space-y-4">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
              Module Access Restricted
            </h2>
            <p className="text-sm font-bold text-[#a81b1e]">
              You are not authorized to access this module. Connect with administrator.
            </p>
          </div>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Your user account is active, but no operational designation or firm has been assigned to your profile. Please contact your Super Administrator to configure your access privileges.
          </p>
          <div className="pt-2 flex items-center justify-center gap-2 text-xs text-slate-600">
            <span className="font-semibold">User:</span>
            <span className="font-mono font-bold text-slate-800">{user?.full_name || user?.username}</span>
            <span className="text-slate-300">&bull;</span>
            <span className="font-semibold">Role:</span>
            <span className="font-mono text-slate-800 uppercase">{user?.role || 'user'}</span>
            <span className="text-slate-300">&bull;</span>
            <span className="font-semibold">Position:</span>
            <span className="font-mono text-amber-700 font-bold">Unassigned</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-white p-5 border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              {isASM
                ? 'ASM Sales '
                : isManager
                  ? `${firmAccess?.firmName} Project Overview`
                  : 'Order & Dispatch Overview'}
            </h1>
            {isASM ? (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200">
                {user?.full_name || 'ASM'} &bull; Sales ID: {user?.emp_id}
              </span>
            ) : isManager ? (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200">
                Manager: {user?.full_name || user?.username} &bull; Firm: {firmAccess?.firmName || `#${firmAccess?.firmId}`}
              </span>
            ) : canAccessAllFirms && effectiveBrand === 'all' ? (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                All Firms Data
              </span>
            ) : (
              null
            )}
          </div>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            {isASM
              ? `Sarthak TMT sales overview`
              : isManager
                ? `Authorized project & indent orders for ${firmAccess?.firmName || 'assigned firm'}`
                : firmAccess?.isRestricted
                  ? `Dashboard view for ${firmAccess.firmName} (Position: ${firmAccess.position})`
                  : 'Real-time tonnage tracking across all brands'}
          </p>
        </div>
      </div>

      {/* Error Alert Banner */}
      {error && (
        <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-red-200 bg-red-50 text-xs text-[#a81b1e]">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span><strong>Failed to load data:</strong> {error}</span>
          </div>
          <button
            onClick={() => triggerRefresh()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#a81b1e] hover:bg-[#8e1518] text-white font-bold transition cursor-pointer shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        </div>
      )}

      {/* KPI Stats Grid - 2x2 on mobile, 4 columns on large screens */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          title={isASM ? 'Total Booked (MT)' : 'Total Booked'}
          value={stats?.totalOrderedMT?.toLocaleString() || '0'}
          unit="MT"
          icon={Package}
          textColor="text-blue-600"
          iconBg="bg-blue-50 text-blue-600"
          isLoading={loading}
        />

        <StatCard
          title={ownOrdersOnly || isManager ? 'Total Order Value' : 'Dispatched'}
          value={
            ownOrdersOnly || isManager
              ? stats?.totalOrderValue > 0
                ? stats.totalOrderValue >= 10000000
                  ? (stats.totalOrderValue / 10000000).toFixed(2)
                  : stats.totalOrderValue >= 100000
                    ? (stats.totalOrderValue / 100000).toFixed(2)
                    : stats.totalOrderValue.toLocaleString('en-IN')
                : '0'
              : stats?.totalDeliveredMT?.toLocaleString() || '0'
          }
          unit={
            ownOrdersOnly || isManager
              ? stats?.totalOrderValue >= 10000000
                ? 'Cr (₹)'
                : stats?.totalOrderValue >= 100000
                  ? 'Lakh (₹)'
                  : '₹'
              : 'MT'
          }
          icon={CheckCircle}
          textColor="text-[#a81b1e]"
          iconBg="bg-red-50 text-[#a81b1e]"
          isLoading={loading}
        />

        <StatCard
          title={ownOrdersOnly || isManager ? 'Pending Dispatch' : 'Pending'}
          value={stats?.totalPendingMT?.toLocaleString() || '0'}
          unit="MT"
          icon={Clock}
          textColor="text-amber-600"
          iconBg="bg-amber-50 text-amber-600"
          isLoading={loading}
        />

        <StatCard
          title={ownOrdersOnly ? (isDistributor ? 'My Orders' : 'My Booked Orders') : isManager ? 'Project Orders' : 'Active Trucks'}
          value={ownOrdersOnly || isManager ? (orders?.length || 0) : (dispatches?.length || 0)}
          unit={ownOrdersOnly || isManager ? 'Orders' : 'Trucks'}
          icon={ownOrdersOnly || isManager ? Package : Truck}
          textColor="text-cyan-600"
          iconBg="bg-cyan-50 text-cyan-600"
          isLoading={loading}
        />
      </div>

      {/* Brand Summary Cards - only for non-managers */}
      {!isManager && (
        <div className={`grid grid-cols-1 ${visibleBrands.length === 1 ? 'lg:grid-cols-1 max-w-md' : 'lg:grid-cols-3'} gap-4`}>
          {loading ? (
            Array.from({ length: visibleBrands.length || 3 }).map((_, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs animate-pulse"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-slate-200" />
                    <div className="h-4 w-28 bg-slate-200 rounded" />
                  </div>
                  <div className="h-4 w-20 bg-slate-100 rounded" />
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <div className="h-3 w-16 bg-slate-100 rounded" />
                    <div className="h-3.5 w-20 bg-slate-200 rounded" />
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="h-3 w-16 bg-slate-100 rounded" />
                    <div className="h-3.5 w-20 bg-slate-200 rounded" />
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="h-3 w-16 bg-slate-100 rounded" />
                    <div className="h-3.5 w-20 bg-slate-200 rounded" />
                  </div>

                  <div className="pt-2">
                    <div className="flex justify-between items-center mb-2">
                      <div className="h-3 w-16 bg-slate-100 rounded" />
                      <div className="h-3 w-8 bg-slate-200 rounded" />
                    </div>
                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                      <div className="h-full bg-slate-200 rounded-full w-1/3" />
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            visibleBrands.map((brand) => {
              let brandOrderedMT = 0;
              let brandDispatchedMT = 0;
              let retailMT = null;
              let projectMT = null;

              if (brand.id === 'sarthak') {
                const bOrders = orders.filter((o) => o.brandId === 'sarthak' || !o.brandId);
                brandOrderedMT = bOrders.reduce((sum, o) => sum + (o.orderedMT || o.order_qty || 0), 0);
                brandDispatchedMT = bOrders.reduce((sum, o) => sum + (o.deliveredMT || 0), 0);
                // Plus Sarthak project orders
                const sarthakProjects = projectOrders.filter((o) => o.brandId === 'sarthak');
                retailMT = brandOrderedMT;
                projectMT = sarthakProjects.reduce((sum, o) => sum + (o.total_qty || 0), 0);
                brandOrderedMT += projectMT;
                brandDispatchedMT += sarthakProjects
                  .reduce((sum, o) => sum + (o.dispatched_qty || 0), 0);
              } else if (brand.id === 'jsw') {
                const jsw = (effectiveBrand === 'jsw' ? orders : projectOrders).filter(
                  (o) =>
                    Number(o.firm_id) === 2 ||
                    /jsw/i.test(o.firm_name || '') ||
                    /jsw/i.test(o.order_id || '') ||
                    /jsw/i.test(o.brand_type || '')
                );
                brandOrderedMT = jsw.reduce((sum, o) => sum + (o.total_qty || 0), 0);
                brandDispatchedMT = jsw
                  .reduce((sum, o) => sum + (o.dispatched_qty || 0), 0);
              } else if (brand.id === 'essar') {
                const essar = (effectiveBrand === 'essar' ? orders : projectOrders).filter(
                  (o) =>
                    [3, 6].includes(Number(o.firm_id)) ||
                    /essar/i.test(o.firm_name || '') ||
                    /essar/i.test(o.order_id || '')
                );
                brandOrderedMT = essar.reduce((sum, o) => sum + (o.total_qty || 0), 0);
                brandDispatchedMT = essar
                  .reduce((sum, o) => sum + (o.dispatched_qty || 0), 0);
              }

              const brandPendingMT = Math.max(0, brandOrderedMT - brandDispatchedMT);
              const pct = brandOrderedMT > 0 ? Math.round((brandDispatchedMT / brandOrderedMT) * 100) : 0;

              return (
                <div
                  key={brand.id}
                  className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: brand.color }}
                      />
                      <h3 className="font-bold text-slate-900 text-sm">{brand.name}</h3>
                    </div>
                    {brand.isOwnBrand && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-50 text-[#a81b1e] border border-red-200">
                        Our Flagship Brand
                      </span>
                    )}
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-medium">Booked:</span>
                      <span className="font-bold text-slate-900">{brandOrderedMT.toFixed(2)} MT</span>
                    </div>
                    {retailMT !== null && (
                      <div className="flex justify-between pl-2 text-[11px]">
                        <span className="text-slate-400 font-medium">Retail / Project:</span>
                        <span className="font-semibold text-slate-600">
                          {retailMT.toFixed(2)} / {projectMT.toFixed(2)} MT
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-medium">Delivered:</span>
                      <span className="font-bold text-[#a81b1e]">{brandDispatchedMT.toFixed(2)} MT</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-medium">Pending:</span>
                      <span className="font-bold text-amber-700">{brandPendingMT.toFixed(2)} MT</span>
                    </div>

                    <div className="pt-2">
                      <div className="flex justify-between text-[11px] font-bold text-slate-600 mb-1">
                        <span>Fulfillment</span>
                        <span>{pct}%</span>
                      </div>
                      <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{ width: `${pct}%`, backgroundColor: brand.color }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Orders Table */}
      {(() => {
        // Retail / Project tabs: all-firms view and the Sarthak view (not for own-orders-only users)
        const showOrderTabs =
          !isManager &&
          !isDistributor &&
          ((effectiveBrand === 'all' && canAccessAllFirms && !isSalesRole) || (effectiveBrand === 'sarthak' && !ownOrdersOnly));

        const isShowingProjectOrders =
          isManager ||
          effectiveBrand === 'jsw' ||
          effectiveBrand === 'essar' ||
          (showOrderTabs && activeAllTab === 'project');

        const displayProjectOrders =
          isManager || effectiveBrand === 'jsw' || effectiveBrand === 'essar'
            ? orders
            : projectOrders;

        const paginatedDisplayProjectOrders = (displayProjectOrders || []).slice(
          (dashboardPage - 1) * dashboardPageSize,
          (dashboardPage - 1) * dashboardPageSize + dashboardPageSize
        );

        return (
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h2 className="text-base font-bold text-slate-900">
                {isManager
                  ? `${firmAccess?.firmName || 'Firm'} Project Orders`
                  : effectiveBrand === 'jsw'
                    ? 'JSW Project Orders'
                    : effectiveBrand === 'essar'
                      ? 'ESSAR Project Orders'
                      : effectiveBrand === 'sarthak'
                        ? isShowingProjectOrders
                          ? 'Sarthak TMT Project Orders'
                          : 'Sarthak TMT Retail Orders'
                        : 'Recent Orders'}
              </h2>

              {showOrderTabs && (
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 overflow-x-auto no-scrollbar max-w-full">
                  <button
                    onClick={() => setActiveAllTab('standard')}
                    className={`${isProjectManager ? 'order-2' : ''} px-3 py-1 rounded text-xs font-bold whitespace-nowrap shrink-0 transition cursor-pointer ${activeAllTab === 'standard'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                      }`}
                  >
                    {effectiveBrand === 'sarthak' ? 'Retail Orders' : 'Sarthak Retail Orders'} ({orders.length})
                  </button>
                  <button
                    onClick={() => setActiveAllTab('project')}
                    className={`px-3 py-1 rounded text-xs font-bold whitespace-nowrap shrink-0 transition cursor-pointer ${activeAllTab === 'project'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                      }`}
                  >
                    {effectiveBrand === 'sarthak' ? 'Project Orders' : 'Project Orders (All Firms)'} ({projectOrders.length})
                  </button>
                </div>
              )}
            </div>

            {isShowingProjectOrders ? (
              <div className="space-y-3">
                {/* Mobile Card List (Visible on screens < 768px) */}
                <div className="block md:hidden space-y-3">
                  {loading ? (
                    Array.from({ length: 3 }).map((_, idx) => (
                      <div key={idx} className="p-4 rounded-xl border border-slate-200 bg-white animate-pulse space-y-2">
                        <div className="flex justify-between">
                          <div className="h-4 w-28 bg-slate-200 rounded" />
                          <div className="h-4 w-16 bg-slate-200 rounded" />
                        </div>
                        <div className="h-3 w-40 bg-slate-100 rounded" />
                        <div className="h-8 bg-slate-50 rounded" />
                      </div>
                    ))
                  ) : displayProjectOrders.length === 0 ? (
                    <div className="p-8 rounded-xl border border-slate-200 bg-white text-center text-slate-400">
                      No project orders registered for this view yet.
                    </div>
                  ) : (
                    paginatedDisplayProjectOrders.map((o) => {
                      const subtype =
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
                          className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-2xs space-y-2.5 transition hover:border-slate-300"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <button
                                onClick={() => setSelectedProjectOrder(o)}
                                className="font-mono font-bold text-slate-900 hover:text-[#a81b1e] text-sm text-left block"
                              >
                                {o.order_id}
                              </button>
                              <p className="text-[11px] text-slate-400 font-mono mt-0.5">{o.date}</p>
                            </div>
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              {o.status || 'Pending'}
                            </span>
                          </div>

                          {!hidePartyColumn && o.party_name && (
                            <p className="text-xs font-bold text-slate-800 truncate">
                              {o.party_name}
                            </p>
                          )}

                          <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
                            <span className="font-mono text-slate-500">
                              PO: <strong className="text-slate-700">{o.po_number || '—'}</strong>
                            </span>
                            {subtype && (
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${subtype === 'One Helix'
                                  ? 'bg-purple-100 text-purple-800'
                                  : subtype === 'ESSAR Steel' || subtype === 'ESSAR' || isEssarSelected
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-blue-100 text-blue-800'
                                  }`}
                              >
                                {subtype}
                              </span>
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-2 p-2 rounded-lg bg-slate-50 text-xs">
                            <div>
                              <span className="text-[10px] text-slate-500 font-bold block">Tonnage</span>
                              <span className="font-mono font-bold text-slate-900">
                                {(o.total_qty || 0).toFixed(2)} MT
                              </span>
                            </div>
                            <div className="text-right">
                              <span className="text-[10px] text-slate-500 font-bold block">Value</span>
                              <span className="font-mono font-black text-slate-900">
                                ₹{(o.total_value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                              </span>
                            </div>
                          </div>

                          <div className="flex justify-end pt-1">
                            <button
                              onClick={() => setSelectedProjectOrder(o)}
                              className="px-3 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer"
                            >
                              View Details
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Desktop Table (Hidden on screens < 768px) */}
                <div className="hidden md:block overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                        <tr>
                          <th className="py-3 px-3.5">Order ID & Date</th>
                          {!hidePartyColumn && <th className="py-3 px-3.5">Party / Client</th>}
                          <th className="py-3 px-3.5">{hideSpecificationColumn ? 'Brand / Series' : 'Specification'}</th>
                          <th className="py-3 px-3.5">PO Number</th>
                          <th className="py-3 px-3.5 text-right">Tonnage</th>
                          <th className="py-3 px-3.5 text-right">Order Value</th>
                          <th className="py-3 px-3.5 text-center">Status</th>
                          <th className="py-3 px-3.5 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium">
                        {loading ? (
                          Array.from({ length: 5 }).map((_, idx) => (
                            <tr key={idx} className="animate-pulse">
                              <td className="py-3 px-3.5">
                                <div className="h-3.5 w-24 bg-slate-200 rounded mb-1.5" />
                                <div className="h-2.5 w-16 bg-slate-100 rounded" />
                              </td>
                              {!hidePartyColumn && (
                                <td className="py-3 px-3.5">
                                  <div className="h-3.5 w-28 bg-slate-200 rounded" />
                                </td>
                              )}
                              <td className="py-3 px-3.5">
                                <div className="h-5 w-20 bg-slate-200 rounded" />
                              </td>
                              <td className="py-3 px-3.5">
                                <div className="h-3.5 w-16 bg-slate-100 rounded font-mono" />
                              </td>
                              <td className="py-3 px-3.5 text-right">
                                <div className="h-3.5 w-14 bg-slate-200 rounded ml-auto" />
                              </td>
                              <td className="py-3 px-3.5 text-right">
                                <div className="h-3.5 w-16 bg-slate-200 rounded ml-auto" />
                              </td>
                              <td className="py-3 px-3.5 text-center">
                                <div className="h-4 w-14 bg-slate-100 rounded mx-auto" />
                              </td>
                              <td className="py-3 px-3.5 text-right">
                                <div className="h-6 w-12 bg-slate-200 rounded ml-auto" />
                              </td>
                            </tr>
                          ))
                        ) : displayProjectOrders.length === 0 ? (
                          <tr>
                            <td colSpan={hidePartyColumn ? 7 : 8} className="py-8 text-center text-slate-400">
                              No project orders registered for this view yet.
                            </td>
                          </tr>
                        ) : (
                          paginatedDisplayProjectOrders.map((o) => {
                            const subtype =
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
                                className="hover:bg-slate-50 cursor-pointer"
                                onClick={() => setSelectedProjectOrder(o)}
                              >
                                <td className="py-3 px-3.5">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedProjectOrder(o);
                                    }}
                                    className="font-mono font-bold text-slate-900 hover:text-[#a81b1e] hover:underline cursor-pointer text-left block"
                                  >
                                    {o.order_id}
                                  </button>
                                  <p className="text-[10px] text-slate-400 font-mono">{o.date}</p>
                                </td>
                                {!hidePartyColumn && <td className="py-3 px-3.5 font-bold text-slate-900">{o.party_name || '—'}</td>}
                                <td className="py-3 px-3.5">
                                  {hideSpecificationColumn ? (
                                    <span
                                      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-extrabold ${subtype === 'One Helix'
                                        ? 'bg-purple-100 text-purple-800 border border-purple-200'
                                        : subtype === 'ESSAR Steel' || subtype === 'ESSAR' || isEssarSelected
                                          ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                          : 'bg-blue-100 text-blue-800 border border-blue-200'
                                        }`}
                                    >
                                      {subtype}
                                    </span>
                                  ) : (
                                    <span className="text-slate-700 font-medium truncate max-w-xs block">
                                      {o.specification || o.product_details?.specification || '—'}
                                    </span>
                                  )}
                                </td>
                                <td className="py-3 px-3.5 font-mono text-slate-700">{o.po_number || '—'}</td>
                                <td className="py-3 px-3.5 text-right font-mono font-bold text-slate-900">
                                  {(o.total_qty || 0).toFixed(2)} MT
                                </td>
                                <td className="py-3 px-3.5 text-right font-mono font-black text-slate-900">
                                  ₹{(o.total_value || 0).toLocaleString('en-IN')}
                                </td>
                                <td className="py-3 px-3.5 text-center">
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                    {o.status || 'Pending'}
                                  </span>
                                </td>
                                <td className="py-3 px-3.5 text-right">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedProjectOrder(o);
                                    }}
                                    className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] transition cursor-pointer"
                                  >
                                    View
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Desktop Row Pagination for project orders */}
                  <Pagination
                    currentPage={dashboardPage}
                    totalItems={(displayProjectOrders || []).length}
                    pageSize={dashboardPageSize}
                    onPageChange={(page) => setDashboardPage(page)}
                    onPageSizeChange={(size) => setDashboardPageSize(size)}
                    pageSizeOptions={[10, 15, 25, 50]}
                  />
                </div>

                {/* Mobile Row Pagination for project orders */}
                <div className="block md:hidden bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                  <Pagination
                    currentPage={dashboardPage}
                    totalItems={(displayProjectOrders || []).length}
                    pageSize={dashboardPageSize}
                    onPageChange={(page) => setDashboardPage(page)}
                    onPageSizeChange={(size) => setDashboardPageSize(size)}
                    pageSizeOptions={[10, 15, 25]}
                  />
                </div>
              </div>
            ) : (
              <OrdersTable
                orders={orders}
                loading={loading}
                onOpenDispatch={canDispatch ? (order) => setDispatchModalOrder({ ...order, dispatchType: 'retail' }) : undefined}
              />
            )}
          </div>
        );
      })()}

      {/* Modals */}
      {isManager ? (
        <CreateProjectOrderModal
          isOpen={isOrderModalOpen && canCreateOrders}
          onClose={() => setIsOrderModalOpen(false)}
          onOrderCreated={() => {
            if (isManager) {
              projectOrdersApi.getProjectOrders(firmAccess?.firmId).then((prjOrders) => {
                setOrders(prjOrders);
                const totalMT = prjOrders.reduce((acc, o) => acc + (o.total_qty || 0), 0);
                const totalVal = prjOrders.reduce((acc, o) => acc + (o.total_value || 0), 0);
                setStats({
                  totalOrders: prjOrders.length,
                  totalOrderedMT: totalMT,
                  totalOrderValue: totalVal,
                  totalDeliveredMT: 0,
                  totalPendingMT: totalMT,
                });
              });
            }
          }}
        />
      ) : (
        <CreateOrderModal
          isOpen={isOrderModalOpen && canCreateOrders}
          onClose={() => setIsOrderModalOpen(false)}
          defaultBrand={selectedBrand}
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
