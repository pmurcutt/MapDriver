const CAMERA_HEIGHT = 1.6;
// Forward accel follows a car-like gear curve: strong at the start of each
// gear, tapering off logarithmically as speed climbs through it, then a
// fresh (lower) peak at the next gear. Braking is a firm (not panic) stop;
// reverse is weaker and gear-limited.
const KPH_TO_MPS = 1000 / 3600;
const GEARS = [
  { minSpeed: 0, peakAccel: 5.0 }, // 1st: 0-30 km/h
  { minSpeed: 30 * KPH_TO_MPS, peakAccel: 3.5 }, // 2nd: 30-70 km/h
  { minSpeed: 70 * KPH_TO_MPS, peakAccel: 4.5 }, // 3rd: 70-120 km/h
  { minSpeed: 120 * KPH_TO_MPS, peakAccel: 3.8 }, // 4th: 120-160 km/h
  { minSpeed: 160 * KPH_TO_MPS, peakAccel: 3.2 }, // 5th: 160-300 km/h
  { minSpeed: 300 * KPH_TO_MPS, peakAccel: 2.6 }, // 6th: 300 km/h and up
];

const GEAR_KICK_WIDTH = 0.1; // fraction of gear width covered by the upshift kick
const GEAR_KICK_GAIN = 2.5; // peak gain right at the start of a gear, ramping to 1
const GEAR_END_GAIN = 0.5; // gain logarithmically reached by the end of the gear

function getGearIndex(speed) {
  let index = 0;
  for (let i = 0; i < GEARS.length; i++) {
    if (speed >= GEARS[i].minSpeed) index = i;
    else break;
  }
  return index;
}

function getGearRange(speed) {
  const index = getGearIndex(speed);
  const start = GEARS[index].minSpeed;
  const end =
    index + 1 < GEARS.length ? GEARS[index + 1].minSpeed : ONROAD_MAX_SPEED;
  return { start, end };
}

function getGearGain(speed) {
  const { start, end } = getGearRange(speed);
  const width = end - start;
  const t = width > 0 ? Math.min(1, Math.max(0, (speed - start) / width)) : 0;

  if (t < GEAR_KICK_WIDTH) {
    return GEAR_KICK_GAIN + (1 - GEAR_KICK_GAIN) * (t / GEAR_KICK_WIDTH);
  }
  // Logarithmic falloff from 1 down to GEAR_END_GAIN across the rest of the gear.
  const u = (t - GEAR_KICK_WIDTH) / (1 - GEAR_KICK_WIDTH);
  return 1 - (1 - GEAR_END_GAIN) * Math.log(1 + u * (Math.E - 1));
}

function getForwardAccel(speed) {
  const clampedSpeed = Math.max(0, speed);
  return (
    GEARS[getGearIndex(clampedSpeed)].peakAccel * getGearGain(clampedSpeed)
  );
}

const BRAKE_DECEL = 12; // m/s^2
const REVERSE_ACCEL = 1.5; // m/s^2
const REVERSE_MAX_SPEED = 8; // m/s
const HANDBRAKE_MIN_SPEED = 13; // m/s, above this S+turn doubles the turn rate
const HANDBRAKE_TURN_MULTIPLIER = 1.5;
const LOOK_AHEAD = 20;
const ORIGIN = [-1.276167, 51.6895];

// Top speed depends on what's under the vehicle, sampled as a screen pixel
// colour and matched against the neon_v1_1.json landcover/road fill colours.
const ONROAD_MAX_SPEED_KPH = 600;
const ONROAD_MAX_SPEED = KPH_TO_MPS * ONROAD_MAX_SPEED_KPH; // tarmac (road line-color)
const OFFROAD_MAX_SPEED = KPH_TO_MPS * 60; // default ground when no other match
const ROUGH_MAX_SPEED = KPH_TO_MPS * 30; // m/s, ice/wood/wetland/sand
const IMPASSABLE_MAX_SPEED = 0; // m/s, water/buildings; reverse still works
const TERRAIN_OVERSPEED_DECEL = 40; // m/s^2, dragged down hard when over cap

