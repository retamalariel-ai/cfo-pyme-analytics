import { NextResponse } from 'next/server';

export const revalidate = 300;

const UA = 'Mozilla/5.0 (compatible; CFO-Analytics/1.0)';
interface MepRate { compra: number; venta: number; fuente?: string }

async function get(url: string, ms = 5000): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      cache: 'no-store',
      headers: { Accept: 'application/json', 'User-Agent': UA },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function GET() {
  // 1. dolarapi.com
  const a = await get('https://dolarapi.com/v1/dolares/mep') as any;
  if (a && typeof a.compra === 'number' && typeof a.venta === 'number')
    return NextResponse.json({ compra: a.compra, venta: a.venta, fuente: 'dolarapi' } satisfies MepRate);

  // 2. argentinadatos.com
  const b = await get('https://api.argentinadatos.com/v1/cotizaciones/dolares/mep') as any;
  if (b && typeof b.compra === 'number' && typeof b.venta === 'number')
    return NextResponse.json({ compra: b.compra, venta: b.venta, fuente: 'argentinadatos' } satisfies MepRate);

  // 3. bluelytics.com.ar — usa tipo blue como proxy del MEP
  const c = await get('https://api.bluelytics.com.ar/v2/latest') as any;
  if (c?.blue && typeof c.blue.value_buy === 'number' && typeof c.blue.value_sell === 'number')
    return NextResponse.json({ compra: c.blue.value_buy, venta: c.blue.value_sell, fuente: 'bluelytics-blue' } satisfies MepRate);

  return NextResponse.json({ error: 'unavailable' }, { status: 502 });
}
