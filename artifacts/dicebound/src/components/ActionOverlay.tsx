import { GameAction, RunState } from '../engine';
import { Gift, Coins, Shield, Sword, Heart, Wind, Star } from 'lucide-react';

export function ActionOverlay({ run, dispatch }: { run: RunState, dispatch: (a: GameAction) => void }) {
  if (run.phase === 'explore' || run.phase === 'combat') return null;

  return (
    <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center p-8 animate-in zoom-in-95 duration-300">
      
      {run.phase === 'reward' && run.rewardOptions && (
        <div className="w-full max-w-3xl flex flex-col items-center">
          <h2 className="text-4xl font-serif text-amber-400 mb-8 font-bold tracking-widest text-center">Victory Reward</h2>
          <div className="grid md:grid-cols-3 gap-6 w-full">
            {run.rewardOptions.map(opt => (
              <button
                key={opt.id}
                onClick={() => dispatch({ type: 'CHOOSE_REWARD', rewardId: opt.id })}
                className="bg-zinc-900 border border-amber-900/50 hover:border-amber-500 rounded-xl p-6 flex flex-col items-center text-center gap-4 transition-all hover:-translate-y-2 hover:shadow-[0_10px_30px_rgba(217,119,6,0.2)] group"
              >
                <div className="p-4 bg-zinc-800 rounded-full group-hover:bg-amber-900/30 transition-colors">
                  {opt.type === 'maxHp' && <Heart className="w-8 h-8 text-green-400" />}
                  {opt.type === 'attack' && <Sword className="w-8 h-8 text-red-400" />}
                  {opt.type === 'defense' && <Shield className="w-8 h-8 text-blue-400" />}
                  {opt.type === 'speed' && <Wind className="w-8 h-8 text-teal-400" />}
                  {opt.type === 'heal' && <Heart className="w-8 h-8 text-rose-400" fill="currentColor" />}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-zinc-100">{opt.name}</h3>
                  <p className="text-zinc-400 mt-2">{opt.description}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {run.phase === 'shop' && run.shopItems && (
        <div className="w-full max-w-3xl flex flex-col items-center">
          <h2 className="text-4xl font-serif text-amber-400 mb-4 font-bold tracking-widest text-center">Wandering Merchant</h2>
          <div className="flex items-center gap-2 text-2xl text-yellow-500 mb-8 font-bold">
            <Coins className="w-6 h-6" /> {run.gold} Gold
          </div>
          
          <div className="grid md:grid-cols-3 gap-6 w-full mb-8">
            {run.shopItems.map(item => {
              const canAfford = run.gold >= item.cost;
              return (
                <button
                  key={item.id}
                  onClick={() => dispatch({ type: 'BUY_SHOP', itemId: item.id })}
                  disabled={!canAfford}
                  className={"bg-zinc-900 border p-6 rounded-xl flex flex-col items-center text-center gap-4 transition-all " + (canAfford ? 'border-amber-900/50 hover:border-amber-500 hover:-translate-y-2 cursor-pointer' : 'border-zinc-800 opacity-50 cursor-not-allowed')}
                >
                  <div className="p-4 bg-zinc-800 rounded-full">
                    <Gift className="w-8 h-8 text-amber-500" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-zinc-100">{item.name}</h3>
                    <p className="text-zinc-400 text-sm mt-1">{item.description}</p>
                  </div>
                  <div className={"font-bold " + (canAfford ? 'text-yellow-500' : 'text-zinc-500')}>
                    Cost: {item.cost} Gold
                  </div>
                </button>
              );
            })}
          </div>
          <button 
            onClick={() => dispatch({ type: 'LEAVE_SHOP' })}
            className="px-8 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-full font-bold transition-colors"
          >
            Leave Shop
          </button>
        </div>
      )}

      {run.phase === 'minigame' && (
        <div className="w-full max-w-xl flex flex-col items-center text-center bg-zinc-900 p-12 rounded-3xl border border-purple-900/50 shadow-2xl">
          <Star className="w-16 h-16 text-purple-500 mb-6" />
          <h2 className="text-4xl font-serif text-purple-400 mb-4 font-bold tracking-wide">Wheel of Fate</h2>
          <p className="text-zinc-400 text-lg mb-8">Roll the cosmic dice. 30% chance to lose 20 HP. 50% chance to win 40 Gold. 20% chance to win 15 Gems.</p>
          <div className="flex gap-4">
            <button 
              onClick={() => dispatch({ type: 'PLAY_MINIGAME' })}
              className="px-8 py-4 bg-purple-600 hover:bg-purple-500 rounded-full font-bold text-lg text-white shadow-lg transition-transform hover:scale-105"
            >
              Roll the Dice
            </button>
            <button 
              onClick={() => dispatch({ type: 'LEAVE_MINIGAME' })}
              className="px-8 py-4 bg-zinc-800 hover:bg-zinc-700 rounded-full font-bold text-lg transition-colors"
            >
              Walk Away
            </button>
          </div>
        </div>
      )}

      {run.phase === 'event' && (
        <div className="w-full max-w-xl flex flex-col items-center text-center bg-zinc-900 p-12 rounded-3xl border border-blue-900/50 shadow-2xl">
          <Gift className="w-16 h-16 text-blue-500 mb-6" />
          <h2 className="text-4xl font-serif text-blue-400 mb-4 font-bold tracking-wide">Event</h2>
          <p className="text-zinc-300 text-2xl mb-8 font-serif leading-relaxed italic">
            "{run.log[0]}"
          </p>
          <button 
            onClick={() => dispatch({ type: 'ACK_EVENT' })}
            className="px-10 py-3 bg-blue-600 hover:bg-blue-500 rounded-full font-bold text-white transition-colors"
          >
            Continue
          </button>
        </div>
      )}

      {run.phase === 'victory' && (
        <div className="w-full max-w-2xl flex flex-col items-center text-center bg-amber-950 p-16 rounded-3xl border-4 border-amber-500 shadow-[0_0_100px_rgba(217,119,6,0.4)]">
          <h1 className="text-6xl font-serif text-amber-400 mb-4 font-bold tracking-widest uppercase">Victory!</h1>
          <p className="text-amber-200 text-xl mb-8">You have conquered the realm.</p>
          <div className="bg-black/40 p-6 rounded-xl mb-10 w-full">
            <div className="flex justify-between items-center text-lg mb-2">
              <span className="text-zinc-400">Gems Earned:</span>
              <span className="font-bold text-fuchsia-400">+{run.gemsEarned}</span>
            </div>
            <div className="flex justify-between items-center text-lg mb-2">
              <span className="text-zinc-400">Gold Converted:</span>
              <span className="font-bold text-fuchsia-400">+{Math.floor(run.gold / 10)}</span>
            </div>
            <div className="h-px bg-zinc-800 my-4" />
            <div className="flex justify-between items-center text-2xl font-bold text-amber-500">
              <span>Total Gems Gained:</span>
              <span>+{run.gemsEarned + Math.floor(run.gold / 10)}</span>
            </div>
          </div>
          <button 
            onClick={() => dispatch({ type: 'RETURN_TO_LOBBY' })}
            className="px-12 py-4 bg-amber-600 hover:bg-amber-500 rounded-full font-bold text-xl text-amber-950 transition-transform hover:scale-105"
          >
            Return to Lobby
          </button>
        </div>
      )}

      {run.phase === 'defeat' && (
        <div className="w-full max-w-2xl flex flex-col items-center text-center bg-red-950 p-16 rounded-3xl border-4 border-red-900 shadow-[0_0_100px_rgba(153,27,27,0.4)]">
          <h1 className="text-6xl font-serif text-red-500 mb-4 font-bold tracking-widest uppercase drop-shadow-[0_0_20px_rgba(255,0,0,0.8)]">You Died</h1>
          <p className="text-red-300 text-xl mb-8">The realm claims another soul.</p>
          <div className="bg-black/40 p-6 rounded-xl mb-10 w-full">
            <div className="flex justify-between items-center text-lg mb-2">
              <span className="text-zinc-400">Gems Earned:</span>
              <span className="font-bold text-fuchsia-400">+{run.gemsEarned}</span>
            </div>
            <div className="flex justify-between items-center text-lg mb-2">
              <span className="text-zinc-400">Gold Converted:</span>
              <span className="font-bold text-fuchsia-400">+{Math.floor(run.gold / 10)}</span>
            </div>
            <div className="h-px bg-zinc-800 my-4" />
            <div className="flex justify-between items-center text-xl font-bold text-amber-500">
              <span>Total Gems Gained:</span>
              <span>+{run.gemsEarned + Math.floor(run.gold / 10)}</span>
            </div>
          </div>
          <button 
            onClick={() => dispatch({ type: 'RETURN_TO_LOBBY' })}
            className="px-12 py-4 bg-red-800 hover:bg-red-700 rounded-full font-bold text-xl text-red-100 transition-transform hover:scale-105"
          >
            Accept Fate
          </button>
        </div>
      )}
      
    </div>
  );
}