import { RunState } from '../engine';
import { useEffect, useState } from 'react';

import wolfUrl from '../assets/wolf.png';
import slimeUrl from '../assets/slime.png';
import goblinUrl from '../assets/goblin.png';
import skeletonUrl from '../assets/skeleton.png';
import bossUrl from '../assets/boss.png';
import heroUrl from '../assets/hero.png';

export function CombatOverlay({ run }: { run: RunState }) {
  const { enemies, playerCombat } = run;
  const [playerAttackAnimate, setPlayerAttackAnimate] = useState(false);
  const [enemyAttackAnimate, setEnemyAttackAnimate] = useState<Record<string, boolean>>({});

  const [prevPTimer, setPrevPTimer] = useState(playerCombat?.attackTimer || 0);

  useEffect(() => {
    if (!playerCombat) return;
    if (playerCombat.attackTimer < prevPTimer) {
      setPlayerAttackAnimate(true);
      setTimeout(() => setPlayerAttackAnimate(false), 200);
    }
    setPrevPTimer(playerCombat.attackTimer);
  }, [playerCombat?.attackTimer, prevPTimer]);

  // Handle enemy animation
  useEffect(() => {
    const nextEnemyAnims: Record<string, boolean> = {};
    enemies.forEach(e => {
      // Just a simplified hack for this visual rewrite: trigger animation on attack timer reset (or close to it)
      // Since we don't have previous state mapped by ID easily without refs, we'll skip complex enemy attack anims
      // or just do a generic pulse.
    });
  }, [enemies]);

  if (enemies.length === 0 || !playerCombat) return null;

  const getMonsterImage = (name: string) => {
    if (name.includes('Wolf')) return wolfUrl;
    if (name.includes('Slime')) return slimeUrl;
    if (name.includes('Goblin')) return goblinUrl;
    if (name.includes('Skeleton')) return skeletonUrl;
    if (name.includes('Overlord')) return bossUrl;
    if (name.includes('Orc') || name.includes('Ogre')) return goblinUrl; // Fallback
    return wolfUrl;
  };

  return (
    <div className="absolute top-0 left-0 right-0 h-[60%] flex flex-col z-20 overflow-hidden pt-24 pb-4">
      {/* Round label */}
      <div className="absolute top-20 left-0 right-0 flex justify-center z-30 pointer-events-none">
        <div className="bg-[var(--color-ui-purple)] text-white px-4 py-1 rounded-full font-black text-xs border-2 border-[#1c1c1c] shadow-[0_2px_0_#1c1c1c] uppercase tracking-wider">
          Floor {run.floor} • Round {playerCombat.roundCounter}/30
        </div>
      </div>

      {/* Characters */}
      <div className="flex-1 relative flex items-end justify-between px-6 pb-12">
        {/* Player */}
        <div className="relative flex flex-col items-center">
          <div className={`w-28 h-28 transition-transform duration-100 ${playerAttackAnimate ? 'translate-x-8 scale-110' : ''}`}>
            <img src={heroUrl} className="w-full h-full object-contain drop-shadow-xl" alt="Hero" />
          </div>
          <div className="mt-2 w-20 h-4 bg-red-950 border-2 border-[#1c1c1c] rounded overflow-hidden relative shadow-sm">
            <div className="absolute inset-0 bg-red-500 origin-left transition-transform duration-200" style={{ transform: `scaleX(${Math.max(0, run.hp / run.maxHp)})` }} />
            <div className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-white text-shadow-sm">
              {Math.floor(run.hp)}
            </div>
          </div>
          {/* Attack bar */}
          <div className="mt-1 w-20 h-1.5 bg-slate-900 border border-[#1c1c1c] rounded-full overflow-hidden">
            <div className="h-full bg-amber-400" style={{ width: `${Math.min(100, playerCombat.attackTimer)}%` }} />
          </div>
        </div>

        {/* Enemies */}
        <div className="relative flex items-end gap-2">
          {enemies.map(enemy => (
            <div key={enemy.id} className={`relative flex flex-col items-center transition-opacity duration-300 ${enemy.hp <= 0 ? 'opacity-0 scale-50' : 'opacity-100'}`}>
              <div className="w-20 h-20">
                <img src={getMonsterImage(enemy.name)} className="w-full h-full object-contain drop-shadow-xl transform scale-x-[-1]" alt={enemy.name} />
              </div>
              <div className="text-[9px] font-black text-white bg-black/60 px-1 rounded absolute -top-4">{enemy.name}</div>
              <div className="mt-2 w-16 h-3 bg-red-950 border-2 border-[#1c1c1c] rounded overflow-hidden relative shadow-sm">
                <div className="absolute inset-0 bg-red-500 origin-left transition-transform duration-200" style={{ transform: `scaleX(${Math.max(0, enemy.hp / enemy.maxHp)})` }} />
              </div>
              {/* Attack bar */}
              <div className="mt-1 w-16 h-1.5 bg-slate-900 border border-[#1c1c1c] rounded-full overflow-hidden">
                <div className="h-full bg-amber-400" style={{ width: `${Math.min(100, enemy.attackTimer)}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}