// Turn rate per terrain, tuned independently of top speed.
const ONROAD_TURN_RATE = 1; // rad/s, tarmac (road line-color)
const OFFROAD_TURN_RATE = 0.25; // rad/s, default ground when no other match
const ROUGH_TURN_RATE = 0.13; // rad/s, ice/wood/wetland/sand; also used for
// impassable terrain (steering still works while stopped)
const COLOR_MATCH_TOLERANCE = 12;
const ROAD_COLOR = [0x00, 0x00, 0xff];
const ROUGH_COLORS = [
  [0x39, 0xff, 0x14], // wood
  [0x05, 0xf6, 0xf6], // ice
  [0xe6, 0xff, 0x66], // wetland
  [0xff, 0xff, 0x33], // sand
];
const IMPASSABLE_COLORS = [
  [0x00, 0xff, 0xff], // water & building interiors
];

const originMercator = maplibregl.MercatorCoordinate.fromLngLat(ORIGIN);
const metresToMercatorUnits = originMercator.meterInMercatorCoordinateUnits();
const player = { x: 0, y: 0, heading: Math.PI / 2, speed: 0 };

const map = new maplibregl.Map({
  center: ORIGIN,
  maxZoom: 24,
  zoom: 24,
  maxPitch: 89,
  pitch: 85,
  bearing: 0.0,
  container: 'map',
  canvasContextAttributes: { antialias: true, preserveDrawingBuffer: true },
  hash: true,
  style: '/neon_v1_1.json',
});

function setupSky() {
  map.setSky({
    'sky-color': '#d98af2',
    'sky-horizon-blend': 0.8,
    'horizon-color': '#bc1ff0',
    'horizon-fog-blend': 0.9,
    'fog-color': '#000000',
    'fog-ground-blend': 0.0,
  });
}

map.on('load', () => {
  setupSky();
});

function toLngLat(x, y) {
  return new maplibregl.MercatorCoordinate(
    originMercator.x + x * metresToMercatorUnits,
    originMercator.y - y * metresToMercatorUnits,
  ).toLngLat();
}

function updateCamera() {
  const eye = toLngLat(player.x, player.y);
  const ahead = toLngLat(
    player.x + Math.cos(player.heading) * LOOK_AHEAD,
    player.y + Math.sin(player.heading) * LOOK_AHEAD,
  );
  map.jumpTo(map.calculateCameraOptionsFromTo(eye, CAMERA_HEIGHT, ahead, 0));
}

// 1x1 offscreen canvas used to read back the colour under the vehicle each
// frame; preserveDrawingBuffer above keeps the WebGL canvas readable outside
// its own render callback.
const sampleCanvas = document.createElement('canvas');
sampleCanvas.width = 1;
sampleCanvas.height = 1;
const sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true });

function colorsMatch(a, b) {
  return (
    Math.abs(a[0] - b[0]) <= COLOR_MATCH_TOLERANCE &&
    Math.abs(a[1] - b[1]) <= COLOR_MATCH_TOLERANCE &&
    Math.abs(a[2] - b[2]) <= COLOR_MATCH_TOLERANCE
  );
}

const TERRAIN_SAMPLE_INTERVAL_MS = 100; // cap canvas colour sampling at 10Hz
let lastTerrainSampleTime = -Infinity;
let cachedTerrainMaxSpeed = OFFROAD_MAX_SPEED;
let cachedTerrainTurnRate = OFFROAD_TURN_RATE;

function sampleTerrain() {
  const canvas = map.getCanvas();
  sampleCtx.drawImage(canvas, canvas.width / 2, canvas.height - 1, 1, 1, 0, 0, 1, 1);
  const pixel = sampleCtx.getImageData(0, 0, 1, 1).data;
  if (IMPASSABLE_COLORS.some((color) => colorsMatch(pixel, color)))
    return { maxSpeed: IMPASSABLE_MAX_SPEED, turnRate: ROUGH_TURN_RATE };
  if (colorsMatch(pixel, ROAD_COLOR))
    return { maxSpeed: ONROAD_MAX_SPEED, turnRate: ONROAD_TURN_RATE };
  if (ROUGH_COLORS.some((color) => colorsMatch(pixel, color)))
    return { maxSpeed: ROUGH_MAX_SPEED, turnRate: ROUGH_TURN_RATE };
  return { maxSpeed: OFFROAD_MAX_SPEED, turnRate: OFFROAD_TURN_RATE };
}

