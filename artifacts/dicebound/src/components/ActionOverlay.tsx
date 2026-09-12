import { GameAction, RunState } from '../engine';
import { Gift, Coins, Shield, Sword, Heart, Wind, Star } from 'lucide-react';

export function ActionOverlay({ run, dispatch }: { run: RunState, dispatch: (a: GameAction) => void }) {
  if (run.phase === 'explore' || run.phase === 'combat') return null;

  return (
    <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center p-4 animate-in zoom-in duration-300 pointer-events-auto">
      
      {run.phase === 'reward' && run.rewardOptions && (
        <div className="w-full max-w-sm flex flex-col items-center bg-white rounded-[32px] p-6 shadow-2xl border-4 border-[#1c1c1c]">
          <h2 className="text-2xl text-amber-500 mb-6 font-black uppercase text-center stroke-black stroke-2" style={{ WebkitTextStroke: '1px black' }}>Victory Reward</h2>
          <div className="flex flex-col gap-3 w-full">
            {run.rewardOptions.map(opt => (
              <button
                key={opt.id}
                onClick={() => dispatch({ type: 'CHOOSE_REWARD', rewardId: opt.id })}
                className="bg-slate-100 border-2 border-slate-300 hover:border-amber-400 active:bg-slate-200 rounded-2xl p-4 flex items-center gap-4 transition-all active:scale-95 group w-full text-left"
              >
                <div className="p-3 bg-white rounded-xl shadow-sm border border-slate-200">
                  {opt.type === 'maxHp' && <Heart className="w-6 h-6 text-green-500" />}
                  {opt.type === 'attack' && <Sword className="w-6 h-6 text-red-500" />}
                  {opt.type === 'defense' && <Shield className="w-6 h-6 text-blue-500" />}
                  {opt.type === 'speed' && <Wind className="w-6 h-6 text-teal-500" />}
                  {opt.type === 'heal' && <Heart className="w-6 h-6 text-rose-500" fill="currentColor" />}
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-black text-slate-800">{opt.name}</h3>
                  <p className="text-slate-500 text-sm font-semibold">{opt.description}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {run.phase === 'shop' && run.shopItems && (
        <div className="w-full max-w-sm flex flex-col items-center bg-white rounded-[32px] p-6 shadow-2xl border-4 border-[#1c1c1c]">
          <h2 className="text-2xl text-amber-500 mb-2 font-black uppercase text-center" style={{ WebkitTextStroke: '1px black' }}>Merchant</h2>
          <div className="flex items-center gap-2 text-xl text-yellow-500 mb-6 font-black bg-yellow-50 px-4 py-1 rounded-full border border-yellow-200">
            <Coins className="w-5 h-5 fill-current" /> {run.gold} Gold
          </div>
          
          <div className="flex flex-col gap-3 w-full mb-6">
            {run.shopItems.map(item => {
              const canAfford = run.gold >= item.cost;
              return (
                <button
                  key={item.id}
                  onClick={() => dispatch({ type: 'BUY_SHOP', itemId: item.id })}
                  disabled={!canAfford}
                  className={`bg-slate-100 border-2 rounded-2xl p-4 flex flex-row items-center text-left gap-4 transition-all w-full ${canAfford ? 'border-slate-300 active:scale-95' : 'border-slate-200 opacity-60'}`}
                >
                  <div className="p-3 bg-white rounded-xl shadow-sm border border-slate-200">
                    <Gift className="w-6 h-6 text-amber-500" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-black text-slate-800">{item.name}</h3>
                    <p className="text-slate-500 text-xs font-semibold">{item.description}</p>
                  </div>
                  <div className={`font-black flex items-center gap-1 ${canAfford ? 'text-yellow-500' : 'text-slate-400'}`}>
                    <Coins className="w-3 h-3" /> {item.cost}
                  </div>
                </button>
              );
            })}
          </div>
          <button 
            onClick={() => dispatch({ type: 'LEAVE_SHOP' })}
            className="w-full py-3 bg-slate-200 text-slate-700 hover:bg-slate-300 rounded-2xl font-black text-lg transition-colors border-2 border-slate-300 active:scale-95"
          >
            Leave Shop
          </button>
        </div>
      )}

      {run.phase === 'minigame' && (
        <div className="w-full max-w-sm flex flex-col items-center bg-white rounded-[32px] p-6 shadow-2xl border-4 border-[#1c1c1c] text-center">
          <Star className="w-16 h-16 text-purple-500 mb-4 fill-current" />
          <h2 className="text-2xl text-purple-500 mb-2 font-black uppercase" style={{ WebkitTextStroke: '1px black' }}>Wheel of Fate</h2>
          <p className="text-slate-600 font-semibold mb-6">Roll the cosmic dice. 30% chance to lose 20 HP. 50% chance to win 40 Gold. 20% chance to win 15 Gems.</p>
          <div className="flex flex-col gap-3 w-full">
            <button 
              onClick={() => dispatch({ type: 'PLAY_MINIGAME' })}
              className="w-full py-4 bg-purple-500 text-white rounded-2xl font-black text-lg border-b-4 border-purple-700 active:border-b-0 active:translate-y-1 transition-all"
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

      {run.phase === 'event' && (
        <div className="w-full max-w-sm flex flex-col items-center bg-white rounded-[32px] p-8 shadow-2xl border-4 border-[#1c1c1c] text-center">
          <Gift className="w-16 h-16 text-blue-500 mb-4" />
          <h2 className="text-2xl text-blue-500 mb-4 font-black uppercase" style={{ WebkitTextStroke: '1px black' }}>Event</h2>
          <p className="text-slate-700 text-xl font-bold mb-8">
            {run.log[0]}
          </p>
          <button 
            onClick={() => dispatch({ type: 'ACK_EVENT' })}
            className="w-full py-4 bg-blue-500 text-white rounded-2xl font-black text-lg border-b-4 border-blue-700 active:border-b-0 active:translate-y-1 transition-all"
          >
            Continue
          </button>
        </div>
      )}

      {run.phase === 'victory' && (
        <div className="w-full max-w-sm flex flex-col items-center bg-white rounded-[32px] p-8 shadow-2xl border-4 border-[#1c1c1c] text-center">
          <h1 className="text-4xl text-amber-500 mb-2 font-black uppercase" style={{ WebkitTextStroke: '1.5px black' }}>Victory!</h1>
          <p className="text-slate-600 font-bold mb-6">You conquered the realm.</p>
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
            className="w-full py-4 bg-amber-500 text-white rounded-2xl font-black text-xl border-b-4 border-amber-700 active:border-b-0 active:translate-y-1 transition-all"
          >
            Return to Lobby
          </button>
        </div>
      )}

      {run.phase === 'defeat' && (
        <div className="w-full max-w-sm flex flex-col items-center bg-white rounded-[32px] p-8 shadow-2xl border-4 border-[#1c1c1c] text-center">
          <h1 className="text-4xl text-red-500 mb-2 font-black uppercase" style={{ WebkitTextStroke: '1.5px black' }}>Defeat</h1>
          <p className="text-slate-600 font-bold mb-6">The realm claims you.</p>
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