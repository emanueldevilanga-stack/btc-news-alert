export const config = { runtime: 'edge' };

// Fontes estáveis (Trump + Macro que movem BTC)
const RSS_SOURCES = [
  // Trump (sem 'site:' para evitar bloqueios)
  'https://news.google.com/rss/search?q=Donald+Trump&hl=en-US&gl=US&ceid=US:en',

  // Macro oficiais/finance
  'https://www.federalreserve.gov/feeds/press_all.xml',        // Fed
  'https://www.bls.gov/feeds/news_release_all.rss',            // BLS (CPI/Jobs)
  'https://www.cnbc.com/id/100003114/device/rss/rss.html',     // CNBC Top
  'https://apnews.com/hub/ap-top-news?utm_source=rss',         // AP Top
  'https://www.coindesk.com/arc/outboundfeeds/rss/?outputType=xml' // CoinDesk
];

const TRUMP_TERMS = [
  'Donald Trump','Trump','ex-president','Republican','press conference',
  'rally','speech','executive order','live','White House'
];

const BULLISH_TERMS = [
  'rate cut','dovish','stimulus','liquidity','safe haven','risk-on',
  'ETF inflows','approval','cooling inflation','CPI below','dollar weakens','ceasefire'
];
const BEARISH_TERMS = [
  'rate hike','hawkish','tightening','sanctions','escalation','risk-off',
  'ETF outflows','rejection','hot inflation','CPI above','dollar surges','shutdown'
];

function scoreImpact(text: string) {
  const t = text.toLowerCase();
  let s = 0;
  for (const k of BULLISH_TERMS) if (t.includes(k.toLowerCase())) s += 1;
  for (const k of BEARISH_TERMS) if (t.includes(k.toLowerCase())) s -= 1;
  const label = s >= 2 ? 'bullish-strong' : s === 1 ? 'bullish'
              : s <= -2 ? 'bearish-strong' : s === -1 ? 'bearish' : 'neutral';
  return { score: s, label };
}
function hasAny(text: string, arr: string[]) {
  const t = text.toLowerCase();
  return arr.some(k => t.includes(k.toLowerCase()));
}
function toSSE(data: any) { return `data: ${JSON.stringify(data)}\n\n`; }

// ---------- FETCH COM FALLBACKS ----------
const PROXIES = [
  (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}&nocache=${Date.now()}`,
  (u: string) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}&nocache=${Date.now()}`, // precisa ler .contents
  (u: string) => `https://thingproxy.freeboard.io/fetch/${u}`, // simples e funciona em muitos casos
  (u: string) => u // direto (última tentativa)
];

async function fetchOnce(url: string): Promise<string> {
  // tenta cada proxy em sequência
  for (let i = 0; i < PROXIES.length; i++) {
    const target = PROXIES[i](url);
    try {
      const res = await fetch(target, { cache: 'no-store' });
      if (!res.ok) throw new Error(`status ${res.status}`);

      // allorigins/get responde JSON { contents: "<xml>" }
      if (target.includes('/get?')) {
        const j = await res.json();
        if (j && j.contents) return String(j.contents);
        throw new Error('no contents');
      }
      return await res.text();
    } catch (e) {
      // tenta o próximo proxy
    }
  }
  throw new Error('all proxies failed');
}

async function fetchText(url: string, retries = 1): Promise<string> {
  try {
    return await fetchOnce(url);
  } catch (e) {
    if (retries > 0) {
      await new Promise(r => setTimeout(r, 800));
      return fetchText(url, retries - 1);
    }
    throw e;
  }
}

// ---------- PARSER ----------
function parseRSS(xml: string) {
  const items: { title: string; link: string; pubDate?: string }[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRegex.exec(xml))) {
    const block = m[1];
    const get = (tag: string) =>
      (new RegExp(`<${tag}[^>]*>([\s\S]*?)<\/${tag}>`, 'i').exec(block)?.[1] || '')
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

export default async function handler(_req: Request) {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  async function push(data: any) { await writer.write(encoder.encode(toSSE(data))); }

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

          await push({ type: 'news', title: it.title, link: it.link, pubDate: it.pubDate, topic, label, score });
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