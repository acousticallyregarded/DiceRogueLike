import type { DamageType } from '../bestiary';
import { JOHN_ATTACK_DURATIONS, JOHN_ATTACK_FRAMES } from '../john-moves';
import { SpriteAnimator, type SpriteAnimatorProps, type SpriteName } from './SpriteAnimator';

const fallbacks = import.meta.glob('../assets/characters/john-*.png', {
  eager: true, query: '?url', import: 'default',
}) as Record<string, string>;

export function JohnSprite({ damageType, ...props }: SpriteAnimatorProps & { damageType?: DamageType }) {
  const move = props.sprite === 'john-takedown' ? 'takedown'
    : props.sprite === 'custom-hero-sword'
      && (damageType === 'cold' || damageType === 'acid' || damageType === 'piercing'
        || damageType === 'fire' || damageType === 'bludgeoning' || damageType === 'lightning')
      ? damageType : null;
  // Walking, idle, sword, hurt, and consumable clips remain exactly as before.
  if (!move) return <SpriteAnimator {...props} />;
  const sprite: SpriteName = `john-${move}`;
  return <SpriteAnimator {...props}
    sprite={sprite}
    fallbackUrl={fallbacks[`../assets/characters/${sprite}.png`]}
    frameCount={JOHN_ATTACK_FRAMES[move]}
    durationMs={props.durationMs ?? JOHN_ATTACK_DURATIONS[move]}
    loop={false}
  />;
}