import { useGame } from '../hooks/use-game';
import { Lobby } from '../components/Lobby';
import { GameBoard } from '../components/GameBoard';
import { TopBar } from '../components/TopBar';
import { CombatOverlay } from '../components/CombatOverlay';
import { ActionOverlay } from '../components/ActionOverlay';
import { Dices, RefreshCcw } from 'lucide-react';
import { useState, useEffect } from 'react';

export default function Game() {
  const { state, dispatch } = useGame();
  const [rolling, setRolling] = useState(false);
  const [diceFace, setDiceFace] = useState(1);
  const [visualPosition, setVisualPosition] = useState(0);

  useEffect(() => {
    if (state?.run) {
      if (state.run.phase === 'explore' && visualPosition !== state.run.position) {
        if (state.run.position === 0) {
          setVisualPosition(0);
        } else {
          const timer = setInterval(() => {
            setVisualPosition(p => {
              if (p < state.run!.position) return p + 1;
              clearInterval(timer);
              return p;
            });
          }, 200);
          return () => clearInterval(timer);
        }
      } else if (state.run.position === 0) {
        setVisualPosition(0);
      }
    }
    return undefined;
  }, [state?.run?.position, state?.run?.phase]);

  if (!state) return null;

  if (!state.run) {
    return <Lobby state={state} dispatch={dispatch} />;
  }

  const handleRoll = () => {
    if (rolling || state.run!.phase !== 'explore') return;
    setRolling(true);
    let face = 1;
    const interval = setInterval(() => {
      face = Math.floor(Math.random() * 6) + 1;
      setDiceFace(face);
    }, 100);

    setTimeout(() => {
      clearInterval(interval);
      setRolling(false);
      dispatch({ type: 'ROLL_DICE' });
    }, 1000);
  };

  const isMoving = visualPosition !== state.run.position;
  const canRoll = state.run.phase === 'explore' && !rolling && !isMoving;

  return (
    <div className="min-h-screen bg-black text-zinc-100 font-sans flex flex-col overflow-hidden selection:bg-amber-500/30">
      <TopBar run={state.run} />

      <main className="flex-1 relative flex items-center justify-center pt-16">
        <GameBoard tiles={state.run.tiles} position={visualPosition} />
        
        {state.run.phase === 'combat' && (
          <CombatOverlay run={state.run} />
        )}

        <ActionOverlay run={state.run} dispatch={dispatch} />

        {/* Dice rolling overlay */}
        {rolling && (
          <div className="absolute inset-0 z-40 bg-black/40 backdrop-blur-sm flex items-center justify-center">
            <div className="w-32 h-32 bg-white rounded-3xl flex items-center justify-center shadow-2xl animate-spin shadow-amber-500/50">
              <span className="text-6xl font-black text-black">{diceFace}</span>
            </div>
          </div>
        )}

        {/* Floating dice result */}
        {!rolling && state.run.lastRoll && state.run.phase === 'explore' && !isMoving && (
          <div className="absolute bottom-32 right-32 text-amber-500 font-bold text-2xl animate-bounce drop-shadow-md">
            Rolled {state.run.lastRoll}!
          </div>
        )}
      </main>

      <div className="h-24 bg-zinc-950 border-t border-zinc-800 flex items-center justify-between px-8 shrink-0 z-30">
        <button 
          onClick={() => dispatch({ type: 'RESET_SAVE' })}
          className="text-zinc-600 hover:text-red-500 transition-colors flex items-center gap-2 text-sm"
          title="Reset completely"
        >
          <RefreshCcw className="w-4 h-4" /> Reset Save
        </button>

        <button
          onClick={handleRoll}
          disabled={!canRoll}
          className={"group relative px-10 py-4 bg-amber-600 hover:bg-amber-500 rounded-full font-bold text-xl text-amber-950 shadow-[0_0_20px_rgba(217,119,6,0.3)] transition-all " + (canRoll ? 'hover:scale-105 hover:shadow-[0_0_40px_rgba(217,119,6,0.6)] cursor-pointer' : 'opacity-50 cursor-not-allowed saturate-0')}
        >
          <span className="flex items-center gap-3">
            <Dices className={"w-6 h-6 " + (canRoll ? 'group-hover:animate-bounce' : '')} />
            Roll Dice
          </span>
        </button>
        
        <div className="w-32 text-right text-zinc-500 font-serif italic text-sm">
          Floor {state.run.floor}
        </div>
      </div>
    </div>
  );
}