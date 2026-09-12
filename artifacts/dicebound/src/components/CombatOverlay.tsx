import { GameStateV2, RunState } from '../engine';
import { HeroSprite } from './sprites/HeroSprite';
import { MonsterSprite } from './sprites/MonsterSprite';
import { Shield, Sword, Heart, Wind } from 'lucide-react';
import { useEffect, useState } from 'react';

function StatPill({ icon: Icon, value, color }: { icon: any, value: number, color: string }) {
  return (
    <div className={"flex items-center gap-1.5 px-3 py-1 bg-black/40 rounded-full text-sm font-bold " + color}>
      <Icon className="w-4 h-4" />
      {value}
    </div>
  );
}

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

  return (
    <div className="absolute inset-0 z-40 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-8 animate-in fade-in duration-500">
      
      <div className="absolute top-12 text-center">
        <h2 className="text-4xl font-serif text-red-500 font-bold uppercase tracking-widest drop-shadow-[0_0_15px_rgba(255,0,0,0.5)]">Combat</h2>
      </div>

      <div className="w-full max-w-5xl flex justify-between items-end mt-20 relative">
        
        {/* Player Side */}
        <div className="flex flex-col items-center gap-6 w-64">
          <div className="flex gap-2 mb-2">
             <StatPill icon={Sword} value={run.attack} color="text-red-400" />
             <StatPill icon={Shield} value={run.defense} color="text-blue-400" />
             <StatPill icon={Wind} value={run.speed} color="text-green-400" />
          </div>
          
          <div className="relative w-full">
            <div className="flex justify-between text-sm font-bold text-zinc-300 mb-1">
              <span>Hero</span>
              <span>{Math.floor(run.hp)} / {run.maxHp}</span>
            </div>
            <div className="h-4 bg-zinc-900 rounded-full overflow-hidden border border-zinc-700">
              <div className="h-full bg-green-500 transition-all duration-300" style={{ width: Math.max(0, (run.hp / run.maxHp) * 100) + "%" }} />
            </div>
            
            <div className="mt-2 h-1.5 bg-zinc-900 rounded-full overflow-hidden border border-zinc-800">
              <div className="h-full bg-amber-400 transition-all duration-75" style={{ width: playerCombat.attackTimer + "%" }} />
            </div>
          </div>

          <div className={"w-48 h-48 transition-transform duration-100 " + (playerAttackAnimate ? 'translate-x-12 scale-110' : '')}>
            <HeroSprite className="w-full h-full drop-shadow-[0_10px_20px_rgba(0,0,0,0.5)]" />
          </div>
        </div>

        {/* VS / Clash indicator */}
        <div className="text-6xl font-serif text-zinc-700 font-black italic absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-30">
          VS
        </div>

        {/* Enemy Side */}
        <div className="flex flex-col items-center gap-6 w-64">
          <div className="flex gap-2 mb-2">
             <StatPill icon={Sword} value={enemy.attack} color="text-red-400" />
             <StatPill icon={Shield} value={enemy.defense} color="text-blue-400" />
             <StatPill icon={Wind} value={enemy.speed} color="text-green-400" />
          </div>

          <div className="relative w-full">
            <div className="flex justify-between text-sm font-bold text-zinc-300 mb-1">
              <span>{enemy.name}</span>
              <span>{Math.floor(enemy.hp)} / {enemy.maxHp}</span>
            </div>
            <div className="h-4 bg-zinc-900 rounded-full overflow-hidden border border-zinc-700">
              <div className="h-full bg-red-600 transition-all duration-300" style={{ width: Math.max(0, (enemy.hp / enemy.maxHp) * 100) + "%" }} />
            </div>
            
            <div className="mt-2 h-1.5 bg-zinc-900 rounded-full overflow-hidden border border-zinc-800">
              <div className="h-full bg-amber-400 transition-all duration-75" style={{ width: enemy.attackTimer + "%" }} />
            </div>
          </div>

          <div className={"w-48 h-48 transition-transform duration-100 " + (enemyAttackAnimate ? '-translate-x-12 scale-110 drop-shadow-[0_0_20px_rgba(255,0,0,0.6)]' : 'drop-shadow-[0_10px_20px_rgba(0,0,0,0.5)]')}>
            <MonsterSprite name={enemy.name} className="w-full h-full" />
          </div>
        </div>

      </div>
    </div>
  );
}