export type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

export interface Position {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export enum EntityType {
  PLAYER,
  WALL,
  FLOOR,
  STAIRS,
  HELIPAD,
  FIRE,
  CIVILIAN,
  EXTINGUISHER_FOAM,
  HELICOPTER,
  AMMO_PICKUP,
  HAZARD_COLLAPSING,
  HAZARD_ELECTRIC,
  HEALTH_PICKUP,
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

export enum FireType {
  STATIC,
  MOVING,
  MULTIPLYING
}

export interface Entity {
  id: string;
  type: EntityType;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  vx?: number;
  vy?: number;
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
  burnStack: number;  // civilians also accumulate burn damage
}

export interface Particle {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
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
  oxygen: number;           // new oxygen pressure mechanic
  burnStack: number;        // current burn multiplier
  burnCooldown: number;     // frames since last fire contact
  civiliansRescued: number;
  totalCivilians: number;
  gameOver: boolean;
  victory: boolean;
  gameWon: boolean;
  screen: 'MENU' | 'PLAYING' | 'FLOOR_INTRO' | 'PAUSED' | 'GAMEOVER' | 'VICTORY' | 'HELP' | 'SETTINGS';
  time: number;
  floorIntroTimer: number;  // countdown for floor intro screen (ms)
  nearFire: boolean;        // is player adjacent to fire this frame
  inSmoke: boolean;         // is player in smoke zone
}

export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  action: boolean;
  interact: boolean;
}
