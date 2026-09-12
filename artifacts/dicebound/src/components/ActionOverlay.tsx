import { RunState, GameAction, MetaState } from '../engine';
import { Gift, Coins, Shield, Sword, Heart, Wind, Star, Zap, Skull } from 'lucide-react';

export function ActionOverlay({ run, dispatch, meta }: { run: RunState, dispatch: (a: GameAction) => void, meta: MetaState }) {
  if (run.phase === 'boss_awakening') {
    return (
      <div
        className="absolute bottom-5 left-3 right-3 z-50 flex justify-center pointer-events-none"
        role="status"
        aria-live="polite"
      >
        <div className="rounded-full border-2 border-[#1c1c1c] bg-black/75 px-4 py-2 text-center text-[11px] font-black uppercase tracking-wide text-amber-100 shadow-lg">
          The ancient statue rises...
        </div>
      </div>
    );
  }

  if (run.phase === 'boss_ready') {
    return (
      <div className="absolute bottom-4 left-3 right-3 z-50 pointer-events-auto">
        <div className="rounded-2xl border-4 border-[#1c1c1c] bg-slate-950/90 p-3 text-center text-white shadow-2xl">
          <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-amber-200">
            The statue is awake
          </p>
          <p className="mb-3 text-xs font-bold text-slate-200">
            Its seal breaks. Activate the statue to challenge the Floor {run.floor} Boss.
          </p>
          <button
            type="button"
            onClick={() => dispatch({ type: 'FIGHT_BOSS' })}
            className="w-full rounded-xl border-b-4 border-amber-700 bg-amber-400 py-2.5 text-sm font-black uppercase text-slate-950 transition-all active:translate-y-1 active:border-b-0"
          >
            Fight Floor {run.floor} Boss
          </button>
        </div>
      </div>
    );
  }

  if (run.phase === 'explore' || run.phase === 'moving' || run.phase === 'combat') {
    return null;
  }

  return (
    <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center p-4 animate-in zoom-in duration-300 pointer-events-auto">
      
      {run.phase === 'level_up' && run.skillOptions && (
        <div className="w-full max-w-sm flex flex-col items-center bg-white rounded-[32px] p-6 shadow-2xl border-4 border-[#1c1c1c]">
          <h2 className="text-2xl text-amber-500 mb-2 font-black uppercase text-center" style={{ WebkitTextStroke: '1px black' }}>Level Up!</h2>
          <p className="text-slate-500 font-bold mb-4">Choose a Skill ({run.queuedLevels} queued)</p>
          <div className="flex flex-col gap-3 w-full">
            {run.skillOptions.map(sk => (
              <button
                key={sk.id}
                onClick={() => dispatch({ type: 'CHOOSE_SKILL', skillId: sk.id })}
                className="bg-slate-100 border-2 border-slate-300 hover:border-amber-400 active:bg-slate-200 rounded-2xl p-4 flex items-center gap-4 transition-all active:scale-95 group w-full text-left"
              >
                <div className="p-3 bg-white rounded-xl shadow-sm border border-slate-200">
                  <Zap className="w-6 h-6 text-yellow-500 fill-current" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-black text-slate-800 leading-tight">{sk.name}</h3>
                  <p className="text-slate-500 text-xs font-semibold leading-tight mt-1">{sk.description}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {run.phase === 'shop' && run.shopItems && (
        <div className="w-full max-w-sm flex flex-col items-center bg-white rounded-[32px] p-6 shadow-2xl border-4 border-[#1c1c1c]">
          <h2 className="text-2xl text-amber-500 mb-2 font-black uppercase text-center" style={{ WebkitTextStroke: '1px black' }}>Merchant</h2>
          <div className="flex items-center gap-2 text-xl text-yellow-500 mb-4 font-black bg-yellow-50 px-4 py-1 rounded-full border border-yellow-200">
            <Coins className="w-5 h-5 fill-current" /> {run.gold} Gold
          </div>
          
          <div className="flex flex-col gap-3 w-full mb-4">
            {run.shopItems.map(item => {
              const canAfford = run.gold >= item.cost;
              return (
                <button
                  key={item.id}
                  onClick={() => dispatch({ type: 'BUY_SHOP', itemId: item.id })}
                  disabled={!canAfford}
                  className={`bg-slate-100 border-2 rounded-2xl p-3 flex flex-row items-center text-left gap-3 transition-all w-full ${canAfford ? 'border-slate-300 active:scale-95' : 'border-slate-200 opacity-60'}`}
                >
                  <div className="flex-1">
                    <h3 className="text-sm font-black text-slate-800 leading-tight">{item.name}</h3>
                    <p className="text-slate-500 text-[10px] font-semibold leading-tight mt-0.5">{item.description}</p>
                   <p className="text-[9px] font-black uppercase tracking-wide text-slate-400 mt-1">Stock: {item.stock}</p>
                  </div>
                  <div className={`font-black flex items-center gap-1 bg-white px-2 py-1 rounded-lg border border-slate-200 shadow-sm ${canAfford ? 'text-yellow-500' : 'text-slate-400'}`}>
                    <Coins className="w-3 h-3" /> {item.cost}
                  </div>
                </button>
              );
            })}
            {run.shopItems.length === 0 && <div className="text-center font-bold text-slate-400 py-4">Sold out!</div>}
          </div>
          
          <div className="flex gap-2 w-full">
            <button 
              onClick={() => dispatch({ type: 'REROLL_SHOP' })}
              disabled={run.gold < run.shopRerollCost}
              className="flex-1 py-3 bg-blue-500 text-white rounded-2xl font-black text-sm border-b-4 border-blue-700 active:border-b-0 active:translate-y-1 transition-all disabled:opacity-50 disabled:active:translate-y-0 disabled:border-b-4"
            >
              Reroll ({run.shopRerollCost})
            </button>
            <button 
              onClick={() => dispatch({ type: 'LEAVE_SHOP' })}
              className="flex-1 py-3 bg-slate-200 text-slate-700 rounded-2xl font-black text-sm border-b-4 border-slate-300 active:border-b-0 active:translate-y-1 transition-all"
            >
              Leave
            </button>
          </div>
        </div>
      )}

      {run.phase === 'event_test_of_might' && (
        <div className="w-full max-w-sm flex flex-col items-center bg-white rounded-[32px] p-6 shadow-2xl border-4 border-[#1c1c1c] text-center">
          <Skull className="w-16 h-16 text-purple-500 mb-4 fill-current" />
          <h2 className="text-2xl text-purple-500 mb-2 font-black uppercase" style={{ WebkitTextStroke: '1px black' }}>Test of Might</h2>
          <p className="text-slate-600 font-semibold mb-6">Two Elite enemies stand before you. Defeat them for glory, or walk away.</p>
          <div className="flex flex-col gap-3 w-full">
            <button 
              onClick={() => dispatch({ type: 'TEST_OF_MIGHT_ENTER' })}
              className="w-full py-4 bg-purple-500 text-white rounded-2xl font-black text-lg border-b-4 border-purple-700 active:border-b-0 active:translate-y-1 transition-all"
            >
              Enter Combat
            </button>
            <button 
              onClick={() => dispatch({ type: 'TEST_OF_MIGHT_LEAVE' })}
              className="w-full py-4 bg-slate-200 text-slate-700 rounded-2xl font-black text-lg border-b-4 border-slate-300 active:border-b-0 active:translate-y-1 transition-all"
            >
              Walk Away
            </button>
          </div>
        </div>
      )}

      {run.phase === 'rest' && (
        <div className="w-full max-w-sm flex flex-col items-center bg-white rounded-[32px] p-6 shadow-2xl border-4 border-[#1c1c1c] text-center">
          <Heart className="w-16 h-16 text-red-500 mb-4 fill-current" />
          <h2 className="text-2xl text-blue-500 mb-2 font-black uppercase" style={{ WebkitTextStroke: '1px black' }}>A Moment to Rest</h2>
          <p className="text-slate-600 font-semibold mb-6">The campfire is warm. What will you do?</p>
          <div className="flex flex-col gap-3 w-full">
            <button 
              onClick={() => dispatch({ type: 'REST_HEAL' })}
              className="w-full py-4 bg-green-500 text-white rounded-2xl font-black text-lg border-b-4 border-green-700 active:border-b-0 active:translate-y-1 transition-all flex justify-center gap-2"
            >
              <Heart className="w-6 h-6 fill-current" /> Heal 50 HP
            </button>
            <button 
              onClick={() => dispatch({ type: 'REST_TRAIN' })}
              className="w-full py-4 bg-blue-500 text-white rounded-2xl font-black text-lg border-b-4 border-blue-700 active:border-b-0 active:translate-y-1 transition-all flex justify-center gap-2"
            >
              <Sword className="w-6 h-6 fill-current" /> Train (+60 XP)
            </button>
          </div>
        </div>
      )}

      {run.phase === 'minigame' && (
        <div className="w-full max-w-sm flex flex-col items-center bg-white rounded-[32px] p-6 shadow-2xl border-4 border-[#1c1c1c] text-center">
          <Star className="w-16 h-16 text-pink-500 mb-4 fill-current" />
          <h2 className="text-2xl text-pink-500 mb-2 font-black uppercase" style={{ WebkitTextStroke: '1px black' }}>Mysterious Dice</h2>
          <p className="text-slate-600 font-semibold mb-6">Roll the cosmic dice. 30% chance to lose 20 HP. 50% chance to win 40 Gold. 20% chance to win 15 Gems.</p>
          <div className="flex flex-col gap-3 w-full">
            <button 
              onClick={() => dispatch({ type: 'PLAY_MINIGAME' })}
              className="w-full py-4 bg-pink-500 text-white rounded-2xl font-black text-lg border-b-4 border-pink-700 active:border-b-0 active:translate-y-1 transition-all"
            >
              Roll the Dice
            </button>
            <button 
              onClick={() => dispatch({ type: 'LEAVE_MINIGAME' })}
              className="w-full py-4 bg-slate-200 text-slate-700 rounded-2xl font-black text-lg border-b-4 border-slate-300 active:border-b-0 active:translate-y-1 transition-all"
            >
              Walk Away
            </button>
          </div>
        </div>
      )}

      {run.phase === 'victory' && (
        <div className="w-full max-w-sm flex flex-col items-center bg-white rounded-[32px] p-8 shadow-2xl border-4 border-[#1c1c1c] text-center">
          <h1 className="text-4xl text-amber-500 mb-2 font-black uppercase" style={{ WebkitTextStroke: '1.5px black' }}>Victory!</h1>
          <p className="text-slate-600 font-bold mb-6">You conquered floor {run.floor}.</p>
          <div className="bg-slate-100 p-4 rounded-2xl mb-8 w-full border-2 border-slate-200 font-bold">
            <div className="flex justify-between items-center mb-2">
              <span className="text-slate-500">Gems Earned:</span>
              <span className="text-fuchsia-500">+{run.gemsEarned}</span>
            </div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-slate-500">Gold Converted:</span>
              <span className="text-fuchsia-500">+{Math.floor(run.gold / 10)}</span>
            </div>
            <div className="h-px bg-slate-300 my-3" />
            <div className="flex justify-between items-center text-lg text-amber-500 font-black">
              <span>Total Gems:</span>
              <span>+{run.gemsEarned + Math.floor(run.gold / 10)}</span>
            </div>
          </div>
          <div className="flex flex-col gap-3 w-full">
            <button 
              onClick={() => dispatch({ type: 'CONTINUE_RUN' })}
              className="w-full py-4 bg-green-500 text-white rounded-2xl font-black text-xl border-b-4 border-green-700 active:border-b-0 active:translate-y-1 transition-all"
            >
              Continue to Floor {run.floor + 1}
            </button>
            <button 
              onClick={() => dispatch({ type: 'RETURN_TO_LOBBY' })}
              className="w-full py-4 bg-slate-200 text-slate-700 rounded-2xl font-black text-xl border-b-4 border-slate-300 active:border-b-0 active:translate-y-1 transition-all"
            >
              Return to Lobby
            </button>
          </div>
        </div>
      )}

      {run.phase === 'defeat' && (
        <div className="w-full max-w-sm flex flex-col items-center bg-white rounded-[32px] p-8 shadow-2xl border-4 border-[#1c1c1c] text-center">
          <h1 className="text-4xl text-red-500 mb-2 font-black uppercase" style={{ WebkitTextStroke: '1.5px black' }}>Defeat</h1>
          <p className="text-slate-600 font-bold mb-6">You fell in battle.</p>
          <div className="bg-slate-100 p-4 rounded-2xl mb-8 w-full border-2 border-slate-200 font-bold">
            <div className="flex justify-between items-center mb-2">
              <span className="text-slate-500">Gems Earned:</span>
              <span className="text-fuchsia-500">+{run.gemsEarned}</span>
            </div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-slate-500">Gold Converted:</span>
              <span className="text-fuchsia-500">+{Math.floor(run.gold / 10)}</span>
            </div>
            <div className="h-px bg-slate-300 my-3" />
            <div className="flex justify-between items-center text-lg text-amber-500 font-black">
              <span>Total Gems:</span>
              <span>+{run.gemsEarned + Math.floor(run.gold / 10)}</span>
            </div>
          </div>
          <button 
            onClick={() => dispatch({ type: 'RETURN_TO_LOBBY' })}
            className="w-full py-4 bg-red-500 text-white rounded-2xl font-black text-xl border-b-4 border-red-700 active:border-b-0 active:translate-y-1 transition-all"
          >
            Accept Fate
          </button>
        </div>
      )}
      
    </div>
  );
}