import { useGame } from '../hooks/use-game';
import { useWalletCloud } from '../hooks/use-wallet-cloud';
import type { AuthoritativeRun } from '../hooks/use-wallet-cloud';
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
import { OpeningPrologue } from '../components/OpeningPrologue';
import type { GameAction } from '../engine';
import type { GameStateV4 } from '../engine';
import { createSingleFlightActionDispatcher } from '../hooks/authoritative-action-dispatcher';

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
    setAutomaticActionDispatcher,
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
  const [topBarHeight, setTopBarHeight] = useState(0);
  const [authoritativeActionPending, setAuthoritativeActionPending] = useState(false);
  const previousRun = useRef(Boolean(state?.run));
  const authoritativeSyncedSequence = useRef<number | null>(null);

  // A wallet session reconnects to the server run, never to browser-authored
  // combat state. Guest campaigns retain their existing non-value flow.
  useEffect(() => {
    if (!wallet.session) return;
    void wallet.reconnectAuthoritativeRun().catch(() => undefined);
  }, [wallet.reconnectAuthoritativeRun, wallet.session?.address]);

  useEffect(() => {
    const hasTerminalServerRun = wallet.serverRun?.status === 'won' || wallet.serverRun?.status === 'dead';
    if (
      !wallet.session ||
      !state?.run ||
      wallet.serverRunLoading ||
      (wallet.serverRun && !hasTerminalServerRun) ||
      (hasTerminalServerRun && state.run.phase !== 'explore')
    ) return;
    void wallet.startAuthoritativeRun(state.run.characterId ?? 'john').catch(() => undefined);
  }, [
    state?.run?.characterId,
    wallet.serverRun,
    wallet.serverRunLoading,
    wallet.session,
    wallet.startAuthoritativeRun,
  ]);

  const applyAuthoritativeCombat = useCallback((authoritative: AuthoritativeRun) => {
    if (!authoritative.state || typeof authoritative.state !== 'object') return;
    const canonical = authoritative.state as unknown as GameStateV4;
    if (!canonical.meta || !("run" in canonical)) return;
    replaceState(canonical);
  }, [replaceState]);

  const authoritativeHandlers = useRef<{
    submit: (action: GameAction) => Promise<AuthoritativeRun | null>;
    apply: (run: AuthoritativeRun) => void;
  }>({
    submit: async (_action: GameAction): Promise<AuthoritativeRun | null> => null,
    apply: (_run: AuthoritativeRun) => {},
  });
  authoritativeHandlers.current = {
    submit: async (action: GameAction) => {
      if (!wallet.serverRun) {
        const recovered = await wallet.reconnectAuthoritativeRun();
        if (!recovered) return null;
      }
      return wallet.submitAuthoritativeAction(action);
    },
    apply: applyAuthoritativeCombat,
  };
  const authoritativeDispatcher = useRef(
    createSingleFlightActionDispatcher<GameAction, AuthoritativeRun>({
      submit: action => authoritativeHandlers.current.submit(action),
      apply: run => authoritativeHandlers.current.apply(run),
      onPendingChange: setAuthoritativeActionPending,
    }),
  );

  const dispatchGameAction = useCallback((action: GameAction) => {
    const run = state?.run;
    if (
      wallet.session &&
      run &&
      action.type !== 'START_RUN'
    ) {
      void authoritativeDispatcher.current.dispatch(action).catch(() => undefined);
      return;
    }
    dispatch(action);
  }, [
    dispatch,
    state?.run,
    wallet.session,
  ]);

  useEffect(() => {
    setAutomaticActionDispatcher(wallet.session ? dispatchGameAction : null);
    return () => setAutomaticActionDispatcher(null);
  }, [dispatchGameAction, setAutomaticActionDispatcher, wallet.session]);

  useEffect(() => {
    const authoritative = wallet.serverRun;
    if (!authoritative || !state?.run || authoritativeSyncedSequence.current === authoritative.sequence) return;
    authoritativeSyncedSequence.current = authoritative.sequence;
    applyAuthoritativeCombat(authoritative);
  }, [applyAuthoritativeCombat, state?.run, wallet.serverRun, wallet.serverRun?.sequence]);

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
    dispatchGameAction({ type: 'FINISH_TRAIL_CINEMATIC' });
  }, [dispatchGameAction]);

  if (!state) return null;

  if (!state.run) {
    return <Lobby state={state} dispatch={wallet.session ? dispatchGameAction : dispatch} wallet={wallet} />;
  }

  const r = state.run;
  const inCombat = r.phase === 'combat' || Boolean(r.heroDeathPending && r.playerCombat);
  const cinematicType = r.trailCinematic;
  const isCinematic = Boolean(cinematicType);
  const isPrologue = cinematicType === 'prologue';
  const hideControls = isCinematic && r.phase !== 'boss_awakening';

  return (
    <div className="min-h-[100dvh] w-full flex justify-center bg-zinc-900 font-sans select-none">
      <div
        className="dicebound-desktop-shell w-full max-w-[390px] h-[100dvh] relative overflow-hidden bg-[#2b4c2b]"
        aria-busy={authoritativeActionPending}
      >
        {authoritativeActionPending && (
          <div className="absolute inset-0 z-[100] cursor-wait" aria-hidden="true" />
        )}
        
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
           <TopBar run={r} onHeightChange={setTopBarHeight} onOpenBestiary={() => setShowBestiary(true)} />
        </div>

         {/* A low edge slot keeps wallet access clear of TopBar stats and
             combat/action controls. */}
         <div
           aria-hidden={inCombat}
           className={`absolute bottom-[6.5rem] left-3 z-30 transition-opacity ${
             inCombat ? 'pointer-events-none opacity-0' : 'opacity-100'
           }`}
         >
           <WalletButton wallet={wallet} compact />
         </div>

         <CombatOverlay run={r} dispatch={dispatchGameAction} speed={speed} paused={paused || authoritativeActionPending} headerHeight={topBarHeight} />

        {isPrologue && (
          <OpeningPrologue
            characterId={r.characterId}
            step={r.prologueStep ?? 0}
            onAdvance={handleSkipCinematic}
             onSkip={() => dispatchGameAction({ type: 'SKIP_PROLOGUE' })}
          />
        )}

        <div className={`transition-opacity duration-500 ${hideControls ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
            {!r.heroDeathPending && <ActionOverlay run={r} dispatch={dispatchGameAction} meta={state.meta} />}
        </div>

        {/* Dice Button Bottom */}
        <div className={`absolute bottom-6 left-0 right-0 flex justify-center z-30 transition-opacity duration-500 pointer-events-none ${hideControls ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
           <DiceButton run={r} dispatch={dispatchGameAction} />
        </div>

        {/* Skills panel toggle */}
        {(r.phase === 'explore' || r.phase === 'moving') && (
          <div className={`absolute bottom-6 right-6 z-30 transition-opacity duration-500 ${hideControls ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
             <button 
                onClick={() => setShowSkills(true)}
                aria-label="Run skills"
                className="w-12 h-12 bg-white rounded-full flex items-center justify-center border-4 border-[#1c1c1c] shadow-[0_4px_0_#1c1c1c] active:translate-y-1 active:shadow-none transition-all hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2"
              >
                <BookOpen className="w-6 h-6 text-slate-800" />
             </button>
          </div>
        )}

        {/* Skip Cinematic Button */}
         {isCinematic && !isPrologue && (
           <div className="absolute bottom-10 left-0 right-0 flex justify-center z-50">
             <button 
                onClick={handleSkipCinematic}
                className="flex items-center gap-2 bg-slate-900/80 backdrop-blur-sm text-white px-5 py-2.5 rounded-full border-2 border-slate-700 font-bold shadow-xl active:scale-95 transition-all hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
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
                className="flex items-center gap-1 bg-[var(--color-ui-purple)] text-white px-3 py-1.5 rounded-lg border-2 border-[#1c1c1c] font-black shadow-[0_4px_0_#1c1c1c] active:translate-y-1 active:shadow-none transition-all hover:bg-[#5a2899] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[var(--color-ui-purple)]"
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
