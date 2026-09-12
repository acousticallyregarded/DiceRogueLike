import { useCallback, useState } from 'react';
import { SpriteAnimator, type CustomWinterWolfSpriteName } from './SpriteAnimator';
import winterWolfUrl from '../assets/custom-winter-wolf.png';

export const CUSTOM_WINTER_WOLF_DEATH_EXIT_MS = 2000;

/** Parent actor remounts for each actual combat event. */
export function CustomWinterWolfSprite({
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
  const action: CustomWinterWolfSpriteName = dying ? 'custom-winter-wolf-death'
    : finished || (!attackTrigger && !hitTrigger) ? 'custom-winter-wolf-idle'
    : hitTrigger > attackTrigger ? 'custom-winter-wolf-hit' : 'custom-winter-wolf-attack';
  const idle = action === 'custom-winter-wolf-idle';
  return (
    <SpriteAnimator
      sprite={action}
      fallbackUrl={winterWolfUrl}
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