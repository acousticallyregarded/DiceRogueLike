import { useGame } from '../hooks/use-game';
import { GameBoard } from '../components/game-board';
import { PlayerSidebar } from '../components/player-sidebar';
import { CombatSidebar } from '../components/combat-sidebar';
import { ActionBar } from '../components/action-bar';
import { Loader2 } from 'lucide-react';

export default function Game() {
  const { state, dispatch, isAnimating, visualPosition } = useGame();

  if (!state) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center font-serif text-2xl text-muted-foreground gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        Summoning realm...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-sans flex flex-col md:flex-row overflow-hidden selection:bg-primary/30">
      <PlayerSidebar state={state} dispatch={dispatch} isAnimating={isAnimating} />
      
      <main className="flex-1 flex flex-col h-[100dvh] relative">
        <div className="flex-1 p-4 md:p-8 flex items-center justify-center relative overflow-hidden">
           {/* Background decorative elements */}
           <div className="absolute inset-0 pointer-events-none opacity-[0.15] bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-primary/30 via-background to-background"></div>
           <GameBoard state={state} visualPosition={visualPosition} />
           
           {/* Phase Overlays */}
           {state.phase === 'defeat' && (
             <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center animate-in fade-in duration-1000">
                <h1 className="font-serif text-6xl md:text-8xl font-bold text-destructive drop-shadow-[0_0_30px_rgba(255,0,0,0.5)] tracking-widest uppercase">You Died</h1>
                <p className="mt-4 text-xl text-muted-foreground font-serif">Your journey ends on floor {state.floor}.</p>
             </div>
           )}
           {state.phase === 'victory' && (
             <div className="absolute inset-0 z-50 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center animate-in fade-in duration-1000">
                <h1 className="font-serif text-5xl md:text-7xl font-bold text-primary drop-shadow-[0_0_30px_rgba(255,215,0,0.5)] tracking-widest uppercase text-center leading-tight">Boss<br/>Defeated!</h1>
                <p className="mt-6 text-xl text-primary/80 font-serif font-bold">Floor {state.floor} Cleared</p>
             </div>
           )}
        </div>
        
        <div className="h-56 md:h-64 border-t border-border bg-card/80 backdrop-blur-md z-10 shrink-0">
           <ActionBar state={state} dispatch={dispatch} isAnimating={isAnimating} />
        </div>
      </main>
      
      <CombatSidebar state={state} />
    </div>
  );
}