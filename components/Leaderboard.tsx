import React, { useEffect, useState, useRef, useCallback } from 'react';
import { LeaderboardEntry } from '../types';
import { Trophy, Users, Wifi, WifiOff } from 'lucide-react';

export const Leaderboard: React.FC = () => {
  const [entries,   setEntries]   = useState<LeaderboardEntry[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [connected, setConnected] = useState(false);
  const wsRef     = useRef<WebSocket | null>(null);
  const retryRef  = useRef<ReturnType<typeof setTimeout>>();
  const dead      = useRef(false); // set true on unmount so callbacks bail out

  const fetchEntries = useCallback(async () => {
    try {
      const res  = await fetch('/api/leaderboard');
      if (!res.ok) throw new Error('bad response');
      const data = await res.json();
      if (!dead.current) setEntries(data);
    } catch { /* retry on next connect */ }
    finally  { if (!dead.current) setLoading(false); }
  }, []);

  const connect = useCallback(() => {
    if (dead.current) return;

    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    // Connect to /ws — server.ts routes this explicitly to our WSS instance.
    // The old code connected to the root path which Vite was intercepting,
    // so broadcasts were never received and the leaderboard never updated.
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      if (dead.current) return;
      setConnected(true);
      fetchEntries(); // always re-fetch fresh data on (re)connect
    };

    ws.onmessage = (ev) => {
      if (dead.current) return;
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'LEADERBOARD_UPDATE') setEntries(msg.data);
      } catch { /* ignore bad frames */ }
    };

    ws.onerror = () => { ws.close(); };

    ws.onclose = () => {
      if (dead.current) return;
      setConnected(false);
      retryRef.current = setTimeout(connect, 3000); // reconnect after 3 s
    };
  }, [fetchEntries]);

  useEffect(() => {
    dead.current = false;
    fetchEntries();
    connect();
    return () => {
      dead.current = true;
      clearTimeout(retryRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.close();
      }
    };
  }, [fetchEntries, connect]);

  return (
    <div className="bg-black/80 p-6 rounded-2xl border border-white/10 w-full max-w-md">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Trophy className="text-yellow-400" size={24}/>
          <h2 className="text-2xl font-bold text-white uppercase tracking-wider">Top Rescuers</h2>
        </div>
        <div className={`flex items-center gap-1 text-[10px] uppercase tracking-widest
          ${connected ? 'text-green-400' : 'text-red-400/60'}`}>
          {connected ? <Wifi size={12}/> : <WifiOff size={12}/>}
          <span>{connected ? 'Live' : 'Offline'}</span>
        </div>
      </div>

      {loading ? (
        <div className="text-white/50 animate-pulse text-sm">Loading scores…</div>
      ) : entries.length === 0 ? (
        <div className="text-white/30 italic text-sm">No scores yet — be the first!</div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry, i) => (
            <div key={`${entry.name}-${i}`}
                 className={`flex items-center justify-between p-3 rounded-lg border
                   ${i===0 ? 'bg-yellow-400/10 border-yellow-400/30' : 'bg-white/5 border-white/5'}`}>
              <div className="flex items-center gap-4">
                <span className={`font-mono font-bold text-sm ${
                  i===0?'text-yellow-400':i===1?'text-gray-300':i===2?'text-amber-600':'text-white/40'
                }`}>
                  {String(i+1).padStart(2,'0')}
                </span>
                <span className="text-white font-medium">{entry.name}</span>
              </div>
              <div className="text-right">
                <div className="text-yellow-400 font-bold font-mono text-sm">
                  {entry.score.toLocaleString()}
                </div>
                <div className="text-[10px] text-white/40 uppercase">Floor {entry.level}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 flex items-center gap-2 text-[10px] text-white/30 uppercase tracking-widest">
        <Users size={12}/>
        <span>Real-time Leaderboard</span>
      </div>
    </div>
  );
};