function getTerrain(now) {
  if (now - lastTerrainSampleTime >= TERRAIN_SAMPLE_INTERVAL_MS) {
    lastTerrainSampleTime = now;
    ({ maxSpeed: cachedTerrainMaxSpeed, turnRate: cachedTerrainTurnRate } =
      sampleTerrain());
  }
  return { maxSpeed: cachedTerrainMaxSpeed, turnRate: cachedTerrainTurnRate };
}

// Keyboard on desktop, on-screen buttons on touch, both feed the same key set.
const keysDown = new Set();
addEventListener('keydown', (event) => keysDown.add(event.code));
addEventListener('keyup', (event) => keysDown.delete(event.code));
for (const button of document.querySelectorAll('#controls button')) {
  const code = button.dataset.key;
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    // Capture so the single lostpointercapture event below covers release,
    // leaving the button, and touch cancellation.
    button.setPointerCapture(event.pointerId);
    keysDown.add(code);
  });
  button.addEventListener('lostpointercapture', () => keysDown.delete(code));
}

// Low-res gauge: small canvas backing store, scaled up by CSS with
// image-rendering: pixelated so it reads as a chunky retro dial.
const SPEEDO_MAX_KPH = ONROAD_MAX_SPEED_KPH;
const MPS_TO_KPH = 3.6;
const speedoCanvas = document.getElementById('speedometer');
const speedoCtx = speedoCanvas.getContext('2d');
speedoCtx.imageSmoothingEnabled = false;

function speedoAngle(kph) {
  // pi (pointing left, 0 km/h) sweeping clockwise up and over to
  // 0 (pointing right, SPEEDO_MAX_KPH).
  return Math.PI - (Math.min(kph, SPEEDO_MAX_KPH) / SPEEDO_MAX_KPH) * Math.PI;
}

function drawSpeedometer(kph) {
  const w = speedoCanvas.width;
  const h = speedoCanvas.height;
  const cx = w / 2;
  const cy = h - 6;
  const radius = h - 14;

  speedoCtx.fillStyle = '#111';
  speedoCtx.fillRect(0, 0, w, h);

  speedoCtx.strokeStyle = '#0f0';
  speedoCtx.lineWidth = 2;
  for (let tick = 0; tick <= SPEEDO_MAX_KPH; tick += 50) {
    const angle = speedoAngle(tick);
    const isMajor = tick % 100 === 0;
    const innerRadius = isMajor ? radius - 12 : radius - 7;
    speedoCtx.beginPath();
    speedoCtx.moveTo(cx + innerRadius * Math.cos(angle), cy - innerRadius * Math.sin(angle));
    speedoCtx.lineTo(cx + radius * Math.cos(angle), cy - radius * Math.sin(angle));
    speedoCtx.stroke();
    if (isMajor) {
      const labelRadius = radius - 22;
      speedoCtx.fillStyle = '#0f0';
      speedoCtx.font = '9px monospace';
      speedoCtx.textAlign = 'center';
      speedoCtx.textBaseline = 'middle';
      speedoCtx.fillText(
        String(tick),
        cx + labelRadius * Math.cos(angle),
        cy - labelRadius * Math.sin(angle),
      );
    }
  }

  const needleAngle = speedoAngle(kph);
  speedoCtx.strokeStyle = '#f00';
  speedoCtx.lineWidth = 3;
  speedoCtx.beginPath();
  speedoCtx.moveTo(cx, cy);
  speedoCtx.lineTo(
    cx + (radius - 10) * Math.cos(needleAngle),
    cy - (radius - 10) * Math.sin(needleAngle),
  );
  speedoCtx.stroke();

  speedoCtx.fillStyle = '#f00';
  speedoCtx.beginPath();
  speedoCtx.arc(cx, cy, 4, 0, 2 * Math.PI);
  speedoCtx.fill();

  speedoCtx.fillStyle = '#0f0';
  speedoCtx.font = '14px monospace';
  speedoCtx.textAlign = 'center';
  speedoCtx.textBaseline = 'alphabetic';
  speedoCtx.fillText(`${Math.round(kph)} KPH`, cx, cy - radius / 3);
}

// Rev counter: needle sits at ~20% full at the bottom of the current gear's
// speed band and climbs to ~90% at the top of it, so it reads like an RPM
// gauge even though gears here are just acceleration bands. Redline (top
// 20% of the dial) turns everything red as a shift warning.
const REV_REDLINE_FRACTION = 0.8;
const revCanvas = document.getElementById('revcounter');
const revCtx = revCanvas.getContext('2d');
revCtx.imageSmoothingEnabled = false;

