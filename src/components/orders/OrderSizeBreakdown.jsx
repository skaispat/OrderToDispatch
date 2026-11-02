import React from 'react';
import { TMT_SIZES } from '../../data/constants';

export const OrderSizeBreakdown = ({ sizes = {} }) => {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-slate-50/70 p-3">
      <table className="w-full text-xs text-left">
        <thead>
          <tr className="border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
            <th className="py-2 px-3">Size</th>
            <th className="py-2 px-3 text-right">Ordered (MT)</th>
            <th className="py-2 px-3 text-right">Delivered (MT)</th>
            <th className="py-2 px-3 text-right">Pending (MT)</th>
            <th className="py-2 px-3 text-center">Fulfillment</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200/80 font-medium">
          {TMT_SIZES.map((size) => {
            const data = sizes[size] || { ordered: 0, delivered: 0 };
            const ordered = parseFloat(data.ordered) || 0;
            const delivered = parseFloat(data.delivered) || 0;
            const balance = Math.max(0, ordered - delivered);
            const percent = ordered > 0 ? Math.min(100, Math.round((delivered / ordered) * 100)) : 0;

            if (ordered === 0 && delivered === 0) return null;

            return (
              <tr key={size} className="hover:bg-white transition">
                <td className="py-2 px-3 font-bold text-slate-900">
                  {size}
                </td>
                <td className="py-2 px-3 text-right text-slate-700">
                  {ordered.toFixed(2)} MT
                </td>
                <td className="py-2 px-3 text-right text-[#a81b1e] font-semibold">
                  {delivered.toFixed(2)} MT
                </td>
                <td className="py-2 px-3 text-right text-amber-700 font-semibold">
                  {balance.toFixed(2)} MT
                </td>
                <td className="py-2 px-3">
                  <div className="flex items-center gap-2 justify-center">
                    <div className="w-20 bg-slate-200 h-1.5 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          percent === 100
                            ? 'bg-slate-700'
                            : percent > 0
                            ? 'bg-[#a81b1e]'
                            : 'bg-slate-300'
                        }`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <span className="text-[11px] font-bold text-slate-600 min-w-8 text-right">
                      {percent}%
                    </span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
