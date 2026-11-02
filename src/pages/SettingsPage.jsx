import React, { useState, useEffect } from 'react';
import { usersApi } from '../api/usersApi';
import { firmsApi } from '../api/firmsApi';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { Modal } from '../components/common/Modal';
import { Pagination } from '../components/common/Pagination';
import { evaluateUserFirmAccess } from '../data/constants';
import { isSuperAdminUser } from '../data/pageAccess';
import {
  UserAccessEditor,
  EMPTY_ACCESS,
  accessFromUser,
  accessUpdates,
  accessSummary,
} from '../components/settings/UserAccessEditor';

// Distributor accounts link to their own distributor firm through firm_id.
// For everyone else firm_id holds their firm access (one or more firms), set in the Access section of the modal.
const isDistributorPosition = (pos) => String(pos || '').toLowerCase().includes('distributor');

// Readable message for database errors while saving a user
const saveErrorMessage = (err) => {
  if (err?.code === '22P02') return 'firm_id is still a number column. Change it to text to save multiple firms.';
  if (err?.code === '23503') return 'firm_id still has a foreign key to the firms table. Remove it to save these firms.';
  return err?.message || 'Unknown error';
};
import {
  Users,
  UserPlus,
  Building2,
  Search,
  ShieldCheck,
  ShieldAlert,
  Shield,
  CheckCircle,
  XCircle,
  Pencil,
  KeyRound,
} from 'lucide-react';

