import { useEffect, useRef } from 'react';
import type { DamageType } from '../bestiary';
import { BARD_DURATIONS, BARD_FRAMES } from '../bard-moves';
import { SpriteAnimator, type SpriteAnimatorProps, type SpriteName } from './SpriteAnimator';
import './unc-speech.css';
import bardGuardGif from '../assets/characters/consumables/bard-guard.gif';
import bardHealthGif from '../assets/characters/consumables/bard-health.gif';
import bardFireBombGif from '../assets/characters/consumables/bard-fire-bomb.gif';

const fallbacks = import.meta.glob('../assets/characters/bard-*.png', {
  eager: true, query: '?url', import: 'default',
}) as Record<string, string>;

export function BardSprite({ damageType, playbackSpeed = 1, ...props }: SpriteAnimatorProps & {
  damageType?: DamageType;
  playbackSpeed?: number;
}) {
  const walking = props.sprite.startsWith('custom-walk-') && props.active;
  const spell = props.sprite === 'bard-sleep' || props.sprite === 'bard-cutting-words';
  const attacking = props.sprite === 'custom-hero-sword' || spell || props.sprite === 'bard-electric';
  const attack = spell ? 'magic' : props.sprite === 'bard-electric' || damageType === 'lightning' ? 'electric'
    : !damageType || ['slashing', 'piercing', 'bludgeoning'].includes(damageType) ? 'bludgeoning' : 'magic';
  const action = attacking ? attack : props.sprite === 'custom-hero-hit' ? 'hurt'
    : props.sprite === 'bard-death' ? 'death' : 'idle';
  const sprite: SpriteName = walking
    ? props.sprite.replace('custom-walk-', 'bard-walk-') as SpriteName
    : `bard-${action}`;
  const duration = BARD_DURATIONS[walking ? 'walk' : action];
  const frames = BARD_FRAMES[walking ? 'walk' : action];
  const idle = !walking && action === 'idle';
  const consumableGif = props.sprite === 'custom-guard-tonic' ? bardGuardGif
    : props.sprite === 'custom-drink-potion' ? bardHealthGif
      : props.sprite === 'custom-throw-firebomb' ? bardFireBombGif
        : null;
  const speech = props.sprite === 'bard-cutting-words' ? 'COCK'
    : props.sprite === 'custom-hero-sword' && damageType === 'bludgeoning' ? 'KABOOOONG!' : null;
  const callback = useRef(props.onAnimationEnd);
  callback.current = props.onAnimationEnd;
  useEffect(() => {
    if ((!idle && !consumableGif) || !props.active || !props.trigger || !props.durationMs) return;
    const timer = window.setTimeout(() => callback.current?.(), props.durationMs);
    return () => window.clearTimeout(timer);
  }, [consumableGif, idle, props.active, props.trigger, props.durationMs]);
  if (consumableGif) {
    return (
      <div className={`relative ${props.className ?? ''}`} style={props.style}>
        <img
          key={`${props.sprite}-${props.trigger ?? 0}`}
          src={consumableGif}
          alt={props.alt === 'Hero' ? 'Alan-a-Dale' : props.alt}
          className="absolute object-contain"
          style={{ width: '145%', height: '145%', left: '-22.5%', bottom: '-22%' }}
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
        holdLastFrame={action === 'death'}
        frameCount={frames}
        durationMs={duration / Math.max(1, playbackSpeed)}
        onAnimationEnd={idle ? undefined : props.onAnimationEnd}
        alt={props.alt === 'Hero' ? 'Alan-a-Dale' : props.alt}
        className="absolute"
        style={{ position: 'absolute', width: '145%', height: '145%', left: '-22.5%', bottom: '-22%' }}
      />
      {props.active && speech && (
        <div key={props.trigger} className="bard-speech" role="status" aria-live="polite">{speech}</div>
      )}
    </div>
  );
}