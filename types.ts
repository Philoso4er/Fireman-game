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
  HAZARD_ELECTRIC
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
  hp: number; // Fire intensity
  spreadTimer?: number;
  moveDirection?: Direction;
  moveTimer?: number;
}

export interface CivilianEntity extends Entity {
  type: EntityType.CIVILIAN;
  state: 'WAITING' | 'FOLLOWING' | 'SAVED' | 'DEAD';
  hp: number;
}

export interface Particle {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

export interface GameState {
  score: number;
  level: number;
  health: number;
  ammo: number;
  civiliansRescued: number;
  totalCivilians: number;
  gameOver: boolean;
  victory: boolean;
  gameWon: boolean; // Beat all levels
  screen: 'MENU' | 'PLAYING' | 'PAUSED' | 'GAMEOVER' | 'VICTORY' | 'HELP' | 'SETTINGS';
  time: number;
}

export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  action: boolean; // Extinguisher
  interact: boolean; // Rescue/Stairs
}