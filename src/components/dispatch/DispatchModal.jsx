import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Modal } from '../common/Modal';
import {
  dispatchApi,
  roundDispatchQty,
  todayDispatchDate,
  lotDispatchKey,
  lotDispatchTotals,
} from '../../api/dispatchApi';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { Truck, AlertTriangle, RefreshCw, History, MapPin, Package } from 'lucide-react';

const fmt = (n) => `${roundDispatchQty(n).toFixed(3).replace(/\.?0+$/, '') || '0'} MT`;
const EPS = 0.0005;

const parseDetails = (value) => {
  if (typeof value !== 'string') return value || null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

/**
 * Dispatch an order into the `dispatch` table.
 * selectedOrder.dispatchType: 'retail' (orders -> retail_order_id) | 'project' (project_orders -> project_order)
 * selectedOrder.db_id: the order's database id
 * Project orders with consignees / lots (delivery_details) are dispatched lot-wise; the consignees and
 * lots dispatched are saved in dispatch.project_order_details.
 */
export const DispatchModal = ({ isOpen, onClose, selectedOrder, onDispatched }) => {
  const { triggerRefresh, showToast } = useApp();
  const { canEdit, user } = useAuth();

  const type = selectedOrder?.dispatchType === 'project' ? 'project' : 'retail';
  const orderDbId = selectedOrder?.db_id ?? null;

  const [orderQty, setOrderQty] = useState(0);
  const [plan, setPlan] = useState([]); // consignees with their lots (project orders)
  const [history, setHistory] = useState([]);
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [infoError, setInfoError] = useState(null);

  const [dispatchDate, setDispatchDate] = useState(todayDispatchDate());
  const [dispatchQty, setDispatchQty] = useState('');
  const [lotInputs, setLotInputs] = useState({}); // "<consigneeKey>|<lotKey>" -> qty string
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const useLots = type === 'project' && plan.length > 0;

  // Firm and brand of the order (brand = series such as One Helix when the order has one)
  const firmName = selectedOrder?.firm_name || (type === 'retail' ? 'Sarthak TMT' : '');
  const brandName =
    selectedOrder?.product_details?.subtype || selectedOrder?.product_details?.brand || selectedOrder?.brand_name || '';

  const alreadyDispatched = roundDispatchQty(history.reduce((acc, r) => acc + (Number(r.dispatch_qty) || 0), 0));
  const remaining = Math.max(0, roundDispatchQty(orderQty - alreadyDispatched));

  // Dispatched / pending per lot from earlier dispatches
  const prevLots = useMemo(() => lotDispatchTotals(history), [history]);
  const lotPending = useCallback(
    (c, l) => Math.max(0, roundDispatchQty(l.qty - (prevLots.get(lotDispatchKey(c.key, l.key)) || 0))),
    [prevLots]
  );
  // Qty dispatched before lot-wise dispatch existed (not linked to any lot)
  const unlinkedQty = useMemo(() => {
    const linked = [...prevLots.values()].reduce((a, b) => a + b, 0);
    return Math.max(0, roundDispatchQty(alreadyDispatched - linked));
  }, [prevLots, alreadyDispatched]);

  const lotTotal = roundDispatchQty(
    Object.values(lotInputs).reduce((acc, v) => acc + (parseFloat(v) > 0 ? parseFloat(v) : 0), 0)
  );
  const qtyNumber = useLots ? lotTotal : parseFloat(dispatchQty);
  const pendingAfter = Number.isFinite(qtyNumber) ? Math.max(0, roundDispatchQty(remaining - qtyNumber)) : remaining;

  // Latest order qty, consignee / lot plan and dispatch history from the database
  const loadInfo = useCallback(async () => {
    if (!orderDbId) return;
    setLoadingInfo(true);
    setInfoError(null);
    try {
      const [info, rows] = await Promise.all([
        type === 'project'
          ? dispatchApi.getProjectOrderInfo(orderDbId)
          : dispatchApi.getOrderQty(type, orderDbId).then((qty) => ({ orderQty: qty, plan: [] })),
        dispatchApi.getOrderDispatches(type, orderDbId),
      ]);
      setOrderQty(info.orderQty);
      setPlan(info.plan || []);
      setHistory(rows);
      setLotInputs({});
      // The user always types the dispatch qty (never pre-filled)
      setDispatchQty('');
    } catch (err) {
      setInfoError(err?.message || 'Could not load order details.');
    } finally {
      setLoadingInfo(false);
    }
  }, [type, orderDbId]);

  useEffect(() => {
    if (!isOpen || !selectedOrder) return;
    setDispatchDate(todayDispatchDate());
    setFormError(null);
    setHistory([]);
    setPlan([]);
    setLotInputs({});
    setOrderQty(0);
    setDispatchQty('');
    loadInfo();
  }, [isOpen, selectedOrder, loadInfo]);

  const setLotQty = (c, l, value) => setLotInputs((prev) => ({ ...prev, [lotDispatchKey(c.key, l.key)]: value }));

  // Fill every pending lot of a consignee (or clear them if already filled)
  const toggleConsignee = (c) => {
    const pendingLots = c.lots.filter((l) => lotPending(c, l) > EPS);
    const allFilled = pendingLots.every((l) => parseFloat(lotInputs[lotDispatchKey(c.key, l.key)]) > 0);
    setLotInputs((prev) => {
      const next = { ...prev };
      for (const l of pendingLots) next[lotDispatchKey(c.key, l.key)] = allFilled ? '' : String(lotPending(c, l));
      return next;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setFormError(null);

    if (!canEdit('dispatch')) {
      setFormError('Access Denied: You have view-only access to Dispatch.');
      return;
    }

    let lots;
    if (useLots) {
      lots = [];
      for (const c of plan) {
        for (const l of c.lots) {
          const raw = lotInputs[lotDispatchKey(c.key, l.key)];
          if (raw === undefined || String(raw).trim() === '') continue;
          const q = parseFloat(raw);
          if (!Number.isFinite(q) || q < 0) {
            setFormError(`Enter a valid quantity for ${c.consignee_name || `Consignee ${c.key}`} - ${l.lot_no}.`);
            return;
          }
          if (q - lotPending(c, l) > EPS) {
            setFormError(
              `${c.consignee_name || `Consignee ${c.key}`} - ${l.lot_no}: quantity cannot be more than its pending ${fmt(lotPending(c, l))}.`
            );
            return;
          }
          if (q > 0) lots.push({ consigneeKey: c.key, lotKey: l.key, qty: q });
        }
      }
      if (!lots.length) {
        setFormError('Enter the dispatch quantity for at least one lot.');
        return;
      }
    }

    if (!Number.isFinite(qtyNumber) || qtyNumber <= 0) {
      setFormError('Enter a dispatch quantity greater than 0.');
      return;
    }
    if (qtyNumber - remaining > EPS) {
      setFormError(`Dispatch quantity cannot be more than the pending quantity (${fmt(remaining)}).`);
      return;
    }

    setSaving(true);
    try {
      const saved = await dispatchApi.createDispatch({
        type,
        orderDbId,
        dispatchQty: qtyNumber,
        dispatchDate,
        lots,
        submittedBy: user?.full_name || user?.username || (user?.emp_id ? `Emp #${user.emp_id}` : ''),
      });
      showToast(`Dispatched ${fmt(saved.dispatch_qty)} for ${selectedOrder.order_id}. Pending: ${fmt(saved.pending_qty)}`);
      triggerRefresh();
      if (onDispatched) onDispatched(saved);
      onClose();
    } catch (err) {
      setFormError(err?.message || 'Failed to save dispatch.');
      // Numbers may have changed (e.g. someone else dispatched): reload them
      loadInfo();
    } finally {
      setSaving(false);
    }
  };

  const fullyDispatched = !loadingInfo && !infoError && orderQty > 0 && remaining <= 0;
  const inputsDisabled = loadingInfo || Boolean(infoError);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Dispatch Order - ${selectedOrder?.order_id || ''}`}
      maxWidth={useLots ? 'max-w-3xl' : 'max-w-xl'}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Order summary */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-3 text-xs">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <span className="text-[10px] font-bold text-slate-500 uppercase block">
                {type === 'project' ? 'Project Order' : 'Retail Order'}
              </span>
              <p className="font-extrabold text-slate-900 font-mono">{selectedOrder?.order_id}</p>
              {(selectedOrder?.party_name || selectedOrder?.distributorName) && (
                <p className="text-slate-500 truncate">{selectedOrder?.party_name || selectedOrder?.distributorName}</p>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              {firmName && (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-white border border-slate-200 text-slate-700">
                  <span className="text-slate-400 font-semibold">Firm:</span> {firmName}
                </span>
              )}
              {brandName && (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-50 border border-red-200 text-[#a81b1e]">
                  <span className="text-red-400 font-semibold">Brand:</span> {brandName}
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-white border border-slate-200 p-2">
              <span className="text-[10px] font-bold text-slate-500 uppercase block">Order Qty</span>
              <span className="font-mono font-extrabold text-slate-900">{loadingInfo ? '…' : fmt(orderQty)}</span>
            </div>
            <div className="rounded-lg bg-white border border-slate-200 p-2">
              <span className="text-[10px] font-bold text-slate-500 uppercase block">Dispatched</span>
              <span className="font-mono font-extrabold text-emerald-700">{loadingInfo ? '…' : fmt(alreadyDispatched)}</span>
            </div>
            <div className="rounded-lg bg-white border border-slate-200 p-2">
              <span className="text-[10px] font-bold text-slate-500 uppercase block">Pending</span>
              <span className="font-mono font-extrabold text-amber-700">{loadingInfo ? '…' : fmt(remaining)}</span>
            </div>
          </div>
        </div>

        {infoError && (
          <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-red-200 bg-red-50 text-xs text-[#a81b1e]">
            <span className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {infoError}
            </span>
            <button
              type="button"
              onClick={loadInfo}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#a81b1e] text-white font-bold cursor-pointer shrink-0"
            >
              <RefreshCw className="w-3 h-3" />
              Retry
            </button>
          </div>
        )}

        {fullyDispatched ? (
          <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50 text-xs font-bold text-emerald-800">
            This order is fully dispatched. Nothing is pending.
          </div>
        ) : useLots ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Dispatch Date *</label>
                <input
                  type="date"
                  required
                  max={todayDispatchDate()}
                  value={dispatchDate}
                  onChange={(e) => setDispatchDate(e.target.value)}
                  disabled={inputsDisabled}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#a81b1e] focus:outline-none disabled:bg-slate-50"
                />
              </div>
              <div className="rounded-lg bg-white border border-slate-200 p-2 text-center">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Dispatching Now</span>
                <span className="font-mono text-sm font-black text-slate-900">{fmt(lotTotal)}</span>
              </div>
              <div className="col-span-2 sm:col-span-1 rounded-lg bg-white border border-amber-200 p-2 text-center">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Pending After</span>
                <span className="font-mono text-sm font-black text-amber-700">{fmt(pendingAfter)}</span>
              </div>
            </div>

            <p className="text-[11px] text-slate-500">
              {plan.length > 1
                ? `This order has ${plan.length} consignees. Enter the quantity for each lot being dispatched.`
                : 'Enter the quantity for each lot being dispatched.'}
            </p>

            {unlinkedQty > EPS && (
              <div className="flex items-start gap-2 p-2.5 rounded-lg border border-amber-200 bg-amber-50 text-[11px] text-amber-800">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  {fmt(unlinkedQty)} was dispatched earlier without consignee / lot details, so lot pending figures may be
                  higher than the order's real pending ({fmt(remaining)}).
                </span>
              </div>
            )}

            <div className="space-y-3 max-h-[45vh] overflow-y-auto pr-0.5">
              {plan.map((c, ci) => {
                const cPending = roundDispatchQty(c.lots.reduce((acc, l) => acc + lotPending(c, l), 0));
                const cNow = roundDispatchQty(
                  c.lots.reduce((acc, l) => acc + (parseFloat(lotInputs[lotDispatchKey(c.key, l.key)]) > 0 ? parseFloat(lotInputs[lotDispatchKey(c.key, l.key)]) : 0), 0)
                );
                return (
                  <div key={c.key} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                    {/* Consignee header */}
                    <div className="flex flex-wrap items-start justify-between gap-2 px-3 py-2 bg-slate-50 border-b border-slate-200">
                      <div className="min-w-0">
                        <p className="text-xs font-extrabold text-slate-900">
                          {c.consignee_name || `Consignee ${ci + 1}`}
                        </p>
                        {c.shipping_address && (
                          <p className="flex items-start gap-1 text-[11px] text-slate-500">
                            <MapPin className="w-3 h-3 shrink-0 mt-0.5" />
                            <span className="line-clamp-2">{c.shipping_address}</span>
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] font-bold text-slate-500 font-mono">
                          {fmt(c.qty)} · Pending <span className="text-amber-700">{fmt(cPending)}</span>
                          {cNow > 0 && <span className="text-[#a81b1e]"> · Now {fmt(cNow)}</span>}
                        </span>
                        {cPending > EPS && (
                          <button
                            type="button"
                            onClick={() => toggleConsignee(c)}
                            disabled={inputsDisabled}
                            className="px-2 py-0.5 rounded border border-slate-200 bg-white text-[10px] font-bold text-slate-700 hover:bg-slate-100 cursor-pointer disabled:opacity-50"
                          >
                            {c.lots.filter((l) => lotPending(c, l) > EPS).every((l) => parseFloat(lotInputs[lotDispatchKey(c.key, l.key)]) > 0)
                              ? 'Clear'
                              : 'All pending'}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Lots */}
                    <div className="divide-y divide-slate-100">
                      {c.lots.map((l) => {
                        const key = lotDispatchKey(c.key, l.key);
                        const done = prevLots.get(key) || 0;
                        const pending = lotPending(c, l);
                        const value = lotInputs[key] ?? '';
                        const over = parseFloat(value) - pending > EPS;
                        const closed = pending <= EPS;
                        return (
                          <div
                            key={l.key}
                            className={`grid grid-cols-2 sm:grid-cols-[1.4fr_0.8fr_0.8fr_0.8fr_1fr] items-center gap-2 px-3 py-2 text-[11px] ${closed ? 'bg-emerald-50/50' : ''}`}
                          >
                            <div className="col-span-2 sm:col-span-1 min-w-0">
                              <p className="flex items-center gap-1 font-bold text-slate-900">
                                <Package className="w-3 h-3 text-slate-400 shrink-0" />
                                {l.lot_no}
                              </p>
                              {(l.grade || l.section) && (
                                <p className="text-slate-500 truncate">{[l.grade, l.section].filter(Boolean).join(' · ')}</p>
                              )}
                            </div>
                            <div>
                              <span className="text-[9px] font-bold text-slate-400 uppercase block">Ordered</span>
                              <span className="font-mono font-bold text-slate-800">{fmt(l.qty)}</span>
                            </div>
                            <div>
                              <span className="text-[9px] font-bold text-slate-400 uppercase block">Dispatched</span>
                              <span className="font-mono font-bold text-emerald-700">{fmt(done)}</span>
                            </div>
                            <div>
                              <span className="text-[9px] font-bold text-slate-400 uppercase block">Pending</span>
                              <span className="font-mono font-bold text-amber-700">{fmt(pending)}</span>
                            </div>
                            <div>
                              {closed ? (
                                <span className="inline-block px-2 py-1 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                                  Fully dispatched
                                </span>
                              ) : (
                                <input
                                  type="number"
                                  step="0.001"
                                  min="0"
                                  max={pending}
                                  inputMode="decimal"
                                  placeholder="Qty (MT)"
                                  aria-label={`Dispatch qty for ${c.consignee_name || `consignee ${ci + 1}`} ${l.lot_no}`}
                                  value={value}
                                  onChange={(e) => setLotQty(c, l, e.target.value)}
                                  disabled={inputsDisabled}
                                  className={`w-full rounded-lg border px-2 py-1.5 text-xs font-bold text-slate-900 focus:outline-none disabled:bg-slate-50 ${over ? 'border-red-400 bg-red-50 focus:border-red-500' : 'border-slate-200 bg-white focus:border-[#a81b1e]'}`}
                                />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Dispatch Date *</label>
              <input
                type="date"
                required
                max={todayDispatchDate()}
                value={dispatchDate}
                onChange={(e) => setDispatchDate(e.target.value)}
                disabled={inputsDisabled}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#a81b1e] focus:outline-none disabled:bg-slate-50"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Dispatch Qty (MT) *</label>
              <input
                type="number"
                required
                step="0.001"
                min="0.001"
                max={remaining || undefined}
                inputMode="decimal"
                value={dispatchQty}
                onChange={(e) => setDispatchQty(e.target.value)}
                disabled={inputsDisabled}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-900 focus:border-[#a81b1e] focus:outline-none disabled:bg-slate-50"
              />
            </div>
            <div className="rounded-lg bg-white border border-amber-200 p-2 text-center">
              <span className="text-[10px] font-bold text-slate-500 uppercase block">Pending After</span>
              <span className="font-mono text-sm font-black text-amber-700">{fmt(pendingAfter)}</span>
            </div>
          </div>
        )}

        {/* Previous dispatches */}
        {history.length > 0 && (
          <div className="space-y-1.5">
            <p className="flex items-center gap-1.5 text-xs font-bold text-slate-600 uppercase">
              <History className="w-3.5 h-3.5" />
              Previous Dispatches ({history.length})
            </p>
            <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
              {history.map((r) => {
                const consignees = parseDetails(r.project_order_details)?.consignees || [];
                return (
                  <div key={r.id} className="px-3 py-1.5 text-[11px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-slate-600">{r.dispatch_date || String(r.created_at || '').slice(0, 10)}</span>
                      <span className="font-mono font-bold text-slate-900">{fmt(r.dispatch_qty)}</span>
                      <span className="text-slate-500 truncate max-w-[40%]">{r.submitted_by || '—'}</span>
                    </div>
                    {consignees.length > 0 && (
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        {consignees
                          .map(
                            (c) =>
                              `${c.consignee_name || `Consignee ${c.key}`}: ${(c.lots || [])
                                .map((l) => `${l.lot_no} ${fmt(l.dispatch_qty)}`)
                                .join(', ')}`
                          )
                          .join(' | ')}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {formError && (
          <div className="flex items-start gap-2 p-3 rounded-xl border border-red-200 bg-red-50 text-xs font-semibold text-[#a81b1e]">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{formError}</span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 sm:gap-2.5 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto rounded-lg px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition text-center cursor-pointer"
          >
            {fullyDispatched ? 'Close' : 'Cancel'}
          </button>
          {!fullyDispatched && (
            <button
              type="submit"
              disabled={saving || loadingInfo || Boolean(infoError) || remaining <= 0 || (useLots && lotTotal <= 0)}
              className="w-full sm:w-auto flex items-center justify-center gap-1.5 rounded-lg bg-[#a81b1e] px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#8e1518] disabled:opacity-50 transition cursor-pointer"
            >
              <Truck className="w-3.5 h-3.5" />
              {saving ? 'Saving...' : `Confirm Dispatch${Number.isFinite(qtyNumber) && qtyNumber > 0 ? ` (${fmt(qtyNumber)})` : ''}`}
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
};
