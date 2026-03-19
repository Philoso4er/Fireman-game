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
  time: 0
};

const INITIAL_INPUT: InputState = {
  up: false,
  down: false,
  left: false,
  right: false,
  action: false,
  interact: false
};

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(INITIAL_STATE);
  const inputRef = useRef<InputState>(INITIAL_INPUT);

  // Keyboard Listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'w' || k === 'arrowup') inputRef.current.up = true;
      if (k === 's' || k === 'arrowdown') inputRef.current.down = true;
      if (k === 'a' || k === 'arrowleft') inputRef.current.left = true;
      if (k === 'd' || k === 'arrowright') inputRef.current.right = true;
      if (k === ' ' || k === 'space') inputRef.current.action = true;
      if (k === 'e') inputRef.current.interact = true;
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'w' || k === 'arrowup') inputRef.current.up = false;
      if (k === 's' || k === 'arrowdown') inputRef.current.down = false;
      if (k === 'a' || k === 'arrowleft') inputRef.current.left = false;
      if (k === 'd' || k === 'arrowright') inputRef.current.right = false;
      if (k === ' ' || k === 'space') inputRef.current.action = false;
      if (k === 'e') inputRef.current.interact = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const startGame = () => {
    // Resume audio context if it was suspended
    audioManager.toggleMute(false);
    setGameState({
      ...INITIAL_STATE,
      screen: 'PLAYING'
    });
  };

  const restartLevel = () => {
    setGameState(prev => ({
      ...prev,
      health: PLAYER_MAX_HEALTH,
      ammo: PLAYER_MAX_AMMO,
      gameOver: false,
      victory: false,
      screen: 'PLAYING'
    }));
  };

  const returnToMenu = () => {
    setGameState(INITIAL_STATE);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[100dvh] bg-gray-900 text-white md:p-4 select-none overflow-hidden touch-none">
      {/* Container: Full screen on mobile, constrained aspect ratio on desktop */}
      <div className="w-full h-[100dvh] md:h-auto md:max-w-4xl relative md:aspect-[4/3] flex items-center justify-center bg-black">
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
        Tower Blaze Rescue &copy; {new Date().getFullYear()} - Retro Firefighter Arcade
      </div>
    </div>
  );
};

export default App;