// RICOCHET v2.6 — GameConfig
// Every gameplay number lives here so balance can be tuned in one place.
//
// COORDINATES
//   All gameplay runs in ROOM-LOCAL coordinates: the room is a box centred on the origin,
//   x and y in [-L, L] (square cross-section -> any of the 4 faces can be the floor),
//   z in [-W, W] (the axis the room turns around; the z faces are the glass walls).
//   Gravity is a vector in room coordinates that changes during an ARENA GRAVITY SHIFT.
//   "Canonical" coordinates = room coordinates as seen when the room is at rest after the last
//   shift: floor at y = -L, TEAM CYAN goal on the left (-x), TEAM PINK goal on the right (+x).
//   The stadium (crowd, roof, lights) is world-fixed; the room is drawn rotated inside it.

export const ROOM = {
  L: 11,             // half size in x and y  -> 22 m x 22 m cross-section
  W: 14,             // half size in z        -> 24 m wide (trial wider arena)
  CENTER_Y: 16,      // world height of the room centre (resting floor at world y = 5)
  CEILING_Y: -1.0,   // floor y=-11 => 10.0 m clear height (v2.7A)
};

// ARENA GRAVITY SHIFT: the room turns 90 deg "to the right" (clockwise in the reference view
// that looks along -z), always the same way, around the z axis.
export const GRAVITY_SHIFT = {
  enabled: false,    // v2.6.1: rotation removed from matches (set true to bring the ARENA GRAVITY SHIFT back)
  interval: 30,      // s of match time between shift starts (first at 30 s)
  duration: 6,       // s the 90 deg turn takes
  warning: 2,        // s of "ARENA SHIFT IN 2" before the turn
  settle: 1,         // s of "NEW FLOOR" after the turn
  floorCos: 0.695,   // a face counts as floor when its normal is within ~46 deg of "up"
};

// v2.6 catch rules (same for ground and air). Distance: eye -> disc centre.
// Tested along the disc's path between simulation sub-steps (no tunnelling).
export const CATCH = {
  range: 2.8,        // m
  angleDeg: 80,      // max angle between the aim and the disc
  window: 1.2,       // s after pressing CATCH
  rescue: 0.25,      // s: a press up to 0.25 s AFTER the disc was catchable still catches it
  cooldown: 0.15,     // s after a window that caught nothing
  suctionTime: 0.1,  // s visual pull of the disc into the hand on success
  justWindow: 0.15, // seconds either side of entering the catch zone
  counterWindow: 0.6,
  counterMultiplier: 1.15,
  shotBuffer: 0.15,
  approachSlack: 3.0,// a disc flying away is only catchable when closer than this
};
// The CPU has its own catch rules (reaction delay / skill on top, see CPU_PRESETS)
export const CPU_CATCH = { range: 2.6, angleDeg: 60, window: 0.5, cooldown: 0.8 };

export const CPU_PRESETS = {
  // reaction = perception delay (s); aimError = degrees of random spread
  EASY:   { reaction: 0.42, aimError: 5.0, catchSkill: 0.35, moveSpeed: 5.4, holdMin: 1.4, holdMax: 2.6, jumpChance: 0.15 },
  NORMAL: { reaction: 0.30, aimError: 3.2, catchSkill: 0.55, moveSpeed: 6.0, holdMin: 1.0, holdMax: 2.2, jumpChance: 0.25 },
  HARD:   { reaction: 0.20, aimError: 2.0, catchSkill: 0.75, moveSpeed: 6.5, holdMin: 0.8, holdMax: 1.8, jumpChance: 0.35 },
};

export const GOAL_SCALE = 1;

