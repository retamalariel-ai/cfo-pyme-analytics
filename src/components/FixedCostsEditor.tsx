'use client';

import { useRef } from 'react';
import { FiTrash2, FiPlus, FiUpload } from 'react-icons/fi';
import type { CostItem } from '../lib/types';

interface Props {
  items: CostItem[];
  onChange: (items: CostItem[]) => void;
}

const parseAmount = (raw: string): number => {
  // Remove currency symbols and spaces
  let s = raw.replace(/[$\s]/g, '');
  // Argentine format: 1.500,50 → 1500.50
  if (/\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    // Fallback: treat comma as thousands separator
    s = s.replace(/,/g, '');
  }
  return parseFloat(s);
};

const nextId = (items: CostItem[]) =>
  items.length > 0 ? Math.max(...items.map(i => i.id)) + 1 : 1;

export default function FixedCostsEditor({ items, onChange }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const total = items.reduce((sum, i) => sum + i.amount, 0);

  const addItem = () =>
    onChange([...items, { id: nextId(items), name: '', amount: 0 }]);

  const update = (id: number, field: 'name' | 'amount', value: string) => {
    onChange(
      items.map(item =>
        item.id === id
          ? { ...item, [field]: field === 'amount' ? Number(value) : value }
          : item
      )
    );
  };

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
      // Skip header if second column of first row isn't numeric
      const firstCols = lines[0].split(sep);
      const startIdx = isNaN(parseAmount(firstCols[1] ?? '')) ? 1 : 0;

      let id = nextId(items);
      const parsed: CostItem[] = [];

      for (let i = startIdx; i < lines.length; i++) {
        const cols = lines[i].split(sep).map(c => c.trim().replace(/^"|"$/g, ''));
        if (cols.length < 2) continue;
        const name = cols[0];
        const amount = parseAmount(cols[1]);
        if (name && isFinite(amount)) {
          parsed.push({ id: id++, name, amount });
        }
      }

      if (parsed.length > 0) onChange([...items, ...parsed]);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const INPUT =
    'bg-white border border-slate-300 rounded-md text-slate-900 text-sm ' +
    'focus:outline-none focus:ring-1 focus:ring-emerald-500/60 focus:border-emerald-500 transition ' +
    'placeholder-slate-400';

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Detalle de costos fijos</span>
        <button
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-slate-500
                     hover:text-emerald-700 border border-slate-300 hover:border-emerald-400
                     rounded-md transition"
        >
          <FiUpload size={11} /> Importar CSV
        </button>
        <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleCSV} className="hidden" />
      </div>

      <div className="space-y-1.5 max-h-52 overflow-y-auto pr-0.5">
        {items.length === 0 && (
          <p className="text-xs text-slate-400 text-center py-4">
            Sin ítems — agregá conceptos o importá un CSV.
          </p>
        )}
        {items.map(item => (
          <div key={item.id} className="flex gap-1.5 items-center">
            <input
              type="text"
              value={item.name}
              placeholder="Concepto"
              onChange={(e) => update(item.id, 'name', e.target.value)}
              className={`flex-1 px-2 py-1.5 ${INPUT}`}
            />
            <input
              type="number"
              value={item.amount}
              min={0}
              onChange={(e) => update(item.id, 'amount', e.target.value)}
              className={`w-24 px-2 py-1.5 font-mono ${INPUT}`}
            />
            <button
              onClick={() => remove(item.id)}
              aria-label="Eliminar"
              className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition"
            >
              <FiTrash2 size={13} />
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={addItem}
        className="mt-2 flex items-center justify-center gap-1.5 w-full py-2 text-xs
                   border border-dashed border-slate-300 hover:border-emerald-400
                   text-slate-500 hover:text-emerald-700 rounded-lg transition"
      >
        <FiPlus size={12} /> Agregar concepto
      </button>

      <div className="mt-3 pt-3 border-t border-slate-200 flex justify-between items-center">
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Costos Fijos</span>
        <span className="font-mono font-bold text-slate-900">
          ${total.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
        </span>
      </div>
    </div>
  );
}
