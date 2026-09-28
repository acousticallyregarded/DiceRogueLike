/** Unit plate shown under a combatant: name, HP numbers, and a bar whose
 * pale "lag" layer trails behind recent damage so each hit reads clearly. */
export function EnemyHealthBar({ name, hp, maxHp, reducedMotion = false, variant = 'enemy', selected = false }: {
  name: string;
  hp: number;
  maxHp: number;
  reducedMotion?: boolean;
  variant?: 'enemy' | 'hero';
  selected?: boolean;
}) {
  const maximum = Math.max(1, maxHp);
  const current = Math.max(0, Math.min(hp, maximum));
  const ratio = current / maximum;
  const tone = variant === 'hero'
    ? ratio <= 0.3 ? 'combat-plate__fill--danger' : 'combat-plate__fill--hero'
    : ratio <= 0.3 ? 'combat-plate__fill--danger' : 'combat-plate__fill--enemy';
  return (
    <div className={`combat-plate combat-plate--${variant} ${selected ? 'combat-plate--selected' : ''}`}>
      <div className="combat-plate__header">
        <span className="combat-plate__name">{name}</span>
        <span className="combat-plate__hp tabular-nums">
          {Math.ceil(current)}<span className="combat-plate__hp-max">/{Math.ceil(maximum)}</span>
        </span>
      </div>
      <div role="progressbar" aria-label={`${name} HP`}
        aria-valuemin={0} aria-valuemax={maximum} aria-valuenow={current}
        className="combat-plate__track">
        <div className="combat-plate__lag"
          style={{
            transform: `scaleX(${ratio})`,
            transition: reducedMotion ? 'none' : undefined,
          }} />
        <div className={`combat-plate__fill ${tone}`}
          style={{
            transform: `scaleX(${ratio})`,
            transition: reducedMotion ? 'none' : 'transform 100ms linear',
          }} />
      </div>
    </div>
  );
}