export const SettingsPage = ({ initialTab = 'users', onTabChange }) => {
  const { showToast } = useApp();
  const { user: currentUser, isSuperAdmin, firms: firmRows, firmCatalog } = useAuth();

  // Active sub-tab: 'users' (firms moved to their own Firms page)
  const [activeTab, setActiveTab] = useState(initialTab);

  // Follow the URL (/settings/users) incl. browser back / forward
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const selectTab = (tab) => {
    setActiveTab(tab);
    if (onTabChange) onTabChange(tab);
  };

  // Users state
  const [users, setUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  // Firms state
  const [firms, setFirms] = useState([]);

  // Modals state
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [isEditUserOpen, setIsEditUserOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  // Form states - Add User
  const [empId, setEmpId] = useState('');
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [department, setDepartment] = useState('Operations');
  const [role, setRole] = useState('user');
  const [position, setPosition] = useState('Manager');
  const [firmId, setFirmId] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [addAccess, setAddAccess] = useState(EMPTY_ACCESS);

  // Form states - Edit User
  const [editFullName, setEditFullName] = useState('');
  const [editRole, setEditRole] = useState('user');
  const [editDepartment, setEditDepartment] = useState('');
  const [editPosition, setEditPosition] = useState('');
  const [editFirmId, setEditFirmId] = useState('');
  const [editMobileNumber, setEditMobileNumber] = useState('');
  const [editStatus, setEditStatus] = useState('active');
  const [editAccess, setEditAccess] = useState(EMPTY_ACCESS);

  const [loading, setLoading] = useState(false);

  const fetchAllData = async () => {
    try {
      const [usersData, firmsData] = await Promise.all([
        usersApi.getUsers(),
        // Firms are only needed for the distributor firm dropdown
        firmsApi.getFirms().catch(() => []),
      ]);
      // Only employees with a position belong to this portal (users table is shared with other apps)
      setUsers((usersData || []).filter((u) => String(u.position || '').trim()));
      setFirms(firmsData || []);
    } catch (err) {
      console.error('Error fetching settings data:', err);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  // Create User
  const handleCreateUser = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        emp_id: empId ? parseInt(empId, 10) : undefined,
        full_name: fullName,
        username: username.toLowerCase().trim(),
        password,
        department: department || 'General',
        role: role || 'user',
        status: 'active',
        position: position || 'Staff',
        firm_id: isDistributorPosition(position) && firmId !== '' ? String(firmId) : null,
        mobile_number: mobileNumber,
        user_access: 'standard',
        retail_access: 'yes',
      };

      // Page access (sales_access) and firm access (firm_id) chosen in the modal
      const formUser = { position: payload.position, role: payload.role, department: payload.department };
      if (!isSuperAdminUser(formUser)) {
        Object.assign(payload, accessUpdates(formUser, addAccess, firmRows, { distributorFirmId: firmId }));
      }

      await usersApi.createUser(payload);
      showToast(`User ${username} created successfully!`);
      setIsAddUserOpen(false);
      fetchAllData();

      // Reset
      setEmpId('');
      setFullName('');
      setUsername('');
      setPassword('');
      setPosition('Manager');
      setFirmId('');
      setMobileNumber('');
      setAddAccess(EMPTY_ACCESS);
    } catch (err) {
      alert('Failed to create user: ' + saveErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // Open Edit User Modal
  const openEditModal = (u) => {
    setEditingUser(u);
    setEditFullName(u.full_name || '');
    setEditRole(u.role || 'user');
    setEditDepartment(u.department || '');
    setEditPosition(u.position || '');
    // Distributors: their own distributor firm (firm_id may also list granted company firms)
    const ownFirm = evaluateUserFirmAccess(u, firmRows).distributorFirmId;
    setEditFirmId(ownFirm ? String(ownFirm) : '');
    setEditMobileNumber(u.mobile_number || '');
    setEditStatus(u.status || 'active');
    setEditAccess(accessFromUser(u, firmCatalog, firmRows));
    setIsEditUserOpen(true);
  };

  // Update User
  const handleUpdateUser = async (e) => {
    e.preventDefault();
    if (!editingUser) return;
    setLoading(true);
    try {
      const updates = {
        full_name: editFullName,
        role: editRole,
        department: editDepartment,
        position: editPosition,
        mobile_number: editMobileNumber,
        status: editStatus,
      };

      // Page access (sales_access) and firm access (firm_id) chosen in the modal
      const formUser = { ...editingUser, position: editPosition, role: editRole, department: editDepartment };
      if (String(editPosition || '').trim() && !isSuperAdminUser(formUser)) {
        Object.assign(updates, accessUpdates(formUser, editAccess, firmRows, { distributorFirmId: editFirmId }));
      }

      await usersApi.updateUser(editingUser.emp_id, updates);
      showToast(`User @${editingUser.username} updated successfully!`);
      setIsEditUserOpen(false);
      setEditingUser(null);
      fetchAllData();
    } catch (err) {
      alert('Failed to update user: ' + saveErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // Toggle user active status
  const handleToggleStatus = async (user) => {
    const newStatus = user.status === 'active' ? 'inactive' : 'active';
    try {
      await usersApi.updateUser(user.emp_id, { status: newStatus });
      showToast(`User ${user.username} marked as ${newStatus}!`);
      fetchAllData();
    } catch (err) {
      alert('Failed to update status: ' + err.message);
    }
  };

  // Filtered Users
  const filteredUsers = users.filter((u) => {
    const q = searchTerm.toLowerCase();
    const matchesSearch =
      u.full_name?.toLowerCase().includes(q) ||
      u.username?.toLowerCase().includes(q) ||
      u.department?.toLowerCase().includes(q) ||
      u.position?.toLowerCase().includes(q) ||
      String(u.emp_id).includes(q);
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  // Pagination for users
  const [userPage, setUserPage] = useState(1);
  const [userPageSize, setUserPageSize] = useState(15);

  useEffect(() => {
    setUserPage(1);
  }, [searchTerm, roleFilter]);

  const paginatedUsers = React.useMemo(() => {
    const start = (userPage - 1) * userPageSize;
    return filteredUsers.slice(start, start + userPageSize);
  }, [filteredUsers, userPage, userPageSize]);


  // Super Admin security gate
  if (!isSuperAdmin) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl border border-red-200 bg-white p-8 text-center shadow-sm space-y-4">
          <div className="mx-auto w-12 h-12 rounded-full bg-red-50 text-[#a81b1e] flex items-center justify-center border border-red-200">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">
              Super Admin Authorization Required
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Access to System Settings and Employee Records is restricted exclusively to authorized Super Administrators.
            </p>
          </div>
          <div className="p-3 rounded-lg bg-slate-50 text-[11px] text-slate-600 font-medium border border-slate-200 text-left space-y-1">
            <p>
              <strong>Your Account:</strong> {currentUser?.full_name || currentUser?.username}
            </p>
            <p>
              <strong>Role:</strong> {currentUser?.role || 'user'} | <strong>Position:</strong> {currentUser?.position || 'Standard'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg sm:text-2xl font-extrabold text-slate-900">
              System Settings & Administration
            </h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-[#a81b1e] text-white">
              <Shield className="w-3 h-3" />
              Super Admin
            </span>
          </div>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Manage employees, credentials, page access and firm access
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {activeTab === 'users' && (
            <button
              onClick={() => setIsAddUserOpen(true)}
              className="w-full sm:w-auto flex items-center justify-center gap-1.5 rounded-lg bg-[#a81b1e] hover:bg-[#8e1518] px-4 py-2 text-xs font-bold text-white shadow-xs transition cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              Add Employee
            </button>
          )}

        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 overflow-x-auto no-scrollbar">
        <button
          onClick={() => selectTab('users')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition cursor-pointer whitespace-nowrap shrink-0 ${
            activeTab === 'users'
              ? 'border-[#a81b1e] text-[#a81b1e]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Employees & User Accounts</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-100 text-slate-600 font-bold">
            {users.length}
          </span>
        </button>


      </div>

      {/* TAB 1: USERS & EMPLOYEES */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          {/* Filter & Search Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white p-3 shadow-xs">
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar w-full sm:w-auto pb-1 sm:pb-0">
              {['all', 'admin', 'distributor', 'sales_executive', 'user'].map((r) => (
                <button
                  key={r}
                  onClick={() => setRoleFilter(r)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize whitespace-nowrap transition cursor-pointer ${
                    roleFilter === r
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  {r.replace('_', ' ')}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search emp_id, name, position..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 py-1.5 text-xs text-slate-900 focus:border-[#a81b1e] focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          {/* MOBILE CARD VIEW: Visible on screens < 768px (Phones, Small Tablets) */}
          <div className="block md:hidden space-y-3">
            {paginatedUsers.length === 0 ? (
              <div className="p-8 text-center bg-white rounded-xl border border-slate-200 text-slate-400 text-xs">
                No employees found matching criteria.
              </div>
            ) : (
              paginatedUsers.map((u) => {
                const access = evaluateUserFirmAccess(u, firms);
                return (
                  <div
                    key={u.emp_id}
                    className="p-3.5 rounded-xl border border-slate-200 bg-white shadow-xs space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-mono text-xs font-bold text-slate-500 shrink-0">#{u.emp_id}</span>
                          <h3 className="font-bold text-slate-900 text-sm truncate">{u.full_name}</h3>
                        </div>
                        <p className="text-[11px] text-slate-500 font-mono mt-0.5 truncate">@{u.username}</p>
                      </div>
                      <span
                        className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                          u.status === 'active'
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : 'bg-red-50 text-red-800 border border-red-200'
                        }`}
                      >
                        {u.status === 'active' ? (
                          <CheckCircle className="w-3 h-3 text-emerald-600" />
                        ) : (
                          <XCircle className="w-3 h-3 text-red-600" />
                        )}
                        {u.status}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200">
                        {u.role}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-50 text-slate-600 border border-slate-200">
                        {u.department || 'General'}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold text-slate-800 bg-slate-100">
                        {u.position || 'Employee'}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 text-xs">
                      <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Access Scope</span>
                      {access.isProhibited ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-700">
                          <XCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                          Login Prohibited (No Firm & Position)
                        </span>
                      ) : access.isDistributorOnly ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-800">
                          <Building2 className="w-3.5 h-3.5 text-blue-700 shrink-0" />
                          Distributor & Dealer Only
                        </span>
                      ) : access.isRestricted ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800">
                          <Building2 className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                          {access.firmName}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800">
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          All Firms
                        </span>
                      )}
                    </div>

                    <div className="text-xs text-slate-600">
                      <span className="text-slate-400">Page Access: </span>
                      <span className="font-semibold text-slate-800">{accessSummary(u, firmRows).pages}</span>
                    </div>

                    {u.mobile_number && (
                      <div className="text-xs text-slate-600">
                        <span className="text-slate-400">Mobile: </span>
                        <a href={`tel:${u.mobile_number}`} className="font-mono font-semibold text-slate-800 hover:text-[#a81b1e]">
                          {u.mobile_number}
                        </a>
                      </div>
                    )}

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
                      <button
                        onClick={() => openEditModal(u)}
                        className="flex-1 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 hover:bg-slate-100 text-slate-700 transition flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5 text-slate-500" />
                        Edit
                      </button>
                      <button
                        onClick={() => handleToggleStatus(u)}
                        className="flex-1 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 hover:bg-slate-100 text-slate-600 transition flex items-center justify-center cursor-pointer"
                      >
                        {u.status === 'active' ? 'Deactivate' : 'Activate'}
                      </button>
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
                    <th className="py-3 px-3.5">Emp ID</th>
                    <th className="py-3 px-3.5">Employee & Username</th>
                    <th className="py-3 px-3.5">Department & Role</th>
                    <th className="py-3 px-3.5">Position & Firm Permission</th>
                    <th className="py-3 px-3.5">Page Access</th>
                    <th className="py-3 px-3.5">Mobile</th>
                    <th className="py-3 px-3.5 text-center">Status</th>
                    <th className="py-3 px-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedUsers.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400">
                        No employees found matching criteria.
                      </td>
                    </tr>
                  ) : (
                    paginatedUsers.map((u) => {
                      const access = evaluateUserFirmAccess(u, firms);
                      return (
                        <tr key={u.emp_id} className="hover:bg-slate-50/80 transition">
                          <td className="py-3 px-3.5 font-mono font-bold text-slate-900">
                            #{u.emp_id}
                          </td>
                          <td className="py-3 px-3.5">
                            <p className="font-bold text-slate-900">{u.full_name}</p>
                            <p className="text-[11px] text-slate-500 font-mono">@{u.username}</p>
                          </td>
                          <td className="py-3 px-3.5">
                            <p className="font-semibold text-slate-800">{u.department || 'General'}</p>
                            <span className="inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200">
                              {u.role}
                            </span>
                          </td>
                          <td className="py-3 px-3.5">
                            <div className="flex flex-col gap-1 items-start">
                              <span className="font-bold text-slate-900 text-xs">
                                {u.position || 'Employee'}
                              </span>
                              {access.isProhibited ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800 border border-red-300">
                                  <XCircle className="w-3 h-3 text-red-600" />
                                  Login Prohibited (No Firm & Position)
                                </span>
                              ) : access.isDistributorOnly ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-900 border border-blue-200">
                                  <Building2 className="w-3 h-3 text-blue-700" />
                                  Distributor & Dealer Only
                                </span>
                              ) : access.isRestricted ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-900 border border-amber-200">
                                  <Building2 className="w-3 h-3 text-amber-700" />
                                  {access.firmName}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-900 border border-emerald-200">
                                  <ShieldCheck className="w-3 h-3 text-emerald-600" />
                                  All Firms
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-3.5">
                            {(() => {
                              const summary = accessSummary(u, firmRows);
                              return (
                                <button
                                  type="button"
                                  onClick={() => openEditModal(u)}
                                  title="Edit access"
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border cursor-pointer ${
                                    summary.count === 0
                                      ? 'bg-red-50 text-red-700 border-red-200'
                                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                                  }`}
                                >
                                  <KeyRound className="w-3 h-3" />
                                  {summary.pages}
                                </button>
                              );
                            })()}
                          </td>
                          <td className="py-3 px-3.5 font-mono text-slate-700">
                            {u.mobile_number || '—'}
                          </td>
                          <td className="py-3 px-3.5 text-center">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold ${
                                u.status === 'active'
                                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                  : 'bg-red-50 text-red-800 border border-red-200'
                              }`}
                            >
                              {u.status === 'active' ? (
                                <CheckCircle className="w-3 h-3 text-emerald-600" />
                              ) : (
                                <XCircle className="w-3 h-3 text-red-600" />
                              )}
                              {u.status}
                            </span>
                          </td>
                          <td className="py-3 px-3.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => openEditModal(u)}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold border border-slate-200 hover:bg-slate-100 text-slate-700 transition cursor-pointer"
                                title="Edit employee, page access & firm access"
                              >
                                <Pencil className="w-3 h-3 text-slate-500" />
                                Edit
                              </button>
                              <button
                                onClick={() => handleToggleStatus(u)}
                                className="px-2 py-1 rounded text-[11px] font-semibold border border-slate-200 hover:bg-slate-100 text-slate-600 transition cursor-pointer"
                              >
                                {u.status === 'active' ? 'Deactivate' : 'Activate'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Row Pagination for Employees */}
          <Pagination
            currentPage={userPage}
            totalItems={filteredUsers.length}
            pageSize={userPageSize}
            onPageChange={(page) => setUserPage(page)}
            onPageSizeChange={(size) => setUserPageSize(size)}
            pageSizeOptions={[10, 15, 25, 50]}
          />
        </div>
      )}

      {/* MODAL: ADD USER */}
      <Modal
        isOpen={isAddUserOpen}
        onClose={() => setIsAddUserOpen(false)}
        title="Add New Employee (Super Admin)"
        maxWidth="max-w-3xl"
      >
        <form onSubmit={handleCreateUser} className="space-y-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                Emp ID
              </label>
              <input
                type="number"
                placeholder="e.g. 105"
                value={empId}
                onChange={(e) => setEmpId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#a81b1e] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                Username *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. rajesh.a"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#a81b1e] focus:outline-none font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
              Full Name *
            </label>
            <input
              type="text"
              required
              placeholder="Employee Full Name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#a81b1e] focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                Password *
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#a81b1e] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                Role *
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#a81b1e] focus:outline-none"
              >
                <option value="admin">admin (Super Admin Access)</option>
                <option value="user">user (Standard System User)</option>
                <option value="distributor">distributor</option>
                <option value="sales_executive">sales_executive</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                Position / Designation *
              </label>
              <select
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#a81b1e] focus:outline-none font-semibold"
              >
                <option value="">None / Unassigned (Empty)</option>
                <option value="Managing Director (MD)">Managing Director (MD)</option>
                <option value="Vice President (VP)">Vice President (VP)</option>
                <option value="Manager">Manager</option>
                <option value="Project Manager">Project Manager</option>
                <option value="Distributor">Distributor</option>
                <option value="Dispatch Manager">Dispatch Manager</option>
                <option value="Sales Executive">Sales Executive</option>
                <option value="Weighbridge Officer">Weighbridge Officer</option>
                <option value="Staff">Staff</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                Distributor Firm
              </label>
              {isDistributorPosition(position) ? (
                <select
                  value={firmId}
                  onChange={(e) => setFirmId(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#a81b1e] focus:outline-none"
                >
                  <option value="">None</option>
                  {firms.filter((f) => String(f.type || '').toLowerCase().trim() === 'distributor').map((f) => (
                    <option key={f.id} value={f.id}>
                      Firm #{f.id} - {f.name}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="w-full rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
                  Set firm access in the Access section below
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                Department
              </label>
              <input
                type="text"
                placeholder="e.g. Dispatch & Logistics"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                Mobile Number
              </label>
              <input
                type="text"
                placeholder="+91 98765 43210"
                value={mobileNumber}
                onChange={(e) => setMobileNumber(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:outline-none font-mono"
              />
            </div>
          </div>

          {/* Access: firm access + page access */}
          <div className="pt-3 border-t border-slate-100 space-y-2">
            <h3 className="text-sm font-extrabold text-slate-900">Access</h3>
            <UserAccessEditor
              user={{ position, role, department }}
              value={addAccess}
              onChange={setAddAccess}
              disabled={loading}
            />
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsAddUserOpen(false)}
              className="px-3 py-2 sm:py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200 sm:border-transparent cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 sm:py-1.5 rounded-lg bg-[#a81b1e] text-xs font-bold text-white hover:bg-[#8e1518] transition cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save Employee'}
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL: EDIT USER */}
      <Modal
        isOpen={isEditUserOpen}
        onClose={() => {
          setIsEditUserOpen(false);
          setEditingUser(null);
        }}
        title={`Edit Employee #${editingUser?.emp_id} (@${editingUser?.username})`}
        maxWidth="max-w-3xl"
      >
        <form onSubmit={handleUpdateUser} className="space-y-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                Full Name *
              </label>
              <input
                type="text"
                required
                value={editFullName}
                onChange={(e) => setEditFullName(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#a81b1e] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                Role *
              </label>
              <select
                value={editRole}
                onChange={(e) => setEditRole(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#a81b1e] focus:outline-none"
              >
                <option value="admin">admin (Super Admin Access)</option>
                <option value="user">user (Standard System User)</option>
                <option value="distributor">distributor</option>
                <option value="sales_executive">sales_executive</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                Position / Designation *
              </label>
              <select
                value={editPosition}
                onChange={(e) => setEditPosition(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#a81b1e] focus:outline-none font-semibold"
              >
                <option value="">None / Unassigned (Empty)</option>
                <option value="Managing Director (MD)">Managing Director (MD)</option>
                <option value="Vice President (VP)">Vice President (VP)</option>
                <option value="Manager">Manager</option>
                <option value="Project Manager">Project Manager</option>
                <option value="Distributor">Distributor</option>
                <option value="Dispatch Manager">Dispatch Manager</option>
                <option value="Sales Executive">Sales Executive</option>
                <option value="Weighbridge Officer">Weighbridge Officer</option>
                <option value="Staff">Staff</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                Distributor Firm
              </label>
              {isDistributorPosition(editPosition) ? (
                <select
                  value={editFirmId}
                  onChange={(e) => setEditFirmId(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#a81b1e] focus:outline-none"
                >
                  <option value="">None</option>
                  {firms.filter((f) => String(f.type || '').toLowerCase().trim() === 'distributor').map((f) => (
                    <option key={f.id} value={f.id}>
                      Firm #{f.id} - {f.name}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="w-full rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
                  Set firm access in the Access section below
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                Department
              </label>
              <input
                type="text"
                value={editDepartment}
                onChange={(e) => setEditDepartment(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                Mobile Number
              </label>
              <input
                type="text"
                value={editMobileNumber}
                onChange={(e) => setEditMobileNumber(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:outline-none font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
              Account Status
            </label>
            <select
              value={editStatus}
              onChange={(e) => setEditStatus(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:outline-none"
            >
              <option value="active">active (Login Permitted)</option>
              <option value="inactive">inactive (Login Blocked)</option>
            </select>
          </div>

          {/* Access: firm access + page access */}
          <div className="pt-3 border-t border-slate-100 space-y-2">
            <h3 className="text-sm font-extrabold text-slate-900">Access</h3>
            <UserAccessEditor
              user={{ ...(editingUser || {}), position: editPosition, role: editRole, department: editDepartment }}
              value={editAccess}
              onChange={setEditAccess}
              disabled={loading}
            />
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => {
                setIsEditUserOpen(false);
                setEditingUser(null);
              }}
              className="px-3 py-2 sm:py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200 sm:border-transparent cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 sm:py-1.5 rounded-lg bg-[#a81b1e] text-xs font-bold text-white hover:bg-[#8e1518] transition cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Update Employee'}
            </button>
          </div>
        </form>
      </Modal>

    </div>
  );
};
