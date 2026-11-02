import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '8000', 10);
const STORAGE_PATH = process.env.STORAGE_PATH || path.join(__dirname, '..', 'storage');

// Load datasets
const citiesPath = path.join(__dirname, 'data', 'cities.json');
const emergenciesPath = path.join(__dirname, 'data', 'emergencies.json');
const survivalPath = path.join(__dirname, 'data', 'survival.json');

const cities = fs.existsSync(citiesPath) ? JSON.parse(fs.readFileSync(citiesPath, 'utf8')) : [];
const emergencies = fs.existsSync(emergenciesPath) ? JSON.parse(fs.readFileSync(emergenciesPath, 'utf8')) : [];
const survivalManuals = fs.existsSync(survivalPath) ? JSON.parse(fs.readFileSync(survivalPath, 'utf8')) : [];

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.pmtiles': 'application/octet-stream',
};

// Helper: Normalize accents for search
function normalizeStr(str) {
  return str ? str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() : '';
}

// Haversine distance formula
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Distance from point P to line segment VW
function distToSegment(px, py, vx, vy, wx, wy) {
  const l2 = (wx - vx) ** 2 + (wy - vy) ** 2;
  if (l2 === 0) return haversine(py, px, vy, vx);
  let t = ((px - vx) * (wx - vx) + (py - vy) * (wy - vy)) / l2;
  t = Math.max(0, Math.min(1, t));
  return haversine(py, px, vy + t * (wy - vy), vx + t * (wx - vx));
}

// Generate realistic offline tactical corridor
function generateCorridorRoute(fromLat, fromLng, toLat, toLng, profile = 'driving') {
  const directDist = haversine(fromLat, fromLng, toLat, toLng);
  const winding = profile === 'walking' ? 1.18 : 1.25;
  const distanceKm = Math.round(directDist * winding * 10) / 10;

  let speedKmh = 75;
  if (profile === 'tactical') speedKmh = 48;
  if (profile === 'walking') speedKmh = 4.5;

  const durationMin = Math.round((distanceKm / speedKmh) * 60);
  const fuelLiters = profile === 'walking' ? 0 : Math.round((distanceKm / (profile === 'tactical' ? 8 : 12)) * 10) / 10;
  const waterLiters = profile === 'walking' ? Math.max(0.5, Math.round(((durationMin / 60) / 8) * 3.5 * 10) / 10) : 0;
  const caloriesKcal = profile === 'walking' ? Math.round((durationMin / 60) * 380) : 0;

  // Find intermediate cities near corridor
  const intermediate = [];
  const minLat = Math.min(fromLat, toLat) - 0.25;
  const maxLat = Math.max(fromLat, toLat) + 0.25;
  const minLng = Math.min(fromLng, toLng) - 0.25;
  const maxLng = Math.max(fromLng, toLng) + 0.25;

  for (const c of cities) {
    if (c.lat >= minLat && c.lat <= maxLat && c.lng >= minLng && c.lng <= maxLng) {
      const d = distToSegment(c.lng, c.lat, fromLng, fromLat, toLng, toLat);
      if (d <= 25 && haversine(c.lat, c.lng, fromLat, fromLng) > 5 && haversine(c.lat, c.lng, toLat, toLng) > 5) {
        const distFromStart = haversine(fromLat, fromLng, c.lat, c.lng);
        intermediate.push({ ...c, distFromStart });
      }
    }
  }

  intermediate.sort((a, b) => a.distFromStart - b.distFromStart);
  const pickedWaypoints = intermediate.slice(0, 6);

  const coords = [[fromLng, fromLat]];
  pickedWaypoints.forEach(w => coords.push([w.lng, w.lat]));
  coords.push([toLng, toLat]);

  const steps = [];
  steps.push({
    instruction: `Partida do ponto de origem em direção ao corredor rodoviário`,
    distanceKm: Math.round((pickedWaypoints.length > 0 ? pickedWaypoints[0].distFromStart : distanceKm) * 10) / 10,
    type: 'depart'
  });

  for (let i = 0; i < pickedWaypoints.length; i++) {
    const wp = pickedWaypoints[i];
    const nextDist = i < pickedWaypoints.length - 1 ? 
      Math.round(haversine(wp.lat, wp.lng, pickedWaypoints[i+1].lat, pickedWaypoints[i+1].lng) * winding * 10) / 10 :
      Math.round(haversine(wp.lat, wp.lng, toLat, toLng) * winding * 10) / 10;

    steps.push({
      instruction: `Passagem por ${wp.name} (${wp.state}) &bull; Apoio: SAMU 192 / PM 190 / DDD ${wp.ddd || '--'}`,
      distanceKm: nextDist,
      type: 'waypoint',
      cityName: wp.name,
      state: wp.state
    });
  }

  steps.push({
    instruction: `Aproximação e chegada ao ponto de destino`,
    distanceKm: 0,
    type: 'arrive'
  });

  return {
    source: 'offline_corridor',
    profile,
    distanceKm,
    durationMin,
    fuelLiters,
    waterLiters,
    caloriesKcal,
    geometry: {
      type: 'LineString',
      coordinates: coords
    },
    steps
  };
}

