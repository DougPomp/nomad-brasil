import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STORAGE_PATH = process.env.STORAGE_PATH || path.join(__dirname, '..', 'storage');
const PMTILES_PATH = path.join(STORAGE_PATH, 'maps', 'brazil-streets.pmtiles');
const DB_PATH = path.join(STORAGE_PATH, 'maps', 'brazil-streets.sqlite');
const CITIES_PATH = path.join(__dirname, 'data', 'cities.json');
const PMTILES_LIB_PATH = path.join(__dirname, 'public', 'vendor', 'pmtiles.js');

function latLngToTile(lat, lon, z) {
  const n = 1 << z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const rad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n);
  return [x, y];
}

function tileCoordToLatLng(z, tx, ty, gx, gy, extent) {
  const n = 1 << z;
  const lng = ((tx + gx / extent) / n) * 360 - 180;
  const lat = Math.atan(Math.sinh(Math.PI * (1 - (2 * (ty + gy / extent)) / n))) * (180 / Math.PI);
  return [lat, lng];
}

function deserializeDirectory(buf, readVarint) {
  const p = { buf: new Uint8Array(buf), pos: 0 };
  const numEntries = readVarint(p);
  const entries = new Array(numEntries);
  let lastId = 0;
  for (let i = 0; i < numEntries; i++) {
    const v = readVarint(p);
    lastId += v;
    entries[i] = { tileId: lastId, offset: 0, length: 0, runLength: 1 };
  }
  for (let i = 0; i < numEntries; i++) {
    entries[i].runLength = readVarint(p);
  }
  for (let i = 0; i < numEntries; i++) {
    entries[i].length = readVarint(p);
  }
  for (let i = 0; i < numEntries; i++) {
    const v = readVarint(p);
    entries[i].offset = v === 0 && i > 0 ? entries[i - 1].offset + entries[i - 1].length : v - 1;
  }
  return entries;
}

function readVarintProto(u, o) {
  let r = 0;
  let s = 0;
  let b;
  do {
    b = u[o.p++];
    r |= (b & 127) << s;
    s += 7;
  } while (b >= 128);
  return r >>> 0;
}

function skipProto(u, o, wire) {
  if (wire === 0) readVarintProto(u, o);
  else if (wire === 1) o.p += 8;
  else if (wire === 2) o.p += readVarintProto(u, o);
  else if (wire === 5) o.p += 4;
}

const TARGET_LAYERS = new Set(['roads', 'places', 'pois']);
const textDecoder = new TextDecoder('utf-8');

