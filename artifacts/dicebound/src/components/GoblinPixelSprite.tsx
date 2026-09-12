import { useCallback, useState } from 'react';
import { SpriteAnimator, type GoblinPixelSpriteName } from './SpriteAnimator';
import goblinUrl from '../assets/goblin-pixel.png';

/** Combat actors remount on a new attack, hit, or death event. */
export function GoblinPixelSprite({
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
  const action: GoblinPixelSpriteName = dying ? 'goblin-pixel-death'
    : finished || (!attackTrigger && !hitTrigger) ? 'goblin-pixel-idle'
    : hitTrigger > attackTrigger ? 'goblin-pixel-hit' : 'goblin-pixel-attack';
  const idle = action === 'goblin-pixel-idle';
  const duration = dying ? 600 : idle ? 1000 : action === 'goblin-pixel-hit' ? 300 : 420;
  return (
    <SpriteAnimator
      sprite={action}
      fallbackUrl={goblinUrl}
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