import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, HTMLAttributes } from 'react';
import './sprite-animator.css';

/**
 * Sprite sheets are kept optional so the UI can ship before the art pipeline
 * finishes. Vite turns every matching file into a built URL; no runtime
 * /src paths are needed (or exposed).
 */
const spriteModules = import.meta.glob('../assets/sprites/*.png', {
  eager: true,
  import: 'default',
  query: '?url',
}) as Record<string, string>;

const spriteUrls = Object.entries(spriteModules).reduce<Record<string, string>>((urls, [path, url]) => {
  const filename = path.split('/').pop()?.replace(/\.png$/, '');
  if (filename) urls[filename] = url;
  return urls;
}, {});

export type SpriteName =
  | 'hero-walk'
  | 'custom-walk-south-east'
  | 'custom-walk-south-west'
  | 'custom-walk-north-west'
  | 'custom-walk-north-east'
  | 'custom-drink-potion'
  | 'custom-throw-firebomb'
  | 'custom-guard-tonic'
  | 'custom-lobby-hero'
  | 'unc-selection'
  | 'unc-guard' | 'unc-health' | 'unc-special' | 'unc-death' | 'unc-hurt' | 'unc-idle'
  | 'unc-poison' | 'unc-punch' | 'unc-wind' | 'unc-acid' | 'unc-cold' | 'unc-fire'
  | 'unc-walk-south-west' | 'unc-walk-north-west' | 'unc-walk-north-east' | 'unc-walk-south-east'
  | 'bard-selection'
  | 'custom-hero-hit'
  | 'custom-hero-sword'
  | 'hero-attack'
  | 'hero-hit'
  | 'wolf-attack'
  | 'slime-attack'
  | 'goblin-attack'
  | 'skeleton-attack'
  | 'boss-attack';
export type OchreSpriteName = 'ochre-idle' | 'ochre-attack' | 'ochre-hit' | 'ochre-death';
export type WolfPixelSpriteName = 'wolf-pixel-idle' | 'wolf-pixel-attack' | 'wolf-pixel-hit' | 'wolf-pixel-death';
export type GoblinPixelSpriteName = 'goblin-pixel-idle' | 'goblin-pixel-attack' | 'goblin-pixel-hit' | 'goblin-pixel-death';
export type CustomWolfSpriteName = 'custom-wolf-idle' | 'custom-wolf-attack' | 'custom-wolf-hit' | 'custom-wolf-death';
export type CustomGoblinSpriteName = 'custom-goblin-idle' | 'custom-goblin-attack' | 'custom-goblin-hit' | 'custom-goblin-death';
export type CustomOchreSpriteName = 'custom-ochre-idle' | 'custom-ochre-attack' | 'custom-ochre-hit' | 'custom-ochre-death';
export type CustomSkeletonSpriteName = 'custom-skeleton-idle' | 'custom-skeleton-attack' | 'custom-skeleton-hit' | 'custom-skeleton-death';
export type CustomMummySpriteName = 'custom-mummy-idle' | 'custom-mummy-attack' | 'custom-mummy-hit' | 'custom-mummy-death';
export type CustomWinterWolfSpriteName = 'custom-winter-wolf-idle' | 'custom-winter-wolf-attack' | 'custom-winter-wolf-hit' | 'custom-winter-wolf-death';
export type CustomOgreSpriteName = 'custom-ogre-idle' | 'custom-ogre-attack' | 'custom-ogre-hit' | 'custom-ogre-death';

