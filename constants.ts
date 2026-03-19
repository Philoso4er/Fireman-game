
export const TILE_SIZE = 32;
export const MAP_WIDTH = 20; // in tiles
export const MAP_HEIGHT = 15; // in tiles
export const CANVAS_WIDTH = MAP_WIDTH * TILE_SIZE;
export const CANVAS_HEIGHT = MAP_HEIGHT * TILE_SIZE;

export const PLAYER_SPEED = 3;
export const PLAYER_SIZE = 24;
export const PLAYER_MAX_HEALTH = 100;
export const PLAYER_MAX_AMMO = 100;

export const FIRE_DAMAGE = 1;
export const FIRE_SPREAD_TIME = 300; // Frames
export const EXTINGUISHER_COST = 0.5;
export const AMMO_RECHARGE_RATE = 0.1;

export const COLORS = {
  WALL: '#4a4a4a',
  FLOOR: '#222222',
  FLOOR_GRID: '#2a2a2a',
  PLAYER: '#3b82f6', // Blue
  PLAYER_HELMET: '#eab308', // Yellow
  FIRE_CORE: '#ef4444',
  FIRE_OUTER: '#f97316',
  CIVILIAN: '#22c55e', // Green
  CIVILIAN_HURT: '#84cc16',
  FOAM: '#e0f2fe',
  STAIRS: '#a855f7',
  HELIPAD: '#fcd34d',
  UI_BG: 'rgba(0, 0, 0, 0.85)',
};

export const MAX_LEVELS = 10;
