'use client';

import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { FiTrash2, FiPlus, FiFileText, FiLogOut, FiAlertTriangle,
         FiTrendingUp, FiShield, FiCalendar, FiFlag, FiActivity,
         FiGrid, FiList } from 'react-icons/fi';
import { calculateBreakeven, getFinancialHealth, calculateStrategicKPIs } from '../lib/calculations';
import { getInitialProducts, saveScenario, supabase } from '../lib/database';
import type { ScenarioRecord } from '../lib/database';
import type { CostItem, Product } from '../lib/types';
import ScenarioSelector from '../components/ScenarioSelector';
import FixedCostsEditor from '../components/FixedCostsEditor';
import Tooltip from '../components/Tooltip';
import SensitivityMatrix from '../components/SensitivityMatrix';

const BreakevenChart = dynamic(() => import('@/components/BreakEvenChart'), { ssr: false });

// ── Design tokens ─────────────────────────────────────────────────────────────
const CARD =
  'bg-white rounded-2xl border border-black/[0.06] ' +
  'shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.06)]';
const INPUT_CLS =
  'bg-white border border-black/10 rounded-xl text-gray-900 font-mono text-sm ' +
  'focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 ' +
  'transition-all duration-150 placeholder-gray-400 hover:border-black/20';
const LABEL = 'block mb-1.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wider';
const SLABEL = 'text-[10px] font-semibold text-gray-500 uppercase tracking-wider';

type EditableField = 'price' | 'variableCost' | 'mixPercentage';
type MobileTab = 'sim' | 'matrix' | 'structure';
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// ── Helpers ───────────────────────────────────────────────────────────────────
const safeN = (v: number) => (isFinite(v) && !isNaN(v) ? v : 0);
const fmtM  = (v: number | null) =>
  v != null && isFinite(v) && !isNaN(v) ? `$${Math.round(v).toLocaleString('es-AR')}` : '—';
const fmtP  = (v: number | null) =>
  v != null && isFinite(v) && !isNaN(v) ? `${v.toFixed(1)}%` : '—';

