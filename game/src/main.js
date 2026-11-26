// main.js — Skyward Flight: the game loop, the menu, the end screens, and
// the deterministic ?shot= setups the screenshots are taken from.
// The loop runs physics at a fixed 60 Hz and draws every animation frame.

import { createRenderer } from './render.js';
import { drawInstruments } from './instruments.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';
import { makePlane, stepPlane, forwardVector } from './physics.js';
import { makeMission, missionStartPosition, checkRingPass, tickMission, missionLanding, ringsLeft } from './missions.js';
import { heightAt } from './terrain.js';
import { clamp, mulberry32 } from './random.js';
import { RUNWAYS } from './config.js';

const canvas = document.getElementById('game');
const statusEl = document.getElementById('status');
const renderer = createRenderer(canvas);
const audio = createAudio();
const input = createInput(canvas);

let W = 0, H = 0;
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  W = Math.floor(window.innerWidth * dpr);
  H = Math.floor(window.innerHeight * dpr);
  canvas.style.width = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';
  renderer.resize(W, H);
}
window.addEventListener('resize', resize);
resize();

const params = new URLSearchParams(location.search);
const shotMode = params.get('shot'); // cover | rings | cockpit | landing

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------

let mission = makeMission('ringRun');
let plane = makePlane();
let mode = 'chase'; // chase | cockpit
let state = 'menu'; // menu | fly | paused | over
let particles = [];
let message = '';
let messageUntil = 0;
let time = 0;
let overResult = null;
let best = loadBest();

function loadBest() {
  try {
    return JSON.parse(localStorage.getItem('skyward-best') || '{}');
  } catch (e) {
    return {};
  }
}
function saveBest() {
  try {
    localStorage.setItem('skyward-best', JSON.stringify(best));
  } catch (e) { /* storage is a garnish */ }
}

function startMission(key) {
  mission = makeMission(key);
  plane = makePlane();
  const s = missionStartPosition(key);
  plane.x = s.x; plane.y = s.y; plane.z = s.z; plane.heading = s.heading;
  plane.fuel = mission.fuelStart;
  plane.throttle = 0;
  particles = [];
  state = 'fly';
  mission.state = 'flying';
  setMessage(`${mission.name.toUpperCase()} — ${mission.blurb}`, 6);
  audio.ensure();
  audio.click();
  statusEl.textContent = `${mission.name}. ${mission.blurb}`;
}

function setMessage(text, seconds) {
  message = text;
  messageUntil = time + seconds;
}

function burst(x, y, z, color, n, speed) {
  const rnd = mulberry32((Math.floor(time * 1000) ^ (n * 7919)) >>> 0);
  for (let i = 0; i < n; i++) {
    particles.push({
      x, y, z,
      vx: (rnd() - 0.5) * speed, vy: (rnd() - 0.5) * speed, vz: (rnd() - 0.5) * speed,
      life: 0.9, size: 2.5 + rnd() * 3, color,
    });
  }
}

function updateParticles(dt) {
  for (const p of particles) {
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    p.vy -= 3 * dt;
    p.life -= dt * 0.9;
  }
  particles = particles.filter((p) => p.life > 0);
}

function endFlight(title, detail, crashed) {
  state = 'over';
  overResult = { title, detail, crashed };
  const prev = best[mission.key] || 0;
  if (mission.score > prev) {
    best[mission.key] = mission.score;
    saveBest();
  }
  statusEl.textContent = `${title}. ${detail}`;
}

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------

const MISSIONS = [
  ['1', 'ringRun', 'RING RUN', 'Thread eight sky rings, then land home.'],
  ['2', 'canyonDash', 'CANYON DASH', 'Eight rings through the ranges. 150 seconds.'],
  ['3', 'islandLanding', 'ISLAND LANDING', 'Cross the lake. Set her down on the Islet Strip.'],
];
let menuRects = [];

