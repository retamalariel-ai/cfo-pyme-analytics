'use client';

import { useRef } from 'react';
import { FiTrash2, FiPlus, FiUpload } from 'react-icons/fi';
import type { CostItem } from '../lib/types';
import NumericInput from './NumericInput';

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
  'bg-white border border-black/10 rounded-xl text-gray-900 text-sm ' +
  'focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 ' +
  'transition-all duration-150 placeholder-gray-400 hover:border-black/20';

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
      <div className="flex items-center justify-between mb-4">
        <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
          Detalle de costos
        </span>
        <button
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium text-gray-500
                     hover:text-blue-600 border border-black/10 hover:border-blue-300
                     hover:bg-blue-50 rounded-lg transition-all"
        >
          <FiUpload size={11} /> Importar CSV
        </button>
        <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleCSV} className="hidden" />
      </div>

      <div className="space-y-2 max-h-56 overflow-y-auto pr-0.5">
        {items.length === 0 && (
          <p className="text-[12px] text-gray-400 text-center py-6">
            Sin ítems — agregá conceptos o importá un CSV.
          </p>
        )}
        {items.map(item => (
          <div key={item.id} className="flex gap-2 items-center">
            <input
              type="text"
              value={item.name}
              placeholder="Concepto"
              onChange={(e) => updateName(item.id, e.target.value)}
              className={`flex-1 px-3 py-2 ${INPUT}`}
            />
            <NumericInput
              value={item.amount}
              min={0}
              onChange={(v) => updateAmount(item.id, v)}
              className={`w-28 px-3 py-2 font-mono text-right tabular-nums ${INPUT}`}
            />
            <button
              onClick={() => remove(item.id)}
              aria-label="Eliminar"
              className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
            >
              <FiTrash2 size={13} />
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={addItem}
        className="mt-3 flex items-center justify-center gap-1.5 w-full py-2.5 text-[11px] font-medium
                   border border-dashed border-gray-200 hover:border-emerald-400 hover:bg-emerald-50
                   text-gray-400 hover:text-emerald-600 rounded-xl transition-all duration-150"
      >
        <FiPlus size={12} /> Agregar concepto
      </button>

      <div className="mt-4 pt-4 border-t border-black/[0.06] flex justify-between items-center">
        <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
          Total Costos Fijos
        </span>
        <span className="font-mono font-bold text-gray-900 text-sm tabular-nums">
          ${total.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
        </span>
      </div>
    </div>
  );
}
