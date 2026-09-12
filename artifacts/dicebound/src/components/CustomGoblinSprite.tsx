import { useCallback, useState } from 'react';
import { SpriteAnimator, type CustomGoblinSpriteName } from './SpriteAnimator';
import goblinUrl from '../assets/custom-goblin.png';

export const CUSTOM_GOBLIN_DEATH_EXIT_MS = 2000;

/** The parent remounts actors on each actual attack, hit, or defeat event. */
export function CustomGoblinSprite({
  attackTrigger, hitTrigger, dying, speed, name,
}: {
  attackTrigger: number;
  hitTrigger: number;
  dying: boolean;
  speed: number;
  name: string;
}) {
  const [finished, setFinished] = useState(false);
  const finish = useCallback(() => setFinished(true), []);
  const action: CustomGoblinSpriteName = dying ? 'custom-goblin-death'
    : finished || (!attackTrigger && !hitTrigger) ? 'custom-goblin-idle'
    : hitTrigger > attackTrigger ? 'custom-goblin-hit' : 'custom-goblin-attack';
  const idle = action === 'custom-goblin-idle';
  return (
    <SpriteAnimator
      sprite={action}
      fallbackUrl={goblinUrl}
      active
      loop={idle}
      frameCount={9}
      durationMs={1800 / Math.max(1, speed)}
      holdLastFrame={dying}
      onAnimationEnd={idle || dying ? undefined : finish}
      alt={name}
      className="combat-actor__sprite sprite-animator--pixel drop-shadow-xl"
    />
  );
}