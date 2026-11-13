import React, { useState, useMemo, Suspense, lazy } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppProvider } from './context/AppContext';
import { Navbar } from './components/common/Navbar';
import { Sidebar } from './components/common/Sidebar';

// Pages
import { Login } from './pages/Login';
import { ShieldAlert } from 'lucide-react';
import { APP_PAGES } from './data/pageAccess';
import { useRoute, pathFor, parsePath, safeRedirectPath, loginPathFor } from './routes';

// Pages load on first visit (keeps the initial download small)
const AdminDashboard = lazy(() => import('./pages/AdminDashboard').then((m) => ({ default: m.AdminDashboard })));
const DistributorDashboard = lazy(() => import('./pages/DistributorDashboard').then((m) => ({ default: m.DistributorDashboard })));
const OrdersPage = lazy(() => import('./pages/OrdersPage').then((m) => ({ default: m.OrdersPage })));
const DispatchPage = lazy(() => import('./pages/DispatchPage').then((m) => ({ default: m.DispatchPage })));
const DistributorPage = lazy(() => import('./pages/DistributorPage').then((m) => ({ default: m.DistributorPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const ProjectOrdersPage = lazy(() => import('./pages/ProjectOrdersPage').then((m) => ({ default: m.ProjectOrdersPage })));
const AttendancePage = lazy(() => import('./pages/AttendancePage').then((m) => ({ default: m.AttendancePage })));
const SalesVisitsPage = lazy(() => import('./pages/SalesVisitsPage').then((m) => ({ default: m.SalesVisitsPage })));
const FirmsPage = lazy(() => import('./pages/FirmsPage').then((m) => ({ default: m.FirmsPage })));
const PendencyReportPage = lazy(() => import('./pages/PendencyReportPage').then((m) => ({ default: m.PendencyReportPage })));
const DailySalesVisitPage = lazy(() => import('./pages/DailySalesVisitPage').then((m) => ({ default: m.DailySalesVisitPage })));

const PageLoader = () => (
  <div className="min-h-[40vh] flex items-center justify-center text-slate-500 text-xs">
    <div className="flex items-center gap-2">
      <div className="w-4 h-4 border-2 border-[#a81b1e] border-t-transparent rounded-full animate-spin" />
      <span>Loading...</span>
    </div>
  </div>
);

const NoPageAccess = ({ user, onLogout }) => (
  <div className="min-h-[60vh] flex items-center justify-center p-6">
    <div className="max-w-md w-full rounded-2xl border border-amber-200 bg-white p-8 text-center shadow-sm space-y-4">
      <div className="mx-auto w-12 h-12 rounded-full bg-amber-50 text-amber-700 flex items-center justify-center border border-amber-200">
        <ShieldAlert className="w-6 h-6" />
      </div>
      <div>
        <h2 className="text-lg font-extrabold text-slate-900">No Pages Assigned</h2>
        <p className="text-xs text-slate-500 mt-1">
          Your account is active, but no page access has been granted yet. Please contact your Super Admin to assign access.
        </p>
      </div>
      <div className="p-3 rounded-lg bg-slate-50 text-[11px] text-slate-600 font-medium border border-slate-200 text-left space-y-1">
        <p>
          <strong>User:</strong> {user?.full_name || user?.username}
        </p>
        <p>
          <strong>Position:</strong> {user?.position || 'Unassigned'}
        </p>
      </div>
      <button
        onClick={onLogout}
        className="w-full rounded-lg bg-[#a81b1e] hover:bg-[#8e1518] py-2 text-xs font-bold text-white transition cursor-pointer"
      >
        Sign Out
      </button>
    </div>
  </div>
);

const MainLayout = () => {
  const {
    user,
    isAuthenticated,
    isSuperAdmin,
    isUnauthorizedUser,
    isDistributor,
    isManager,
    canView,
    pageAccess,
    logout,
    loading,
  } = useAuth();
  const route = useRoute();
  const [isSidebarOpen, setIsSidebarOpen] = useState(
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true
  );

  // Pages this user may open, in sidebar order (Super Admin: all pages + Settings)
  const allowedTabs = useMemo(() => {
    const tabs = APP_PAGES.filter((p) => pageAccess?.[p.id] && pageAccess[p.id] !== 'none').map((p) => p.id);
    if (isSuperAdmin) tabs.push('settings');
    return tabs;
  }, [pageAccess, isSuperAdmin]);

  // On /login (already signed in) open the page from ?redirect=, else the URL's own page
  const redirectPath = route.isLogin
    ? safeRedirectPath(new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search).get('redirect'))
    : null;
  const target = redirectPath ? parsePath(redirectPath) : route;

  // Page from the URL; never render a page the user has no access to, even for a single frame
  const currentTab = target.tab && canView(target.tab) ? target.tab : allowedTabs[0] || null;
  const settingsSection = target.section || 'users';
  const goTo = (tab, section) => route.navigate(pathFor(tab, section));

  // Signed out: every URL goes to /login (remembering a known page to return to after login)
  React.useEffect(() => {
    if (loading || isAuthenticated || route.isLogin) return;
    route.navigate(loginPathFor(route.pathname), { replace: true });
  }, [loading, isAuthenticated, route]);

  // Keep the URL in sync: "/" , unknown or not-permitted paths go to the user's first allowed page
  React.useEffect(() => {
    if (loading || !isAuthenticated || !currentTab) return;
    const expected = pathFor(currentTab, currentTab === 'settings' ? settingsSection : null);
    if (route.pathname !== expected) {
      route.navigate(expected, { replace: true });
    }
  }, [loading, isAuthenticated, currentTab, settingsSection, route]);

  // Browser tab title per page
  React.useEffect(() => {
    if (!loading && !isAuthenticated) {
      document.title = 'Login | Sarthak TMT O2D Portal';
      return;
    }
    const page = APP_PAGES.find((p) => p.id === currentTab);
    const label = currentTab === 'settings' ? 'Settings' : page?.label;
    document.title = label ? `${label} | Sarthak TMT O2D Portal` : 'Sarthak TMT | Order-to-Dispatch (O2D) Portal';
  }, [currentTab, loading, isAuthenticated]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-[#a81b1e] border-t-transparent rounded-full animate-spin" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login />;
  }

  // Render active view based on selected tab
  const renderContent = () => {
    // No position assigned -> restricted notice only
    if (isUnauthorizedUser) {
      return <AdminDashboard />;
    }

    if (!currentTab) {
      return <NoPageAccess user={user} onLogout={logout} />;
    }

    switch (currentTab) {
      case 'dashboard':
        if (isDistributor) {
          return (
            <DistributorDashboard
              onNavigateToOrders={canView('orders') ? () => goTo('orders') : undefined}
            />
          );
        }
        return <AdminDashboard />;
      case 'orders':
        // Managers with an assigned firm work on that firm's project orders
        return isManager ? <ProjectOrdersPage /> : <OrdersPage />;
      case 'dispatch':
        return <DispatchPage />;
      case 'pendency':
        return <PendencyReportPage />;
      case 'attendance':
        return <AttendancePage />;
      case 'sales-visits':
        return <SalesVisitsPage />;
      case 'daily-sales-visit':
        return <DailySalesVisitPage />;
      case 'distributors':
        return <DistributorPage />;
      case 'firms':
        return <FirmsPage />;
      case 'settings':
        return isSuperAdmin ? (
          <SettingsPage initialTab={settingsSection} onTabChange={(section) => goTo('settings', section)} />
        ) : null;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col text-slate-900">
      <Navbar onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)} />

      <div className="flex flex-1 relative">
        <Sidebar
          activeTab={currentTab}
          onSelectTab={(tab) => goTo(tab)}
          isOpen={isSidebarOpen}
          onToggle={() => setIsSidebarOpen((prev) => !prev)}
          onClose={() => setIsSidebarOpen(false)}
        />

        <main className="flex-1 p-3 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full overflow-y-auto transition-all duration-300">
          <Suspense fallback={<PageLoader />}>{renderContent()}</Suspense>
        </main>
      </div>
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <MainLayout />
      </AppProvider>
    </AuthProvider>
  );
}
