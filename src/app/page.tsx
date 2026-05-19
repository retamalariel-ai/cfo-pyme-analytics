'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { FiTrash2, FiPlus, FiFileText, FiLogOut, FiAlertTriangle,
         FiTrendingUp, FiShield, FiCalendar, FiFlag, FiActivity,
         FiGrid, FiList, FiBookmark } from 'react-icons/fi';
import { calculateBreakeven, getFinancialHealth, calculateStrategicKPIs } from '../lib/calculations';
import { getInitialProducts, saveScenario, supabase } from '../lib/database';
import type { ScenarioRecord } from '../lib/database';
import type { CostItem, Product } from '../lib/types';
import ScenarioSelector from '../components/ScenarioSelector';
import FixedCostsEditor from '../components/FixedCostsEditor';
import Tooltip from '../components/Tooltip';
import SensitivityMatrix from '../components/SensitivityMatrix';
import SafeNumberInput from '../components/SafeNumberInput';
import StrategicImpactCard, { type BaselineSnapshot } from '../components/StrategicImpactCard';

const BreakevenChart = dynamic(() => import('@/components/BreakEvenChart'), { ssr: false });

// ── Design tokens ─────────────────────────────────────────────────────────────
const CARD =
  'bg-slate-900 rounded-2xl border border-slate-800 ' +
  'shadow-[0_1px_4px_rgba(0,0,0,0.3),0_8px_24px_rgba(0,0,0,0.4)]';
const INPUT_CLS =
  'bg-slate-800 border border-slate-700 rounded-xl text-slate-100 font-mono text-sm ' +
  'focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 ' +
  'transition-all duration-150 placeholder-slate-500 hover:border-slate-600';
const LABEL = 'block mb-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider';
const SLABEL = 'text-[10px] font-semibold text-slate-400 uppercase tracking-wider';

type EditableField = 'price' | 'variableCost' | 'mixPercentage';
type MobileTab = 'sim' | 'matrix' | 'structure';
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// ── Helpers ───────────────────────────────────────────────────────────────────
const safeN = (v: number) => (isFinite(v) && !isNaN(v) ? v : 0);
const fmtM = (v: number | null): string => {
  if (v == null || !isFinite(v) || isNaN(v)) return '—';
  const sign = v < 0 ? '-' : '';
  return `${sign}$${Math.round(Math.abs(v)).toLocaleString('es-AR')}`;
};
const fmtP  = (v: number | null) =>
  v != null && isFinite(v) && !isNaN(v) ? `${v.toFixed(1)}%` : '—';

const HEALTH_STYLES = {
  healthy:      { badge: 'bg-emerald-900/30 text-emerald-400 border-emerald-800', dot: 'bg-emerald-400' },
  moderate:     { badge: 'bg-amber-900/30 text-amber-400 border-amber-800',       dot: 'bg-amber-400'   },
  risk:         { badge: 'bg-rose-900/30 text-rose-400 border-rose-800',          dot: 'bg-rose-400'    },
  insufficient: { badge: 'bg-slate-800 text-slate-400 border-slate-700',          dot: 'bg-slate-500'   },
};

const INITIAL_COST_ITEMS: CostItem[] = [
  { id: 1, name: 'Alquiler',  amount: 5000 },
  { id: 2, name: 'Sueldos',   amount: 4000 },
  { id: 3, name: 'Servicios', amount: 1000 },
];

const TIP = {
  breakEvenSales:  'Monto total de ventas necesario para cubrir todos los costos fijos y variables sin generar pérdida ni ganancia.',
  breakEvenUnits:  'Cantidad de unidades equivalentes (ponderadas por mix) que deben venderse para alcanzar el punto de equilibrio.',
  margin:          'Porcentaje de cada peso de venta que queda disponible para cubrir costos fijos después de descontar los costos variables.',
  safetyMargin:    'Cuánto pueden caer las ventas respecto a la proyección antes de entrar en pérdida. A mayor %, más estable el negocio.',
  breakEvenDay:    'Día del mes en que, a ritmo constante de ventas, la empresa cubre todos sus costos y comienza a generar utilidad.',
  targetSales:     'Facturación necesaria para lograr la rentabilidad objetivo (% sobre ventas). Fórmula: CF / (CMR − % Obj.)',
  ebitda:          'Resultado operativo estimado antes de intereses, impuestos y amortizaciones, sobre las ventas proyectadas ingresadas.',
  opLeverage:      'Cuántas veces se amplifica el cambio en resultado operativo ante una variación del 1% en ventas. Mayor = más riesgo y más potencial.',
  targetMarginPct: 'Porcentaje de ganancia neta que deseás alcanzar sobre las ventas. La herramienta calcula cuánto facturar para lograrlo: CF / (CMR − % Obj.).',
  inflationPct:    'Inflación proyectada aplicada sobre los costos variables. Muestra cómo se erosiona el margen de contribución ante subas de insumos.',
  cvar:            'Costo Variable unitario: todo costo que varía directamente con cada unidad producida o vendida (materiales, comisiones, etc.).',
  mixPct:          'Porcentaje que representa este producto en el total de ventas. La suma de todos los productos debe ser 100%.',
};

// ── ProductsTable — defined at module level so React never remounts it on Home re-renders ──
interface ProductsTableProps {
  products: Product[];
  mixTotal: number;
  onNameChange: (id: number, name: string) => void;
  onProductChange: (id: number, field: EditableField, value: number) => void;
  onDelete: (id: number) => void;
  onAdd: () => void;
}

function ProductsTable({ products, mixTotal, onNameChange, onProductChange, onDelete, onAdd }: ProductsTableProps) {
  return (
    <div>
      {products.length > 0 && mixTotal !== 100 && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-xl bg-amber-900/20 border border-amber-800">
          <FiAlertTriangle size={11} className="text-amber-400 shrink-0" />
          <p className="text-[11px] text-amber-400 font-medium">Mix total: {mixTotal}% — debe sumar 100%</p>
        </div>
      )}

      {/* Column headers — grid-cols-12: 3 name | 3 price | 3 cvar | 2 mix% | 1 delete */}
      <div className="grid grid-cols-12 items-center gap-2 pb-2 mb-1 border-b border-slate-800">
        <div className="col-span-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
          Nombre
        </div>
        <div className="col-span-3 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
          Precio
        </div>
        <div className="col-span-3 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
          <Tooltip content={TIP.cvar}>
            <span className="cursor-help underline decoration-dotted underline-offset-2">C.Var</span>
          </Tooltip>
        </div>
        <div className="col-span-2 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
          <Tooltip content={TIP.mixPct}>
            <span className="cursor-help underline decoration-dotted underline-offset-2">Mix%</span>
          </Tooltip>
        </div>
        <div className="col-span-1" />
      </div>

      {/* Rows — each cell occupies a hard col-span so large numbers never displace the delete button */}
      <div className="space-y-1">
        {products.map((p) => (
          <div key={p.id} className="grid grid-cols-12 items-center gap-2 py-1 hover:bg-slate-800/60 rounded-lg transition-colors">
            <input
              type="text"
              value={p.name}
              placeholder="Nombre"
              onChange={(e) => onNameChange(p.id, e.target.value)}
              className={`col-span-3 w-full px-2 py-1.5 text-xs ${INPUT_CLS}`}
            />
            <SafeNumberInput
              value={p.price}
              onChange={(v) => onProductChange(p.id, 'price', v)}
              className={`col-span-3 w-full px-2 py-1.5 text-xs text-right tabular-nums ${INPUT_CLS}`}
            />
            <SafeNumberInput
              value={p.variableCost}
              onChange={(v) => onProductChange(p.id, 'variableCost', v)}
              className={`col-span-3 w-full px-2 py-1.5 text-xs text-right tabular-nums ${INPUT_CLS}`}
            />
            <SafeNumberInput
              value={p.mixPercentage}
              max={100}
              onChange={(v) => onProductChange(p.id, 'mixPercentage', v)}
              className={`col-span-2 w-full px-2 py-1.5 text-xs text-right tabular-nums ${INPUT_CLS}`}
            />
            {/* col-span-1 — always isolated, never displaced */}
            <button
              onClick={() => onDelete(p.id)}
              className="col-span-1 flex items-center justify-center p-1.5 text-slate-600
                         hover:text-rose-400 hover:bg-rose-900/20 rounded-lg transition-all"
            >
              <FiTrash2 size={11} />
            </button>
          </div>
        ))}
      </div>

      <button onClick={onAdd}
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border
                   border-dashed border-slate-700 hover:border-emerald-600 hover:bg-emerald-900/10
                   px-4 py-2 text-[11px] font-medium text-slate-500 hover:text-emerald-400 transition-all">
        <FiPlus size={11} /> Añadir Producto
      </button>
    </div>
  );
}

