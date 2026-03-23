import React, { useState, useEffect, useRef } from 'react';
import { GameLoop } from './components/GameLoop';
import { UIOverlay } from './components/UIOverlay';
import { GameState, InputState } from './types';
import { PLAYER_MAX_AMMO, PLAYER_MAX_HEALTH, OXYGEN_MAX } from './constants';
import { audioManager } from './utils/audio';

const INITIAL_STATE: GameState = {
  score: 0,
  level: 1,
  health: PLAYER_MAX_HEALTH,
  ammo: PLAYER_MAX_AMMO,
  oxygen: OXYGEN_MAX,
  burnStack: 1,
  burnCooldown: 0,
  civiliansRescued: 0,
  civiliansFollowing: 0,
  totalCivilians: 0,
  gameOver: false,
  victory: false,
  gameWon: false,
  screen: 'MENU',
  time: 0,
  floorIntroTimer: 2200,
  nearFire: false,
  inSmoke: false,
};

const INITIAL_INPUT: InputState = {
  up: false, down: false,
  left: false, right: false,
  action: false, interact: false,
};

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(INITIAL_STATE);
  const inputRef = useRef<InputState>({ ...INITIAL_INPUT });

  // ── Keyboard + global reset ──────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'w' || k === 'arrowup')    inputRef.current.up = true;
      if (k === 's' || k === 'arrowdown')  inputRef.current.down = true;
      if (k === 'a' || k === 'arrowleft')  inputRef.current.left = true;
      if (k === 'd' || k === 'arrowright') inputRef.current.right = true;
      if (k === ' ' || k === 'space') { e.preventDefault(); inputRef.current.action = true; }
      if (k === 'e') inputRef.current.interact = true;
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'w' || k === 'arrowup')    inputRef.current.up = false;
      if (k === 's' || k === 'arrowdown')  inputRef.current.down = false;
      if (k === 'a' || k === 'arrowleft')  inputRef.current.left = false;
      if (k === 'd' || k === 'arrowright') inputRef.current.right = false;
      if (k === ' ' || k === 'space') inputRef.current.action = false;
      if (k === 'e') inputRef.current.interact = false;
    };

    const resetAll = () => {
      Object.keys(inputRef.current).forEach(k => {
        (inputRef.current as any)[k] = false;
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', resetAll);
    window.addEventListener('visibilitychange', resetAll);
    window.addEventListener('pointercancel', resetAll);
    // Safety sweep: every 2 s, if no key is physically pressed, clear state.
    // Prevents ghost movement after OS interrupts on mobile.
    const sweep = setInterval(resetAll, 2000);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', resetAll);
      window.removeEventListener('visibilitychange', resetAll);
      window.removeEventListener('pointercancel', resetAll);
      clearInterval(sweep);
    };
  }, []);

  const startGame = () => {
    audioManager.resume();
    setGameState({
      ...INITIAL_STATE,
      screen: 'FLOOR_INTRO',
      floorIntroTimer: 2200,
    });
  };

  // ── RETRY: replay the SAME floor the player just failed/completed ─────────
  // We preserve level + cumulative score/rescued, but reset per-floor stats.
  // BUG FIX: previous code used `screen:'PLAYING'` which skipped floor intro
  // AND didn't correctly reset the level if the player had already advanced.
  const retryLevel = () => {
    // Find which level they were actually on — if they lost mid-game use that
    // level, if they won the final floor restart the whole game.
    const targetLevel = gameState.gameWon ? 1 : gameState.level;
    setGameState(prev => ({
      ...INITIAL_STATE,
      // Keep cumulative score and rescued count only if retrying mid-run (not won)
      score: gameState.gameWon ? 0 : prev.score,
      civiliansRescued: gameState.gameWon ? 0 : prev.civiliansRescued,
      level: targetLevel,
      screen: 'FLOOR_INTRO',
      floorIntroTimer: 2200,
    }));
  };

  const returnToMenu = () => {
    setGameState({ ...INITIAL_STATE });
  };

  return (
    <div
      className="flex flex-col items-center justify-center h-[100dvh] bg-gray-900 text-white overflow-hidden select-none"
      style={{ touchAction: 'none' }}
    >
      <div className="relative w-full h-full md:h-auto md:max-w-4xl md:aspect-[4/3] flex items-center justify-center bg-black">
        <GameLoop
          gameState={gameState}
          setGameState={setGameState}
          input={inputRef}
        />
        <UIOverlay
          gameState={gameState}
          onStart={startGame}
          onRetry={retryLevel}
          onMenu={returnToMenu}
          inputRef={inputRef}
        />
      </div>
      <div className="mt-4 text-gray-500 text-xs text-center hidden md:block">
        Tower Blaze Rescue &copy; {new Date().getFullYear()} — Retro Firefighter Arcade
      </div>
    </div>
  );
};

export default App;
