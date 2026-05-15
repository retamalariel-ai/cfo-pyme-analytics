'use client';

import { useMemo } from 'react';
import { calculateBreakeven } from '../lib/calculations';
import type { Product } from '../lib/types';

interface Props {
  products: Product[];
  fixedCosts: number;
  variableTax: number;
  projectedSales: number;
}

const PRICE_VARS = [-10, -5, 0, 5, 10];
const COST_VARS  = [-10, -5, 0, 5, 10];

const varLabel = (v: number) => (v > 0 ? `+${v}%` : `${v}%`);

const cellStyle = (ebitda: number) => {
  if (!isFinite(ebitda) || isNaN(ebitda)) return 'bg-slate-50 text-slate-400';
  if (ebitda > 0) return 'bg-emerald-50 text-emerald-800';
  return 'bg-red-50 text-red-800';
};

const fmtCell = (v: number) => {
  if (!isFinite(v) || isNaN(v)) return '—';
  const neg = v < 0;
  const a   = Math.abs(v);
  const p   = neg ? '-$' : '$';
  if (a >= 1_000_000) return `${p}${(a / 1_000_000).toFixed(1)}M`;
  if (a >= 1_000)     return `${p}${(a / 1_000).toFixed(1)}k`;
  return `${p}${a.toFixed(0)}`;
};

export default function SensitivityMatrix({ products, fixedCosts, variableTax, projectedSales }: Props) {
  const grid = useMemo(() => {
    if (products.length === 0 || projectedSales <= 0) return null;
    return PRICE_VARS.map(pv =>
      COST_VARS.map(cv => {
        const adj = products.map(p => ({
          ...p,
          price:        p.price        * (1 + pv / 100),
          variableCost: p.variableCost * (1 + cv / 100),
        }));
        const r = calculateBreakeven(adj, fixedCosts, variableTax);
        return projectedSales * (r.averageContributionMargin / 100) - fixedCosts;
      })
    );
  }, [products, fixedCosts, variableTax, projectedSales]);

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-widest">
            Matriz de Sensibilidad
          </h3>
          <p className="text-[10px] text-slate-400 mt-0.5">
            EBITDA estimado · Precio ↕ vs. Costos Variables ↔
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {[
            { color: 'bg-emerald-500', label: 'Ganancia' },
            { color: 'bg-red-500',     label: 'Pérdida'  },
          ].map(({ color, label }) => (
            <span key={label} className="flex items-center gap-1 text-[9px] text-slate-500 uppercase tracking-wider">
              <span className={`h-2 w-2 rounded-sm ${color}`} />
              {label}
            </span>
          ))}
        </div>
      </div>

      {!grid ? (
        <p className="text-xs text-slate-400 py-4 text-center">
          Ingresá productos y ventas proyectadas para ver la matriz.
        </p>
      ) : (
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full min-w-[400px] border-collapse text-center">
            <thead>
              <tr>
                <th className="pb-2 pr-3 text-left">
                  <span className="text-[9px] text-slate-500 uppercase tracking-wider leading-tight block">
                    Precio ↓
                  </span>
                  <span className="text-[9px] text-slate-400 uppercase tracking-wider block">
                    C.Var →
                  </span>
                </th>
                {COST_VARS.map(cv => (
                  <th key={cv} className="pb-2 px-3 text-[10px] font-bold text-slate-900 uppercase tracking-wider">
                    {varLabel(cv)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.map((row, ri) => (
                <tr key={PRICE_VARS[ri]} className="h-11">
                  <td className="pr-3 text-left text-[10px] font-bold text-slate-900 uppercase tracking-wider">
                    {varLabel(PRICE_VARS[ri])}
                  </td>
                  {row.map((ebitda, ci) => (
                    <td
                      key={COST_VARS[ci]}
                      className={`px-3 py-2.5 font-mono text-xs font-semibold rounded-sm
                                  border border-slate-100 ${cellStyle(ebitda)}`}
                    >
                      {fmtCell(ebitda)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
