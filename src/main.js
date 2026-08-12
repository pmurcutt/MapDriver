const EYE_HEIGHT = 1.6;
const WALK_SPEED = 4;
const TURN_SPEED = 2;
const LOOK_AHEAD = 20;
const ORIGIN = [-1.276167, 51.6895];

const originMercator = maplibregl.MercatorCoordinate.fromLngLat(ORIGIN);
const metresToMercatorUnits = originMercator.meterInMercatorCoordinateUnits();
const player = { x: 0, y: 0, heading: Math.PI / 2 };

const map = new maplibregl.Map({
  center: ORIGIN,
  maxZoom: 24,
  zoom: 24,
  maxPitch: 89,
  pitch: 85,
  bearing: 0.0,
  container: 'map',
  canvasContextAttributes: { antialias: true },
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
  map.jumpTo(map.calculateCameraOptionsFromTo(eye, EYE_HEIGHT, ahead, 0));
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
  let step = 0;
  if (keysDown.has('KeyW')) step += WALK_SPEED * dt;
  if (keysDown.has('KeyS')) step -= WALK_SPEED * dt;
  player.x += Math.cos(player.heading) * step;
  player.y += Math.sin(player.heading) * step;

  updateCamera();
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
