import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '8000', 10);
const STORAGE_PATH = process.env.STORAGE_PATH || path.join(__dirname, '..', 'storage');

// Open FTS5 Street Index (Option 2 - 100% Offline + Incremental Auto-Learning)
const streetsDbPath = path.join(STORAGE_PATH, 'maps', 'brazil-streets.sqlite');
let streetsDb = null;
let streetsSearchStmt = null;
let streetsExistsStmt = null;
let streetsInsertStmt = null;
if (fs.existsSync(streetsDbPath)) {
  try {
    try {
      streetsDb = new DatabaseSync(streetsDbPath);
    } catch {
      streetsDb = new DatabaseSync(streetsDbPath, { readOnly: true });
    }
    streetsSearchStmt = streetsDb.prepare(
      "SELECT rowid AS id, name, city, state, kind, lat, lng, bm25(streets_fts, 10.0, 4.0, 1.0, 2.0) AS score FROM streets_fts WHERE streets_fts MATCH ? ORDER BY score LIMIT ?"
    );
    try {
      streetsExistsStmt = streetsDb.prepare(
        'SELECT rowid AS id, name, city, state FROM streets_fts WHERE streets_fts MATCH ? LIMIT 40'
      );
      streetsInsertStmt = streetsDb.prepare(
        'INSERT INTO streets_fts (name, city, state, kind, lat, lng) VALUES (?, ?, ?, ?, ?, ?)'
      );
    } catch {
      streetsExistsStmt = null;
      streetsInsertStmt = null;
    }
  } catch (err) {
    console.warn('[NOMAD Brasil] Aviso ao carregar índice SQLite de ruas:', err.message);
    streetsDb = null;
    streetsSearchStmt = null;
  }
}

// Load datasets
const citiesPath = path.join(__dirname, 'data', 'cities.json');
const emergenciesPath = path.join(__dirname, 'data', 'emergencies.json');
const survivalPath = path.join(__dirname, 'data', 'survival.json');
const poisPath = path.join(__dirname, 'data', 'pois.json');
const radioPath = path.join(__dirname, 'data', 'radio_frequencies.json');
const venomousPath = path.join(__dirname, 'data', 'venomous_animals.json');
const plantsPath = path.join(__dirname, 'data', 'panc_plants.json');

const cities = fs.existsSync(citiesPath) ? JSON.parse(fs.readFileSync(citiesPath, 'utf8')) : [];
const emergencies = fs.existsSync(emergenciesPath) ? JSON.parse(fs.readFileSync(emergenciesPath, 'utf8')) : [];
const survivalManuals = fs.existsSync(survivalPath) ? JSON.parse(fs.readFileSync(survivalPath, 'utf8')) : [];
const strategicPois = fs.existsSync(poisPath) ? JSON.parse(fs.readFileSync(poisPath, 'utf8')) : [];
const radioData = fs.existsSync(radioPath) ? JSON.parse(fs.readFileSync(radioPath, 'utf8')) : { bands: [], q_code: [], phonetic_alphabet: [], antennas: [] };
const venomousAnimals = fs.existsSync(venomousPath) ? JSON.parse(fs.readFileSync(venomousPath, 'utf8')) : [];
const pancPlants = fs.existsSync(plantsPath) ? JSON.parse(fs.readFileSync(plantsPath, 'utf8')) : [];

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

// 1x1 degree spatial grid for fast Brazilian city/UF attribution
const citySpatialGrid = new Map();
for (const c of cities) {
  const gx = Math.floor(c.lng);
  const gy = Math.floor(c.lat);
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const k = `${gx + dx},${gy + dy}`;
      let arr = citySpatialGrid.get(k);
      if (!arr) {
        arr = [];
        citySpatialGrid.set(k, arr);
      }
      arr.push(c);
    }
  }
}

