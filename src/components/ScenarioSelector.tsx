'use client';

import { useState, useEffect, useCallback } from 'react';
import { FiRefreshCw } from 'react-icons/fi';
import { getScenarios, ScenarioRecord } from '../lib/database';

interface Props {
  clientId: string;
  onLoad: (scenario: ScenarioRecord) => void;
  refreshKey?: number;
}

export default function ScenarioSelector({ clientId, onLoad, refreshKey = 0 }: Props) {
  const [scenarios, setScenarios] = useState<ScenarioRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState('');

  const fetchScenarios = useCallback(async () => {
    setLoading(true);
    const { data } = await getScenarios(clientId);
    setScenarios(data);
    setLoading(false);
  }, [clientId]);

  // Re-fetch when parent increments refreshKey after a successful save
  useEffect(() => { fetchScenarios(); }, [fetchScenarios, refreshKey]);

  const handleChange = (id: string) => {
    setSelectedId(id);
    const found = scenarios.find(s => s.id === id);
    if (found) onLoad(found);
  };

  return (
    <div className="flex items-center gap-2">
      <select
        value={selectedId}
        onChange={(e) => handleChange(e.target.value)}
        disabled={loading}
        className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm
                   text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20
                   focus:border-emerald-500 transition-all disabled:opacity-50
                   hover:border-slate-600"
      >
        <option value="">
          {loading ? 'Cargando…' : scenarios.length === 0 ? 'Sin escenarios guardados' : 'Cargar escenario…'}
        </option>
        {scenarios.map(s => (
          <option key={s.id} value={s.id}>
            {s.name} — {new Date(s.created_at).toLocaleDateString('es-AR', {
              day: '2-digit', month: 'short', year: 'numeric',
            })}
          </option>
        ))}
      </select>
      <button
        onClick={fetchScenarios}
        disabled={loading}
        aria-label="Actualizar lista"
        className="p-2 text-slate-500 hover:text-slate-200 hover:bg-slate-700
                   rounded-xl border border-slate-700 transition-all disabled:opacity-50"
      >
        <FiRefreshCw size={14} className={loading ? 'animate-spin' : ''} />
      </button>
    </div>
  );
}
