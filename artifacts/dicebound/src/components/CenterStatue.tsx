import pedestalUrl from '../assets/center-pedestal.png';
import statueUrl from '../assets/center-statue.png';
import { SpriteAnimator } from './SpriteAnimator';

export function CenterStatue({ rollsLeft, ready, alert }: { rollsLeft: number; ready: boolean; alert?: boolean }) {
  // Fallback to rollsLeft if alert isn't provided (for backward compat if needed)
  const isAlert = alert ?? (rollsLeft <= 10);
  
  return (
    <div className="absolute w-[200px] h-[250px] -ml-[100px] -mt-[220px]">
      <img src={pedestalUrl} alt="Stone pedestal" draggable={false}
        className="absolute bottom-0 left-0 w-[200px] h-auto drop-shadow-2xl" />
      <div className="absolute w-[148px] h-[148px] left-[26px] bottom-[60px]">
        {ready || isAlert ? (
          <SpriteAnimator
            key={ready ? 'ready' : 'alert'}
            sprite={ready ? 'center-statue-ready' : 'center-statue-alert'}
            fallbackUrl={statueUrl}
            active
            loop={!ready}
            holdLastFrame={ready}
            frameCount={ready ? 17 : 13}
            durationMs={ready ? 3400 : 2600}
            alt={ready ? 'Skeleton king ready to fight' : 'Skeleton king awakening'}
          />
        ) : (
          <img src={statueUrl} alt="Stationary skeleton king statue" draggable={false}
            className="w-full h-full object-contain drop-shadow-xl" />
        )}
      </div>
    </div>
  );
}
