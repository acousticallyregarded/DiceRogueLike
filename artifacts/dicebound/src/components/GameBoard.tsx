import { getWalkDirection, Tile, TileType, RunState, WALK_DIRECTION_DELTAS } from '../engine';
import type { WalkDirection } from '../engine';
import { MapPin, Sparkles, Sword, Skull, ShoppingBag, Gift, Tent, AlertTriangle } from 'lucide-react';
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

const TILE_WIDTH = 64;
const TILE_HEIGHT = 32;
const TILE_STEP_MS = 300;

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

export function getTilePosition(index: number = 0) {
  const safeIndex = (Number(index) || 0) % 24;
  const i = safeIndex < 0 ? safeIndex + 24 : safeIndex;
  
  const { x, y } = getGridCoords(i);
  const cx = x - 3;
  const cy = y - 3;
  
  const isoX = (cx - cy) * (TILE_WIDTH / 2);
  const isoY = (cx + cy) * (TILE_HEIGHT / 2);
  
  return { x: isoX, y: isoY, zIndex: x + y };
}

interface TileMotion {
  from: number;
  to: number;
  progress: number;
  durationMs: number;
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
      progress: 0,
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
    position: {
      x: from.x + (to.x - from.x) * progress,
      y: from.y + (to.y - from.y) * progress,
      zIndex: progress < 0.5 ? from.zIndex : to.zIndex,
    },
    moving: progress < 1,
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

const PIT_DEPTH = 90;

export function GameBoard({ run, visualPosition, speed = 1 }: { run: RunState, visualPosition: number, speed?: number }) {
  const reducedMotion = usePrefersReducedMotion();
  const tileMotion = useTileMotion(visualPosition, speed, reducedMotion);
  const heroPos = tileMotion.position;
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

  // Statue center is at x: 0, y: 16 (relative to grid center). Camera overrides to center when boss is active.
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
            width: '226.27px',
            height: '226.27px',
            left: '-113.13px',
            top: `${16 + PIT_DEPTH - 113.13}px`, 
            transform: 'scaleY(0.5) rotate(45deg)',
            zIndex: 2,
            backgroundColor: '#1c1917', // stone-900
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
            backgroundSize: '45.25px 45.25px', // 5x5 grid (226.27 / 5)
            boxShadow: 'inset 0 0 50px rgba(0,0,0,1)'
          }}
        />

        {/* Center Statue */}
        <div 
          className="absolute pointer-events-none"
          style={{ 
            transform: `translate(0px, ${16 + PIT_DEPTH}px)`,
            zIndex: 6 
          }}
        >
          <div 
            className="absolute transition-all ease-in-out"
            style={{
              transform: isBossActive ? `translateY(-80px)` : `translateY(0px)`,
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
        <div className="absolute w-[100px] h-[120px] -ml-[180px] -mt-[20px] z-[1]">
           <img src={treeUrl} className="w-full h-full object-contain drop-shadow-xl" alt="Tree" />
        </div>
        <div className="absolute w-[80px] h-[100px] ml-[100px] -mt-[80px] z-[0]">
           <img src={treeUrl} className="w-full h-full object-contain drop-shadow-xl" alt="Tree" />
        </div>
        <div className="absolute w-[120px] h-[140px] -ml-[50px] mt-[40px] z-[10]">
           <img src={treeUrl} className="w-full h-full object-contain drop-shadow-xl" alt="Tree" />
        </div>
        
        {/* Grid Tiles */}
        {run.tiles.map((t, i) => {
          const p = getTilePosition(i);
          const theme = TILE_THEMES[t.type];
          const Icon = theme.icon;
          
          return (
            <div 
              key={t.id}
              className="absolute w-[64px] h-[32px] -ml-[32px] -mt-[16px] transition-transform duration-300"
              style={{ 
                transform: `translate(${p.x}px, ${p.y}px)`, 
                zIndex: p.zIndex 
              }}
            >
              {/* Left Wall Skirt (Front-Left face) */}
              <div 
                className="absolute pointer-events-none"
                style={{ 
                  left: '0px', top: '16px', width: '33px', height: `${PIT_DEPTH}px`, 
                  transformOrigin: 'top left', transform: 'skewY(26.565deg)',
                  background: 'linear-gradient(to bottom, #78716c, #292524)'
                }} 
              />
              {/* Right Wall Skirt (Front-Right face) */}
              <div 
                className="absolute pointer-events-none"
                style={{ 
                  left: '32px', top: '32px', width: '33px', height: `${PIT_DEPTH}px`, 
                  transformOrigin: 'top left', transform: 'skewY(-26.565deg)',
                  background: 'linear-gradient(to bottom, #57534e, #1c1917)'
                }} 
              />

              <img
                src={theme.image}
                alt={`${t.type} tile`}
                draggable={false}
                className="absolute top-0 left-0 w-[64px] h-[38px] max-w-none z-10"
                style={{ filter: 'drop-shadow(0 3px 2px rgba(0,0,0,0.16))' }}
              />
              {t.type !== 'start' && (
                <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none -mt-1">
                  <Icon className={`w-4 h-4 ${theme.color}`} strokeWidth={3} />
                </div>
              )}
            </div>
          );
        })}

        {/* Hero */}
        <div 
          className={`absolute w-[64px] h-[72px] -ml-[32px] -mt-[56px] hero-world-actor ${walking ? 'hero-world-actor--walking' : ''}`}
          style={{ 
            transform: `translate(${heroPos.x}px, ${heroPos.y}px)`, 
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
