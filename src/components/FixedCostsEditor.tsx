'use client';

import { useRef } from 'react';
import { FiTrash2, FiPlus, FiUpload } from 'react-icons/fi';
import type { CostItem } from '../lib/types';
import SafeNumberInput from './SafeNumberInput';

interface Props {
  items: CostItem[];
  onChange: (items: CostItem[]) => void;
}

const parseAmount = (raw: string): number => {
  let s = raw.replace(/[$\s]/g, '');
  if (/\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    s = s.replace(/,/g, '');
  }
  return parseFloat(s);
};

const nextId = (items: CostItem[]) =>
  items.length > 0 ? Math.max(...items.map(i => i.id)) + 1 : 1;

const INPUT =
  'w-full bg-slate-800 border border-slate-700 rounded-xl text-slate-100 text-sm ' +
  'focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 ' +
  'transition-all duration-150 placeholder-slate-500 hover:border-slate-600';

export default function FixedCostsEditor({ items, onChange }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const total = items.reduce((sum, i) => sum + i.amount, 0);

  const addItem = () =>
    onChange([...items, { id: nextId(items), name: '', amount: 0 }]);

  const updateName = (id: number, name: string) =>
    onChange(items.map(item => item.id === id ? { ...item, name } : item));

  const updateAmount = (id: number, amount: number) =>
    onChange(items.map(item => item.id === id ? { ...item, amount } : item));

  const remove = (id: number) => onChange(items.filter(i => i.id !== id));

  const handleCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length === 0) return;
      const sep = lines[0].includes(';') ? ';' : ',';
      const firstCols = lines[0].split(sep);
      const startIdx = isNaN(parseAmount(firstCols[1] ?? '')) ? 1 : 0;
      let id = nextId(items);
      const parsed: CostItem[] = [];
      for (let i = startIdx; i < lines.length; i++) {
        const cols = lines[i].split(sep).map(c => c.trim().replace(/^"|"$/g, ''));
        if (cols.length < 2) continue;
        const name = cols[0];
        const amount = parseAmount(cols[1]);
        if (name && isFinite(amount)) parsed.push({ id: id++, name, amount });
      }
      if (parsed.length > 0) onChange([...items, ...parsed]);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
          Detalle de costos
        </span>
        <button
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium text-slate-400
                     hover:text-blue-400 border border-slate-700 hover:border-blue-700
                     hover:bg-blue-900/20 rounded-lg transition-all"
        >
          <FiUpload size={11} /> Importar CSV
        </button>
        <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleCSV} className="hidden" />
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-12 items-center gap-2 pb-2 mb-1 border-b border-slate-800">
        <div className="col-span-6 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
          Concepto
        </div>
        <div className="col-span-5 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
          Monto ($)
        </div>
        <div className="col-span-1" />
      </div>

      {/* Rows */}
      <div className="space-y-2 max-h-56 overflow-y-auto pr-0.5">
        {items.length === 0 && (
          <p className="text-[12px] text-slate-500 text-center py-6">
            Sin ítems — agregá conceptos o importá un CSV.
          </p>
        )}
        {items.map(item => (
          <div key={item.id} className="grid grid-cols-12 items-center gap-2">
            <input
              type="text"
              value={item.name}
              placeholder="Concepto"
              onChange={(e) => updateName(item.id, e.target.value)}
              className={`col-span-6 px-3 py-2 ${INPUT}`}
            />
            <SafeNumberInput
              value={item.amount}
              min={0}
              onChange={(v) => updateAmount(item.id, v)}
              className={`col-span-5 px-3 py-2 font-mono text-right tabular-nums ${INPUT}`}
            />
            <button
              onClick={() => remove(item.id)}
              aria-label="Eliminar"
              className="col-span-1 flex items-center justify-center p-1.5 text-slate-600
                         hover:text-rose-400 hover:bg-rose-900/20 rounded-lg transition-all"
            >
              <FiTrash2 size={13} />
            </button>
          </div>
        ))}
      </div>

      {/* Add row */}
      <button
        onClick={addItem}
        className="mt-3 flex items-center justify-center gap-1.5 w-full py-2.5 text-[11px] font-medium
                   border border-dashed border-slate-700 hover:border-emerald-600 hover:bg-emerald-900/10
                   text-slate-500 hover:text-emerald-400 rounded-xl transition-all duration-150"
      >
        <FiPlus size={12} /> Agregar concepto
      </button>

      {/* Total row */}
      <div className="mt-4 pt-4 border-t border-slate-800">
        <div className="grid grid-cols-12 items-center gap-2">
          <span className="col-span-6 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Total Costos Fijos
          </span>
          <span className="col-span-5 font-mono font-bold text-slate-100 text-sm tabular-nums text-right">
            ${total.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
          </span>
          <div className="col-span-1" />
        </div>
      </div>
    </div>
  );
}
