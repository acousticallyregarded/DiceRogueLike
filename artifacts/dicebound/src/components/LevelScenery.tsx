import forestClearingUrl from '../assets/forest-clearing.webp';
import { getLevelDefinition } from '../level-content';
import './level-scenery.css';

/**
 * A lightweight environment layer for the board camera. Floor one intentionally
 * keeps the established forest clearing untouched; later floors use the same
 * safe forest art only as a faint texture under a different CSS-painted biome.
 */
export function LevelScenery({ floor }: { floor: number }) {
  const level = getLevelDefinition(floor);
  return (
    <div className={`level-scenery level-scenery--${level.biome}`} aria-hidden="true">
      <div
        className="level-scenery__forest-texture"
        style={{ backgroundImage: `url(${forestClearingUrl})` }}
      />
      <div className="level-scenery__mist" />
      <div className="level-scenery__landmark">
        <span className="level-scenery__landmark-detail" />
        <span className="level-scenery__landmark-detail" />
        <span className="level-scenery__landmark-detail" />
      </div>
      <div className="level-scenery__caption">
        <strong>{level.name}</strong>
        <span>{level.description}</span>
      </div>
    </div>
  );
}