import { useCallback, useState } from 'react';
import { SpriteAnimator, type WolfPixelSpriteName } from './SpriteAnimator';
import wolfUrl from '../assets/wolf-pixel.png';

/** Combat actors remount on a new attack, hit, or death event. */
export function WolfPixelSprite({
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
  const action: WolfPixelSpriteName = dying ? 'wolf-pixel-death'
    : finished || (!attackTrigger && !hitTrigger) ? 'wolf-pixel-idle'
    : hitTrigger > attackTrigger ? 'wolf-pixel-hit' : 'wolf-pixel-attack';
  const idle = action === 'wolf-pixel-idle';
  const duration = dying ? 600 : idle ? 1000 : action === 'wolf-pixel-hit' ? 300 : 420;
  return (
    <SpriteAnimator
      sprite={action}
      fallbackUrl={wolfUrl}
      active
      loop={idle}
      holdLastFrame={dying}
      durationMs={duration / Math.max(1, speed)}
      onAnimationEnd={idle || dying ? undefined : finish}
      alt={name}
      className="combat-actor__sprite sprite-animator--pixel drop-shadow-xl"
    />
  );
}