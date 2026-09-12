import { RunState } from '../engine';
import { Heart, Sword, Shield, Settings, Gem, ShieldAlert } from 'lucide-react';

export function TopBar({ run, floor }: { run: RunState, floor: number }) {
  return (
    <div className="absolute top-4 left-4 right-4 flex flex-col gap-2 z-30 pointer-events-none">
      <div className="flex justify-between items-start">
        <div className="flex gap-1.5">
          {/* Level Pill */}
          <div className="flex items-center bg-[var(--color-ui-purple)] text-white rounded-full px-2 py-1 font-black text-sm border-2 border-[#1c1c1c] shadow-md pointer-events-auto">
             <span className="text-green-400 mr-1 text-xs">EXP</span> Lv. {floor}
          </div>
          {/* Health Pill */}
          <div className="flex items-center bg-[var(--color-ui-purple)] text-white rounded-full px-2 py-1 font-black text-sm border-2 border-[#1c1c1c] shadow-md pointer-events-auto overflow-hidden relative min-w-[90px] justify-center">
            <div className="absolute inset-0 bg-red-500 z-0 origin-left transition-transform duration-300" style={{ transform: `scaleX(${Math.max(0, run.hp / run.maxHp)})` }} />
            <Heart className="w-3 h-3 text-white fill-current mr-1 z-10 relative" />
            <span className="z-10 relative text-xs tracking-tight">{Math.floor(run.hp)} / {run.maxHp}</span>
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
           <button className="bg-white text-slate-800 rounded-full p-1 border-2 border-[#1c1c1c] shadow-md pointer-events-auto active:scale-95">
             <Settings className="w-4 h-4" />
           </button>
        </div>
      </div>
      
      {/* Second Row */}
      <div className="flex gap-2">
        <div className="flex items-center bg-[var(--color-ui-purple)] text-white rounded-full px-2 py-1 font-black text-sm border-2 border-[#1c1c1c] shadow-md pointer-events-auto">
          <Gem className="w-3 h-3 text-cyan-300 mr-1 fill-current" />
          {run.gold + run.gemsEarned}
        </div>
      </div>
    </div>
  );
}