import { useEffect, useRef } from 'react';
import type { DamageType } from '../bestiary';
import { UNC_ACTION_DURATIONS, UNC_ACTION_FRAMES, UNC_MOVES, type UncDamageType } from '../unc-moves';
import { SpriteAnimator, type SpriteAnimatorProps, type SpriteName } from './SpriteAnimator';
import { getUncSpeech } from './unc-speech';
import './unc-speech.css';
import uncFireBombGif from '../assets/characters/consumables/unc-fire-bomb.gif';

const fallbacks = import.meta.glob('../assets/characters/unc-*.png', {
  eager: true, query: '?url', import: 'default',
}) as Record<string, string>;

const attacks = {
  poison: { sprite: 'unc-poison', frames: 25 },
  bludgeoning: { sprite: 'unc-punch', frames: 17 },
  wind: { sprite: 'unc-wind', frames: 25 },
  acid: { sprite: 'unc-acid', frames: 9 },
  cold: { sprite: 'unc-cold', frames: 25 },
  fire: { sprite: 'unc-fire', frames: 25 },
} as const;

export function UncSprite({ damageType, playbackSpeed = 1, ...props }: SpriteAnimatorProps & {
  damageType?: DamageType;
  playbackSpeed?: number;
}) {
  const walking = props.sprite.startsWith('custom-walk-') && props.active;
  const attacking = props.sprite === 'custom-hero-sword';
  const support = props.sprite === 'custom-drink-potion' ? 'health'
    : props.sprite === 'custom-guard-tonic' ? 'guard'
    : props.sprite === 'custom-hero-hit' ? 'hurt'
    : props.sprite === 'unc-special' ? 'special'
    : props.sprite === 'unc-death' ? 'death'
    : null;
  const idle = !walking && !attacking && !support;
  const consumableGif = props.sprite === 'custom-throw-firebomb' ? uncFireBombGif : null;
  const speech = props.active ? getUncSpeech(props.sprite, damageType) : null;
  const action = attacks[damageType as keyof typeof attacks] ?? attacks.bludgeoning;
  const metadata = UNC_MOVES[damageType as UncDamageType] ?? UNC_MOVES.bludgeoning;
  const sprite: SpriteName = walking
    ? props.sprite.replace('custom-walk-', 'unc-walk-') as SpriteName
    : attacking ? action.sprite : support ? `unc-${support}` : 'unc-idle';
  const frames = walking ? 13 : attacking ? metadata.frames
    : UNC_ACTION_FRAMES[support ?? 'idle'];
  const duration = walking ? 2600 / Math.max(1, playbackSpeed)
    : attacking ? props.durationMs ?? metadata.durationMs
    : UNC_ACTION_DURATIONS[support ?? 'idle'] / Math.max(1, playbackSpeed);
  const callback = useRef(props.onAnimationEnd);
  callback.current = props.onAnimationEnd;
  useEffect(() => {
    if ((!idle && !consumableGif) || !props.active || !props.trigger) return;
    const timer = window.setTimeout(() => callback.current?.(), props.durationMs ?? duration);
    return () => window.clearTimeout(timer);
  }, [consumableGif, idle, props.active, props.trigger, duration, props.durationMs]);
  if (consumableGif) {
    return (
      <div className={`relative ${props.className ?? ''}`} style={props.style}>
        <img
          key={`${props.sprite}-${props.trigger ?? 0}`}
          src={consumableGif}
          alt={props.alt === 'Hero' ? 'Unc' : props.alt}
          className="absolute object-contain"
          style={{ width: '160%', height: '160%', left: '-30%', bottom: '-24%' }}
        />
      </div>
    );
  }
  return (
    <div className={`relative ${props.className ?? ''}`} style={props.style}>
      <SpriteAnimator {...props}
        sprite={sprite}
        fallbackUrl={fallbacks[`../assets/characters/${sprite}.png`]}
        active
        loop={Boolean(walking || idle)}
        holdLastFrame={support === 'death'}
        frameCount={frames}
        durationMs={duration}
        onAnimationEnd={!idle ? props.onAnimationEnd : undefined}
        alt={props.alt === 'Hero' ? 'Unc' : props.alt}
        className="absolute"
        style={{ position: 'absolute', width: '160%', height: '160%', left: '-30%', bottom: '-24%' }}
      />
      {speech && (
        <div key={`${props.sprite}-${props.trigger ?? 0}`} className="unc-speech" role="status" aria-live="polite">
          {speech}
        </div>
      )}
    </div>
  );
}