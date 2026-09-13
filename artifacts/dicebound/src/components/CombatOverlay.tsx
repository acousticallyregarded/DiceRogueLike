import { ConsumableType, GameAction, RunState } from '../engine';
import {
  formatDamageType,
  getBestiaryEntry,
  getMonsterArtKey,
  speciesKeyForName,
} from '../bestiary';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Backpack, Flame, Heart, Shield, Sword } from 'lucide-react';

import wolfUrl from '../assets/wolf-pixel.png';
import { WolfPixelSprite } from './WolfPixelSprite';
import customWinterWolfUrl from '../assets/custom-winter-wolf.png';
import customOgreUrl from '../assets/custom-ogre.png';
import { CustomOgreSprite, CUSTOM_OGRE_DEATH_EXIT_MS } from './CustomOgreSprite';
import { CustomWinterWolfSprite, CUSTOM_WINTER_WOLF_DEATH_EXIT_MS } from './CustomWinterWolfSprite';
import customWolfUrl from '../assets/custom-wolf.png';
import { CustomWolfSprite, CUSTOM_WOLF_DEATH_EXIT_MS } from './CustomWolfSprite';
import slimeUrl from '../assets/custom-ochre.png';
import { OchreJellySprite, CUSTOM_OCHRE_DEATH_EXIT_MS } from './OchreJellySprite';
import goblinUrl from '../assets/goblin.png';
import goblinPixelUrl from '../assets/custom-goblin.png';
import { CustomGoblinSprite, CUSTOM_GOBLIN_DEATH_EXIT_MS } from './CustomGoblinSprite';
import skeletonUrl from '../assets/skeleton.png';
import customSkeletonUrl from '../assets/custom-skeleton.png';
import customMummyUrl from '../assets/custom-mummy.png';
import { CustomMummySprite, CUSTOM_MUMMY_DEATH_EXIT_MS } from './CustomMummySprite';
import { CustomSkeletonSprite, CUSTOM_SKELETON_DEATH_EXIT_MS } from './CustomSkeletonSprite';
import bossUrl from '../assets/boss.png';
import heroUrl from '../assets/custom-combat-hero.png';
import drinkPotionUrl from '../assets/custom-drink-potion.png';
import throwFireBombUrl from '../assets/custom-throw-firebomb.png';
import heroHitUrl from '../assets/custom-hero-hit.png';
import guardTonicUrl from '../assets/custom-guard-tonic.png';
import { SpriteAnimator, SpriteName, usePrefersReducedMotion } from './SpriteAnimator';
import { AttackStyleSelector } from './AttackStyleSelector';
import { SkeletonKingSprite } from './SkeletonKingSprite';
import kingUrl from '../assets/skeleton-king.png';
import { BattleBackdrop } from './BattleBackdrop';

interface EnemySnapshot {
  id: string;
  name: string;
  hp: number;
}

interface CombatSnapshot {
  phase: RunState['phase'];
  playerHp: number;
  playerAttackSequence: number;
  heroConsumableSequence: number;
  lastConsumable: ConsumableType | null;
  guardActive: boolean;
  pendingFireBomb: boolean;
  enemyAttackSequence: number;
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
  heroDrink: number;
  heroFireBomb: number;
  heroGuard: number;
  heroHit: number;
  heroLastAction: 'attack' | 'drink' | 'fire_bomb' | 'guard' | 'hit' | null;
  enemies: Record<string, EnemyVisualEvent>;
}

interface DamagePopup {
  id: number;
  amount: number;
  target: 'hero' | 'enemy';
  enemyId?: string;
}

const EMPTY_EVENTS: VisualEvents = { heroAttack: 0, heroDrink: 0, heroFireBomb: 0, heroGuard: 0, heroHit: 0, heroLastAction: null, enemies: {} };
const EXIT_DURATION_MS = 650;
const MIN_COMBAT_SPEED = 1;

function makeSnapshot(run: RunState): CombatSnapshot {
  return {
    phase: run.phase,
    playerHp: run.hp,
    playerAttackSequence: run.playerCombat?.heroAttackSequence ?? 0,
    heroConsumableSequence: run.playerCombat?.heroConsumableSequence ?? 0,
    lastConsumable: run.playerCombat?.lastConsumable ?? null,
    guardActive: run.guardActive,
    pendingFireBomb: run.playerCombat?.pendingFireBomb ?? false,
    enemyAttackSequence: run.playerCombat?.enemyAttackSequence ?? 0,
    playerRound: run.playerCombat?.roundCounter ?? 0,
    enemies: Object.fromEntries(run.enemies.map(enemy => [
      enemy.id,
      {
        id: enemy.id,
        name: enemy.name,
         hp: Math.max(0, enemy.hp),
      },
    ])),
  };
}

