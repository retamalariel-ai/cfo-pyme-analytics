'use client';

import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { FiTrash2, FiPlus, FiFileText, FiLogOut, FiAlertTriangle } from 'react-icons/fi';
import { calculateBreakeven, getFinancialHealth, calculateStrategicKPIs } from '../lib/calculations';
import { getInitialProducts, saveScenario, supabase } from '../lib/database';
import type { ScenarioRecord } from '../lib/database';
import type { CostItem, Product } from '../lib/types';
import ScenarioSelector from '../components/ScenarioSelector';
import FixedCostsEditor from '../components/FixedCostsEditor';
import Tooltip from '../components/Tooltip';
import SensitivityMatrix from '../components/SensitivityMatrix';

const BreakevenChart = dynamic(() => import('@/components/BreakEvenChart'), { ssr: false });

// ── Design tokens — Light Institutional Theme ─────────────────────────────────
const BG_CARD  = 'bg-white';
const BORDER   = 'border-slate-200';
const GLOW     = 'shadow-sm';
const DATA_BOX = 'bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5';
const INPUT_CLS =
  'bg-white border border-slate-300 rounded-md text-slate-900 font-mono text-sm ' +
  'focus:outline-none focus:ring-1 focus:ring-emerald-500/60 focus:border-emerald-500 ' +
  'transition placeholder-slate-400';

type TabKey = 'config' | 'costs' | 'products';
type EditableField = 'price' | 'variableCost' | 'mixPercentage';
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// ── Safe display helpers ──────────────────────────────────────────────────────
const safeN = (v: number) => (isFinite(v) && !isNaN(v) ? v : 0);
const fmtM  = (v: number | null) =>
  v != null && isFinite(v) && !isNaN(v)
    ? `$${Math.round(v).toLocaleString('es-AR')}`
    : '—';
const fmtP  = (v: number | null) =>
  v != null && isFinite(v) && !isNaN(v) ? `${v.toFixed(1)}%` : '—';

