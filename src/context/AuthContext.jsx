import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { authApi } from '../api/authApi';
import { firmsApi } from '../api/firmsApi';
import { evaluateUserFirmAccess, buildFirmCatalog } from '../data/constants';
import { APP_PAGES, ACCESS_LEVELS, getPageAccessLevel, isSuperAdminUser } from '../data/pageAccess';

const AuthContext = createContext(null);

// Minimum gap between permission re-checks triggered by the browser tab regaining focus
const REVALIDATE_INTERVAL_MS = 60 * 1000;

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const lastValidatedRef = useRef(0);

  // Firms table rows (id, name, type): distributor firms = Sarthak, company firms = their own firm
  const [firms, setFirms] = useState([]);
  const userKey = user?.emp_id ?? null;
  const reloadFirms = useCallback(async () => {
    try {
      setFirms((await firmsApi.getFirms()) || []);
    } catch {
      // Built-in firm list is used until the firms table can be read
    }
  }, []);
  useEffect(() => {
    if (userKey === null) return;
    reloadFirms();
  }, [userKey, reloadFirms]);

  const firmCatalog = useMemo(() => buildFirmCatalog(firms), [firms]);

  // Firm data scope (which firm's records are shown) according to position & firm_id
  const firmAccess = useMemo(() => {
    return evaluateUserFirmAccess(user, firms);
  }, [user, firms]);

  // Super Admin: full access to every page and the only position that can open Settings
  const isSuperAdmin = useMemo(() => isSuperAdminUser(user), [user]);

  // Page access level ('none' | 'view' | 'edit') for every page, granted in Settings > Page Access
  const pageAccess = useMemo(() => {
    const levels = {};
    for (const page of APP_PAGES) {
      levels[page.id] = getPageAccessLevel(user, page.id);
    }
    levels.settings = getPageAccessLevel(user, 'settings');
    return levels;
  }, [user]);

  const canView = useCallback(
    (tabId) => getPageAccessLevel(user, tabId) !== ACCESS_LEVELS.NONE,
    [user]
  );

  const canEdit = useCallback(
    (tabId) => getPageAccessLevel(user, tabId) === ACCESS_LEVELS.EDIT,
    [user]
  );

  const canAccessSettings = isSuperAdmin;

  // All firms data is shown unless the user is locked to a firm / own records
  const canAccessAllFirms = Boolean(firmAccess?.canAccessAllFirms);

  // No position assigned -> no access to any module
  const isUnauthorizedUser = useMemo(() => {
    if (!user || isSuperAdmin) return false;
    return !String(user.position || '').trim();
  }, [user, isSuperAdmin]);

  // Determine if user is a distributor (data scope: own orders & dealers)
  const isDistributor = useMemo(() => {
    if (!user) return false;
    const pos = String(user.position || '').toLowerCase();
    const r = String(user.role || '').toLowerCase();
    return pos.includes('distributor') || r === 'distributor';
  }, [user]);

  // Project Manager position: can book Sarthak project orders (project_orders, OR/<FY>/SAR/<n>)
  const isProjectManager = useMemo(() => {
    if (!user) return false;
    const pos = String(user.position || '').toLowerCase();
    return pos.includes('project manager') || pos.includes('project manger');
  }, [user]);

  // Determine if user is an Area Sales Manager (ASM) or Sales Manager
  const isASM = useMemo(() => {
    if (!user) return false;
    const pos = String(user.position || '').toLowerCase();
    return pos.includes('asm') || pos.includes('area sales manager') || pos.includes('sales manager');
  }, [user]);

  // Determine if user is a salesperson, sales officer, or ASM (data scope: own booked orders, own attendance & visits)
  const isSalesPerson = useMemo(() => {
    if (!user || isDistributor || isSuperAdmin) return false;
    const pos = String(user.position || '').toLowerCase();
    const r = String(user.role || '').toLowerCase();
    const dept = String(user.department || '').toLowerCase();
    return (
      pos.includes('sales') ||
      pos.includes('asm') ||
      pos.includes('officer') ||
      r.includes('sales') ||
      dept.includes('sales')
    );
  }, [user, isDistributor, isSuperAdmin]);

  // Determine if user is a Manager locked to one firm (e.g. Rahul, Yash): sees that firm's project orders.
  // Project Managers use the regular Orders page (with the Sarthak project order option).
  const isManager = useMemo(() => {
    if (!user || isSuperAdmin || isDistributor || isProjectManager) return false;
    const pos = String(user.position || '').toLowerCase().trim();
    const isSalesOrASM = pos.includes('asm') || pos.includes('area sales') || pos.includes('sales');
    const isManagerPos = pos.includes('manager') || pos.includes('manger');
    return isManagerPos && !isSalesOrASM && !firmAccess?.canAccessAllFirms && Boolean(firmAccess?.firmId);
  }, [user, isSuperAdmin, isDistributor, isProjectManager, firmAccess]);

  // Re-read the user from the database so deactivation and access changes apply without re-login
  const refreshUser = useCallback(async () => {
    const currentUser = authApi.getCurrentUser();
    if (!currentUser) {
      setUser(null);
      return null;
    }
    try {
      const activeUser = await authApi.verifyUserActive(currentUser.emp_id);
      lastValidatedRef.current = Date.now();
      if (activeUser) {
        setUser(activeUser);
        return activeUser;
      }
      // Deactivated or removed by admin in users table
      await authApi.logout();
      setUser(null);
      return null;
    } catch {
      // Network/offline: keep the current session
      return currentUser;
    }
  }, []);

  useEffect(() => {
    const initAuth = async () => {
      const currentUser = authApi.getCurrentUser();
      if (!currentUser) {
        setUser(null);
        setLoading(false);
        return;
      }

      // Verify with database if user account is still active
      try {
        const activeUser = await authApi.verifyUserActive(currentUser.emp_id);
        lastValidatedRef.current = Date.now();
        if (activeUser) {
          setUser(activeUser);
        } else {
          // Deactivated by admin in users table
          await authApi.logout();
          setUser(null);
        }
      } catch (e) {
        // Fallback to saved session on network/offline
        setUser(currentUser);
      } finally {
        setLoading(false);
      }
    };

    initAuth();
  }, []);

  // Re-check access whenever the browser tab becomes visible again (throttled)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastValidatedRef.current < REVALIDATE_INTERVAL_MS) return;
      if (!authApi.getCurrentUser()) return;
      refreshUser();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refreshUser]);

  const login = async (username, password) => {
    setLoading(true);
    try {
      const loggedUser = await authApi.login(username, password);
      lastValidatedRef.current = Date.now();
      setUser(loggedUser);
      return loggedUser;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    await authApi.logout();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        role: user?.role || 'user',
        position: user?.position || null,
        firmId: firmAccess?.firmId || null,
        firmAccess,
        // Distributor accounts: their own distributor firm id (firm_id may also list granted company firms)
        distributorFirmId: firmAccess?.distributorFirmId ?? null,
        firms,
        firmCatalog,
        reloadFirms,
        pageAccess,
        canView,
        canEdit,
        isSuperAdmin,
        canAccessSettings,
        canAccessAllFirms,
        isUnauthorizedUser,
        isDistributor,
        isASM,
        isSalesPerson,
        isManager,
        isProjectManager,
        isAuthenticated: Boolean(user),
        loading,
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};
