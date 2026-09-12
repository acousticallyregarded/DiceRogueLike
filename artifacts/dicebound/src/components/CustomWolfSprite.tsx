import { useCallback, useState } from 'react';
import { SpriteAnimator, type CustomWolfSpriteName } from './SpriteAnimator';
import customWolfUrl from '../assets/custom-wolf.png';

export const CUSTOM_WOLF_FRAME_COUNT = 9;
export const CUSTOM_WOLF_ANIMATION_DURATION_MS = 1800;
export const CUSTOM_WOLF_DEATH_EXIT_MS = CUSTOM_WOLF_ANIMATION_DURATION_MS + 200;

/** Combat actors remount on a new attack, hit, or death event. */
export function CustomWolfSprite({
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
  const action: CustomWolfSpriteName = dying ? 'custom-wolf-death'
    : finished || (!attackTrigger && !hitTrigger) ? 'custom-wolf-idle'
    : hitTrigger > attackTrigger ? 'custom-wolf-hit' : 'custom-wolf-attack';
  const idle = action === 'custom-wolf-idle';
  const duration = CUSTOM_WOLF_ANIMATION_DURATION_MS / Math.max(1, speed);

  return (
    <SpriteAnimator
      sprite={action}
      fallbackUrl={customWolfUrl}
      active
      loop={idle}
      frameCount={CUSTOM_WOLF_FRAME_COUNT}
      durationMs={duration}
      holdLastFrame={dying}
      onAnimationEnd={idle || dying ? undefined : finish}
      alt={name}
      className="combat-actor__sprite drop-shadow-xl"
    />
  );
}