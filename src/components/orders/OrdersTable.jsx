import React, { useState } from 'react';
import { BrandBadge } from '../common/BrandBadge';
import { StatusBadge } from '../common/StatusBadge';
import { OrderDetailModal } from './OrderDetailModal';
import { Pagination } from '../common/Pagination';
import { useAuth } from '../../context/AuthContext';
import { ordersApi } from '../../api/ordersApi';
import { useApp } from '../../context/AppContext';
import {
  ChevronDown,
  ChevronUp,
  Truck,
  CheckCircle,
  Building,
  Store,
  Eye,
} from 'lucide-react';

export const OrdersTable = ({ orders = [], onOpenDispatch, onViewDetails, loading = false }) => {
  const { isASM, isDistributor, isSalesPerson, canEdit } = useAuth();
  const canDispatch = canEdit('dispatch');
  const canApprove = canEdit('orders');
  const { triggerRefresh, showToast } = useApp();
  const [expandedOrderId, setExpandedOrderId] = useState(null);
  const [modalOrder, setModalOrder] = useState(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  React.useEffect(() => {
    setCurrentPage(1);
  }, [orders?.length]);

  const paginatedOrders = React.useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return orders.slice(start, start + pageSize);
  }, [orders, currentPage, pageSize]);

  const toggleExpand = (id) => {
    setExpandedOrderId((prev) => (prev === id ? null : id));
  };

  const handleOpenDetails = (order) => {
    if (onViewDetails) {
      onViewDetails(order);
    } else {
      setModalOrder(order);
    }
  };

  const handleStatusChange = async (orderId, newStatus) => {
    if (!canApprove) {
      alert('Access Denied: You have view-only access to Orders.');
      return;
    }
    try {
      await ordersApi.updateOrderStatus(orderId, newStatus);
      showToast(`Order ${orderId} updated to ${newStatus}`);
      triggerRefresh();
    } catch (err) {
      alert('Error updating status: ' + err.message);
    }
  };

  if (loading) {
    return (
      <div>
        {/* Mobile Skeleton */}
        <div className="block md:hidden space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-3.5 rounded-xl border border-slate-200 bg-white shadow-xs space-y-3 animate-pulse">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="space-y-1">
                  <div className="h-4 w-28 bg-slate-200 rounded" />
                  <div className="h-2.5 w-16 bg-slate-100 rounded" />
                </div>
                <div className="h-5 w-16 bg-slate-100 rounded-full" />
              </div>
              <div className="space-y-2">
                <div className="h-3 w-40 bg-slate-100 rounded" />
                <div className="h-3 w-28 bg-slate-100 rounded" />
              </div>
              <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-100">
                <div className="h-9 bg-slate-50 rounded" />
                <div className="h-9 bg-slate-50 rounded" />
                <div className="h-9 bg-slate-50 rounded" />
              </div>
            </div>
          ))}
        </div>

        {/* Desktop Skeleton */}
        <div className="hidden md:block overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs animate-pulse">
          <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between">
            <div className="h-3 w-24 bg-slate-200 rounded" />
            <div className="h-3 w-24 bg-slate-200 rounded" />
          </div>
          <div className="p-4 divide-y divide-slate-100 space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center justify-between pt-3 gap-3">
                <div className="h-4 w-28 bg-slate-200 rounded" />
                <div className="h-4 w-20 bg-slate-100 rounded" />
                <div className="h-4 w-32 bg-slate-100 rounded" />
                <div className="h-4 w-24 bg-slate-100 rounded" />
                <div className="h-4 w-16 bg-slate-200 rounded" />
                <div className="h-4 w-20 bg-slate-200 rounded" />
                <div className="h-5 w-16 bg-slate-100 rounded-full" />
                <div className="h-6 w-14 bg-slate-100 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!orders || orders.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-xs text-slate-500 font-medium">
        No orders found.
      </div>
    );
  }

  return (
    <div>
      {/* MOBILE CARD VIEW: Visible on screens < 768px (Phones, Small Tablets) */}
      <div className="block md:hidden space-y-3">
        {paginatedOrders.map((order) => {
          const qty = parseFloat(order.order_qty || order.orderedMT || 0);
          const rate = parseFloat(order.order_value || order.price || 0);
          const totalVal = parseFloat(
            order.total_order_value || order.totalValue || qty * rate || 0
          );

          return (
            <div
              key={order.id}
              className="p-3.5 rounded-xl border border-slate-200 bg-white shadow-xs space-y-3"
            >
              {/* Header */}
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                <div>
                  <button
                    onClick={() => handleOpenDetails(order)}
                    className="font-bold text-slate-900 text-sm hover:text-[#a81b1e] text-left"
                  >
                    {order.id}
                  </button>
                  <p className="text-[10px] text-slate-400 font-mono mt-0.5">{order.date}</p>
                </div>
                <StatusBadge status={order.status} />
              </div>

              {/* Distributor & Dealer on Mobile */}
              <div className="space-y-1.5 text-xs">
                {isDistributor ? (
                  <div className="flex items-start gap-1.5 text-slate-900">
                    <Store className="w-3.5 h-3.5 text-[#a81b1e] mt-0.5 shrink-0" />
                    <span className="text-xs">
                      Dealer: <strong className="text-slate-800">{order.dealerName || 'Self'}</strong>
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start gap-1.5 text-slate-900">
                      <Building className="w-3.5 h-3.5 text-[#a81b1e] mt-0.5 shrink-0" />
                      <span className="font-bold truncate">{order.distributorName || '—'}</span>
                    </div>
                    <div className="flex items-start gap-1.5 text-slate-600 pl-0.5">
                      <Store className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                      <span className="text-[11px] truncate">
                        Dealer: <strong className="text-slate-700">{order.dealerName || 'Self'}</strong>
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* Sales Officer / Distributor Name Badge on Mobile */}
              <div className="flex items-center justify-between text-[11px] bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-100">
                <span className="text-slate-500 font-medium">
                  {isSalesPerson ? 'Distributor Name' : 'Sales Officer'}
                </span>
                <span className="font-bold text-slate-800 truncate max-w-[65%] text-right">
                  {isSalesPerson
                    ? (order.distributorName || '—')
                    : (order.sales_person_name || '—') +
                      (order.sales_person_id ? ` (ID: ${order.sales_person_id})` : '')}
                </span>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-3 gap-2 text-center pt-1 border-t border-slate-100">
                <div className="bg-slate-50 rounded-lg p-2 border border-slate-100">
                  <span className="text-[9px] uppercase tracking-wider text-slate-400 block font-bold">Qty</span>
                  <span className="text-xs font-black text-slate-800">{qty.toFixed(2)} MT</span>
                </div>
                <div className="bg-slate-50 rounded-lg p-2 border border-slate-100">
                  <span className="text-[9px] uppercase tracking-wider text-slate-400 block font-bold">Rate</span>
                  <span className="text-xs font-mono font-bold text-slate-800">{rate > 0 ? `₹${rate.toLocaleString('en-IN')}` : '—'}</span>
                </div>
                <div className="bg-red-50/70 rounded-lg p-2 border border-red-100">
                  <span className="text-[9px] uppercase tracking-wider text-[#a81b1e] block font-bold">Total</span>
                  <span className="text-xs font-black text-[#a81b1e]">
                    {totalVal > 0 ? `₹${totalVal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '—'}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="pt-1 flex gap-2">
                <button
                  onClick={() => handleOpenDetails(order)}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 transition cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5 text-slate-500" />
                  View Details
                </button>
                {canDispatch && onOpenDispatch && order.status !== 'delivered' && (
                  <button
                    onClick={() => onOpenDispatch(order)}
                    className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-[#a81b1e] hover:bg-[#8e1518] text-xs font-bold text-white transition shadow-xs cursor-pointer"
                  >
                    <Truck className="w-3.5 h-3.5" />
                    Dispatch
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Mobile Pagination */}
      <div className="block md:hidden">
        <Pagination
          currentPage={currentPage}
          totalItems={orders.length}
          pageSize={pageSize}
          onPageChange={(page) => setCurrentPage(page)}
          onPageSizeChange={(size) => setPageSize(size)}
          pageSizeOptions={[10, 15, 25, 50]}
          className="rounded-xl border border-slate-200 mt-3"
        />
      </div>

      {/* DESKTOP TABLE VIEW: Visible on screens >= 768px (Tablets, Laptops, Desktops) */}
      <div className="hidden md:block overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
              <tr>
                <th className="py-3 px-3.5">Order ID</th>
                <th className="py-3 px-3.5 whitespace-nowrap">Order Date</th>
                {isSalesPerson ? (
                  <>
                    <th className="py-3 px-3.5">Dealer Name</th>
                    <th className="py-3 px-3.5 text-center">Distributor Name</th>
                  </>
                ) : isDistributor ? (
                  <>
                    <th className="py-3 px-3.5">Dealer Name</th>
                    <th className="py-3 px-3.5 text-center">Sales Officer</th>
                  </>
                ) : (
                  <>
                    <th className="py-3 px-3.5">Distributor & Dealer</th>
                    <th className="py-3 px-3.5 text-center">Sales Officer</th>
                  </>
                )}
                <th className="py-3 px-3.5 text-right">Order Qty</th>
                <th className="py-3 px-3.5 text-right">Price / MT</th>
                <th className="py-3 px-3.5 text-right">Total Value</th>
                <th className="py-3 px-3.5 text-center">Status</th>
                <th className="py-3 px-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedOrders.map((order) => {
                const isExpanded = expandedOrderId === order.id;
                const qty = parseFloat(order.order_qty || order.orderedMT || 0);
                const rate = parseFloat(order.order_value || order.price || 0);
                const totalVal = parseFloat(
                  order.total_order_value || order.totalValue || qty * rate || 0
                );

                return (
                  <React.Fragment key={order.id}>
                    <tr className="hover:bg-slate-50/80 transition">
                      {/* Order ID */}
                      <td className="py-3 px-3.5 font-medium text-slate-900">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => toggleExpand(order.id)}
                            className="text-slate-400 hover:text-slate-700"
                          >
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4 text-[#a81b1e]" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </button>
                          <button
                            onClick={() => handleOpenDetails(order)}
                            className="text-left font-bold text-slate-900 hover:text-[#a81b1e] hover:underline cursor-pointer flex items-center gap-1 group whitespace-nowrap"
                          >
                            <span>{order.id}</span>
                          </button>
                        </div>
                      </td>

                      {/* Order Date */}
                      <td className="py-3 px-3.5 font-mono text-slate-600 whitespace-nowrap">{order.date || '—'}</td>

                      {/* Distributor & Dealer / Sales Officer based on role */}
                      {isSalesPerson ? (
                        <>
                          {/* Dealer Name */}
                          <td className="py-3 px-3.5">
                            <p className="font-bold text-slate-900 flex items-center gap-1.5">
                              <Store className="w-3.5 h-3.5 text-slate-500" />
                              {order.dealerName || 'Self'}
                            </p>
                            {order.dealer_id && (
                              <span className="font-mono text-[10px] text-slate-400">
                                ID: {order.dealer_id}
                              </span>
                            )}
                          </td>

                          {/* Distributor Name (replacing Sales Officer column) */}
                          <td className="py-3 px-3.5 text-center">
                            <div className="inline-block text-center">
                              <p className="font-bold text-slate-900 text-xs flex items-center justify-center gap-1">
                                <Building className="w-3.5 h-3.5 text-[#a81b1e]" />
                                {order.distributorName || '—'}
                              </p>
                              {order.distributor_id && (
                                <span className="font-mono text-[10px] text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded inline-block mt-0.5 font-semibold">
                                  ID: {order.distributor_id}
                                </span>
                              )}
                            </div>
                          </td>
                        </>
                      ) : isDistributor ? (
                        <>
                          {/* Dealer Name */}
                          <td className="py-3 px-3.5">
                            <p className="font-bold text-slate-900 flex items-center gap-1.5">
                              <Store className="w-3.5 h-3.5 text-slate-500" />
                              {order.dealerName || 'Self'}
                            </p>
                            {order.dealer_id && (
                              <span className="font-mono text-[10px] text-slate-400">
                                ID: {order.dealer_id}
                              </span>
                            )}
                          </td>

                          {/* Sales Officer */}
                          <td className="py-3 px-3.5 text-center">
                            <div>
                              <p className="font-bold text-slate-900 text-xs">
                                {order.sales_person_name ||
                                  (order.sales_person_id
                                    ? `Officer #${order.sales_person_id}`
                                    : '—')}
                              </p>
                              {order.sales_person_id && (
                                <span className="font-mono text-[10px] text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded inline-block mt-0.5 font-semibold">
                                  ID: {order.sales_person_id}
                                </span>
                              )}
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          {/* Distributor & Dealer */}
                          <td className="py-3 px-3.5">
                            <p className="font-bold text-slate-900 flex items-center gap-1">
                              <Building className="w-3 h-3 text-[#a81b1e]" />
                              {order.distributorName || 'Direct Distributor'}
                            </p>
                            <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                              <Store className="w-3 h-3 text-slate-400" />
                              Dealer:{' '}
                              <strong className="text-slate-700">
                                {order.dealerName || 'Self'}
                              </strong>
                            </p>
                          </td>

                          {/* Sales Officer (Name & ID) */}
                          <td className="py-3 px-3.5 text-center">
                            <div>
                              <p className="font-bold text-slate-900 text-xs">
                                {order.sales_person_name ||
                                  (order.sales_person_id
                                    ? `Officer #${order.sales_person_id}`
                                    : '—')}
                              </p>
                              {order.sales_person_id && (
                                <span className="font-mono text-[10px] text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded inline-block mt-0.5 font-semibold">
                                  ID: {order.sales_person_id}
                                </span>
                              )}
                            </div>
                          </td>
                        </>
                      )}

                      {/* Order Qty */}
                      <td className="py-3 px-3.5 text-right font-extrabold text-slate-900">
                        {qty.toFixed(2)} MT
                      </td>

                      {/* Price / MT */}
                      <td className="py-3 px-3.5 text-right font-mono text-slate-700">
                        {rate > 0 ? `₹${rate.toLocaleString('en-IN')}` : '—'}
                      </td>

                      {/* Total Order Value */}
                      <td className="py-3 px-3.5 text-right font-black text-[#a81b1e]">
                        {totalVal > 0
                          ? `₹${totalVal.toLocaleString('en-IN', {
                              maximumFractionDigits: 2,
                            })}`
                          : '—'}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3.5 text-center">
                        <StatusBadge status={order.status} />
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenDetails(order)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 bg-white text-[11px] font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition cursor-pointer"
                            title="View order details"
                          >
                            <Eye className="w-3 h-3 text-slate-400" />
                            Details
                          </button>

                          {canDispatch && onOpenDispatch && order.status !== 'delivered' && (
                            <button
                              onClick={() => onOpenDispatch(order)}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#a81b1e] text-[11px] font-bold text-white hover:bg-[#8e1518] transition shadow-xs cursor-pointer"
                            >
                              <Truck className="w-3 h-3" />
                              Dispatch
                            </button>
                          )}

                          {canApprove && order.status === 'pending' && (
                            <button
                              onClick={() => handleStatusChange(order.id, 'approved')}
                              className="p-1 rounded-md bg-red-50 text-[#a81b1e] border border-red-200 hover:bg-red-100 transition cursor-pointer"
                              title="Approve"
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Expanded Row for optional details */}
                    {isExpanded && (
                      <tr className="bg-slate-50/60">
                        <td colSpan={9} className="p-3.5">
                          <div className="pl-4 border-l-2 border-[#a81b1e] text-xs text-slate-600 space-y-1">
                            <p>
                              <span className="font-semibold text-slate-700">Order ID:</span> {order.id} &bull;{' '}
                              <span className="font-semibold text-slate-700">Date:</span> {order.date}
                            </p>
                            {order.product_description && (
                              <p>
                                <span className="font-semibold text-slate-700">Description:</span> {order.product_description}
                              </p>
                            )}
                            {order.po_number && (
                              <p>
                                <span className="font-semibold text-slate-700">PO Number:</span> {order.po_number}
                              </p>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Row Pagination */}
        <Pagination
          currentPage={currentPage}
          totalItems={orders.length}
          pageSize={pageSize}
          onPageChange={(page) => setCurrentPage(page)}
          onPageSizeChange={(size) => setPageSize(size)}
          pageSizeOptions={[10, 15, 25, 50, 100]}
        />
      </div>

      <OrderDetailModal
        isOpen={Boolean(modalOrder)}
        onClose={() => setModalOrder(null)}
        order={modalOrder}
      />
    </div>
  );
};
