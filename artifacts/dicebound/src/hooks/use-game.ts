import { useState, useEffect, useCallback, useRef } from 'react';
import {
  GameStateV4,
  GameAction,
  act,
  validateState,
  createInitialState,
  DICE_ROLL_ANIMATION_DURATION_MS,
  getEnemyResponseDelayMs,
  getPendingHeroAttackDurationMs,
  getHeroDeathDurationMs,
} from '../engine';
import { toast } from 'sonner';

const KEY_V4 = "dicebound-save-v4";

export function loadGame(): GameStateV4 {
  try {
    const raw = localStorage.getItem(KEY_V4);
    if (!raw) return createInitialState();
    const parsed = JSON.parse(raw);
    const s = validateState(parsed);
    if (s.meta.version !== 4) return createInitialState();
    return s;
  } catch (err) {
    console.error("Save load error", err);
    return createInitialState();
  }
}

export function saveGame(s: GameStateV4): boolean {
  try {
    localStorage.setItem(KEY_V4, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}

export function useGame() {
  const [state, setState] = useState<GameStateV4 | null>(null);
  const [speed, setSpeed] = useState<number>(1);
  const speedRef = useRef(speed);
  speedRef.current = speed;
  
  useEffect(() => {
    const loaded = loadGame();
    if (loaded.run) {
      const savedSpeed = loaded.run.combatSpeed;
      const restoredSpeed = Number.isFinite(savedSpeed) ? Math.max(1, savedSpeed!) : 1;
      speedRef.current = restoredSpeed;
      setSpeed(restoredSpeed);
    }
    setState(loaded);
  }, []);

  const dispatch = useCallback((action: GameAction) => {
    setState(prev => {
      if (!prev) return prev;
      try {
        // Store the playback pace with the committed action so response,
        // victory, and reload presentation agree on the same duration.
        const actionState = prev.run
          ? { ...prev, run: { ...prev.run, combatSpeed: speedRef.current } }
          : prev;
        const next = act(actionState, action);
        if (!saveGame(next)) {
          toast.error("Failed to save game progress");
        }
        return next;
      } catch (e) {
        console.error("Action error", e);
        toast.error("An error occurred processing that action");
        return prev;
      }
    });
  }, []);

  // Movement remains animated; combat is intentionally not part of this
  // realtime loop. Enemy turns are scheduled once after a committed player
  // action, including after reloading an enemy-turn save.
  const moveTick = useRef<number>(performance.now());
  const responseSpeed = state?.run?.combatSpeed ?? 1;
  const pendingAttack = state?.run?.playerCombat?.pendingHeroAttack;
  const pendingAttackKey = pendingAttack
    ? `${state?.run?.playerCombat?.heroAttackSequence}:${pendingAttack.kind}:${pendingAttack.targetId}`
    : null;

  useEffect(() => {
    if (!state?.run?.heroDeathPending) return;
    const timer = window.setTimeout(() => dispatch({ type: 'FINISH_HERO_DEATH' }),
      getHeroDeathDurationMs(state.run) / Math.max(1, speed));
    return () => window.clearTimeout(timer);
  }, [state?.run?.heroDeathPending, dispatch, speed]);

  useEffect(() => {
    if (state?.run?.phase !== 'combat' || state.run.combatTurn !== 'enemy') return;
    const pending = Boolean(state.run.playerCombat?.pendingHeroAttack);
    const timer = window.setTimeout(() => {
      dispatch({ type: pending ? 'FINISH_HERO_ATTACK' : 'RESOLVE_ENEMY_TURN' });
    }, pending ? getPendingHeroAttackDurationMs(state.run) : getEnemyResponseDelayMs(state.run));
    return () => window.clearTimeout(timer);
  }, [dispatch, state?.run?.combatTurn, state?.run?.phase, responseSpeed, pendingAttackKey]);

  // The reducer commits the actual dice result before the presentation starts.
  // Holding movement here keeps the displayed pair stable and means a save
  // taken during the roll can resume the same result without rolling again.
  useEffect(() => {
    if (state?.run?.phase !== 'moving' || !state.run.rollAnimating) return;

    const timer = window.setTimeout(() => {
      dispatch({ type: 'BEGIN_MOVEMENT' });
    }, DICE_ROLL_ANIMATION_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [dispatch, state?.run?.phase, state?.run?.rollAnimating]);

  // GameBoard owns cinematic completion, including the rise and sword pose.

  useEffect(() => {
    if (!state?.run) return;
    
    let frameId: number;
    if (state.run.phase !== 'moving' || state.run.rollAnimating || state.run.trailCinematic) {
      // Reset the movement clock at the boundary of every non-moving phase.
      // Otherwise the first step after the dice presentation could fire
      // immediately using elapsed time from before the roll.
      moveTick.current = performance.now();
      return;
    }

    // The first step starts on a fresh 300ms (or speed-adjusted) interval,
    // matching the cadence between each subsequent intermediate tile.
    moveTick.current = performance.now();
    const loop = (time: number) => {
      frameId = requestAnimationFrame(loop);
      
      const r = state.run;
      if (!r) return;
      
      if (r.phase === 'moving' && !r.rollAnimating) {
        const dtMove = time - moveTick.current;
        const moveInterval = 300 / Math.max(1, speed);
        if (dtMove >= moveInterval) { // Keep each tile step on the 300ms base timeline
          moveTick.current = time;
          dispatch({ type: 'STEP_MOVE' });
        }
      }
    };
    
    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, [state?.run?.phase, state?.run?.position, state?.run?.rollAnimating, state?.run?.trailCinematic, dispatch, speed]);

  return { state, dispatch, speed, setSpeed };
}
