import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';

const AppContext = createContext(null);

export const AppProvider = ({ children }) => {
  const { firmAccess } = useAuth();
  const [selectedBrand, setSelectedBrand] = useState('all'); // 'all', 'sarthak', 'jsw', 'essar'
  const [refreshKey, setRefreshKey] = useState(0);
  const [toast, setToast] = useState(null);

  // Keep selectedBrand within the firms the user may see (single or multiple assigned firms)
  useEffect(() => {
    if (firmAccess?.canAccessAllFirms) return;
    const allowed = firmAccess?.allowedBrands || [];
    setSelectedBrand((prev) => (allowed.includes(prev) ? prev : firmAccess?.brandId || 'sarthak'));
  }, [firmAccess]);

  const triggerRefresh = () => {
    setRefreshKey((prev) => prev + 1);
  };

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  return (
    <AppContext.Provider
      value={{
        selectedBrand,
        setSelectedBrand,
        refreshKey,
        triggerRefresh,
        toast,
        showToast,
      }}
    >
      {children}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg border text-xs font-semibold bg-white border-slate-200 text-slate-800">
          <span
            className={`w-2 h-2 rounded-full ${
              toast.type === 'success'
                ? 'bg-emerald-500'
                : toast.type === 'error'
                ? 'bg-red-500'
                : 'bg-blue-500'
            }`}
          />
          {toast.message}
        </div>
      )}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within an AppProvider');
  return ctx;
};
