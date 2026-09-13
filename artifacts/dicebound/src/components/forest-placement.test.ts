import assert from 'node:assert/strict';
import { blocksTrail, relocateForestProps } from './forest-placement';
import { getTilePosition } from './TrailMath';

const path = Array.from({ length: 64 }, (_, i) => getTilePosition(i));
const props = path.flatMap((p, i) => [
  { id: `tree-${i}`, x: p.x, y: p.y + 100, width: 120, height: 150 },
  { id: `rock-${i}`, x: p.x + 35, y: p.y + 15, width: 60, height: 60 },
]);
const safe = { id: 'unchanged', x: -900, y: -900, width: 90, height: 120 };
props.push(safe);
assert.equal(blocksTrail(props[0], path), true, 'canopy collision counts even when roots clear the tile');
const moved = relocateForestProps(props, path);
assert.equal(moved.length, props.length, 'no assets deleted');
assert.equal(new Set(moved.map(p => p.id)).size, props.length);
assert.ok(moved.every(p => !blocksTrail(p, path)), 'full images clear every tile and boss platform');
assert.deepEqual(moved.find(p => p.id === safe.id), safe, 'safe existing placement is preserved');
assert.deepEqual(relocateForestProps(props, path), moved, 'placements are stable across reloads');
console.log('Forest relocation assertions passed.');