function findNearestCityForPoint(lat, lng, maxDistSq = 0.12) {
  const bucket = citySpatialGrid.get(`${Math.floor(lng)},${Math.floor(lat)}`);
  if (!bucket) return null;
  let best = null;
  let bestDist = maxDistSq;
  for (let i = 0; i < bucket.length; i++) {
    const c = bucket[i];
    const d = (c.lat - lat) ** 2 + (c.lng - lng) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

const STATE_NAME_TO_UF = {
  'acre': 'AC', 'alagoas': 'AL', 'amapa': 'AP', 'amazonas': 'AM', 'bahia': 'BA',
  'ceara': 'CE', 'distrito federal': 'DF', 'espirito santo': 'ES', 'goias': 'GO',
  'maranhao': 'MA', 'mato grosso': 'MT', 'mato grosso do sul': 'MS', 'minas gerais': 'MG',
  'para': 'PA', 'paraiba': 'PB', 'parana': 'PR', 'pernambuco': 'PE', 'piaui': 'PI',
  'rio de janeiro': 'RJ', 'rio grande do norte': 'RN', 'rio grande do sul': 'RS',
  'rondonia': 'RO', 'roraima': 'RR', 'santa catarina': 'SC', 'sao paulo': 'SP',
  'sergipe': 'SE', 'tocantins': 'TO'
};

function normalizeUf(rawState, fallbackCity) {
  if (rawState) {
    const clean = rawState.trim();
    if (/^[A-Za-z]{2}$/.test(clean)) return clean.toUpperCase();
    const mapped = STATE_NAME_TO_UF[normalizeStr(clean)];
    if (mapped) return mapped;
  }
  return fallbackCity ? fallbackCity.state : 'BR';
}

const STREET_PREFIXES = new Set([
  'r', 'rua', 'av', 'avenida', 'tv', 'trav', 'travessa', 'al', 'alameda',
  'pc', 'praca', 'rod', 'rodovia', 'estr', 'estrada', 'via', 'viela',
  'largo', 'lg', 'ponte', 'viaduto', 'vd', 'passagem'
]);

const SYNONYM_GROUPS = [
  ['av', 'avenida'],
  ['r', 'rua'],
  ['tv', 'trav', 'travessa'],
  ['al', 'alameda'],
  ['pc', 'praca'],
  ['rod', 'rodovia'],
  ['estr', 'estrada'],
  ['dr', 'dra', 'doutor', 'doutora'],
  ['prof', 'profa', 'professor', 'professora'],
  ['pres', 'presidente'],
  ['gov', 'governador'],
  ['sen', 'senador'],
  ['dep', 'deputado'],
  ['cel', 'coronel'],
  ['gen', 'general'],
  ['mal', 'marechal'],
  ['brig', 'brigadeiro'],
  ['eng', 'engenheiro'],
  ['pe', 'padre'],
  ['br', 'bar', 'barao'],
  ['visc', 'visconde'],
  ['alm', 'almirante'],
  ['cons', 'conselheiro'],
  ['com', 'comendador'],
  ['des', 'desembargador'],
  ['st', 'sta', 'sto', 'santa', 'santo', 'sao'],
  ['15', 'xv', 'quinze'],
  ['7', 'vii', 'sete'],
  ['9', 'ix', 'nove'],
  ['1', 'i', 'primeiro'],
  ['2', 'ii', 'dois'],
  ['24', 'xxiv'],
  ['13', 'xiii', 'treze']
];

const SYNONYM_MAP = new Map();
for (const group of SYNONYM_GROUPS) {
  for (const term of group) {
    SYNONYM_MAP.set(term, group);
  }
}

function buildSmartFtsQuery(rawQ, dropStreetPrefix = false) {
  const cleaned = normalizeStr(rawQ).replace(/[^a-z0-9\s]/g, ' ').trim();
  if (!cleaned) return '';
  let rawTokens = cleaned.split(/\s+/).filter(Boolean);
  if (dropStreetPrefix) {
    rawTokens = rawTokens.filter((t, idx) => !(idx === 0 && STREET_PREFIXES.has(t)) && !STREET_PREFIXES.has(t));
  }
  const tokens = rawTokens.filter(t => t.length >= 2 || /^\d+$/.test(t) || (t === 'r' && !dropStreetPrefix));
  if (tokens.length === 0) return '';

  return tokens.map(t => {
    const syns = SYNONYM_MAP.get(t);
    if (syns) {
      return `(${syns.map(s => `"${s}"*`).join(' OR ')})`;
    }
    return `"${t}"*`;
  }).join(' AND ');
}

const learnedStreetKeys = new Set();
function persistLearnedStreet(name, city, state, kind, lat, lng) {
  if (!streetsInsertStmt || !streetsExistsStmt || !name || !city) return false;
  const cleanName = String(name).trim();
  const cleanCity = String(city).trim();
  const cleanState = String(state || 'BR').trim();
  if (cleanName.length < 2 || !/[a-zA-ZÀ-ÿ]/.test(cleanName)) return false;

  const memKey = `${normalizeStr(cleanCity)}|${cleanState}|${normalizeStr(cleanName)}`;
  if (learnedStreetKeys.has(memKey)) return false;
  learnedStreetKeys.add(memKey);

  try {
    const ftsProbe = buildSmartFtsQuery(`${cleanName} ${cleanCity}`, false);
    if (ftsProbe) {
      const existing = streetsExistsStmt.all(ftsProbe);
      const normN = normalizeStr(cleanName);
      const normC = normalizeStr(cleanCity);
      if (existing.some(r => normalizeStr(r.name) === normN && normalizeStr(r.city) === normC)) {
        return false;
      }
    }
    const rLat = Math.round(Number(lat) * 100000) / 100000;
    const rLng = Math.round(Number(lng) * 100000) / 100000;
    const info = streetsInsertStmt.run(cleanName, cleanCity, cleanState, kind || 'Via', rLat, rLng);
    return Number(info.lastInsertRowid || 0);
  } catch {
    return false;
  }
}

async function fetchOnlineStreetsSupplement(rawQ, mapLat, mapLng) {
  const hits = [];
  const hasGeo = !isNaN(mapLat) && !isNaN(mapLng);
  const photonParams = new URLSearchParams({ q: rawQ, limit: '12' });
  if (hasGeo) {
    photonParams.set('lat', String(mapLat));
    photonParams.set('lon', String(mapLng));
  }
  const photonUrl = `https://photon.komoot.io/api/?${photonParams.toString()}`;
  const nomUrl = `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=br&addressdetails=1&limit=8&q=${encodeURIComponent(rawQ)}`;

  const [photonRes, nomRes] = await Promise.allSettled([
    fetch(photonUrl, { signal: AbortSignal.timeout(2200), headers: { 'User-Agent': 'NOMAD-Brasil-Tactical/1.0' } })
      .then(r => (r.ok ? r.json() : null)),
    fetch(nomUrl, { signal: AbortSignal.timeout(2200), headers: { 'User-Agent': 'NOMAD-Brasil-Tactical/1.0' } })
      .then(r => (r.ok ? r.json() : null))
  ]);

  if (photonRes.status === 'fulfilled' && photonRes.value?.features) {
    for (const f of photonRes.value.features) {
      const p = f.properties || {};
      const coords = f.geometry?.coordinates;
      if (!coords || coords.length < 2) continue;
      const lng = Number(coords[0]);
      const lat = Number(coords[1]);
      if (lat < -34 || lat > 6 || lng < -74.5 || lng > -32) continue;
      if (p.countrycode && p.countrycode !== 'BR' && p.country && !normalizeStr(p.country).includes('brasil')) continue;

      const nearest = findNearestCityForPoint(lat, lng, 0.2);
      const name = (p.street || p.name || '').trim();
      const city = (p.city || p.town || p.village || p.municipality || (nearest ? nearest.name : '')).trim();
      if (!name || !city) continue;
      const state = normalizeUf(p.state, nearest);
      const isRoad = p.osm_key === 'highway' || Boolean(p.street) || p.type === 'street';
      const kind = isRoad ? 'Via' : (p.type === 'district' || p.type === 'locality' ? 'Bairro' : 'POI');
      hits.push({ name, city, state, kind, lat, lng });
    }
  }

  if (nomRes.status === 'fulfilled' && Array.isArray(nomRes.value)) {
    for (const item of nomRes.value) {
      const lat = Number(item.lat);
      const lng = Number(item.lon);
      if (isNaN(lat) || isNaN(lng) || lat < -34 || lat > 6 || lng < -74.5 || lng > -32) continue;
      const addr = item.address || {};
      const nearest = findNearestCityForPoint(lat, lng, 0.2);
      const name = (addr.road || item.name || '').trim();
      const city = (addr.city || addr.town || addr.village || addr.municipality || (nearest ? nearest.name : '')).trim();
      if (!name || !city) continue;
      const state = normalizeUf(addr.state, nearest);
      const kind = (item.class === 'highway' || addr.road) ? 'Via' : 'POI';
      hits.push({ name, city, state, kind, lat, lng });
    }
  }

  // Deduplicate and permanently learn discovered streets into SQLite
  const deduped = [];
  const seen = new Set();
  for (const h of hits) {
    const k = `${normalizeStr(h.city)}|${h.state}|${normalizeStr(h.name)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const insertedId = persistLearnedStreet(h.name, h.city, h.state, h.kind, h.lat, h.lng);
    deduped.push({
      id: insertedId || `net_${deduped.length}`,
      name: h.name,
      city: h.city,
      state: h.state,
      kind: h.kind,
      lat: Math.round(h.lat * 100000) / 100000,
      lng: Math.round(h.lng * 100000) / 100000
    });
  }
  return deduped;
}

const mvtTextDecoder = new TextDecoder('utf-8');
function readVarintMvt(u, o) {
  let r = 0, s = 0, b;
  do { b = u[o.p++]; r |= (b & 127) << s; s += 7; } while (b >= 128);
  return r >>> 0;
}
function skipMvt(u, o, w) {
  if (w === 0) readVarintMvt(u, o);
  else if (w === 1) o.p += 8;
  else if (w === 2) o.p += readVarintMvt(u, o);
  else if (w === 5) o.p += 4;
}

function extractAndLearnDetailTileStreets(pbfBuffer, z, tx, ty) {
  if (!streetsInsertStmt || z !== 14) return;
  try {
    const tileCenterLng = ((tx + 0.5) / (1 << z)) * 360 - 180;
    const tileCenterLat = Math.atan(Math.sinh(Math.PI * (1 - (2 * (ty + 0.5)) / (1 << z)))) * (180 / Math.PI);
    const nearest = findNearestCityForPoint(tileCenterLat, tileCenterLng, 0.15);
    if (!nearest) return;

    const u = new Uint8Array(pbfBuffer.buffer, pbfBuffer.byteOffset, pbfBuffer.byteLength);
    const o = { p: 0 };
    const learned = [];
    const targetLayers = new Set(['transportation_name', 'poi']);

    while (o.p < u.length) {
      const tag = readVarintMvt(u, o);
      if ((tag >> 3) === 3 && (tag & 7) === 2) {
        const len = readVarintMvt(u, o);
        const end = o.p + len;
        let lname = '', keys = [], vals = [], feats = [], extent = 4096;
        while (o.p < end) {
          const lt = readVarintMvt(u, o), lf = lt >> 3, lw = lt & 7;
          if (lf === 1 && lw === 2) { const sl = readVarintMvt(u, o); lname = mvtTextDecoder.decode(u.subarray(o.p, o.p + sl)); o.p += sl; }
          else if (lf === 2 && lw === 2) { const fl = readVarintMvt(u, o); feats.push([o.p, o.p + fl]); o.p += fl; }
          else if (lf === 3 && lw === 2) { const kl = readVarintMvt(u, o); keys.push(mvtTextDecoder.decode(u.subarray(o.p, o.p + kl))); o.p += kl; }
          else if (lf === 4 && lw === 2) {
            const vl = readVarintMvt(u, o), ve = o.p + vl; let v = null;
            while (o.p < ve) {
              const vt = readVarintMvt(u, o), vf = vt >> 3, vw = vt & 7;
              if (vf === 1 && vw === 2) { const sl = readVarintMvt(u, o); v = mvtTextDecoder.decode(u.subarray(o.p, o.p + sl)); o.p += sl; }
              else skipMvt(u, o, vw);
            }
            vals.push(v);
          }
          else if (lf === 5 && lw === 0) extent = readVarintMvt(u, o) || 4096;
          else skipMvt(u, o, lw);
        }
        if (!targetLayers.has(lname)) continue;
        for (const [fsPos, fePos] of feats) {
          const fo = { p: fsPos };
          const tags = [];
          let gx = extent / 2, gy = extent / 2, hasGeom = false;
          while (fo.p < fePos) {
            const ft = readVarintMvt(u, fo), ff = ft >> 3, fw = ft & 7;
            if (ff === 2 && fw === 2) { const tl = readVarintMvt(u, fo), te = fo.p + tl; while (fo.p < te) tags.push(readVarintMvt(u, fo)); }
            else if (ff === 4 && fw === 2) {
              const gl = readVarintMvt(u, fo), ge = fo.p + gl;
              if (fo.p < ge) {
                const cmd = readVarintMvt(u, fo);
                if ((cmd & 0x7) === 1 && fo.p < ge) {
                  const dx = readVarintMvt(u, fo), dy = readVarintMvt(u, fo);
                  gx = (dx >>> 1) ^ -(dx & 1); gy = (dy >>> 1) ^ -(dy & 1);
                  hasGeom = true;
                }
              }
              fo.p = ge;
            } else skipMvt(u, fo, fw);
          }
          if (!hasGeom || tags.length < 2) continue;
          let nm = '', ref = '';
          for (let i = 0; i + 1 < tags.length; i += 2) {
            const k = keys[tags[i]], v = vals[tags[i + 1]];
            if (!v) continue;
            if (k === 'name:pt') nm = v;
            else if (k === 'name' && !nm) nm = v;
            else if (k === 'name:latin' && !nm) nm = v;
            else if (k === 'ref') ref = v;
          }
          const finalName = (nm || ref || '').trim();
          if (finalName.length >= 2 && /[a-zA-ZÀ-ÿ]/.test(finalName)) {
            const n = 1 << z;
            const lng = ((tx + gx / extent) / n) * 360 - 180;
            const lat = Math.atan(Math.sinh(Math.PI * (1 - (2 * (ty + gy / extent)) / n))) * (180 / Math.PI);
            learned.push({ name: finalName, kind: lname === 'transportation_name' ? 'Via' : 'POI', lat, lng });
          }
        }
      } else {
        skipMvt(u, o, tag & 7);
      }
    }

    if (learned.length > 0 && streetsDb) {
      for (const item of learned) {
        persistLearnedStreet(item.name, nearest.name, nearest.state, item.kind, item.lat, item.lng);
      }
    }
  } catch {
    // ignore background parsing issues
  }
}

let openFreeMapTileTemplate = 'https://tiles.openfreemap.org/planet/20261101_080013_pt/{z}/{x}/{y}.pbf';
let lastOpenFreeMapCheck = 0;
async function getOpenFreeMapTemplate(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && lastOpenFreeMapCheck > 0 && now - lastOpenFreeMapCheck < 3600 * 1000) {
    return openFreeMapTileTemplate;
  }
  try {
    const r = await fetch('https://tiles.openfreemap.org/planet', { signal: AbortSignal.timeout(2500) });
    if (r.ok) {
      const json = await r.json();
      if (json.tiles && json.tiles[0]) {
        openFreeMapTileTemplate = json.tiles[0];
        lastOpenFreeMapCheck = now;
      }
    }
  } catch {
    lastOpenFreeMapCheck = now;
  }
  return openFreeMapTileTemplate;
}

async function handleStreetsSearch(req, res, urlObj) {
  const rawQ = (urlObj.searchParams.get('q') || '').trim();
  const limit = Math.min(50, Math.max(1, parseInt(urlObj.searchParams.get('limit') || '25', 10) || 25));
  const mapLat = parseFloat(urlObj.searchParams.get('lat'));
  const mapLng = parseFloat(urlObj.searchParams.get('lng'));
  const ctxCity = normalizeStr((urlObj.searchParams.get('city') || '').trim());
  const hasGeo = !isNaN(mapLat) && !isNaN(mapLng);

  if (!rawQ) {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end('[]');
    return;
  }

  let candidates = [];
  const seenIds = new Set();

  if (streetsSearchStmt) {
    const primaryMatch = buildSmartFtsQuery(rawQ, false);
    if (primaryMatch) {
      try {
        for (const r of streetsSearchStmt.all(primaryMatch, 250)) {
          if (!seenIds.has(r.id)) {
            seenIds.add(r.id);
            candidates.push({ ...r, _relaxed: false });
          }
        }
      } catch {}
    }

    if (candidates.length < 5) {
      const relaxedMatch = buildSmartFtsQuery(rawQ, true);
      if (relaxedMatch && relaxedMatch !== primaryMatch) {
        try {
          for (const r of streetsSearchStmt.all(relaxedMatch, 150)) {
            if (!seenIds.has(r.id)) {
              seenIds.add(r.id);
              candidates.push({ ...r, _relaxed: true });
            }
          }
        } catch {}
      }
    }
  }

  const normQ = normalizeStr(rawQ);
  const rankRow = (r) => {
    let score = typeof r.score === 'number' ? r.score : -16;
    if (r._relaxed) score += 4;
    if (r.kind === 'Via') score -= 8;
    else if (r.kind === 'Bairro') score -= 3;

    if (ctxCity && normalizeStr(r.city) === ctxCity) score -= 25;
    if (hasGeo) {
      const distKm = haversine(mapLat, mapLng, r.lat, r.lng);
      if (distKm <= 12) score -= 22;
      else if (distKm <= 35) score -= 15;
    }
    if (normalizeStr(r.name).includes(normQ)) score -= 10;
    return score;
  };

  candidates.sort((a, b) => rankRow(a) - rankRow(b));

  // Online residential supplement if local SQLite has fewer than 8 matching roads
  const localRoadsCount = candidates.filter(c => c.kind === 'Via' && !c._relaxed).length;
  if (rawQ.length >= 3 && localRoadsCount < 8) {
    try {
      const netHits = await fetchOnlineStreetsSupplement(rawQ, mapLat, mapLng);
      const existingPairs = new Set(candidates.map(c => `${normalizeStr(c.city)}|${normalizeStr(c.name)}`));
      for (const nh of netHits) {
        const pair = `${normalizeStr(nh.city)}|${normalizeStr(nh.name)}`;
        if (!existingPairs.has(pair)) {
          existingPairs.add(pair);
          candidates.push({ ...nh, score: -26, _relaxed: false });
        }
      }
      candidates.sort((a, b) => rankRow(a) - rankRow(b));
    } catch {}
  }

  const result = candidates.slice(0, limit).map(({ score, _relaxed, ...rest }) => rest);
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(result));
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
function generateCorridorRoute(fromLat, fromLng, toLat, toLng, profile = 'driving', fromLabel = '', toLabel = '') {
  const directDist = haversine(fromLat, fromLng, toLat, toLng);
  const winding = profile === 'walking' ? 1.18 : 1.25;
  const distanceKm = Math.round(directDist * winding * 10) / 10;

  let speedKmh = directDist < 35 ? (profile === 'walking' ? 4.5 : 32) : 75;
  if (profile === 'tactical') speedKmh = directDist < 35 ? 25 : 48;
  if (profile === 'walking') speedKmh = 4.5;

  const durationMin = Math.max(1, Math.round((distanceKm / speedKmh) * 60));
  const fuelLiters = profile === 'walking' ? 0 : Math.round((distanceKm / (profile === 'tactical' ? 8 : 12)) * 10) / 10;
  const waterLiters = profile === 'walking' ? Math.max(0.5, Math.round(((durationMin / 60) / 8) * 3.5 * 10) / 10) : 0;
  const caloriesKcal = profile === 'walking' ? Math.round((durationMin / 60) * 380) : 0;

  const isUrban = directDist < 35;

  // Find intermediate cities near corridor for regional trips
  const intermediate = [];
  if (!isUrban) {
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
  }
  const pickedWaypoints = intermediate.slice(0, 6);

  const coords = [[fromLng, fromLat]];
  pickedWaypoints.forEach(w => coords.push([w.lng, w.lat]));
  coords.push([toLng, toLat]);

  const steps = [];
  if (isUrban) {
    steps.push({
      instruction: `Partida de ${fromLabel || 'ponto de origem'} em direção à via de ligação`,
      distanceKm: Math.round((distanceKm / 2) * 10) / 10,
      type: 'depart'
    });
    steps.push({
      instruction: `Deslocamento pelo corredor viário urbano (modo offline direto)`,
      distanceKm: Math.round((distanceKm / 2) * 10) / 10,
      type: 'waypoint'
    });
    steps.push({
      instruction: `Aproximação e chegada em ${toLabel || 'ponto de destino'}`,
      distanceKm: 0,
      type: 'arrive'
    });
  } else {
    steps.push({
      instruction: `Partida de ${fromLabel || 'ponto de origem'} em direção ao corredor rodoviário`,
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
      instruction: `Aproximação e chegada em ${toLabel || 'ponto de destino'}`,
      distanceKm: 0,
      type: 'arrive'
    });
  }

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
        pmtilesSizeBytes: pmtilesSize,
        streetsIndexAvailable: Boolean(streetsDb && streetsSearchStmt)
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

  // 2.1 API: Offline Streets / Roads / POIs search via SQLite FTS5 + Residential Auto-Learning
  if (pathname === '/api/streets') {
    handleStreetsSearch(req, res, urlObj).catch(() => {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end('[]');
    });
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

  // 4.01 API: Strategic POIs
  if (pathname === '/api/pois') {
    const category = urlObj.searchParams.get('category');
    let results = strategicPois;
    if (category && category !== 'all') {
      results = strategicPois.filter(p => p.category === category);
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(results));
    return;
  }

  // 4.02 API: Radio Frequencies & Telecom
  if (pathname === '/api/radio') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(radioData));
    return;
  }

  // 4.03 API: Venomous Animals Database
  if (pathname === '/api/venomous') {
    const group = urlObj.searchParams.get('group');
    let results = venomousAnimals;
    if (group && group !== 'all') {
      results = venomousAnimals.filter(a => a.group === group);
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(results));
    return;
  }

  // 4.04 API: PANC & Fitoterapia Database
  if (pathname === '/api/plants') {
    const type = urlObj.searchParams.get('type');
    let results = pancPlants;
    if (type && type !== 'all') {
      results = pancPlants.filter(p => (p.type || '').toLowerCase().includes(type.toLowerCase()));
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(results));
    return;
  }

  // 4.1 API: Route calculation (Online OSRM + Permanent Disk Cache + Offline Tactical Corridor)
  if (pathname === '/api/route') {
    const fromLat = parseFloat(urlObj.searchParams.get('fromLat'));
    const fromLng = parseFloat(urlObj.searchParams.get('fromLng'));
    const toLat = parseFloat(urlObj.searchParams.get('toLat'));
    const toLng = parseFloat(urlObj.searchParams.get('toLng'));
    const profile = urlObj.searchParams.get('profile') || 'driving';
    const fromLabel = (urlObj.searchParams.get('fromLabel') || '').trim();
    const toLabel = (urlObj.searchParams.get('toLabel') || '').trim();

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
        const fallbackResult = generateCorridorRoute(fromLat, fromLng, toLat, toLng, profile, fromLabel, toLabel);
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

  // 5.3 API: High-detail residential street vector tiles (z=14) with persistent disk cache & street learning
  const detailMatch = pathname.match(/^\/api\/maps\/detail-tiles\/(\d+)\/(\d+)\/(\d+)\.pbf$/);
  if (detailMatch) {
    const zNum = parseInt(detailMatch[1], 10);
    const xNum = parseInt(detailMatch[2], 10);
    const yNum = parseInt(detailMatch[3], 10);
    const cacheFile = path.join(STORAGE_PATH, 'maps', 'detail_tiles_cache', String(zNum), String(xNum), `${yNum}.pbf`);

    if (fs.existsSync(cacheFile)) {
      res.writeHead(200, {
        'Content-Type': 'application/x-protobuf',
        'Cache-Control': 'public, max-age=86400'
      });
      fs.createReadStream(cacheFile).pipe(res);
      return;
    }

    (async () => {
      try {
        let tmpl = await getOpenFreeMapTemplate(false);
        let tileUrl = tmpl.replace('{z}', zNum).replace('{x}', xNum).replace('{y}', yNum);
        let tileRes = await fetch(tileUrl, { signal: AbortSignal.timeout(4500) });
        if (tileRes.status === 404 || tileRes.status === 410) {
          tmpl = await getOpenFreeMapTemplate(true);
          tileUrl = tmpl.replace('{z}', zNum).replace('{x}', xNum).replace('{y}', yNum);
          tileRes = await fetch(tileUrl, { signal: AbortSignal.timeout(4500) });
        }
        if (!tileRes.ok) {
          res.writeHead(204);
          res.end();
          return;
        }
        const buf = Buffer.from(await tileRes.arrayBuffer());
        try {
          fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
          fs.writeFileSync(cacheFile, buf);
        } catch {}
        res.writeHead(200, {
          'Content-Type': 'application/x-protobuf',
          'Cache-Control': 'public, max-age=86400'
        });
        res.end(buf);
        if (zNum === 14) {
          setImmediate(() => extractAndLearnDetailTileStreets(buf, zNum, xNum, yNum));
        }
      } catch {
        res.writeHead(204);
        res.end();
      }
    })();
    return;
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
