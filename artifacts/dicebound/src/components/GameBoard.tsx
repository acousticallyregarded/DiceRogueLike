import { TileType, RunState, WALK_DIRECTION_DELTAS } from '../engine';
import type { WalkDirection } from '../engine';
import { MapPin, Sword, Skull, ShoppingBag, Gift, Tent, AlertTriangle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { CenterStatue } from './CenterStatue';
import { ForestOaks } from './ForestOaks';
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
import { BoardTileObject } from './BoardTileObject';
import { HeroSprite } from './HeroSprite';
import { getTilePosition, normalizeTileIndex, getTrailWalkDirection, TILE_WIDTH, TILE_HEIGHT } from './TrailMath';

export { WALK_DIRECTION_DELTAS, getTilePosition, normalizeTileIndex };
export type { WalkDirection };
// Also export getWalkDirection for old test compatibility, but delegate to trail logic
export function getWalkDirection(from: number, to: number) {
  return getTrailWalkDirection(from, to);
}

export const TILE_STEP_MS = 300;
export const TILE_SURFACE_DEPTH = 6;
const WORLD_SCALE = TILE_WIDTH / 64;
const HALF_TILE_WIDTH = TILE_WIDTH / 2;
const HALF_TILE_HEIGHT = TILE_HEIGHT / 2;
const TILE_IMAGE_HEIGHT = 38 * WORLD_SCALE;
const STATUE_RISE_DISTANCE = 50;
export const BOSS_AWAKENING_DURATION_MS = 2200;

export interface TileMotion {
  from: number;
  to: number;
  progress: number;
  durationMs: number;
}

export interface TileContactMotion {
  supportTile: number;
  supportDepth: number;
  departureDepth: number;
  arrivalDepth: number;
}

function clampProgress(progress: number) {
  return Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
}

function smoothStep(progress: number) {
  const t = clampProgress(progress);
  return t * t * (3 - 2 * t);
}

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

function useTileMotion(targetPosition: number, speed: number, reducedMotion: boolean, length: number) {
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

  const from = getTilePosition(motion.from, length);
  const to = getTilePosition(motion.to, length);
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
  minigame: { image: orangeTileUrl, color: 'text-amber-900', icon: Gift },
  boss: { image: redTileUrl, color: 'text-red-900', icon: Skull }
};

export function GameBoard({ run, visualPosition, speed = 1, onCinematicFinish }: { run: RunState, visualPosition: number, speed?: number, onCinematicFinish?: () => void }) {
  const reducedMotion = usePrefersReducedMotion();
  const trailLength = run.tiles.length || 64;
  const tileMotion = useTileMotion(visualPosition, speed, reducedMotion, trailLength);
  
  const heroPos = tileMotion.position;
  const heroSurfaceY = heroPos.y + tileMotion.contact.supportDepth;
  const [heroTravelDirection, setHeroTravelDirection] = useState<WalkDirection>('north-west');
  const previousVisualPosition = useRef(visualPosition);

  useEffect(() => {
    if (visualPosition === previousVisualPosition.current) return;
    const direction = getTrailWalkDirection(previousVisualPosition.current, visualPosition);
    if (direction) setHeroTravelDirection(direction);
    previousVisualPosition.current = visualPosition;
  }, [visualPosition]);

  const walking = run.phase === 'moving' || tileMotion.moving;
  const walkSprites: Record<WalkDirection, { sprite: SpriteName; fallbackUrl: string }> = {
    'south-east': { sprite: 'custom-walk-south-east', fallbackUrl: customWalkSouthEastUrl },
    'south-west': { sprite: 'custom-walk-south-west', fallbackUrl: customWalkSouthWestUrl },
    'north-west': { sprite: 'custom-walk-north-west', fallbackUrl: customWalkNorthWestUrl },
    'north-east': { sprite: 'custom-walk-north-east', fallbackUrl: customWalkNorthEastUrl },
  };
  const activeWalkSprite = walkSprites[heroTravelDirection];

  // Cinematic state
  const cinematicType = run.trailCinematic;
  const [cinematicPhase, setCinematicPhase] = useState<'statue' | 'hero' | null>(null);
  const [statueRisen, setStatueRisen] = useState(false);
  useEffect(() => {
    setStatueRisen(false);
    if (!cinematicType) {
      setCinematicPhase(null);
      return;
    }
    setCinematicPhase('statue');
    const timers: number[] = [];
    const duration = reducedMotion ? 1500
      : cinematicType === 'awakening' ? 5600
      : cinematicType === 'alert' ? 2600 : 2000;
    if (cinematicType === 'awakening') {
      timers.push(window.setTimeout(() => setStatueRisen(true), reducedMotion ? 0 : 2200));
    }
    timers.push(window.setTimeout(() => setCinematicPhase('hero'), duration));
    timers.push(window.setTimeout(() => onCinematicFinish?.(), duration + 800));
    return () => timers.forEach(window.clearTimeout);
  }, [cinematicType, reducedMotion, onCinematicFinish]);

  const isAwakening = run.phase === 'boss_awakening' || cinematicType === 'awakening';
  const isBossActive = isAwakening || run.phase === 'boss_ready' || (run.phase === 'combat' && run.isBossCombat) || run.phase === 'victory' || cinematicType === 'alert';

  // Statue is at the end of the trail
  const statuePos = getTilePosition(trailLength - 1, trailLength);

  let cameraTarget = heroPos;
  let cameraScale = 1;
  let cameraTransitionDur = 0;
  
  // If we are in cinematic phase 'statue', cut to statue
  if (cinematicPhase === 'statue') {
     cameraTarget = statuePos;
     cameraScale = 1.2; // slight zoom
     cameraTransitionDur = 0; // Cut directly to statue
  } else if (cinematicPhase === 'hero') {
     cameraTarget = heroPos;
     cameraScale = 1;
     cameraTransitionDur = 0; // Cut back directly
  } else if (isBossActive && run.isBossCombat) {
     cameraTarget = statuePos;
     cameraTransitionDur = 1000;
  } else {
     cameraTarget = heroPos;
     cameraTransitionDur = 500; // soft follow during normal gameplay
  }
  
  if (reducedMotion) {
      cameraTransitionDur = 0;
  }

  const cameraFollow = 0.96;
  const cx = -cameraTarget.x * cameraScale * cameraFollow;
  const cy = -cameraTarget.y * cameraScale * cameraFollow + 80; // adjusted for center screen


  // Cull far tiles
  const visibleTiles = run.tiles.map((t, i) => {
    const p = getTilePosition(i, trailLength);
    return { t, i, p };
  }).filter(item => Math.abs(item.p.y - cameraTarget.y) < 1000 && Math.abs(item.p.x - cameraTarget.x) < 1000);

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div 
        className="relative w-0 h-0"
        style={{ 
          transform: `translate(${cx}px, ${cy}px) scale(${cameraScale})`,
          transition: cameraTransitionDur > 0 ? `transform ${cameraTransitionDur}ms cubic-bezier(0.4, 0, 0.2, 1)` : 'none'
        }}
      >
        {/* Ground seamlessly covers the huge area, anchored to coordinate 0,0 but large enough.
            We use a repeating background. */}
        <div
          className="absolute pointer-events-none"
          style={{
            width: '6000px',
            height: '6000px',
            left: '-3000px',
            top: '-3000px',
            zIndex: -1,
            backgroundImage: `url(${forestClearingUrl})`,
            backgroundSize: '800px 800px', // or whatever size works
            backgroundRepeat: 'repeat',
            opacity: 0.8
          }}
        />
        
        <ForestOaks cameraTargetY={cameraTarget.y} />
        
        {/* Center Statue placed at the end of the trail */}
        <div 
          className="absolute pointer-events-none"
          style={{ 
            transform: `translate(${statuePos.x}px, ${statuePos.y - HALF_TILE_HEIGHT}px)`,
            zIndex: statuePos.zIndex + 2 // Ensure it stands slightly above the tile
          }}
        >
          {/* We remove the clipping container so the upper statue is visible when un-risen */}
          <div 
            className="absolute z-[1] transition-all ease-in-out w-[200px] h-[250px] left-1/2 bottom-0 -translate-x-1/2"
            style={{
              transform: isAwakening || run.phase === 'boss_ready' || run.isBossCombat ? `translateY(0px)` : `translateY(${STATUE_RISE_DISTANCE}px)`,
              transitionDuration: reducedMotion ? '0ms' : `${BOSS_AWAKENING_DURATION_MS}ms`,
              filter: (isBossActive && !isAwakening) ? `drop-shadow(0 0 15px rgba(234, 179, 8, 0.6)) drop-shadow(0 0 30px rgba(34, 197, 94, 0.4))` : 'none'
            }}
          >
            <div className="absolute left-1/2 bottom-0">
              <CenterStatue 
                  rollsLeft={run.bossRollsLeft} 
                  ready={statueRisen || run.phase === 'boss_ready' || (run.phase === 'combat' && run.isBossCombat)} 
                  alert={cinematicType === 'alert' || (run.bossCountdown !== undefined && run.bossCountdown <= 15)} 
              />
            </div>
            {isAwakening && !reducedMotion && (
               <div className="absolute inset-0 bg-stone-900 rounded-full animate-ping opacity-20 filter blur-xl" style={{ animationDuration: '1s' }} />
            )}
          </div>
          {/* Mask/debris hiding the base of the un-risen statue */}
          <div 
             className="absolute bg-stone-900/80 backdrop-blur-[2px] w-[140px] h-[50px] rounded-[100%] left-1/2 bottom-0 -translate-x-1/2 translate-y-[15px]"
             style={{
                 boxShadow: 'inset 0 10px 20px rgba(0,0,0,0.8), 0 0 10px rgba(0,0,0,0.5)',
                 zIndex: 0,
                 opacity: isAwakening || run.phase === 'boss_ready' || run.isBossCombat ? 0 : 0.4,
                 transition: reducedMotion ? 'none' : 'opacity 2200ms ease-out',
             }}
          />
        </div>
        
        {/* Grid Tiles */}
        {visibleTiles.map(({ t, i, p }) => {
          const surfaceDepth = i === normalizeTileIndex(tileMotion.from, trailLength)
            ? tileMotion.contact.departureDepth
            : i === normalizeTileIndex(tileMotion.to, trailLength)
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
              {/* Only the surface and a subtle shadow for raised look, no deep walls */}
              <div
                className="absolute z-0"
                style={{
                  width: `${TILE_WIDTH}px`,
                  height: `${TILE_HEIGHT}px`,
                  background: 'rgba(0,0,0,0.4)',
                  borderRadius: '50%',
                  filter: 'blur(4px)',
                  transform: 'translateY(10px) scale(0.9)',
                }}
              />

              <div
                className="absolute board-tile-surface z-10"
                style={{
                  width: `${TILE_WIDTH}px`,
                  height: `${TILE_HEIGHT}px`,
                  transform: `translateY(${surfaceDepth}px)`,
                }}
              >
                <img
                  src={TILE_THEMES[t.type].image}
                  alt={`${t.type} tile`}
                  draggable={false}
                  className="absolute top-0 left-0 max-w-none"
                  style={{
                    width: `${TILE_WIDTH}px`,
                    height: `${TILE_IMAGE_HEIGHT}px`,
                    filter: 'drop-shadow(0 3px 2px rgba(0,0,0,0.25))',
                  }}
                />
                <BoardTileObject type={t.type} occupied={i === normalizeTileIndex(tileMotion.contact.supportTile, trailLength)} />
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
          <HeroSprite
            characterId={run.characterId}
            sprite={activeWalkSprite.sprite}
            fallbackUrl={activeWalkSprite.fallbackUrl}
            active={walking}
            loop
            trigger={walking ? 1 : 0}
            fps={12}
            frameCount={9}
            durationMs={1800}
            alt="Hero"
            className="relative z-[1] drop-shadow-xl w-full h-full"
          />
        </div>

      </div>
    </div>
  );
}
