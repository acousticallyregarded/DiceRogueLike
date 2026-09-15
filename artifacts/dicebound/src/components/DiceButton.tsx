import { RunState, GameAction } from '../engine';
import { Dices } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { DieFace } from './DieFace';

export function DiceButton({ run, dispatch }: { run: RunState, dispatch: (a: GameAction) => void }) {
  const rollRequestPending = useRef(false);
  const isMoving = run.phase === 'moving';
  const isRolling = run.rollAnimating === true;
  const canRoll = run.phase === 'explore' && !isRolling && !isMoving;
  const visualDice = run.lastRolls;
  const showRoll = isRolling && visualDice;
  const showMovementResult = isMoving && !isRolling && visualDice;

  useEffect(() => {
    if (run.phase !== 'explore') rollRequestPending.current = false;
  }, [run.phase]);

  const handleRoll = () => {
    // The reducer is the durable guard; this ref also closes the tiny
    // synchronous double-click window before React has rendered the moving
    // state back into the button.
    if (!canRoll || rollRequestPending.current) return;
    rollRequestPending.current = true;
    // ROLL_DICE commits the only random pair in the reducer. Keeping the
    // committed result in RunState means the animation cannot show a pair
    // whose sum differs from the steps that are about to be walked.
    dispatch({ type: 'ROLL_DICE' });
  };

  return (
    <>
      {/* Dice rolling overlay */}
      {showRoll && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center pointer-events-none backdrop-blur-sm">
           <div className="flex gap-4">
              <div className="motion-safe:animate-bounce">
                <DieFace value={visualDice[0]} />
             </div>
              <div className="motion-safe:animate-bounce" style={{ animationDelay: '75ms' }}>
                <DieFace value={visualDice[1]} />
             </div>
           </div>
           <div className="absolute mt-32 rounded-full bg-white px-4 py-2 text-black font-black shadow-lg">
             {visualDice[0] + visualDice[1]} steps
           </div>
        </div>
      )}

      {/* Keep the committed result visible and immutable for every movement
          step, including a wrap from tile 23 to tile 0. */}
      {showMovementResult && (
        <div
          aria-label={`Moved ${visualDice[0] + visualDice[1]} steps from dice ${visualDice[0]} and ${visualDice[1]}`}
          className="fixed bottom-32 left-1/2 z-40 -translate-x-1/2 rounded-full bg-white/95 px-4 py-2 text-black font-black shadow-lg pointer-events-none flex items-center gap-2 whitespace-nowrap"
        >
          <DieFace value={visualDice[0]} small />
          <span aria-hidden="true">+</span>
          <DieFace value={visualDice[1]} small />
          <span>= {visualDice[0] + visualDice[1]} steps</span>
        </div>
      )}

      {/* Button */}
      {canRoll && (
        <button 
          onClick={handleRoll}
          aria-label="Roll dice"
          className="pointer-events-auto relative w-28 h-24 transform transition-all active:scale-95 group focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#ff5733] focus-visible:ring-offset-2 rounded-3xl"
        >
           {/* 3D Dice Button CSS drawing */}
           <div className="absolute inset-0 bg-[#d9381e] rounded-3xl mt-4" />
           <div className="absolute inset-0 bg-[#ff5733] rounded-3xl mb-4 border-b-4 border-[#ff8c70] shadow-[0_0_20px_rgba(255,87,51,0.6)] flex items-center justify-center group-active:translate-y-4 group-active:mb-0 transition-transform">
              <Dices className="w-10 h-10 text-white drop-shadow-md" />
           </div>
        </button>
      )}
    </>
  );
}