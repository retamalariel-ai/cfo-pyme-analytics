'use client';

import { useMemo } from 'react';
import { calculateBreakeven } from '../lib/calculations';
import type { Product } from '../lib/types';

export interface BaselineSnapshot {
  products:      Product[];
  fixedCosts:    number;
  variableTax:   number;
  projectedSales: number;
}

interface Props {
  baseline:        BaselineSnapshot | null;
  current:         BaselineSnapshot;
  tc:              number;
  onClearBaseline: () => void;
}

const fmtARS = (v: number) =>
  `${v < 0 ? '-' : ''}$${Math.round(Math.abs(v)).toLocaleString('es-AR')}`;

const safeDisplay = (v: number | null, format: 'ars' | 'pct'): string => {
  if (v == null || !isFinite(v) || isNaN(v)) return '—';
  return format === 'pct'
    ? `${v >= 0 ? (v > 0 ? '+' : '') : ''}${v.toFixed(2)}%`
    : fmtARS(v);
};

const computeMetrics = (snap: BaselineSnapshot) => {
  if (snap.products.length === 0) return null;
  const r   = calculateBreakeven(snap.products, snap.fixedCosts, snap.variableTax);
  const cmr = r.averageContributionMargin / 100;
  const ebitda = isFinite(cmr) && cmr > 0
    ? snap.projectedSales * cmr - snap.fixedCosts
    : null;
  const ros = ebitda != null && snap.projectedSales > 0
    ? (ebitda / snap.projectedSales) * 100
    : null;
  return { breakEvenSales: r.breakEvenSales, ebitda, ros };
};

export default function StrategicImpactCard({ baseline, current, tc, onClearBaseline }: Props) {
  const cur = useMemo(() => computeMetrics(current),  [current]);
  const bas = useMemo(() => (baseline ? computeMetrics(baseline) : null), [baseline]);

  const rows = useMemo(() => {
    if (!bas || !cur) return null;
    return [
      { label: 'P. Equilibrio', antes: bas.breakEvenSales, despues: cur.breakEvenSales, format: 'ars' as const, lowerIsBetter: true  },
      { label: 'EBITDA',        antes: bas.ebitda,          despues: cur.ebitda,          format: 'ars' as const, lowerIsBetter: false },
      { label: 'ROS',           antes: bas.ros,             despues: cur.ros,             format: 'pct' as const, lowerIsBetter: false },
    ];
  }, [bas, cur]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-2xl">

      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
        <h4 className="text-sm font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
          <span>⚡</span> Comparativa de Escenarios
        </h4>
        <span className="text-xs bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full font-mono">
          MEP: ${tc.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
        </span>
      </div>

      {!baseline || !bas ? (
        <div className="py-6 text-center space-y-1.5">
          <p className="text-xs text-slate-400 font-medium">Sin escenario base</p>
          <p className="text-[10px] text-slate-600 leading-relaxed">
            Configurá un escenario y presioná{' '}
            <span className="text-slate-400 font-semibold">Fijar base</span>{' '}
            en el encabezado para comparar.
          </p>
        </div>
      ) : (
        <>
          {/* Column labels */}
          <div className="grid grid-cols-12 gap-1 px-2 mb-1">
            <div className="col-span-3" />
            <div className="col-span-3 text-right text-[9px] font-semibold text-slate-600 uppercase tracking-wider">
              Base
            </div>
            <div className="col-span-3 text-right text-[9px] font-semibold text-slate-500 uppercase tracking-wider">
              Actual
            </div>
            <div className="col-span-3 text-right text-[9px] font-semibold text-slate-500 uppercase tracking-wider">
              Delta
            </div>
          </div>

          {/* Metric rows */}
          <div className="space-y-1.5 font-mono text-xs">
            {rows?.map(({ label, antes, despues, format, lowerIsBetter }) => {
              const antesV   = antes   as number | null;
              const despuesV = despues as number | null;

              const rawDelta  = antesV != null && despuesV != null ? despuesV - antesV : null;
              const improved  = rawDelta == null ? null
                : lowerIsBetter ? rawDelta < 0 : rawDelta > 0;
              const neutral   = rawDelta != null && Math.abs(rawDelta) < 0.005;

              const arrow =
                rawDelta == null || neutral ? '→'
                : rawDelta < 0 ? '↓' : '↑';

              const badgeColor =
                neutral || improved == null
                  ? 'text-slate-400 bg-slate-800 border-slate-700'
                  : improved
                    ? 'text-emerald-400 bg-emerald-900/30 border-emerald-800/60'
                    : 'text-rose-400 bg-rose-900/30 border-rose-800/60';

              const fmtDelta = () => {
                if (rawDelta == null) return '—';
                const abs = Math.abs(rawDelta);
                return format === 'pct'
                  ? `${arrow} ${abs.toFixed(1)} pp`
                  : `${arrow} ${fmtARS(abs)}`;
              };

              const despuesColor =
                despuesV == null || !isFinite(despuesV) ? 'text-slate-500'
                : despuesV < 0 ? 'text-amber-400' : 'text-emerald-400';

              return (
                <div key={label} className="grid grid-cols-12 gap-1 items-center bg-slate-950/50 px-2 py-2 rounded-lg">
                  <div className="col-span-3 font-sans text-[11px] text-slate-400 font-medium leading-tight truncate">
                    {label}
                  </div>
                  <div className="col-span-3 text-right tabular-nums text-slate-600 text-[10px]">
                    {safeDisplay(antesV, format)}
                  </div>
                  <div className={`col-span-3 text-right tabular-nums font-bold text-[11px] ${despuesColor}`}>
                    {safeDisplay(despuesV, format)}
                  </div>
                  <div className="col-span-3 flex justify-end">
                    <span className={`text-[10px] font-semibold border px-1.5 py-0.5 rounded-md tabular-nums whitespace-nowrap ${badgeColor}`}>
                      {fmtDelta()}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="mt-3 pt-2.5 border-t border-slate-800/60 flex items-center justify-between">
            <p className="text-[10px] text-slate-600">
              Modificá parámetros para ver el impacto en tiempo real
            </p>
            <button
              onClick={onClearBaseline}
              className="text-[10px] text-slate-600 hover:text-rose-400 transition-colors"
            >
              Limpiar
            </button>
          </div>
        </>
      )}
    </div>
  );
}
