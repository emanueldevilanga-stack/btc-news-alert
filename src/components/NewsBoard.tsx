export default function NewsBoard({ items }: { items: any[] }) {
return (
<div style={{ display: 'grid', gap: 12 }}>
{items.map(it => (
<a key={it.id} href={it.link} target="_blank" rel="noreferrer" style={{
textDecoration: 'none', color: 'inherit', border: '1px solid #e5e7eb', borderRadius: 12, padding: 12,
boxShadow: '0 1px 2px rgba(0,0,0,0.06)'
}}>
<div style={{ fontSize: 14, color: '#6b7280' }}>{new Date(it.pubDate || Date.now()).toLocaleString()}</div>
<div style={{ fontSize: 18, fontWeight: 600, marginTop: 4 }}>{it.title}</div>
<div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
<Tag label={it.topic === 'trump' ? 'Trump' : 'Macro'} />
<Tag label={labelToText(it.label)} kind={it.label} />
<span style={{ fontSize: 12, color: '#9ca3af' }}>score: {it.score}</span>
</div>
</a>
))}
</div>
);
}


function Tag({ label, kind }: { label: string, kind?: string }) {
const bg = kind?.includes('bullish') ? '#dcfce7' : kind?.includes('bearish') ? '#fee2e2' : '#e5e7eb';
const color = kind?.includes('bullish') ? '#166534' : kind?.includes('bearish') ? '#991b1b' : '#374151';
return (
<span style={{ background: bg, color, padding: '2px 8px', borderRadius: 999, fontSize: 12 }}>{label}</span>
);
}


function labelToText(l: string) {
if (l === 'bullish-strong') return 'Bullish (forte)';
if (l === 'bullish') return 'Bullish';
if (l === 'bearish-strong') return 'Bearish (forte)';
if (l === 'bearish') return 'Bearish';
return 'Neutro';
}