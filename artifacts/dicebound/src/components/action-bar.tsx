import { GameState } from '../game';
import { Dices, Sword, Shield, FlaskConical, ArrowRight, RotateCcw, Trophy } from 'lucide-react';

export function ActionBar({ state, dispatch, isAnimating }: { state: GameState, dispatch: any, isAnimating: boolean }) {
  
  return (
    <div className="h-full flex flex-col items-center justify-center p-6 gap-6 relative">
      
      {/* Dice roll result indicator */}
      {state.phase === 'explore' && state.roll > 0 && (
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-background border border-primary/50 px-6 py-2 rounded-full text-base font-bold text-primary shadow-[0_0_20px_rgba(255,215,0,0.2)] animate-out fade-out duration-1000 delay-[2000ms] fill-mode-forwards z-20">
          Rolled a {state.roll}!
        </div>
      )}

      {/* Main Actions based on Phase */}
      <div className="flex items-center justify-center gap-4 w-full max-w-xl">
        
        {state.phase === 'explore' && (
          <button
            disabled={isAnimating}
            onClick={() => dispatch('roll')}
            className="group relative flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-serif text-3xl font-bold py-6 rounded-2xl shadow-[0_0_40px_-10px_rgba(255,215,0,0.4)] transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-4 border-b-4 border-primary-foreground/20"
          >
            <Dices className="w-10 h-10 group-hover:rotate-12 transition-transform" />
            Roll Dice
          </button>
        )}

        {state.phase === 'combat' && (
          <>
            <button
              disabled={isAnimating}
              onClick={() => dispatch('attack')}
              className="flex-1 bg-destructive hover:bg-destructive/90 text-destructive-foreground font-serif text-2xl font-bold py-5 rounded-2xl transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex flex-col items-center gap-2 border-b-4 border-black/20 shadow-lg shadow-destructive/20"
            >
              <Sword className="w-8 h-8" />
              Attack
            </button>
            <button
              disabled={isAnimating}
              onClick={() => dispatch('guard')}
              className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-serif text-2xl font-bold py-5 rounded-2xl transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex flex-col items-center gap-2 border-b-4 border-black/20 shadow-lg shadow-blue-600/20"
            >
              <Shield className="w-8 h-8" />
              Guard
            </button>
          </>
        )}

        {state.phase === 'defeat' && (
          <button
            onClick={() => dispatch('restart')}
            className="flex-1 bg-destructive hover:bg-destructive/90 text-destructive-foreground font-serif text-3xl font-bold py-6 rounded-2xl transition-all active:scale-95 shadow-[0_0_40px_-10px_rgba(255,0,0,0.5)] flex items-center justify-center gap-4 border-b-4 border-black/20"
          >
            <RotateCcw className="w-10 h-10" />
            Restart Run
          </button>
        )}

        {state.phase === 'victory' && (
          <div className="flex w-full gap-4">
            {state.floor < 3 ? (
              <button
                onClick={() => dispatch('next')}
                className="flex-[2] bg-primary hover:bg-primary/90 text-primary-foreground font-serif text-2xl font-bold py-5 rounded-2xl transition-all active:scale-95 shadow-[0_0_40px_-10px_rgba(255,215,0,0.4)] flex items-center justify-center gap-3 border-b-4 border-primary-foreground/20"
              >
                Next Floor <ArrowRight className="w-6 h-6" />
              </button>
            ) : (
              <button
                onClick={() => dispatch('restart')}
                className="flex-[2] bg-primary hover:bg-primary/90 text-primary-foreground font-serif text-2xl font-bold py-5 rounded-2xl transition-all active:scale-95 shadow-[0_0_40px_-10px_rgba(255,215,0,0.4)] flex items-center justify-center gap-3 border-b-4 border-primary-foreground/20"
              >
                <Trophy className="w-6 h-6" /> Victory! Play Again
              </button>
            )}
            
            <button
              onClick={() => dispatch('restart')}
              className="flex-1 bg-background hover:bg-muted border border-border text-foreground font-serif text-xl font-bold py-5 rounded-2xl transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-5 h-5" /> Restart
            </button>
          </div>
        )}
      </div>

      {/* Secondary Actions */}
      {(state.phase === 'explore' || state.phase === 'combat') && (
        <button
          disabled={isAnimating || state.potions <= 0}
          onClick={() => dispatch('potion')}
          className="flex items-center gap-2.5 px-8 py-3.5 rounded-full border border-emerald-500/30 text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
        >
          <FlaskConical className="w-5 h-5" />
          <span className="font-bold tracking-wide">Use Potion ({state.potions})</span>
        </button>
      )}

    </div>
  );
}