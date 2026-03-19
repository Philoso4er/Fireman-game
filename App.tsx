import React, { useState, useEffect, useRef } from 'react';
import { GameLoop } from './components/GameLoop';
import { UIOverlay } from './components/UIOverlay';
import { GameState, InputState } from './types';
import { PLAYER_MAX_AMMO, PLAYER_MAX_HEALTH } from './constants';
import { audioManager } from './utils/audio';

const INITIAL_STATE: GameState = {
  score: 0,
  level: 1,
  health: PLAYER_MAX_HEALTH,
  ammo: PLAYER_MAX_AMMO,
  civiliansRescued: 0,
  totalCivilians: 0,
  gameOver: false,
  victory: false,
  gameWon: false,
  screen: 'MENU',
  time: 0,
};

const INITIAL_INPUT: InputState = {
  up: false,
  down: false,
  left: false,
  right: false,
  action: false,
  interact: false,
};

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(INITIAL_STATE);
  const inputRef = useRef<InputState>(INITIAL_INPUT);

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

    // Release everything if focus leaves the window
    const resetInputs = () => {
      (Object.keys(inputRef.current) as Array<keyof InputState>).forEach(k => {
        inputRef.current[k] = false;
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', resetInputs);
    window.addEventListener('visibilitychange', resetInputs);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', resetInputs);
      window.removeEventListener('visibilitychange', resetInputs);
    };
  }, []);

  const startGame = () => {
    audioManager.toggleMute(false);
    setGameState({ ...INITIAL_STATE, screen: 'PLAYING' });
  };

  const restartLevel = () => {
    setGameState(prev => ({
      ...prev,
      health: PLAYER_MAX_HEALTH,
      ammo: PLAYER_MAX_AMMO,
      gameOver: false,
      victory: false,
      screen: 'PLAYING',
    }));
  };

  const returnToMenu = () => setGameState(INITIAL_STATE);

  return (
    /*
      Root wrapper:
        - `h-[100dvh]`   — dynamic viewport height, respects mobile browser chrome
        - `overflow-hidden` — nothing bleeds outside the screen
        - `touch-action: none` (inline) — tells the browser this element handles
          all touches itself; prevents the momentum-scroll / zoom / callout
          that was causing the long-press menu and control cutoff.
        - `select-none`  — belt-and-suspenders against text selection on long press
    */
    <div
      className="flex flex-col items-center justify-center h-[100dvh] bg-gray-900 text-white overflow-hidden select-none"
      style={{ touchAction: 'none' }}
    >
      {/*
        Game canvas wrapper:
          - On mobile:  full width + full dvh height, no aspect ratio constraint,
            so the canvas fills the screen and the fixed-position controls always
            land on the physical screen — not off the bottom of a clipped box.
          - On desktop: constrained to 4:3 max-width so it doesn't stretch ugly
            on wide monitors.
      */}
      <div className="relative w-full h-full md:h-auto md:max-w-4xl md:aspect-[4/3] flex items-center justify-center bg-black">
        <GameLoop
          gameState={gameState}
          setGameState={setGameState}
          input={inputRef}
        />
        <UIOverlay
          gameState={gameState}
          onStart={startGame}
          onRetry={restartLevel}
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
