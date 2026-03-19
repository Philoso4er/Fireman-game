export const TILE_SIZE = 32;
export const MAP_WIDTH = 20;
export const MAP_HEIGHT = 15;
export const CANVAS_WIDTH = MAP_WIDTH * TILE_SIZE;
export const CANVAS_HEIGHT = MAP_HEIGHT * TILE_SIZE;

export const PLAYER_SPEED = 3;
export const PLAYER_SIZE = 24;
export const PLAYER_MAX_HEALTH = 100;
export const PLAYER_MAX_AMMO = 100;

// Burn stacking: damage increases the longer you stay in fire
export const FIRE_BASE_DAMAGE = 0.08;       // per frame while touching fire
export const FIRE_BURN_STACK_RATE = 0.003;  // burn multiplier grows this much per frame
export const FIRE_BURN_MAX_MULTIPLIER = 6;  // cap at 6x base damage
export const FIRE_BURN_COOLDOWN = 120;      // frames before burn stack resets after leaving fire

export const FIRE_SPREAD_TIME = 280;
export const EXTINGUISHER_COST = 0.5;
export const AMMO_RECHARGE_RATE = 0.12;

// Oxygen tank (pressure mechanic) — depletes near fire, recharges away from it
export const OXYGEN_MAX = 100;
export const OXYGEN_DRAIN_NEAR_FIRE = 0.18; // per frame when adjacent to fire tile
export const OXYGEN_DRAIN_IN_SMOKE = 0.08;  // per frame in smoke
export const OXYGEN_RECHARGE_RATE = 0.25;   // per frame when clear
export const OXYGEN_DAMAGE_THRESHOLD = 20;  // below this, health starts draining
export const OXYGEN_LOW_DAMAGE = 0.05;      // health drain per frame when oxygen critical

export const COLORS = {
  WALL: '#4a4a4a',
  FLOOR: '#222222',
  FLOOR_GRID: '#2a2a2a',
  PLAYER: '#3b82f6',
  PLAYER_HELMET: '#eab308',
  FIRE_CORE: '#ef4444',
  FIRE_OUTER: '#f97316',
  CIVILIAN: '#22c55e',
  CIVILIAN_HURT: '#84cc16',
  FOAM: '#e0f2fe',
  STAIRS: '#a855f7',
  HELIPAD: '#fcd34d',
  UI_BG: 'rgba(0, 0, 0, 0.85)',
};

export const MAX_LEVELS = 5; // Tighter, more intense 5 levels
