export type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

export interface Position { x: number; y: number; }
export interface Size { width: number; height: number; }

export enum EntityType {
  PLAYER, WALL, FLOOR, STAIRS, HELIPAD, FIRE, CIVILIAN,
  EXTINGUISHER_FOAM, HELICOPTER, AMMO_PICKUP,
  HAZARD_COLLAPSING, HAZARD_ELECTRIC, HEALTH_PICKUP,
}

export interface HazardEntity extends Entity {
  state: 'NORMAL' | 'CRACKING' | 'COLLAPSED' | 'INACTIVE' | 'ACTIVE';
  timer: number;
}

export interface LeaderboardEntry {
  name: string;
  score: number;
  level: number;
}

export enum FireType { STATIC, MOVING, MULTIPLYING }

export interface Entity {
  id: string;
  type: EntityType;
  x: number; y: number;
  width: number; height: number;
  color: string;
  vx?: number; vy?: number;
}

export interface FireEntity extends Entity {
  type: EntityType.FIRE;
  fireType: FireType;
  hp: number;
  spreadTimer?: number;
  moveDirection?: Direction;
  moveTimer?: number;
}

export interface CivilianEntity extends Entity {
  type: EntityType.CIVILIAN;
  state: 'WAITING' | 'FOLLOWING' | 'SAVED' | 'DEAD';
  hp: number;
  burnStack: number;
}

export interface Particle {
  id: string;
  x: number; y: number;
  vx: number; vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export interface GameState {
  score: number;
  level: number;
  health: number;
  ammo: number;
  oxygen: number;
  burnStack: number;
  burnCooldown: number;
  civiliansRescued: number;    // total saved across all completed floors
  civiliansFollowing: number;  // LIVE count following player THIS floor — drives HUD
  totalCivilians: number;      // total spawned on current floor
  gameOver: boolean;
  victory: boolean;
  gameWon: boolean;
  screen: 'MENU' | 'PLAYING' | 'FLOOR_INTRO' | 'PAUSED' | 'GAMEOVER' | 'VICTORY' | 'HELP' | 'SETTINGS';
  time: number;
  floorIntroTimer: number;
  nearFire: boolean;
  inSmoke: boolean;
}

export interface InputState {
  up: boolean; down: boolean;
  left: boolean; right: boolean;
  action: boolean; interact: boolean;
}
