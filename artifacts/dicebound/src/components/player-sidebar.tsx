import { GameState } from '../game';
import { Shield, Sword, Heart, Coins, Trophy, Star, FlaskConical, Info } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { useState } from 'react';

export function PlayerSidebar({ state, dispatch, isAnimating }: { state: GameState, dispatch: any, isAnimating: boolean }) {
  const weaponCost = 40 + state.weaponLevel * 30;
  const armorCost = 35 + state.armorLevel * 25;
  const xpMax = state.level * 60;
  
  const canUpgradeWeapon = state.gold >= weaponCost;
  const canUpgradeArmor = state.gold >= armorCost;

  return (
    <aside className="w-full md:w-72 border-b md:border-b-0 md:border-r border-border bg-card/90 flex flex-col z-20 shadow-xl overflow-y-auto">
      <div className="p-6 pb-4 border-b border-border/50 text-center relative">
        <h1 className="font-serif text-3xl font-bold tracking-wider text-primary drop-shadow-sm">Dicebound</h1>
        <p className="text-muted-foreground text-sm mt-1 uppercase tracking-widest">Floor {state.floor} &bull; Level {state.level}</p>
        
        <div className="absolute right-4 top-6">
          <Popover>
            <PopoverTrigger asChild>
              <button className="text-muted-foreground hover:text-foreground transition-colors p-1" title="How to play">
                <Info className="w-5 h-5" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-80 text-sm font-medium border-border/50 shadow-2xl p-4 bg-card z-50">
              <h3 className="font-bold text-base mb-2 font-serif text-primary">Rules of Dicebound</h3>
              <ul className="space-y-2 text-muted-foreground">
                <li><strong className="text-foreground">Explore:</strong> Roll to move across 24 tiles.</li>
                <li><strong className="text-foreground">Tiles:</strong> Battle (red), Treasure (gold), Event (blue), Camp (green - heals 35 HP).</li>
                <li><strong className="text-foreground">Combat:</strong> Attack for full damage (chance to crit). Guard for half damage but block 75% of enemy damage.</li>
                <li><strong className="text-foreground">Boss:</strong> Tile 24 holds the chapter boss. Defeat 3 bosses to win the game!</li>
                <li><strong className="text-foreground">Potions:</strong> Restores 45 HP instantly, even during combat.</li>
              </ul>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="p-6 space-y-6 flex-1">
        {/* Health */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm font-medium">
            <span className="flex items-center gap-1.5 text-destructive"><Heart className="w-4 h-4 fill-destructive/20" /> HP</span>
            <span>{state.hp} / {state.maxHp}</span>
          </div>
          <div className="h-3 bg-background rounded-full overflow-hidden border border-border shadow-inner relative">
            <div 
              className="h-full bg-destructive transition-all duration-500 ease-out"
              style={{ width: `${Math.max(0, Math.min(100, (state.hp / state.maxHp) * 100))}%` }}
            />
          </div>
        </div>

        {/* XP */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm font-medium">
            <span className="flex items-center gap-1.5 text-blue-400"><Star className="w-4 h-4 fill-blue-400/20" /> XP</span>
            <span>{state.xp} / {xpMax}</span>
          </div>
          <div className="h-2 bg-background rounded-full overflow-hidden border border-border shadow-inner">
            <div 
              className="h-full bg-blue-500 transition-all duration-500 ease-out"
              style={{ width: `${Math.min(100, (state.xp / xpMax) * 100)}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <StatBox icon={<Sword className="w-5 h-5 text-orange-400" />} label="Attack" value={state.attack} />
          <StatBox icon={<Shield className="w-5 h-5 text-blue-400" />} label="Armor" value={state.armor} />
          <StatBox icon={<Coins className="w-5 h-5 text-yellow-400" />} label="Gold" value={state.gold} />
          <StatBox icon={<FlaskConical className="w-5 h-5 text-emerald-400" />} label="Potions" value={state.potions} />
        </div>

        {/* Upgrades */}
        <div className="pt-6 border-t border-border/50 space-y-3">
          <h3 className="font-serif text-lg text-foreground/80 mb-3 flex items-center gap-2">
            Blacksmith
          </h3>
          <button 
            disabled={isAnimating || !canUpgradeWeapon}
            onClick={() => dispatch('weapon')}
            className="w-full flex items-center justify-between p-3 rounded-lg bg-background border border-border hover:border-orange-500/50 hover:bg-orange-500/10 transition-colors disabled:opacity-50 disabled:pointer-events-none group"
          >
            <div className="flex flex-col items-start gap-1">
              <div className="flex items-center gap-2">
                <div className="p-1 bg-orange-500/10 rounded-md">
                  <Sword className="w-3.5 h-3.5 text-orange-400" />
                </div>
                <span className="text-sm font-bold">Upgrade Wpn</span>
              </div>
              <span className={`text-xs font-semibold ${canUpgradeWeapon ? 'text-yellow-400' : 'text-red-400'}`}>Cost: {weaponCost}g</span>
            </div>
            <span className="text-xs font-bold text-muted-foreground bg-muted px-2 py-1 rounded">Lv {state.weaponLevel}</span>
          </button>

          <button 
            disabled={isAnimating || !canUpgradeArmor}
            onClick={() => dispatch('armor')}
            className="w-full flex items-center justify-between p-3 rounded-lg bg-background border border-border hover:border-blue-500/50 hover:bg-blue-500/10 transition-colors disabled:opacity-50 disabled:pointer-events-none group"
          >
            <div className="flex flex-col items-start gap-1">
              <div className="flex items-center gap-2">
                <div className="p-1 bg-blue-500/10 rounded-md">
                  <Shield className="w-3.5 h-3.5 text-blue-400" />
                </div>
                <span className="text-sm font-bold">Upgrade Armor</span>
              </div>
              <span className={`text-xs font-semibold ${canUpgradeArmor ? 'text-yellow-400' : 'text-red-400'}`}>Cost: {armorCost}g</span>
            </div>
            <span className="text-xs font-bold text-muted-foreground bg-muted px-2 py-1 rounded">Lv {state.armorLevel}</span>
          </button>
        </div>
      </div>
      
      <div className="p-4 bg-background/50 border-t border-border text-xs text-muted-foreground flex justify-between font-medium">
        <span className="flex items-center gap-1.5"><Trophy className="w-3.5 h-3.5" /> Best Floor: {state.bestFloor}</span>
        <span className="flex items-center gap-1.5"><Trophy className="w-3.5 h-3.5 opacity-50" /> Kills: {state.kills}</span>
      </div>
    </aside>
  );
}

function StatBox({ icon, label, value }: { icon: React.ReactNode, label: string, value: number }) {
  return (
    <div className="bg-background rounded-xl p-3 border border-border flex flex-col items-center justify-center gap-1 shadow-sm">
      {icon}
      <span className="text-xl font-bold font-serif leading-none mt-1">{value}</span>
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">{label}</span>
    </div>
  )
}