import React, { useEffect, useState, useRef, useCallback } from 'react';
import { LeaderboardEntry } from '../types';
import { Trophy, Users } from 'lucide-react';

export const Leaderboard: React.FC = () => {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout>>();

  const fetchEntries = useCallback(async () => {
    try {
      const res = await fetch('/api/leaderboard');
      if (!res.ok) throw new Error('fetch failed');
      const data = await res.json();
      setEntries(data);
    } catch {
      // silently ignore — will retry on next WS connect
    } finally {
      setLoading(false);
    }
  }, []);

  const connectWs = useCallback(() => {
    // Close any stale connection first
    if (wsRef.current) {
      wsRef.current.onclose = null; // prevent retry loop from old socket
      wsRef.current.close();
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}`);
    wsRef.current = ws;

    ws.onopen = () => {
      // Re-fetch on every (re)connect so the list is current
      fetchEntries();
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'LEADERBOARD_UPDATE') setEntries(msg.data);
      } catch { /* ignore malformed */ }
    };

    ws.onerror = () => { ws.close(); };

    ws.onclose = () => {
      // Auto-reconnect after 3 s so score updates always come through
      retryRef.current = setTimeout(connectWs, 3000);
    };
  }, [fetchEntries]);

  useEffect(() => {
    fetchEntries();
    connectWs();
    return () => {
      clearTimeout(retryRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [fetchEntries, connectWs]);

  return (
    <div className="bg-black/80 p-6 rounded-2xl border border-white/10 w-full max-w-md">
      <div className="flex items-center gap-3 mb-6">
        <Trophy className="text-yellow-400" size={24}/>
        <h2 className="text-2xl font-bold text-white uppercase tracking-wider">Top Rescuers</h2>
      </div>

      {loading ? (
        <div className="text-white/50 animate-pulse text-sm">Loading scores…</div>
      ) : entries.length === 0 ? (
        <div className="text-white/30 italic text-sm">No scores yet. Be the first!</div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry, i) => (
            <div key={i}
                 className={`flex items-center justify-between p-3 rounded-lg border
                   ${i===0?'bg-yellow-400/10 border-yellow-400/30':'bg-white/5 border-white/5'}`}>
              <div className="flex items-center gap-4">
                <span className={`font-mono font-bold ${
                  i===0?'text-yellow-400':i===1?'text-gray-300':i===2?'text-amber-600':'text-white/40'}`}>
                  {String(i+1).padStart(2,'0')}
                </span>
                <span className="text-white font-medium">{entry.name}</span>
              </div>
              <div className="text-right">
                <div className="text-yellow-400 font-bold font-mono">{entry.score.toLocaleString()}</div>
                <div className="text-[10px] text-white/40 uppercase">Floor {entry.level}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 flex items-center gap-2 text-[10px] text-white/30 uppercase tracking-widest">
        <Users size={12}/>
        <span>Live Leaderboard</span>
      </div>
    </div>
  );
};