function drawMenu() {
  ctxFillBackground();
  const cx = W / 2;
  // Title block.
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgb(255,196,90)';
  ctx.font = `700 ${Math.round(H * 0.085)}px monospace`;
  ctx.fillText('SKYWARD FLIGHT', cx, H * 0.2);
  ctx.fillStyle = 'rgb(235,244,252)';
  ctx.font = `600 ${Math.round(H * 0.026)}px monospace`;
  ctx.fillText('A bush-plane sortie over Alder Valley — fly the Kestrel K-7', cx, H * 0.2 + 42);
  // Mission cards.
  menuRects = [];
  const cardW = Math.min(620, W * 0.72);
  const cardH = 64;
  let y = H * 0.32;
  ctx.textAlign = 'left';
  for (const [key, id, name, blurb] of MISSIONS) {
    const x = cx - cardW / 2;
    ctx.fillStyle = 'rgba(10,16,24,0.66)';
    ctx.beginPath(); ctx.roundRect(x, y, cardW, cardH, 10); ctx.fill();
    ctx.strokeStyle = 'rgba(235,244,252,0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = 'rgb(255,196,90)';
    ctx.font = '700 22px monospace';
    ctx.fillText(key, x + 18, y + 32);
    ctx.fillStyle = 'rgb(235,244,252)';
    ctx.font = '700 19px monospace';
    ctx.fillText(name, x + 52, y + 28);
    ctx.fillStyle = 'rgba(235,244,252,0.7)';
    ctx.font = '600 13px monospace';
    ctx.fillText(blurb, x + 52, y + 50);
    const b = best[id];
    if (b) {
      ctx.fillStyle = 'rgb(88,214,120)';
      ctx.font = '700 13px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`BEST ${b}`, x + cardW - 16, y + 28);
      ctx.textAlign = 'left';
    }
    menuRects.push({ x, y, w: cardW, h: cardH, id });
    y += cardH + 14;
  }
  // Controls.
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(235,244,252,0.85)';
  ctx.font = '600 14px monospace';
  ctx.fillText('ARROW KEYS fly  ·  W / S throttle  ·  hold MOUSE to steer  ·  G gear  ·  C cockpit view  ·  P pause  ·  M mute', cx, y + 26);
  ctx.fillStyle = 'rgba(235,244,252,0.55)';
  ctx.font = '600 12px monospace';
  ctx.fillText('Throttle up on the runway, pull back gently at 60 knots, and mind the fuel gauge.', cx, y + 52);
  ctx.fillText('Click a sortie, or press 1, 2 or 3. No network, no account — just flying.', cx, y + 74);
}

const menuCtx = canvas.getContext('2d');
function ctxFillBackground() {
  // A painted valley backdrop behind the menu, drawn from the same sky.
  const g = menuCtx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgb(52,102,178)');
  g.addColorStop(0.55, 'rgb(122,168,214)');
  g.addColorStop(1, 'rgb(214,228,238)');
  menuCtx.fillStyle = g;
  menuCtx.fillRect(0, 0, W, H);
  // Distant ridges, three layers, deterministic silhouettes.
  const layers = [
    [0.62, 'rgb(96,122,148)', 40], [0.72, 'rgb(74,100,120)', 26], [0.84, 'rgb(56,82,66)', 14],
  ];
  for (const [base, color, amp] of layers) {
    menuCtx.fillStyle = color;
    menuCtx.beginPath();
    menuCtx.moveTo(0, H);
    for (let x = 0; x <= W; x += 24) {
      const y = H * base + Math.sin(x * 0.004 + amp) * amp + Math.sin(x * 0.011 + amp * 2) * amp * 0.5;
      menuCtx.lineTo(x, y);
    }
    menuCtx.lineTo(W, H);
    menuCtx.closePath();
    menuCtx.fill();
  }
}

// ---------------------------------------------------------------------------
// Screenshot setups: fixed, deterministic scenes, rendered once and frozen.
// ---------------------------------------------------------------------------

function applyShotSetup() {
  if (shotMode === 'cover') {
    startMission('ringRun');
    plane.x = 60; plane.y = 118; plane.z = 700;
    plane.heading = Math.PI; plane.pitch = 0.03; plane.roll = 0.06;
    plane.speed = 58; plane.throttle = 0.72; plane.grounded = false;
    mode = 'chase';
    setMessage('RING RUN — THREAD ALL EIGHT RINGS', 9999);
  } else if (shotMode === 'rings') {
    startMission('ringRun');
    plane.x = -300; plane.y = 132; plane.z = -1050;
    plane.heading = 3.71; plane.pitch = 0.02; plane.roll = -0.12;
    plane.speed = 62; plane.throttle = 0.78; plane.grounded = false;
    mode = 'chase';
    setMessage('RING 2 AHEAD — FLY THROUGH THE HOOP', 9999);
  } else if (shotMode === 'cockpit') {
    startMission('ringRun');
    plane.x = 0; plane.y = 110; plane.z = 650;
    plane.heading = Math.PI; plane.pitch = -0.02; plane.roll = 0;
    plane.speed = 55; plane.throttle = 0.58; plane.grounded = false;
    mode = 'cockpit';
    setMessage('FINAL APPROACH — ALDER FIELD AHEAD', 9999);
  } else if (shotMode === 'landing') {
    startMission('islandLanding');
    plane.x = 0; plane.y = 25; plane.z = 380;
    plane.heading = Math.PI; plane.pitch = -0.04; plane.roll = 0.02;
    plane.speed = 46; plane.throttle = 0.4; plane.grounded = false;
    mode = 'chase';
    setMessage('GEAR DOWN — SHORT FINAL TO ALDER FIELD', 9999);
  }
  // Fly the setup forward a couple of seconds so the scene settles, then
  // freeze: the screenshot is a real render of the game at that moment.
  const idle = { pitch: 0, roll: 0, throttleUp: false, throttleDown: false, brake: false, gear: false, flaps: false, camera: false, pause: false, mute: false, restart: false, menu: false };
  for (let i = 0; i < 150; i++) {
    const prev = { x: plane.x, y: plane.y, z: plane.z };
    stepPlane(plane, idle, 1 / 60, {});
    checkRingPass(mission, plane, prev);
    updateParticles(1 / 60);
    time += 1 / 60;
  }
  renderFrame();
}