function getMonsterImage(enemy: RunState['enemies'][number]) {
  if (enemy.boss) return kingUrl;
  const speciesKey = enemy.speciesKey ?? speciesKeyForName(enemy.name);
  if (speciesKey === 'wolf') return customWolfUrl;
  if (speciesKey === 'goblin') return goblinPixelUrl;
  if (speciesKey === 'skeleton') return customSkeletonUrl;
  if (speciesKey === 'mummy') return customMummyUrl;
  if (speciesKey === 'winter_wolf') return customWinterWolfUrl;
  if (speciesKey === 'ogre') return customOgreUrl;
  const artKey = getMonsterArtKey(
    speciesKey,
    enemy.artKey ?? (enemy.boss ? 'boss' : undefined),
  );
  if (artKey === 'wolf') return wolfUrl;
  if (artKey === 'slime') return slimeUrl;
  if (artKey === 'goblin') return goblinUrl;
  if (artKey === 'skeleton') return skeletonUrl;
  if (artKey === 'boss') return bossUrl;
  return wolfUrl;
}

function isCustomWolfEnemy(enemy: RunState['enemies'][number]) {
  return (enemy.speciesKey ?? speciesKeyForName(enemy.name)) === 'wolf';
}

function isCustomGoblinEnemy(enemy: RunState['enemies'][number]) {
  return (enemy.speciesKey ?? speciesKeyForName(enemy.name)) === 'goblin';
}

function isCustomOchreEnemy(enemy: RunState['enemies'][number]) {
  return (enemy.speciesKey ?? speciesKeyForName(enemy.name)) === 'ochre_jelly';
}

function isCustomSkeletonEnemy(enemy: RunState['enemies'][number]) {
  return (enemy.speciesKey ?? speciesKeyForName(enemy.name)) === 'skeleton';
}

function isCustomMummyEnemy(enemy: RunState['enemies'][number]) {
  return (enemy.speciesKey ?? speciesKeyForName(enemy.name)) === 'mummy';
}

function isCustomWinterWolfEnemy(enemy: RunState['enemies'][number]) {
  return (enemy.speciesKey ?? speciesKeyForName(enemy.name)) === 'winter_wolf';
}

function isCustomOgreEnemy(enemy: RunState['enemies'][number]) {
  return (enemy.speciesKey ?? speciesKeyForName(enemy.name)) === 'ogre';
}

function deathExitDurationMs(enemy: RunState['enemies'][number] | undefined, speed: number) {
  const duration = enemy?.boss ? 5200 : enemy && isCustomWolfEnemy(enemy)
    ? CUSTOM_WOLF_DEATH_EXIT_MS
    : enemy && isCustomGoblinEnemy(enemy) ? CUSTOM_GOBLIN_DEATH_EXIT_MS
    : enemy && isCustomOchreEnemy(enemy) ? CUSTOM_OCHRE_DEATH_EXIT_MS
    : enemy && isCustomSkeletonEnemy(enemy) ? CUSTOM_SKELETON_DEATH_EXIT_MS
    : enemy && isCustomMummyEnemy(enemy) ? CUSTOM_MUMMY_DEATH_EXIT_MS
    : enemy && isCustomWinterWolfEnemy(enemy) ? CUSTOM_WINTER_WOLF_DEATH_EXIT_MS
    : enemy && isCustomOgreEnemy(enemy) ? CUSTOM_OGRE_DEATH_EXIT_MS : EXIT_DURATION_MS;
  return duration / Math.max(MIN_COMBAT_SPEED, speed);
}

function getAttackSprite(enemy: RunState['enemies'][number]): SpriteName {
  const artKey = getMonsterArtKey(
    enemy.speciesKey ?? speciesKeyForName(enemy.name),
    enemy.artKey ?? (enemy.boss ? 'boss' : undefined),
  );
  if (artKey === 'wolf') return 'wolf-attack';
  if (artKey === 'slime') return 'slime-attack';
  if (artKey === 'goblin') return 'goblin-attack';
  if (artKey === 'skeleton') return 'skeleton-attack';
  return 'boss-attack';
}

function eventStyle(durationMs: number): CSSProperties {
  return { '--combat-duration': `${durationMs}ms`, '--combat-hit-duration': `${Math.min(durationMs, 320)}ms` } as CSSProperties;
}

