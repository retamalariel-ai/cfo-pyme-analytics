import { useCallback, useEffect, useRef, useState } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Public interface — wire these to your state setters in page.tsx
// ─────────────────────────────────────────────────────────────────────────────
export interface VoiceHandlers {
  /** setInflationPct(n)                                        "inflación 12 por ciento"          */
  onInflation?:     (pct: number)                  => void;
  /** setCostItems([{ id:1, name:'...', amount: n }])            "costos fijos 2 millones"          */
  onFixedCosts?:    (amount: number)               => void;
  /** setProducts(prev => prev.map(...mixPercentage))            "mix 40 35 25"                     */
  onMix?:           (values: number[])             => void;
  /** setVariableTax(n)                                         "IIBB 3 por ciento"                */
  onTax?:           (pct: number)                  => void;
  /** setProjectedSales(n)                                      "ventas proyectadas 500000"        */
  onSales?:         (amount: number)               => void;
  /** setTargetMarginPct(n)                                     "ROS objetivo 15" / "rentabilidad objetivo 20" */
  onTargetMargin?:  (pct: number)                  => void;
  /** setProducts price by product letter                        "precio producto A 15000"          */
  onProductPrice?:  (letter: string, price: number) => void;
  /** setProducts variableCost by product letter                 "costo variable producto A 5000"   */
  onProductCost?:   (letter: string, cost: number)  => void;
}