const server = http.createServer((req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(urlObj.pathname);

  // CORS headers for offline flexibility
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // 1. API: Status
  if (pathname === '/api/status') {
    const memory = process.memoryUsage();
    let pmtilesExists = false;
    let pmtilesSize = 0;
    const streetsPath = path.join(STORAGE_PATH, 'maps', 'brazil-streets.pmtiles');
    const basePath = path.join(STORAGE_PATH, 'maps', 'global-min_2025-12.pmtiles');
    const pmtilesPath = fs.existsSync(streetsPath) ? streetsPath : basePath;
    if (fs.existsSync(pmtilesPath)) {
      pmtilesExists = true;
      pmtilesSize = fs.statSync(pmtilesPath).size;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'online',
      version: '1.0.0',
      system: 'NOMAD Brasil',
      uptimeSeconds: Math.floor(process.uptime()),
      memoryRssMb: Math.round(memory.rss / 1024 / 1024),
      datasets: {
        citiesCount: cities.length,
        emergenciesCount: emergencies.length,
        survivalCount: survivalManuals.length,
        pmtilesAvailable: pmtilesExists,
        pmtilesSizeBytes: pmtilesSize
      }
    }));
    return;
  }

  // 2. API: Cities search
  if (pathname === '/api/cities') {
    const q = normalizeStr(urlObj.searchParams.get('q') || '');
    const state = (urlObj.searchParams.get('state') || '').toUpperCase();
    const limit = parseInt(urlObj.searchParams.get('limit') || '30', 10);

    let results = cities;
    if (state) {
      results = results.filter(c => c.state === state);
    }
    if (q) {
      results = results.filter(c => {
        const normName = normalizeStr(c.name);
        const normState = normalizeStr(c.state);
        return normName.includes(q) || normState === q;
      }).sort((a, b) => {
        const aNorm = normalizeStr(a.name);
        const bNorm = normalizeStr(b.name);
        const aStarts = aNorm.startsWith(q);
        const bStarts = bNorm.startsWith(q);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        if (a.capital && !b.capital) return -1;
        if (!a.capital && b.capital) return 1;
        return a.name.localeCompare(b.name);
      });
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(results.slice(0, limit)));
    return;
  }

  // 3. API: Emergencies
  if (pathname === '/api/emergencies') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(emergencies));
    return;
  }

  // 4. API: Survival Manuals
  if (pathname === '/api/survival') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(survivalManuals));
    return;
  }

  // 4.1 API: Route calculation (Online OSRM + Permanent Disk Cache + Offline Tactical Corridor)
  if (pathname === '/api/route') {
    const fromLat = parseFloat(urlObj.searchParams.get('fromLat'));
    const fromLng = parseFloat(urlObj.searchParams.get('fromLng'));
    const toLat = parseFloat(urlObj.searchParams.get('toLat'));
    const toLng = parseFloat(urlObj.searchParams.get('toLng'));
    const profile = urlObj.searchParams.get('profile') || 'driving';

    if (isNaN(fromLat) || isNaN(fromLng) || isNaN(toLat) || isNaN(toLng)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Coordenadas de origem ou destino inválidas' }));
      return;
    }

    const routesCacheDir = path.join(__dirname, 'data', 'routes_cache');
    if (!fs.existsSync(routesCacheDir)) {
      try { fs.mkdirSync(routesCacheDir, { recursive: true }); } catch (e) {}
    }

    const cacheKey = `${profile}_${fromLat.toFixed(4)}_${fromLng.toFixed(4)}_${toLat.toFixed(4)}_${toLng.toFixed(4)}.json`;
    const cachePath = path.join(routesCacheDir, cacheKey);

    // 1. Check disk cache first (offline instant)
    if (fs.existsSync(cachePath)) {
      try {
        const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
        cached.cached = true;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(cached));
        return;
      } catch (e) {
        // ignore cache read error
      }
    }

    // 2. Try OSRM (online)
    const osrmMode = profile === 'walking' ? 'foot' : 'driving';
    const osrmUrl = `https://router.project-osrm.org/route/v1/${osrmMode}/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson&steps=true`;

    fetch(osrmUrl, { signal: AbortSignal.timeout(3500) })
      .then(r => r.json())
      .then(data => {
        if (data && data.code === 'Ok' && data.routes && data.routes.length > 0) {
          const r = data.routes[0];
          const distKm = Math.round((r.distance / 1000) * 10) / 10;
          let durMin = Math.round(r.duration / 60);
          if (profile === 'tactical') durMin = Math.round((distKm / 48) * 60);
          if (profile === 'walking') durMin = Math.round((distKm / 4.5) * 60);

          const fuelL = profile === 'walking' ? 0 : Math.round((distKm / (profile === 'tactical' ? 8 : 12)) * 10) / 10;
          const waterL = profile === 'walking' ? Math.max(0.5, Math.round(((durMin / 60) / 8) * 3.5 * 10) / 10) : 0;
          const caloriesKcal = profile === 'walking' ? Math.round((durMin / 60) * 380) : 0;

          const steps = (r.legs && r.legs[0] && r.legs[0].steps ? r.legs[0].steps : []).map(s => {
            const maneuver = s.maneuver ? s.maneuver.type : '';
            const modifier = s.maneuver ? s.maneuver.modifier : '';
            let prefix = profile === 'walking' ? 'Caminhe' : 'Siga';
            if (maneuver === 'turn') {
              if (modifier && modifier.includes('right')) prefix = 'Vire à direita';
              else if (modifier && modifier.includes('left')) prefix = 'Vire à esquerda';
              else prefix = 'Faça a curva';
            } else if (maneuver === 'roundabout') {
              prefix = 'Na rotatória';
            } else if (maneuver === 'fork') {
              prefix = 'Na bifurcação';
            }

            const stepDistKm = Math.round((s.distance / 1000) * 10) / 10;
            const roadName = s.name ? ` na ${s.name}` : (profile === 'walking' ? ' pelo acostamento/calçada' : '');
            let extraNote = '';
            if (profile === 'walking' && stepDistKm >= 3) {
              extraNote = ' &bull; Hidratação a cada 50 min';
            }

            return {
              instruction: `${prefix}${roadName}${extraNote}`,
              distanceKm: stepDistKm,
              type: maneuver || 'step'
            };
          });

          const result = {
            source: 'osrm_online',
            profile,
            distanceKm: distKm,
            durationMin: durMin,
            fuelLiters: fuelL,
            waterLiters: waterL,
            caloriesKcal,
            geometry: r.geometry,
            steps: steps.length > 0 ? steps : [{ instruction: profile === 'walking' ? 'Marcha a pé pela rota principal' : 'Siga pela rota principal', distanceKm: distKm, type: 'step' }]
          };

          try { fs.writeFileSync(cachePath, JSON.stringify(result, null, 2), 'utf8'); } catch(e){}
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } else {
          throw new Error('OSRM sem rota');
        }
      })
      .catch(() => {
        // Fallback to offline tactical corridor
        const fallbackResult = generateCorridorRoute(fromLat, fromLng, toLat, toLng, profile);
        try { fs.writeFileSync(cachePath, JSON.stringify(fallbackResult, null, 2), 'utf8'); } catch(e){}
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(fallbackResult));
      });
    return;
  }

  // 4.2 API: GPX export
  if (pathname === '/api/route/gpx') {
    const fromLat = parseFloat(urlObj.searchParams.get('fromLat'));
    const fromLng = parseFloat(urlObj.searchParams.get('fromLng'));
    const toLat = parseFloat(urlObj.searchParams.get('toLat'));
    const toLng = parseFloat(urlObj.searchParams.get('toLng'));
    const profile = urlObj.searchParams.get('profile') || 'driving';

    const routesCacheDir = path.join(__dirname, 'data', 'routes_cache');
    const cacheKey = `${profile}_${fromLat.toFixed(4)}_${fromLng.toFixed(4)}_${toLat.toFixed(4)}_${toLng.toFixed(4)}.json`;
    const cachePath = path.join(routesCacheDir, cacheKey);

    let routeData = null;
    if (fs.existsSync(cachePath)) {
      try { routeData = JSON.parse(fs.readFileSync(cachePath, 'utf8')); } catch(e){}
    }
    if (!routeData) {
      routeData = generateCorridorRoute(fromLat, fromLng, toLat, toLng, profile);
    }

    const coords = routeData.geometry && routeData.geometry.coordinates ? routeData.geometry.coordinates : [[fromLng, fromLat], [toLng, toLat]];
    let trkpts = coords.map(c => `      <trkpt lat="${c[1]}" lon="${c[0]}"></trkpt>`).join('\n');

    const gpxXml = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="NOMAD Brasil Tactical GPS" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>Rota Tatica NOMAD Brasil</name>
    <desc>Distancia: ${routeData.distanceKm} km | Tempo: ${routeData.durationMin} min | Perfil: ${profile}</desc>
  </metadata>
  <wpt lat="${fromLat}" lon="${fromLng}"><name>Origem</name></wpt>
  <wpt lat="${toLat}" lon="${toLng}"><name>Destino</name></wpt>
  <trk>
    <name>Trilha Tatica</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`;

    res.writeHead(200, {
      'Content-Type': 'application/gpx+xml; charset=utf-8',
      'Content-Disposition': 'attachment; filename="rota_tatica_nomad.gpx"'
    });
    res.end(gpxXml);
    return;
  }

  // 5. API: PMTiles range request streaming
  if (pathname === '/api/maps/pmtiles') {
    const streetsFile = path.join(STORAGE_PATH, 'maps', 'brazil-streets.pmtiles');
    const baseFile = path.join(STORAGE_PATH, 'maps', 'global-min_2025-12.pmtiles');
    const pmtilesFile = fs.existsSync(streetsFile) ? streetsFile : baseFile;

    if (!fs.existsSync(pmtilesFile)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('PMTiles base map not found in storage/maps');
      return;
    }

    const stat = fs.statSync(pmtilesFile);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize || end >= fileSize) {
        res.writeHead(416, {
          'Content-Range': `bytes */${fileSize}`
        });
        res.end();
        return;
      }

      const chunksize = (end - start) + 1;
      const file = fs.createReadStream(pmtilesFile, { start, end });
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'application/octet-stream',
        'Cache-Control': 'public, max-age=86400'
      });
      file.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Accept-Ranges': 'bytes',
        'Content-Type': 'application/octet-stream',
        'Cache-Control': 'public, max-age=86400'
      });
      fs.createReadStream(pmtilesFile).pipe(res);
    }
    return;
  }

  // 5.1 API: Map fonts glyphs (100% offline)
  if (pathname.startsWith('/api/maps/fonts/')) {
    const fontRel = pathname.replace('/api/maps/fonts/', '');
    const fontFile = path.join(STORAGE_PATH, 'maps', 'basemaps-assets', 'fonts', fontRel);
    if (fs.existsSync(fontFile) && fs.statSync(fontFile).isFile()) {
      res.writeHead(200, {
        'Content-Type': 'application/x-protobuf',
        'Cache-Control': 'public, max-age=86400'
      });
      fs.createReadStream(fontFile).pipe(res);
      return;
    }
  }

  // 5.2 API: Map sprites (100% offline)
  if (pathname.startsWith('/api/maps/sprites/')) {
    const spriteRel = pathname.replace('/api/maps/sprites/', '');
    const spriteFile = path.join(STORAGE_PATH, 'maps', 'basemaps-assets', 'sprites', spriteRel);
    if (fs.existsSync(spriteFile) && fs.statSync(spriteFile).isFile()) {
      const ext = path.extname(spriteFile).toLowerCase();
      const ct = ext === '.json' ? 'application/json' : 'image/png';
      res.writeHead(200, {
        'Content-Type': ct,
        'Cache-Control': 'public, max-age=86400'
      });
      fs.createReadStream(spriteFile).pipe(res);
      return;
    }
  }

  // 6. Static files
  let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  if (safePath === '/' || safePath === '\\') {
    safePath = '/index.html';
  }

  const publicDir = path.join(__dirname, 'public');
  let filePath = path.join(publicDir, safePath);

  // If path doesn't exist, fallback to index.html for SPA routes
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(publicDir, 'index.html');
  }

  if (fs.existsSync(filePath)) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const stat = fs.statSync(filePath);

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stat.size,
      'Cache-Control': 'no-cache'
    });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Não Encontrado');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[NOMAD Brasil] Servidor ativo em http://0.0.0.0:${PORT}`);
  console.log(`[NOMAD Brasil] Cidades carregadas: ${cities.length}`);
  console.log(`[NOMAD Brasil] Protocolos de emergência: ${emergencies.length}`);
  console.log(`[NOMAD Brasil] Manuais de sobrevivência: ${survivalManuals.length}`);
});
