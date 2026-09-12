import { GameStateV4, GameAction, COMBAT_SPEED_BASELINE, MAX_COMBAT_SPEED_DAMAGE } from '../engine';
import { Play, Settings2, Sparkles, Sword, Shield, Zap, Box, HelpCircle, BookOpen, Gem, Heart, Wind } from 'lucide-react';
import { useState } from 'react';
import { MonsterGuide } from './MonsterGuide';

import statueUrl from '../assets/statue.png';
import treeUrl from '../assets/tree.png';
import heroUrl from '../assets/custom-lobby-hero.png';
import { SpriteAnimator } from './SpriteAnimator';
import { AudioSettingsButton } from './AudioSettings';

export function Lobby({ state, dispatch }: { state: GameStateV4, dispatch: (a: GameAction) => void }) {
  const [tab, setTab] = useState<'play' | 'gear' | 'talents'>('play');
  const [showHelp, setShowHelp] = useState(false);
  const [showBestiary, setShowBestiary] = useState(false);

  const { meta } = state;

  return (
    <div className="min-h-[100dvh] w-full flex justify-center bg-zinc-900 font-sans">
      <div className="w-full max-w-[390px] h-[100dvh] relative overflow-hidden bg-[#e0ff00] flex flex-col">
        
        {/* Grass Background details */}
        <div className="absolute inset-0 pointer-events-none opacity-50" style={{ backgroundImage: 'radial-gradient(#a3e635 2px, transparent 2px)', backgroundSize: '24px 24px' }} />

        {/* Scenic Art - Replace empty space with scenic outdoor lobby */}
        <div className="absolute top-0 left-0 right-0 h-[min(440px,65dvh)] pointer-events-none flex justify-center items-end opacity-100 overflow-hidden">
           <div className="absolute inset-0 bg-gradient-to-b from-sky-300 to-sky-100" />
           <div className="absolute bottom-0 left-0 right-0 h-16 bg-[#9ecb36] border-t-4 border-[#8aab29]" />
           <img src={statueUrl} className="absolute bottom-16 right-4 h-32 object-contain opacity-70" alt="Statue" />
           <img src={treeUrl} className="absolute bottom-12 left-2 h-24 object-contain drop-shadow-md" alt="Tree" />
           <img src={treeUrl} className="absolute bottom-8 right-16 h-28 object-contain drop-shadow-md" alt="Tree" />
           <div className="w-[min(340px,90vw,calc(65dvh-76px))] aspect-square relative z-10 drop-shadow-2xl">
             <SpriteAnimator
               sprite="custom-lobby-hero"
               fallbackUrl={heroUrl}
               active
               loop
               frameCount={9}
               durationMs={1800}
               alt="Hero"
             />
           </div>
        </div>

        {/* Top Header */}
        <div className="relative z-20 p-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-black tracking-tighter uppercase italic text-amber-500" style={{ WebkitTextStroke: '1.5px black' }}>Dicebound</h1>
            <button onClick={() => setShowHelp(true)} aria-label="Help" className="p-1.5 bg-white rounded-full border-2 border-slate-800 shadow-sm active:scale-95 text-slate-700">
              <HelpCircle className="w-4 h-4"/>
            </button>
            <button onClick={() => setShowBestiary(true)} aria-label="Open Bestiary" className="p-1.5 bg-white rounded-full border-2 border-slate-800 shadow-sm active:scale-95 text-purple-700">
              <BookOpen className="w-4 h-4"/>
            </button>
            <AudioSettingsButton />
          </div>
          <div className="flex items-center gap-1.5 font-black bg-[var(--color-ui-purple)] text-white px-3 py-1 rounded-full border-2 border-[#1c1c1c] shadow-md text-sm">
            <Gem className="w-4 h-4 text-cyan-300 fill-current" /> {meta.gems}
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 relative z-20 flex flex-col px-4 pb-28 overflow-y-auto">
           
           {tab === 'play' && (
             <div className="mt-auto mb-10">
               <button 
                 onClick={() => dispatch({ type: 'START_RUN' })}
                 className="w-full bg-[#ff5733] hover:bg-[#ff6847] active:bg-[#d9381e] text-white py-6 rounded-[32px] font-black text-3xl uppercase tracking-wider border-4 border-[#1c1c1c] shadow-[0_8px_0_rgba(28,28,28,1)] active:shadow-none active:translate-y-2 transition-all flex justify-center items-center gap-3 group"
               >
                 <Play className="w-8 h-8 fill-current group-hover:animate-bounce" /> Play
               </button>
             </div>
           )}

           {tab === 'gear' && (
             <div className="bg-white rounded-[32px] p-5 border-4 border-[#1c1c1c] shadow-[0_8px_0_rgba(28,28,28,1)] mt-4">
               <h2 className="text-xl font-black text-slate-800 mb-4 flex items-center gap-2 uppercase tracking-wide">
                 <Box className="w-5 h-5 text-slate-400" /> Gear & Inventory
               </h2>
               
               <div className="flex justify-between items-center bg-slate-100 border-2 border-slate-200 p-3 rounded-2xl mb-4">
                 <div className="flex items-center gap-2 font-black text-slate-600">
                   <Gem className="w-5 h-5 text-cyan-400 fill-current"/> 100 to open
                 </div>
                 <button 
                   onClick={() => dispatch({ type: 'OPEN_CHEST' })}
                   disabled={meta.gems < 100}
                   className="bg-amber-400 hover:bg-amber-300 text-slate-900 border-b-4 border-amber-600 active:border-b-0 active:translate-y-1 px-4 py-2 rounded-xl font-black text-sm transition-all disabled:opacity-50 disabled:active:border-b-4 disabled:active:translate-y-0"
                 >
                   Open Chest
                 </button>
               </div>

               <div className="grid grid-cols-3 gap-3 mb-4">
                 {[
                   { slot: 'weapon', icon: Sword, color: 'text-red-400' },
                   { slot: 'armor', icon: Shield, color: 'text-blue-400' },
                   { slot: 'accessory', icon: Zap, color: 'text-yellow-400' }
                 ].map(s => {
                   const equippedId = meta.equipped[s.slot as keyof typeof meta.equipped];
                   return (
                     <div key={s.slot} className="bg-slate-100 aspect-square rounded-2xl flex flex-col items-center justify-center border-2 border-slate-200 relative">
                       <div className="text-[10px] font-black text-slate-400 mb-1 uppercase tracking-wider">{s.slot}</div>
                       {equippedId ? (
                         <button onClick={() => dispatch({ type: 'UNEQUIP_ITEM', slot: s.slot as any })} aria-label={`Unequip ${s.slot}`} className="bg-white p-2 rounded-xl border border-slate-200 shadow-sm active:scale-95 transition-transform">
                           <s.icon className={`w-6 h-6 ${s.color} fill-current`} />
                         </button>
                       ) : (
                         <s.icon className="w-8 h-8 text-slate-300" />
                       )}
                     </div>
                   );
                 })}
               </div>

               <div className="bg-slate-100 rounded-2xl p-3 border-2 border-slate-200 min-h-[150px]">
                 <div className="text-[10px] font-black text-slate-400 mb-2 uppercase tracking-wider">Inventory</div>
                 {meta.inventory.length === 0 ? (
                   <div className="text-center font-bold text-slate-400 mt-6">Empty</div>
                 ) : (
                   <div className="flex flex-col gap-2">
                     {meta.inventory.map(item => (
                       <div key={item.id} className="bg-white rounded-xl p-3 flex justify-between items-center border border-slate-200 shadow-sm">
                         <div>
                           <div className={`text-sm font-black capitalize ${item.rarity === 'legendary' ? 'text-amber-500' : item.rarity === 'epic' ? 'text-purple-500' : item.rarity === 'rare' ? 'text-blue-500' : item.rarity === 'uncommon' ? 'text-green-500' : 'text-slate-600'}`}>{item.name}</div>
                           <div className="text-[10px] font-bold text-slate-400">
                             {item.stats.attack ? `+${item.stats.attack} ATK ` : ''}
                             {item.stats.defense ? `+${item.stats.defense} DEF ` : ''}
                              {item.stats.speed ? `+${item.stats.speed} Speed ` : ''}
                             {item.stats.maxHp ? `+${item.stats.maxHp} HP ` : ''}
                           </div>
                         </div>
                         {meta.equipped[item.type] !== item.id && (
                           <button 
                             onClick={() => dispatch({ type: 'EQUIP_ITEM', itemId: item.id })}
                             className="bg-[var(--color-ui-purple)] text-white px-3 py-1.5 rounded-lg font-black text-xs active:scale-95 shadow-sm"
                           >
                             Equip
                           </button>
                         )}
                       </div>
                     ))}
                   </div>
                 )}
               </div>
             </div>
           )}

           {tab === 'talents' && (
             <div className="bg-white rounded-[32px] p-5 border-4 border-[#1c1c1c] shadow-[0_8px_0_rgba(28,28,28,1)] mt-4">
               <h2 className="text-xl font-black text-slate-800 mb-4 flex items-center gap-2 uppercase tracking-wide">
                 <Settings2 className="w-5 h-5 text-slate-400" /> Talents
               </h2>
               
               <div className="flex flex-col gap-3">
                 {[
                   { id: 'vitality', label: 'Vitality', desc: '+20 Max HP per level', icon: Heart, color: 'text-red-500' },
                   { id: 'power', label: 'Power', desc: '+3 Attack per level', icon: Sword, color: 'text-amber-500' },
                    { id: 'quickness', label: 'Quickness', desc: `+5 Speed; every 20 above ${COMBAT_SPEED_BASELINE} adds +1 attack damage (cap +${MAX_COMBAT_SPEED_DAMAGE})`, icon: Wind, color: 'text-teal-500' }
                 ].map(t => {
                   const level = meta.talents[t.id as keyof typeof meta.talents];
                   const cost = 50 + level * 25;
                   return (
                     <div key={t.id} className="bg-slate-100 border-2 border-slate-200 p-3 rounded-2xl flex justify-between items-center gap-3">
                       <div className="flex items-center gap-3">
                         <div className="bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
                           <t.icon className={`w-5 h-5 ${t.color}`} />
                         </div>
                         <div>
                           <div className="font-black text-sm text-slate-800">{t.label} <span className="text-slate-400">Lv.{level}</span></div>
                           <div className="text-[10px] font-bold text-slate-500">{t.desc}</div>
                         </div>
                       </div>
                       <button 
                         onClick={() => dispatch({ type: 'BUY_TALENT', stat: t.id as any })}
                         disabled={meta.gems < cost}
                         className="bg-amber-400 hover:bg-amber-300 text-slate-900 border-b-4 border-amber-600 active:border-b-0 active:translate-y-1 px-3 py-1.5 rounded-xl font-black text-xs transition-all disabled:opacity-50 disabled:active:border-b-4 disabled:active:translate-y-0"
                       >
                         {cost} <Gem className="inline w-3 h-3 text-fuchsia-500 fill-current" />
                       </button>
                     </div>
                   );
                 })}
               </div>
             </div>
           )}
        </div>

        {/* Bottom Navigation */}
        <div className="absolute bottom-0 left-0 right-0 bg-white border-t-4 border-[#1c1c1c] flex justify-around items-end pt-3 pb-6 z-30 shadow-[0_-8px_20px_rgba(0,0,0,0.1)]">
          <button onClick={() => setTab('gear')} aria-label="Gear tab" className={`flex flex-col items-center gap-1 transition-transform ${tab === 'gear' ? 'text-amber-500 -translate-y-2' : 'text-slate-400'}`}>
            <Box className="w-6 h-6" />
            <span className="text-[10px] font-black uppercase tracking-wider">Gear</span>
          </button>
          <button onClick={() => setTab('play')} aria-label="Play tab" className={`flex flex-col items-center gap-1 transition-transform ${tab === 'play' ? 'text-amber-500 -translate-y-2' : 'text-slate-400'}`}>
            <Play className="w-8 h-8 fill-current" />
            <span className="text-[10px] font-black uppercase tracking-wider">Play</span>
          </button>
          <button onClick={() => setTab('talents')} aria-label="Talents tab" className={`flex flex-col items-center gap-1 transition-transform ${tab === 'talents' ? 'text-amber-500 -translate-y-2' : 'text-slate-400'}`}>
            <Settings2 className="w-6 h-6" />
            <span className="text-[10px] font-black uppercase tracking-wider">Talents</span>
          </button>
        </div>

        {/* Help Modal */}
        {showHelp && (
          <div className="absolute inset-0 z-50 bg-black/60 flex items-center justify-center p-6 backdrop-blur-sm pointer-events-auto" onClick={() => setShowHelp(false)}>
            <div className="bg-white rounded-[32px] p-6 w-full max-h-[80vh] flex flex-col gap-4 overflow-y-auto border-4 border-[#1c1c1c] shadow-2xl" onClick={e => e.stopPropagation()}>
              <h2 className="text-2xl font-black text-amber-500 text-center uppercase" style={{ WebkitTextStroke: '1px black' }}>How to Play</h2>
              <div className="text-sm font-semibold text-slate-600 space-y-4">
                <p><strong>The Board:</strong> Roll two dice to travel around a 24-tile square perimeter. The camera follows you automatically.</p>
                 <p><strong>The Boss:</strong> Rather than a final tile, a Boss encounter is scheduled every 30 rolls. Defeat it to clear the floor!</p>
                 <p><strong>Combat:</strong> Choose an attack stance, inspect enemies, then press Attack. You may use a consumable instead; enemies respond once after each committed action. There is no round timeout.</p>
                 <p><strong>Speed:</strong> Your Speed is a combat stat. At {COMBAT_SPEED_BASELINE}, each 20 points above base adds +1 successful outgoing attack damage, capped at +{MAX_COMBAT_SPEED_DAMAGE}.</p>
                 <p><strong>Skills & Upgrades:</strong> Level up through XP to choose 1 of 3 named skill cards. Use the Shop to buy stat boosts.</p>
                <p><strong>Lobby Progression:</strong> Earn gems during runs to buy Chests (random equippable gear) and permanent Talents.</p>
              </div>
              <button onClick={() => setShowHelp(false)} className="mt-4 w-full py-3 bg-slate-200 text-slate-700 rounded-2xl font-black text-lg border-b-4 border-slate-300 active:border-b-0 active:translate-y-1 transition-all">Got it!</button>
            </div>
          </div>
        )}

        {showBestiary && <MonsterGuide onClose={() => setShowBestiary(false)} />}

      </div>
    </div>
  );
}