const HEALTH_STYLES = {
  healthy:      { badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  moderate:     { badge: 'bg-amber-50 text-amber-700 border-amber-200',       dot: 'bg-amber-500'   },
  risk:         { badge: 'bg-red-50 text-red-700 border-red-200',             dot: 'bg-red-500'     },
  insufficient: { badge: 'bg-gray-50 text-gray-600 border-gray-200',          dot: 'bg-gray-400'    },
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
  const [mobileTab, setMobileTab] = useState<MobileTab>('sim');

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
      clientId: userId, products, costItems, fixedCosts, variableTax, observations,
    });
    setSaving(false);
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
    return `u$s ${Math.round(v / effectiveTc).toLocaleString('es-AR')}`;
  };

  const inflatedResult = inflationPct > 0
    ? calculateBreakeven(
        products.map(p => ({ ...p, variableCost: p.variableCost * (1 + inflationPct / 100) })),
        fixedCosts, variableTax
      )
    : null;
  const inflationErosion = inflatedResult
    ? inflatedResult.averageContributionMargin - breakevenResult.averageContributionMargin
    : null;

  const kpiColor = (v: number | null) =>
    v == null || !isFinite(v) || isNaN(v) ? 'text-gray-400'
    : v >= 0 ? 'text-emerald-600' : 'text-red-600';

  const cmTotal           = projectedSales * (breakevenResult.averageContributionMargin / 100);
  const operatingLeverage =
    kpi.ebitda != null && isFinite(kpi.ebitda) && kpi.ebitda > 0
      ? cmTotal / kpi.ebitda : null;
  const olColor =
    operatingLeverage == null ? 'text-gray-400'
    : operatingLeverage > 5  ? 'text-red-600'
    : operatingLeverage > 3  ? 'text-amber-600'
    : 'text-emerald-600';

  // ── KPI cards data ────────────────────────────────────────────────────────
  const smValue = kpi.safetyMargin ?? 0;
  const kpiCards = [
    {
      label:    'EBITDA',
      icon:     <FiTrendingUp size={13} />,
      iconBg:   (kpi.ebitda ?? 0) >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600',
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
      iconBg:   smValue < 10 ? 'bg-red-50 text-red-600' : smValue < 25 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600',
      value:    fmtP(kpi.safetyMargin),
      usd:      '',
      color:    smValue < 10 ? 'text-red-600' : smValue < 25 ? 'text-amber-600' : 'text-emerald-600',
      tip:      TIP.safetyMargin,
      pct:      Math.max(0, Math.min(100, smValue)),
      barColor: smValue < 10 ? 'bg-red-500' : smValue < 25 ? 'bg-amber-500' : 'bg-emerald-500',
      warn:     smValue < 10,
    },
    {
      label:    'Día P.E.',
      icon:     <FiCalendar size={13} />,
      iconBg:   'bg-blue-50 text-blue-600',
      value:    kpi.breakEvenDay != null ? `${kpi.breakEvenDay}/30` : '—',
      usd:      '',
      color:    'text-gray-800',
      tip:      TIP.breakEvenDay,
      pct:      kpi.breakEvenDay != null ? Math.max(0, 100 - (kpi.breakEvenDay / 30) * 100) : 0,
      barColor: (kpi.breakEvenDay ?? 30) <= 20 ? 'bg-emerald-500' : (kpi.breakEvenDay ?? 30) <= 25 ? 'bg-amber-500' : 'bg-red-500',
      warn:     false,
    },
    {
      label:    'Vtas. Obj.',
      icon:     <FiFlag size={13} />,
      iconBg:   kpi.salesForTargetProfit == null ? 'bg-gray-50 text-gray-400' : 'bg-amber-50 text-amber-600',
      value:    fmtM(kpi.salesForTargetProfit),
      usd:      toUSD(kpi.salesForTargetProfit),
      color:    kpi.salesForTargetProfit == null ? 'text-gray-400' : 'text-amber-600',
      tip:      TIP.targetSales,
      pct:      kpi.salesForTargetProfit != null && kpi.salesForTargetProfit > 0
                  ? Math.max(0, Math.min(100, (projectedSales / kpi.salesForTargetProfit) * 100)) : 0,
      barColor: 'bg-amber-500',
      warn:     kpi.salesForTargetProfit == null && targetMarginPct > 0,
    },
    {
      label:    'Apalan. Op.',
      icon:     <FiActivity size={13} />,
      iconBg:   operatingLeverage == null ? 'bg-gray-50 text-gray-400' : operatingLeverage > 5 ? 'bg-red-50 text-red-600' : operatingLeverage > 3 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600',
      value:    operatingLeverage != null ? `${operatingLeverage.toFixed(2)}x` : '—',
      usd:      '',
      color:    olColor,
      tip:      TIP.opLeverage,
      pct:      operatingLeverage != null ? Math.max(0, Math.min(100, (1 - (operatingLeverage - 1) / 9) * 100)) : 0,
      barColor: operatingLeverage == null ? 'bg-gray-200' : operatingLeverage > 5 ? 'bg-red-500' : operatingLeverage > 3 ? 'bg-amber-500' : 'bg-emerald-500',
      warn:     false,
    },
  ];

  // ── AI Insight ────────────────────────────────────────────────────────────
  const cmr = safeN(breakevenResult.averageContributionMargin);
  const sm  = kpi.safetyMargin ?? -999;
  type InsightColor = 'emerald' | 'amber' | 'red' | 'slate';
  const insight: { color: InsightColor; label: string; msg: string } = (() => {
    if (products.length === 0)
      return { color: 'slate',   label: 'Sin Datos',                   msg: 'Ingresá productos para obtener recomendaciones estratégicas automáticas.' };
    if (sm < 0)
      return { color: 'red',     label: 'Situación de Quebranto',      msg: 'Las ventas proyectadas no alcanzan el punto de equilibrio. Reducí costos o ajustá los precios para cruzar el umbral.' };
    if (sm < 10)
      return { color: 'red',     label: 'Alerta: Margen Crítico',      msg: `Con solo ${fmtP(kpi.safetyMargin)} de colchón, cualquier caída en ventas genera pérdidas. Se requiere acción inmediata.` };
    if (cmr >= 40 && sm >= 25)
      return { color: 'emerald', label: 'Estructura Saludable',        msg: `Margen de contribución del ${cmr.toFixed(1)}% y colchón del ${fmtP(kpi.safetyMargin)}. Buena resiliencia ante caídas de demanda.` };
    if (cmr >= 25)
      return { color: 'amber',   label: 'Estructura Moderada',         msg: `Margen (${cmr.toFixed(1)}%) suficiente pero colchón (${fmtP(kpi.safetyMargin)}) indica exposición ante shocks. Revisá costos variables.` };
    return   { color: 'amber',   label: 'Margen de Contribución Bajo', msg: `El margen (${cmr.toFixed(1)}%) es insuficiente. Evaluá un ajuste de precios o reducción de costos variables.` };
  })();

  const insightColors = {
    emerald: { bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-500', title: 'text-emerald-800', text: 'text-emerald-700' },
    amber:   { bg: 'bg-amber-50',   border: 'border-amber-200',   dot: 'bg-amber-500',   title: 'text-amber-800',   text: 'text-amber-700'   },
    red:     { bg: 'bg-red-50',     border: 'border-red-200',     dot: 'bg-red-500',     title: 'text-red-800',     text: 'text-red-700'     },
    slate:   { bg: 'bg-gray-50',    border: 'border-gray-200',    dot: 'bg-gray-400',    title: 'text-gray-700',    text: 'text-gray-500'    },
  };
  const ic = insightColors[insight.color];

  // ── Shared sub-elements ───────────────────────────────────────────────────
  const SaveToast = () => saveMessage ? (
    <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium
                    ${saveMessage.ok
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      : 'bg-red-50 border-red-200 text-red-700'}`}>
      {saveMessage.text}
    </div>
  ) : null;

  const InsightPanel = ({ compact = false }: { compact?: boolean }) => (
    <div className={`rounded-2xl border ${compact ? 'p-3.5' : 'p-4'} ${ic.bg} ${ic.border}`}>
      <div className="flex items-start gap-2.5">
        <div className={`mt-0.5 h-7 w-7 rounded-xl flex items-center justify-center shrink-0
                        ${ic.dot === 'bg-emerald-500' ? 'bg-emerald-100'
                          : ic.dot === 'bg-amber-500' ? 'bg-amber-100'
                          : ic.dot === 'bg-red-500'   ? 'bg-red-100'
                          : 'bg-gray-100'}`}>
          <span className={`h-2 w-2 rounded-full ${ic.dot}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-widest mb-0.5">
            Recomendación Estratégica
          </p>
          <p className={`text-xs font-semibold ${ic.title} mb-1`}>{insight.label}</p>
          <p className={`text-[11px] ${ic.text} leading-relaxed`}>{insight.msg}</p>
          {inflationErosion != null && inflationErosion < -2 && (
            <div className="mt-2.5 flex items-start gap-2 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2">
              <FiAlertTriangle size={11} className="text-orange-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-[10px] font-semibold text-orange-800">Erosión Inflacionaria</p>
                <p className="text-[10px] text-orange-700 leading-relaxed mt-0.5">
                  Con {inflationPct}% de inflación, el margen cae {Math.abs(inflationErosion).toFixed(1)} pp
                  (de {safeN(breakevenResult.averageContributionMargin).toFixed(1)}%
                  a {safeN(inflatedResult!.averageContributionMargin).toFixed(1)}%).
                  {inflatedResult!.averageContributionMargin < 20 ? ' Revisar precios urgente.' : ' Monitorear insumos.'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const ProductsTable = ({ compact = false }: { compact?: boolean }) => (
    <div>
      {products.length > 0 && mixTotal !== 100 && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-xl bg-amber-50 border border-amber-100">
          <FiAlertTriangle size={11} className="text-amber-500 shrink-0" />
          <p className="text-[11px] text-amber-700 font-medium">Mix total: {mixTotal}% — debe sumar 100%</p>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[320px]">
          <thead>
            <tr className="border-b border-black/[0.06]">
              <th className={`pb-2 px-1 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider ${compact ? 'pb-1.5' : ''}`}>Nombre</th>
              <th className="pb-2 px-1 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Precio</th>
              <th className="pb-2 px-1 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                <Tooltip content={TIP.cvar}>
                  <span className="cursor-help underline decoration-dotted underline-offset-2">C.Var</span>
                </Tooltip>
              </th>
              <th className="pb-2 px-1 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                <Tooltip content={TIP.mixPct}>
                  <span className="cursor-help underline decoration-dotted underline-offset-2">Mix%</span>
                </Tooltip>
              </th>
              <th className="pb-2 px-1" />
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-b border-black/[0.04] hover:bg-gray-50 transition-colors">
                <td className="py-2 px-1 text-xs text-gray-700 font-medium truncate max-w-[80px]">{p.name}</td>
                <td className="py-2 px-1">
                  <input type="number" value={p.price} min={0}
                    onChange={(e) => handleProductChange(p.id, 'price', e.target.value)}
                    className={`w-16 px-2 py-1.5 text-xs ${INPUT_CLS}`} />
                </td>
                <td className="py-2 px-1">
                  <input type="number" value={p.variableCost} min={0}
                    onChange={(e) => handleProductChange(p.id, 'variableCost', e.target.value)}
                    className={`w-16 px-2 py-1.5 text-xs ${INPUT_CLS}`} />
                </td>
                <td className="py-2 px-1">
                  <input type="number" value={p.mixPercentage} min={0} max={100}
                    onChange={(e) => handleProductChange(p.id, 'mixPercentage', e.target.value)}
                    className={`w-12 px-2 py-1.5 text-xs ${INPUT_CLS}`} />
                </td>
                <td className="py-2 px-1">
                  <button onClick={() => deleteProduct(p.id)}
                    className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all">
                    <FiTrash2 size={11} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button onClick={addProduct}
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border
                   border-dashed border-gray-200 hover:border-emerald-400 hover:bg-emerald-50
                   px-4 py-2 text-[11px] font-medium text-gray-400 hover:text-emerald-600 transition-all">
        <FiPlus size={11} /> Añadir Producto
      </button>
    </div>
  );

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ═══════════════════════════════════════════════════════════════════
          MOBILE VIEW  —  block md:hidden
          Tabbed system: Simulador | Matriz | Estructura
      ════════════════════════════════════════════════════════════════════ */}
      <div className="block md:hidden min-h-screen bg-[#F5F7FA] flex flex-col pb-16">

        {/* Mobile Header */}
        <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-xl border-b border-black/[0.06] px-4">
          <div className="h-14 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 shrink-0">
              <div className="h-7 w-7 rounded-lg bg-emerald-500 flex items-center justify-center shadow-sm shadow-emerald-500/30">
                <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5 text-white">
                  <path d="M3 17l5-5 4 4 9-9" stroke="currentColor" strokeWidth="2.5"
                    strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div>
                <p className="text-[13px] font-semibold text-gray-900 leading-none">CFO Command</p>
                <p className="text-[9px] text-gray-400 leading-none mt-0.5 tracking-wide">
                  <span className={`inline-block h-1.5 w-1.5 rounded-full mr-1 ${hStyle.dot}`} />
                  {health.label}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleSaveScenario} disabled={saving || products.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600
                           disabled:opacity-40 rounded-xl text-[12px] font-semibold text-white
                           transition-all shadow-sm shadow-emerald-500/25">
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
              <button onClick={handleSignOut}
                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all">
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
                  {warn && <FiAlertTriangle size={10} className="text-red-500" />}
                </div>
                <div className="min-w-0">
                  <Tooltip content={tip}>
                    <span className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider">{label}</span>
                  </Tooltip>
                  <p className={`font-mono text-sm font-bold tabular-nums truncate mt-0.5 ${color}`}>{value}</p>
                  {usd && <p className="font-mono text-[9px] text-gray-400 truncate">{usd}</p>}
                </div>
                <div className="h-1 w-full bg-gray-100 rounded-full overflow-hidden">
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
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-3">Parámetros</p>
                <div className="space-y-3">
                  {[
                    { label: 'Impuestos sobre Ventas (IIBB %)',  value: variableTax,     set: setVariableTax,     min: 0, max: 100      },
                    { label: 'Ventas Proyectadas ($)',            value: projectedSales,  set: setProjectedSales,  min: 0, max: undefined },
                    { label: 'Rentabilidad Objetivo (% ventas)', value: targetMarginPct, set: setTargetMarginPct, min: 0, max: 99       },
                    { label: 'Inflación Proyectada (%)',         value: inflationPct,    set: setInflationPct,    min: 0, max: 1000      },
                  ].map(({ label, value, set, min, max }) => (
                    <div key={label}>
                      <label className={LABEL}>{label}</label>
                      <input type="number" value={value} min={min} max={max}
                        onChange={(e) => set(Number(e.target.value))}
                        className={`w-full px-3 py-2.5 ${INPUT_CLS}`} />
                    </div>
                  ))}
                </div>
              </div>

              {/* MEP */}
              <div className={`${CARD} p-4`}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Tipo de Cambio MEP</p>
                  <span className={`h-1.5 w-1.5 rounded-full ${mepData ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                </div>
                <div className="flex items-center justify-between py-2 border-b border-black/[0.06] mb-3">
                  <span className="text-[11px] text-gray-500">Cotización venta</span>
                  <span className="font-mono text-sm font-bold text-gray-800">
                    {mepData
                      ? `$${mepData.venta.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`
                      : <span className="text-gray-400 font-normal">—</span>}
                  </span>
                </div>
                <label className={LABEL}>Override manual (0 = auto)</label>
                <input type="number" value={manualTc} min={0}
                  onChange={(e) => setManualTc(Number(e.target.value))}
                  placeholder="0" className={`w-full px-3 py-2 ${INPUT_CLS}`} />
                {effectiveTc && (
                  <p className="text-[10px] text-gray-400 mt-2 font-mono">
                    TC activo: <span className="text-gray-700 font-semibold">
                      ${effectiveTc.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                    </span>
                    <span className="ml-1 text-[9px]">{manualTc > 0 ? '(manual)' : '(MEP)'}</span>
                  </p>
                )}
              </div>

              {/* Resultados Base */}
              <div className={`${CARD} p-4`}>
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-3">Resultados Base</p>
                {[
                  { label: 'Ventas P.E.',   value: `$${safeN(breakevenResult.breakEvenSales).toLocaleString('es-AR',{maximumFractionDigits:0})}`, color: 'text-emerald-600', tip: TIP.breakEvenSales },
                  { label: 'Unidades P.E.', value: safeN(breakevenResult.breakEvenUnits).toLocaleString('es-AR',{maximumFractionDigits:1}),        color: 'text-gray-700',    tip: TIP.breakEvenUnits },
                  { label: 'Margen C.',     value: `${safeN(breakevenResult.averageContributionMargin).toFixed(1)}%`,                               color: 'text-gray-600',    tip: TIP.margin         },
                ].map(({ label, value, color, tip }) => (
                  <div key={label} className="flex items-center justify-between gap-2 py-2 border-b border-black/[0.04] last:border-0">
                    <Tooltip content={tip}>
                      <span className="text-[11px] text-gray-500 cursor-help">{label}</span>
                    </Tooltip>
                    <span className={`font-mono text-sm font-bold ${color}`}>{value}</span>
                  </div>
                ))}
              </div>

              {/* Chart */}
              <div className={`${CARD} p-4`}>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">
                  Gráfico de Equilibrio
                </p>
                <p className="text-[9px] text-gray-300 mb-3">Ventas vs. Costos por unidades</p>
                <div className="h-[200px] w-full">
                  <BreakevenChart
                    data={breakevenResult.chartData}
                    breakEvenPoint={breakevenResult.breakEvenUnits}
                  />
                </div>
              </div>

              <InsightPanel />
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
              <InsightPanel />
            </div>
          )}

          {/* TAB 3 — Estructura */}
          {mobileTab === 'structure' && (
            <div className="pb-4 pt-1 space-y-4">

              {/* Scenario loader */}
              <div className={`${CARD} p-4`}>
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-3">Cargar Escenario</p>
                <ScenarioSelector clientId={userId} onLoad={loadScenario} />
              </div>

              {/* Products */}
              <div className={`${CARD} p-4`}>
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-3">Tabla de Productos</p>
                <ProductsTable />
              </div>

              {/* Fixed costs */}
              <div className={`${CARD} p-4`}>
                <FixedCostsEditor items={costItems} onChange={setCostItems} />
              </div>

              {/* Notes */}
              <div className={`${CARD} p-4`}>
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Notas Estratégicas</p>
                <textarea value={observations} onChange={(e) => setObservations(e.target.value)}
                  rows={4} placeholder="Conclusiones del escenario…"
                  className="w-full bg-transparent border-0 outline-none resize-none text-sm text-gray-600
                             placeholder-gray-300 leading-relaxed focus:ring-0" />
              </div>

              {/* PDF */}
              <button onClick={generatePDF} disabled={generatingPdf || products.length === 0}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white border border-black/10
                           hover:border-black/20 hover:bg-gray-50 disabled:opacity-40 rounded-2xl
                           text-[12px] font-medium text-gray-600 transition-all shadow-sm">
                <FiFileText size={13} />
                {generatingPdf ? 'Generando PDF…' : 'Exportar PDF'}
              </button>
            </div>
          )}

        </div>

        {/* Bottom Tab Bar */}
        <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-t border-black/[0.06]">
          <div className="flex">
            {([
              { key: 'sim'       as MobileTab, label: 'Simulador',  Icon: FiActivity },
              { key: 'matrix'    as MobileTab, label: 'Matriz',     Icon: FiGrid     },
              { key: 'structure' as MobileTab, label: 'Estructura', Icon: FiList     },
            ]).map(({ key, label, Icon }) => (
              <button key={key} onClick={() => setMobileTab(key)}
                className={`flex-1 flex flex-col items-center justify-center py-3 gap-1 transition-colors duration-150
                            ${mobileTab === key
                              ? 'text-emerald-600'
                              : 'text-gray-400 hover:text-gray-600'}`}>
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
      <div className="hidden md:flex flex-col h-screen bg-[#F5F7FA] overflow-hidden">

        {/* Desktop Header */}
        <header className="shrink-0 bg-white/80 backdrop-blur-xl border-b border-black/[0.06] px-6">
          <div className="h-14 flex items-center justify-between gap-4">

            <div className="flex items-center gap-3 shrink-0">
              <div className="h-7 w-7 rounded-lg bg-emerald-500 flex items-center justify-center shadow-sm shadow-emerald-500/30">
                <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5 text-white">
                  <path d="M3 17l5-5 4 4 9-9" stroke="currentColor" strokeWidth="2.5"
                    strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div>
                <p className="text-[13px] font-semibold text-gray-900 leading-none">CFO Command Center</p>
                <p className="text-[10px] text-gray-400 leading-none mt-0.5 tracking-wide">Punto de Equilibrio</p>
              </div>
            </div>

            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-[11px] font-medium ${hStyle.badge}`}>
              <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${hStyle.dot}`} />
              <span>{health.label}</span>
            </div>

            <div className="flex items-center gap-2">
              <div className="w-52">
                <ScenarioSelector clientId={userId} onLoad={loadScenario} />
              </div>
              <button onClick={generatePDF} disabled={generatingPdf || products.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-black/10
                           hover:border-black/20 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed
                           rounded-xl text-[12px] font-medium text-gray-600 transition-all shadow-sm">
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
                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
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
                    <span className="text-[9px] font-semibold text-gray-400 uppercase tracking-widest flex items-center gap-1">
                      {warn && <FiAlertTriangle size={8} className="text-red-500" />}
                      {label}
                    </span>
                  </Tooltip>
                  <p className={`font-mono text-lg font-bold tabular-nums leading-tight mt-0.5 truncate ${color}`}>
                    {value}
                  </p>
                  {usd && (
                    <p className="font-mono text-[9px] text-gray-400 tabular-nums mt-0.5 truncate">{usd}</p>
                  )}
                </div>
                <div className="h-1 w-full bg-gray-100 rounded-full overflow-hidden">
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
                    <span className={`h-1.5 w-1.5 rounded-full ${mepData ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                    <span className="text-[10px] text-gray-400">MEP</span>
                    <span className="font-mono text-xs font-bold text-gray-700">
                      {mepData
                        ? `$${mepData.venta.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
                        : '—'}
                    </span>
                    {effectiveTc && (
                      <span className="text-[9px] text-gray-400">
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
                      <input type="number" value={variableTax} min={0} max={100}
                        onChange={(e) => setVariableTax(Number(e.target.value))}
                        className="w-14 text-right text-xs font-mono font-bold text-gray-800
                                   bg-transparent border-0 outline-none focus:ring-0 p-0" />
                    </div>
                    <input type="range" min={0} max={50} step={0.5} value={variableTax}
                      onChange={(e) => setVariableTax(Number(e.target.value))}
                      className="w-full h-1.5 accent-emerald-500 cursor-pointer rounded-full" />
                  </div>

                  {/* Ventas Proyectadas — number only */}
                  <div>
                    <label className={`${SLABEL} block mb-1.5`}>Ventas Proyectadas ($)</label>
                    <input type="number" value={projectedSales} min={0}
                      onChange={(e) => setProjectedSales(Number(e.target.value))}
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
                      <input type="number" value={targetMarginPct} min={0} max={99}
                        onChange={(e) => setTargetMarginPct(Number(e.target.value))}
                        className="w-14 text-right text-xs font-mono font-bold text-gray-800
                                   bg-transparent border-0 outline-none focus:ring-0 p-0" />
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
                      <input type="number" value={inflationPct} min={0} max={1000}
                        onChange={(e) => setInflationPct(Number(e.target.value))}
                        className="w-14 text-right text-xs font-mono font-bold text-orange-600
                                   bg-transparent border-0 outline-none focus:ring-0 p-0" />
                    </div>
                    <input type="range" min={0} max={300} step={1} value={inflationPct}
                      onChange={(e) => setInflationPct(Number(e.target.value))}
                      className="w-full h-1.5 accent-orange-500 cursor-pointer rounded-full" />
                  </div>

                </div>

                {/* Results strip */}
                <div className="mt-4 pt-4 border-t border-black/[0.04] flex items-center gap-6 flex-wrap">
                  {[
                    { label: 'Ventas P.E.',   value: `$${safeN(breakevenResult.breakEvenSales).toLocaleString('es-AR',{maximumFractionDigits:0})}`, color: 'text-emerald-600', tip: TIP.breakEvenSales },
                    { label: 'Unidades P.E.', value: safeN(breakevenResult.breakEvenUnits).toLocaleString('es-AR',{maximumFractionDigits:1}),        color: 'text-gray-700',    tip: TIP.breakEvenUnits },
                    { label: 'Margen C.',     value: `${safeN(breakevenResult.averageContributionMargin).toFixed(1)}%`,                               color: 'text-gray-600',    tip: TIP.margin         },
                  ].map(({ label, value, color, tip }) => (
                    <div key={label} className="flex flex-col">
                      <Tooltip content={tip}>
                        <span className="text-[9px] text-gray-400 uppercase tracking-wider cursor-help">{label}</span>
                      </Tooltip>
                      <span className={`font-mono text-sm font-bold ${color}`}>{value}</span>
                    </div>
                  ))}
                  {effectiveTc && (
                    <div className="ml-auto flex flex-col">
                      <span className="text-[9px] text-gray-400 uppercase tracking-wider">TC Activo</span>
                      <span className="font-mono text-sm font-bold text-gray-700">
                        ${effectiveTc.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                        <span className="ml-1 text-[9px] text-gray-400 font-normal">
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
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
                      Equilibrio Base
                    </p>
                    <p className="text-[9px] text-gray-300">Ventas vs. Costos</p>
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
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
                      Escenario Inflacionario
                      {inflationPct > 0 && (
                        <span className="ml-1.5 text-orange-500">+{inflationPct}%</span>
                      )}
                    </p>
                    <p className="text-[9px] text-gray-300">
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
                        <p className="text-xs text-gray-200 text-center leading-relaxed">
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
                <ProductsTable compact />
              </div>

              {/* Fixed Costs */}
              <div className={`${CARD} p-4 shrink-0`}>
                <FixedCostsEditor items={costItems} onChange={setCostItems} />
              </div>

              {/* Insight + Notes */}
              <div className="shrink-0">
                <InsightPanel compact />
              </div>

              <div className={`${CARD} p-4 shrink-0`}>
                <p className={`${SLABEL} mb-2`}>Notas Estratégicas</p>
                <textarea value={observations} onChange={(e) => setObservations(e.target.value)}
                  rows={3} placeholder="Conclusiones del escenario, recomendaciones, riesgos…"
                  className="w-full bg-transparent border-0 outline-none resize-none text-sm text-gray-600
                             placeholder-gray-300 leading-relaxed focus:ring-0" />
              </div>

            </div>
          </div>
        </div>
      </div>
    </>
  );
}