export const CONFIG = {
  GOAL_SCALE,
  VERSION: '2.9.1',
  MATCH_TIME: 180,
  SIM_STEP: 1 / 120,          // fixed simulation step (deterministic, frame-rate independent)

  // Half line: bodies can never cross into the other team's half (the disc can).
  // Disabled while the room turns; anyone left on the wrong side is warped home at the end.
  HALF_LINE_GAP: 0.4,
  HALF_LINE_PICKUP_REACH: 0.8,
  SPAWN_DIST: 6.5,            // canonical |x| of the spawn points

  // Player movement
  MOVE_SPEED: 7.0,
  AIR_SPEED_RATIO: 0.70,
  AIR_ACCEL: 11,
  DASH_SPEED: 16,
  DASH_TIME: 0.25,
  DASH_COOLDOWN: 3.0,
  JUMP_VELOCITY: 11.0,
  DOUBLE_JUMP_VELOCITY: 10.5,
  GRAVITY: 15.2,              // constant strength; only the direction changes
  FALL_MULT: 1.0,
  PLAYER_HEIGHT: 1.85,
  EYE_HEIGHT: 1.65,
  PLAYER_RADIUS: 0.4,
  LANDING_DIP: 0.06,
  MIN_AIR_FOR_RESET: 0.12,    // s in the air before a landing re-arms the air action

  // Disc
  DISC_RADIUS: 0.38,
  WALL_SHOT_TIME: 0.8,
  WALL_SHOT_MULTIPLIER: 1.1,
  WALL_SHOT_SPREAD: 0.35,
  CHARGE_TIME: 1.2,
  CHARGE_MULTIPLIER: 1.4,
  CURVE_SPEED: 14,
  CURVE_RATE: 25 * Math.PI / 180,
  CURVE_TIME: 1.0,
  SHOT_SPEED: 16,             // v2.6 (v2.5.2: 21). Fast shots can be added via SHOT_SPEEDS later
  SHOT_SPEEDS: { normal: 16 },
  BOUNCE_DAMP: 0.95,
  SAME_SURFACE_GUARD: 0.06,
  FLIGHT_LIFE: 6.0,
  HOLD_LIMIT: 7.0,
  LOOSE_RESET: 12.0,
  PICKUP_RADIUS: 1.2,
  MAX_POINTS: 3,

  // Goals: 2.9 m x 2.9 m round mouth (scoring edge = opening edge, ring outside it bounces)
  GOAL_Y: 2.0,
  GOAL_A: 4.0,
  GOAL_B: 1.25,                // low-ceiling trial: centre height above floor
  GOAL_SCORE_RADIUS: 4.0, // compatibility for CPU lateral aiming
  GOAL_RING_TUBE: 0.14,
  GOAL_VISUAL_RADIUS: 4.14,

  // Keepers: side-to-side only (along z), never track anything. Hitbox = their posed body.
  KEEPER_DEPTH: 1.6,          // stands this far in front of its goal wall
  KEEPER_RANGE: 2.9,
  KEEPER_PERIOD: 3.4,
  KEEPER_SCALE: 1.25,         // keepers are big (2.3 m); raised hands reach ~2.6 m and guard the upper middle
  KEEPER_SAVE_SPEED_KEEP: 0.55,
  KEEPER_REHOME_GUARD: 0.3,   // s without saves after a keeper moves to a new goal

  CPU: 'NORMAL',
  DEBUG_CATCH: false,
};

// Air shot accuracy (unchanged from v2.5.2)
export const AIR_SHOT_SPREAD = { ground: 0, rising: 2.5, apex: 1.2, falling: 2.0, apexBand: 2.0 };

// Wall kick: off any face that is a WALL for the current gravity (not floor / ceiling / panels)
export const WALL_KICK = {
  distance: 0.8, horizontalSpeed: 12.0, verticalBoost: 1.8,
  airControlLock: 0.15, lockedControl: 0.15, maxUsesPerJump: 1, goalMouthClear: 0.4,
  wallCos: 0.5,      // a face is a wall when |normal . up| < this
};

export function cpuCfg() { return CPU_PRESETS[CONFIG.CPU] || CPU_PRESETS.NORMAL; }

// Trick panels: FIXED in the room (v2.6). Positions are room-local. Because the room turns, each
// panel is close to the floor for two of the four orientations and high above it for the others.
// rotY / tiltX in degrees. Left/right as seen by that team's player at orientation 0.
export const PANEL_LAYOUT = {
  cyan: [ // concept: easy single ricochets
    { id: 'C1', role: '上段左・45°', pos: [-6.0, -5.0, -4.2], size: [2.56, 1.44, 0.16], rotY: 45 },
    { id: 'C2', role: '下段右・30°', pos: [-5.0, -7.6, 4.0], size: [2.72, 1.28, 0.16], rotY: -30 },
    { id: 'C3', role: '中央寄り・短い補助', pos: [-2.4, -6.8, -1.6], size: [1.28, 0.96, 0.16], rotY: 20 },
  ],
  pink: [ // concept: multi ricochets
    { id: 'K1', role: '上段右・鋭角', pos: [5.5, -4.8, -4.2], size: [2.24, 1.44, 0.16], rotY: 68, tiltX: 12 },
    { id: 'K2', role: '下段左・長め', pos: [5.6, -7.7, 4.4], size: [3.68, 1.12, 0.16], rotY: -12 },
    { id: 'K3', role: '中央外側・縦向き補助', pos: [7.6, -5.5, -3.0], size: [0.72, 2.4, 0.16], rotY: 10 },
  ],
};
export const PANELS = Object.entries(PANEL_LAYOUT).flatMap(([team, list]) => list.map(p => ({ ...p, team })));

export const TEAM = {
  cyan: { main: 0x2fe6ff, deep: 0x0aa6d6, css: '#35e8ff' },
  pink: { main: 0xff4fa3, deep: 0xd61f78, css: '#ff4fa3' },
};
