import { RunState } from '../engine';
import { Heart, Sword, Shield, Wind, Coins, Gem } from 'lucide-react';

export function TopBar({ run }: { run: RunState }) {
  return (
    <div className="absolute top-0 left-0 right-0 h-16 bg-zinc-950/80 backdrop-blur border-b border-amber-900/30 flex items-center justify-between px-6 z-30 shadow-lg">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <Heart className="w-5 h-5 text-red-500 fill-current" />
          <div className="w-32 h-4 bg-zinc-900 rounded-full overflow-hidden border border-zinc-700">
            <div 
              className="h-full bg-red-500 transition-all duration-300"
              style={{ width: Math.max(0, (run.hp / run.maxHp) * 100) + "%" }}
            />
          </div>
          <span className="text-sm font-bold text-zinc-300 w-16">{Math.floor(run.hp)}/{run.maxHp}</span>
        </div>
        
        <div className="hidden md:flex gap-4">
          <div className="flex items-center gap-1.5 text-zinc-300 bg-zinc-900 px-3 py-1 rounded-full border border-zinc-800" title="Attack">
            <Sword className="w-4 h-4 text-red-400" />
            <span className="font-bold">{run.attack}</span>
          </div>
          <div className="flex items-center gap-1.5 text-zinc-300 bg-zinc-900 px-3 py-1 rounded-full border border-zinc-800" title="Defense">
            <Shield className="w-4 h-4 text-blue-400" />
            <span className="font-bold">{run.defense}</span>
          </div>
          <div className="flex items-center gap-1.5 text-zinc-300 bg-zinc-900 px-3 py-1 rounded-full border border-zinc-800" title="Speed">
            <Wind className="w-4 h-4 text-green-400" />
            <span className="font-bold">{run.speed}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2 text-yellow-500 font-bold bg-yellow-950/30 px-4 py-1.5 rounded-full border border-yellow-900/50">
          <Coins className="w-5 h-5" />
          {run.gold} Gold
        </div>
        <div className="flex items-center gap-2 text-fuchsia-400 font-bold bg-fuchsia-950/30 px-4 py-1.5 rounded-full border border-fuchsia-900/50">
          <Gem className="w-5 h-5" />
          {run.gemsEarned} Gems
        </div>
      </div>
    </div>
  );
}