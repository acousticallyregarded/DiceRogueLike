import { useCallback, useState } from 'react';
import { SpriteAnimator, type OchreSpriteName } from './SpriteAnimator';
import ochreUrl from '../assets/ochre-jelly.png';

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
  const action: OchreSpriteName = dying ? 'ochre-death'
    : finished || (!attackTrigger && !hitTrigger) ? 'ochre-idle'
    : hitTrigger > attackTrigger ? 'ochre-hit' : 'ochre-attack';
  const idle = action === 'ochre-idle';
  const duration = dying ? 600 : idle ? 1000 : action === 'ochre-hit' ? 300 : 420;
  return (
    <SpriteAnimator
      sprite={action}
      fallbackUrl={ochreUrl}
      active
      loop={idle}
      holdLastFrame={dying}
      durationMs={duration / Math.max(1, speed)}
      onAnimationEnd={idle || dying ? undefined : finish}
      alt="Ochre Jelly"
      className="combat-actor__sprite sprite-animator--pixel drop-shadow-xl"
    />
  );
}