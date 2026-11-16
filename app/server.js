import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '8000', 10);
const STORAGE_PATH = process.env.STORAGE_PATH || path.join(__dirname, '..', 'storage');

// Open FTS5 Street Index (100% Offline + Incremental Auto-Learning)
const streetsDbPath = path.join(STORAGE_PATH, 'maps', 'brazil-streets.sqlite');
let streetsDb = null;
let streetsSearchStmt = null;
let streetsExistsStmt = null;
let streetsInsertStmt = null;
let streetsReverseBoxStmt = null;
let cachedStreetsCount = 0;

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
      const cntRow = streetsDb.prepare('SELECT count(*) AS c FROM streets_fts_docsize').get();
      cachedStreetsCount = Number(cntRow?.c || 0);
    } catch {
      cachedStreetsCount = 0;
    }
    try {
      streetsReverseBoxStmt = streetsDb.prepare(
        'SELECT id, c0 AS name, c1 AS city, c2 AS state, c3 AS kind, c4 AS lat, c5 AS lng FROM streets_fts_content WHERE c4 BETWEEN ? AND ? AND c5 BETWEEN ? AND ? LIMIT 300'
      );
    } catch {
      streetsReverseBoxStmt = null;
    }
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

// Local single-tile PMTiles reader (for offline reverse geocoding & offline A* routing)
let pmtilesLib = null;
let pmtilesFd = null;
let pmtilesHeader = null;
let pmtilesRootDir = null;
const pmtilesLeafCache = new Map();

function deserializePmtilesDirectory(buf) {
  const cur = { buf: new Uint8Array(buf), pos: 0 };
  const numEntries = pmtilesLib.readVarint(cur);
  const entries = new Array(numEntries);
  let lastId = 0;
  for (let i = 0; i < numEntries; i++) {
    lastId += pmtilesLib.readVarint(cur);
    entries[i] = { tileId: lastId, offset: 0, length: 0, runLength: 1 };
  }
  for (let i = 0; i < numEntries; i++) entries[i].runLength = pmtilesLib.readVarint(cur);
  for (let i = 0; i < numEntries; i++) entries[i].length = pmtilesLib.readVarint(cur);
  for (let i = 0; i < numEntries; i++) {
    const v = pmtilesLib.readVarint(cur);
    entries[i].offset = v === 0 && i > 0 ? entries[i - 1].offset + entries[i - 1].length : v - 1;
  }
  return entries;
}

function maybeGunzipBuffer(buf) {
  if (!buf || buf.length < 2) return buf;
  if (buf[0] === 0x1f && buf[1] === 0x8b) {
    return zlib.gunzipSync(buf);
  }
  return buf;
}

function initLocalPmtilesReader() {
  const streetsPmtiles = path.join(STORAGE_PATH, 'maps', 'brazil-streets.pmtiles');
  const pmtilesJsPath = path.join(__dirname, 'public', 'vendor', 'pmtiles.js');
  if (!fs.existsSync(streetsPmtiles) || !fs.existsSync(pmtilesJsPath)) return;
  try {
    vm.runInThisContext(fs.readFileSync(pmtilesJsPath, 'utf8') + '\n;globalThis.__nomadPmtiles = pmtiles;');
    pmtilesLib = globalThis.__nomadPmtiles;
    pmtilesFd = fs.openSync(streetsPmtiles, 'r');
    const hdrBuf = Buffer.alloc(16384);
    fs.readSync(pmtilesFd, hdrBuf, 0, 16384, 0);
    pmtilesHeader = pmtilesLib.bytesToHeader(hdrBuf.buffer.slice(hdrBuf.byteOffset, hdrBuf.byteOffset + 127));
    const rootRaw = hdrBuf.subarray(
      pmtilesHeader.rootDirectoryOffset,
      pmtilesHeader.rootDirectoryOffset + pmtilesHeader.rootDirectoryLength
    );
    pmtilesRootDir = deserializePmtilesDirectory(maybeGunzipBuffer(rootRaw));
  } catch (err) {
    console.warn('[NOMAD Brasil] Aviso ao inicializar leitor PMTiles:', err.message);
    if (pmtilesFd !== null) {
      try { fs.closeSync(pmtilesFd); } catch {}
    }
    pmtilesFd = null;
    pmtilesHeader = null;
    pmtilesRootDir = null;
  }
}
initLocalPmtilesReader();

function readLocalPmtilesTile(z, tx, ty) {
  if (!pmtilesFd || !pmtilesHeader || !pmtilesRootDir || !pmtilesLib) return null;
  try {
    const n = 1 << z;
    if (tx < 0 || ty < 0 || tx >= n || ty >= n) return null;
    const tileId = pmtilesLib.zxyToTileId(z, tx, ty);
    let entry = pmtilesLib.findTile(pmtilesRootDir, tileId);
    if (!entry) return null;
    if (entry.runLength === 0) {
      const leafKey = `${entry.offset}:${entry.length}`;
      let leafDir = pmtilesLeafCache.get(leafKey);
      if (!leafDir) {
        const leafBuf = Buffer.allocUnsafe(entry.length);
        fs.readSync(pmtilesFd, leafBuf, 0, entry.length, pmtilesHeader.leafDirectoryOffset + entry.offset);
        leafDir = deserializePmtilesDirectory(maybeGunzipBuffer(leafBuf));
        if (pmtilesLeafCache.size >= 32) {
          const oldest = pmtilesLeafCache.keys().next().value;
          pmtilesLeafCache.delete(oldest);
        }
        pmtilesLeafCache.set(leafKey, leafDir);
      }
      entry = pmtilesLib.findTile(leafDir, tileId);
      if (!entry || entry.runLength === 0) return null;
    }
    const tileBuf = Buffer.allocUnsafe(entry.length);
    fs.readSync(pmtilesFd, tileBuf, 0, entry.length, pmtilesHeader.tileDataOffset + entry.offset);
    return maybeGunzipBuffer(tileBuf);
  } catch {
    return null;
  }
}

function latLngToTileXY(lat, lng, z) {
  const n = 1 << z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const rad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n);
  return [x, y];
}

const ZIM_CATALOG_RULES = [
  { match: 'wikipedia_pt_all', title: 'Wikipédia PT Completa', category: 'wikipedia', lang: 'pt', icon: '🌐', priority: 100 },
  { match: 'wikipedia_pt_medicine', title: 'Wikipédia Médica PT', category: 'medicine', lang: 'pt', icon: '🩺', priority: 95 },
  { match: 'wikivoyage_pt', title: 'Wikivoyage PT (Guias)', category: 'travel', lang: 'pt', icon: '🧭', priority: 90 },
  { match: 'wikibooks_pt', title: 'Wikilivros / Manuais PT', category: 'books', lang: 'pt', icon: '📖', priority: 88 },
  { match: 'wikipedia_pt_top', title: 'Wikipédia PT Top', category: 'wikipedia', lang: 'pt', icon: '📚', priority: 85 },
  { match: 'fas-military-medicine', title: 'FAS Military Medicine', category: 'medicine', lang: 'en', icon: '🩹', priority: 75 },
  { match: 'nhs.uk_en_medicines', title: 'NHS Medicamentos', category: 'medicine', lang: 'en', icon: '💊', priority: 72 },
  { match: 'cdc.gov', title: 'CDC Doenças & Saúde', category: 'medicine', lang: 'en', icon: '☣️', priority: 70 },
  { match: 'zimgit-medicine', title: 'Guia Médico Compacto', category: 'medicine', lang: 'en', icon: '🏥', priority: 68 },
  { match: 'wikipedia_en_top', title: 'Wikipedia EN Top', category: 'wikipedia', lang: 'en', icon: '🌍', priority: 60 },
  { match: 'wikipedia_en_100', title: 'Wikipedia EN 100', category: 'wikipedia', lang: 'en', icon: '📘', priority: 50 }
];

function classifyZimBook(book) {
  const lower = String(book || '').toLowerCase();
  for (const rule of ZIM_CATALOG_RULES) {
    if (lower.includes(rule.match)) {
      return rule;
    }
  }
  return {
    title: book,
    category: lower.includes('med') || lower.includes('nhs') || lower.includes('cdc') ? 'medicine' : (lower.includes('voyage') ? 'travel' : 'wikipedia'),
    lang: lower.includes('_pt') ? 'pt' : 'en',
    icon: '📕',
    priority: 40
  };
}

