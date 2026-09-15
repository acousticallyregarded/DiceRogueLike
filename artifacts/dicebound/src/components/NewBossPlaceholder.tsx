import type { BossId } from '../level-content';
import { getBossMovePresentation } from '../level-content';
import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import grubgutAsset from '../assets/boss-placeholders/grubgut-troll.svg';
import silkmawAsset from '../assets/boss-placeholders/silkmaw-spider.svg';
import ashenKnightAsset from '../assets/boss-placeholders/ashen-knight.svg';
import './new-boss-placeholder.css';

export type PlaceholderBossId = Exclude<BossId, 'skeleton-king'>;

/**
 * Single replacement point for the three user-uploaded boss GIFs.
 * Replace only the values in this map when the final transparent GIFs arrive.
 */
export const BOSS_PLACEHOLDER_ASSETS: Record<PlaceholderBossId, string> = {
  grubgut: grubgutAsset,
  silkmaw: silkmawAsset,
  cinder: ashenKnightAsset,
};

export const BOSS_ASSET_GUIDE: Record<PlaceholderBossId, string> = {
  grubgut: 'Replace with the transparent Grubgut troll GIF (club attack frames included).',
  silkmaw: 'Replace with the transparent Lady Silkmaw spider GIF (web attack frames included).',
  cinder: 'Replace with the transparent Sir Cinder armored knight GIF (ember sword frames included).',
};

const BOSS_LABELS: Record<PlaceholderBossId, string> = {
  grubgut: 'Grubgut, the Troll King',
  silkmaw: 'Lady Silkmaw, the Spider Queen',
  cinder: 'Sir Cinder, the Ashen Knight',
};

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
  useEffect(() => {
    if (dying) return;
    // A restored combat snapshot can contain an already-completed event.
    // Keep the next reducer counter as the only trigger for a new action.
    setCompletedEvent(current => Math.min(current, latestEvent));
  }, [dying, latestEvent]);
  const activeAttack = attackTrigger > completedEvent && attackTrigger >= hitTrigger;
  const activeHit = hitTrigger > completedEvent && hitTrigger > attackTrigger;
  const action = dying
    ? 'death'
    : activeHit
      ? 'hit'
      : activeAttack
        ? 'attack'
        : 'idle';
  const asset = BOSS_PLACEHOLDER_ASSETS[bossId];
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
          alt={`${BOSS_LABELS[bossId]} art placeholder`}
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