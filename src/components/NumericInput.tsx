'use client';

import { useState, useEffect } from 'react';

interface Props {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  className?: string;
  placeholder?: string;
}

export default function NumericInput({ value, onChange, min, max, className, placeholder }: Props) {
  const [raw, setRaw] = useState(() => value === 0 ? '' : String(value));
  const [focused, setFocused] = useState(false);

  // Sync display from parent only when field is not being edited
  useEffect(() => {
    if (!focused) setRaw(value === 0 ? '' : String(value));
  }, [value, focused]);

  const commit = () => {
    setFocused(false);
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
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={raw}
      placeholder={placeholder ?? '0'}
      onChange={(e) => setRaw(e.target.value)}
      onFocus={() => { setFocused(true); if (raw === '0') setRaw(''); }}
      onBlur={commit}
      className={className}
    />
  );
}
