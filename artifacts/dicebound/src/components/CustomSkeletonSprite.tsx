import { useCallback, useState } from 'react';
import { SpriteAnimator, type CustomSkeletonSpriteName } from './SpriteAnimator';
import skeletonUrl from '../assets/custom-skeleton.png';

export const CUSTOM_SKELETON_DEATH_EXIT_MS = 2000;

/** Parent actor remounts on each real combat event. */
export function CustomSkeletonSprite({
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
  const action: CustomSkeletonSpriteName = dying ? 'custom-skeleton-death'
    : finished || (!attackTrigger && !hitTrigger) ? 'custom-skeleton-idle'
    : hitTrigger > attackTrigger ? 'custom-skeleton-hit' : 'custom-skeleton-attack';
  const idle = action === 'custom-skeleton-idle';
  return (
    <SpriteAnimator
      sprite={action}
      fallbackUrl={skeletonUrl}
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