export interface VoiceState {
  listening:   boolean;
  supported:   boolean;
  transcript:  string;
  lastCommand: string | null;
  toggle:      () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Spanish number word → digit substitution table
// Web Speech API sometimes returns "doce" instead of "12" — this normalizes both
// ─────────────────────────────────────────────────────────────────────────────
const WORD_MAP: [RegExp, string][] = [
  [/\bun(?:o|a)?\b/g,        '1'],
  [/\bdos\b/g,               '2'],
  [/\btres\b/g,              '3'],
  [/\bcuatro\b/g,            '4'],
  [/\bcinco\b/g,             '5'],
  [/\bseis\b/g,              '6'],
  [/\bsiete\b/g,             '7'],
  [/\bocho\b/g,              '8'],
  [/\bnueve\b/g,             '9'],
  [/\bdiez\b/g,              '10'],
  [/\bonce\b/g,              '11'],
  [/\bdoce\b/g,              '12'],
  [/\btrece\b/g,             '13'],
  [/\bcatorce\b/g,           '14'],
  [/\bquince\b/g,            '15'],
  [/\bdiecis[eé]is\b/g,      '16'],
  [/\bdiecisiete\b/g,        '17'],
  [/\bdieciocho\b/g,         '18'],
  [/\bdiecinueve\b/g,        '19'],
  [/\bveinte\b/g,            '20'],
  [/\btreinta\b/g,           '30'],
  [/\bcuarenta\b/g,          '40'],
  [/\bcincuenta\b/g,         '50'],
  [/\bsesenta\b/g,           '60'],
  [/\bsetenta\b/g,           '70'],
  [/\bochenta\b/g,           '80'],
  [/\bnoventa\b/g,           '90'],
  [/\bcien(?:to)?\b/g,       '100'],
  [/\bdoscientos\b/g,        '200'],
  [/\btrescientos\b/g,       '300'],
  [/\bcuatrocientos\b/g,     '400'],
  [/\bquinientos\b/g,        '500'],
  [/\bseiscientos\b/g,       '600'],
  [/\bsetecientos\b/g,       '700'],
  [/\bochocientos\b/g,       '800'],
  [/\bnovecientos\b/g,       '900'],
];

/** Lowercase + strip diacritics + normalize spaces */
const normalize = (s: string) =>
  s.toLowerCase()
   .normalize('NFD').replace(/[̀-ͯ]/g, '')
   .replace(/[¿?¡!,;:]/g, ' ')
   .replace(/\s+/g, ' ')
   .trim();

/**
 * Converts a raw transcript to a digit-only string so regex extraction is uniform.
 * Pipeline:  normalize → word substitution → "N millones/mil" expansion
 */
const preprocess = (raw: string): string => {
  let t = normalize(raw);
  for (const [rx, rep] of WORD_MAP) t = t.replace(rx, rep);
  // FIX: Speech API returns large numbers with spaces between digit groups:
  // "2 000 000" → "2000000",  "500 000" → "500000"
  // Pattern: 1-3 digits followed by one or more groups of exactly 3 digits
  t = t.replace(/\b\d{1,3}(?:\s+\d{3})+\b/g, m => m.replace(/\s+/g, ''));
  // "2 millones" → "2000000",  "1.5 millones" → "1500000"
  t = t.replace(/(\d+(?:[.,]\d+)?)\s*millones?\b/g, (_, n) =>
    String(Math.round(parseFloat(n.replace(',', '.')) * 1_000_000))
  );
  // "500 mil" → "500000"
  t = t.replace(/(\d+(?:[.,]\d+)?)\s*mil\b/g, (_, n) =>
    String(Math.round(parseFloat(n.replace(',', '.')) * 1_000))
  );
  return t;
};

/** Returns all finite numbers found in preprocessed text, in order */
const extractNumbers = (preprocessed: string): number[] =>
  (preprocessed.match(/\d+(?:[.,]\d+)?/g) ?? [])
    .map(n => parseFloat(n.replace(',', '.')))
    .filter(isFinite);

// ── Product identifier resolution ─────────────────────────────────────────────
// Returns the product letter ("A") or ordinal index as string ("0", "1", "2")
// so page.tsx can match either way without knowing which strategy was used.

const ORDINALS: [RegExp, number][] = [
  [/\b(?:primer[ao]?|primero)\b/, 0],
  [/\bsegund[ao]\b/,              1],
  [/\btercer[ao]?\b/,             2],
  [/\bcuart[ao]\b/,               3],
  [/\bquint[ao]\b/,               4],
];

/**
 * Tries to find a product identifier in preprocessed text.
 * Priority: explicit letter (A/B/C) → ordinal word (primero/segundo…)
 * Returns the letter ("A") or "0"/"1"/"2" for ordinal-based match.
 */
const resolveProductId = (t: string): string | null => {
  // Letter patterns — order matters: prefer "producto X" over bare "precio X"
  // Also handles reversed order: "producto A precio 15000"
  const letterMatch =
    t.match(/producto\s+([a-z])\b/) ??   // "producto A ..."
    t.match(/([a-z])\s+precio\b/)   ??   // "A precio 15000"
    t.match(/([a-z])\s+costo\b/)    ??   // "A costo 5000"
    t.match(/precio\s+([a-z])\b/)   ??   // "precio A 15000"
    t.match(/variable\s+([a-z])\b/);     // "variable A 5000"

  if (letterMatch) return letterMatch[1].toUpperCase();

  // Ordinal fallback: "primer producto", "segundo", etc.
  for (const [rx, idx] of ORDINALS) {
    if (rx.test(t)) return String(idx);
  }
  return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Command parser & dispatcher
// ─────────────────────────────────────────────────────────────────────────────
type CommandType = 'inflation' | 'fixedCosts' | 'mix' | 'tax' | 'sales' | 'targetMargin' | 'productPrice' | 'productCost' | 'unknown';

const dispatchCommand = (raw: string, handlers: VoiceHandlers): [CommandType, string] => {
  const t    = preprocess(raw);
  const nums = extractNumbers(t);

  // Developer-friendly log so you can see exactly what was captured
  console.log('[VoiceCommander] 🎙️  raw       :', JSON.stringify(raw));
  console.log('[VoiceCommander] 🔄  processed :', JSON.stringify(t));
  console.log('[VoiceCommander] 📊  numbers   :', nums);

  // ── Inflación ──────────────────────────────────────────────────────────────
  // "inflación al 12 por ciento" | "subir inflación 8" | "inflacion doce"
  if (/inflaci[ao]n/.test(t)) {
    if (nums.length > 0) {
      handlers.onInflation?.(nums[0]);
      console.log(`[VoiceCommander] ✅ INFLACIÓN → ${nums[0]}%`);
      return ['inflation', `Inflación → ${nums[0]}%`];
    }
  }

  // ── Costos fijos ───────────────────────────────────────────────────────────
  // "costos fijos 2 millones" | "fijar costo fijo en 500000" | "costo fijo 1.5 millones"
  if (/costos?\s*fijos?|costo\s*fijo|fijar\s*costos?/.test(t)) {
    if (nums.length > 0) {
      handlers.onFixedCosts?.(nums[0]);
      console.log(`[VoiceCommander] ✅ COSTOS FIJOS → $${Math.round(nums[0]).toLocaleString('es-AR')}`);
      return ['fixedCosts', `Costos fijos → $${Math.round(nums[0]).toLocaleString('es-AR')}`];
    }
  }

  // ── Mix de productos ───────────────────────────────────────────────────────
  // "mix 40 35 25" | "cambiar mix a 50 30 20" | "mix cuarenta treinta treinta"
  if (/\bmix\b/.test(t)) {
    if (nums.length >= 2) {
      handlers.onMix?.(nums);
      console.log(`[VoiceCommander] ✅ MIX → [${nums.join(', ')}]%`);
      return ['mix', `Mix → ${nums.join(' / ')}%`];
    }
    // FIX: API sometimes concatenates values without spaces: "304030" instead of "30 40 30"
    // Split even-length 4-6 digit numbers into 2-digit chunks (typical mix percentages)
    if (nums.length === 1) {
      const s = String(Math.round(nums[0]));
      if (s.length >= 4 && s.length % 2 === 0) {
        const chunks = Array.from({ length: s.length / 2 }, (_, i) =>
          parseInt(s.slice(i * 2, i * 2 + 2), 10)
        );
        if (chunks.every(v => v >= 0 && v <= 100)) {
          handlers.onMix?.(chunks);
          console.log(`[VoiceCommander] ✅ MIX (split) → [${chunks.join(', ')}]%`);
          return ['mix', `Mix → ${chunks.join(' / ')}%`];
        }
      }
    }
  }

  // ── IIBB / Ingresos Brutos ─────────────────────────────────────────────────
  // "IIBB 3 por ciento" | "ingresos brutos 2.5" | "impuesto 4"
  if (/iibb|ingresos\s*brutos|impuesto/.test(t)) {
    if (nums.length > 0) {
      handlers.onTax?.(nums[0]);
      console.log(`[VoiceCommander] ✅ IIBB → ${nums[0]}%`);
      return ['tax', `IIBB → ${nums[0]}%`];
    }
  }

  // ── Ventas proyectadas ─────────────────────────────────────────────────────
  // "ventas proyectadas 500000" | "ventas del mes 1 millon" | "facturación 800000"
  if (/ventas?\s*(?:proyectadas?|del\s*mes)?|facturaci[ao]n/.test(t)) {
    if (nums.length > 0) {
      handlers.onSales?.(nums[0]);
      console.log(`[VoiceCommander] ✅ VENTAS → $${Math.round(nums[0]).toLocaleString('es-AR')}`);
      return ['sales', `Ventas → $${Math.round(nums[0]).toLocaleString('es-AR')}`];
    }
  }

  // ── Rentabilidad objetivo / ROS ────────────────────────────────────────────
  // "ROS objetivo 15" | "rentabilidad objetivo 20 por ciento" | "objetivo de rentabilidad 10"
  if (/ros|rentabilidad|margen\s*(?:de\s*)?objetivo|objetivo\s*(?:de\s*)?(?:rentabilidad|margen)/.test(t)) {
    if (nums.length > 0) {
      handlers.onTargetMargin?.(nums[0]);
      console.log(`[VoiceCommander] ✅ ROS OBJETIVO → ${nums[0]}%`);
      return ['targetMargin', `ROS objetivo → ${nums[0]}%`];
    }
  }

  // ── Precio de producto ─────────────────────────────────────────────────────
  // "precio producto A 15000"  | "Producto A precio 15000" | "A precio 15000"
  // "actualizar precio A a 15000" | "primer producto precio 15000"
  if (/precio/.test(t)) {
    const id = resolveProductId(t);
    if (id !== null && nums.length > 0) {
      handlers.onProductPrice?.(id, nums[0]);
      const label = isNaN(Number(id)) ? `Precio ${id}` : `Precio prod.${Number(id) + 1}`;
      console.log(`[VoiceCommander] ✅ ${label} → $${Math.round(nums[0]).toLocaleString('es-AR')}`);
      return ['productPrice', `${label} → $${Math.round(nums[0]).toLocaleString('es-AR')}`];
    }
  }

  // ── Costo variable de producto ─────────────────────────────────────────────
  // "costo variable producto A 5000" | "variable A 3000" | "A costo 7000"
  // "segundo producto costo variable 4000" | "costo variable primer producto 2000"
  if (/costo|variable/.test(t)) {
    const id = resolveProductId(t);
    if (id !== null && nums.length > 0) {
      handlers.onProductCost?.(id, nums[0]);
      const label = isNaN(Number(id)) ? `C.Var ${id}` : `C.Var prod.${Number(id) + 1}`;
      console.log(`[VoiceCommander] ✅ ${label} → $${Math.round(nums[0]).toLocaleString('es-AR')}`);
      return ['productCost', `${label} → $${Math.round(nums[0]).toLocaleString('es-AR')}`];
    }
  }

  console.log('[VoiceCommander] ❓ comando no reconocido');
  return ['unknown', `"${raw}"`];
};

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────
export function useVoiceCommander(handlers: VoiceHandlers): VoiceState {
  const [listening,   setListening]   = useState(false);
  const [supported,   setSupported]   = useState(false);
  const [transcript,  setTranscript]  = useState('');
  const [lastCommand, setLastCommand] = useState<string | null>(null);

  const recRef      = useRef<any>(null);
  // Stable ref so recognition callbacks always see the latest handlers
  // without needing to recreate the SpeechRecognition instance
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const SR: any = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) return;
    setSupported(true);

    const rec     = new SR();
    rec.lang           = 'es-AR';    // primary; falls back to es-ES on most engines
    rec.continuous     = false;      // auto-stops after a pause — ideal for commands
    rec.interimResults = false;      // only fire when utterance is complete
    rec.maxAlternatives = 1;

    rec.onresult = (e: any) => {
      const text = e.results[0][0].transcript as string;
      setTranscript(text);
      const [, label] = dispatchCommand(text, handlersRef.current);
      setLastCommand(label);
      setTimeout(() => setLastCommand(null), 4_000);
    };

    rec.onend   = () => setListening(false);
    rec.onerror = (e: any) => {
      // 'no-speech' is normal when user was too slow — not an error worth surfacing
      if (e.error !== 'no-speech') console.warn('[VoiceCommander] error:', e.error);
      setListening(false);
    };

    recRef.current = rec;
    return () => rec.abort();
  }, []); // create once on mount

  const toggle = useCallback(() => {
    const rec = recRef.current;
    if (!rec) return;
    if (listening) {
      rec.stop();
      setListening(false);
    } else {
      setTranscript('');
      rec.start();
      setListening(true);
    }
  }, [listening]);

  return { listening, supported, transcript, lastCommand, toggle };
}
