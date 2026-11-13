import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { trackingHistoryApi } from '../api/trackingHistoryApi';
import { dealerApi } from '../api/dealerApi';
import { distributorApi } from '../api/distributorApi';
import { UpdateVisitModal } from '../components/salesVisits/UpdateVisitModal';
import { StatCard } from '../components/common/StatCard';
import { Modal } from '../components/common/Modal';
import { Pagination } from '../components/common/Pagination';
import {
  MapPin,
  Search,
  SlidersHorizontal,
  ChevronDown,
  Calendar,
  AlertTriangle,
  ExternalLink,
  Flame,
  CheckCircle2,
  Clock,
  Building2,
  ClipboardEdit,
} from 'lucide-react';

// Helper to get current month YYYY-MM in local time
const getCurrentMonth = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

// Helper to format YYYY-MM into human-readable e.g. "October 2026"
const formatMonthLabel = (monthStr) => {
  if (!monthStr) return 'All Months';
  try {
    const parts = monthStr.split('-').map(Number);
    if (parts.length === 2 && parts[0] && parts[1]) {
      const d = new Date(parts[0], parts[1] - 1, 1);
      return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    }
    return monthStr;
  } catch {
    return monthStr;
  }
};

export const SalesVisitsPage = () => {
  const { user, isSuperAdmin, isASM, isSalesPerson, canEdit } = useAuth();

  const currentMonthStr = useMemo(() => getCurrentMonth(), []);

  const [visits, setVisits] = useState([]);
  const [salesPersonsList, setSalesPersonsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPerson, setSelectedPerson] = useState('all');
  const [selectedStage, setSelectedStage] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all'); // Hot, Warm, Cold
  const [selectedCategory, setSelectedCategory] = useState('all'); // Dealer, Distributor, Site/Engineer
  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr); // Defaults to current month
  const [selectedDate, setSelectedDate] = useState('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  // Mobile: filters are collapsed behind one "Filters" button
  const [showFilters, setShowFilters] = useState(false);

  // Visit detail modal
  const [selectedVisit, setSelectedVisit] = useState(null);

  // Update Visit (Area Sales Managers): their assigned distributors and dealers
  const [isUpdateOpen, setIsUpdateOpen] = useState(false);
  const [assignedDistributors, setAssignedDistributors] = useState([]);
  const [assignedDealers, setAssignedDealers] = useState([]);

  const userName = user?.full_name || user?.username || 'Sales Person';
  // Sales staff see their own visits; everyone else with access sees all visits
  const isAdminView = isSuperAdmin || !(isASM || isSalesPerson);

  // Load visits
  const loadVisits = async () => {
    setLoading(true);
    setError(null);
    try {
      const filters = {};
      if (!isAdminView) {
        filters.salesPersonName = userName;
      } else if (selectedPerson !== 'all') {
        filters.salesPersonName = selectedPerson;
      }

      if (selectedStage !== 'all') filters.stage = selectedStage;
      if (selectedStatus !== 'all') filters.status = selectedStatus;
      if (selectedCategory !== 'all') filters.selectValue = selectedCategory;
      if (selectedDate) {
        filters.date = selectedDate;
      } else if (selectedMonth && selectedMonth !== 'all') {
        filters.month = selectedMonth;
      }

      const [data, persons] = await Promise.all([
        trackingHistoryApi.getVisits(filters),
        isAdminView ? trackingHistoryApi.getSalesPersonsList() : Promise.resolve([]),
      ]);

      // Drop repeated rows (paged reads can return a row twice if visits are added while loading)
      const seen = new Set();
      setVisits(
        (data || []).filter((v) => {
          const key = String(v.id);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
      );
      if (isAdminView && persons?.length > 0) setSalesPersonsList([...new Set(persons)]);
    } catch (err) {
      console.error('[SalesVisitsPage] load error:', err);
      setError(err?.message || 'Failed to load sales visits.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVisits();
  }, [selectedPerson, selectedStage, selectedStatus, selectedCategory, selectedMonth, selectedDate]);

  // Area Sales Managers with Sales Visits edit access update visits for the distributors
  // assigned to them (distributor.sales_person_id) and the dealers assigned to them directly
  // (dealer.sales_person_id) or through one of those distributors (dealer.distributor_id).
  const canUpdateVisits = isASM && !isSuperAdmin && canEdit('sales-visits') && Boolean(user?.emp_id);

  useEffect(() => {
    if (!canUpdateVisits) {
      setAssignedDistributors([]);
      setAssignedDealers([]);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const myId = String(user.emp_id);
        const [allDistributors, allDealers] = await Promise.all([
          distributorApi.getDistributors(),
          dealerApi.getDealers(),
        ]);
        if (cancelled) return;
        const myDistributors = (allDistributors || []).filter((d) => String(d.sales_person_id) === myId);
        const myDistributorIds = new Set(myDistributors.map((d) => String(d.id)));
        const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''));
        setAssignedDistributors([...myDistributors].sort(byName));
        setAssignedDealers(
          (allDealers || [])
            .filter((d) => String(d.sales_person_id) === myId || myDistributorIds.has(String(d.distributor_id)))
            .sort(byName)
        );
      } catch (err) {
        console.error('[SalesVisitsPage] assigned parties load error:', err);
        if (!cancelled) {
          setAssignedDistributors([]);
          setAssignedDealers([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canUpdateVisits, user?.emp_id]);

  const showUpdateVisit = canUpdateVisits && (assignedDealers.length > 0 || assignedDistributors.length > 0);

  // Client-side search filter
  const displayedVisits = useMemo(() => {
    if (!searchTerm.trim()) return visits;
    const q = searchTerm.toLowerCase();
    return visits.filter(
      (v) =>
        (v.deler_distributer_site_name || '').toLowerCase().includes(q) ||
        (v.area_name || '').toLowerCase().includes(q) ||
        (v.sales_person_name || '').toLowerCase().includes(q) ||
        (v.dealer_code || '').toLowerCase().includes(q) ||
        (v.what_did_customer_says || '').toLowerCase().includes(q) ||
        (v.next_action || '').toLowerCase().includes(q)
    );
  }, [visits, searchTerm]);

  // Filters set away from their defaults (shown on the mobile Filters button)
  const activeFilterCount =
    (selectedPerson !== 'all' ? 1 : 0) +
    (selectedCategory !== 'all' ? 1 : 0) +
    (selectedStage !== 'all' ? 1 : 0) +
    (selectedStatus !== 'all' ? 1 : 0) +
    (selectedMonth !== currentMonthStr ? 1 : 0) +
    (selectedDate ? 1 : 0);

  // Reset to first page when search/filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedPerson, selectedStage, selectedStatus, selectedCategory, selectedMonth, selectedDate, searchTerm]);

  // Paginated visits for current view
  const paginatedVisits = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return displayedVisits.slice(start, start + pageSize);
  }, [displayedVisits, currentPage, pageSize]);

  // Quick stats
  const stats = useMemo(() => {
    const hotCount = visits.filter((v) => (v.status || '').toLowerCase() === 'hot').length;
    const orderCount = visits.filter((v) => (v.stage || '').toLowerCase().includes('order received')).length;
    const followUps = visits.filter((v) => Boolean(v.next_date_of_call)).length;

    return {
      total: visits.length,
      hot: hotCount,
      orders: orderCount,
      followUps,
    };
  }, [visits]);

  return (
    <div className="space-y-5">
      {/* Header Bar */}
      <div className="flex items-start sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-xl border border-slate-200/80 shadow-xs">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">Sales Visits</h1>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
              {displayedVisits.length} Visits
            </span>
            {selectedMonth ? (
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-red-50 text-[#a81b1e] border border-red-200">
                {selectedMonth === currentMonthStr ? 'Current Month: ' : ''}
                {formatMonthLabel(selectedMonth)}
              </span>
            ) : (
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                All Months
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            {isAdminView ? 'Consolidated client visit logs & follow-up tracking' : `Logged in: ${userName}`}
          </p>
        </div>

        {showUpdateVisit && (
          <button
            onClick={() => setIsUpdateOpen(true)}
            className="shrink-0 flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg bg-[#a81b1e] hover:bg-[#8e1518] text-xs font-bold text-white shadow-xs transition cursor-pointer whitespace-nowrap"
          >
            <ClipboardEdit className="w-4 h-4" />
            Update Visit
          </button>
        )}
      </div>

      {/* Error Alert */}
      {error && (
        <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-red-200 bg-red-50 text-xs text-[#a81b1e]">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span><strong>Failed to load visits:</strong> {error}</span>
          </div>
          <button
            onClick={() => loadVisits()}
            className="flex items-center gap-1 px-3 py-1 rounded-lg bg-[#a81b1e] hover:bg-[#8e1518] text-white font-bold transition cursor-pointer shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {/* Stat Cards - 2x2 grid on mobile, 4 columns on large screens */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          title="Total Visits"
          value={stats.total}
          unit="Visits"
          icon={Building2}
          textColor="text-blue-600"
          iconBg="bg-blue-50 text-blue-600"
          isLoading={loading}
        />
        <StatCard
          title="Hot Deals"
          value={stats.hot}
          unit="Hot"
          icon={Flame}
          textColor="text-rose-600"
          iconBg="bg-rose-50 text-rose-600"
          isLoading={loading}
        />
        <StatCard
          title="Orders Received"
          value={stats.orders}
          unit="Orders"
          icon={CheckCircle2}
          textColor="text-emerald-600"
          iconBg="bg-emerald-50 text-emerald-600"
          isLoading={loading}
        />
        <StatCard
          title="Follow-ups Due"
          value={stats.followUps}
          unit="Leads"
          icon={Clock}
          textColor="text-amber-600"
          iconBg="bg-amber-50 text-amber-600"
          isLoading={loading}
        />
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2 flex-1 min-w-0 sm:min-w-[180px]">
            {/* Search */}
            <div className="relative flex-1 min-w-0">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search party, area, code..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-slate-200 bg-white placeholder-slate-400 focus:outline-none focus:border-[#a81b1e]"
              />
            </div>

            {/* Mobile: one button opens all filters */}
            <button
              type="button"
              onClick={() => setShowFilters((v) => !v)}
              aria-expanded={showFilters}
              className={`sm:hidden shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-bold transition cursor-pointer ${showFilters || activeFilterCount > 0
                ? 'border-[#a81b1e] bg-red-50 text-[#a81b1e]'
                : 'border-slate-200 bg-white text-slate-700'
                }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Filters
              {activeFilterCount > 0 && (
                <span className="inline-flex min-w-[1.1rem] justify-center px-1 rounded-full bg-[#a81b1e] text-white text-[10px]">
                  {activeFilterCount}
                </span>
              )}
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
            </button>
          </div>

          <div className={`${showFilters ? 'grid' : 'hidden'} grid-cols-2 sm:flex sm:flex-wrap items-center gap-2`}>
            {/* Sales Person Filter (Admin only) */}
            {isAdminView && (
              <select
                value={selectedPerson}
                onChange={(e) => setSelectedPerson(e.target.value)}
                className="col-span-2 sm:col-span-1 w-full sm:w-auto min-w-0 py-2 px-2.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-700 font-medium focus:outline-none focus:border-[#a81b1e] cursor-pointer"
              >
                <option value="all">All Sales Staff</option>
                {salesPersonsList.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            )}

            {/* Category Filter */}
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full sm:w-auto min-w-0 py-2 px-2.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-700 font-medium focus:outline-none focus:border-[#a81b1e] cursor-pointer"
            >
              <option value="all">All Categories</option>
              <option value="Dealer">Dealer</option>
              <option value="Distributor">Distributor</option>
              <option value="Site/Engineer">Site / Engineer</option>
            </select>

            {/* Stage Filter */}
            <select
              value={selectedStage}
              onChange={(e) => setSelectedStage(e.target.value)}
              className="w-full sm:w-auto min-w-0 py-2 px-2.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-700 font-medium focus:outline-none focus:border-[#a81b1e] cursor-pointer"
            >
              <option value="all">All Stages</option>
              <option value="Follow-Up">Follow-Up</option>
              <option value="Order Received">Order Received</option>
              <option value="Not Interested">Not Interested</option>
            </select>

            {/* Priority Status Filter */}
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full sm:w-auto min-w-0 py-2 px-2.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-700 font-medium focus:outline-none focus:border-[#a81b1e] cursor-pointer"
            >
              <option value="all">All Priorities</option>
              <option value="Hot">Hot</option>
              <option value="Warm">Warm</option>
              <option value="Cold">Cold</option>
            </select>

            {/* Monthly Filter */}
            <div className="col-span-2 sm:col-span-1 flex items-center gap-1.5 py-1.5 sm:py-1 px-2.5 rounded-lg border border-slate-200 bg-white text-slate-700 shadow-2xs min-w-0">
              <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="text-[10px] uppercase font-bold text-slate-400 hidden sm:inline">Month:</span>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => {
                  setSelectedMonth(e.target.value);
                  setSelectedDate('');
                }}
                className="flex-1 min-w-0 text-xs bg-transparent text-slate-700 font-semibold focus:outline-none cursor-pointer"
                title="Filter visits by Month (by default shows current month)"
              />
              {selectedMonth && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedMonth('');
                    setSelectedDate('');
                  }}
                  title="Clear month (View All Months)"
                  className="text-slate-400 hover:text-slate-700 text-xs font-bold transition px-0.5 cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Date Picker (Specific Day) */}
            <div className="col-span-2 sm:col-span-1 flex items-center gap-1 py-1.5 sm:py-1 px-2.5 rounded-lg border border-slate-200 bg-white text-slate-700 shadow-2xs min-w-0">
              <span className="text-[10px] uppercase font-bold text-slate-400">Day:</span>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedDate(val);
                  if (val) {
                    setSelectedMonth(val.slice(0, 7));
                  }
                }}
                className="flex-1 min-w-0 text-xs bg-transparent text-slate-700 font-medium focus:outline-none cursor-pointer"
                title="Filter by Specific Day"
              />
              {selectedDate && (
                <button
                  type="button"
                  onClick={() => setSelectedDate('')}
                  title="Clear day filter"
                  className="text-slate-400 hover:text-slate-700 text-xs font-bold transition px-0.5 cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {(selectedCategory !== 'all' ||
            selectedStage !== 'all' ||
            selectedStatus !== 'all' ||
            selectedPerson !== 'all' ||
            selectedMonth !== currentMonthStr ||
            selectedDate ||
            searchTerm) && (
              <button
                onClick={() => {
                  setSelectedCategory('all');
                  setSelectedStage('all');
                  setSelectedStatus('all');
                  setSelectedPerson('all');
                  setSelectedMonth(currentMonthStr);
                  setSelectedDate('');
                  setSearchTerm('');
                }}
                className="text-xs text-[#a81b1e] hover:underline font-semibold cursor-pointer text-left sm:text-center pt-1 sm:pt-0"
              >
                Reset filters
              </button>
            )}
        </div>

        <div className="text-[11px] text-slate-500 font-medium border-t border-slate-100 pt-2 flex flex-wrap justify-between items-center gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span>
              Showing <strong>{paginatedVisits.length}</strong> of <strong>{displayedVisits.length}</strong> visits
            </span>
            {selectedMonth ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-[#a81b1e] border border-red-200">
                <Calendar className="w-3 h-3" />
                {selectedMonth === currentMonthStr ? 'Current Month: ' : ''}
                {formatMonthLabel(selectedMonth)}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                All Months
              </span>
            )}
            {selectedDate && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                Day: {selectedDate}
              </span>
            )}
            {selectedMonth !== currentMonthStr && (
              <button
                type="button"
                onClick={() => {
                  setSelectedMonth(currentMonthStr);
                  setSelectedDate('');
                }}
                className="text-[11px] text-[#a81b1e] hover:underline font-bold cursor-pointer"
              >
                Go to Current Month
              </button>
            )}
          </div>
          {searchTerm && <span className="text-slate-400 font-normal truncate max-w-[150px]">Filter: "{searchTerm}"</span>}
        </div>
      </div>

      {/* Responsive Visits View */}
      {loading ? (
        <div className="space-y-3">
          {/* Mobile Loading Skeleton */}
          <div className="block md:hidden space-y-3">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} className="p-4 rounded-xl border border-slate-200 bg-white animate-pulse space-y-3">
                <div className="flex items-center justify-between">
                  <div className="h-4 w-36 bg-slate-200 rounded" />
                  <div className="h-5 w-16 bg-slate-200 rounded-full" />
                </div>
                <div className="h-3 w-48 bg-slate-100 rounded" />
                <div className="h-8 w-full bg-slate-50 rounded" />
              </div>
            ))}
          </div>

          {/* Desktop Loading Skeleton */}
          <div className="hidden md:block overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-3 px-3.5">Date & Time</th>
                  <th className="py-3 px-3.5">Client / Site Name</th>
                  <th className="py-3 px-3.5">Area / City</th>
                  {isAdminView && <th className="py-3 px-3.5">Sales Person</th>}
                  <th className="py-3 px-3.5 text-center">Stage</th>
                  <th className="py-3 px-3.5 text-center">Priority</th>
                  <th className="py-3 px-3.5">Next Action</th>
                  <th className="py-3 px-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {Array.from({ length: 5 }).map((_, idx) => (
                  <tr key={idx} className="animate-pulse">
                    <td className="py-3 px-3.5"><div className="h-3.5 w-24 bg-slate-200 rounded mb-1" /></td>
                    <td className="py-3 px-3.5"><div className="h-3.5 w-32 bg-slate-200 rounded" /></td>
                    <td className="py-3 px-3.5"><div className="h-3.5 w-24 bg-slate-100 rounded" /></td>
                    {isAdminView && <td className="py-3 px-3.5"><div className="h-3.5 w-20 bg-slate-200 rounded" /></td>}
                    <td className="py-3 px-3.5 text-center"><div className="h-5 w-16 bg-slate-200 rounded mx-auto" /></td>
                    <td className="py-3 px-3.5 text-center"><div className="h-5 w-12 bg-slate-200 rounded mx-auto" /></td>
                    <td className="py-3 px-3.5"><div className="h-3.5 w-24 bg-slate-100 rounded" /></td>
                    <td className="py-3 px-3.5 text-right"><div className="h-6 w-12 bg-slate-200 rounded ml-auto" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : displayedVisits.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 sm:p-12 text-center text-slate-400 shadow-xs">
          <MapPin className="w-10 h-10 mx-auto mb-2 text-slate-300" />
          <p className="font-semibold text-slate-600">
            {selectedDate
              ? `No sales visits recorded for ${selectedDate}`
              : selectedMonth
                ? `No sales visits recorded for ${formatMonthLabel(selectedMonth)}`
                : 'No sales visits recorded'}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {selectedMonth && selectedMonth !== currentMonthStr ? (
              <button
                type="button"
                onClick={() => {
                  setSelectedMonth(currentMonthStr);
                  setSelectedDate('');
                }}
                className="text-[#a81b1e] hover:underline font-semibold cursor-pointer"
              >
                Switch to current month ({formatMonthLabel(currentMonthStr)})
              </button>
            ) : (
              'Visits logged by the sales team will appear here'
            )}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Mobile Card List (Visible on screens < 768px) */}
          <div className="block md:hidden space-y-3">
            {paginatedVisits.map((item) => {
              let formattedDate = 'N/A';
              let formattedTime = '';
              if (item.created_at) {
                try {
                  const d = new Date(item.created_at);
                  formattedDate = d.toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  });
                  formattedTime = d.toLocaleTimeString('en-IN', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true,
                  });
                } catch {
                  formattedDate = String(item.created_at).slice(0, 10);
                }
              }

              const stageLower = (item.stage || '').toLowerCase();
              const isOrderRecv = stageLower.includes('order received');
              const isPayment = stageLower.includes('payment');

              const prioLower = (item.status || '').toLowerCase();
              const isHot = prioLower === 'hot';
              const isWarm = prioLower === 'warm';

              return (
                <div
                  key={item.id}
                  className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-2xs space-y-3 transition hover:border-slate-300"
                >
                  {/* Card Header: Client Name & Priority */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-slate-900 text-sm leading-snug truncate">
                        {item.deler_distributer_site_name || 'Unnamed Client'}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        {item.select_value && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                            {item.select_value}
                          </span>
                        )}
                        {item.dealer_code && (
                          <span className="text-[10px] font-mono text-slate-400">
                            {item.dealer_code}
                          </span>
                        )}
                        <span className="text-[11px] text-slate-400 font-mono">
                          {formattedDate} {formattedTime ? `• ${formattedTime}` : ''}
                        </span>
                      </div>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold shrink-0 ${isHot
                        ? 'bg-rose-50 text-rose-700 border border-rose-200'
                        : isWarm
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}
                    >
                      {isHot && <Flame className="w-3 h-3 text-rose-600" />}
                      {item.status || 'Hot'}
                    </span>
                  </div>

                  {/* Badges & Location row */}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-1 border-t border-slate-100">
                    <div className="flex items-center gap-1.5 text-slate-600 min-w-0 flex-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{item.area_name || 'No Area Specified'}</span>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold shrink-0 ${isOrderRecv
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : isPayment
                          ? 'bg-purple-50 text-purple-800 border border-purple-200'
                          : 'bg-blue-50 text-blue-800 border border-blue-200'
                        }`}
                    >
                      {item.stage || 'Follow-Up'}
                    </span>
                  </div>

                  {/* Staff Info (if Admin view) */}
                  {isAdminView && item.sales_person_name && (
                    <div className="text-[11px] text-slate-500 font-medium">
                      Staff: <strong className="text-slate-800">{item.sales_person_name}</strong>
                    </div>
                  )}

                  {/* Discussion Snippet */}
                  {item.what_did_customer_says && (
                    <div className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100 line-clamp-2">
                      <span className="font-semibold text-slate-700">Notes: </span>
                      {item.what_did_customer_says}
                    </div>
                  )}

                  {/* Next Action & View Button */}
                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
                    <div className="text-[11px] min-w-0">
                      {item.next_action && (
                        <p className="font-semibold text-slate-800 truncate">
                          Next: {item.next_action}
                        </p>
                      )}
                      {item.next_date_of_call && (
                        <p className="text-slate-400 font-mono">
                          Due: {item.next_date_of_call}
                        </p>
                      )}
                    </div>

                    <button
                      onClick={() => setSelectedVisit(item)}
                      className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs transition cursor-pointer shrink-0"
                    >
                      View Details
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Table (Hidden on screens < 768px) */}
          <div className="hidden md:block overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-3.5">Date & Time</th>
                    <th className="py-3 px-3.5">Client / Site Name</th>
                    <th className="py-3 px-3.5">Area / City</th>
                    {isAdminView && <th className="py-3 px-3.5">Sales Person</th>}
                    <th className="py-3 px-3.5 text-center">Stage</th>
                    <th className="py-3 px-3.5 text-center">Priority</th>
                    <th className="py-3 px-3.5">Next Action</th>
                    <th className="py-3 px-3.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                  {paginatedVisits.map((item) => {
                    let formattedDate = 'N/A';
                    let formattedTime = '';
                    if (item.created_at) {
                      try {
                        const d = new Date(item.created_at);
                        formattedDate = d.toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        });
                        formattedTime = d.toLocaleTimeString('en-IN', {
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: true,
                        });
                      } catch {
                        formattedDate = String(item.created_at).slice(0, 10);
                      }
                    }

                    const stageLower = (item.stage || '').toLowerCase();
                    const isOrderRecv = stageLower.includes('order received');
                    const isPayment = stageLower.includes('payment');

                    const prioLower = (item.status || '').toLowerCase();
                    const isHot = prioLower === 'hot';
                    const isWarm = prioLower === 'warm';

                    return (
                      <tr key={item.id} className="hover:bg-slate-50/70 transition">
                        <td className="py-3 px-3.5 whitespace-nowrap">
                          <div className="font-bold text-slate-900">{formattedDate}</div>
                          <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                            {formattedTime}
                          </div>
                        </td>

                        <td className="py-3 px-3.5">
                          <div className="font-bold text-slate-900 leading-tight">
                            {item.deler_distributer_site_name || 'Unnamed Client'}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {item.select_value && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                                {item.select_value}
                              </span>
                            )}
                            {item.dealer_code && (
                              <span className="text-[10px] font-mono text-slate-400">
                                {item.dealer_code}
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-3.5 max-w-[160px]">
                          <div className="truncate text-slate-700 text-xs" title={item.area_name || ''}>
                            {item.area_name || '—'}
                          </div>
                        </td>

                        {isAdminView && (
                          <td className="py-3 px-3.5 whitespace-nowrap">
                            <div className="font-semibold text-slate-800">
                              {item.sales_person_name || 'N/A'}
                            </div>
                          </td>
                        )}

                        <td className="py-3 px-3.5 text-center whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${isOrderRecv
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : isPayment
                                ? 'bg-purple-50 text-purple-800 border border-purple-200'
                                : 'bg-blue-50 text-blue-800 border border-blue-200'
                              }`}
                          >
                            {item.stage || 'Follow-Up'}
                          </span>
                        </td>

                        <td className="py-3 px-3.5 text-center whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold ${isHot
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : isWarm
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-slate-100 text-slate-600 border border-slate-200'
                              }`}
                          >
                            {isHot && <Flame className="w-3 h-3 text-rose-600" />}
                            {item.status || 'Hot'}
                          </span>
                        </td>

                        <td className="py-3 px-3.5 max-w-[180px]">
                          <div className="truncate text-slate-900 font-medium" title={item.next_action || ''}>
                            {item.next_action || '—'}
                          </div>
                          {item.next_date_of_call && (
                            <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                              Due: {item.next_date_of_call}
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-3.5 text-right whitespace-nowrap">
                          <button
                            onClick={() => setSelectedVisit(item)}
                            className="px-2.5 py-1 rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-semibold transition cursor-pointer"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Desktop pagination */}
            <Pagination
              currentPage={currentPage}
              totalItems={displayedVisits.length}
              pageSize={pageSize}
              onPageChange={(page) => setCurrentPage(page)}
              onPageSizeChange={(size) => setPageSize(size)}
              pageSizeOptions={[10, 15, 25, 50, 100]}
            />
          </div>

          {/* Mobile pagination */}
          <div className="block md:hidden bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <Pagination
              currentPage={currentPage}
              totalItems={displayedVisits.length}
              pageSize={pageSize}
              onPageChange={(page) => setCurrentPage(page)}
              onPageSizeChange={(size) => setPageSize(size)}
              pageSizeOptions={[10, 15, 25, 50]}
            />
          </div>
        </div>
      )}

      {/* Update Visit Modal (Area Sales Managers) */}
      {showUpdateVisit && (
        <UpdateVisitModal
          isOpen={isUpdateOpen}
          onClose={() => setIsUpdateOpen(false)}
          onSaved={() => loadVisits()}
          userName={userName}
          userId={user?.emp_id}
          dealers={assignedDealers}
          distributors={assignedDistributors}
        />
      )}

      {/* View Visit Detail Modal */}
      {selectedVisit && (
        <Modal
          isOpen={Boolean(selectedVisit)}
          onClose={() => setSelectedVisit(null)}
          title={`Visit Record #${selectedVisit.id}: ${selectedVisit.deler_distributer_site_name || 'Client'}`}
          maxWidth="max-w-lg"
        >
          <div className="space-y-4 text-xs">
            {/* Top Info Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-500">Party / Site</span>
                <p className="font-bold text-slate-900 text-sm mt-0.5">
                  {selectedVisit.deler_distributer_site_name || 'N/A'}
                </p>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="px-2 py-0.5 rounded bg-white text-slate-700 border border-slate-200 text-[10px] font-semibold">
                    {selectedVisit.select_value || 'Dealer'}
                  </span>
                  {selectedVisit.dealer_code && (
                    <span className="font-mono text-slate-500 text-[10px]">
                      {selectedVisit.dealer_code}
                    </span>
                  )}
                </div>
              </div>

              <div>
                <span className="text-[10px] font-bold uppercase text-slate-500">Sales Person</span>
                <p className="font-bold text-slate-900 text-sm mt-0.5">
                  {selectedVisit.sales_person_name || 'N/A'}
                </p>
                <p className="text-[11px] text-slate-500 mt-1 font-mono">
                  {selectedVisit.created_at ? new Date(selectedVisit.created_at).toLocaleString('en-IN') : 'N/A'}
                </p>
              </div>
            </div>

            {/* Stage & Priority */}
            <div className="grid grid-cols-3 gap-2 p-3 rounded-xl border border-slate-200">
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-500">Stage</span>
                <p className="font-bold text-slate-900 text-xs mt-0.5">{selectedVisit.stage || 'Follow-Up'}</p>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-500">Priority</span>
                <p className="font-bold text-rose-700 text-xs mt-0.5">{selectedVisit.status || 'Hot'}</p>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-500">Area</span>
                <p className="font-medium text-slate-700 text-xs mt-0.5 break-words">{selectedVisit.area_name || 'N/A'}</p>
              </div>
            </div>

            {/* Feedback / Discussion */}
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase text-slate-500">Customer Feedback & Discussion</span>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 leading-relaxed">
                {selectedVisit.what_did_customer_says || 'No feedback notes recorded.'}
              </div>
            </div>

            {/* Next Action & Follow up */}
            <div className="grid grid-cols-2 gap-3 p-3 rounded-xl border border-slate-200 bg-amber-50/50">
              <div>
                <span className="text-[10px] font-bold uppercase text-amber-800">Next Action</span>
                <p className="font-bold text-slate-900 mt-0.5">{selectedVisit.next_action || '—'}</p>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase text-amber-800">Next Follow-Up Date</span>
                <p className="font-bold text-slate-900 mt-0.5 font-mono">
                  {selectedVisit.next_date_of_call || '—'}
                </p>
              </div>
            </div>

            {/* Order Details (if any) */}
            {(selectedVisit.order_qty || selectedVisit.value_of_order) && (
              <div className="grid grid-cols-3 gap-2 p-3 rounded-xl border border-emerald-200 bg-emerald-50/50">
                <div>
                  <span className="text-[10px] font-bold uppercase text-emerald-800">Booked Qty</span>
                  <p className="font-bold text-slate-900">{selectedVisit.order_qty} MT</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-emerald-800">Products</span>
                  <p className="font-bold text-slate-900 truncate">{selectedVisit.order_products || '—'}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-emerald-800">Value (₹)</span>
                  <p className="font-bold text-slate-900">₹{selectedVisit.value_of_order || '0'}</p>
                </div>
              </div>
            )}

            {/* GPS Location Link */}
            {selectedVisit.latitude && selectedVisit.longitude && (
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl border border-slate-200 bg-slate-50">
                <div className="flex items-center gap-2 min-w-0">
                  <MapPin className="w-4 h-4 text-[#a81b1e]" />
                  <span className="font-mono text-slate-700 break-all">
                    {selectedVisit.latitude}, {selectedVisit.longitude}
                  </span>
                </div>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${selectedVisit.latitude},${selectedVisit.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-bold transition"
                >
                  Open in Maps
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
};
