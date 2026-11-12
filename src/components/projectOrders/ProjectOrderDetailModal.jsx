import React, { useEffect, useMemo, useState } from 'react';
import { Modal } from '../common/Modal';
import { dispatchApi, lotDispatchKey, lotDispatchTotals, formatIST } from '../../api/dispatchApi';
import { Building, FileText, User, Calendar, Layers, MapPin, Package, Truck, History, Receipt } from 'lucide-react';

const EPS = 0.0005;
const num = (v) => parseFloat(v) || 0;
const fmtMT = (n) => `${num(n).toLocaleString('en-IN', { maximumFractionDigits: 3 })} MT`;
const fmtINR = (n) => (num(n) > 0 ? `₹${num(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—');

const parseDetails = (value) => {
  if (typeof value !== 'string') return value || null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const LotStatus = ({ pending, dispatched }) =>
  pending <= EPS ? (
    <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold whitespace-nowrap">Dispatched</span>
  ) : dispatched > EPS ? (
    <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold whitespace-nowrap">Partial</span>
  ) : (
    <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-bold whitespace-nowrap">Pending</span>
  );

export const ProjectOrderDetailModal = ({ isOpen, onClose, order }) => {
  const [dispatches, setDispatches] = useState([]);
  const [loadingDispatches, setLoadingDispatches] = useState(false);

  // Dispatch rows of this order (with their consignee / lot breakdown)
  useEffect(() => {
    if (!isOpen || !order?.db_id) return undefined;
    let active = true;
    setDispatches([]);
    setLoadingDispatches(true);
    dispatchApi
      .getOrderDispatches('project', order.db_id)
      .then((rows) => active && setDispatches(rows))
      .catch((err) => console.warn('Could not load dispatches of this order:', err))
      .finally(() => active && setLoadingDispatches(false));
    return () => {
      active = false;
    };
  }, [isOpen, order?.db_id]);

  const lotTotals = useMemo(() => lotDispatchTotals(dispatches), [dispatches]);

  if (!order) return null;

  const items = Array.isArray(order.items)
    ? order.items
    : Array.isArray(order.product_details?.items)
      ? order.product_details.items
      : [];

  const computedQty = items.reduce((acc, it) => acc + num(it.qty), 0);
  const totalQty = num(order.total_qty) > 0 ? num(order.total_qty) : computedQty;
  const computedValue = items.reduce((acc, it) => acc + (num(it.total) || num(it.qty) * num(it.rate)), 0);
  const totalValue = num(order.total_value) > 0 ? num(order.total_value) : computedValue;
  const deliveries = Array.isArray(order.deliveries) ? order.deliveries : [];
  const hasLots = deliveries.some((d) => Array.isArray(d.lotsList) && d.lotsList.length > 0);

  const dispatchedQty = dispatches.reduce((acc, r) => acc + num(r.dispatch_qty), 0);
  const pendingQty = Math.max(0, totalQty - dispatchedQty);
  const linkedQty = [...lotTotals.values()].reduce((a, b) => a + b, 0);
  const unlinkedQty = Math.max(0, dispatchedQty - linkedQty);

  // The buyer is entered once and copied into every consignee record
  const buyer = deliveries.find((d) => d.billing_address || d.billing_address_gst_no) || null;

  const isJSWFirm = Number(order.firm_id) === 2 || /jsw/i.test(order.firm_name || '');
  const isEssarFirm = [3, 6].includes(Number(order.firm_id)) || /essar/i.test(order.firm_name || '');
  const hideParty = [2, 6].includes(Number(order.firm_id)) || isEssarFirm || isJSWFirm;
  const hideSpecification = isJSWFirm || isEssarFirm;
  const subtype =
    order.product_details?.subtype ||
    order.product_details?.brand ||
    (isEssarFirm ? 'ESSAR Steel' : isJSWFirm ? 'JSW One' : null);
  const specification =
    order.specification || order.product_details?.specification || order.product_details?.remarks || null;

  const lotInfo = (d, l) => {
    const dispatched = lotTotals.get(lotDispatchKey(d.key, l.key)) || 0;
    return { dispatched, pending: Math.max(0, num(l.qty) - dispatched) };
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Project Order — ${order.order_id || `#${order.db_id}`}`}
      maxWidth={hasLots ? 'max-w-4xl' : 'max-w-2xl'}
    >
      <div className="space-y-4 text-xs">
        {/* Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
            <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Total Tonnage</span>
            <p className="text-base font-extrabold text-slate-900">
              {totalQty.toFixed(2)} <span className="text-xs font-semibold text-slate-500">MT</span>
            </p>
          </div>
          <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50/60">
            <span className="text-[10px] font-bold text-emerald-700 uppercase block mb-1">Dispatched</span>
            <p className="text-base font-extrabold text-emerald-800">
              {loadingDispatches ? '…' : dispatchedQty.toFixed(2)} <span className="text-xs font-semibold">MT</span>
            </p>
          </div>
          <div className="p-3 rounded-xl border border-amber-200 bg-amber-50/60">
            <span className="text-[10px] font-bold text-amber-700 uppercase block mb-1">Pending</span>
            <p className="text-base font-extrabold text-amber-800">
              {loadingDispatches ? '…' : pendingQty.toFixed(2)} <span className="text-xs font-semibold">MT</span>
            </p>
          </div>
          <div className="p-3 rounded-xl border border-red-200 bg-red-50/70">
            <span className="text-[10px] font-bold text-[#a81b1e] uppercase block mb-1">Total Order Value</span>
            <p className="text-base font-black text-[#a81b1e]">
              ₹{totalValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        {/* Header Details */}
        <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 bg-white">
          <div className="flex justify-between items-center gap-3 px-4 py-2.5">
            <span className="text-slate-500 font-medium flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              Order Date
            </span>
            <span className="font-semibold text-slate-900">{order.date || '—'}</span>
          </div>

          {!hideParty && order.party_name && (
            <div className="flex justify-between items-center gap-3 px-4 py-2.5">
              <span className="text-slate-500 font-medium flex items-center gap-1.5 shrink-0">
                <User className="w-3.5 h-3.5 text-slate-400" />
                Party / Client Name
              </span>
              <span className="font-bold text-slate-900 text-right">{order.party_name}</span>
            </div>
          )}

          <div className="flex justify-between items-center gap-3 px-4 py-2.5">
            <span className="text-slate-500 font-medium flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              PO Number
            </span>
            <span className="font-mono font-bold text-slate-800">{order.po_number || '—'}</span>
          </div>

          <div className="flex justify-between items-center gap-3 px-4 py-2.5">
            <span className="text-slate-500 font-medium flex items-center gap-1.5">
              <Building className="w-3.5 h-3.5 text-slate-400" />
              Firm
            </span>
            <span className="font-bold text-[#a81b1e]">{order.firm_name}</span>
          </div>

          {subtype && (
            <div className="flex justify-between items-center gap-3 px-4 py-2.5">
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

          {buyer && (
            <div className="flex justify-between items-start gap-3 px-4 py-2.5">
              <span className="text-slate-500 font-medium flex items-center gap-1.5 shrink-0">
                <Receipt className="w-3.5 h-3.5 text-slate-400" />
                Buyer (Billing)
              </span>
              <span className="text-right">
                <span className="font-semibold text-slate-900 break-words block">{buyer.billing_address || '—'}</span>
                <span className="text-[11px] font-mono text-slate-600">GST: {buyer.billing_address_gst_no || '—'}</span>
              </span>
            </div>
          )}
        </div>

        {/* Consignees & their lots (delivery_details) with dispatch progress */}
        {deliveries.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-bold text-slate-800 uppercase text-[11px] flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-[#a81b1e]" />
              Consignees & Lots ({deliveries.length} consignee{deliveries.length === 1 ? '' : 's'})
            </h4>

            {unlinkedQty > EPS && (
              <p className="p-2 rounded-lg border border-amber-200 bg-amber-50 text-[11px] text-amber-800">
                {fmtMT(unlinkedQty)} was dispatched without consignee / lot details and is not shown against any lot.
              </p>
            )}

            {deliveries.map((d, idx) => {
              const lots = Array.isArray(d.lotsList) ? d.lotsList : [];
              const cQty = lots.length ? lots.reduce((acc, l) => acc + num(l.qty), 0) : num(d.qty);
              const cDispatched = lots.reduce((acc, l) => acc + lotInfo(d, l).dispatched, 0);
              return (
                <div key={d.key || idx} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                  {/* Consignee header */}
                  <div className="flex flex-wrap items-start justify-between gap-2 px-3 py-2.5 bg-slate-50 border-b border-slate-200">
                    <div className="min-w-0">
                      <span className="text-[9px] uppercase text-slate-400 font-bold">Consignee {idx + 1}</span>
                      {d.consignee_name && <p className="font-bold text-slate-900 break-words">{d.consignee_name}</p>}
                      <p className="text-slate-700 break-words">{d.shipping_address || '—'}</p>
                      <p className="text-[11px] font-mono text-slate-500">GST: {d.shipping_gst || '—'}</p>
                    </div>
                    <div className="flex gap-3 text-right shrink-0">
                      <div>
                        <span className="text-[9px] uppercase text-slate-400 block font-bold">Qty</span>
                        <span className="font-mono font-bold text-slate-900">{fmtMT(cQty)}</span>
                      </div>
                      <div>
                        <span className="text-[9px] uppercase text-slate-400 block font-bold">Dispatched</span>
                        <span className="font-mono font-bold text-emerald-700">{fmtMT(cDispatched)}</span>
                      </div>
                      <div>
                        <span className="text-[9px] uppercase text-slate-400 block font-bold">Pending</span>
                        <span className="font-mono font-bold text-amber-700">{fmtMT(Math.max(0, cQty - cDispatched))}</span>
                      </div>
                    </div>
                  </div>

                  {lots.length === 0 ? (
                    <p className="px-3 py-2 text-slate-400 italic">No lots recorded for this consignee.</p>
                  ) : (
                    <>
                      {/* Mobile lot cards */}
                      <div className="block sm:hidden divide-y divide-slate-100">
                        {lots.map((l, li) => {
                          const { dispatched, pending } = lotInfo(d, l);
                          return (
                            <div key={l.key || li} className="px-3 py-2 space-y-1.5">
                              <div className="flex items-center justify-between gap-2">
                                <span className="flex items-center gap-1 font-bold text-slate-900">
                                  <Package className="w-3 h-3 text-slate-400" />
                                  {l.lot_no || `Lot ${li + 1}`}
                                </span>
                                <LotStatus pending={pending} dispatched={dispatched} />
                              </div>
                              {(l.grade || l.section || d.grade || d.section) && (
                                <p className="text-slate-600">
                                  {[l.grade || d.grade, l.section || d.section].filter(Boolean).join(' · ')}
                                </p>
                              )}
                              <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                                <div>
                                  <span className="text-[9px] uppercase text-slate-400 block font-bold">Qty</span>
                                  <span className="font-mono font-bold">{fmtMT(l.qty)}</span>
                                </div>
                                <div>
                                  <span className="text-[9px] uppercase text-slate-400 block font-bold">Dispatched</span>
                                  <span className="font-mono font-bold text-emerald-700">{fmtMT(dispatched)}</span>
                                </div>
                                <div>
                                  <span className="text-[9px] uppercase text-slate-400 block font-bold">Pending</span>
                                  <span className="font-mono font-bold text-amber-700">{fmtMT(pending)}</span>
                                </div>
                                <div>
                                  <span className="text-[9px] uppercase text-slate-400 block font-bold">Rate</span>
                                  <span className="font-mono">{fmtINR(l.price)}</span>
                                </div>
                                <div className="col-span-2">
                                  <span className="text-[9px] uppercase text-slate-400 block font-bold">
                                    Amount{num(l.gst_percent) > 0 ? ` (incl. ${num(l.gst_percent)}% GST)` : ''}
                                  </span>
                                  <span className="font-mono font-bold">{fmtINR(l.total_price)}</span>
                                </div>
                              </div>
                              {(l.start_date || l.end_date) && (
                                <p className="text-[11px] font-mono text-slate-500">
                                  Delivery: {l.start_date || '—'} → {l.end_date || '—'}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Desktop lot table */}
                      <div className="hidden sm:block overflow-x-auto">
                        <table className="w-full text-left text-[11px]">
                          <thead className="text-[10px] font-bold uppercase text-slate-500 border-b border-slate-100">
                            <tr>
                              <th className="py-2 px-3">Lot</th>
                              <th className="py-2 px-3">Grade</th>
                              <th className="py-2 px-3">Section</th>
                              <th className="py-2 px-3 text-right">Qty</th>
                              <th className="py-2 px-3 text-right">Rate / MT</th>
                              <th className="py-2 px-3 text-right">Amount</th>
                              <th className="py-2 px-3 whitespace-nowrap">Delivery Window</th>
                              <th className="py-2 px-3 text-right">Dispatched</th>
                              <th className="py-2 px-3 text-right">Pending</th>
                              <th className="py-2 px-3 text-center">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {lots.map((l, li) => {
                              const { dispatched, pending } = lotInfo(d, l);
                              return (
                                <tr key={l.key || li} className="hover:bg-slate-50">
                                  <td className="py-2 px-3 font-bold text-slate-900 whitespace-nowrap">{l.lot_no || `Lot ${li + 1}`}</td>
                                  <td className="py-2 px-3 text-slate-700">{l.grade || d.grade || '—'}</td>
                                  <td className="py-2 px-3 text-slate-700">{l.section || d.section || '—'}</td>
                                  <td className="py-2 px-3 text-right font-mono font-bold text-slate-900 whitespace-nowrap">{fmtMT(l.qty)}</td>
                                  <td className="py-2 px-3 text-right font-mono text-slate-700">{fmtINR(l.price)}</td>
                                  <td
                                    className="py-2 px-3 text-right font-mono font-bold text-slate-900"
                                    title={num(l.gst_percent) > 0 ? `Incl. ${num(l.gst_percent)}% GST (${fmtINR(l.gst_amount)})` : undefined}
                                  >
                                    {fmtINR(l.total_price)}
                                  </td>
                                  <td className="py-2 px-3 font-mono text-slate-500 whitespace-nowrap">
                                    {l.start_date || l.end_date ? `${l.start_date || '—'} → ${l.end_date || '—'}` : '—'}
                                  </td>
                                  <td className="py-2 px-3 text-right font-mono font-bold text-emerald-700 whitespace-nowrap">{fmtMT(dispatched)}</td>
                                  <td className="py-2 px-3 text-right font-mono font-bold text-amber-700 whitespace-nowrap">{fmtMT(pending)}</td>
                                  <td className="py-2 px-3 text-center">
                                    <LotStatus pending={pending} dispatched={dispatched} />
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Product line items (orders without consignee lots, e.g. JSW / ESSAR) */}
        {!hasLots && (
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
                    const q = num(it.qty);
                    const r = num(it.rate);
                    const tot = num(it.total) || q * r;
                    return (
                      <div key={idx} className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/70 space-y-1.5 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900">{it.productName || 'TMT Rebar'}</span>
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
                        const q = num(it.qty);
                        const r = num(it.rate);
                        const tot = num(it.total) || q * r;
                        return (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="py-2 px-3 font-mono text-slate-500">{idx + 1}</td>
                            <td className="py-2 px-3 font-bold text-slate-900">{it.productName || 'TMT Rebar'}</td>
                            <td className="py-2 px-3 font-medium text-slate-700">
                              <span className="px-1.5 py-0.5 rounded bg-slate-100 text-[10px] font-bold">{it.size || 'Standard'}</span>
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
        )}

        {/* Dispatch history */}
        {dispatches.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-bold text-slate-800 uppercase text-[11px] flex items-center gap-1.5">
              <History className="w-3.5 h-3.5 text-[#a81b1e]" />
              Dispatch History ({dispatches.length})
            </h4>
            <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
              {dispatches.map((r, i) => {
                const consignees = parseDetails(r.project_order_details)?.consignees || [];
                return (
                  <div key={r.id} className="px-3 py-2 space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 font-bold text-slate-900">
                        <Truck className="w-3.5 h-3.5 text-slate-400" />
                        Dispatch {i + 1} · <span className="font-mono">{r.dispatch_date || String(r.created_at || '').slice(0, 10)}</span>
                      </span>
                      <span className="font-mono font-black text-[#a81b1e]">{fmtMT(r.dispatch_qty)}</span>
                    </div>
                    <p className="text-[10px] text-slate-500">
                      By {r.submitted_by || '—'}
                      {r.created_at ? ` · ${formatIST(r.created_at)}` : ''} · Pending after {fmtMT(r.pending_qty)}
                    </p>
                    {consignees.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {consignees.flatMap((c) =>
                          (c.lots || []).map((l) => (
                            <span
                              key={`${c.key}-${l.key}`}
                              className="px-1.5 py-0.5 rounded bg-slate-100 text-[10px] text-slate-700"
                            >
                              <strong>{c.consignee_name || `Consignee ${c.key}`}</strong> · {l.lot_no} ·{' '}
                              <span className="font-mono font-bold">{fmtMT(l.dispatch_qty)}</span>
                            </span>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

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
