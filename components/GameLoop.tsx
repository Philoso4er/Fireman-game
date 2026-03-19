import React, { useRef, useEffect, useState, useCallback } from 'react';
import { 
  GameState, InputState, Entity, EntityType, FireEntity, FireType, 
  CivilianEntity, Particle, Position, Direction, HazardEntity 
} from '../types';
import { 
  TILE_SIZE, MAP_WIDTH, MAP_HEIGHT, CANVAS_WIDTH, CANVAS_HEIGHT, 
  PLAYER_SPEED, PLAYER_SIZE, COLORS, FIRE_SPREAD_TIME, FIRE_DAMAGE,
  PLAYER_MAX_HEALTH, PLAYER_MAX_AMMO, EXTINGUISHER_COST, AMMO_RECHARGE_RATE,
  MAX_LEVELS
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
  
  // Mutable game state for performance
  const entitiesRef = useRef<Entity[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const smokeRef = useRef<Particle[]>([]); // Smoke layer
  const sparksRef = useRef<Particle[]>([]); // New sparks layer
  const scorchMarksRef = useRef<Position[]>([]); // Scorch marks layer
  const playerRef = useRef<Entity | null>(null);
  const mapRef = useRef<number[][]>([]); // 0: Floor, 1: Wall
  const stateRef = useRef(gameState);
  
  // Track player facing direction for sprite rendering
  const playerFacingRef = useRef<Direction>('DOWN');
  const screenShakeRef = useRef(0);

  // Update ref when prop changes
  useEffect(() => {
    stateRef.current = gameState;
  }, [gameState]);

  // --- Collision Helpers ---
  const checkCollision = (rect1: Entity | Position & {width: number, height: number}, rect2: Entity) => {
    return (
      rect1.x < rect2.x + rect2.width &&
      rect1.x + rect1.width > rect2.x &&
      rect1.y < rect2.y + rect2.height &&
      rect1.y + rect1.height > rect2.y
    );
  };

  const isWall = (x: number, y: number) => {
    const tileX = Math.floor(x / TILE_SIZE);
    const tileY = Math.floor(y / TILE_SIZE);
    
    // Boundary check
    if (tileX < 0 || tileX >= MAP_WIDTH || tileY < 0 || tileY >= MAP_HEIGHT) return true;
    
    // Map check
    return mapRef.current[tileY] && mapRef.current[tileY][tileX] === 1;
  };

  const resolveWallCollision = (entity: Entity, nextX: number, nextY: number) => {
    const padding = 6; // Increased padding for smoother sliding
    const tl = isWall(nextX + padding, nextY + padding);
    const tr = isWall(nextX + entity.width - padding, nextY + padding);
    const bl = isWall(nextX + padding, nextY + entity.height - padding);
    const br = isWall(nextX + entity.width - padding, nextY + entity.height - padding);
    
    if (tl || tr || bl || br) return false;
    return true;
  };

  // --- Level Generation ---
  const generateLevel = useCallback((level: number) => {
    const map: number[][] = [];
    const entities: Entity[] = [];
    smokeRef.current = [];
    particlesRef.current = [];
    sparksRef.current = [];
    scorchMarksRef.current = [];
    playerFacingRef.current = 'DOWN';
    screenShakeRef.current = 0;
    
    // 1. Initialize map
    for (let y = 0; y < MAP_HEIGHT; y++) {
      const row: number[] = [];
      for (let x = 0; x < MAP_WIDTH; x++) {
        // Borders are walls
        if (x === 0 || x === MAP_WIDTH - 1 || y === 0 || y === MAP_HEIGHT - 1) {
          row.push(1);
        } else {
          // Internal walls
          row.push(Math.random() < 0.1 + (level * 0.02) ? 1 : 0);
        }
      }
      map.push(row);
    }
    mapRef.current = map;

    // 2. Spawn Player
    const startX = Math.floor(MAP_WIDTH / 2) * TILE_SIZE;
    const startY = (MAP_HEIGHT - 3) * TILE_SIZE;
    
    // Clear area around start
    for(let y=MAP_HEIGHT-4; y<MAP_HEIGHT-1; y++) {
        for(let x=Math.floor(MAP_WIDTH/2)-2; x<Math.floor(MAP_WIDTH/2)+2; x++) {
            if(map[y] && map[y][x]) map[y][x] = 0;
        }
    }

    const player: Entity = {
      id: 'player',
      type: EntityType.PLAYER,
      x: startX,
      y: startY,
      width: PLAYER_SIZE,
      height: PLAYER_SIZE,
      color: COLORS.PLAYER
    };
    playerRef.current = player;
    entities.push(player);

    // 3. Spawn Exit
    const isLastLevel = level === MAX_LEVELS;
    const exitType = isLastLevel ? EntityType.HELIPAD : EntityType.STAIRS;
    
    const exitX = Math.floor(Math.random() * (MAP_WIDTH - 4) + 2) * TILE_SIZE;
    const exitY = TILE_SIZE * 2;
    const tileExitX = Math.floor(exitX/TILE_SIZE);
    const tileExitY = Math.floor(exitY/TILE_SIZE);
    if(map[tileExitY]) map[tileExitY][tileExitX] = 0; // Clear wall if exists

    entities.push({
      id: 'exit',
      type: exitType,
      x: exitX,
      y: exitY,
      width: TILE_SIZE,
      height: TILE_SIZE,
      color: '#fff' // Color handled in draw
    });

    if (isLastLevel) {
       entities.push({
          id: 'helicopter',
          type: EntityType.HELICOPTER,
          x: exitX - 16,
          y: exitY - 16,
          width: 64,
          height: 64,
          color: '#fff'
       });
    }

    // 4. Spawn Fire
    const fireCount = 4 + (level * 2);
    for (let i = 0; i < fireCount; i++) {
      let fx, fy;
      do {
        fx = Math.floor(Math.random() * (MAP_WIDTH - 2) + 1) * TILE_SIZE;
        fy = Math.floor(Math.random() * (MAP_HEIGHT - 4) + 2) * TILE_SIZE;
      } while (isWall(fx, fy) || checkCollision({x: fx, y: fy, width: TILE_SIZE, height: TILE_SIZE}, player));

      const fTypeRaw = Math.random();
      let fType = FireType.STATIC;
      if (level > 1 && fTypeRaw > 0.6) fType = FireType.MOVING;
      if (level > 2 && fTypeRaw > 0.8) fType = FireType.MULTIPLYING;

      const fire: FireEntity = {
        id: `fire-${i}`,
        type: EntityType.FIRE,
        fireType: fType,
        x: fx,
        y: fy,
        width: TILE_SIZE,
        height: TILE_SIZE,
        color: COLORS.FIRE_CORE,
        hp: 100,
        spreadTimer: FIRE_SPREAD_TIME,
        moveDirection: Math.random() > 0.5 ? 'LEFT' : 'RIGHT',
        moveTimer: 0
      };
      entities.push(fire);
    }

    // 5. Spawn Civilians
    const civCount = 1 + Math.floor(level / 2);
    for (let i = 0; i < civCount; i++) {
      let cx, cy;
      do {
        cx = Math.floor(Math.random() * (MAP_WIDTH - 2) + 1) * TILE_SIZE;
        cy = Math.floor(Math.random() * (MAP_HEIGHT - 4) + 2) * TILE_SIZE;
      } while (isWall(cx, cy) || checkCollision({x: cx, y: cy, width: TILE_SIZE, height: TILE_SIZE}, player));

      const civ: CivilianEntity = {
        id: `civ-${i}`,
        type: EntityType.CIVILIAN,
        state: 'WAITING',
        x: cx + 8,
        y: cy + 8,
        width: 16,
        height: 16,
        color: COLORS.CIVILIAN,
        hp: 100
      };
      entities.push(civ);
    }

    // 6. Spawn Ammo Pickups
    const ammoCount = 2 + Math.floor(level / 2);
    for (let i = 0; i < ammoCount; i++) {
        let ax, ay;
        do {
            ax = Math.floor(Math.random() * (MAP_WIDTH - 2) + 1) * TILE_SIZE;
            ay = Math.floor(Math.random() * (MAP_HEIGHT - 4) + 2) * TILE_SIZE;
        } while (isWall(ax, ay) || checkCollision({x: ax, y: ay, width: TILE_SIZE, height: TILE_SIZE}, player));

        entities.push({
            id: `ammo-${i}`,
            type: EntityType.AMMO_PICKUP,
            x: ax + 8,
            y: ay + 8,
            width: 16,
            height: 16,
            color: '#3b82f6'
        });
    }

    // 7. Spawn Hazards
    const hazardCount = 1 + Math.floor(level / 2);
    for (let i = 0; i < hazardCount; i++) {
        let hx, hy;
        do {
            hx = Math.floor(Math.random() * (MAP_WIDTH - 2) + 1) * TILE_SIZE;
            hy = Math.floor(Math.random() * (MAP_HEIGHT - 4) + 2) * TILE_SIZE;
        } while (isWall(hx, hy) || checkCollision({x: hx, y: hy, width: TILE_SIZE, height: TILE_SIZE}, player));

        const isElectric = Math.random() > 0.5;
        entities.push({
            id: `hazard-${i}`,
            type: isElectric ? EntityType.HAZARD_ELECTRIC : EntityType.HAZARD_COLLAPSING,
            x: hx,
            y: hy,
            width: TILE_SIZE,
            height: TILE_SIZE,
            color: isElectric ? '#fde047' : '#78350f',
            state: isElectric ? 'INACTIVE' : 'NORMAL',
            timer: isElectric ? 2000 : 0
        } as HazardEntity);
    }

    entitiesRef.current = entities;
    
    setGameState(prev => ({
      ...prev,
      totalCivilians: civCount,
      civiliansRescued: 0,
      gameOver: false,
      victory: false,
    }));

  }, [setGameState]);

  useEffect(() => {
    if (gameState.screen === 'PLAYING') {
      generateLevel(gameState.level);
    }
  }, [gameState.screen, gameState.level, generateLevel]);

  // --- Main Update Loop ---
  const update = (dt: number) => {
    if (stateRef.current.gameOver || stateRef.current.victory || stateRef.current.screen !== 'PLAYING') return;

    // Increment time
    setGameState(prev => ({ ...prev, time: prev.time + dt }));

    const player = playerRef.current;
    if (!player) return;

    const inp = input.current;
    let nextX = player.x;
    let nextY = player.y;
    let moved = false;
    let dirX = 0;
    let dirY = 0;

    // 1. Player Movement
    if (inp.up) { nextY -= PLAYER_SPEED; moved = true; dirY = -1; }
    if (inp.down) { nextY += PLAYER_SPEED; moved = true; dirY = 1; }
    if (inp.left) { nextX -= PLAYER_SPEED; moved = true; dirX = -1; }
    if (inp.right) { nextX += PLAYER_SPEED; moved = true; dirX = 1; }

    if (moved) {
        player.vx = dirX;
        player.vy = dirY;
        
        // Update Facing Direction
        if (dirY < 0) playerFacingRef.current = 'UP';
        else if (dirY > 0) playerFacingRef.current = 'DOWN';
        else if (dirX < 0) playerFacingRef.current = 'LEFT';
        else if (dirX > 0) playerFacingRef.current = 'RIGHT';

    } else {
        player.vx = 0;
        player.vy = 0;
    }

    // Try X movement
    if (resolveWallCollision(player, nextX, player.y)) {
      player.x = nextX;
    }
    // Try Y movement
    if (resolveWallCollision(player, player.x, nextY)) {
      player.y = nextY;
    }

    // 2. Extinguisher
    if (inp.action && stateRef.current.ammo > 0) {
      // Determine angle based on facing if standing still, or movement if moving
      let angle = 0;
      if (moved) {
          angle = Math.atan2(dirY, dirX);
      } else {
          switch(playerFacingRef.current) {
              case 'UP': angle = -Math.PI/2; break;
              case 'DOWN': angle = Math.PI/2; break;
              case 'LEFT': angle = Math.PI; break;
              case 'RIGHT': angle = 0; break;
          }
      }

      const spread = (Math.random() - 0.5) * 0.5;
      const speed = 6;
      
      // Emit from center of player
      particlesRef.current.push({
        id: Math.random().toString(),
        x: player.x + player.width/2 + Math.cos(angle)*10,
        y: player.y + player.height/2 + Math.sin(angle)*10,
        vx: Math.cos(angle + spread) * speed,
        vy: Math.sin(angle + spread) * speed,
        life: 25,
        color: COLORS.FOAM,
        size: 3 + Math.random() * 4
      });

      if (Math.random() > 0.8) audioManager.playShoot();

      setGameState(prev => ({
        ...prev,
        ammo: Math.max(0, prev.ammo - EXTINGUISHER_COST)
      }));
    } else if (!inp.action && stateRef.current.ammo < PLAYER_MAX_AMMO) {
       setGameState(prev => ({
        ...prev,
        ammo: Math.min(PLAYER_MAX_AMMO, prev.ammo + AMMO_RECHARGE_RATE)
      }));
    }

    // 3. Update Particles
    // Foam
    particlesRef.current.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.life--;
      p.size *= 0.95;
    });
    particlesRef.current = particlesRef.current.filter(p => p.life > 0);
    
    // Smoke
    smokeRef.current.forEach(p => {
      p.y -= 0.5; // Rise
      p.x += Math.sin(p.life * 0.1) * 0.2; // Drift
      p.life--;
      p.size += 0.1;
    });
    smokeRef.current = smokeRef.current.filter(p => p.life > 0);

    // Sparks
    sparksRef.current.forEach(p => {
        p.y -= 1; // Rise faster
        p.x += Math.sin(p.life * 0.5) * 0.5; // Jitter
        p.life--;
    });
    sparksRef.current = sparksRef.current.filter(p => p.life > 0);


    // 4. Entity Logic
    const entities = entitiesRef.current;
    let playerHit = false;
    let civsRescuedThisFrame = 0;

    for (let i = entities.length - 1; i >= 0; i--) {
      const ent = entities[i];
      
      if (ent.type === EntityType.FIRE) {
        const fire = ent as FireEntity;
        
        // Fire Crackling Sound
        if (Math.random() < 0.005) {
            if (fire.hp > 120) {
                audioManager.playBigFireCrackle();
            } else {
                audioManager.playFireCrackling();
            }
        }

        // Spawn Smoke
        if (Math.random() < 0.1) {
             smokeRef.current.push({
                 id: Math.random().toString(),
                 x: fire.x + Math.random()*TILE_SIZE,
                 y: fire.y,
                 vx: 0,
                 vy: -1,
                 life: 100 + Math.random() * 50,
                 color: 'rgba(100, 100, 100, 0.4)',
                 size: 2 + Math.random() * 4
             });
        }
        
        // Spawn Sparks
        if (Math.random() < 0.05) {
             sparksRef.current.push({
                 id: Math.random().toString(),
                 x: fire.x + Math.random()*TILE_SIZE,
                 y: fire.y + Math.random()*TILE_SIZE,
                 vx: 0,
                 vy: -1,
                 life: 30 + Math.random() * 20,
                 color: '#fca5a5', // Light red/pink
                 size: 1
             });
        }

        // Move
        if (fire.fireType === FireType.MOVING) {
           let fx = fire.x;
           const speed = 1.2;
           if (fire.moveDirection === 'LEFT') fx -= speed;
           else fx += speed;

           if (isWall(fx, fire.y) || isWall(fx + fire.width, fire.y)) {
              fire.moveDirection = fire.moveDirection === 'LEFT' ? 'RIGHT' : 'LEFT';
           } else {
              fire.x = fx;
           }
        }

        // Spread Logic
        if (fire.spreadTimer !== undefined) {
          // Speed increases with HP and Level
          const levelBonus = 1 + (stateRef.current.level * 0.15);
          const hpBonus = 0.5 + (fire.hp / 200);
          const spreadSpeed = levelBonus * hpBonus;
          
          fire.spreadTimer -= spreadSpeed;
          
          if (fire.spreadTimer <= 0) {
            // Reset timer - base on level
            fire.spreadTimer = FIRE_SPREAD_TIME * (1.5 - (stateRef.current.level * 0.1)) + Math.random() * 100;
            
            // Spread chance increases with HP and level
            const spreadChance = 0.15 + (fire.hp / 300) + (stateRef.current.level * 0.05);
            
            if (Math.random() < spreadChance) {
                const dirs = [[0,1], [0,-1], [1,0], [-1,0]];
                // Shuffle dirs for random spread
                dirs.sort(() => Math.random() - 0.5);
                
                for (const dir of dirs) {
                    const newX = fire.x + dir[0] * TILE_SIZE;
                    const newY = fire.y + dir[1] * TILE_SIZE;
                    
                    if (!isWall(newX, newY)) {
                       const alreadyFire = entities.some(e => e.type === EntityType.FIRE && Math.abs(e.x - newX) < 10 && Math.abs(e.y - newY) < 10);
                       if (!alreadyFire) {
                          entities.push({
                            ...fire,
                            id: `fire-spread-${Math.random()}`,
                            x: newX,
                            y: newY,
                            spreadTimer: FIRE_SPREAD_TIME * 1.2,
                            hp: 70 + Math.random() * 30
                          });
                          if (Math.random() > 0.7) audioManager.playFireSpread();
                          break; // Only spread to one tile at a time
                       }
                    }
                }
            }
          }
        }

        // Hit by Foam
        particlesRef.current.forEach((p) => {
           if (checkCollision({x: p.x, y: p.y, width: p.size, height: p.size}, fire)) {
              fire.hp -= 5;
              p.life = 0;
           }
        });

        if (fire.hp <= 0) {
          entities.splice(i, 1);
          scorchMarksRef.current.push({ x: fire.x, y: fire.y });
          setGameState(prev => ({ ...prev, score: prev.score + 50 }));
          continue;
        }

        // Fire collision box slightly smaller than tile
        const fireHitbox = {
            x: fire.x + 4,
            y: fire.y + 4,
            width: fire.width - 8,
            height: fire.height - 8
        };
        if (checkCollision(player, { ...fire, ...fireHitbox } as Entity)) {
           playerHit = true;
        }
      } 
      
      else if (ent.type === EntityType.CIVILIAN) {
        const civ = ent as CivilianEntity;
        
        if (civ.state === 'WAITING' && inp.interact && checkCollision(player, { ...civ, width: civ.width + 10, height: civ.height + 10 })) {
           civ.state = 'FOLLOWING';
           audioManager.playCivilianThankYou();
        }

        if (civ.state === 'FOLLOWING') {
           const dist = Math.hypot(player.x - civ.x, player.y - civ.y);
           if (dist > 28) { // Keep close
             const angle = Math.atan2(player.y - civ.y, player.x - civ.x);
             const cx = civ.x + Math.cos(angle) * (PLAYER_SPEED - 0.5); // Slightly slower than player
             const cy = civ.y + Math.sin(angle) * (PLAYER_SPEED - 0.5);
             
             // Simple wall sliding for civs
             if (resolveWallCollision(civ, cx, civ.y)) civ.x = cx;
             if (resolveWallCollision(civ, civ.x, cy)) civ.y = cy;
           }
        }
      }

      else if (ent.type === EntityType.AMMO_PICKUP) {
          if (checkCollision(player, ent)) {
              entities.splice(i, 1);
              setGameState(prev => ({ ...prev, ammo: Math.min(PLAYER_MAX_AMMO, prev.ammo + 30) }));
              audioManager.playPickup();
              continue;
          }
      }

      else if (ent.type === EntityType.HAZARD_ELECTRIC) {
          const hazard = ent as HazardEntity;
          hazard.timer -= dt;
          if (hazard.timer <= 0) {
              hazard.state = hazard.state === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
              hazard.timer = hazard.state === 'ACTIVE' ? 1000 : 2000;
              if (hazard.state === 'ACTIVE') audioManager.playSpark();
          }

          if (hazard.state === 'ACTIVE' && checkCollision(player, hazard)) {
              playerHit = true;
          }
      }

      else if (ent.type === EntityType.HAZARD_COLLAPSING) {
          const hazard = ent as HazardEntity;
          if (hazard.state === 'NORMAL' && checkCollision(player, hazard)) {
              hazard.state = 'CRACKING';
              hazard.timer = 800; // 0.8s to collapse
              audioManager.playCrumble();
          }

          if (hazard.state === 'CRACKING') {
              hazard.timer -= dt;
              if (hazard.timer <= 0) {
                  hazard.state = 'COLLAPSED';
              }
          }

          if (hazard.state === 'COLLAPSED' && checkCollision(player, hazard)) {
              playerHit = true;
              // Push player back slightly
              const angle = Math.atan2(player.y - hazard.y, player.x - hazard.x);
              player.x += Math.cos(angle) * 10;
              player.y += Math.sin(angle) * 10;
          }
      }

      else if (ent.type === EntityType.STAIRS || ent.type === EntityType.HELIPAD) {
         if (checkCollision(player, ent) && inp.interact) {
            const rescued = entities.filter(e => e.type === EntityType.CIVILIAN && (e as CivilianEntity).state === 'FOLLOWING').length;
            
            entities.forEach(e => {
                if (e.type === EntityType.CIVILIAN && (e as CivilianEntity).state === 'FOLLOWING') {
                    (e as CivilianEntity).state = 'SAVED';
                }
            });

            civsRescuedThisFrame = rescued;
            audioManager.playWin();
            
            // Time bonus: faster clearance = more points
            // Base bonus of 1000 for finishing, plus up to 1000 for speed
            const timeBonus = Math.max(0, Math.floor(2000 - (stateRef.current.time / 100)));
            
            if (stateRef.current.level >= MAX_LEVELS) {
                setGameState(prev => ({
                    ...prev,
                    civiliansRescued: prev.civiliansRescued + rescued,
                    score: prev.score + (rescued * 500) + 1000 + timeBonus,
                    gameWon: true,
                    victory: true,
                    screen: 'VICTORY'
                }));
            } else {
                setGameState(prev => ({
                    ...prev,
                    level: prev.level + 1,
                    civiliansRescued: prev.civiliansRescued + rescued,
                    score: prev.score + (rescued * 500) + 200 + timeBonus,
                    screen: 'PLAYING'
                }));
            }
         }
      }
    }

    if (playerHit) {
       screenShakeRef.current = 8;
       if (stateRef.current.health > 0) {
          if (Math.random() > 0.9) audioManager.playDamage();
          setGameState(prev => ({ ...prev, health: prev.health - FIRE_DAMAGE }));
       } else {
          setGameState(prev => ({ ...prev, gameOver: true, screen: 'GAMEOVER' }));
       }
    }
  };

  // --- Rendering Helpers ---
  const drawBrickWall = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => {
    // Base color
    ctx.fillStyle = '#374151'; // Gray 700
    ctx.fillRect(x, y, w, h);
    
    // Top bevel
    ctx.fillStyle = '#1f2937'; // Gray 800
    ctx.fillRect(x, y + h - 8, w, 8);
    
    // Brick pattern
    ctx.fillStyle = '#4b5563'; // Gray 600
    const brickH = 8;
    const brickW = 16;
    for(let by = y; by < y + h - 8; by += brickH) {
        const offset = (Math.floor((by - y) / brickH) % 2) * (brickW / 2);
        for(let bx = x - offset; bx < x + w; bx += brickW + 2) {
             if (bx >= x && bx + brickW <= x + w) {
                ctx.fillRect(bx, by + 1, brickW, brickH - 2);
             }
        }
    }
    
    // Top edge highlight
    ctx.fillStyle = '#6b7280'; // Gray 500
    ctx.fillRect(x, y, w, 2);
  };

  const drawFloor = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, even: boolean) => {
      // Improved floor colors for better contrast with entities
      ctx.fillStyle = even ? '#18181b' : '#27272a'; // Zinc 900 vs Zinc 800
      ctx.fillRect(x, y, w, h);
      
      // Tile detail
      ctx.strokeStyle = '#3f3f46'; // Zinc 700
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, w, h);
  };

  const drawFirefighter = (ctx: CanvasRenderingContext2D, entity: Entity, facing: Direction) => {
      const { x, y, width, height, vx = 0, vy = 0 } = entity;
      const isMoving = Math.abs(vx!) > 0.1 || Math.abs(vy!) > 0.1;
      const time = Date.now();
      const walkCycle = isMoving ? Math.sin(time / 80) : 0;
      const bob = isMoving ? Math.abs(Math.sin(time / 80)) * 2 : 0;

      ctx.save();
      // Translate to center of sprite
      ctx.translate(Math.floor(x + width / 2), Math.floor(y + height / 2));
      
      // Flip context for left facing to reuse RIGHT drawing logic
      if (facing === 'LEFT') {
          ctx.scale(-1, 1);
      }
      
      // Define sprite bounds relative to center (24x24 logical size)
      const w = 24;
      const h = 24;
      ctx.translate(-w/2, -h/2);

      // --- Shadow ---
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath();
      ctx.ellipse(w/2, h - 1, 8, 3, 0, 0, Math.PI * 2);
      ctx.fill();

      // --- LEGS ---
      ctx.fillStyle = '#1e3a8a'; // Dark Blue Pants
      const legLength = 7;
      const legWidth = 5;
      
      // Draw legs based on facing
      if (facing === 'UP' || facing === 'DOWN') {
          // Scissor effect vertical
          let lLegY = h - 8;
          let rLegY = h - 8;
          lLegY += walkCycle * 2;
          rLegY -= walkCycle * 2;
          
          // Boots
          ctx.fillStyle = '#111';
          ctx.fillRect(w/2 - 6, lLegY + legLength - 2, legWidth, 2); 
          ctx.fillRect(w/2 + 1, rLegY + legLength - 2, legWidth, 2);
          
          // Pants
          ctx.fillStyle = '#1e3a8a';
          ctx.fillRect(w/2 - 6, lLegY, legWidth, legLength - 2);
          ctx.fillRect(w/2 + 1, rLegY, legWidth, legLength - 2);
          
      } else {
          // Side View: Legs scissor outward
          const spread = walkCycle * 4;
          
          // Back leg (darker)
          ctx.fillStyle = '#172554'; 
          ctx.fillRect(w/2 - 2 + spread, h - 8, legWidth, legLength);
          ctx.fillStyle = '#000'; // Boot
          ctx.fillRect(w/2 - 2 + spread, h - 2, legWidth, 2);

          // Front leg
          ctx.fillStyle = '#1e3a8a';
          ctx.fillRect(w/2 - 2 - spread, h - 8, legWidth, legLength);
          ctx.fillStyle = '#111'; // Boot
          ctx.fillRect(w/2 - 2 - spread, h - 2, legWidth, 2);
      }

      // --- BODY ---
      const bodyY = h - 17 - bob; 
      
      // Tank (Visible if UP or SIDE)
      if (facing === 'UP' || facing === 'RIGHT' || facing === 'LEFT') {
           ctx.fillStyle = '#dc2626'; // Red Tank
           if (facing === 'UP') ctx.fillRect(w/2 - 5, bodyY + 2, 10, 11);
           else ctx.fillRect(w/2 - 6, bodyY + 3, 4, 10); // Side profile
           
           // Tank Detail
           ctx.fillStyle = '#f87171'; // Highlight
           if (facing === 'UP') ctx.fillRect(w/2 + 2, bodyY + 3, 2, 9);
      }

      // Coat Base
      ctx.fillStyle = '#eab308'; // Yellow
      ctx.fillRect(w/2 - 6, bodyY, 12, 12);
      
      // Reflective Stripes (Silver)
      ctx.fillStyle = '#e5e7eb'; 
      ctx.fillRect(w/2 - 6, bodyY + 7, 12, 2); // Horizontal
      
      if (facing === 'DOWN') {
          // Zipper / Front detail
          ctx.fillStyle = '#ca8a04'; 
          ctx.fillRect(w/2 - 1, bodyY, 2, 12);
          // Collar
          ctx.fillStyle = '#111';
          ctx.fillRect(w/2 - 3, bodyY, 6, 2);
      } else if (facing === 'UP') {
          // Back vertical stripe?
          ctx.fillStyle = '#e5e7eb';
          ctx.fillRect(w/2 - 1, bodyY, 2, 12);
      }

      // --- ARMS ---
      ctx.fillStyle = '#eab308'; // Sleeve
      if (facing === 'DOWN' || facing === 'UP') {
           const armSwing = walkCycle * 3;
           // Left Arm
           ctx.fillRect(w/2 - 9, bodyY + 1 + armSwing, 3, 9);
           // Right Arm
           ctx.fillRect(w/2 + 6, bodyY + 1 - armSwing, 3, 9);
           
           // Gloves
           ctx.fillStyle = '#111';
           ctx.fillRect(w/2 - 9, bodyY + 10 + armSwing, 3, 3);
           ctx.fillRect(w/2 + 6, bodyY + 10 - armSwing, 3, 3);
      } else {
           // Side arm
           const armSwing = -walkCycle * 3;
           ctx.fillRect(w/2 - 1, bodyY + 2 + armSwing, 4, 8);
           // Glove
           ctx.fillStyle = '#111';
           ctx.fillRect(w/2 - 1, bodyY + 10 + armSwing, 4, 3);
           
           // Nozzle if needed?
           // ctx.fillStyle = '#444';
           // ctx.fillRect(w/2 + 3, bodyY + 10 + armSwing, 4, 2);
      }

      // --- HEAD ---
      const headY = bodyY - 7;
      
      // Helmet Base
      ctx.fillStyle = '#b91c1c'; // Red Helmet
      
      if (facing === 'DOWN') {
          // Front View
          ctx.beginPath();
          ctx.moveTo(w/2 - 6, headY + 5);
          ctx.arc(w/2, headY + 3, 6, Math.PI, 0); // Dome
          ctx.lineTo(w/2 + 6, headY + 5);
          ctx.lineTo(w/2 + 7, headY + 7); // Brim flare
          ctx.lineTo(w/2 - 7, headY + 7);
          ctx.fill();
          
          // Badge
          ctx.fillStyle = '#fcd34d';
          ctx.fillRect(w/2 - 1, headY + 1, 2, 2);
          
          // Face
          ctx.fillStyle = '#fcd34d'; // Skin
          ctx.fillRect(w/2 - 3, headY + 6, 6, 4);
          
          // Visor (Up)
          ctx.fillStyle = '#374151'; // Dark visor glass
          ctx.fillRect(w/2 - 5, headY + 4, 10, 2);
      } 
      else if (facing === 'UP') {
          // Back View
          ctx.beginPath();
          ctx.arc(w/2, headY + 3, 6, Math.PI, 0);
          ctx.lineTo(w/2 + 7, headY + 8); // Long back brim
          ctx.lineTo(w/2 - 7, headY + 8);
          ctx.fill();
          // Neck protection?
          ctx.fillStyle = '#111';
          ctx.fillRect(w/2 - 4, headY + 8, 8, 2);
      } 
      else {
          // Side View
          ctx.beginPath();
          ctx.moveTo(w/2 - 4, headY + 5);
          ctx.arc(w/2, headY + 3, 6, Math.PI, -0.2); 
          ctx.lineTo(w/2 + 8, headY + 7); // Brim back
          ctx.lineTo(w/2 - 5, headY + 6); // Brim front
          ctx.fill();
          
          // Face
          ctx.fillStyle = '#fcd34d';
          ctx.fillRect(w/2 + 1, headY + 5, 4, 5);
          // Visor
          ctx.fillStyle = '#374151';
          ctx.fillRect(w/2 + 2, headY + 4, 4, 2);
      }

      ctx.restore();
  };

  const drawCivilian = (ctx: CanvasRenderingContext2D, entity: CivilianEntity) => {
      const { x, y, width, height } = entity;
      const time = Date.now();
      const bob = Math.sin(time / 200) * 1.5;

      ctx.save();
      ctx.translate(x + width/2, y + height/2 + bob);
      
      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(0, 8, 6, 2, 0, 0, Math.PI*2);
      ctx.fill();

      // Body
      ctx.fillStyle = '#16a34a'; // Green shirt
      ctx.fillRect(-4, -6, 8, 10);
      
      // Pants
      ctx.fillStyle = '#4b5563'; // Grey pants
      ctx.fillRect(-4, 4, 3, 5);
      ctx.fillRect(1, 4, 3, 5);

      // Head
      ctx.fillStyle = '#fca5a5'; // Skin
      ctx.fillRect(-4, -13, 8, 7);
      
      // Hair
      ctx.fillStyle = '#78350f'; // Brown hair
      ctx.fillRect(-4, -13, 8, 3);
      ctx.fillRect(-5, -10, 2, 3); // sideburns
      ctx.fillRect(3, -10, 2, 3);

      // Saved indicator
      if (entity.state === 'FOLLOWING') {
         ctx.fillStyle = '#22c55e';
         ctx.beginPath();
         ctx.arc(0, -18, 3, 0, Math.PI*2);
         ctx.fill();
      }
      
      // Help text bubble
      if (entity.state === 'WAITING' && Math.floor(Date.now() / 500) % 2 === 0) {
         ctx.fillStyle = 'white';
         ctx.font = '8px "Press Start 2P", monospace';
         ctx.textAlign = 'center';
         ctx.fillText('HELP!', 0, -20);
      }
      
      ctx.restore();
  };

  // --- Main Draw ---
  const draw = (ctx: CanvasRenderingContext2D, frameCount: number) => {
    ctx.save();
    
    // Apply Screen Shake
    if (screenShakeRef.current > 0) {
        const sx = (Math.random() - 0.5) * screenShakeRef.current;
        const sy = (Math.random() - 0.5) * screenShakeRef.current;
        ctx.translate(sx, sy);
        screenShakeRef.current *= 0.9;
        if (screenShakeRef.current < 0.1) screenShakeRef.current = 0;
    }

    // Clear
    ctx.fillStyle = '#0f172a'; // Deep dark blue bg
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    if (!mapRef.current || mapRef.current.length === 0) {
        ctx.restore();
        return;
    }

    // 1. Draw Map Layers
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;
        if (mapRef.current[y][x] === 1) {
          drawBrickWall(ctx, px, py, TILE_SIZE, TILE_SIZE);
        } else {
          drawFloor(ctx, px, py, TILE_SIZE, TILE_SIZE, (x + y) % 2 === 0);
        }
      }
    }

    // 2. Scorch Marks
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    scorchMarksRef.current.forEach(mark => {
        ctx.beginPath();
        ctx.arc(mark.x + TILE_SIZE/2, mark.y + TILE_SIZE/2, TILE_SIZE/2 - 4, 0, Math.PI*2);
        ctx.fill();
        
        // Add some detail to scorch marks
        ctx.fillStyle = 'rgba(20, 20, 20, 0.3)';
        for(let i=0; i<3; i++) {
            const rx = mark.x + Math.random() * TILE_SIZE;
            const ry = mark.y + Math.random() * TILE_SIZE;
            ctx.beginPath();
            ctx.arc(rx, ry, 4, 0, Math.PI*2);
            ctx.fill();
        }
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    });

    // 3. Entities
    const entities = [...entitiesRef.current, ...particlesRef.current, ...smokeRef.current, ...sparksRef.current];
    // Sort by Y for pseudo-depth
    entities.sort((a, b) => (a.y + (a.height||0)) - (b.y + (b.height||0)));

    entities.forEach(ent => {
       // --- Particles ---
       if ((ent as Particle).life !== undefined) {
         const p = ent as Particle;
         ctx.globalAlpha = Math.min(1, p.life / 20);
         ctx.fillStyle = p.color;
         ctx.beginPath();
         ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
         ctx.fill();
         ctx.globalAlpha = 1;
         return;
       }

       // --- Game Entities ---
       const entity = ent as Entity;

       // HELIPAD
       if (entity.type === EntityType.HELIPAD) {
          const pulse = Math.sin(Date.now() / 300) * 0.2 + 0.8;
          ctx.save();
          ctx.translate(entity.x + entity.width/2, entity.y + entity.height/2);
          
          // Glow
          ctx.shadowBlur = 20 * pulse;
          ctx.shadowColor = '#fcd34d';
          
          ctx.fillStyle = '#fcd34d';
          ctx.beginPath();
          ctx.arc(0, 0, 24, 0, Math.PI*2);
          ctx.fill();
          
          ctx.strokeStyle = '#b45309';
          ctx.lineWidth = 4;
          ctx.stroke();
          
          ctx.fillStyle = '#b45309';
          ctx.font = 'bold 24px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText("H", 0, 2);
          ctx.restore();
       }

       // STAIRS
       else if (entity.type === EntityType.STAIRS) {
          const pulse = Math.sin(Date.now() / 300) * 0.2 + 0.8;
          ctx.save();
          
          // Glow
          ctx.shadowBlur = 15 * pulse;
          ctx.shadowColor = '#fcd34d';
          
          // Background
          ctx.fillStyle = '#fcd34d'; // Bright yellow/gold
          ctx.fillRect(entity.x, entity.y, entity.width, entity.height);
          
          // Border
          ctx.strokeStyle = '#b45309';
          ctx.lineWidth = 2;
          ctx.strokeRect(entity.x, entity.y, entity.width, entity.height);
          
          // Steps
          ctx.fillStyle = '#b45309';
          for(let i=0; i<4; i++) {
              ctx.fillRect(entity.x + 4, entity.y + 4 + i*6, entity.width - 8, 3);
          }
          
          // Arrow pointing up
          ctx.fillStyle = '#b45309';
          ctx.beginPath();
          ctx.moveTo(entity.x + entity.width/2, entity.y + 2);
          ctx.lineTo(entity.x + entity.width/2 - 6, entity.y + 10);
          ctx.lineTo(entity.x + entity.width/2 + 6, entity.y + 10);
          ctx.fill();
          
          ctx.restore();
       }

       // FIRE
       else if (entity.type === EntityType.FIRE) {
          const fire = ent as FireEntity;
          const time = Date.now() / 150; 
          const flicker = Math.sin(time * 2) * 0.1;
          const intensity = fire.hp / 100;
          
          ctx.save();
          
          // Glow
          ctx.shadowBlur = 15 + intensity * 10;
          ctx.shadowColor = 'rgba(239, 68, 68, 0.6)';
          
          // Flame Logic: procedural quadratic curves
          const drawFlameLayer = (color: string, scaleX: number, scaleY: number, timeOffset: number) => {
              ctx.fillStyle = color;
              ctx.beginPath();
              
              const cx = entity.x + TILE_SIZE/2;
              const by = entity.y + TILE_SIZE; // Bottom Y
              const flameH = TILE_SIZE * (0.8 + flicker + intensity * 0.2);
              const flameW = TILE_SIZE * (0.8 + intensity * 0.2);

              ctx.moveTo(cx - (flameW/2 * scaleX), by); // Bottom Left
              
              // Animated Tip
              const tipX = cx + Math.sin(time + timeOffset) * (8 * scaleX);
              const tipY = by - (flameH * scaleY);
              
              // Curves
              ctx.quadraticCurveTo(
                  cx - (flameW * scaleX), 
                  by - (flameH * 0.5), 
                  tipX, 
                  tipY
              );
              
              ctx.quadraticCurveTo(
                  cx + (flameW * scaleX), 
                  by - (flameH * 0.5), 
                  cx + (flameW/2 * scaleX), 
                  by
              );
              
              ctx.fill();
          };

          // Draw layers
          drawFlameLayer('#b91c1c', 1.0, 1.0, 0); // Red
          drawFlameLayer('#ea580c', 0.8, 0.9, 1); // Orange
          drawFlameLayer('#fbbf24', 0.5, 0.7, 2); // Yellow
          drawFlameLayer('#ffffff', 0.2, 0.4, 3); // White core

          ctx.restore();
       }

       // PLAYER
       else if (entity.type === EntityType.PLAYER) {
           drawFirefighter(ctx, entity, playerFacingRef.current);
       }

       // CIVILIAN
       else if (entity.type === EntityType.CIVILIAN) {
           drawCivilian(ctx, entity as CivilianEntity);
       }

       // AMMO PICKUP
       else if (entity.type === EntityType.AMMO_PICKUP) {
           ctx.save();
           ctx.translate(entity.x + entity.width/2, entity.y + entity.height/2);
           const bounce = Math.sin(Date.now() / 200) * 2;
           ctx.translate(0, bounce);
           
           // Extinguisher bottle shape
           ctx.fillStyle = '#ef4444'; // Red
           ctx.fillRect(-4, -6, 8, 12);
           ctx.fillStyle = '#444'; // Top
           ctx.fillRect(-5, -8, 10, 2);
           ctx.fillRect(-2, -10, 4, 2);
           
           // Label
           ctx.fillStyle = 'white';
           ctx.fillRect(-2, -2, 4, 4);
           
           ctx.restore();
       }

       // HAZARDS
       else if (entity.type === EntityType.HAZARD_ELECTRIC) {
           const hazard = entity as HazardEntity;
           ctx.save();
           ctx.fillStyle = hazard.state === 'ACTIVE' ? '#facc15' : '#422006';
           ctx.fillRect(entity.x, entity.y, entity.width, entity.height);
           
           if (hazard.state === 'ACTIVE') {
               // Draw sparks
               ctx.strokeStyle = 'white';
               ctx.lineWidth = 2;
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
               // Draw cracks
               ctx.strokeStyle = '#451a03';
               ctx.lineWidth = 2;
               ctx.beginPath();
               ctx.moveTo(entity.x, entity.y);
               ctx.lineTo(entity.x + entity.width, entity.y + entity.height);
               ctx.moveTo(entity.x + entity.width, entity.y);
               ctx.lineTo(entity.x, entity.y + entity.height);
               ctx.stroke();
           } else if (hazard.state === 'COLLAPSED') {
               ctx.fillStyle = '#000';
               ctx.fillRect(entity.x, entity.y, entity.width, entity.height);
           }
           ctx.restore();
       }
       
       // HELICOPTER
       else if (entity.type === EntityType.HELICOPTER) {
           ctx.save();
           ctx.translate(entity.x, entity.y);
           // Body
           ctx.fillStyle = '#9ca3af'; // light gray
           ctx.beginPath();
           ctx.ellipse(30, 40, 30, 15, 0, 0, Math.PI*2);
           ctx.fill();
           // Tail
           ctx.fillRect(50, 35, 30, 5);
           ctx.fillRect(75, 25, 5, 15);
           // Window
           ctx.fillStyle = '#93c5fd';
           ctx.beginPath();
           ctx.arc(20, 40, 8, 0, Math.PI*2);
           ctx.fill();
           // Rotor
           ctx.fillStyle = '#111';
           ctx.fillRect(10, 25, 40, 2); // Mast
           // Blur blade
           ctx.fillStyle = `rgba(0,0,0, ${0.3 + Math.random()*0.3})`;
           ctx.fillRect(-10, 25, 80, 4);

           ctx.restore();
       }
    });

    // 4. Lighting / Vignette
    // Create a radial gradient around the player
    if (playerRef.current) {
        const p = playerRef.current;
        const cx = p.x + p.width/2;
        const cy = p.y + p.height/2;

        const grad = ctx.createRadialGradient(cx, cy, 60, cx, cy, 300);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(0.5, 'rgba(0,0,0,0.3)');
        grad.addColorStop(1, 'rgba(0,0,0,0.85)');

        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }
    
    ctx.restore();
  };

  // --- Animation Loop ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Disable smoothing for sharp pixel art
    ctx.imageSmoothingEnabled = false;

    let frameCount = 0;
    const loop = (time: number) => {
      const dt = time - lastTimeRef.current;
      lastTimeRef.current = time;
      frameCount++;

      update(dt);
      draw(ctx, frameCount);
      requestRef.current = requestAnimationFrame(loop);
    };

    requestRef.current = requestAnimationFrame(loop);
    return () => {
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
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