function traitSummary(
  traits: NonNullable<ReturnType<typeof getBestiaryEntry>>["resistances"],
  suffix: string,
) {
  if (traits.length === 0) return 'None';
  return traits.map(trait => (
    `${formatDamageType(trait.damageType)}${trait.nonmagicalOnly ? ' (nonmagical)' : ''} ${suffix}`
  )).join(' • ');
}

export function CombatOverlay({
  run,
  dispatch,
  speed = 1,
}: {
  run: RunState;
  dispatch: (action: GameAction) => void;
  speed?: number;
}) {
  const [visualEvents, setVisualEvents] = useState<VisualEvents>(EMPTY_EVENTS);
  const [damagePopups, setDamagePopups] = useState<DamagePopup[]>([]);
  const [displayRun, setDisplayRun] = useState<RunState | null>(null);
  const [completedHeroDrink, setCompletedHeroDrink] = useState(0);
  const [completedHeroFireBomb, setCompletedHeroFireBomb] = useState(0);
  const [completedHeroGuard, setCompletedHeroGuard] = useState(0);
  const [completedHeroHit, setCompletedHeroHit] = useState(0);
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [inspectedEnemyId, setInspectedEnemyId] = useState<string | null>(null);
  const [bagOpen, setBagOpen] = useState(false);
  const eventId = useRef(0);
  const previousSnapshot = useRef<CombatSnapshot | null>(null);
  const previousPhase = useRef<RunState['phase']>(run.phase);
  const latestCombatRun = useRef<RunState | null>(null);
  const enemyArchive = useRef<Record<string, RunState['enemies'][number]>>({});
  const popupTimers = useRef<number[]>([]);
  const reducedMotion = usePrefersReducedMotion();
  const [bossAnimating, setBossAnimating] = useState(false);
  const bossSequence = run.playerCombat?.enemyAttackSequence ?? 0;
  const priorBossSequence = useRef(bossSequence);
  useEffect(() => {
    const changed = bossSequence > priorBossSequence.current;
    priorBossSequence.current = bossSequence;
    const boss = run.enemies.find(enemy => enemy.boss);
    if (!changed || !boss || reducedMotion) {
      setBossAnimating(false);
      return;
    }
    setBossAnimating(true);
    const timer = window.setTimeout(() => setBossAnimating(false),
      (boss.lastBossAttack === 'fireball' ? 4200 : 1800) / Math.max(1, speed));
    return () => window.clearTimeout(timer);
  }, [bossSequence, reducedMotion, speed]);

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
      const activeEnemyIds = new Set(run.enemies.map(enemy => enemy.id));
      const deathExitDuration = latestCombatRun.current.enemies.reduce((duration, enemy) => (
        activeEnemyIds.has(enemy.id)
          ? duration
          : Math.max(duration, deathExitDurationMs(enemy, speed))
      ), EXIT_DURATION_MS / Math.max(MIN_COMBAT_SPEED, speed));
      setVisible(true);
      const timer = window.setTimeout(() => {
        setVisible(false);
        setLeaving(false);
        setDisplayRun(null);
      }, deathExitDuration);
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
        // Saved enemy-turn consumables have already been consumed by the
        // engine, but still need their visual replay after the overlay mounts.
        const restoredPotion = current.lastConsumable === 'health_potion'
          && run.combatTurn === 'enemy'
          && current.heroConsumableSequence > 0;
        const restoredFireBomb = current.lastConsumable === 'fire_bomb'
          && current.pendingFireBomb
          && run.combatTurn === 'enemy'
          && current.heroConsumableSequence > 0;
        const restoredGuard = current.lastConsumable === 'guard_tonic'
          && current.guardActive
          && run.combatTurn === 'enemy'
          && current.heroConsumableSequence > 0;
        setVisualEvents(
          restoredPotion || restoredFireBomb || restoredGuard
            ? {
                ...EMPTY_EVENTS,
                heroDrink: restoredPotion ? ++eventId.current : 0,
                heroFireBomb: restoredFireBomb ? ++eventId.current : 0,
                heroGuard: restoredGuard ? ++eventId.current : 0,
              }
            : EMPTY_EVENTS,
        );
        setDamagePopups([]);
      }
      return;
    }

    if (previous.phase !== 'combat') return;

    // Animations are driven by explicit reducer event counters and actual HP
    // deltas. Inspecting an enemy or selecting a stance cannot create either.
    const heroAttacked = current.playerAttackSequence > previous.playerAttackSequence;
    const heroDrankPotion = current.heroConsumableSequence > previous.heroConsumableSequence
      && current.lastConsumable === 'health_potion';
    const heroThrewFireBomb = current.heroConsumableSequence > previous.heroConsumableSequence
      && current.lastConsumable === 'fire_bomb';
    const heroGuarded = current.heroConsumableSequence > previous.heroConsumableSequence
      && current.lastConsumable === 'guard_tonic'
      && current.guardActive;
    const enemyResponded = current.enemyAttackSequence > previous.enemyAttackSequence;
    const heroWasHit = current.playerHp < previous.playerHp;
    const enemyUpdates: Array<{ id: string, kind: 'attack' | 'hit' | 'death' }> = [];
    const newPopups: DamagePopup[] = [];

    Object.values(current.enemies).forEach(enemy => {
      const oldEnemy = previous.enemies[enemy.id];
      if (!oldEnemy) return;

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

    if (enemyResponded) {
      Object.values(current.enemies).forEach(enemy => {
        if (enemy.hp > 0) enemyUpdates.push({ id: enemy.id, kind: 'attack' });
      });
    }

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

    if (heroAttacked || heroDrankPotion || heroThrewFireBomb || heroGuarded || heroWasHit || enemyUpdates.length > 0) {
      const heroAttackTrigger = heroAttacked ? ++eventId.current : 0;
      const heroDrinkTrigger = heroDrankPotion ? ++eventId.current : 0;
      const heroFireBombTrigger = heroThrewFireBomb ? ++eventId.current : 0;
      const heroGuardTrigger = heroGuarded ? ++eventId.current : 0;
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
          heroDrink: heroDrankPotion ? heroDrinkTrigger : existing.heroDrink,
          heroFireBomb: heroThrewFireBomb ? heroFireBombTrigger : existing.heroFireBomb,
          heroGuard: heroGuarded ? heroGuardTrigger : existing.heroGuard,
          heroHit: heroWasHit ? heroHitTrigger : existing.heroHit,
          heroLastAction: heroWasHit
            ? (heroAttacked ? 'attack' : 'hit')
            : (heroAttacked
              ? 'attack'
              : (heroDrankPotion ? 'drink' : (heroThrewFireBomb ? 'fire_bomb' : (heroGuarded ? 'guard' : existing.heroLastAction)))),
          enemies,
        };
      });

      enemyUpdates
        .filter(update => update.kind === 'death')
        .forEach(update => {
          const archivedEnemy = enemyArchive.current[update.id];
          const timer = window.setTimeout(() => {
            setVisualEvents(existing => {
              const event = existing.enemies[update.id];
              if (!event?.deathTrigger) return existing;
              const enemies = { ...existing.enemies };
              delete enemies[update.id];
              return { ...existing, enemies };
            });
          }, deathExitDurationMs(archivedEnemy, speed));
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
    run.playerCombat?.heroAttackSequence,
    run.playerCombat?.heroConsumableSequence,
    run.playerCombat?.lastConsumable,
    run.guardActive,
    run.playerCombat?.pendingFireBomb,
    run.playerCombat?.enemyAttackSequence,
    run.playerCombat?.roundCounter,
    speed,
  ]);

  const playerDrinkTrigger = visualEvents.heroDrink;
  const finishHeroDrink = useCallback(() => {
    setCompletedHeroDrink(playerDrinkTrigger);
  }, [playerDrinkTrigger]);
  const playerFireBombTrigger = visualEvents.heroFireBomb;
  const finishHeroFireBomb = useCallback(() => {
    setCompletedHeroFireBomb(playerFireBombTrigger);
  }, [playerFireBombTrigger]);
  const playerGuardTrigger = visualEvents.heroGuard;
  const finishHeroHit = useCallback(() => {
    setCompletedHeroHit(visualEvents.heroHit);
  }, [visualEvents.heroHit]);
  const finishHeroGuard = useCallback(() => {
    setCompletedHeroGuard(playerGuardTrigger);
  }, [playerGuardTrigger]);
  const renderedRun = run.phase === 'combat' ? run : displayRun;
  if (!visible || !renderedRun || !renderedRun.playerCombat) return null;
  const activeEnemyIds = new Set(renderedRun.enemies.map(enemy => enemy.id));
  const archivedDeaths = Object.values(enemyArchive.current).filter(enemy => (
    !activeEnemyIds.has(enemy.id) && visualEvents.enemies[enemy.id]?.deathTrigger
  ));
  const renderedEnemies = [...renderedRun.enemies, ...archivedDeaths];
  const inspectedEnemy = renderedEnemies.find(enemy => enemy.id === inspectedEnemyId);
  const inspectedEntry = inspectedEnemy
    ? getBestiaryEntry(inspectedEnemy.speciesKey ?? speciesKeyForName(inspectedEnemy.name))
    : undefined;

  const playerAttackTrigger = visualEvents.heroAttack;
  const playerHitTrigger = visualEvents.heroHit;
  const reactingToHit = playerHitTrigger > completedHeroHit
    && playerHitTrigger > Math.max(playerAttackTrigger, playerDrinkTrigger, playerFireBombTrigger, playerGuardTrigger)
    && !reducedMotion;
  const drinkingPotion = playerDrinkTrigger > 0
    && playerDrinkTrigger > completedHeroDrink
    && playerDrinkTrigger > Math.max(playerHitTrigger, playerAttackTrigger, playerFireBombTrigger, playerGuardTrigger)
    && !reducedMotion;
  const throwingFireBomb = playerFireBombTrigger > 0
    && playerFireBombTrigger > completedHeroFireBomb
    && playerFireBombTrigger > Math.max(playerHitTrigger, playerAttackTrigger, playerDrinkTrigger, playerGuardTrigger)
    && !reducedMotion;
  const guardingHero = playerGuardTrigger > 0
    && playerGuardTrigger > completedHeroGuard
    && playerGuardTrigger > Math.max(playerHitTrigger, playerAttackTrigger, playerDrinkTrigger, playerFireBombTrigger)
    && !reducedMotion
    && !bagOpen;
  const combatDuration = Math.max(180, 420 / Math.max(1, speed));
  const hitDuration = Math.max(160, 300 / Math.max(1, speed));
  const canInput = run.phase === 'combat' && run.combatTurn === 'player' && !leaving && !bossAnimating;
  const statusLabel = run.combatTurn === 'enemy' || bossAnimating ? 'Enemies turn' : 'Your turn';

  return (
    <div className={`absolute top-0 left-0 right-0 h-[82%] min-h-[620px] flex flex-col z-20 overflow-hidden pt-24 pb-4 ${leaving ? 'combat-overlay--leaving' : ''}`}>
      <div className="relative z-40 flex shrink-0 flex-col gap-2 px-3">
        <div className="flex items-center justify-between gap-2">
          <div className="bg-[var(--color-ui-purple)] text-white px-3 py-1 rounded-full font-black text-[10px] border-2 border-[#1c1c1c] shadow-[0_2px_0_#1c1c1c] uppercase tracking-wider">
            Floor {renderedRun.floor} • Round {renderedRun.playerCombat.roundCounter}
          </div>
          <div
            className={`pointer-events-none rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider border-2 shadow-sm ${
              canInput ? 'bg-emerald-100 text-emerald-900 border-emerald-600' : 'bg-slate-200 text-slate-700 border-slate-500'
            }`}
            role="status"
            aria-live="polite"
          >
            {statusLabel}{!canInput && run.combatTurn === 'enemy' ? ' • resolving…' : ''}
          </div>
        </div>

        <AttackStyleSelector run={run} dispatch={dispatch} compact disabled={!canInput} />

        {run.combatFeedback && (
          <div
            role="status"
            className={`rounded-full px-3 py-1 text-center text-[10px] font-black border-2 shadow-md ${
              run.combatFeedback.kind === 'immune'
                ? 'bg-slate-900 text-slate-100 border-slate-300'
                : run.combatFeedback.kind === 'resisted'
                  ? 'bg-amber-100 text-amber-900 border-amber-500'
                  : run.combatFeedback.kind === 'vulnerable'
                    ? 'bg-red-100 text-red-900 border-red-500'
                    : 'bg-white text-slate-800 border-[#1c1c1c]'
            }`}
          >
            {run.combatFeedback.message}
          </div>
        )}
      </div>

      {inspectedEnemy && (
        <div className="absolute top-[15rem] left-3 right-3 z-50 bg-white rounded-2xl border-4 border-[#1c1c1c] shadow-2xl p-3 text-slate-800">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-sm font-black">{inspectedEnemy.name}</div>
              <div className="text-[9px] font-bold uppercase tracking-wider text-purple-600">
                {inspectedEntry?.family ?? 'Unknown creature'}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setInspectedEnemyId(null)}
              aria-label="Close enemy details"
              className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-black"
            >
              Close
            </button>
          </div>
          {inspectedEntry ? (
            <>
              <p className="mt-1 text-[10px] font-semibold text-slate-600">{inspectedEntry.blurb}</p>
              <p className="mt-1 text-[10px] font-bold text-slate-700">Hint: {inspectedEntry.tactic}</p>
              <div className="mt-2 grid gap-1 text-[9px] font-black">
                <div className="rounded bg-amber-50 px-2 py-1 text-amber-900">
                  Resistance ½: {traitSummary(inspectedEntry.resistances, '½')}
                </div>
                <div className="rounded bg-red-50 px-2 py-1 text-red-900">
                  Vulnerability 2×: {traitSummary(inspectedEntry.vulnerabilities, '2×')}
                </div>
                <div className="rounded bg-slate-200 px-2 py-1 text-slate-900">
                  Immunity 0: {traitSummary(inspectedEntry.immunities, '0')}
                </div>
              </div>
            </>
          ) : (
            <p className="mt-1 text-[10px] font-bold text-slate-600">
              No known damage traits. This legacy/custom enemy remains neutral.
            </p>
          )}
        </div>
      )}

      <div className="flex-1 relative flex items-end justify-between px-6 pb-12">
        <BattleBackdrop enemies={renderedEnemies} boss={renderedRun.isBossCombat} />
        <div className="relative flex flex-col items-center">
          <div
            className={`combat-actor w-28 h-28 ${playerAttackTrigger > 0 ? 'combat-actor--attacking' : ''}`}
            style={eventStyle(combatDuration)}
          >
            <div className={`combat-actor__hit w-full h-full ${playerHitTrigger > 0 ? 'combat-actor__hit--flashing' : ''}`} style={{ '--combat-hit-duration': `${hitDuration}ms` } as CSSProperties}>
              <SpriteAnimator
                sprite={reactingToHit ? 'custom-hero-hit' : throwingFireBomb
                  ? 'custom-throw-firebomb'
                  : (drinkingPotion ? 'custom-drink-potion' : (guardingHero ? 'custom-guard-tonic' : 'custom-hero-idle'))}
                fallbackUrl={reactingToHit ? heroHitUrl : throwingFireBomb
                  ? throwFireBombUrl
                  : (drinkingPotion ? drinkPotionUrl : (guardingHero ? guardTonicUrl : heroUrl))}
                active
                loop={!reactingToHit && !throwingFireBomb && !drinkingPotion && !guardingHero}
                frameCount={reactingToHit ? 9 : (throwingFireBomb ? 13 : (drinkingPotion ? 9 : (guardingHero ? 13 : 9)))}
                durationMs={reactingToHit ? 1800 : (throwingFireBomb ? 2600 : (drinkingPotion ? 1800 : (guardingHero ? 2600 : 1800)))}
                trigger={reactingToHit ? playerHitTrigger : throwingFireBomb
                  ? playerFireBombTrigger
                  : (drinkingPotion ? playerDrinkTrigger : (guardingHero ? playerGuardTrigger : 0))}
                alt="Hero"
                className="combat-actor__sprite drop-shadow-xl"
                onAnimationEnd={reactingToHit ? finishHeroHit : throwingFireBomb
                  ? finishHeroFireBomb
                  : (drinkingPotion ? finishHeroDrink : (guardingHero ? finishHeroGuard : undefined))}
              />
            </div>
            {playerAttackTrigger > 0 && <span className="sword-arc" key={`arc-${playerAttackTrigger}`} aria-hidden="true" />}
            {damagePopups.filter(popup => popup.target === 'hero').map(popup => (
              <span className="damage-popup damage-popup--hero" key={popup.id}>-{popup.amount}</span>
            ))}
          </div>
          <div className="mt-2 w-20 h-4 bg-red-950 border-2 border-[#1c1c1c] rounded overflow-hidden relative shadow-sm">
            <div className="absolute inset-0 bg-red-500 origin-left transition-transform duration-200" style={{ transform: `scaleX(${Math.max(0, renderedRun.hp / Math.max(1, renderedRun.maxHp))})` }} />
            <div className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-white text-shadow-sm">
              {Math.floor(renderedRun.hp)}
            </div>
          </div>
        </div>

        <div className="relative flex items-end gap-2">
          {renderedEnemies.map(enemy => {
            const enemyEvent = visualEvents.enemies[enemy.id] ?? { attackTrigger: 0, hitTrigger: 0, deathTrigger: 0 };
            const isDying = enemyEvent.deathTrigger > 0;
            const customWolf = isCustomWolfEnemy(enemy);
            const enemySprite = getAttackSprite(enemy);
            return (
              <div
                key={`${enemy.id}-${enemyEvent.attackTrigger}-${enemyEvent.hitTrigger}-${enemyEvent.deathTrigger}`}
                className={`relative flex flex-col items-center ${isDying ? `combat-actor--dying${customWolf || isCustomGoblinEnemy(enemy) || isCustomOchreEnemy(enemy) || isCustomSkeletonEnemy(enemy) || isCustomMummyEnemy(enemy) || isCustomWinterWolfEnemy(enemy) || isCustomOgreEnemy(enemy) ? ' combat-actor--dying-custom-wolf' : ''}` : ''}`}
                style={{ ...eventStyle(combatDuration), '--combat-exit-duration': `${deathExitDurationMs(enemy, speed)}ms`,
                  ...(isDying && enemy.boss ? { animationName: 'dicebound-king-death-exit' } : {}),
                } as CSSProperties}
                onClick={() => !isDying && setInspectedEnemyId(enemy.id)}
                role="button"
                tabIndex={isDying ? -1 : 0}
                aria-label={`Inspect ${enemy.name}`}
                onKeyDown={event => {
                  if (!isDying && (event.key === 'Enter' || event.key === ' ')) {
                    event.preventDefault();
                    setInspectedEnemyId(enemy.id);
                  }
                }}
              >
                <div className={`combat-actor combat-actor--enemy ${enemy.boss ? 'w-40 h-40' : 'w-20 h-20'} ${enemyEvent.attackTrigger > 0 ? 'combat-actor--attacking' : ''}`}>
                  <div className={`combat-actor__hit w-full h-full ${enemyEvent.hitTrigger > 0 ? 'combat-actor__hit--flashing' : ''}`} style={{ '--combat-hit-duration': `${hitDuration}ms` } as CSSProperties}>
                    {enemy.boss ? (
                      <SkeletonKingSprite attackTrigger={enemyEvent.attackTrigger}
                        hitTrigger={enemyEvent.hitTrigger} dying={isDying}
                        speed={speed} attack={enemy.lastBossAttack} />
                    ) : customWolf ? (
                      <CustomWolfSprite
                        attackTrigger={enemyEvent.attackTrigger}
                        hitTrigger={enemyEvent.hitTrigger}
                        dying={isDying}
                        speed={speed}
                        name={enemy.name}
                      />
                    ) : enemySprite === 'slime-attack' ? (
                      <OchreJellySprite
                        attackTrigger={enemyEvent.attackTrigger}
                        hitTrigger={enemyEvent.hitTrigger}
                        dying={isDying}
                        speed={speed}
                      />
                    ) : isCustomWinterWolfEnemy(enemy) ? (
                      <CustomWinterWolfSprite
                        attackTrigger={enemyEvent.attackTrigger}
                        hitTrigger={enemyEvent.hitTrigger}
                        dying={isDying}
                        speed={speed}
                        name={enemy.name}
                      />
                    ) : enemySprite === 'wolf-attack' ? (
                      <WolfPixelSprite
                        attackTrigger={enemyEvent.attackTrigger}
                        hitTrigger={enemyEvent.hitTrigger}
                        dying={isDying}
                        speed={speed}
                        name={enemy.name}
                      />
                    ) : (enemy.speciesKey ?? speciesKeyForName(enemy.name)) === 'goblin' ? (
                      <CustomGoblinSprite
                        attackTrigger={enemyEvent.attackTrigger}
                        hitTrigger={enemyEvent.hitTrigger}
                        dying={isDying}
                        speed={speed}
                        name={enemy.name}
                      />
                    ) : isCustomSkeletonEnemy(enemy) ? (
                      <CustomSkeletonSprite
                        attackTrigger={enemyEvent.attackTrigger}
                        hitTrigger={enemyEvent.hitTrigger}
                        dying={isDying}
                        speed={speed}
                        name={enemy.name}
                      />
                    ) : isCustomMummyEnemy(enemy) ? (
                      <CustomMummySprite
                        attackTrigger={enemyEvent.attackTrigger}
                        hitTrigger={enemyEvent.hitTrigger}
                        dying={isDying}
                        speed={speed}
                        name={enemy.name}
                      />
                    ) : isCustomOgreEnemy(enemy) ? (
                      <CustomOgreSprite
                        attackTrigger={enemyEvent.attackTrigger}
                        hitTrigger={enemyEvent.hitTrigger}
                        dying={isDying}
                        speed={speed}
                        name={enemy.name}
                      />
                    ) : <SpriteAnimator
                      sprite={enemySprite}
                      fallbackUrl={getMonsterImage(enemy)}
                      active={enemyEvent.attackTrigger > 0}
                      trigger={enemyEvent.attackTrigger}
                      fps={14}
                      durationMs={combatDuration}
                      flip
                      alt={enemy.name}
                      className="combat-actor__sprite drop-shadow-xl"
                    />}
                  </div>
                </div>
                <div className="text-[9px] font-black text-white bg-black/60 px-1 rounded absolute -top-4">{enemy.name}</div>
                {damagePopups.filter(popup => popup.target === 'enemy' && popup.enemyId === enemy.id).map(popup => (
                  <span className="damage-popup" key={popup.id}>-{popup.amount}</span>
                ))}
                <div className="mt-2 w-16 h-3 bg-red-950 border-2 border-[#1c1c1c] rounded overflow-hidden relative shadow-sm">
                   <div className="absolute inset-0 bg-red-500 origin-left transition-transform duration-200" style={{ transform: `scaleX(${Math.max(0, Math.max(0, enemy.hp) / Math.max(1, enemy.maxHp))})` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {bagOpen && (
        <div className="absolute bottom-[4.5rem] left-3 right-3 z-50 rounded-2xl border-4 border-[#1c1c1c] bg-white p-3 text-slate-800 shadow-2xl">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs font-black uppercase tracking-wider">Consumables</div>
            <button
              type="button"
              onClick={() => setBagOpen(false)}
              className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-black"
            >
              Close
            </button>
          </div>
          <div className="grid gap-2">
            {([
              {
                id: 'health_potion' as const,
                name: 'Health Potion',
                description: 'Restore 40% max HP (capped at full health).',
                count: run.consumables.health_potion,
                icon: Heart,
                color: 'text-rose-500',
                disabled: !canInput || run.consumables.health_potion <= 0 || run.hp >= run.maxHp,
              },
              {
                id: 'fire_bomb' as const,
                name: 'Fire Bomb',
                description: 'Fire damage to every living enemy.',
                count: run.consumables.fire_bomb,
                icon: Flame,
                color: 'text-orange-500',
                disabled: !canInput || run.consumables.fire_bomb <= 0,
              },
              {
                id: 'guard_tonic' as const,
                name: 'Guard Tonic',
                description: 'Halve damage from the next enemy response.',
                count: run.consumables.guard_tonic,
                icon: Shield,
                color: 'text-sky-500',
                disabled: !canInput || run.consumables.guard_tonic <= 0,
              },
            ]).map(item => {
              const Icon = item.icon;
              return (
                <button
                  type="button"
                  key={item.id}
                  disabled={item.disabled}
                  onClick={() => {
                    dispatch({ type: 'USE_CONSUMABLE', consumable: item.id });
                    setBagOpen(false);
                  }}
                  className="flex items-center gap-2 rounded-xl border-2 border-slate-200 bg-slate-50 p-2 text-left transition active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Icon className={`h-5 w-5 shrink-0 ${item.color}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] font-black">{item.name} <span className="text-slate-500">×{item.count}</span></span>
                    <span className="block text-[9px] font-semibold text-slate-500">{item.description}</span>
                  </span>
                  <span className="rounded-lg bg-white px-2 py-1 text-[9px] font-black shadow-sm">Use</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="relative z-40 flex shrink-0 gap-2 px-3 pt-2">
        <button
          type="button"
          disabled={!canInput || renderedEnemies.every(enemy => enemy.hp <= 0)}
          onClick={() => dispatch({ type: 'PLAYER_ATTACK' })}
          className="flex-1 rounded-2xl border-4 border-[#1c1c1c] bg-amber-400 py-3 text-base font-black uppercase text-slate-950 shadow-[0_4px_0_#1c1c1c] transition active:translate-y-1 active:shadow-none disabled:cursor-not-allowed disabled:opacity-50 disabled:active:translate-y-0 disabled:active:shadow-[0_4px_0_#1c1c1c]"
        >
          <Sword className="mr-1 inline h-5 w-5" /> Attack
        </button>
        <button
          type="button"
          aria-expanded={bagOpen}
          disabled={!canInput}
          onClick={() => setBagOpen(open => !open)}
          className="rounded-2xl border-4 border-[#1c1c1c] bg-white px-4 py-3 font-black text-slate-800 shadow-[0_4px_0_#1c1c1c] transition active:translate-y-1 active:shadow-none disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Backpack className="inline h-5 w-5" />
          <span className="ml-1 text-xs">Bag</span>
        </button>
      </div>
    </div>
  );
}