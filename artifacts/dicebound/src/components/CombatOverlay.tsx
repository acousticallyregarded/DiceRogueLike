import { RunState } from '../engine';
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

import wolfUrl from '../assets/wolf.png';
import slimeUrl from '../assets/slime.png';
import goblinUrl from '../assets/goblin.png';
import skeletonUrl from '../assets/skeleton.png';
import bossUrl from '../assets/boss.png';
import heroUrl from '../assets/hero.png';
import { SpriteAnimator, SpriteName } from './SpriteAnimator';

interface EnemySnapshot {
  id: string;
  name: string;
  hp: number;
  attackTimer: number;
}

interface CombatSnapshot {
  phase: RunState['phase'];
  playerHp: number;
  playerAttackTimer: number;
  playerRound: number;
  enemies: Record<string, EnemySnapshot>;
}

interface EnemyVisualEvent {
  attackTrigger: number;
  hitTrigger: number;
  deathTrigger: number;
}

interface VisualEvents {
  heroAttack: number;
  heroHit: number;
  heroLastAction: 'attack' | 'hit' | null;
  enemies: Record<string, EnemyVisualEvent>;
}

interface DamagePopup {
  id: number;
  amount: number;
  target: 'hero' | 'enemy';
  enemyId?: string;
}

const EMPTY_EVENTS: VisualEvents = { heroAttack: 0, heroHit: 0, heroLastAction: null, enemies: {} };
const EXIT_DURATION_MS = 650;

function makeSnapshot(run: RunState): CombatSnapshot {
  return {
    phase: run.phase,
    playerHp: run.hp,
    playerAttackTimer: run.playerCombat?.attackTimer ?? 0,
    playerRound: run.playerCombat?.roundCounter ?? 0,
    enemies: Object.fromEntries(run.enemies.map(enemy => [
      enemy.id,
      {
        id: enemy.id,
        name: enemy.name,
        hp: enemy.hp,
        attackTimer: enemy.attackTimer,
      },
    ])),
  };
}

function getMonsterImage(name: string) {
  if (name.includes('Wolf')) return wolfUrl;
  if (name.includes('Slime')) return slimeUrl;
  if (name.includes('Goblin') || name.includes('Orc') || name.includes('Ogre')) return goblinUrl;
  if (name.includes('Skeleton')) return skeletonUrl;
  if (name.includes('Overlord')) return bossUrl;
  return wolfUrl;
}

function getAttackSprite(name: string): SpriteName {
  if (name.includes('Wolf')) return 'wolf-attack';
  if (name.includes('Slime')) return 'slime-attack';
  if (name.includes('Goblin') || name.includes('Orc') || name.includes('Ogre')) return 'goblin-attack';
  if (name.includes('Skeleton')) return 'skeleton-attack';
  return 'boss-attack';
}

function eventStyle(durationMs: number): CSSProperties {
  return { '--combat-duration': `${durationMs}ms`, '--combat-hit-duration': `${Math.min(durationMs, 320)}ms` } as CSSProperties;
}

