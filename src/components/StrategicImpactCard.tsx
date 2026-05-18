'use client';

interface Props {
  tc?: number;
}

const fmtARS = (val: number) =>
  `$${Math.abs(val).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;

const fmtUSD = (val: number, tc: number) =>
  `u$s ${Math.round(Math.abs(val) / tc).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

const sign = (val: number) => (val < 0 ? '-' : '');

export default function StrategicImpactCard({ tc = 1420 }: Props) {
  const rows: {
    label: string;
    antes: number;
    despues: number;
    format: 'ars' | 'pct';
    pctAntes?: string;
    pctDespues?: string;
  }[] = [
    { label: 'Punto de Equilibrio', antes: 14318182, despues: 9850000, format: 'ars' },
    { label: 'EBITDA Proyectado',   antes: -811100,  despues: 1150000,  format: 'ars' },
    { label: 'Rentabilidad (ROS)',  antes: 0,        despues: 0,        format: 'pct',
      pctAntes: '-5.24%', pctDespues: '+10.45%' },
  ];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
        <h4 className="text-sm font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
          <span>⚡</span> Plan de Rescate Financiero (Impacto)
        </h4>
        <span className="text-xs bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full font-mono">
          MEP: ${tc.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
        </span>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-12 gap-2 items-center px-2 mb-1">
        <div className="col-span-4" />
        <div className="col-span-4 text-right text-[9px] font-semibold text-slate-500 uppercase tracking-wider">
          Antes
        </div>
        <div className="col-span-4 text-right text-[9px] font-semibold text-slate-500 uppercase tracking-wider">
          Después
        </div>
      </div>

      {/* Comparison rows */}
      <div className="space-y-2 font-mono text-xs text-slate-300">
        {rows.map(({ label, antes, despues, format, pctAntes, pctDespues }) => (
          <div
            key={label}
            className="grid grid-cols-12 gap-2 items-center bg-slate-950/40 p-2 rounded-lg"
          >
            <div className="col-span-4 font-sans text-slate-400 font-medium text-[11px] leading-tight">
              {label}
            </div>

            {format === 'pct' ? (
              <>
                <div className="col-span-4 text-rose-400 text-right font-bold text-sm bg-rose-500/5 py-1 rounded">
                  {pctAntes}
                </div>
                <div className="col-span-4 text-emerald-400 text-right font-bold text-sm bg-emerald-500/5 py-1 rounded">
                  {pctDespues}
                </div>
              </>
            ) : (
              <>
                <div className="col-span-4 text-rose-400 text-right tabular-nums">
                  <span className="block font-bold">{sign(antes)}{fmtARS(antes)}</span>
                  <span className="text-[10px] opacity-70">{sign(antes)}{fmtUSD(antes, tc)}</span>
                </div>
                <div className="col-span-4 text-emerald-400 text-right tabular-nums">
                  <span className="block font-bold">{sign(despues)}{fmtARS(despues)}</span>
                  <span className="text-[10px] opacity-70">{sign(despues)}{fmtUSD(despues, tc)}</span>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Consulting notes */}
      <div className="mt-4 pt-3 border-t border-slate-800/60 text-[11px] text-slate-400 space-y-2 font-sans">
        <p className="font-semibold text-slate-200">Indicaciones aplicadas para revertir el escenario:</p>
        <div className="flex gap-2 items-start">
          <span className="text-emerald-400 font-bold shrink-0">1.</span>
          <p>
            <strong className="text-slate-300">Guerra al Mix Perdedor:</strong>{' '}
            Se redujo la exposición del Producto A (del 70% al 40%) derivando volumen
            comercial hacia el Producto B y C de mayor margen neto.
          </p>
        </div>
        <div className="flex gap-2 items-start">
          <span className="text-emerald-400 font-bold shrink-0">2.</span>
          <p>
            <strong className="text-slate-300">Pricing de Emergencia:</strong>{' '}
            Traslado inteligente del 15% de aumento solo en líneas premium (Prod B),
            absorbiendo el impacto de la inflación de costos y el 4% de IIBB.
          </p>
        </div>
      </div>
    </div>
  );
}
