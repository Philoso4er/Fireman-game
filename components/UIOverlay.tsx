import React, { useState, useEffect } from 'react';
import { GameState, InputState } from '../types';
import { Droplets, User, Trophy, Play, RotateCcw, Menu, ArrowBigUp, Send, Clock, Wind, Flame } from 'lucide-react';
import { PLAYER_MAX_AMMO, PLAYER_MAX_HEALTH, OXYGEN_MAX, MAX_LEVELS } from '../constants';
import { Leaderboard } from './Leaderboard';
import { audioManager } from '../utils/audio';

interface UIProps {
  gameState: GameState; onStart:()=>void; onRetry:()=>void;
  onMenu:()=>void; inputRef: React.MutableRefObject<InputState>;
}

export const UIOverlay: React.FC<UIProps> = ({ gameState, onStart, onRetry, onMenu, inputRef }) => {
  const [playerName, setPlayerName] = useState('');
  const [submitted,  setSubmitted]  = useState(false);

  useEffect(()=>{ if(gameState.screen==='PLAYING') setSubmitted(false); },[gameState.screen]);

  useEffect(()=>{
    const reset=()=>{ Object.keys(inputRef.current).forEach(k=>{(inputRef.current as any)[k]=false;}); };
    window.addEventListener('blur',reset); window.addEventListener('visibilitychange',reset);
    return()=>{ window.removeEventListener('blur',reset); window.removeEventListener('visibilitychange',reset); };
  },[inputRef]);

  useEffect(()=>{
    if(gameState.screen!=='PLAYING') return;
    const prevent=(e:Event)=>e.preventDefault();
    document.addEventListener('contextmenu',prevent);
    return()=>document.removeEventListener('contextmenu',prevent);
  },[gameState.screen]);

  const handlePress=(key:keyof InputState)=>(e:React.TouchEvent|React.MouseEvent)=>{
    e.preventDefault(); audioManager.resume();
    if(inputRef.current) inputRef.current[key]=true;
  };
  const handleRelease=(key:keyof InputState)=>(e?:React.TouchEvent|React.MouseEvent)=>{
    if(e) e.preventDefault();
    if(inputRef.current) inputRef.current[key]=false;
  };

  const submitScore=async()=>{
    if(!playerName.trim()||submitted) return;
    try{
      await fetch('/api/leaderboard',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({name:playerName,score:gameState.score,level:gameState.level})});
      setSubmitted(true);
    }catch(e){console.error('submit failed',e);}
  };

  const fmt=(ms:number)=>{ const s=Math.floor(ms/1000); return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`; };

  if(gameState.screen==='MENU') return(
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 text-white z-50 overflow-y-auto p-6">
      <h1 className="text-4xl md:text-6xl text-orange-500 mb-5 font-bold tracking-tighter text-center"
          style={{textShadow:'4px 4px 0 #991b1b'}}>
        TOWER BLAZE<br/>
        <span className="text-blue-500" style={{textShadow:'4px 4px 0 #1e40af'}}>RESCUE</span>
      </h1>
      <div className="mb-5 w-full max-w-sm space-y-2 text-xs">
        <p className="text-gray-500 uppercase tracking-widest text-[10px] mb-2">Mechanics</p>
        <div className="flex gap-3 bg-cyan-900/30 border border-cyan-700/40 rounded-lg p-3 items-start">
          <Wind size={16} className="text-cyan-400 mt-0.5 shrink-0"/>
          <div>
            <p className="text-cyan-300 font-bold mb-0.5">Oxygen (cyan bar)</p>
            <p className="text-gray-400 leading-relaxed">Your SCBA tank drains near flames and smoke. Below 20% it starts damaging your health. Move to clear air to recharge. When it pulses red — get out immediately.</p>
          </div>
        </div>
        <div className="flex gap-3 bg-orange-900/30 border border-orange-700/40 rounded-lg p-3 items-start">
          <Flame size={16} className="text-orange-400 mt-0.5 shrink-0"/>
          <div>
            <p className="text-orange-300 font-bold mb-0.5">Burn stacking (orange bar)</p>
            <p className="text-gray-400 leading-relaxed">Standing in fire multiplies damage up to ×6. The longer you stay, the worse it gets. Back off — the stack fades after a few seconds clear.</p>
          </div>
        </div>
        <div className="flex gap-3 bg-green-900/30 border border-green-700/40 rounded-lg p-3 items-start">
          <User size={16} className="text-green-400 mt-0.5 shrink-0"/>
          <div>
            <p className="text-green-300 font-bold mb-0.5">Civilians</p>
            <p className="text-gray-400 leading-relaxed">Walk up to a HELP! civilian and press E. They follow you and avoid fire but can still burn. Escort them to the stairs for bonus points.</p>
          </div>
        </div>
        <p className="text-gray-600 text-[10px] text-center pt-1">
          WASD/Arrows · SPACE spray · E interact &nbsp;|&nbsp; {MAX_LEVELS} floors · no pause · no mercy
        </p>
      </div>
      <div className="flex flex-col md:flex-row gap-8 items-start justify-center w-full max-w-4xl">
        <div className="flex flex-col gap-3 w-64 shrink-0">
          <button onClick={onStart}
            className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 py-4 rounded border-b-4 border-green-800 text-xl active:translate-y-1 active:border-b-0 shadow-lg">
            <Play size={24}/> START MISSION
          </button>
        </div>
        <Leaderboard/>
      </div>
    </div>
  );

  if(gameState.screen==='FLOOR_INTRO') return <div className="absolute inset-0 z-50 pointer-events-none"/>;

  if(gameState.screen==='GAMEOVER'||gameState.screen==='VICTORY') return(
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/95 text-white z-50 overflow-y-auto p-8">
      <h2 className={`text-4xl mb-6 font-bold tracking-widest ${gameState.victory?'text-green-500':'text-red-500'}`}
          style={{textShadow:'2px 2px 0 #000'}}>
        {gameState.victory?'🚁 MISSION COMPLETE!':'💀 MISSION FAILED'}
      </h2>
      <div className="flex flex-col md:flex-row gap-8 items-start justify-center w-full max-w-4xl">
        <div className="flex flex-col items-center gap-6">
          <div className="bg-gray-800 p-6 rounded-lg border-2 border-gray-600 text-center w-80 shadow-2xl">
            {([['Score',gameState.score.toLocaleString(),'text-yellow-400'],
               ['Rescued',gameState.civiliansRescued,'text-green-400'],
               ['Floor',`${gameState.level}/${MAX_LEVELS}`,'text-blue-400'],
               ['Time',fmt(gameState.time),'text-gray-300']] as const)
              .map(([l,v,c],i,a)=>(
              <div key={l} className={`flex justify-between ${i<a.length-1?'mb-3 border-b border-gray-700 pb-3':''}`}>
                <span className="text-gray-400 uppercase text-xs tracking-wider mt-1">{l}</span>
                <span className={`text-2xl font-mono ${c}`}>{v}</span>
              </div>
            ))}
          </div>
          {!submitted?(
            <div className="bg-blue-900/30 p-4 rounded-xl border border-blue-500/30 w-80">
              <label className="block text-[10px] uppercase tracking-widest text-blue-400 mb-2">Submit to Leaderboard</label>
              <div className="flex gap-2">
                <input type="text" placeholder="ENTER NAME" maxLength={10} value={playerName}
                  onChange={e=>setPlayerName(e.target.value.toUpperCase())}
                  className="bg-black border border-white/20 rounded px-3 py-2 text-sm w-full focus:outline-none focus:border-blue-500 font-mono"/>
                <button onClick={submitScore} className="bg-blue-600 hover:bg-blue-500 p-2 rounded active:scale-95 transition-transform">
                  <Send size={20}/>
                </button>
              </div>
            </div>
          ):(
            <div className="text-green-400 text-sm font-bold animate-bounce">✓ SCORE SUBMITTED!</div>
          )}
          <div className="flex gap-4">
            <button onClick={onRetry} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 px-6 py-3 rounded border-b-4 border-blue-800 active:translate-y-1 active:border-b-0">
              <RotateCcw size={20}/> RETRY FLOOR
            </button>
            <button onClick={onMenu} className="flex items-center gap-2 bg-gray-600 hover:bg-gray-500 px-6 py-3 rounded border-b-4 border-gray-800 active:translate-y-1 active:border-b-0">
              <Menu size={20}/> MENU
            </button>
          </div>
        </div>
        <Leaderboard/>
      </div>
    </div>
  );

  // HUD
  const oPct=  (gameState.oxygen/OXYGEN_MAX)*100;
  const burnPct=Math.min(100,((gameState.burnStack-1)/5)*100);
  const hpPct= (gameState.health/PLAYER_MAX_HEALTH)*100;
  const hpCol= hpPct>60?'from-green-600 to-green-400':hpPct>30?'from-yellow-500 to-yellow-300':'from-red-700 to-red-400';
  const oCol=  oPct>50?'from-cyan-500 to-cyan-300':oPct>25?'from-yellow-500 to-yellow-300':'from-red-600 to-red-400';
  const oxyLow=oPct<25, oxyCrit=oPct<10;
  const following=gameState.civiliansFollowing, total=gameState.totalCivilians;

  return(
    <>
      <div className="absolute top-0 left-0 right-0 p-1 md:p-2 flex flex-col gap-1 pointer-events-none z-10 bg-gradient-to-b from-black/70 to-transparent">
        <div className="flex gap-1.5 w-full px-1 items-center">
          <div className="flex items-center gap-1 flex-1 min-w-0">
            <span className="text-red-400 text-[8px] font-bold uppercase shrink-0 hidden sm:block">HP</span>
            <div className="flex-1 h-2 bg-red-950/60 rounded-full overflow-hidden border border-red-900/40">
              <div className={`h-full bg-gradient-to-r ${hpCol} transition-all duration-200`} style={{width:`${hpPct}%`}}/>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-1 min-w-0">
            <Wind size={9} className={`shrink-0 ${oxyLow?'text-red-400 animate-pulse':'text-cyan-400'}`}/>
            <div className="flex-1 h-2 bg-cyan-950/60 rounded-full overflow-hidden border border-cyan-900/40">
              <div className={`h-full bg-gradient-to-r ${oCol} transition-all duration-100`} style={{width:`${oPct}%`}}/>
            </div>
            <span className="text-[8px] text-cyan-600 shrink-0 hidden sm:block">O₂</span>
          </div>
          <div className="flex items-center gap-1 flex-1 min-w-0">
            <Droplets size={9} className="text-blue-400 shrink-0"/>
            <div className="flex-1 h-2 bg-blue-950/60 rounded-full overflow-hidden border border-blue-900/40">
              <div className="h-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all duration-100"
                   style={{width:`${(gameState.ammo/PLAYER_MAX_AMMO)*100}%`}}/>
            </div>
          </div>
          {burnPct>5&&(
            <div className="flex items-center gap-1 w-14 shrink-0">
              <Flame size={9} className="text-orange-400 shrink-0 animate-pulse"/>
              <div className="flex-1 h-2 bg-orange-950/60 rounded-full overflow-hidden border border-orange-900/40">
                <div className="h-full bg-gradient-to-r from-orange-600 to-red-400 transition-all duration-100"
                     style={{width:`${burnPct}%`}}/>
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-between items-center px-2 text-[10px] md:text-xs font-bold">
          <div className="flex gap-2 items-center">
            <div className="text-yellow-500 bg-black/50 px-2 py-0.5 rounded border border-yellow-500/30">FL {gameState.level}/{MAX_LEVELS}</div>
            <div className="flex items-center gap-1 text-white bg-black/50 px-2 py-0.5 rounded border border-white/20 font-mono">
              <Clock size={10} className="text-gray-400"/> {fmt(gameState.time)}
            </div>
          </div>
          <div className="flex gap-2 items-center">
            <div className="flex items-center gap-1 text-yellow-400 bg-black/50 px-2 py-0.5 rounded border border-yellow-500/30 font-mono">
              <Trophy size={10}/> {gameState.score}
            </div>
            <div className={`flex items-center gap-1 bg-black/50 px-2 py-0.5 rounded border font-mono
              ${following>0?'text-green-300 border-green-400/50':'text-gray-600 border-gray-800/50'}`}>
              <User size={10}/> {following}/{total}
            </div>
          </div>
        </div>
        {oxyCrit&&<div className="text-center text-red-300 text-[9px] font-bold animate-pulse tracking-widest bg-red-900/40 mx-2 rounded py-0.5">⚠ OXYGEN CRITICAL — GET TO CLEAR AIR ⚠</div>}
        {!oxyCrit&&oxyLow&&<div className="text-center text-orange-400 text-[9px] font-bold animate-pulse tracking-widest">⚠ LOW OXYGEN ⚠</div>}
        {burnPct>60&&<div className="text-center text-orange-300 text-[9px] font-bold tracking-widest">🔥 BURNING — MOVE AWAY FROM FIRE</div>}
      </div>

      <div className="fixed bottom-0 left-0 right-0 flex justify-between items-end px-4 md:hidden z-50 pointer-events-auto"
           style={{paddingBottom:'calc(1.5rem + env(safe-area-inset-bottom,0px))',WebkitTouchCallout:'none' as any,userSelect:'none',touchAction:'none'}}>
        <div className="relative w-36 h-36 bg-gray-800/50 rounded-full border-2 border-gray-600/60 shadow-2xl backdrop-blur-sm"
             style={{touchAction:'none',WebkitTouchCallout:'none' as any}}>
          <div className="absolute inset-4 bg-gray-900/70 rounded-full pointer-events-none"/>
          {(['up','down','left','right'] as const).map(dir=>{
            const rot={up:'',down:'rotate-180',left:'-rotate-90',right:'rotate-90'}[dir];
            const pos={
              up:   'top-0 left-1/2 -translate-x-1/2 w-12 h-14 rounded-t-xl border-x-2 border-t-2',
              down: 'bottom-0 left-1/2 -translate-x-1/2 w-12 h-14 rounded-b-xl border-x-2 border-b-2',
              left: 'left-0 top-1/2 -translate-y-1/2 w-14 h-12 rounded-l-xl border-y-2 border-l-2',
              right:'right-0 top-1/2 -translate-y-1/2 w-14 h-12 rounded-r-xl border-y-2 border-r-2',
            }[dir];
            return(
              <button key={dir} style={{WebkitTouchCallout:'none' as any,touchAction:'none',userSelect:'none'}}
                className={`absolute ${pos} bg-gradient-to-b from-gray-600 to-gray-700 active:from-blue-600 active:to-blue-700 border-gray-500 shadow-lg flex items-center justify-center`}
                onTouchStart={handlePress(dir)} onTouchEnd={handleRelease(dir)} onTouchCancel={handleRelease(dir)}
                onMouseDown={handlePress(dir)} onMouseUp={handleRelease(dir)} onMouseLeave={handleRelease(dir)}>
                <ArrowBigUp className={`${rot} text-gray-300`} size={26}/>
              </button>
            );
          })}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-gray-800 border border-gray-600 pointer-events-none"/>
        </div>
        <div className="flex gap-5 mb-1" style={{touchAction:'none',WebkitTouchCallout:'none' as any}}>
          <button style={{WebkitTouchCallout:'none' as any,touchAction:'none',userSelect:'none'}}
            className="w-[4.5rem] h-[4.5rem] bg-green-600/90 rounded-full border-b-[5px] border-green-800 active:border-b-0 active:translate-y-1 flex items-center justify-center text-white font-bold shadow-xl backdrop-blur-sm"
            onTouchStart={handlePress('interact')} onTouchEnd={handleRelease('interact')} onTouchCancel={handleRelease('interact')}
            onMouseDown={handlePress('interact')} onMouseUp={handleRelease('interact')} onMouseLeave={handleRelease('interact')}>
            <div className="flex flex-col items-center leading-none">
              <span className="text-lg font-black">E</span>
              <span className="text-[9px] uppercase font-bold opacity-80 mt-0.5">Use</span>
            </div>
          </button>
          <button style={{WebkitTouchCallout:'none' as any,touchAction:'none',userSelect:'none'}}
            className="w-20 h-20 bg-blue-600/90 rounded-full border-b-[6px] border-blue-800 active:border-b-0 active:translate-y-1.5 flex items-center justify-center text-white shadow-xl backdrop-blur-sm"
            onTouchStart={handlePress('action')} onTouchEnd={handleRelease('action')} onTouchCancel={handleRelease('action')}
            onMouseDown={handlePress('action')} onMouseUp={handleRelease('action')} onMouseLeave={handleRelease('action')}>
            <div className="flex flex-col items-center leading-none">
              <Droplets size={32} strokeWidth={3}/>
              <span className="text-[9px] uppercase font-bold opacity-80 mt-0.5">Spray</span>
            </div>
          </button>
        </div>
      </div>
    </>
  );
};
