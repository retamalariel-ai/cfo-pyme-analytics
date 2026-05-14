'use client';

import { useState, useEffect, useCallback } from 'react';
import { FiRefreshCw } from 'react-icons/fi';
import { getScenarios, ScenarioRecord } from '../lib/database';

interface Props {
  clientId: string;
  onLoad: (scenario: ScenarioRecord) => void;
}

export default function ScenarioSelector({ clientId, onLoad }: Props) {
  const [scenarios, setScenarios] = useState<ScenarioRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState('');

  const fetchScenarios = useCallback(async () => {
    setLoading(true);
    const { data } = await getScenarios(clientId);
    setScenarios(data);
    setLoading(false);
  }, [clientId]);

  useEffect(() => { fetchScenarios(); }, [fetchScenarios]);

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
        className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm
                   text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500
                   focus:border-transparent transition disabled:opacity-50"
      >
        <option value="">
          {loading ? 'Cargando escenarios…' : scenarios.length === 0 ? 'Sin escenarios guardados' : 'Cargar escenario…'}
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
        className="p-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800
                   rounded-lg border border-slate-700 transition disabled:opacity-50"
      >
        <FiRefreshCw size={15} className={loading ? 'animate-spin' : ''} />
      </button>
    </div>
  );
}
