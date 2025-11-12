export const config = { runtime: 'edge' };

const RSS_SOURCES = [
  'https://feeds.reuters.com/reuters/worldNews',
  'https://feeds.reuters.com/reuters/businessNews',
  'https://feeds.reuters.com/reuters/USbusinessNews',
  'https://apnews.com/hub/ap-top-news?utm_source=rss'
];

const TRUMP_TERMS = [
  'Donald Trump', 'Trump', 'ex-president', 'Republican frontrunner',
  'Mar-a-Lago', 'press conference', 'rally', 'speech', 'executive order', 'live'
];

const BULLISH_TERMS = [
  'rate cut', 'dovish', 'stimulus', 'liquidity', 'safe haven bid', 'risk-on',
  'ETF inflows', 'approval', 'cooling inflation', 'CPI below', 'dollar weakens', 'ceasefire'
];

const BEARISH_TERMS = [
  'rate hike', 'hawkish', 'tightening', 'sanctions', 'escalation', 'risk-off',
  'ETF outflows', 'rejection', 'hot inflation', 'CPI above', 'dollar surges', 'shutdown'
];

function scoreImpact(text: string) {
  const t = text.toLowerCase();
  let s = 0;
  for (const k of BULLISH_TERMS) if (t.includes(k.toLowerCase())) s += 1;
  for (const k of BEARISH_TERMS) if (t.includes(k.toLowerCase())) s -= 1;
  const label = s >= 2 ? 'bullish-strong' : s === 1 ? 'bullish' : s <= -2 ? 'bearish-strong' : s === -1 ? 'bearish' : 'neutral';
  return { score: s, label };
}

function hasAny(text: string, arr: string[]) {
  const t = text.toLowerCase();
  return arr.some(k => t.includes(k.toLowerCase()));
}

function toSSE(data: any) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

async function fetchText(url: string) {
  const res = await fetch(url, { headers: { 'User-Agent': 'btc-news-alert/1.0' } });
  if (!res.ok) throw new Error(`Fetch failed ${res.status}`);
  return await res.text();
}

// ✅ CORRIGIDO: barras invertidas normais (\) nas expressões
function parseRSS(xml: string) {
  const items: { title: string; link: string; pubDate?: string }[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRegex.exec(xml))) {
    const block = m[1];
    const get = (tag: string) =>
      (new RegExp(`<${tag}[^>]*>([\s\S]*?)<\/${tag}>`, 'i')
        .exec(block)?.[1] || '')
        .replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1')
        .trim();
    const title = get('title');
    const link = get('link') || get('guid');
    const pubDate = get('pubDate');
    if (title && link) items.push({ title, link, pubDate });
  }
  return items;
}

const seen = new Map<string, number>();

export default async function handler(req: Request) {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  async function push(data: any) {
    await writer.write(encoder.encode(toSSE(data)));
  }

  const headers = new Headers({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive'
  });

  push({ type: 'hello', at: Date.now() });

  async function cycle() {
    for (const url of RSS_SOURCES) {
      try {
        const xml = await fetchText(url);
        const items = parseRSS(xml).slice(0, 10);
        for (const it of items) {
          const key = (it.link || it.title).slice(0, 200);
          if (seen.has(key)) continue;
          seen.set(key, Date.now());

          const text = it.title;
          const { score, label } = scoreImpact(text);
          const topic = hasAny(text, TRUMP_TERMS) ? 'trump' : 'macro';

          await push({
            type: 'news',
            title: it.title,
            link: it.link,
            pubDate: it.pubDate,
            topic,
            label,
            score
          });
        }
      } catch (e) {
        await push({ type: 'error', source: url, message: String(e) });
      }
    }
  }

  (async () => {
    while (true) {
      await cycle();
      await new Promise(r => setTimeout(r, 15000));
    }
  })();

  return new Response(readable, { headers });
}