function extractMvtFeatures(tileBuffer, z, tx, ty) {
  const u = new Uint8Array(tileBuffer.buffer, tileBuffer.byteOffset, tileBuffer.byteLength);
  const o = { p: 0 };
  const extracted = [];

  while (o.p < u.length) {
    const tag = readVarintProto(u, o);
    const field = tag >> 3;
    const wire = tag & 7;

    if (field === 3 && wire === 2) {
      const len = readVarintProto(u, o);
      const end = o.p + len;
      let layerName = '';
      const keys = [];
      const vals = [];
      const feats = [];
      let extent = 4096;

      while (o.p < end) {
        const lt = readVarintProto(u, o);
        const lf = lt >> 3;
        const lw = lt & 7;
        if (lf === 1 && lw === 2) {
          const sl = readVarintProto(u, o);
          layerName = textDecoder.decode(u.subarray(o.p, o.p + sl));
          o.p += sl;
        } else if (lf === 2 && lw === 2) {
          const fl = readVarintProto(u, o);
          feats.push([o.p, o.p + fl]);
          o.p += fl;
        } else if (lf === 3 && lw === 2) {
          const kl = readVarintProto(u, o);
          keys.push(textDecoder.decode(u.subarray(o.p, o.p + kl)));
          o.p += kl;
        } else if (lf === 4 && lw === 2) {
          const vl = readVarintProto(u, o);
          const ve = o.p + vl;
          let v = null;
          while (o.p < ve) {
            const vt = readVarintProto(u, o);
            const vf = vt >> 3;
            const vw = vt & 7;
            if (vf === 1 && vw === 2) {
              const sl = readVarintProto(u, o);
              v = textDecoder.decode(u.subarray(o.p, o.p + sl));
              o.p += sl;
            } else {
              skipProto(u, o, vw);
            }
          }
          vals.push(v);
        } else if (lf === 5 && lw === 0) {
          extent = readVarintProto(u, o) || 4096;
        } else {
          skipProto(u, o, lw);
        }
      }

      if (!TARGET_LAYERS.has(layerName)) continue;

      for (let fIdx = 0; fIdx < feats.length; fIdx++) {
        const [fsPos, fePos] = feats[fIdx];
        const fo = { p: fsPos };
        const tags = [];
        let gx = extent / 2;
        let gy = extent / 2;
        let hasGeom = false;

        while (fo.p < fePos) {
          const ft = readVarintProto(u, fo);
          const ff = ft >> 3;
          const fw = ft & 7;
          if (ff === 2 && fw === 2) {
            const tl = readVarintProto(u, fo);
            const te = fo.p + tl;
            while (fo.p < te) tags.push(readVarintProto(u, fo));
          } else if (ff === 4 && fw === 2) {
            const gl = readVarintProto(u, fo);
            const ge = fo.p + gl;
            if (fo.p < ge) {
              const cmd = readVarintProto(u, fo);
              if ((cmd & 0x7) === 1 && fo.p < ge) {
                const dx = readVarintProto(u, fo);
                const dy = readVarintProto(u, fo);
                gx = (dx >>> 1) ^ -(dx & 1);
                gy = (dy >>> 1) ^ -(dy & 1);
                hasGeom = true;
              }
            }
            fo.p = ge;
          } else {
            skipProto(u, fo, fw);
          }
        }

        if (!hasGeom || tags.length < 2) continue;

        let namePt = '';
        let nameBase = '';
        let ref = '';
        let kindDetail = '';
        let kind = '';

        for (let i = 0; i + 1 < tags.length; i += 2) {
          const k = keys[tags[i]];
          const v = vals[tags[i + 1]];
          if (!v) continue;
          if (k === 'name:pt') namePt = v;
          else if (k === 'name') nameBase = v;
          else if (k === 'ref') ref = v;
          else if (k === 'kind_detail') kindDetail = v;
          else if (k === 'kind') kind = v;
        }

        const rawName = (namePt || nameBase || '').trim();
        const rawRef = ref.trim();
        const namesToEmit = [];
        if (rawName.length >= 2 && /[a-zA-ZÀ-ÿ]/.test(rawName)) {
          namesToEmit.push(rawName);
        }
        if (rawRef.length >= 2 && /[a-zA-ZÀ-ÿ]/.test(rawRef) && rawRef.toLowerCase() !== rawName.toLowerCase()) {
          namesToEmit.push(rawRef);
        }
        if (namesToEmit.length === 0) continue;

        const [lat, lng] = tileCoordToLatLng(z, tx, ty, gx, gy, extent);
        const rLat = Math.round(lat * 100000) / 100000;
        const rLng = Math.round(lng * 100000) / 100000;
        for (const nm of namesToEmit) {
          extracted.push({
            name: nm,
            kind: kindDetail || kind || layerName,
            layer: layerName,
            lat: rLat,
            lng: rLng
          });
        }
      }
    } else {
      skipProto(u, o, wire);
    }
  }

  return extracted;
}

