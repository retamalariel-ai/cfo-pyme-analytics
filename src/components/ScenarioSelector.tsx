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
        className="flex-1 bg-white border border-black/10 rounded-xl px-3 py-2 text-sm
                   text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20
                   focus:border-blue-500 transition-all disabled:opacity-50 disabled:bg-gray-50
                   hover:border-black/20"
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
        className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100
                   rounded-xl border border-black/10 transition-all disabled:opacity-50"
      >
        <FiRefreshCw size={14} className={loading ? 'animate-spin' : ''} />
      </button>
    </div>
  );
}
