'use client';

import { useState, useEffect, useRef } from 'react';

interface Props {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  className?: string;
  placeholder?: string;
}

/**
 * Number input that keeps local string state while the user is typing.
 * Uses a ref (not state) for focus tracking so focus/blur events never
 * trigger re-renders — only the final commit on blur propagates upward.
 */
export default function SafeNumberInput({
  value, onChange, min, max, className, placeholder,
}: Props) {
  const [raw, setRaw] = useState(() => (value === 0 ? '' : String(value)));
  const editing = useRef(false);

  // Only sync display from parent when the user is not actively editing.
  useEffect(() => {
    if (!editing.current) {
      setRaw(value === 0 ? '' : String(value));
    }
  }, [value]);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={raw}
      placeholder={placeholder ?? '0'}
      onChange={(e) => setRaw(e.target.value)}
      onFocus={() => {
        editing.current = true;
        if (raw === '0') setRaw('');
      }}
      onBlur={() => {
        editing.current = false;
        const n = parseFloat(raw.replace(/[^\d.-]/g, ''));
        if (!isNaN(n) && isFinite(n)) {
          let result = n;
          if (min !== undefined) result = Math.max(min, result);
          if (max !== undefined) result = Math.min(max, result);
          onChange(result);
          setRaw(result === 0 ? '' : String(result));
        } else {
          setRaw(value === 0 ? '' : String(value));
        }
      }}
      className={className}
    />
  );
}
