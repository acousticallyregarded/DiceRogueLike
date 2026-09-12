import { useGame } from '../hooks/use-game';
import { Lobby } from '../components/Lobby';
import { GameBoard } from '../components/GameBoard';
import { TopBar } from '../components/TopBar';
import { CombatOverlay } from '../components/CombatOverlay';
import { ActionOverlay } from '../components/ActionOverlay';
import { Dices, FastForward } from 'lucide-react';
import { useState, useEffect } from 'react';

export default function Game() {
  const { state, dispatch, speed, setSpeed } = useGame();
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
  const inCombat = state.run.phase === 'combat';

  return (
    <div className="min-h-[100dvh] w-full flex justify-center bg-zinc-900 font-sans">
      <div className="w-full max-w-[390px] h-[100dvh] relative overflow-hidden bg-[#e0ff00]">
        
        {/* Grass Background details */}
        <div className="absolute inset-0 pointer-events-none opacity-50" style={{ backgroundImage: 'radial-gradient(#a3e635 2px, transparent 2px)', backgroundSize: '24px 24px' }} />

        {/* Scene Split - If in combat, shrink board to bottom */}
        <div className={`absolute inset-0 transition-transform duration-700 ease-in-out ${inCombat ? 'translate-y-[40%] scale-90 opacity-40' : 'translate-y-0 scale-100'}`}>
           <GameBoard tiles={state.run.tiles} position={visualPosition} />
        </div>

        <TopBar run={state.run} floor={state.run.floor} />

        {inCombat && (
          <CombatOverlay run={state.run} />
        )}

        <ActionOverlay run={state.run} dispatch={dispatch} />

        {/* Dice rolling overlay */}
        {rolling && (
          <div className="absolute inset-0 z-40 bg-black/20 flex items-center justify-center pointer-events-none">
             <div className="w-24 h-24 bg-white rounded-2xl flex items-center justify-center shadow-[0_0_30px_rgba(255,255,255,1)] animate-spin border-4 border-slate-200">
                <div className="text-5xl font-black text-black -rotate-45">{diceFace}</div>
             </div>
          </div>
        )}

        {/* Dice Button Bottom */}
        <div className="absolute bottom-6 left-0 right-0 flex justify-center z-30 pointer-events-none">
           {state.run.phase === 'explore' && !isMoving && !rolling && (
              <button 
                onClick={handleRoll}
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
        </div>

        {/* Speed toggle bottom left */}
        {state.run.phase === 'combat' && (
          <div className="absolute bottom-6 left-6 z-30 pointer-events-auto">
             <button 
                onClick={() => setSpeed(s => s === 1 ? 2 : 1)}
                className="flex items-center gap-1 bg-[var(--color-ui-purple)] text-white px-3 py-1.5 rounded-lg border-2 border-[#1c1c1c] font-black shadow-md active:scale-95"
              >
                <FastForward className="w-4 h-4 fill-current" /> x{speed}
             </button>
          </div>
        )}

      </div>
    </div>
  );
}