import { RunState, GameAction } from '../engine';
import { Dices } from 'lucide-react';
import { useState } from 'react';

export function DiceButton({ run, dispatch }: { run: RunState, dispatch: (a: GameAction) => void }) {
  const [rolling, setRolling] = useState(false);
  const [visualDice, setVisualDice] = useState<[number, number] | null>(null);

  const isMoving = run.phase === 'moving';
  const canRoll = run.phase === 'explore' && !rolling && !isMoving;

  const handleRoll = () => {
    if (!canRoll) return;
    setRolling(true);
    let d1 = 1, d2 = 1;
    const interval = setInterval(() => {
      d1 = Math.floor(Math.random() * 6) + 1;
      d2 = Math.floor(Math.random() * 6) + 1;
      setVisualDice([d1, d2]);
    }, 100);

    setTimeout(() => {
      clearInterval(interval);
      setRolling(false);
      setVisualDice(null);
      dispatch({ type: 'ROLL_DICE' });
    }, 800);
  };

  return (
    <>
      {/* Dice rolling overlay */}
      {rolling && visualDice && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center pointer-events-none backdrop-blur-sm">
           <div className="flex gap-4">
             <div className="w-20 h-20 bg-white rounded-2xl flex items-center justify-center shadow-lg animate-bounce border-4 border-slate-200 text-black font-black text-4xl">
                {visualDice[0]}
             </div>
             <div className="w-20 h-20 bg-white rounded-2xl flex items-center justify-center shadow-lg animate-bounce delay-75 border-4 border-slate-200 text-black font-black text-4xl">
                {visualDice[1]}
             </div>
           </div>
        </div>
      )}

      {/* Button */}
      {canRoll && (
        <button 
          onClick={handleRoll}
          aria-label="Roll dice"
          className="pointer-events-auto relative w-28 h-24 transform transition-transform active:scale-95 group"
        >
           {/* 3D Dice Button CSS drawing */}
           <div className="absolute inset-0 bg-[#d9381e] rounded-3xl mt-4" />
           <div className="absolute inset-0 bg-[#ff5733] rounded-3xl mb-4 border-b-4 border-[#ff8c70] shadow-[0_0_20px_rgba(255,87,51,0.6)] flex items-center justify-center group-active:translate-y-4 group-active:mb-0 transition-transform">
              <Dices className="w-10 h-10 text-white drop-shadow-md" />
           </div>
           {/* Floating hand icon indicator like in screenshot */}
           <div className="absolute -top-10 left-1/2 -ml-4 animate-bounce">
              <div className="bg-white text-black px-2 py-1 rounded text-2xl border-2 border-black drop-shadow-md">👇</div>
           </div>
        </button>
      )}
    </>
  );
}