function revAngle(fraction) {
  return Math.PI - Math.min(Math.max(fraction, 0), 1) * Math.PI;
}

function getRevFraction(speed) {
  const clampedSpeed = Math.max(0, speed);
  const { start, end } = getGearRange(clampedSpeed);
  const t = end > start ? (clampedSpeed - start) / (end - start) : 0;
  return Math.min(1, Math.max(0, 0.2 + 0.7 * t));
}

function drawRevCounter(fraction) {
  const w = revCanvas.width;
  const h = revCanvas.height;
  const cx = w / 2;
  const cy = h - 6;
  const radius = h - 14;
  const isRedline = fraction >= REV_REDLINE_FRACTION;
  const needleColor = isRedline ? '#f00' : '#0f0';

  revCtx.fillStyle = '#111';
  revCtx.fillRect(0, 0, w, h);

  revCtx.lineWidth = 2;
  for (let tick = 0; tick <= 100; tick += 20) {
    const tickFraction = tick / 100;
    const angle = revAngle(tickFraction);
    revCtx.strokeStyle = tickFraction >= REV_REDLINE_FRACTION ? '#f00' : '#0f0';
    const innerRadius = radius - 12;
    revCtx.beginPath();
    revCtx.moveTo(cx + innerRadius * Math.cos(angle), cy - innerRadius * Math.sin(angle));
    revCtx.lineTo(cx + radius * Math.cos(angle), cy - radius * Math.sin(angle));
    revCtx.stroke();
  }

  const needleAngle = revAngle(fraction);
  revCtx.strokeStyle = needleColor;
  revCtx.lineWidth = 3;
  revCtx.beginPath();
  revCtx.moveTo(cx, cy);
  revCtx.lineTo(
    cx + (radius - 10) * Math.cos(needleAngle),
    cy - (radius - 10) * Math.sin(needleAngle),
  );
  revCtx.stroke();

  revCtx.fillStyle = needleColor;
  revCtx.beginPath();
  revCtx.arc(cx, cy, 4, 0, 2 * Math.PI);
  revCtx.fill();

  revCtx.font = '10px monospace';
  revCtx.textAlign = 'center';
  revCtx.textBaseline = 'alphabetic';
  revCtx.fillText('REV', cx, cy - radius / 3);
}

let lastFrameTime = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - lastFrameTime) / 1000);
  lastFrameTime = now;

  const { maxSpeed: terrainMaxSpeed, turnRate: terrainTurnRate } =
    getTerrain(now);
  const handbrakeTurning =
    keysDown.has('KeyS') &&
    (keysDown.has('KeyA') || keysDown.has('KeyD')) &&
    player.speed > HANDBRAKE_MIN_SPEED;
  const turnRate =
    terrainTurnRate * (handbrakeTurning ? HANDBRAKE_TURN_MULTIPLIER : 1);
  if (keysDown.has('KeyA')) player.heading += turnRate * dt;
  if (keysDown.has('KeyD')) player.heading -= turnRate * dt;

  if (terrainMaxSpeed === IMPASSABLE_MAX_SPEED && player.speed > 0) {
    player.speed = 0; // collision: stop dead instead of the usual gradual decel
  }

  if (keysDown.has('KeyS')) {
    if (player.speed > 0) {
      player.speed = Math.max(0, player.speed - BRAKE_DECEL * dt);
    } else {
      player.speed = Math.max(
        -REVERSE_MAX_SPEED,
        player.speed - REVERSE_ACCEL * dt,
      );
    }
  } else {
    if (player.speed > terrainMaxSpeed) {
      player.speed = Math.max(
        terrainMaxSpeed,
        player.speed - TERRAIN_OVERSPEED_DECEL * dt,
      );
    } else {
      player.speed = Math.min(
        terrainMaxSpeed,
        player.speed + getForwardAccel(player.speed) * dt,
      );
    }
  }
  const step = player.speed * dt;
  player.x += Math.cos(player.heading) * step;
  player.y += Math.sin(player.heading) * step;

  updateCamera();
  drawSpeedometer(Math.abs(player.speed) * MPS_TO_KPH);
  drawRevCounter(getRevFraction(player.speed));
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
