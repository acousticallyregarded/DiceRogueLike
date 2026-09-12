import { RunState } from '../engine';
import { useEffect, useState } from 'react';

export function CombatOverlay({ run }: { run: RunState }) {
  const { enemy, playerCombat } = run;
  const [playerAttackAnimate, setPlayerAttackAnimate] = useState(false);
  const [enemyAttackAnimate, setEnemyAttackAnimate] = useState(false);

  const [prevPTimer, setPrevPTimer] = useState(playerCombat?.attackTimer || 0);
  const [prevETimer, setPrevETimer] = useState(enemy?.attackTimer || 0);

  useEffect(() => {
    if (!playerCombat) return;
    if (playerCombat.attackTimer < prevPTimer) {
      setPlayerAttackAnimate(true);
      setTimeout(() => setPlayerAttackAnimate(false), 200);
    }
    setPrevPTimer(playerCombat.attackTimer);
  }, [playerCombat?.attackTimer]);

  useEffect(() => {
    if (!enemy) return;
    if (enemy.attackTimer < prevETimer) {
      setEnemyAttackAnimate(true);
      setTimeout(() => setEnemyAttackAnimate(false), 200);
    }
    setPrevETimer(enemy.attackTimer);
  }, [enemy?.attackTimer]);

  if (!enemy || !playerCombat) return null;

  const monsterImageMap: Record<string, string> = {
    'Wolf': 'wolf.png',
    'Slime': 'slime.png',
    'Goblin': 'goblin.png',
    'Skeleton': 'skeleton.png',
    'The Overlord': 'boss.png'
  };
  const monsterImage = monsterImageMap[enemy.name] || 'wolf.png';

  return (
    <div className="absolute top-0 left-0 right-0 h-[60%] flex flex-col z-20 overflow-hidden pt-20 pb-4">
      {/* Round label */}
      <div className="absolute top-24 left-0 right-0 flex justify-center z-30 pointer-events-none">
        <div className="bg-[var(--color-ui-purple)] text-white px-4 py-1 rounded-full font-black text-sm border-2 border-[#1c1c1c] shadow-md uppercase tracking-wider">
          Floor {run.floor} Combat
        </div>
      </div>

      {/* Characters */}
      <div className="flex-1 relative flex items-end justify-between px-8 pb-12">
        {/* Player */}
        <div className="relative flex flex-col items-center">
          <div className={`w-28 h-28 transition-transform duration-100 ${playerAttackAnimate ? 'translate-x-8 scale-110' : ''}`}>
            <img src="/src/assets/hero.png" className="w-full h-full object-contain drop-shadow-xl" alt="Hero" />
          </div>
          <div className="mt-2 w-24 h-4 bg-red-900 border-2 border-[#1c1c1c] rounded overflow-hidden relative shadow-md">
            <div className="absolute inset-0 bg-red-500 origin-left transition-transform duration-200" style={{ transform: `scaleX(${Math.max(0, run.hp / run.maxHp)})` }} />
            <div className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-white text-shadow-sm">
              {Math.floor(run.hp)}
            </div>
          </div>
          {/* Attack bar */}
          <div className="mt-1 w-24 h-1.5 bg-slate-900 border border-[#1c1c1c] rounded-full overflow-hidden">
            <div className="h-full bg-amber-400" style={{ width: `${playerCombat.attackTimer}%` }} />
          </div>
        </div>

        {/* Enemy */}
        <div className="relative flex flex-col items-center">
          <div className={`w-28 h-28 transition-transform duration-100 ${enemyAttackAnimate ? '-translate-x-8 scale-110' : ''}`}>
            <img src={`/src/assets/${monsterImage}`} className="w-full h-full object-contain drop-shadow-xl transform scale-x-[-1]" alt={enemy.name} />
          </div>
          <div className="mt-2 w-24 h-4 bg-red-900 border-2 border-[#1c1c1c] rounded overflow-hidden relative shadow-md">
            <div className="absolute inset-0 bg-red-500 origin-left transition-transform duration-200" style={{ transform: `scaleX(${Math.max(0, enemy.hp / enemy.maxHp)})` }} />
            <div className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-white text-shadow-sm">
              {Math.floor(enemy.hp)}
            </div>
          </div>
          {/* Attack bar */}
          <div className="mt-1 w-24 h-1.5 bg-slate-900 border border-[#1c1c1c] rounded-full overflow-hidden">
            <div className="h-full bg-amber-400" style={{ width: `${enemy.attackTimer}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}