import type { BossId } from '../level-content';
import { getBossMovePresentation } from '../level-content';
import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import ashenKnightAsset from '../assets/boss-placeholders/ashen-knight.svg';
import grubgutIdle from '../assets/bosses/grubgut/idle.gif';
import grubgutClubAttack from '../assets/bosses/grubgut/club-attack.gif';
import grubgutPoisonBreath from '../assets/bosses/grubgut/poison-breath.gif';
import grubgutHit from '../assets/bosses/grubgut/hit.gif';
import grubgutDeath from '../assets/bosses/grubgut/death.gif';
import silkmawIdle from '../assets/bosses/silkmaw/idle.gif';
import silkmawDescent from '../assets/bosses/silkmaw/descent.gif';
import silkmawPoisonAttack from '../assets/bosses/silkmaw/poison-attack.gif';
import silkmawWebAttack from '../assets/bosses/silkmaw/web-attack.gif';
import silkmawHit from '../assets/bosses/silkmaw/hit.gif';
import silkmawDeath from '../assets/bosses/silkmaw/death.gif';
import './new-boss-placeholder.css';

export type PlaceholderBossId = Exclude<BossId, 'skeleton-king'>;

/**
 * Single replacement point for the three user-uploaded boss GIFs.
 * Replace only the values in this map when the final transparent GIFs arrive.
 */
export const BOSS_PLACEHOLDER_ASSETS: Record<PlaceholderBossId, string> = {
  grubgut: grubgutIdle,
  silkmaw: silkmawIdle,
  cinder: ashenKnightAsset,
};

export const BOSS_ASSET_GUIDE: Record<PlaceholderBossId, string> = {
  grubgut: 'Grubgut uses transparent idle, club attack, poison breath, hit, and death GIFs.',
  silkmaw: 'Lady Silkmaw uses transparent entrance, idle, poison, web, hit, and death GIFs.',
  cinder: 'Replace with the transparent Sir Cinder armored knight GIF (ember sword frames included).',
};

const BOSS_LABELS: Record<PlaceholderBossId, string> = {
  grubgut: 'Grubgut, the Troll King',
  silkmaw: 'Lady Silkmaw, the Spider Queen',
  cinder: 'Sir Cinder, the Ashen Knight',
};

function getBossActionAsset(
  bossId: PlaceholderBossId,
  action: 'idle' | 'attack' | 'hit' | 'death',
  movePresentation?: ReturnType<typeof getBossMovePresentation>,
  showingEntrance = false,
) {
  if (bossId === 'grubgut') {
    if (action === 'death') return grubgutDeath;
    if (action === 'hit') return grubgutHit;
    if (action === 'attack') {
      return movePresentation?.label === 'Swamp Belch' ? grubgutPoisonBreath : grubgutClubAttack;
    }
    return grubgutIdle;
  }
  if (bossId === 'silkmaw') {
    if (showingEntrance) return silkmawDescent;
    if (action === 'death') return silkmawDeath;
    if (action === 'hit') return silkmawHit;
    if (action === 'attack') {
      if (movePresentation?.label === 'Venom Lunge') return silkmawPoisonAttack;
      if (movePresentation?.label === 'Royal Web') return silkmawWebAttack;
    }
    return silkmawIdle;
  }
  return BOSS_PLACEHOLDER_ASSETS[bossId];
}

export const NEW_BOSS_DEATH_EXIT_MS = 1800;

export function getBossPlaceholderAsset(bossId: BossId | null | undefined) {
  return bossId && bossId !== 'skeleton-king' ? BOSS_PLACEHOLDER_ASSETS[bossId] : undefined;
}

export function NewBossPlaceholder({
  bossId,
  attackTrigger = 0,
  hitTrigger = 0,
  dying = false,
  speed = 1,
  movePresentation,
  mode = 'combat',
  showPlaceholderLabel = false,
}: {
  bossId: PlaceholderBossId;
  attackTrigger?: number;
  hitTrigger?: number;
  dying?: boolean;
  speed?: number;
  movePresentation?: ReturnType<typeof getBossMovePresentation>;
  mode?: 'combat' | 'platform';
  showPlaceholderLabel?: boolean;
}) {
  const latestEvent = Math.max(attackTrigger, hitTrigger);
  const [completedEvent, setCompletedEvent] = useState(0);
  const [entranceComplete, setEntranceComplete] = useState(false);
  useEffect(() => {
    if (dying) return;
    // A restored combat snapshot can contain an already-completed event.
    // Keep the next reducer counter as the only trigger for a new action.
    setCompletedEvent(current => Math.min(current, latestEvent));
  }, [dying, latestEvent]);
  useEffect(() => {
    if (bossId !== 'silkmaw' || mode !== 'combat' || latestEvent > 0) {
      setEntranceComplete(true);
      return;
    }
    setEntranceComplete(false);
    const timeout = window.setTimeout(() => setEntranceComplete(true), 4000 / Math.max(1, speed));
    return () => window.clearTimeout(timeout);
  }, [bossId, latestEvent, mode, speed]);
  const activeAttack = attackTrigger > completedEvent && attackTrigger >= hitTrigger;
  const activeHit = hitTrigger > completedEvent && hitTrigger > attackTrigger;
  const action = dying
    ? 'death'
    : activeHit
      ? 'hit'
      : activeAttack
        ? 'attack'
        : 'idle';
  const showingEntrance = bossId === 'silkmaw' && mode === 'combat' && latestEvent === 0 && !entranceComplete;
  const asset = getBossActionAsset(bossId, action, movePresentation, showingEntrance);
  const moveKind = movePresentation?.kind ?? 'melee';
  const moveDuration = (movePresentation?.durationMs ?? 1800) / Math.max(1, speed);
  const completeVisualEvent = () => {
    if (action === 'attack' || action === 'hit') setCompletedEvent(latestEvent);
  };
  return (
    <div
      className={`new-boss-placeholder new-boss-placeholder--${mode} new-boss-placeholder--${action} new-boss-placeholder--${moveKind}`}
      style={{
        '--boss-animation-speed': Math.max(1, speed),
        '--boss-move-duration': `${moveDuration}ms`,
        '--boss-hit-duration': `${bossId === 'grubgut' ? 3400 : bossId === 'silkmaw' ? 2600 : 360}ms`,
        '--boss-death-duration': `${bossId === 'grubgut' ? 2600 : bossId === 'silkmaw' ? 4200 : 1800}ms`,
      } as CSSProperties}
      data-boss-placeholder={bossId}
      data-boss-action={action}
      data-boss-move={movePresentation?.label ?? 'Sword Strike'}
    >
      <div
        className="new-boss-placeholder__art"
        key={`${action}-${latestEvent}`}
        onAnimationEnd={completeVisualEvent}
      >
        <img
          src={asset}
          alt={bossId === 'cinder' ? `${BOSS_LABELS[bossId]} art placeholder` : BOSS_LABELS[bossId]}
          draggable={false}
        />
      </div>
      {action === 'attack' && movePresentation && (
        <span className={`new-boss-placeholder__move-label new-boss-placeholder__move-label--${moveKind}`}>
          {movePresentation.label}
        </span>
      )}
      {showPlaceholderLabel && (
        <span className="new-boss-placeholder__badge">ART PLACEHOLDER · GIF SLOT</span>
      )}
    </div>
  );
}