import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '../common/Modal';
import { trackingHistoryApi } from '../../api/trackingHistoryApi';
import { Search, X, Navigation, CheckCircle2, Store, Building2, ChevronDown } from 'lucide-react';

const STAGES = [
  'First Visit/ Call',
  'Follow-Up',
  'Order Received',
  'Order Not Received',
  'Payment Collection',
  'Not Interested',
];
const PRIORITIES = ['Hot', 'Warm', 'Cold'];

const istToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

const inputCls =
  'w-full mt-1 px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-[#a81b1e]';
const labelCls = 'text-xs font-bold uppercase tracking-wider text-slate-500';

// Searchable dropdown of the parties (dealers or distributors) assigned to this sales manager
const PartyPicker = ({ options, value, onChange, placeholder, disabled }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const boxRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('touchstart', onPointer);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('touchstart', onPointer);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) =>
      [o.name, o.area, o.parent, o.phone, `#${o.id}`].some((v) => String(v || '').toLowerCase().includes(q))
    );
  }, [options, query]);

  const selected = options.find((o) => String(o.id) === String(value)) || null;

  return (
    <div ref={boxRef} className="relative mt-1">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-left focus:outline-none focus:border-[#a81b1e] cursor-pointer disabled:opacity-60"
      >
        {selected ? (
          <span className="min-w-0">
            <span className="block font-bold text-slate-900 truncate">{selected.name}</span>
            <span className="block text-[11px] text-slate-500 truncate">
              {[selected.area, selected.parent].filter(Boolean).join(' • ') || `#${selected.id}`}
            </span>
          </span>
        ) : (
          <span className="text-slate-400">{placeholder}</span>
        )}
        <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-20 left-0 right-0 mt-1 rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden">
          <div className="relative p-2 border-b border-slate-100">
            <Search className="w-3.5 h-3.5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, area, distributor..."
              className="w-full pl-7 pr-7 py-2 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:border-[#a81b1e] focus:bg-white"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <ul className="max-h-60 overflow-y-auto overscroll-contain py-1" role="listbox">
            {filtered.length === 0 ? (
              <li className="px-3 py-4 text-center text-xs text-slate-400">No match found</li>
            ) : (
              filtered.map((o) => {
                const isSel = String(o.id) === String(value);
                return (
                  <li key={o.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSel}
                      onClick={() => {
                        onChange(o);
                        setOpen(false);
                        setQuery('');
                      }}
                      className={`w-full text-left px-3 py-2 text-xs cursor-pointer ${
                        isSel ? 'bg-red-50 text-[#a81b1e]' : 'hover:bg-slate-50 text-slate-800'
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-bold truncate">{o.name || `#${o.id}`}</span>
                        <span className="font-mono text-[10px] text-slate-400 shrink-0">#{o.id}</span>
                      </span>
                      {(o.area || o.parent) && (
                        <span className="block text-[11px] text-slate-500 truncate">
                          {[o.area, o.parent].filter(Boolean).join(' • ')}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
          <div className="px-3 py-1.5 border-t border-slate-100 text-[10px] text-slate-400">
            {filtered.length} of {options.length}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Visit update form for Area Sales Managers.
 * Only dealers / distributors assigned to the sales manager can be picked; the visit is saved
 * to tracking_history under the logged-in user's name.
 */
export const UpdateVisitModal = ({ isOpen, onClose, onSaved, userName, dealers, distributors }) => {
  const [category, setCategory] = useState('Dealer');
  const [partyId, setPartyId] = useState('');
  const [areaName, setAreaName] = useState('');
  const [stage, setStage] = useState('Follow-Up');
  const [priority, setPriority] = useState('Hot');
  const [discussion, setDiscussion] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [nextDate, setNextDate] = useState('');
  const [orderQty, setOrderQty] = useState('');
  const [orderProducts, setOrderProducts] = useState('');
  const [orderValue, setOrderValue] = useState('');
  const [paymentReceived, setPaymentReceived] = useState('');
  const [geo, setGeo] = useState({ lat: null, lng: null });
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  const distributorNames = useMemo(
    () => new Map((distributors || []).map((d) => [String(d.id), d.name])),
    [distributors]
  );

  const dealerOptions = useMemo(
    () =>
      (dealers || []).map((d) => ({
        id: d.id,
        name: d.name || '',
        area: d.area_name && d.area_name !== 'null' ? d.area_name : d.address || '',
        parent: d.distributor_id ? distributorNames.get(String(d.distributor_id)) || '' : '',
        phone: d.phone || '',
      })),
    [dealers, distributorNames]
  );
  const distributorOptions = useMemo(
    () =>
      (distributors || []).map((d) => ({
        id: d.id,
        name: d.name || '',
        area: d.address || d.state || '',
        parent: '',
        phone: d.phone || '',
      })),
    [distributors]
  );
  const options = category === 'Dealer' ? dealerOptions : distributorOptions;
  const selectedParty = options.find((o) => String(o.id) === String(partyId)) || null;

  // Fresh form + GPS fix every time the modal opens
  useEffect(() => {
    if (!isOpen) return undefined;
    setCategory(dealerOptions.length > 0 ? 'Dealer' : 'Distributor');
    setPartyId('');
    setAreaName('');
    setStage('Follow-Up');
    setPriority('Hot');
    setDiscussion('');
    setNextAction('');
    setNextDate('');
    setOrderQty('');
    setOrderProducts('');
    setOrderValue('');
    setPaymentReceived('');
    setFormError(null);
    setGeo({ lat: null, lng: null });

    let cancelled = false;
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      setLocating(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (cancelled) return;
          setGeo({ lat: pos.coords.latitude.toFixed(7), lng: pos.coords.longitude.toFixed(7) });
          setLocating(false);
        },
        () => {
          if (!cancelled) setLocating(false);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
      );
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const pickParty = (o) => {
    setPartyId(String(o.id));
    setAreaName(o.area || '');
  };

  const switchCategory = (c) => {
    setCategory(c);
    setPartyId('');
    setAreaName('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setFormError(null);

    // The party must be one of this manager's assigned dealers / distributors
    if (!selectedParty) {
      setFormError(`Please select a ${category.toLowerCase()} from your assigned list.`);
      return;
    }
    if (nextDate && nextDate < istToday()) {
      setFormError('Next follow-up date cannot be in the past.');
      return;
    }
    if (stage === 'Order Received') {
      const qty = Number(orderQty);
      if (orderQty !== '' && (!Number.isFinite(qty) || qty <= 0)) {
        setFormError('Order quantity must be a positive number.');
        return;
      }
      const val = Number(orderValue);
      if (orderValue !== '' && (!Number.isFinite(val) || val < 0)) {
        setFormError('Order value cannot be negative.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const isOrder = stage === 'Order Received';
      await trackingHistoryApi.createVisit({
        select_value: category,
        deler_distributer_site_name: selectedParty.name,
        dealer_code: category === 'Dealer' ? `DC${selectedParty.id}` : `DS${selectedParty.id}`,
        area_name: areaName.trim() || null,
        stage,
        status: priority,
        last_date_of_call: istToday(),
        what_did_customer_says: discussion.trim() || null,
        next_action: nextAction.trim() || null,
        next_date_of_call: nextDate || null,
        order_qty: isOrder && orderQty !== '' ? orderQty : null,
        order_products: isOrder ? orderProducts.trim() || null : null,
        value_of_order: isOrder && orderValue !== '' ? orderValue : null,
        payment_yes_no: stage === 'Payment Collection' ? paymentReceived || null : null,
        sales_person_name: userName,
        latitude: geo.lat,
        longitude: geo.lng,
      });
      onSaved?.();
      onClose();
    } catch (err) {
      console.error('Update visit error:', err);
      setFormError(err?.message || 'Failed to save the visit update.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={submitting ? () => {} : onClose} title="Update Visit" maxWidth="max-w-xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        {formError && (
          <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-xs text-[#a81b1e]">{formError}</div>
        )}

        {/* Party type */}
        <div>
          <span className={labelCls}>Visited *</span>
          <div className="grid grid-cols-2 gap-1.5 mt-1">
            {[
              { id: 'Dealer', icon: Store, count: dealerOptions.length },
              { id: 'Distributor', icon: Building2, count: distributorOptions.length },
            ].map(({ id, icon: Icon, count }) => (
              <button
                key={id}
                type="button"
                disabled={count === 0}
                onClick={() => switchCategory(id)}
                className={`flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-lg border transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                  category === id ? 'bg-red-50 border-[#a81b1e] text-[#a81b1e]' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {id}
                <span className="text-[10px] font-semibold opacity-70">({count})</span>
              </button>
            ))}
          </div>
        </div>

        {/* Searchable party dropdown */}
        <div>
          <span className={labelCls}>{category === 'Dealer' ? 'Dealer *' : 'Distributor *'}</span>
          <PartyPicker
            options={options}
            value={partyId}
            onChange={pickParty}
            disabled={submitting}
            placeholder={`Select your ${category.toLowerCase()} (${options.length})`}
          />
          {selectedParty?.phone && (
            <p className="mt-1 text-[11px] text-slate-500">
              Phone:{' '}
              <a href={`tel:${selectedParty.phone}`} className="font-mono font-semibold text-slate-700">
                {selectedParty.phone}
              </a>
            </p>
          )}
        </div>

        {/* Area & GPS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className={labelCls}>Area / City</span>
            <input
              type="text"
              value={areaName}
              onChange={(e) => setAreaName(e.target.value)}
              maxLength={200}
              placeholder="Filled from the selected party"
              className={inputCls}
            />
          </label>
          <div>
            <div className={`flex items-center justify-between ${labelCls}`}>
              <span>GPS Location</span>
              <span className={`text-[10px] font-normal normal-case ${locating ? 'text-amber-600 animate-pulse' : geo.lat ? 'text-emerald-600' : 'text-slate-400'}`}>
                {locating ? 'Locating...' : geo.lat ? 'Detected' : 'Unavailable'}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-700 min-w-0">
              <Navigation className="w-3.5 h-3.5 text-[#a81b1e] shrink-0" />
              <span className="font-mono truncate">{geo.lat ? `${geo.lat}, ${geo.lng}` : 'Waiting for GPS...'}</span>
            </div>
          </div>
        </div>

        {/* Stage & Priority */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className={labelCls}>Visit Stage *</span>
            <select value={stage} onChange={(e) => setStage(e.target.value)} className={`${inputCls} font-semibold cursor-pointer`}>
              {STAGES.map((s) => (
                <option key={s} value={s}>
                  {s.replace('/ ', ' / ')}
                </option>
              ))}
            </select>
          </label>
          <div>
            <span className={labelCls}>Priority *</span>
            <div className="grid grid-cols-3 gap-1 mt-1">
              {PRIORITIES.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={`py-2 text-xs font-bold rounded-lg border transition cursor-pointer ${
                    priority === p
                      ? p === 'Hot'
                        ? 'bg-rose-50 border-rose-500 text-rose-700'
                        : p === 'Warm'
                          ? 'bg-amber-50 border-amber-500 text-amber-700'
                          : 'bg-slate-100 border-slate-500 text-slate-800'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Discussion */}
        <label className="block">
          <span className={labelCls}>Customer Discussion / Feedback</span>
          <textarea
            rows={3}
            value={discussion}
            onChange={(e) => setDiscussion(e.target.value)}
            maxLength={2000}
            placeholder="What did the dealer / distributor say? (rates, stock, requirement...)"
            className={`${inputCls} placeholder-slate-400`}
          />
        </label>

        {/* Next action */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className={labelCls}>Next Action</span>
            <input
              type="text"
              value={nextAction}
              onChange={(e) => setNextAction(e.target.value)}
              maxLength={300}
              placeholder="E.g. Visit again, Share quotation"
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className={labelCls}>Next Follow-up Date</span>
            <input
              type="date"
              value={nextDate}
              min={istToday()}
              onChange={(e) => setNextDate(e.target.value)}
              className={`${inputCls} cursor-pointer`}
            />
          </label>
        </div>

        {/* Order details */}
        {stage === 'Order Received' && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 space-y-2.5">
            <div className="text-xs font-bold text-emerald-800 uppercase flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
              Order Details
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <label className="block">
                <span className="text-[11px] font-bold text-slate-600">Quantity (MT)</span>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={orderQty}
                  onChange={(e) => setOrderQty(e.target.value)}
                  placeholder="e.g. 25"
                  className={inputCls}
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-bold text-slate-600">Products / Sizes</span>
                <input
                  type="text"
                  value={orderProducts}
                  onChange={(e) => setOrderProducts(e.target.value)}
                  maxLength={300}
                  placeholder="e.g. 12mm, 16mm"
                  className={inputCls}
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-bold text-slate-600">Order Value (₹)</span>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={orderValue}
                  onChange={(e) => setOrderValue(e.target.value)}
                  placeholder="₹ Total"
                  className={inputCls}
                />
              </label>
            </div>
          </div>
        )}

        {/* Payment */}
        {stage === 'Payment Collection' && (
          <div>
            <span className={labelCls}>Payment Received?</span>
            <div className="grid grid-cols-2 gap-1.5 mt-1">
              {['Yes', 'No'].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setPaymentReceived(v)}
                  className={`py-2 text-xs font-bold rounded-lg border transition cursor-pointer ${
                    paymentReceived === v ? 'bg-red-50 border-[#a81b1e] text-[#a81b1e]' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || !selectedParty}
            className="px-5 py-2 rounded-lg bg-[#a81b1e] hover:bg-[#8e1518] text-xs font-bold text-white shadow-xs transition cursor-pointer disabled:opacity-50"
          >
            {submitting ? 'Saving...' : 'Save Visit Update'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
