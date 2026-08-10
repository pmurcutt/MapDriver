const map = new maplibregl.Map({
  center: [-1.276167, 51.6895], // [-74.0066, 40.7135],
  maxZoom: 22,
  zoom: 22,
  maxPitch: 89,
  pitch: 85,
  bearing: -17.6,
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

// Moves the camera along the ground plane in the direction the map is
// currently facing (its bearing), so forward/back/left/right always match
// what the user sees on screen. Zoom and pitch are left untouched, so
// altitude never changes - only the map center shifts.
function setupKeyboardCameraControls() {
  const SPEED_MPS = 8; // ground speed at the current zoom level
  const EARTH_RADIUS_M = 6378137;
  const MOVE_KEYS = {
    ArrowUp: { forward: 1, right: 0 },
    ArrowDown: { forward: -1, right: 0 },
    ArrowLeft: { forward: 0, right: -1 },
    ArrowRight: { forward: 0, right: 1 },
  };

  const pressedKeys = new Set();
  let lastFrameTime = null;

  map.keyboard.disable(); // avoid double handling with the built-in arrow-key panning

  window.addEventListener('keydown', (event) => {
    if (MOVE_KEYS[event.key]) {
      pressedKeys.add(event.key);
      event.preventDefault();
    }
  });

  window.addEventListener('keyup', (event) => {
    pressedKeys.delete(event.key);
  });

  function tick(timestamp) {
    if (lastFrameTime === null) lastFrameTime = timestamp;
    const dt = (timestamp - lastFrameTime) / 1000;
    lastFrameTime = timestamp;

    let forwardInput = 0;
    let rightInput = 0;
    for (const key of pressedKeys) {
      forwardInput += MOVE_KEYS[key].forward;
      rightInput += MOVE_KEYS[key].right;
    }

    if (forwardInput !== 0 || rightInput !== 0) {
      const magnitude = Math.hypot(forwardInput, rightInput);
      forwardInput /= magnitude;
      rightInput /= magnitude;

      const bearingRad = (map.getBearing() * Math.PI) / 180;
      // Forward = facing direction (bearing), right = facing + 90deg.
      const east =
        forwardInput * Math.sin(bearingRad) + rightInput * Math.cos(bearingRad);
      const north =
        forwardInput * Math.cos(bearingRad) - rightInput * Math.sin(bearingRad);

      const distanceM = SPEED_MPS * dt;
      const center = map.getCenter();
      const dLat = ((north * distanceM) / EARTH_RADIUS_M) * (180 / Math.PI);
      const dLng =
        ((east * distanceM) /
          (EARTH_RADIUS_M * Math.cos((center.lat * Math.PI) / 180))) *
        (180 / Math.PI);

      map.jumpTo({ center: [center.lng + dLng, center.lat + dLat] });
    }

    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}

map.on('load', () => {
  setupSky();
  setupKeyboardCameraControls();
});