type KingSpriteName = `king-${'idle' | 'hit' | 'death' | 'sword' | 'fireball'}`;
export interface SpriteAnimatorProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'onAnimationEnd'> {
  /** Name of an optional horizontal sprite sheet. */
  sprite: SpriteName | KingSpriteName | OchreSpriteName | WolfPixelSpriteName | GoblinPixelSpriteName | CustomWolfSpriteName | CustomGoblinSpriteName | CustomOchreSpriteName | CustomSkeletonSpriteName | CustomMummySpriteName | CustomWinterWolfSpriteName | CustomOgreSpriteName | 'custom-hero-idle' | 'center-statue-alert' | 'center-statue-ready';
  frameCount?: number;
  /** Art shown until the sheet exists, and while this animator is idle. */
  fallbackUrl: string;
  /** Starts/restarts playback when this value changes. */
  trigger?: number;
  active?: boolean;
  loop?: boolean;
  fps?: number;
  durationMs?: number;
  flip?: boolean;
  holdLastFrame?: boolean;
  alt?: string;
  onAnimationEnd?: () => void;
}

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);

  return reduced;
}

export function SpriteAnimator({
  sprite,
  fallbackUrl,
  trigger = 0,
  active = false,
  loop = false,
  fps = 12,
  frameCount = 8,
  durationMs,
  flip = false,
  holdLastFrame = false,
  alt = '',
  className = '',
  style,
  onAnimationEnd,
  ...props
}: SpriteAnimatorProps) {
  const reducedMotion = usePrefersReducedMotion();
  const sheetUrl = spriteUrls[sprite];
  const frameDuration = durationMs ?? (frameCount / Math.max(1, fps)) * 1000;
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const startedAt = useRef(0);
  const completionNotified = useRef(false);
  const onAnimationEndRef = useRef(onAnimationEnd);

  useEffect(() => {
    onAnimationEndRef.current = onAnimationEnd;
  }, [onAnimationEnd]);

  useEffect(() => {
    if (!active || reducedMotion) {
      setPlaying(false);
      setFrame(0);
      return;
    }

    // A trigger makes repeated attacks restart even when `active` stays true.
    startedAt.current = performance.now();
    completionNotified.current = false;
    setFrame(0);
    setPlaying(true);
  }, [active, trigger, sprite, reducedMotion]);

  useEffect(() => {
    if (!playing || reducedMotion) return;

    let frameId = 0;
    const animate = (now: number) => {
      const elapsed = now - startedAt.current;
      const progress = Math.min(1, elapsed / Math.max(1, frameDuration));
      const nextFrame = Math.min(frameCount - 1, Math.floor(progress * frameCount));
      setFrame(nextFrame);

      if (progress >= 1) {
        if (loop) {
          startedAt.current = now;
          setFrame(0);
          frameId = requestAnimationFrame(animate);
          return;
        }

        setPlaying(false);
        if (!completionNotified.current) {
          completionNotified.current = true;
          onAnimationEndRef.current?.();
        }
        return;
      }

      frameId = requestAnimationFrame(animate);
    };

    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [frameDuration, frameCount, loop, playing, reducedMotion]);

  const sheetVisible = Boolean(sheetUrl && (playing || (active && loop) || (active && holdLastFrame && !reducedMotion)));
  const spriteStyle = useMemo<CSSProperties>(() => ({
    ...style,
    ...(sheetVisible
      ? {
          backgroundImage: `url("${sheetUrl}")`,
          backgroundPosition: `${(frame / (frameCount - 1)) * 100}% center`,
          backgroundSize: `${frameCount * 100}% 100%`,
        }
      : {}),
  }), [frame, frameCount, sheetUrl, sheetVisible, style]);

  return (
    <div
      {...props}
      className={`sprite-animator ${sheetVisible ? 'sprite-animator--sheet' : 'sprite-animator--fallback'} ${flip ? 'sprite-animator--flipped' : ''} ${className}`.trim()}
      style={spriteStyle}
      role={alt ? 'img' : undefined}
      aria-label={alt || undefined}
    >
      <img
        src={fallbackUrl}
        alt={alt}
        aria-hidden={sheetVisible}
        className={`sprite-animator__fallback ${sheetVisible ? 'sprite-animator__fallback--sheet' : ''}`}
      />
    </div>
  );
}