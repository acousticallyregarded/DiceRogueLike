import treeUrl from '../assets/tree.png';
import { getTilePosition, normalizeTileIndex } from './TrailMath';

const propUrls = Object.entries(import.meta.glob('../assets/forest/*.webp', {
  eager: true, query: '?url', import: 'default',
})).sort(([a], [b]) => a.localeCompare(b));

type SceneryBounds = { x: number; y: number; width: number; height: number; src: string; flip?: boolean };

// Stable placement: we derive scenery directly from the trail geometry.
// We'll walk along the 64 path indices and scatter trees safely away from the path.
const SCENERY: SceneryBounds[] = [];

// Pre-calculate path points for distance checking
const pathPoints = Array.from({ length: 64 }, (_, i) => getTilePosition(i));

function clearsPath(px: number, py: number, radius: number = 80) {
  for (const pt of pathPoints) {
    // Distance from the path point center to the prop center
    // We adjust Y by 21 because the path tile center visually sits lower
    const dist = Math.hypot(pt.x - px, (pt.y - 21) - py);
    if (dist < radius) return false;
  }
  return true;
}

// Generate a dense forest covering the general area of the trail
// The trail goes from (0,0) to something like (-30, -30) in grid coords
// We'll just define a broad bounding box and generate points.
let minX = 0, maxX = 0, minY = 0, maxY = 0;
for (const p of pathPoints) {
  minX = Math.min(minX, p.x);
  maxX = Math.max(maxX, p.x);
  minY = Math.min(minY, p.y);
  maxY = Math.max(maxY, p.y);
}

// Expand bounds to fill edges
minX -= 600;
maxX += 600;
minY -= 600;
maxY += 600;

// Deterministic scatter
let seed = 12345;
function random() {
  seed = (seed * 9301 + 49297) % 233280;
  return seed / 233280;
}

const numTrees = 200;
const numProps = 150;

for (let i = 0; i < numTrees; i++) {
  const x = minX + random() * (maxX - minX);
  const y = minY + random() * (maxY - minY);
  if (clearsPath(x, y, 100)) {
    const height = 108 + Math.floor(random() * 49);
    SCENERY.push({ x, y, width: height * 0.84, height, src: treeUrl, flip: random() > 0.5 });
  }
}

for (let i = 0; i < numProps; i++) {
  const x = minX + random() * (maxX - minX);
  const y = minY + random() * (maxY - minY);
  if (clearsPath(x, y, 70)) {
    const path = propUrls[i % propUrls.length][0];
    const src = propUrls[i % propUrls.length][1] as string;
    const size = path.includes('bush') ? 42 + Math.floor(random() * 21) : 48 + Math.floor(random() * 29);
    SCENERY.push({ x, y, width: size, height: size, src, flip: random() > 0.5 });
  }
}

SCENERY.sort((a, b) => a.y - b.y);

export function ForestOaks({ cameraTargetY = 0 }: { cameraTargetY?: number }) {
  // Simple culling: only render props that are roughly visible.
  // The screen is ~1000px high max, so +/- 800 from cameraTargetY is safe.
  const visibleScenery = SCENERY.filter(t => Math.abs(t.y - cameraTargetY) < 1000);

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 0 }} aria-hidden="true">
      {visibleScenery.map((tree, index) => (
        <img key={index} src={tree.src} alt="" draggable={false}
          className="absolute max-w-none object-contain drop-shadow-xl"
          style={{
            width: tree.width, height: tree.height,
            left: tree.x - tree.width / 2, top: tree.y - tree.height,
            transform: tree.flip ? 'scaleX(-1)' : undefined,
          }} />
      ))}
    </div>
  );
}
