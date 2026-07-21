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
  style: '/3d_buildings_style.json',
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



