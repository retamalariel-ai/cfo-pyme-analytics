'use client';

import { FiInfo } from 'react-icons/fi';

interface Props {
  content: string;
  children: React.ReactNode;
}

export default function Tooltip({ content, children }: Props) {
  return (
    <span className="group relative inline-flex items-center gap-1.5">
      {children}
      <span className="cursor-help text-slate-600 transition group-hover:text-slate-400">
        <FiInfo size={12} />
      </span>
      <span
        className="pointer-events-none absolute bottom-full left-0 z-50 mb-2 w-60
                   rounded-lg border border-slate-700 bg-slate-900 p-2.5
                   text-xs leading-relaxed text-slate-300 opacity-0 shadow-2xl
                   transition-opacity duration-150 group-hover:opacity-100"
      >
        {content}
      </span>
    </span>
  );
}
