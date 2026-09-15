import { CombatApproach } from './CombatApproach';

/**
 * The authored melee wrapper for placeholder bosses. It deliberately delegates
 * the committed-target geometry and timing to CombatApproach so visual travel
 * never changes when the engine resolves a hit.
 */
export function MeleeCombatApproach({
  actorId,
  targetId,
  attackId,
  durationMs,
  enabled,
  paused,
  children,
}: React.ComponentProps<typeof CombatApproach>) {
  return (
    <CombatApproach
      actorId={actorId}
      targetId={targetId}
      attackId={attackId}
      durationMs={durationMs}
      enabled={enabled && durationMs > 0}
      paused={paused}
    >
      {children}
    </CombatApproach>
  );
}