// ---------------------------------------------------------------------------
// Frame
// ---------------------------------------------------------------------------

const ctx = canvas.getContext('2d');

function renderFrame() {
  const groundBelow = heightAt(plane.x, plane.z);
  renderer.render({
    plane, mode, rings: mission.rings, particles, time,
  });
  drawInstruments(ctx, W, H, {
    plane, mode, mission, ringsLeft: ringsLeft(mission),
    score: mission.score, elapsed: mission.elapsed,
    message, messageUntil, time, groundBelow,
  });
  if (state === 'paused') {
    ctx.fillStyle = 'rgba(10,16,24,0.55)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgb(235,244,252)';
    ctx.font = '700 34px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED — press P to keep flying', W / 2, H / 2);
  }
  if (state === 'over' && overResult) {
    ctx.fillStyle = 'rgba(10,16,24,0.6)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = overResult.crashed ? 'rgb(255,84,72)' : 'rgb(88,214,120)';
    ctx.font = '700 38px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(overResult.title, W / 2, H * 0.42);
    ctx.fillStyle = 'rgb(235,244,252)';
    ctx.font = '600 18px monospace';
    ctx.fillText(overResult.detail, W / 2, H * 0.42 + 38);
    ctx.font = '600 15px monospace';
    ctx.fillText(`Score ${mission.score}   ·   ${mission.name}   ·   R to fly again   ·   ESC for the menu`, W / 2, H * 0.42 + 72);
  }
}

let last = performance.now();
let acc = 0;

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  time += dt;

  if (state === 'menu') {
    const click = input.clickPos();
    if (click) {
      for (const r of menuRects) {
        if (click.x >= r.x && click.x <= r.x + r.w && click.y >= r.y && click.y <= r.y + r.h) {
          startMission(r.id);
          break;
        }
      }
    }
    if (input.read().restart) startMission('ringRun');
    drawMenu();
    requestAnimationFrame(frame);
    return;
  }

  const inp = input.read();
  if (inp.pause && (state === 'fly' || state === 'paused')) {
    state = state === 'fly' ? 'paused' : 'fly';
    audio.click();
  }
  if (inp.mute) audio.toggleMute();
  if (inp.camera) { mode = mode === 'chase' ? 'cockpit' : 'chase'; audio.click(); }
  if (inp.restart) { startMission(mission.key); }
  if (inp.menu || (state === 'over' && inp.menu)) { state = 'menu'; input.clear(); }
  if (state === 'over' && inp.restart) startMission(mission.key);

  if (state === 'fly') {
    acc += dt;
    const step = 1 / 60;
    while (acc >= step) {
      acc -= step;
      const prev = { x: plane.x, y: plane.y, z: plane.z };
      stepPlane(plane, inp, step, {
        onCrash: (reason) => {
          audio.crash();
          burst(plane.x, plane.y, plane.z, 'rgba(60,60,60,0.8)', 26, 14);
          endFlight('CRASHED', `${reason} — the Kestrel is a write-off. Score ${mission.score}.`, true);
        },
        onTouchdown: (softness) => {
          audio.touchdown();
          burst(plane.x, plane.y + 1, plane.z, 'rgba(200,180,140,0.7)', 14, 6);
          const res = missionLanding(mission, plane, softness);
          if (res) endFlight(res.title, res.detail, false);
          else setMessage('TOUCHDOWN — NICE AND EASY', 3);
        },
        onTakeoff: () => setMessage('AIRBORNE — GEAR UP WHEN YOU ARE READY', 3),
      });
      if (inp.gear) { plane.gearDown = !plane.gearDown; audio.click(); }
      if (inp.flaps) { plane.flaps = !plane.flaps; audio.click(); }
      if (checkRingPass(mission, plane, prev)) {
        audio.ring();
        const ring = mission.rings[mission.ringIndex - 1];
        burst(ring.x, ring.y, ring.z, 'rgba(255,138,42,0.9)', 22, 12);
        setMessage(`RING ${mission.ringIndex} OF ${mission.rings.length} — +100`, 2.5);
      }
      tickMission(mission, plane, step, {
        onComplete: (res) => setMessage(`${res.title} — ${res.detail}`, 5),
        onFail: (res) => endFlight(res.title, res.detail, false),
      });
      updateParticles(step);
      if (plane.crashed) break;
    }
    audio.setEngine(plane.throttle, plane.speed, !plane.grounded);
  }

  renderFrame();
  requestAnimationFrame(frame);
}

// Keyboard shortcuts on the menu (1 / 2 / 3 pick a sortie).
window.addEventListener('keydown', (e) => {
  if (state !== 'menu') return;
  const map = { 1: 'ringRun', 2: 'canyonDash', 3: 'islandLanding' };
  if (map[e.key]) startMission(map[e.key]);
});

// Boot.
if (shotMode) {
  applyShotSetup(); // renders once and stops: the frame is the screenshot
} else {
  statusEl.textContent = 'Skyward Flight — pick a sortie to fly the Kestrel.';
  requestAnimationFrame(frame);
}
