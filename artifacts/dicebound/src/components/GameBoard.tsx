import { getWalkDirection, TileType, RunState, WALK_DIRECTION_DELTAS } from '../engine';
import type { WalkDirection } from '../engine';
import { MapPin, Sword, Skull, ShoppingBag, Gift, Tent, AlertTriangle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import statueUrl from '../assets/statue.png';
import treeUrl from '../assets/tree.png';
import forestClearingUrl from '../assets/forest-clearing.webp';
import customWalkSouthEastUrl from '../assets/custom-walk-south-east.png';
import customWalkSouthWestUrl from '../assets/custom-walk-south-west.png';
import customWalkNorthWestUrl from '../assets/custom-walk-north-west.png';
import customWalkNorthEastUrl from '../assets/custom-walk-north-east.png';
import greenTileUrl from '../assets/tiles/green.png';
import redTileUrl from '../assets/tiles/red.png';
import orangeTileUrl from '../assets/tiles/orange.png';
import creamTileUrl from '../assets/tiles/cream.png';
import purpleTileUrl from '../assets/tiles/purple.png';
import { SpriteAnimator, usePrefersReducedMotion } from './SpriteAnimator';
import type { SpriteName } from './SpriteAnimator';

/**
 * Board coordinates are deliberately independent from the hero art.  The
 * hero remains a 64px world actor while the board surface grows to an
 * 84x42 isometric tile, making each step easier to read without scaling the
 * whole scene (or changing the 2:1 projection).
 */
export const TILE_WIDTH = 84;
export const TILE_HEIGHT = 42;
export const TILE_STEP_MS = 300;
export const TILE_SURFACE_DEPTH = 6;

const WORLD_SCALE = TILE_WIDTH / 64;
const HALF_TILE_WIDTH = TILE_WIDTH / 2;
const HALF_TILE_HEIGHT = TILE_HEIGHT / 2;
const TILE_IMAGE_HEIGHT = 38 * WORLD_SCALE;
const TILE_WALL_FACE_WIDTH = HALF_TILE_WIDTH;
const PIT_DEPTH = 90 * WORLD_SCALE;
const COURTYARD_SIZE = 64 * 2.5 * Math.SQRT2 * WORLD_SCALE;
const COURTYARD_CELL_SIZE = COURTYARD_SIZE / 5;
const STATUE_RISE_DISTANCE = 80 * WORLD_SCALE;

export const BOSS_AWAKENING_DURATION_MS = 2200;

function getGridCoords(index: number) {
  if (index < 7) {
    return { x: index, y: 0 };
  } else if (index < 13) {
    return { x: 6, y: index - 6 };
  } else if (index < 19) {
    return { x: 6 - (index - 12), y: 6 };
  } else {
    return { x: 0, y: 6 - (index - 18) };
  }
}

export { getWalkDirection, WALK_DIRECTION_DELTAS };
export type { WalkDirection };

export function normalizeTileIndex(index: number) {
  const safeIndex = Number.isFinite(index) ? Math.trunc(index) % 24 : 0;
  return safeIndex < 0 ? safeIndex + 24 : safeIndex;
}

export function getTilePosition(index: number = 0) {
  const i = normalizeTileIndex(index);
  
  const { x, y } = getGridCoords(i);
  const cx = x - 3;
  const cy = y - 3;
  
  const isoX = (cx - cy) * (TILE_WIDTH / 2);
  const isoY = (cx + cy) * (TILE_HEIGHT / 2);
  
  return { x: isoX, y: isoY, zIndex: x + y };
}

export interface TileMotion {
  from: number;
  to: number;
  progress: number;
  durationMs: number;
}

export interface TileContactMotion {
  /** The tile currently carrying the hero's feet. */
  supportTile: number;
  /** Surface depth under that support tile and the hero. */
  supportDepth: number;
  /** The departure tile's current depth. */
  departureDepth: number;
  /** The destination tile's current depth. */
  arrivalDepth: number;
}

function clampProgress(progress: number) {
  return Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
}

function smoothStep(progress: number) {
  const t = clampProgress(progress);
  return t * t * (3 - 2 * t);
}

/**
 * Keep the feet in contact with the board while the actor moves between
 * tiles.  The first half of a step releases the departure tile; the second
 * half settles onto the destination.  Both curves meet at zero depth at the
 * midpoint, so changing support tiles never causes a lateral hop.
 */
export function getTileContactMotion(motion: Pick<TileMotion, 'from' | 'to' | 'progress'>): TileContactMotion {
  const progress = clampProgress(motion.progress);

  if (motion.from === motion.to || progress >= 1) {
    return {
      supportTile: motion.to,
      supportDepth: TILE_SURFACE_DEPTH,
      departureDepth: motion.from === motion.to ? TILE_SURFACE_DEPTH : 0,
      arrivalDepth: TILE_SURFACE_DEPTH,
    };
  }

  const midpoint = progress < 0.5;
  const halfProgress = midpoint ? progress * 2 : (progress - 0.5) * 2;
  const eased = smoothStep(halfProgress);
  const departureDepth = midpoint ? TILE_SURFACE_DEPTH * (1 - eased) : 0;
  const arrivalDepth = midpoint ? 0 : TILE_SURFACE_DEPTH * eased;

  return {
    supportTile: midpoint ? motion.from : motion.to,
    supportDepth: midpoint ? departureDepth : arrivalDepth,
    departureDepth,
    arrivalDepth,
  };
}

function useTileMotion(targetPosition: number, speed: number, reducedMotion: boolean) {
  const previousTarget = useRef(targetPosition);
  const [motion, setMotion] = useState<TileMotion>({
    from: targetPosition,
    to: targetPosition,
    progress: 1,
    durationMs: reducedMotion ? 1 : TILE_STEP_MS,
  });

  useEffect(() => {
    if (targetPosition === previousTarget.current) return;

    const from = previousTarget.current;
    previousTarget.current = targetPosition;
    setMotion({
      from,
      to: targetPosition,
      progress: reducedMotion ? 1 : 0,
      durationMs: reducedMotion ? 1 : TILE_STEP_MS / Math.max(1, speed),
    });
  }, [reducedMotion, speed, targetPosition]);

  useEffect(() => {
    if (motion.progress >= 1) return;

    let frameId = 0;
    const startedAt = performance.now();
    const animate = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / motion.durationMs);
      setMotion(current => current.progress === progress ? current : { ...current, progress });
      if (progress < 1) frameId = requestAnimationFrame(animate);
    };

    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [motion.from, motion.to, motion.durationMs]);

  const from = getTilePosition(motion.from);
  const to = getTilePosition(motion.to);
  const progress = motion.progress;

  return {
    from: motion.from,
    to: motion.to,
    position: {
      x: from.x + (to.x - from.x) * progress,
      y: from.y + (to.y - from.y) * progress,
      zIndex: progress < 0.5 ? from.zIndex : to.zIndex,
    },
    moving: progress < 1,
    contact: getTileContactMotion(motion),
  };
}

