import type { DamageType } from '../bestiary';
import type { SpriteAnimatorProps } from './SpriteAnimator';

const attackLines: Partial<Record<DamageType, string>> = {
  poison: 'pull my finger',
  wind: 'get off my lawn',
  acid: 'BLEECK',
  cold: 'Cool off, youngblood',
  fire: 'See you in hell',
};

export function getUncSpeech(sprite: SpriteAnimatorProps['sprite'], damageType?: DamageType): string | null {
  if (sprite === 'unc-death') return 'Game over, man.';
  if (sprite === 'unc-special') return 'Hold my beer!';
  if (sprite === 'custom-hero-sword' && damageType) return attackLines[damageType] ?? null;
  return null;
}