import { useGame } from '../hooks/use-game';
import { useWalletCloud } from '../hooks/use-wallet-cloud';
import { Lobby } from '../components/Lobby';
import { WalletButton } from '../components/WalletButton';
import { GameBoard } from '../components/GameBoard';
import { TopBar } from '../components/TopBar';
import { CombatOverlay } from '../components/CombatOverlay';
import { ActionOverlay } from '../components/ActionOverlay';
import { DiceButton } from '../components/DiceButton';
import { MonsterGuide } from '../components/MonsterGuide';
import { FastForward, BookOpen, SkipForward } from 'lucide-react';
import { useState, useCallback } from 'react';
import { useEffect, useRef } from 'react';
import { useAudio } from '../audio/use-audio';
import { useAudioEvents } from '../audio/use-audio-events';

export default function Game() {
  const {
    state,
    dispatch,
    speed,
    setSpeed,
    paused,
    setPaused,
    replaceState,
    setGuestPersistence,
  } = useGame();
  const wallet = useWalletCloud({
    state,
    replaceState,
    setPaused,
    setGuestPersistence,
  });
  const { setMusicScene, stopPlayback } = useAudio();
  const [showSkills, setShowSkills] = useState(false);
  const [showBestiary, setShowBestiary] = useState(false);
  const previousRun = useRef(Boolean(state?.run));

  useEffect(() => {
    const hasRun = Boolean(state?.run);
    if (previousRun.current && !hasRun) stopPlayback();
    previousRun.current = hasRun;

    if (!state?.run) {
      setMusicScene('lobby');
      return;
    }
    if (state.run.phase === 'combat') {
      setMusicScene('combat');
    } else if (
      state.run.phase === 'explore'
      || state.run.phase === 'moving'
      || state.run.phase === 'boss_awakening'
      || state.run.phase === 'boss_ready'
    ) {
      setMusicScene('explore');
    } else {
      setMusicScene(null);
    }
  }, [setMusicScene, state?.run?.phase, state?.run, stopPlayback]);

  useAudioEvents(state);

  const handleSkipCinematic = useCallback(() => {
    dispatch({ type: 'FINISH_TRAIL_CINEMATIC' });
  }, [dispatch]);

  if (!state) return null;

  if (!state.run) {
    return <Lobby state={state} dispatch={dispatch} wallet={wallet} />;
  }

  const r = state.run;
  const inCombat = r.phase === 'combat' || Boolean(r.heroDeathPending && r.playerCombat);
  const cinematicType = r.trailCinematic;
  const isCinematic = Boolean(cinematicType);
  const hideControls = isCinematic && r.phase !== 'boss_awakening';

  return (
    <div className="min-h-[100dvh] w-full flex justify-center bg-zinc-900 font-sans select-none">
      <div className="w-full max-w-[390px] h-[100dvh] relative overflow-hidden bg-[#2b4c2b]">
        
        {/* Scene Split - If in combat, shrink board to bottom */}
        <div className={`absolute inset-0 transition-transform duration-700 ease-in-out ${inCombat ? 'translate-y-[40%] scale-90 opacity-40' : 'translate-y-0 scale-100'}`}>
           <GameBoard 
              run={r} 
              visualPosition={r.position} 
              speed={speed}
              paused={paused}
              onCinematicFinish={handleSkipCinematic}
           />
        </div>
        <div
          aria-hidden="true"
          className={`absolute inset-0 pointer-events-none transition-colors duration-700 ${inCombat ? 'bg-black/35' : 'bg-transparent'}`}
          style={{ backgroundImage: 'linear-gradient(to bottom, rgba(15,40,26,0.15), transparent 25%, transparent 75%, rgba(15,40,26,0.25))' }}
        />

        <div className={`transition-opacity duration-500 ${hideControls ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
           <TopBar run={r} />
        </div>

         {/* A low edge slot keeps wallet access clear of TopBar stats and
             combat/action controls. */}
         <div className="absolute bottom-[6.5rem] left-3 z-30">
           <WalletButton wallet={wallet} compact />
         </div>

        <CombatOverlay run={r} dispatch={dispatch} speed={speed} paused={paused} />

        <div className={`transition-opacity duration-500 ${hideControls ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
           <button
             type="button"
             onClick={() => setShowBestiary(true)}
             aria-label="Open Bestiary"
             className="absolute top-20 right-3 z-40 rounded-full bg-white p-2 border-4 border-[#1c1c1c] shadow-[0_3px_0_#1c1c1c] active:translate-y-1 active:shadow-none"
           >
             <BookOpen className="w-5 h-5 text-purple-700" />
           </button>
        </div>

        <div className={`transition-opacity duration-500 ${hideControls ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
           {!r.heroDeathPending && <ActionOverlay run={r} dispatch={dispatch} meta={state.meta} />}
        </div>

        {/* Dice Button Bottom */}
        <div className={`absolute bottom-6 left-0 right-0 flex justify-center z-30 transition-opacity duration-500 pointer-events-none ${hideControls ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
           <DiceButton run={r} dispatch={dispatch} />
        </div>

        {/* Skills panel toggle */}
        {(r.phase === 'explore' || r.phase === 'moving') && (
          <div className={`absolute bottom-6 right-6 z-30 transition-opacity duration-500 ${hideControls ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
             <button 
                onClick={() => setShowSkills(true)}
                aria-label="Run skills"
                className="w-12 h-12 bg-white rounded-full flex items-center justify-center border-4 border-[#1c1c1c] shadow-[0_4px_0_#1c1c1c] active:translate-y-1 active:shadow-none transition-all"
              >
                <BookOpen className="w-6 h-6 text-slate-800" />
             </button>
          </div>
        )}

        {/* Skip Cinematic Button */}
        {isCinematic && (
           <div className="absolute bottom-10 left-0 right-0 flex justify-center z-50">
             <button 
                onClick={handleSkipCinematic}
                className="flex items-center gap-2 bg-slate-900/80 backdrop-blur-sm text-white px-5 py-2.5 rounded-full border-2 border-slate-700 font-bold shadow-xl active:scale-95 transition-all"
             >
                Skip Cutscene <SkipForward className="w-4 h-4" />
             </button>
           </div>
        )}

        {/* Animation pace toggle bottom left */}
        {inCombat && (
          <div className="absolute bottom-6 left-6 z-30 pointer-events-auto">
             <button 
                onClick={() => setSpeed(s => s === 1 ? 2 : 1)}
                disabled={Boolean(r.playerCombat?.pendingHeroAttack) || ((r.characterId === 'unc' || r.characterId === 'alan-a-dale') && (r.phase === 'combat' || Boolean(r.heroDeathPending) || Boolean(r.victoryReport)))}
                title={r.phase === 'combat' ? 'Choose pace between fights so full animations stay synchronized.' : 'Change playback pace'}
                aria-label="Toggle speed"
                className="flex items-center gap-1 bg-[var(--color-ui-purple)] text-white px-3 py-1.5 rounded-lg border-2 border-[#1c1c1c] font-black shadow-[0_4px_0_#1c1c1c] active:translate-y-1 active:shadow-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                 <FastForward className="w-4 h-4 fill-current" /> Pace x{speed}
             </button>
          </div>
        )}

        {/* Skills Modal */}
        {showSkills && (
          <div className="absolute inset-0 z-50 bg-black/60 flex items-center justify-center p-6 backdrop-blur-sm pointer-events-auto" onClick={() => setShowSkills(false)}>
            <div className="bg-white rounded-[32px] p-6 w-full max-h-[70vh] flex flex-col gap-4 border-4 border-[#1c1c1c] shadow-2xl" onClick={e => e.stopPropagation()}>
              <h2 className="text-2xl font-black text-slate-800 text-center uppercase">Run Skills</h2>
              <div className="flex-1 overflow-y-auto flex flex-col gap-3">
                {r.skills.length === 0 ? (
                  <div className="text-slate-400 font-bold text-center text-sm py-4">No skills acquired yet.</div>
                ) : (
                  r.skills.map(sk => (
                    <div key={sk.id} className="bg-slate-100 p-3 rounded-xl border-2 border-slate-200">
                      <div className="font-black text-slate-800">{sk.name}</div>
                      <div className="text-xs text-slate-500 font-bold mt-1">{sk.description}</div>
                    </div>
                  ))
                )}
              </div>
              <button onClick={() => setShowSkills(false)} className="w-full py-3 bg-slate-200 text-slate-700 hover:bg-slate-300 rounded-2xl font-black text-lg transition-colors border-b-4 border-slate-300 active:border-b-0 active:translate-y-1 mt-2">Close</button>
            </div>
          </div>
        )}

        {showBestiary && <MonsterGuide onClose={() => setShowBestiary(false)} />}

      </div>
    </div>
  );
}
