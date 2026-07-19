const map = new maplibregl.Map({
  center: [-1.276167, 51.6895], // [-74.0066, 40.7135],
  maxZoom: 22,
  zoom: 22,
  maxPitch: 85,
  pitch: 85,
  bearing: -17.6,
  container: 'map',
  canvasContextAttributes: { antialias: true },
  hash: true,
  style: {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: ['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '&copy; OpenStreetMap Contributors',
        maxzoom: 19,
      },
      // Use a different source for terrain and hillshade layers, to improve render quality
      terrainSource: {
        type: 'raster-dem',
        url: 'https://tiles.mapterhorn.com/tilejson.json',
      },
      hillshadeSource: {
        type: 'raster-dem',
        url: 'https://tiles.mapterhorn.com/tilejson.json',
      },
    },
    layers: [
      {
        id: 'osm',
        type: 'raster',
        source: 'osm',
      },
      {
        id: 'hills',
        type: 'hillshade',
        source: 'hillshadeSource',
        layout: { visibility: 'visible' },
        paint: { 'hillshade-shadow-color': '#473B24' },
      },
    ],
    terrain: {
      source: 'terrainSource',
      exaggeration: 1,
    },
  },
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

// The 'building' layer in the streets vector source contains building-height
// data from OpenStreetMap.
map.on('load', () => {

  setupSky();

  // Insert the layer beneath any symbol layer.
  const layers = map.getStyle().layers;

  /*
  let layerIdx = 0;
  while (layerIdx < layers.length){
    if (layers[layerIdx].type === 'symbol' || layers[layerIdx].layout['text-field']) {
      map.remove(layers[layerIdx].id);
      layers = map.getStyle().layers;
      break;
    }

  }
  */

  let labelLayerId;
  for (let i = 0; i < layers.length; i++) {
    if (layers[i].type === 'symbol' && layers[i].layout['text-field']) {
      labelLayerId = layers[i].id;
      break;
    }
  }

  map.addSource('openfreemap', {
    url: `https://tiles.openfreemap.org/planet`,
    type: 'vector',
  });

  map.addLayer(
    {
      id: '3d-buildings',
      source: 'openfreemap',
      'source-layer': 'building',
      type: 'fill-extrusion',
      minzoom: 15,
      filter: ['!=', ['get', 'hide_3d'], true],
      paint: {
        'fill-extrusion-color': [
          'interpolate',
          ['linear'],
          ['get', 'render_height'],
          0,
          'lightgray',
          200,
          'royalblue',
          400,
          'lightblue',
        ],
        'fill-extrusion-height': [
          'interpolate',
          ['linear'],
          ['zoom'],
          19,
          0,
          20,
          ['get', 'render_height'],
        ],
        'fill-extrusion-base': [
          'case',
          ['>=', ['get', 'zoom'], 20],
          ['get', 'render_min_height'],
          0,
        ],
      },
    },
    labelLayerId,
  );
});



