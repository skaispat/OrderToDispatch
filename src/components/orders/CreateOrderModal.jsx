import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Modal } from '../common/Modal';
import { ordersApi } from '../../api/ordersApi';
import { distributorApi } from '../../api/distributorApi';
import { dealerApi } from '../../api/dealerApi';
import { usersApi } from '../../api/usersApi';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import {
  Search,
  Check,
  ChevronDown,
  Store,
  Building,
  UserCheck,
  X,
} from 'lucide-react';

// headerSlot: optional content shown at the top of the form (e.g. Standard / Project order switch)
export const CreateOrderModal = ({ isOpen, onClose, headerSlot = null }) => {
  const { user, isDistributor, isSalesPerson, isASM, canEdit, distributorFirmId } = useAuth();
  const { triggerRefresh, showToast } = useApp();

  const todayStr = new Date().toISOString().slice(0, 10);

  // Form Fields
  const [orderDate, setOrderDate] = useState(todayStr);
  const [distributorId, setDistributorId] = useState('');
  const [dealerId, setDealerId] = useState('self');
  const [orderQty, setOrderQty] = useState('');
  const [price, setPrice] = useState('');
  const [loading, setLoading] = useState(false);
  const [previewOrderId, setPreviewOrderId] = useState('');

  // Search & custom dropdown state for Dealer
  const [dealerSearch, setDealerSearch] = useState('');
  const [isDealerDropdownOpen, setIsDealerDropdownOpen] = useState(false);
  const dealerDropdownRef = useRef(null);

  // Data lists from DB
  const [distributors, setDistributors] = useState([]);
  const [dealers, setDealers] = useState([]);
  const [usersList, setUsersList] = useState([]);

  // Fetch distributors, dealers, and users
  const loadData = async () => {
    try {
      const [distList, dealerList, uList] = await Promise.all([
        distributorApi.getDistributors().catch(() => []),
        dealerApi.getDealers().catch(() => []),
        usersApi.getUsers().catch(() => []),
      ]);

      const validDists = distList || [];
      const validDealers = dealerList || [];
      setDistributors(validDists);
      setDealers(validDealers);
      setUsersList(uList || []);

      if (isDistributor) {
        // Auto-match distributor for logged in distributor account
        const matched =
          validDists.find((d) => String(d.id) === String(distributorFirmId)) ||
          validDists.find((d) => String(d.id) === String(user?.emp_id)) ||
          validDists.find(
            (d) =>
              d.name &&
              user?.full_name &&
              d.name.trim().toLowerCase() === user.full_name.trim().toLowerCase()
          ) ||
          (validDists.length > 0 ? validDists[0] : null);

        if (matched) {
          setDistributorId(String(matched.id));
        } else if (distributorFirmId) {
          setDistributorId(String(distributorFirmId));
        } else if (user?.emp_id) {
          setDistributorId(String(user.emp_id));
        }
        // Always default to Self for distributor direct orders
        setDealerId('self');
      } else {
        // For Sales Person or ASM
        if (validDists.length > 0 && !distributorId) {
          const mapped = validDists.find(
            (d) => String(d.sales_person_id) === String(user?.emp_id)
          );
          const defaultDist = mapped ? mapped.id : validDists[0].id;
          setDistributorId(String(defaultDist));
        }
      }
    } catch (err) {
      console.error('Failed to load order creation data:', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setOrderDate(todayStr);
      setDealerSearch('');
      setIsDealerDropdownOpen(false);
      loadData();
      ordersApi
        .generateNextOrderId(todayStr)
        .then((id) => setPreviewOrderId(id))
        .catch(() => {});
    }
  }, [isOpen, user, isDistributor]);

  // Update order_id preview whenever order date changes
  useEffect(() => {
    if (isOpen && orderDate) {
      ordersApi
        .generateNextOrderId(orderDate)
        .then((id) => setPreviewOrderId(id))
        .catch(() => {});
    }
  }, [isOpen, orderDate]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        dealerDropdownRef.current &&
        !dealerDropdownRef.current.contains(event.target)
      ) {
        setIsDealerDropdownOpen(false);
      }
    };
    if (isDealerDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDealerDropdownOpen]);

  // Current matched distributor object
  const currentDistributor = useMemo(() => {
    if (!distributorId) return null;
    return (
      distributors.find((d) => String(d.id) === String(distributorId)) || null
    );
  }, [distributors, distributorId]);

  // Header field label & value:
  // If distributor is logged in -> show 'Distributor Name' and distributor name (e.g. RR Trading)
  // If sales person is logged in -> show 'Sales Officer' and sales officer credentials
  const headerFieldLabel = isDistributor ? 'Distributor Name' : 'Sales Officer';

  const headerFieldValue = useMemo(() => {
    if (isDistributor) {
      return (
        currentDistributor?.name ||
        user?.full_name ||
        user?.username ||
        '—'
      );
    }
    if (user) {
      return `${user.full_name || user.username} (ID: ${user.emp_id})`;
    }
    return '—';
  }, [isDistributor, currentDistributor, user]);

  // Reset dealer selection when distributor changes
  const handleDistributorChange = (e) => {
    setDistributorId(e.target.value);
    setDealerId('self');
    setDealerSearch('');
  };

  // Dealers filtered strictly by matching foreign key: dealer.distributor_id === effectiveDistId
  const availableDealers = useMemo(() => {
    const effId = isDistributor
      ? distributorId || distributorFirmId || user?.emp_id
      : distributorId;
    if (!effId) return [];

    return dealers.filter(
      (dlr) =>
        Boolean(dlr.name && dlr.name.trim()) &&
        String(dlr.distributor_id) === String(effId)
    );
  }, [dealers, distributorId, isDistributor, user]);

  // Filtered dealers matching search query
  const searchResults = useMemo(() => {
    const q = (dealerSearch || '').trim().toLowerCase();
    if (!q) return availableDealers;
    return availableDealers.filter(
      (dlr) =>
        dlr.name?.toLowerCase().includes(q) ||
        dlr.area_name?.toLowerCase().includes(q) ||
        dlr.phone?.toLowerCase().includes(q) ||
        dlr.address?.toLowerCase().includes(q)
    );
  }, [availableDealers, dealerSearch]);

  // Selected dealer object or Self
  const selectedDealerObj = useMemo(() => {
    if (dealerId === 'self' || !dealerId) {
      return { id: 'self', name: 'Self', area_name: 'Direct Order' };
    }
    return availableDealers.find((d) => String(d.id) === String(dealerId)) || null;
  }, [availableDealers, dealerId]);

  // Auto-calculated Total Order Value = order_qty * price
  const totalOrderValue = useMemo(() => {
    const qty = parseFloat(orderQty) || 0;
    const rate = parseFloat(price) || 0;
    return qty * rate;
  }, [orderQty, price]);

  // Handle Submit
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!canEdit('orders')) {
      alert('Access Denied: You have view-only access to Orders and cannot book orders.');
      return;
    }

    const effDistId = isDistributor
      ? distributorId || distributorFirmId || user?.emp_id
      : distributorId;

    if (!effDistId) {
      alert('Distributor could not be determined. Please contact admin.');
      return;
    }
    const qty = parseFloat(orderQty);
    const rate = parseFloat(price);

    if (!qty || qty <= 0) {
      alert('Please enter a valid order quantity.');
      return;
    }
    if (!rate || rate <= 0) {
      alert('Please enter a valid price.');
      return;
    }

    setLoading(true);
    try {
      // Determine Sales Person ID:
      // If distributor is logged in, use distributor's assigned sales_person_id
      // If salesperson/ASM is logged in, use user's emp_id
      const assignedSalesPersonId = isDistributor
        ? currentDistributor?.sales_person_id
          ? parseInt(currentDistributor.sales_person_id, 10)
          : null
        : user?.emp_id
          ? parseInt(user.emp_id, 10)
          : null;

      const orderPayload = {
        order_id: previewOrderId || undefined,
        created_at: new Date(orderDate).toISOString(),
        date: orderDate,
        distributor_id: parseInt(effDistId, 10),
        dealer_id: dealerId === 'self' || !dealerId ? null : parseInt(dealerId, 10),
        sales_person_id: assignedSalesPersonId,
        po_number: null,
        brand_name: 'Sarthak TMT',
        product_description: null,
        order_qty: qty,
        order_value: rate,
        total_order_value: totalOrderValue,
        firm_id: null,
      };

      await ordersApi.createOrder(orderPayload);
      showToast(`Order created for ${qty.toFixed(2)} MT!`);
      triggerRefresh();
      onClose();

      setOrderQty('');
      setPrice('');
      setDealerId('self');
      setDealerSearch('');
    } catch (err) {
      console.error('Error submitting order:', err);
      alert('Failed to submit order: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="New Order" maxWidth="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        {headerSlot}
        {/* Brand & Upcoming Order ID Banner */}
        <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-500 uppercase">Brand:</span>
            <span className="text-xs font-black text-[#a81b1e] bg-red-50 border border-red-200 px-2 py-0.5 rounded">
              Sarthak TMT
            </span>
          </div>
          {previewOrderId && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Order ID:</span>
              <span className="font-mono text-xs font-bold text-slate-900 bg-white border border-slate-200 px-2 py-0.5 rounded">
                {previewOrderId}
              </span>
            </div>
          )}
        </div>

        {/* Date & Sales Officer */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Date
            </label>
            <input
              type="date"
              required
              value={orderDate}
              onChange={(e) => setOrderDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm sm:text-xs text-slate-800 focus:border-[#a81b1e] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {headerFieldLabel}
            </label>
            <input
              type="text"
              readOnly
              value={headerFieldValue}
              title={headerFieldValue}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm sm:text-xs font-medium text-slate-700 cursor-not-allowed truncate"
            />
          </div>
        </div>

        {/* Distributor Dropdown: DO NOT SHOW WHEN DISTRIBUTOR IS LOGGED IN */}
        {!isDistributor && (
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Distributor
            </label>
            <select
              required
              value={distributorId}
              onChange={handleDistributorChange}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm sm:text-xs text-slate-800 focus:border-[#a81b1e] focus:outline-none"
            >
              <option value="">
                {distributors.length === 0
                  ? 'No distributors found in database'
                  : 'Select Distributor'}
              </option>
              {distributors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name || d.distributor_name} {d.state ? `(${d.state})` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Searchable Dealer Dropdown with 'Self' default & instant search */}
        <div className="relative" ref={dealerDropdownRef}>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Dealer
          </label>

          {/* Trigger Button */}
          <button
            type="button"
            onClick={() => setIsDealerDropdownOpen((prev) => !prev)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-left flex items-center justify-between text-sm sm:text-xs text-slate-800 focus:border-[#a81b1e] focus:outline-none hover:border-slate-400 transition"
          >
            <div className="flex items-center gap-2 truncate">
              <Store className="w-4 h-4 text-[#a81b1e] shrink-0" />
              {selectedDealerObj ? (
                <span className="font-semibold text-slate-900 truncate">
                  {selectedDealerObj.name}
                  {selectedDealerObj.id === 'self' && (
                    <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-50 text-[#a81b1e] border border-red-200">
                      Self Order
                    </span>
                  )}
                  {selectedDealerObj.area_name && selectedDealerObj.id !== 'self' && (
                    <span className="ml-1 text-[11px] font-normal text-slate-500">
                      ({selectedDealerObj.area_name})
                    </span>
                  )}
                </span>
              ) : (
                <span className="text-slate-400">Select Dealer (Optional)</span>
              )}
            </div>
            <ChevronDown
              className={`w-4 h-4 text-slate-400 transition-transform ${isDealerDropdownOpen ? 'rotate-180' : ''
                }`}
            />
          </button>

          {/* Dropdown Menu with Search */}
          {isDealerDropdownOpen && (
            <div className="absolute z-50 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-xl overflow-hidden animate-in fade-in-50 duration-150">
              {/* Search Box */}
              <div className="p-2 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
                <Search className="w-3.5 h-3.5 text-slate-400 shrink-0 ml-1" />
                <input
                  type="text"
                  autoFocus
                  value={dealerSearch}
                  onChange={(e) => setDealerSearch(e.target.value)}
                  placeholder="Search dealer by name or area..."
                  className="w-full bg-transparent text-xs text-slate-800 placeholder-slate-400 focus:outline-none"
                />
                {dealerSearch && (
                  <button
                    type="button"
                    onClick={() => setDealerSearch('')}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Options List */}
              <div className="max-h-56 overflow-y-auto divide-y divide-slate-100">
                {/* Default Option: Self */}
                {(!dealerSearch ||
                  'self'.includes(dealerSearch.toLowerCase()) ||
                  'direct'.includes(dealerSearch.toLowerCase())) && (
                    <button
                      type="button"
                      onClick={() => {
                        setDealerId('self');
                        setIsDealerDropdownOpen(false);
                        setDealerSearch('');
                      }}
                      className={`w-full text-left px-3 py-2.5 flex items-center justify-between text-xs transition cursor-pointer ${dealerId === 'self' || !dealerId
                        ? 'bg-red-50/80 text-[#a81b1e] font-bold'
                        : 'hover:bg-slate-50 text-slate-800'
                        }`}
                    >
                      <div className="flex items-center gap-2">
                        <Store className="w-3.5 h-3.5 text-[#a81b1e]" />
                        <div>
                          <div className="font-bold flex items-center gap-1.5">
                            Self
                            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-50 text-amber-800 border border-amber-200">
                              Direct Order
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-400">
                            Direct distributor order (No dealer assignment)
                          </p>
                        </div>
                      </div>
                      {(dealerId === 'self' || !dealerId) && (
                        <Check className="w-4 h-4 text-[#a81b1e] shrink-0" />
                      )}
                    </button>
                  )}

                {/* Mapped Dealers */}
                {searchResults.length > 0 ? (
                  searchResults.map((dlr) => (
                    <button
                      type="button"
                      key={dlr.id}
                      onClick={() => {
                        setDealerId(String(dlr.id));
                        setIsDealerDropdownOpen(false);
                        setDealerSearch('');
                      }}
                      className={`w-full text-left px-3 py-2 flex items-center justify-between text-xs transition cursor-pointer ${String(dealerId) === String(dlr.id)
                        ? 'bg-red-50/80 text-[#a81b1e] font-bold'
                        : 'hover:bg-slate-50 text-slate-800'
                        }`}
                    >
                      <div>
                        <div className="font-semibold text-slate-900">
                          {dlr.name}
                        </div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-1.5">
                          {dlr.area_name && <span>{dlr.area_name}</span>}
                          {dlr.phone && <span>• {dlr.phone}</span>}
                        </div>
                      </div>
                      {String(dealerId) === String(dlr.id) && (
                        <Check className="w-4 h-4 text-[#a81b1e] shrink-0" />
                      )}
                    </button>
                  ))
                ) : (
                  dealerSearch && (
                    <div className="p-4 text-center text-xs text-slate-400 font-medium">
                      No dealers found matching "{dealerSearch}"
                    </div>
                  )
                )}

                {availableDealers.length === 0 && !dealerSearch && (
                  <div className="p-3 text-center text-[11px] text-slate-400">
                    No mapped dealers assigned to this distributor. You can proceed with "Self".
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Order Qty & Price */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Order Qty (MT)
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              placeholder="0.00"
              value={orderQty}
              onChange={(e) => setOrderQty(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm sm:text-xs text-slate-800 focus:border-[#a81b1e] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Price (₹ / MT)
            </label>
            <input
              type="number"
              step="1"
              min="0"
              required
              placeholder="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm sm:text-xs text-slate-800 focus:border-[#a81b1e] focus:outline-none"
            />
          </div>
        </div>

        {/* Total Order Value */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Total Order Value
          </label>
          <div className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-[#a81b1e]">
            ₹{' '}
            {totalOrderValue > 0
              ? totalOrderValue.toLocaleString('en-IN', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })
              : '0.00'}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-3 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2.5 sm:py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 transition cursor-pointer text-center"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading || !orderQty || !price}
            className="w-full sm:w-auto px-5 py-2.5 sm:py-2 rounded-lg bg-[#a81b1e] text-xs font-bold text-white hover:bg-[#8e1518] transition disabled:opacity-50 cursor-pointer text-center"
          >
            {loading ? 'Creating...' : 'Create Order'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
