import pedestalUrl from '../assets/center-pedestal.png';
import type { PlaceholderBossId } from './NewBossPlaceholder';
import { NewBossPlaceholder } from './NewBossPlaceholder';
import { getLevelDefinition } from '../level-content';
import './boss-platform.css';

export function BossPlatform({
  floor,
  rollsLeft,
  ready,
  alert,
}: {
  floor: number;
  rollsLeft: number;
  ready: boolean;
  alert?: boolean;
}) {
  const level = getLevelDefinition(floor);
  const bossId = level.boss.id as PlaceholderBossId;
  const isAlert = alert ?? rollsLeft <= 10;
  return (
    <div className={`boss-platform boss-platform--${level.biome}`} data-boss-platform={bossId}>
      <div className="boss-platform__landmark" />
      <img
        src={pedestalUrl}
        alt={`${level.boss.arena} platform`}
        draggable={false}
        className="boss-platform__pedestal"
      />
      <div className={`boss-platform__boss ${ready || isAlert ? 'boss-platform__boss--visible' : ''}`}>
        <NewBossPlaceholder bossId={bossId} mode="platform" />
      </div>
      <div className="boss-platform__name">
        <strong>{level.boss.name}</strong>
        <span>{level.boss.arena}</span>
      </div>
      <div className="boss-platform__runes" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}