export function CombatOverlay({ run, speed = 1 }: { run: RunState, speed?: number }) {
  const [visualEvents, setVisualEvents] = useState<VisualEvents>(EMPTY_EVENTS);
  const [damagePopups, setDamagePopups] = useState<DamagePopup[]>([]);
  const [displayRun, setDisplayRun] = useState<RunState | null>(null);
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const eventId = useRef(0);
  const previousSnapshot = useRef<CombatSnapshot | null>(null);
  const previousPhase = useRef<RunState['phase']>(run.phase);
  const latestCombatRun = useRef<RunState | null>(null);
  const enemyArchive = useRef<Record<string, RunState['enemies'][number]>>({});
  const popupTimers = useRef<number[]>([]);

  // Keep the latest combat state available for the short visual exit after
  // the engine has already removed defeated enemies.
  if (run.phase === 'combat') {
    latestCombatRun.current = run;
    run.enemies.forEach(enemy => {
      enemyArchive.current[enemy.id] = enemy;
    });
  }

  useEffect(() => () => {
    popupTimers.current.forEach(timer => window.clearTimeout(timer));
  }, []);

  // The overlay remains mounted for a brief death exit instead of disappearing
  // on the same state update that removes the final enemy.
  useEffect(() => {
    const wasCombat = previousPhase.current === 'combat';
    previousPhase.current = run.phase;

    if (run.phase === 'combat') {
      setVisible(true);
      setLeaving(false);
      return;
    }

    if (wasCombat && latestCombatRun.current) {
      setDisplayRun(latestCombatRun.current);
      setLeaving(true);
      setVisible(true);
      const timer = window.setTimeout(() => {
        setVisible(false);
        setLeaving(false);
        setDisplayRun(null);
      }, EXIT_DURATION_MS / Math.max(1, speed));
      return () => window.clearTimeout(timer);
    }

    return undefined;
  }, [run.phase, speed]);

  useEffect(() => {
    const current = makeSnapshot(run);
    const previous = previousSnapshot.current;
    previousSnapshot.current = current;

    if (!previous || (run.phase === 'combat' && previous.phase !== 'combat')) {
      if (run.phase === 'combat') {
        setVisualEvents(EMPTY_EVENTS);
        setDamagePopups([]);
      }
      return;
    }

    if (previous.phase !== 'combat') return;

    // roundCounter is advanced only by the engine's cooldown wrap. `<=`
    // also catches an exact 100-point cycle where the timer lands on the same
    // value after subtracting 100, including the final killing strike.
    const heroAttacked = current.playerRound > previous.playerRound
      && current.playerAttackTimer <= previous.playerAttackTimer;
    const heroWasHit = current.playerHp < previous.playerHp;
    const enemyUpdates: Array<{ id: string, kind: 'attack' | 'hit' | 'death' }> = [];
    const newPopups: DamagePopup[] = [];

    Object.values(current.enemies).forEach(enemy => {
      const oldEnemy = previous.enemies[enemy.id];
      if (!oldEnemy) return;

      if (run.phase === 'combat' && enemy.attackTimer < oldEnemy.attackTimer) {
        enemyUpdates.push({ id: enemy.id, kind: 'attack' });
      }
      if (enemy.hp < oldEnemy.hp) {
        enemyUpdates.push({ id: enemy.id, kind: 'hit' });
        newPopups.push({
          id: ++eventId.current,
          amount: oldEnemy.hp - enemy.hp,
          target: 'enemy',
          enemyId: enemy.id,
        });
      }
    });

    // Dead enemies are filtered by the engine in the same action that applies
    // the killing hit, so use the previous snapshot for the death visual.
    Object.values(previous.enemies).forEach(oldEnemy => {
      if (!current.enemies[oldEnemy.id] && oldEnemy.hp > 0) {
        enemyUpdates.push({ id: oldEnemy.id, kind: 'hit' });
        enemyUpdates.push({ id: oldEnemy.id, kind: 'death' });
        newPopups.push({
          id: ++eventId.current,
          amount: oldEnemy.hp,
          target: 'enemy',
          enemyId: oldEnemy.id,
        });
      }
    });

    if (heroWasHit) {
      newPopups.push({
        id: ++eventId.current,
        amount: previous.playerHp - current.playerHp,
        target: 'hero',
      });
    }

    if (heroAttacked || heroWasHit || enemyUpdates.length > 0) {
      const heroAttackTrigger = heroAttacked ? ++eventId.current : 0;
      const heroHitTrigger = heroWasHit ? ++eventId.current : 0;
      setVisualEvents(existing => {
        const enemies = { ...existing.enemies };
        enemyUpdates.forEach(update => {
          const prior = enemies[update.id] ?? { attackTrigger: 0, hitTrigger: 0, deathTrigger: 0 };
          enemies[update.id] = {
            ...prior,
            attackTrigger: update.kind === 'attack' ? ++eventId.current : prior.attackTrigger,
            hitTrigger: update.kind === 'hit' ? ++eventId.current : prior.hitTrigger,
            deathTrigger: update.kind === 'death' ? ++eventId.current : prior.deathTrigger,
          };
        });
        return {
          heroAttack: heroAttacked ? heroAttackTrigger : existing.heroAttack,
          heroHit: heroWasHit ? heroHitTrigger : existing.heroHit,
          heroLastAction: heroWasHit ? (heroAttacked ? 'attack' : 'hit') : (heroAttacked ? 'attack' : existing.heroLastAction),
          enemies,
        };
      });

      enemyUpdates
        .filter(update => update.kind === 'death')
        .forEach(update => {
          const timer = window.setTimeout(() => {
            setVisualEvents(existing => {
              const event = existing.enemies[update.id];
              if (!event?.deathTrigger) return existing;
              const enemies = { ...existing.enemies };
              delete enemies[update.id];
              return { ...existing, enemies };
            });
          }, EXIT_DURATION_MS / Math.max(1, speed));
          popupTimers.current.push(timer);
        });
    }

    if (newPopups.length > 0) {
      const popupDuration = Math.max(320, 700 / Math.max(1, speed));
      setDamagePopups(existing => [...existing, ...newPopups]);
      newPopups.forEach(popup => {
        const timer = window.setTimeout(() => {
          setDamagePopups(existing => existing.filter(item => item.id !== popup.id));
        }, popupDuration);
        popupTimers.current.push(timer);
      });
    }
  }, [
    run,
    run.enemies,
    run.hp,
    run.phase,
    run.playerCombat?.attackTimer,
    run.playerCombat?.roundCounter,
    speed,
  ]);

  const renderedRun = run.phase === 'combat' ? run : displayRun;
  if (!visible || !renderedRun || !renderedRun.playerCombat) return null;
  const activeEnemyIds = new Set(renderedRun.enemies.map(enemy => enemy.id));
  const archivedDeaths = Object.values(enemyArchive.current).filter(enemy => (
    !activeEnemyIds.has(enemy.id) && visualEvents.enemies[enemy.id]?.deathTrigger
  ));
  const renderedEnemies = [...renderedRun.enemies, ...archivedDeaths];

  const playerAttackTrigger = visualEvents.heroAttack;
  const playerHitTrigger = visualEvents.heroHit;
  const playerSprite: SpriteName = visualEvents.heroLastAction === 'hit'
    ? 'hero-hit'
    : visualEvents.heroLastAction === 'attack'
      ? 'hero-attack'
      : 'hero-walk';
  const combatDuration = Math.max(180, 420 / Math.max(1, speed));
  const hitDuration = Math.max(160, 300 / Math.max(1, speed));

  return (
    <div className={`absolute top-0 left-0 right-0 h-[60%] flex flex-col z-20 overflow-hidden pt-24 pb-4 ${leaving ? 'combat-overlay--leaving' : ''}`}>
      <div className="absolute top-20 left-0 right-0 flex justify-center z-30 pointer-events-none">
        <div className="bg-[var(--color-ui-purple)] text-white px-4 py-1 rounded-full font-black text-xs border-2 border-[#1c1c1c] shadow-[0_2px_0_#1c1c1c] uppercase tracking-wider">
          Floor {renderedRun.floor} • Round {renderedRun.playerCombat.roundCounter}/30
        </div>
      </div>

      <div className="flex-1 relative flex items-end justify-between px-6 pb-12">
        <div className="relative flex flex-col items-center">
          <div
            className={`combat-actor w-28 h-28 ${playerAttackTrigger > 0 ? 'combat-actor--attacking' : ''}`}
            key={`hero-${playerAttackTrigger}-${playerHitTrigger}`}
            style={eventStyle(combatDuration)}
          >
            <div className={`combat-actor__hit w-full h-full ${playerHitTrigger > 0 ? 'combat-actor__hit--flashing' : ''}`} style={{ '--combat-hit-duration': `${hitDuration}ms` } as CSSProperties}>
              <SpriteAnimator
                sprite={playerSprite}
                fallbackUrl={heroUrl}
                active={playerAttackTrigger > 0 || playerHitTrigger > 0}
                trigger={playerAttackTrigger + playerHitTrigger}
                fps={14}
                durationMs={combatDuration}
                alt="Hero"
                className="combat-actor__sprite drop-shadow-xl"
              />
            </div>
            {playerAttackTrigger > 0 && <span className="sword-arc" key={`arc-${playerAttackTrigger}`} aria-hidden="true" />}
            {damagePopups.filter(popup => popup.target === 'hero').map(popup => (
              <span className="damage-popup damage-popup--hero" key={popup.id}>-{popup.amount}</span>
            ))}
          </div>
          <div className="mt-2 w-20 h-4 bg-red-950 border-2 border-[#1c1c1c] rounded overflow-hidden relative shadow-sm">
            <div className="absolute inset-0 bg-red-500 origin-left transition-transform duration-200" style={{ transform: `scaleX(${Math.max(0, renderedRun.hp / renderedRun.maxHp)})` }} />
            <div className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-white text-shadow-sm">
              {Math.floor(renderedRun.hp)}
            </div>
          </div>
          <div className="mt-1 w-20 h-1.5 bg-slate-900 border border-[#1c1c1c] rounded-full overflow-hidden">
            <div className="h-full bg-amber-400" style={{ width: `${Math.min(100, renderedRun.playerCombat.attackTimer)}%` }} />
          </div>
        </div>

        <div className="relative flex items-end gap-2">
          {renderedEnemies.map(enemy => {
            const enemyEvent = visualEvents.enemies[enemy.id] ?? { attackTrigger: 0, hitTrigger: 0, deathTrigger: 0 };
            const isDying = enemyEvent.deathTrigger > 0;
            const enemySprite = getAttackSprite(enemy.name);
            return (
              <div
                key={`${enemy.id}-${enemyEvent.attackTrigger}-${enemyEvent.hitTrigger}-${enemyEvent.deathTrigger}`}
                className={`relative flex flex-col items-center ${isDying ? 'combat-actor--dying' : ''}`}
                style={{ ...eventStyle(combatDuration), '--combat-exit-duration': `${EXIT_DURATION_MS / Math.max(1, speed)}ms` } as CSSProperties}
              >
                <div className={`combat-actor combat-actor--enemy w-20 h-20 ${enemyEvent.attackTrigger > 0 ? 'combat-actor--attacking' : ''}`}>
                  <div className={`combat-actor__hit w-full h-full ${enemyEvent.hitTrigger > 0 ? 'combat-actor__hit--flashing' : ''}`} style={{ '--combat-hit-duration': `${hitDuration}ms` } as CSSProperties}>
                    <SpriteAnimator
                      sprite={enemySprite}
                      fallbackUrl={getMonsterImage(enemy.name)}
                      active={enemyEvent.attackTrigger > 0}
                      trigger={enemyEvent.attackTrigger}
                      fps={14}
                      durationMs={combatDuration}
                      flip
                      alt={enemy.name}
                      className="combat-actor__sprite drop-shadow-xl"
                    />
                  </div>
                </div>
                <div className="text-[9px] font-black text-white bg-black/60 px-1 rounded absolute -top-4">{enemy.name}</div>
                {damagePopups.filter(popup => popup.target === 'enemy' && popup.enemyId === enemy.id).map(popup => (
                  <span className="damage-popup" key={popup.id}>-{popup.amount}</span>
                ))}
                <div className="mt-2 w-16 h-3 bg-red-950 border-2 border-[#1c1c1c] rounded overflow-hidden relative shadow-sm">
                  <div className="absolute inset-0 bg-red-500 origin-left transition-transform duration-200" style={{ transform: `scaleX(${Math.max(0, enemy.hp / enemy.maxHp)})` }} />
                </div>
                <div className="mt-1 w-16 h-1.5 bg-slate-900 border border-[#1c1c1c] rounded-full overflow-hidden">
                  <div className="h-full bg-amber-400" style={{ width: `${Math.min(100, enemy.attackTimer)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}