const HEALTH_STYLES = {
  healthy:      { badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  moderate:     { badge: 'bg-amber-50 text-amber-700 border-amber-200',       dot: 'bg-amber-500'   },
  risk:         { badge: 'bg-red-50 text-red-700 border-red-200',             dot: 'bg-red-500'     },
  insufficient: { badge: 'bg-slate-50 text-slate-600 border-slate-200',       dot: 'bg-slate-400'   },
};

const INITIAL_COST_ITEMS: CostItem[] = [
  { id: 1, name: 'Alquiler',  amount: 5000 },
  { id: 2, name: 'Sueldos',   amount: 4000 },
  { id: 3, name: 'Servicios', amount: 1000 },
];

const TIP = {
  breakEvenSales: 'Monto total de ventas necesario para cubrir todos los costos fijos y variables sin generar pérdida ni ganancia.',
  breakEvenUnits: 'Cantidad de unidades equivalentes (ponderadas por mix) que deben venderse para alcanzar el punto de equilibrio.',
  margin:         'Porcentaje de cada peso de venta que queda disponible para cubrir costos fijos después de descontar los costos variables.',
  safetyMargin:   'Cuánto pueden caer las ventas respecto a la proyección antes de entrar en pérdida. A mayor %, más estable el negocio.',
  breakEvenDay:   'Día del mes en que, a ritmo constante de ventas, la empresa cubre todos sus costos y comienza a generar utilidad.',
  targetSales:    'Facturación necesaria para lograr la utilidad deseada después de cubrir todos los costos (fijos + variables).',
  ebitda:         'Resultado operativo estimado antes de intereses, impuestos y amortizaciones, sobre las ventas proyectadas ingresadas.',
  opLeverage:     'Cuántas veces se amplifica el cambio en resultado operativo ante una variación del 1% en ventas. Cuanto mayor, más riesgo y más potencial ante crecimiento.',
};

export default function Home() {
  const router   = useRouter();
  const chartRef = useRef<HTMLDivElement>(null);

  // Auth
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

  // UI state
  const [activeTab, setActiveTab] = useState<TabKey>('config');

  // Data state
  const [products,       setProducts]       = useState<Product[]>(getInitialProducts);
  const [costItems,      setCostItems]      = useState<CostItem[]>(INITIAL_COST_ITEMS);
  const [variableTax,    setVariableTax]    = useState(10);
  const [observations,   setObservations]   = useState('');
  const [projectedSales, setProjectedSales] = useState(30000);
  const [targetProfit,   setTargetProfit]   = useState(5000);

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

  // Product handlers
  const handleProductChange = (id: number, field: EditableField, raw: string) => {
    const value = Number(raw);
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

  // Scenario handlers
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
      clientId: userId, products, costItems, fixedCosts, variableTax, observations,
    });
    setSaving(false);
    setSaveMessage(error
      ? { text: `Error: ${error}`, ok: false }
      : { text: 'Escenario guardado.', ok: true }
    );
    setTimeout(() => setSaveMessage(null), 4000);
  };

  // PDF
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

      // Color helpers
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

      // ── 1. HEADER ──────────────────────────────────────────────────────────
      sf(Co.bg); doc.rect(0, 0, pageW, 22, 'F');
      sd(Co.border); doc.setLineWidth(0.2); doc.line(0, 22, pageW, 22);
      sf(Co.emerald); doc.circle(ML + 2.5, 8.5, 2.5, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12); st(Co.text);
      doc.text('CFO Tech Partners — Reporte de Equilibrio Estratégico', ML + 8, 10);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); st(Co.muted);
      doc.text(
        `${new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })}  ·  ${health.label}  ·  Costos Fijos: $${fixedCosts.toLocaleString('es-AR')}  ·  IIBB: ${variableTax}%`,
        ML + 8, 17
      );

      // ── 2. KPI STRIP ───────────────────────────────────────────────────────
      const kpiY = 25, kpiH = 15;
      const smV   = safeN(kpi.safetyMargin ?? 0);
      const cmTot = projectedSales * (breakevenResult.averageContributionMargin / 100);
      const olV   = kpi.ebitda != null && isFinite(kpi.ebitda) && kpi.ebitda > 0
        ? cmTot / kpi.ebitda : null;
      const kpiStrip: { label: string; value: string; color: RGB }[] = [
        { label: 'EBITDA',       value: fmtV(kpi.ebitda),       color: (kpi.ebitda ?? 0) >= 0 ? Co.emerald : Co.red   },
        { label: 'Margen Seg.',  value: `${smV.toFixed(1)}%`,   color: smV < 10 ? Co.red : smV < 25 ? Co.amber : Co.emerald },
        { label: 'Día P.E.',     value: kpi.breakEvenDay != null ? `Día ${kpi.breakEvenDay}/30` : '—', color: Co.text },
        { label: 'Vtas. Obj.',   value: fmtV(kpi.salesForTargetProfit), color: Co.amber                               },
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

      // ── 3. CHART ───────────────────────────────────────────────────────────
      const chY = kpiY + kpiH + 4, chH = 50;
      const cpx = ML + 2, cpy = chY + 3, cpw = CW - 4, cph = chH - 8;
      sf(Co.white); sd(Co.border); doc.setLineWidth(0.2);
      doc.roundedRect(ML, chY, CW, chH, 2, 2, 'FD');

      const cdata = breakevenResult.chartData;
      const maxU  = cdata.at(-1)?.units || 1;
      const maxV  = Math.max(...cdata.map(d => Math.max(d.totalSales, d.totalCosts))) || 1;
      const mapX  = (u: number) => cpx + (u / maxU) * cpw;
      const mapY  = (v: number) => cpy + cph - (v / maxV) * cph;

      // Grid lines
      [0.25, 0.5, 0.75].forEach(t => {
        sd(Co.border); doc.setLineWidth(0.1);
        doc.line(cpx, cpy + (1 - t) * cph, cpx + cpw, cpy + (1 - t) * cph);
      });

      // Polygon fill zones (profit = green, loss = red)
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

      // Chart lines
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

      // Breakeven vertical marker
      if (beU > 0 && beU <= maxU) {
        const bex = mapX(beU);
        sd(Co.emerald); doc.setLineWidth(0.3);
        doc.setLineDashPattern([1.5, 1], 0);
        doc.line(bex, cpy, bex, cpy + cph);
        doc.setLineDashPattern([], 0);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5); st(Co.emerald);
        doc.text(`P.E. ≈ ${Math.round(beU)} u.`, bex + 1, cpy + 4);
      }

      // Chart legend
      const lgY = chY + chH - 5;
      ([Co.emerald, Co.red, Co.light] as RGB[]).forEach((color, i) => {
        const label = ['Ventas Totales', 'Costos Totales', 'Costos Fijos'][i];
        const lx = ML + i * 65;
        sf(color); doc.rect(lx, lgY - 1.2, 6, 1.5, 'F');
        doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5); st(Co.muted);
        doc.text(label, lx + 7.5, lgY);
      });

      // ── 4. SENSITIVITY MATRIX ──────────────────────────────────────────────
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

      // ── 5. COSTS + PRODUCTS SIDE BY SIDE ──────────────────────────────────
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

      // ── 6. NOTES ───────────────────────────────────────────────────────────
      if (observations.trim()) {
        const notesY = Math.max(costsEndY, prodEndY) + 6;
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); st(Co.text);
        doc.text('Notas Estratégicas del Consultor', ML, notesY);
        sf(Co.bg); sd(Co.border); doc.setLineWidth(0.2);
        doc.roundedRect(ML, notesY + 2, CW, 18, 1.5, 1.5, 'FD');
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7); st(Co.muted);
        doc.text(doc.splitTextToSize(observations.trim(), CW - 6), ML + 3, notesY + 7);
      }

      // ── 7. FOOTER (all pages) ──────────────────────────────────────────────
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
  const mixTotal = products.reduce((sum, p) => sum + p.mixPercentage, 0);
  const health   = getFinancialHealth(breakevenResult);
  const hStyle   = HEALTH_STYLES[health.status];
  const kpi = calculateStrategicKPIs(
    breakevenResult.breakEvenSales, projectedSales, fixedCosts,
    breakevenResult.averageContributionMargin / 100, targetProfit
  );

  const kpiColor = (v: number | null) =>
    v == null || !isFinite(v) || isNaN(v)
      ? 'text-slate-400'
      : v >= 0 ? 'text-emerald-700' : 'text-red-700';

  const cmTotal           = projectedSales * (breakevenResult.averageContributionMargin / 100);
  const operatingLeverage =
    kpi.ebitda != null && isFinite(kpi.ebitda) && kpi.ebitda > 0
      ? cmTotal / kpi.ebitda
      : null;
  const olColor =
    operatingLeverage == null ? 'text-slate-400'
    : operatingLeverage > 5  ? 'text-red-700'
    : operatingLeverage > 3  ? 'text-amber-600'
    : 'text-emerald-700';

  // ── KPI cards ────────────────────────────────────────────────────────────────
  const smValue = kpi.safetyMargin ?? 0;
  const kpiCards = [
    {
      label: 'EBITDA',
      value: fmtM(kpi.ebitda),
      color: kpiColor(kpi.ebitda),
      tip: TIP.ebitda,
      pct: kpi.ebitda != null && projectedSales > 0
        ? Math.max(0, Math.min(100, (kpi.ebitda / projectedSales) * 300))
        : 0,
      barColor: (kpi.ebitda ?? 0) >= 0 ? 'bg-emerald-500' : 'bg-red-500',
      warn: false,
    },
    {
      label: 'Margen Seg.',
      value: fmtP(kpi.safetyMargin),
      color: smValue < 10 ? 'text-red-700' : smValue < 25 ? 'text-amber-600' : 'text-emerald-700',
      tip: TIP.safetyMargin,
      pct: Math.max(0, Math.min(100, smValue)),
      barColor: smValue < 10 ? 'bg-red-500' : smValue < 25 ? 'bg-amber-500' : 'bg-emerald-500',
      warn: smValue < 10,
    },
    {
      label: 'Día P.E.',
      value: kpi.breakEvenDay != null ? `${kpi.breakEvenDay}/30` : '—',
      color: 'text-slate-800',
      tip: TIP.breakEvenDay,
      pct: kpi.breakEvenDay != null ? Math.max(0, 100 - (kpi.breakEvenDay / 30) * 100) : 0,
      barColor: (kpi.breakEvenDay ?? 30) <= 20 ? 'bg-emerald-500' : (kpi.breakEvenDay ?? 30) <= 25 ? 'bg-amber-500' : 'bg-red-500',
      warn: false,
    },
    {
      label: 'Vtas. Obj.',
      value: fmtM(kpi.salesForTargetProfit),
      color: 'text-amber-700',
      tip: TIP.targetSales,
      pct: kpi.salesForTargetProfit != null && kpi.salesForTargetProfit > 0
        ? Math.max(0, Math.min(100, (projectedSales / kpi.salesForTargetProfit) * 100))
        : 0,
      barColor: 'bg-amber-500',
      warn: false,
    },
    {
      label: 'Apalan. Op.',
      value: operatingLeverage != null ? `${operatingLeverage.toFixed(2)}x` : '—',
      color: olColor,
      tip: TIP.opLeverage,
      pct: operatingLeverage != null
        ? Math.max(0, Math.min(100, (1 - (operatingLeverage - 1) / 9) * 100))
        : 0,
      barColor: operatingLeverage == null ? 'bg-slate-300' : operatingLeverage > 5 ? 'bg-red-500' : operatingLeverage > 3 ? 'bg-amber-500' : 'bg-emerald-500',
      warn: false,
    },
  ];

  // ── AI Insights ──────────────────────────────────────────────────────────────
  const cmr = safeN(breakevenResult.averageContributionMargin);
  const sm  = kpi.safetyMargin ?? -999;
  type InsightColor = 'emerald' | 'amber' | 'red' | 'slate';
  const insight: { color: InsightColor; label: string; msg: string } = (() => {
    if (products.length === 0)
      return { color: 'slate',   label: 'Sin Datos',                    msg: 'Ingresá productos para obtener recomendaciones estratégicas automáticas.' };
    if (sm < 0)
      return { color: 'red',     label: 'Situación de Quebranto',       msg: 'Las ventas proyectadas no alcanzan el punto de equilibrio. Reducí costos o ajustá los precios para cruzar el umbral.' };
    if (sm < 10)
      return { color: 'red',     label: 'Alerta: Margen Crítico',       msg: `Con solo ${fmtP(kpi.safetyMargin)} de colchón de seguridad, cualquier caída en ventas genera pérdidas. Se requiere acción inmediata sobre precios o costos.` };
    if (cmr >= 40 && sm >= 25)
      return { color: 'emerald', label: 'Estructura Saludable',         msg: `Margen de contribución del ${cmr.toFixed(1)}% y colchón de seguridad del ${fmtP(kpi.safetyMargin)}. La empresa tiene buena resiliencia ante caídas de demanda.` };
    if (cmr >= 25)
      return { color: 'amber',   label: 'Estructura Moderada',          msg: `Margen de contribución (${cmr.toFixed(1)}%) suficiente, pero el colchón (${fmtP(kpi.safetyMargin)}) indica exposición ante shocks de demanda. Revisá la estructura de costos variables.` };
    return   { color: 'amber',   label: 'Margen de Contribución Bajo',  msg: `El margen (${cmr.toFixed(1)}%) es insuficiente para cubrir los costos fijos con holgura. Evaluá un ajuste de precios o reducción de costos variables.` };
  })();

  const insightColors = {
    emerald: { bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-500', title: 'text-emerald-800', text: 'text-emerald-700' },
    amber:   { bg: 'bg-amber-50',   border: 'border-amber-200',   dot: 'bg-amber-500',   title: 'text-amber-800',   text: 'text-amber-700'   },
    red:     { bg: 'bg-red-50',     border: 'border-red-200',     dot: 'bg-red-500',     title: 'text-red-800',     text: 'text-red-700'     },
    slate:   { bg: 'bg-slate-50',   border: 'border-slate-200',   dot: 'bg-slate-400',   title: 'text-slate-700',   text: 'text-slate-500'   },
  };
  const ic = insightColors[insight.color];

  return (
    <main className="min-h-screen p-5">

      {/* ── Header ── */}
      <header className="mb-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <div className="flex h-5 w-5 items-center justify-center rounded bg-emerald-600">
                <svg viewBox="0 0 24 24" fill="none" className="h-3 w-3 text-white">
                  <path d="M3 17l5-5 4 4 9-9" stroke="currentColor" strokeWidth="2.5"
                    strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <span className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase">
                CFO Tech Partners
              </span>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">CFO Command Center</h1>
            <p className="text-[10px] text-slate-400 mt-0.5 uppercase tracking-widest">
              Análisis de Punto de Equilibrio
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="w-64">
              <ScenarioSelector clientId={userId} onLoad={loadScenario} />
            </div>
            <button onClick={generatePDF} disabled={generatingPdf || products.length === 0}
              className={`flex items-center gap-1.5 px-3 py-1.5 ${BG_CARD} border ${BORDER}
                          hover:border-slate-300 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed
                          rounded-lg text-xs font-medium text-slate-600 transition`}>
              <FiFileText size={12} />
              {generatingPdf ? 'Generando…' : 'PDF'}
            </button>
            <button onClick={handleSaveScenario} disabled={saving || products.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700
                         disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-xs font-medium text-white transition">
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
            <button onClick={handleSignOut}
              className={`p-1.5 ${BG_CARD} border ${BORDER} rounded-lg text-slate-400 hover:text-red-600 transition`}
              title="Cerrar sesión">
              <FiLogOut size={13} />
            </button>
          </div>
        </div>
        {saveMessage && (
          <p className={`mt-1.5 text-xs ${saveMessage.ok ? 'text-emerald-700' : 'text-red-700'}`}>
            {saveMessage.text}
          </p>
        )}
      </header>

      {/* ── Health banner ── */}
      <div className={`mb-4 flex items-start gap-2.5 px-4 py-3 rounded-xl border ${hStyle.badge}`}>
        <span className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${hStyle.dot}`} />
        <div>
          <span className="font-semibold text-xs">{health.label}</span>
          <span className="text-[10px] opacity-75 ml-2">{health.message}</span>
        </div>
      </div>

      {/* ── Two-column layout ── */}
      <div className="grid grid-cols-5 gap-4">

        {/* ── LEFT COLUMN (40%) — Tabs ── */}
        <div className="col-span-2">
          <div className={`${BG_CARD} rounded-2xl border ${BORDER} ${GLOW}`}>

            {/* Tab nav — active: emerald underline */}
            <div className="flex border-b border-slate-200">
              {([
                { key: 'config',   label: 'Configuración' },
                { key: 'costs',    label: 'Costos Fijos'  },
                { key: 'products', label: 'Productos'      },
              ] as { key: TabKey; label: string }[]).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`flex-1 py-3 px-2 text-[10px] font-semibold uppercase tracking-widest
                              border-b-2 -mb-px transition
                              ${activeTab === key
                                ? 'border-emerald-600 text-emerald-700'
                                : 'border-transparent text-slate-400 hover:text-slate-600'
                              }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="p-5">

              {/* Configuración */}
              {activeTab === 'config' && (
                <div className="space-y-3">
                  {[
                    { label: 'Impuestos sobre Ventas (IIBB %)', value: variableTax,    set: setVariableTax,    min: 0, max: 100 },
                    { label: 'Ventas Proyectadas ($)',           value: projectedSales, set: setProjectedSales, min: 0, max: undefined },
                    { label: 'Utilidad Objetivo ($)',            value: targetProfit,   set: setTargetProfit,   min: 0, max: undefined },
                  ].map(({ label, value, set, min, max }) => (
                    <div key={label}>
                      <label className="block mb-1 text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                        {label}
                      </label>
                      <input
                        type="number" value={value} min={min} max={max}
                        onChange={(e) => set(Number(e.target.value))}
                        className={`w-full px-2.5 py-2 ${INPUT_CLS}`}
                      />
                    </div>
                  ))}

                  {/* Resultados Base */}
                  <div className="border-t border-slate-100 pt-4 mt-2 space-y-2">
                    <p className="text-[9px] font-medium text-slate-400 uppercase tracking-widest mb-2">
                      Resultados Base
                    </p>
                    {[
                      { label: 'Ventas P.E.',   value: `$${safeN(breakevenResult.breakEvenSales).toLocaleString('es-AR',{maximumFractionDigits:0})}`, color: 'text-emerald-700', tip: TIP.breakEvenSales },
                      { label: 'Unidades P.E.', value: safeN(breakevenResult.breakEvenUnits).toLocaleString('es-AR',{maximumFractionDigits:1}),        color: 'text-slate-700',   tip: TIP.breakEvenUnits },
                      { label: 'Margen C.',     value: `${safeN(breakevenResult.averageContributionMargin).toFixed(1)}%`,                               color: 'text-slate-600',   tip: TIP.margin },
                    ].map(({ label, value, color, tip }) => (
                      <div key={label} className="flex items-center justify-between gap-2">
                        <Tooltip content={tip}>
                          <span className="text-[10px] text-slate-500 uppercase tracking-wider cursor-help">{label}</span>
                        </Tooltip>
                        <div className={DATA_BOX}>
                          <span className={`font-mono text-xs font-bold ${color}`}>{value}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Costos Fijos */}
              {activeTab === 'costs' && (
                <FixedCostsEditor items={costItems} onChange={setCostItems} />
              )}

              {/* Productos */}
              {activeTab === 'products' && (
                <div>
                  {products.length > 0 && mixTotal !== 100 && (
                    <p className="text-[10px] text-amber-600 mb-3 flex items-center gap-1">
                      <FiAlertTriangle size={10} /> Mix: {mixTotal}% ≠ 100%
                    </p>
                  )}
                  <div className="overflow-x-auto">
                    <table className="min-w-full">
                      <thead>
                        <tr className="border-b border-slate-200">
                          {['Nombre', 'Precio', 'C.Var', 'Mix%', ''].map((h, i) => (
                            <th key={i} className="pb-2 px-1 text-left text-[9px] font-medium text-slate-500 uppercase tracking-wider">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {products.map((p) => (
                          <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50 transition">
                            <td className="py-2 px-1 text-xs text-slate-600 font-medium">{p.name}</td>
                            <td className="py-2 px-1">
                              <input type="number" value={p.price} min={0}
                                onChange={(e) => handleProductChange(p.id, 'price', e.target.value)}
                                className={`w-20 px-1.5 py-1 text-xs ${INPUT_CLS}`} />
                            </td>
                            <td className="py-2 px-1">
                              <input type="number" value={p.variableCost} min={0}
                                onChange={(e) => handleProductChange(p.id, 'variableCost', e.target.value)}
                                className={`w-20 px-1.5 py-1 text-xs ${INPUT_CLS}`} />
                            </td>
                            <td className="py-2 px-1">
                              <input type="number" value={p.mixPercentage} min={0} max={100}
                                onChange={(e) => handleProductChange(p.id, 'mixPercentage', e.target.value)}
                                className={`w-14 px-1.5 py-1 text-xs ${INPUT_CLS}`} />
                            </td>
                            <td className="py-2 px-1">
                              <button onClick={() => deleteProduct(p.id)}
                                className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition">
                                <FiTrash2 size={11} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button onClick={addProduct}
                    className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border
                               border-dashed border-slate-300 hover:border-emerald-400 px-4 py-2 text-[10px]
                               text-slate-400 hover:text-emerald-700 transition">
                    <FiPlus size={11} /> Añadir Producto
                  </button>
                </div>
              )}

            </div>
          </div>
        </div>

        {/* ── RIGHT COLUMN (60%) ── */}
        <div className="col-span-3 flex flex-col gap-3">

          {/* 1. KPI Strip with semaphore progress bars */}
          <div className="grid grid-cols-5 gap-3">
            {kpiCards.map(({ label, value, color, tip, pct, barColor, warn }) => (
              <div key={label} className={`${BG_CARD} border ${BORDER} ${GLOW} rounded-2xl px-4 py-4 flex flex-col gap-2`}>
                <Tooltip content={tip}>
                  <span className="text-[9px] text-slate-400 uppercase tracking-widest flex items-center gap-1 cursor-help">
                    {warn && <FiAlertTriangle size={9} className="text-red-600" />}
                    {label}
                  </span>
                </Tooltip>
                <span className={`font-mono text-2xl font-bold tabular-nums leading-none ${color}`}>
                  {value}
                </span>
                {/* Semaphore progress bar */}
                <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* 2. Chart */}
          <div className={`${BG_CARD} border ${BORDER} ${GLOW} rounded-2xl p-5`}>
            <p className="text-[9px] text-slate-400 uppercase tracking-widest mb-4">
              Gráfico de Equilibrio · Ventas vs. Costos
            </p>
            <div ref={chartRef} className="h-[240px] w-full">
              <BreakevenChart
                data={breakevenResult.chartData}
                breakEvenPoint={breakevenResult.breakEvenUnits}
              />
            </div>
          </div>

          {/* 3. Sensitivity Matrix */}
          <div className={`${BG_CARD} border ${BORDER} ${GLOW} rounded-2xl p-5`}>
            <SensitivityMatrix
              products={products}
              fixedCosts={fixedCosts}
              variableTax={variableTax}
              projectedSales={projectedSales}
            />
          </div>

          {/* 4. AI Insights — Recomendación Estratégica Automática */}
          <div className={`${ic.bg} border ${ic.border} rounded-2xl p-5`}>
            <div className="flex items-center gap-2 mb-2">
              <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${ic.dot}`} />
              <p className="text-[9px] text-slate-400 uppercase tracking-widest">
                Recomendación Estratégica Automática
              </p>
            </div>
            <p className={`text-xs font-semibold ${ic.title} mb-1`}>{insight.label}</p>
            <p className={`text-xs ${ic.text} leading-relaxed`}>{insight.msg}</p>
          </div>

          {/* 5. Notas Estratégicas */}
          <div className={`${BG_CARD} border ${BORDER} ${GLOW} rounded-2xl p-5`}>
            <p className="text-[9px] text-slate-400 uppercase tracking-widest mb-3">
              Notas Estratégicas
            </p>
            <textarea
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              rows={3}
              placeholder="Conclusiones del escenario, recomendaciones para el cliente, riesgos identificados…"
              className="w-full bg-transparent border-0 outline-none resize-none text-xs text-slate-600 placeholder-slate-300 leading-relaxed"
            />
          </div>

        </div>
      </div>

    </main>
  );
}
