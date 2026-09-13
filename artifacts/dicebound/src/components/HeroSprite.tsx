import { useEffect, useRef } from 'react';
import { SpriteAnimator, SpriteAnimatorProps, usePrefersReducedMotion } from './SpriteAnimator';
import './hero-animations.css';
import type { DamageType } from '../bestiary';
import { UncSprite } from './UncSprite';
import { BardSprite } from './BardSprite';
import { JohnSprite } from './JohnSprite';

import alanSvg from '../assets/characters/alan.svg';

export interface HeroSpriteProps extends SpriteAnimatorProps {
  characterId?: string;
  damageType?: DamageType;
  playbackSpeed?: number;
}

export function HeroSprite({ characterId = 'john', damageType, playbackSpeed, className = '', style, ...props }: HeroSpriteProps) {
  const reducedMotion = usePrefersReducedMotion();
  const imgSrc = alanSvg;

  const { trigger, durationMs, onAnimationEnd, active, loop, sprite, alt } = props;

  const onAnimationEndRef = useRef(onAnimationEnd);
  useEffect(() => {
    onAnimationEndRef.current = onAnimationEnd;
  }, [onAnimationEnd]);

  useEffect(() => {
    if (characterId === 'john' || characterId === 'unc' || characterId === 'alan-a-dale') return;
    if (!active && (!trigger || trigger <= 0)) return;
    
    if (trigger && trigger > 0 && durationMs) {
      const timer = setTimeout(() => {
        onAnimationEndRef.current?.();
      }, durationMs);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [trigger, durationMs, active, characterId, sprite]);

  if (characterId === 'john') {
    return <JohnSprite damageType={damageType} className={className} style={style} {...props} trigger={trigger} durationMs={durationMs} active={active} loop={loop} sprite={sprite} alt={alt} onAnimationEnd={onAnimationEnd} />;
  }
  if (characterId === 'unc') {
    return <UncSprite {...props} damageType={damageType} playbackSpeed={playbackSpeed} className={className} style={style} />;
  }
  if (characterId === 'alan-a-dale') {
    return <BardSprite {...props} damageType={damageType} playbackSpeed={playbackSpeed} className={className} style={style} />;
  }

  let animClass = '';
  if (!reducedMotion) {
    if (sprite.includes('walk')) animClass = 'animate-hero-walk';
    if (sprite === 'custom-hero-sword') animClass = 'animate-hero-music';
    if (sprite === 'custom-hero-hit') animClass = 'animate-hero-hit';
    if (sprite === 'custom-throw-firebomb') animClass = 'animate-hero-cast';
    if (sprite === 'custom-drink-potion') animClass = 'animate-hero-potion';
    if (sprite === 'custom-guard-tonic') animClass = 'animate-hero-guard';
    if (sprite === 'custom-lobby-hero' && active) animClass = 'animate-hero-idle';
  }

  return (
    <div className={`relative flex items-end justify-center ${className}`} style={style}>
      <img 
         src={imgSrc} 
         alt={alt || characterId} 
         className={`max-w-full max-h-full object-contain ${animClass}`}
         style={{
           animationDuration: durationMs ? `${durationMs}ms` : undefined,
           animationIterationCount: loop ? 'infinite' : 1,
           transformOrigin: 'bottom center',
           width: '100%',
           height: '100%'
         }}
      />
    </div>
  );
}