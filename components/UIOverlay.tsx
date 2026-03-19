import React, { useState } from 'react';
import { GameState, InputState } from '../types';
import { Heart, Droplets, User, Trophy, Play, Settings, HelpCircle, RotateCcw, Menu, ArrowBigUp, Send, Clock } from 'lucide-react';
import { PLAYER_MAX_AMMO, PLAYER_MAX_HEALTH } from '../constants';
import { Leaderboard } from './Leaderboard';

interface UIProps {
  gameState: GameState;
  onStart: () => void;
  onRetry: () => void;
  onMenu: () => void;
  inputRef: React.MutableRefObject<InputState>;
}

export const UIOverlay: React.FC<UIProps> = ({ gameState, onStart, onRetry, onMenu, inputRef }) => {
  const [playerName, setPlayerName] = useState('');
  const [submitted, setSubmitted] = useState(false);
  
  React.useEffect(() => {
    if (gameState.screen === 'PLAYING') {
      setSubmitted(false);
    }
  }, [gameState.screen]);

  // Mobile Touch Handlers
  const handleTouch = (key: keyof InputState, active: boolean) => (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    if (inputRef.current) {
        inputRef.current[key] = active;
    }
  };

  const submitScore = async () => {
    if (!playerName.trim() || submitted) return;
    try {
      await fetch('/api/leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: playerName,
          score: gameState.score,
          level: gameState.level
        })
      });
      setSubmitted(true);
    } catch (error) {
      console.error('Failed to submit score:', error);
    }
  };

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  if (gameState.screen === 'MENU') {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 text-white z-50 font-retro overflow-y-auto p-8">
        <h1 className="text-4xl md:text-6xl text-orange-500 mb-8 font-bold tracking-tighter text-center" style={{ textShadow: '4px 4px 0 #991b1b' }}>
          TOWER BLAZE<br/><span className="text-blue-500" style={{ textShadow: '4px 4px 0 #1e40af' }}>RESCUE</span>
        </h1>
        
        <div className="flex flex-col md:flex-row gap-8 items-start justify-center w-full max-w-4xl">
          <div className="flex flex-col gap-4 w-64 shrink-0">
            <button onClick={onStart} className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 py-4 rounded border-b-4 border-green-800 text-xl active:translate-y-1 active:border-b-0 shadow-lg">
              <Play size={24} /> START MISSION
            </button>
            <div className="text-xs text-gray-400 text-center mt-4 space-y-2">
              <p className="bg-gray-800/50 p-2 rounded">Desktop: <span className="text-white">WASD</span> Move • <span className="text-white">SPACE</span> Spray • <span className="text-white">E</span> Interact</p>
              <p className="md:hidden">Mobile: On-screen Controls</p>
            </div>
          </div>

          <Leaderboard />
        </div>
      </div>
    );
  }

  if (gameState.screen === 'GAMEOVER' || gameState.screen === 'VICTORY') {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/95 text-white z-50 overflow-y-auto p-8">
        <h2 className={`text-4xl mb-6 font-bold tracking-widest ${gameState.victory ? 'text-green-500' : 'text-red-500'}`} style={{ textShadow: '2px 2px 0 #000' }}>
          {gameState.victory ? 'MISSION COMPLETE!' : 'MISSION FAILED'}
        </h2>
        
        <div className="flex flex-col md:flex-row gap-8 items-start justify-center w-full max-w-4xl">
          <div className="flex flex-col items-center gap-6">
            <div className="bg-gray-800 p-6 rounded-lg border-2 border-gray-600 text-center w-80 shadow-2xl">
              <div className="flex justify-between mb-3 border-b border-gray-700 pb-2">
                <span className="text-gray-400 uppercase text-xs tracking-wider mt-1">Score</span>
                <span className="text-yellow-400 text-2xl font-mono">{gameState.score}</span>
              </div>
              <div className="flex justify-between mb-3 border-b border-gray-700 pb-2">
                <span className="text-gray-400 uppercase text-xs tracking-wider mt-1">Rescued</span>
                <span className="text-green-400 text-2xl font-mono">{gameState.civiliansRescued}</span>
              </div>
               <div className="flex justify-between">
                <span className="text-gray-400 uppercase text-xs tracking-wider mt-1">Floor</span>
                <span className="text-blue-400 text-2xl font-mono">{gameState.level}</span>
              </div>
            </div>

            {!submitted ? (
              <div className="bg-blue-900/30 p-4 rounded-xl border border-blue-500/30 w-80">
                <label className="block text-[10px] uppercase tracking-widest text-blue-400 mb-2">Submit to Leaderboard</label>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    placeholder="ENTER NAME" 
                    maxLength={10}
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value.toUpperCase())}
                    className="bg-black border border-white/20 rounded px-3 py-2 text-sm w-full focus:outline-none focus:border-blue-500 font-mono"
                  />
                  <button 
                    onClick={submitScore}
                    className="bg-blue-600 hover:bg-blue-500 p-2 rounded active:scale-95 transition-transform"
                  >
                    <Send size={20} />
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-green-400 text-sm font-bold animate-bounce">SCORE SUBMITTED!</div>
            )}

            <div className="flex gap-4">
              <button onClick={onRetry} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 px-6 py-3 rounded border-b-4 border-blue-800 active:translate-y-1 active:border-b-0">
                <RotateCcw size={20} /> RETRY
              </button>
              <button onClick={onMenu} className="flex items-center gap-2 bg-gray-600 hover:bg-gray-500 px-6 py-3 rounded border-b-4 border-gray-800 active:translate-y-1 active:border-b-0">
                <Menu size={20} /> MENU
              </button>
            </div>
          </div>

          <Leaderboard />
        </div>
      </div>
    );
  }

  // HUD
  return (
    <>
      {/* Compact Top HUD */}
      <div className="absolute top-0 left-0 right-0 p-1 md:p-2 flex flex-col gap-1 pointer-events-none z-10 bg-gradient-to-b from-black/60 to-transparent">
        {/* Row 1: Status Bars (Thin & Wide) */}
        <div className="flex gap-2 w-full px-1">
           <div className="flex-1 h-1.5 bg-red-950/50 rounded-full overflow-hidden border border-red-900/30">
              <div className="h-full bg-gradient-to-r from-red-600 to-red-400 transition-all duration-200" style={{ width: `${(gameState.health / PLAYER_MAX_HEALTH) * 100}%` }}></div>
           </div>
           <div className="flex-1 h-1.5 bg-blue-950/50 rounded-full overflow-hidden border border-blue-900/30">
              <div className="h-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all duration-100" style={{ width: `${(gameState.ammo / PLAYER_MAX_AMMO) * 100}%` }}></div>
           </div>
        </div>
        
        {/* Row 2: Stats & Info */}
        <div className="flex justify-between items-center px-2 text-[10px] md:text-xs font-bold">
           <div className="flex gap-3 items-center">
              <div className="text-yellow-500 bg-black/40 px-2 py-0.5 rounded border border-yellow-500/30">FLOOR {gameState.level}</div>
              <div className="flex items-center gap-1 text-white bg-black/40 px-2 py-0.5 rounded border border-white/20 font-mono">
                 <Clock size={12} className="text-gray-400" /> {formatTime(gameState.time)}
              </div>
           </div>

           <div className="flex gap-3 items-center">
              <div className="flex items-center gap-1 text-yellow-400 bg-black/40 px-2 py-0.5 rounded border border-yellow-500/30 font-mono">
                 <Trophy size={12} /> {gameState.score}
              </div>
              <div className="flex items-center gap-1 text-green-400 bg-black/40 px-2 py-0.5 rounded border border-green-500/30 font-mono">
                 <User size={12} /> {gameState.civiliansRescued}/{gameState.totalCivilians + gameState.civiliansRescued}
              </div>
           </div>
        </div>
      </div>

      {/* Mobile Controls (Visible only on touch devices/small screens) */}
      {/* 
         Positioned with bottom-12 relative to the viewport.
         On a full-screen mobile view, this ensures they are at the bottom of the phone screen.
         We use a slight opacity on the background to see floor below if needed.
      */}
      <div className="absolute bottom-8 left-4 right-4 flex justify-between items-end md:hidden z-20 pointer-events-auto select-none">
        
        {/* D-Pad */}
        <div className="relative w-40 h-40 bg-gray-800/40 rounded-full backdrop-blur-sm border-2 border-gray-600/50 shadow-2xl">
           <div className="absolute inset-4 bg-gray-900/80 rounded-full"></div>
           
           <button 
             className="absolute top-0 left-1/2 -translate-x-1/2 w-14 h-16 bg-gradient-to-b from-gray-600 to-gray-700 rounded-t-xl active:from-blue-600 active:to-blue-700 border-x-2 border-t-2 border-gray-500 shadow-lg"
             onTouchStart={handleTouch('up', true)} onTouchEnd={handleTouch('up', false)}
             onMouseDown={handleTouch('up', true)} onMouseUp={handleTouch('up', false)}
           >
             <ArrowBigUp className="mx-auto text-gray-300" size={28} />
           </button>
           
           <button 
             className="absolute bottom-0 left-1/2 -translate-x-1/2 w-14 h-16 bg-gradient-to-t from-gray-600 to-gray-700 rounded-b-xl active:from-blue-600 active:to-blue-700 border-x-2 border-b-2 border-gray-500 shadow-lg"
             onTouchStart={handleTouch('down', true)} onTouchEnd={handleTouch('down', false)}
             onMouseDown={handleTouch('down', true)} onMouseUp={handleTouch('down', false)}
           >
             <ArrowBigUp className="mx-auto rotate-180 text-gray-300" size={28} />
           </button>
           
           <button 
             className="absolute left-0 top-1/2 -translate-y-1/2 w-16 h-14 bg-gradient-to-r from-gray-600 to-gray-700 rounded-l-xl active:from-blue-600 active:to-blue-700 border-y-2 border-l-2 border-gray-500 shadow-lg"
             onTouchStart={handleTouch('left', true)} onTouchEnd={handleTouch('left', false)}
             onMouseDown={handleTouch('left', true)} onMouseUp={handleTouch('left', false)}
           >
             <ArrowBigUp className="mx-auto -rotate-90 text-gray-300" size={28} />
           </button>
           
           <button 
             className="absolute right-0 top-1/2 -translate-y-1/2 w-16 h-14 bg-gradient-to-l from-gray-600 to-gray-700 rounded-r-xl active:from-blue-600 active:to-blue-700 border-y-2 border-r-2 border-gray-500 shadow-lg"
             onTouchStart={handleTouch('right', true)} onTouchEnd={handleTouch('right', false)}
             onMouseDown={handleTouch('right', true)} onMouseUp={handleTouch('right', false)}
           >
             <ArrowBigUp className="mx-auto rotate-90 text-gray-300" size={28} />
           </button>
           
           {/* Center Decoration */}
           <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-gray-800 border border-gray-600"></div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-6 mb-2">
           {/* Interact Button (Smaller) */}
           <button 
             className="w-20 h-20 bg-green-600/90 rounded-full border-b-[6px] border-green-800 active:border-b-0 active:translate-y-1.5 flex items-center justify-center text-white font-bold shadow-xl active:shadow-none transition-all backdrop-blur-sm"
             onTouchStart={handleTouch('interact', true)} onTouchEnd={handleTouch('interact', false)}
             onMouseDown={handleTouch('interact', true)} onMouseUp={handleTouch('interact', false)}
           >
             <div className="flex flex-col items-center">
                <span className="text-xl font-black">E</span>
                <span className="text-[10px] uppercase font-bold opacity-80">Use</span>
             </div>
           </button>
           
           {/* Extinguisher Button (Larger) */}
           <button 
             className="w-24 h-24 bg-blue-600/90 rounded-full border-b-[8px] border-blue-800 active:border-b-0 active:translate-y-2 flex items-center justify-center text-white shadow-xl active:shadow-none transition-all backdrop-blur-sm"
             onTouchStart={handleTouch('action', true)} onTouchEnd={handleTouch('action', false)}
             onMouseDown={handleTouch('action', true)} onMouseUp={handleTouch('action', false)}
           >
             <div className="flex flex-col items-center">
                <Droplets size={36} strokeWidth={3} />
                <span className="text-[10px] uppercase font-bold opacity-80 mt-1">Spray</span>
             </div>
           </button>
        </div>
      </div>
    </>
  );
};