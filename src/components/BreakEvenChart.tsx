'use client';
import {
  ComposedChart, Area, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine, ReferenceDot,
} from 'recharts';

const fmt = (v: number) => {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(0)}k`;
  return `$${v.toFixed(0)}`;
};

// Animated pulsing dot rendered at the breakeven intersection
const PulsingDot = (props: any) => {
  const { cx, cy } = props;
  if (!cx || !cy) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={10} fill="#059669" opacity={0.15}>
        <animate attributeName="r"       values="6;14;6"         dur="2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.2;0;0.2"      dur="2s" repeatCount="indefinite" />
      </circle>
      <circle cx={cx} cy={cy} r={4.5} fill="#059669" stroke="white" strokeWidth={1.5} />
    </g>
  );
};

const BreakevenChart = ({ data, breakEvenPoint }: { data: any[]; breakEvenPoint: number }) => {
  // Find the closest data point to the breakeven unit count for the animated dot
  const bepPoint = breakEvenPoint > 0 && data.length > 0
    ? data.reduce((c: any, d: any) =>
        Math.abs(d.units - breakEvenPoint) < Math.abs(c.units - breakEvenPoint) ? d : c
      )
    : null;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
        <defs>
          <linearGradient id="gradSales" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#059669" stopOpacity={0.15} />
            <stop offset="95%" stopColor="#059669" stopOpacity={0.01} />
          </linearGradient>
          <linearGradient id="gradCosts" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#dc2626" stopOpacity={0.12} />
            <stop offset="95%" stopColor="#dc2626" stopOpacity={0.01} />
          </linearGradient>
        </defs>

        <CartesianGrid strokeDasharray="3 4" stroke="#e2e8f0" vertical={false} />

        <XAxis
          dataKey="units"
          stroke="#e2e8f0"
          tick={{ fill: '#94a3b8', fontSize: 10, fontFamily: 'monospace' }}
          tickLine={false}
          axisLine={{ stroke: '#e2e8f0' }}
        />
        <YAxis
          stroke="#e2e8f0"
          tick={{ fill: '#94a3b8', fontSize: 10, fontFamily: 'monospace' }}
          tickFormatter={fmt}
          tickLine={false}
          axisLine={false}
          width={52}
        />

        <Tooltip
          contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
          labelStyle={{ color: '#94a3b8', fontSize: 10, marginBottom: 4 }}
          itemStyle={{ fontSize: 11, fontFamily: 'monospace', color: '#1e293b' }}
          formatter={(v: any, name: any) => [typeof v === 'number' ? fmt(v) : String(v), String(name ?? '')]}
          labelFormatter={(v) => `${v} unidades`}
          cursor={{ stroke: '#cbd5e1', strokeWidth: 1 }}
        />
        <Legend
          wrapperStyle={{ fontSize: 10, color: '#94a3b8', paddingTop: 8 }}
          iconType="plainline"
          iconSize={16}
        />

        <Area
          type="monotone"
          dataKey="totalSales"
          stroke="#059669"
          strokeWidth={1.8}
          fill="url(#gradSales)"
          fillOpacity={1}
          name="Ventas Totales"
          dot={false}
          activeDot={{ r: 3, fill: '#059669', stroke: 'white', strokeWidth: 1.5 }}
        />
        <Area
          type="monotone"
          dataKey="totalCosts"
          stroke="#dc2626"
          strokeWidth={1.8}
          fill="url(#gradCosts)"
          fillOpacity={1}
          name="Costos Totales"
          dot={false}
          activeDot={{ r: 3, fill: '#dc2626', stroke: 'white', strokeWidth: 1.5 }}
        />
        <Line
          type="monotone"
          dataKey="fixedCosts"
          stroke="#94a3b8"
          strokeWidth={1}
          strokeDasharray="4 3"
          name="Costos Fijos"
          dot={false}
        />

        {breakEvenPoint > 0 && (
          <ReferenceLine
            x={Math.round(breakEvenPoint)}
            stroke="#059669"
            strokeWidth={1}
            strokeDasharray="3 2"
            opacity={0.5}
            label={{ value: `P.E. ${Math.round(breakEvenPoint)}u`, position: 'insideTopRight', fill: '#059669', fontSize: 9, fontFamily: 'monospace' }}
          />
        )}

        {bepPoint && (
          <ReferenceDot
            x={bepPoint.units}
            y={bepPoint.totalSales}
            r={0}
            shape={<PulsingDot />}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
};

export default BreakevenChart;
