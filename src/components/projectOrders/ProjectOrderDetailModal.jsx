import React from 'react';
import { Modal } from '../common/Modal';
import { Building, FileText, User, Calendar, Layers, MapPin } from 'lucide-react';

export const ProjectOrderDetailModal = ({ isOpen, onClose, order }) => {
  if (!order) return null;

  const items = Array.isArray(order.items)
    ? order.items
    : Array.isArray(order.product_details?.items)
      ? order.product_details.items
      : [];

  const computedQty = items.reduce((acc, it) => acc + (parseFloat(it.qty) || 0), 0);
  const totalQty = parseFloat(order.total_qty) > 0 ? parseFloat(order.total_qty) : computedQty;
  const computedValue = items.reduce(
    (acc, it) =>
      acc + (parseFloat(it.total) || (parseFloat(it.qty) || 0) * (parseFloat(it.rate) || 0)),
    0
  );
  const totalValue = parseFloat(order.total_value) > 0 ? parseFloat(order.total_value) : computedValue;
  const deliveries = Array.isArray(order.deliveries) ? order.deliveries : [];


  const isJSWFirm = Number(order.firm_id) === 2 || /jsw/i.test(order.firm_name || '');
  const isEssarFirm =
    [3, 6].includes(Number(order.firm_id)) ||
    /essar/i.test(order.firm_name || '');
  const hideParty =
    [2, 6].includes(Number(order.firm_id)) ||
    isEssarFirm ||
    isJSWFirm;
  const hideSpecification = isJSWFirm || isEssarFirm;
  const subtype =
    order.product_details?.subtype ||
    order.product_details?.brand ||
    (isEssarFirm ? 'ESSAR Steel' : isJSWFirm ? 'JSW One' : null);
  const specification =
    order.specification ||
    order.product_details?.specification ||
    order.product_details?.remarks ||
    null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Project Order — ${order.order_id || `#${order.db_id}`}`}
      maxWidth="max-w-2xl"
    >
      <div className="space-y-4 text-xs">
        {/* Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex sm:block items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase block sm:mb-1">
              Total Tonnage
            </span>
            <p className="text-base font-extrabold text-slate-900">
              {totalQty.toFixed(2)} <span className="text-xs font-semibold text-slate-500">MT</span>
            </p>
          </div>

          <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex sm:block items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase block sm:mb-1">
              Product Items
            </span>
            <p className="text-base font-extrabold text-slate-900">
              {items.length} <span className="text-xs font-semibold text-slate-500">Lines</span>
            </p>
          </div>

          <div className="p-3 rounded-xl border border-red-200 bg-red-50/70 flex sm:block items-center justify-between">
            <span className="text-[10px] font-bold text-[#a81b1e] uppercase block sm:mb-1">
              Total Order Value
            </span>
            <p className="text-base font-black text-[#a81b1e]">
              ₹ {totalValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        {/* Header Details */}
        <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 bg-white">
          <div className="flex justify-between items-center px-4 py-2.5">
            <span className="text-slate-500 font-medium flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              Order Date
            </span>
            <span className="font-semibold text-slate-900">{order.date || '—'}</span>
          </div>

          {!hideParty && order.party_name && (
            <div className="flex justify-between items-center px-4 py-2.5">
              <span className="text-slate-500 font-medium flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-slate-400" />
                Party / Client Name
              </span>
              <span className="font-bold text-slate-900">{order.party_name}</span>
            </div>
          )}

          <div className="flex justify-between items-center px-4 py-2.5">
            <span className="text-slate-500 font-medium flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              PO Number
            </span>
            <span className="font-mono font-bold text-slate-800">{order.po_number || '—'}</span>
          </div>

          <div className="flex justify-between items-center px-4 py-2.5">
            <span className="text-slate-500 font-medium flex items-center gap-1.5">
              <Building className="w-3.5 h-3.5 text-slate-400" />
              Firm
            </span>
            <span className="font-bold text-[#a81b1e]">{order.firm_name}</span>
          </div>

          {subtype && (
            <div className="flex justify-between items-center px-4 py-2.5">
              <span className="text-slate-500 font-medium flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-slate-400" />
                {isEssarFirm ? 'Brand Series' : 'Brand Subtype'}
              </span>
              <span
                className={`px-2 py-0.5 rounded text-xs font-extrabold ${subtype === 'One Helix'
                  ? 'bg-purple-100 text-purple-800 border border-purple-200'
                  : subtype === 'ESSAR Steel' || subtype === 'ESSAR' || isEssarFirm
                    ? 'bg-amber-100 text-amber-800 border border-amber-200'
                    : 'bg-blue-100 text-blue-800 border border-blue-200'
                  }`}
              >
                {subtype}
              </span>
            </div>
          )}
        </div>

        {/* Billing & Shipping records (delivery_details) */}
        {deliveries.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-bold text-slate-800 uppercase text-[11px] flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-[#a81b1e]" />
              Billing & Shipping Details ({deliveries.length})
            </h4>
            {deliveries.map((d, idx) => (
              <div key={idx} className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/70 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <span className="text-[9px] uppercase text-slate-400 block font-bold">Billing Address</span>
                  <p className="font-semibold text-slate-900 break-words">{d.billing_address || '—'}</p>
                  <p className="text-[11px] font-mono text-slate-600">GST: {d.billing_address_gst_no || '—'}</p>
                </div>
                <div>
                  <span className="text-[9px] uppercase text-slate-400 block font-bold">Shipping Address</span>
                  <p className="font-semibold text-slate-900 break-words">{d.shipping_address || '—'}</p>
                  <p className="text-[11px] font-mono text-slate-600">GST: {d.shipping_gst || '—'}</p>
                  <p className="text-[11px] font-bold text-slate-800">Qty: {(parseFloat(d.qty) || 0).toFixed(2)} MT</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Product Details Breakdown */}
        <div className="space-y-2">
          <h4 className="font-bold text-slate-800 uppercase text-[11px] flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-[#a81b1e]" />
            Product Details & Line Items ({items.length})
          </h4>

          {items.length === 0 ? (
            <p className="text-slate-400 italic py-2">No detailed product items recorded.</p>
          ) : (
            <>
              {/* Mobile item cards */}
              <div className="block sm:hidden space-y-2">
                {items.map((it, idx) => {
                  const q = parseFloat(it.qty) || 0;
                  const r = parseFloat(it.rate) || 0;
                  const tot = parseFloat(it.total) || q * r;

                  return (
                    <div
                      key={idx}
                      className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/70 space-y-1.5 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900">
                          {it.productName || 'TMT Rebar'}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-[10px] font-bold text-slate-700">
                          {it.size || 'Standard'}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-1.5 text-center text-[11px] pt-1 border-t border-slate-200/60">
                        <div>
                          <span className="text-[9px] uppercase text-slate-400 block font-bold">Qty</span>
                          <span className="font-bold text-slate-800">{q.toFixed(2)} MT</span>
                        </div>
                        <div>
                          <span className="text-[9px] uppercase text-slate-400 block font-bold">Rate</span>
                          <span className="font-mono text-slate-700">₹{r.toLocaleString('en-IN')}</span>
                        </div>
                        <div>
                          <span className="text-[9px] uppercase text-slate-400 block font-bold">Total</span>
                          <span className="font-bold text-[#a81b1e]">₹{tot.toLocaleString('en-IN')}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop items table */}
              <div className="hidden sm:block overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-[10px] font-bold uppercase text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Item</th>
                      <th className="py-2.5 px-3">Product Description</th>
                      <th className="py-2.5 px-3">Size / Dia</th>
                      <th className="py-2.5 px-3 text-right">Quantity (MT)</th>
                      <th className="py-2.5 px-3 text-right">Rate / MT</th>
                      <th className="py-2.5 px-3 text-right">Line Total (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((it, idx) => {
                      const q = parseFloat(it.qty) || 0;
                      const r = parseFloat(it.rate) || 0;
                      const tot = parseFloat(it.total) || q * r;

                      return (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="py-2 px-3 font-mono text-slate-500">{idx + 1}</td>
                          <td className="py-2 px-3 font-bold text-slate-900">{it.productName || 'TMT Rebar'}</td>
                          <td className="py-2 px-3 font-medium text-slate-700">
                            <span className="px-1.5 py-0.5 rounded bg-slate-100 text-[10px] font-bold">
                              {it.size || 'Standard'}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">{q.toFixed(2)}</td>
                          <td className="py-2 px-3 text-right font-mono text-slate-700">₹{r.toLocaleString('en-IN')}</td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">₹{tot.toLocaleString('en-IN')}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {!hideSpecification && specification && (
          <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 text-slate-700">
            <span className="font-bold text-slate-900 block mb-0.5">Specification:</span>
            {specification}
          </div>
        )}

        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
};
