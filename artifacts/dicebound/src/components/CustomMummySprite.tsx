import { useCallback, useState } from 'react';
import { SpriteAnimator, type CustomMummySpriteName } from './SpriteAnimator';
import mummyUrl from '../assets/custom-mummy.png';

export const CUSTOM_MUMMY_DEATH_EXIT_MS = 2000;

/** Parent actor remounts for each actual combat event. */
export function CustomMummySprite({
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
  const action: CustomMummySpriteName = dying ? 'custom-mummy-death'
    : finished || (!attackTrigger && !hitTrigger) ? 'custom-mummy-idle'
    : hitTrigger > attackTrigger ? 'custom-mummy-hit' : 'custom-mummy-attack';
  const idle = action === 'custom-mummy-idle';
  return (
    <SpriteAnimator
      sprite={action}
      fallbackUrl={mummyUrl}
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