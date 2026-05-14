import { NextResponse } from 'next/server';

const UPSTREAM = 'https://dolarapi.com/v1/dolares/mep';

// Cache on the CDN/server for 5 minutes so we don't hammer the upstream API
export const revalidate = 300;

export async function GET() {
  try {
    const res = await fetch(UPSTREAM, {
      next: { revalidate: 300 },
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) {
      return NextResponse.json({ error: 'upstream_error' }, { status: 502 });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'fetch_failed' }, { status: 502 });
  }
}
