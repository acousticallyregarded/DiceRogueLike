import { ATTACK_STYLES, formatDamageType } from "../bestiary";
import { GameAction, RunState } from "../engine";

export function AttackStyleSelector({
  run,
  dispatch,
  compact = false,
}: {
  run: RunState;
  dispatch: (action: GameAction) => void;
  compact?: boolean;
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
            Current: {formatDamageType(run.selectedDamageType)}
          </div>
        </div>
        <span className="text-[8px] font-bold text-slate-400 text-right max-w-[118px]">
          Arcane stances are a Dicebound adaptation, not full D&amp;D rules.
        </span>
      </div>
      <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5" role="group">
        {ATTACK_STYLES.map((style) => {
          const selected = run.selectedDamageType === style.id;
          return (
            <button
              key={style.id}
              type="button"
              aria-pressed={selected}
              aria-label={`${style.label} (${style.damageType})`}
              title={style.description}
              onClick={() => dispatch({ type: "SELECT_ATTACK", damageType: style.id })}
              className={`shrink-0 rounded-lg border-2 px-2 py-1 text-[10px] font-black transition-all active:translate-y-0.5 ${
                selected
                  ? "border-amber-300 bg-amber-400 text-slate-950 shadow-[0_2px_0_#f59e0b]"
                  : "border-slate-600 bg-slate-800 text-slate-100 hover:border-slate-300"
              }`}
            >
              {style.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}