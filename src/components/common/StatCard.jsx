import React from 'react';

export const StatCard = ({
  title,
  value,
  unit = 'MT',
  icon: Icon,
  textColor = 'text-blue-600',
  iconBg = 'bg-blue-50 text-blue-600',
  isLoading = false,
}) => {
  if (isLoading) {
    return (
      <div className="rounded-xl bg-white p-3.5 sm:p-5 border border-slate-200/80 shadow-xs animate-pulse">
        <div className="flex items-start justify-between">
          <div className="space-y-2.5 w-3/4">
            <div className="h-3 w-24 bg-slate-200 rounded"></div>
            <div className="flex items-baseline gap-2 pt-1">
              <div className="h-7 w-28 bg-slate-200 rounded"></div>
              {unit && <div className="h-3.5 w-8 bg-slate-100 rounded"></div>}
            </div>
          </div>

          <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
            <div className="w-5 h-5 bg-slate-200 rounded-sm"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-white p-3.5 sm:p-5 border border-slate-200/80 shadow-xs transition-all hover:shadow-md min-w-0">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-500 leading-tight">
            {title}
          </p>
          <div className="mt-1.5 sm:mt-2 flex flex-wrap items-baseline gap-x-2">
            <span className="text-xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
              {value}
            </span>
            {unit && (
              <span className={`text-xs font-bold ${textColor}`}>
                {unit}
              </span>
            )}
          </div>
        </div>

        {Icon && (
          <div className={`p-2 sm:p-3 rounded-xl shrink-0 ${iconBg}`}>
            <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
        )}
      </div>
    </div>
  );
};

