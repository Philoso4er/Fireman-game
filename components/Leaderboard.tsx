import React, { useEffect, useState, useRef, useCallback } from 'react';
import { LeaderboardEntry } from '../types';
import { Trophy, Users, RefreshCw } from 'lucide-react';

/**
 * Leaderboard — HTTP polling only, no WebSocket.
 *
 * WHY: The WebSocket approach had an unfixable conflict between the ws library
 * and Vite's internal upgrade handler in middleware mode. Both claim the same
 * upgrade event and Vite wins, so our /ws path was never reached reliably.
 *
 * Simple HTTP polling every 5 s is completely reliable, needs zero extra
 * infrastructure, and for a leaderboard is more than fast enough.
 * After a score submit the parent calls onScoreSubmit() which triggers an
 * immediate refetch so the new entry appears instantly.
 */
export const Leaderboard: React.FC = () => {
  const [entries,   setEntries]   = useState<LeaderboardEntry[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();
  const dead        = useRef(false);

  const fetchEntries = useCallback(async () => {
    try {
      // Always read localStorage first — works on Vercel/static hosting
      const local: LeaderboardEntry[] =
        JSON.parse(localStorage.getItem('twr_leaderboard') || '[]');

      // Merge with server if available (works locally, silently skipped on Vercel)
      let merged = [...local];
      try {
        const res = await fetch(`/api/leaderboard?t=${Date.now()}`);
        if (res.ok) {
          const server: LeaderboardEntry[] = await res.json();
          // Combine, deduplicate by name+score, keep top 10
          const all = [...local, ...server];
          const seen = new Set<string>();
          merged = all.filter(e => {
            const k = `${e.name}:${e.score}`;
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
          });
        }
      } catch { /* server not available — use localStorage only */ }

      merged.sort((a, b) => b.score - a.score);
      const top10 = merged.slice(0, 10);

      if (!dead.current) {
        setEntries(top10);
        setLastFetch(new Date());
      }
    } catch (e) {
      console.warn('[Leaderboard] fetch failed:', e);
    } finally {
      if (!dead.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    dead.current = false;

    // Immediate fetch on mount
    fetchEntries();

    // Poll every 5 seconds — catches updates from other players
    intervalRef.current = setInterval(fetchEntries, 5000);

    return () => {
      dead.current = true;
      clearInterval(intervalRef.current);
    };
  }, [fetchEntries]);

  // Exposed so parent can trigger an immediate refresh after submit
  // (accessed via ref from UIOverlay)
  (Leaderboard as any)._refresh = fetchEntries;

  const timeAgo = lastFetch
    ? `${Math.round((Date.now() - lastFetch.getTime()) / 1000)}s ago`
    : '';

  return (
    <div className="bg-black/80 p-6 rounded-2xl border border-white/10 w-full max-w-md">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Trophy className="text-yellow-400" size={24}/>
          <h2 className="text-2xl font-bold text-white uppercase tracking-wider">Top Rescuers</h2>
        </div>
        <button
          onClick={fetchEntries}
          title="Refresh"
          className="text-white/30 hover:text-white/70 transition-colors p-1"
        >
          <RefreshCw size={14}/>
        </button>
      </div>

      {loading ? (
        <div className="text-white/50 animate-pulse text-sm">Loading scores…</div>
      ) : entries.length === 0 ? (
        <div className="text-white/30 italic text-sm">No scores yet — be the first!</div>
      ) : (
        <div className="space-y-3">
          {entries.map((entry, i) => (
            <div key={`${entry.name}-${i}`}
                 className={`flex items-center justify-between p-3 rounded-lg border transition-colors
                   ${i === 0
                     ? 'bg-yellow-400/10 border-yellow-400/30'
                     : 'bg-white/5 border-white/5'}`}>
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

      <div className="mt-4 flex items-center justify-between text-[10px] text-white/20 uppercase tracking-widest">
        <div className="flex items-center gap-2">
          <Users size={12}/>
          <span>Leaderboard</span>
        </div>
        {lastFetch && <span>Updated {timeAgo}</span>}
      </div>
    </div>
  );
};
