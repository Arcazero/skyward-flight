// terrain.js — the world Skyward Flight flies over.
// A deterministic heightfield: rolling hills, a mountain rim, a lake with
// an island strip, two flattened runways, and the ring courses that hang
// above it. Everything here is a pure function of (x, z).

import { fbm, hash2, clamp, lerp, smoothstep } from './random.js';
import { WORLD, RUNWAYS } from './config.js';

const HALF = WORLD.halfSize;
const CELL = WORLD.cellSize;
const GRID_N = Math.round((HALF * 2) / CELL); // 120 cells across

// Raw rolling terrain before any runway is carved into it.
export function baseHeight(x, z) {
  const d = Math.hypot(x, z) / HALF; // 0 at the field, 1 at the map edge
  const hills = fbm(x * 0.0016 + 7.3, z * 0.0016 + 2.9, 4);
  const ridge = fbm(x * 0.00062 + 13.1, z * 0.00062 + 4.7, 3);
  let h = hills * 58 + Math.pow(Math.max(0, ridge - 0.55), 2) * 1050;
  h += d * d * 150; // the mountain rim that closes the horizon
  // The lake basin in the north-east, deep enough to hold water.
  const ld = Math.hypot(x - 1900, z + 1500) / 950;
  h -= Math.max(0, 1 - ld) * 46;
  // A long valley running south-west to north-east, the scenic route home.
  const valley = Math.abs((x - z) * 0.5) / 900;
  h -= Math.max(0, 1 - valley) * 14;
  return h;
}

// Blend the terrain toward a runway's elevation inside its rectangle,
// feathered out over the runway's flatten margin. A runway's heading is
// the direction its strip runs: along = (sin h, cos h), across = (cos h, -sin h).
function runwayFrame(r, x, z) {
  const c = Math.cos(r.heading), s = Math.sin(r.heading);
  const dx = x - r.cx, dz = z - r.cz;
  return { u: dx * s + dz * c, v: dx * c - dz * s };
}

export function nearRunway(x, z, pad) {
  for (const r of RUNWAYS) {
    const { u, v } = runwayFrame(r, x, z);
    if (Math.abs(u) <= r.halfLength + pad && Math.abs(v) <= r.halfWidth + pad) return r;
  }
  return null;
}

function flattenForRunway(h, x, z, r) {
  const { u, v } = runwayFrame(r, x, z);
  const du = Math.max(0, Math.abs(u) - r.halfLength);
  const dv = Math.max(0, Math.abs(v) - r.halfWidth);
  const outside = Math.hypot(du, dv);
  const t = 1 - smoothstep(0, r.flattenMargin, outside);
  return lerp(h, r.elevation, t);
}

export function heightAt(x, z) {
  let h = baseHeight(x, z);
  for (const r of RUNWAYS) h = flattenForRunway(h, x, z, r);
  return h;
}

// Which runway, if any, is the point (x, z) sitting on?
export function runwayAt(x, z) {
  return nearRunway(x, z, 0);
}

// ---------------------------------------------------------------------------
// Precomputed vertex grid: heights, colours and a cheap slope estimate.
// The renderer reads these arrays; it never calls heightAt per frame.
// ---------------------------------------------------------------------------

export const gridCount = GRID_N + 1; // vertices per side
export const gridHeights = new Float32Array(gridCount * gridCount);
export const gridColors = new Uint8Array(gridCount * gridCount * 3);

function terrainColor(x, z, h, slope) {
  // slope: 0 flat .. 1 cliff, from a finite difference.
  if (h < WORLD.waterLevel + 0.6) return [52, 118, 158]; // lake water
  if (h < WORLD.waterLevel + 3.5) return [198, 178, 128]; // beach sand
  const n = hash2(Math.round(x / 7), Math.round(z / 7)); // patch variation
  const vary = 0.94 + n * 0.12;
  if (h > 205) return [232, 236, 240]; // snow caps
  if (slope > 0.55 || h > 165) {
    return [Math.round(122 * vary), Math.round(110 * vary), Math.round(96 * vary)];
  }
  if (h < 70) return [Math.round(96 * vary), Math.round(138 * vary), Math.round(66 * vary)];
  return [Math.round(74 * vary), Math.round(110 * vary), Math.round(58 * vary)];
}

for (let iz = 0; iz < gridCount; iz++) {
  for (let ix = 0; ix < gridCount; ix++) {
    const x = -HALF + ix * CELL;
    const z = -HALF + iz * CELL;
    const h = heightAt(x, z);
    gridHeights[iz * gridCount + ix] = h;
    const hx = heightAt(x + CELL, z) - heightAt(x - CELL, z);
    const hz = heightAt(x, z + CELL) - heightAt(x, z - CELL);
    const slope = clamp(Math.hypot(hx, hz) / (2 * CELL) / 0.9, 0, 1);
    const col = terrainColor(x, z, h, slope);
    const o = (iz * gridCount + ix) * 3;
    gridColors[o] = col[0];
    gridColors[o + 1] = col[1];
    gridColors[o + 2] = col[2];
  }
}

export function gridHeightAt(ix, iz) {
  const cx = clamp(ix, 0, gridCount - 1);
  const cz = clamp(iz, 0, gridCount - 1);
  return gridHeights[cz * gridCount + cx];
}

// ---------------------------------------------------------------------------
// Trees: deterministic placement, one hash per cell, only on friendly ground.
// ---------------------------------------------------------------------------

export const TREES = [];
{
  for (let ix = 0; ix < GRID_N; ix++) {
    for (let iz = 0; iz < GRID_N; iz++) {
      const r = hash2(ix * 3 + 11, iz * 5 + 7);
      if (r > 0.16) continue; // sparse on purpose: a tree every ~6 cells
      const x = -HALF + (ix + hash2(ix, iz * 2 + 1)) * CELL;
      const z = -HALF + (iz + hash2(ix * 2 + 3, iz)) * CELL;
      const h = heightAt(x, z);
      if (h < WORLD.waterLevel + 4 || h > 130) continue;
      if (nearRunway(x, z, 45)) continue; // keep the strips and their approaches clear
      TREES.push({
        x, z, y: h,
        size: 9 + hash2(ix + 31, iz + 17) * 11,
        shade: 0.75 + hash2(ix + 51, iz + 29) * 0.5,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Clouds: soft billboards that drift slowly and wrap around the map.
// ---------------------------------------------------------------------------

export const CLOUDS = [];
{
  for (let i = 0; i < 26; i++) {
    const a = hash2(i * 7 + 2, 5);
    const b = hash2(i * 3 + 9, 13);
    CLOUDS.push({
      x: -HALF + a * HALF * 2,
      z: -HALF + b * HALF * 2,
      y: 330 + hash2(i, 21) * 220,
      scale: 90 + hash2(i + 40, 3) * 150,
      drift: 1.5 + hash2(i, 77) * 2.5,
      puffs: 3 + Math.floor(hash2(i + 8, 8) * 3),
    });
  }
}

// ---------------------------------------------------------------------------
// Rings: a course is a list of glowing hoops. Each ring faces the next one.
// ---------------------------------------------------------------------------

export function buildRings(course) {
  const rings = [];
  const pts = course.rings;
  for (let i = 0; i < pts.length; i++) {
    const [x, y, z] = pts[i];
    const [nx, ny, nz] = pts[(i + 1) % pts.length];
    // Normal of the ring plane: horizontal direction toward the next ring.
    let dx = nx - x, dz = nz - z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len; dz /= len;
    rings.push({ x, y, z, nx: dx, nz: dz, r: course.radius, passed: false });
  }
  return rings;
}
