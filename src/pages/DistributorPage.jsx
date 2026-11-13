import React, { useState, useEffect } from 'react';
import { distributorApi } from '../api/distributorApi';
import { dealerApi } from '../api/dealerApi';
import { usersApi } from '../api/usersApi';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { Modal } from '../components/common/Modal';
import { Pagination } from '../components/common/Pagination';
import {
  Building2,
  Store,
  Plus,
  Search,
  Phone,
  MapPin,
  UserCheck,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Pencil,
} from 'lucide-react';

// Sales officer dropdowns list only users whose position is Area Sales Manager
const isAreaSalesManager = (u) => {
  const pos = String(u?.position || '').toLowerCase();
  return pos.includes('area sales manager') || /\basm\b/.test(pos);
};

export const DistributorPage = () => {
  const { showToast } = useApp();
  const { user, isASM, isDistributor, isSalesPerson, canEdit, distributorFirmId } = useAuth();
  const canEditDistributors = canEdit('distributors');
  const isSalesRole = isASM || isSalesPerson;

  // Default active sub-tab: 'dealers' for distributor, 'distributors' for salesperson / admin
  const [activeSubTab, setActiveSubTab] = useState(isDistributor ? 'dealers' : 'distributors');

  const [distributors, setDistributors] = useState([]);
  const [dealers, setDealers] = useState([]);
  const [salesUsers, setSalesUsers] = useState([]);
  const [expandedDistId, setExpandedDistId] = useState(null);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [stateFilter, setStateFilter] = useState('all');
  const [selectedDistFilter, setSelectedDistFilter] = useState('all');

  // Modals
  const [isAddDistOpen, setIsAddDistOpen] = useState(false);
  const [isAddDealerOpen, setIsAddDealerOpen] = useState(false);
  const [modalPreselectedDistId, setModalPreselectedDistId] = useState('');
  // Record being edited in the distributor / dealer modal (null = adding a new one)
  const [editingDist, setEditingDist] = useState(null);
  const [editingDealer, setEditingDealer] = useState(null);

  // Form states - Distributor
  const [distName, setDistName] = useState('');
  const [distAddress, setDistAddress] = useState('');
  const [distState, setDistState] = useState('');
  const [distPhone, setDistPhone] = useState('');
  const [distSalesPersonId, setDistSalesPersonId] = useState(isSalesRole ? user?.emp_id : '');

  // Form states - Dealer
  const [dealerName, setDealerName] = useState('');
  const [dealerAddress, setDealerAddress] = useState('');
  const [dealerState, setDealerState] = useState('');
  const [dealerPhone, setDealerPhone] = useState('');
  const [dealerAreaName, setDealerAreaName] = useState('');
  const [dealerDistId, setDealerDistId] = useState('');
  const [dealerSalesPersonId, setDealerSalesPersonId] = useState(isSalesRole ? user?.emp_id : '');

  const [loading, setLoading] = useState(false);

  // Resolved distributor ID for logged-in distributor
  const distributorId = React.useMemo(() => {
    if (!isDistributor) return null;
    const matched = distributors.find(
      (d) =>
        String(d.id) === String(distributorFirmId) ||
        String(d.id) === String(user?.emp_id) ||
        (d.name && user?.full_name && d.name.trim().toLowerCase() === user.full_name.trim().toLowerCase())
    );
    return matched ? matched.id : (distributorFirmId || user?.emp_id);
  }, [isDistributor, distributors, user]);

  const currentDistributor = React.useMemo(() => {
    if (!distributorId) return null;
    return distributors.find((d) => String(d.id) === String(distributorId)) || null;
  }, [distributors, distributorId]);

  const assignedSalesPerson = React.useMemo(() => {
    if (!currentDistributor?.sales_person_id) return null;
    return salesUsers.find((u) => Number(u.emp_id) === Number(currentDistributor.sales_person_id)) || null;
  }, [currentDistributor, salesUsers]);

  const assignedSalesUser = assignedSalesPerson;

  // Distributor IDs assigned to this sales person
  const myAssignedDistributorIds = React.useMemo(() => {
    if (!isSalesRole) return [];
    return distributors
      .filter((d) => String(d.sales_person_id) === String(user?.emp_id))
      .map((d) => String(d.id));
  }, [isSalesRole, distributors, user]);

  // Distributors available in dropdowns based on role
  const visibleDistributorsForDropdown = React.useMemo(() => {
    if (isDistributor) {
      return currentDistributor ? [currentDistributor] : [];
    }
    if (isSalesRole) {
      return distributors.filter((d) => String(d.sales_person_id) === String(user?.emp_id));
    }
    return distributors;
  }, [isDistributor, isSalesRole, currentDistributor, distributors, user]);

  const fetchAllData = async () => {
    try {
      const [distData, dealerData, userData] = await Promise.all([
        distributorApi.getDistributors(),
        dealerApi.getDealers(),
        usersApi.getUsers(),
      ]);
      setDistributors(distData || []);
      setDealers(dealerData || []);
      setSalesUsers(userData || []);

      if (distData && distData.length > 0 && !dealerDistId) {
        setDealerDistId(distData[0].id);
      }
      const firstAsm = (userData || []).find(isAreaSalesManager);
      if (firstAsm) {
        if (!distSalesPersonId) setDistSalesPersonId(firstAsm.emp_id);
        if (!dealerSalesPersonId) setDealerSalesPersonId(firstAsm.emp_id);
      }
    } catch (err) {
      console.error('Error fetching distributor/dealer data:', err);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  useEffect(() => {
    if (isDistributor && distributorId) {
      setDealerDistId(distributorId);
      setActiveSubTab('dealers');
    } else if (isSalesRole && visibleDistributorsForDropdown.length > 0 && !dealerDistId) {
      setDealerDistId(visibleDistributorsForDropdown[0].id);
    }
  }, [isDistributor, distributorId, isSalesRole, visibleDistributorsForDropdown, dealerDistId]);

  // Area Sales Managers offered in the Sales Officer dropdowns; the record's current officer stays
  // in the list while editing even if their position is different
  const salesOfficerOptions = (currentId) =>
    salesUsers.filter(
      (u) => isAreaSalesManager(u) || (currentId && String(u.emp_id) === String(currentId))
    );

  // Only admins pick the sales officer; sales users / distributors keep the auto-assigned one
  const canPickSalesOfficer = !isSalesRole && !isDistributor;

  const openAddDistributor = () => {
    setEditingDist(null);
    setDistName('');
    setDistAddress('');
    setDistState('');
    setDistPhone('');
    if (isSalesRole) setDistSalesPersonId(user?.emp_id);
    else setDistSalesPersonId(salesUsers.find(isAreaSalesManager)?.emp_id || '');
    setIsAddDistOpen(true);
  };

  const openEditDistributor = (d) => {
    setEditingDist(d);
    setDistName(d.name || '');
    setDistAddress(d.address || '');
    setDistState(d.state || '');
    setDistPhone(d.phone || '');
    setDistSalesPersonId(d.sales_person_id ? String(d.sales_person_id) : '');
    setIsAddDistOpen(true);
  };

  const closeDistModal = () => {
    setIsAddDistOpen(false);
    setEditingDist(null);
  };

  const resetDealerForm = () => {
    setDealerName('');
    setDealerAddress('');
    setDealerState('');
    setDealerPhone('');
    setDealerAreaName('');
    if (isSalesRole) setDealerSalesPersonId(user?.emp_id);
    else if (!isDistributor) setDealerSalesPersonId(salesUsers.find(isAreaSalesManager)?.emp_id || '');
  };

  const openAddDealer = (distId) => {
    setEditingDealer(null);
    resetDealerForm();
    if (distId) setDealerDistId(distId);
    setIsAddDealerOpen(true);
  };

  const openEditDealer = (d) => {
    setEditingDealer(d);
    setDealerName(d.name || '');
    setDealerAddress(d.address || '');
    setDealerState(d.state || '');
    setDealerPhone(d.phone || '');
    setDealerAreaName(d.area_name || '');
    setDealerDistId(d.distributor_id ? String(d.distributor_id) : '');
    setDealerSalesPersonId(d.sales_person_id ? String(d.sales_person_id) : '');
    setIsAddDealerOpen(true);
  };

  const closeDealerModal = () => {
    setIsAddDealerOpen(false);
    setEditingDealer(null);
  };

  // Handle Add / Edit Distributor
  const handleCreateDistributor = async (e) => {
    e.preventDefault();
    if (!canEditDistributors) {
      alert('Access Denied: You have view-only access to Distributors & Dealers.');
      return;
    }
    setLoading(true);
    try {
      if (editingDist) {
        await distributorApi.updateDistributor(editingDist.id, {
          name: distName.trim(),
          address: distAddress.trim() || null,
          state: distState.trim() || null,
          phone: distPhone.trim() || null,
          // Admins can reassign the sales officer; everyone else keeps the current one
          sales_person_id: canPickSalesOfficer
            ? (distSalesPersonId ? parseInt(distSalesPersonId, 10) : null)
            : editingDist.sales_person_id ?? null,
        });
        showToast(`Distributor ${distName} updated successfully!`);
        closeDistModal();
        fetchAllData();
        return;
      }

      const effectiveSalesId = isSalesRole
        ? (user?.emp_id ? parseInt(user.emp_id, 10) : null)
        : (distSalesPersonId ? parseInt(distSalesPersonId, 10) : null);

      const payload = {
        name: distName,
        address: distAddress,
        state: distState,
        phone: distPhone,
        sales_person_id: effectiveSalesId,
      };

      await distributorApi.createDistributor(payload);
      showToast(`Distributor ${distName} added successfully!`);
      setIsAddDistOpen(false);
      fetchAllData();

      setDistName('');
      setDistAddress('');
      setDistPhone('');
    } catch (err) {
      alert(`Failed to ${editingDist ? 'update' : 'add'} distributor: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Handle Add Dealer
  const handleCreateDealer = async (e) => {
    e.preventDefault();
    if (!canEditDistributors) {
      alert('Access Denied: You have view-only access to Distributors & Dealers.');
      return;
    }
    setLoading(true);
    try {
      if (editingDealer) {
        await dealerApi.updateDealer(editingDealer.id, {
          name: dealerName.trim(),
          address: dealerAddress.trim() || null,
          state: dealerState.trim() || null,
          phone: dealerPhone.trim() || null,
          area_name: dealerAreaName.trim() || null,
          // Distributors cannot move a dealer to another distributor
          distributor_id: isDistributor
            ? editingDealer.distributor_id ?? null
            : (dealerDistId ? parseInt(dealerDistId, 10) : null),
          sales_person_id: canPickSalesOfficer
            ? (dealerSalesPersonId ? parseInt(dealerSalesPersonId, 10) : null)
            : editingDealer.sales_person_id ?? null,
        });
        showToast(`Dealer ${dealerName} updated successfully!`);
        closeDealerModal();
        fetchAllData();
        return;
      }

      const targetDistId = isDistributor
        ? distributorId
        : (dealerDistId ? parseInt(dealerDistId, 10) : null);

      const effectiveSalesId = isDistributor
        ? (currentDistributor?.sales_person_id ? parseInt(currentDistributor.sales_person_id, 10) : null)
        : isSalesRole
          ? (user?.emp_id ? parseInt(user.emp_id, 10) : null)
          : (dealerSalesPersonId ? parseInt(dealerSalesPersonId, 10) : null);

      const payload = {
        name: dealerName,
        address: dealerAddress,
        state: dealerState,
        phone: dealerPhone,
        area_name: dealerAreaName,
        distributor_id: targetDistId ? parseInt(targetDistId, 10) : null,
        sales_person_id: effectiveSalesId,
      };

      await dealerApi.createDealer(payload);
      showToast(`Dealer ${dealerName} added successfully!`);
      setIsAddDealerOpen(false);
      fetchAllData();

      setDealerName('');
      setDealerAddress('');
      setDealerPhone('');
      setDealerAreaName('');
    } catch (err) {
      alert(`Failed to ${editingDealer ? 'update' : 'add'} dealer: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const openAddDealerForDistributor = (distId) => {
    setModalPreselectedDistId(distId);
    openAddDealer(distId);
  };

  // Filtered Distributors
  // If salesperson: ONLY show distributors assigned to this sales person
  // If distributor: ONLY show their own distributor record
  const filteredDistributors = React.useMemo(() => {
    return distributors.filter((d) => {
      const q = searchTerm.toLowerCase();
      const matchesSearch =
        d.name?.toLowerCase().includes(q) ||
        d.address?.toLowerCase().includes(q) ||
        d.phone?.includes(q) ||
        String(d.id).includes(q);
      const matchesState = stateFilter === 'all' || d.state === stateFilter;

      if (isDistributor) {
        return String(d.id) === String(distributorId) && matchesSearch && matchesState;
      }

      if (isSalesRole) {
        return String(d.sales_person_id) === String(user?.emp_id) && matchesSearch && matchesState;
      }

      return matchesSearch && matchesState;
    });
  }, [distributors, searchTerm, stateFilter, isDistributor, isSalesRole, distributorId, user]);

  // Filtered Dealers
  // If salesperson: ONLY show dealers mapped to their assigned distributors or assigned to them directly
  // If distributor: ONLY show dealers assigned to this distributor as foreign key
  const filteredDealers = React.useMemo(() => {
    return dealers.filter((d) => {
      const q = searchTerm.toLowerCase();
      const matchesSearch =
        d.name?.toLowerCase().includes(q) ||
        d.area_name?.toLowerCase().includes(q) ||
        d.address?.toLowerCase().includes(q) ||
        d.phone?.includes(q) ||
        String(d.id).includes(q);
      const matchesDist =
        selectedDistFilter === 'all' || String(d.distributor_id) === String(selectedDistFilter);

      if (isDistributor) {
        return (
          String(d.distributor_id) === String(distributorId) &&
          matchesSearch &&
          matchesDist
        );
      }

      if (isSalesRole) {
        const belongsToMyDistributor = myAssignedDistributorIds.includes(String(d.distributor_id));
        const assignedToMe = String(d.sales_person_id) === String(user?.emp_id);
        return (
          (belongsToMyDistributor || assignedToMe) &&
          matchesSearch &&
          matchesDist
        );
      }

      return matchesSearch && matchesDist;
    });
  }, [dealers, searchTerm, selectedDistFilter, isDistributor, isSalesRole, distributorId, myAssignedDistributorIds, user]);

  const availableStates = ['all', ...new Set(distributors.map((d) => d.state).filter(Boolean))];

  // Pagination states
  const [distPage, setDistPage] = useState(1);
  const [distPageSize, setDistPageSize] = useState(15);
  const [dealerPage, setDealerPage] = useState(1);
  const [dealerPageSize, setDealerPageSize] = useState(15);

  useEffect(() => {
    setDistPage(1);
  }, [searchTerm, stateFilter]);

  useEffect(() => {
    setDealerPage(1);
  }, [searchTerm, selectedDistFilter]);

  const paginatedDistributors = React.useMemo(() => {
    const start = (distPage - 1) * distPageSize;
    return filteredDistributors.slice(start, start + distPageSize);
  }, [filteredDistributors, distPage, distPageSize]);

  const paginatedDealers = React.useMemo(() => {
    const start = (dealerPage - 1) * dealerPageSize;
    return filteredDealers.slice(start, start + dealerPageSize);
  }, [filteredDealers, dealerPage, dealerPageSize]);

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex items-start sm:items-center justify-between gap-3 sm:gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg sm:text-2xl font-extrabold text-slate-900">
              {isDistributor
                ? 'My Dealers Network'
                : isSalesRole
                  ? 'My Distributors & Dealers'
                  : 'Distributors & Dealers'}
            </h1>
            {isDistributor ? (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-red-50 text-[#a81b1e] border border-red-200 max-w-full break-words">
                Distributor: {user?.full_name || user?.username} (ID: {distributorId})
              </span>
            ) : isSalesRole ? (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200 max-w-full break-words">
                Sales Officer: {user?.full_name || user?.username} (Sales ID: {user?.emp_id})
              </span>
            ) : null}
          </div>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            {isDistributor
              ? `Retail dealers mapped directly under ${user?.full_name || 'your distributor account'}`
              : isSalesRole
                ? 'Authorized channel partners and mapped retail dealer network assigned to your sales territory'
                : 'Authorized channel partners and mapped retail dealer network'}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!canEditDistributors ? (
            null
          ) : isDistributor ? (
            <button
              onClick={() => openAddDealer(distributorId)}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-[#a81b1e] hover:bg-[#8e1518] px-3 sm:px-4 py-2 text-xs font-bold text-white shadow-xs transition cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              Add Dealer
            </button>
          ) : activeSubTab === 'distributors' ? (
            <button
              onClick={openAddDistributor}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-[#a81b1e] hover:bg-[#8e1518] px-3 sm:px-4 py-2 text-xs font-bold text-white shadow-xs transition cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              Add Distributor
            </button>
          ) : (
            <button
              onClick={() => openAddDealer()}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-[#a81b1e] hover:bg-[#8e1518] px-3 sm:px-4 py-2 text-xs font-bold text-white shadow-xs transition cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              Add Dealer
            </button>
          )}
        </div>
      </div>

      {/* Primary Sub-Tab Switcher */}
      <div className="flex items-center border-b border-slate-200 gap-4 overflow-x-auto no-scrollbar">
        {isDistributor ? (
          <>
            <button
              onClick={() => setActiveSubTab('dealers')}
              className={`pb-2.5 text-xs font-bold transition flex items-center gap-2 border-b-2 cursor-pointer whitespace-nowrap ${activeSubTab === 'dealers'
                ? 'border-[#a81b1e] text-[#a81b1e]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
            >
              <Store className="w-4 h-4" />
              <span>My Assigned Dealers</span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-red-50 text-[#a81b1e] font-bold border border-red-200">
                {filteredDealers.length}
              </span>
            </button>

            <button
              onClick={() => setActiveSubTab('distributors')}
              className={`pb-2.5 text-xs font-bold transition flex items-center gap-2 border-b-2 cursor-pointer whitespace-nowrap ${activeSubTab === 'distributors'
                ? 'border-[#a81b1e] text-[#a81b1e]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
            >
              <Building2 className="w-4 h-4" />
              <span>My Firm Profile</span>
            </button>
          </>
        ) : isSalesRole ? (
          <>
            <button
              onClick={() => setActiveSubTab('distributors')}
              className={`pb-2.5 text-xs font-bold transition flex items-center gap-2 border-b-2 cursor-pointer whitespace-nowrap ${activeSubTab === 'distributors'
                ? 'border-[#a81b1e] text-[#a81b1e]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
            >
              <Building2 className="w-4 h-4" />
              <span>My Assigned Distributors</span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-600 font-bold">
                {filteredDistributors.length}
              </span>
            </button>

            <button
              onClick={() => setActiveSubTab('dealers')}
              className={`pb-2.5 text-xs font-bold transition flex items-center gap-2 border-b-2 cursor-pointer whitespace-nowrap ${activeSubTab === 'dealers'
                ? 'border-[#a81b1e] text-[#a81b1e]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
            >
              <Store className="w-4 h-4" />
              <span>Dealers</span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-600 font-bold">
                {filteredDealers.length}
              </span>
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setActiveSubTab('distributors')}
              className={`pb-2.5 text-xs font-bold transition flex items-center gap-2 border-b-2 cursor-pointer whitespace-nowrap ${activeSubTab === 'distributors'
                ? 'border-[#a81b1e] text-[#a81b1e]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
            >
              <Building2 className="w-4 h-4" />
              <span>Distributors</span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-600 font-bold">
                {filteredDistributors.length}
              </span>
            </button>

            <button
              onClick={() => setActiveSubTab('dealers')}
              className={`pb-2.5 text-xs font-bold transition flex items-center gap-2 border-b-2 cursor-pointer whitespace-nowrap ${activeSubTab === 'dealers'
                ? 'border-[#a81b1e] text-[#a81b1e]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
            >
              <Store className="w-4 h-4" />
              <span>Dealers (Mapped to Distributors)</span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-600 font-bold">
                {filteredDealers.length}
              </span>
            </button>
          </>
        )}
      </div>

      {/* ========================================================== */}
      {/* VIEW 1: DISTRIBUTORS (WITH NESTED DEALERS)                 */}
      {/* ========================================================== */}
      {activeSubTab === 'distributors' && (
        <div className="space-y-4">
          {/* Filter & Search Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white p-3 shadow-xs">
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar min-w-0 w-full sm:w-auto">
              {availableStates.map((st) => (
                <button
                  key={st}
                  onClick={() => setStateFilter(st)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize whitespace-nowrap transition cursor-pointer ${stateFilter === st
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                >
                  {st === 'all' ? 'All States' : st}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search distributor name, phone, address..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 py-1.5 text-xs text-slate-900 focus:border-[#a81b1e] focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          {/* MOBILE CARD VIEW: Visible on screens < 768px (Phones, Small Tablets) */}
          <div className="block md:hidden space-y-3">
            {paginatedDistributors.length === 0 ? (
              <div className="p-8 text-center bg-white rounded-xl border border-slate-200 text-slate-400 text-xs">
                {isDistributor
                  ? 'No distributor profile found for your account.'
                  : isSalesRole
                    ? 'No distributors assigned to your sales account yet.'
                    : 'No distributors found matching criteria.'}
              </div>
            ) : (
              paginatedDistributors.map((d) => {
                const salesPerson =
                  d.sales_person ||
                  salesUsers.find((u) => Number(u.emp_id) === Number(d.sales_person_id));

                const distributorDealers = dealers.filter(
                  (dlr) => String(dlr.distributor_id) === String(d.id)
                );

                const isExpanded = expandedDistId === d.id;

                return (
                  <div
                    key={d.id}
                    className="p-3.5 rounded-xl border border-slate-200 bg-white shadow-xs space-y-3"
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
                      <div className="min-w-0">
                        <div className="flex items-start gap-1.5">
                          <span className="font-mono text-xs font-bold text-slate-500 shrink-0 mt-0.5">#{d.id}</span>
                          <h3 className="font-bold text-slate-900 text-sm break-words min-w-0">{d.name}</h3>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">
                            {distributorDealers.length} {distributorDealers.length === 1 ? 'Dealer' : 'Dealers'}
                          </span>
                          {d.state && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-50 text-[#a81b1e] border border-red-100">
                              {d.state}
                            </span>
                          )}
                        </div>
                      </div>

                      {canEditDistributors && (
                        <div className="shrink-0 flex flex-col items-end gap-1.5">
                          <button
                            onClick={() => openEditDistributor(d)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition cursor-pointer"
                          >
                            <Pencil className="w-3 h-3" />
                            Edit
                          </button>
                          {!isDistributor && (
                            <button
                              onClick={() => openAddDealerForDistributor(d.id)}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold text-[#a81b1e] bg-red-50 hover:bg-red-100 border border-red-200 transition cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                              Add Dealer
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Address & Phone */}
                    <div className="space-y-1.5 text-xs text-slate-600">
                      {d.address && (
                        <div className="flex items-start gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                          <span className="text-slate-700">{d.address}</span>
                        </div>
                      )}
                      {d.phone && (
                        <div className="flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <a href={`tel:${d.phone}`} className="font-mono text-slate-800 hover:text-[#a81b1e] font-semibold">
                            {d.phone}
                          </a>
                        </div>
                      )}
                    </div>

                    {/* Sales Officer Box */}
                    <div className="flex items-center justify-between gap-2 text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                      <span className="text-slate-500 font-medium shrink-0">Sales Officer:</span>
                      {salesPerson ? (
                        <div className="flex items-center gap-1.5 text-right">
                          <UserCheck className="w-3.5 h-3.5 text-slate-500" />
                          <div>
                            <span className="font-bold text-slate-900 block">{salesPerson.full_name}</span>
                            <span className="text-[10px] text-slate-400 font-mono">ID: {salesPerson.emp_id}</span>
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">Unassigned</span>
                      )}
                    </div>

                    {/* Expand/Collapse Dealers Button */}
                    <button
                      onClick={() => setExpandedDistId(isExpanded ? null : d.id)}
                      className="w-full flex items-center justify-between py-2 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 transition cursor-pointer"
                    >
                      <span>{isExpanded ? 'Hide' : 'View'} Mapped Dealers ({distributorDealers.length})</span>
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-[#a81b1e]" /> : <ChevronDown className="w-4 h-4" />}
                    </button>

                    {/* Nested Dealers on Mobile */}
                    {isExpanded && (
                      <div className="pt-2 border-t border-slate-100 space-y-2">
                        {distributorDealers.length === 0 ? (
                          <p className="text-xs text-slate-400 italic text-center py-2">
                            No dealers mapped yet. Click "Add Dealer" above to register one.
                          </p>
                        ) : (
                          distributorDealers.map((dlr) => (
                            <div
                              key={dlr.id}
                              className="p-2.5 rounded-lg border border-slate-200/80 bg-slate-50/70 text-xs space-y-1"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <span className="font-bold text-slate-900 break-words min-w-0">{dlr.name}</span>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className="font-mono font-bold text-slate-500 text-[10px]">#{dlr.id}</span>
                                  {canEditDistributors && (
                                    <button
                                      onClick={() => openEditDealer(dlr)}
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 cursor-pointer"
                                    >
                                      <Pencil className="w-3 h-3" />
                                      Edit
                                    </button>
                                  )}
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                                <span className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-700 font-medium">
                                  {dlr.area_name || dlr.state || '—'}
                                </span>
                                {dlr.phone && <span className="font-mono">{dlr.phone}</span>}
                              </div>
                              {dlr.address && <p className="text-[11px] text-slate-600">{dlr.address}</p>}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* DESKTOP TABLE VIEW: Hidden on mobile (< 768px) */}
          <div className="hidden md:block overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-3.5 w-12 text-center">Dealers</th>
                    <th className="py-3 px-3.5">ID</th>
                    <th className="py-3 px-3.5">Distributor Firm</th>
                    <th className="py-3 px-3.5">Address & State</th>
                    <th className="py-3 px-3.5">Phone</th>
                    <th className="py-3 px-3.5">Assigned Sales Officer</th>
                    <th className="py-3 px-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedDistributors.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400">
                        {isDistributor
                          ? 'No distributor profile found for your account.'
                          : isSalesRole
                            ? 'No distributors assigned to your sales account yet.'
                            : 'No distributors found matching criteria.'}
                      </td>
                    </tr>
                  ) : (
                    paginatedDistributors.map((d) => {
                      const salesPerson =
                        d.sales_person ||
                        salesUsers.find((u) => Number(u.emp_id) === Number(d.sales_person_id));

                      const distributorDealers = dealers.filter(
                        (dlr) => String(dlr.distributor_id) === String(d.id)
                      );

                      const isExpanded = expandedDistId === d.id;

                      return (
                        <React.Fragment key={d.id}>
                          <tr className={`hover:bg-slate-50/80 transition ${isExpanded ? 'bg-red-50/20' : ''}`}>
                            <td className="py-3 px-3.5 text-center">
                              <button
                                onClick={() => setExpandedDistId(isExpanded ? null : d.id)}
                                title={isExpanded ? 'Collapse dealers' : 'View dealers'}
                                className="p-1 rounded text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition cursor-pointer"
                              >
                                {isExpanded ? (
                                  <ChevronUp className="w-4 h-4 text-[#a81b1e]" />
                                ) : (
                                  <ChevronDown className="w-4 h-4" />
                                )}
                              </button>
                            </td>

                            <td className="py-3 px-3.5 font-mono font-bold text-slate-900">
                              #{d.id}
                            </td>

                            <td className="py-3 px-3.5">
                              <div className="flex items-center gap-2">
                                <p className="font-bold text-slate-900">{d.name}</p>
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">
                                  {distributorDealers.length} {distributorDealers.length === 1 ? 'Dealer' : 'Dealers'}
                                </span>
                              </div>
                            </td>

                            <td className="py-3 px-3.5">
                              <p className="text-slate-800">{d.address || '—'}</p>
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                                {d.state || 'N/A'}
                              </span>
                            </td>

                            <td className="py-3 px-3.5 font-mono text-slate-700">
                              {d.phone || '—'}
                            </td>

                            <td className="py-3 px-3.5">
                              {salesPerson ? (
                                <div className="flex items-center gap-1.5">
                                  <UserCheck className="w-3.5 h-3.5 text-slate-500" />
                                  <div>
                                    <p className="font-bold text-slate-900">{salesPerson.full_name}</p>
                                    <p className="text-[10px] text-slate-400 font-mono">ID: {salesPerson.emp_id}</p>
                                  </div>
                                </div>
                              ) : (
                                <span className="text-slate-400">Unassigned</span>
                              )}
                            </td>

                            <td className="py-3 px-3.5 text-right">
                              {canEditDistributors && (
                                <div className="inline-flex items-center gap-1.5">
                                  <button
                                    onClick={() => openEditDistributor(d)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition cursor-pointer"
                                  >
                                    <Pencil className="w-3 h-3" />
                                    Edit
                                  </button>
                                  {!isDistributor && (
                                    <button
                                      onClick={() => openAddDealerForDistributor(d.id)}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold text-[#a81b1e] bg-red-50 hover:bg-red-100 border border-red-200 transition cursor-pointer whitespace-nowrap"
                                    >
                                      <Plus className="w-3 h-3" />
                                      Add Dealer
                                    </button>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>

                          {/* Nested Dealers Dropdown Row */}
                          {isExpanded && (
                            <tr className="bg-slate-50/70">
                              <td colSpan={7} className="p-4">
                                <div className="pl-4 border-l-2 border-[#a81b1e] space-y-3">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <Store className="w-4 h-4 text-[#a81b1e]" />
                                      <h3 className="text-xs font-bold text-slate-900">
                                        Dealers under <span className="text-[#a81b1e]">{d.name}</span>
                                      </h3>
                                      <span className="text-[11px] text-slate-500">
                                        ({distributorDealers.length} mapped)
                                      </span>
                                    </div>

                                    {canEditDistributors && (
                                      <button
                                        onClick={() => openAddDealerForDistributor(d.id)}
                                        className="flex items-center gap-1 text-[11px] font-bold text-[#a81b1e] hover:underline cursor-pointer"
                                      >
                                        <Plus className="w-3 h-3" />
                                        Add New Dealer
                                      </button>
                                    )}
                                  </div>

                                  {distributorDealers.length === 0 ? (
                                    <p className="text-xs text-slate-500 italic py-2">
                                      No dealers mapped to this distributor yet. Click "Add Dealer" above to register one.
                                    </p>
                                  ) : (
                                    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                                      <table className="w-full text-left text-xs">
                                        <thead className="bg-slate-100 text-[10px] font-bold uppercase text-slate-600 border-b border-slate-200">
                                          <tr>
                                            <th className="py-2 px-3">Dealer ID</th>
                                            <th className="py-2 px-3">Dealer Firm</th>
                                            <th className="py-2 px-3">Area / City</th>
                                            <th className="py-2 px-3">Address</th>
                                            <th className="py-2 px-3">Contact Phone</th>
                                            {canEditDistributors && <th className="py-2 px-3 text-right">Action</th>}
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 font-medium">
                                          {distributorDealers.map((dlr) => (
                                            <tr key={dlr.id} className="hover:bg-slate-50">
                                              <td className="py-2 px-3 font-mono font-bold text-slate-900">
                                                #{dlr.id}
                                              </td>
                                              <td className="py-2 px-3 font-bold text-slate-900">
                                                {dlr.name}
                                              </td>
                                              <td className="py-2 px-3">
                                                <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-bold">
                                                  {dlr.area_name || dlr.state || '—'}
                                                </span>
                                              </td>
                                              <td className="py-2 px-3 text-slate-600">
                                                {dlr.address || '—'}
                                              </td>
                                              <td className="py-2 px-3 font-mono text-slate-700">
                                                {dlr.phone || '—'}
                                              </td>
                                              {canEditDistributors && (
                                                <td className="py-2 px-3 text-right">
                                                  <button
                                                    onClick={() => openEditDealer(dlr)}
                                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition cursor-pointer"
                                                  >
                                                    <Pencil className="w-3 h-3" />
                                                    Edit
                                                  </button>
                                                </td>
                                              )}
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Row Pagination for Distributors */}
          <Pagination
            currentPage={distPage}
            totalItems={filteredDistributors.length}
            pageSize={distPageSize}
            onPageChange={(page) => setDistPage(page)}
            onPageSizeChange={(size) => setDistPageSize(size)}
            pageSizeOptions={[10, 15, 25, 50]}
          />
        </div>
      )}

      {/* ========================================================== */}
      {/* VIEW 2: ALL DEALERS DIRECTORY (FILTERABLE BY DISTRIBUTOR)  */}
      {/* ========================================================== */}
      {activeSubTab === 'dealers' && (
        <div className="space-y-4">
          {/* Filters & Search */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white p-3 shadow-xs">
            {isDistributor ? (
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                <span className="text-xs font-bold text-slate-500 uppercase">Distributor Partner:</span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-red-50 text-[#a81b1e] border border-red-200 text-xs font-bold max-w-full break-words">
                  <Building2 className="w-3.5 h-3.5" />
                  {currentDistributor?.name || user?.full_name || 'My Firm'} (ID: #{distributorId})
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 min-w-0 w-full sm:w-auto">
                <span className="text-xs font-bold text-slate-500 uppercase shrink-0">Distributor:</span>
                <select
                  value={selectedDistFilter}
                  onChange={(e) => setSelectedDistFilter(e.target.value)}
                  className="flex-1 sm:flex-initial min-w-0 sm:max-w-xs rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 sm:py-1 text-xs text-slate-900 focus:outline-none"
                >
                  <option value="all">
                    {isSalesRole
                      ? `All My Assigned Distributors (${visibleDistributorsForDropdown.length})`
                      : `All Distributors (${distributors.length})`}
                  </option>
                  {visibleDistributorsForDropdown.map((dist) => (
                    <option key={dist.id} value={dist.id}>
                      {dist.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder={
                  isDistributor
                    ? 'Search your dealers by name, area, phone...'
                    : 'Search dealer, area, phone...'
                }
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 py-1.5 text-xs text-slate-900 focus:border-[#a81b1e] focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          {/* MOBILE CARD VIEW: Visible on screens < 768px (Phones, Small Tablets) */}
          <div className="block md:hidden space-y-3">
            {paginatedDealers.length === 0 ? (
              <div className="p-8 text-center bg-white rounded-xl border border-slate-200 text-slate-400 text-xs">
                {isDistributor
                  ? `No dealers mapped under ${currentDistributor?.name || 'your firm'} yet. Click "Add Dealer" above to register one.`
                  : isSalesRole
                    ? 'No dealers found in your assigned territory.'
                    : 'No dealers found.'}
              </div>
            ) : (
              paginatedDealers.map((d) => {
                const parentDist =
                  d.distributor ||
                  distributors.find((dst) => Number(dst.id) === Number(d.distributor_id));
                const salesPerson =
                  d.sales_person ||
                  salesUsers.find((u) => Number(u.emp_id) === Number(d.sales_person_id));

                return (
                  <div
                    key={d.id}
                    className="p-3.5 rounded-xl border border-slate-200 bg-white shadow-xs space-y-3"
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
                      <div className="min-w-0">
                        <div className="flex items-start gap-1.5">
                          <span className="font-mono text-xs font-bold text-slate-500 shrink-0 mt-0.5">#{d.id}</span>
                          <h3 className="font-bold text-slate-900 text-sm break-words min-w-0">{d.name}</h3>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          {d.area_name && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                              {d.area_name}
                            </span>
                          )}
                          {d.state && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-50 text-slate-600 border border-slate-100">
                              {d.state}
                            </span>
                          )}
                        </div>
                      </div>
                      {canEditDistributors && (
                        <button
                          onClick={() => openEditDealer(d)}
                          className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition cursor-pointer"
                        >
                          <Pencil className="w-3 h-3" />
                          Edit
                        </button>
                      )}
                    </div>

                    {/* Parent Distributor Box */}
                    <div className="flex items-center gap-1.5 text-xs bg-red-50/50 p-2.5 rounded-lg border border-red-100">
                      <Building2 className="w-3.5 h-3.5 text-[#a81b1e] shrink-0" />
                      <span className="text-slate-600">Distributor:</span>
                      <span className="font-bold text-slate-900 truncate">
                        {parentDist?.name || 'Direct / None'}
                      </span>
                    </div>

                    {/* Address & Phone */}
                    <div className="space-y-1.5 text-xs text-slate-600">
                      {d.address && (
                        <div className="flex items-start gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                          <span className="text-slate-700">{d.address}</span>
                        </div>
                      )}
                      {d.phone && (
                        <div className="flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <a href={`tel:${d.phone}`} className="font-mono text-slate-800 hover:text-[#a81b1e] font-semibold">
                            {d.phone}
                          </a>
                        </div>
                      )}
                    </div>

                    {/* Sales Officer Box */}
                    <div className="flex items-center justify-between gap-2 text-xs bg-slate-50 p-2 rounded-lg border border-slate-100">
                      <span className="text-slate-500 font-medium shrink-0">Sales Officer:</span>
                      <span className="font-bold text-slate-800 text-right truncate">
                        {salesPerson ? salesPerson.full_name : '—'}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* DESKTOP TABLE VIEW: Hidden on mobile (< 768px) */}
          <div className="hidden md:block overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-3.5">ID</th>
                    <th className="py-3 px-3.5">Dealer Name</th>
                    <th className="py-3 px-3.5">Assigned Distributor</th>
                    <th className="py-3 px-3.5">Address</th>
                    <th className="py-3 px-3.5">Area & State</th>
                    <th className="py-3 px-3.5">Phone</th>
                    <th className="py-3 px-3.5">Sales Officer</th>
                    {canEditDistributors && <th className="py-3 px-3.5 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedDealers.length === 0 ? (
                    <tr>
                      <td colSpan={canEditDistributors ? 8 : 7} className="py-8 text-center text-slate-400">
                        {isDistributor
                          ? `No dealers mapped under ${currentDistributor?.name || 'your firm'} yet. Click "Add Dealer" above to register one.`
                          : isSalesRole
                            ? 'No dealers found in your assigned territory.'
                            : 'No dealers found.'}
                      </td>
                    </tr>
                  ) : (
                    paginatedDealers.map((d) => {
                      const parentDist =
                        d.distributor ||
                        distributors.find((dst) => Number(dst.id) === Number(d.distributor_id));
                      const salesPerson =
                        d.sales_person ||
                        salesUsers.find((u) => Number(u.emp_id) === Number(d.sales_person_id));

                      return (
                        <tr key={d.id} className="hover:bg-slate-50/80 transition">
                          <td className="py-3 px-3.5 font-mono font-bold text-slate-900">
                            #{d.id}
                          </td>
                          <td className="py-3 px-3.5">
                            <p className="font-bold text-slate-900">{d.name}</p>
                          </td>
                          <td className="py-3 px-3.5">
                            {parentDist ? (
                              <div className="flex items-center gap-1.5">
                                <Building2 className="w-3.5 h-3.5 text-slate-500" />
                                <span className="font-bold text-slate-800">{parentDist.name}</span>
                              </div>
                            ) : (
                              <span className="text-slate-400">Direct / None</span>
                            )}
                          </td>
                          <td className="py-3 px-3.5 text-slate-600">
                            {d.address || '—'}
                          </td>
                          <td className="py-3 px-3.5">
                            {/* No area: show only the state */}
                            {d.area_name ? (
                              <>
                                <p className="font-semibold text-slate-900">{d.area_name}</p>
                                {d.state && <span className="text-[10px] text-slate-500">{d.state}</span>}
                              </>
                            ) : (
                              <p className="font-semibold text-slate-900">{d.state || '—'}</p>
                            )}
                          </td>
                          <td className="py-3 px-3.5 font-mono text-slate-700">
                            {d.phone || '—'}
                          </td>
                          <td className="py-3 px-3.5">
                            {salesPerson ? (
                              <span className="text-slate-700 font-medium">{salesPerson.full_name}</span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          {canEditDistributors && (
                            <td className="py-3 px-3.5 text-right">
                              <button
                                onClick={() => openEditDealer(d)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition cursor-pointer"
                              >
                                <Pencil className="w-3 h-3" />
                                Edit
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Row Pagination for Dealers */}
          <Pagination
            currentPage={dealerPage}
            totalItems={filteredDealers.length}
            pageSize={dealerPageSize}
            onPageChange={(page) => setDealerPage(page)}
            onPageSizeChange={(size) => setDealerPageSize(size)}
            pageSizeOptions={[10, 15, 25, 50]}
          />
        </div>
      )}

      {/* ========================================================== */}
      {/* ADD DISTRIBUTOR MODAL                                      */}
      {/* ========================================================== */}
      <Modal
        isOpen={isAddDistOpen}
        onClose={closeDistModal}
        title={editingDist ? `Edit Distributor — ${editingDist.name}` : 'Add New Distributor Partner'}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleCreateDistributor} className="space-y-3.5">
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
              Distributor Firm Name *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Mahavir Steels & Infra"
              value={distName}
              onChange={(e) => setDistName(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#a81b1e] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
              Distributor Address
            </label>
            <textarea
              rows={2}
              placeholder="Plot No. 12, Industrial Yard..."
              value={distAddress}
              onChange={(e) => setDistAddress(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#a81b1e] focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                State
              </label>
              <input
                type="text"
                value={distState}
                onChange={(e) => setDistState(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#a81b1e] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                Contact Phone
              </label>
              <input
                type="tel"
                placeholder="+91 98765 43210"
                value={distPhone}
                onChange={(e) => setDistPhone(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#a81b1e] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
              Assigned Sales Officer
            </label>
            {canPickSalesOfficer ? (
              <select
                required
                value={distSalesPersonId}
                onChange={(e) => setDistSalesPersonId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#a81b1e] focus:outline-none"
              >
                <option value="" disabled>Select Area Sales Manager</option>
                {salesOfficerOptions(editingDist?.sales_person_id).map((u) => (
                  <option key={u.emp_id} value={u.emp_id}>
                    {u.full_name} ({u.position || u.role}) - ID: {u.emp_id}
                  </option>
                ))}
              </select>
            ) : editingDist ? (
              <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-bold text-slate-900">
                {salesUsers.find((u) => String(u.emp_id) === String(editingDist.sales_person_id))?.full_name ||
                  (editingDist.sales_person_id ? `ID: ${editingDist.sales_person_id}` : 'Unassigned')}
              </div>
            ) : (
              <div className="p-2.5 rounded-lg border border-red-200 bg-red-50/70 text-xs font-bold text-slate-900 flex flex-wrap items-center justify-between gap-2">
                <span>{user?.full_name || user?.username} (ID: {user?.emp_id})</span>
                <span className="text-[10px] uppercase font-bold text-[#a81b1e] bg-white px-2 py-0.5 rounded border border-red-200">
                  {user?.position || 'Sales Officer'} (Auto-Assigned)
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={closeDistModal}
              className="px-3.5 py-2 sm:py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200 sm:border-transparent transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 sm:py-1.5 rounded-lg bg-[#a81b1e] text-xs font-bold text-white hover:bg-[#8e1518] transition cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Saving...' : editingDist ? 'Update Distributor' : 'Save Distributor'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ========================================================== */}
      {/* ADD DEALER MODAL                                           */}
      {/* ========================================================== */}
      <Modal
        isOpen={isAddDealerOpen}
        onClose={closeDealerModal}
        title={editingDealer ? `Edit Dealer — ${editingDealer.name}` : 'Register Retail Dealer'}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleCreateDealer} className="space-y-3.5">
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
              Parent Distributor Partner *
            </label>
            {isDistributor ? (
              <div className="p-2.5 rounded-lg border border-red-200 bg-red-50/70 text-xs font-bold text-slate-900 flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-slate-900 font-bold">
                  <Building2 className="w-4 h-4 text-[#a81b1e]" />
                  {currentDistributor?.name || user?.full_name} (ID: #{distributorId})
                </span>
                <span className="text-[10px] uppercase font-bold text-[#a81b1e] bg-white px-2 py-0.5 rounded border border-red-200">
                  Your Account
                </span>
              </div>
            ) : (
              <select
                required
                value={dealerDistId}
                onChange={(e) => setDealerDistId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#a81b1e] focus:outline-none"
              >
                {visibleDistributorsForDropdown.map((dist) => (
                  <option key={dist.id} value={dist.id}>
                    {dist.name} ({dist.state})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
              Dealer Name / Firm Name *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Ramesh Hardware & Building Materials"
              value={dealerName}
              onChange={(e) => setDealerName(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#a81b1e] focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                Area / Taluka
              </label>
              <input
                type="text"
                placeholder="e.g. MIDC Butibori"
                value={dealerAreaName}
                onChange={(e) => setDealerAreaName(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#a81b1e] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                Contact Phone
              </label>
              <input
                type="tel"
                placeholder="+91 99887 76655"
                value={dealerPhone}
                onChange={(e) => setDealerPhone(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#a81b1e] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
              Shop / Yard Address
            </label>
            <textarea
              rows={2}
              placeholder="Shop No. 4, Market Yard Road..."
              value={dealerAddress}
              onChange={(e) => setDealerAddress(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#a81b1e] focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                State
              </label>
              <input
                type="text"
                value={dealerState}
                onChange={(e) => setDealerState(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#a81b1e] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                Sales Officer
              </label>
              {editingDealer && !canPickSalesOfficer ? (
                <div className="p-2 rounded-lg border border-slate-200 bg-slate-50 text-xs font-bold text-slate-900">
                  {salesUsers.find((u) => String(u.emp_id) === String(editingDealer.sales_person_id))?.full_name ||
                    (editingDealer.sales_person_id ? `ID: ${editingDealer.sales_person_id}` : 'Unassigned')}
                </div>
              ) : isDistributor ? (
                <div className="p-2 rounded-lg border border-slate-200 bg-slate-50 text-xs font-bold text-slate-900 flex flex-wrap items-center justify-between gap-2">
                  <span>{assignedSalesPerson?.full_name || 'Assigned Officer'}</span>
                  <span className="text-[10px] font-bold text-slate-500 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                    Auto-Mapped
                  </span>
                </div>
              ) : isSalesRole ? (
                <div className="p-2 rounded-lg border border-red-200 bg-red-50/70 text-xs font-bold text-slate-900 flex flex-wrap items-center justify-between gap-2">
                  <span>{user?.full_name || user?.username} (ID: {user?.emp_id})</span>
                  <span className="text-[10px] uppercase font-bold text-[#a81b1e] bg-white px-1.5 py-0.5 rounded border border-red-200">
                    {user?.position || 'Sales Officer'}
                  </span>
                </div>
              ) : (
                <select
                  required
                  value={dealerSalesPersonId}
                  onChange={(e) => setDealerSalesPersonId(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#a81b1e] focus:outline-none"
                >
                  <option value="" disabled>Select Area Sales Manager</option>
                  {salesOfficerOptions(editingDealer?.sales_person_id).map((u) => (
                    <option key={u.emp_id} value={u.emp_id}>
                      {u.full_name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={closeDealerModal}
              className="px-3.5 py-2 sm:py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200 sm:border-transparent transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 sm:py-1.5 rounded-lg bg-[#a81b1e] text-xs font-bold text-white hover:bg-[#8e1518] transition cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Saving...' : editingDealer ? 'Update Dealer' : 'Save Dealer'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