function listInstalledZims() {
  const zimDir = path.join(STORAGE_PATH, 'zim');
  if (!fs.existsSync(zimDir)) return [];
  try {
    return fs.readdirSync(zimDir)
      .filter(f => f.toLowerCase().endsWith('.zim'))
      .map(f => {
        const book = f.replace(/\.zim$/i, '');
        const sizeBytes = fs.statSync(path.join(zimDir, f)).size;
        const sizeFormatted = sizeBytes >= 1024 ** 3
          ? `${(sizeBytes / 1024 ** 3).toFixed(1)} GB`
          : `${Math.max(1, Math.round(sizeBytes / 1024 ** 2))} MB`;
        const meta = classifyZimBook(book);
        return {
          filename: f,
          book,
          sizeBytes,
          sizeFormatted,
          lang: meta.lang,
          category: meta.category,
          icon: meta.icon,
          title: meta.title,
          _priority: meta.priority
        };
      })
      .sort((a, b) => b._priority - a._priority || b.sizeBytes - a.sizeBytes)
      .map(({ _priority, ...rest }) => rest);
  } catch {
    return [];
  }
}

function getLocalLanIps() {
  const ifaces = os.networkInterfaces();
  const ips = new Set();
  for (const entries of Object.values(ifaces)) {
    if (!Array.isArray(entries)) continue;
    for (const addr of entries) {
      if (!addr || addr.internal) continue;
      if (addr.family === 'IPv4' || addr.family === 4) {
        ips.add(addr.address);
      }
    }
  }
  return Array.from(ips).sort();
}

function countFilesRecursive(dirPath, ext) {
  if (!fs.existsSync(dirPath)) return 0;
  let total = 0;
  const stack = [dirPath];
  while (stack.length > 0) {
    const cur = stack.pop();
    let entries;
    try { entries = fs.readdirSync(cur, { withFileTypes: true }); } catch { continue; }
    for (const ent of entries) {
      if (ent.isDirectory()) stack.push(path.join(cur, ent.name));
      else if (!ext || ent.name.endsWith(ext)) total++;
    }
  }
  return total;
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
    const insertedId = Number(info.lastInsertRowid || 0);
    if (insertedId > 0) cachedStreetsCount++;
    return insertedId;
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
  let r = 0, mul = 1, b;
  do {
    b = u[o.p++];
    r += (b & 127) * mul;
    mul *= 128;
  } while (b >= 128);
  return r;
}
function skipMvt(u, o, w) {
  if (w === 0) {
    while (u[o.p++] >= 128);
  } else if (w === 1) {
    o.p += 8;
  } else if (w === 2) {
    o.p += readVarintMvt(u, o);
  } else if (w === 5) {
    o.p += 4;
  }
}

function tilePixToLngLat(z, tx, ty, gx, gy, extent) {
  const n = 1 << z;
  const lng = ((tx + gx / extent) / n) * 360 - 180;
  const lat = Math.atan(Math.sinh(Math.PI * (1 - (2 * (ty + gy / extent)) / n))) * (180 / Math.PI);
  return [lng, lat];
}

function parseMvtFeatures(pbfBuffer, z, tx, ty, allowedLayers, includeFullGeometry = false) {
  const u = new Uint8Array(pbfBuffer.buffer, pbfBuffer.byteOffset, pbfBuffer.byteLength);
  const o = { p: 0 };
  const results = [];

  while (o.p < u.length) {
    const tag = readVarintMvt(u, o);
    if ((tag >> 3) === 3 && (tag & 7) === 2) {
      const len = readVarintMvt(u, o);
      const end = o.p + len;
      let lname = '', keys = [], vals = [], feats = [], extent = 4096;
      while (o.p < end) {
        const lt = readVarintMvt(u, o), lf = lt >> 3, lw = lt & 7;
        if (lf === 1 && lw === 2) {
          const sl = readVarintMvt(u, o);
          lname = mvtTextDecoder.decode(u.subarray(o.p, o.p + sl));
          o.p += sl;
        } else if (lf === 2 && lw === 2) {
          const fl = readVarintMvt(u, o);
          feats.push([o.p, o.p + fl]);
          o.p += fl;
        } else if (lf === 3 && lw === 2) {
          const kl = readVarintMvt(u, o);
          keys.push(mvtTextDecoder.decode(u.subarray(o.p, o.p + kl)));
          o.p += kl;
        } else if (lf === 4 && lw === 2) {
          const vl = readVarintMvt(u, o), ve = o.p + vl;
          let v = null;
          while (o.p < ve) {
            const vt = readVarintMvt(u, o), vf = vt >> 3, vw = vt & 7;
            if (vf === 1 && vw === 2) {
              const sl = readVarintMvt(u, o);
              v = mvtTextDecoder.decode(u.subarray(o.p, o.p + sl));
              o.p += sl;
            } else {
              skipMvt(u, o, vw);
            }
          }
          vals.push(v);
        } else if (lf === 5 && lw === 0) {
          extent = readVarintMvt(u, o) || 4096;
        } else {
          skipMvt(u, o, lw);
        }
      }

      if (!allowedLayers.has(lname)) continue;

      for (const [fsPos, fePos] of feats) {
        const fo = { p: fsPos };
        const tags = [];
        let geomType = 0;
        let geomStart = -1;
        let geomEnd = -1;
        while (fo.p < fePos) {
          const ft = readVarintMvt(u, fo), ff = ft >> 3, fw = ft & 7;
          if (ff === 2 && fw === 2) {
            const tl = readVarintMvt(u, fo), te = fo.p + tl;
            while (fo.p < te) tags.push(readVarintMvt(u, fo));
          } else if (ff === 3 && fw === 0) {
            geomType = readVarintMvt(u, fo);
          } else if (ff === 4 && fw === 2) {
            const gl = readVarintMvt(u, fo);
            geomStart = fo.p;
            geomEnd = fo.p + gl;
            fo.p = geomEnd;
          } else {
            skipMvt(u, fo, fw);
          }
        }
        if (geomStart < 0 || tags.length < 2) continue;

        let nm = '', ref = '', roadClass = '', kindDetail = '';
        for (let i = 0; i + 1 < tags.length; i += 2) {
          const k = keys[tags[i]];
          const v = vals[tags[i + 1]];
          if (!v || !k) continue;
          if (k === 'name:pt') nm = v;
          else if (k === 'name' && !nm) nm = v;
          else if (k === 'name:latin' && !nm) nm = v;
          else if (k === 'ref') ref = v;
          else if (k === 'kind' || k === 'class') roadClass = v;
          else if (k === 'kind_detail' || k === 'subclass') kindDetail = v;
        }

        const go = { p: geomStart };
        if (!includeFullGeometry) {
          let gx = extent / 2, gy = extent / 2, hasPt = false;
          if (go.p < geomEnd) {
            const cmd = readVarintMvt(u, go);
            if ((cmd & 0x7) === 1 && go.p < geomEnd) {
              const dx = readVarintMvt(u, go), dy = readVarintMvt(u, go);
              gx = (dx >>> 1) ^ -(dx & 1);
              gy = (dy >>> 1) ^ -(dy & 1);
              hasPt = true;
            }
          }
          if (!hasPt) continue;
          const [lng, lat] = tilePixToLngLat(z, tx, ty, gx, gy, extent);
          results.push({ layer: lname, name: (nm || ref || '').trim(), roadClass, kindDetail, geomType, lng, lat });
        } else {
          const polylines = [];
          let curLine = null;
          let cx = 0, cy = 0;
          while (go.p < geomEnd) {
            const cmdInt = readVarintMvt(u, go);
            const cmdId = cmdInt & 0x7;
            const count = cmdInt >>> 3;
            if (cmdId === 1) {
              for (let i = 0; i < count && go.p < geomEnd; i++) {
                const dx = readVarintMvt(u, go), dy = readVarintMvt(u, go);
                cx += (dx >>> 1) ^ -(dx & 1);
                cy += (dy >>> 1) ^ -(dy & 1);
                curLine = [tilePixToLngLat(z, tx, ty, cx, cy, extent)];
                polylines.push(curLine);
              }
            } else if (cmdId === 2) {
              for (let i = 0; i < count && go.p < geomEnd; i++) {
                const dx = readVarintMvt(u, go), dy = readVarintMvt(u, go);
                cx += (dx >>> 1) ^ -(dx & 1);
                cy += (dy >>> 1) ^ -(dy & 1);
                if (curLine) curLine.push(tilePixToLngLat(z, tx, ty, cx, cy, extent));
              }
            }
          }
          if (polylines.length > 0) {
            results.push({ layer: lname, name: (nm || ref || '').trim(), roadClass, kindDetail, geomType, polylines });
          }
        }
      }
    } else {
      skipMvt(u, o, tag & 7);
    }
  }
  return results;
}

