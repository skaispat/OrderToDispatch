import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { StatCard } from '../components/common/StatCard';
import { OrdersTable } from '../components/orders/OrdersTable';
import { CreateOrderModal } from '../components/orders/CreateOrderModal';
import { ordersApi } from '../api/ordersApi';
import { distributorApi } from '../api/distributorApi';
import {
  Building2,
  Package,
  Plus,
  Truck,
  CheckCircle,
  ArrowRight,
  ShoppingCart,
  Clock,
} from 'lucide-react';

export const DistributorDashboard = ({ onNavigateToOrders }) => {
  const { user, distributorFirmId } = useAuth();
  const { selectedBrand, refreshKey } = useApp();

  const [distInfo, setDistInfo] = useState(null);
  const [orders, setOrders] = useState([]);
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);

  useEffect(() => {
    const loadDistData = async () => {
      try {
        let currentDist = null;
        if (distributorFirmId) {
          try {
            currentDist = await distributorApi.getDistributorById(distributorFirmId);
          } catch (e) {
            console.warn('Distributor not found by firm_id in database:', e);
          }
        }
        if (!currentDist) {
          try {
            const list = await distributorApi.getDistributors();
            if (list && list.length > 0) {
              currentDist =
                list.find(
                  (d) =>
                    d.id === distributorFirmId ||
                    d.sales_person_id === user?.emp_id ||
                    d.name?.toLowerCase() === user?.full_name?.toLowerCase()
                ) || null;
            }
          } catch (e) {
            console.warn('Error querying distributor table from database:', e);
          }
        }

        // Only use details that exist in database
        const resolvedDist = {
          id: currentDist?.id || distributorFirmId || user?.emp_id || null,
          name: currentDist?.name || user?.full_name || user?.username || '',
          address: currentDist?.address || '',
          state: currentDist?.state || '',
          phone: currentDist?.phone || user?.mobile_number || '',
          sales_person_id: currentDist?.sales_person_id || null,
        };

        setDistInfo(resolvedDist);

        if (resolvedDist.id) {
          const orderList = await ordersApi.getOrders({
            distributorId: resolvedDist.id,
            brandId: selectedBrand,
          });
          setOrders(orderList || []);
        } else {
          setOrders([]);
        }
      } catch (err) {
        console.warn('Distributor dashboard database load error:', err);
      }
    };
    loadDistData();
  }, [user, selectedBrand, refreshKey]);

  const totalOrdered = orders.reduce(
    (sum, o) => sum + parseFloat(o.orderedMT || o.quantity || 0),
    0
  );
  const totalDelivered = orders.reduce(
    (sum, o) => sum + parseFloat(o.deliveredMT || o.dispatched_qty || 0),
    0
  );
  const totalPending = Math.max(0, totalOrdered - totalDelivered);
  const fulfillmentRate =
    totalOrdered > 0 ? Math.round((totalDelivered / totalOrdered) * 100) : 0;

  const partnerDetails = [
    distInfo?.address,
    distInfo?.state,
    distInfo?.phone ? `Phone: ${distInfo.phone}` : '',
  ]
    .filter(Boolean)
    .join(' • ');

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-xl bg-white p-4 sm:p-5 border border-slate-200/80 shadow-xs">
        <div className="flex items-start sm:items-center gap-3">
          <div className="p-2.5 sm:p-3 rounded-xl bg-red-50 text-[#a81b1e] border border-red-200 shrink-0">
            <Building2 className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg sm:text-2xl font-black text-slate-900 tracking-tight">
                {distInfo?.name || user?.full_name || user?.username}
              </h1>
              <span className="text-[10px] px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200 font-bold uppercase">
                Authorized Partner
              </span>
            </div>
            {partnerDetails ? (
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                {partnerDetails}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {onNavigateToOrders && (
            <button
              onClick={onNavigateToOrders}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-700 shadow-2xs transition cursor-pointer"
            >
              <ShoppingCart className="w-3.5 h-3.5 text-slate-500" />
              <span>My Orders</span>
            </button>
          )}

          <button
            onClick={() => setIsOrderModalOpen(true)}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 rounded-lg bg-[#a81b1e] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#8e1518] transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Book Indent
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          title="Total Booked"
          value={totalOrdered.toFixed(2)}
          unit="MT"
          icon={Package}
          textColor="text-slate-900"
          iconBg="bg-slate-100 text-slate-700"
        />

        <StatCard
          title="Delivered"
          value={totalDelivered.toFixed(2)}
          unit="MT"
          icon={CheckCircle}
          textColor="text-[#a81b1e]"
          iconBg="bg-red-50 text-[#a81b1e]"
        />

        <StatCard
          title="Pending Dispatch"
          value={totalPending.toFixed(2)}
          unit="MT"
          icon={Clock}
          textColor="text-amber-600"
          iconBg="bg-amber-50 text-amber-600"
        />

        <StatCard
          title="Fulfillment"
          value={fulfillmentRate}
          unit="%"
          icon={Truck}
          textColor="text-cyan-700"
          iconBg="bg-cyan-50 text-cyan-700"
        />
      </div>

      {/* Orders Table Section */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900">Indents & Active Orders</h2>
            <p className="text-xs text-slate-500">
              Live fulfillment status and rebar lot schedules from database
            </p>
          </div>

          {onNavigateToOrders && (
            <button
              onClick={onNavigateToOrders}
              className="flex items-center gap-1 text-xs font-bold text-[#a81b1e] hover:underline cursor-pointer"
            >
              <span>View all orders and full breakdown</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <OrdersTable orders={orders} />
      </div>

      <CreateOrderModal
        isOpen={isOrderModalOpen}
        onClose={() => setIsOrderModalOpen(false)}
        defaultBrand={selectedBrand}
      />
    </div>
  );
};
