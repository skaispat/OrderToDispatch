import React from 'react';
import { TMT_BRANDS } from '../../data/constants';

export const BrandBadge = ({ brandId, showDot = true, size = 'md' }) => {
  const brand = TMT_BRANDS.find((b) => b.id === brandId) || {
    name: brandId || 'TMT',
    color: '#64748b',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
  };

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-xs px-2.5 py-1',
    lg: 'text-sm px-3.5 py-1.5 font-semibold',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${brand.badgeClass} ${sizeClasses[size] || sizeClasses.md}`}
    >
      {showDot && (
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: brand.color }}
        />
      )}
      {brand.name}
    </span>
  );
};