function main() {
  const startTime = Date.now();
  if (!fs.existsSync(PMTILES_PATH)) {
    throw new Error(`PMTiles não encontrado: ${PMTILES_PATH}`);
  }
  if (!fs.existsSync(CITIES_PATH)) {
    throw new Error(`Cidades não encontradas: ${CITIES_PATH}`);
  }

  console.log('[Indexador] Carregando pmtiles.js e cidades do IBGE...');
  vm.runInThisContext(fs.readFileSync(PMTILES_LIB_PATH, 'utf8') + '\n;globalThis.__pmtilesLib = pmtiles;');
  const pm = globalThis.__pmtilesLib;

  const cities = JSON.parse(fs.readFileSync(CITIES_PATH, 'utf8'));
  const z = 13;
  const z13Start = pm.zxyToTileId(13, 0, 0);
  const z14Start = pm.zxyToTileId(14, 0, 0);

  // Build 1x1 degree spatial grid covering all 5,571 Brazilian municipalities
  const cityGrid = new Map();
  for (const c of cities) {
    const gx = Math.floor(c.lng);
    const gy = Math.floor(c.lat);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const key = `${gx + dx},${gy + dy}`;
        let bucket = cityGrid.get(key);
        if (!bucket) {
          bucket = [];
          cityGrid.set(key, bucket);
        }
        bucket.push(c);
      }
    }
  }

  function findNearestCity(lat, lng) {
    const bucket = cityGrid.get(`${Math.floor(lng)},${Math.floor(lat)}`);
    if (!bucket) return null;
    let best = null;
    let bestDistSq = 0.08; // ~30 km radius around nearest city
    for (let i = 0; i < bucket.length; i++) {
      const c = bucket[i];
      const d = (c.lat - lat) ** 2 + (c.lng - lng) ** 2;
      if (d < bestDistSq) {
        bestDistSq = d;
        best = c;
      }
    }
    return best;
  }

  // Read PMTiles directories
  const fd = fs.openSync(PMTILES_PATH, 'r');
  const hdrBuf = Buffer.alloc(16384);
  fs.readSync(fd, hdrBuf, 0, 16384, 0);
  const header = pm.bytesToHeader(hdrBuf.buffer.slice(hdrBuf.byteOffset, hdrBuf.byteOffset + 127));
  const rootDir = deserializeDirectory(
    zlib.gunzipSync(hdrBuf.subarray(header.rootDirectoryOffset, header.rootDirectoryOffset + header.rootDirectoryLength)),
    pm.readVarint
  );

  const leafBuf = Buffer.alloc(header.leafDirectoryLength);
  fs.readSync(fd, leafBuf, 0, header.leafDirectoryLength, header.leafDirectoryOffset);

  const tilesToRead = [];
  const considerEntry = (entry) => {
    if (entry.tileId < z13Start || entry.tileId >= z14Start) return;
    if (entry.runLength !== 1 || entry.length <= 250) return;
    const [, tx, ty] = pm.tileIdToZxy(entry.tileId);
    const [tLat, tLng] = tileCoordToLatLng(z, tx, ty, 2048, 2048, 4096);
    const city = findNearestCity(tLat, tLng);
    if (city) {
      tilesToRead.push({
        tileId: entry.tileId,
        offset: header.tileDataOffset + entry.offset,
        length: entry.length,
        tx,
        ty,
        city
      });
    }
  };

  for (const re of rootDir) {
    if (re.runLength === 0) {
      const ld = deserializeDirectory(
        zlib.gunzipSync(leafBuf.subarray(re.offset, re.offset + re.length)),
        pm.readVarint
      );
      for (const le of ld) {
        considerEntry(le);
      }
    } else {
      considerEntry(re);
    }
  }

  tilesToRead.sort((a, b) => a.offset - b.offset);
  console.log(`[Indexador] Tiles z=${z} nacionais filtrados para leitura sequencial: ${tilesToRead.length}`);

  // Prepare SQLite database
  const tmpDbPath = DB_PATH + '.tmp';
  if (fs.existsSync(tmpDbPath)) fs.unlinkSync(tmpDbPath);

  const db = new DatabaseSync(tmpDbPath);
  db.exec(`
    PRAGMA journal_mode = OFF;
    PRAGMA synchronous = OFF;
    PRAGMA temp_store = MEMORY;
    PRAGMA cache_size = -64000;
    CREATE VIRTUAL TABLE streets_fts USING fts5(
      name,
      city,
      state,
      kind,
      lat UNINDEXED,
      lng UNINDEXED,
      tokenize='unicode61 remove_diacritics 2'
    );
  `);

  const insertStmt = db.prepare(
    'INSERT INTO streets_fts (name, city, state, kind, lat, lng) VALUES (?, ?, ?, ?, ?, ?)'
  );

  const seen = new Set();
  let totalInserted = 0;
  let inTx = false;

  db.exec('BEGIN TRANSACTION');
  inTx = true;

  for (let i = 0; i < tilesToRead.length; i++) {
    const t = tilesToRead[i];
    const compBuf = Buffer.allocUnsafe(t.length);
    fs.readSync(fd, compBuf, 0, t.length, t.offset);

    let rawMvt;
    try {
      rawMvt = zlib.gunzipSync(compBuf);
    } catch {
      continue;
    }

    const feats = extractMvtFeatures(rawMvt, z, t.tx, t.ty);
    for (let j = 0; j < feats.length; j++) {
      const f = feats[j];
      const dedupKey = `${t.city.id}|${f.name.toLowerCase()}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);

      let kindPt = f.kind;
      if (f.layer === 'roads') kindPt = 'Via';
      else if (f.kind === 'neighbourhood' || f.kind === 'suburb') kindPt = 'Bairro';
      else if (f.layer === 'pois') kindPt = 'POI';

      insertStmt.run(f.name, t.city.name, t.city.state, kindPt, f.lat, f.lng);
      totalInserted++;

      if (totalInserted % 50000 === 0) {
        db.exec('COMMIT');
        db.exec('BEGIN TRANSACTION');
      }
    }

    if ((i + 1) % 15000 === 0 || i === tilesToRead.length - 1) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[Indexador] ${i + 1}/${tilesToRead.length} tiles | ${totalInserted} logradouros/POIs únicos (${elapsed}s)`);
    }
  }

  if (inTx) {
    db.exec('COMMIT');
  }
  fs.closeSync(fd);

  console.log('[Indexador] Otimizando índice FTS5...');
  db.exec("INSERT INTO streets_fts(streets_fts) VALUES('optimize');");
  db.exec('PRAGMA journal_mode = WAL;');
  db.close();

  if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
  fs.renameSync(tmpDbPath, DB_PATH);

  const dbSizeMb = (fs.statSync(DB_PATH).size / (1024 * 1024)).toFixed(1);
  const totalSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[Indexador] Concluído em ${totalSec}s! Banco gerado: ${DB_PATH} (${dbSizeMb} MB, ${totalInserted} registros)`);
}

main();
