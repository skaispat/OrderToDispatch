import React, { useState, useEffect } from 'react';
import { usersApi } from '../api/usersApi';
import { useApp } from '../context/AppContext';
import { Modal } from '../components/common/Modal';
import { Pagination } from '../components/common/Pagination';
import { FIRMS_LIST, evaluateUserFirmAccess } from '../data/constants';
import {
  Users,
  UserPlus,
  Search,
  ShieldCheck,
  Building2,
  CheckCircle,
  XCircle,
  Pencil,
  Info,
  Shield,
  Layers,
} from 'lucide-react';

export const UsersPage = () => {
  const { showToast } = useApp();
  const [users, setUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [isEditUserOpen, setIsEditUserOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  // Form states - Add
  const [empId, setEmpId] = useState('');
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [department, setDepartment] = useState('Operations');
  const [role, setRole] = useState('user');
  const [position, setPosition] = useState('Manager');
  const [firmId, setFirmId] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [loading, setLoading] = useState(false);

  // Form states - Edit
  const [editFullName, setEditFullName] = useState('');
  const [editRole, setEditRole] = useState('user');
  const [editDepartment, setEditDepartment] = useState('');
  const [editPosition, setEditPosition] = useState('');
  const [editFirmId, setEditFirmId] = useState('');
  const [editMobileNumber, setEditMobileNumber] = useState('');
  const [editStatus, setEditStatus] = useState('active');

  const fetchUsers = async () => {
    try {
      const data = await usersApi.getUsers();
      setUsers(data);
    } catch (err) {
      console.error('Error fetching users:', err);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

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
        firm_id: firmId !== '' ? parseInt(firmId, 10) : null,
        mobile_number: mobileNumber,
        user_access: 'standard',
        retail_access: 'yes',
      };

      await usersApi.createUser(payload);
      showToast(`User ${username} created successfully!`);
      setIsAddUserOpen(false);
      fetchUsers();

      // Reset
      setEmpId('');
      setFullName('');
      setUsername('');
      setPassword('');
      setPosition('Manager');
      setFirmId('');
      setMobileNumber('');
    } catch (err) {
      alert('Failed to create user: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const openEditModal = (u) => {
    setEditingUser(u);
    setEditFullName(u.full_name || '');
    setEditRole(u.role || 'user');
    setEditDepartment(u.department || '');
    setEditPosition(u.position || '');
    setEditFirmId(u.firm_id !== null && u.firm_id !== undefined ? String(u.firm_id) : '');
    setEditMobileNumber(u.mobile_number || '');
    setEditStatus(u.status || 'active');
    setIsEditUserOpen(true);
  };

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
        firm_id: editFirmId !== '' ? parseInt(editFirmId, 10) : null,
        mobile_number: editMobileNumber,
        status: editStatus,
      };

      await usersApi.updateUser(editingUser.emp_id, updates);
      showToast(`User @${editingUser.username} updated successfully!`);
      setIsEditUserOpen(false);
      setEditingUser(null);
      fetchUsers();
    } catch (err) {
      alert('Failed to update user: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (user) => {
    const newStatus = user.status === 'active' ? 'inactive' : 'active';
    try {
      await usersApi.updateUser(user.emp_id, { status: newStatus });
      showToast(`User ${user.username} marked as ${newStatus}!`);
      fetchUsers();
    } catch (err) {
      alert('Failed to update status: ' + err.message);
    }
  };

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

  // Helper to preview access rule
  const getAccessPreview = (pos, fId) => {
    const dummy = {
      position: pos,
      firm_id: fId !== '' ? Number(fId) : null,
      role: 'user',
    };
    return evaluateUserFirmAccess(dummy);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900">
            Employee Directory & Access Control
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            Manage designations (MD, VP, Manager), corporate credentials, and firm permissions
          </p>
        </div>

        <button
          onClick={() => setIsAddUserOpen(true)}
          className="w-full sm:w-auto flex items-center justify-center gap-1.5 rounded-lg bg-[#a81b1e] hover:bg-[#8e1518] px-4 py-2 text-xs font-bold text-white shadow-xs transition cursor-pointer"
        >
          <UserPlus className="w-4 h-4" />
          Add Employee
        </button>
      </div>

      {/* Firm Permission Policy Banner */}
      <div className="rounded-xl border border-blue-200/80 bg-blue-50/60 p-3.5 text-xs text-slate-700">
        <div className="flex items-start gap-2.5">
          <Info className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-bold text-blue-900">
              System Position & Firm Access Rules:
            </span>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-1 pt-1 border-t border-blue-200/50 text-[11px]">
              <div>
                <strong className="text-slate-900">1. VP & Managing Director (MD):</strong> Universal access to all firms and complete records regardless of firm assignment.
              </div>
              <div>
                <strong className="text-slate-900">2. Manager with Firm ID:</strong> Strictly restricted to their assigned firm (Sarthak, JSW One, or Essar).
              </div>
              <div>
                <strong className="text-slate-900">3. Manager with Empty Firm:</strong> Universal access across all firms and aggregate records.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white p-3 shadow-xs">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar w-full sm:w-auto pb-1 sm:pb-0">
          {['all', 'admin', 'distributor', 'sales_executive', 'user'].map((r) => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize whitespace-nowrap transition cursor-pointer ${roleFilter === r
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
            const access = evaluateUserFirmAccess(u);
            return (
              <div
                key={u.emp_id}
                className="p-3.5 rounded-xl border border-slate-200 bg-white shadow-xs space-y-3"
              >
                <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs font-bold text-slate-500">#{u.emp_id}</span>
                      <h3 className="font-bold text-slate-900 text-sm">{u.full_name}</h3>
                    </div>
                    <p className="text-[11px] text-slate-500 font-mono mt-0.5">@{u.username}</p>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
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
                  ) : access.isRestricted ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800">
                      <Building2 className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                      Firm #{u.firm_id}: {access.firmName}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      All Firms ({access?.rule?.includes('VP') ? 'VP/MD' : access?.rule?.includes('Manager') ? 'Manager' : 'Full Access'})
                    </span>
                  )}
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
                <th className="py-3 px-3.5">Mobile</th>
                <th className="py-3 px-3.5 text-center">Status</th>
                <th className="py-3 px-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    No employees found matching criteria.
                  </td>
                </tr>
              ) : (
                paginatedUsers.map((u) => {
                  const access = evaluateUserFirmAccess(u);
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
                          ) : access.isRestricted ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-900 border border-amber-200">
                              <Building2 className="w-3 h-3 text-amber-700" />
                              Firm #{u.firm_id}: {access.firmName}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-900 border border-emerald-200">
                              <ShieldCheck className="w-3 h-3 text-emerald-600" />
                              All Firms ({access?.rule?.includes('VP') ? 'VP/MD' : access?.rule?.includes('Manager') ? 'Manager' : 'Full Access'})
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3.5 font-mono text-slate-700">
                        {u.mobile_number || '—'}
                      </td>
                      <td className="py-3 px-3.5 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold ${u.status === 'active'
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
                            className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold border border-slate-200 hover:bg-slate-100 text-slate-700 transition"
                            title="Edit Position & Firm Assignment"
                          >
                            <Pencil className="w-3 h-3 text-slate-500" />
                            Edit
                          </button>
                          <button
                            onClick={() => handleToggleStatus(u)}
                            className="px-2 py-1 rounded text-[11px] font-semibold border border-slate-200 hover:bg-slate-100 text-slate-600 transition"
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

      {/* Add User Modal */}
      <Modal
        isOpen={isAddUserOpen}
        onClose={() => setIsAddUserOpen(false)}
        title="Add New Employee"
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleCreateUser} className="space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
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

          <div className="grid grid-cols-2 gap-3">
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
                <option value="admin">admin</option>
                <option value="distributor">distributor</option>
                <option value="sales_executive">sales_executive</option>
                <option value="user">user</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                Position / Designation *
              </label>
              <select
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#a81b1e] focus:outline-none font-semibold"
              >
                <option value="Managing Director (MD)">Managing Director (MD)</option>
                <option value="Vice President (VP)">Vice President (VP)</option>
                <option value="Manager">Manager</option>
                <option value="Project Manager">Project Manager</option>
                <option value="Dispatch Manager">Dispatch Manager</option>
                <option value="Sales Executive">Sales Executive</option>
                <option value="Weighbridge Officer">Weighbridge Officer</option>
                <option value="Staff">Staff</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                Firm Assignment (firms.id)
              </label>
              <select
                value={firmId}
                onChange={(e) => setFirmId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#a81b1e] focus:outline-none"
              >
                <option value="">None / All Firms (Universal Access)</option>
                {FIRMS_LIST.map((f) => (
                  <option key={f.id} value={f.id}>
                    Firm #{f.id} - {f.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Access Preview Box */}
          {(() => {
            const preview = getAccessPreview(position, firmId);
            return (
              <div
                className={`p-3 rounded-xl border text-xs ${preview.isRestricted
                  ? 'border-amber-200 bg-amber-50/70 text-amber-900'
                  : 'border-emerald-200 bg-emerald-50/70 text-emerald-900'
                  }`}
              >
                <div className="flex items-center gap-1.5 font-bold mb-0.5">
                  {preview.isRestricted ? (
                    <Building2 className="w-3.5 h-3.5 text-amber-700" />
                  ) : (
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  )}
                  <span>Access Permission Result:</span>
                </div>
                <p className="text-[11px]">{preview.rule}</p>
              </div>
            );
          })()}

          <div className="grid grid-cols-2 gap-3">
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

          <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsAddUserOpen(false)}
              className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-1.5 rounded-lg bg-[#a81b1e] text-xs font-bold text-white hover:bg-[#8e1518] transition cursor-pointer"
            >
              {loading ? 'Saving...' : 'Save Employee'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit User Modal */}
      <Modal
        isOpen={isEditUserOpen}
        onClose={() => {
          setIsEditUserOpen(false);
          setEditingUser(null);
        }}
        title={`Edit Employee #${editingUser?.emp_id} (@${editingUser?.username})`}
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleUpdateUser} className="space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
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
                <option value="admin">admin</option>
                <option value="distributor">distributor</option>
                <option value="sales_executive">sales_executive</option>
                <option value="user">user</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                Position / Designation *
              </label>
              <select
                value={editPosition}
                onChange={(e) => setEditPosition(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#a81b1e] focus:outline-none font-semibold"
              >
                <option value="Managing Director (MD)">Managing Director (MD)</option>
                <option value="Vice President (VP)">Vice President (VP)</option>
                <option value="Manager">Manager</option>
                <option value="Project Manager">Project Manager</option>
                <option value="Dispatch Manager">Dispatch Manager</option>
                <option value="Sales Executive">Sales Executive</option>
                <option value="Weighbridge Officer">Weighbridge Officer</option>
                <option value="Staff">Staff</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                Firm Assignment (firms.id)
              </label>
              <select
                value={editFirmId}
                onChange={(e) => setEditFirmId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#a81b1e] focus:outline-none"
              >
                <option value="">None / All Firms (Universal Access)</option>
                {FIRMS_LIST.map((f) => (
                  <option key={f.id} value={f.id}>
                    Firm #{f.id} - {f.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Access Preview Box */}
          {(() => {
            const preview = getAccessPreview(editPosition, editFirmId);
            return (
              <div
                className={`p-3 rounded-xl border text-xs ${preview.isRestricted
                  ? 'border-amber-200 bg-amber-50/70 text-amber-900'
                  : 'border-emerald-200 bg-emerald-50/70 text-emerald-900'
                  }`}
              >
                <div className="flex items-center gap-1.5 font-bold mb-0.5">
                  {preview.isRestricted ? (
                    <Building2 className="w-3.5 h-3.5 text-amber-700" />
                  ) : (
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  )}
                  <span>Evaluated Access Rule:</span>
                </div>
                <p className="text-[11px]">{preview.rule}</p>
              </div>
            );
          })()}

          <div className="grid grid-cols-2 gap-3">
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
              <option value="active">active</option>
              <option value="inactive">inactive</option>
            </select>
          </div>

          <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => {
                setIsEditUserOpen(false);
                setEditingUser(null);
              }}
              className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-1.5 rounded-lg bg-[#a81b1e] text-xs font-bold text-white hover:bg-[#8e1518] transition cursor-pointer"
            >
              {loading ? 'Saving...' : 'Update Employee'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
