// render.js — the 3D view: sky, terrain mesh, runway, rings, trees,
// clouds, the Kestrel herself, and the particles that sell the flying.
// Pure canvas 2D, no libraries, no network. The world is a heightfield;
// the camera is a chase or cockpit camera that rolls with the wing.

import { clamp, lerp } from './random.js';
import { WORLD, RUNWAYS, COLORS } from './config.js';
import {
  gridCount, gridHeights, gridColors, TREES, CLOUDS, heightAt, runwayAt,
} from './terrain.js';

const HALF = WORLD.halfSize;
const CELL = WORLD.cellSize;

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, focal = 600;

  function resize(w, h) {
    W = w; H = h;
    canvas.width = w; canvas.height = h;
    focal = (H / 2) / Math.tan((70 * Math.PI / 180) / 2);
  }

  // Camera basis, rebuilt every frame from the plane and the view mode.
  const cam = { ex: 0, ey: 0, ez: 0, fx: 0, fy: 0, fz: 0, rx: 0, ry: 0, rz: 0, ux: 0, uy: 0, uz: 0 };

  function setupCamera(plane, mode) {
    const cp = Math.cos(plane.pitch), sp = Math.sin(plane.pitch);
    const ch = Math.cos(plane.heading), sh = Math.sin(plane.heading);
    const fx = sh * cp, fy = sp, fz = ch * cp; // plane forward
    let ex, ey, ez, lx, ly, lz;
    if (mode === 'cockpit') {
      ex = plane.x + fx * 1.6; ey = plane.y + 1.1; ez = plane.z + fz * 1.6;
      lx = plane.x + fx * 120; ly = plane.y + fy * 120; lz = plane.z + fz * 120;
    } else {
      // Chase: behind and above, looking past the nose.
      const bx = -fx * 15, by = -fy * 15 + 4.6, bz = -fz * 15;
      ex = plane.x + bx; ey = plane.y + by; ez = plane.z + bz;
      lx = plane.x + fx * 60; ly = plane.y + fy * 60 - 1; lz = plane.z + fz * 60;
    }
    let dx = lx - ex, dy = ly - ey, dz = lz - ez;
    const dl = Math.hypot(dx, dy, dz) || 1;
    dx /= dl; dy /= dl; dz /= dl;
    // Right = forward x world-up, up = right x forward; then roll the pair.
    let rx = -dz, ry = 0, rz = dx;
    const rl = Math.hypot(rx, ry, rz) || 1;
    rx /= rl; ry /= rl; rz /= rl;
    let ux = ry * dz - rz * dy, uy = rz * dx - rx * dz, uz = rx * dy - ry * dx;
    const roll = mode === 'cockpit' ? plane.roll * 0.85 : plane.roll * 0.55;
    const cr = Math.cos(roll), sr = Math.sin(roll);
    const r2x = rx * cr - ux * sr, r2y = ry * cr - uy * sr, r2z = rz * cr - uz * sr;
    const u2x = rx * sr + ux * cr, u2y = ry * sr + uy * cr, u2z = rz * sr + uz * cr;
    cam.ex = ex; cam.ey = ey; cam.ez = ez;
    cam.fx = dx; cam.fy = dy; cam.fz = dz;
    cam.rx = r2x; cam.ry = r2y; cam.rz = r2z;
    cam.ux = u2x; cam.uy = u2y; cam.uz = u2z;
  }

  // World -> screen. Returns null when behind the camera.
  function project(x, y, z, out) {
    const dx = x - cam.ex, dy = y - cam.ey, dz = z - cam.ez;
    const cz = dx * cam.fx + dy * cam.fy + dz * cam.fz;
    if (cz < 0.6) return null;
    const cx = dx * cam.rx + dy * cam.ry + dz * cam.rz;
    const cy = dx * cam.ux + dy * cam.uy + dz * cam.uz;
    const s = focal / cz;
    out.x = W / 2 + cx * s;
    out.y = H / 2 - cy * s;
    out.d = cz;
    out.s = s;
    return out;
  }

  // World -> screen, clamping depth to the near plane: a quad that straddles
  // the camera still covers the screen instead of leaving a sky hole.
  function projectClamped(x, y, z, out) {
    const dx = x - cam.ex, dy = y - cam.ey, dz = z - cam.ez;
    const czRaw = dx * cam.fx + dy * cam.fy + dz * cam.fz;
    const cz = Math.max(czRaw, 0.6);
    const cx = dx * cam.rx + dy * cam.ry + dz * cam.rz;
    const cy = dx * cam.ux + dy * cam.uy + dz * cam.uz;
    const s = focal / cz;
    out.x = W / 2 + cx * s;
    out.y = H / 2 - cy * s;
    out.d = czRaw;
    out.s = s;
    return out;
  }

  const tmp = { x: 0, y: 0, z: 0, d: 0, s: 0 };
  const tmp2 = { x: 0, y: 0, z: 0, d: 0, s: 0 };

  function drawSky(plane, time) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgb(52,102,178)');
    g.addColorStop(0.45, 'rgb(122,168,214)');
    g.addColorStop(0.72, 'rgb(214,228,238)');
    g.addColorStop(1, 'rgb(226,234,238)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // Sun: fixed in the west, high enough to light the scene.
    const sunDir = { x: -0.55, y: 0.62, z: -0.35 };
    const sx = cam.ex + sunDir.x * 4200, sy = cam.ey + sunDir.y * 4200, sz = cam.ez + sunDir.z * 4200;
    if (project(sx, sy, sz, tmp)) {
      const r = Math.max(26, 3400 * tmp.s * 0.06);
      const glow = ctx.createRadialGradient(tmp.x, tmp.y, 0, tmp.x, tmp.y, r * 3.2);
      glow.addColorStop(0, 'rgba(255,246,220,0.95)');
      glow.addColorStop(0.25, 'rgba(255,240,200,0.55)');
      glow.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(tmp.x - r * 3.2, tmp.y - r * 3.2, r * 6.4, r * 6.4);
      ctx.fillStyle = 'rgb(255,250,232)';
      ctx.beginPath(); ctx.arc(tmp.x, tmp.y, r, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Terrain: LOD blocks (1x1 near, 2x2 mid, 4x4 far), bucket-sorted far to
  // near so nearer ground correctly covers farther ground.
  const buckets = [];
  for (let i = 0; i < 64; i++) buckets.push([]);

  function drawTerrain() {
    for (const b of buckets) b.length = 0;
    const camIx = Math.round((cam.ex + HALF) / CELL);
    const camIz = Math.round((cam.ez + HALF) / CELL);
    const R = 46; // cells around the camera, in each direction
    const fog = COLORS.skyHorizon;
    for (let bz = camIz - R; bz < camIz + R; bz += 4) {
      for (let bx = camIx - R; bx < camIx + R; bx += 4) {
        const bcx = -HALF + (bx + 2) * CELL;
        const bcz = -HALF + (bz + 2) * CELL;
        const bdx = bcx - cam.ex, bdz = bcz - cam.ez;
        const bdist = Math.hypot(bdx, bdz);
        if (bdist > WORLD.maxViewDistance) continue;
        const step = bdist < 650 ? 1 : bdist < 1500 ? 2 : 4;
        for (let iz = bz; iz < bz + 4; iz += step) {
          for (let ix = bx; ix < bx + 4; ix += step) {
            if (ix < 0 || iz < 0 || ix >= gridCount - 1 || iz >= gridCount - 1) continue;
            const x0 = -HALF + ix * CELL, z0 = -HALF + iz * CELL;
            const x1 = x0 + CELL * step, z1 = z0 + CELL * step;
            const i00 = iz * gridCount + ix;
            const i10 = iz * gridCount + ix + step;
            const i01 = (iz + step) * gridCount + ix;
            const i11 = (iz + step) * gridCount + ix + step;
            const y00 = gridHeights[i00], y10 = gridHeights[i10];
            const y01 = gridHeights[i01], y11 = gridHeights[i11];
            const cxm = (x0 + x1) / 2, czm = (z0 + z1) / 2;
            const depth = Math.hypot(cxm - cam.ex, czm - cam.ez);
            if (depth > WORLD.maxViewDistance) continue;
            // Average colour of the four corners, fogged toward the horizon.
            const o00 = i00 * 3, o10 = i10 * 3, o01 = i01 * 3, o11 = i11 * 3;
            let r = (gridColors[o00] + gridColors[o10] + gridColors[o01] + gridColors[o11]) * 0.25;
            let g = (gridColors[o00 + 1] + gridColors[o10 + 1] + gridColors[o01 + 1] + gridColors[o11 + 1]) * 0.25;
            let b = (gridColors[o00 + 2] + gridColors[o10 + 2] + gridColors[o01 + 2] + gridColors[o11 + 2]) * 0.25;
            const ft = clamp(depth / WORLD.fogDistance, 0, 1) * 0.88;
            r = Math.round(lerp(r, fog[0], ft));
            g = Math.round(lerp(g, fog[1], ft));
            b = Math.round(lerp(b, fog[2], ft));
            const bucket = Math.min(63, (depth / 45) | 0);
            buckets[bucket].push([x0, y00, z0, x1, y10, z0, x1, y11, z1, x0, y01, z1, r, g, b]);
          }
        }
      }
    }
    for (let bi = 63; bi >= 0; bi--) {
      const list = buckets[bi];
      for (let q = 0; q < list.length; q++) {
        const quad = list[q];
        const p0 = projectClamped(quad[0], quad[1], quad[2], { x: 0, y: 0, d: 0, s: 0 });
        const p1 = projectClamped(quad[3], quad[4], quad[5], { x: 0, y: 0, d: 0, s: 0 });
        const p2 = projectClamped(quad[6], quad[7], quad[8], { x: 0, y: 0, d: 0, s: 0 });
        const p3 = projectClamped(quad[9], quad[10], quad[11], { x: 0, y: 0, d: 0, s: 0 });
        ctx.fillStyle = `rgb(${quad[12]},${quad[13]},${quad[14]})`;
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }
  }

  function drawRunwayStrip(r) {
    const c = Math.cos(r.heading), s = Math.sin(r.heading);
    const y = r.elevation + 0.25;
    // Strip frame: u runs along the strip, v across it.
    const corner = (u, v) => ({
      x: r.cx + u * s + v * c,
      z: r.cz + u * c - v * s,
    });
    const a = corner(-r.halfLength, -r.halfWidth);
    const b = corner(r.halfLength, -r.halfWidth);
    const cc = corner(r.halfLength, r.halfWidth);
    const d = corner(-r.halfLength, r.halfWidth);
    // Clamped projection: the strip runs under the camera on final, so its
    // near corners sit behind the view plane and must not drop the strip.
    const pa = projectClamped(a.x, y, a.z, { x: 0, y: 0, d: 0, s: 0 });
    const pb = projectClamped(b.x, y, b.z, { x: 0, y: 0, d: 0, s: 0 });
    const pc = projectClamped(cc.x, y, cc.z, { x: 0, y: 0, d: 0, s: 0 });
    const pd = projectClamped(d.x, y, d.z, { x: 0, y: 0, d: 0, s: 0 });
    ctx.fillStyle = 'rgb(52,56,62)';
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.lineTo(pc.x, pc.y); ctx.lineTo(pd.x, pd.y);
    ctx.closePath(); ctx.fill();
    // Centreline dashes and threshold bars.
    ctx.fillStyle = 'rgb(235,238,240)';
    for (let u = -r.halfLength + 30; u < r.halfLength - 20; u += 42) {
      const p1 = corner(u, -0.9), p2 = corner(u + 20, -0.9);
      const p3 = corner(u + 20, 0.9), p4 = corner(u, 0.9);
      const q1 = projectClamped(p1.x, y + 0.05, p1.z, { x: 0, y: 0, d: 0, s: 0 });
      const q2 = projectClamped(p2.x, y + 0.05, p2.z, { x: 0, y: 0, d: 0, s: 0 });
      const q3 = projectClamped(p3.x, y + 0.05, p3.z, { x: 0, y: 0, d: 0, s: 0 });
      const q4 = projectClamped(p4.x, y + 0.05, p4.z, { x: 0, y: 0, d: 0, s: 0 });
      ctx.beginPath();
      ctx.moveTo(q1.x, q1.y); ctx.lineTo(q2.x, q2.y); ctx.lineTo(q3.x, q3.y); ctx.lineTo(q4.x, q4.y);
      ctx.closePath(); ctx.fill();
    }
    // Edge lights, warm dots down both sides.
    ctx.fillStyle = 'rgb(255,196,90)';
    for (let u = -r.halfLength + 10; u <= r.halfLength - 10; u += 55) {
      for (const v of [-r.halfWidth - 2, r.halfWidth + 2]) {
        const p = corner(u, v);
        if (project(p.x, y + 0.4, p.z, tmp)) {
          const rad = clamp(3.2 * tmp.s, 1, 5);
          ctx.beginPath(); ctx.arc(tmp.x, tmp.y, rad, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
  }

  function drawRings(rings) {
    for (const ring of rings) {
      const depth = Math.hypot(ring.x - cam.ex, ring.y - cam.ey, ring.z - cam.ez);
      if (depth > 2400) continue;
      // Ring plane: right vector is horizontal, perpendicular to its normal.
      const rx = ring.nz, rz = -ring.nx;
      const passed = ring.passed;
      const base = passed ? COLORS.ringPassed : COLORS.ring;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      for (const pass of [0, 1]) {
        ctx.beginPath();
        let first = true;
        for (let i = 0; i <= 20; i++) {
          const t = (i / 20) * Math.PI * 2;
          const px = ring.x + rx * Math.cos(t) * ring.r;
          const py = ring.y + Math.sin(t) * ring.r;
          const pz = ring.z + rz * Math.cos(t) * ring.r;
          if (!project(px, py, pz, tmp)) { first = true; continue; }
          if (first) { ctx.moveTo(tmp.x, tmp.y); first = false; }
          else ctx.lineTo(tmp.x, tmp.y);
        }
        if (pass === 0) {
          ctx.strokeStyle = `rgba(${base[0]},${base[1]},${base[2]},0.22)`;
          ctx.lineWidth = clamp(ring.r * 0.55 * (focal / Math.max(depth, 1)) * 0.12, 6, 26);
        } else {
          ctx.strokeStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
          ctx.lineWidth = clamp(ring.r * 0.55 * (focal / Math.max(depth, 1)) * 0.035, 2, 8);
        }
        ctx.stroke();
      }
      // A small chevron at the ring's centre, pointing the way through.
      if (project(ring.x, ring.y, ring.z, tmp2) && depth < 1200) {
        const s = clamp(26 * tmp2.s, 4, 30);
        ctx.fillStyle = passed ? 'rgba(88,214,120,0.9)' : 'rgba(255,138,42,0.95)';
        ctx.beginPath();
        ctx.moveTo(tmp2.x, tmp2.y + s * 0.5);
        ctx.lineTo(tmp2.x - s * 0.55, tmp2.y - s * 0.4);
        ctx.lineTo(tmp2.x + s * 0.55, tmp2.y - s * 0.4);
        ctx.closePath(); ctx.fill();
      }
    }
  }

  function drawTrees(plane) {
    let drawn = 0;
    for (const t of TREES) {
      if (drawn > 380) break;
      const dx = t.x - plane.x, dz = t.z - plane.z;
      if (dx * dx + dz * dz > 900 * 900) continue;
      if (!project(t.x, t.y, t.z, tmp)) continue;
      const h = t.size * tmp.s;
      if (h < 2) continue;
      const w = h * 0.42;
      const shade = Math.round(46 * t.shade);
      ctx.fillStyle = `rgb(${shade},${Math.round(88 * t.shade)},${shade})`;
      ctx.beginPath();
      ctx.moveTo(tmp.x, tmp.y - h);
      ctx.lineTo(tmp.x - w, tmp.y);
      ctx.lineTo(tmp.x + w, tmp.y);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgb(74,52,36)';
      ctx.fillRect(tmp.x - Math.max(1, w * 0.08), tmp.y, Math.max(2, w * 0.16), h * 0.12);
      drawn++;
    }
  }

  function drawClouds(time) {
    const list = [];
    for (const c of CLOUDS) {
      const cx = c.x + ((time * c.drift) % 6000) - 3000;
      const depth = Math.hypot(cx - cam.ex, c.y - cam.ey, c.z - cam.ez);
      if (depth > 4200) continue;
      list.push([depth, c, cx]);
    }
    list.sort((a, b) => b[0] - a[0]); // far to near
    for (const [depth, c, cx] of list) {
      if (!project(cx, c.y, c.z, tmp)) continue;
      const s = c.scale * tmp.s;
      if (s < 6) continue;
      ctx.fillStyle = 'rgba(255,255,255,0.82)';
      for (let i = 0; i < c.puffs; i++) {
        const ox = (hashPuff(c, i) - 0.5) * s * 1.6;
        const oy = (hashPuff(c, i + 9) - 0.5) * s * 0.35;
        const r = s * (0.32 + hashPuff(c, i + 4) * 0.22);
        ctx.beginPath();
        ctx.ellipse(tmp.x + ox, tmp.y + oy, r, r * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function hashPuff(c, i) {
    const v = Math.sin(c.x * 0.13 + c.z * 0.29 + i * 12.9898) * 43758.5453;
    return v - Math.floor(v);
  }

  // The Kestrel, drawn in screen space: rear three-quarter view, banking
  // with the wing, prop spinning, nav lights blinking.
  function drawAircraft(plane, mode, time) {
    if (mode === 'cockpit') {
      // Nose and spinner peeking over the panel, prop disc shimmering.
      const cx = W / 2, baseY = H - 178;
      ctx.save();
      ctx.translate(cx, baseY);
      ctx.rotate(-plane.roll * 0.35);
      ctx.fillStyle = 'rgb(214,222,228)';
      ctx.beginPath();
      ctx.moveTo(-46, 0); ctx.quadraticCurveTo(0, -26, 46, 0);
      ctx.quadraticCurveTo(0, 14, -46, 0);
      ctx.fill();
      ctx.fillStyle = 'rgba(40,48,58,0.35)';
      ctx.beginPath(); ctx.ellipse(0, -8, 7, 44, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgb(160,40,40)';
      ctx.beginPath(); ctx.arc(0, -8, 5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      return;
    }
    // Ground shadow: a soft ellipse on the terrain below.
    const gy = heightAt(plane.x, plane.z);
    if (plane.y - gy < 260 && project(plane.x, gy + 0.4, plane.z, tmp)) {
      const alt = Math.max(8, plane.y - gy);
      const rw = clamp(1900 / alt, 8, 90);
      ctx.fillStyle = `rgba(20,26,20,${clamp(0.30 - alt / 900, 0.05, 0.28)})`;
      ctx.beginPath(); ctx.ellipse(tmp.x, tmp.y, rw, rw * 0.32, 0, 0, Math.PI * 2); ctx.fill();
    }
    const cx = W / 2;
    const cy = H * 0.55 - plane.pitch * 60;
    const s = Math.min(W, H) / 720;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-plane.roll * 0.85);
    ctx.scale(s, s);
    // Main wings, swept slightly back, left tip red, right tip green.
    ctx.fillStyle = 'rgb(196,60,44)';
    ctx.beginPath();
    ctx.moveTo(-10, 2); ctx.lineTo(-168, -26); ctx.lineTo(-172, -40); ctx.lineTo(-10, -16);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(10, 2); ctx.lineTo(168, -26); ctx.lineTo(172, -40); ctx.lineTo(10, -16);
    ctx.closePath(); ctx.fill();
    // Fuselage: tapered body, cream top, red cheatline, dark belly.
    const body = ctx.createLinearGradient(0, -70, 0, 60);
    body.addColorStop(0, 'rgb(238,240,236)');
    body.addColorStop(0.55, 'rgb(222,226,222)');
    body.addColorStop(1, 'rgb(150,158,164)');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(0, -72);
    ctx.bezierCurveTo(17, -58, 21, -20, 20, 18);
    ctx.bezierCurveTo(19, 44, 12, 58, 0, 60);
    ctx.bezierCurveTo(-12, 58, -19, 44, -20, 18);
    ctx.bezierCurveTo(-21, -20, -17, -58, 0, -72);
    ctx.fill();
    ctx.fillStyle = 'rgb(196,60,44)';
    ctx.fillRect(-19, 8, 38, 7);
    ctx.fillStyle = 'rgb(196,60,44)';
    ctx.beginPath(); ctx.moveTo(-19, 8); ctx.lineTo(-20, 18); ctx.lineTo(-19, 15); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(19, 8); ctx.lineTo(20, 18); ctx.lineTo(19, 15); ctx.closePath(); ctx.fill();
    // Windshield.
    ctx.fillStyle = 'rgb(38,58,78)';
    ctx.beginPath();
    ctx.moveTo(-11, -52); ctx.lineTo(11, -52); ctx.lineTo(8, -30); ctx.lineTo(-8, -30);
    ctx.closePath(); ctx.fill();
    // Tailplane and fin.
    ctx.fillStyle = 'rgb(196,60,44)';
    ctx.beginPath();
    ctx.moveTo(-8, 44); ctx.lineTo(-62, 34); ctx.lineTo(-64, 26); ctx.lineTo(-8, 34);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(8, 44); ctx.lineTo(62, 34); ctx.lineTo(64, 26); ctx.lineTo(8, 34);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-13, 56); ctx.lineTo(13, 56); ctx.lineTo(7, 14); ctx.lineTo(-7, 14);
    ctx.closePath(); ctx.fill();
    // Prop disc, spinning: a translucent vertical blur with a spinner.
    ctx.fillStyle = 'rgba(30,34,40,0.16)';
    ctx.beginPath(); ctx.ellipse(0, -66, 4, 40, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgb(196,60,44)';
    ctx.beginPath(); ctx.arc(0, -66, 6, 0, Math.PI * 2); ctx.fill();
    // Nav lights: red left, green right, white strobe blinking at the tail.
    ctx.fillStyle = 'rgb(255,60,50)';
    ctx.beginPath(); ctx.arc(-170, -33, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgb(60,255,120)';
    ctx.beginPath(); ctx.arc(170, -33, 4, 0, Math.PI * 2); ctx.fill();
    if (Math.floor(time * 1.4) % 2 === 0) {
      ctx.fillStyle = 'rgb(255,255,255)';
      ctx.beginPath(); ctx.arc(0, 58, 4, 0, Math.PI * 2); ctx.fill();
    }
    // Landing gear, when it is down.
    if (plane.gearDown) {
      ctx.strokeStyle = 'rgb(40,44,48)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-12, 40); ctx.lineTo(-20, 66);
      ctx.moveTo(12, 40); ctx.lineTo(20, 66);
      ctx.stroke();
      ctx.fillStyle = 'rgb(24,26,28)';
      ctx.beginPath(); ctx.arc(-20, 68, 6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(20, 68, 6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawParticles(particles) {
    for (const pt of particles) {
      if (!project(pt.x, pt.y, pt.z, tmp)) continue;
      const r = clamp(pt.size * tmp.s, 1, 14);
      ctx.fillStyle = pt.color;
      ctx.globalAlpha = clamp(pt.life, 0, 1);
      ctx.beginPath(); ctx.arc(tmp.x, tmp.y, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function render(state) {
    const { plane, mode, rings, particles, time } = state;
    setupCamera(plane, mode);
    drawSky(plane, time);
    drawTerrain();
    for (const r of RUNWAYS) drawRunwayStrip(r);
    drawClouds(time);
    drawTrees(plane);
    drawRings(rings);
    drawParticles(particles);
    drawAircraft(plane, mode, time);
  }

  return { resize, render, project };
}
