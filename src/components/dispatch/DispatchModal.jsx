import React, { useState, useEffect, useCallback } from 'react';
import { Modal } from '../common/Modal';
import { dispatchApi, roundDispatchQty, todayDispatchDate } from '../../api/dispatchApi';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { Truck, AlertTriangle, RefreshCw, History } from 'lucide-react';

const fmt = (n) => `${roundDispatchQty(n).toFixed(3).replace(/\.?0+$/, '') || '0'} MT`;

/**
 * Dispatch an order into the `dispatch` table.
 * selectedOrder.dispatchType: 'retail' (orders -> retail_order_id) | 'project' (project_orders -> project_order)
 * selectedOrder.db_id: the order's database id
 */
export const DispatchModal = ({ isOpen, onClose, selectedOrder, onDispatched }) => {
  const { triggerRefresh, showToast } = useApp();
  const { canEdit, user } = useAuth();

  const type = selectedOrder?.dispatchType === 'project' ? 'project' : 'retail';
  const orderDbId = selectedOrder?.db_id ?? null;

  const [orderQty, setOrderQty] = useState(0);
  const [history, setHistory] = useState([]);
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [infoError, setInfoError] = useState(null);

  const [dispatchDate, setDispatchDate] = useState(todayDispatchDate());
  const [dispatchQty, setDispatchQty] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const alreadyDispatched = roundDispatchQty(history.reduce((acc, r) => acc + (Number(r.dispatch_qty) || 0), 0));
  const remaining = Math.max(0, roundDispatchQty(orderQty - alreadyDispatched));
  const qtyNumber = parseFloat(dispatchQty);
  const pendingAfter = Number.isFinite(qtyNumber) ? Math.max(0, roundDispatchQty(remaining - qtyNumber)) : remaining;

  // Latest order qty + dispatch history from the database
  const loadInfo = useCallback(async () => {
    if (!orderDbId) return;
    setLoadingInfo(true);
    setInfoError(null);
    try {
      const [qty, rows] = await Promise.all([
        dispatchApi.getOrderQty(type, orderDbId),
        dispatchApi.getOrderDispatches(type, orderDbId),
      ]);
      setOrderQty(qty);
      setHistory(rows);
      const done = roundDispatchQty(rows.reduce((acc, r) => acc + (Number(r.dispatch_qty) || 0), 0));
      const left = Math.max(0, roundDispatchQty(qty - done));
      setDispatchQty(left > 0 ? String(left) : '');
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
    setOrderQty(0);
    setDispatchQty('');
    loadInfo();
  }, [isOpen, selectedOrder, loadInfo]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setFormError(null);

    if (!canEdit('dispatch')) {
      setFormError('Access Denied: You have view-only access to Dispatch.');
      return;
    }
    if (!Number.isFinite(qtyNumber) || qtyNumber <= 0) {
      setFormError('Enter a dispatch quantity greater than 0.');
      return;
    }
    if (qtyNumber - remaining > 0.0005) {
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

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Dispatch Order - ${selectedOrder?.order_id || ''}`} maxWidth="max-w-xl">
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
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-white border border-slate-200 text-slate-700">
              {selectedOrder?.brand_name || selectedOrder?.firm_name || 'Order'}
            </span>
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
                disabled={loadingInfo || Boolean(infoError)}
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
                disabled={loadingInfo || Boolean(infoError)}
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
              {history.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-[11px]">
                  <span className="font-mono text-slate-600">{r.dispatch_date || String(r.created_at || '').slice(0, 10)}</span>
                  <span className="font-mono font-bold text-slate-900">{fmt(r.dispatch_qty)}</span>
                  <span className="text-slate-500 truncate max-w-[40%]">{r.submitted_by || '—'}</span>
                </div>
              ))}
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
              disabled={saving || loadingInfo || Boolean(infoError) || remaining <= 0}
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
