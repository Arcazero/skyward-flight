// config.js — every tunable number for Skyward Flight in one place.
// World units are metres, speeds metres per second, angles radians.

export const WORLD = {
  halfSize: 3000, // terrain spans [-3000, 3000] in x and z
  cellSize: 50, // terrain grid spacing
  waterLevel: 2.5, // below this height the ground is lake
  maxViewDistance: 2600, // terrain is drawn out to this range
  fogDistance: 2400, // full fog at this range
};

export const PLANE = {
  name: 'Kestrel K-7',
  maxSpeed: 96, // m/s, flat out
  cruiseSpeed: 62,
  stallSpeed: 30, // below this the wing stops flying
  maxThrottleAccel: 26, // m/s^2 at full throttle
  dragCoefficient: 0.0042,
  rollRate: 1.9, // rad/s at full deflection
  pitchRate: 1.15,
  turnRate: 0.62, // heading change per second at full bank
  fuelSeconds: 520, // full tank at cruise throttle
  gearDrag: 1.6,
  landingMaxSink: 5.0, // m/s vertical speed allowed for a touchdown
  landingMaxSpeed: 62,
  landingMaxRoll: 0.28,
};

export const RUNWAYS = [
  {
    id: 'alder',
    name: 'Alder Field',
    cx: 0, cz: 0, // centre of the strip
    halfLength: 350, halfWidth: 18,
    elevation: 6,
    heading: 0, // strip runs along the z axis (north-south)
    flattenMargin: 170,
  },
  {
    id: 'islet',
    name: 'Islet Strip',
    cx: 1900, cz: -1500,
    halfLength: 280, halfWidth: 15,
    elevation: 8,
    heading: Math.PI / 2, // strip runs along the x axis (east-west)
    flattenMargin: 150,
  },
];

// Ring courses. Each ring: [x, y, z]; the ring faces the next ring on the
// course, and the last ring faces back toward the home runway.
export const RING_COURSES = {
  ringRun: {
    name: 'Ring Run',
    blurb: 'Thread all eight sky rings, then bring her home to Alder Field.',
    rings: [
      [0, 95, -700], [-460, 125, -1300], [-920, 165, -900], [-1120, 205, -180],
      [-720, 155, 520], [-40, 115, 920], [720, 145, 420], [420, 105, -320],
    ],
    radius: 21,
    timeLimit: 0, // no clock, fly it clean
    fuelStart: 1.0,
  },
  canyonDash: {
    name: 'Canyon Dash',
    blurb: 'Eight rings through the western ranges. Beat the clock — 150 seconds.',
    rings: [
      [-900, 190, -1700], [-1350, 210, -1200], [-1750, 235, -600], [-1950, 250, 100],
      [-1750, 235, 800], [-1350, 215, 1250], [-950, 185, 900], [-550, 150, 350],
    ],
    radius: 19,
    timeLimit: 150,
    fuelStart: 0.72,
  },
  islandLanding: {
    name: 'Island Landing',
    blurb: 'Cross the lake and set the Kestrel down gently on the Islet Strip.',
    rings: [],
    radius: 0,
    timeLimit: 0,
    fuelStart: 1.0,
  },
};

export const COLORS = {
  skyTop: [58, 110, 190],
  skyMid: [122, 168, 214],
  skyHorizon: [214, 228, 238],
  sun: [255, 244, 214],
  water: [52, 118, 158],
  sand: [198, 178, 128],
  grassLow: [96, 138, 66],
  grassHigh: [74, 110, 58],
  forest: [46, 88, 46],
  rock: [122, 110, 96],
  snow: [232, 236, 240],
  runway: [52, 56, 62],
  runwayMark: [235, 238, 240],
  ring: [255, 138, 42],
  ringPassed: [88, 214, 120],
  hudInk: [235, 244, 252],
  hudAmber: [255, 176, 66],
  hudRed: [255, 84, 72],
  panel: [18, 24, 32],
};
