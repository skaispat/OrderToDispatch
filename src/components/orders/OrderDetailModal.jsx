import React from 'react';
import { Modal } from '../common/Modal';
import { Pencil } from 'lucide-react';

// onEdit(order): optional; when given, an "Edit Order" button is shown
export const OrderDetailModal = ({ isOpen, onClose, order, onEdit }) => {
  if (!order) return null;

  const qty = parseFloat(order.order_qty || 0);
  const rate = parseFloat(order.order_value || order.price || 0);
  const totalVal = parseFloat(
    order.total_order_value !== undefined && order.total_order_value !== null
      ? order.total_order_value
      : qty * rate
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Order Details — ${order.order_id || order.id || '#' + order.db_id}`}
      maxWidth="max-w-xl"
    >
      <div className="space-y-4 text-xs">
        {/* 3 Genuine Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
          <div className="p-2.5 sm:p-3 rounded-lg border border-slate-200 bg-slate-50 flex sm:block items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase block sm:mb-1">
              Order Qty
            </span>
            <p className="text-sm sm:text-base font-extrabold text-slate-900">
              {qty.toFixed(2)} <span className="text-xs font-semibold text-slate-500">MT</span>
            </p>
          </div>

          <div className="p-2.5 sm:p-3 rounded-lg border border-slate-200 bg-slate-50 flex sm:block items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase block sm:mb-1">
              Price / MT
            </span>
            <p className="text-sm sm:text-base font-extrabold text-slate-900">
              ₹ {rate > 0 ? rate.toLocaleString('en-IN') : '0'}
            </p>
          </div>

          <div className="p-2.5 sm:p-3 rounded-lg border border-red-200 bg-red-50/70 flex sm:block items-center justify-between">
            <span className="text-[10px] font-bold text-[#a81b1e] uppercase block sm:mb-1">
              Total Order Value
            </span>
            <p className="text-sm sm:text-base font-black text-[#a81b1e]">
              ₹ {totalVal > 0 ? totalVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
            </p>
          </div>
        </div>

        {/* Genuine Database Fields */}
        <div className="rounded-lg border border-slate-200 divide-y divide-slate-100 bg-white">
          <div className="flex justify-between items-center px-3.5 py-2.5">
            <span className="text-slate-500 font-medium">Date</span>
            <span className="font-semibold text-slate-800">
              {order.date || order.created_at?.slice(0, 10) || '—'}
            </span>
          </div>

          <div className="flex justify-between items-center px-3.5 py-2.5">
            <span className="text-slate-500 font-medium">Sales Officer</span>
            <div className="text-right">
              <span className="font-bold text-slate-900 block">
                {order.sales_person_name || (order.sales_person_id ? `Officer #${order.sales_person_id}` : '—')}
              </span>
              {order.sales_person_id && (
                <span className="font-mono text-[11px] text-slate-500 block">
                  ID: {order.sales_person_id}
                </span>
              )}
            </div>
          </div>

          <div className="flex justify-between items-center px-3.5 py-2.5">
            <span className="text-slate-500 font-medium">Distributor</span>
            <span className="font-bold text-slate-900 text-right truncate max-w-[60%]">
              {order.distributorName || (order.distributor_id ? `ID #${order.distributor_id}` : '—')}
            </span>
          </div>

          <div className="flex justify-between items-center px-3.5 py-2.5">
            <span className="text-slate-500 font-medium">Dealer</span>
            <span className="font-semibold text-slate-800 text-right truncate max-w-[60%]">
              {order.dealerName || (order.dealer_id ? `ID #${order.dealer_id}` : 'Self')}
            </span>
          </div>

          {order.po_number ? (
            <div className="flex justify-between items-center px-3.5 py-2.5">
              <span className="text-slate-500 font-medium">PO Number</span>
              <span className="font-mono text-slate-700">{order.po_number}</span>
            </div>
          ) : null}

          {order.product_description ? (
            <div className="flex justify-between items-center px-3.5 py-2.5">
              <span className="text-slate-500 font-medium">Description</span>
              <span className="font-semibold text-slate-800 text-right">{order.product_description}</span>
            </div>
          ) : null}
        </div>

        {/* Close Button */}
        <div className="pt-2 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          {onEdit && (
            <button
              type="button"
              onClick={() => onEdit(order)}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 sm:py-2 rounded-lg bg-[#a81b1e] hover:bg-[#8e1518] text-xs font-bold text-white transition cursor-pointer"
            >
              <Pencil className="w-3.5 h-3.5" />
              Edit Order
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2.5 sm:py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 transition cursor-pointer text-center"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
};
