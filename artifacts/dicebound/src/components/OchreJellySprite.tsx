import { useCallback, useState } from 'react';
import { SpriteAnimator, type CustomOchreSpriteName } from './SpriteAnimator';
import ochreUrl from '../assets/custom-ochre.png';

export const CUSTOM_OCHRE_DEATH_EXIT_MS = 2000;

/** The parent remounts actors for each new combat event. */
export function OchreJellySprite({
  attackTrigger, hitTrigger, dying, speed,
}: {
  attackTrigger: number;
  hitTrigger: number;
  dying: boolean;
  speed: number;
}) {
  const [finished, setFinished] = useState(false);
  const finish = useCallback(() => setFinished(true), []);
  const action: CustomOchreSpriteName = dying ? 'custom-ochre-death'
    : finished || (!attackTrigger && !hitTrigger) ? 'custom-ochre-idle'
    : hitTrigger > attackTrigger ? 'custom-ochre-hit' : 'custom-ochre-attack';
  const idle = action === 'custom-ochre-idle';
  const duration = 1800;
  return (
    <SpriteAnimator
      sprite={action}
      fallbackUrl={ochreUrl}
      active
      loop={idle}
      frameCount={9}
      holdLastFrame={dying}
      durationMs={duration / Math.max(1, speed)}
      onAnimationEnd={idle || dying ? undefined : finish}
      alt="Ochre Jelly"
      className="combat-actor__sprite sprite-animator--pixel drop-shadow-xl"
    />
  );
}