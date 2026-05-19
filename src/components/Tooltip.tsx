'use client';

import { FiInfo } from 'react-icons/fi';

interface Props {
  content: string;
  children: React.ReactNode;
}

export default function Tooltip({ content, children }: Props) {
  return (
    <span className="group relative inline-flex items-center gap-1">
      {children}
      <span className="text-slate-600 cursor-help transition-colors duration-150 group-hover:text-slate-400">
        <FiInfo size={11} />
      </span>
      <span
        className="pointer-events-none absolute bottom-full left-0 z-50 mb-3
                   w-56 rounded-xl bg-slate-800 border border-slate-700 px-3 py-2.5 text-[11px]
                   leading-relaxed text-slate-300 opacity-0 shadow-xl
                   transition-all duration-150 group-hover:opacity-100"
      >
        {content}
        <span className="absolute top-full left-4 border-4 border-transparent border-t-slate-800" />
      </span>
    </span>
  );
}
