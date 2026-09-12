import { useState, useEffect, useCallback, useRef } from 'react';
import {
  GameStateV4,
  GameAction,
  act,
  validateState,
  createInitialState,
  getEnemyResponseDelayMs,
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
  
  useEffect(() => {
    setState(loadGame());
  }, []);

  const dispatch = useCallback((action: GameAction) => {
    setState(prev => {
      if (!prev) return prev;
      try {
        const next = act(prev, action);
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

  useEffect(() => {
    if (state?.run?.phase !== 'combat' || state.run.combatTurn !== 'enemy') return;
    const timer = window.setTimeout(() => {
      dispatch({ type: 'RESOLVE_ENEMY_TURN' });
    }, getEnemyResponseDelayMs(state.run));
    return () => window.clearTimeout(timer);
  }, [dispatch, state?.run?.combatTurn, state?.run?.phase]);

  useEffect(() => {
    if (!state?.run) return;
    
    let frameId: number;
    const loop = (time: number) => {
      frameId = requestAnimationFrame(loop);
      
      const r = state.run;
      if (!r) return;
      
      if (r.phase === 'moving') {
        const dtMove = time - moveTick.current;
        const moveInterval = 300 / Math.max(1, speed);
        if (dtMove >= moveInterval) { // Keep each tile step on the 300ms base timeline
          moveTick.current = time;
          dispatch({ type: 'STEP_MOVE' });
        }
      } else {
        moveTick.current = time;
      }
    };
    
    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, [state?.run?.phase, state?.run?.position, dispatch, speed]);

  return { state, dispatch, speed, setSpeed };
}
