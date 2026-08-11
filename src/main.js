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

// Arrow-key camera movement (setupKeyboardCameraControls) is the only
// enabled input - disable every other pointer/touch/keyboard interaction.
map.dragPan.disable();
map.dragRotate.disable();
map.scrollZoom.disable();
map.boxZoom.disable();
map.doubleClickZoom.disable();
map.touchZoomRotate.disable();
map.touchPitch.disable();
map.keyboard.disable();

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

// Up/Down move the camera's own ground position forward/back along the
// direction it's currently facing. Left/Right yaw the view about that same
// fixed camera position (rather than orbiting the far-off ground point the
// map's `center` refers to), using the transform's own camera-placement
// math so the eye position is exactly preserved. Camera altitude is pinned
// throughout, so it never changes.
function setupKeyboardCameraControls() {
  const SPEED_MPS = 8; // ground speed at the current zoom level
  const ROTATE_DEG_PER_SEC = 60; // yaw rate
  const EARTH_RADIUS_M = 6378137;
  const FORWARD_KEYS = { ArrowUp: 1, ArrowDown: -1 };
  const ROTATE_KEYS = { ArrowLeft: -1, ArrowRight: 1 };

  const pressedKeys = new Set();
  let lastFrameTime = null;

  window.addEventListener('keydown', (event) => {
    if (event.key in FORWARD_KEYS || event.key in ROTATE_KEYS) {
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
    let rotateInput = 0;
    for (const key of pressedKeys) {
      forwardInput += FORWARD_KEYS[key] || 0;
      rotateInput += ROTATE_KEYS[key] || 0;
    }

    if (forwardInput !== 0 || rotateInput !== 0) {
      const transform = map.transform;
      const pitch = map.getPitch();
      const bearing = map.getBearing() + rotateInput * ROTATE_DEG_PER_SEC * dt;
      const cameraAltitude = transform.getCameraAltitude();
      let cameraLngLat = transform.getCameraLngLat();

      if (forwardInput !== 0) {
        const bearingRad = (bearing * Math.PI) / 180;
        const east = forwardInput * Math.sin(bearingRad);
        const north = forwardInput * Math.cos(bearingRad);
        const distanceM = SPEED_MPS * dt;

        const dLat = ((north * distanceM) / EARTH_RADIUS_M) * (180 / Math.PI);
        const dLng =
          ((east * distanceM) /
            (EARTH_RADIUS_M * Math.cos((cameraLngLat.lat * Math.PI) / 180))) *
          (180 / Math.PI);

        cameraLngLat = new maplibregl.LngLat(
          cameraLngLat.lng + dLng,
          cameraLngLat.lat + dLat,
        );
      }

      // Solve for the center/zoom that puts the camera back at
      // cameraLngLat/cameraAltitude under the new bearing - this is what
      // keeps the eye fixed (or moves it only by the amount above) while
      // rotating, instead of orbiting it around the map center.
      const { center, zoom } = transform.calculateCenterFromCameraLngLatAlt(
        cameraLngLat,
        cameraAltitude,
        bearing,
        pitch,
      );

      map.jumpTo({ center, zoom, bearing });
    }

    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}

map.on('load', () => {
  setupSky();
  setupKeyboardCameraControls();
});



