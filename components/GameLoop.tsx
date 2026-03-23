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

  const entitiesRef   = useRef<Entity[]>([]);
  const particlesRef  = useRef<Particle[]>([]);
  const smokeRef      = useRef<Particle[]>([]);
  const sparksRef     = useRef<Particle[]>([]);
  const scorchMarksRef = useRef<Position[]>([]);
  const playerRef     = useRef<Entity | null>(null);
  const mapRef        = useRef<number[][]>([]);
  const stateRef      = useRef(gameState);
  const playerFacingRef = useRef<Direction>('DOWN');
  const screenShakeRef  = useRef(0);
  const floorIntroTimerRef = useRef(0);

  const burnStackRef    = useRef(1);
  const burnCooldownRef = useRef(0);
  const oxygenRef       = useRef(OXYGEN_MAX);

  // Track PREVIOUS interact state to prevent holding E from triggering repeatedly
  const prevInteractRef = useRef(false);

  useEffect(() => { stateRef.current = gameState; }, [gameState]);

  // ─── COLLISION ────────────────────────────────────────────────────────────
  const checkCollision = (
    r1: { x: number; y: number; width: number; height: number },
    r2: { x: number; y: number; width: number; height: number }
  ) => (
    r1.x < r2.x + r2.width  && r1.x + r1.width  > r2.x &&
    r1.y < r2.y + r2.height && r1.y + r1.height > r2.y
  );

  const isWall = (x: number, y: number) => {
    const tx = Math.floor(x / TILE_SIZE);
    const ty = Math.floor(y / TILE_SIZE);
    if (tx < 0 || tx >= MAP_WIDTH || ty < 0 || ty >= MAP_HEIGHT) return true;
    return mapRef.current[ty]?.[tx] === 1;
  };

  const canMove = (entity: Entity, nx: number, ny: number) => {
    const pad = 6;
    return !(
      isWall(nx + pad,              ny + pad) ||
      isWall(nx + entity.width-pad, ny + pad) ||
      isWall(nx + pad,              ny + entity.height-pad) ||
      isWall(nx + entity.width-pad, ny + entity.height-pad)
    );
  };

  // ─── FLOOD FILL ───────────────────────────────────────────────────────────
  const floodFill = (map: number[][], sx: number, sy: number): Set<string> => {
    const visited = new Set<string>();
    const q: [number,number][] = [[sx, sy]];
    while (q.length) {
      const [cx, cy] = q.shift()!;
      const key = `${cx},${cy}`;
      if (visited.has(key)) continue;
      if (cx < 0 || cx >= MAP_WIDTH || cy < 0 || cy >= MAP_HEIGHT) continue;
      if (map[cy][cx] === 1) continue;
      visited.add(key);
      q.push([cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]);
    }
    return visited;
  };

  // ─── LEVEL GENERATION ────────────────────────────────────────────────────
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
    prevInteractRef.current = false;

    const spawnTX = Math.floor(MAP_WIDTH / 2);
    const spawnTY = MAP_HEIGHT - 3;

    let map: number[][];
    let reachable: Set<string>;
    let attempts = 0;

    do {
      attempts++;
      map = [];
      for (let y = 0; y < MAP_HEIGHT; y++) {
        const row: number[] = [];
        for (let x = 0; x < MAP_WIDTH; x++) {
          row.push(x === 0 || x === MAP_WIDTH-1 || y === 0 || y === MAP_HEIGHT-1
            ? 1
            : Math.random() < 0.1 + level * 0.018 ? 1 : 0);
        }
        map.push(row);
      }
      // Clear spawn zone
      for (let dy = -2; dy <= 1; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const tx = spawnTX+dx, ty = spawnTY+dy;
          if (tx>0&&tx<MAP_WIDTH-1&&ty>0&&ty<MAP_HEIGHT-1) map[ty][tx]=0;
        }
      // Clear exit zone
      for (let dy = 1; dy <= 3; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const tx = Math.floor(MAP_WIDTH/2)+dx;
          if (tx>0&&tx<MAP_WIDTH-1) map[dy][tx]=0;
        }
      reachable = floodFill(map, spawnTX, spawnTY);
      const totalFloor = map.flat().filter(t=>t===0).length;
      if (reachable.size / totalFloor >= 0.6) break;
    } while (attempts < 20);

    mapRef.current = map!;
    const entities: Entity[] = [];

    // Player
    const player: Entity = {
      id: 'player', type: EntityType.PLAYER,
      x: spawnTX*TILE_SIZE, y: spawnTY*TILE_SIZE,
      width: PLAYER_SIZE, height: PLAYER_SIZE, color: COLORS.PLAYER,
    };
    playerRef.current = player;
    entities.push(player);

    // Exit
    const isLast = level === MAX_LEVELS;
    const exitTX = Math.floor(MAP_WIDTH/2), exitTY = 2;
    map![exitTY][exitTX] = 0;
    entities.push({
      id: 'exit', type: isLast ? EntityType.HELIPAD : EntityType.STAIRS,
      x: exitTX*TILE_SIZE, y: exitTY*TILE_SIZE,
      width: TILE_SIZE, height: TILE_SIZE, color: '#fff',
    });
    if (isLast) entities.push({
      id: 'helicopter', type: EntityType.HELICOPTER,
      x: exitTX*TILE_SIZE-16, y: exitTY*TILE_SIZE-16,
      width: 64, height: 64, color: '#fff',
    });

    // Helper: random reachable tile
    const rndTile = (minDist = 3) => {
      const candidates = Array.from(reachable!)
        .map(k => { const [x,y]=k.split(',').map(Number); return {tx:x,ty:y}; })
        .filter(({tx,ty}) =>
          Math.abs(tx-spawnTX)+Math.abs(ty-spawnTY) >= minDist && ty !== exitTY
        );
      if (!candidates.length) return null;
      return candidates[Math.floor(Math.random()*candidates.length)];
    };

    // Fire
    const fireCount = 3 + level * 2;
    for (let i = 0; i < fireCount; i++) {
      const t = rndTile(4); if (!t) continue;
      const r = Math.random();
      let fType = FireType.STATIC;
      if (level >= 2 && r > 0.55) fType = FireType.MOVING;
      if (level >= 3 && r > 0.75) fType = FireType.MULTIPLYING;
      entities.push({
        id: `fire-${i}`, type: EntityType.FIRE, fireType: fType,
        x: t.tx*TILE_SIZE, y: t.ty*TILE_SIZE,
        width: TILE_SIZE, height: TILE_SIZE, color: COLORS.FIRE_CORE,
        hp: 80+Math.random()*40, spreadTimer: FIRE_SPREAD_TIME,
        moveDirection: Math.random()>0.5?'LEFT':'RIGHT', moveTimer: 0,
      } as FireEntity);
    }

    // Civilians
    const civCount = 1 + Math.floor(level * 0.8);
    for (let i = 0; i < civCount; i++) {
      const t = rndTile(3); if (!t) continue;
      entities.push({
        id: `civ-${i}`, type: EntityType.CIVILIAN, state: 'WAITING',
        x: t.tx*TILE_SIZE+8, y: t.ty*TILE_SIZE+8,
        width: 16, height: 16, color: COLORS.CIVILIAN,
        hp: 100, burnStack: 1,
      } as CivilianEntity);
    }

    // Ammo pickups
    const ammoCount = 2 + Math.floor(level/2);
    for (let i = 0; i < ammoCount; i++) {
      const t = rndTile(2); if (!t) continue;
      entities.push({
        id: `ammo-${i}`, type: EntityType.AMMO_PICKUP,
        x: t.tx*TILE_SIZE+8, y: t.ty*TILE_SIZE+8,
        width: 16, height: 16, color: '#3b82f6',
      });
    }

    // Health pickups
    const healthCount = 1 + Math.floor(level/2);
    for (let i = 0; i < healthCount; i++) {
      const t = rndTile(2); if (!t) continue;
      entities.push({
        id: `health-${i}`, type: EntityType.HEALTH_PICKUP,
        x: t.tx*TILE_SIZE+8, y: t.ty*TILE_SIZE+8,
        width: 16, height: 16, color: '#22c55e',
      });
    }

    // Hazards
    const hazardCount = 1 + Math.floor(level/2);
    for (let i = 0; i < hazardCount; i++) {
      const t = rndTile(3); if (!t) continue;
      const isElec = Math.random() > 0.5;
      entities.push({
        id: `hazard-${i}`,
        type: isElec ? EntityType.HAZARD_ELECTRIC : EntityType.HAZARD_COLLAPSING,
        x: t.tx*TILE_SIZE, y: t.ty*TILE_SIZE,
        width: TILE_SIZE, height: TILE_SIZE,
        color: isElec ? '#fde047' : '#78350f',
        state: isElec ? 'INACTIVE' : 'NORMAL',
        timer: isElec ? 2000 : 0,
      } as HazardEntity);
    }

    entitiesRef.current = entities;

    setGameState(prev => ({
      ...prev,
      totalCivilians: civCount,
      civiliansFollowing: 0,
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
    if (gameState.screen === 'PLAYING') generateLevel(gameState.level);
  }, [gameState.screen, gameState.level, generateLevel]);

  useEffect(() => {
    if (gameState.screen === 'FLOOR_INTRO') {
      floorIntroTimerRef.current = gameState.floorIntroTimer;
    }
  }, [gameState.screen, gameState.floorIntroTimer]);

  // ─── CIVILIAN FIRE AVOIDANCE ──────────────────────────────────────────────
  const civilianMove = (civ: CivilianEntity, ddx: number, ddy: number) => {
    const speed = PLAYER_SPEED - 0.6;
    const fires = entitiesRef.current.filter(e => e.type === EntityType.FIRE);

    const hitsfire = (nx: number, ny: number) =>
      fires.some(f => checkCollision(
        {x:nx, y:ny, width:civ.width, height:civ.height},
        {x:f.x+4, y:f.y+4, width:f.width-8, height:f.height-8}
      ));

    const tryDir = (dx: number, dy: number) => {
      const nx = civ.x + dx, ny = civ.y + dy;
      if (!hitsfire(nx,ny) && canMove(civ, nx, civ.y) && canMove(civ, civ.x, ny))
        return {cx:nx, cy:ny};
      return null;
    };

    return tryDir(ddx*speed, ddy*speed)
        ?? tryDir(ddy*speed, ddx*speed)
        ?? tryDir(-ddy*speed, -ddx*speed)
        ?? {cx:civ.x, cy:civ.y};
  };

  // ─── UPDATE ───────────────────────────────────────────────────────────────
  const update = (dt: number) => {
    const screen = stateRef.current.screen;

    // Floor intro countdown
    if (screen === 'FLOOR_INTRO') {
      floorIntroTimerRef.current -= dt;
      if (floorIntroTimerRef.current <= 0)
        setGameState(prev => ({ ...prev, screen: 'PLAYING' }));
      return;
    }

    if (screen !== 'PLAYING') return;
    if (stateRef.current.gameOver || stateRef.current.victory) return;

    // Resume audio on any game input — fixes "sound goes awol" after interrupts
    const inp = input.current;
    if (inp.up || inp.down || inp.left || inp.right || inp.action || inp.interact) {
      audioManager.resume();
    }

    const player = playerRef.current;
    if (!player) return;

    // ── Movement
    let nx = player.x, ny = player.y;
    let moved = false, dirX = 0, dirY = 0;
    if (inp.up)    { ny -= PLAYER_SPEED; moved = true; dirY = -1; }
    if (inp.down)  { ny += PLAYER_SPEED; moved = true; dirY =  1; }
    if (inp.left)  { nx -= PLAYER_SPEED; moved = true; dirX = -1; }
    if (inp.right) { nx += PLAYER_SPEED; moved = true; dirX =  1; }

    player.vx = dirX; player.vy = dirY;
    if (moved) {
      if      (dirY < 0) playerFacingRef.current = 'UP';
      else if (dirY > 0) playerFacingRef.current = 'DOWN';
      else if (dirX < 0) playerFacingRef.current = 'LEFT';
      else               playerFacingRef.current = 'RIGHT';
    }
    if (canMove(player, nx, player.y)) player.x = nx;
    if (canMove(player, player.x, ny)) player.y = ny;

    // Edge-detect interact (press, not hold) to prevent exit trigger spam
    const interactPressed = inp.interact && !prevInteractRef.current;
    prevInteractRef.current = inp.interact;

    // ── Extinguisher
    if (inp.action && stateRef.current.ammo > 0) {
      let angle = moved ? Math.atan2(dirY, dirX) : (
        playerFacingRef.current === 'UP'    ? -Math.PI/2 :
        playerFacingRef.current === 'DOWN'  ?  Math.PI/2 :
        playerFacingRef.current === 'LEFT'  ?  Math.PI   : 0
      );
      const spread = (Math.random()-0.5)*0.55;
      particlesRef.current.push({
        id: Math.random().toString(),
        x: player.x+player.width/2+Math.cos(angle)*10,
        y: player.y+player.height/2+Math.sin(angle)*10,
        vx: Math.cos(angle+spread)*7, vy: Math.sin(angle+spread)*7,
        life: 28, maxLife: 28, color: COLORS.FOAM, size: 3+Math.random()*4,
      });
      if (Math.random() > 0.8) audioManager.playShoot();
      setGameState(prev => ({ ...prev, ammo: Math.max(0, prev.ammo - EXTINGUISHER_COST) }));
    } else if (!inp.action && stateRef.current.ammo < PLAYER_MAX_AMMO) {
      setGameState(prev => ({ ...prev, ammo: Math.min(PLAYER_MAX_AMMO, prev.ammo + AMMO_RECHARGE_RATE) }));
    }

    // ── Particles
    particlesRef.current.forEach(p => { p.x+=p.vx; p.y+=p.vy; p.life--; p.size*=0.95; });
    particlesRef.current = particlesRef.current.filter(p => p.life > 0);
    smokeRef.current.forEach(p => { p.y-=0.45; p.x+=Math.sin(p.life*0.1)*0.2; p.life--; p.size+=0.12; });
    smokeRef.current = smokeRef.current.filter(p => p.life > 0);
    sparksRef.current.forEach(p => { p.y-=1.1; p.x+=Math.sin(p.life*0.5)*0.5; p.life--; });
    sparksRef.current = sparksRef.current.filter(p => p.life > 0);

    // ── Entity logic
    const entities = entitiesRef.current;
    let playerOnFire = false, playerNearFire = false, playerInSmoke = false;

    for (let i = entities.length-1; i >= 0; i--) {
      const ent = entities[i];

      // ── FIRE ──────────────────────────────────────────────────────────────
      if (ent.type === EntityType.FIRE) {
        const fire = ent as FireEntity;

        if (Math.random() < 0.005)
          fire.hp > 120 ? audioManager.playBigFireCrackle() : audioManager.playFireCrackling();

        if (Math.random() < 0.1) smokeRef.current.push({
          id: Math.random().toString(),
          x: fire.x+Math.random()*TILE_SIZE, y: fire.y,
          vx:0, vy:-1, life:110+Math.random()*50, maxLife:160,
          color:'rgba(80,80,80,0.35)', size:3+Math.random()*5,
        });
        if (Math.random() < 0.06) sparksRef.current.push({
          id: Math.random().toString(),
          x: fire.x+Math.random()*TILE_SIZE, y: fire.y+Math.random()*TILE_SIZE,
          vx:0, vy:-1, life:30+Math.random()*20, maxLife:50,
          color:'#fca5a5', size:1,
        });

        if (fire.fireType === FireType.MOVING) {
          const spd = 1.2 + stateRef.current.level*0.1;
          let fx = fire.moveDirection==='LEFT' ? fire.x-spd : fire.x+spd;
          if (isWall(fx,fire.y)||isWall(fx+fire.width,fire.y))
            fire.moveDirection = fire.moveDirection==='LEFT'?'RIGHT':'LEFT';
          else fire.x = fx;
        }

        if (fire.spreadTimer !== undefined) {
          const lvlBonus = 1 + stateRef.current.level*0.22;
          const hpBonus  = 0.5 + fire.hp/200;
          fire.spreadTimer -= lvlBonus * hpBonus;
          if (fire.spreadTimer <= 0) {
            fire.spreadTimer = FIRE_SPREAD_TIME*(1.4-stateRef.current.level*0.08)+Math.random()*80;
            if (Math.random() < 0.18+fire.hp/280+stateRef.current.level*0.06) {
              const dirs = [[0,1],[0,-1],[1,0],[-1,0]].sort(()=>Math.random()-0.5);
              for (const [dx,dy] of dirs) {
                const nx2=fire.x+dx*TILE_SIZE, ny2=fire.y+dy*TILE_SIZE;
                if (!isWall(nx2,ny2) && !entities.some(e=>e.type===EntityType.FIRE&&Math.abs(e.x-nx2)<10&&Math.abs(e.y-ny2)<10)) {
                  entities.push({...fire, id:`fs-${Math.random()}`, x:nx2, y:ny2,
                    spreadTimer:FIRE_SPREAD_TIME*1.3, hp:60+Math.random()*35});
                  if (Math.random()>0.7) audioManager.playFireSpread();
                  break;
                }
              }
            }
          }
        }

        // Foam hits fire
        particlesRef.current.forEach(p => {
          if (checkCollision({x:p.x,y:p.y,width:p.size,height:p.size}, fire)) {
            fire.hp -= 6; p.life = 0;
          }
        });

        if (fire.hp <= 0) {
          entities.splice(i,1);
          scorchMarksRef.current.push({x:fire.x, y:fire.y});
          setGameState(prev => ({...prev, score:prev.score+50}));
          continue;
        }

        const fhb = {x:fire.x+4,y:fire.y+4,width:fire.width-8,height:fire.height-8};
        if (checkCollision(player, {...fire,...fhb})) playerOnFire = true;
        if (checkCollision(player, {x:fire.x-TILE_SIZE,y:fire.y-TILE_SIZE,width:TILE_SIZE*3,height:TILE_SIZE*3}))
          playerNearFire = true;

        // Civs in fire
        entities.forEach(e => {
          if (e.type!==EntityType.CIVILIAN) return;
          const civ = e as CivilianEntity;
          if (civ.state!=='FOLLOWING') return;
          if (checkCollision(civ, {...fire,...fhb})) {
            civ.burnStack = Math.min(FIRE_BURN_MAX_MULTIPLIER, civ.burnStack+FIRE_BURN_STACK_RATE*60);
            civ.hp -= FIRE_BASE_DAMAGE*civ.burnStack*60*0.016;
            if (civ.hp<=0) { civ.state='DEAD'; setGameState(prev=>({...prev,score:Math.max(0,prev.score-200)})); }
          }
        });
      }

      // ── CIVILIAN ──────────────────────────────────────────────────────────
      else if (ent.type === EntityType.CIVILIAN) {
        const civ = ent as CivilianEntity;

        // Rescue: edge-triggered so holding E only fires once per press
        if (civ.state==='WAITING' && interactPressed &&
            checkCollision(player, {...civ, width:civ.width+12, height:civ.height+12})) {
          civ.state = 'FOLLOWING';
          audioManager.playCivilianThankYou();
        }

        if (civ.state==='FOLLOWING') {
          const dist = Math.hypot(player.x-civ.x, player.y-civ.y);
          if (dist > 28) {
            const angle = Math.atan2(player.y-civ.y, player.x-civ.x);
            const {cx,cy} = civilianMove(civ, Math.cos(angle), Math.sin(angle));
            civ.x=cx; civ.y=cy;
          }
          civ.burnStack = Math.max(1, civ.burnStack-0.01);
        }
      }

      // ── AMMO ──────────────────────────────────────────────────────────────
      else if (ent.type===EntityType.AMMO_PICKUP && checkCollision(player,ent)) {
        entities.splice(i,1);
        setGameState(prev=>({...prev,ammo:Math.min(PLAYER_MAX_AMMO,prev.ammo+35)}));
        audioManager.playPickup();
      }

      // ── HEALTH ────────────────────────────────────────────────────────────
      else if (ent.type===EntityType.HEALTH_PICKUP && checkCollision(player,ent)) {
        entities.splice(i,1);
        setGameState(prev=>({...prev,health:Math.min(PLAYER_MAX_HEALTH,prev.health+25)}));
        audioManager.playPickup();
      }

      // ── HAZARD ELECTRIC ───────────────────────────────────────────────────
      else if (ent.type===EntityType.HAZARD_ELECTRIC) {
        const h = ent as HazardEntity;
        h.timer -= dt;
        if (h.timer<=0) {
          h.state = h.state==='ACTIVE'?'INACTIVE':'ACTIVE';
          h.timer = h.state==='ACTIVE'?900:1800;
          if (h.state==='ACTIVE') audioManager.playSpark();
        }
        if (h.state==='ACTIVE' && checkCollision(player,h)) playerOnFire=true;
      }

      // ── HAZARD COLLAPSING ─────────────────────────────────────────────────
      else if (ent.type===EntityType.HAZARD_COLLAPSING) {
        const h = ent as HazardEntity;
        if (h.state==='NORMAL' && checkCollision(player,h)) {
          h.state='CRACKING'; h.timer=700; audioManager.playCrumble();
        }
        if (h.state==='CRACKING') { h.timer-=dt; if(h.timer<=0) h.state='COLLAPSED'; }
        if (h.state==='COLLAPSED' && checkCollision(player,h)) {
          playerOnFire=true;
          // Wall-aware pushback: try each axis independently so we never
          // push the player into an adjacent wall.
          // Calculate overlap on each axis and push out the smaller one.
          const overlapLeft  = (player.x + player.width)  - h.x;
          const overlapRight = (h.x + h.width)  - player.x;
          const overlapTop   = (player.y + player.height) - h.y;
          const overlapBot   = (h.y + h.height) - player.y;
          const minX = Math.min(overlapLeft, overlapRight);
          const minY = Math.min(overlapTop,  overlapBot);
          if (minX < minY) {
            // Push horizontally
            const pushX = overlapLeft < overlapRight ? -minX - 1 : minX + 1;
            const nx = player.x + pushX;
            if (canMove(player, nx, player.y)) player.x = nx;
            else if (canMove(player, player.x, player.y - 8)) player.y -= 8;
            else if (canMove(player, player.x, player.y + 8)) player.y += 8;
          } else {
            // Push vertically
            const pushY = overlapTop < overlapBot ? -minY - 1 : minY + 1;
            const ny = player.y + pushY;
            if (canMove(player, player.x, ny)) player.y = ny;
            else if (canMove(player, player.x - 8, player.y)) player.x -= 8;
            else if (canMove(player, player.x + 8, player.y)) player.x += 8;
          }
        }
      }

      // ── EXIT ──────────────────────────────────────────────────────────────
      else if ((ent.type===EntityType.STAIRS||ent.type===EntityType.HELIPAD)
               && checkCollision(player,ent) && interactPressed) {
        const rescued = entities.filter(
          e=>e.type===EntityType.CIVILIAN&&(e as CivilianEntity).state==='FOLLOWING'
        ).length;
        entities.forEach(e => {
          if (e.type===EntityType.CIVILIAN&&(e as CivilianEntity).state==='FOLLOWING')
            (e as CivilianEntity).state='SAVED';
        });
        audioManager.stopMusic();
        audioManager.playWin();
        const timeBonus = Math.max(0, Math.floor(2000-stateRef.current.time/100));
        if (stateRef.current.level>=MAX_LEVELS) {
          setGameState(prev=>({
            ...prev,
            civiliansRescued: prev.civiliansRescued+rescued,
            civiliansFollowing: 0,
            score: prev.score+rescued*500+1000+timeBonus,
            gameWon:true, victory:true, screen:'VICTORY',
          }));
        } else {
          setGameState(prev=>({
            ...prev,
            level: prev.level+1,
            civiliansRescued: prev.civiliansRescued+rescued,
            civiliansFollowing: 0,
            score: prev.score+rescued*500+200+timeBonus,
            health: Math.min(PLAYER_MAX_HEALTH, prev.health+20),
            screen:'FLOOR_INTRO', floorIntroTimer:2200, time:0,
          }));
        }
      }
    }

    // ── Live civilian-following count pushed to React state every frame
    // This is what the HUD reads for the real-time counter.
    const nowFollowing = entities.filter(
      e=>e.type===EntityType.CIVILIAN&&(e as CivilianEntity).state==='FOLLOWING'
    ).length;
    // Only call setGameState if value actually changed to avoid churn
    if (nowFollowing !== stateRef.current.civiliansFollowing) {
      setGameState(prev => ({ ...prev, civiliansFollowing: nowFollowing }));
    }

    // ── Smoke proximity
    const pcx=player.x+player.width/2, pcy=player.y+player.height/2;
    if (smokeRef.current.filter(p=>Math.hypot(p.x-pcx,p.y-pcy)<TILE_SIZE*1.5).length>3)
      playerInSmoke=true;

    // ── Burn damage stacking
    if (playerOnFire) {
      burnCooldownRef.current = FIRE_BURN_COOLDOWN;
      burnStackRef.current = Math.min(FIRE_BURN_MAX_MULTIPLIER, burnStackRef.current+FIRE_BURN_STACK_RATE);
      screenShakeRef.current = Math.min(10, screenShakeRef.current+1.5);
      if (Math.random()>0.9) audioManager.playDamage();
      const dmg = FIRE_BASE_DAMAGE * burnStackRef.current;
      setGameState(prev => {
        const hp = prev.health - dmg;
        if (hp<=0) { audioManager.stopMusic(); return {...prev, health:0, gameOver:true, screen:'GAMEOVER'}; }
        return {...prev, health:hp, burnStack:burnStackRef.current};
      });
    } else {
      if (burnCooldownRef.current>0) burnCooldownRef.current--;
      else burnStackRef.current = Math.max(1, burnStackRef.current-0.02);
    }

    // ── Oxygen
    if (playerOnFire||playerNearFire)
      oxygenRef.current = Math.max(0, oxygenRef.current-OXYGEN_DRAIN_NEAR_FIRE);
    else if (playerInSmoke)
      oxygenRef.current = Math.max(0, oxygenRef.current-OXYGEN_DRAIN_IN_SMOKE);
    else
      oxygenRef.current = Math.min(OXYGEN_MAX, oxygenRef.current+OXYGEN_RECHARGE_RATE);

    if (oxygenRef.current<=OXYGEN_DAMAGE_THRESHOLD) {
      const d = OXYGEN_LOW_DAMAGE*(1-oxygenRef.current/OXYGEN_DAMAGE_THRESHOLD);
      setGameState(prev=>{
        const hp=prev.health-d;
        if(hp<=0) { audioManager.stopMusic(); return {...prev,health:0,gameOver:true,screen:'GAMEOVER'}; }
        return {...prev,health:hp};
      });
    }

    setGameState(prev=>({
      ...prev, oxygen:oxygenRef.current,
      nearFire:playerNearFire, inSmoke:playerInSmoke,
    }));

    // ── Screen shake decay
    if (screenShakeRef.current>0) {
      screenShakeRef.current *= 0.88;
      if (screenShakeRef.current<0.1) screenShakeRef.current=0;
    }

    // ── Increment time
    setGameState(prev=>({...prev, time:prev.time+dt}));
  };

  // ─── DRAW HELPERS ─────────────────────────────────────────────────────────
  const drawBrickWall = (ctx: CanvasRenderingContext2D, x:number,y:number,w:number,h:number)=>{
    ctx.fillStyle='#374151'; ctx.fillRect(x,y,w,h);
    ctx.fillStyle='#1f2937'; ctx.fillRect(x,y+h-8,w,8);
    ctx.fillStyle='#4b5563';
    for(let by=y;by<y+h-8;by+=8){
      const off=(Math.floor((by-y)/8)%2)*(8);
      for(let bx=x-off;bx<x+w;bx+=18){
        if(bx>=x&&bx+16<=x+w) ctx.fillRect(bx,by+1,16,6);
      }
    }
    ctx.fillStyle='#6b7280'; ctx.fillRect(x,y,w,2);
  };

  const drawFloor=(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,even:boolean)=>{
    ctx.fillStyle=even?'#18181b':'#27272a'; ctx.fillRect(x,y,w,h);
    ctx.strokeStyle='#3f3f46'; ctx.lineWidth=1; ctx.strokeRect(x,y,w,h);
  };

  const drawFirefighter=(ctx:CanvasRenderingContext2D,entity:Entity,facing:Direction)=>{
    const {x,y,width,height,vx=0,vy=0}=entity;
    const moving=Math.abs(vx)>0.1||Math.abs(vy)>0.1;
    const t=Date.now();
    const walk=moving?Math.sin(t/80):0;
    const bob=moving?Math.abs(Math.sin(t/80))*2:0;

    const burnI=Math.min(1,(burnStackRef.current-1)/(FIRE_BURN_MAX_MULTIPLIER-1));
    if(burnI>0.1){
      ctx.save();
      ctx.shadowBlur=18*burnI; ctx.shadowColor=`rgba(255,80,0,${burnI})`;
      ctx.fillStyle=`rgba(255,80,0,${burnI*0.25})`; ctx.fillRect(x,y,width,height);
      ctx.restore();
    }

    ctx.save();
    ctx.translate(Math.floor(x+width/2),Math.floor(y+height/2));
    if(facing==='LEFT') ctx.scale(-1,1);
    const W=24,H=24; ctx.translate(-W/2,-H/2);

    ctx.fillStyle='rgba(0,0,0,0.4)'; ctx.beginPath();
    ctx.ellipse(W/2,H-1,8,3,0,0,Math.PI*2); ctx.fill();

    if(facing==='UP'||facing==='DOWN'){
      let lY=H-8+walk*2, rY=H-8-walk*2;
      ctx.fillStyle='#111';
      ctx.fillRect(W/2-6,lY+5,5,2); ctx.fillRect(W/2+1,rY+5,5,2);
      ctx.fillStyle='#1e3a8a';
      ctx.fillRect(W/2-6,lY,5,5); ctx.fillRect(W/2+1,rY,5,5);
    } else {
      const sp=walk*4;
      ctx.fillStyle='#172554'; ctx.fillRect(W/2-2+sp,H-8,5,7);
      ctx.fillStyle='#000'; ctx.fillRect(W/2-2+sp,H-2,5,2);
      ctx.fillStyle='#1e3a8a'; ctx.fillRect(W/2-2-sp,H-8,5,7);
      ctx.fillStyle='#111'; ctx.fillRect(W/2-2-sp,H-2,5,2);
    }

    const bY=H-17-bob;
    if(facing!=='DOWN'){ ctx.fillStyle='#dc2626';
      facing==='UP'?ctx.fillRect(W/2-5,bY+2,10,11):ctx.fillRect(W/2-6,bY+3,4,10); }
    ctx.fillStyle='#eab308'; ctx.fillRect(W/2-6,bY,12,12);
    ctx.fillStyle='#e5e7eb'; ctx.fillRect(W/2-6,bY+7,12,2);
    if(facing==='DOWN'){ ctx.fillStyle='#ca8a04'; ctx.fillRect(W/2-1,bY,2,12);
      ctx.fillStyle='#111'; ctx.fillRect(W/2-3,bY,6,2); }
    else if(facing==='UP'){ ctx.fillStyle='#e5e7eb'; ctx.fillRect(W/2-1,bY,2,12); }

    ctx.fillStyle='#eab308';
    if(facing==='DOWN'||facing==='UP'){
      const sw=walk*3;
      ctx.fillRect(W/2-9,bY+1+sw,3,9); ctx.fillRect(W/2+6,bY+1-sw,3,9);
      ctx.fillStyle='#111';
      ctx.fillRect(W/2-9,bY+10+sw,3,3); ctx.fillRect(W/2+6,bY+10-sw,3,3);
    } else {
      const sw=-walk*3;
      ctx.fillRect(W/2-1,bY+2+sw,4,8);
      ctx.fillStyle='#111'; ctx.fillRect(W/2-1,bY+10+sw,4,3);
    }

    const hY=bY-7; ctx.fillStyle='#b91c1c';
    if(facing==='DOWN'){
      ctx.beginPath(); ctx.moveTo(W/2-6,hY+5);
      ctx.arc(W/2,hY+3,6,Math.PI,0);
      ctx.lineTo(W/2+7,hY+7); ctx.lineTo(W/2-7,hY+7); ctx.fill();
      ctx.fillStyle='#fcd34d'; ctx.fillRect(W/2-1,hY+1,2,2);
      ctx.fillRect(W/2-3,hY+6,6,4);
      ctx.fillStyle='#374151'; ctx.fillRect(W/2-5,hY+4,10,2);
    } else if(facing==='UP'){
      ctx.beginPath(); ctx.arc(W/2,hY+3,6,Math.PI,0);
      ctx.lineTo(W/2+7,hY+8); ctx.lineTo(W/2-7,hY+8); ctx.fill();
      ctx.fillStyle='#111'; ctx.fillRect(W/2-4,hY+8,8,2);
    } else {
      ctx.beginPath(); ctx.moveTo(W/2-4,hY+5);
      ctx.arc(W/2,hY+3,6,Math.PI,-0.2);
      ctx.lineTo(W/2+8,hY+7); ctx.lineTo(W/2-5,hY+6); ctx.fill();
      ctx.fillStyle='#fcd34d'; ctx.fillRect(W/2+1,hY+5,4,5);
      ctx.fillStyle='#374151'; ctx.fillRect(W/2+2,hY+4,4,2);
    }
    ctx.restore();
  };

  const drawCivilian=(ctx:CanvasRenderingContext2D,civ:CivilianEntity)=>{
    const {x,y,width,height}=civ;
    const bob=Math.sin(Date.now()/200)*1.5;
    ctx.save(); ctx.translate(x+width/2,y+height/2+bob);
    if(civ.burnStack>1.5){ ctx.shadowBlur=10;
      ctx.shadowColor=`rgba(255,100,0,${Math.min(1,(civ.burnStack-1)/3)})`; }
    ctx.fillStyle='rgba(0,0,0,0.3)'; ctx.beginPath();
    ctx.ellipse(0,8,6,2,0,0,Math.PI*2); ctx.fill(); ctx.shadowBlur=0;
    ctx.fillStyle='#16a34a'; ctx.fillRect(-4,-6,8,10);
    ctx.fillStyle='#4b5563'; ctx.fillRect(-4,4,3,5); ctx.fillRect(1,4,3,5);
    ctx.fillStyle='#fca5a5'; ctx.fillRect(-4,-13,8,7);
    ctx.fillStyle='#78350f'; ctx.fillRect(-4,-13,8,3);
    ctx.fillRect(-5,-10,2,3); ctx.fillRect(3,-10,2,3);
    if(civ.state==='FOLLOWING'){
      ctx.fillStyle='#22c55e'; ctx.beginPath(); ctx.arc(0,-18,3,0,Math.PI*2); ctx.fill();
    }
    if(civ.state==='WAITING'&&Math.floor(Date.now()/500)%2===0){
      ctx.fillStyle='white'; ctx.font='8px monospace';
      ctx.textAlign='center'; ctx.fillText('HELP!',0,-20);
    }
    ctx.restore();
  };

  // ─── DRAW ─────────────────────────────────────────────────────────────────
  const draw = (ctx: CanvasRenderingContext2D) => {
    ctx.save();
    if (screenShakeRef.current>0)
      ctx.translate((Math.random()-0.5)*screenShakeRef.current,(Math.random()-0.5)*screenShakeRef.current);

    ctx.fillStyle='#0f172a'; ctx.fillRect(0,0,CANVAS_WIDTH,CANVAS_HEIGHT);

    // Floor intro
    if (stateRef.current.screen==='FLOOR_INTRO') {
      ctx.fillStyle='#000'; ctx.fillRect(0,0,CANVAS_WIDTH,CANVAS_HEIGHT);
      const pct=Math.max(0,floorIntroTimerRef.current/2200);
      const alpha=pct<0.2?pct/0.2:pct>0.8?(1-pct)/0.2:1;
      ctx.globalAlpha=alpha;
      ctx.fillStyle='#ef4444'; ctx.font='bold 14px monospace';
      ctx.textAlign='center';
      ctx.fillText(`FLOOR ${stateRef.current.level}`,CANVAS_WIDTH/2,CANVAS_HEIGHT/2-18);
      ctx.fillStyle='#fcd34d'; ctx.font='9px monospace';
      ctx.fillText(
        stateRef.current.level===MAX_LEVELS
          ?'— FINAL FLOOR — GET TO THE HELIPAD —'
          :'— REACH THE STAIRS — RESCUE CIVILIANS —',
        CANVAS_WIDTH/2, CANVAS_HEIGHT/2+4
      );
      ctx.fillStyle='#6b7280'; ctx.font='7px monospace';
      ctx.fillText(`FLOOR ${stateRef.current.level} OF ${MAX_LEVELS}`,CANVAS_WIDTH/2,CANVAS_HEIGHT/2+22);
      ctx.globalAlpha=1; ctx.restore(); return;
    }

    if (!mapRef.current?.length) { ctx.restore(); return; }

    // Map
    for (let y=0;y<MAP_HEIGHT;y++)
      for (let x=0;x<MAP_WIDTH;x++) {
        const px=x*TILE_SIZE, py=y*TILE_SIZE;
        mapRef.current[y][x]===1
          ? drawBrickWall(ctx,px,py,TILE_SIZE,TILE_SIZE)
          : drawFloor(ctx,px,py,TILE_SIZE,TILE_SIZE,(x+y)%2===0);
      }

    // Scorch
    ctx.fillStyle='rgba(0,0,0,0.4)';
    scorchMarksRef.current.forEach(m=>{
      ctx.beginPath(); ctx.arc(m.x+TILE_SIZE/2,m.y+TILE_SIZE/2,TILE_SIZE/2-4,0,Math.PI*2); ctx.fill();
    });

    // All entities + particles sorted Y
    const all=[...entitiesRef.current,...particlesRef.current,...smokeRef.current,...sparksRef.current];
    all.sort((a,b)=>(a.y+((a as any).height||0))-(b.y+((b as any).height||0)));

    all.forEach(ent=>{
      // Particle check — must have maxLife (distinguishes from Entity)
      if ((ent as Particle).maxLife !== undefined) {
        const p=ent as Particle;
        ctx.globalAlpha=Math.min(1,p.life/Math.min(20,p.maxLife*0.4));
        ctx.fillStyle=p.color; ctx.beginPath();
        ctx.arc(p.x,p.y,Math.max(0.1,p.size),0,Math.PI*2); ctx.fill();
        ctx.globalAlpha=1; return;
      }

      const e=ent as Entity;

      if (e.type===EntityType.HELIPAD){
        const pulse=Math.sin(Date.now()/300)*0.2+0.8;
        ctx.save(); ctx.translate(e.x+e.width/2,e.y+e.height/2);
        ctx.shadowBlur=20*pulse; ctx.shadowColor='#fcd34d';
        ctx.fillStyle='#fcd34d'; ctx.beginPath(); ctx.arc(0,0,24,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle='#b45309'; ctx.lineWidth=4; ctx.stroke();
        ctx.fillStyle='#b45309'; ctx.font='bold 24px sans-serif';
        ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('H',0,2);
        ctx.restore();
      }
      else if (e.type===EntityType.STAIRS){
        const pulse=Math.sin(Date.now()/300)*0.2+0.8;
        ctx.save(); ctx.shadowBlur=15*pulse; ctx.shadowColor='#fcd34d';
        ctx.fillStyle='#fcd34d'; ctx.fillRect(e.x,e.y,e.width,e.height);
        ctx.strokeStyle='#b45309'; ctx.lineWidth=2; ctx.strokeRect(e.x,e.y,e.width,e.height);
        ctx.fillStyle='#b45309';
        for(let i=0;i<4;i++) ctx.fillRect(e.x+4,e.y+4+i*6,e.width-8,3);
        ctx.beginPath(); ctx.moveTo(e.x+e.width/2,e.y+2);
        ctx.lineTo(e.x+e.width/2-6,e.y+10); ctx.lineTo(e.x+e.width/2+6,e.y+10); ctx.fill();
        ctx.restore();
      }
      else if (e.type===EntityType.FIRE){
        const fire=e as FireEntity;
        const time=Date.now()/150, flick=Math.sin(time*2)*0.1, intens=fire.hp/100;
        ctx.save(); ctx.shadowBlur=15+intens*10; ctx.shadowColor='rgba(239,68,68,0.6)';
        const fl=(col:string,sx:number,sy:number,to:number)=>{
          ctx.fillStyle=col; ctx.beginPath();
          const cx=e.x+TILE_SIZE/2, by=e.y+TILE_SIZE;
          const fH=TILE_SIZE*(0.8+flick+intens*0.2), fW=TILE_SIZE*(0.8+intens*0.2);
          ctx.moveTo(cx-fW/2*sx, by);
          ctx.quadraticCurveTo(cx-fW*sx,by-fH*0.5,cx+Math.sin(time+to)*(8*sx),by-fH*sy);
          ctx.quadraticCurveTo(cx+fW*sx,by-fH*0.5,cx+fW/2*sx,by);
          ctx.fill();
        };
        fl('#b91c1c',1.0,1.0,0); fl('#ea580c',0.8,0.9,1);
        fl('#fbbf24',0.5,0.7,2); fl('#ffffff',0.2,0.4,3);
        ctx.restore();
      }
      else if (e.type===EntityType.PLAYER) drawFirefighter(ctx,e,playerFacingRef.current);
      else if (e.type===EntityType.CIVILIAN) drawCivilian(ctx,e as CivilianEntity);
      else if (e.type===EntityType.AMMO_PICKUP){
        ctx.save(); ctx.translate(e.x+e.width/2,e.y+e.height/2);
        ctx.translate(0,Math.sin(Date.now()/200)*2);
        ctx.fillStyle='#ef4444'; ctx.fillRect(-4,-6,8,12);
        ctx.fillStyle='#444'; ctx.fillRect(-5,-8,10,2); ctx.fillRect(-2,-10,4,2);
        ctx.fillStyle='white'; ctx.fillRect(-2,-2,4,4); ctx.restore();
      }
      else if (e.type===EntityType.HEALTH_PICKUP){
        ctx.save(); ctx.translate(e.x+e.width/2,e.y+e.height/2);
        ctx.translate(0,Math.sin(Date.now()/200+1)*2);
        ctx.shadowBlur=8; ctx.shadowColor='#22c55e';
        ctx.fillStyle='#22c55e';
        ctx.fillRect(-5,-2,10,4); ctx.fillRect(-2,-5,4,10); ctx.restore();
      }
      else if (e.type===EntityType.HAZARD_ELECTRIC){
        const h=e as HazardEntity; ctx.save();
        ctx.fillStyle=h.state==='ACTIVE'?'#facc15':'#422006';
        ctx.fillRect(e.x,e.y,e.width,e.height);
        if(h.state==='ACTIVE'){
          ctx.strokeStyle='white'; ctx.lineWidth=2;
          for(let i=0;i<3;i++){
            const sx=e.x+Math.random()*e.width, sy=e.y+Math.random()*e.height;
            ctx.beginPath(); ctx.moveTo(sx,sy);
            ctx.lineTo(sx+(Math.random()-0.5)*20,sy+(Math.random()-0.5)*20); ctx.stroke();
          }
        }
        ctx.restore();
      }
      else if (e.type===EntityType.HAZARD_COLLAPSING){
        const h=e as HazardEntity; ctx.save();
        ctx.fillStyle=h.state==='COLLAPSED'?'#000':h.state==='CRACKING'?'#78350f':'#78350f';
        ctx.fillRect(e.x,e.y,e.width,e.height);
        if(h.state==='CRACKING'){
          ctx.strokeStyle='#451a03'; ctx.lineWidth=2; ctx.beginPath();
          ctx.moveTo(e.x,e.y); ctx.lineTo(e.x+e.width,e.y+e.height);
          ctx.moveTo(e.x+e.width,e.y); ctx.lineTo(e.x,e.y+e.height); ctx.stroke();
        }
        ctx.restore();
      }
      else if (e.type===EntityType.HELICOPTER){
        ctx.save(); ctx.translate(e.x,e.y);
        ctx.fillStyle='#9ca3af'; ctx.beginPath();
        ctx.ellipse(30,40,30,15,0,0,Math.PI*2); ctx.fill();
        ctx.fillRect(50,35,30,5); ctx.fillRect(75,25,5,15);
        ctx.fillStyle='#93c5fd'; ctx.beginPath(); ctx.arc(20,40,8,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='#111'; ctx.fillRect(10,25,40,2);
        ctx.fillStyle=`rgba(0,0,0,${0.3+Math.random()*0.3})`; ctx.fillRect(-10,25,80,4);
        ctx.restore();
      }
    });

    // Vignette
    if (playerRef.current){
      const p=playerRef.current;
      const cx=p.x+p.width/2, cy=p.y+p.height/2;
      const g=ctx.createRadialGradient(cx,cy,55,cx,cy,290);
      g.addColorStop(0,'rgba(0,0,0,0)'); g.addColorStop(0.5,'rgba(0,0,0,0.28)');
      g.addColorStop(1,'rgba(0,0,0,0.82)');
      ctx.fillStyle=g; ctx.fillRect(0,0,CANVAS_WIDTH,CANVAS_HEIGHT);
    }

    // Low oxygen pulse
    if (oxygenRef.current<40){
      const sev=1-oxygenRef.current/40;
      ctx.fillStyle=`rgba(220,38,38,${sev*0.22*(Math.sin(Date.now()/300)*0.5+0.5)})`;
      ctx.fillRect(0,0,CANVAS_WIDTH,CANVAS_HEIGHT);
    }

    ctx.restore();
  };

  // ─── LOOP ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas=canvasRef.current; if(!canvas) return;
    const ctx=canvas.getContext('2d'); if(!ctx) return;
    ctx.imageSmoothingEnabled=false;

    const loop=(time:number)=>{
      const dt=Math.min(time-lastTimeRef.current,50);
      lastTimeRef.current=time;
      update(dt);
      draw(ctx);
      requestRef.current=requestAnimationFrame(loop);
    };
    requestRef.current=requestAnimationFrame(loop);
    return ()=>{ if(requestRef.current) cancelAnimationFrame(requestRef.current); };
  }, [gameState.screen]);

  return (
    <div className="relative border-none md:border-4 md:border-gray-800 md:rounded-lg md:shadow-2xl overflow-hidden bg-black w-full h-full flex items-center justify-center">
      <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT}
        className="block w-full h-full object-contain scanlines"
        style={{imageRendering:'pixelated'}} />
    </div>
  );
};
