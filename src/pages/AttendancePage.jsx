import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { attendanceApi } from '../api/attendanceApi';
import { StatCard } from '../components/common/StatCard';
import { Modal } from '../components/common/Modal';
import { Pagination } from '../components/common/Pagination';
import {
  CalendarCheck,
  Clock,
  MapPin,
  CheckCircle2,
  LogOut,
  LogIn,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  Search,
  Navigation,
} from 'lucide-react';

// Dates are compared in IST (YYYY-MM-DD)
const istToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

// Removes repeated rows: paged reads can return a row twice when punches are added while loading
const uniqueById = (rows) => {
  const seen = new Set();
  return (rows || []).filter((r) => {
    const key = String(r.id);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const AttendancePage = () => {
  const { user, isSuperAdmin, isASM, isSalesPerson, canEdit } = useAuth();

  const [todayRecords, setTodayRecords] = useState([]);
  const [rangeRecords, setRangeRecords] = useState([]);
  const [salesPersonsList, setSalesPersonsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Tabs: 'today' (today's attendance) | 'all' (current month by default, or the chosen date range)
  const todayStr = istToday();
  const monthStartStr = `${todayStr.slice(0, 8)}01`;
  const [viewTab, setViewTab] = useState('today');

  // Filters
  const [selectedPerson, setSelectedPerson] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [fromDate, setFromDate] = useState(monthStartStr);
  const [toDate, setToDate] = useState(todayStr);
  const [searchTerm, setSearchTerm] = useState('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  // Mark Attendance Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [todayStatus, setTodayStatus] = useState({ lastStatus: null, isPunchedIn: false });
  const [punchType, setPunchType] = useState('IN');
  const [reason, setReason] = useState('');
  const [locating, setLocating] = useState(false);
  const [geoCoords, setGeoCoords] = useState({ lat: null, lng: null });
  const [address, setAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState(null);

  const userName = user?.full_name || user?.username || 'Sales Person';
  // Sales staff see and punch their own attendance; everyone else with access monitors all records
  const isAdminView = isSuperAdmin || !(isASM || isSalesPerson);
  const canPunch = !isAdminView && canEdit('attendance');

  // Load records
  const loadAttendance = async () => {
    setLoading(true);
    setError(null);
    try {
      const filters = {};
      // If user is sales person / ASM (and not Super Admin viewing all), filter by their name by default
      if (!isAdminView) {
        filters.salesPersonName = userName;
      } else if (selectedPerson !== 'all') {
        filters.salesPersonName = selectedPerson;
      }

      if (selectedStatus !== 'all') {
        filters.status = selectedStatus;
      }

      // A from-date after the to-date is swapped instead of returning nothing
      const [rangeFrom, rangeTo] = fromDate && toDate && fromDate > toDate ? [toDate, fromDate] : [fromDate, toDate];

      const [todayData, rangeData, persons] = await Promise.all([
        attendanceApi.getAttendance({ ...filters, date: istToday() }),
        attendanceApi.getAttendance({ ...filters, dateFrom: rangeFrom || undefined, dateTo: rangeTo || undefined }),
        isAdminView ? attendanceApi.getSalesPersonsList() : Promise.resolve([]),
      ]);

      setTodayRecords(uniqueById(todayData));
      setRangeRecords(uniqueById(rangeData));
      if (isAdminView && persons?.length > 0) {
        setSalesPersonsList([...new Set(persons)]);
      }

      // Check current user's punch status for today (only for sales staff marking attendance)
      if (!isAdminView) {
        const st = await attendanceApi.getTodayStatus(userName);
        setTodayStatus(st);
        // Auto-set punchType to opposite of current status
        setPunchType(st.isPunchedIn ? 'OUT' : 'IN');
      }
    } catch (err) {
      console.error('[AttendancePage] load error:', err);
      setError(err?.message || 'Failed to load attendance records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAttendance();
  }, [selectedPerson, selectedStatus, fromDate, toDate]);

  // Geolocation trigger when opening modal
  const handleOpenPunchModal = (type = null) => {
    if (!canPunch) return; // Only sales staff with edit access punch attendance
    const targetType = type || (todayStatus.isPunchedIn ? 'OUT' : 'IN');
    setPunchType(targetType);
    setReason('');
    setModalError(null);
    setIsModalOpen(true);

    // Fetch browser location
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      setLocating(true);
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const lat = position.coords.latitude.toFixed(7);
          const lng = position.coords.longitude.toFixed(7);
          setGeoCoords({ lat, lng });

          try {
            const res = await fetch(
              `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
              { headers: { 'Accept-Language': 'en' } }
            );
            const data = await res.json();
            if (data?.display_name) {
              setAddress(data.display_name);
            } else {
              setAddress(`${lat}, ${lng}`);
            }
          } catch {
            setAddress(`${lat}, ${lng}`);
          } finally {
            setLocating(false);
          }
        },
        (err) => {
          console.warn('Geolocation error:', err.message);
          setLocating(false);
          setAddress('Location unavailable');
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
      );
    }
  };

  // Submit attendance punch
  const handleSubmitPunch = async (e) => {
    e.preventDefault();
    if (!canPunch) {
      setModalError('Access Denied: You have view-only access to Attendance.');
      return;
    }
    setSubmitting(true);
    setModalError(null);

    try {
      await attendanceApi.markAttendance({
        status: punchType,
        sales_person_name: userName,
        latitude: geoCoords.lat,
        longitude: geoCoords.lng,
        address: address || null,
        reason: reason || null,
      });

      setIsModalOpen(false);
      await loadAttendance();
    } catch (err) {
      console.error('Submit punch error:', err);
      setModalError(err?.message || 'Failed to mark attendance.');
    } finally {
      setSubmitting(false);
    }
  };

  const records = viewTab === 'today' ? todayRecords : rangeRecords;

  // Filtered records by client-side search term
  const displayedRecords = useMemo(() => {
    if (!searchTerm.trim()) return records;
    const q = searchTerm.toLowerCase();
    return records.filter(
      (r) =>
        (r.sales_person_name || '').toLowerCase().includes(q) ||
        (r.address || '').toLowerCase().includes(q) ||
        (r.reason || '').toLowerCase().includes(q) ||
        (r.status || '').toLowerCase().includes(q)
    );
  }, [records, searchTerm]);

  // Reset to first page when search/filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [viewTab, selectedPerson, selectedStatus, fromDate, toDate, searchTerm]);

  // Paginated records for current view
  const paginatedRecords = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return displayedRecords.slice(start, start + pageSize);
  }, [displayedRecords, currentPage, pageSize]);

  // Quick stats (today, IST)
  const stats = useMemo(() => {
    const inCount = todayRecords.filter((r) => String(r.status).toUpperCase() === 'IN').length;
    return { totalToday: todayRecords.length, punchedIn: inCount };
  }, [todayRecords]);

  const isDefaultRange = fromDate === monthStartStr && toDate === todayStr;
  const fmtDay = (d) => {
    if (!d) return '';
    const [y, m, day] = d.split('-').map(Number);
    return new Date(y, m - 1, day).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };
  const rangeLabel = isDefaultRange ? 'This Month' : `${fmtDay(fromDate) || 'Start'} – ${fmtDay(toDate) || 'Today'}`;
  const hasFilters = selectedStatus !== 'all' || selectedPerson !== 'all' || Boolean(searchTerm) || !isDefaultRange;

    return (
    <div className="space-y-4 sm:space-y-5">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-red-50 text-[#a81b1e] flex items-center justify-center font-bold shrink-0">
            <CalendarCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">Attendance</h1>
              {!isAdminView && (
                todayStatus.isPunchedIn ? (
                  <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Punched IN
                  </span>
                ) : (
                  <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                    Punched OUT
                  </span>
                )
              )}
            </div>
            <p className="text-xs text-slate-500 font-medium">
              {isAdminView
                ? 'All sales manager & executive attendance records'
                : `Logged in: ${userName}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={() => loadAttendance()}
            title="Refresh attendance"
            className="p-2.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition cursor-pointer shrink-0"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#a81b1e]' : ''}`} />
          </button>

          {/* Punch Button for Sales Person / Sales Manager with Attendance edit access */}
          {canPunch && (
            <button
              onClick={() => handleOpenPunchModal()}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-bold text-white shadow-xs transition cursor-pointer ${todayStatus.isPunchedIn
                ? 'bg-amber-600 hover:bg-amber-700'
                : 'bg-[#a81b1e] hover:bg-[#8e1518]'
                }`}
            >
              {todayStatus.isPunchedIn ? (
                <>
                  <LogOut className="w-4 h-4" />
                  Punch OUT
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  Punch IN
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-red-200 bg-red-50 text-xs text-[#a81b1e]">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span><strong>Failed to load attendance:</strong> {error}</span>
          </div>
          <button
            onClick={() => loadAttendance()}
            className="flex items-center gap-1 px-3 py-1 rounded-lg bg-[#a81b1e] hover:bg-[#8e1518] text-white font-bold transition cursor-pointer shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <StatCard
          title="Today Punches"
          value={stats.totalToday}
          unit="Entries"
          icon={Clock}
          textColor="text-blue-600"
          iconBg="bg-blue-50 text-blue-600"
          isLoading={loading}
        />
        <StatCard
          title="Active (IN)"
          value={stats.punchedIn}
          unit="Staff"
          icon={CheckCircle2}
          textColor="text-emerald-600"
          iconBg="bg-emerald-50 text-emerald-600"
          isLoading={loading}
        />
      </div>

      {/* View Tabs with counters */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        {[
          { id: 'today', label: 'Today', count: todayRecords.length },
          { id: 'all', label: rangeLabel, count: rangeRecords.length },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setViewTab(t.id)}
            className={`inline-flex items-center px-3.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 transition cursor-pointer ${
              viewTab === t.id
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            {t.label}
            <span
              className={`ml-1.5 inline-flex min-w-[1.25rem] justify-center px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                viewTab === t.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {loading ? '–' : t.count}
            </span>
          </button>
        ))}
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2.5">
          {/* Search box */}
          <div className="relative flex-1 min-w-0 sm:min-w-[180px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search staff, location, note..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-slate-200 bg-white placeholder-slate-400 focus:outline-none focus:border-[#a81b1e]"
            />
          </div>

          <div className="grid grid-cols-2 sm:flex items-center gap-2">
            {/* Sales Person Filter (Admin only) */}
            {isAdminView && (
              <select
                value={selectedPerson}
                onChange={(e) => setSelectedPerson(e.target.value)}
                className="w-full sm:w-auto min-w-0 py-2 px-2.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-700 font-medium focus:outline-none focus:border-[#a81b1e] cursor-pointer"
              >
                <option value="all">All Employees</option>
                {salesPersonsList.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            )}

            {/* Status Filter */}
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full sm:w-auto min-w-0 py-2 px-2.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-700 font-medium focus:outline-none focus:border-[#a81b1e] cursor-pointer"
            >
              <option value="all">All Status</option>
              <option value="IN">IN (Active)</option>
              <option value="OUT">OUT</option>
            </select>

            {/* Date range (records of other dates show in the second tab) */}
            <div className="col-span-2 sm:col-span-1 grid grid-cols-2 sm:flex items-center gap-2">
              <label className="flex items-center gap-1.5 min-w-0 py-1 sm:py-0.5 px-2.5 rounded-lg border border-slate-200 bg-white">
                <span className="text-[10px] uppercase font-bold text-slate-400 shrink-0">From</span>
                <input
                  type="date"
                  value={fromDate}
                  max={toDate || todayStr}
                  onChange={(e) => {
                    setFromDate(e.target.value);
                    setViewTab('all');
                  }}
                  className="flex-1 min-w-0 py-1 text-xs bg-transparent text-slate-700 font-medium focus:outline-none cursor-pointer"
                />
              </label>
              <label className="flex items-center gap-1.5 min-w-0 py-1 sm:py-0.5 px-2.5 rounded-lg border border-slate-200 bg-white">
                <span className="text-[10px] uppercase font-bold text-slate-400 shrink-0">To</span>
                <input
                  type="date"
                  value={toDate}
                  min={fromDate || undefined}
                  max={todayStr}
                  onChange={(e) => {
                    setToDate(e.target.value);
                    setViewTab('all');
                  }}
                  className="flex-1 min-w-0 py-1 text-xs bg-transparent text-slate-700 font-medium focus:outline-none cursor-pointer"
                />
              </label>
            </div>
          </div>

          {hasFilters && (
            <button
              onClick={() => {
                setFromDate(monthStartStr);
                setToDate(todayStr);
                setSelectedStatus('all');
                setSelectedPerson('all');
                setSearchTerm('');
              }}
              className="text-xs text-[#a81b1e] hover:underline font-semibold cursor-pointer text-left sm:text-center pt-1 sm:pt-0"
            >
              Reset filters
            </button>
          )}
        </div>

        <div className="text-[11px] text-slate-500 font-medium border-t border-slate-100 pt-2 flex justify-between items-center">
          <span>
            Showing <strong>{paginatedRecords.length}</strong> of <strong>{displayedRecords.length}</strong> records &bull;{' '}
            {viewTab === 'today' ? `Today (${fmtDay(todayStr)})` : rangeLabel}
          </span>
          {searchTerm && <span className="text-slate-400 font-normal truncate max-w-[150px]">Filter: "{searchTerm}"</span>}
        </div>
      </div>

      {/* Responsive Attendance View */}
      {loading ? (
        <div className="space-y-3">
          {/* Mobile Loading Skeleton */}
          <div className="block md:hidden space-y-3">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} className="p-4 rounded-xl border border-slate-200 bg-white animate-pulse space-y-3">
                <div className="flex items-center justify-between">
                  <div className="h-4 w-32 bg-slate-200 rounded" />
                  <div className="h-5 w-16 bg-slate-200 rounded-full" />
                </div>
                <div className="h-3 w-48 bg-slate-100 rounded" />
                <div className="h-3 w-3/4 bg-slate-100 rounded" />
              </div>
            ))}
          </div>

          {/* Desktop Loading Skeleton */}
          <div className="hidden md:block overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-3 px-3.5">Date & Time</th>
                  <th className="py-3 px-3.5">Sales Person</th>
                  <th className="py-3 px-3.5 text-center">Status</th>
                  <th className="py-3 px-3.5">Address / Location</th>
                  <th className="py-3 px-3.5 text-center">Map</th>
                  <th className="py-3 px-3.5">Reason / Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {Array.from({ length: 5 }).map((_, idx) => (
                  <tr key={idx} className="animate-pulse">
                    <td className="py-3 px-3.5">
                      <div className="h-3.5 w-28 bg-slate-200 rounded mb-1" />
                      <div className="h-2.5 w-16 bg-slate-100 rounded" />
                    </td>
                    <td className="py-3 px-3.5"><div className="h-3.5 w-24 bg-slate-200 rounded" /></td>
                    <td className="py-3 px-3.5 text-center"><div className="h-5 w-12 bg-slate-200 rounded mx-auto" /></td>
                    <td className="py-3 px-3.5"><div className="h-3.5 w-48 bg-slate-200 rounded" /></td>
                    <td className="py-3 px-3.5 text-center"><div className="h-5 w-12 bg-slate-100 rounded mx-auto" /></td>
                    <td className="py-3 px-3.5"><div className="h-3 w-32 bg-slate-100 rounded" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : displayedRecords.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 sm:p-12 text-center text-slate-400 shadow-xs">
          <CalendarCheck className="w-10 h-10 mx-auto mb-2 text-slate-300" />
          <p className="font-semibold text-slate-600">
            {viewTab === 'today' ? 'No attendance marked today' : `No attendance entries for ${rangeLabel}`}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            {isAdminView ? 'Try clearing or adjusting your search filters' : 'Try clearing filters or punch new attendance'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Mobile Card List (Visible on screens < 768px) */}
          <div className="block md:hidden space-y-3">
            {paginatedRecords.map((item, idx) => {
              const isIn = String(item.status || '').toUpperCase() === 'IN';
              const rawDate = item.date_and_time || item.timestamp;
              let formattedDate = 'N/A';
              let formattedTime = '';
              if (rawDate) {
                try {
                  const d = new Date(rawDate);
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
                  formattedDate = String(rawDate).slice(0, 10);
                }
              }

              const mapUrl =
                item.map_link ||
                (item.latitude && item.longitude
                  ? `https://www.google.com/maps/search/?api=1&query=${item.latitude},${item.longitude}`
                  : null);

              return (
                <div
                  key={item.id ?? `row-${idx}`}
                  className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-2xs space-y-2.5 transition hover:border-slate-300"
                >
                  {/* Card Header: Person & Punch Status */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-red-50 text-[#a81b1e] font-extrabold text-xs flex items-center justify-center shrink-0 border border-red-100">
                        {(item.sales_person_name || 'U').charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900 text-xs sm:text-sm truncate">
                          {item.sales_person_name || 'Staff Member'}
                        </p>
                        <p className="text-[11px] text-slate-500 font-mono flex flex-wrap items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>{formattedDate}</span>
                          <span className="text-slate-300">&bull;</span>
                          <span>{formattedTime}</span>
                        </p>
                      </div>
                    </div>

                    {isIn ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        IN
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200 shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                        OUT
                      </span>
                    )}
                  </div>

                  {/* Location & Map */}
                  <div className="rounded-lg bg-slate-50 p-2.5 border border-slate-100 text-xs space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                        Location
                      </span>
                      {mapUrl && (
                        <a
                          href={mapUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-800"
                        >
                          View Map <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                    </div>
                    <p className="text-xs text-slate-700 leading-snug break-words">
                      {item.address || (item.latitude && item.longitude ? `${item.latitude}, ${item.longitude}` : 'No GPS address logged')}
                    </p>
                  </div>

                  {/* Reason / Remarks */}
                  {item.reason && (
                    <div className="text-[11px] text-slate-600 border-l-2 border-slate-200 pl-2">
                      <span className="font-semibold text-slate-500">Note: </span>
                      {item.reason}
                    </div>
                  )}
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
                    <th className="py-3 px-3.5">Sales Person</th>
                    <th className="py-3 px-3.5 text-center">Status</th>
                    <th className="py-3 px-3.5">Address / Location</th>
                    <th className="py-3 px-3.5 text-center">Map</th>
                    <th className="py-3 px-3.5">Reason / Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                  {paginatedRecords.map((item, idx) => {
                    const isIn = String(item.status || '').toUpperCase() === 'IN';
                    const rawDate = item.date_and_time || item.timestamp;
                    let formattedDate = 'N/A';
                    let formattedTime = '';
                    if (rawDate) {
                      try {
                        const d = new Date(rawDate);
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
                        formattedDate = String(rawDate).slice(0, 10);
                      }
                    }

                    const mapUrl =
                      item.map_link ||
                      (item.latitude && item.longitude
                        ? `https://www.google.com/maps/search/?api=1&query=${item.latitude},${item.longitude}`
                        : null);

                    return (
                      <tr key={item.id ?? `row-${idx}`} className="hover:bg-slate-50/70 transition">
                        <td className="py-3 px-3.5 whitespace-nowrap">
                          <div className="font-bold text-slate-900">{formattedDate}</div>
                          <div className="text-[11px] text-slate-500 font-mono flex items-center gap-1 mt-0.5">
                            <Clock className="w-3 h-3 text-slate-400" />
                            {formattedTime || 'N/A'}
                          </div>
                        </td>

                        <td className="py-3 px-3.5 whitespace-nowrap">
                          <div className="font-bold text-slate-900">{item.sales_person_name || 'N/A'}</div>
                        </td>

                        <td className="py-3 px-3.5 text-center whitespace-nowrap">
                          {isIn ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              IN
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                              OUT
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-3.5 max-w-xs">
                          <div className="truncate text-slate-700 text-xs" title={item.address || 'No address'}>
                            {item.address || (item.latitude && item.longitude ? `${item.latitude}, ${item.longitude}` : '—')}
                          </div>
                        </td>

                        <td className="py-3 px-3.5 text-center whitespace-nowrap">
                          {mapUrl ? (
                            <a
                              href={mapUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 text-[11px] font-semibold transition"
                              title="View GPS location on Google Maps"
                            >
                              <MapPin className="w-3 h-3 text-blue-600" />
                              Map
                              <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                            </a>
                          ) : (
                            <span className="text-slate-300 text-xs">—</span>
                          )}
                        </td>

                        <td className="py-3 px-3.5 max-w-xs text-slate-600">
                          <div className="truncate text-xs" title={item.reason || ''}>
                            {item.reason || '—'}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Row Pagination inside desktop card */}
            <Pagination
              currentPage={currentPage}
              totalItems={displayedRecords.length}
              pageSize={pageSize}
              onPageChange={(page) => setCurrentPage(page)}
              onPageSizeChange={(size) => setPageSize(size)}
              pageSizeOptions={[10, 15, 25, 50, 100]}
            />
          </div>

          {/* Row Pagination for mobile card view */}
          <div className="block md:hidden bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <Pagination
              currentPage={currentPage}
              totalItems={displayedRecords.length}
              pageSize={pageSize}
              onPageChange={(page) => setCurrentPage(page)}
              onPageSizeChange={(size) => setPageSize(size)}
              pageSizeOptions={[10, 15, 25, 50]}
            />
          </div>
        </div>
      )}

      {/* Mark Attendance Modal (Only accessible to sales staff) */}
      {canPunch && isModalOpen && (
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={`Mark Attendance: ${userName}`}
          maxWidth="max-w-md"
        >
          <form onSubmit={handleSubmitPunch} className="space-y-4">
            {modalError && (
              <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-xs text-[#a81b1e]">
                {modalError}
              </div>
            )}

            {/* Status Type Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Action Type
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPunchType('IN')}
                  className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-xs font-bold transition cursor-pointer ${punchType === 'IN'
                    ? 'bg-emerald-50 border-emerald-500 text-emerald-800 ring-2 ring-emerald-200'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                >
                  <LogIn className="w-4 h-4 text-emerald-600" />
                  Punch IN
                </button>
                <button
                  type="button"
                  onClick={() => setPunchType('OUT')}
                  className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-xs font-bold transition cursor-pointer ${punchType === 'OUT'
                    ? 'bg-amber-50 border-amber-500 text-amber-800 ring-2 ring-amber-200'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                >
                  <LogOut className="w-4 h-4 text-amber-600" />
                  Punch OUT
                </button>
              </div>
            </div>

            {/* GPS Location Info */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-1 text-slate-600 font-semibold">
                <span className="flex items-center gap-1.5">
                  <Navigation className={`w-3.5 h-3.5 text-[#a81b1e] ${locating ? 'animate-spin' : ''}`} />
                  GPS Location
                </span>
                {locating ? (
                  <span className="text-[11px] text-amber-600 animate-pulse">Detecting...</span>
                ) : geoCoords.lat ? (
                  <span className="text-[11px] text-emerald-700 font-mono">
                    {geoCoords.lat}, {geoCoords.lng}
                  </span>
                ) : (
                  <span className="text-[11px] text-slate-400">Offline</span>
                )}
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-500">Address / City</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Street, Area, City"
                  className="w-full mt-1 px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-[#a81b1e]"
                />
              </div>
            </div>

            {/* Optional Reason / Remarks */}
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                {punchType === 'OUT' ? 'Day Summary / Remarks (Optional)' : 'Remarks (Optional)'}
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={
                  punchType === 'OUT'
                    ? 'E.g. Completed dealer visits in Raipur sector'
                    : 'E.g. Starting morning field visits'
                }
                rows={2}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#a81b1e]"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className={`flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white shadow-xs transition cursor-pointer ${punchType === 'IN'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-amber-600 hover:bg-amber-700'
                  } disabled:opacity-50`}
              >
                {submitting ? 'Submitting...' : `Confirm Punch ${punchType}`}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
