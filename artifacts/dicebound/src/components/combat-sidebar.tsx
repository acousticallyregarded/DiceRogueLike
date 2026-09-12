import { GameState } from '../game';
import { Skull, Sword, ShieldAlert } from 'lucide-react';
import { useEffect, useRef } from 'react';

export function CombatSidebar({ state }: { state: GameState }) {
  const logEndRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.log]);

  return (
    <aside className="w-full md:w-80 border-t md:border-t-0 md:border-l border-border bg-card/90 flex flex-col z-20 shadow-xl h-[40vh] md:h-auto">
      {/* Enemy Panel */}
      <div className="h-48 shrink-0 border-b border-border/50 p-6 flex flex-col justify-center bg-background/50 relative overflow-hidden">
        {state.enemy ? (
          <div className="relative z-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex justify-between items-start mb-5">
              <div>
                <h2 className="font-serif text-2xl font-bold text-destructive flex items-center gap-2 drop-shadow-sm">
                  {state.enemy.boss && <Skull className="w-5 h-5 text-purple-400" />}
                  {state.enemy.name}
                </h2>
                <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest bg-muted px-2 py-0.5 rounded-sm inline-block mt-1">
                  {state.enemy.boss ? 'Boss Encounter' : 'Enemy'}
                </span>
              </div>
              <div className="text-right">
                <div className="flex items-center justify-end gap-1.5 text-sm font-bold text-orange-400 bg-orange-950/30 px-2 py-1 rounded border border-orange-900/50">
                  <Sword className="w-4 h-4" /> {state.enemy.attack}
                </div>
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-bold uppercase tracking-wider">
                <span className="text-destructive">Health</span>
                <span className="text-foreground/80">{state.enemy.hp} / {state.enemy.maxHp}</span>
              </div>
              <div className="h-3 bg-background rounded-full overflow-hidden border border-border shadow-inner">
                <div 
                  className="h-full bg-destructive transition-all duration-300"
                  style={{ width: `${Math.max(0, Math.min(100, (state.enemy.hp / state.enemy.maxHp) * 100))}%` }}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-muted-foreground/30 h-full gap-3 animate-in fade-in">
            <ShieldAlert className="w-12 h-12 opacity-50" />
            <span className="font-serif text-lg font-medium tracking-wide">Area Secure</span>
          </div>
        )}
        
        {/* Subtle background flair */}
        {state.enemy && (
          <div className="absolute -right-6 -bottom-6 opacity-[0.03] pointer-events-none">
            <Skull className="w-48 h-48 text-destructive" />
          </div>
        )}
      </div>

      {/* Combat Log */}
      <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-card/50">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-4 sticky top-0 bg-card/90 py-2 backdrop-blur-sm z-10 border-b border-border/50">
          Adventure Log
        </h3>
        {state.log.map((entry, i) => (
          <div 
            key={i} 
            className="text-sm pb-3 text-foreground/80 leading-relaxed animate-in fade-in slide-in-from-left-2 duration-300 relative pl-4 before:absolute before:left-0 before:top-2 before:w-1.5 before:h-1.5 before:bg-primary/50 before:rounded-full"
          >
            {entry}
          </div>
        ))}
        <div ref={logEndRef} className="h-1" />
      </div>
    </aside>
  );
}