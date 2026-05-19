'use client';

interface Props {
  tc?: number;
}

const fmtARS = (val: number) =>
  `$${Math.round(Math.abs(val)).toLocaleString('es-AR')}`;

const fmtUSD = (val: number, tc: number) =>
  `u$s ${Math.round(Math.abs(val) / tc).toLocaleString('es-AR')}`;

// Each row: simulated (despues) value + badge showing improvement vs. antes
const ROWS = [
  {
    label:       'P. Equilibrio',
    despues:     11_083_333,
    antes:       14_318_182,
    format:      'ars'   as const,
    // PE went DOWN → good. Badge arrow points down.
    badgeArrow:  '↓',
    badgeDelta:  14_318_182 - 11_083_333,  // 3 234 849
    badgeFormat: 'ars'  as const,
  },
  {
    label:       'EBITDA',
    despues:     -26_300,
    antes:       -811_100,
    format:      'ars'   as const,
    // EBITDA went UP → good.
    badgeArrow:  '↑',
    badgeDelta:  -26_300 - (-811_100),     // 784 800
    badgeFormat: 'ars'  as const,
  },
  {
    label:       'ROS',
    despues:     -0.24,
    antes:       -5.24,
    format:      'pct'   as const,
    // ROS went UP → good.
    badgeArrow:  '↑',
    badgeDelta:  -0.24 - (-5.24),          // 5.0 pp
    badgeFormat: 'pp'   as const,
  },
];

export default function StrategicImpactCard({ tc = 1420 }: Props) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-2xl">

      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
        <h4 className="text-sm font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
          <span>⚡</span> Plan de Rescate Financiero
        </h4>
        <span className="text-xs bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full font-mono">
          MEP: ${tc.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
        </span>
      </div>

      {/* Column labels */}
      <div className="grid grid-cols-12 gap-2 px-1 mb-1">
        <div className="col-span-3 text-[9px] font-semibold text-slate-500 uppercase tracking-wider" />
        <div className="col-span-5 text-right text-[9px] font-semibold text-slate-500 uppercase tracking-wider">
          Simulado
        </div>
        <div className="col-span-4 text-right text-[9px] font-semibold text-slate-500 uppercase tracking-wider">
          Mejora
        </div>
      </div>

      {/* Metric rows */}
      <div className="space-y-1.5 font-mono text-xs">
        {ROWS.map(({ label, despues, format, badgeArrow, badgeDelta, badgeFormat }) => {
          const isNeg = despues < 0;
          const valueColor = isNeg ? 'text-amber-400' : 'text-emerald-400';

          const valueDisplay =
            format === 'pct'
              ? `${despues > 0 ? '+' : ''}${despues.toFixed(2)}%`
              : `${despues < 0 ? '-' : ''}${fmtARS(despues)}`;

          const usdDisplay =
            format === 'ars'
              ? `${despues < 0 ? '-' : ''}${fmtUSD(despues, tc)}`
              : null;

          const badgeDisplay =
            badgeFormat === 'pp'
              ? `${badgeArrow} ${badgeDelta.toFixed(1)} pp`
              : `${badgeArrow} ${fmtARS(badgeDelta)}`;

          return (
            <div
              key={label}
              className="grid grid-cols-12 gap-2 items-center bg-slate-950/50 px-2 py-2 rounded-lg"
            >
              {/* Label */}
              <div className="col-span-3 font-sans text-[11px] text-slate-400 font-medium leading-tight">
                {label}
              </div>

              {/* Simulated value */}
              <div className={`col-span-5 text-right tabular-nums ${valueColor}`}>
                <span className="block font-bold">{valueDisplay}</span>
                {usdDisplay && (
                  <span className="text-[10px] opacity-60">{usdDisplay}</span>
                )}
              </div>

              {/* Improvement badge */}
              <div className="col-span-4 flex justify-end">
                <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-900/30
                                 border border-emerald-800/60 px-1.5 py-0.5 rounded-md tabular-nums">
                  {badgeDisplay}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Consulting notes */}
      <div className="mt-4 pt-3 border-t border-slate-800/60 text-[11px] text-slate-400 space-y-2 font-sans">
        <p className="font-semibold text-slate-200">Indicaciones aplicadas:</p>
        <div className="flex gap-2 items-start">
          <span className="text-emerald-400 font-bold shrink-0">1.</span>
          <p>
            <strong className="text-slate-300">Guerra al Mix Perdedor:</strong>{' '}
            Reducción del Producto A (70% → 40%), derivando volumen hacia Producto B y C
            de mayor margen neto.
          </p>
        </div>
        <div className="flex gap-2 items-start">
          <span className="text-emerald-400 font-bold shrink-0">2.</span>
          <p>
            <strong className="text-slate-300">Pricing de Emergencia:</strong>{' '}
            Traslado del 15% de aumento solo en líneas premium (Prod B), absorbiendo
            inflación de costos y el 4% de IIBB.
          </p>
        </div>
      </div>
    </div>
  );
}
