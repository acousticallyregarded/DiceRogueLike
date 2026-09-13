import { useEffect, useRef } from 'react';
import type { DamageType } from '../bestiary';
import { BARD_DURATIONS } from '../bard-moves';
import { SpriteAnimator, type SpriteAnimatorProps, type SpriteName } from './SpriteAnimator';

const fallbacks = import.meta.glob('../assets/characters/bard-*.png', {
  eager: true, query: '?url', import: 'default',
}) as Record<string, string>;

export function BardSprite({ damageType, playbackSpeed = 1, ...props }: SpriteAnimatorProps & {
  damageType?: DamageType;
  playbackSpeed?: number;
}) {
  const walking = props.sprite.startsWith('custom-walk-') && props.active;
  const attacking = props.sprite === 'custom-hero-sword';
  const attack = damageType === 'lightning' ? 'electric'
    : !damageType || ['slashing', 'piercing', 'bludgeoning'].includes(damageType) ? 'bludgeoning' : 'magic';
  const action = attacking ? attack : props.sprite === 'custom-hero-hit' ? 'hurt'
    : props.sprite === 'bard-death' ? 'death' : 'idle';
  const sprite: SpriteName = walking
    ? props.sprite.replace('custom-walk-', 'bard-walk-') as SpriteName
    : `bard-${action}`;
  const duration = BARD_DURATIONS[walking ? 'walk' : action];
  const idle = !walking && action === 'idle';
  const callback = useRef(props.onAnimationEnd);
  callback.current = props.onAnimationEnd;
  // No potion/throw clips were supplied: keep the real idle artwork while
  // the existing consumable effects and completion callbacks run.
  useEffect(() => {
    if (!idle || !props.active || !props.trigger || !props.durationMs) return;
    const timer = window.setTimeout(() => callback.current?.(), props.durationMs);
    return () => window.clearTimeout(timer);
  }, [idle, props.active, props.trigger, props.durationMs]);
  return (
    <div className={`relative ${props.className ?? ''}`} style={props.style}>
      <SpriteAnimator {...props}
        sprite={sprite}
        fallbackUrl={fallbacks[`../assets/characters/${sprite}.png`]}
        active
        loop={Boolean(walking || idle)}
        holdLastFrame={action === 'death'}
        frameCount={duration / 200}
        durationMs={duration / Math.max(1, playbackSpeed)}
        onAnimationEnd={idle ? undefined : props.onAnimationEnd}
        alt={props.alt === 'Hero' ? 'Alan-a-Dale' : props.alt}
        className="absolute"
        style={{ position: 'absolute', width: '145%', height: '145%', left: '-22.5%', bottom: '-22%' }}
      />
    </div>
  );
}