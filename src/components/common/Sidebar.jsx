import React, { useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { APP_PAGES } from '../../data/pageAccess';
import {
  LayoutDashboard,
  ShoppingCart,
  Truck,
  Building2,
  Store,
  Settings,
  CalendarCheck,
  MapPin,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Factory,
  X,
} from 'lucide-react';

const MOBILE_QUERY = '(max-width: 767px)';
const isMobileViewport = () => typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches;

export const Sidebar = ({ activeTab, onSelectTab, isOpen, onToggle, onClose }) => {
  const { user, role, logout, isSuperAdmin, isDistributor, isASM, isSalesPerson, isManager, isUnauthorizedUser, pageAccess } = useAuth();

  // Pages are shown only when granted in Settings > Page Access (Super Admin sees every page + Settings).
  // Labels follow the user's data scope (e.g. distributors see "My Orders").
  const isSalesRole = isASM || isSalesPerson;

  const PAGE_ICONS = {
    dashboard: LayoutDashboard,
    orders: ShoppingCart,
    dispatch: Truck,
    attendance: CalendarCheck,
    'sales-visits': MapPin,
    distributors: Building2,
    firms: Factory,
  };

  const pageLabel = (page) => {
    if (page.id === 'orders') {
      if (isManager) return 'Project Orders';
      if (isDistributor) return 'My Orders';
      if (isSalesRole) return 'Orders & Bookings';
    }
    if (page.id === 'distributors' && isDistributor) return 'My Dealers';
    return page.label;
  };

  const navigation = isUnauthorizedUser
    ? []
    : [
      ...APP_PAGES.filter((page) => pageAccess?.[page.id] && pageAccess[page.id] !== 'none').map((page) => ({
        id: page.id,
        label: pageLabel(page),
        icon: page.id === 'distributors' && isDistributor ? Store : PAGE_ICONS[page.id],
        viewOnly: pageAccess[page.id] === 'view',
      })),
      ...(isSuperAdmin
        ? [
          {
            id: 'settings',
            label: 'Settings',
            icon: Settings,
          },
        ]
        : []),
    ];

  // Mobile drawer: lock page scroll while open, close with Escape, close when switching to desktop width
  useEffect(() => {
    if (!isOpen || !isMobileViewport()) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => {
      if (e.key === 'Escape' && onClose) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [isOpen, onClose]);

  const closeOnMobile = () => {
    if (isMobileViewport() && onClose) onClose();
  };

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-xs md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Wrapper with Centered Line Toggle Arrow */}
      <div className="relative shrink-0 z-50 md:z-40">
        {/* Sidebar Panel: full-height drawer on mobile, collapsible column on desktop */}
        <aside
          aria-label="Main navigation"
          className={`fixed inset-y-0 left-0 h-dvh w-72 max-w-[85vw] md:max-w-none md:sticky md:top-16 md:bottom-auto md:h-[calc(100vh-4rem)] border-r border-slate-200 bg-white transition-all duration-300 ease-in-out flex flex-col justify-between overflow-y-auto ${isOpen
            ? 'p-3.5 translate-x-0 shadow-2xl md:shadow-none md:w-64'
            : '-translate-x-full pointer-events-none md:translate-x-0 md:w-0 md:p-0 md:overflow-hidden md:border-r-0'
            }`}
        >
          {/* Mobile drawer header */}
          <div className="flex items-center justify-between pb-3 mb-2 border-b border-slate-200 md:hidden">
            <span className="text-sm font-black text-slate-900 tracking-tight">Order to Dispatch</span>
            <button
              onClick={onClose}
              aria-label="Close menu"
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Links */}
          <div className="space-y-1 pt-1 flex-1">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onSelectTab(item.id);
                    closeOnMobile();
                  }}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 md:py-2 text-left text-sm md:text-xs font-semibold transition cursor-pointer ${isActive
                    ? 'bg-red-50 text-[#a81b1e] font-bold border-l-3 border-[#a81b1e]'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                >
                  <Icon
                    className={`w-4 h-4 ${isActive ? 'text-[#a81b1e]' : 'text-slate-400'
                      }`}
                  />
                  <span className="flex-1">{item.label}</span>
                  {item.viewOnly && (
                    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200">
                      View
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Footer: User Account Info & Logout Button */}
          <div className="pt-3 mt-3 border-t border-slate-200/80 space-y-2.5">
            <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg bg-slate-50 border border-slate-100">
              <div className="w-8 h-8 rounded-full bg-red-50 text-[#a81b1e] border border-red-200 font-extrabold text-xs flex items-center justify-center shrink-0">
                {(user?.full_name || user?.username || 'U').charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <p className="text-xs font-bold text-slate-900 truncate">
                    {user?.full_name || user?.name || user?.username || 'Employee'}
                  </p>
                </div>
                <p className="text-[10px] font-semibold text-[#a81b1e] capitalize truncate">
                  {user?.position || user?.department || role} &bull; ID: {user?.emp_id || '—'}
                </p>
              </div>
            </div>

            <button
              onClick={logout}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-red-50 hover:bg-[#a81b1e] text-[#a81b1e] hover:text-white border border-red-200 hover:border-[#a81b1e] py-2 text-xs font-bold transition shadow-2xs cursor-pointer group"
            >
              <LogOut className="w-3.5 h-3.5 transition group-hover:scale-110" />
              <span>Sign Out</span>
            </button>
          </div>
        </aside>

        {/* Arrow Toggle Button: Center of the dividing line of the sidebar at exact same height */}
        <button
          onClick={onToggle || onClose}
          title={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          className={`hidden md:flex absolute z-50 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white border border-slate-300 text-slate-600 hover:text-[#a81b1e] hover:border-[#a81b1e] hover:bg-red-50 shadow-sm items-center justify-center transition-all duration-300 cursor-pointer ${isOpen ? 'left-[244px]' : 'left-0'
            }`}
        >
          {isOpen ? (
            <ChevronLeft className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
    </>
  );
};
