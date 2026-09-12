import { useState, useEffect, useCallback } from 'react';
import { GameState, act, loadGame, saveGame, initialGame } from '../game';
import { toast } from 'sonner';

export function useGame() {
  const [state, setState] = useState<GameState | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [visualPosition, setVisualPosition] = useState(0);

  useEffect(() => {
    try {
      const saved = loadGame();
      if (saved) {
        setState(saved);
        setVisualPosition(saved.position);
      } else {
        const init = initialGame();
        setState(init);
        setVisualPosition(init.position);
      }
    } catch (e) {
      console.error("Failed to load game", e);
      const init = initialGame();
      setState(init);
      setVisualPosition(init.position);
    }
  }, []);

  const dispatch = useCallback((action: "roll"|"attack"|"guard"|"potion"|"weapon"|"armor"|"next"|"restart") => {
    setState(prev => {
      if (!prev) return prev;
      
      const oldGold = prev.gold;
      
      try {
        const next = act(prev, action);
        if (!saveGame(next)) {
          toast.error("Failed to save game progress");
        }
        
        if (action === 'weapon' && next.gold === oldGold) {
          toast.error("Not enough gold to upgrade weapon");
        }
        if (action === 'armor' && next.gold === oldGold) {
          toast.error("Not enough gold to upgrade armor");
        }
        
        return next;
      } catch (e) {
        console.error("Action failed", e);
        return prev;
      }
    });
  }, []);

  // Visual movement logic
  useEffect(() => {
    if (!state) return;
    if (state.position === visualPosition) return;

    // Check if we restarted or advanced floor (jump backward significantly, exception is boss finish to 0)
    const isRestart = state.position === 0 && visualPosition !== 23;
    
    if (isRestart) {
      setVisualPosition(state.position);
      setIsAnimating(false);
      return;
    }

    setIsAnimating(true);
    let currentVp = visualPosition;
    const timer = setInterval(() => {
      currentVp = (currentVp + 1) % 24;
      setVisualPosition(currentVp);
      if (currentVp === state.position) {
        clearInterval(timer);
        setIsAnimating(false);
      }
    }, 200);

    return () => clearInterval(timer);
  }, [state?.position]);

  return { state, dispatch, isAnimating, visualPosition };
}