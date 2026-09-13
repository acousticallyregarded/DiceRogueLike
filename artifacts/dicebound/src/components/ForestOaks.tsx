import treeUrl from '../assets/tree.png';
import { riverX } from './ForestRiver';

const propUrls = Object.entries(import.meta.glob('../assets/forest/*.webp', {
  eager: true, query: '?url', import: 'default',
})).sort(([a], [b]) => a.localeCompare(b));

type SceneryBounds = { x: number; y: number; width: number; height: number };

function clearsWalls(item: SceneryBounds) {
  // Entire image bounds must clear the diamond and its downward wall extrusion.
  const nearestX = Math.max(0, Math.abs(item.x) - item.width / 2);
  const nearestY = Math.max(0, item.y - item.height - 120, -item.y);
  const clearsRiver = Math.abs(item.x - riverX(item.y)) > item.width / 2 + 44;
  return nearestX + nearestY * 2 > 320 && clearsRiver;
}

// Stable placements: never reshuffle the forest when the hero takes a step.
const OAKS = Array.from({ length: 9 }, (_, row) =>
  Array.from({ length: 7 }, (_, column) => {
    const seed = row * 17 + column * 31;
    const x = (column - 3) * 128 + (row % 2 ? 40 : -20) + (seed % 29);
    const y = (row - 4) * 120 + (seed % 37);
    const height = 108 + seed % 49;
    return { x, y, height, width: height * 0.84, flip: seed % 3 === 0, src: treeUrl };
  }),
).flat().filter(clearsWalls);

const PROPS = Array.from({ length: 80 }, (_, index) => {
  const row = Math.floor(index / 8);
  const column = index % 8;
  const [path, src] = propUrls[index % propUrls.length];
  const size = path.includes('bush') ? 42 + index % 21 : 48 + index % 29;
  return {
    x: (column - 3.5) * 115 + (row % 2 ? 25 : -15) + index % 19,
    y: (row - 4.5) * 103 + 55 + index % 23,
    width: size, height: size, src: src as string, flip: index % 2 === 0,
  };
}).filter(clearsWalls).filter(prop =>
  OAKS.every(tree => Math.hypot(tree.x - prop.x, tree.y - prop.y) > 38),
);

const SCENERY = [...OAKS, ...PROPS].sort((a, b) => a.y - b.y);

export function ForestOaks() {
  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 0 }} aria-hidden="true">
      {SCENERY.map((tree, index) => (
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