function extractAndLearnDetailTileStreets(pbfBuffer, z, tx, ty) {
  if (!streetsInsertStmt || !streetsDb || z !== 14) return 0;
  let insertedCount = 0;
  try {
    const [tileCenterLng, tileCenterLat] = tilePixToLngLat(z, tx, ty, 2048, 2048, 4096);
    const nearest = findNearestCityForPoint(tileCenterLat, tileCenterLng, 0.15);
    if (!nearest) return 0;

    const features = parseMvtFeatures(pbfBuffer, z, tx, ty, new Set(['transportation_name', 'poi']), false);
    const learned = [];
    for (const f of features) {
      if (f.name.length >= 2 && /[a-zA-ZÀ-ÿ]/.test(f.name)) {
        learned.push({ name: f.name, kind: f.layer === 'transportation_name' ? 'Via' : 'POI', lat: f.lat, lng: f.lng });
      }
    }

    if (learned.length > 0) {
      let inTx = false;
      try {
        streetsDb.exec('BEGIN IMMEDIATE');
        inTx = true;
      } catch {}
      try {
        for (const item of learned) {
          const id = persistLearnedStreet(item.name, nearest.name, nearest.state, item.kind, item.lat, item.lng);
          if (id) insertedCount++;
        }
        if (inTx) streetsDb.exec('COMMIT');
      } catch {
        if (inTx) { try { streetsDb.exec('ROLLBACK'); } catch {} }
      }
    }
  } catch {
    // ignore background parsing issues
  }
  return insertedCount;
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

function readDetailTileFromDisk(z, tx, ty) {
  const cacheFile = path.join(STORAGE_PATH, 'maps', 'detail_tiles_cache', String(z), String(tx), `${ty}.pbf`);
  if (!fs.existsSync(cacheFile)) return null;
  try {
    return maybeGunzipBuffer(fs.readFileSync(cacheFile));
  } catch {
    return null;
  }
}

const SUPPORT_CATEGORY_RULES = [
  { key: 'hospital', pattern: /\b(hospital|upa|pronto\s*socorro|pronto\s*atendimento|santa\s*casa|samu|ubs|ama|posto\s*de\s*saude|policlinica|maternidade|clinica)\b/i },
  { key: 'rescue', pattern: /\b(bombeiro|bombeiros|defesa\s*civil|resgate|cipa|brigada)\b/i },
  { key: 'police', pattern: /\b(policia|delegacia|batalhao|prf|rodoviaria\s*federal|guarda\s*municipal|dp\b|pm\b|batalhao)\b/i },
  { key: 'fuel', pattern: /\b(posto|combustivel|gasolina|etanol|diesel|ipiranga|petrobras|shell|ale\b|br\s*mania)\b/i },
  { key: 'water', pattern: /\b(agua|fonte|nascente|sabesp|copasa|sanepar|embasa|cedae|reservatorio|bica|poco\s*artesiano)\b/i }
];

function classifySupportCategory(name, kind) {
  const txt = normalizeStr(`${name || ''} ${kind || ''}`);
  for (const rule of SUPPORT_CATEGORY_RULES) {
    if (rule.pattern.test(txt)) return rule.key;
  }
  return null;
}

function findNearbySupport(lat, lng, radiusKm = 25, category = 'all', limit = 40) {
  const candidates = [];
  const normCat = category && category !== 'all' ? category.toLowerCase() : 'all';

  for (const poi of strategicPois) {
    if (normCat !== 'all' && poi.category !== normCat) continue;
    const distKm = haversine(lat, lng, poi.lat, poi.lng);
    if (distKm <= radiusKm) {
      candidates.push({
        id: poi.id,
        name: poi.name,
        category: poi.category,
        city: poi.city,
        state: poi.uf,
        lat: poi.lat,
        lng: poi.lng,
        phone: poi.phone || '',
        details: poi.details || '',
        distanceKm: Math.round(distKm * 100) / 100,
        source: 'estrategico'
      });
    }
  }

  if (streetsReverseBoxStmt) {
    const cosLat = Math.max(0.25, Math.cos((lat * Math.PI) / 180));
    const dLat = radiusKm / 111.0;
    const dLng = radiusKm / (111.0 * cosLat);
    try {
      const boxSql = `SELECT rowid AS id, c0 AS name, c1 AS city, c2 AS state, c3 AS kind, c4 AS lat, c5 AS lng FROM streets_fts_content WHERE c4 BETWEEN ? AND ? AND c5 BETWEEN ? AND ? AND c3 = 'POI' LIMIT 1500`;
      const rows = streetsDb.prepare(boxSql).all(lat - dLat, lat + dLat, lng - dLng, lng + dLng);
      for (const r of rows) {
        const matchedCat = classifySupportCategory(r.name, r.kind);
        if (!matchedCat) continue;
        if (normCat !== 'all' && matchedCat !== normCat) continue;
        const distKm = haversine(lat, lng, r.lat, r.lng);
        if (distKm > radiusKm) continue;
        candidates.push({
          id: `db_${r.id}`,
          name: r.name,
          category: matchedCat,
          city: r.city,
          state: r.state,
          lat: r.lat,
          lng: r.lng,
          phone: '',
          details: 'Ponto identificado no mapa vetorial offline',
          distanceKm: Math.round(distKm * 100) / 100,
          source: 'mapa_offline'
        });
      }
    } catch {}
  }

  candidates.sort((a, b) => a.distanceKm - b.distanceKm || (a.source === 'estrategico' ? -1 : 1));
  const deduped = [];
  const seen = new Set();
  for (const item of candidates) {
    const key = `${item.category}|${normalizeStr(item.name).slice(0, 26)}|${Math.round(item.lat * 200)},${Math.round(item.lng * 200)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
    if (deduped.length >= limit) break;
  }
  return deduped;
}

function findRouteCorridorSupport(coords, maxDistKm = 5.0, limit = 18) {
  if (!Array.isArray(coords) || coords.length < 2) return [];

  // Subsample long geometry for fast bounded distance evaluation while keeping endpoints
  const stride = Math.max(1, Math.floor(coords.length / 180));
  const sampled = [];
  for (let i = 0; i < coords.length; i += stride) {
    sampled.push(coords[i]);
  }
  const lastCoord = coords[coords.length - 1];
  const prevSample = sampled[sampled.length - 1];
  if (!prevSample || prevSample[0] !== lastCoord[0] || prevSample[1] !== lastCoord[1]) {
    sampled.push(lastCoord);
  }

  const cumKm = [0];
  let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
  for (let i = 0; i < sampled.length; i++) {
    const [lng, lat] = sampled[i];
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (i > 0) {
      cumKm.push(cumKm[i - 1] + haversine(sampled[i - 1][1], sampled[i - 1][0], lat, lng));
    }
  }

  const degPad = (maxDistKm + 3) / 111.0;
  const boxMinLat = minLat - degPad;
  const boxMaxLat = maxLat + degPad;
  const boxMinLng = minLng - degPad;
  const boxMaxLng = maxLng + degPad;

  const rawCandidates = [];
  for (const poi of strategicPois) {
    if (poi.lat < boxMinLat || poi.lat > boxMaxLat || poi.lng < boxMinLng || poi.lng > boxMaxLng) continue;
    rawCandidates.push({
      id: poi.id,
      name: poi.name,
      category: poi.category,
      city: poi.city,
      state: poi.uf,
      lat: poi.lat,
      lng: poi.lng,
      phone: poi.phone || '',
      details: poi.details || '',
      source: 'estrategico'
    });
  }

  if (streetsReverseBoxStmt && streetsDb) {
    try {
      const boxSql = `SELECT rowid AS id, c0 AS name, c1 AS city, c2 AS state, c3 AS kind, c4 AS lat, c5 AS lng FROM streets_fts_content WHERE c4 BETWEEN ? AND ? AND c5 BETWEEN ? AND ? AND c3 = 'POI' LIMIT 2500`;
      const rows = streetsDb.prepare(boxSql).all(boxMinLat, boxMaxLat, boxMinLng, boxMaxLng);
      for (const r of rows) {
        const cat = classifySupportCategory(r.name, r.kind);
        if (!cat) continue;
        rawCandidates.push({
          id: `db_${r.id}`,
          name: r.name,
          category: cat,
          city: r.city,
          state: r.state,
          lat: r.lat,
          lng: r.lng,
          phone: '',
          details: 'Apoio no mapa vetorial offline',
          source: 'mapa_offline'
        });
      }
    } catch {}
  }

  const hits = [];
  for (const item of rawCandidates) {
    let bestDist = Infinity;
    let bestAlongKm = 0;
    for (let i = 0; i < sampled.length - 1; i++) {
      const a = sampled[i];
      const b = sampled[i + 1];
      const d = distToSegment(item.lng, item.lat, a[0], a[1], b[0], b[1]);
      if (d < bestDist) {
        bestDist = d;
        const midLat = (a[1] + b[1]) / 2;
        const midLng = (a[0] + b[0]) / 2;
        bestAlongKm = cumKm[i] + haversine(a[1], a[0], midLat, midLng);
      }
    }
    if (bestDist <= maxDistKm) {
      hits.push({
        ...item,
        distFromRouteKm: Math.round(bestDist * 10) / 10,
        kmAlongRoute: Math.round(bestAlongKm * 10) / 10
      });
    }
  }

  hits.sort((a, b) => a.kmAlongRoute - b.kmAlongRoute || a.distFromRouteKm - b.distFromRouteKm);
  const deduped = [];
  const seen = new Set();
  for (const h of hits) {
    const key = `${h.category}|${normalizeStr(h.name).slice(0, 26)}|${Math.round(h.lat * 200)},${Math.round(h.lng * 200)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(h);
    if (deduped.length >= limit) break;
  }
  return deduped;
}

function reverseGeocodeOffline(lat, lng) {
  const nearestCity = findNearestCityForPoint(lat, lng, 0.25);
  let bestRoad = null;
  let bestRoadScoreKm = Infinity;
  let bestRoadRawKm = Infinity;

  // 1. Inspect cached z=14 detail tile polyline geometry first, plus z=13 PMTiles roads
  const [tx14, ty14] = latLngToTileXY(lat, lng, 14);
  const buf14 = readDetailTileFromDisk(14, tx14, ty14);
  const [tx13, ty13] = latLngToTileXY(lat, lng, 13);
  const buf13 = readLocalPmtilesTile(13, tx13, ty13);

  const checkTileRoads = (buf, z, tx, ty, layers, bonusKm) => {
    if (!buf) return;
    const feats = parseMvtFeatures(buf, z, tx, ty, new Set(layers), true);
    for (const f of feats) {
      if (!f.name || f.geomType !== 2) continue;
      if (f.roadClass === 'rail' || f.roadClass === 'ferry' || f.roadClass === 'transit') continue;
      for (const line of f.polylines) {
        for (let i = 0; i + 1 < line.length; i++) {
          const p0 = line[i];
          const p1 = line[i + 1];
          const dKm = distToSegment(lng, lat, p0[0], p0[1], p1[0], p1[1]);
          const scoreKm = dKm - bonusKm;
          if (scoreKm < bestRoadScoreKm) {
            bestRoadScoreKm = scoreKm;
            bestRoadRawKm = dKm;
            const kindLabel = f.roadClass === 'highway' || f.roadClass === 'motorway' ? 'Rodovia' : 'Via';
            bestRoad = {
              name: f.name,
              city: nearestCity ? nearestCity.name : '',
              state: nearestCity ? nearestCity.state : 'BR',
              kind: kindLabel,
              lat: Math.round(lat * 100000) / 100000,
              lng: Math.round(lng * 100000) / 100000
            };
          }
        }
      }
    }
  };

  checkTileRoads(buf14, 14, tx14, ty14, ['transportation_name'], 0.04);
  checkTileRoads(buf13, 13, tx13, ty13, ['roads'], 0.02);

  // 2. Fallback / refinement via SQLite spatial box
  const nearbyPois = [];
  if (streetsReverseBoxStmt) {
    try {
      const rows = streetsReverseBoxStmt.all(lat - 0.015, lat + 0.015, lng - 0.015, lng + 0.015);
      for (const r of rows) {
        const dKm = haversine(lat, lng, r.lat, r.lng);
        if (r.kind === 'Via') {
          if (dKm < bestRoadScoreKm) {
            bestRoadScoreKm = dKm;
            bestRoadRawKm = dKm;
            bestRoad = {
              id: r.id,
              name: r.name,
              city: r.city,
              state: r.state,
              kind: r.kind,
              lat: r.lat,
              lng: r.lng
            };
          }
        } else if (r.kind === 'POI' || r.kind === 'Bairro') {
          nearbyPois.push({
            id: r.id,
            name: r.name,
            city: r.city,
            state: r.state,
            kind: r.kind,
            lat: r.lat,
            lng: r.lng,
            distanceMeters: Math.round(dKm * 1000)
          });
        }
      }
    } catch {}
  }

  for (const poi of strategicPois) {
    const dKm = haversine(lat, lng, poi.lat, poi.lng);
    if (dKm <= 3.0) {
      nearbyPois.push({
        id: poi.id,
        name: poi.name,
        city: poi.city,
        state: poi.uf,
        kind: poi.category,
        lat: poi.lat,
        lng: poi.lng,
        distanceMeters: Math.round(dKm * 1000)
      });
    }
  }

  nearbyPois.sort((a, b) => a.distanceMeters - b.distanceMeters);
  if (bestRoad && bestRoadRawKm > 2.5) {
    bestRoad = null;
  }

  return {
    street: bestRoad,
    distanceMeters: bestRoad ? Math.max(0, Math.round(bestRoadRawKm * 1000)) : null,
    nearbyPois: nearbyPois.slice(0, 3),
    city: nearestCity ? {
      id: nearestCity.id,
      name: nearestCity.name,
      state: nearestCity.state,
      ddd: nearestCity.ddd || '',
      codigo_ibge: nearestCity.codigo_ibge || '',
      lat: nearestCity.lat,
      lng: nearestCity.lng
    } : null
  };
}

class RouteMinHeap {
  constructor() { this.items = []; }
  get size() { return this.items.length; }
  push(node) {
    this.items.push(node);
    let i = this.items.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.items[p].f <= this.items[i].f) break;
      const tmp = this.items[p];
      this.items[p] = this.items[i];
      this.items[i] = tmp;
      i = p;
    }
  }
  pop() {
    const top = this.items[0];
    const last = this.items.pop();
    if (this.items.length > 0) {
      this.items[0] = last;
      let i = 0;
      const n = this.items.length;
      while (true) {
        let best = i;
        const l = (i << 1) + 1;
        const r = l + 1;
        if (l < n && this.items[l].f < this.items[best].f) best = l;
        if (r < n && this.items[r].f < this.items[best].f) best = r;
        if (best === i) break;
        const tmp = this.items[i];
        this.items[i] = this.items[best];
        this.items[best] = tmp;
        i = best;
      }
    }
    return top;
  }
}

