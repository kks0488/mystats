export const config = { runtime: 'edge' };

export default async function handler(req: Request) {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return new Response('Missing Supabase env vars', { status: 500 });
  }

  const res = await fetch(`${url}/rest/v1/`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });

  return new Response(
    JSON.stringify({ ok: res.ok, status: res.status, ts: new Date().toISOString() }),
    { headers: { 'Content-Type': 'application/json' } },
  );
}
