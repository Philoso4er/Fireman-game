import React, { useRef, useEffect, useCallback } from 'react';
import {
  GameState, InputState, Entity, EntityType, FireEntity, FireType,
  CivilianEntity, Particle, Position, Direction, HazardEntity
} from '../types';
import {
  TILE_SIZE, MAP_WIDTH, MAP_HEIGHT, CANVAS_WIDTH, CANVAS_HEIGHT,
  PLAYER_SPEED, PLAYER_SIZE, COLORS, FIRE_SPREAD_TIME,
  FIRE_BASE_DAMAGE, FIRE_BURN_STACK_RATE, FIRE_BURN_MAX_MULTIPLIER, FIRE_BURN_COOLDOWN,
  PLAYER_MAX_HEALTH, PLAYER_MAX_AMMO, EXTINGUISHER_COST, AMMO_RECHARGE_RATE,
  MAX_LEVELS, OXYGEN_MAX, OXYGEN_DRAIN_NEAR_FIRE, OXYGEN_DRAIN_IN_SMOKE,
  OXYGEN_RECHARGE_RATE, OXYGEN_DAMAGE_THRESHOLD, OXYGEN_LOW_DAMAGE,
} from '../constants';
import { audioManager } from '../utils/audio';

interface GameLoopProps {
  gameState: GameState;
  setGameState: React.Dispatch<React.SetStateAction<GameState>>;
  input: React.MutableRefObject<InputState>;
}

