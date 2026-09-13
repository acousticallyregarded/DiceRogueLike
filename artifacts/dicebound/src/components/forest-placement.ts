import { TILE_HEIGHT, TILE_WIDTH } from './TrailMath';

export type ForestProp = { x: number; y: number; width: number; height: number };
type Point = { x: number; y: number };
type Rect = { left: number; right: number; top: number; bottom: number };

function bounds(p: ForestProp): Rect {
  return { left: p.x - p.width / 2, right: p.x + p.width / 2, top: p.y - p.height, bottom: p.y };
}
function overlaps(a: Rect, b: Rect) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}
export function blocksTrail(prop: ForestProp, path: Point[]): boolean {
  const footprint = bounds(prop);
  if (path.some(p => overlaps(footprint, {
    left: p.x - TILE_WIDTH / 2 - 10, right: p.x + TILE_WIDTH / 2 + 10,
    top: p.y - TILE_HEIGHT / 2 - 10, bottom: p.y + TILE_HEIGHT / 2 + 24,
  }))) return true;
  const end = path.at(-1);
  return Boolean(end && overlaps(footprint, {
    left: end.x - 112, right: end.x + 112, top: end.y - 245, bottom: end.y + 50,
  }));
}

/** Preserve unobstructed scenery; relocate full sprites, not just their roots. */
export function relocateForestProps<T extends ForestProp>(props: T[], path: Point[]): T[] {
  const settled = props.filter(p => !blocksTrail(p, path));
  const blocked = props.filter(p => blocksTrail(p, path));
  for (const prop of blocked) {
    let best: T | undefined;
    let bestScore = Infinity;
    // Search nearby gaps first. Larger rings guarantee room without deleting
    // assets or packing them onto another part of the trail.
    for (let radius = 80; radius <= 1600; radius += 80) {
      for (let direction = 0; direction < 24; direction++) {
        const angle = direction * Math.PI / 12;
        const candidate = { ...prop, x: prop.x + Math.cos(angle) * radius, y: prop.y + Math.sin(angle) * radius };
        if (blocksTrail(candidate, path)) continue;
        const footprint = bounds(candidate);
        const padded = { left: footprint.left - 8, right: footprint.right + 8, top: footprint.top - 8, bottom: footprint.bottom + 8 };
        if (settled.some(p => overlaps(padded, bounds(p)))) continue;
        const centerY = candidate.y - candidate.height / 2;
        const density = settled.reduce((sum, p) => {
          const distance = Math.hypot(candidate.x - p.x, centerY - (p.y - p.height / 2));
          return sum + Math.max(0, 240 - distance) / 240;
        }, 0);
        const score = density + radius / 400;
        if (score < bestScore) { best = candidate; bestScore = score; }
      }
      if (best && radius >= 320) break;
    }
    if (!best) throw new Error('No clear forest placement found for an obstructing prop');
    settled.push(best);
  }
  return settled.sort((a, b) => a.y - b.y);
}