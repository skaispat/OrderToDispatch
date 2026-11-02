import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { firmsApi, FIRM_TYPES } from '../api/firmsApi';
import { usersApi } from '../api/usersApi';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { Modal } from '../components/common/Modal';
import { parseFirmIds } from '../data/constants';
import { Building2, Plus, Search, RefreshCw, AlertTriangle, Store, Factory } from 'lucide-react';

const isDistributorType = (f) => String(f.type || '').toLowerCase().trim() === 'distributor';

export const FirmsPage = () => {
  const { showToast } = useApp();
  const { isSuperAdmin, canEdit, reloadFirms } = useAuth();
  const canAddFirms = canEdit('firms');

  const [firms, setFirms] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('Company');
  const [newId, setNewId] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Assigned accounts are only shown to Super Admin
      const [firmRows, userRows] = await Promise.all([
        firmsApi.getFirms(),
        isSuperAdmin ? usersApi.getUsers() : Promise.resolve([]),
      ]);
      setFirms(firmRows);
      setUsers((userRows || []).filter((u) => String(u.position || '').trim()));
    } catch (err) {
      setError(err?.message || 'Failed to load firms.');
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredFirms = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    return firms.filter((f) => {
      if (typeFilter === 'company' && isDistributorType(f)) return false;
      if (typeFilter === 'distributor' && !isDistributorType(f)) return false;
      return !q || String(f.name || '').toLowerCase().includes(q) || String(f.id).includes(q);
    });
  }, [firms, searchTerm, typeFilter]);

  const openAdd = () => {
    setNewName('');
    setNewType('Company');
    setNewId('');
    setIsAddOpen(true);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!canAddFirms) {
      alert('Access Denied: You have view-only access to Firms.');
      return;
    }
    setSaving(true);
    try {
      const created = await firmsApi.createFirm({ id: newId, name: newName, type: newType });
      showToast(`Firm "${created.name}" added`);
      setIsAddOpen(false);
      await loadData();
      // Firm access options (Sarthak / companies) are built from the firms table
      reloadFirms();
    } catch (err) {
      alert('Failed to add firm: ' + (err?.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const counts = {
    all: firms.length,
    company: firms.filter((f) => !isDistributorType(f)).length,
    distributor: firms.filter(isDistributorType).length,
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">Firms</h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Company firms have their own data. Distributor firms belong to Sarthak TMT.
          </p>
        </div>
        {canAddFirms ? (
          <button
            onClick={openAdd}
            className="w-full sm:w-auto flex items-center justify-center gap-1.5 rounded-lg bg-[#a81b1e] hover:bg-[#8e1518] px-4 py-2 text-xs font-bold text-white shadow-xs transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add Firm
          </button>
        ) : (
          <div className="px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold shadow-2xs">
            View-Only Access
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-red-200 bg-red-50 text-xs text-[#a81b1e]">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              <strong>Failed to load firms:</strong> {error}
            </span>
          </div>
          <button
            onClick={loadData}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#a81b1e] hover:bg-[#8e1518] text-white font-bold transition cursor-pointer shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white p-3 shadow-xs">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          {[
            { id: 'all', label: 'All' },
            { id: 'company', label: 'Company' },
            { id: 'distributor', label: 'Distributor' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTypeFilter(t.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                typeFilter === t.id ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              {t.label} &bull; {counts[t.id]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search firm name or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 py-1.5 text-xs text-slate-900 focus:border-[#a81b1e] focus:bg-white focus:outline-none"
            />
          </div>
          <button
            onClick={loadData}
            title="Refresh firms"
            className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition cursor-pointer shrink-0"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#a81b1e]' : ''}`} />
          </button>
        </div>
      </div>

      {/* Firm cards */}
      {loading && firms.length === 0 ? (
        <div className="p-10 text-center text-xs text-slate-400 bg-white rounded-xl border border-slate-200">Loading firms...</div>
      ) : filteredFirms.length === 0 ? (
        <div className="p-10 text-center text-xs text-slate-400 bg-white rounded-xl border border-slate-200">No firms found.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {filteredFirms.map((f) => {
            const distributor = isDistributorType(f);
            const assignedUsers = isSuperAdmin ? users.filter((u) => parseFirmIds(u.firm_id).includes(Number(f.id))) : [];
            return (
              <div key={f.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-3 hover:border-slate-300 transition">
                <div className="flex items-center justify-between gap-2">
                  <span className="px-2 py-0.5 rounded-md font-mono text-xs font-bold bg-slate-100 text-slate-800 border border-slate-200">
                    Firm ID #{f.id}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${
                      distributor ? 'bg-blue-50 text-blue-800 border-blue-200' : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    }`}
                  >
                    {distributor ? <Store className="w-3 h-3" /> : <Factory className="w-3 h-3" />}
                    {distributor ? 'Distributor' : f.type || 'Company'}
                  </span>
                </div>

                <div>
                  <h3 className="text-base font-extrabold text-slate-900">{f.name}</h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {distributor ? 'Data counted under Sarthak TMT' : 'Own firm data'}
                  </p>
                </div>

                {isSuperAdmin && (
                  <div className="pt-2 border-t border-slate-100 space-y-1.5">
                    <div className="text-xs text-slate-600">
                      <span className="text-slate-400">Assigned Accounts: </span>
                      <strong className="text-slate-800">{assignedUsers.length}</strong>
                    </div>
                    {assignedUsers.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {assignedUsers.slice(0, 3).map((u) => (
                          <span
                            key={u.emp_id}
                            className="px-1.5 py-0.5 rounded text-[10px] bg-slate-50 text-slate-700 border border-slate-200 font-mono"
                            title={u.full_name}
                          >
                            @{u.username}
                          </span>
                        ))}
                        {assignedUsers.length > 3 && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] text-slate-400">+{assignedUsers.length - 3} more</span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Firm Modal (Firms edit access) */}
      <Modal isOpen={isAddOpen && canAddFirms} onClose={() => setIsAddOpen(false)} title="Add Firm" maxWidth="max-w-md">
        <form onSubmit={handleCreate} className="space-y-3.5">
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Firm Name *</label>
            <input
              type="text"
              required
              placeholder="e.g. Tata Tiscon, Shree Traders"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#a81b1e] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Type *</label>
            <div className="grid grid-cols-2 gap-2">
              {FIRM_TYPES.map((t) => (
                <button
                  type="button"
                  key={t}
                  onClick={() => setNewType(t)}
                  aria-pressed={newType === t}
                  className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-bold transition cursor-pointer ${
                    newType === t ? 'bg-red-50 text-[#a81b1e] border-[#a81b1e]' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {t === 'Distributor' ? <Store className="w-3.5 h-3.5" /> : <Building2 className="w-3.5 h-3.5" />}
                  {t}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              {newType === 'Distributor'
                ? 'Distributor firms are counted under Sarthak TMT data.'
                : 'Company firms appear as their own option in Firm Access.'}
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase mb-1">Firm ID (optional)</label>
            <input
              type="number"
              min="1"
              placeholder="Auto-assigned"
              value={newId}
              onChange={(e) => setNewId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#a81b1e] focus:outline-none font-mono"
            />
          </div>

          <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsAddOpen(false)}
              className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-1.5 rounded-lg bg-[#a81b1e] text-xs font-bold text-white hover:bg-[#8e1518] transition cursor-pointer disabled:opacity-50"
            >
              {saving ? 'Adding...' : 'Add Firm'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
