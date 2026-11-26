// missions.js — what the pilot is actually trying to do.
// Three sorties over the same valley, each with its own win condition:
// thread the rings, beat the clock through the canyon, or set her down
// gently on the island strip across the lake.

import { RING_COURSES } from './config.js';
import { buildRings } from './terrain.js';

export function makeMission(key) {
  const course = RING_COURSES[key];
  return {
    key,
    name: course.name,
    blurb: course.blurb,
    timeLimit: course.timeLimit,
    fuelStart: course.fuelStart,
    rings: buildRings(course),
    ringIndex: 0, // next ring to fly through
    score: 0,
    elapsed: 0,
    state: 'brief', // brief | flying | done | failed
    result: null, // { title, detail } shown on the end screen
    startPos: null,
  };
}

export function missionStartPosition(key) {
  // Every sortie starts parked on Alder Field, nose to the north.
  return { x: 0, y: 8, z: 260, heading: Math.PI };
}

// Has the plane just flown through the next ring? A ring counts when the
// aircraft crosses its plane within the hoop's radius.
export function checkRingPass(mission, plane, prev) {
  if (mission.ringIndex >= mission.rings.length) return false;
  const ring = mission.rings[mission.ringIndex];
  // Signed distance from the ring plane, along the ring's normal.
  const dPrev = (prev.x - ring.x) * ring.nx + (prev.z - ring.z) * ring.nz;
  const dNow = (plane.x - ring.x) * ring.nx + (plane.z - ring.z) * ring.nz;
  if (dPrev > 0 !== dNow > 0 || dNow === 0) {
    // Crossed the plane this step: how far from the centre?
    const dx = plane.x - ring.x, dy = plane.y - ring.y, dz = plane.z - ring.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist <= ring.r * 1.05) {
      ring.passed = true;
      mission.ringIndex++;
      mission.score += 100;
      return true;
    }
  }
  return false;
}

export function ringsLeft(mission) {
  return mission.rings.length ? mission.rings.length - mission.ringIndex : null;
}

// Called once a second while flying: clock pressure, fuel, and the win
// conditions that do not need a landing.
export function tickMission(mission, plane, dt, events) {
  mission.elapsed += dt;
  if (mission.state !== 'flying') return;
  if (mission.timeLimit && mission.elapsed > mission.timeLimit) {
    mission.state = 'failed';
    mission.result = { title: 'OUT OF TIME', detail: 'The canyon keeps its secret — try again, faster.' };
    if (events.onFail) events.onFail(mission.result);
    return;
  }
  if (mission.key === 'ringRun' && mission.ringIndex >= mission.rings.length) {
    mission.score += 250; // all rings threaded
    mission.state = 'done';
    mission.result = {
      title: 'ALL RINGS THREADED',
      detail: 'Eight for eight. Bring her home to Alder Field to bank the score.',
    };
    if (events.onComplete) events.onComplete(mission.result);
  }
}

export function missionLanding(mission, plane, softness) {
  // softness 0..1 from the touchdown. A landing ends the island sortie and
  // banks the ring-run score; a hard arrival still counts, just uglier.
  // It also counts after the rings are all threaded (state 'done'): the
  // sortie is not over until the wheels are down.
  if (mission.state === 'failed') return null;
  if (mission.state === 'done' && mission.landedBanked) return null;
  const bonus = Math.round(150 + softness * 350);
  mission.score += bonus;
  mission.landedBanked = true;
  mission.state = 'done';
  const title = mission.key === 'islandLanding' ? 'ISLAND LANDING — NAILED IT' : 'WHEELS DOWN — SORTIE COMPLETE';
  mission.result = {
    title,
    detail: `Landing bonus +${bonus}  ·  Final score ${mission.score}`,
  };
  return mission.result;
}