export const GameLoop: React.FC<GameLoopProps> = ({ gameState, setGameState, input }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>();
  const lastTimeRef = useRef<number>(0);

  const entitiesRef = useRef<Entity[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const smokeRef = useRef<Particle[]>([]);
  const sparksRef = useRef<Particle[]>([]);
  const scorchMarksRef = useRef<Position[]>([]);
  const playerRef = useRef<Entity | null>(null);
  const mapRef = useRef<number[][]>([]);
  const stateRef = useRef(gameState);
  const playerFacingRef = useRef<Direction>('DOWN');
  const screenShakeRef = useRef(0);

  // Floor intro countdown (ms)
  const floorIntroTimerRef = useRef(0);

  // Burn state lives in a ref so the game loop can read/write it without
  // triggering React re-renders every frame
  const burnStackRef = useRef(1);
  const burnCooldownRef = useRef(0);
  const oxygenRef = useRef(OXYGEN_MAX);

  useEffect(() => { stateRef.current = gameState; }, [gameState]);

  // ─── COLLISION HELPERS ───────────────────────────────────────────────────────

  const checkCollision = (
    rect1: { x: number; y: number; width: number; height: number },
    rect2: { x: number; y: number; width: number; height: number }
  ) => (
    rect1.x < rect2.x + rect2.width &&
    rect1.x + rect1.width > rect2.x &&
    rect1.y < rect2.y + rect2.height &&
    rect1.y + rect1.height > rect2.y
  );

  const isWall = (x: number, y: number) => {
    const tileX = Math.floor(x / TILE_SIZE);
    const tileY = Math.floor(y / TILE_SIZE);
    if (tileX < 0 || tileX >= MAP_WIDTH || tileY < 0 || tileY >= MAP_HEIGHT) return true;
    return mapRef.current[tileY]?.[tileX] === 1;
  };

  const resolveWallCollision = (entity: Entity, nextX: number, nextY: number) => {
    const pad = 6;
    return !(
      isWall(nextX + pad, nextY + pad) ||
      isWall(nextX + entity.width - pad, nextY + pad) ||
      isWall(nextX + pad, nextY + entity.height - pad) ||
      isWall(nextX + entity.width - pad, nextY + entity.height - pad)
    );
  };

  // ─── FLOOD FILL — connectivity check ────────────────────────────────────────
  // Returns the set of all floor tile coords reachable from (startTX, startTY)
  const floodFill = (map: number[][], startTX: number, startTY: number): Set<string> => {
    const visited = new Set<string>();
    const queue: [number, number][] = [[startTX, startTY]];
    while (queue.length > 0) {
      const [cx, cy] = queue.shift()!;
      const key = `${cx},${cy}`;
      if (visited.has(key)) continue;
      if (cx < 0 || cx >= MAP_WIDTH || cy < 0 || cy >= MAP_HEIGHT) continue;
      if (map[cy][cx] === 1) continue;
      visited.add(key);
      queue.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
    return visited;
  };

  // ─── LEVEL GENERATION ────────────────────────────────────────────────────────
  const generateLevel = useCallback((level: number) => {
    smokeRef.current = [];
    particlesRef.current = [];
    sparksRef.current = [];
    scorchMarksRef.current = [];
    playerFacingRef.current = 'DOWN';
    screenShakeRef.current = 0;
    burnStackRef.current = 1;
    burnCooldownRef.current = 0;
    oxygenRef.current = OXYGEN_MAX;

    // Player always starts bottom-centre
    const spawnTX = Math.floor(MAP_WIDTH / 2);
    const spawnTY = MAP_HEIGHT - 3;

    let map: number[][];
    let reachable: Set<string>;

    // Keep regenerating until the map is well-connected (at least 60% of
    // interior floor tiles are reachable from spawn).
    let attempts = 0;
    do {
      attempts++;
      map = [];
      for (let y = 0; y < MAP_HEIGHT; y++) {
        const row: number[] = [];
        for (let x = 0; x < MAP_WIDTH; x++) {
          if (x === 0 || x === MAP_WIDTH - 1 || y === 0 || y === MAP_HEIGHT - 1) {
            row.push(1); // border walls
          } else {
            row.push(Math.random() < 0.1 + level * 0.018 ? 1 : 0);
          }
        }
        map.push(row);
      }

      // Clear spawn area
      for (let dy = -2; dy <= 1; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const tx = spawnTX + dx;
          const ty = spawnTY + dy;
          if (tx > 0 && tx < MAP_WIDTH - 1 && ty > 0 && ty < MAP_HEIGHT - 1) {
            map[ty][tx] = 0;
          }
        }
      }

      // Clear top area for exit
      for (let dy = 1; dy <= 3; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const tx = Math.floor(MAP_WIDTH / 2) + dx;
          if (tx > 0 && tx < MAP_WIDTH - 1) map[dy][tx] = 0;
        }
      }

      reachable = floodFill(map, spawnTX, spawnTY);

      const totalFloor = map.flat().filter(t => t === 0).length;
      const connectivity = reachable.size / totalFloor;

      if (connectivity >= 0.6) break;
    } while (attempts < 20);

    mapRef.current = map;

    const entities: Entity[] = [];

    // ── Player
    const startX = spawnTX * TILE_SIZE;
    const startY = spawnTY * TILE_SIZE;
    const player: Entity = {
      id: 'player',
      type: EntityType.PLAYER,
      x: startX,
      y: startY,
      width: PLAYER_SIZE,
      height: PLAYER_SIZE,
      color: COLORS.PLAYER,
    };
    playerRef.current = player;
    entities.push(player);

    // ── Exit (stairs or helipad on last level)
    const isLastLevel = level === MAX_LEVELS;
    const exitType = isLastLevel ? EntityType.HELIPAD : EntityType.STAIRS;
    const exitTX = Math.floor(MAP_WIDTH / 2);
    const exitTY = 2;
    map[exitTY][exitTX] = 0;

    entities.push({
      id: 'exit',
      type: exitType,
      x: exitTX * TILE_SIZE,
      y: exitTY * TILE_SIZE,
      width: TILE_SIZE,
      height: TILE_SIZE,
      color: '#fff',
    });

    if (isLastLevel) {
      entities.push({
        id: 'helicopter',
        type: EntityType.HELICOPTER,
        x: exitTX * TILE_SIZE - 16,
        y: exitTY * TILE_SIZE - 16,
        width: 64,
        height: 64,
        color: '#fff',
      });
    }

    // Helper: find a random reachable tile away from spawn
    const randomReachableTile = (minDistTiles = 3): { tx: number; ty: number } | null => {
      const candidates = Array.from(reachable)
        .map(k => { const [x, y] = k.split(',').map(Number); return { tx: x, ty: y }; })
        .filter(({ tx, ty }) =>
          Math.abs(tx - spawnTX) + Math.abs(ty - spawnTY) >= minDistTiles &&
          ty !== exitTY // don't spawn on exit row
        );
      if (candidates.length === 0) return null;
      return candidates[Math.floor(Math.random() * candidates.length)];
    };

    // ── Fire
    const fireCount = 3 + level * 2;
    for (let i = 0; i < fireCount; i++) {
      const tile = randomReachableTile(4);
      if (!tile) continue;

      const fTypeRaw = Math.random();
      let fType = FireType.STATIC;
      if (level >= 2 && fTypeRaw > 0.55) fType = FireType.MOVING;
      if (level >= 3 && fTypeRaw > 0.75) fType = FireType.MULTIPLYING;

      const fire: FireEntity = {
        id: `fire-${i}`,
        type: EntityType.FIRE,
        fireType: fType,
        x: tile.tx * TILE_SIZE,
        y: tile.ty * TILE_SIZE,
        width: TILE_SIZE,
        height: TILE_SIZE,
        color: COLORS.FIRE_CORE,
        hp: 80 + Math.random() * 40,
        spreadTimer: FIRE_SPREAD_TIME,
        moveDirection: Math.random() > 0.5 ? 'LEFT' : 'RIGHT',
        moveTimer: 0,
      };
      entities.push(fire);
    }

    // ── Civilians — always placed on reachable tiles
    const civCount = 1 + Math.floor(level * 0.8);
    for (let i = 0; i < civCount; i++) {
      const tile = randomReachableTile(3);
      if (!tile) continue;

      const civ: CivilianEntity = {
        id: `civ-${i}`,
        type: EntityType.CIVILIAN,
        state: 'WAITING',
        x: tile.tx * TILE_SIZE + 8,
        y: tile.ty * TILE_SIZE + 8,
        width: 16,
        height: 16,
        color: COLORS.CIVILIAN,
        hp: 100,
        burnStack: 1,
      };
      entities.push(civ);
    }

    // ── Ammo pickups
    const ammoCount = 2 + Math.floor(level / 2);
    for (let i = 0; i < ammoCount; i++) {
      const tile = randomReachableTile(2);
      if (!tile) continue;
      entities.push({
        id: `ammo-${i}`,
        type: EntityType.AMMO_PICKUP,
        x: tile.tx * TILE_SIZE + 8,
        y: tile.ty * TILE_SIZE + 8,
        width: 16,
        height: 16,
        color: '#3b82f6',
      });
    }

    // ── Health pickups (new)
    const healthCount = 1 + Math.floor(level / 2);
    for (let i = 0; i < healthCount; i++) {
      const tile = randomReachableTile(2);
      if (!tile) continue;
      entities.push({
        id: `health-${i}`,
        type: EntityType.HEALTH_PICKUP,
        x: tile.tx * TILE_SIZE + 8,
        y: tile.ty * TILE_SIZE + 8,
        width: 16,
        height: 16,
        color: '#22c55e',
      });
    }

    // ── Hazards
    const hazardCount = 1 + Math.floor(level / 2);
    for (let i = 0; i < hazardCount; i++) {
      const tile = randomReachableTile(3);
      if (!tile) continue;
      const isElectric = Math.random() > 0.5;
      entities.push({
        id: `hazard-${i}`,
        type: isElectric ? EntityType.HAZARD_ELECTRIC : EntityType.HAZARD_COLLAPSING,
        x: tile.tx * TILE_SIZE,
        y: tile.ty * TILE_SIZE,
        width: TILE_SIZE,
        height: TILE_SIZE,
        color: isElectric ? '#fde047' : '#78350f',
        state: isElectric ? 'INACTIVE' : 'NORMAL',
        timer: isElectric ? 2000 : 0,
      } as HazardEntity);
    }

    entitiesRef.current = entities;

    setGameState(prev => ({
      ...prev,
      totalCivilians: civCount,
      civiliansRescued: 0,
      gameOver: false,
      victory: false,
      oxygen: OXYGEN_MAX,
      burnStack: 1,
      burnCooldown: 0,
      nearFire: false,
      inSmoke: false,
      time: 0,
    }));
  }, [setGameState]);

  useEffect(() => {
    if (gameState.screen === 'PLAYING') {
      generateLevel(gameState.level);
    }
  }, [gameState.screen, gameState.level, generateLevel]);

  // Kick off floor intro timer when entering FLOOR_INTRO
  useEffect(() => {
    if (gameState.screen === 'FLOOR_INTRO') {
      floorIntroTimerRef.current = gameState.floorIntroTimer;
    }
  }, [gameState.screen, gameState.floorIntroTimer]);

  // ─── CIVILIAN FIRE AVOIDANCE ─────────────────────────────────────────────────
  // Simple: probe the candidate move tile — if it overlaps a fire entity, try
  // two perpendicular alternatives before giving up.
  const civilianAvoidsFire = (
    civ: CivilianEntity,
    dx: number,
    dy: number
  ): { cx: number; cy: number } => {
    const speed = PLAYER_SPEED - 0.6;
    const fires = entitiesRef.current.filter(e => e.type === EntityType.FIRE);

    const wouldHitFire = (nx: number, ny: number) =>
      fires.some(f =>
        checkCollision(
          { x: nx, y: ny, width: civ.width, height: civ.height },
          { x: f.x + 4, y: f.y + 4, width: f.width - 8, height: f.height - 8 }
        )
      );

    const tryMove = (ndx: number, ndy: number) => {
      const nx = civ.x + ndx;
      const ny = civ.y + ndy;
      if (!wouldHitFire(nx, ny) && resolveWallCollision(civ, nx, civ.y) && resolveWallCollision(civ, civ.x, ny)) {
        return { cx: nx, cy: ny };
      }
      return null;
    };

    // Primary direction
    const primary = tryMove(dx * speed, dy * speed);
    if (primary) return primary;

    // Perpendicular alternatives
    const perp1 = tryMove(dy * speed, dx * speed);   // rotate 90°
    if (perp1) return perp1;
    const perp2 = tryMove(-dy * speed, -dx * speed); // rotate -90°
    if (perp2) return perp2;

    // Blocked — stay put
    return { cx: civ.x, cy: civ.y };
  };

  // ─── UPDATE ──────────────────────────────────────────────────────────────────
  const update = (dt: number) => {
    const screen = stateRef.current.screen;

    // Floor intro countdown
    if (screen === 'FLOOR_INTRO') {
      floorIntroTimerRef.current -= dt;
      if (floorIntroTimerRef.current <= 0) {
        setGameState(prev => ({ ...prev, screen: 'PLAYING' }));
      }
      return;
    }

    if (screen !== 'PLAYING') return;
    if (stateRef.current.gameOver || stateRef.current.victory) return;

    setGameState(prev => ({ ...prev, time: prev.time + dt }));

    const player = playerRef.current;
    if (!player) return;
    const inp = input.current;

    // ── Player movement
    let nextX = player.x;
    let nextY = player.y;
    let moved = false;
    let dirX = 0;
    let dirY = 0;

    if (inp.up) { nextY -= PLAYER_SPEED; moved = true; dirY = -1; }
    if (inp.down) { nextY += PLAYER_SPEED; moved = true; dirY = 1; }
    if (inp.left) { nextX -= PLAYER_SPEED; moved = true; dirX = -1; }
    if (inp.right) { nextX += PLAYER_SPEED; moved = true; dirX = 1; }

    if (moved) {
      player.vx = dirX;
      player.vy = dirY;
      if (dirY < 0) playerFacingRef.current = 'UP';
      else if (dirY > 0) playerFacingRef.current = 'DOWN';
      else if (dirX < 0) playerFacingRef.current = 'LEFT';
      else if (dirX > 0) playerFacingRef.current = 'RIGHT';
    } else {
      player.vx = 0;
      player.vy = 0;
    }

    if (resolveWallCollision(player, nextX, player.y)) player.x = nextX;
    if (resolveWallCollision(player, player.x, nextY)) player.y = nextY;

    // ── Extinguisher
    if (inp.action && stateRef.current.ammo > 0) {
      let angle = 0;
      if (moved) {
        angle = Math.atan2(dirY, dirX);
      } else {
        switch (playerFacingRef.current) {
          case 'UP':    angle = -Math.PI / 2; break;
          case 'DOWN':  angle =  Math.PI / 2; break;
          case 'LEFT':  angle =  Math.PI;     break;
          case 'RIGHT': angle =  0;           break;
        }
      }
      const spread = (Math.random() - 0.5) * 0.55;
      const speed = 7;
      particlesRef.current.push({
        id: Math.random().toString(),
        x: player.x + player.width / 2 + Math.cos(angle) * 10,
        y: player.y + player.height / 2 + Math.sin(angle) * 10,
        vx: Math.cos(angle + spread) * speed,
        vy: Math.sin(angle + spread) * speed,
        life: 28,
        maxLife: 28,
        color: COLORS.FOAM,
        size: 3 + Math.random() * 4,
      });
      if (Math.random() > 0.8) audioManager.playShoot();
      setGameState(prev => ({ ...prev, ammo: Math.max(0, prev.ammo - EXTINGUISHER_COST) }));
    } else if (!inp.action && stateRef.current.ammo < PLAYER_MAX_AMMO) {
      setGameState(prev => ({ ...prev, ammo: Math.min(PLAYER_MAX_AMMO, prev.ammo + AMMO_RECHARGE_RATE) }));
    }

    // ── Update foam particles
    particlesRef.current.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      p.life--;
      p.size *= 0.95;
    });
    particlesRef.current = particlesRef.current.filter(p => p.life > 0);

    // ── Update smoke
    smokeRef.current.forEach(p => {
      p.y -= 0.45;
      p.x += Math.sin(p.life * 0.1) * 0.2;
      p.life--;
      p.size += 0.12;
    });
    smokeRef.current = smokeRef.current.filter(p => p.life > 0);

    // ── Update sparks
    sparksRef.current.forEach(p => { p.y -= 1.1; p.x += Math.sin(p.life * 0.5) * 0.5; p.life--; });
    sparksRef.current = sparksRef.current.filter(p => p.life > 0);

    // ── Entity logic
    const entities = entitiesRef.current;
    let playerTouchingFire = false;
    let playerNearFire = false;
    let playerInSmoke = false;

    for (let i = entities.length - 1; i >= 0; i--) {
      const ent = entities[i];

      // ── FIRE ───────────────────────────────────────────────────────────────
      if (ent.type === EntityType.FIRE) {
        const fire = ent as FireEntity;

        // Sound
        if (Math.random() < 0.005) {
          fire.hp > 120 ? audioManager.playBigFireCrackle() : audioManager.playFireCrackling();
        }

        // Smoke
        if (Math.random() < 0.1) {
          smokeRef.current.push({
            id: Math.random().toString(),
            x: fire.x + Math.random() * TILE_SIZE,
            y: fire.y,
            vx: 0, vy: -1,
            life: 110 + Math.random() * 50,
            maxLife: 160,
            color: 'rgba(80,80,80,0.35)',
            size: 3 + Math.random() * 5,
          });
        }

        // Sparks
        if (Math.random() < 0.06) {
          sparksRef.current.push({
            id: Math.random().toString(),
            x: fire.x + Math.random() * TILE_SIZE,
            y: fire.y + Math.random() * TILE_SIZE,
            vx: 0, vy: -1,
            life: 30 + Math.random() * 20,
            maxLife: 50,
            color: '#fca5a5',
            size: 1,
          });
        }

        // Moving fire
        if (fire.fireType === FireType.MOVING) {
          const speed = 1.2 + stateRef.current.level * 0.1;
          let fx = fire.x;
          if (fire.moveDirection === 'LEFT') fx -= speed; else fx += speed;
          if (isWall(fx, fire.y) || isWall(fx + fire.width, fire.y)) {
            fire.moveDirection = fire.moveDirection === 'LEFT' ? 'RIGHT' : 'LEFT';
          } else {
            fire.x = fx;
          }
        }

        // Spread — level-scaled urgency
        if (fire.spreadTimer !== undefined) {
          const levelBonus = 1 + stateRef.current.level * 0.22;
          const hpBonus = 0.5 + fire.hp / 200;
          fire.spreadTimer -= levelBonus * hpBonus;

          if (fire.spreadTimer <= 0) {
            fire.spreadTimer = FIRE_SPREAD_TIME * (1.4 - stateRef.current.level * 0.08) + Math.random() * 80;
            const spreadChance = 0.18 + fire.hp / 280 + stateRef.current.level * 0.06;

            if (Math.random() < spreadChance) {
              const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]].sort(() => Math.random() - 0.5);
              for (const [ddx, ddy] of dirs) {
                const newX = fire.x + ddx * TILE_SIZE;
                const newY = fire.y + ddy * TILE_SIZE;
                if (!isWall(newX, newY)) {
                  const alreadyFire = entities.some(e =>
                    e.type === EntityType.FIRE &&
                    Math.abs(e.x - newX) < 10 && Math.abs(e.y - newY) < 10
                  );
                  if (!alreadyFire) {
                    entities.push({
                      ...fire,
                      id: `fire-spread-${Math.random()}`,
                      x: newX, y: newY,
                      spreadTimer: FIRE_SPREAD_TIME * 1.3,
                      hp: 60 + Math.random() * 35,
                    });
                    if (Math.random() > 0.7) audioManager.playFireSpread();
                    break;
                  }
                }
              }
            }
          }
        }

        // Foam hits fire
        particlesRef.current.forEach(p => {
          if (checkCollision(
            { x: p.x, y: p.y, width: p.size, height: p.size },
            fire
          )) {
            fire.hp -= 6;
            p.life = 0;
          }
        });

        if (fire.hp <= 0) {
          entities.splice(i, 1);
          scorchMarksRef.current.push({ x: fire.x, y: fire.y });
          setGameState(prev => ({ ...prev, score: prev.score + 50 }));
          continue;
        }

        // Player-fire collision (touching = burn)
        const fireHitbox = { x: fire.x + 4, y: fire.y + 4, width: fire.width - 8, height: fire.height - 8 };
        if (checkCollision(player, { ...fire, ...fireHitbox })) {
          playerTouchingFire = true;
        }

        // Proximity check for oxygen drain (1 tile radius)
        const proxBox = { x: fire.x - TILE_SIZE, y: fire.y - TILE_SIZE, width: TILE_SIZE * 3, height: TILE_SIZE * 3 };
        if (checkCollision(player, proxBox)) {
          playerNearFire = true;
        }

        // Civilian–fire interaction (they take burn damage too)
        entities.forEach(e => {
          if (e.type !== EntityType.CIVILIAN) return;
          const civ = e as CivilianEntity;
          if (civ.state !== 'FOLLOWING') return;
          if (checkCollision(civ, { ...fire, ...fireHitbox })) {
            civ.burnStack = Math.min(FIRE_BURN_MAX_MULTIPLIER, civ.burnStack + FIRE_BURN_STACK_RATE * 60);
            civ.hp -= FIRE_BASE_DAMAGE * civ.burnStack * 60 * 0.016; // normalise to ~60fps
            if (civ.hp <= 0) {
              civ.state = 'DEAD';
              setGameState(prev => ({ ...prev, score: Math.max(0, prev.score - 200) }));
            }
          }
        });
      }

      // ── CIVILIAN ───────────────────────────────────────────────────────────
      else if (ent.type === EntityType.CIVILIAN) {
        const civ = ent as CivilianEntity;

        // Rescue interaction
        if (
          civ.state === 'WAITING' &&
          inp.interact &&
          checkCollision(player, { ...civ, width: civ.width + 12, height: civ.height + 12 })
        ) {
          civ.state = 'FOLLOWING';
          audioManager.playCivilianThankYou();
        }

        // Following with fire avoidance
        if (civ.state === 'FOLLOWING') {
          const dist = Math.hypot(player.x - civ.x, player.y - civ.y);
          if (dist > 28) {
            const angle = Math.atan2(player.y - civ.y, player.x - civ.x);
            const ddx = Math.cos(angle);
            const ddy = Math.sin(angle);
            const { cx, cy } = civilianAvoidsFire(civ, ddx, ddy);
            civ.x = cx;
            civ.y = cy;
          }
          // Cooldown burn stack on civilian
          civ.burnStack = Math.max(1, civ.burnStack - 0.01);
        }
      }

      // ── AMMO PICKUP ────────────────────────────────────────────────────────
      else if (ent.type === EntityType.AMMO_PICKUP) {
        if (checkCollision(player, ent)) {
          entities.splice(i, 1);
          setGameState(prev => ({ ...prev, ammo: Math.min(PLAYER_MAX_AMMO, prev.ammo + 35) }));
          audioManager.playPickup();
        }
      }

      // ── HEALTH PICKUP ──────────────────────────────────────────────────────
      else if (ent.type === EntityType.HEALTH_PICKUP) {
        if (checkCollision(player, ent)) {
          entities.splice(i, 1);
          setGameState(prev => ({ ...prev, health: Math.min(PLAYER_MAX_HEALTH, prev.health + 25) }));
          audioManager.playPickup();
        }
      }

      // ── HAZARD ELECTRIC ────────────────────────────────────────────────────
      else if (ent.type === EntityType.HAZARD_ELECTRIC) {
        const hazard = ent as HazardEntity;
        hazard.timer -= dt;
        if (hazard.timer <= 0) {
          hazard.state = hazard.state === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
          hazard.timer = hazard.state === 'ACTIVE' ? 900 : 1800;
          if (hazard.state === 'ACTIVE') audioManager.playSpark();
        }
        if (hazard.state === 'ACTIVE' && checkCollision(player, hazard)) {
          playerTouchingFire = true; // same damage path
        }
      }

      // ── HAZARD COLLAPSING ──────────────────────────────────────────────────
      else if (ent.type === EntityType.HAZARD_COLLAPSING) {
        const hazard = ent as HazardEntity;
        if (hazard.state === 'NORMAL' && checkCollision(player, hazard)) {
          hazard.state = 'CRACKING';
          hazard.timer = 700;
          audioManager.playCrumble();
        }
        if (hazard.state === 'CRACKING') {
          hazard.timer -= dt;
          if (hazard.timer <= 0) hazard.state = 'COLLAPSED';
        }
        if (hazard.state === 'COLLAPSED' && checkCollision(player, hazard)) {
          playerTouchingFire = true;
          const angle = Math.atan2(player.y - hazard.y, player.x - hazard.x);
          player.x += Math.cos(angle) * 8;
          player.y += Math.sin(angle) * 8;
        }
      }

      // ── EXIT (STAIRS / HELIPAD) ────────────────────────────────────────────
      else if (ent.type === EntityType.STAIRS || ent.type === EntityType.HELIPAD) {
        if (checkCollision(player, ent) && inp.interact) {
          const rescued = entities.filter(
            e => e.type === EntityType.CIVILIAN && (e as CivilianEntity).state === 'FOLLOWING'
          ).length;

          entities.forEach(e => {
            if (e.type === EntityType.CIVILIAN && (e as CivilianEntity).state === 'FOLLOWING') {
              (e as CivilianEntity).state = 'SAVED';
            }
          });

          audioManager.playWin();
          const timeBonus = Math.max(0, Math.floor(2000 - stateRef.current.time / 100));

          if (stateRef.current.level >= MAX_LEVELS) {
            setGameState(prev => ({
              ...prev,
              civiliansRescued: prev.civiliansRescued + rescued,
              score: prev.score + rescued * 500 + 1000 + timeBonus,
              gameWon: true,
              victory: true,
              screen: 'VICTORY',
            }));
          } else {
            setGameState(prev => ({
              ...prev,
              level: prev.level + 1,
              civiliansRescued: prev.civiliansRescued + rescued,
              score: prev.score + rescued * 500 + 200 + timeBonus,
              health: Math.min(PLAYER_MAX_HEALTH, prev.health + 20), // small heal between floors
              screen: 'FLOOR_INTRO',
              floorIntroTimer: 2200,
              time: 0,
            }));
          }
        }
      }
    }

    // ── Smoke proximity (check smoke particles near player)
    const playerCX = player.x + player.width / 2;
    const playerCY = player.y + player.height / 2;
    const smokeCount = smokeRef.current.filter(
      p => Math.hypot(p.x - playerCX, p.y - playerCY) < TILE_SIZE * 1.5
    ).length;
    if (smokeCount > 3) playerInSmoke = true;

    // ── Burn stacking
    if (playerTouchingFire) {
      burnCooldownRef.current = FIRE_BURN_COOLDOWN;
      burnStackRef.current = Math.min(
        FIRE_BURN_MAX_MULTIPLIER,
        burnStackRef.current + FIRE_BURN_STACK_RATE
      );
      const damage = FIRE_BASE_DAMAGE * burnStackRef.current;
      screenShakeRef.current = Math.min(10, screenShakeRef.current + 1.5);
      if (Math.random() > 0.9) audioManager.playDamage();

      setGameState(prev => {
        const newHealth = prev.health - damage;
        if (newHealth <= 0) {
          return { ...prev, health: 0, gameOver: true, screen: 'GAMEOVER' };
        }
        return { ...prev, health: newHealth, burnStack: burnStackRef.current };
      });
    } else {
      // Burn cooldown
      if (burnCooldownRef.current > 0) {
        burnCooldownRef.current--;
      } else {
        burnStackRef.current = Math.max(1, burnStackRef.current - 0.02);
      }
      setGameState(prev => ({ ...prev, burnStack: burnStackRef.current }));
    }

    // ── Oxygen mechanic
    if (playerTouchingFire || playerNearFire) {
      oxygenRef.current = Math.max(0, oxygenRef.current - OXYGEN_DRAIN_NEAR_FIRE);
    } else if (playerInSmoke) {
      oxygenRef.current = Math.max(0, oxygenRef.current - OXYGEN_DRAIN_IN_SMOKE);
    } else {
      oxygenRef.current = Math.min(OXYGEN_MAX, oxygenRef.current + OXYGEN_RECHARGE_RATE);
    }

    if (oxygenRef.current <= OXYGEN_DAMAGE_THRESHOLD) {
      const oxyDmg = OXYGEN_LOW_DAMAGE * (1 - oxygenRef.current / OXYGEN_DAMAGE_THRESHOLD);
      setGameState(prev => {
        const newHealth = prev.health - oxyDmg;
        if (newHealth <= 0) return { ...prev, health: 0, gameOver: true, screen: 'GAMEOVER' };
        return { ...prev, health: newHealth };
      });
    }

    setGameState(prev => ({
      ...prev,
      oxygen: oxygenRef.current,
      nearFire: playerNearFire,
      inSmoke: playerInSmoke,
    }));

    if (screenShakeRef.current > 0) {
      screenShakeRef.current *= 0.88;
      if (screenShakeRef.current < 0.1) screenShakeRef.current = 0;
    }
  };

  // ─── DRAW HELPERS ────────────────────────────────────────────────────────────

  const drawBrickWall = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => {
    ctx.fillStyle = '#374151';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(x, y + h - 8, w, 8);
    ctx.fillStyle = '#4b5563';
    const brickH = 8;
    const brickW = 16;
    for (let by = y; by < y + h - 8; by += brickH) {
      const offset = (Math.floor((by - y) / brickH) % 2) * (brickW / 2);
      for (let bx = x - offset; bx < x + w; bx += brickW + 2) {
        if (bx >= x && bx + brickW <= x + w) ctx.fillRect(bx, by + 1, brickW, brickH - 2);
      }
    }
    ctx.fillStyle = '#6b7280';
    ctx.fillRect(x, y, w, 2);
  };

  const drawFloor = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, even: boolean) => {
    ctx.fillStyle = even ? '#18181b' : '#27272a';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#3f3f46';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
  };

  const drawFirefighter = (ctx: CanvasRenderingContext2D, entity: Entity, facing: Direction) => {
    const { x, y, width, height, vx = 0, vy = 0 } = entity;
    const isMoving = Math.abs(vx) > 0.1 || Math.abs(vy) > 0.1;
    const time = Date.now();
    const walkCycle = isMoving ? Math.sin(time / 80) : 0;
    const bob = isMoving ? Math.abs(Math.sin(time / 80)) * 2 : 0;

    // Burn glow overlay when burn stack is high
    const burnIntensity = Math.min(1, (burnStackRef.current - 1) / (FIRE_BURN_MAX_MULTIPLIER - 1));
    if (burnIntensity > 0.1) {
      ctx.save();
      ctx.shadowBlur = 18 * burnIntensity;
      ctx.shadowColor = `rgba(255, 80, 0, ${burnIntensity})`;
      ctx.fillStyle = `rgba(255, 80, 0, ${burnIntensity * 0.25})`;
      ctx.fillRect(x, y, width, height);
      ctx.restore();
    }

    ctx.save();
    ctx.translate(Math.floor(x + width / 2), Math.floor(y + height / 2));
    if (facing === 'LEFT') ctx.scale(-1, 1);
    const w = 24; const h = 24;
    ctx.translate(-w / 2, -h / 2);

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(w / 2, h - 1, 8, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Legs
    ctx.fillStyle = '#1e3a8a';
    const legLength = 7;
    const legWidth = 5;
    if (facing === 'UP' || facing === 'DOWN') {
      let lLegY = h - 8;
      let rLegY = h - 8;
      lLegY += walkCycle * 2;
      rLegY -= walkCycle * 2;
      ctx.fillStyle = '#111';
      ctx.fillRect(w / 2 - 6, lLegY + legLength - 2, legWidth, 2);
      ctx.fillRect(w / 2 + 1, rLegY + legLength - 2, legWidth, 2);
      ctx.fillStyle = '#1e3a8a';
      ctx.fillRect(w / 2 - 6, lLegY, legWidth, legLength - 2);
      ctx.fillRect(w / 2 + 1, rLegY, legWidth, legLength - 2);
    } else {
      const spread = walkCycle * 4;
      ctx.fillStyle = '#172554';
      ctx.fillRect(w / 2 - 2 + spread, h - 8, legWidth, legLength);
      ctx.fillStyle = '#000';
      ctx.fillRect(w / 2 - 2 + spread, h - 2, legWidth, 2);
      ctx.fillStyle = '#1e3a8a';
      ctx.fillRect(w / 2 - 2 - spread, h - 8, legWidth, legLength);
      ctx.fillStyle = '#111';
      ctx.fillRect(w / 2 - 2 - spread, h - 2, legWidth, 2);
    }

    const bodyY = h - 17 - bob;
    if (facing === 'UP' || facing === 'RIGHT' || facing === 'LEFT') {
      ctx.fillStyle = '#dc2626';
      if (facing === 'UP') ctx.fillRect(w / 2 - 5, bodyY + 2, 10, 11);
      else ctx.fillRect(w / 2 - 6, bodyY + 3, 4, 10);
      ctx.fillStyle = '#f87171';
      if (facing === 'UP') ctx.fillRect(w / 2 + 2, bodyY + 3, 2, 9);
    }
    ctx.fillStyle = '#eab308';
    ctx.fillRect(w / 2 - 6, bodyY, 12, 12);
    ctx.fillStyle = '#e5e7eb';
    ctx.fillRect(w / 2 - 6, bodyY + 7, 12, 2);
    if (facing === 'DOWN') {
      ctx.fillStyle = '#ca8a04';
      ctx.fillRect(w / 2 - 1, bodyY, 2, 12);
      ctx.fillStyle = '#111';
      ctx.fillRect(w / 2 - 3, bodyY, 6, 2);
    } else if (facing === 'UP') {
      ctx.fillStyle = '#e5e7eb';
      ctx.fillRect(w / 2 - 1, bodyY, 2, 12);
    }

    ctx.fillStyle = '#eab308';
    if (facing === 'DOWN' || facing === 'UP') {
      const armSwing = walkCycle * 3;
      ctx.fillRect(w / 2 - 9, bodyY + 1 + armSwing, 3, 9);
      ctx.fillRect(w / 2 + 6, bodyY + 1 - armSwing, 3, 9);
      ctx.fillStyle = '#111';
      ctx.fillRect(w / 2 - 9, bodyY + 10 + armSwing, 3, 3);
      ctx.fillRect(w / 2 + 6, bodyY + 10 - armSwing, 3, 3);
    } else {
      const armSwing = -walkCycle * 3;
      ctx.fillRect(w / 2 - 1, bodyY + 2 + armSwing, 4, 8);
      ctx.fillStyle = '#111';
      ctx.fillRect(w / 2 - 1, bodyY + 10 + armSwing, 4, 3);
    }

    const headY = bodyY - 7;
    ctx.fillStyle = '#b91c1c';
    if (facing === 'DOWN') {
      ctx.beginPath();
      ctx.moveTo(w / 2 - 6, headY + 5);
      ctx.arc(w / 2, headY + 3, 6, Math.PI, 0);
      ctx.lineTo(w / 2 + 6, headY + 5);
      ctx.lineTo(w / 2 + 7, headY + 7);
      ctx.lineTo(w / 2 - 7, headY + 7);
      ctx.fill();
      ctx.fillStyle = '#fcd34d';
      ctx.fillRect(w / 2 - 1, headY + 1, 2, 2);
      ctx.fillStyle = '#fcd34d';
      ctx.fillRect(w / 2 - 3, headY + 6, 6, 4);
      ctx.fillStyle = '#374151';
      ctx.fillRect(w / 2 - 5, headY + 4, 10, 2);
    } else if (facing === 'UP') {
      ctx.beginPath();
      ctx.arc(w / 2, headY + 3, 6, Math.PI, 0);
      ctx.lineTo(w / 2 + 7, headY + 8);
      ctx.lineTo(w / 2 - 7, headY + 8);
      ctx.fill();
      ctx.fillStyle = '#111';
      ctx.fillRect(w / 2 - 4, headY + 8, 8, 2);
    } else {
      ctx.beginPath();
      ctx.moveTo(w / 2 - 4, headY + 5);
      ctx.arc(w / 2, headY + 3, 6, Math.PI, -0.2);
      ctx.lineTo(w / 2 + 8, headY + 7);
      ctx.lineTo(w / 2 - 5, headY + 6);
      ctx.fill();
      ctx.fillStyle = '#fcd34d';
      ctx.fillRect(w / 2 + 1, headY + 5, 4, 5);
      ctx.fillStyle = '#374151';
      ctx.fillRect(w / 2 + 2, headY + 4, 4, 2);
    }
    ctx.restore();
  };

  const drawCivilian = (ctx: CanvasRenderingContext2D, entity: CivilianEntity) => {
    const { x, y, width, height } = entity;
    const time = Date.now();
    const bob = Math.sin(time / 200) * 1.5;

    ctx.save();
    ctx.translate(x + width / 2, y + height / 2 + bob);

    // Burn tint on civilians
    if (entity.burnStack > 1.5) {
      ctx.shadowBlur = 10;
      ctx.shadowColor = `rgba(255,100,0,${Math.min(1, (entity.burnStack - 1) / 3)})`;
    }

    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(0, 8, 6, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#16a34a';
    ctx.fillRect(-4, -6, 8, 10);
    ctx.fillStyle = '#4b5563';
    ctx.fillRect(-4, 4, 3, 5);
    ctx.fillRect(1, 4, 3, 5);
    ctx.fillStyle = '#fca5a5';
    ctx.fillRect(-4, -13, 8, 7);
    ctx.fillStyle = '#78350f';
    ctx.fillRect(-4, -13, 8, 3);
    ctx.fillRect(-5, -10, 2, 3);
    ctx.fillRect(3, -10, 2, 3);

    if (entity.state === 'FOLLOWING') {
      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.arc(0, -18, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    if (entity.state === 'WAITING' && Math.floor(Date.now() / 500) % 2 === 0) {
      ctx.fillStyle = 'white';
      ctx.font = '8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('HELP!', 0, -20);
    }
    ctx.restore();
  };

  // ─── MAIN DRAW ───────────────────────────────────────────────────────────────
  const draw = (ctx: CanvasRenderingContext2D) => {
    ctx.save();

    if (screenShakeRef.current > 0) {
      ctx.translate(
        (Math.random() - 0.5) * screenShakeRef.current,
        (Math.random() - 0.5) * screenShakeRef.current
      );
    }

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Floor intro overlay
    const introScreen = stateRef.current.screen === 'FLOOR_INTRO';
    if (introScreen) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      const pct = Math.max(0, floorIntroTimerRef.current / 2200);
      const alpha = pct < 0.2 ? (pct / 0.2) : pct > 0.8 ? ((1 - pct) / 0.2) : 1;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`FLOOR ${stateRef.current.level}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 18);
      const isLast = stateRef.current.level === MAX_LEVELS;
      ctx.fillStyle = '#fcd34d';
      ctx.font = '9px monospace';
      ctx.fillText(
        isLast ? '— FINAL FLOOR — GET TO THE HELIPAD —' : '— REACH THE STAIRS — RESCUE CIVILIANS —',
        CANVAS_WIDTH / 2,
        CANVAS_HEIGHT / 2 + 4
      );
      ctx.fillStyle = '#6b7280';
      ctx.font = '7px monospace';
      ctx.fillText(`FLOOR ${stateRef.current.level} OF ${MAX_LEVELS}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 22);
      ctx.globalAlpha = 1;
      ctx.restore();
      return;
    }

    if (!mapRef.current || mapRef.current.length === 0) { ctx.restore(); return; }

    // Map tiles
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const px = x * TILE_SIZE; const py = y * TILE_SIZE;
        if (mapRef.current[y][x] === 1) drawBrickWall(ctx, px, py, TILE_SIZE, TILE_SIZE);
        else drawFloor(ctx, px, py, TILE_SIZE, TILE_SIZE, (x + y) % 2 === 0);
      }
    }

    // Scorch marks
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    scorchMarksRef.current.forEach(mark => {
      ctx.beginPath();
      ctx.arc(mark.x + TILE_SIZE / 2, mark.y + TILE_SIZE / 2, TILE_SIZE / 2 - 4, 0, Math.PI * 2);
      ctx.fill();
    });

    // Entities + particles sorted by Y
    const allEnts = [
      ...entitiesRef.current,
      ...particlesRef.current,
      ...smokeRef.current,
      ...sparksRef.current,
    ];
    allEnts.sort((a, b) => (a.y + ((a as any).height || 0)) - (b.y + ((b as any).height || 0)));

    allEnts.forEach(ent => {
      // Particle
      if ((ent as Particle).life !== undefined && (ent as Particle).maxLife !== undefined) {
        const p = ent as Particle;
        ctx.globalAlpha = Math.min(1, p.life / Math.min(20, p.maxLife * 0.4));
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.1, p.size), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        return;
      }

      const entity = ent as Entity;

      if (entity.type === EntityType.HELIPAD) {
        const pulse = Math.sin(Date.now() / 300) * 0.2 + 0.8;
        ctx.save();
        ctx.translate(entity.x + entity.width / 2, entity.y + entity.height / 2);
        ctx.shadowBlur = 20 * pulse; ctx.shadowColor = '#fcd34d';
        ctx.fillStyle = '#fcd34d';
        ctx.beginPath();
        ctx.arc(0, 0, 24, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#b45309'; ctx.lineWidth = 4; ctx.stroke();
        ctx.fillStyle = '#b45309';
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('H', 0, 2);
        ctx.restore();
      }

      else if (entity.type === EntityType.STAIRS) {
        const pulse = Math.sin(Date.now() / 300) * 0.2 + 0.8;
        ctx.save();
        ctx.shadowBlur = 15 * pulse; ctx.shadowColor = '#fcd34d';
        ctx.fillStyle = '#fcd34d';
        ctx.fillRect(entity.x, entity.y, entity.width, entity.height);
        ctx.strokeStyle = '#b45309'; ctx.lineWidth = 2;
        ctx.strokeRect(entity.x, entity.y, entity.width, entity.height);
        ctx.fillStyle = '#b45309';
        for (let i = 0; i < 4; i++) ctx.fillRect(entity.x + 4, entity.y + 4 + i * 6, entity.width - 8, 3);
        ctx.beginPath();
        ctx.moveTo(entity.x + entity.width / 2, entity.y + 2);
        ctx.lineTo(entity.x + entity.width / 2 - 6, entity.y + 10);
        ctx.lineTo(entity.x + entity.width / 2 + 6, entity.y + 10);
        ctx.fill();
        ctx.restore();
      }

      else if (entity.type === EntityType.FIRE) {
        const fire = ent as FireEntity;
        const time = Date.now() / 150;
        const flicker = Math.sin(time * 2) * 0.1;
        const intensity = fire.hp / 100;
        ctx.save();
        ctx.shadowBlur = 15 + intensity * 10;
        ctx.shadowColor = 'rgba(239,68,68,0.6)';

        const drawFlameLayer = (color: string, scaleX: number, scaleY: number, timeOffset: number) => {
          ctx.fillStyle = color;
          ctx.beginPath();
          const cx = entity.x + TILE_SIZE / 2;
          const by = entity.y + TILE_SIZE;
          const flameH = TILE_SIZE * (0.8 + flicker + intensity * 0.2);
          const flameW = TILE_SIZE * (0.8 + intensity * 0.2);
          ctx.moveTo(cx - flameW / 2 * scaleX, by);
          const tipX = cx + Math.sin(time + timeOffset) * (8 * scaleX);
          const tipY = by - flameH * scaleY;
          ctx.quadraticCurveTo(cx - flameW * scaleX, by - flameH * 0.5, tipX, tipY);
          ctx.quadraticCurveTo(cx + flameW * scaleX, by - flameH * 0.5, cx + flameW / 2 * scaleX, by);
          ctx.fill();
        };

        drawFlameLayer('#b91c1c', 1.0, 1.0, 0);
        drawFlameLayer('#ea580c', 0.8, 0.9, 1);
        drawFlameLayer('#fbbf24', 0.5, 0.7, 2);
        drawFlameLayer('#ffffff', 0.2, 0.4, 3);
        ctx.restore();
      }

      else if (entity.type === EntityType.PLAYER) {
        drawFirefighter(ctx, entity, playerFacingRef.current);
      }

      else if (entity.type === EntityType.CIVILIAN) {
        drawCivilian(ctx, entity as CivilianEntity);
      }

      else if (entity.type === EntityType.AMMO_PICKUP) {
        ctx.save();
        ctx.translate(entity.x + entity.width / 2, entity.y + entity.height / 2);
        ctx.translate(0, Math.sin(Date.now() / 200) * 2);
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(-4, -6, 8, 12);
        ctx.fillStyle = '#444';
        ctx.fillRect(-5, -8, 10, 2);
        ctx.fillRect(-2, -10, 4, 2);
        ctx.fillStyle = 'white';
        ctx.fillRect(-2, -2, 4, 4);
        ctx.restore();
      }

      else if (entity.type === EntityType.HEALTH_PICKUP) {
        ctx.save();
        ctx.translate(entity.x + entity.width / 2, entity.y + entity.height / 2);
        ctx.translate(0, Math.sin(Date.now() / 200 + 1) * 2);
        ctx.shadowBlur = 8; ctx.shadowColor = '#22c55e';
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(-5, -2, 10, 4);
        ctx.fillRect(-2, -5, 4, 10);
        ctx.restore();
      }

      else if (entity.type === EntityType.HAZARD_ELECTRIC) {
        const hazard = entity as HazardEntity;
        ctx.save();
        ctx.fillStyle = hazard.state === 'ACTIVE' ? '#facc15' : '#422006';
        ctx.fillRect(entity.x, entity.y, entity.width, entity.height);
        if (hazard.state === 'ACTIVE') {
          ctx.strokeStyle = 'white'; ctx.lineWidth = 2;
          for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            const sx = entity.x + Math.random() * entity.width;
            const sy = entity.y + Math.random() * entity.height;
            ctx.moveTo(sx, sy);
            ctx.lineTo(sx + (Math.random() - 0.5) * 20, sy + (Math.random() - 0.5) * 20);
            ctx.stroke();
          }
        }
        ctx.restore();
      }

      else if (entity.type === EntityType.HAZARD_COLLAPSING) {
        const hazard = entity as HazardEntity;
        ctx.save();
        if (hazard.state === 'NORMAL') {
          ctx.fillStyle = '#78350f';
          ctx.fillRect(entity.x, entity.y, entity.width, entity.height);
        } else if (hazard.state === 'CRACKING') {
          ctx.fillStyle = '#78350f';
          ctx.fillRect(entity.x, entity.y, entity.width, entity.height);
          ctx.strokeStyle = '#451a03'; ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(entity.x, entity.y);
          ctx.lineTo(entity.x + entity.width, entity.y + entity.height);
          ctx.moveTo(entity.x + entity.width, entity.y);
          ctx.lineTo(entity.x, entity.y + entity.height);
          ctx.stroke();
        } else {
          ctx.fillStyle = '#000';
          ctx.fillRect(entity.x, entity.y, entity.width, entity.height);
        }
        ctx.restore();
      }

      else if (entity.type === EntityType.HELICOPTER) {
        ctx.save();
        ctx.translate(entity.x, entity.y);
        ctx.fillStyle = '#9ca3af';
        ctx.beginPath();
        ctx.ellipse(30, 40, 30, 15, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(50, 35, 30, 5);
        ctx.fillRect(75, 25, 5, 15);
        ctx.fillStyle = '#93c5fd';
        ctx.beginPath();
        ctx.arc(20, 40, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#111'; ctx.fillRect(10, 25, 40, 2);
        ctx.fillStyle = `rgba(0,0,0,${0.3 + Math.random() * 0.3})`;
        ctx.fillRect(-10, 25, 80, 4);
        ctx.restore();
      }
    });

    // Vignette / lighting
    if (playerRef.current) {
      const p = playerRef.current;
      const cx = p.x + p.width / 2;
      const cy = p.y + p.height / 2;
      const grad = ctx.createRadialGradient(cx, cy, 55, cx, cy, 290);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.5, 'rgba(0,0,0,0.28)');
      grad.addColorStop(1, 'rgba(0,0,0,0.82)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }

    // Low oxygen red pulse overlay
    if (oxygenRef.current < 40) {
      const severity = 1 - oxygenRef.current / 40;
      const pulse = Math.sin(Date.now() / 300) * 0.5 + 0.5;
      ctx.fillStyle = `rgba(220,38,38,${severity * 0.22 * pulse})`;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }

    ctx.restore();
  };

  // ─── ANIMATION LOOP ───────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    const loop = (time: number) => {
      const dt = Math.min(time - lastTimeRef.current, 50); // cap at 50ms to avoid spiral
      lastTimeRef.current = time;
      update(dt);
      draw(ctx);
      requestRef.current = requestAnimationFrame(loop);
    };

    requestRef.current = requestAnimationFrame(loop);
    return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); };
  }, [gameState.screen]);

  return (
    <div className="relative border-none md:border-4 md:border-gray-800 md:rounded-lg md:shadow-2xl overflow-hidden bg-black w-full h-full flex items-center justify-center">
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className="block w-full h-full object-contain scanlines"
        style={{ imageRendering: 'pixelated' }}
      />
    </div>
  );
};
