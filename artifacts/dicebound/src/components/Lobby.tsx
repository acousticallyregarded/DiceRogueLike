import { GameStateV2, GameAction, getMetaCost } from '../engine';
import { Play, Shield, Sword, Heart, Wind, Gem, Hammer, Sparkles } from 'lucide-react';

export function Lobby({ state, dispatch }: { state: GameStateV2, dispatch: (a: GameAction) => void }) {
  const { meta } = state;

  const gearInfo = [
    { id: "weapon", name: "Weapon Mastery", icon: Sword, level: meta.gear.weaponLevel, desc: "Increases starting Attack", type: 'BUY_GEAR' },
    { id: "armor", name: "Armor Mastery", icon: Shield, level: meta.gear.armorLevel, desc: "Increases starting Defense", type: 'BUY_GEAR' },
  ] as const;

  const talentInfo = [
    { id: "vitality", name: "Vitality", icon: Heart, level: meta.talents.vitality, desc: "Increases starting Max HP", type: 'BUY_TALENT' },
    { id: "quickness", name: "Quickness", icon: Wind, level: meta.talents.quickness, desc: "Increases combat speed", type: 'BUY_TALENT' },
  ] as const;

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 bg-zinc-950 text-zinc-100 min-h-screen overflow-y-auto">
      <div className="max-w-5xl w-full py-12">
        <div className="text-center mb-12">
          <h1 className="text-5xl md:text-7xl font-serif text-amber-500 mb-4 tracking-wider drop-shadow-lg">DICEBOUND</h1>
          <p className="text-xl text-zinc-400">The realm awaits your return.</p>
          <div className="mt-8 flex items-center justify-center gap-3 text-3xl font-bold text-fuchsia-400">
            <Gem className="w-8 h-8" />
            {meta.gems} Gems
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-12 mb-12">
          
          {/* Gear Upgrades */}
          <div>
            <h2 className="text-2xl font-serif text-zinc-300 border-b border-zinc-800 pb-2 mb-6 flex items-center gap-2">
               <Hammer className="w-6 h-6 text-zinc-500" /> Persistent Gear
            </h2>
            <div className="flex flex-col gap-4">
              {gearInfo.map(u => {
                const cost = getMetaCost(u.level);
                const canAfford = meta.gems >= cost;
                return (
                  <div key={u.id} className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl flex items-center gap-4 shadow-md">
                    <div className="bg-zinc-800 p-3 rounded-lg">
                      <u.icon className="w-6 h-6 text-zinc-400" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-bold">{u.name} <span className="text-zinc-500 text-xs">Lv.{u.level}</span></h3>
                      <p className="text-zinc-400 text-xs mb-2">{u.desc}</p>
                      <button 
                        onClick={() => dispatch({ type: u.type, stat: u.id as any })}
                        disabled={!canAfford}
                        className={"px-3 py-1.5 rounded font-bold text-xs transition-colors " + (canAfford ? 'bg-fuchsia-900 hover:bg-fuchsia-800 text-fuchsia-100' : 'bg-zinc-800 text-zinc-600 cursor-not-allowed')}
                      >
                        Upgrade ({cost} Gems)
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Talents */}
          <div>
            <h2 className="text-2xl font-serif text-zinc-300 border-b border-zinc-800 pb-2 mb-6 flex items-center gap-2">
               <Sparkles className="w-6 h-6 text-yellow-500" /> Talents
            </h2>
            <div className="flex flex-col gap-4">
              {talentInfo.map(u => {
                const cost = getMetaCost(u.level);
                const canAfford = meta.gems >= cost;
                return (
                  <div key={u.id} className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl flex items-center gap-4 shadow-md">
                    <div className="bg-zinc-800 p-3 rounded-lg">
                      <u.icon className="w-6 h-6 text-amber-500" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-bold">{u.name} <span className="text-zinc-500 text-xs">Lv.{u.level}</span></h3>
                      <p className="text-zinc-400 text-xs mb-2">{u.desc}</p>
                      <button 
                        onClick={() => dispatch({ type: u.type, stat: u.id as any })}
                        disabled={!canAfford}
                        className={"px-3 py-1.5 rounded font-bold text-xs transition-colors " + (canAfford ? 'bg-fuchsia-900 hover:bg-fuchsia-800 text-fuchsia-100' : 'bg-zinc-800 text-zinc-600 cursor-not-allowed')}
                      >
                        Upgrade ({cost} Gems)
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        <div className="flex justify-center pb-24">
          <button 
            onClick={() => dispatch({ type: 'START_RUN' })}
            className="group relative px-12 py-6 bg-amber-700 hover:bg-amber-600 rounded-full font-bold text-2xl text-amber-100 shadow-[0_0_40px_rgba(217,119,6,0.3)] transition-all hover:scale-105"
          >
            <span className="flex items-center gap-3">
              <Play className="w-8 h-8 fill-current" /> Enter the Realm
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}