import { RunState, COMBAT_SPEED_BASELINE, MAX_COMBAT_SPEED_DAMAGE, getCombatSpeedBonus } from '../engine';
import { Heart, Sword, Gem, ShieldAlert, Coins, Wind, Skull } from 'lucide-react';
import { AudioSettingsButton } from './AudioSettings';
import { getCharacter } from '../characters';

function getNextLevelXp(level: number): number {
  return Math.floor(100 * Math.pow(1.5, level - 1));
}

export function TopBar({ run }: { run: RunState }) {
  const nextXp = getNextLevelXp(run.level);
  const heroDef = getCharacter(run.characterId);
  
  // Use bossCountdown if available (new paces logic), else fallback to bossRollsLeft
  const countdown = run.bossCountdown ?? run.bossRollsLeft;
  
  const bossStatus = run.phase === 'boss_awakening'
    ? 'STATUE AWAKENING'
    : run.phase === 'boss_ready'
      ? `FLOOR ${run.floor} BOSS READY`
      : run.isBossCombat
        ? 'BOSS BATTLE'
        : `BOSS IN ${Math.max(0, countdown)} PACES`;
  
  return (
    <div className="absolute top-4 left-4 right-4 flex flex-col gap-2 z-30 pointer-events-none">
      <div className="flex justify-between items-start">
        <div className="flex flex-col gap-1">
          {/* Character Name */}
          <div className="font-black text-sm text-white tracking-widest uppercase italic" style={{ WebkitTextStroke: '1px black', textShadow: '0 2px 0 #1c1c1c' }}>
            {heroDef.name}
          </div>
          <div className="flex gap-1.5">
            {/* Level Pill */}
            <div className="flex items-center bg-[var(--color-ui-purple)] text-white rounded-full px-2 py-1 font-black text-sm border-2 border-[#1c1c1c] shadow-md pointer-events-auto overflow-hidden relative min-w-[70px] justify-center">
               <div className="absolute inset-0 bg-blue-500 z-0 origin-left transition-transform duration-300" style={{ transform: `scaleX(${Math.max(0, run.xp / nextXp)})` }} />
               <span className="z-10 relative text-xs"><span className="text-green-300 mr-1">EXP</span>Lv. {run.level}</span>
            </div>
            {/* Health Pill */}
            <div className="flex items-center bg-[var(--color-ui-purple)] text-white rounded-full px-2 py-1 font-black text-sm border-2 border-[#1c1c1c] shadow-md pointer-events-auto overflow-hidden relative min-w-[90px] justify-center">
              <div className="absolute inset-0 bg-red-500 z-0 origin-left transition-transform duration-300" style={{ transform: `scaleX(${Math.max(0, run.hp / run.maxHp)})` }} />
              <Heart className="w-3 h-3 text-white fill-current mr-1 z-10 relative" />
              <span className="z-10 relative text-xs tracking-tight">{Math.floor(run.hp)} / {run.maxHp}</span>
            </div>
          </div>
        </div>
        
        <div className="flex gap-1.5">
           {/* Sword */}
           <div className="flex items-center bg-[var(--color-ui-purple)] text-white rounded-full px-2.5 py-1 font-black text-sm border-2 border-[#1c1c1c] shadow-md pointer-events-auto min-w-[50px] justify-center">
             <Sword className="w-3 h-3 text-white mr-1" />
             {run.attack}
           </div>
           {/* Shield */}
           <div className="flex items-center bg-[var(--color-ui-purple)] text-white rounded-full px-2.5 py-1 font-black text-sm border-2 border-[#1c1c1c] shadow-md pointer-events-auto min-w-[50px] justify-center">
             <ShieldAlert className="w-3 h-3 text-blue-300 mr-1" />
             {run.defense}
           </div>
            <AudioSettingsButton className="pointer-events-auto" />
        </div>
      </div>
      
      {/* Second Row */}
      <div className="flex flex-wrap gap-2">
        <div className="flex items-center bg-[var(--color-ui-purple)] text-white rounded-full px-2 py-1 font-black text-sm border-2 border-[#1c1c1c] shadow-md pointer-events-auto">
          <Coins className="w-3 h-3 text-yellow-300 mr-1 fill-current" />
          {run.gold}
        </div>
        <div className="flex items-center bg-[var(--color-ui-purple)] text-white rounded-full px-2 py-1 font-black text-sm border-2 border-[#1c1c1c] shadow-md pointer-events-auto">
          <Gem className="w-3 h-3 text-cyan-300 mr-1 fill-current" />
          {run.gemsEarned}
        </div>
        <div
          className="flex items-center bg-[var(--color-ui-purple)] text-white rounded-full px-2 py-1 font-black text-[10px] border-2 border-[#1c1c1c] shadow-md pointer-events-auto"
          title={`Every 20 Speed above ${COMBAT_SPEED_BASELINE} adds +1 successful attack damage (cap +${MAX_COMBAT_SPEED_DAMAGE})`}
        >
          <Wind className="w-3 h-3 text-teal-200 mr-1" />
          SPD {run.speed} <span className="ml-1 text-teal-200">+{getCombatSpeedBonus(run.speed)} DMG</span>
        </div>
        <div
          className={`flex items-center rounded-full px-2 py-1 font-black text-[10px] border-2 border-[#1c1c1c] shadow-md pointer-events-auto ${
            run.phase === 'boss_awakening'
              ? 'bg-amber-500 text-slate-950'
              : run.phase === 'boss_ready'
                ? 'bg-red-500 text-white'
                : 'bg-[var(--color-ui-purple)] text-white'
          }`}
          role="status"
          aria-live="polite"
        >
          <Skull className="w-3 h-3 mr-1" />
          {bossStatus}
        </div>
      </div>
    </div>
  );
}
