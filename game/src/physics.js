// physics.js — the Kestrel's flight model.
// Arcade at heart, but honest about the things that make flying feel like
// flying: lift needs speed, banks turn the nose, stalls bite, fuel runs out,
// and the ground is always waiting.

import { clamp, wrapAngle } from './random.js';
import { PLANE } from './config.js';
import { heightAt, runwayAt } from './terrain.js';

export function makePlane() {
  return {
    x: 0, y: 8, z: 260, // parked on Alder Field, nose to the north
    heading: Math.PI, // forward = (sin h, cos h) -> heading PI faces -z
    pitch: 0,
    roll: 0,
    speed: 0,
    throttle: 0,
    fuel: 1,
    gearDown: true,
    flaps: false,
    damage: 0,
    vspeed: 0, // vertical speed, m/s
    grounded: true,
    crashed: false,
    landed: false,
    stalled: false,
    time: 0,
  };
}

// Forward unit vector of the aircraft from heading + pitch.
export function forwardVector(p) {
  const cp = Math.cos(p.pitch);
  return {
    x: Math.sin(p.heading) * cp,
    y: Math.sin(p.pitch),
    z: Math.cos(p.heading) * cp,
  };
}

// input: { pitch: -1..1 (positive = pull up), roll: -1..1 (positive = right),
//          throttleUp, throttleDown, brake, gear }
// events: { onCrash(reason), onTouchdown(softness), onTakeoff() }
export function stepPlane(p, input, dt, events) {
  if (p.crashed) return;
  p.time += dt;

  // --- throttle ------------------------------------------------------------
  if (input.throttleUp) p.throttle = clamp(p.throttle + dt * 0.55, 0, 1);
  if (input.throttleDown) p.throttle = clamp(p.throttle - dt * 0.55, 0, 1);

  // --- control authority fades as the wing loses speed ---------------------
  const authority = clamp((p.speed - 12) / 30, 0.15, 1);
  p.roll = clamp(p.roll + input.roll * PLANE.rollRate * authority * dt * 0.55, -1.25, 1.25);
  p.pitch = clamp(p.pitch + input.pitch * PLANE.pitchRate * authority * dt * 0.55, -0.62, 0.62);
  if (Math.abs(input.roll) < 0.05) p.roll -= p.roll * 0.55 * dt; // gentle auto-level
  if (Math.abs(input.pitch) < 0.05) p.pitch -= p.pitch * 0.25 * dt;

  // Banked turns: the nose follows the bank.
  p.heading = wrapAngle(p.heading - Math.sin(p.roll) * PLANE.turnRate * dt * clamp(p.speed / 45, 0.25, 1));

  // --- stall: below flying speed the nose drops and the wing shudders -----
  p.stalled = p.speed < PLANE.stallSpeed && !p.grounded;
  if (p.stalled) p.pitch -= (PLANE.stallSpeed - p.speed) * 0.012 * dt * 10;

  // --- thrust, drag, gravity ----------------------------------------------
  const drag = PLANE.dragCoefficient * p.speed * p.speed
    + (p.gearDown ? PLANE.gearDrag : 0)
    + (p.flaps ? 1.1 : 0)
    + (input.brake ? 9 : 0);
  const thrust = p.throttle * PLANE.maxThrottleAccel * (p.fuel > 0 ? 1 : 0);
  const alongSlope = 9.8 * Math.sin(p.pitch);
  p.speed += (thrust - drag - alongSlope) * dt;
  if (p.grounded) p.speed = Math.max(0, p.speed);
  p.speed = clamp(p.speed, 0, PLANE.maxSpeed);

  // --- fuel ------------------------------------------------------------------
  if (p.fuel > 0) {
    p.fuel = Math.max(0, p.fuel - ((0.10 + p.throttle * 0.55) / PLANE.fuelSeconds) * dt);
  }

  // --- integrate -------------------------------------------------------------
  const f = forwardVector(p);
  const liftFactor = clamp(p.speed / 34, 0, 1); // wing needs airflow
  const vy = f.y * p.speed * liftFactor;
  p.vspeed = vy;
  p.x += f.x * p.speed * dt;
  p.z += f.z * p.speed * dt;
  p.y += vy * dt;
  // The ground holds the wheels while there is no lift to leave it.
  if (p.grounded && p.speed < 34) p.y = heightAt(p.x, p.z) + 2.0;

  // --- ground contact --------------------------------------------------------
  const ground = heightAt(p.x, p.z);
  const rwy = runwayAt(p.x, p.z);
  if (p.grounded) {
    // The wing lifts the wheels off the strip: fast, nose up, above the ground.
    // The pin below only catches the plane when it sinks to the strip; it
    // never pulls a climbing plane back down, or liftoff could never happen.
    if (p.speed > 34 && p.pitch > 0.04 && p.y > ground + 3) {
      p.grounded = false;
      if (events.onTakeoff) events.onTakeoff();
    } else if (p.y <= ground + 2.0) {
      p.y = ground + 2.0; // stay planted while there is no lift to leave it
    }
  } else if (p.y <= ground + 2.0) {
    const sink = -vy;
    const onStrip = rwy !== null;
    const gentle = sink <= PLANE.landingMaxSink
      && p.speed <= PLANE.landingMaxSpeed
      && Math.abs(p.roll) <= PLANE.landingMaxRoll
      && p.gearDown;
    if (onStrip && gentle) {
      // Touchdown on a runway: roll out, don't bounce.
      p.y = ground + 2.0;
      p.grounded = true;
      p.pitch = 0;
      p.roll *= 0.4;
      p.landed = true;
      if (events.onTouchdown) events.onTouchdown(1 - sink / PLANE.landingMaxSink);
    } else if (onStrip && sink <= 8 && p.gearDown) {
      // Hard but survivable runway arrival: a bounce and some damage.
      p.y = ground + 2.0;
      p.damage = Math.min(100, p.damage + 25);
      p.speed *= 0.75;
      p.vspeed = 2.5;
      p.pitch = 0.05;
      if (events.onTouchdown) events.onTouchdown(0.15);
    } else {
      p.crashed = true;
      p.damage = 100;
      if (events.onCrash) events.onCrash(onStrip ? 'Ran off the strip' : 'Hit the terrain');
    }
  }

  // Rolling on the ground scrubs speed; flying keeps it.
  if (p.grounded) {
    p.speed = Math.max(0, p.speed - (2.2 + (input.brake ? 10 : 0)) * dt);
    if (p.speed < 4 && p.landed) p.speed = 0;
  }

  // Out of the map: turn the pilot around with a firm message.
  if (Math.abs(p.x) > 2950 || Math.abs(p.z) > 2950) {
    p.heading = wrapAngle(p.heading + Math.PI);
    p.x = clamp(p.x, -2900, 2900);
    p.z = clamp(p.z, -2900, 2900);
  }
}
