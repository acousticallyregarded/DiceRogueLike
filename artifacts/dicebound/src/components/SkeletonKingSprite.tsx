import { useCallback, useState } from 'react';
import { SpriteAnimator } from './SpriteAnimator';
import kingUrl from '../assets/skeleton-king.png';

export function SkeletonKingSprite({ attackTrigger, hitTrigger, dying, speed, attack }: {
  attackTrigger: number; hitTrigger: number; dying: boolean; speed: number;
  attack?: 'sword' | 'fireball';
}) {
  const [finished, setFinished] = useState(false);
  const finish = useCallback(() => setFinished(true), []);
  const action = dying ? 'death' : finished || (!attackTrigger && !hitTrigger) ? 'idle'
    : hitTrigger > attackTrigger ? 'hit' : attack ?? 'sword';
  const frames = { death: 25, idle: 13, hit: 9, sword: 9, fireball: 21 }[action];
  return <SpriteAnimator sprite={`king-${action}`} fallbackUrl={kingUrl}
    active loop={action === 'idle'} frameCount={frames}
    durationMs={frames * 200 / Math.max(1, speed)} holdLastFrame={dying}
    onAnimationEnd={action === 'idle' || dying ? undefined : finish}
    alt={`Skeleton King ${action}`}
    className="combat-actor__sprite sprite-animator--pixel drop-shadow-xl" />;
}