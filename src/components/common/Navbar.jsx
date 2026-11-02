import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { TMT_BRANDS } from '../../data/constants';
import { LogOut, Menu, User, X } from 'lucide-react';

const initialsOf = (name) =>
  String(name || '')
    .trim()
    .split(/s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('') || null;

const ProfileRow = ({ label, value }) =>
  value ? (
    <div className="flex justify-between gap-3 py-1.5 border-b border-slate-100 last:border-0">
      <span className="text-slate-500 font-medium shrink-0">{label}</span>
      <span className="font-semibold text-slate-900 text-right break-words min-w-0">{value}</span>
    </div>
  ) : null;

export const Navbar = ({ onToggleSidebar }) => {
  const { user, role, logout, firmAccess, isDistributor, isASM, isUnauthorizedUser, canAccessAllFirms } = useAuth();
  const { selectedBrand, setSelectedBrand } = useApp();

  // Firms this user can switch between (all firms, or only their assigned firms)
  const switchBrands = canAccessAllFirms
    ? TMT_BRANDS
    : TMT_BRANDS.filter((b) => (firmAccess?.allowedBrands || []).includes(b.id));
  const canSwitchFirms = canAccessAllFirms || switchBrands.length > 1;

  // Mobile profile menu (replaces the logout icon on phones)
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef(null);
  useEffect(() => {
    if (!profileOpen) return undefined;
    const onPointer = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) setProfileOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setProfileOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('touchstart', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('touchstart', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [profileOpen]);

  const displayName = user?.full_name || user?.name || user?.username || 'Employee';
  const initials = initialsOf(displayName);
  const firmLabel = canAccessAllFirms
    ? 'All Firms'
    : isASM || isDistributor
      ? 'Sarthak TMT'
      : firmAccess?.firmName || '';

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white/95 backdrop-blur-md">
      <div className="flex h-16 items-center justify-between px-3 sm:px-6">
        {/* Left: Mobile Menu Button + Brand Logo & "Order to Dispatch" */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            onClick={onToggleSidebar}
            className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 md:hidden cursor-pointer"
            title="Toggle Menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="hidden md:flex h-10 px-2 py-0.5 rounded-xl border border-slate-200 bg-white shadow-2xs items-center justify-center shrink-0">
            <img
              src="/sarthak-logo.jpg"
              alt="Sarthak TMT Logo"
              className="h-7 sm:h-8 w-auto object-contain"
            />
          </div>
          <h1 className="text-base sm:text-lg font-black text-slate-900 tracking-tight truncate">
            Order to Dispatch
          </h1>
        </div>

        {/* Center: Brand Switcher or Restricted Firm Badge / Distributor Badge */}
        {isUnauthorizedUser ? (
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-xl">
            <span className="text-xs font-bold text-amber-800">
              Access Restricted
            </span>
          </div>
        ) : canSwitchFirms ? (
          /* All-firms users, or users assigned to several firms, can switch between their firms */
          <div className="hidden lg:flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200">
            {canAccessAllFirms && (
            <button
              onClick={() => setSelectedBrand('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${selectedBrand === 'all'
                ? 'bg-white text-slate-900 shadow-xs border border-slate-200 font-bold'
                : 'text-slate-600 hover:text-slate-900'
                }`}
            >
              All Firms
            </button>
            )}
            {switchBrands.map((brand) => (
              <button
                key={brand.id}
                onClick={() => setSelectedBrand(brand.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${selectedBrand === brand.id
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200 font-bold'
                  : 'text-slate-600 hover:text-slate-900'
                  }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: brand.color }}
                />
                {brand.name}
              </button>
            ))}
          </div>
        ) : isASM ? (
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-red-50/80 border border-red-200 rounded-xl">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#a81b1e]">
              Assigned Brand:
            </span>
            <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#a81b1e]" />
              Sarthak TMT
            </span>
          </div>
        ) : isDistributor ? (
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-xl">
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-800">
              Sarthak TMT
            </span>
            <span className="text-xs font-bold text-slate-900">
              Distributor
            </span>
          </div>
        ) : (
          /* All other roles (Managers, Employees, Admins without Super Admin) only see their assigned firm */
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-red-50/70 border border-red-200 rounded-xl">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#a81b1e]">
              Assigned Firm:
            </span>
            <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#a81b1e]" />
              {firmAccess?.firmName || 'Assigned Firm'}
            </span>
          </div>
        )}

        {/* Right: User Profile & Logout */}
        <div className="flex items-center gap-3 shrink-0">
          {/* User Account / Logout */}
          <div className="flex items-center gap-3 sm:pl-3 sm:border-l border-slate-200">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-bold text-slate-900 leading-tight">
                {user?.full_name || user?.name || user?.username || 'Employee'}
              </p>
              <div className="flex items-center gap-1.5 justify-end mt-0.5">
                <span className="text-[10px] text-[#a81b1e] font-semibold">
                  {user?.position || user?.department || role}
                </span>
               
              </div>
            </div>
            <button
              onClick={logout}
              title="Logout"
              className="hidden sm:inline-flex p-2 rounded-lg text-slate-500 hover:bg-red-50 hover:text-[#a81b1e] transition cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>

            {/* Mobile: user icon opens a profile preview (with logout) */}
            <div ref={profileRef} className="relative sm:hidden">
              <button
                onClick={() => setProfileOpen((v) => !v)}
                aria-label="Open profile"
                aria-expanded={profileOpen}
                className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-extrabold border transition cursor-pointer ${profileOpen
                  ? 'bg-[#a81b1e] text-white border-[#a81b1e]'
                  : 'bg-red-50 text-[#a81b1e] border-red-200'
                  }`}
              >
                {initials || <User className="w-4 h-4" />}
              </button>

              {profileOpen && (
                <div
                  role="dialog"
                  aria-label="Profile"
                  className="absolute right-0 top-full mt-2 w-[calc(100vw-1.5rem)] max-w-xs rounded-xl border border-slate-200 bg-white shadow-xl z-50 overflow-hidden"
                >
                  <div className="flex items-start gap-3 p-3.5 bg-slate-50 border-b border-slate-200">
                    <div className="w-10 h-10 rounded-full bg-[#a81b1e] text-white flex items-center justify-center text-sm font-extrabold shrink-0">
                      {initials || <User className="w-5 h-5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-extrabold text-slate-900 truncate">{displayName}</p>
                      {user?.username && <p className="text-[11px] text-slate-500 font-mono truncate">@{user.username}</p>}
                      <p className="text-[11px] text-[#a81b1e] font-semibold truncate">{user?.position || user?.department || role}</p>
                    </div>
                    <button
                      onClick={() => setProfileOpen(false)}
                      aria-label="Close profile"
                      className="p-1 rounded-lg text-slate-400 hover:bg-slate-200 hover:text-slate-700 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="px-3.5 py-2 text-xs">
                    <ProfileRow label="Emp ID" value={user?.emp_id ? `#${user.emp_id}` : ''} />
                    <ProfileRow label="Department" value={user?.department} />
                    <ProfileRow label="Role" value={role || user?.role} />
                    <ProfileRow label="Firm" value={isUnauthorizedUser ? '' : firmLabel} />
                    <ProfileRow label="Mobile" value={user?.mobile_number} />
                  </div>
                  <div className="p-3 border-t border-slate-200">
                    <button
                      onClick={() => {
                        setProfileOpen(false);
                        logout();
                      }}
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-red-200 bg-red-50 text-[#a81b1e] text-xs font-bold hover:bg-red-100 transition cursor-pointer"
                    >
                      <LogOut className="w-4 h-4" />
                      Logout
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile: firm of users who cannot switch firms */}
      {!isUnauthorizedUser && !canSwitchFirms && (
        <div className="md:hidden flex items-center gap-1.5 px-3 py-1.5 border-t border-slate-200 bg-slate-50 text-[11px]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#a81b1e] shrink-0" />
          <span className="font-bold uppercase tracking-wider text-[#a81b1e]">Firm:</span>
          <span className="font-semibold text-slate-800 truncate">
            {isASM || isDistributor ? 'Sarthak TMT' : firmAccess?.firmName || 'Assigned Firm'}
          </span>
        </div>
      )}

      {/* Mobile / tablet Brand Switcher Bar */}
      {!isUnauthorizedUser && canSwitchFirms && (
        <div className="lg:hidden flex items-center overflow-x-auto no-scrollbar px-3 py-2 border-t border-slate-200 bg-slate-50 gap-1.5">
          {canAccessAllFirms && (
          <button
            onClick={() => setSelectedBrand('all')}
            className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap cursor-pointer ${selectedBrand === 'all'
              ? 'bg-white text-slate-900 shadow-xs border border-slate-200 font-bold'
              : 'text-slate-600'
              }`}
          >
            All
          </button>
          )}
          {switchBrands.map((b) => (
            <button
              key={b.id}
              onClick={() => setSelectedBrand(b.id)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap cursor-pointer ${selectedBrand === b.id
                ? 'bg-white text-slate-900 shadow-xs border border-slate-200 font-bold'
                : 'text-slate-600'
                }`}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: b.color }}
              />
              {b.name}
            </button>
          ))}
        </div>
      )}
    </header>
  );
};
