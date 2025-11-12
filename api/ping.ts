export const config = { runtime: 'edge' };

export default function handler() {
  return new Response(JSON.stringify({ ok: true, t: Date.now() }), {
    headers: { 'content-type': 'application/json' }
  });
}
