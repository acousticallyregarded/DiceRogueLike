import { GameStateV2, GameAction, getMetaCost } from '../engine';
import { Play, Shield, Sword, Heart, Wind, Gem, Hammer, Sparkles } from 'lucide-react';

export function Lobby({ state, dispatch }: { state: GameStateV2, dispatch: (a: GameAction) => void }) {
  const { meta } = state;

  const gearInfo = [
    { id: "weapon", name: "Weapon Mastery", icon: Sword, level: meta.gear.weaponLevel, desc: "Increases Attack", type: 'BUY_GEAR' },
    { id: "armor", name: "Armor Mastery", icon: Shield, level: meta.gear.armorLevel, desc: "Increases Defense", type: 'BUY_GEAR' },
  ] as const;

  const talentInfo = [
    { id: "vitality", name: "Vitality", icon: Heart, level: meta.talents.vitality, desc: "Increases Max HP", type: 'BUY_TALENT' },
    { id: "quickness", name: "Quickness", icon: Wind, level: meta.talents.quickness, desc: "Increases Speed", type: 'BUY_TALENT' },
  ] as const;

  return (
    <div className="min-h-[100dvh] w-full flex justify-center bg-zinc-900">
      <div className="w-full max-w-[390px] h-[100dvh] relative overflow-hidden bg-[#e0ff00] flex flex-col">
        
        {/* Grass Background details */}
        <div className="absolute inset-0 pointer-events-none opacity-50" style={{ backgroundImage: 'radial-gradient(#a3e635 2px, transparent 2px)', backgroundSize: '24px 24px' }} />

        {/* Content */}
        <div className="relative z-10 flex-1 overflow-y-auto pb-32">
          
          <div className="p-8 text-center mt-10">
             <h1 className="text-5xl font-black text-amber-500 uppercase italic tracking-tighter" style={{ WebkitTextStroke: '2px black' }}>DICEBOUND</h1>
             <div className="inline-flex items-center gap-2 mt-4 bg-[var(--color-ui-purple)] text-white px-4 py-2 rounded-full border-2 border-[#1c1c1c] shadow-lg font-black text-xl">
               <Gem className="w-6 h-6 text-cyan-300 fill-current" />
               {meta.gems} <span className="text-cyan-300">GEMS</span>
             </div>
          </div>

          <div className="px-4 flex flex-col gap-6">
            
            {/* Gear Section */}
            <div className="bg-white rounded-3xl p-5 border-4 border-[#1c1c1c] shadow-[0_8px_0_rgba(28,28,28,1)]">
              <h2 className="text-xl font-black text-slate-800 mb-4 flex items-center gap-2 uppercase tracking-wide">
                <Hammer className="w-5 h-5 text-slate-400" /> Gear
              </h2>
              <div className="flex flex-col gap-3">
                {gearInfo.map(u => {
                  const cost = getMetaCost(u.level);
                  const canAfford = meta.gems >= cost;
                  return (
                    <div key={u.id} className="bg-slate-100 border-2 border-slate-200 p-3 rounded-2xl flex items-center gap-3">
                      <div className="bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
                        <u.icon className="w-5 h-5 text-slate-500" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-sm font-black text-slate-800">{u.name} <span className="text-slate-400">Lv.{u.level}</span></h3>
                        <button 
                          onClick={() => dispatch({ type: u.type, stat: u.id as any })}
                          disabled={!canAfford}
                          className={`mt-1 px-3 py-1 rounded-xl font-black text-xs transition-colors ${canAfford ? 'bg-amber-400 hover:bg-amber-300 text-slate-900 border-b-2 border-amber-600 active:border-b-0 active:translate-y-px' : 'bg-slate-300 text-slate-500 border-b-2 border-slate-400 opacity-60'}`}
                        >
                          Upgrade ({cost} <Gem className="inline w-3 h-3 text-fuchsia-500" />)
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Talent Section */}
            <div className="bg-white rounded-3xl p-5 border-4 border-[#1c1c1c] shadow-[0_8px_0_rgba(28,28,28,1)]">
              <h2 className="text-xl font-black text-slate-800 mb-4 flex items-center gap-2 uppercase tracking-wide">
                <Sparkles className="w-5 h-5 text-amber-500" /> Talents
              </h2>
              <div className="flex flex-col gap-3">
                {talentInfo.map(u => {
                  const cost = getMetaCost(u.level);
                  const canAfford = meta.gems >= cost;
                  return (
                    <div key={u.id} className="bg-slate-100 border-2 border-slate-200 p-3 rounded-2xl flex items-center gap-3">
                      <div className="bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
                        <u.icon className="w-5 h-5 text-slate-500" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-sm font-black text-slate-800">{u.name} <span className="text-slate-400">Lv.{u.level}</span></h3>
                        <button 
                          onClick={() => dispatch({ type: u.type, stat: u.id as any })}
                          disabled={!canAfford}
                          className={`mt-1 px-3 py-1 rounded-xl font-black text-xs transition-colors ${canAfford ? 'bg-amber-400 hover:bg-amber-300 text-slate-900 border-b-2 border-amber-600 active:border-b-0 active:translate-y-px' : 'bg-slate-300 text-slate-500 border-b-2 border-slate-400 opacity-60'}`}
                        >
                          Upgrade ({cost} <Gem className="inline w-3 h-3 text-fuchsia-500" />)
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        </div>

        {/* Start Button Fixed at Bottom */}
        <div className="absolute bottom-6 left-6 right-6 z-20">
          <button 
            onClick={() => dispatch({ type: 'START_RUN' })}
            className="w-full bg-[#ff5733] hover:bg-[#ff6847] active:bg-[#d9381e] text-white py-5 rounded-[24px] font-black text-2xl uppercase tracking-wider border-4 border-[#1c1c1c] shadow-[0_8px_0_rgba(28,28,28,1)] active:shadow-none active:translate-y-2 transition-all flex justify-center items-center gap-3"
          >
            <Play className="w-8 h-8 fill-current" /> Play
          </button>
        </div>

      </div>
    </div>
  );
}