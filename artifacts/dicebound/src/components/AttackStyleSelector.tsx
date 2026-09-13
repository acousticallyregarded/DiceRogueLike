import { ATTACK_STYLES, formatDamageType } from "../bestiary";
import { GameAction, RunState, isAttackStyleLearned } from "../engine";

export function AttackStyleSelector({
  run,
  dispatch,
  compact = false,
  disabled = false,
}: {
  run: RunState;
  dispatch: (action: GameAction) => void;
  compact?: boolean;
  disabled?: boolean;
}) {
  return (
    <section
      aria-label="Attack style"
      className={`pointer-events-auto bg-slate-950/90 text-white border-2 border-[#1c1c1c] rounded-2xl shadow-lg ${
        compact ? "p-2" : "p-3"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[10px] font-black uppercase tracking-wider text-amber-300">
            Attack style
          </div>
          <div className="text-[9px] font-bold text-slate-300">
            Current: {formatDamageType(run.selectedDamageType)} • choose freely
          </div>
        </div>
        <span className="text-[8px] font-bold text-slate-400 text-right max-w-[118px]">
          Select a stance, then press Attack to commit the turn.
        </span>
      </div>
      <div className="mt-2 grid grid-cols-4 gap-1.5 pb-0.5" role="group">
        {ATTACK_STYLES.map((style) => {
          const selected = run.selectedDamageType === style.id;
          const locked = !isAttackStyleLearned(run, style.id);
          return (
            <button
              key={style.id}
              type="button"
              aria-pressed={selected}
              disabled={disabled || locked}
              aria-label={`${style.label} (${style.damageType})${locked ? " — not learned" : ""}`}
              title={locked ? "Learn this style through a level-up choice or the shop." : style.description}
              onClick={() => dispatch({ type: "SELECT_ATTACK", damageType: style.id })}
               className={`min-w-0 rounded-lg border-2 px-1 py-1 text-[10px] font-black transition-all active:translate-y-0.5 ${
                locked ? "border-slate-700 bg-slate-900 text-slate-500 grayscale" : selected
                  ? "border-amber-300 bg-amber-400 text-slate-950 shadow-[0_2px_0_#f59e0b]"
                 : "border-slate-600 bg-slate-800 text-slate-100 hover:border-slate-300"
               } ${disabled || locked ? "cursor-not-allowed opacity-60" : ""}`}
            >
              {style.label}
              {locked && <span className="block text-[8px]">Not learned</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}