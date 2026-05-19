'use client';

import { FiMic, FiMicOff } from 'react-icons/fi';
import { useVoiceCommander, type VoiceHandlers } from '../hooks/useVoiceCommander';

interface Props {
  handlers: VoiceHandlers;
}

export default function VoiceCommander({ handlers }: Props) {
  const { listening, supported, lastCommand, toggle } = useVoiceCommander(handlers);

  // Browser doesn't support Web Speech API (Firefox, some mobile)
  if (!supported) return null;

  return (
    <div className="relative flex flex-col items-center">

      {/* Mic button */}
      <button
        onClick={toggle}
        title={listening ? 'Detener escucha' : 'Comando de voz'}
        aria-label={listening ? 'Detener reconocimiento de voz' : 'Iniciar reconocimiento de voz'}
        className={`relative flex items-center justify-center h-8 w-8 rounded-xl border
                    transition-all duration-200
                    ${listening
                      ? 'bg-rose-500/20 border-rose-500 text-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.3)]'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                    }`}
      >
        {/* Pulsing ring — visible only while listening */}
        {listening && (
          <span className="absolute inset-0 rounded-xl animate-ping bg-rose-400/20 pointer-events-none" />
        )}
        {listening ? <FiMicOff size={13} /> : <FiMic size={13} />}
      </button>

      {/* Last command badge — floats below, auto-dismisses after 4 s */}
      {lastCommand && (
        <div
          className="absolute top-full mt-2 left-1/2 -translate-x-1/2 z-50
                     whitespace-nowrap px-2.5 py-1 rounded-lg
                     bg-slate-800 border border-slate-700 shadow-xl
                     text-[10px] font-mono text-emerald-400 font-semibold
                     animate-in fade-in slide-in-from-top-1 duration-150"
        >
          ✓ {lastCommand}
        </div>
      )}

      {/* Listening label */}
      {listening && (
        <span className="absolute top-full mt-2 left-1/2 -translate-x-1/2
                         text-[9px] text-rose-400 font-medium whitespace-nowrap">
          Escuchando…
        </span>
      )}
    </div>
  );
}
