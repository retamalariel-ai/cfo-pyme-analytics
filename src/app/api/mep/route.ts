import { NextResponse } from 'next/server';

export const revalidate = 300;

const HEADERS = {
  'Accept': 'application/json',
  'User-Agent': 'Mozilla/5.0 (compatible; CFO-Analytics/1.0)',
};

async function tryFetch(url: string): Promise<{ compra: number; venta: number } | null> {
  try {
    const res = await fetch(url, { next: { revalidate: 300 }, headers: HEADERS });
    if (!res.ok) return null;
    const d = await res.json();
    if (typeof d.compra === 'number' && typeof d.venta === 'number') return d;
    return null;
  } catch {
    return null;
  }
}

export async function GET() {
  // Try primary source
  const primary = await tryFetch('https://dolarapi.com/v1/dolares/mep');
  if (primary) return NextResponse.json(primary);

  // Fallback: argentinadatos.com
  const fallback = await tryFetch('https://api.argentinadatos.com/v1/cotizaciones/dolares/mep');
  if (fallback) return NextResponse.json(fallback);

  return NextResponse.json({ error: 'unavailable' }, { status: 502 });
}