const TILE_THEMES: Record<TileType, { image: string, color: string, icon: any }> = {
  start: { image: creamTileUrl, color: 'text-stone-600', icon: MapPin },
  enemy: { image: creamTileUrl, color: 'text-stone-700', icon: Sword },
  elite: { image: redTileUrl, color: 'text-red-900', icon: Skull },
  event: { image: purpleTileUrl, color: 'text-purple-900', icon: AlertTriangle },
  shop: { image: orangeTileUrl, color: 'text-amber-900', icon: ShoppingBag },
  rest: { image: greenTileUrl, color: 'text-emerald-900', icon: Tent },
  minigame: { image: orangeTileUrl, color: 'text-amber-900', icon: Gift }
};

export function GameBoard({ run, visualPosition, speed = 1 }: { run: RunState, visualPosition: number, speed?: number }) {
  const reducedMotion = usePrefersReducedMotion();
  const tileMotion = useTileMotion(visualPosition, speed, reducedMotion);
  // Camera movement follows the flat path. Only the actor and the tile
  // surface inherit the local depression, so the camera does not cancel out
  // the step-on/step-off cue.
  const heroPos = tileMotion.position;
  const heroSurfaceY = heroPos.y + tileMotion.contact.supportDepth;
  const [heroTravelDirection, setHeroTravelDirection] = useState<WalkDirection>('south-east');
  const previousVisualPosition = useRef(visualPosition);

  useEffect(() => {
    if (visualPosition === previousVisualPosition.current) return;
    const direction = getWalkDirection(previousVisualPosition.current, visualPosition);
    if (direction) setHeroTravelDirection(direction);
    previousVisualPosition.current = visualPosition;
  }, [visualPosition]);

  const walking = run.phase === 'moving' || tileMotion.moving;
  const heroDirection = heroTravelDirection;
  const walkSprites: Record<WalkDirection, { sprite: SpriteName; fallbackUrl: string }> = {
    'south-east': { sprite: 'custom-walk-south-east', fallbackUrl: customWalkSouthEastUrl },
    'south-west': { sprite: 'custom-walk-south-west', fallbackUrl: customWalkSouthWestUrl },
    'north-west': { sprite: 'custom-walk-north-west', fallbackUrl: customWalkNorthWestUrl },
    'north-east': { sprite: 'custom-walk-north-east', fallbackUrl: customWalkNorthEastUrl },
  };
  const activeWalkSprite = walkSprites[heroDirection];

  const isAwakening = run.phase === 'boss_awakening';
  const isBossActive = isAwakening || run.phase === 'boss_ready' || (run.phase === 'combat' && run.isBossCombat) || run.phase === 'victory';

  // Keep the boss framing fixed while the board grows; explore framing still
  // follows the flat (non-depressed) hero path.
  const cameraTarget = isBossActive ? { x: 0, y: 16 } : heroPos;

  const [cameraTransition, setCameraTransition] = useState(false);
  const prevBossActive = useRef(isBossActive);

  useEffect(() => {
    if (isBossActive !== prevBossActive.current) {
      prevBossActive.current = isBossActive;
      setCameraTransition(true);
      const timer = setTimeout(() => setCameraTransition(false), BOSS_AWAKENING_DURATION_MS);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [isBossActive]);

  const cameraFollow = 0.96;

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div 
        className="relative w-0 h-0"
        style={{ 
          transform: `translate(${-cameraTarget.x * cameraFollow}px, ${-cameraTarget.y * cameraFollow + 40}px)`,
          transition: cameraTransition && !reducedMotion ? `transform ${BOSS_AWAKENING_DURATION_MS}ms cubic-bezier(0.4, 0, 0.2, 1)` : 'none'
        }}
      >
        {/* The forest is part of the world, not a fixed screen backdrop. */}
        <img
          src={forestClearingUrl}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="absolute max-w-none object-cover pointer-events-none"
          style={{
            width: 'calc(min(100vw, 390px) + 440px)',
            height: 'calc(200dvh + 440px)',
            left: 0,
            top: 0,
            transform: 'translate(-50%, -50%)',
            zIndex: -1,
          }}
        />
        
        {/* Pit Courtyard Floor */}
        <div 
          className="absolute pointer-events-none"
          style={{
            width: `${COURTYARD_SIZE}px`,
            height: `${COURTYARD_SIZE}px`,
            left: `${-COURTYARD_SIZE / 2}px`,
            top: `${HALF_TILE_HEIGHT + PIT_DEPTH - COURTYARD_SIZE / 2}px`,
            transform: 'scaleY(0.5) rotate(45deg)',
            zIndex: 2,
            backgroundColor: '#1c1917', // stone-900
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
            backgroundSize: `${COURTYARD_CELL_SIZE}px ${COURTYARD_CELL_SIZE}px`, // 5x5 grid
            boxShadow: 'inset 0 0 50px rgba(0,0,0,1)'
          }}
        />

        {/* Center Statue */}
        <div 
          className="absolute pointer-events-none"
          style={{ 
            transform: `translate(0px, ${HALF_TILE_HEIGHT + PIT_DEPTH}px)`,
            zIndex: 6 
          }}
        >
          <div 
            className="absolute transition-all ease-in-out"
            style={{
              transform: isBossActive ? `translateY(-${STATUE_RISE_DISTANCE}px)` : 'translateY(0px)',
              transitionDuration: reducedMotion ? '0ms' : `${BOSS_AWAKENING_DURATION_MS}ms`,
              filter: isBossActive ? `drop-shadow(0 0 15px rgba(234, 179, 8, 0.6)) drop-shadow(0 0 30px rgba(34, 197, 94, 0.4))` : 'none'
            }}
          >
            {/* Statue Image */}
            <div className="absolute w-[200px] h-[200px] -ml-[100px] -mt-[170px]">
              <img src={statueUrl} className="w-full h-full object-contain" alt="Statue" />
              
              {/* Magic glow overlay */}
              <div 
                className="absolute inset-0 transition-opacity ease-in-out mix-blend-color-dodge"
                style={{
                  background: 'radial-gradient(circle at 50% 60%, rgba(234,179,8,0.4) 0%, transparent 60%)',
                  opacity: isBossActive ? 1 : 0,
                  transitionDuration: reducedMotion ? '0ms' : `${BOSS_AWAKENING_DURATION_MS}ms`
                }}
              />
            </div>
          </div>
        </div>
        
        {/* Scenery - Trees */}
        <div
          className="absolute z-[1]"
          style={{
            width: `${100 * WORLD_SCALE}px`,
            height: `${120 * WORLD_SCALE}px`,
            marginLeft: `${-180 * WORLD_SCALE}px`,
            marginTop: `${-20 * WORLD_SCALE}px`,
          }}
        >
           <img src={treeUrl} className="w-full h-full object-contain drop-shadow-xl" alt="Tree" />
        </div>
        <div
          className="absolute z-[0]"
          style={{
            width: `${80 * WORLD_SCALE}px`,
            height: `${100 * WORLD_SCALE}px`,
            marginLeft: `${100 * WORLD_SCALE}px`,
            marginTop: `${-80 * WORLD_SCALE}px`,
          }}
        >
           <img src={treeUrl} className="w-full h-full object-contain drop-shadow-xl" alt="Tree" />
        </div>
        <div
          className="absolute z-[10]"
          style={{
            width: `${120 * WORLD_SCALE}px`,
            height: `${140 * WORLD_SCALE}px`,
            marginLeft: `${-50 * WORLD_SCALE}px`,
            marginTop: `${40 * WORLD_SCALE}px`,
          }}
        >
           <img src={treeUrl} className="w-full h-full object-contain drop-shadow-xl" alt="Tree" />
        </div>
        
        {/* Grid Tiles */}
        {run.tiles.map((t, i) => {
          const p = getTilePosition(i);
          const theme = TILE_THEMES[t.type];
          const Icon = theme.icon;
          const surfaceDepth = i === normalizeTileIndex(tileMotion.from)
            ? tileMotion.contact.departureDepth
            : i === normalizeTileIndex(tileMotion.to)
              ? tileMotion.contact.arrivalDepth
              : 0;

          return (
            <div
              key={t.id}
              className="absolute board-tile"
              style={{
                width: `${TILE_WIDTH}px`,
                height: `${TILE_HEIGHT}px`,
                marginLeft: `${-HALF_TILE_WIDTH}px`,
                marginTop: `${-HALF_TILE_HEIGHT}px`,
                transform: `translate(${p.x}px, ${p.y}px)`,
                zIndex: p.zIndex
              }}
            >
              {/* Left Wall Skirt (Front-Left face) */}
              <div
                className="absolute board-tile-wall board-tile-wall--left pointer-events-none"
                style={{
                  left: '0px',
                  top: `${HALF_TILE_HEIGHT}px`,
                  width: `${TILE_WALL_FACE_WIDTH}px`,
                  height: `${PIT_DEPTH}px`,
                  transformOrigin: 'top left',
                  transform: 'skewY(26.565deg)',
                  background: 'linear-gradient(to bottom, #78716c, #292524)'
                }}
              />
              {/* Right Wall Skirt (Front-Right face) */}
              <div
                className="absolute board-tile-wall board-tile-wall--right pointer-events-none"
                style={{
                  left: `${HALF_TILE_WIDTH}px`,
                  top: `${TILE_HEIGHT}px`,
                  width: `${TILE_WALL_FACE_WIDTH}px`,
                  height: `${PIT_DEPTH}px`,
                  transformOrigin: 'top left',
                  transform: 'skewY(-26.565deg)',
                  background: 'linear-gradient(to bottom, #57534e, #1c1917)'
                }}
              />

              {/* Only the top and icon follow the surface. The wall
                  foundations stay put so the pit never bounces or covers
                  the depressed texture. */}
              <div
                className="absolute board-tile-surface z-10"
                style={{
                  width: `${TILE_WIDTH}px`,
                  height: `${TILE_HEIGHT}px`,
                  transform: `translateY(${surfaceDepth}px)`,
                }}
              >
                <img
                  src={theme.image}
                  alt={`${t.type} tile`}
                  draggable={false}
                  className="absolute top-0 left-0 max-w-none"
                  style={{
                    width: `${TILE_WIDTH}px`,
                    height: `${TILE_IMAGE_HEIGHT}px`,
                    filter: 'drop-shadow(0 3px 2px rgba(0,0,0,0.16))',
                  }}
                />
                {t.type !== 'start' && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none -mt-1">
                    <Icon className={`w-5 h-5 ${theme.color}`} strokeWidth={3} />
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Hero */}
        <div 
          className={`absolute w-[64px] h-[72px] -ml-[32px] -mt-[56px] hero-world-actor ${walking ? 'hero-world-actor--walking' : ''}`}
          style={{ 
            transform: `translate(${heroPos.x}px, ${heroSurfaceY}px)`,
            zIndex: heroPos.zIndex + 1 
          }}
        >
          <div className="hero-world-shadow" aria-hidden="true" />
          <div className="hero-world-dust" aria-hidden="true" />
          <SpriteAnimator
            sprite={activeWalkSprite.sprite}
            fallbackUrl={activeWalkSprite.fallbackUrl}
            active={walking}
            loop
            trigger={walking ? 1 : 0}
            fps={12}
            frameCount={9}
            durationMs={1800}
            alt="Hero"
            className="relative z-[1] drop-shadow-xl"
          />
        </div>

      </div>
    </div>
  );
}
