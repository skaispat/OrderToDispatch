import { useState, useEffect, useCallback } from 'react';

// URL path for each page. Settings has one sub-page: /settings/users
export const TAB_PATHS = {
  dashboard: '/dashboard',
  orders: '/orders',
  dispatch: '/dispatch',
  pendency: '/pendency-report',
  attendance: '/attendance',
  'sales-visits': '/sales-visits',
  'daily-sales-visit': '/daily-sales-visit',
  distributors: '/distributors',
  firms: '/firms',
  settings: '/settings',
};

export const SETTINGS_SECTIONS = ['users'];

export const LOGIN_PATH = '/login';

const PATH_TO_TAB = Object.fromEntries(Object.entries(TAB_PATHS).map(([tab, path]) => [path.slice(1), tab]));
// Old / alternative URLs that point to an existing page
PATH_TO_TAB.dealers = 'distributors';

const NAVIGATE_EVENT = 'o2d:navigate';

/** Parses a pathname into { tab, section }. Unknown paths give tab = null. */
export function parsePath(pathname) {
  const segments = String(pathname || '/')
    .toLowerCase()
    .split('/')
    .filter(Boolean);
  if (segments[0] === 'login') return { tab: null, section: null, isLogin: true };
  // Old URL: Firms used to live under Settings
  if (segments[0] === 'settings' && segments[1] === 'firms') return { tab: 'firms', section: null, isLogin: false };
  const tab = PATH_TO_TAB[segments[0]] || null;
  const section = tab === 'settings' && SETTINGS_SECTIONS.includes(segments[1]) ? segments[1] : null;
  return { tab, section, isLogin: false };
}

/**
 * Page path to return to after login, from ?redirect=. Only same-site paths of known pages are
 * accepted (blocks open redirects such as //evil.com or https://...).
 */
export function safeRedirectPath(value) {
  const path = String(value || '');
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return null;
  const { tab, section } = parsePath(path.split(/[?#]/)[0]);
  return tab ? pathFor(tab, section) : null;
}

/** Login URL that brings the user back to `fromPath` after signing in (when it is a known page). */
export function loginPathFor(fromPath) {
  const back = safeRedirectPath(fromPath);
  return back ? `${LOGIN_PATH}?redirect=${encodeURIComponent(back)}` : LOGIN_PATH;
}

export function pathFor(tab, section) {
  const base = TAB_PATHS[tab] || '/';
  return tab === 'settings' && section ? `${base}/${section}` : base;
}

/** Changes the URL without reloading the page. */
export function navigate(path, { replace = false } = {}) {
  if (typeof window === 'undefined') return;
  if (window.location.pathname === path) return;
  window.history[replace ? 'replaceState' : 'pushState']({}, '', path);
  window.dispatchEvent(new Event(NAVIGATE_EVENT));
}

/** Current route, kept in sync with browser back / forward and navigate(). */
export function useRoute() {
  const [pathname, setPathname] = useState(() =>
    typeof window === 'undefined' ? '/' : window.location.pathname
  );

  useEffect(() => {
    const sync = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', sync);
    window.addEventListener(NAVIGATE_EVENT, sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener(NAVIGATE_EVENT, sync);
    };
  }, []);

  const go = useCallback((path, options) => navigate(path, options), []);

  return { pathname, ...parsePath(pathname), navigate: go };
}
