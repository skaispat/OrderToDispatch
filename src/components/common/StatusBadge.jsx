import React from 'react';
import { Clock, CheckCircle2, Factory, Truck, PackageCheck, AlertCircle } from 'lucide-react';

const STATUS_CONFIG = {
  pending: {
    label: 'Order Placed',
    color: 'bg-amber-50 text-amber-800 border-amber-200',
    icon: Clock,
  },
  approved: {
    label: 'Approved',
    color: 'bg-indigo-50 text-indigo-800 border-indigo-200',
    icon: CheckCircle2,
  },
  in_production: {
    label: 'In Production',
    color: 'bg-purple-50 text-purple-800 border-purple-200',
    icon: Factory,
  },
  loading: {
    label: 'Loading Bay',
    color: 'bg-cyan-50 text-cyan-800 border-cyan-200',
    icon: PackageCheck,
  },
  in_transit: {
    label: 'In-Transit',
    color: 'bg-blue-50 text-blue-800 border-blue-200',
    icon: Truck,
  },
  partial: {
    label: 'Partially Dispatched',
    color: 'bg-blue-50 text-blue-800 border-blue-200',
    icon: Truck,
  },
  delivered: {
    label: 'Delivered',
    color: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    icon: CheckCircle2,
  },
};

export const StatusBadge = ({ status = 'pending', size = 'md' }) => {
  const config = STATUS_CONFIG[status] || {
    label: status,
    color: 'bg-slate-100 text-slate-700 border-slate-200',
    icon: AlertCircle,
  };
  const Icon = config.icon;

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-xs px-2.5 py-1',
    lg: 'text-sm px-3 py-1.5',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${config.color} ${
        sizeClasses[size] || sizeClasses.md
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      {config.label}
    </span>
  );
};
