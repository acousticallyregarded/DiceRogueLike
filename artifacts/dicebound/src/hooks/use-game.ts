import { useState, useEffect, useCallback, useRef } from 'react';
import { GameStateV2, GameAction, act, validateState, createInitialState } from '../engine';
import { toast } from 'sonner';

const KEY_V2 = "dicebound-save-v3"; // Version bump for schema changes

export function loadGame(): GameStateV2 {
  try {
    const raw = localStorage.getItem(KEY_V2);
    if (!raw) return createInitialState();
    const parsed = JSON.parse(raw);
    const s = validateState(parsed);
    if (s.meta.version !== 3) return createInitialState();
    return s;
  } catch (err) {
    console.error("Save load error", err);
    return createInitialState();
  }
}

export function saveGame(s: GameStateV2): boolean {
  try {
    localStorage.setItem(KEY_V2, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}

export function useGame() {
  const [state, setState] = useState<GameStateV2 | null>(null);
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

  const speedRef = useRef(speed);
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  const lastTick = useRef<number>(performance.now());
  useEffect(() => {
    if (!state?.run || state.run.phase !== 'combat') {
      lastTick.current = performance.now();
      return;
    }
    
    let frameId: number;
    const loop = (time: number) => {
      const dt = time - lastTick.current;
      lastTick.current = time;
      
      if (dt > 0) {
        const scaledDt = dt * speedRef.current;
        dispatch({ type: 'TICK_COMBAT', dtMs: Math.min(scaledDt, 100 * speedRef.current) }); 
      }
      
      frameId = requestAnimationFrame(loop);
    };
    
    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, [state?.run?.phase, dispatch]);

  return { state, dispatch, speed, setSpeed };
}