export default function Home() {
  const router   = useRouter();
  const chartRef = useRef<HTMLDivElement>(null);

  // ── Auth ──────────────────────────────────────────────────────────────────
  const [userId, setUserId] = useState<string>('00000000-0000-0000-0000-000000000001');
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUserId(session?.user?.id ?? '00000000-0000-0000-0000-000000000001');
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  // ── UI state ──────────────────────────────────────────────────────────────
  const [mobileTab,       setMobileTab]       = useState<MobileTab>('sim');
  const [scenarioName,    setScenarioName]    = useState('');
  const [saveRefreshKey,  setSaveRefreshKey]  = useState(0);
  const [baseline,        setBaseline]        = useState<BaselineSnapshot | null>(null);

  // ── MEP ───────────────────────────────────────────────────────────────────
  type MepRate = { compra: number; venta: number };
  const [mepData,  setMepData]  = useState<MepRate | null>(null);
  const [manualTc, setManualTc] = useState(0);
  useEffect(() => {
    fetch('/api/mep')
      .then(r => r.json())
      .then((d: MepRate) => { if (d.compra && d.venta) setMepData(d); })
      .catch(() => {});
  }, []);

  // ── Data state ────────────────────────────────────────────────────────────
  const [products,        setProducts]        = useState<Product[]>(getInitialProducts);
  const [costItems,       setCostItems]        = useState<CostItem[]>(INITIAL_COST_ITEMS);
  const [variableTax,     setVariableTax]      = useState(10);
  const [observations,    setObservations]     = useState('');
  const [projectedSales,  setProjectedSales]   = useState(30000);
  const [targetMarginPct, setTargetMarginPct]  = useState(15);
  const [inflationPct,    setInflationPct]     = useState(0);

  const fixedCosts = costItems.reduce((sum, i) => sum + i.amount, 0);

  const [breakevenResult, setBreakevenResult] = useState(
    () => calculateBreakeven(getInitialProducts(), 10000, 10)
  );
  const [saving,        setSaving]        = useState(false);
  const [saveMessage,   setSaveMessage]   = useState<{ text: string; ok: boolean } | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  useEffect(() => {
    if (products.length === 0) return;
    setBreakevenResult(calculateBreakeven(products, fixedCosts, variableTax));
  }, [products, fixedCosts, variableTax]);

  // ── Product handlers ──────────────────────────────────────────────────────
  const handleNameChange = (id: number, name: string) =>
    setProducts(prev => prev.map(p => p.id === id ? { ...p, name } : p));

  const handleProductChange = (id: number, field: EditableField, value: number) => {
    if (isNaN(value)) return;
    setProducts(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
  };
  const addProduct = () => {
    const newId = products.length > 0 ? Math.max(...products.map(p => p.id)) + 1 : 1;
    setProducts(prev => [...prev, {
      id: newId, name: `Producto ${LETTERS[(newId - 1) % 26]}`,
      price: 0, variableCost: 0, mixPercentage: 0,
    }]);
  };
  const deleteProduct = (id: number) => setProducts(prev => prev.filter(p => p.id !== id));

  // ── Scenario handlers ─────────────────────────────────────────────────────
  const loadScenario = (s: ScenarioRecord) => {
    setProducts(s.products);
    setCostItems(s.cost_items?.length
      ? s.cost_items
      : [{ id: 1, name: 'Costos Fijos', amount: s.fixed_costs }]
    );
    setVariableTax(s.variable_tax);
    setObservations(s.observations ?? '');
  };

  const handleSaveScenario = async () => {
    setSaving(true);
    setSaveMessage(null);
    const { error } = await saveScenario({
      clientId: userId,
      name: scenarioName.trim() || undefined,
      products, costItems, fixedCosts, variableTax, observations,
    });
    setSaving(false);
    if (!error) {
      setScenarioName('');
      setSaveRefreshKey(k => k + 1);
    }
    setSaveMessage(error
      ? { text: `Error: ${error}`, ok: false }
      : { text: 'Escenario guardado.', ok: true }
    );
    setTimeout(() => setSaveMessage(null), 4000);
  };

  // ── PDF ───────────────────────────────────────────────────────────────────
  const generatePDF = async () => {
    setGeneratingPdf(true);
    try {
      const [{ jsPDF }, { default: autoTable }] = await Promise.all([
        import('jspdf'), import('jspdf-autotable'),
      ]);
      const doc   = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const ML = 14, MR = 14, CW = pageW - ML - MR;

      type RGB = [number, number, number];
      const Co = {
        white:   [255, 255, 255] as RGB, bg:      [248, 250, 252] as RGB,
        border:  [226, 232, 240] as RGB, text:    [15,  23,  42]  as RGB,
        muted:   [100, 116, 139] as RGB, light:   [148, 163, 184] as RGB,
        emerald: [4,   120, 87]  as RGB, red:     [185, 28,  28]  as RGB,
        amber:   [180, 83,  9]   as RGB, eFill:   [209, 250, 229] as RGB,
        rFill:   [254, 226, 226] as RGB,
      };
      const sf = (c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
      const sd = (c: RGB) => doc.setDrawColor(c[0], c[1], c[2]);
      const st = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);

      const fmtV = (v: number | null | undefined) => {
        const n = v ?? 0;
        if (!isFinite(n) || isNaN(n)) return '—';
        const neg = n < 0; const a = Math.abs(n); const p = neg ? '-$' : '$';
        if (a >= 1_000_000) return `${p}${(a / 1_000_000).toFixed(1)}M`;
        if (a >= 1_000)     return `${p}${(a / 1_000).toFixed(1)}k`;
        return `${p}${a.toFixed(0)}`;
      };

      sf(Co.bg); doc.rect(0, 0, pageW, 22, 'F');
      sd(Co.border); doc.setLineWidth(0.2); doc.line(0, 22, pageW, 22);
      sf(Co.emerald); doc.circle(ML + 2.5, 8.5, 2.5, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12); st(Co.text);
      doc.text('CFO Tech Partners — Reporte de Equilibrio Estratégico', ML + 8, 10);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); st(Co.muted);
      const tcLabel = effectiveTc ? `  ·  TC MEP: $${effectiveTc.toLocaleString('es-AR', { maximumFractionDigits: 0 })}` : '';
      doc.text(
        `${new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })}  ·  ${health.label}  ·  CF: $${fixedCosts.toLocaleString('es-AR')}  ·  IIBB: ${variableTax}%  ·  Rent. Obj.: ${targetMarginPct}%${tcLabel}`,
        ML + 8, 17
      );

      const kpiY = 25, kpiH = 15;
      const smV   = safeN(kpi.safetyMargin ?? 0);
      const cmTot = projectedSales * (breakevenResult.averageContributionMargin / 100);
      const olV   = kpi.ebitda != null && isFinite(kpi.ebitda) && kpi.ebitda > 0
        ? cmTot / kpi.ebitda : null;
      const kpiStrip: { label: string; value: string; color: RGB }[] = [
        { label: 'EBITDA',       value: fmtV(kpi.ebitda),       color: (kpi.ebitda ?? 0) >= 0 ? Co.emerald : Co.red   },
        { label: 'Margen Seg.',  value: `${smV.toFixed(1)}%`,   color: smV < 10 ? Co.red : smV < 25 ? Co.amber : Co.emerald },
        { label: 'Día P.E.',     value: kpi.breakEvenDay != null ? `Día ${kpi.breakEvenDay}/30` : '—', color: Co.text },
        { label: `Vtas. Obj. (${targetMarginPct}%)`, value: fmtV(kpi.salesForTargetProfit), color: kpi.salesForTargetProfit != null ? Co.amber : Co.light },
        { label: 'Apalan. Op.',  value: olV != null ? `${olV.toFixed(2)}x` : '—',
          color: olV == null ? Co.light : olV > 5 ? Co.red : olV > 3 ? Co.amber : Co.emerald },
      ];
      const kColW = CW / kpiStrip.length;
      kpiStrip.forEach(({ label, value, color }, i) => {
        const kx = ML + i * kColW;
        sf(Co.white); sd(Co.border); doc.setLineWidth(0.2);
        doc.roundedRect(kx, kpiY, kColW - 2, kpiH, 1.5, 1.5, 'FD');
        doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5); st(Co.muted);
        doc.text(label.toUpperCase(), kx + 3, kpiY + 5);
        doc.setFont('courier', 'bold'); doc.setFontSize(9); st(color);
        doc.text(value, kx + 3, kpiY + 12);
      });

      const chY = kpiY + kpiH + 4, chH = 50;
      const cpx = ML + 2, cpy = chY + 3, cpw = CW - 4, cph = chH - 8;
      sf(Co.white); sd(Co.border); doc.setLineWidth(0.2);
      doc.roundedRect(ML, chY, CW, chH, 2, 2, 'FD');

      const cdata = breakevenResult.chartData;
      const maxU  = cdata.at(-1)?.units || 1;
      const maxV  = Math.max(...cdata.map(d => Math.max(d.totalSales, d.totalCosts))) || 1;
      const mapX  = (u: number) => cpx + (u / maxU) * cpw;
      const mapY  = (v: number) => cpy + cph - (v / maxV) * cph;

      [0.25, 0.5, 0.75].forEach(t => {
        sd(Co.border); doc.setLineWidth(0.1);
        doc.line(cpx, cpy + (1 - t) * cph, cpx + cpw, cpy + (1 - t) * cph);
      });

      const beU  = breakevenResult.breakEvenUnits;
      const beIdx = beU > 0 ? cdata.findIndex(d => d.units >= beU) : -1;
      const beSI  = beIdx < 1 ? 1 : Math.min(beIdx, cdata.length - 2);

      const fillZone = (pts: [number, number][], fc: RGB) => {
        if (pts.length < 3) return;
        sf(fc);
        const rel = pts.slice(1).map(([x2, y2], i) =>
          [x2 - pts[i][0], y2 - pts[i][1]] as [number, number]
        );
        doc.lines(rel, pts[0][0], pts[0][1], [1, 1], 'F', true);
      };

      const lSlice = cdata.slice(0, beSI + 1);
      fillZone([
        ...lSlice.map(d => [mapX(d.units), mapY(d.totalCosts)] as [number, number]),
        ...[...lSlice].reverse().map(d => [mapX(d.units), mapY(d.totalSales)] as [number, number]),
      ], Co.rFill);

      const pSlice = cdata.slice(beSI);
      fillZone([
        ...pSlice.map(d => [mapX(d.units), mapY(d.totalSales)] as [number, number]),
        ...[...pSlice].reverse().map(d => [mapX(d.units), mapY(d.totalCosts)] as [number, number]),
      ], Co.eFill);

      const drawLine = (color: RGB, key: 'totalSales' | 'totalCosts' | 'fixedCosts', dash = false, lw = 0.5) => {
        sd(color); doc.setLineWidth(lw);
        doc.setLineDashPattern(dash ? [2, 1.5] : [], 0);
        for (let i = 1; i < cdata.length; i++)
          doc.line(mapX(cdata[i-1].units), mapY(cdata[i-1][key]), mapX(cdata[i].units), mapY(cdata[i][key]));
        doc.setLineDashPattern([], 0);
      };
      drawLine(Co.emerald, 'totalSales');
      drawLine(Co.red,     'totalCosts');
      drawLine(Co.light,   'fixedCosts', true, 0.3);

      if (beU > 0 && beU <= maxU) {
        const bex = mapX(beU);
        sd(Co.emerald); doc.setLineWidth(0.3);
        doc.setLineDashPattern([1.5, 1], 0);
        doc.line(bex, cpy, bex, cpy + cph);
        doc.setLineDashPattern([], 0);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5); st(Co.emerald);
        doc.text(`P.E. ≈ ${Math.round(beU)} u.`, bex + 1, cpy + 4);
      }

      const lgY = chY + chH - 5;
      ([Co.emerald, Co.red, Co.light] as RGB[]).forEach((color, i) => {
        const label = ['Ventas Totales', 'Costos Totales', 'Costos Fijos'][i];
        const lx = ML + i * 65;
        sf(color); doc.rect(lx, lgY - 1.2, 6, 1.5, 'F');
        doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5); st(Co.muted);
        doc.text(label, lx + 7.5, lgY);
      });

      const PVARS = [-10, -5, 0, 5, 10];
      const CVARS = [-10, -5, 0, 5, 10];
      const matData = PVARS.map(pv =>
        CVARS.map(cv => {
          const adj = products.map(p => ({
            ...p,
            price:        p.price        * (1 + pv / 100),
            variableCost: p.variableCost * (1 + cv / 100),
          }));
          const r = calculateBreakeven(adj, fixedCosts, variableTax);
          return projectedSales * (r.averageContributionMargin / 100) - fixedCosts;
        })
      );
      const fmtC = (v: number) => {
        if (!isFinite(v) || isNaN(v)) return '—';
        const neg = v < 0; const a = Math.abs(v); const p = neg ? '-$' : '$';
        if (a >= 1_000_000) return `${p}${(a / 1_000_000).toFixed(1)}M`;
        if (a >= 1_000)     return `${p}${(a / 1_000).toFixed(1)}k`;
        return `${p}${a.toFixed(0)}`;
      };

      const matY = chY + chH + 6;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); st(Co.text);
      doc.text('Matriz de Sensibilidad — EBITDA por variación de Precio vs. Costos Variables', ML, matY);
      autoTable(doc, {
        startY: matY + 3,
        head: [['P ↓ / C.Var →', ...CVARS.map(cv => cv > 0 ? `+${cv}%` : `${cv}%`)]],
        body: PVARS.map((pv, ri) => [
          pv > 0 ? `+${pv}%` : `${pv}%`,
          ...matData[ri].map(fmtC),
        ]),
        headStyles:   { fillColor: [248, 250, 252], textColor: [15, 23, 42], fontSize: 7, fontStyle: 'bold', halign: 'center', cellPadding: 2 },
        styles:       { fontSize: 7, cellPadding: 2, halign: 'center', font: 'courier', textColor: [30, 41, 59] },
        columnStyles: { 0: { halign: 'left', fontStyle: 'bold', font: 'helvetica' } },
        didParseCell: (d) => {
          if (d.section !== 'body' || d.column.index === 0) return;
          const v = matData[d.row.index][d.column.index - 1];
          if (!isFinite(v) || isNaN(v)) { d.cell.styles.fillColor = [248, 250, 252]; return; }
          if (v > 0) { d.cell.styles.fillColor = [209, 250, 229]; d.cell.styles.textColor = [4, 120, 87];  }
          else       { d.cell.styles.fillColor = [254, 226, 226]; d.cell.styles.textColor = [185, 28, 28]; }
        },
        margin: { left: ML, right: MR },
      });

      const tabY  = (doc as any).lastAutoTable?.finalY + 6;
      const halfW = (CW - 4) / 2;

      autoTable(doc, {
        startY: tabY,
        head: [['Concepto', 'Monto']],
        body: [
          ...costItems.map(c => [c.name, `$${c.amount.toLocaleString('es-AR')}`]),
          ['Total Costos Fijos', `$${fixedCosts.toLocaleString('es-AR')}`],
        ],
        headStyles:   { fillColor: [248, 250, 252], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 7, cellPadding: 2 },
        styles:       { fontSize: 7, cellPadding: 2, textColor: [30, 41, 59] },
        columnStyles: { 1: { halign: 'right', font: 'courier' } },
        didParseCell: (d) => {
          if (d.section === 'body' && d.row.index === costItems.length) {
            d.cell.styles.fontStyle = 'bold';
            d.cell.styles.fillColor = [248, 250, 252];
          }
        },
        margin: { left: ML, right: MR + halfW + 4 },
      });

      const costsEndY = (doc as any).lastAutoTable?.finalY;

      autoTable(doc, {
        startY: tabY,
        head: [['Producto', 'Precio', 'C.Var.', 'Mix', 'Margen U.']],
        body: products.map(p => [
          p.name,
          `$${p.price.toLocaleString('es-AR')}`,
          `$${p.variableCost.toLocaleString('es-AR')}`,
          `${p.mixPercentage}%`,
          `$${(p.price - p.variableCost).toLocaleString('es-AR')}`,
        ]),
        headStyles:   { fillColor: [248, 250, 252], textColor: [15, 23, 42], fontStyle: 'bold', fontSize: 7, cellPadding: 2 },
        styles:       { fontSize: 7, cellPadding: 2, textColor: [30, 41, 59], font: 'courier' },
        columnStyles: { 0: { font: 'helvetica', fontStyle: 'normal' } },
        margin: { left: ML + halfW + 4, right: MR },
      });

      const prodEndY = (doc as any).lastAutoTable?.finalY;

      if (observations.trim()) {
        const notesY = Math.max(costsEndY, prodEndY) + 6;
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); st(Co.text);
        doc.text('Notas Estratégicas del Consultor', ML, notesY);
        sf(Co.bg); sd(Co.border); doc.setLineWidth(0.2);
        doc.roundedRect(ML, notesY + 2, CW, 18, 1.5, 1.5, 'FD');
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7); st(Co.muted);
        doc.text(doc.splitTextToSize(observations.trim(), CW - 6), ML + 3, notesY + 7);
      }

      const totalPg = doc.getNumberOfPages();
      for (let pg = 1; pg <= totalPg; pg++) {
        doc.setPage(pg);
        sf(Co.bg); doc.rect(0, pageH - 7, pageW, 7, 'F');
        sd(Co.border); doc.setLineWidth(0.1); doc.line(0, pageH - 7, pageW, pageH - 7);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(6); st(Co.muted);
        doc.text('CFO Tech Partners · Confidencial · Generado automáticamente', ML, pageH - 2.5);
        doc.text(`Página ${pg} de ${totalPg}`, pageW - MR, pageH - 2.5, { align: 'right' });
      }

      doc.save('reporte-equilibrio-cfo.pdf');
    } finally { setGeneratingPdf(false); }
  };

  // ── Derived values ────────────────────────────────────────────────────────
  const currentSnapshot = useMemo<BaselineSnapshot>(
    () => ({ products, fixedCosts, variableTax, projectedSales }),
    [products, fixedCosts, variableTax, projectedSales]
  );

  const mixTotal = products.reduce((sum, p) => sum + p.mixPercentage, 0);
  const health   = getFinancialHealth(breakevenResult);
  const hStyle   = HEALTH_STYLES[health.status];
  const kpi = calculateStrategicKPIs(
    breakevenResult.breakEvenSales, projectedSales, fixedCosts,
    breakevenResult.averageContributionMargin / 100, targetMarginPct / 100
  );

  const effectiveTc = manualTc > 0 ? manualTc : (mepData?.venta ?? null);
  const toUSD = (v: number | null): string => {
    if (v == null || effectiveTc == null || !isFinite(v) || !isFinite(effectiveTc)) return '';
    const usd = Math.round(v / effectiveTc);
    const sign = usd < 0 ? '-' : '';
    return `${sign}u$s ${Math.abs(usd).toLocaleString('es-AR')}`;
  };

  const inflatedResult = inflationPct > 0
    ? calculateBreakeven(
        products.map(p => ({ ...p, variableCost: p.variableCost * (1 + inflationPct / 100) })),
        fixedCosts, variableTax
      )
    : null;
  const kpiColor = (v: number | null) =>
    v == null || !isFinite(v) || isNaN(v) ? 'text-slate-500'
    : v >= 0 ? 'text-emerald-400' : 'text-rose-400';

  const cmTotal           = projectedSales * (breakevenResult.averageContributionMargin / 100);
  const operatingLeverage =
    kpi.ebitda != null && isFinite(kpi.ebitda) && kpi.ebitda > 0
      ? cmTotal / kpi.ebitda : null;
  const olColor =
    operatingLeverage == null ? 'text-slate-500'
    : operatingLeverage > 5  ? 'text-rose-400'
    : operatingLeverage > 3  ? 'text-amber-400'
    : 'text-emerald-400';

  // ── KPI cards data ────────────────────────────────────────────────────────
  const smValue = kpi.safetyMargin ?? 0;
  const kpiCards = [
    {
      label:    'EBITDA',
      icon:     <FiTrendingUp size={13} />,
      iconBg:   (kpi.ebitda ?? 0) >= 0 ? 'bg-emerald-900/30 text-emerald-400' : 'bg-rose-900/30 text-rose-400',
      value:    fmtM(kpi.ebitda),
      usd:      toUSD(kpi.ebitda),
      color:    kpiColor(kpi.ebitda),
      tip:      TIP.ebitda,
      pct:      kpi.ebitda != null && projectedSales > 0
                  ? Math.max(0, Math.min(100, (kpi.ebitda / projectedSales) * 300)) : 0,
      barColor: (kpi.ebitda ?? 0) >= 0 ? 'bg-emerald-500' : 'bg-red-500',
      warn:     false,
    },
    {
      label:    'Margen Seg.',
      icon:     <FiShield size={13} />,
      iconBg:   smValue < 10 ? 'bg-rose-900/30 text-rose-400' : smValue < 25 ? 'bg-amber-900/30 text-amber-400' : 'bg-emerald-900/30 text-emerald-400',
      value:    fmtP(kpi.safetyMargin),
      usd:      '',
      color:    smValue < 10 ? 'text-rose-400' : smValue < 25 ? 'text-amber-400' : 'text-emerald-400',
      tip:      TIP.safetyMargin,
      pct:      Math.max(0, Math.min(100, smValue)),
      barColor: smValue < 10 ? 'bg-red-500' : smValue < 25 ? 'bg-amber-500' : 'bg-emerald-500',
      warn:     smValue < 10,
    },
    {
      label:    'Día P.E.',
      icon:     <FiCalendar size={13} />,
      iconBg:   'bg-blue-900/30 text-blue-400',
      value:    kpi.breakEvenDay != null ? `${kpi.breakEvenDay}/30` : '—',
      usd:      '',
      color:    'text-slate-200',
      tip:      TIP.breakEvenDay,
      pct:      kpi.breakEvenDay != null ? Math.max(0, 100 - (kpi.breakEvenDay / 30) * 100) : 0,
      barColor: (kpi.breakEvenDay ?? 30) <= 20 ? 'bg-emerald-500' : (kpi.breakEvenDay ?? 30) <= 25 ? 'bg-amber-500' : 'bg-red-500',
      warn:     false,
    },
    {
      label:    'Vtas. Obj.',
      icon:     <FiFlag size={13} />,
      iconBg:   kpi.salesForTargetProfit == null ? 'bg-slate-800 text-slate-500' : 'bg-amber-900/30 text-amber-400',
      value:    fmtM(kpi.salesForTargetProfit),
      usd:      toUSD(kpi.salesForTargetProfit),
      color:    kpi.salesForTargetProfit == null ? 'text-slate-500' : 'text-amber-400',
      tip:      TIP.targetSales,
      pct:      kpi.salesForTargetProfit != null && kpi.salesForTargetProfit > 0
                  ? Math.max(0, Math.min(100, (projectedSales / kpi.salesForTargetProfit) * 100)) : 0,
      barColor: 'bg-amber-500',
      warn:     kpi.salesForTargetProfit == null && targetMarginPct > 0,
    },
    {
      label:    'Apalan. Op.',
      icon:     <FiActivity size={13} />,
      iconBg:   operatingLeverage == null ? 'bg-slate-800 text-slate-500' : operatingLeverage > 5 ? 'bg-rose-900/30 text-rose-400' : operatingLeverage > 3 ? 'bg-amber-900/30 text-amber-400' : 'bg-emerald-900/30 text-emerald-400',
      value:    operatingLeverage != null ? `${operatingLeverage.toFixed(2)}x` : '—',
      usd:      '',
      color:    olColor,
      tip:      TIP.opLeverage,
      pct:      operatingLeverage != null ? Math.max(0, Math.min(100, (1 - (operatingLeverage - 1) / 9) * 100)) : 0,
      barColor: operatingLeverage == null ? 'bg-slate-700' : operatingLeverage > 5 ? 'bg-red-500' : operatingLeverage > 3 ? 'bg-amber-500' : 'bg-emerald-500',
      warn:     false,
    },
  ];


  // ── Shared sub-elements ───────────────────────────────────────────────────
  const SaveToast = () => saveMessage ? (
    <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium
                    ${saveMessage.ok
                      ? 'bg-emerald-900/30 border-emerald-800 text-emerald-300'
                      : 'bg-rose-900/30 border-rose-800 text-rose-300'}`}>
      {saveMessage.text}
    </div>
  ) : null;


  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ═══════════════════════════════════════════════════════════════════
          MOBILE VIEW  —  block md:hidden
          Tabbed system: Simulador | Matriz | Estructura
      ════════════════════════════════════════════════════════════════════ */}
      <div className="block md:hidden min-h-screen bg-slate-950 flex flex-col pb-16">

        {/* Mobile Header */}
        <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-xl border-b border-slate-800 px-4">
          <div className="h-14 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 shrink-0">
              <div className="h-7 w-7 rounded-lg bg-emerald-500 flex items-center justify-center shadow-sm shadow-emerald-500/30">
                <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5 text-white">
                  <path d="M3 17l5-5 4 4 9-9" stroke="currentColor" strokeWidth="2.5"
                    strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div>
                <p className="text-[13px] font-semibold text-slate-100 leading-none">CFO Command</p>
                <p className="text-[9px] text-slate-400 leading-none mt-0.5 tracking-wide">
                  <span className={`inline-block h-1.5 w-1.5 rounded-full mr-1 ${hStyle.dot}`} />
                  {health.label}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={scenarioName}
                onChange={(e) => setScenarioName(e.target.value)}
                placeholder="Nombre…"
                className="w-24 px-2 py-1 text-xs bg-slate-800 border border-slate-700 rounded-lg
                           text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
              <button
                onClick={() => setBaseline({ ...currentSnapshot })}
                title={baseline ? 'Actualizar base' : 'Fijar escenario base para comparar'}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold
                            border transition-all
                            ${baseline
                              ? 'bg-amber-900/30 border-amber-800 text-amber-400 hover:bg-amber-900/50'
                              : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200'}`}
              >
                <FiBookmark size={11} />
                {baseline ? 'Refiar' : 'Base'}
              </button>
              <button onClick={handleSaveScenario} disabled={saving || products.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600
                           disabled:opacity-40 rounded-xl text-[12px] font-semibold text-white
                           transition-all shadow-sm shadow-emerald-500/25">
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
              <button onClick={handleSignOut}
                className="p-2 text-slate-500 hover:text-rose-400 hover:bg-rose-900/20 rounded-xl transition-all">
                <FiLogOut size={14} />
              </button>
            </div>
          </div>
          {saveMessage && (
            <div className="pb-2">
              <SaveToast />
            </div>
          )}
        </header>

        {/* Mobile KPI Grid — 2 cols */}
        <div className="px-4 pt-4 pb-3 shrink-0">
          <div className="grid grid-cols-2 gap-2.5">
            {kpiCards.map(({ label, value, usd, color, tip, pct, barColor, warn, icon, iconBg }) => (
              <div key={label} className={`${CARD} p-3 flex flex-col gap-2`}>
                <div className="flex items-center justify-between">
                  <div className={`h-6 w-6 rounded-lg flex items-center justify-center ${iconBg}`}>
                    {icon}
                  </div>
                  {warn && <FiAlertTriangle size={10} className="text-rose-400" />}
                </div>
                <div className="min-w-0">
                  <Tooltip content={tip}>
                    <span className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider">{label}</span>
                  </Tooltip>
                  <p className={`font-mono font-bold tabular-nums truncate mt-0.5 ${color} ${value.length > 8 ? 'text-xs' : 'text-sm'}`}>{value}</p>
                  {usd && <p className="font-mono text-[9px] text-slate-500 truncate">{usd}</p>}
                </div>
                <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="flex-1 px-4 overflow-y-auto">

          {/* TAB 1 — Simulador */}
          {mobileTab === 'sim' && (
            <div className="space-y-4 pb-4">

              <div className={`${CARD} p-4`}>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Parámetros</p>
                <div className="space-y-3">
                  <div>
                    <label className={LABEL}>Impuestos sobre Ventas (IIBB %)</label>
                    <SafeNumberInput value={variableTax} onChange={setVariableTax} min={0} max={100}
                      className={`w-full px-3 py-2.5 ${INPUT_CLS}`} />
                  </div>
                  <div>
                    <label className={LABEL}>Ventas Proyectadas ($)</label>
                    <SafeNumberInput value={projectedSales} onChange={setProjectedSales} min={0}
                      className={`w-full px-3 py-2.5 ${INPUT_CLS}`} />
                  </div>
                  <div>
                    <label className={LABEL}>Rentabilidad Objetivo (% ventas)</label>
                    <SafeNumberInput value={targetMarginPct} onChange={setTargetMarginPct} min={0} max={99}
                      className={`w-full px-3 py-2.5 ${INPUT_CLS}`} />
                  </div>
                  <div>
                    <label className={LABEL}>Inflación Proyectada (%)</label>
                    <SafeNumberInput value={inflationPct} onChange={setInflationPct} min={0} max={1000}
                      className={`w-full px-3 py-2.5 ${INPUT_CLS}`} />
                  </div>
                </div>
              </div>

              {/* MEP */}
              <div className={`${CARD} p-4`}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Tipo de Cambio MEP</p>
                  <span className={`h-1.5 w-1.5 rounded-full ${mepData ? 'bg-emerald-500' : 'bg-slate-600'}`} />
                </div>
                <div className="flex items-center justify-between py-2 border-b border-slate-800 mb-3">
                  <span className="text-[11px] text-slate-400">Cotización venta</span>
                  <span className="font-mono text-sm font-bold text-slate-200">
                    {mepData
                      ? `$${mepData.venta.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`
                      : <span className="text-slate-500 font-normal">—</span>}
                  </span>
                </div>
                <label className={LABEL}>Override manual (0 = auto)</label>
                <input type="number" value={manualTc} min={0}
                  onChange={(e) => setManualTc(Number(e.target.value))}
                  placeholder="0" className={`w-full px-3 py-2 ${INPUT_CLS}`} />
                {effectiveTc && (
                  <p className="text-[10px] text-slate-500 mt-2 font-mono">
                    TC activo: <span className="text-slate-300 font-semibold">
                      ${effectiveTc.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                    </span>
                    <span className="ml-1 text-[9px]">{manualTc > 0 ? '(manual)' : '(MEP)'}</span>
                  </p>
                )}
              </div>

              {/* Resultados Base */}
              <div className={`${CARD} p-4`}>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Resultados Base</p>
                {[
                  { label: 'Ventas P.E.',   value: `$${safeN(breakevenResult.breakEvenSales).toLocaleString('es-AR',{maximumFractionDigits:0})}`, color: 'text-emerald-400', tip: TIP.breakEvenSales },
                  { label: 'Unidades P.E.', value: safeN(breakevenResult.breakEvenUnits).toLocaleString('es-AR',{maximumFractionDigits:1}),        color: 'text-slate-300',    tip: TIP.breakEvenUnits },
                  { label: 'Margen C.',     value: `${safeN(breakevenResult.averageContributionMargin).toFixed(1)}%`,                               color: 'text-slate-400',    tip: TIP.margin         },
                ].map(({ label, value, color, tip }) => (
                  <div key={label} className="flex items-center justify-between gap-2 py-2 border-b border-slate-800/50 last:border-0">
                    <Tooltip content={tip}>
                      <span className="text-[11px] text-slate-400 cursor-help">{label}</span>
                    </Tooltip>
                    <span className={`font-mono text-sm font-bold ${color}`}>{value}</span>
                  </div>
                ))}
              </div>

              {/* Chart */}
              <div className={`${CARD} p-4`}>
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">
                  Gráfico de Equilibrio
                </p>
                <p className="text-[9px] text-slate-600 mb-3">Ventas vs. Costos por unidades</p>
                <div className="h-[200px] w-full">
                  <BreakevenChart
                    data={breakevenResult.chartData}
                    breakEvenPoint={breakevenResult.breakEvenUnits}
                  />
                </div>
              </div>

              <StrategicImpactCard
                baseline={baseline}
                current={currentSnapshot}
                tc={effectiveTc ?? 1420}
                onClearBaseline={() => setBaseline(null)}
              />
            </div>
          )}

          {/* TAB 2 — Matriz */}
          {mobileTab === 'matrix' && (
            <div className="pb-4 pt-1 space-y-4">
              <div className={`${CARD} p-4`}>
                <SensitivityMatrix
                  products={products}
                  fixedCosts={fixedCosts}
                  variableTax={variableTax}
                  projectedSales={projectedSales}
                />
              </div>
              <StrategicImpactCard
                baseline={baseline}
                current={currentSnapshot}
                tc={effectiveTc ?? 1420}
                onClearBaseline={() => setBaseline(null)}
              />
            </div>
          )}

          {/* TAB 3 — Estructura */}
          {mobileTab === 'structure' && (
            <div className="pb-4 pt-1 space-y-4">

              {/* Scenario loader */}
              <div className={`${CARD} p-4`}>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Cargar Escenario</p>
                <ScenarioSelector clientId={userId} onLoad={loadScenario} refreshKey={saveRefreshKey} />
              </div>

              {/* Products */}
              <div className={`${CARD} p-4`}>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Tabla de Productos</p>
                <ProductsTable
                  products={products}
                  mixTotal={mixTotal}
                  onNameChange={handleNameChange}
                  onProductChange={handleProductChange}
                  onDelete={deleteProduct}
                  onAdd={addProduct}
                />
              </div>

              {/* Fixed costs */}
              <div className={`${CARD} p-4`}>
                <FixedCostsEditor items={costItems} onChange={setCostItems} />
              </div>

              {/* Notes */}
              <div className={`${CARD} p-4`}>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Notas Estratégicas</p>
                <textarea value={observations} onChange={(e) => setObservations(e.target.value)}
                  rows={4} placeholder="Conclusiones del escenario…"
                  className="w-full bg-transparent border-0 outline-none resize-none text-sm text-slate-300
                             placeholder-slate-600 leading-relaxed focus:ring-0" />
              </div>

              {/* PDF */}
              <button onClick={generatePDF} disabled={generatingPdf || products.length === 0}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-slate-800 border border-slate-700 hover:border-slate-600 hover:bg-slate-700 disabled:opacity-40 rounded-2xl
                           text-[12px] font-medium text-slate-400 transition-all shadow-sm">
                <FiFileText size={13} />
                {generatingPdf ? 'Generando PDF…' : 'Exportar PDF'}
              </button>
            </div>
          )}

        </div>

        {/* Bottom Tab Bar */}
        <nav className="fixed bottom-0 left-0 right-0 z-50 bg-slate-900/90 backdrop-blur-sm border-t border-slate-800">
          <div className="flex">
            {([
              { key: 'sim'       as MobileTab, label: 'Simulador',  Icon: FiActivity },
              { key: 'matrix'    as MobileTab, label: 'Matriz',     Icon: FiGrid     },
              { key: 'structure' as MobileTab, label: 'Estructura', Icon: FiList     },
            ]).map(({ key, label, Icon }) => (
              <button key={key} onClick={() => setMobileTab(key)}
                className={`flex-1 flex flex-col items-center justify-center py-3 gap-1 transition-colors duration-150
                            ${mobileTab === key
                              ? 'text-emerald-400'
                              : 'text-slate-500 hover:text-slate-300'}`}>
                <Icon size={19} />
                <span className="text-[10px] font-semibold">{label}</span>
              </button>
            ))}
          </div>
        </nav>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          DESKTOP VIEW  —  hidden md:flex
          Control Tower: header + KPI strip + 12-col grid, no page scroll
      ════════════════════════════════════════════════════════════════════ */}
      <div className="hidden md:flex flex-col h-screen bg-slate-950 overflow-hidden">

        {/* Desktop Header */}
        <header className="shrink-0 bg-slate-900/90 backdrop-blur-xl border-b border-slate-800 px-6">
          <div className="h-14 flex items-center justify-between gap-4">

            <div className="flex items-center gap-3 shrink-0">
              <div className="h-7 w-7 rounded-lg bg-emerald-500 flex items-center justify-center shadow-sm shadow-emerald-500/30">
                <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5 text-white">
                  <path d="M3 17l5-5 4 4 9-9" stroke="currentColor" strokeWidth="2.5"
                    strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div>
                <p className="text-[13px] font-semibold text-slate-100 leading-none">CFO Command Center</p>
                <p className="text-[10px] text-slate-400 leading-none mt-0.5 tracking-wide">Punto de Equilibrio</p>
              </div>
            </div>

            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-[11px] font-medium ${hStyle.badge}`}>
              <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${hStyle.dot}`} />
              <span>{health.label}</span>
            </div>

            <div className="flex items-center gap-2">
              <div className="w-52">
                <ScenarioSelector clientId={userId} onLoad={loadScenario} refreshKey={saveRefreshKey} />
              </div>
              {/* Scenario name input — clears after save */}
              <input
                type="text"
                value={scenarioName}
                onChange={(e) => setScenarioName(e.target.value)}
                placeholder="Nombre del escenario…"
                className="w-44 px-3 py-1.5 text-xs bg-slate-800 border border-slate-700 rounded-xl
                           text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500
                           focus:ring-2 focus:ring-emerald-500/20 transition-all"
              />
              <button
                onClick={() => setBaseline({ ...currentSnapshot })}
                title={baseline ? 'Actualizar base de comparación' : 'Fijar escenario base para comparar'}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-medium
                            border transition-all
                            ${baseline
                              ? 'bg-amber-900/30 border-amber-800 text-amber-400 hover:bg-amber-900/50'
                              : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-600 hover:bg-slate-700'}`}
              >
                <FiBookmark size={12} />
                {baseline ? 'Refiar base' : 'Fijar base'}
              </button>
              <button onClick={generatePDF} disabled={generatingPdf || products.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 border border-slate-700
                           hover:border-slate-600 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed
                           rounded-xl text-[12px] font-medium text-slate-300 transition-all">
                <FiFileText size={12} />
                {generatingPdf ? 'Generando…' : 'PDF'}
              </button>
              <button onClick={handleSaveScenario} disabled={saving || products.length === 0}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-600
                           disabled:opacity-40 disabled:cursor-not-allowed rounded-xl text-[12px] font-semibold
                           text-white transition-all shadow-sm shadow-emerald-500/25">
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
              <button onClick={handleSignOut}
                className="p-2 text-slate-500 hover:text-rose-400 hover:bg-rose-900/20 rounded-xl transition-all"
                title="Cerrar sesión">
                <FiLogOut size={14} />
              </button>
            </div>
          </div>
          {saveMessage && (
            <div className="pb-2">
              <SaveToast />
            </div>
          )}
        </header>

        {/* KPI Strip */}
        <div className="shrink-0 px-6 pt-4">
          <div className="grid grid-cols-5 gap-3">
            {kpiCards.map(({ label, value, usd, color, tip, pct, barColor, warn, icon, iconBg }) => (
              <div key={label}
                className={`${CARD} px-4 py-3.5 flex flex-col gap-2.5
                            hover:shadow-[0_4px_16px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)]
                            transition-all duration-200 cursor-default`}>
                <div className={`h-7 w-7 rounded-xl flex items-center justify-center ${iconBg}`}>
                  {icon}
                </div>
                <div className="min-w-0">
                  <Tooltip content={tip}>
                    <span className="text-[9px] font-semibold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                      {warn && <FiAlertTriangle size={8} className="text-rose-400" />}
                      {label}
                    </span>
                  </Tooltip>
                  <p className={`font-mono font-bold tabular-nums leading-tight mt-0.5 truncate ${color} ${value.length > 8 ? 'text-sm' : value.length > 5 ? 'text-base' : 'text-lg'}`}>
                    {value}
                  </p>
                  {usd && (
                    <p className="font-mono text-[9px] text-slate-500 tabular-nums mt-0.5 truncate">{usd}</p>
                  )}
                </div>
                <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── 12-col Dashboard Grid ── */}
        <div className="flex-1 min-h-0 px-6 py-4">
          <div className="h-full grid grid-cols-12 gap-4">

            {/* LEFT + CENTER — 7 cols: sliders + dual charts */}
            <div className="col-span-7 flex flex-col gap-4 min-h-0">

              {/* Control Panel with sliders */}
              <div className={`${CARD} p-5 shrink-0`}>
                <div className="flex items-center justify-between mb-4">
                  <p className={SLABEL}>Panel de Control</p>
                  <div className="flex items-center gap-2">
                    <span className={`h-1.5 w-1.5 rounded-full ${mepData ? 'bg-emerald-500' : 'bg-slate-600'}`} />
                    <span className="text-[10px] text-slate-500">MEP</span>
                    <span className="font-mono text-xs font-bold text-slate-300">
                      {mepData
                        ? `$${mepData.venta.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
                        : '—'}
                    </span>
                    {effectiveTc && (
                      <span className="text-[9px] text-slate-500">
                        {manualTc > 0 ? '(manual)' : '(auto)'}
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-x-8 gap-y-4">

                  {/* IIBB % */}
                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <label className={SLABEL}>
                        <Tooltip content={TIP.inflationPct.slice(0,60) + '…'}>
                          <span>IIBB %</span>
                        </Tooltip>
                      </label>
                      <SafeNumberInput value={variableTax} onChange={setVariableTax} min={0} max={100}
                        className="w-14 text-right text-xs font-mono font-bold text-slate-200 bg-transparent border-0 outline-none p-0" />
                    </div>
                    <input type="range" min={0} max={50} step={0.5} value={variableTax}
                      onChange={(e) => setVariableTax(Number(e.target.value))}
                      className="w-full h-1.5 accent-emerald-500 cursor-pointer rounded-full" />
                  </div>

                  {/* Ventas Proyectadas — number only */}
                  <div>
                    <label className={`${SLABEL} block mb-1.5`}>Ventas Proyectadas ($)</label>
                    <SafeNumberInput value={projectedSales} onChange={setProjectedSales} min={0}
                      className={`w-full px-3 py-1.5 text-sm ${INPUT_CLS}`} />
                  </div>

                  {/* Rentabilidad Objetivo % */}
                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <label className={SLABEL}>
                        <Tooltip content={TIP.targetMarginPct}>
                          <span>ROS Obj. %</span>
                        </Tooltip>
                      </label>
                      <SafeNumberInput value={targetMarginPct} onChange={setTargetMarginPct} min={0} max={99}
                        className="w-14 text-right text-xs font-mono font-bold text-slate-200 bg-transparent border-0 outline-none p-0" />
                    </div>
                    <input type="range" min={0} max={60} step={0.5} value={targetMarginPct}
                      onChange={(e) => setTargetMarginPct(Number(e.target.value))}
                      className="w-full h-1.5 accent-emerald-500 cursor-pointer rounded-full" />
                  </div>

                  {/* Inflación % */}
                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <label className={SLABEL}>
                        <Tooltip content={TIP.inflationPct}>
                          <span>Inflación %</span>
                        </Tooltip>
                      </label>
                      <SafeNumberInput value={inflationPct} onChange={setInflationPct} min={0} max={1000}
                        className="w-14 text-right text-xs font-mono font-bold text-orange-600
                                   bg-transparent border-0 outline-none p-0" />
                    </div>
                    <input type="range" min={0} max={300} step={1} value={inflationPct}
                      onChange={(e) => setInflationPct(Number(e.target.value))}
                      className="w-full h-1.5 accent-orange-500 cursor-pointer rounded-full" />
                  </div>

                </div>

                {/* Results strip */}
                <div className="mt-4 pt-4 border-t border-slate-800/50 flex items-center gap-6 flex-wrap">
                  {[
                    { label: 'Ventas P.E.',   value: `$${safeN(breakevenResult.breakEvenSales).toLocaleString('es-AR',{maximumFractionDigits:0})}`, color: 'text-emerald-400', tip: TIP.breakEvenSales },
                    { label: 'Unidades P.E.', value: safeN(breakevenResult.breakEvenUnits).toLocaleString('es-AR',{maximumFractionDigits:1}),        color: 'text-slate-300',    tip: TIP.breakEvenUnits },
                    { label: 'Margen C.',     value: `${safeN(breakevenResult.averageContributionMargin).toFixed(1)}%`,                               color: 'text-slate-400',    tip: TIP.margin         },
                  ].map(({ label, value, color, tip }) => (
                    <div key={label} className="flex flex-col">
                      <Tooltip content={tip}>
                        <span className="text-[9px] text-slate-500 uppercase tracking-wider cursor-help">{label}</span>
                      </Tooltip>
                      <span className={`font-mono text-sm font-bold ${color}`}>{value}</span>
                    </div>
                  ))}
                  {effectiveTc && (
                    <div className="ml-auto flex flex-col">
                      <span className="text-[9px] text-slate-500 uppercase tracking-wider">TC Activo</span>
                      <span className="font-mono text-sm font-bold text-slate-300">
                        ${effectiveTc.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                        <span className="ml-1 text-[9px] text-slate-500 font-normal">
                          {manualTc > 0 ? '(manual)' : '(MEP)'}
                        </span>
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Dual Charts — Base & Inflacionario */}
              <div className="flex-1 min-h-0 grid grid-cols-2 gap-4">

                <div ref={chartRef} className={`${CARD} p-4 flex flex-col min-h-0`}>
                  <div className="shrink-0 mb-2">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
                      Equilibrio Base
                    </p>
                    <p className="text-[9px] text-slate-600">Ventas vs. Costos</p>
                  </div>
                  <div className="flex-1 min-h-0">
                    <BreakevenChart
                      data={breakevenResult.chartData}
                      breakEvenPoint={breakevenResult.breakEvenUnits}
                    />
                  </div>
                </div>

                <div className={`${CARD} p-4 flex flex-col min-h-0`}>
                  <div className="shrink-0 mb-2">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
                      Escenario Inflacionario
                      {inflationPct > 0 && (
                        <span className="ml-1.5 text-orange-500">+{inflationPct}%</span>
                      )}
                    </p>
                    <p className="text-[9px] text-slate-600">
                      {inflationPct > 0 ? 'Costos variables estresados' : 'Ingresá inflación > 0 para activar'}
                    </p>
                  </div>
                  <div className="flex-1 min-h-0">
                    {inflatedResult ? (
                      <BreakevenChart
                        data={inflatedResult.chartData}
                        breakEvenPoint={inflatedResult.breakEvenUnits}
                      />
                    ) : (
                      <div className="h-full flex items-center justify-center">
                        <p className="text-xs text-slate-700 text-center leading-relaxed">
                          Ajustá el slider de<br />inflación para ver el<br />escenario estresado
                        </p>
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </div>

            {/* RIGHT — 5 cols: Sensitivity + Products + Costs + Insight */}
            <div className="col-span-5 flex flex-col gap-4 min-h-0 overflow-y-auto pr-0.5">

              {/* Sensitivity Matrix */}
              <div className={`${CARD} p-4 shrink-0`}>
                <SensitivityMatrix
                  products={products}
                  fixedCosts={fixedCosts}
                  variableTax={variableTax}
                  projectedSales={projectedSales}
                />
              </div>

              {/* Products Table */}
              <div className={`${CARD} p-4 shrink-0`}>
                <p className={`${SLABEL} mb-3`}>Tabla de Productos</p>
                <ProductsTable
                  products={products}
                  mixTotal={mixTotal}
                  onNameChange={handleNameChange}
                  onProductChange={handleProductChange}
                  onDelete={deleteProduct}
                  onAdd={addProduct}
                />
              </div>

              {/* Fixed Costs */}
              <div className={`${CARD} p-4 shrink-0`}>
                <FixedCostsEditor items={costItems} onChange={setCostItems} />
              </div>

              {/* Strategic Impact Card */}
              <div className="shrink-0">
                <StrategicImpactCard
                baseline={baseline}
                current={currentSnapshot}
                tc={effectiveTc ?? 1420}
                onClearBaseline={() => setBaseline(null)}
              />
              </div>

              <div className={`${CARD} p-4 shrink-0`}>
                <p className={`${SLABEL} mb-2`}>Notas Estratégicas</p>
                <textarea value={observations} onChange={(e) => setObservations(e.target.value)}
                  rows={3} placeholder="Conclusiones del escenario, recomendaciones, riesgos…"
                  className="w-full bg-transparent border-0 outline-none resize-none text-sm text-slate-300
                             placeholder-slate-600 leading-relaxed focus:ring-0" />
              </div>

            </div>
          </div>
        </div>
      </div>
    </>
  );
}