function getRoadWeightFactor(roadClass, kindDetail, profile) {
  const c = String(roadClass || '').toLowerCase();
  const kd = String(kindDetail || '').toLowerCase();
  if (c === 'rail' || c === 'ferry' || c === 'transit' || c === 'raceway') return 0;
  if (profile === 'walking') {
    if (c === 'motorway' || kd === 'motorway') return 3.0;
    if (c === 'path' || kd === 'footway' || kd === 'pedestrian' || kd === 'steps') return 0.9;
    return 1.0;
  }
  if (c === 'path' || kd === 'footway' || kd === 'steps' || kd === 'cycleway') {
    return profile === 'tactical' ? 2.4 : 4.5;
  }
  if (c === 'highway' || c === 'motorway' || c === 'trunk' || kd === 'motorway' || kd === 'trunk') return 0.85;
  if (c === 'major_road' || c === 'primary' || c === 'secondary') return 0.92;
  if (c === 'medium_road' || c === 'tertiary') return 1.0;
  return 1.12;
}

function computeBearingDeg(lat1, lng1, lat2, lng2) {
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dl = ((lng2 - lng1) * Math.PI) / 180;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function computeOfflineGraphRoute(fromLat, fromLng, toLat, toLng, profile = 'driving', fromLabel = '', toLabel = '') {
  const directDist = haversine(fromLat, fromLng, toLat, toLng);
  if (directDist > 30 || !pmtilesFd) return null;

  const minLat = Math.min(fromLat, toLat) - 0.015;
  const maxLat = Math.max(fromLat, toLat) + 0.015;
  const minLng = Math.min(fromLng, toLng) - 0.015;
  const maxLng = Math.max(fromLng, toLng) + 0.015;

  const nodes = new Map();
  const qKey = (lat, lng) => `${Math.round(lat * 8500)},${Math.round(lng * 8500)}`;

  function ensureNode(lat, lng) {
    const k = qKey(lat, lng);
    let node = nodes.get(k);
    if (!node) {
      node = { key: k, lat, lng, edges: [] };
      nodes.set(k, node);
    }
    return node;
  }

  function addSegmentEdge(lat1, lng1, lat2, lng2, roadName, weightFactor) {
    const distKm = haversine(lat1, lng1, lat2, lng2);
    if (distKm < 0.001) return;
    const stepsCount = distKm > 0.14 ? Math.min(12, Math.ceil(distKm / 0.11)) : 1;
    let prev = ensureNode(lat1, lng1);
    for (let s = 1; s <= stepsCount; s++) {
      const frac = s / stepsCount;
      const curLat = s === stepsCount ? lat2 : lat1 + (lat2 - lat1) * frac;
      const curLng = s === stepsCount ? lng2 : lng1 + (lng2 - lng1) * frac;
      const cur = ensureNode(curLat, curLng);
      if (prev.key !== cur.key) {
        const segLen = haversine(prev.lat, prev.lng, cur.lat, cur.lng);
        const cost = segLen * weightFactor;
        prev.edges.push({ to: cur.key, cost, distKm: segLen, name: roadName });
        cur.edges.push({ to: prev.key, cost, distKm: segLen, name: roadName });
      }
      prev = cur;
    }
  }

  // Load z=13 tiles (and optional cached z=14 tiles for finer urban mesh & street names)
  const [x13a, y13a] = latLngToTileXY(maxLat, minLng, 13);
  const [x13b, y13b] = latLngToTileXY(minLat, maxLng, 13);
  let loaded13 = 0;
  for (let x = Math.min(x13a, x13b); x <= Math.max(x13a, x13b) && loaded13 < 20; x++) {
    for (let y = Math.min(y13a, y13b); y <= Math.max(y13a, y13b) && loaded13 < 20; y++) {
      const buf = readLocalPmtilesTile(13, x, y);
      if (!buf) continue;
      loaded13++;
      const feats = parseMvtFeatures(buf, 13, x, y, new Set(['roads']), true);
      for (const f of feats) {
        if (f.geomType !== 2) continue;
        const wf = getRoadWeightFactor(f.roadClass, f.kindDetail, profile);
        if (wf <= 0) continue;
        for (const line of f.polylines) {
          for (let i = 0; i + 1 < line.length; i++) {
            addSegmentEdge(line[i][1], line[i][0], line[i + 1][1], line[i + 1][0], f.name, wf);
          }
        }
      }
    }
  }

  const [x14a, y14a] = latLngToTileXY(maxLat, minLng, 14);
  const [x14b, y14b] = latLngToTileXY(minLat, maxLng, 14);
  let loaded14 = 0;
  for (let x = Math.min(x14a, x14b); x <= Math.max(x14a, x14b) && loaded14 < 36; x++) {
    for (let y = Math.min(y14a, y14b); y <= Math.max(y14a, y14b) && loaded14 < 36; y++) {
      const buf14 = readDetailTileFromDisk(14, x, y);
      if (!buf14) continue;
      loaded14++;
      const feats = parseMvtFeatures(buf14, 14, x, y, new Set(['transportation', 'transportation_name']), true);
      const nameHints = new Map();
      for (const f of feats) {
        if (f.layer !== 'transportation_name' || !f.name) continue;
        for (const line of f.polylines) {
          for (const pt of line) {
            const hk = `${Math.round(pt[1] * 3500)},${Math.round(pt[0] * 3500)}`;
            if (!nameHints.has(hk)) nameHints.set(hk, f.name);
          }
        }
      }
      for (const f of feats) {
        if (f.geomType !== 2) continue;
        const wf = getRoadWeightFactor(f.roadClass, f.kindDetail, profile);
        if (wf <= 0) continue;
        for (const line of f.polylines) {
          for (let i = 0; i + 1 < line.length; i++) {
            const lat1 = line[i][1], lng1 = line[i][0];
            const lat2 = line[i + 1][1], lng2 = line[i + 1][0];
            let rName = f.name;
            if (!rName) {
              const midK = `${Math.round(((lat1 + lat2) / 2) * 3500)},${Math.round(((lng1 + lng2) / 2) * 3500)}`;
              rName = nameHints.get(midK) || '';
            }
            addSegmentEdge(lat1, lng1, lat2, lng2, rName, wf * 0.95);
          }
        }
      }
    }
  }

  if (nodes.size < 5) return null;

  // Snap start & end to nearest connected graph nodes (within 2.0 km)
  let startNode = null, endNode = null;
  let bestStartDist = 2.0, bestEndDist = 2.0;
  for (const node of nodes.values()) {
    if (node.edges.length === 0) continue;
    const dStart = haversine(fromLat, fromLng, node.lat, node.lng);
    if (dStart < bestStartDist) { bestStartDist = dStart; startNode = node; }
    const dEnd = haversine(toLat, toLng, node.lat, node.lng);
    if (dEnd < bestEndDist) { bestEndDist = dEnd; endNode = node; }
  }
  if (!startNode || !endNode) return null;

  // A* Search
  const gScore = new Map([[startNode.key, 0]]);
  const cameFrom = new Map();
  const closed = new Set();
  const open = new RouteMinHeap();
  open.push({ key: startNode.key, f: haversine(startNode.lat, startNode.lng, endNode.lat, endNode.lng) * 0.85 });

  let found = false;
  let iterations = 0;
  const maxIterations = 120000;
  while (open.size > 0 && iterations < maxIterations) {
    iterations++;
    const current = open.pop();
    if (current.key === endNode.key) {
      found = true;
      break;
    }
    if (closed.has(current.key)) continue;
    closed.add(current.key);

    const curNode = nodes.get(current.key);
    const curG = gScore.get(current.key);
    for (const edge of curNode.edges) {
      if (closed.has(edge.to)) continue;
      const tentativeG = curG + edge.cost;
      const prevG = gScore.get(edge.to);
      if (prevG === undefined || tentativeG < prevG) {
        gScore.set(edge.to, tentativeG);
        cameFrom.set(edge.to, { prev: current.key, edge });
        const nextNode = nodes.get(edge.to);
        const h = haversine(nextNode.lat, nextNode.lng, endNode.lat, endNode.lng) * 0.85;
        open.push({ key: edge.to, f: tentativeG + h });
      }
    }
  }

  if (!found) return null;

  // Reconstruct path
  const pathEdges = [];
  let cursor = endNode.key;
  while (cursor !== startNode.key) {
    const step = cameFrom.get(cursor);
    if (!step) break;
    pathEdges.push({ fromKey: step.prev, toKey: cursor, edge: step.edge });
    cursor = step.prev;
  }
  pathEdges.reverse();

  const coords = [[fromLng, fromLat]];
  if (haversine(fromLat, fromLng, startNode.lat, startNode.lng) > 0.015) {
    coords.push([startNode.lng, startNode.lat]);
  }
  let totalDistKm = bestStartDist + bestEndDist;
  for (const pe of pathEdges) {
    const toN = nodes.get(pe.toKey);
    coords.push([toN.lng, toN.lat]);
    totalDistKm += pe.edge.distKm;
  }
  if (haversine(toLat, toLng, endNode.lat, endNode.lng) > 0.015) {
    coords.push([toLng, toLat]);
  }

  const distanceKm = Math.round(totalDistKm * 10) / 10;
  let speedKmh = totalDistKm < 35 ? 32 : 68;
  if (profile === 'tactical') speedKmh = totalDistKm < 35 ? 24 : 46;
  if (profile === 'walking') speedKmh = 4.5;

  const durationMin = Math.max(1, Math.round((distanceKm / speedKmh) * 60));
  const fuelLiters = profile === 'walking' ? 0 : Math.round((distanceKm / (profile === 'tactical' ? 8 : 12)) * 10) / 10;
  const waterLiters = profile === 'walking' ? Math.max(0.5, Math.round(((durationMin / 60) / 8) * 3.5 * 10) / 10) : 0;
  const caloriesKcal = profile === 'walking' ? Math.round((durationMin / 60) * 380) : 0;

  // Group turn-by-turn steps by road name
  const steps = [{
    instruction: `Partida de ${fromLabel || 'Origem'} em direção à via conectada`,
    distanceKm: Math.round(bestStartDist * 10) / 10,
    type: 'depart'
  }];

  let curName = null;
  let curSegDist = 0;
  let curStartBearing = null;
  let prevGroupBearing = null;

  for (const pe of pathEdges) {
    const fn = nodes.get(pe.fromKey);
    const tn = nodes.get(pe.toKey);
    const segBearing = computeBearingDeg(fn.lat, fn.lng, tn.lat, tn.lng);
    const roadLabel = pe.edge.name || 'Via sem denominação no tile';

    if (curName === null) {
      curName = roadLabel;
      curSegDist = pe.edge.distKm;
      curStartBearing = segBearing;
    } else if (roadLabel === curName || (!pe.edge.name && curSegDist < 0.15)) {
      curSegDist += pe.edge.distKm;
    } else {
      let action = profile === 'walking' ? 'Caminhe' : 'Siga';
      if (prevGroupBearing !== null) {
        const diff = ((curStartBearing - prevGroupBearing + 540) % 360) - 180;
        if (diff >= 28 && diff <= 145) action = 'Vire à direita';
        else if (diff <= -28 && diff >= -145) action = 'Vire à esquerda';
      }
      steps.push({
        instruction: `${action} na ${curName}`,
        distanceKm: Math.round(curSegDist * 10) / 10,
        type: action.includes('direita') || action.includes('esquerda') ? 'turn' : 'step'
      });
      prevGroupBearing = curStartBearing;
      curName = roadLabel;
      curSegDist = pe.edge.distKm;
      curStartBearing = segBearing;
    }
  }
  if (curName !== null) {
    let action = profile === 'walking' ? 'Caminhe' : 'Siga';
    if (prevGroupBearing !== null && curStartBearing !== null) {
      const diff = ((curStartBearing - prevGroupBearing + 540) % 360) - 180;
      if (diff >= 28 && diff <= 145) action = 'Vire à direita';
      else if (diff <= -28 && diff >= -145) action = 'Vire à esquerda';
    }
    steps.push({
      instruction: `${action} na ${curName}`,
      distanceKm: Math.round(curSegDist * 10) / 10,
      type: action.includes('direita') || action.includes('esquerda') ? 'turn' : 'step'
    });
  }
  steps.push({
    instruction: `Chegada em ${toLabel || 'Destino'}`,
    distanceKm: Math.round(bestEndDist * 10) / 10,
    type: 'arrive'
  });

  return {
    source: 'offline_graph',
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

function readJsonRequestBody(req, maxBytes = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error('Payload excede o limite'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8').trim();
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

const campBoardFile = path.join(STORAGE_PATH, 'camp_board.json');

function readCampBoard() {
  if (!fs.existsSync(campBoardFile)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(campBoardFile, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCampBoard(entries) {
  fs.mkdirSync(path.dirname(campBoardFile), { recursive: true });
  fs.writeFileSync(campBoardFile, JSON.stringify(entries, null, 2), 'utf8');
}

function decodeHtmlEntities(str) {
  return String(str || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const KIWIX_INTERNAL_BASES = [
  'http://nomad_brasil_kiwix:8080',
  'http://host.docker.internal:8090',
  'http://127.0.0.1:8090'
];

async function fetchKiwixServerText(relPath) {
  for (const base of KIWIX_INTERNAL_BASES) {
    try {
      const r = await fetch(`${base}${relPath}`, { signal: AbortSignal.timeout(2500) });
      if (r.ok) return await r.text();
    } catch {}
  }
  return null;
}

const server = http.createServer((req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(urlObj.pathname);

  // CORS headers for offline flexibility
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // 1. API: Status (live diagnostics)
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

    const routesCacheDir = path.join(__dirname, 'data', 'routes_cache');
    const routesCachedCount = fs.existsSync(routesCacheDir)
      ? fs.readdirSync(routesCacheDir).filter(f => f.endsWith('.json')).length
      : 0;
    const detailTilesCachedCount = countFilesRecursive(path.join(STORAGE_PATH, 'maps', 'detail_tiles_cache'), '.pbf');
    const zims = listInstalledZims();
    const campBoardEntries = readCampBoard();

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
        streetsIndexAvailable: Boolean(streetsDb && streetsSearchStmt),
        streetsCount: cachedStreetsCount,
        routesCachedCount,
        detailTilesCachedCount,
        zimFilesCount: zims.length,
        campBoardCount: campBoardEntries.length,
        primaryZimBook: zims[0]?.book || 'wikipedia_pt_all_maxi_2026-05'
      },
      port: PORT,
      lanIps: getLocalLanIps()
    }));
    return;
  }

  // 1.1 API: Persistent server-side tactical waypoints
  if (pathname === '/api/waypoints') {
    const wptFile = path.join(STORAGE_PATH, 'user_waypoints.json');
    if (req.method === 'GET') {
      let arr = [];
      if (fs.existsSync(wptFile)) {
        try {
          const parsed = JSON.parse(fs.readFileSync(wptFile, 'utf8'));
          if (Array.isArray(parsed)) arr = parsed;
        } catch {}
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(arr));
      return;
    }
    if (req.method === 'POST') {
      readJsonRequestBody(req).then((body) => {
        if (!Array.isArray(body)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Esperado array JSON de marcadores' }));
          return;
        }
        const cleaned = body
          .filter(w => w && typeof w.name === 'string' && !isNaN(Number(w.lat)) && !isNaN(Number(w.lng)))
          .map(w => ({
            id: String(w.id || `wpt_${Date.now()}`),
            name: w.name.trim().slice(0, 140),
            category: String(w.category || 'base'),
            lat: Number(w.lat),
            lng: Number(w.lng),
            createdAt: String(w.createdAt || new Date().toISOString())
          }));
        fs.mkdirSync(path.dirname(wptFile), { recursive: true });
        fs.writeFileSync(wptFile, JSON.stringify(cleaned, null, 2), 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, count: cleaned.length }));
      }).catch(() => {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'JSON inválido' }));
      });
      return;
    }
  }

  // 1.15 API: Shared LAN Camp Board / Operational Log
  if (pathname === '/api/camp-board') {
    if (req.method === 'GET') {
      const entries = readCampBoard();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, count: entries.length, entries }));
      return;
    }
    if (req.method === 'POST') {
      readJsonRequestBody(req).then((body) => {
        const msg = String(body?.message || '').trim();
        if (!msg) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, error: 'Mensagem obrigatória' }));
          return;
        }
        const validCats = new Set(['alert', 'qth', 'supply', 'radio', 'log']);
        const catRaw = String(body?.category || 'log').trim().toLowerCase();
        const latRaw = body?.lat;
        const lngRaw = body?.lng;
        const lat = (latRaw !== null && latRaw !== undefined && latRaw !== '' && !isNaN(Number(latRaw))) ? Number(latRaw) : null;
        const lng = (lngRaw !== null && lngRaw !== undefined && lngRaw !== '' && !isNaN(Number(lngRaw))) ? Number(lngRaw) : null;

        const entry = {
          id: `cb_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          author: String(body?.author || 'Operador').trim().slice(0, 40) || 'Operador',
          category: validCats.has(catRaw) ? catRaw : 'log',
          message: msg.slice(0, 500),
          lat,
          lng,
          createdAt: new Date().toISOString()
        };
        const entries = readCampBoard();
        entries.unshift(entry);
        const trimmed = entries.slice(0, 100);
        writeCampBoard(trimmed);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, entry, count: trimmed.length }));
      }).catch(() => {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: 'JSON inválido' }));
      });
      return;
    }
    if (req.method === 'DELETE') {
      const targetId = (urlObj.searchParams.get('id') || '').trim();
      let entries = readCampBoard();
      if (targetId === 'all') {
        entries = [];
      } else if (targetId) {
        entries = entries.filter(e => e.id !== targetId);
      }
      writeCampBoard(entries);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, count: entries.length }));
      return;
    }
  }

  // 1.2 API: Offline Kiwix URL Resolver & Bookshelf
  if (pathname === '/api/kiwix/resolve') {
    const q = (urlObj.searchParams.get('q') || '').trim();
    const reqBook = (urlObj.searchParams.get('book') || '').trim();
    const reqCat = (urlObj.searchParams.get('category') || '').trim().toLowerCase();
    const zims = listInstalledZims();

    let matched = null;
    if (reqBook) {
      matched = zims.find(z => z.book === reqBook || z.book.toLowerCase().includes(reqBook.toLowerCase())) || null;
    }
    if (!matched && reqCat) {
      matched = zims.find(z => z.category === reqCat) || null;
    }
    if (!matched) {
      matched = zims[0] || { book: reqBook || 'wikipedia_pt_all_maxi_2026-05', title: 'Wikipédia PT Completa', category: 'wikipedia' };
    }

    const hostHeader = (req.headers.host || 'localhost').split(':')[0];
    const cleanTarget = q.replace(/ /g, '_');
    const searchUrl = `http://${hostHeader}:8090/search?content=${encodeURIComponent(matched.book)}&pattern=${encodeURIComponent(q)}`;
    const articleUrl = q
      ? `http://${hostHeader}:8090/content/${encodeURIComponent(matched.book)}/${encodeURIComponent(cleanTarget)}`
      : `http://${hostHeader}:8090/content/${encodeURIComponent(matched.book)}`;
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      ok: true,
      book: matched.book,
      title: matched.title,
      category: matched.category,
      installedCount: zims.length,
      searchUrl,
      articleUrl
    }));
    return;
  }

  if (pathname === '/api/kiwix/books') {
    const zims = listInstalledZims();
    const hostHeader = (req.headers.host || 'localhost').split(':')[0];
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      ok: true,
      host: hostHeader,
      port: 8090,
      books: zims
    }));
    return;
  }

  if (pathname === '/api/kiwix/search') {
    const q = (urlObj.searchParams.get('q') || '').trim();
    const catFilter = (urlObj.searchParams.get('category') || '').trim().toLowerCase();
    if (!q) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, query: '', total: 0, results: [] }));
      return;
    }

    (async () => {
      const hostHeader = (req.headers.host || 'localhost').split(':')[0];
      let zims = listInstalledZims();
      if (catFilter && catFilter !== 'all') {
        zims = zims.filter(z => z.category === catFilter);
      }
      // Prioritize a balanced mix across top categories (Wikipedia, Medicine, Travel, Books, NHS/FAS/CDC)
      const selectedBooks = zims.slice(0, 8);

      const perBookResults = await Promise.all(selectedBooks.map(async (b) => {
        const items = [];
        const searchHtml = await fetchKiwixServerText(`/search?content=${encodeURIComponent(b.book)}&pattern=${encodeURIComponent(q)}&pageLength=4`);
        if (searchHtml) {
          const liRegex = /<li>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>(?:[\s\S]*?<cite>([\s\S]*?)<\/cite>)?[\s\S]*?<\/li>/gi;
          let m;
          while ((m = liRegex.exec(searchHtml)) !== null && items.length < 4) {
            const rawHref = m[1];
            if (!rawHref || rawHref.startsWith('#')) continue;
            const title = decodeHtmlEntities(m[2]);
            if (!title) continue;
            const snippet = decodeHtmlEntities(m[3] || '');
            const prefix = `/content/${b.book}/`;
            let relPath = rawHref.startsWith(prefix) ? rawHref.slice(prefix.length) : rawHref.replace(/^\/+/, '');
            try { relPath = decodeURIComponent(relPath); } catch {}
            items.push({
              book: b.book,
              bookTitle: b.title,
              category: b.category,
              icon: b.icon,
              title,
              path: relPath,
              articleUrl: `http://${hostHeader}:8090${rawHref}`,
              snippet: snippet.slice(0, 220)
            });
          }
        }
        if (items.length === 0) {
          const suggestJson = await fetchKiwixServerText(`/suggest?content=${encodeURIComponent(b.book)}&term=${encodeURIComponent(q)}`);
          if (suggestJson) {
            try {
              const sug = JSON.parse(suggestJson);
              if (Array.isArray(sug)) {
                for (const s of sug.slice(0, 3)) {
                  const title = decodeHtmlEntities(s.value || s.label || '');
                  const relPath = String(s.path || s.value || '').trim();
                  if (!title || !relPath) continue;
                  items.push({
                    book: b.book,
                    bookTitle: b.title,
                    category: b.category,
                    icon: b.icon,
                    title,
                    path: relPath,
                    articleUrl: `http://${hostHeader}:8090/content/${encodeURIComponent(b.book)}/${encodeURIComponent(relPath)}`,
                    snippet: ''
                  });
                }
              }
            } catch {}
          }
        }
        return items;
      }));

      const flattened = perBookResults.flat();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        ok: true,
        query: q,
        total: flattened.length,
        results: flattened
      }));
    })().catch(() => {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'Falha ao consultar Kiwix Multi-ZIM', results: [] }));
    });
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

  // 2.2 API: Offline Reverse Geocoding (MVT tile geometry + SQLite FTS5)
  if (pathname === '/api/streets/reverse') {
    const lat = parseFloat(urlObj.searchParams.get('lat'));
    const lng = parseFloat(urlObj.searchParams.get('lng'));
    if (isNaN(lat) || isNaN(lng)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Coordenadas inválidas' }));
      return;
    }
    const result = reverseGeocodeOffline(lat, lng);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(result));
    return;
  }

  // 2.3 API: Nearby Emergency & Support Radar
  if (pathname === '/api/nearby-support') {
    const lat = parseFloat(urlObj.searchParams.get('lat'));
    const lng = parseFloat(urlObj.searchParams.get('lng'));
    const radiusKm = Math.min(80, Math.max(1, parseFloat(urlObj.searchParams.get('radiusKm') || '25') || 25));
    const category = urlObj.searchParams.get('category') || 'all';
    if (isNaN(lat) || isNaN(lng)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Coordenadas inválidas' }));
      return;
    }
    const items = findNearbySupport(lat, lng, radiusKm, category, 40);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(items));
    return;
  }

  // 2.4 API: Batch Prefetch z=14 Residential Tiles & Index All Streets for a City
  if (pathname === '/api/maps/prefetch-city') {
    (async () => {
      let lat = parseFloat(urlObj.searchParams.get('lat'));
      let lng = parseFloat(urlObj.searchParams.get('lng'));
      let radiusKm = parseFloat(urlObj.searchParams.get('radiusKm') || '3.0');
      if (req.method === 'POST') {
        try {
          const body = await readJsonRequestBody(req, 64 * 1024);
          if (body.lat !== undefined) lat = parseFloat(body.lat);
          if (body.lng !== undefined) lng = parseFloat(body.lng);
          if (body.radiusKm !== undefined) radiusKm = parseFloat(body.radiusKm);
        } catch {}
      }
      if (isNaN(lat) || isNaN(lng)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Parâmetros lat/lng inválidos' }));
        return;
      }
      radiusKm = Math.min(5.5, Math.max(1.0, isNaN(radiusKm) ? 3.0 : radiusKm));

      const cosLat = Math.max(0.25, Math.cos((lat * Math.PI) / 180));
      const dLat = radiusKm / 111.0;
      const dLng = radiusKm / (111.0 * cosLat);
      const [cx, cy] = latLngToTileXY(lat, lng, 14);
      const [x1, y1] = latLngToTileXY(lat + dLat, lng - dLng, 14);
      const [x2, y2] = latLngToTileXY(lat - dLat, lng + dLng, 14);

      const tileCoords = [];
      for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
        for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
          tileCoords.push({ x, y, dist: Math.hypot(x - cx, y - cy) });
        }
      }
      tileCoords.sort((a, b) => a.dist - b.dist);
      const selectedTiles = tileCoords.slice(0, 25);

      let tilesDownloaded = 0;
      let tilesCached = 0;
      let streetsLearnedNow = 0;
      let tmpl = await getOpenFreeMapTemplate(false);

      let idx = 0;
      const workers = Array.from({ length: 4 }, async () => {
        while (idx < selectedTiles.length) {
          const t = selectedTiles[idx++];
          const cacheFile = path.join(STORAGE_PATH, 'maps', 'detail_tiles_cache', '14', String(t.x), `${t.y}.pbf`);
          let buf = null;
          if (fs.existsSync(cacheFile)) {
            tilesCached++;
            try { buf = maybeGunzipBuffer(fs.readFileSync(cacheFile)); } catch {}
          } else {
            try {
              let tileUrl = tmpl.replace('{z}', '14').replace('{x}', String(t.x)).replace('{y}', String(t.y));
              let r = await fetch(tileUrl, { signal: AbortSignal.timeout(4500) });
              if (r.status === 404 || r.status === 410) {
                tmpl = await getOpenFreeMapTemplate(true);
                tileUrl = tmpl.replace('{z}', '14').replace('{x}', String(t.x)).replace('{y}', String(t.y));
                r = await fetch(tileUrl, { signal: AbortSignal.timeout(4500) });
              }
              if (r.ok) {
                buf = maybeGunzipBuffer(Buffer.from(await r.arrayBuffer()));
                fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
                fs.writeFileSync(cacheFile, buf);
                tilesDownloaded++;
              }
            } catch {}
          }
          if (buf && buf.length > 0) {
            streetsLearnedNow += extractAndLearnDetailTileStreets(buf, 14, t.x, t.y);
          }
        }
      });

      await Promise.all(workers);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        ok: true,
        tilesTotal: selectedTiles.length,
        tilesDownloaded,
        tilesCached,
        streetsLearnedNow,
        totalStreetsInDb: cachedStreetsCount
      }));
    })().catch(() => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Falha ao baixar ruas da cidade' }));
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

function mergeOfflineLegs(leg1, leg2, viaLabel) {
  const coords1 = leg1.geometry?.coordinates || [];
  const coords2 = leg2.geometry?.coordinates || [];
  const mergedCoords = coords1.concat(coords2.length > 0 ? coords2.slice(1) : []);
  const steps1 = Array.isArray(leg1.steps) ? leg1.steps : [];
  const steps2 = Array.isArray(leg2.steps) ? leg2.steps : [];
  const mergedSteps = [
    ...steps1,
    { instruction: `📍 Parada intermediária em ${viaLabel || 'Ponto Via'}`, distanceKm: 0, type: 'waypoint' },
    ...steps2.slice(steps2[0]?.type === 'depart' ? 1 : 0)
  ];
  return {
    source: (leg1.source === 'offline_graph' && leg2.source === 'offline_graph') ? 'offline_graph' : 'offline_corridor',
    profile: leg1.profile,
    distanceKm: Math.round(((leg1.distanceKm || 0) + (leg2.distanceKm || 0)) * 10) / 10,
    durationMin: Math.round((leg1.durationMin || 0) + (leg2.durationMin || 0)),
    fuelLiters: Math.round(((leg1.fuelLiters || 0) + (leg2.fuelLiters || 0)) * 10) / 10,
    waterLiters: Math.round(((leg1.waterLiters || 0) + (leg2.waterLiters || 0)) * 10) / 10,
    caloriesKcal: Math.round((leg1.caloriesKcal || 0) + (leg2.caloriesKcal || 0)),
    geometry: {
      type: 'LineString',
      coordinates: mergedCoords
    },
    steps: mergedSteps
  };
}

function computeOfflineRouteWithOptionalVia(fromLat, fromLng, toLat, toLng, viaLat, viaLng, profile, fromLabel, toLabel, viaLabel) {
  const hasVia = !isNaN(viaLat) && !isNaN(viaLng);
  let routeObj;
  if (!hasVia) {
    routeObj = computeOfflineGraphRoute(fromLat, fromLng, toLat, toLng, profile, fromLabel, toLabel)
      || generateCorridorRoute(fromLat, fromLng, toLat, toLng, profile, fromLabel, toLabel);
  } else {
    const leg1 = computeOfflineGraphRoute(fromLat, fromLng, viaLat, viaLng, profile, fromLabel, viaLabel || 'Parada Via')
      || generateCorridorRoute(fromLat, fromLng, viaLat, viaLng, profile, fromLabel, viaLabel || 'Parada Via');
    const leg2 = computeOfflineGraphRoute(viaLat, viaLng, toLat, toLng, profile, viaLabel || 'Parada Via', toLabel)
      || generateCorridorRoute(viaLat, viaLng, toLat, toLng, profile, viaLabel || 'Parada Via', toLabel);
    routeObj = mergeOfflineLegs(leg1, leg2, viaLabel);
  }
  routeObj.corridorSupport = findRouteCorridorSupport(routeObj.geometry?.coordinates || [], 5.0, 18);
  return routeObj;
}

  // 4.1 API: Route calculation (Online OSRM + Disk Cache + Offline Graph A* + Offline Tactical Corridor)
  if (pathname === '/api/route') {
    const fromLat = parseFloat(urlObj.searchParams.get('fromLat'));
    const fromLng = parseFloat(urlObj.searchParams.get('fromLng'));
    const toLat = parseFloat(urlObj.searchParams.get('toLat'));
    const toLng = parseFloat(urlObj.searchParams.get('toLng'));
    const viaLat = parseFloat(urlObj.searchParams.get('viaLat'));
    const viaLng = parseFloat(urlObj.searchParams.get('viaLng'));
    const profile = urlObj.searchParams.get('profile') || 'driving';
    const fromLabel = (urlObj.searchParams.get('fromLabel') || '').trim();
    const toLabel = (urlObj.searchParams.get('toLabel') || '').trim();
    const viaLabel = (urlObj.searchParams.get('viaLabel') || '').trim();
    const forceOfflineGraph = urlObj.searchParams.get('forceOfflineGraph') === '1';

    if (isNaN(fromLat) || isNaN(fromLng) || isNaN(toLat) || isNaN(toLng)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Coordenadas de origem ou destino inválidas' }));
      return;
    }

    const hasVia = !isNaN(viaLat) && !isNaN(viaLng);

    if (forceOfflineGraph) {
      const graphRoute = computeOfflineRouteWithOptionalVia(fromLat, fromLng, toLat, toLng, viaLat, viaLng, profile, fromLabel, toLabel, viaLabel);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(graphRoute));
      return;
    }

    const routesCacheDir = path.join(__dirname, 'data', 'routes_cache');
    if (!fs.existsSync(routesCacheDir)) {
      try { fs.mkdirSync(routesCacheDir, { recursive: true }); } catch (e) {}
    }

    const cacheKey = hasVia
      ? `${profile}_${fromLat.toFixed(4)}_${fromLng.toFixed(4)}_via_${viaLat.toFixed(4)}_${viaLng.toFixed(4)}_${toLat.toFixed(4)}_${toLng.toFixed(4)}.json`
      : `${profile}_${fromLat.toFixed(4)}_${fromLng.toFixed(4)}_${toLat.toFixed(4)}_${toLng.toFixed(4)}.json`;
    const cachePath = path.join(routesCacheDir, cacheKey);

    // 1. Check disk cache first (offline instant)
    if (fs.existsSync(cachePath)) {
      try {
        const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
        cached.cached = true;
        if (!Array.isArray(cached.corridorSupport) && cached.geometry?.coordinates) {
          cached.corridorSupport = findRouteCorridorSupport(cached.geometry.coordinates, 5.0, 18);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(cached));
        return;
      } catch (e) {
        // ignore cache read error
      }
    }

    // 2. Try OSRM (online)
    const osrmMode = profile === 'walking' ? 'foot' : 'driving';
    const waypointCoords = hasVia
      ? `${fromLng},${fromLat};${viaLng},${viaLat};${toLng},${toLat}`
      : `${fromLng},${fromLat};${toLng},${toLat}`;
    const osrmUrl = `https://router.project-osrm.org/route/v1/${osrmMode}/${waypointCoords}?overview=full&geometries=geojson&steps=true`;

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

          const legs = Array.isArray(r.legs) ? r.legs : [];
          const steps = [];
          legs.forEach((leg, legIdx) => {
            if (legIdx > 0) {
              steps.push({
                instruction: `📍 Parada intermediária em ${viaLabel || 'Ponto Via'}`,
                distanceKm: 0,
                type: 'waypoint'
              });
            }
            for (const s of (leg.steps || [])) {
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

              steps.push({
                instruction: `${prefix}${roadName}${extraNote}`,
                distanceKm: stepDistKm,
                type: maneuver || 'step'
              });
            }
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
            corridorSupport: findRouteCorridorSupport(r.geometry?.coordinates || [], 5.0, 18),
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
        // Fallback: first try local turn-by-turn A* graph over vector tiles, then tactical corridor
        const fallbackResult = computeOfflineRouteWithOptionalVia(fromLat, fromLng, toLat, toLng, viaLat, viaLng, profile, fromLabel, toLabel, viaLabel);
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
    const viaLat = parseFloat(urlObj.searchParams.get('viaLat'));
    const viaLng = parseFloat(urlObj.searchParams.get('viaLng'));
    const profile = urlObj.searchParams.get('profile') || 'driving';
    const hasVia = !isNaN(viaLat) && !isNaN(viaLng);

    const routesCacheDir = path.join(__dirname, 'data', 'routes_cache');
    const cacheKey = hasVia
      ? `${profile}_${fromLat.toFixed(4)}_${fromLng.toFixed(4)}_via_${viaLat.toFixed(4)}_${viaLng.toFixed(4)}_${toLat.toFixed(4)}_${toLng.toFixed(4)}.json`
      : `${profile}_${fromLat.toFixed(4)}_${fromLng.toFixed(4)}_${toLat.toFixed(4)}_${toLng.toFixed(4)}.json`;
    const cachePath = path.join(routesCacheDir, cacheKey);

    let routeData = null;
    if (fs.existsSync(cachePath)) {
      try { routeData = JSON.parse(fs.readFileSync(cachePath, 'utf8')); } catch(e){}
    }
    if (!routeData) {
      routeData = computeOfflineRouteWithOptionalVia(fromLat, fromLng, toLat, toLng, viaLat, viaLng, profile, '', '', '');
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
${hasVia ? `  <wpt lat="${viaLat}" lon="${viaLng}"><name>Parada Intermediaria</name></wpt>\n` : ''}  <wpt lat="${toLat}" lon="${toLng}"><name>Destino</name></wpt>
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
