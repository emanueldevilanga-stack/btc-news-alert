import { useEffect, useRef, useState } from 'react';
import NewsBoard from './components/NewsBoard';

export default function App() {
  const [events, setEvents] = useState<any[]>([]);
  const [connected, setConnected] = useState(false);
  const [topicFilter, setTopicFilter] = useState<'all' | 'trump' | 'macro'>('all');
  const [onlyImpact, setOnlyImpact] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [notify, setNotify] = useState(false);

  // 👇 Aqui começa o useEffect corretamente
  useEffect(() => {
    const es = new EventSource('/api/stream');
    setConnected(true);

    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === 'news') {
        setEvents((prev) => [data, ...prev.filter((p) => p.id !== data.id)].slice(0, 100));
        const impactful = data.label && data.label !== 'neutral';
        if (impactful) {
          audioRef.current?.play().catch(() => {});
          if (notify && Notification.permission === 'granted') {
            new Notification(`${data.label.toUpperCase()} — ${data.topic}`, { body: data.title });
          }
        }
      }
    };

    es.onerror = () => {
      setConnected(false);
      es.close();
      setTimeout(() => window.location.reload(), 5000);
    };

    // ✅ O return agora está dentro do useEffect
    return () => es.close();
  }, [notify]);

  const filtered = events.filter((e) => {
    if (topicFilter !== 'all' && e.topic !== topicFilter) return false;
    if (onlyImpact && e.label === 'neutral') return false;
    return true;
  });

  async function enableNotify() {
    if (Notification.permission === 'granted') setNotify(true);
    else {
      const p = await Notification.requestPermission();
      if (p === 'granted') setNotify(true);
    }
  }

  return (
    <div
      style={{
        fontFamily: 'Inter, system-ui, sans-serif',
        padding: 16,
        maxWidth: 1000,
        margin: '0 auto',
      }}
    >
      <h1>BTC News Alert (Trump + Macro)</h1>
      <p>
        Status: <b>{connected ? 'Conectado' : 'Reconectando…'}</b>
      </p>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
        <label>
          Tema:
          <select
            value={topicFilter}
            onChange={(e) => setTopicFilter(e.target.value as any)}
            style={{ marginLeft: 8 }}
          >
            <option value="all">Todos</option>
            <option value="trump">Trump</option>
            <option value="macro">Macro</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={onlyImpact}
            onChange={(e) => setOnlyImpact(e.target.checked)}
          />
          &nbsp;Apenas com impacto (≠ neutro)
        </label>
        <button onClick={enableNotify}>
          {notify ? 'Notificações ON' : 'Ativar notificações'}
        </button>
      </div>

      <NewsBoard items={filtered} />

      <audio ref={audioRef} src="data:audio/mp3;base64,//uQZAAAAAAAAAAAAAAAAAAAA" />
    </div>
  );
}