import React, { useEffect, useState } from 'react';
import { LeaderboardEntry } from '../types';
import { Trophy, Users } from 'lucide-react';

export const Leaderboard: React.FC = () => {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const response = await fetch('/api/leaderboard');
        const data = await response.json();
        setEntries(data);
      } catch (error) {
        console.error('Failed to fetch leaderboard:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchLeaderboard();

    // WebSocket for real-time updates
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}`);

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === 'LEADERBOARD_UPDATE') {
        setEntries(message.data);
      }
    };

    return () => ws.close();
  }, []);

  return (
    <div className="bg-black/80 p-6 rounded-2xl border border-white/10 w-full max-w-md">
      <div className="flex items-center gap-3 mb-6">
        <Trophy className="text-yellow-400" size={24} />
        <h2 className="text-2xl font-bold text-white uppercase tracking-wider">Top Rescuers</h2>
      </div>

      {loading ? (
        <div className="text-white/50 animate-pulse">Loading scores...</div>
      ) : (
        <div className="space-y-3">
          {entries.length === 0 ? (
            <div className="text-white/30 italic">No scores yet. Be the first!</div>
          ) : (
            entries.map((entry, index) => (
              <div 
                key={index} 
                className={`flex items-center justify-between p-3 rounded-lg border ${
                  index === 0 ? 'bg-yellow-400/10 border-yellow-400/30' : 'bg-white/5 border-white/5'
                }`}
              >
                <div className="flex items-center gap-4">
                  <span className={`font-mono font-bold ${
                    index === 0 ? 'text-yellow-400' : index === 1 ? 'text-gray-300' : index === 2 ? 'text-amber-600' : 'text-white/40'
                  }`}>
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="text-white font-medium">{entry.name}</span>
                </div>
                <div className="text-right">
                  <div className="text-yellow-400 font-bold font-mono">{entry.score.toLocaleString()}</div>
                  <div className="text-[10px] text-white/40 uppercase">Level {entry.level}</div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
      
      <div className="mt-6 flex items-center gap-2 text-[10px] text-white/30 uppercase tracking-widest">
        <Users size={12} />
        <span>Live Multiplayer Leaderboard</span>
      </div>
    </div>
  );
};
