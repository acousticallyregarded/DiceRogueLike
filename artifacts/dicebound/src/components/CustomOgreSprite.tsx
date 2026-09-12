import { useCallback, useState } from 'react';
import { SpriteAnimator, type CustomOgreSpriteName } from './SpriteAnimator';
import ogreUrl from '../assets/custom-ogre.png';

export const CUSTOM_OGRE_DEATH_EXIT_MS = 2000;

/** Parent actor remounts for each actual combat event. */
export function CustomOgreSprite({
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
  const action: CustomOgreSpriteName = dying ? 'custom-ogre-death'
    : finished || (!attackTrigger && !hitTrigger) ? 'custom-ogre-idle'
    : hitTrigger > attackTrigger ? 'custom-ogre-hit' : 'custom-ogre-attack';
  const idle = action === 'custom-ogre-idle';
  return (
    <SpriteAnimator
      sprite={action}
      fallbackUrl={ogreUrl}
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