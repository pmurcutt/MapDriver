const CAMERA_HEIGHT = 1.6;
// Approximate average-car physics: forward accel gets to 100km/h in ~9s,
// braking is a firm (not panic) stop, reverse is weaker and gear-limited.
const FORWARD_ACCEL = 3; // m/s^2
const BRAKE_DECEL = 12; // m/s^2
const REVERSE_ACCEL = 1.5; // m/s^2
const REVERSE_MAX_SPEED = 8; // m/s
const TURN_SPEED = 2;
const LOOK_AHEAD = 20;
const ORIGIN = [-1.276167, 51.6895];

// Top speed depends on what's under the vehicle, sampled as a screen pixel
// colour and matched against the neon_v1_1.json landcover/road fill colours.
const ONROAD_MAX_SPEED = 60; // m/s, tarmac (road line-color)
const OFFROAD_MAX_SPEED = 15; // m/s, default ground when no other match
const ROUGH_MAX_SPEED = 5; // m/s, ice/wood/wetland/sand
const TERRAIN_OVERSPEED_DECEL = 40; // m/s^2, dragged down hard when over cap
const COLOR_MATCH_TOLERANCE = 12;
const ROAD_COLOR = [0x00, 0x00, 0xff];
const ROUGH_COLORS = [
  [0x39, 0xff, 0x14], // wood
  [0x05, 0xf6, 0xf6], // ice
  [0xe6, 0xff, 0x66], // wetland
  [0xff, 0xff, 0x33], // sand
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

function getTerrainMaxSpeed() {
  const canvas = map.getCanvas();
  sampleCtx.drawImage(canvas, canvas.width / 2, canvas.height - 1, 1, 1, 0, 0, 1, 1);
  const pixel = sampleCtx.getImageData(0, 0, 1, 1).data;
  if (colorsMatch(pixel, ROAD_COLOR)) return ONROAD_MAX_SPEED;
  if (ROUGH_COLORS.some((color) => colorsMatch(pixel, color)))
    return ROUGH_MAX_SPEED;
  return OFFROAD_MAX_SPEED;
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

let lastFrameTime = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - lastFrameTime) / 1000);
  lastFrameTime = now;

  if (keysDown.has('KeyA')) player.heading += TURN_SPEED * dt;
  if (keysDown.has('KeyD')) player.heading -= TURN_SPEED * dt;

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
    const terrainMaxSpeed = getTerrainMaxSpeed();
    if (player.speed > terrainMaxSpeed) {
      player.speed = Math.max(
        terrainMaxSpeed,
        player.speed - TERRAIN_OVERSPEED_DECEL * dt,
      );
    } else {
      player.speed = Math.min(
        terrainMaxSpeed,
        player.speed + FORWARD_ACCEL * dt,
      );
    }
  }
  const step = player.speed * dt;
  player.x += Math.cos(player.heading) * step;
  player.y += Math.sin(player.heading) * step;

  updateCamera();
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
