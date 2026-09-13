export function EnemyHealthBar({ name, hp, maxHp, reducedMotion = false }: {
  name: string;
  hp: number;
  maxHp: number;
  reducedMotion?: boolean;
}) {
  const maximum = Math.max(1, maxHp);
  const current = Math.max(0, Math.min(hp, maximum));
  return (
    <div className="mt-2 w-20">
      <div role="progressbar" aria-label={`${name} HP`}
        aria-valuemin={0} aria-valuemax={maximum} aria-valuenow={current}
        className="h-3 overflow-hidden rounded border-2 border-[#1c1c1c] bg-red-950 shadow-sm">
        <div className="h-full origin-left bg-red-500"
          style={{
            transform: `scaleX(${current / maximum})`,
            transition: reducedMotion ? 'none' : 'transform 100ms linear',
          }} />
      </div>
      <div className="mt-0.5 rounded bg-black/80 px-1 text-center text-[10px] font-black tabular-nums text-white">
        {Math.ceil(current)} / {Math.ceil(maximum)} HP
      </div>
    </div>
  );
}