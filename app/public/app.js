let mapInstance = null;
let currentTab = 'dashboard';
let citiesList = [];
let emergenciesList = [];
let survivalList = [];
let mapMarker = null;

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  initClock();
  initTabs();
  loadData();
  setupMapSearch();
  setupRouteSearch();
  loadPoisData();
  loadUserWaypoints();
  calculateRationing();
  loadRadioData();
  calculateAntennaDipole();
  loadVenomousData();
  calculateSolar();
  renderBobKit();
  loadPlantsData();
  renderKnotsList();
  loadPefData();
  calculateMarch();
});

// Mobile Sidebar Drawer Toggle
window.toggleMobileSidebar = function(force) {
  const sidebar = document.getElementById('app-sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (!sidebar) return;
  const isOpen = sidebar.classList.contains('open');
  const nextState = typeof force === 'boolean' ? force : !isOpen;
  sidebar.classList.toggle('open', nextState);
  if (backdrop) backdrop.classList.toggle('open', nextState);
};

// Clock
function initClock() {
  const clockEl = document.getElementById('system-clock-time');
  const sideClockEl = document.getElementById('sidebar-clock-time');
  function update() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('pt-BR', { hour12: false });
    if (clockEl) clockEl.textContent = timeStr;
    if (sideClockEl) sideClockEl.textContent = timeStr;
  }
  update();
  setInterval(update, 1000);
}

// Tab navigation
function initTabs() {
  const tabButtons = document.querySelectorAll('[data-tab-target]');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-tab-target');
      switchTab(target);
    });
  });
}

function switchTab(tabId) {
  currentTab = tabId;

  // Close mobile sidebar if open
  if (typeof window.toggleMobileSidebar === 'function') {
    window.toggleMobileSidebar(false);
  }

  // Update nav buttons
  document.querySelectorAll('[data-tab-target]').forEach(btn => {
    if (btn.getAttribute('data-tab-target') === tabId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Update views
  document.querySelectorAll('.tab-view').forEach(view => {
    if (view.id === `tab-${tabId}`) {
      view.classList.add('active');
    } else {
      view.classList.remove('active');
    }
  });

  // Trigger map resize if switching to map
  if (tabId === 'map') {
    setTimeout(() => {
      if (!mapInstance) {
        initMap();
      } else {
        mapInstance.resize();
      }
    }, 100);
  }

  // Load Kiwix iframe & dynamic bookshelf if switching to wiki
  if (tabId === 'wiki') {
    if (typeof window.initDynamicKiwixLinks === 'function') window.initDynamicKiwixLinks();
    if (typeof window.loadKiwixBookshelf === 'function') window.loadKiwixBookshelf();
    const iframe = document.getElementById('kiwix-iframe');
    const primaryBook = window.nomadPrimaryZimBook || 'wikipedia_pt_all_maxi_2026-05';
    if (iframe && !iframe.getAttribute('src')) {
      const base = typeof window.getKiwixBaseUrl === 'function' ? window.getKiwixBaseUrl() : `http://${window.location.hostname || 'localhost'}:8090`;
      iframe.setAttribute('src', `${base}/content/${encodeURIComponent(primaryBook)}`);
    }
  }

  if (tabId === 'venomous') {
    loadVenomousData();
  }
  if (tabId === 'plants') {
    loadPlantsData();
  }
  if (tabId === 'knots') {
    renderKnotsList();
  }
  if (tabId === 'pef') {
    loadPefData();
  }
  if (tabId === 'march') {
    calculateMarch();
  }
  if (tabId === 'solar') {
    calculateSolar();
  }
  if (tabId === 'bob') {
    renderBobKit();
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Load data from API
function renderStatusSummaryFromData(statusData) {
  const statsEl = document.getElementById('status-summary');
  if (!statsEl || !statusData || !statusData.datasets) return;
  const ds = statusData.datasets;
  const parts = [
    `<span class="text-emerald-400 font-bold">${ds.citiesCount || 0}</span> cidades`
  ];
  if (typeof ds.streetsCount === 'number' && ds.streetsCount > 0) {
    parts.push(`<span class="text-cyan-400 font-bold">${ds.streetsCount.toLocaleString('pt-BR')}</span> ruas offline`);
  }
  if (typeof ds.detailTilesCachedCount === 'number' && ds.detailTilesCachedCount > 0) {
    parts.push(`<span class="text-emerald-400 font-bold">${ds.detailTilesCachedCount}</span> blocos z=14`);
  }
  if (typeof ds.routesCachedCount === 'number' && ds.routesCachedCount > 0) {
    parts.push(`<span class="text-sky-400 font-bold">${ds.routesCachedCount}</span> rotas em cache`);
  }
  if (typeof ds.zimFilesCount === 'number' && ds.zimFilesCount > 0) {
    parts.push(`<span class="text-amber-400 font-bold">${ds.zimFilesCount}</span> ZIMs`);
  }
  parts.push(`<span class="text-emerald-400 font-bold">${ds.emergenciesCount || 0}</span> protocolos médicos`);
  parts.push(`<span class="text-emerald-400 font-bold">${ds.survivalCount || 0}</span> manuais de campo`);
  statsEl.innerHTML = parts.join(' &bull; ');
}

async function loadData() {
  try {
    // 1. Status & Live Diagnostics
    const statusRes = await fetch('/api/status');
    const statusData = await statusRes.json();
    window.nomadStatusData = statusData;
    window.nomadPrimaryZimBook = (statusData.datasets && statusData.datasets.primaryZimBook) || 'wikipedia_pt_all_maxi_2026-05';
    window.nomadLanIps = Array.isArray(statusData.lanIps) ? statusData.lanIps : [];
    renderStatusSummaryFromData(statusData);
    if (typeof window.initDynamicKiwixLinks === 'function') window.initDynamicKiwixLinks();

    // 2. Cities (todos os 5.571 municípios do IBGE)
    const citiesRes = await fetch('/api/cities?limit=6000');
    citiesList = await citiesRes.json();

    // 3. Emergencies
    const emRes = await fetch('/api/emergencies');
    emergenciesList = await emRes.json();
    renderEmergencies();

    // 4. Survival
    const surRes = await fetch('/api/survival');
    survivalList = await surRes.json();
    renderSurvival();

  } catch (err) {
    console.error('Erro ao carregar dados:', err);
  }
}

// Render Emergencies Accordion
function renderEmergencies() {
  const container = document.getElementById('emergencies-container');
  if (!container) return;

  container.innerHTML = emergenciesList.map(em => `
    <div class="accordion-item" id="em-${em.id}">
      <div class="accordion-header" onclick="toggleAccordion('em-${em.id}')">
        <div class="accordion-title-wrap">
          <span class="card-tag ${em.severity === 'crítico' ? 'tag-alert' : 'tag-active'}">${em.severity}</span>
          <span class="accordion-title">${em.title}</span>
        </div>
        <span class="text-sm font-bold text-emerald-400">&blacktriangledown;</span>
      </div>
      <div class="accordion-body">
        <p class="mb-3 text-gray-300 font-medium">${em.summary}</p>
        <div class="bg-gray-900/60 p-3 rounded border border-gray-800 mb-4 flex items-center justify-between">
          <span class="text-xs uppercase font-bold text-gray-400">Canal de Emergência:</span>
          <span class="text-sm font-mono font-bold text-red-400">${em.phone}</span>
        </div>
        <h4 class="text-sm font-bold text-gray-200 mb-2 uppercase tracking-wide">Passo a Passo de Ação:</h4>
        <ul class="step-list">
          ${em.steps.map(step => `<li>${step}</li>`).join('')}
        </ul>
        ${em.notes ? `<div class="info-box"><strong>Observação Importante:</strong> ${em.notes}</div>` : ''}
      </div>
    </div>
  `).join('');
}

// Render Survival Manuals
function renderSurvival() {
  const container = document.getElementById('survival-container');
  if (!container) return;

  container.innerHTML = survivalList.map(man => `
    <div class="accordion-item" id="sur-${man.id}">
      <div class="accordion-header" onclick="toggleAccordion('sur-${man.id}')">
        <div class="accordion-title-wrap">
          <span class="card-tag tag-active">${man.category}</span>
          <span class="accordion-title">${man.title}</span>
        </div>
        <span class="text-sm font-bold text-emerald-400">&blacktriangledown;</span>
      </div>
      <div class="accordion-body">
        ${man.sections.map(sec => `
          <div class="mb-4">
            <h4 class="text-base font-bold text-emerald-400 mb-1.5">${sec.heading}</h4>
            <p class="text-gray-300 text-sm leading-relaxed whitespace-pre-line">${sec.content}</p>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

window.toggleAccordion = function(id) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.toggle('open');
  }
};

// MapLibre GL Integration
function initMap() {
  const container = document.getElementById('map-container');
  if (!container || mapInstance) return;

  // Add PMTiles protocol
  if (window.pmtiles) {
    const protocol = new pmtiles.Protocol();
    maplibregl.addProtocol('pmtiles', protocol.tile);
  }

  // Base map style (tactical dark theme)
  const mapStyle = {
    version: 8,
    sources: {
      'world-tiles': {
        type: 'vector',
        url: 'pmtiles://http://' + window.location.host + '/api/maps/pmtiles',
        maxzoom: 13,
        attribution: 'Project NOMAD Brasil &bull; OpenStreetMap'
      },
      'detail-tiles': {
        type: 'vector',
        tiles: [window.location.origin + '/api/maps/detail-tiles/{z}/{x}/{y}.pbf'],
        minzoom: 13,
        maxzoom: 14
      }
    },
    glyphs: '/api/maps/fonts/{fontstack}/{range}.pbf',
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: {
          'background-color': '#090d10'
        }
      },
      {
        id: 'water',
        type: 'fill',
        source: 'world-tiles',
        'source-layer': 'water',
        paint: {
          'fill-color': '#111c26'
        }
      },
      {
        id: 'landuse',
        type: 'fill',
        source: 'world-tiles',
        'source-layer': 'landuse',
        paint: {
          'fill-color': '#0f171f',
          'fill-opacity': 0.8
        }
      },
      {
        id: 'parks',
        type: 'fill',
        source: 'world-tiles',
        'source-layer': 'landuse',
        filter: ['any', ['==', 'kind', 'park'], ['==', 'kind', 'forest'], ['==', 'kind', 'nature_reserve']],
        paint: {
          'fill-color': '#112218',
          'fill-opacity': 0.85
        }
      },
      {
        id: 'buildings',
        type: 'fill',
        source: 'world-tiles',
        'source-layer': 'buildings',
        minzoom: 13,
        paint: {
          'fill-color': '#18202a',
          'fill-outline-color': '#283446',
          'fill-opacity': 0.85
        }
      },
      {
        id: 'roads_minor',
        type: 'line',
        source: 'world-tiles',
        'source-layer': 'roads',
        minzoom: 11,
        paint: {
          'line-color': '#202934',
          'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.8, 14, 2, 16, 4.5]
        }
      },
      {
        id: 'roads_medium',
        type: 'line',
        source: 'world-tiles',
        'source-layer': 'roads',
        paint: {
          'line-color': '#334155',
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1, 14, 3, 16, 6]
        }
      },
      {
        id: 'roads_major',
        type: 'line',
        source: 'world-tiles',
        'source-layer': 'roads',
        paint: {
          'line-color': '#475569',
          'line-width': ['interpolate', ['linear'], ['zoom'], 5, 1.2, 12, 3.5, 16, 8]
        }
      },
      {
        id: 'boundaries',
        type: 'line',
        source: 'world-tiles',
        'source-layer': 'boundaries',
        paint: {
          'line-color': '#10b981',
          'line-width': 1.6,
          'line-dasharray': [2, 2]
        }
      },
      {
        id: 'roads_labels',
        type: 'symbol',
        source: 'world-tiles',
        'source-layer': 'roads',
        minzoom: 12,
        layout: {
          'symbol-placement': 'line',
          'text-field': ['coalesce', ['get', 'name:pt'], ['get', 'name:latin'], ['get', 'name'], ''],
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 12, 9, 14, 11, 16, 13],
          'text-letter-spacing': 0.05
        },
        paint: {
          'text-color': '#cbd5e1',
          'text-halo-color': '#090d10',
          'text-halo-width': 1.5
        }
      },
      {
        id: 'places_labels',
        type: 'symbol',
        source: 'world-tiles',
        'source-layer': 'places',
        layout: {
          'text-field': ['coalesce', ['get', 'name:pt'], ['get', 'name:latin'], ['get', 'name'], ''],
          'text-font': ['Noto Sans Medium'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 4, 11, 8, 14, 12, 17],
          'text-max-width': 8
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': '#090d10',
          'text-halo-width': 2
        }
      },
      {
        id: 'detail_buildings',
        type: 'fill',
        source: 'detail-tiles',
        'source-layer': 'building',
        minzoom: 13.5,
        paint: {
          'fill-color': '#182230',
          'fill-opacity': ['interpolate', ['linear'], ['zoom'], 13.5, 0.15, 15, 0.45],
          'fill-outline-color': '#263547'
        }
      },
      {
        id: 'detail_roads_casing',
        type: 'line',
        source: 'detail-tiles',
        'source-layer': 'transportation',
        minzoom: 13,
        filter: ['in', ['get', 'class'], ['literal', ['minor', 'service', 'track', 'path']]],
        layout: {
          'line-cap': 'round',
          'line-join': 'round'
        },
        paint: {
          'line-color': '#0b1017',
          'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 13, 2, 16, 7],
          'line-opacity': 0.8
        }
      },
      {
        id: 'detail_roads_minor',
        type: 'line',
        source: 'detail-tiles',
        'source-layer': 'transportation',
        minzoom: 13,
        filter: ['in', ['get', 'class'], ['literal', ['minor', 'service', 'track', 'path']]],
        layout: {
          'line-cap': 'round',
          'line-join': 'round'
        },
        paint: {
          'line-color': ['match', ['get', 'class'], 'service', '#1e293b', 'track', '#292524', 'path', '#334155', '#2a384b'],
          'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 13, 1.1, 16, 5],
          'line-opacity': 0.9
        }
      },
      {
        id: 'pois_labels',
        type: 'symbol',
        source: 'world-tiles',
        'source-layer': 'pois',
        minzoom: 13,
        layout: {
          'text-field': ['coalesce', ['get', 'name:pt'], ['get', 'name:latin'], ['get', 'name'], ''],
          'text-font': ['Noto Sans Regular'],
          'text-size': 11,
          'text-max-width': 9
        },
        paint: {
          'text-color': '#6ee7b7',
          'text-halo-color': '#090d10',
          'text-halo-width': 1.5
        }
      },
      {
        id: 'detail_roads_labels',
        type: 'symbol',
        source: 'detail-tiles',
        'source-layer': 'transportation_name',
        minzoom: 13,
        filter: ['in', ['get', 'class'], ['literal', ['minor', 'service', 'track', 'path', 'tertiary']]],
        layout: {
          'symbol-placement': 'line',
          'text-field': ['coalesce', ['get', 'name:pt'], ['get', 'name:latin'], ['get', 'name'], ''],
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 13, 10, 16, 12.5],
          'text-max-angle': 30,
          'text-padding': 6
        },
        paint: {
          'text-color': '#cbd5e1',
          'text-halo-color': '#090d10',
          'text-halo-width': 1.5
        }
      }
    ]
  };

  try {
    mapInstance = new maplibregl.Map({
      container: 'map-container',
      style: mapStyle,
      center: [-47.9292, -15.7801], // Brasil / DF
      zoom: 4.2,
      maxZoom: 18,
      minZoom: 2
    });

    mapInstance.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    mapInstance.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right');

    mapInstance.on('load', () => {
      ensureStreetHighlightLayer();
    });

    // Render POIs & User Waypoints once map is ready
    if (typeof renderPoiMarkers === 'function') renderPoiMarkers();
    if (typeof renderUserWptMarkers === 'function') renderUserWptMarkers();

    mapInstance.on('mousemove', (e) => {
      const coordsEl = document.getElementById('hud-coordinates');
      if (coordsEl) {
        coordsEl.textContent = `LAT: ${e.lngLat.lat.toFixed(4)}° | LNG: ${e.lngLat.lng.toFixed(4)}° | ZOOM: ${mapInstance.getZoom().toFixed(1)}`;
      }
    });

    // Interactive Map Click & Right-Click Offline Reverse Geocoding
    mapInstance.on('click', (e) => {
      const { lng, lat } = e.lngLat;

      // If Tactical Measure tool is active
      if (typeof tacticalMeasureActive !== 'undefined' && tacticalMeasureActive) {
        addTacticalMeasurePoint(lat, lng);
        return;
      }

      // If user is picking route origin, destination or waypoint on map
      if (mapPickMode) {
        handleMapPickedPoint(lat, lng, mapPickMode);
        return;
      }

      // At street zoom (>= 12.5), inspect street/coordinates instead of jumping back to city center
      if (mapInstance.getZoom() >= 12.5) {
        openReverseGeocodePopup(lat, lng);
        return;
      }

      // Otherwise detect nearest municipality within 25 km
      let nearest = null;
      let minDist = Infinity;
      for (let i = 0; i < citiesList.length; i++) {
        const c = citiesList[i];
        const dist = getDistanceFromLatLonInKm(lat, lng, c.lat, c.lng);
        if (dist < minDist) {
          minDist = dist;
          nearest = c;
        }
      }

      if (nearest && minDist <= 25) {
        flyToCity(nearest.id);
      } else {
        openReverseGeocodePopup(lat, lng);
      }
    });

    mapInstance.on('contextmenu', (e) => {
      e.preventDefault();
      if (mapPickMode) return;
      openReverseGeocodePopup(e.lngLat.lat, e.lngLat.lng);
    });

  } catch (err) {
    console.error('Erro ao inicializar mapa:', err);
  }
}

function escapeHtmlSafe(str) {
  return String(str || '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}

function normalizeSearchStr(str) {
  return String(str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function ensureStreetHighlightLayer() {
  if (!mapInstance) return;
  try {
    if (!mapInstance.getSource('street-highlight-source')) {
      mapInstance.addSource('street-highlight-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
    }
    if (!mapInstance.getLayer('street-highlight-layer')) {
      const beforeId = mapInstance.getLayer('roads_labels') ? 'roads_labels' : undefined;
      mapInstance.addLayer({
        id: 'street-highlight-layer',
        type: 'line',
        source: 'street-highlight-source',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#10b981',
          'line-width': 6,
          'line-opacity': 0.85,
          'line-blur': 1
        }
      }, beforeId);
    }
  } catch (e) {
    // map style may not be loaded yet
  }
}

function highlightRenderedStreet(streetName) {
  if (!mapInstance || !streetName) return;
  ensureStreetHighlightLayer();
  const src = mapInstance.getSource('street-highlight-source');
  if (!src) return;

  try {
    const targetNorm = normalizeSearchStr(streetName).trim();
    const layers = ['roads_minor', 'roads_medium', 'roads_major', 'detail_roads_minor', 'detail_roads_labels'].filter(id => mapInstance.getLayer(id));
    if (layers.length === 0) return;

    const features = mapInstance.queryRenderedFeatures({ layers });
    const matching = [];
    for (const f of features) {
      const p = f.properties || {};
      const fname = p['name:pt'] || p['name:latin'] || p.name || p.ref || '';
      if (fname && normalizeSearchStr(fname) === targetNorm && f.geometry) {
        matching.push({
          type: 'Feature',
          properties: { name: fname },
          geometry: f.geometry
        });
      }
    }
    src.setData({ type: 'FeatureCollection', features: matching });
  } catch (e) {
    // ignore highlight errors if tiles are still loading
  }
}

function findRenderedViewportStreets(normQuery, limit = 5) {
  if (!mapInstance || !normQuery || normQuery.length < 3) return [];
  try {
    const layers = ['roads_minor', 'roads_medium', 'roads_major', 'detail_roads_minor', 'detail_roads_labels'].filter(id => mapInstance.getLayer(id));
    if (layers.length === 0) return [];
    const features = mapInstance.queryRenderedFeatures({ layers });
    const seen = new Set();
    const results = [];
    for (const f of features) {
      const p = f.properties || {};
      const fname = (p['name:pt'] || p['name:latin'] || p.name || p.ref || '').trim();
      if (!fname) continue;
      const fn = normalizeSearchStr(fname);
      if (!fn.includes(normQuery) || seen.has(fn)) continue;
      const geom = f.geometry;
      let lngLat = null;
      if (geom && geom.type === 'LineString' && geom.coordinates.length > 0) {
        lngLat = geom.coordinates[Math.floor(geom.coordinates.length / 2)];
      } else if (geom && geom.type === 'MultiLineString' && geom.coordinates[0]?.length > 0) {
        const line = geom.coordinates[0];
        lngLat = line[Math.floor(line.length / 2)];
      }
      if (!lngLat) continue;
      seen.add(fn);
      results.push({
        name: fname,
        city: 'No Mapa Atual',
        state: 'LOCAL',
        kind: 'Via',
        lat: lngLat[1],
        lng: lngLat[0]
      });
      if (results.length >= limit) break;
    }
    return results;
  } catch (e) {
    return [];
  }
}

async function fetchHybridSearchResults(q, cityLimit = 5, streetLimit = 25, signal = null) {
  const normQ = normalizeSearchStr(q.trim());
  const cityMatches = citiesList.filter(c => {
    const normName = normalizeSearchStr(c.name);
    const normState = (c.state || '').toLowerCase();
    return normName.includes(normQ) || normState === normQ;
  }).sort((a, b) => {
    const aNorm = normalizeSearchStr(a.name);
    const bNorm = normalizeSearchStr(b.name);
    const aStarts = aNorm.startsWith(normQ);
    const bStarts = bNorm.startsWith(normQ);
    if (aStarts && !bStarts) return -1;
    if (!aStarts && bStarts) return 1;
    if (a.capital && !b.capital) return -1;
    if (!a.capital && b.capital) return 1;
    return a.name.localeCompare(b.name);
  }).slice(0, cityLimit);

  let streetMatches = [];
  if (normQ.length >= 2) {
    try {
      const opts = signal ? { signal } : {};
      const params = new URLSearchParams({ q, limit: String(streetLimit) });
      if (mapInstance && typeof mapInstance.getCenter === 'function') {
        const center = mapInstance.getCenter();
        if (center && Number.isFinite(center.lat) && Number.isFinite(center.lng)) {
          params.set('lat', center.lat.toFixed(5));
          params.set('lng', center.lng.toFixed(5));
        }
      }
      if (currentSelectedCity && currentSelectedCity.name) {
        params.set('city', currentSelectedCity.name);
      }
      const res = await fetch(`/api/streets?${params.toString()}`, opts);
      if (res.ok) {
        streetMatches = await res.json();
      }
    } catch (e) {
      if (e.name === 'AbortError') throw e;
    }
  }

  // Merge local rendered streets from current viewport if not already present in SQLite hits
  const localStreets = findRenderedViewportStreets(normQ, 4);
  if (localStreets.length > 0) {
    const existingNames = new Set(streetMatches.map(s => normalizeSearchStr(s.name)));
    for (const ls of localStreets) {
      if (!existingNames.has(normalizeSearchStr(ls.name))) {
        streetMatches.push(ls);
      }
    }
  }

  return { cities: cityMatches, streets: streetMatches.slice(0, streetLimit) };
}

// City & Street Search
function setupMapSearch() {
  const input = document.getElementById('map-city-search');
  const dropdown = document.getElementById('map-search-results');
  if (!input || !dropdown) return;

  let searchTimer = null;
  let searchAbort = null;
  let lastRenderItems = [];

  function renderDropdown(cityMatches, streetMatches) {
    lastRenderItems = [];
    const htmlParts = [];

    for (const c of cityMatches) {
      const idx = lastRenderItems.length;
      lastRenderItems.push({ type: 'city', data: c });
      htmlParts.push(`
        <div class="search-item" data-result-idx="${idx}">
          <div>
            <span class="search-item-title">${escapeHtmlSafe(c.name)}</span>
            <span class="search-item-state">${escapeHtmlSafe(c.state)}</span>
          </div>
          <div class="flex items-center gap-2">
            ${c.capital ? '<span class="text-[10px] uppercase font-bold text-amber-400 bg-amber-900/30 px-1 rounded border border-amber-600/40">Capital</span>' : ''}
            <span class="search-item-badge">${c.pop ? (c.pop / 1000).toFixed(0) + 'k hab' : (c.ddd ? 'DDD ' + c.ddd : escapeHtmlSafe(c.state))}</span>
          </div>
        </div>
      `);
    }

    for (const s of streetMatches) {
      const idx = lastRenderItems.length;
      lastRenderItems.push({ type: 'street', data: s });
      const kindBadge = s.kind === 'Bairro' ? 'BAIRRO' : (s.kind === 'POI' ? 'POI' : 'VIA');
      htmlParts.push(`
        <div class="search-item" data-result-idx="${idx}">
          <div>
            <div class="search-item-title">${escapeHtmlSafe(s.name)}</div>
            <div class="text-xs text-gray-400">${escapeHtmlSafe(s.city)} &bull; ${escapeHtmlSafe(s.state)}</div>
          </div>
          <span class="search-item-badge">${kindBadge}</span>
        </div>
      `);
    }

    if (htmlParts.length === 0) {
      dropdown.innerHTML = `
        <div class="p-3 text-xs text-gray-400 text-center">
          Nenhuma rua ou cidade encontrada. Tente termo diferente ou coordenadas (ex: -23.55, -46.63)
        </div>
      `;
    } else {
      dropdown.innerHTML = htmlParts.join('');
      dropdown.querySelectorAll('.search-item[data-result-idx]').forEach(el => {
        el.addEventListener('click', () => {
          const item = lastRenderItems[parseInt(el.getAttribute('data-result-idx'), 10)];
          if (!item) return;
          if (item.type === 'city') {
            flyToCity(item.data.id);
          } else {
            const s = item.data;
            flyToStreet(s.lat, s.lng, s.name, s.city, s.state, s.kind);
          }
        });
      });
    }
    dropdown.classList.add('visible');
  }

  function doSearch() {
    const q = input.value.trim();
    if (!q) {
      if (searchTimer) clearTimeout(searchTimer);
      if (searchAbort) searchAbort.abort();
      dropdown.classList.remove('visible');
      dropdown.innerHTML = '';
      return;
    }

    // Check if coordinates
    const coordMatch = q.match(/^(-?\d+(\.\d+)?)[,\s]+(-?\d+(\.\d+)?)$/);
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1]);
      const lng = parseFloat(coordMatch[3]);
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        dropdown.innerHTML = `
          <div class="search-item" onclick="flyToCoords(${lat}, ${lng}, 'Coordenadas Personalizadas')">
            <div>
              <span class="search-item-title">Ir para Coordenadas</span>
              <div class="text-xs text-emerald-400 font-mono">${lat.toFixed(4)}, ${lng.toFixed(4)}</div>
            </div>
            <span class="search-item-badge">GPS</span>
          </div>
        `;
        dropdown.classList.add('visible');
        return;
      }
    }

    // Immediate city + viewport street results while debouncing SQLite FTS5 fetch
    const normQ = normalizeSearchStr(q);
    const instantCities = citiesList.filter(c => {
      return normalizeSearchStr(c.name).includes(normQ) || (c.state || '').toLowerCase() === normQ;
    }).sort((a, b) => {
      const aS = normalizeSearchStr(a.name).startsWith(normQ);
      const bS = normalizeSearchStr(b.name).startsWith(normQ);
      if (aS && !bS) return -1;
      if (!aS && bS) return 1;
      if (a.capital && !b.capital) return -1;
      if (!a.capital && b.capital) return 1;
      return a.name.localeCompare(b.name);
    }).slice(0, 5);

    const localStreets = findRenderedViewportStreets(normQ, 4);
    if (instantCities.length > 0 || localStreets.length > 0) {
      renderDropdown(instantCities, localStreets);
    }

    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      if (searchAbort) searchAbort.abort();
      searchAbort = new AbortController();
      try {
        const { cities, streets } = await fetchHybridSearchResults(q, 5, 25, searchAbort.signal);
        renderDropdown(cities, streets);
      } catch (e) {
        // aborted on newer keystroke
      }
    }, 180);
  }

  input.addEventListener('input', doSearch);
  input.addEventListener('focus', () => {
    if (input.value.trim()) doSearch();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const firstItem = dropdown.querySelector('.search-item');
      if (firstItem) {
        firstItem.click();
      }
    }
  });

  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.classList.remove('visible');
    }
  });
}

let currentSelectedCity = null;

// Haversine distance formula in kilometers
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of Earth in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Show City Intel Drawer with rich tactical data
window.showCityIntel = function(city) {
  currentSelectedCity = city;
  const drawer = document.getElementById('city-intel-drawer');
  if (!drawer) return;

  const cityNameEl = document.getElementById('drawer-city-name');
  const stateNameEl = document.getElementById('drawer-state-name');
  const badgeRegionEl = document.getElementById('drawer-badge-region');
  const badgeUfEl = document.getElementById('drawer-badge-uf');
  const ibgeEl = document.getElementById('drawer-ibge');
  const dddEl = document.getElementById('drawer-ddd');
  const capitalStatusEl = document.getElementById('drawer-capital-status');
  const coordsEl = document.getElementById('drawer-coords');
  const distanceEl = document.getElementById('drawer-distance');
  const wikiLinkEl = document.getElementById('drawer-wiki-link');

  if (cityNameEl) cityNameEl.textContent = city.name;
  if (stateNameEl) stateNameEl.textContent = `${city.state_name || city.state} (${city.state})`;
  if (badgeRegionEl) badgeRegionEl.textContent = (city.region || 'Brasil').toUpperCase();
  if (badgeUfEl) badgeUfEl.textContent = city.state;
  if (ibgeEl) ibgeEl.textContent = city.codigo_ibge || 'N/A';
  if (dddEl) dddEl.textContent = city.ddd ? `(${city.ddd})` : 'N/A';
  if (capitalStatusEl) capitalStatusEl.textContent = city.capital ? 'Capital Estadual' : 'Município';
  if (coordsEl) coordsEl.textContent = `${city.lat.toFixed(4)}°, ${city.lng.toFixed(4)}°`;

  // Calculate distance to State Capital or Brasilia
  if (distanceEl) {
    if (city.capital) {
      const dist = Math.round(getDistanceFromLatLonInKm(city.lat, city.lng, -15.7801, -47.9292));
      distanceEl.textContent = `${dist} km (até Brasília)`;
    } else {
      const cap = citiesList.find(c => c.state === city.state && c.capital);
      if (cap) {
        const dist = Math.round(getDistanceFromLatLonInKm(city.lat, city.lng, cap.lat, cap.lng));
        distanceEl.textContent = `${dist} km (${cap.name})`;
      } else {
        distanceEl.textContent = 'N/A';
      }
    }
  }

  // Reset city street prefetch status
  const prefetchBtn = document.getElementById('btn-prefetch-city');
  const prefetchStatus = document.getElementById('drawer-prefetch-status');
  if (prefetchBtn) prefetchBtn.disabled = false;
  if (prefetchStatus) prefetchStatus.textContent = '';

  // Render offline Solar & Lunar Ephemeris in city drawer
  const ephemBox = document.getElementById('drawer-ephemeris-box');
  if (ephemBox && typeof computeOfflineSunMoon === 'function') {
    const ep = computeOfflineSunMoon(city.lat, city.lng);
    ephemBox.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:11px;">
        <div>🌅 Nascer: <strong class="text-amber-300 font-mono">${ep.sunrise}</strong></div>
        <div>🌇 Pôr: <strong class="text-orange-400 font-mono">${ep.sunset}</strong></div>
        <div>🌄 Alvorada: <strong class="text-slate-300 font-mono">${ep.dawn}</strong></div>
        <div>🌆 Crepúsculo: <strong class="text-slate-300 font-mono">${ep.dusk}</strong></div>
        <div>⏱️ Luz Útil: <strong class="text-emerald-400 font-mono">${ep.daylightStr}</strong></div>
        <div>${ep.moonIcon} Lua: <strong class="text-cyan-300">${ep.moonPhaseName} (${ep.moonIllum}%)</strong></div>
      </div>
      <div style="font-size:10px;color:#94a3b8;margin-top:4px;">${escapeHtmlSafe(ep.remainingLabel)}</div>
    `;
  }

  // Exact Wikipedia offline article link (Dynamic Host + Kiwix port 8090)
  if (wikiLinkEl) {
    const primaryBook = window.nomadPrimaryZimBook || 'wikipedia_pt_all_maxi_2026-05';
    const kiwixBase = typeof window.getKiwixBaseUrl === 'function' ? window.getKiwixBaseUrl() : `http://${window.location.hostname || 'localhost'}:8090`;
    let wikiTarget = city.name;
    if (city.wiki_query) {
      wikiTarget = city.wiki_query;
    } else {
      wikiTarget = `${city.name}_(${city.state_name || city.state})`;
    }
    const cleanTarget = wikiTarget.replace(/ /g, '_');
    wikiLinkEl.href = `${kiwixBase}/content/${encodeURIComponent(primaryBook)}/${encodeURIComponent(cleanTarget)}`;
    fetch(`/api/kiwix/resolve?q=${encodeURIComponent(city.wiki_query || city.name)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(resolved => {
        if (resolved && resolved.ok && resolved.articleUrl && currentSelectedCity && currentSelectedCity.id === city.id) {
          wikiLinkEl.href = resolved.articleUrl;
        }
      })
      .catch(() => {});
  }

  drawer.classList.add('open');
};

window.closeCityDrawer = function() {
  const drawer = document.getElementById('city-intel-drawer');
  if (drawer) drawer.classList.remove('open');
};

window.copyCityCoords = function() {
  if (!currentSelectedCity) return;
  const str = `${currentSelectedCity.lat.toFixed(6)}, ${currentSelectedCity.lng.toFixed(6)}`;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(str).then(() => {
      const btn = document.getElementById('btn-copy-coords');
      if (btn) {
        btn.textContent = '✅ Copiado!';
        setTimeout(() => { btn.textContent = '📋 Copiar'; }, 2000);
      }
    }).catch(() => {
      prompt('Coordenadas (copie abaixo):', str);
    });
  } else {
    prompt('Coordenadas (copie abaixo):', str);
  }
};

window.zoomCity = function(level) {
  if (!mapInstance || !currentSelectedCity) return;
  mapInstance.flyTo({
    center: [currentSelectedCity.lng, currentSelectedCity.lat],
    zoom: level,
    duration: 1200,
    essential: true
  });
};

window.flyToCity = function(cityId) {
  if (currentTab !== 'map') {
    switchTab('map');
  }

  const city = citiesList.find(c => c.id === cityId);
  if (!city) return;

  const dropdown = document.getElementById('map-search-results');
  if (dropdown) dropdown.classList.remove('visible');

  const input = document.getElementById('map-city-search');
  if (input) input.value = `${city.name} - ${city.state}`;

  showCityIntel(city);
  flyToCoords(city.lat, city.lng, `${city.name} (${city.state})`, 13);
};

window.setStreetAsRoutePoint = function(role, lat, lng, name, city, state) {
  const numLat = Number(lat);
  const numLng = Number(lng);
  const label = city && state && state !== 'LOCAL' ? `${name} (${city}-${state})` : name;

  toggleRoutePlanner(true);

  if (role === 'origin') {
    routeOrigin = { lat: numLat, lng: numLng, label };
    const fromInput = document.getElementById('route-from-input');
    if (fromInput) fromInput.value = label;
  } else {
    routeDest = { lat: numLat, lng: numLng, label };
    const toInput = document.getElementById('route-to-input');
    if (toInput) toInput.value = label;

    if (!routeOrigin) {
      const fallbackCity = currentSelectedCity ||
        citiesList.find(c => normalizeSearchStr(c.name) === normalizeSearchStr(city) && c.state === state) ||
        citiesList.find(c => c.id === 'sp-sao-paulo');
      if (fallbackCity) {
        routeOrigin = {
          lat: fallbackCity.lat,
          lng: fallbackCity.lng,
          label: `${fallbackCity.name} (${fallbackCity.state})`
        };
        const fromInput = document.getElementById('route-from-input');
        if (fromInput) fromInput.value = routeOrigin.label;
      }
    }
  }

  if (routeOrigin && routeDest) {
    calculateRoute();
  }
};

window.flyToStreet = function(lat, lng, name, city, state, kind = 'Via') {
  if (currentTab !== 'map') {
    switchTab('map');
  }

  const dropdown = document.getElementById('map-search-results');
  if (dropdown) dropdown.classList.remove('visible');

  const input = document.getElementById('map-city-search');
  if (input) {
    input.value = city && state && state !== 'LOCAL' ? `${name} - ${city}/${state}` : name;
  }

  const numLat = Number(lat);
  const numLng = Number(lng);
  const label = city && state && state !== 'LOCAL' ? `${name} (${city}-${state})` : name;

  const popupDom = document.createElement('div');
  popupDom.style.cssText = 'color:#0f141a;font-family:-apple-system,sans-serif;padding:4px;min-width:210px;';
  popupDom.innerHTML = `
    <div style="font-size:10px;font-weight:800;text-transform:uppercase;color:#047857;margin-bottom:2px;">${escapeHtmlSafe(kind)} &bull; ${escapeHtmlSafe(city || '')} ${state && state !== 'LOCAL' ? '- ' + escapeHtmlSafe(state) : ''}</div>
    <h4 style="margin:0 0 4px;font-weight:800;font-size:13px;color:#090d10;">${escapeHtmlSafe(name)}</h4>
    <div style="font-size:11px;color:#374454;font-family:monospace;margin-bottom:8px;">LAT: ${numLat.toFixed(5)} | LNG: ${numLng.toFixed(5)}</div>
    <div style="display:flex;gap:6px;">
      <button type="button" data-role="origin" style="flex:1;padding:5px 7px;background:#0f172a;color:#34d399;border:1px solid #10b981;border-radius:4px;font-size:11px;font-weight:700;cursor:pointer;">🅰️ Origem</button>
      <button type="button" data-role="dest" style="flex:1;padding:5px 7px;background:#10b981;color:#06281c;border:none;border-radius:4px;font-size:11px;font-weight:800;cursor:pointer;">🅱️ Rota até Aqui</button>
    </div>
  `;
  popupDom.querySelectorAll('button[data-role]').forEach(btn => {
    btn.addEventListener('click', () => {
      setStreetAsRoutePoint(btn.getAttribute('data-role'), numLat, numLng, name, city, state);
    });
  });

  flyToCoords(numLat, numLng, label, 16, popupDom);

  if (mapInstance) {
    let done = false;
    const triggerHighlight = () => {
      if (done) return;
      done = true;
      highlightRenderedStreet(name);
    };
    mapInstance.once('moveend', triggerHighlight);
    setTimeout(triggerHighlight, 1750);
  }
};

window.flyToCoords = function(lat, lng, label = 'Ponto Selecionado', zoom = 12, customPopupContent = null) {
  if (!mapInstance) {
    initMap();
    setTimeout(() => flyToCoords(lat, lng, label, zoom, customPopupContent), 300);
    return;
  }

  mapInstance.flyTo({
    center: [lng, lat],
    zoom: zoom,
    duration: 1600,
    essential: true
  });

  if (mapMarker) {
    mapMarker.remove();
  }

  // Clear previous street highlight when flying to generic city/point
  if (!customPopupContent && mapInstance.getSource('street-highlight-source')) {
    mapInstance.getSource('street-highlight-source').setData({ type: 'FeatureCollection', features: [] });
  }

  // Tactical pulsing marker
  const wrap = document.createElement('div');
  wrap.className = 'tactical-marker-wrap';
  wrap.innerHTML = '<div class="tactical-marker-radar"></div><div class="tactical-marker-dot"></div>';
  wrap.style.cursor = 'pointer';

  const popup = new maplibregl.Popup({ offset: 18 });
  if (customPopupContent instanceof HTMLElement) {
    popup.setDOMContent(customPopupContent);
  } else {
    popup.setHTML(customPopupContent || `
      <div style="color: #0f141a; font-family: -apple-system, sans-serif; padding: 4px;">
        <h4 style="margin: 0 0 2px; font-weight: 800; font-size: 13px; color: #090d10;">${escapeHtmlSafe(label)}</h4>
        <div style="font-size: 11px; color: #374454; font-family: monospace;">LAT: ${lat.toFixed(4)} | LNG: ${lng.toFixed(4)}</div>
      </div>
    `);
  }

  mapMarker = new maplibregl.Marker({ element: wrap })
    .setLngLat([lng, lat])
    .setPopup(popup)
    .addTo(mapInstance);

  popup.addTo(mapInstance);
};

// ==========================================
// TACTICAL ROUTE PLANNER IMPLEMENTATION
// ==========================================
let routeOrigin = null;
let routeVia = null;
let routeDest = null;
let routeProfile = 'driving';
let mapPickMode = null;
let routeMarkers = [];
let currentRouteData = null;

window.toggleRouteViaInput = function(force) {
  const group = document.getElementById('route-via-group');
  if (!group) return;
  const show = typeof force === 'boolean' ? force : group.style.display === 'none';
  group.style.display = show ? 'flex' : 'none';
  if (show) {
    document.getElementById('route-via-input')?.focus();
  }
};

window.clearRouteVia = function() {
  routeVia = null;
  const input = document.getElementById('route-via-input');
  if (input) input.value = '';
  const group = document.getElementById('route-via-group');
  if (group) group.style.display = 'none';
  if (routeOrigin && routeDest) calculateRoute();
};

// Toggle Route Planner
window.toggleRoutePlanner = function(forceState) {
  const panel = document.getElementById('route-planner-panel');
  const btn = document.getElementById('btn-toggle-route-panel');
  const wptDrawer = document.getElementById('waypoints-drawer');
  const wptBtn = document.getElementById('layer-btn-waypoints');
  const supportDrawer = document.getElementById('nearby-support-drawer');
  const supportBtn = document.getElementById('btn-toggle-nearby-support');
  if (!panel) return;

  const isOpen = panel.classList.contains('open');
  const targetState = typeof forceState === 'boolean' ? forceState : !isOpen;

  if (targetState) {
    // Close other left drawers so drawers never collide
    if (wptDrawer) wptDrawer.classList.remove('open');
    if (wptBtn) wptBtn.classList.remove('active');
    if (supportDrawer) supportDrawer.classList.remove('open');
    if (supportBtn) supportBtn.classList.remove('active');
    if (window.innerWidth <= 900) closeCityDrawer();

    panel.classList.add('open');
    if (btn) btn.classList.add('active');
    if (currentTab !== 'map') switchTab('map');
  } else {
    panel.classList.remove('open');
    if (btn) btn.classList.remove('active');
    cancelMapPick();
  }
};

// Plan Route directly to selected city (from City Intel Drawer)
window.planRouteToSelectedCity = function() {
  if (!currentSelectedCity) return;
  toggleRoutePlanner(true);

  // Set destination as selected city
  routeDest = {
    lat: currentSelectedCity.lat,
    lng: currentSelectedCity.lng,
    label: `${currentSelectedCity.name} (${currentSelectedCity.state})`
  };
  const toInput = document.getElementById('route-to-input');
  if (toInput) toInput.value = routeDest.label;

  // If origin is not set, set origin to Sao Paulo or Campinas
  if (!routeOrigin) {
    const defaultOrigin = currentSelectedCity.id === 'sp-sao-paulo' ?
      citiesList.find(c => c.id === 'sp-campinas') :
      citiesList.find(c => c.id === 'sp-sao-paulo');

    if (defaultOrigin) {
      routeOrigin = {
        lat: defaultOrigin.lat,
        lng: defaultOrigin.lng,
        label: `${defaultOrigin.name} (${defaultOrigin.state})`
      };
      const fromInput = document.getElementById('route-from-input');
      if (fromInput) fromInput.value = routeOrigin.label;
    }
  }

  // Calculate route immediately!
  calculateRoute();
};

// Autocomplete search for origin and destination inputs
function setupRouteSearch() {
  setupCityAutocomplete('route-from-input', 'route-from-dropdown', (item) => {
    routeOrigin = {
      lat: item.lat,
      lng: item.lng,
      label: item.isStreet ? `${item.streetName} (${item.cityName}-${item.state})` : `${item.name} (${item.state})`
    };
    const input = document.getElementById('route-from-input');
    if (input) input.value = routeOrigin.label;
    if (routeOrigin && routeDest) calculateRoute();
  });

  setupCityAutocomplete('route-via-input', 'route-via-dropdown', (item) => {
    routeVia = {
      lat: item.lat,
      lng: item.lng,
      label: item.isStreet ? `${item.streetName} (${item.cityName}-${item.state})` : `${item.name} (${item.state})`
    };
    const input = document.getElementById('route-via-input');
    if (input) input.value = routeVia.label;
    if (routeOrigin && routeDest) calculateRoute();
  });

  setupCityAutocomplete('route-to-input', 'route-to-dropdown', (item) => {
    routeDest = {
      lat: item.lat,
      lng: item.lng,
      label: item.isStreet ? `${item.streetName} (${item.cityName}-${item.state})` : `${item.name} (${item.state})`
    };
    const input = document.getElementById('route-to-input');
    if (input) input.value = routeDest.label;
    if (routeOrigin && routeDest) calculateRoute();
  });
}

function setupCityAutocomplete(inputId, dropdownId, onSelect) {
  const input = document.getElementById(inputId);
  const dropdown = document.getElementById(dropdownId);
  if (!input || !dropdown) return;

  let acTimer = null;
  let acAbort = null;
  let lastItems = [];

  function renderAcDropdown(cityMatches, streetMatches) {
    lastItems = [];
    const parts = [];

    for (const c of cityMatches) {
      const idx = lastItems.length;
      lastItems.push({
        isStreet: false,
        name: c.name,
        state: c.state,
        lat: c.lat,
        lng: c.lng
      });
      parts.push(`
        <div class="search-item" data-ac-idx="${idx}">
          <div>
            <span class="search-item-title">${escapeHtmlSafe(c.name)}</span>
            <span class="search-item-state">${escapeHtmlSafe(c.state)}</span>
          </div>
          <span class="search-item-badge">DDD ${c.ddd || escapeHtmlSafe(c.state)}</span>
        </div>
      `);
    }

    for (const s of streetMatches) {
      const idx = lastItems.length;
      lastItems.push({
        isStreet: true,
        streetName: s.name,
        cityName: s.city,
        name: `${s.name} (${s.city})`,
        state: s.state,
        lat: s.lat,
        lng: s.lng
      });
      const kindBadge = s.kind === 'Bairro' ? 'BAIRRO' : (s.kind === 'POI' ? 'POI' : 'VIA');
      parts.push(`
        <div class="search-item" data-ac-idx="${idx}">
          <div>
            <div class="search-item-title">${escapeHtmlSafe(s.name)}</div>
            <div class="text-xs text-gray-400">${escapeHtmlSafe(s.city)} &bull; ${escapeHtmlSafe(s.state)}</div>
          </div>
          <span class="search-item-badge">${kindBadge}</span>
        </div>
      `);
    }

    if (parts.length === 0) {
      dropdown.innerHTML = `<div class="p-2.5 text-xs text-gray-400 text-center">Nenhuma rua ou município encontrado</div>`;
    } else {
      dropdown.innerHTML = parts.join('');
      dropdown.querySelectorAll('.search-item[data-ac-idx]').forEach(el => {
        el.addEventListener('click', () => {
          const item = lastItems[parseInt(el.getAttribute('data-ac-idx'), 10)];
          if (item) {
            onSelect(item);
            dropdown.classList.remove('visible');
          }
        });
      });
    }
    dropdown.classList.add('visible');
  }

  function doSearch() {
    const q = input.value.trim();
    if (!q) {
      if (acTimer) clearTimeout(acTimer);
      if (acAbort) acAbort.abort();
      dropdown.classList.remove('visible');
      dropdown.innerHTML = '';
      return;
    }

    const normQ = normalizeSearchStr(q);
    const instantCities = citiesList.filter(c => {
      return normalizeSearchStr(c.name).includes(normQ) || (c.state || '').toLowerCase() === normQ;
    }).sort((a, b) => {
      const aS = normalizeSearchStr(a.name).startsWith(normQ);
      const bS = normalizeSearchStr(b.name).startsWith(normQ);
      if (aS && !bS) return -1;
      if (!aS && bS) return 1;
      return a.name.localeCompare(b.name);
    }).slice(0, 4);

    if (instantCities.length > 0) {
      renderAcDropdown(instantCities, []);
    }

    if (acTimer) clearTimeout(acTimer);
    acTimer = setTimeout(async () => {
      if (acAbort) acAbort.abort();
      acAbort = new AbortController();
      try {
        const { cities, streets } = await fetchHybridSearchResults(q, 4, 10, acAbort.signal);
        renderAcDropdown(cities, streets);
      } catch (e) {
        // aborted
      }
    }, 180);
  }

  input.addEventListener('input', doSearch);
  input.addEventListener('focus', () => {
    if (input.value.trim()) doSearch();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const first = dropdown.querySelector('.search-item');
      if (first) first.click();
    }
  });

  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.classList.remove('visible');
    }
  });
}

// Invert origin and destination
window.swapRoutePoints = function() {
  const temp = routeOrigin;
  routeOrigin = routeDest;
  routeDest = temp;

  const fromInput = document.getElementById('route-from-input');
  const toInput = document.getElementById('route-to-input');
  if (fromInput) fromInput.value = routeOrigin ? routeOrigin.label : '';
  if (toInput) toInput.value = routeDest ? routeDest.label : '';

  if (routeOrigin && routeDest) {
    calculateRoute();
  }
};

// Profile selector change
window.selectProfile = function(profile) {
  routeProfile = profile;
  document.querySelectorAll('.profile-option').forEach(btn => {
    btn.classList.remove('active');
  });
  const activeBtn = document.getElementById(`prof-${profile}`);
  if (activeBtn) activeBtn.classList.add('active');

  if (routeOrigin && routeDest) {
    calculateRoute();
  }
};
window.onProfileChange = window.selectProfile;

// Map pick mode (clicking on map to set point)
window.enableMapPick = function(target) {
  mapPickMode = target;
  const banner = document.getElementById('map-pick-banner');
  const targetLabel = document.getElementById('map-pick-target-name');
  if (banner) banner.style.display = 'flex';
  if (targetLabel) {
    if (target === 'origin') targetLabel.textContent = 'Ponto A (Origem)';
    else if (target === 'dest') targetLabel.textContent = 'Ponto B (Destino)';
    else if (target === 'via') targetLabel.textContent = 'Parada Intermediária (Via)';
    else if (target === 'waypoint') targetLabel.textContent = 'Novo Marcador Tático';
  }
};

window.cancelMapPick = function() {
  mapPickMode = null;
  const banner = document.getElementById('map-pick-banner');
  if (banner) banner.style.display = 'none';
};

async function handleMapPickedPoint(lat, lng, mode) {
  cancelMapPick();

  let nearest = null;
  let minDist = Infinity;
  for (const c of citiesList) {
    const d = getDistanceFromLatLonInKm(lat, lng, c.lat, c.lng);
    if (d < minDist) {
      minDist = d;
      nearest = c;
    }
  }

  let streetInfo = null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1200);
    const res = await fetch(`/api/streets/reverse?lat=${lat}&lng=${lng}`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (res.ok) {
      const rev = await res.json();
      if (rev && rev.street && rev.street.name) {
        streetInfo = rev;
      }
    }
  } catch (e) {}

  let label = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  if (streetInfo && streetInfo.street) {
    const ufPart = streetInfo.street.state || (nearest ? nearest.state : '');
    const cityPart = streetInfo.street.city || (nearest ? nearest.name : '');
    label = cityPart ? `${streetInfo.street.name} (${cityPart}/${ufPart})` : streetInfo.street.name;
  } else if (nearest && minDist <= 15) {
    label = `${nearest.name} (${nearest.state})`;
  }

  if (mode === 'waypoint') {
    const latIn = document.getElementById('wpt-lat-input');
    const lngIn = document.getElementById('wpt-lng-input');
    const nameIn = document.getElementById('wpt-name-input');
    if (latIn) latIn.value = lat.toFixed(5);
    if (lngIn) lngIn.value = lng.toFixed(5);
    if (nameIn && !nameIn.value.trim() && streetInfo && streetInfo.street) {
      nameIn.value = streetInfo.street.name;
    }
    toggleWaypointsDrawer(true);
    return;
  }

  if (mode === 'origin') {
    routeOrigin = { lat, lng, label };
    const input = document.getElementById('route-from-input');
    if (input) input.value = label;
  } else if (mode === 'via') {
    routeVia = { lat, lng, label };
    toggleRouteViaInput(true);
    const input = document.getElementById('route-via-input');
    if (input) input.value = label;
  } else {
    routeDest = { lat, lng, label };
    const input = document.getElementById('route-to-input');
    if (input) input.value = label;
  }

  if (routeOrigin && routeDest) {
    calculateRoute();
  }
}

// Calculate route
window.calculateRoute = async function() {
  if (!routeOrigin || !routeDest) {
    return;
  }

  const loadingIndicator = document.getElementById('route-loading-indicator');
  const resultContainer = document.getElementById('route-result-container');

  if (loadingIndicator) {
    loadingIndicator.style.display = 'flex';
  }
  if (resultContainer) {
    resultContainer.style.opacity = '0.35';
    resultContainer.style.pointerEvents = 'none';
  }

  try {
    const viaParams = routeVia
      ? `&viaLat=${routeVia.lat}&viaLng=${routeVia.lng}&viaLabel=${encodeURIComponent(routeVia.label || '')}`
      : '';
    const url = `/api/route?fromLat=${routeOrigin.lat}&fromLng=${routeOrigin.lng}&toLat=${routeDest.lat}&toLng=${routeDest.lng}&profile=${routeProfile}&fromLabel=${encodeURIComponent(routeOrigin.label || '')}&toLabel=${encodeURIComponent(routeDest.label || '')}${viaParams}`;
    const res = await fetch(url);
    const data = await res.json();
    currentRouteData = data;

    renderRouteOnMap(data);
    renderRouteMetricsAndSteps(data);

  } catch (err) {
    console.error('Erro ao calcular rota:', err);
  } finally {
    if (loadingIndicator) {
      loadingIndicator.style.display = 'none';
    }
    if (resultContainer) {
      resultContainer.style.opacity = '1';
      resultContainer.style.pointerEvents = 'auto';
    }
  }
};

// Render route layer on MapLibre GL
function renderRouteOnMap(data) {
  if (!mapInstance || !data.geometry) return;

  const geojson = {
    type: 'Feature',
    properties: {},
    geometry: data.geometry
  };

  if (mapInstance.getSource('route-source')) {
    mapInstance.getSource('route-source').setData(geojson);
  } else {
    mapInstance.addSource('route-source', {
      type: 'geojson',
      data: geojson
    });

    // Outer glow
    mapInstance.addLayer({
      id: 'route-glow',
      type: 'line',
      source: 'route-source',
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': '#10b981',
        'line-width': 8,
        'line-opacity': 0.45,
        'line-blur': 3
      }
    });

    // Core line
    mapInstance.addLayer({
      id: 'route-line',
      type: 'line',
      source: 'route-source',
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': '#34d399',
        'line-width': 4.5,
        'line-opacity': 0.95
      }
    });
  }

  // Clear previous route markers
  routeMarkers.forEach(m => m.remove());
  routeMarkers = [];

  // Start Marker (A)
  const elA = document.createElement('div');
  elA.className = 'dot-origin';
  elA.style.width = '24px';
  elA.style.height = '24px';
  elA.style.fontSize = '12px';
  elA.style.boxShadow = '0 0 12px rgba(16, 185, 129, 0.9)';
  elA.textContent = 'A';

  const markerA = new maplibregl.Marker({ element: elA })
    .setLngLat([routeOrigin.lng, routeOrigin.lat])
    .setPopup(new maplibregl.Popup({ offset: 15 }).setHTML(`<strong>Origem:</strong> ${escapeHtmlSafe(routeOrigin.label)}`))
    .addTo(mapInstance);
  routeMarkers.push(markerA);

  if (routeVia) {
    const elV = document.createElement('div');
    elV.className = 'dot-origin';
    elV.style.width = '24px';
    elV.style.height = '24px';
    elV.style.fontSize = '12px';
    elV.style.background = '#f59e0b';
    elV.style.color = '#090d10';
    elV.style.boxShadow = '0 0 12px rgba(245, 158, 11, 0.9)';
    elV.textContent = 'V';
    const markerV = new maplibregl.Marker({ element: elV })
      .setLngLat([routeVia.lng, routeVia.lat])
      .setPopup(new maplibregl.Popup({ offset: 15 }).setHTML(`<strong>Parada (Via):</strong> ${escapeHtmlSafe(routeVia.label)}`))
      .addTo(mapInstance);
    routeMarkers.push(markerV);
  }

  // End Marker (B)
  const elB = document.createElement('div');
  elB.className = 'dot-dest';
  elB.style.width = '24px';
  elB.style.height = '24px';
  elB.style.fontSize = '12px';
  elB.style.boxShadow = '0 0 12px rgba(239, 68, 68, 0.9)';
  elB.textContent = 'B';

  const markerB = new maplibregl.Marker({ element: elB })
    .setLngLat([routeDest.lng, routeDest.lat])
    .setPopup(new maplibregl.Popup({ offset: 15 }).setHTML(`<strong>Destino:</strong> ${escapeHtmlSafe(routeDest.label)}`))
    .addTo(mapInstance);
  routeMarkers.push(markerB);

  // Fit camera bounds to route coordinates
  const coords = data.geometry.coordinates;
  const bounds = coords.reduce((b, coord) => b.extend(coord), new maplibregl.LngLatBounds(coords[0], coords[0]));
  mapInstance.fitBounds(bounds, {
    padding: { top: 90, bottom: 90, left: 420, right: 90 },
    maxZoom: 16,
    duration: 1500
  });
}

// Render metrics & steps in panel
function renderRouteMetricsAndSteps(data) {
  const container = document.getElementById('route-result-container');
  if (!container) return;
  container.style.display = 'flex';

  // Distance
  const distEl = document.getElementById('route-metric-dist');
  if (distEl) distEl.textContent = `${data.distanceKm} km`;

  // Duration
  const durEl = document.getElementById('route-metric-dur');
  if (durEl) {
    if (data.profile === 'walking') {
      const totalHours = Math.floor(data.durationMin / 60);
      const remainingMins = data.durationMin % 60;
      if (totalHours >= 8) {
        const days = (data.durationMin / 60 / 8).toFixed(1);
        durEl.textContent = `${totalHours}h ${remainingMins}min (~${days} d de marcha)`;
      } else {
        durEl.textContent = `${totalHours}h ${remainingMins}min`;
      }
    } else if (data.durationMin >= 60) {
      const h = Math.floor(data.durationMin / 60);
      const m = data.durationMin % 60;
      durEl.textContent = `${h}h ${m}min`;
    } else {
      durEl.textContent = `${data.durationMin} min`;
    }
  }

  // Fuel / Water
  const fuelTitleEl = document.getElementById('route-metric-fuel-title');
  const fuelEl = document.getElementById('route-metric-fuel');
  if (fuelTitleEl && fuelEl) {
    if (data.profile === 'walking') {
      fuelTitleEl.textContent = 'ÁGUA & ENERGIA';
      const kcal = data.caloriesKcal || Math.round((data.durationMin / 60) * 380);
      fuelEl.innerHTML = `${data.waterLiters}L Água &bull; <span class="text-xs text-gray-300 font-normal">${kcal} kcal</span>`;
    } else {
      fuelTitleEl.textContent = 'COMBUSTÍVEL EST.';
      fuelEl.textContent = `${data.fuelLiters} L (~${Math.round(data.fuelLiters / 50 * 100)}% tanque)`;
    }
  }

  // Source Badge
  const sourceEl = document.getElementById('route-metric-source');
  if (sourceEl) {
    if (data.source === 'osrm_online') {
      sourceEl.textContent = data.cached ? 'CACHE DISCO' : 'OSRM RODOVIAS';
      sourceEl.className = 'metric-badge text-emerald-400';
    } else if (data.source === 'offline_graph') {
      sourceEl.textContent = 'GRAFO OFFLINE (RUAS)';
      sourceEl.className = 'metric-badge text-cyan-400';
    } else {
      sourceEl.textContent = 'CORREDOR OFFLINE';
      sourceEl.className = 'metric-badge text-amber-400';
    }
  }

  // Support along route corridor (within 5 km)
  const corridorSection = document.getElementById('route-corridor-support-section');
  const corridorCount = document.getElementById('route-corridor-count');
  const corridorList = document.getElementById('route-corridor-list');
  const corridorItems = Array.isArray(data.corridorSupport) ? data.corridorSupport : [];
  if (corridorSection && corridorList && corridorCount) {
    if (corridorItems.length > 0) {
      corridorSection.style.display = 'block';
      corridorCount.textContent = `${corridorItems.length} pontos`;
      corridorList.innerHTML = '';
      corridorItems.forEach(item => {
        const icon = (typeof POI_ICONS !== 'undefined' && POI_ICONS[item.category]) || '🚑';
        const row = document.createElement('div');
        row.className = 'step-row';
        row.style.cursor = 'pointer';
        const place = [item.city, item.state].filter(Boolean).join('/');
        row.innerHTML = `
          <span class="step-icon">${icon}</span>
          <div class="step-info">
            <div style="font-weight:700;color:#f1f5f9;">${escapeHtmlSafe(item.name)}</div>
            <div style="font-size:10px;color:#94a3b8;">Km ${item.kmAlongRoute} da rota • ${item.distFromRouteKm} km da via${place ? ' • ' + escapeHtmlSafe(place) : ''}${item.phone ? ' • ☎️ ' + escapeHtmlSafe(item.phone) : ''}</div>
          </div>
        `;
        row.addEventListener('click', () => {
          flyToCoords(item.lat, item.lng, item.name, 15);
        });
        corridorList.appendChild(row);
      });
    } else {
      corridorSection.style.display = 'none';
      corridorList.innerHTML = '';
    }
  }

  // Steps
  const countEl = document.getElementById('route-steps-count');
  if (countEl) countEl.textContent = `${data.steps.length} etapas`;

  const listEl = document.getElementById('route-steps-list');
  if (listEl) {
    listEl.innerHTML = data.steps.map((s, idx) => {
      let icon = '⬆️';
      if (s.type === 'depart') icon = '🟢';
      else if (s.type === 'arrive') icon = '🏁';
      else if (s.instruction.includes('direita')) icon = '↗️';
      else if (s.instruction.includes('esquerda')) icon = '↖️';
      else if (s.instruction.includes('rotatória')) icon = '🔄';
      else if (s.instruction.includes('Passagem') || s.instruction.includes('Parada')) icon = '📍';

      return `
        <div class="step-row">
          <span class="step-icon">${icon}</span>
          <div class="step-info">
            <span>${s.instruction}</span>
          </div>
          ${s.distanceKm > 0 ? `<span class="step-dist">${s.distanceKm} km</span>` : ''}
        </div>
      `;
    }).join('');
  }
}

// Clear current route
window.clearCurrentRoute = function() {
  routeOrigin = null;
  routeVia = null;
  routeDest = null;
  currentRouteData = null;

  const fromInput = document.getElementById('route-from-input');
  const viaInput = document.getElementById('route-via-input');
  const viaGroup = document.getElementById('route-via-group');
  const toInput = document.getElementById('route-to-input');
  if (fromInput) fromInput.value = '';
  if (viaInput) viaInput.value = '';
  if (viaGroup) viaGroup.style.display = 'none';
  if (toInput) toInput.value = '';

  const resContainer = document.getElementById('route-result-container');
  if (resContainer) resContainer.style.display = 'none';
  const corridorSec = document.getElementById('route-corridor-support-section');
  if (corridorSec) corridorSec.style.display = 'none';

  const loader = document.getElementById('route-loading-indicator');
  if (loader) loader.style.display = 'none';

  routeMarkers.forEach(m => m.remove());
  routeMarkers = [];

  if (mapInstance && mapInstance.getSource('route-source')) {
    mapInstance.getSource('route-source').setData({
      type: 'FeatureCollection',
      features: []
    });
  }
  cancelMapPick();
};

// Download GPX
window.downloadCurrentRouteGpx = function() {
  if (!routeOrigin || !routeDest) return;
  const viaParams = routeVia ? `&viaLat=${routeVia.lat}&viaLng=${routeVia.lng}` : '';
  const url = `/api/route/gpx?fromLat=${routeOrigin.lat}&fromLng=${routeOrigin.lng}&toLat=${routeDest.lat}&toLng=${routeDest.lng}&profile=${routeProfile}${viaParams}`;
  const a = document.createElement('a');
  a.href = url;
  a.download = `rota_tatica_${routeProfile}_nomad.gpx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

/* ========================================================
   MODULE 1: STRATEGIC POIs ON MAP
   ======================================================== */
let poisData = [];
let poiMarkers = [];
const activePoiCategories = {
  hospital: true,
  rescue: true,
  police: true,
  water: true,
  fuel: true
};

const POI_ICONS = {
  hospital: '🏥',
  rescue: '🚒',
  police: '🛡️',
  water: '💧',
  fuel: '⛽'
};

async function loadPoisData() {
  try {
    const res = await fetch('/api/pois');
    if (res.ok) {
      poisData = await res.json();
      if (mapInstance) renderPoiMarkers();
    }
  } catch (err) {
    console.error('Erro ao carregar POIs estratégicos:', err);
  }
}

window.togglePoiCategory = function(cat) {
  activePoiCategories[cat] = !activePoiCategories[cat];
  const btn = document.getElementById(`layer-btn-${cat}`);
  if (btn) {
    btn.classList.toggle('active', activePoiCategories[cat]);
  }
  renderPoiMarkers();
};

function renderPoiMarkers() {
  if (!mapInstance || !poisData) return;

  // Clear existing POI markers
  poiMarkers.forEach(m => m.remove());
  poiMarkers = [];

  poisData.forEach(poi => {
    if (!activePoiCategories[poi.category]) return;

    const el = document.createElement('div');
    el.className = 'poi-custom-marker';
    el.innerHTML = `
      <div style="background: rgba(10,15,26,0.9); border: 2px solid #10b981; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; font-size: 14px; box-shadow: 0 0 10px rgba(16,185,129,0.5); cursor: pointer;">
        ${POI_ICONS[poi.category] || '📍'}
      </div>
    `;

    const popupHtml = `
      <div style="color: #fff; font-family: sans-serif; font-size: 12px; line-height: 1.4; padding: 4px;">
        <div style="font-weight: 800; color: #34d399; font-size: 13px; margin-bottom: 3px;">
          ${POI_ICONS[poi.category] || ''} ${poi.name}
        </div>
        <div style="color: #94a3b8; font-size: 11px; margin-bottom: 5px;">
          ${poi.city} - ${poi.uf} ${poi.phone ? `&bull; 📞 ${poi.phone}` : ''}
        </div>
        <div style="color: #cbd5e1; margin-bottom: 8px;">
          ${poi.details || ''}
        </div>
        <button onclick="setRouteDestination(${poi.lat}, ${poi.lng}, '${poi.name.replace(/'/g, "\\'")}')" 
                style="background: #10b981; color: #000; font-weight: 800; border: none; padding: 5px 8px; border-radius: 4px; cursor: pointer; width: 100%;">
          🧭 Traçar Rota até aqui
        </button>
      </div>
    `;

    const popup = new maplibregl.Popup({ offset: 15 }).setHTML(popupHtml);
    const marker = new maplibregl.Marker({ element: el })
      .setLngLat([poi.lng, poi.lat])
      .setPopup(popup)
      .addTo(mapInstance);

    poiMarkers.push(marker);
  });
}

window.setRouteDestination = function(lat, lng, label) {
  toggleRoutePlanner(true);
  routeDest = { lat, lng, label };
  const toInput = document.getElementById('route-to-input');
  if (toInput) toInput.value = label;
  if (routeOrigin && routeDest) calculateRoute();
};

/* ========================================================
   MODULE 2: PERSONAL TACTICAL WAYPOINTS (LOCALSTORAGE)
   ======================================================== */
let userWaypoints = [];
let userWptMarkers = [];

const WPT_ICONS = {
  base: '🏠',
  rendezvous: '🤝',
  shelter: '🏕️',
  water: '💧',
  danger: '⚠️'
};

function syncWaypointsWithServer() {
  fetch('/api/waypoints')
    .then(r => (r.ok ? r.json() : null))
    .then(serverList => {
      if (!Array.isArray(serverList)) return;
      const byId = new Map();
      let serverMissingLocal = false;
      for (const item of serverList) {
        if (item && item.id) byId.set(item.id, item);
      }
      for (const localItem of userWaypoints) {
        if (localItem && localItem.id && !byId.has(localItem.id)) {
          byId.set(localItem.id, localItem);
          serverMissingLocal = true;
        }
      }
      const merged = Array.from(byId.values());
      if (merged.length !== userWaypoints.length || merged.some((m, i) => !userWaypoints[i] || userWaypoints[i].id !== m.id)) {
        userWaypoints = merged;
        try {
          localStorage.setItem('nomad_brasil_waypoints', JSON.stringify(userWaypoints));
        } catch (e) {}
        updateWaypointsBadges();
        renderWaypointList();
        if (mapInstance) renderUserWptMarkers();
      }
      if (serverMissingLocal) {
        fetch('/api/waypoints', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(userWaypoints)
        }).catch(() => {});
      }
    })
    .catch(() => {});
}

function loadUserWaypoints() {
  try {
    const raw = localStorage.getItem('nomad_brasil_waypoints');
    userWaypoints = raw ? JSON.parse(raw) : [];
  } catch (e) {
    userWaypoints = [];
  }
  updateWaypointsBadges();
  renderWaypointList();
  if (mapInstance) renderUserWptMarkers();
  syncWaypointsWithServer();
}

function saveUserWaypointsToStorage() {
  try {
    localStorage.setItem('nomad_brasil_waypoints', JSON.stringify(userWaypoints));
  } catch (e) {}
  updateWaypointsBadges();
  renderWaypointList();
  renderUserWptMarkers();
  fetch('/api/waypoints', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userWaypoints)
  }).catch(() => {});
}

function updateWaypointsBadges() {
  const badge1 = document.getElementById('user-wpt-badge');
  const badge2 = document.getElementById('user-wpt-total');
  if (badge1) badge1.textContent = userWaypoints.length;
  if (badge2) badge2.textContent = userWaypoints.length;
}

window.toggleWaypointsDrawer = function(force) {
  const drawer = document.getElementById('waypoints-drawer');
  const btn = document.getElementById('layer-btn-waypoints');
  const routePanel = document.getElementById('route-planner-panel');
  const routeBtn = document.getElementById('btn-toggle-route-panel');
  const supportDrawer = document.getElementById('nearby-support-drawer');
  const supportBtn = document.getElementById('btn-toggle-nearby-support');
  if (!drawer) return;

  const isOpen = drawer.classList.contains('open');
  const shouldOpen = typeof force === 'boolean' ? force : !isOpen;

  if (shouldOpen) {
    if (routePanel) routePanel.classList.remove('open');
    if (routeBtn) routeBtn.classList.remove('active');
    if (supportDrawer) supportDrawer.classList.remove('open');
    if (supportBtn) supportBtn.classList.remove('active');
    if (window.innerWidth <= 900) closeCityDrawer();
    drawer.classList.add('open');
    if (btn) btn.classList.add('active');
  } else {
    drawer.classList.remove('open');
    if (btn) btn.classList.remove('active');
  }
};

window.setWptFromMapCenter = function() {
  if (!mapInstance) return;
  const c = mapInstance.getCenter();
  const latIn = document.getElementById('wpt-lat-input');
  const lngIn = document.getElementById('wpt-lng-input');
  if (latIn) latIn.value = c.lat.toFixed(4);
  if (lngIn) lngIn.value = c.lng.toFixed(4);
};

window.saveNewWaypoint = function() {
  const nameIn = document.getElementById('wpt-name-input');
  const catIn = document.getElementById('wpt-cat-select');
  const latIn = document.getElementById('wpt-lat-input');
  const lngIn = document.getElementById('wpt-lng-input');

  const name = nameIn ? nameIn.value.trim() : '';
  const category = catIn ? catIn.value : 'base';
  const lat = parseFloat(latIn ? latIn.value : '');
  const lng = parseFloat(lngIn ? lngIn.value : '');

  if (!name) {
    alert('Por favor, informe um nome para o marcador.');
    return;
  }
  if (isNaN(lat) || isNaN(lng)) {
    alert('Coordenadas de latitude e longitude inválidas. Use o botão "Centro" ou clique no mapa.');
    return;
  }

  const wpt = {
    id: 'wpt_' + Date.now(),
    name,
    category,
    lat,
    lng,
    createdAt: new Date().toISOString()
  };

  userWaypoints.push(wpt);
  saveUserWaypointsToStorage();

  if (nameIn) nameIn.value = '';
  alert(`Marcador "${name}" salvo com sucesso!`);
};

window.deleteWaypoint = function(id) {
  if (!confirm('Deseja realmente remover este marcador?')) return;
  userWaypoints = userWaypoints.filter(w => w.id !== id);
  saveUserWaypointsToStorage();
};

function renderWaypointList() {
  const container = document.getElementById('wpt-list-items');
  if (!container) return;

  if (userWaypoints.length === 0) {
    container.innerHTML = '<div class="text-xs text-gray-500 py-3 text-center">Nenhum marcador cadastrado ainda.</div>';
    return;
  }

  container.innerHTML = userWaypoints.map(w => `
    <div class="wpt-item">
      <span class="wpt-icon">${WPT_ICONS[w.category] || '📍'}</span>
      <div class="wpt-details">
        <div class="wpt-title">${w.name}</div>
        <div class="wpt-coords">${w.lat.toFixed(4)}, ${w.lng.toFixed(4)}</div>
      </div>
      <div class="wpt-actions">
        <button class="wpt-act-btn route" onclick="setRouteDestination(${w.lat}, ${w.lng}, '${w.name.replace(/'/g, "\\'")}')" title="Traçar rota até aqui">🧭</button>
        <button class="wpt-act-btn" onclick="flyToCoords(${w.lat}, ${w.lng}, '${w.name.replace(/'/g, "\\'")}', 14)" title="Ver no mapa">🔍</button>
        <button class="wpt-act-btn delete" onclick="deleteWaypoint('${w.id}')" title="Remover">🗑️</button>
      </div>
    </div>
  `).join('');
}

function renderUserWptMarkers() {
  if (!mapInstance) return;
  userWptMarkers.forEach(m => m.remove());
  userWptMarkers = [];

  userWaypoints.forEach(w => {
    const el = document.createElement('div');
    el.innerHTML = `
      <div style="background: rgba(14,165,233,0.9); border: 2px solid #fff; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; font-size: 14px; box-shadow: 0 0 12px rgba(14,165,233,0.7); cursor: pointer;">
        ${WPT_ICONS[w.category] || '📍'}
      </div>
    `;

    const popupHtml = `
      <div style="color: #fff; font-family: sans-serif; font-size: 12px; padding: 4px;">
        <div style="font-weight: 800; color: #38bdf8; font-size: 13px; margin-bottom: 2px;">
          ${WPT_ICONS[w.category] || ''} ${w.name}
        </div>
        <div style="color: #94a3b8; font-size: 10px; margin-bottom: 6px;">
          Coord: ${w.lat.toFixed(4)}, ${w.lng.toFixed(4)}
        </div>
        <button onclick="setRouteDestination(${w.lat}, ${w.lng}, '${w.name.replace(/'/g, "\\'")}')" 
                style="background: #0ea5e9; color: #000; font-weight: 800; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; width: 100%;">
          🧭 Rota até aqui
        </button>
      </div>
    `;

    const popup = new maplibregl.Popup({ offset: 15 }).setHTML(popupHtml);
    const marker = new maplibregl.Marker({ element: el })
      .setLngLat([w.lng, w.lat])
      .setPopup(popup)
      .addTo(mapInstance);

    userWptMarkers.push(marker);
  });
}

window.exportWaypointsGpx = function() {
  if (userWaypoints.length === 0) {
    alert('Nenhum marcador pessoal cadastrado para exportar.');
    return;
  }

  let gpx = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="NOMAD Brasil" xmlns="http://www.topografix.com/GPX/1/1">\n`;
  userWaypoints.forEach(w => {
    gpx += `  <wpt lat="${w.lat}" lon="${w.lng}">\n    <name>${w.name}</name>\n    <desc>Categoria: ${w.category}</desc>\n  </wpt>\n`;
  });
  gpx += `</gpx>`;

  const blob = new Blob([gpx], { type: 'application/gpx+xml' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `nomad_brasil_marcadores_${Date.now()}.gpx`;
  a.click();
};

window.exportWaypointsJson = function() {
  if (userWaypoints.length === 0) {
    alert('Nenhum marcador para exportar.');
    return;
  }
  const blob = new Blob([JSON.stringify(userWaypoints, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `nomad_brasil_marcadores_backup.json`;
  a.click();
};

window.handleImportWaypoints = function(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const content = e.target.result;
      if (file.name.endsWith('.json')) {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          userWaypoints = [...userWaypoints, ...parsed];
          saveUserWaypointsToStorage();
          alert(`${parsed.length} marcadores importados com sucesso!`);
        }
      } else {
        alert('Formato de importação: utilize arquivos .json');
      }
    } catch (err) {
      alert('Erro ao processar arquivo: ' + err.message);
    }
  };
  reader.readAsText(file);
};

/* ========================================================
   MODULE 3: TACTICAL RATIONING & FOOD SUPPLY CALCULATOR
   ======================================================== */
window.setRationingDays = function(days) {
  const input = document.getElementById('calc-days');
  if (input) input.value = days;

  document.querySelectorAll('.map-quick-chips button').forEach(b => b.classList.remove('chip-highlight'));
  const btn = document.getElementById(`btn-days-${days}`);
  if (btn) btn.classList.add('chip-highlight');

  calculateRationing();
};

window.calculateRationing = function() {
  const adults = parseInt(document.getElementById('calc-adults')?.value || '2', 10);
  const children = parseInt(document.getElementById('calc-children')?.value || '1', 10);
  const days = parseInt(document.getElementById('calc-days')?.value || '15', 10);
  const activity = parseFloat(document.getElementById('calc-activity')?.value || '1.2');

  const totalPeople = adults + children;

  // Caloric computation
  const baseAdultKcal = 2200;
  const baseChildKcal = 1500;
  const dailyKcal = Math.round(((adults * baseAdultKcal) + (children * baseChildKcal)) * activity);
  const totalKcal = dailyKcal * days;

  // Water computation (Litros)
  // Consumo: 2.5L/adulto/dia, 1.8L/criança/dia
  // Higiene mínima: 2L/pessoa/dia
  const dailyDrinkingWater = (adults * 2.5) + (children * 1.8);
  const totalDrinkingWater = Math.round(dailyDrinkingWater * days);
  const dailyHygieneWater = totalPeople * 2.0;
  const totalHygieneWater = Math.round(dailyHygieneWater * days);

  // Dry food weight estimation (aprox 450g de comida seca por 2000 kcal)
  const totalFoodWeightKg = Math.round((totalKcal / 2000) * 0.45);

  // Update Summary cards
  const elWaterTot = document.getElementById('res-water-total');
  const elWaterHyg = document.getElementById('res-water-hygiene');
  const elCalTot = document.getElementById('res-calories-total');
  const elCalDaily = document.getElementById('res-calories-daily');
  const elFoodWeight = document.getElementById('res-food-weight');
  const elGroupDesc = document.getElementById('res-group-desc');

  if (elWaterTot) elWaterTot.textContent = `${totalDrinkingWater} L`;
  if (elWaterHyg) elWaterHyg.textContent = `${totalHygieneWater} L`;
  if (elCalTot) elCalTot.textContent = `${totalKcal.toLocaleString('pt-BR')} kcal`;
  if (elCalDaily) elCalDaily.textContent = `${dailyKcal.toLocaleString('pt-BR')} kcal / dia`;
  if (elFoodWeight) elFoodWeight.textContent = `${totalFoodWeightKg} kg`;
  if (elGroupDesc) elGroupDesc.textContent = `${adults} adultos, ${children} crianças &bull; ${days} dias`;

  // Energy & Battery calculations
  // Bateria 12V 100Ah = 1200Wh. Consumo diário (rádio 20W x 3h + 2 leds 5W x 5h = 110Wh/dia)
  const batteryDays = Math.max(1, Math.round(1200 / 110));
  const generatorFuel = (days * 4 * 0.6).toFixed(1); // 4h/dia gastando 0.6L/h
  const batteriesCount = Math.round(totalPeople * Math.ceil(days / 7) * 2);

  const elBatDays = document.getElementById('res-battery-days');
  const elFuelGen = document.getElementById('res-fuel-generator');
  const elBatCount = document.getElementById('res-batteries-count');
  if (elBatDays) elBatDays.textContent = `~${batteryDays} dias`;
  if (elFuelGen) elFuelGen.textContent = `${generatorFuel} L`;
  if (elBatCount) elBatCount.textContent = `${batteriesCount} un`;

  // Brazilian Survival Food Basket Items
  const foodItems = [
    { name: 'Arroz Branco / Parboilizado', perPersonDay: 0.12, unit: 'kg', kcalPerUnit: 3600, shelfLife: '2 a 5 anos (embalado)' },
    { name: 'Feijão Preto / Carioca', perPersonDay: 0.08, unit: 'kg', kcalPerUnit: 3400, shelfLife: '1 a 3 anos' },
    { name: 'Aveia em Flocos / Farinha de Mandioca', perPersonDay: 0.06, unit: 'kg', kcalPerUnit: 3800, shelfLife: '1 a 2 anos' },
    { name: 'Sardinha / Atum em Óleo (Enlatado)', perPersonDay: 0.4, unit: 'latas (125g)', kcalPerUnit: 250, shelfLife: '3 a 5 anos' },
    { name: 'Óleo Vegetal (Soja/Girassol)', perPersonDay: 0.025, unit: 'L', kcalPerUnit: 8840, shelfLife: '1 a 2 anos' },
    { name: 'Açúcar Cristal / Mascavo', perPersonDay: 0.035, unit: 'kg', kcalPerUnit: 3900, shelfLife: 'Indeterminada (seco)' },
    { name: 'Sal Refinado Iodado', perPersonDay: 0.012, unit: 'kg', kcalPerUnit: 0, shelfLife: 'Indeterminada' },
    { name: 'Leite em Pó Integral', perPersonDay: 0.04, unit: 'kg', kcalPerUnit: 5000, shelfLife: '1 a 2 anos' },
    { name: 'Café em Pó / Chá Mate', perPersonDay: 0.015, unit: 'kg', kcalPerUnit: 0, shelfLife: '1 a 2 anos' }
  ];

  const tbody = document.getElementById('rationing-table-body');
  if (tbody) {
    tbody.innerHTML = foodItems.map(item => {
      const qty = (item.perPersonDay * totalPeople * days).toFixed(item.unit.includes('latas') ? 0 : 1);
      const totalItemKcal = Math.round(qty * item.kcalPerUnit);
      return `
        <tr style="border-bottom: 1px solid rgba(255,255,255,0.06);">
          <td style="padding: 0.65rem 0.8rem; font-weight: 700; color: #fff;">${item.name}</td>
          <td style="padding: 0.65rem 0.8rem; font-family: monospace; font-weight: 800; color: #34d399;">${qty} ${item.unit}</td>
          <td style="padding: 0.65rem 0.8rem; font-family: monospace; color: #f59e0b;">${totalItemKcal > 0 ? totalItemKcal.toLocaleString('pt-BR') + ' kcal' : '-'}</td>
          <td style="padding: 0.65rem 0.8rem; color: #94a3b8;">${item.shelfLife}</td>
        </tr>
      `;
    }).join('');
  }
};

window.printRationingList = function() {
  window.print();
};

/* ========================================================
   MODULE 4: TELECOM & ANTENNA CALCULATOR
   ======================================================== */
let radioDataStore = null;

async function loadRadioData() {
  try {
    const res = await fetch('/api/radio');
    if (res.ok) {
      radioDataStore = await res.json();
      renderRadioBands(radioDataStore.bands || []);
      renderQCode(radioDataStore.q_code || []);
      renderPhoneticAlphabet(radioDataStore.phonetic_alphabet || []);
    }
  } catch (e) {
    console.error('Erro ao carregar dados de rádio:', e);
  }
}

function renderRadioBands(bands) {
  const container = document.getElementById('telecom-bands-container');
  if (!container) return;

  container.innerHTML = bands.map(b => `
    <div style="background: rgba(0,0,0,0.3); border: 1px solid var(--border); border-radius: 8px; padding: 1rem;">
      <h4 style="color: #38bdf8; font-size: 1rem; margin-bottom: 0.25rem;">${b.name}</h4>
      <p style="color: #94a3b8; font-size: 0.75rem; margin-bottom: 0.75rem;">${b.description}</p>
      <div style="overflow-x: auto;">
        <table style="width: 100%; text-align: left; font-size: 0.75rem; border-collapse: collapse;">
          <thead>
            <tr style="border-bottom: 1px solid var(--border); color: #64748b;">
              <th style="padding: 0.35rem 0.5rem;">CANAL</th>
              <th style="padding: 0.35rem 0.5rem;">FREQ.</th>
              <th style="padding: 0.35rem 0.5rem;">MODO</th>
              <th style="padding: 0.35rem 0.5rem;">FINALIDADE &amp; USO OFICIAL</th>
            </tr>
          </thead>
          <tbody>
            ${b.channels.map(c => `
              <tr style="border-bottom: 1px solid rgba(255,255,255,0.04);">
                <td style="padding: 0.4rem 0.5rem; font-weight: 700; color: #fff;">${c.channel}</td>
                <td style="padding: 0.4rem 0.5rem; font-family: monospace; color: #10b981; font-weight: 800;">${c.freq}</td>
                <td style="padding: 0.4rem 0.5rem; color: #f59e0b; font-family: monospace;">${c.mode}</td>
                <td style="padding: 0.4rem 0.5rem; color: #cbd5e1;">${c.usage}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `).join('');
}

function renderQCode(list) {
  const container = document.getElementById('qcode-list-container');
  if (!container) return;

  container.innerHTML = list.map(q => `
    <div class="step-row" style="padding: 0.45rem 0.6rem; border-bottom: 1px solid rgba(255,255,255,0.04);">
      <span style="font-family: monospace; font-weight: 800; color: #34d399; width: 55px; flex-shrink: 0;">${q.code}</span>
      <div style="flex: 1; font-size: 0.75rem;">
        <div style="color: #fff; font-weight: 600;">${q.meaning}</div>
        <div style="color: #64748b; font-size: 0.7rem;">Ex: "${q.example}"</div>
      </div>
    </div>
  `).join('');
}

window.filterQCode = function() {
  const q = document.getElementById('qcode-search-input')?.value.trim().toLowerCase();
  if (!radioDataStore || !radioDataStore.q_code) return;
  if (!q) {
    renderQCode(radioDataStore.q_code);
    return;
  }
  const filtered = radioDataStore.q_code.filter(item => 
    item.code.toLowerCase().includes(q) || 
    item.meaning.toLowerCase().includes(q)
  );
  renderQCode(filtered);
};

function renderPhoneticAlphabet(list) {
  const container = document.getElementById('phonetic-list-container');
  if (!container) return;

  container.innerHTML = list.map(p => `
    <div class="step-row" style="padding: 0.4rem 0.6rem; border-bottom: 1px solid rgba(255,255,255,0.04);">
      <span style="font-family: monospace; font-size: 1.1rem; font-weight: 900; color: #38bdf8; width: 35px;">${p.letter}</span>
      <div style="flex: 1; font-size: 0.78rem;">
        <span style="font-weight: 800; color: #fff;">${p.code}</span>
        <span style="color: #94a3b8; font-size: 0.7rem; margin-left: 0.5rem;">[${p.pronunciation}]</span>
      </div>
    </div>
  `).join('');
}

window.calculateAntennaDipole = function() {
  const freq = parseFloat(document.getElementById('calc-antenna-freq')?.value || '146.520');
  if (isNaN(freq) || freq <= 0) return;

  // L total (m) = 142.5 / f(MHz)
  const totalLengthM = 142.5 / freq;
  const eachLegCm = (totalLengthM / 2) * 100;

  const elTot = document.getElementById('antenna-res-total');
  const elLeg = document.getElementById('antenna-res-leg');
  if (elTot) elTot.textContent = `${totalLengthM.toFixed(2)} m`;
  if (elLeg) elLeg.textContent = `${eachLegCm.toFixed(1)} cm`;
};

window.setAntennaPreset = function(mhz) {
  const input = document.getElementById('calc-antenna-freq');
  if (input) input.value = mhz;
  calculateAntennaDipole();
};

/* ========================================================
   MODULE 5: MORSE & EMERGENCY SIGNALS (AUDIO + OPTICAL)
   ======================================================== */
const MORSE_MAP = {
  'A': '.-', 'B': '-...', 'C': '-.-.', 'D': '-..', 'E': '.', 'F': '..-.',
  'G': '--.', 'H': '....', 'I': '..', 'J': '.---', 'K': '-.-', 'L': '.-..',
  'M': '--', 'N': '-.', 'O': '---', 'P': '.--.', 'Q': '--.-', 'R': '.-.',
  'S': '...', 'T': '-', 'U': '..-', 'V': '...-', 'W': '.--', 'X': '-..-',
  'Y': '-.--', 'Z': '--..', '1': '.----', '2': '..---', '3': '...--',
  '4': '....-', '5': '.....', '6': '-....', '7': '--...', '8': '---..',
  '9': '----.', '0': '-----', ' ': '/'
};

let audioContextInstance = null;
let isAudioSosActive = false;
let audioSosInterval = null;

let isOpticalSosActive = false;
let opticalSosInterval = null;

function getAudioContext() {
  if (!audioContextInstance) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioContextInstance = new AudioContext();
  }
  if (audioContextInstance.state === 'suspended') {
    audioContextInstance.resume();
  }
  return audioContextInstance;
}

function playTone(freq, durationMs) {
  return new Promise(resolve => {
    try {
      const ctx = getAudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);

      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + (durationMs / 1000));

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + (durationMs / 1000));
      setTimeout(resolve, durationMs);
    } catch (e) {
      resolve();
    }
  });
}

function sleepMs(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// SOS Pattern: ... --- ... (Dot: 120ms, Dash: 360ms, Pause: 120ms, Letter pause: 360ms, Word pause: 1200ms)
async function playSosLoop() {
  const dot = 120;
  const dash = 360;

  while (isAudioSosActive) {
    // S: . . .
    for (let i = 0; i < 3; i++) {
      if (!isAudioSosActive) return;
      await playTone(800, dot);
      await sleepMs(dot);
    }
    await sleepMs(dash);

    // O: - - -
    for (let i = 0; i < 3; i++) {
      if (!isAudioSosActive) return;
      await playTone(800, dash);
      await sleepMs(dot);
    }
    await sleepMs(dash);

    // S: . . .
    for (let i = 0; i < 3; i++) {
      if (!isAudioSosActive) return;
      await playTone(800, dot);
      await sleepMs(dot);
    }

    // Long pause between SOS loops
    await sleepMs(1400);
  }
}

window.toggleAudioSos = function() {
  const btn = document.getElementById('btn-toggle-audio-sos');
  if (isAudioSosActive) {
    isAudioSosActive = false;
    if (btn) {
      btn.innerHTML = `<span>🔊</span> INICIAR BIPE SONORO (SOS)`;
      btn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
      btn.style.color = '#000';
    }
  } else {
    isAudioSosActive = true;
    if (btn) {
      btn.innerHTML = `<span>⏹️</span> PARAR BIPE SONORO`;
      btn.style.background = 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)';
      btn.style.color = '#fff';
    }
    playSosLoop();
  }
};

window.toggleOpticalSos = function(force) {
  const overlay = document.getElementById('optical-sos-overlay');
  if (!overlay) return;

  const shouldActive = force !== undefined ? force : !isOpticalSosActive;
  isOpticalSosActive = shouldActive;

  const btn = document.getElementById('btn-toggle-optical-sos');

  if (isOpticalSosActive) {
    overlay.style.display = 'flex';
    if (btn) {
      btn.innerHTML = `<span>⏹️</span> PARAR SINALIZADOR VISUAL`;
      btn.style.background = '#000';
      btn.style.border = '1px solid #ef4444';
    }
    runOpticalFlashLoop(overlay);
  } else {
    overlay.style.display = 'none';
    overlay.classList.remove('flash-active-white', 'flash-active-black');
    if (btn) {
      btn.innerHTML = `<span>🚨</span> INICIAR SINALIZADOR VISUAL (SOS)`;
      btn.style.background = 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)';
      btn.style.border = 'none';
    }
  }
};

async function runOpticalFlashLoop(overlay) {
  const dot = 150;
  const dash = 450;

  async function flash(ms) {
    overlay.classList.add('flash-active-white');
    overlay.classList.remove('flash-active-black');
    await sleepMs(ms);
    overlay.classList.remove('flash-active-white');
    overlay.classList.add('flash-active-black');
    await sleepMs(dot);
  }

  while (isOpticalSosActive) {
    // S: . . .
    for (let i = 0; i < 3; i++) {
      if (!isOpticalSosActive) return;
      await flash(dot);
    }
    await sleepMs(dash);

    // O: - - -
    for (let i = 0; i < 3; i++) {
      if (!isOpticalSosActive) return;
      await flash(dash);
    }
    await sleepMs(dash);

    // S: . . .
    for (let i = 0; i < 3; i++) {
      if (!isOpticalSosActive) return;
      await flash(dot);
    }

    await sleepMs(1500);
  }
}

let isMorseTransmitting = false;

window.convertAndPlayCustomMorse = async function(btnEl) {
  if (isMorseTransmitting) return;

  const btn = btnEl || document.getElementById('btn-morse-transmit');
  const input = document.getElementById('morse-custom-input');
  const text = (input?.value || 'SOS').toUpperCase().trim();
  const display = document.getElementById('morse-output-display');

  if (!text) return;

  const morseSeq = text.split('').map(char => MORSE_MAP[char] || (char === ' ' ? '/' : '?')).join(' ');
  if (display) display.textContent = morseSeq;

  // Travar o botão e indicar transmissão em andamento
  isMorseTransmitting = true;
  let originalBtnHtml = '';
  if (btn) {
    btn.disabled = true;
    originalBtnHtml = btn.innerHTML;
    btn.innerHTML = '<span>⏳</span> Transmitindo...';
    btn.style.opacity = '0.65';
    btn.style.cursor = 'not-allowed';
  }
  if (input) input.disabled = true;

  try {
    // Reprodução da sequência Morse
    for (const char of morseSeq) {
      if (!isMorseTransmitting) break;
      if (char === '.') {
        await playTone(800, 100);
        await sleepMs(80);
      } else if (char === '-') {
        await playTone(800, 300);
        await sleepMs(80);
      } else if (char === ' ') {
        await sleepMs(200);
      } else if (char === '/') {
        await sleepMs(400);
      }
    }
  } catch (err) {
    console.error('Erro na transmissão Morse:', err);
  } finally {
    // Destravar o botão após a finalização do áudio
    isMorseTransmitting = false;
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalBtnHtml || '<span>▶️</span> Transmitir Áudio';
      btn.style.opacity = '';
      btn.style.cursor = '';
    }
    if (input) input.disabled = false;
  }
};

// Hook into initial loading of application
const prevInitDashboard = window.initDashboard || function() {};
window.initDashboard = function() {
  prevInitDashboard();
  loadPoisData();
  loadUserWaypoints();
  calculateRationing();
  loadRadioData();
  calculateAntennaDipole();
};

// Call immediately if DOM is already ready
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  setTimeout(() => {
    loadPoisData();
    loadUserWaypoints();
    calculateRationing();
    loadRadioData();
    calculateAntennaDipole();
    loadVenomousData();
    calculateSolar();
    renderBobKit();
    loadPlantsData();
    renderKnotsList();
    loadPefData();
    calculateMarch();
  }, 200);
}

// =====================================================================
// PWA SERVICE WORKER REGISTRATION
// =====================================================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(reg => {
      console.log('[PWA] Service Worker registrado:', reg.scope);
    }).catch(err => {
      console.warn('[PWA] Falha ao registrar Service Worker:', err);
    });
  });
}

// =====================================================================
// 10. ANIMAIS PEÇONHENTOS DO BRASIL
// =====================================================================
let venomousAnimalsData = [];
let currentVenomousFilter = 'all';

async function loadVenomousData() {
  if (venomousAnimalsData && venomousAnimalsData.length > 0) {
    renderVenomousList(venomousAnimalsData);
    return;
  }
  try {
    const res = await fetch('/api/venomous');
    if (!res.ok) throw new Error('Falha HTTP ' + res.status);
    venomousAnimalsData = await res.json();
    renderVenomousList(venomousAnimalsData);
  } catch (err) {
    console.warn('Carregando fallback de animais peçonhentos:', err);
    try {
      const res2 = await fetch('./data/venomous_animals.json');
      venomousAnimalsData = await res2.json();
      renderVenomousList(venomousAnimalsData);
    } catch (e2) {
      console.error('Falha fatal ao carregar catálogo peçonhento:', e2);
    }
  }
}

window.filterVenomousGroup = function(group) {
  currentVenomousFilter = group;
  const section = document.getElementById('tab-venomous');
  if (section) {
    const chips = section.querySelectorAll('.chip-btn');
    chips.forEach(btn => {
      const text = btn.textContent.toLowerCase();
      if ((group === 'all' && text.includes('todos')) ||
          (group === 'serpente' && text.includes('serpentes')) ||
          (group === 'escorpião' && text.includes('escorpiões')) ||
          (group === 'aranha' && text.includes('aranhas'))) {
        btn.classList.add('chip-highlight');
      } else {
        btn.classList.remove('chip-highlight');
      }
    });
  }
  renderVenomousList(venomousAnimalsData);
};

function renderVenomousList(data) {
  const container = document.getElementById('venomous-container');
  if (!container) return;

  const filtered = (currentVenomousFilter === 'all')
    ? data
    : data.filter(item => (item.group || '').toLowerCase().includes(currentVenomousFilter));

  if (!filtered || filtered.length === 0) {
    container.innerHTML = '<div class="tactical-card text-center text-gray-400">Nenhum espécime encontrado nesta categoria.</div>';
    return;
  }

  container.innerHTML = filtered.map(item => {
    const lethality = item.lethality || item.dangerLevel || 'ALTO';
    const dangerBadgeColor = lethality.toLowerCase().includes('muito') || lethality.toLowerCase().includes('crítico') ? 'var(--accent-red)' :
                             lethality.toLowerCase().includes('alta') ? 'var(--accent-amber)' : 'var(--accent-cyan)';
    const firstAidText = Array.isArray(item.firstAid)
      ? item.firstAid.map(s => `<div>• ${s}</div>`).join('')
      : (item.firstAid || '');
    const warningsText = Array.isArray(item.dangerWarnings)
      ? item.dangerWarnings.map(w => `<div>⚠️ ${w}</div>`).join('')
      : '';

    return `
      <div class="tactical-card">
        <div class="flex justify-between items-start gap-2 mb-2">
          <div>
            <div class="text-xs uppercase tracking-wider font-bold text-gray-400">${item.group}</div>
            <h3 class="text-lg font-bold text-white">${item.name}</h3>
          </div>
          <span class="status-pill" style="border-color: ${dangerBadgeColor}; color: ${dangerBadgeColor}; background: rgba(0,0,0,0.4); font-size: 0.7rem; font-weight: 800;">
            ${lethality}
          </span>
        </div>

        <div class="space-y-2 text-xs">
          <div class="metric-card" style="padding: 0.5rem 0.75rem;">
            <div class="text-gray-400 text-xs font-bold uppercase">Ação do Veneno</div>
            <div class="text-amber-300 font-medium mt-0.5">${item.venomType}</div>
          </div>

          <div class="metric-card" style="padding: 0.5rem 0.75rem;">
            <div class="text-gray-400 text-xs font-bold uppercase">Soro Específico (SUS / Butantan / Vital Brazil)</div>
            <div class="text-emerald-400 font-mono font-bold mt-0.5">${item.antivenom || item.antivenomSerum}</div>
          </div>

          <div style="background: rgba(255,255,255,0.03); padding: 0.5rem; border-radius: 6px; border-left: 3px solid var(--accent-cyan);">
            <strong class="text-white">Identificação Visual:</strong>
            <p class="text-gray-300 mt-0.5">${item.characteristics || item.identification}</p>
          </div>

          <div style="background: rgba(255,255,255,0.03); padding: 0.5rem; border-radius: 6px; border-left: 3px solid var(--accent-amber);">
            <strong class="text-white">Habitat &amp; Ocorrência:</strong>
            <p class="text-gray-300 mt-0.5">${item.habitat}${item.incidence ? ` (${item.incidence})` : ''}</p>
          </div>

          <div style="background: rgba(239, 68, 68, 0.1); padding: 0.5rem; border-radius: 6px; border-left: 3px solid var(--accent-red);">
            <strong class="text-red-300">Primeiros Socorros &amp; Conduta:</strong>
            <div class="text-gray-200 mt-0.5 space-y-1">${firstAidText}</div>
            ${warningsText ? `<div class="mt-2 text-red-300 font-bold space-y-1 border-t border-red-900 pt-1">${warningsText}</div>` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// =====================================================================
// 11. CALCULADORA DE ENERGIA SOLAR & BATERIAS 12V
// =====================================================================
window.calculateSolar = function() {
  const radioH = parseFloat(document.getElementById('solar-radio-hours')?.value) || 0;
  const ledH = parseFloat(document.getElementById('solar-led-hours')?.value) || 0;
  const pcH = parseFloat(document.getElementById('solar-pc-hours')?.value) || 0;
  const fridgeH = parseFloat(document.getElementById('solar-fridge-hours')?.value) || 0;
  const phoneH = parseFloat(document.getElementById('solar-phone-hours')?.value) || 0;

  const hsp = parseFloat(document.getElementById('solar-region')?.value) || 4.8;
  const dod = parseFloat(document.getElementById('solar-battery-type')?.value) || 0.5;

  const totalWh = (radioH * 25) + (ledH * 10) + (pcH * 45) + (fridgeH * 40) + (phoneH * 15);
  const totalAh12v = totalWh / 12;

  // Panel sizing: totalWh / (HSP * 0.75 performance ratio)
  const requiredWatts = totalWh > 0 ? Math.ceil(totalWh / (hsp * 0.75)) : 0;
  const panels150w = Math.ceil(requiredWatts / 150) || 1;

  // Battery bank sizing: 1.5 days autonomy / DoD
  const requiredAh = totalWh > 0 ? Math.ceil((totalAh12v * 1.5) / dod) : 0;

  // Charge controller: Panel Watts / 12V * 1.25 safety factor
  const controllerAmps = Math.ceil((requiredWatts / 12) * 1.25);
  const peakWatts = Math.max(300, Math.ceil((25 + 10 + 45 + 120 + 30) * 1.3));

  const elWh = document.getElementById('solar-res-wh');
  const elAh = document.getElementById('solar-res-ah12v');
  const elPanelsW = document.getElementById('solar-res-panels-w');
  const elPanelsQty = document.getElementById('solar-res-panels-qty');
  const elBatteryAh = document.getElementById('solar-res-battery-ah');
  const elBatteryQty = document.getElementById('solar-res-battery-qty');
  const elController = document.getElementById('solar-res-controller');
  const elWire = document.getElementById('solar-res-wire');
  const elInverter = document.getElementById('solar-res-inverter');
  const elFuse = document.getElementById('solar-res-fuse');

  if (elWh) elWh.textContent = `${Math.round(totalWh)} Wh/dia`;
  if (elAh) elAh.textContent = `${totalAh12v.toFixed(1)} Ah/dia em 12V`;
  if (elPanelsW) elPanelsW.textContent = `${requiredWatts} Wp`;
  if (elPanelsQty) elPanelsQty.textContent = `${panels150w}x painel(éis) de 150W (${panels150w * 150}W)`;
  if (elBatteryAh) elBatteryAh.textContent = `${requiredAh} Ah`;
  if (elBatteryQty) {
    const batt100Qty = Math.ceil(requiredAh / 100);
    elBatteryQty.textContent = `Autonomia 1.5 dias (~${batt100Qty}x bat. 100Ah)`;
  }
  if (elController) elController.textContent = `${Math.max(10, controllerAmps)} A`;

  if (elWire) {
    elWire.textContent = controllerAmps > 20 ? '10.0 mm²' : '6.0 mm²';
  }
  if (elInverter) {
    elInverter.textContent = peakWatts > 500 ? '1000W Onda Senoidal Pura' : '600W Onda Senoidal Pura';
  }
  if (elFuse) {
    elFuse.textContent = `${Math.max(40, Math.ceil(controllerAmps * 1.5))}A`;
  }
};

// =====================================================================
// 12. CHECKLIST TÁTICO DE MOCHILA 72H (BUG-OUT BAG - BOB)
// =====================================================================
const BOB_KITS = {
  bob: {
    name: 'Mochila 72h (Evacuação)',
    maxWeight: 12.0,
    categories: [
      {
        category: '💧 Água & Hidratação',
        items: [
          { id: 'b_water1', name: 'Cantil militar com caneco inox 1L cheio', weight: 1.25, checked: true },
          { id: 'b_water2', name: 'Filtro portátil de água de campo (tipo canudo)', weight: 0.12, checked: true },
          { id: 'b_water3', name: 'Pastilhas de cloro Clorin 1mg (blister c/ 20)', weight: 0.02, checked: true },
          { id: 'b_water4', name: 'Bolsa de hidratação dobrável 2L vazia', weight: 0.08, checked: false }
        ]
      },
      {
        category: '🔥 Alimentação & Fogo',
        items: [
          { id: 'b_food1', name: 'Rações de emergência / barras de alta densidade (3 dias)', weight: 1.50, checked: true },
          { id: 'b_food2', name: 'Pederneira de ferrocerium com raspador', weight: 0.08, checked: true },
          { id: 'b_food3', name: '2x Isqueiros tipo maçarico / Bic em saco estanque', weight: 0.06, checked: true },
          { id: 'b_food4', name: 'Iscas de fogo (algodão parafinado)', weight: 0.05, checked: true }
        ]
      },
      {
        category: '⛺ Abrigo & Aquecimento',
        items: [
          { id: 'b_shlt1', name: '2x Mantas térmicas de mylar aluminizadas', weight: 0.12, checked: true },
          { id: 'b_shlt2', name: 'Lona tática ripstop 3x3m para tarp', weight: 0.65, checked: true },
          { id: 'b_shlt3', name: 'Corda Paracord 550 (15 metros)', weight: 0.18, checked: true },
          { id: 'b_shlt4', name: 'Poncho impermeável militar camuflado/verde', weight: 0.35, checked: true },
          { id: 'b_shlt5', name: 'Muda de roupa seca em saco ziploc a vácuo', weight: 0.85, checked: true }
        ]
      },
      {
        category: '🚑 Primeiros Socorros & Farmácia',
        items: [
          { id: 'b_med1', name: 'Torniquete tático homologado (tipo C-A-T)', weight: 0.15, checked: true },
          { id: 'b_med2', name: 'Bandagem elástica tipo israelense 6"', weight: 0.10, checked: true },
          { id: 'b_med3', name: 'Gaze estéril + fita micropore', weight: 0.08, checked: true },
          { id: 'b_med4', name: 'Medicamentos de uso contínuo (reserva 7 dias)', weight: 0.15, checked: true },
          { id: 'b_med5', name: 'Analgésicos (Dipirona), anti-histamínico e antidiarreico', weight: 0.08, checked: true },
          { id: 'b_med6', name: 'Frasco pequeno álcool 70% ou clorexidina', weight: 0.10, checked: true }
        ]
      },
      {
        category: '📻 Comunicação, Navegação & Energia',
        items: [
          { id: 'b_nav1', name: 'Bússola prismática com régua milimétrica', weight: 0.09, checked: true },
          { id: 'b_nav2', name: 'Rádio comunicador VHF/UHF (Baofeng UV-5R)', weight: 0.28, checked: true },
          { id: 'b_nav3', name: 'Powerbank 20.000 mAh c/ cabos USB blindados', weight: 0.42, checked: true },
          { id: 'b_nav4', name: 'Lanterna de cabeça LED c/ pilhas recarregáveis', weight: 0.12, checked: true },
          { id: 'b_nav5', name: 'Apito de resgate sem esfera (120 dB)', weight: 0.02, checked: true }
        ]
      },
      {
        category: '🛠️ Ferramentas & Equipamento',
        items: [
          { id: 'b_tool1', name: 'Faca de sobrevivência lâmina fixa full-tang', weight: 0.35, checked: true },
          { id: 'b_tool2', name: 'Alicate multi-função (Leatherman ou similar)', weight: 0.25, checked: true },
          { id: 'b_tool3', name: 'Rolo de Silver Tape industrial (10m compacto)', weight: 0.12, checked: true },
          { id: 'b_tool4', name: 'Abraçadeiras plásticas (enforca-gato) x10', weight: 0.03, checked: true },
          { id: 'b_tool5', name: 'Luvas de proteção vaqueta / couro de campo', weight: 0.14, checked: true }
        ]
      },
      {
        category: '📄 Documentos & Dinheiro',
        items: [
          { id: 'b_doc1', name: 'Cópia plastificada de RG, CNH, Certidões', weight: 0.05, checked: true },
          { id: 'b_doc2', name: 'Dinheiro em espécie (cédulas de 10, 20 e 50 reais)', weight: 0.05, checked: true },
          { id: 'b_doc3', name: 'Cartão de Bolso Nomad Brasil A4 plastificado', weight: 0.04, checked: true },
          { id: 'b_doc4', name: 'Bloco de notas à prova d\'água e lápis grafite', weight: 0.06, checked: true }
        ]
      }
    ]
  },
  edc: {
    name: 'Kit EDC (Everyday Carry - Bolso & Cinto)',
    maxWeight: 1.5,
    categories: [
      {
        category: '🎒 Porte Diário Essencial',
        items: [
          { id: 'e_edc1', name: 'Canivete dobrável com trava segura', weight: 0.12, checked: true },
          { id: 'e_edc2', name: 'Mini lanterna tática LED (pilha AA ou USB)', weight: 0.08, checked: true },
          { id: 'e_edc3', name: 'Isqueiro compacto', weight: 0.03, checked: true },
          { id: 'e_edc4', name: 'Mini caneta e chaveiro com apito de emergência', weight: 0.04, checked: true },
          { id: 'e_edc5', name: 'Curativos adesivos e 2 comprimidos dipirona', weight: 0.02, checked: true },
          { id: 'e_edc6', name: 'Cédula de reserva em compartimento oculto', weight: 0.01, checked: true },
          { id: 'e_edc7', name: 'Cartão multi-ferramenta em aço para carteira', weight: 0.04, checked: true }
        ]
      }
    ]
  },
  car: {
    name: 'Kit Veicular de Emergência',
    maxWeight: 20.0,
    categories: [
      {
        category: '🚗 Mecânica, Tração & Elétrica',
        items: [
          { id: 'c_car1', name: 'Cabo auxiliar de partida (chupeta de bateria 500A)', weight: 1.80, checked: true },
          { id: 'c_car2', name: 'Compressor de ar 12V para calibração de pneus', weight: 1.40, checked: true },
          { id: 'c_car3', name: 'Kit reparo macarrão antifuro para pneus', weight: 0.30, checked: true },
          { id: 'c_car4', name: 'Cabo de reboque com manilhas de aço (5 toneladas)', weight: 2.10, checked: true },
          { id: 'c_car5', name: 'Jogo de chaves de fenda, philips e soquetes', weight: 1.50, checked: true },
          { id: 'c_car6', name: 'Fusíveis automotivos reservas variados', weight: 0.08, checked: true }
        ]
      },
      {
        category: '🦺 Sinalização & Socorro Rodoviário',
        items: [
          { id: 'c_car7', name: 'Colete refletivo de alta visibilidade', weight: 0.15, checked: true },
          { id: 'c_car8', name: 'Sinalizador LED estroboscópico magnético', weight: 0.25, checked: true },
          { id: 'c_car9', name: 'Extintor ABC inspecionado e válido', weight: 2.00, checked: true },
          { id: 'c_car10', name: 'Galão homologado 5L com água para motor/emergência', weight: 5.30, checked: true },
          { id: 'c_car11', name: 'Pá dobrável de trincheira / desatolamento', weight: 1.10, checked: true }
        ]
      }
    ]
  }
};

let currentBobKit = 'bob';
const BOB_STORAGE_KEY = 'nomad_bob_checked_state_v1';

function getStoredBobChecks() {
  try {
    const raw = localStorage.getItem(BOB_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function saveStoredBobChecks(state) {
  try {
    localStorage.setItem(BOB_STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Erro ao salvar no localStorage:', e);
  }
}

window.switchBobKit = function(kitId) {
  currentBobKit = kitId;
  ['bob', 'edc', 'car'].forEach(id => {
    const btn = document.getElementById(`bob-tab-${id}`);
    if (btn) {
      if (id === kitId) {
        btn.classList.add('chip-highlight');
      } else {
        btn.classList.remove('chip-highlight');
      }
    }
  });
  renderBobKit();
};

window.toggleBobItem = function(itemId) {
  const kit = BOB_KITS[currentBobKit];
  if (!kit) return;
  const stored = getStoredBobChecks() || {};

  for (const cat of kit.categories) {
    for (const it of cat.items) {
      if (it.id === itemId) {
        const currentChecked = (stored[itemId] !== undefined) ? stored[itemId] : it.checked;
        stored[itemId] = !currentChecked;
        saveStoredBobChecks(stored);
        break;
      }
    }
  }
  renderBobKit();
};

window.resetBobKit = function() {
  if (!confirm('Deseja restaurar as seleções padrão deste kit?')) return;
  const kit = BOB_KITS[currentBobKit];
  if (!kit) return;
  const stored = getStoredBobChecks() || {};
  for (const cat of kit.categories) {
    for (const it of cat.items) {
      delete stored[it.id];
    }
  }
  saveStoredBobChecks(stored);
  renderBobKit();
};

function renderBobKit() {
  const container = document.getElementById('bob-items-container');
  if (!container) return;

  const kit = BOB_KITS[currentBobKit];
  if (!kit) return;

  const stored = getStoredBobChecks() || {};

  let totalWeight = 0;
  let totalChecked = 0;
  let totalItemsCount = 0;

  let html = '';

  kit.categories.forEach(cat => {
    let catHtml = `
      <div class="tactical-card">
        <div class="bob-category-header">${cat.category}</div>
        <div class="bob-category-items">
    `;

    cat.items.forEach(it => {
      totalItemsCount++;
      const isChecked = (stored[it.id] !== undefined) ? stored[it.id] : it.checked;
      if (isChecked) {
        totalWeight += it.weight;
        totalChecked++;
      }

      catHtml += `
        <div class="bob-item-row" onclick="toggleBobItem('${it.id}')">
          <input type="checkbox" class="bob-checkbox" ${isChecked ? 'checked' : ''} onclick="event.stopPropagation(); toggleBobItem('${it.id}');">
          <span class="bob-item-name ${isChecked ? '' : 'text-gray-500 line-through'}">${it.name}</span>
          <span class="bob-item-weight font-mono">${it.weight.toFixed(2)} kg</span>
        </div>
      `;
    });

    catHtml += `</div></div>`;
    html += catHtml;
  });

  container.innerHTML = html;

  const weightDisplay = document.getElementById('bob-weight-display');
  const weightBar = document.getElementById('bob-weight-bar');
  const checkedDisplay = document.getElementById('bob-status-checked');
  const warningDisplay = document.getElementById('bob-status-warning');

  if (weightDisplay) {
    weightDisplay.textContent = `${totalWeight.toFixed(2)} kg / Meta máx: ${kit.maxWeight.toFixed(1)} kg`;
  }

  const pct = Math.min(100, Math.round((totalWeight / kit.maxWeight) * 100));
  if (weightBar) {
    weightBar.style.width = `${pct}%`;
    if (totalWeight > kit.maxWeight) {
      weightBar.style.background = 'var(--accent-red)';
    } else if (totalWeight > kit.maxWeight * 0.85) {
      weightBar.style.background = 'var(--accent-amber)';
    } else {
      weightBar.style.background = 'var(--accent-green)';
    }
  }

  if (checkedDisplay) {
    checkedDisplay.textContent = `${totalChecked} de ${totalItemsCount} itens empacotados (${Math.round((totalChecked / (totalItemsCount || 1)) * 100)}%)`;
  }

  if (warningDisplay) {
    if (totalWeight > kit.maxWeight) {
      warningDisplay.textContent = `⚠️ SOBREPESO: Excedeu o limite em ${(totalWeight - kit.maxWeight).toFixed(2)} kg! Elimine peso supérfluo.`;
    } else {
      warningDisplay.textContent = '✅ Peso dentro da margem recomendada de marcha.';
    }
  }
}

// =====================================================================
// 13. BÚSSOLA DIGITAL & ORIENTAÇÃO NATURAL
// =====================================================================
let compassActive = false;

window.enableCompassSensor = function() {
  const statusEl = document.getElementById('compass-sensor-status');

  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    DeviceOrientationEvent.requestPermission()
      .then(permissionState => {
        if (permissionState === 'granted') {
          window.addEventListener('deviceorientation', handleOrientation, true);
          compassActive = true;
          if (statusEl) statusEl.textContent = 'Sensor magnético calibrado e ativo.';
        } else {
          if (statusEl) statusEl.textContent = 'Permissão de sensor negada pelo usuário.';
        }
      })
      .catch(err => {
        if (statusEl) statusEl.textContent = 'Erro de permissão: ' + err.message;
      });
  } else if ('ondeviceorientationabsolute' in window) {
    window.addEventListener('deviceorientationabsolute', handleOrientation, true);
    compassActive = true;
    if (statusEl) statusEl.textContent = 'Sensor magnético absoluto conectado.';
  } else if ('ondeviceorientation' in window) {
    window.addEventListener('deviceorientation', handleOrientation, true);
    compassActive = true;
    if (statusEl) statusEl.textContent = 'Sensor de orientação conectado.';
  } else {
    if (statusEl) statusEl.textContent = 'Dispositivo sem magnetômetro. Use a orientação pelo sol ou estrelas abaixo.';
  }
};

function handleOrientation(event) {
  let heading = null;

  if (event.webkitCompassHeading) {
    heading = event.webkitCompassHeading;
  } else if (event.alpha !== null) {
    heading = (360 - event.alpha) % 360;
  }

  if (heading === null || isNaN(heading)) return;

  const deg = Math.round(heading);
  const needle = document.getElementById('compass-needle');
  const degDisplay = document.getElementById('compass-degrees');

  if (needle) {
    needle.style.transform = `translate(-50%, -100%) rotate(${deg}deg)`;
  }

  if (degDisplay) {
    let cardinal = 'N';
    if (deg >= 337.5 || deg < 22.5) cardinal = 'N';
    else if (deg >= 22.5 && deg < 67.5) cardinal = 'NE';
    else if (deg >= 67.5 && deg < 112.5) cardinal = 'L';
    else if (deg >= 112.5 && deg < 157.5) cardinal = 'SE';
    else if (deg >= 157.5 && deg < 202.5) cardinal = 'S';
    else if (deg >= 202.5 && deg < 247.5) cardinal = 'SO';
    else if (deg >= 247.5 && deg < 292.5) cardinal = 'O';
    else if (deg >= 292.5 && deg < 337.5) cardinal = 'NO';

    degDisplay.textContent = `${String(deg).padStart(3, '0')}° ${cardinal}`;
  }
}

// =====================================================================
// 14. CIFRA TÁTICA & CÓDIGO DE CAMPO (VERNAM / OTP 5-LETTER BLOCKS)
// =====================================================================
window.generateRandomKey = function() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let key = '';
  for (let i = 0; i < 8; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const keyInput = document.getElementById('cipher-key');
  if (keyInput) keyInput.value = key;
};

window.processCipher = function(mode) {
  const inputEl = document.getElementById('cipher-input');
  const keyEl = document.getElementById('cipher-key');
  const outEl = document.getElementById('cipher-output');

  if (!inputEl || !outEl) return;

  const text = (inputEl.value || '').toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const key = ((keyEl ? keyEl.value : '') || 'NOMAD').toUpperCase().replace(/[^A-Z]/g, '');

  if (!key) {
    alert('Insira uma chave secreta com letras de A a Z.');
    return;
  }

  const cleanText = text.replace(/[^A-Z]/g, '');
  if (!cleanText) {
    outEl.textContent = '--- (Nenhum texto alfabético para processar)';
    return;
  }

  let result = '';
  for (let i = 0; i < cleanText.length; i++) {
    const textCode = cleanText.charCodeAt(i) - 65;
    const keyCode = key.charCodeAt(i % key.length) - 65;

    let resCode;
    if (mode === 'encrypt') {
      resCode = (textCode + keyCode) % 26;
    } else {
      resCode = (textCode - keyCode + 26) % 26;
    }
    result += String.fromCharCode(resCode + 65);
  }

  const blocks = [];
  for (let i = 0; i < result.length; i += 5) {
    blocks.push(result.substring(i, i + 5));
  }

  outEl.textContent = blocks.join(' ');
};

window.copyCipherOutput = function() {
  const outEl = document.getElementById('cipher-output');
  if (!outEl) return;
  const text = outEl.textContent.trim();
  if (!text || text.startsWith('---')) return;

  navigator.clipboard.writeText(text).then(() => {
    alert('Mensagem copiada para a área de transferência!');
  }).catch(() => {
    alert('Texto selecionado: ' + text);
  });
};

// =====================================================================
// 15. GUIA DE PANC & FITOTERAPIA DE CAMPO
// =====================================================================
let pancPlantsData = [];
let currentPlantsFilter = 'all';

async function loadPlantsData() {
  if (pancPlantsData && pancPlantsData.length > 0) {
    renderPlantsList(pancPlantsData);
    return;
  }
  try {
    const res = await fetch('/api/plants');
    if (!res.ok) throw new Error('Falha HTTP ' + res.status);
    pancPlantsData = await res.json();
    renderPlantsList(pancPlantsData);
  } catch (err) {
    console.warn('Fallback plantas silvestres:', err);
    try {
      const res2 = await fetch('./data/panc_plants.json');
      pancPlantsData = await res2.json();
      renderPlantsList(pancPlantsData);
    } catch (e2) {
      console.error('Falha ao carregar PANC:', e2);
    }
  }
}

window.filterPlantsGroup = function(grp) {
  currentPlantsFilter = grp;
  const section = document.getElementById('tab-plants');
  if (section) {
    section.querySelectorAll('.chip-btn').forEach(btn => {
      const text = btn.textContent.toLowerCase();
      btn.classList.toggle('chip-highlight',
        (grp === 'all' && text.includes('todas')) ||
        (grp === 'Alimentícia' && text.includes('alimentícias')) ||
        (grp === 'Medicinal' && text.includes('medicinais'))
      );
    });
  }
  renderPlantsList(pancPlantsData);
};

function renderPlantsList(data) {
  const container = document.getElementById('plants-container');
  if (!container) return;

  const filtered = (currentPlantsFilter === 'all')
    ? data
    : data.filter(item => (item.type || '').toLowerCase().includes(currentPlantsFilter.toLowerCase()));

  if (!filtered || filtered.length === 0) {
    container.innerHTML = '<div class="tactical-card text-center text-gray-400">Nenhuma planta encontrada nesta categoria.</div>';
    return;
  }

  container.innerHTML = filtered.map(item => {
    const isMed = (item.type || '').includes('Medicinal');
    const badgeColor = isMed ? 'var(--accent-cyan)' : 'var(--accent-green)';
    return `
      <div class="tactical-card">
        <div class="flex justify-between items-start gap-2 mb-2">
          <div>
            <div class="text-xs uppercase tracking-wider font-bold text-gray-400">${item.type}</div>
            <h3 class="text-lg font-bold text-white">${item.name}</h3>
          </div>
          <span class="status-pill" style="border-color: ${badgeColor}; color: ${badgeColor}; font-size: 0.7rem; font-weight: 800;">
            ${item.proteinContent || 'Comestível'}
          </span>
        </div>

        <div class="space-y-2 text-xs">
          <div style="background: rgba(255,255,255,0.03); padding: 0.5rem; border-radius: 6px; border-left: 3px solid var(--accent-cyan);">
            <strong class="text-white">Identificação Botânica:</strong>
            <p class="text-gray-300 mt-0.5">${item.identification}</p>
          </div>

          <div class="metric-card" style="padding: 0.5rem 0.75rem;">
            <div class="text-gray-400 text-xs font-bold uppercase">Partes Utilizadas &amp; Preparo</div>
            <div class="text-white font-medium mt-0.5"><strong>Partes:</strong> ${item.edibleParts}</div>
            <div class="text-emerald-300 mt-1">${item.preparation}</div>
          </div>

          <div style="background: rgba(255,255,255,0.03); padding: 0.5rem; border-radius: 6px; border-left: 3px solid var(--accent-amber);">
            <strong class="text-white">Habitat &amp; Ocorrência:</strong>
            <p class="text-gray-300 mt-0.5">${item.habitat}</p>
          </div>

          <div style="background: rgba(16, 185, 129, 0.08); padding: 0.5rem; border-radius: 6px; border-left: 3px solid var(--accent-green);">
            <strong class="text-emerald-400">Propriedades Fitoterápicas:</strong>
            <p class="text-gray-200 mt-0.5">${item.medicinal}</p>
          </div>

          <div style="background: rgba(239, 68, 68, 0.1); padding: 0.5rem; border-radius: 6px; border-left: 3px solid var(--accent-red);">
            <strong class="text-red-300">Cuidados &amp; Toxicologia:</strong>
            <p class="text-gray-200 mt-0.5">${item.warnings}</p>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// =====================================================================
// 16. MANUAL TÁTICO DE NÓS & AMARRAÇÕES
// =====================================================================
const TACTICAL_KNOTS = [
  {
    id: 'bowline',
    name: 'Lais de Guia (Bowline)',
    category: 'ancoragem',
    strength: '70% a 75% da carga',
    desc: 'O rei dos nós. Cria uma alça fixa e segura que jamais corre, aperta ou escorrega sob peso extremo, e se desata com facilidade mesmo após tracionar uma tonelada.',
    usage: 'Ancoragem em árvores, resgate e içamento de pessoas ou cargas pesadas.',
    steps: [
      'Faça uma volta (laço) simples na corda principal, mantendo a ponta livre virada para cima.',
      'A ponta livre (o coelho) sai da toca (passa por dentro do laço por baixo).',
      'Contorna a corda fixa principal (a árvore) por trás.',
      'Volta e entra novamente na toca (no laço) de cima para baixo.',
      'Puxe a corda principal e a alça formada para azelhar e travar o nó.'
    ],
    proTip: 'Dica Tática: Para segurança de vida em rapel ou tirolesa, deixe uma cauda de sobra de pelo menos 15 cm e arremate com nó de frade (nó simples).'
  },
  {
    id: 'truckers',
    name: 'Nó de Caminhoneiro (Trucker\'s Hitch)',
    category: 'tensao',
    strength: 'Multiplicador mecânico 3:1',
    desc: 'Cria um sistema de polia usando a própria corda, multiplicando sua força manual por 3 para tensionar amarrações no limite.',
    usage: 'Esticar lonas de abrigo contra vento forte, prender tambores e cargas no teto do veículo.',
    steps: [
      'Faça uma volta com alça (nó de correr ou volta do polegar) no meio da corda.',
      'Passe a ponta livre por baixo do gancho, argola ou tronco de ancoragem.',
      'Suba a ponta livre e passe-a por dentro da alça que você criou (polia).',
      'Puxe com força para baixo: note o efeito de roldana tracionando 3 vezes mais forte.',
      'Arremate com duas meias-voltas na corda sob tensão para travar.'
    ],
    proTip: 'Dica Tática: É o nó indispensável para o tarp (lona) nunca afrouxar durante chuva torrencial ou vendaval.'
  },
  {
    id: 'prussik',
    name: 'Nó Prussik (Autobloqueante)',
    category: 'ancoragem',
    strength: 'Atrito dinâmico blocante',
    desc: 'Nó friccional que desliza livremente pela corda guia quando empurrado pela mão, mas trava instantaneamente com força total sob qualquer tração ou peso.',
    usage: 'Ascensão em corda fixa, linha de vida em declives acentuados, esticar cumeeira de barraca.',
    steps: [
      'Use um cordelete mais fino (ex: 5mm ou 6mm) em volta de uma corda mais grossa (10mm a 12mm).',
      'Passe a alça do cordelete ao redor da corda principal.',
      'Enfie as duas pontas por dentro da alça 3 vezes completas (3 voltas internas).',
      'Ajuste as espiras para ficarem paralelas e bem organizadas sem encavalar.',
      'Teste puxando o laço: ele morde e trava a corda imediatamente.'
    ],
    proTip: 'Dica Tática: O cordelete do Prussik deve ter entre 60% e 75% do diâmetro da corda principal para morder adequadamente.'
  },
  {
    id: 'clove_hitch',
    name: 'Volta do Fiel (Clove Hitch)',
    category: 'ancoragem',
    strength: '60% a 65% da carga',
    desc: 'Amarração rápida e extremamente estável para fixar uma corda em postes, mourões, estacas ou troncos de madeira.',
    usage: 'Iniciar amarrações de abrigo, prender animais de carga ou fixar botes em estacas.',
    steps: [
      'Dê uma volta completa ao redor do poste.',
      'Cruze a corda sobre a primeira volta formando um "X".',
      'Dê mais uma volta pelo poste e passe a ponta livre por baixo do cruzamento do X.',
      'Puxe ambas as extremidades para arrochar o nó contra a madeira.'
    ],
    proTip: 'Dica Tática: Sob tração variável ou corda muito lisa, arremate a ponta solta com um nó de segurança para evitar deslizamento.'
  },
  {
    id: 'figure8_loop',
    name: 'Nó de Oito Duplo (Figure-Eight Loop)',
    category: 'ancoragem',
    strength: '75% a 80% da carga (Padrão UIAA)',
    desc: 'O nó mais seguro e confiável do mundo para ancoragem humana. Reduz menos a resistência da corda que qualquer outro nó de alça.',
    usage: 'Resgate em ribanceiras, ancoragem de maca, conexão em mosquetões de escalada e rapel.',
    steps: [
      'Dobre a corda ao meio para formar um seio (alça dupla).',
      'Dê uma volta completa sobre a corda principal.',
      'Passe a alça por trás e entre por dentro da primeira volta formando um formato de 8.',
      'Penteie as cordas para que fiquem alinhadas sem torção e ajuste com firmeza.'
    ],
    proTip: 'Dica Tática: Inspecione visualmente o formato de "8" simétrico antes de aplicar qualquer carga viva.'
  },
  {
    id: 'fisherman',
    name: 'Nó Pescador Duplo (Double Fisherman\'s)',
    category: 'uniao',
    strength: 'Aproximadamente 80% da carga',
    desc: 'A melhor emenda para unir duas cordas do mesmo diâmetro. Não desata nem desliza mesmo sob as condições mais severas.',
    usage: 'Emendar cordas curtas para formar uma longa, fechar anéis de cordelete para Prussik.',
    steps: [
      'Coloque as pontas das duas cordas paralelas em direções opostas.',
      'Com a ponta da primeira corda, dê duas voltas completas ao redor de ambas as cordas.',
      'Passe a ponta por dentro das duas voltas recém-criadas e aperte (primeiro nó de frade duplo).',
      'Repita o mesmo procedimento com a outra ponta livre do outro lado.',
      'Puxe as duas cordas principais: os dois nós deslizarão até se encostarem e travarem solidamente.'
    ],
    proTip: 'Dica Tática: Uma vez submetido a peso extremo, é quase impossível desatar; use quando desejar união permanente e de alta segurança.'
  }
];

let currentKnotsFilter = 'all';

window.filterKnots = function(cat) {
  currentKnotsFilter = cat;
  const section = document.getElementById('tab-knots');
  if (section) {
    section.querySelectorAll('.chip-btn').forEach(btn => {
      const text = btn.textContent.toLowerCase();
      btn.classList.toggle('chip-highlight',
        (cat === 'all' && text.includes('todos')) ||
        (cat === 'ancoragem' && text.includes('ancoragem')) ||
        (cat === 'tensao' && text.includes('tensionamento')) ||
        (cat === 'uniao' && text.includes('união'))
      );
    });
  }
  renderKnotsList();
};

function renderKnotsList() {
  const container = document.getElementById('knots-container');
  if (!container) return;

  const filtered = (currentKnotsFilter === 'all')
    ? TACTICAL_KNOTS
    : TACTICAL_KNOTS.filter(k => k.category === currentKnotsFilter);

  container.innerHTML = filtered.map(k => `
    <div class="tactical-card">
      <div class="flex justify-between items-start gap-2 mb-2">
        <div>
          <div class="text-xs uppercase tracking-wider font-bold text-gray-400">Categoria: ${k.category.toUpperCase()}</div>
          <h3 class="text-lg font-bold text-white">${k.name}</h3>
        </div>
        <span class="status-pill" style="border-color: var(--accent-cyan); color: var(--accent-cyan); font-size: 0.7rem; font-weight: 800;">
          ${k.strength}
        </span>
      </div>

      <p class="text-xs text-gray-300 mb-2">${k.desc}</p>

      <div class="metric-card mb-2" style="padding: 0.5rem 0.75rem;">
        <span class="text-xs text-gray-400 font-bold uppercase">Aplicação Tática Principal:</span>
        <div class="text-amber-300 text-xs font-medium mt-0.5">${k.usage}</div>
      </div>

      <div class="space-y-1.5 text-xs mb-2">
        <strong class="text-white text-xs">Instruções Passo a Passo:</strong>
        ${k.steps.map((st, idx) => `
          <div class="flex items-start gap-2">
            <span class="step-number-badge">${idx + 1}</span>
            <span class="text-gray-300">${st}</span>
          </div>
        `).join('')}
      </div>

      <div style="background: rgba(16, 185, 129, 0.08); padding: 0.5rem; border-radius: 6px; border-left: 3px solid var(--accent-green);" class="text-xs text-emerald-300">
        ${k.proTip}
      </div>
    </div>
  `).join('');
}

// =====================================================================
// 17. PLANO DE EMERGÊNCIA FAMILIAR (PEF)
// =====================================================================
const PEF_STORAGE_KEY = 'nomad_pef_data_v1';

window.savePefData = function() {
  const data = {
    point1: document.getElementById('pef-point1')?.value || '',
    point2: document.getElementById('pef-point2')?.value || '',
    contactName: document.getElementById('pef-contact-name')?.value || '',
    contactCity: document.getElementById('pef-contact-city')?.value || '',
    contactPhone: document.getElementById('pef-contact-phone')?.value || '',
    chkGas: document.getElementById('pef_chk_gas')?.checked || false,
    chkElec: document.getElementById('pef_chk_elec')?.checked || false,
    chkWater: document.getElementById('pef_chk_water')?.checked || false,
    chkPets: document.getElementById('pef_chk_pets')?.checked || false,
    chkDocs: document.getElementById('pef_chk_docs')?.checked || false,
    chkBob: document.getElementById('pef_chk_bob')?.checked || false,
    chkSms: document.getElementById('pef_chk_sms')?.checked || false
  };

  try {
    localStorage.setItem(PEF_STORAGE_KEY, JSON.stringify(data));
  } catch (e) {}

  updatePefSummary(data);
};

window.loadPefData = function() {
  let data = null;
  try {
    const raw = localStorage.getItem(PEF_STORAGE_KEY);
    if (raw) data = JSON.parse(raw);
  } catch (e) {}

  if (!data) return;

  const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  const setChk = (id, val) => { const el = document.getElementById(id); if (el) el.checked = !!val; };

  setVal('pef-point1', data.point1);
  setVal('pef-point2', data.point2);
  setVal('pef-contact-name', data.contactName);
  setVal('pef-contact-city', data.contactCity);
  setVal('pef-contact-phone', data.contactPhone);

  setChk('pef_chk_gas', data.chkGas);
  setChk('pef_chk_elec', data.chkElec);
  setChk('pef_chk_water', data.chkWater);
  setChk('pef_chk_pets', data.chkPets);
  setChk('pef_chk_docs', data.chkDocs);
  setChk('pef_chk_bob', data.chkBob);
  setChk('pef_chk_sms', data.chkSms);

  updatePefSummary(data);
};

window.resetPefForm = function() {
  if (!confirm('Deseja limpar todos os dados do Plano Familiar?')) return;
  try { localStorage.removeItem(PEF_STORAGE_KEY); } catch (e) {}
  document.querySelectorAll('#tab-pef input[type="text"]').forEach(i => i.value = '');
  document.querySelectorAll('#tab-pef input[type="checkbox"]').forEach(c => c.checked = false);
  updatePefSummary({});
};

function updatePefSummary(data) {
  const summaryEl = document.getElementById('pef-status-summary');
  if (!summaryEl) return;

  const filledPoints = (data.point1 ? 1 : 0) + (data.point2 ? 1 : 0);
  const hasContact = !!(data.contactName && data.contactPhone);

  if (filledPoints === 2 && hasContact) {
    summaryEl.textContent = '✅ Plano Familiar completo e sincronizado na memória offline.';
    summaryEl.style.color = 'var(--accent-green)';
  } else {
    summaryEl.textContent = `⚠️ Plano incompleto (${filledPoints}/2 pontos de encontro, ${hasContact ? 'Contato OK' : 'Falta Contato Fora da Área'}).`;
    summaryEl.style.color = 'var(--accent-amber)';
  }
}

// =====================================================================
// 18. CRONÔMETRO DE DISTÂNCIA DE RELÂMPAGO
// =====================================================================
let stormStartTime = null;
let stormInterval = null;

window.startLightningTimer = function() {
  stormStartTime = Date.now();
  const btnFlash = document.getElementById('btn-storm-flash');
  const btnThunder = document.getElementById('btn-storm-thunder');
  const distEl = document.getElementById('storm-dist-display');
  const secEl = document.getElementById('storm-seconds-display');
  const badgeEl = document.getElementById('storm-danger-badge');

  if (btnFlash) btnFlash.disabled = true;
  if (btnThunder) btnThunder.disabled = false;
  if (badgeEl) {
    badgeEl.textContent = '⏱️ Contando tempo até o trovão... Fique atento ao som!';
    badgeEl.style.color = 'var(--accent-amber)';
  }

  clearInterval(stormInterval);
  stormInterval = setInterval(() => {
    const elapsedSec = (Date.now() - stormStartTime) / 1000;
    const distanceKm = elapsedSec * 0.340;
    if (secEl) secEl.textContent = `${elapsedSec.toFixed(1)} segundos decorridos`;
    if (distEl) distEl.textContent = `${distanceKm.toFixed(2)} km`;
  }, 100);
};

window.stopLightningTimer = function() {
  if (!stormStartTime) return;
  clearInterval(stormInterval);

  const elapsedSec = (Date.now() - stormStartTime) / 1000;
  const distanceKm = elapsedSec * 0.340;

  const btnFlash = document.getElementById('btn-storm-flash');
  const btnThunder = document.getElementById('btn-storm-thunder');
  const distEl = document.getElementById('storm-dist-display');
  const secEl = document.getElementById('storm-seconds-display');
  const badgeEl = document.getElementById('storm-danger-badge');

  if (btnFlash) btnFlash.disabled = false;
  if (btnThunder) btnThunder.disabled = true;

  if (secEl) secEl.textContent = `Tempo final: ${elapsedSec.toFixed(2)} segundos`;
  if (distEl) distEl.textContent = `${distanceKm.toFixed(2)} km`;

  if (badgeEl) {
    if (distanceKm <= 3.0) {
      badgeEl.textContent = '🚨 PERIGO IMINENTE: Raio a menos de 3 km! Abrigo imediato obrigatório!';
      badgeEl.style.color = 'var(--accent-red)';
    } else if (distanceKm <= 10.0) {
      badgeEl.textContent = '⚠️ ZONA DE RISCO (Regra 30s): Tempestade a menos de 10 km! Não fique em áreas abertas.';
      badgeEl.style.color = 'var(--accent-amber)';
    } else {
      badgeEl.textContent = '✅ Distância segura (> 10 km). Monitore se o próximo raio estará mais próximo.';
      badgeEl.style.color = 'var(--accent-green)';
    }
  }

  stormStartTime = null;
};

// =====================================================================
// 19. EXPORTADOR DO PACOTE PORTÁTIL AUTOCONTIDO
// =====================================================================
window.exportPortableHtmlPackage = async function() {
  const msgEl = document.getElementById('export-status-message');
  if (msgEl) msgEl.textContent = 'Compilando banco de dados offline e manuais em arquivo único...';

  try {
    const [emergRes, venomRes, plantsRes, radioRes] = await Promise.all([
      fetch('/api/emergencies').then(r => r.json()).catch(() => []),
      fetch('/api/venomous').then(r => r.json()).catch(() => []),
      fetch('/api/plants').then(r => r.json()).catch(() => []),
      fetch('/api/radio').then(r => r.json()).catch(() => null)
    ]);

    const pefRaw = localStorage.getItem(PEF_STORAGE_KEY) || '{}';
    const pef = JSON.parse(pefRaw);

    const fullHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NOMAD BRASIL — Central Portátil de Campo 100% Offline</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #090d10; color: #f1f5f9; padding: 20px; line-height: 1.5; }
    h1, h2, h3 { color: #fff; border-bottom: 2px solid #10b981; padding-bottom: 6px; }
    .card { background: #131920; border: 1px solid #1e293b; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; background: #10b981; color: #04130d; }
    .alert { background: rgba(239, 68, 68, 0.15); border-left: 4px solid #ef4444; color: #fca5a5; padding: 10px; margin: 10px 0; border-radius: 4px; }
    .mono { font-family: monospace; color: #34d399; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 13px; }
    th, td { border: 1px solid #334155; padding: 8px; text-align: left; }
    th { background: #1e293b; color: #38bdf8; }
    @media print { body { background: #fff; color: #000; } .card { border-color: #999; } }
  </style>
</head>
<body>
  <h1>🧭 NOMAD BRASIL — Ficha Tática Portátil de Sobrevivência</h1>
  <p><em>Arquivo autocontido gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}. Funciona 100% offline em qualquer dispositivo sem servidor.</em></p>

  <div class="card">
    <h2>👨‍👩‍👧‍👦 Plano de Emergência Familiar Cadastrado</h2>
    <div><strong>Ponto de Encontro 1 (Bairro):</strong> ${pef.point1 || 'Não cadastrado'}</div>
    <div><strong>Ponto de Encontro 2 (Regional):</strong> ${pef.point2 || 'Não cadastrado'}</div>
    <div><strong>Contato Fora da Área:</strong> ${pef.contactName || '--'} (${pef.contactCity || '--'}) &bull; Tel: <span class="mono">${pef.contactPhone || '--'}</span></div>
  </div>

  <div class="card">
    <h2>📻 Rádio de Emergência &amp; Frequências do Brasil</h2>
    <table>
      <tr><th>Serviço</th><th>Canal / Frequência</th><th>Uso</th></tr>
      <tr><td>PX (Faixa do Cidadão)</td><td>Canal 9 (27.065 MHz)</td><td>Emergência Rodoviária Nacional</td></tr>
      <tr><td>PX Caminhoneiros</td><td>Canal 19 (27.185 MHz)</td><td>Situação de Rodovias e Bloqueios</td></tr>
      <tr><td>VHF Marítimo</td><td>Canal 16 (156.800 MHz)</td><td>Socorro e Chamada Náutica</td></tr>
      <tr><td>VHF Radioamador</td><td>146.520 MHz Simplex</td><td>Chamada Geral de Campo</td></tr>
      <tr><td>HF Defesa Civil / RENER</td><td>7.060 MHz LSB (40 metros)</td><td>Rede Nacional de Emergência</td></tr>
    </table>
    <div style="margin-top: 10px;"><strong>SOS MORSE:</strong> <span class="mono">... --- ...</span> (3 curtos, 3 longos, 3 curtos)</div>
  </div>

  <div class="card">
    <h2>🐍 Animais Peçonhentos &amp; Soros Antiveneno</h2>
    ${venomRes.map(v => `
      <div style="margin-bottom: 12px; border-bottom: 1px solid #1e293b; padding-bottom: 8px;">
        <strong style="color:#38bdf8; font-size:15px;">${v.name}</strong> &bull; <span class="badge">${v.lethality || 'ALTO'}</span><br>
        <div><strong>Ação do Veneno:</strong> ${v.venomType}</div>
        <div><strong>Soro SUS / Butantan:</strong> <span class="mono">${v.antivenom || v.antivenomSerum}</span></div>
        <div><strong>Conduta:</strong> ${Array.isArray(v.firstAid) ? v.firstAid.join('; ') : v.firstAid}</div>
      </div>
    `).join('')}
  </div>

  <div class="card">
    <h2>🌾 Plantas Silvestres Alimentícias (PANC) &amp; Medicinais</h2>
    ${plantsRes.map(p => `
      <div style="margin-bottom: 10px; border-bottom: 1px solid #1e293b; padding-bottom: 6px;">
        <strong style="color:#34d399;">${p.name}</strong> (${p.type})<br>
        <div><strong>Preparo:</strong> ${p.preparation}</div>
        <div><strong>Propriedades:</strong> ${p.medicinal}</div>
      </div>
    `).join('')}
  </div>

  <div class="card">
    <h2>🚑 Primeiros Socorros Imediatos (Resumo Vital)</h2>
    <div class="alert"><strong>HEMORRAGIAS GRAVES:</strong> Pressão direta estéril imediata. Se em membros e sem estancar, aplique torniquete tático 5cm acima da lesão e anote o horário exato.</div>
    <div class="alert"><strong>ENGASGO (HEIMLICH):</strong> Abraçar a vítima por trás, punho cerrado entre umbigo e boca do estômago, compressão vigorosa em formato de "J" para dentro e para cima.</div>
    <div class="alert"><strong>PARADA CARDIORRESPIRATÓRIA:</strong> 100 a 120 compressões/minuto no centro do tórax (profundidade de 5 a 6 cm).</div>
  </div>

  <footer>
    <p>NOMAD Brasil &bull; Projeto de Código Aberto &bull; Mantenha cópias impressas ou salvas na memória de seus aparelhos de campo.</p>
  </footer>
</body>
</html>`;

    const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nomad-brasil-pacote-offline-${new Date().toISOString().split('T')[0]}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    if (msgEl) {
      msgEl.textContent = '✅ Download concluído com sucesso! Guarde este arquivo em seu celular ou pendrive.';
      msgEl.style.color = 'var(--accent-green)';
    }
  } catch (err) {
    console.error('Erro na exportação:', err);
    if (msgEl) msgEl.textContent = 'Erro ao compilar pacote: ' + err.message;
  }
};

// =====================================================================
// 20. CALCULADORA DE MARCHA (REGRA DE NAISMITH) & GEODÉSICA
// =====================================================================
window.calculateMarch = function() {
  const distKm = parseFloat(document.getElementById('march-dist-km')?.value) || 0;
  const elevM = parseFloat(document.getElementById('march-elev-m')?.value) || 0;
  const loadFactor = parseFloat(document.getElementById('march-load-type')?.value) || 1.2;

  const flatTimeMin = (distKm / 5) * 60;
  const climbTimeMin = (elevM / 300) * 30;
  const rawTotalMin = (flatTimeMin + climbTimeMin) * loadFactor;

  const restHours = Math.floor(rawTotalMin / 60);
  const totalMin = Math.round(rawTotalMin + (restHours * 5));

  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;

  const waterLiters = ((totalMin / 60) * 0.65).toFixed(1);

  const timeEl = document.getElementById('march-res-time');
  const waterEl = document.getElementById('march-res-water');
  const tipEl = document.getElementById('march-daylight-tip');

  if (timeEl) timeEl.textContent = `${hours}h ${String(mins).padStart(2, '0')}m`;
  if (waterEl) waterEl.textContent = `${waterLiters} Litros`;

  if (tipEl) {
    if (hours >= 8) {
      tipEl.textContent = `⚠️ ATENÇÃO: Jornada longa (${hours}h)! Divida a marcha em 2 dias ou parta às 05:00 para não marchar no escuro.`;
      tipEl.style.color = 'var(--accent-red)';
    } else if (hours >= 5) {
      tipEl.textContent = `⏱️ Marcha moderada (${hours}h). Programe saída antes das 07:00 e preveja parada para almoço.`;
      tipEl.style.color = 'var(--accent-amber)';
    } else {
      tipEl.textContent = `✅ Jornada confortável (${hours}h). Mantenha ritmo constante de 60-68 passos duplos/100m.`;
      tipEl.style.color = 'var(--accent-green)';
    }
  }
};

window.convertGeodeticCoords = function() {
  const input = document.getElementById('geo-conv-in')?.value || '';
  const outEl = document.getElementById('geo-conv-out');
  if (!outEl) return;

  const parts = input.split(',').map(s => parseFloat(s.trim()));
  if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) {
    outEl.textContent = 'Formato inválido. Use: latitude, longitude (ex: -23.5505, -46.6333)';
    outEl.style.color = 'var(--accent-red)';
    return;
  }

  const [lat, lng] = parts;

  function toDms(val, posChar, negChar) {
    const dir = val >= 0 ? posChar : negChar;
    const abs = Math.abs(val);
    const deg = Math.floor(abs);
    const minFloat = (abs - deg) * 60;
    const min = Math.floor(minFloat);
    const sec = ((minFloat - min) * 60).toFixed(1);
    return `${deg}°${String(min).padStart(2, '0')}'${String(sec).padStart(4, '0')}"${dir}`;
  }

  const dmsLat = toDms(lat, 'N', 'S');
  const dmsLng = toDms(lng, 'E', 'W');

  outEl.textContent = `DMS: ${dmsLat} ${dmsLng} • Decimais: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  outEl.style.color = 'var(--accent-green)';
};

// =====================================================================
// 21. CALCULADORA DE SORO CASEIRO OMS
// =====================================================================
window.calculateSoroDose = function() {
  const weight = parseFloat(document.getElementById('soro-weight-input')?.value) || 70;
  const attackMl = weight * 50;
  const attackL = (attackMl / 1000).toFixed(1);
  const cupMl = Math.min(300, Math.max(100, Math.round(weight * 3)));

  const doseEl = document.getElementById('soro-res-dose');
  const cupEl = document.getElementById('soro-res-cup');
  if (doseEl) doseEl.textContent = `${attackL} L`;
  if (cupEl) cupEl.textContent = `${cupMl} ml`;
};

// =====================================================================
// 22. CALCULADORA DE DILUIÇÃO DE HIPOCLORITO (ÁGUA SANITÁRIA)
// =====================================================================
window.calculateBleachDilution = function() {
  const usage = document.getElementById('bleach-usage-type')?.value || 'water_clean';
  const liters = parseFloat(document.getElementById('bleach-volume-liters')?.value) || 10;
  const qtyEl = document.getElementById('bleach-res-qty');
  const instEl = document.getElementById('bleach-res-instructions');
  if (!qtyEl || !instEl) return;

  if (usage === 'water_clean') {
    const drops = liters * 2;
    const ml = (drops / 20).toFixed(1);
    qtyEl.textContent = `${drops} gotas (~${ml} ml)`;
    instEl.textContent = 'Adicione na água limpa, misture bem e aguarde 30 minutos em recipiente tampado.';
  } else if (usage === 'water_turbid') {
    const drops = liters * 4;
    const ml = (drops / 20).toFixed(1);
    qtyEl.textContent = `${drops} gotas (~${ml} ml)`;
    instEl.textContent = 'Filtre previamente em pano limpo. Deixe agir por 45 minutos antes do consumo.';
  } else if (usage === 'veggies') {
    const ml = Math.round(liters * 15);
    const spoons = (ml / 15).toFixed(0);
    qtyEl.textContent = `${ml} ml (~${spoons} colheres de sopa)`;
    instEl.textContent = 'Mergulhe hortaliças e frutas por 15 minutos e enxágue em água potável filtrada.';
  } else if (usage === 'surfaces') {
    const ml = Math.round(liters * 200);
    const cups = (ml / 200).toFixed(1);
    qtyEl.textContent = `${ml} ml (~${cups} copos americanos)`;
    instEl.textContent = 'Solução hospitalar 0.5%: Use para pisos, solados e maçanetas com luvas. Ação em 10 min.';
  }
};

// =====================================================================
// 23. CALCULADORA DE AUTONOMIA DE BANCO DE BATERIAS
// =====================================================================
window.calculateBatteryAutonomy = function() {
  const volts = parseFloat(document.getElementById('batt-volts-input')?.value) || 12.0;
  const ah = parseFloat(document.getElementById('batt-ah-input')?.value) || 7.0;
  const watts = parseFloat(document.getElementById('batt-watts-input')?.value) || 5.0;

  const totalWh = volts * ah;
  const usableWh = totalWh * 0.85;
  const hours = (usableWh / watts).toFixed(1);

  const whEl = document.getElementById('batt-res-wh');
  const hoursEl = document.getElementById('batt-res-hours');
  if (whEl) whEl.textContent = `${totalWh.toFixed(1)} Wh`;
  if (hoursEl) hoursEl.textContent = `${hours} horas`;
};

// =====================================================================
// 24. PROTOCOLO PACE (LOCALSTORAGE)
// =====================================================================
window.savePacePlan = function() {
  const plan = {
    p: document.getElementById('pace-in-p')?.value || '',
    a: document.getElementById('pace-in-a')?.value || '',
    c: document.getElementById('pace-in-c')?.value || '',
    e: document.getElementById('pace-in-e')?.value || ''
  };
  try {
    localStorage.setItem('nomad_pace_plan_v1', JSON.stringify(plan));
  } catch (err) {}
};

window.loadPacePlan = function() {
  try {
    const raw = localStorage.getItem('nomad_pace_plan_v1');
    if (!raw) return;
    const plan = JSON.parse(raw);
    if (plan.p && document.getElementById('pace-in-p')) document.getElementById('pace-in-p').value = plan.p;
    if (plan.a && document.getElementById('pace-in-a')) document.getElementById('pace-in-a').value = plan.a;
    if (plan.c && document.getElementById('pace-in-c')) document.getElementById('pace-in-c').value = plan.c;
    if (plan.e && document.getElementById('pace-in-e')) document.getElementById('pace-in-e').value = plan.e;
  } catch (err) {}
};

window.resetPacePlan = function() {
  try { localStorage.removeItem('nomad_pace_plan_v1'); } catch (e) {}
  if (document.getElementById('pace-in-p')) document.getElementById('pace-in-p').value = 'VHF 146.520 MHz Simplex / Canal 1 Baofeng';
  if (document.getElementById('pace-in-a')) document.getElementById('pace-in-a').value = 'PX Canal 9 (27.065 MHz) / Rádio Caminhoneiro Ch 19';
  if (document.getElementById('pace-in-c')) document.getElementById('pace-in-c').value = 'HF 7.060 MHz LSB (RENER) / Bilhete escrito em ponto de apoio';
  if (document.getElementById('pace-in-e')) document.getElementById('pace-in-e').value = '3 silvos de apito a cada 15 min / Espelho Heliógrafo às 12h';
};

// =====================================================================
// 25. ORTOPEDIA AUSTERA & MANEJO DE FRATURAS/PMS
// =====================================================================
window.calculateOrthopedics = function() {
  const type = document.getElementById('ortho-injury-select')?.value || 'femur';
  const techEl = document.getElementById('ortho-res-tech');
  const descEl = document.getElementById('ortho-res-desc');
  const pmsEl = document.getElementById('ortho-res-pms');
  if (!techEl || !descEl || !pmsEl) return;

  if (type === 'femur') {
    techEl.textContent = 'Tração Femoral com Molinete (Estilo Hare/Sager)';
    descEl.textContent = 'Requer aplicação de tração axial contínua para sobrepor o espasmo do quadríceps, realinhar as bordas ósseas e prevenir choque hipovolêmico por laceração da artéria femoral profunda.';
    pmsEl.innerHTML = '<strong>Checagem PMS Obrigatória:</strong> Palpar pulso pedioso dorsal e tibial posterior antes e após tracionar. Tempo de enchimento capilar &lt; 2s.';
  } else if (type === 'shoulder') {
    techEl.textContent = 'Método Atraumático de Cunningham ou Milch';
    descEl.textContent = 'Sente o paciente ereto. Realize massagem suave no trapézio superior, deltoide e bíceps até relaxamento muscular completo. A cabeça do úmero desliza suavemente para a fossa glenoide sem puxões violentos.';
    pmsEl.innerHTML = '<strong>Checagem PMS Obrigatória:</strong> Avaliar sensibilidade na face lateral do deltoide (nervo axilar) e pulso radial antes e após a redução. Imobilizar em tipoia de Velpeau.';
  } else if (type === 'tibia') {
    techEl.textContent = 'Tala Rígida Moldada em "U" + Tala Posterior';
    descEl.textContent = 'Alinhe a perna aplicando tração manual suave no calcanhar. Imobilize desde o joelho até além do tornozelo em 90 graus com papelão reforçado ou galhos acolchoados.';
    pmsEl.innerHTML = '<strong>Checagem PMS Obrigatória:</strong> Verifique se a tala não comprime a cabeça da fíbula (risco de lesão do nervo fibular comum / pé caído).';
  } else if (type === 'patella') {
    techEl.textContent = 'Extensão Passiva e Medialização Suave';
    descEl.textContent = 'Estenda lentamente a perna e flexione levemente o quadril para relaxar o tendão patelar. Com a ponta dos dedos, empurre suavemente a patela em direção medial até o encaixe anatômico.';
    pmsEl.innerHTML = '<strong>Checagem PMS Obrigatória:</strong> Manter a perna estendida com tala posterior rígida por 2 a 3 semanas. Verificar circulação distal.';
  }
};

// =====================================================================
// 26. APICULTURA NATIVA & ATRATIVO DE ABELHAS ASF
// =====================================================================
window.calculateAsfBait = function() {
  const ml = parseFloat(document.getElementById('asf-alcohol-input')?.value) || 500;
  const sp = document.getElementById('asf-target-species')?.value || 'jatai';
  
  let propolisG = Math.round(ml * 0.25);
  let bottles = Math.round(ml / 20);
  let timeStr = '30 a 45 dias no escuro';

  if (sp === 'mandacaia') {
    propolisG = Math.round(ml * 0.30);
    timeStr = '40 a 60 dias (resina densa com geoprópolis)';
  } else if (sp === 'urucu') {
    propolisG = Math.round(ml * 0.35);
    timeStr = '45 dias no escuro';
  }

  const pEl = document.getElementById('asf-res-propolis');
  const bEl = document.getElementById('asf-res-bottles');
  const tEl = document.getElementById('asf-res-time');

  if (pEl) pEl.textContent = `${propolisG} g de própolis bruto`;
  if (bEl) bEl.textContent = `~${bottles} garrafas PET 2L`;
  if (tEl) tEl.textContent = timeStr;
};

// =====================================================================
// 27. AQUAPONIA & PISCICULTURA EM IBC 1000L
// =====================================================================
window.calculateAquaponics = function() {
  const liters = parseFloat(document.getElementById('aqua-tank-input')?.value) || 1000;
  const fish = document.getElementById('aqua-fish-select')?.value || 'tilapia';

  let density = '';
  let biomass = '';
  let filterL = Math.round(liters * 0.30);
  let bedM2 = (liters * 0.0025).toFixed(1);
  let pumpFlow = `${Math.round(liters * 1.2)} a ${Math.round(liters * 1.5)} L/h`;

  if (fish === 'tilapia') {
    const minFish = Math.round((liters / 1000) * 50);
    const maxFish = Math.round((liters / 1000) * 65);
    density = `${minFish} a ${maxFish} alevinos`;
    biomass = `~${Math.round(maxFish * 0.55)} kg de tilápia adulta`;
  } else if (fish === 'lambari') {
    const minFish = Math.round((liters / 1000) * 150);
    const maxFish = Math.round((liters / 1000) * 220);
    density = `${minFish} a ${maxFish} lambaris`;
    biomass = `~${Math.round(maxFish * 0.04)} kg de lambari`;
  } else {
    const minFish = Math.round((liters / 1000) * 20);
    const maxFish = Math.round((liters / 1000) * 30);
    density = `${minFish} a ${maxFish} carpas`;
    biomass = `~${Math.round(maxFish * 0.8)} kg de peixe vivo`;
  }

  const dEl = document.getElementById('aqua-res-density');
  const bEl = document.getElementById('aqua-res-biomass');
  const fEl = document.getElementById('aqua-res-filter');
  const bedEl = document.getElementById('aqua-res-bed');
  const pEl = document.getElementById('aqua-res-pump');

  if (dEl) dEl.textContent = density;
  if (bEl) bEl.textContent = biomass;
  if (fEl) fEl.textContent = `${filterL} Litros (biofiltro brita)`;
  if (bedEl) bedEl.textContent = `~${bedM2} m² de bancada vegetal`;
  if (pEl) pEl.textContent = pumpFlow;
};

// =====================================================================
// 28. GASOGÊNIO & RENDIMENTO WOOD GAS
// =====================================================================
window.calculateGasifier = function() {
  const kw = parseFloat(document.getElementById('gas-kw-input')?.value) || 3.5;
  const netKw = (kw * 0.72).toFixed(1);
  const woodPerH = (netKw * 1.35).toFixed(1);
  const hours = ((40 / woodPerH)).toFixed(1);

  const pEl = document.getElementById('gas-res-power');
  const wEl = document.getElementById('gas-res-wood');
  const hEl = document.getElementById('gas-res-hours');

  if (pEl) pEl.textContent = `~${netKw} kW (-28% perda térmica)`;
  if (wEl) wEl.textContent = `~${woodPerH} kg de madeira seca/h`;
  if (hEl) hEl.textContent = `~${hours} horas contínuas`;
};

// =====================================================================
// 29. FORTIFICAÇÃO & PROTEÇÃO BALÍSTICA
// =====================================================================
window.calculateFortification = function() {
  const threat = document.getElementById('fort-threat-select')?.value || 'handgun';

  let sand = '20 cm';
  let earth = '30 cm';
  let gravel = '15 cm';
  let wood = '25 cm';
  let steel = '4.5 mm (3/16")';

  if (threat === 'shotgun') {
    sand = '30 cm';
    earth = '40 cm';
    gravel = '25 cm';
    wood = '35 cm';
    steel = '6.5 mm (1/4")';
  } else if (threat === '556') {
    sand = '40 cm';
    earth = '50 cm';
    gravel = '30 cm';
    wood = '55 cm';
    steel = '9.5 mm (3/8")';
  } else if (threat === '762') {
    sand = '60 cm (dupla fileira)';
    earth = '75 cm compactada';
    gravel = '45 cm';
    wood = '80 cm (dormentes cruzados)';
    steel = '12.7 mm (1/2" chapa blindada)';
  }

  const sEl = document.getElementById('fort-res-sand');
  const eEl = document.getElementById('fort-res-earth');
  const gEl = document.getElementById('fort-res-gravel');
  const wEl = document.getElementById('fort-res-wood');
  const stEl = document.getElementById('fort-res-steel');

  if (sEl) sEl.textContent = sand;
  if (eEl) eEl.textContent = earth;
  if (gEl) gEl.textContent = gravel;
  if (wEl) wEl.textContent = wood;
  if (stEl) stEl.textContent = steel;
};

// =====================================================================
// 30. FORJA & TRATAMENTO TÉRMICO DE AÇOS
// =====================================================================
window.calculateBlacksmith = function() {
  const steel = document.getElementById('smith-steel-select')?.value || '5160';

  let forge = '950°C a 1150°C (Laranja a Amarelo)';
  let quench = '~800°C - 830°C (Vermelho Cereja Vivo)';
  let medium = 'Óleo Vegetal Morno (45°C - 55°C)';
  let temper = '2 horas a 200°C (Cor Palha Dourada)';
  let hrc = '58 a 60 HRC (Tenacidade Máxima)';

  if (steel === '1095') {
    forge = '900°C a 1050°C (Vermelho Claro / Laranja)';
    quench = '~790°C (Perda imediata de magnetismo)';
    medium = 'Óleo Fino Rápido (40°C)';
    temper = '2 horas a 220°C';
    hrc = '60 a 62 HRC (Fio de Navalha Extremo)';
  } else if (steel === '52100') {
    forge = '950°C a 1100°C';
    quench = '~820°C - 840°C';
    medium = 'Óleo Vegetal Morno a 50°C';
    temper = '2 ciclos de 1h30 a 190°C';
    hrc = '61 a 63 HRC (Resistência ao Desgaste)';
  } else if (steel === 'cable') {
    forge = '1050°C a 1250°C (Amarelo Claro / Solda)';
    quench = '~810°C (Vermelho Cereja)';
    medium = 'Óleo Mineral ou Vegetal Morno';
    temper = '2 horas a 200°C';
    hrc = '56 a 58 HRC (Padrão Damasco Flexível)';
  }

  const fEl = document.getElementById('smith-res-forge');
  const qEl = document.getElementById('smith-res-quench');
  const mEl = document.getElementById('smith-res-medium');
  const tEl = document.getElementById('smith-res-temper');
  const hEl = document.getElementById('smith-res-hrc');

  if (fEl) fEl.textContent = forge;
  if (qEl) qEl.textContent = quench;
  if (mEl) mEl.textContent = medium;
  if (tEl) tEl.textContent = temper;
  if (hEl) hEl.textContent = hrc;
};

// =====================================================================
// 31. CARVÃO ATIVADO MEDICINAL & DOSAGEM ANTITÓXICA
// =====================================================================
window.calculateCharcoal = function() {
  const kg = parseFloat(document.getElementById('char-weight-input')?.value) || 70;
  const doseG = Math.round(kg * 1.0);
  const waterMl = Math.round(doseG * 4.5);

  const dEl = document.getElementById('char-res-dose');
  const wEl = document.getElementById('char-res-water');

  if (dEl) dEl.textContent = `${doseG} gramas de pó fino (1g/kg)`;
  if (wEl) wEl.textContent = `${waterMl} a ${Math.round(waterMl * 1.3)} ml de água limpa`;
};

// Auto-init new calculators
document.addEventListener('DOMContentLoaded', () => {
  if (window.calculateSoroDose) window.calculateSoroDose();
  if (window.calculateBleachDilution) window.calculateBleachDilution();
  if (window.calculateBatteryAutonomy) window.calculateBatteryAutonomy();
  if (window.loadPacePlan) window.loadPacePlan();
  if (window.calculateOrthopedics) window.calculateOrthopedics();
  if (window.calculateAsfBait) window.calculateAsfBait();
  if (window.calculateAquaponics) window.calculateAquaponics();
  if (window.calculateGasifier) window.calculateGasifier();
  if (window.calculateFortification) window.calculateFortification();
  if (window.calculateBlacksmith) window.calculateBlacksmith();
  if (window.calculateCharcoal) window.calculateCharcoal();
});


// =====================================================================
// 32. OFFLINE REVERSE GEOCODING, PREFETCH z=14, SOCORRO & BACKUP JSON
// =====================================================================

function formatCoordsDMS(lat, lng) {
  function toDms(val, posChar, negChar) {
    const hemi = val >= 0 ? posChar : negChar;
    const abs = Math.abs(val);
    const deg = Math.floor(abs);
    const minFloat = (abs - deg) * 60;
    const min = Math.floor(minFloat);
    const sec = ((minFloat - min) * 60).toFixed(1);
    return `${deg}°${String(min).padStart(2, '0')}'${sec.padStart(4, '0')}"${hemi}`;
  }
  return `${toDms(lat, 'N', 'S')} ${toDms(lng, 'E', 'W')}`;
}

function formatCoordsUTM(lat, lng) {
  const clampedLat = Math.max(-80, Math.min(84, lat));
  const rad = Math.PI / 180;
  const a = 6378137.0;
  const f = 1 / 298.257223563;
  const e2 = 2 * f - f * f;
  const ep2 = e2 / (1 - e2);
  const k0 = 0.9996;

  const zone = Math.floor((lng + 180) / 6) + 1;
  const lonOrigin = (zone - 1) * 6 - 180 + 3;
  const latRad = clampedLat * rad;
  const lonRad = lng * rad;
  const lonOriginRad = lonOrigin * rad;

  const sinLat = Math.sin(latRad);
  const cosLat = Math.cos(latRad);
  const tanLat = Math.tan(latRad);

  const N = a / Math.sqrt(1 - e2 * sinLat * sinLat);
  const T = tanLat * tanLat;
  const C = ep2 * cosLat * cosLat;
  const A = cosLat * (lonRad - lonOriginRad);

  const M = a * (
    (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 * e2 * e2) / 256) * latRad -
    ((3 * e2) / 8 + (3 * e2 * e2) / 32 + (45 * e2 * e2 * e2) / 1024) * Math.sin(2 * latRad) +
    ((15 * e2 * e2) / 256 + (45 * e2 * e2 * e2) / 1024) * Math.sin(4 * latRad) -
    ((35 * e2 * e2 * e2) / 3072) * Math.sin(6 * latRad)
  );

  const easting = k0 * N * (
    A + ((1 - T + C) * A ** 3) / 6 + ((5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5) / 120
  ) + 500000.0;

  let northing = k0 * (
    M + N * tanLat * (
      (A * A) / 2 +
      ((5 - T + 9 * C + 4 * C * C) * A ** 4) / 24 +
      ((61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6) / 720
    )
  );
  if (clampedLat < 0) northing += 10000000.0;

  return `${zone}${clampedLat >= 0 ? 'N' : 'S'} ${Math.round(easting)}E ${Math.round(northing)}N`;
}

window.copyCustomCoordsText = function(text) {
  if (!text) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      alert(`Coordenadas copiadas:\n${text}`);
    }).catch(() => {});
  } else {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
    alert(`Coordenadas copiadas:\n${text}`);
  }
};

window.setRouteOriginPoint = function(lat, lng, label) {
  toggleRoutePlanner(true);
  routeOrigin = { lat, lng, label };
  const fromInput = document.getElementById('route-from-input');
  if (fromInput) fromInput.value = label;
  if (routeOrigin && routeDest) calculateRoute();
};

window.quickAddWaypointAt = function(lat, lng, suggestedName) {
  const nameIn = document.getElementById('wpt-name-input');
  const latIn = document.getElementById('wpt-lat-input');
  const lngIn = document.getElementById('wpt-lng-input');
  if (latIn) latIn.value = Number(lat).toFixed(5);
  if (lngIn) lngIn.value = Number(lng).toFixed(5);
  if (nameIn && suggestedName) nameIn.value = suggestedName;
  toggleWaypointsDrawer(true);
  if (nameIn) nameIn.focus();
};

let reverseGeocodePopup = null;

async function openReverseGeocodePopup(lat, lng) {
  if (!mapInstance || typeof maplibregl === 'undefined') return;
  if (reverseGeocodePopup) {
    reverseGeocodePopup.remove();
    reverseGeocodePopup = null;
  }

  const decStr = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  const dmsStr = formatCoordsDMS(lat, lng);
  const utmStr = formatCoordsUTM(lat, lng);

  const container = document.createElement('div');
  container.style.cssText = 'color:#e2e8f0;font-family:sans-serif;font-size:12px;min-width:235px;max-width:285px;padding:4px;';
  container.innerHTML = `<div style="font-weight:700;color:#38bdf8;">🔎 Identificando via e coordenadas...</div><div style="font-size:10px;color:#94a3b8;margin-top:4px;">${escapeHtmlSafe(decStr)}</div>`;

  reverseGeocodePopup = new maplibregl.Popup({ closeButton: true, maxWidth: '305px' })
    .setLngLat([lng, lat])
    .setDOMContent(container)
    .addTo(mapInstance);

  let rev = null;
  try {
    const res = await fetch(`/api/streets/reverse?lat=${lat}&lng=${lng}`);
    if (res.ok) rev = await res.json();
  } catch (e) {}

  let titleText = 'Ponto Tático no Mapa';
  let subText = '';
  let pointLabel = decStr;

  if (rev && rev.street && rev.street.name) {
    titleText = rev.street.name;
    const distInfo = typeof rev.distanceMeters === 'number' ? ` (~${rev.distanceMeters} m)` : '';
    const cityUf = rev.street.city ? `${rev.street.city}/${rev.street.state || ''}` : (rev.city ? `${rev.city.name}/${rev.city.state}` : '');
    subText = `${rev.street.kind || 'Via'}${distInfo}${cityUf ? ' • ' + cityUf : ''}`;
    pointLabel = cityUf ? `${rev.street.name} (${cityUf})` : rev.street.name;
  } else if (rev && rev.city) {
    titleText = `${rev.city.name} (${rev.city.state})`;
    subText = `Região municipal • IBGE ${rev.city.codigo_ibge || ''}`;
    pointLabel = `${rev.city.name} (${rev.city.state})`;
  } else if (citiesList && citiesList.length > 0) {
    let nearest = null;
    let minDist = Infinity;
    for (const c of citiesList) {
      const d = getDistanceFromLatLonInKm(lat, lng, c.lat, c.lng);
      if (d < minDist) {
        minDist = d;
        nearest = c;
      }
    }
    if (nearest) {
      subText = `Próx. a ${nearest.name}/${nearest.state} (~${minDist.toFixed(1)} km)`;
      pointLabel = `${nearest.name} (${nearest.state})`;
    }
  }

  let poisHtml = '';
  if (rev && Array.isArray(rev.nearbyPois) && rev.nearbyPois.length > 0) {
    const topPoi = rev.nearbyPois[0];
    poisHtml = `<div style="margin-top:6px;padding:4px 6px;background:rgba(16,185,129,0.12);border:1px solid rgba(16,185,129,0.3);border-radius:6px;font-size:10px;color:#6ee7b7;">
      <strong>Apoio +próximo:</strong> ${escapeHtmlSafe(topPoi.name)} (${topPoi.distanceKm} km)
    </div>`;
  }

  const sunMoon = typeof computeOfflineSunMoon === 'function' ? computeOfflineSunMoon(lat, lng) : null;
  const sunLineHtml = sunMoon
    ? `<div style="margin-top:4px;font-size:10px;color:#fcd34d;">☀️ ${sunMoon.sunrise}–${sunMoon.sunset} (${sunMoon.daylightStr}) &bull; ${sunMoon.moonIcon} ${sunMoon.moonPhaseName}</div>`
    : '';

  container.innerHTML = `
    <div style="font-weight:800;font-size:13px;color:#34d399;margin-bottom:2px;">📍 ${escapeHtmlSafe(titleText)}</div>
    ${subText ? `<div style="font-size:11px;color:#cbd5e1;margin-bottom:6px;">${escapeHtmlSafe(subText)}</div>` : ''}
    <div style="background:rgba(15,23,42,0.85);border:1px solid rgba(148,163,184,0.22);border-radius:6px;padding:5px 7px;font-family:monospace;font-size:10px;color:#e2e8f0;line-height:1.45;">
      <div><strong>DEC:</strong> ${escapeHtmlSafe(decStr)}</div>
      <div><strong>DMS:</strong> ${escapeHtmlSafe(dmsStr)}</div>
      <div><strong>UTM:</strong> ${escapeHtmlSafe(utmStr)}</div>
      ${sunLineHtml}
    </div>
    ${poisHtml}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:7px;">
      <button type="button" data-act="origin" style="padding:4px 6px;border-radius:5px;border:1px solid rgba(16,185,129,0.4);background:rgba(16,185,129,0.18);color:#6ee7b7;font-size:10px;font-weight:700;cursor:pointer;">🏁 Origem Rota</button>
      <button type="button" data-act="dest" style="padding:4px 6px;border-radius:5px;border:1px solid rgba(56,189,248,0.4);background:rgba(56,189,248,0.18);color:#7dd3fc;font-size:10px;font-weight:700;cursor:pointer;">🧭 Destino Rota</button>
      <button type="button" data-act="wpt" style="padding:4px 6px;border-radius:5px;border:1px solid rgba(251,191,36,0.4);background:rgba(251,191,36,0.15);color:#fde68a;font-size:10px;font-weight:700;cursor:pointer;">📌 Salvar Ponto</button>
      <button type="button" data-act="support" style="padding:4px 6px;border-radius:5px;border:1px solid rgba(248,113,113,0.4);background:rgba(248,113,113,0.16);color:#fca5a5;font-size:10px;font-weight:700;cursor:pointer;">🚑 Socorro Aqui</button>
    </div>
    <button type="button" data-act="copy" style="width:100%;margin-top:4px;padding:4px 6px;border-radius:5px;border:1px solid rgba(148,163,184,0.3);background:rgba(30,41,59,0.85);color:#cbd5e1;font-size:10px;font-weight:600;cursor:pointer;">📋 Copiar DEC / DMS / UTM</button>
  `;

  container.querySelector('[data-act="origin"]')?.addEventListener('click', () => {
    window.setRouteOriginPoint(lat, lng, pointLabel);
  });
  container.querySelector('[data-act="dest"]')?.addEventListener('click', () => {
    window.setRouteDestination(lat, lng, pointLabel);
  });
  container.querySelector('[data-act="wpt"]')?.addEventListener('click', () => {
    window.quickAddWaypointAt(lat, lng, titleText);
  });
  container.querySelector('[data-act="support"]')?.addEventListener('click', () => {
    window.toggleNearbySupportDrawer(true, lat, lng, pointLabel);
  });
  container.querySelector('[data-act="copy"]')?.addEventListener('click', () => {
    window.copyCustomCoordsText(`DEC: ${decStr} | DMS: ${dmsStr} | UTM: ${utmStr}`);
  });
}

// =====================================================================
// PREFETCH DE RUAS z=14 POR CIDADE & PONTE KIWIX NO PORTAL
// =====================================================================

window.prefetchSelectedCityStreets = async function() {
  if (!currentSelectedCity) return;
  const btn = document.getElementById('btn-prefetch-city');
  const statusEl = document.getElementById('drawer-prefetch-status');
  if (btn) btn.disabled = true;
  if (statusEl) {
    statusEl.className = 'text-xs text-cyan-400 mt-2';
    statusEl.textContent = `⏳ Baixando blocos z=14 e indexando ruas de ${currentSelectedCity.name}...`;
  }

  try {
    const res = await fetch('/api/maps/prefetch-city', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lat: currentSelectedCity.lat,
        lng: currentSelectedCity.lng,
        radiusKm: 3.2
      })
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(data.error || 'Falha no servidor');
    }
    if (statusEl) {
      statusEl.className = 'text-xs text-emerald-400 mt-2';
      statusEl.textContent = `✅ ${data.tilesDownloaded} novos blocos (${data.tilesCached} em cache) • +${data.streetsLearnedNow} ruas indexadas (Total: ${(data.totalStreetsInDb || 0).toLocaleString('pt-BR')})`;
    }
    try {
      const sRes = await fetch('/api/status');
      if (sRes.ok) {
        const sData = await sRes.json();
        window.nomadStatusData = sData;
        renderStatusSummaryFromData(sData);
      }
    } catch (e) {}
  } catch (err) {
    if (statusEl) {
      statusEl.className = 'text-xs text-amber-400 mt-2';
      statusEl.textContent = `⚠️ Não foi possível baixar agora (verifique conexão): ${err.message || err}`;
    }
  } finally {
    if (btn) btn.disabled = false;
  }
};

window.openSelectedCityInWikiTab = async function() {
  if (!currentSelectedCity) return;
  const city = currentSelectedCity;
  const primaryBook = window.nomadPrimaryZimBook || 'wikipedia_pt_all_maxi_2026-05';
  const kiwixBase = typeof window.getKiwixBaseUrl === 'function' ? window.getKiwixBaseUrl() : `http://${window.location.hostname || 'localhost'}:8090`;
  const targetSlug = (city.wiki_query || `${city.name}_(${city.state_name || city.state})`).replace(/ /g, '_');
  let finalUrl = `${kiwixBase}/content/${encodeURIComponent(primaryBook)}/${encodeURIComponent(targetSlug)}`;

  try {
    const res = await fetch(`/api/kiwix/resolve?q=${encodeURIComponent(city.wiki_query || city.name)}`);
    if (res.ok) {
      const resolved = await res.json();
      if (resolved && resolved.ok) {
        finalUrl = resolved.articleUrl || resolved.searchUrl || finalUrl;
        if (resolved.book && typeof window.setActiveKiwixBookState === 'function') {
          window.setActiveKiwixBookState(resolved.book);
        }
      }
    }
  } catch (e) {}

  switchTab('wiki');
  const iframe = document.getElementById('kiwix-iframe');
  if (iframe) {
    iframe.setAttribute('src', finalUrl);
  }
};

window.openSelectedCityInWikivoyage = async function() {
  if (!currentSelectedCity) return;
  const city = currentSelectedCity;
  const kiwixBase = typeof window.getKiwixBaseUrl === 'function' ? window.getKiwixBaseUrl() : `http://${window.location.hostname || 'localhost'}:8090`;
  let finalUrl = `${kiwixBase}/search?content=wikivoyage_pt_all_maxi_2026-09&pattern=${encodeURIComponent(city.name)}`;

  try {
    const res = await fetch(`/api/kiwix/resolve?category=travel&q=${encodeURIComponent(city.name)}`);
    if (res.ok) {
      const resolved = await res.json();
      if (resolved && resolved.ok) {
        finalUrl = resolved.articleUrl || resolved.searchUrl || finalUrl;
        if (resolved.book && typeof window.setActiveKiwixBookState === 'function') {
          window.setActiveKiwixBookState(resolved.book);
        }
      }
    }
  } catch (e) {}

  switchTab('wiki');
  const iframe = document.getElementById('kiwix-iframe');
  if (iframe) {
    iframe.setAttribute('src', finalUrl);
  }
};

// =====================================================================
// RADAR DE SOCORRO & APOIO PRÓXIMO
// =====================================================================

let nearbySupportRadiusKm = 25;
let nearbySupportCategory = 'all';
let nearbySupportMarkers = [];
let nearbySupportAnchor = null;

const SUPPORT_CAT_ICONS = {
  hospital: '🏥',
  rescue: '🚒',
  police: '🚓',
  fuel: '⛽',
  water: '💧',
  shelter: '🏕️',
  default: '🚑'
};

function clearNearbySupportMarkers() {
  if (Array.isArray(nearbySupportMarkers)) {
    nearbySupportMarkers.forEach(m => m.remove());
  }
  nearbySupportMarkers = [];
}

window.toggleNearbySupportDrawer = function(force, customLat, customLng, customLabel) {
  const drawer = document.getElementById('nearby-support-drawer');
  const btn = document.getElementById('btn-toggle-nearby-support');
  const routePanel = document.getElementById('route-planner-panel');
  const routeBtn = document.getElementById('btn-toggle-route-panel');
  const wptDrawer = document.getElementById('waypoints-drawer');
  const wptBtn = document.getElementById('layer-btn-waypoints');
  if (!drawer) return;

  const isOpen = drawer.classList.contains('open');
  const shouldOpen = typeof force === 'boolean' ? force : !isOpen;

  if (shouldOpen) {
    if (routePanel) routePanel.classList.remove('open');
    if (routeBtn) routeBtn.classList.remove('active');
    if (wptDrawer) wptDrawer.classList.remove('open');
    if (wptBtn) wptBtn.classList.remove('active');
    if (window.innerWidth <= 900 && typeof closeCityDrawer === 'function') closeCityDrawer();

    drawer.classList.add('open');
    if (btn) btn.classList.add('active');
    if (typeof currentTab !== 'undefined' && currentTab !== 'map') switchTab('map');
    window.loadNearbySupportResults(customLat, customLng, customLabel);
  } else {
    drawer.classList.remove('open');
    if (btn) btn.classList.remove('active');
    clearNearbySupportMarkers();
  }
};

window.setNearbySupportRadius = function(km) {
  nearbySupportRadiusKm = km;
  document.querySelectorAll('.nearby-radius-chip').forEach(el => {
    const val = parseFloat(el.getAttribute('data-radius'));
    el.classList.toggle('active', val === km);
  });
  if (nearbySupportAnchor) {
    window.loadNearbySupportResults(nearbySupportAnchor.lat, nearbySupportAnchor.lng, nearbySupportAnchor.label);
  } else {
    window.loadNearbySupportResults();
  }
};

window.setNearbySupportCategory = function(cat) {
  nearbySupportCategory = cat || 'all';
  document.querySelectorAll('.nearby-cat-chip').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-cat') === nearbySupportCategory);
  });
  if (nearbySupportAnchor) {
    window.loadNearbySupportResults(nearbySupportAnchor.lat, nearbySupportAnchor.lng, nearbySupportAnchor.label);
  } else {
    window.loadNearbySupportResults();
  }
};

window.loadNearbySupportResults = async function(customLat, customLng, customLabel) {
  const listEl = document.getElementById('nearby-support-list');
  const summaryEl = document.getElementById('nearby-support-summary');
  const centerEl = document.getElementById('nearby-center-label');

  let lat = -15.7942;
  let lng = -47.8822;
  let anchorText = 'Centro do Mapa';

  if (typeof customLat === 'number' && typeof customLng === 'number' && !isNaN(customLat) && !isNaN(customLng)) {
    lat = customLat;
    lng = customLng;
    anchorText = customLabel || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    nearbySupportAnchor = { lat, lng, label: anchorText };
  } else {
    nearbySupportAnchor = null;
    if (mapInstance) {
      const c = mapInstance.getCenter();
      lat = c.lat;
      lng = c.lng;
      anchorText = `Mapa (${lat.toFixed(3)}, ${lng.toFixed(3)})`;
    }
  }

  if (centerEl) centerEl.textContent = anchorText;
  if (listEl) listEl.innerHTML = '<div class="text-xs text-cyan-400 py-3 text-center">📡 Escaneando apoio offline na área...</div>';
  clearNearbySupportMarkers();

  try {
    const res = await fetch(
      `/api/nearby-support?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}&radiusKm=${encodeURIComponent(nearbySupportRadiusKm)}&category=${encodeURIComponent(nearbySupportCategory)}`
    );
    const items = await res.json();
    if (!Array.isArray(items) || items.length === 0) {
      if (summaryEl) summaryEl.textContent = `0 pontos em ${nearbySupportRadiusKm} km`;
      if (listEl) {
        listEl.innerHTML = `<div class="text-xs text-gray-400 py-3 text-center">Nenhum ponto encontrado em ${nearbySupportRadiusKm} km para esta categoria. Tente aumentar o raio para 50 km ou navegar para a área urbana.</div>`;
      }
      return;
    }

    if (summaryEl) summaryEl.textContent = `${items.length} ponto(s) em até ${nearbySupportRadiusKm} km`;
    if (listEl) {
      listEl.innerHTML = '';
      items.forEach(item => {
        const icon = SUPPORT_CAT_ICONS[item.category] || SUPPORT_CAT_ICONS.default;
        const card = document.createElement('div');
        card.className = 'wpt-item';
        const subPlace = [item.city, item.state].filter(Boolean).join('/');
        const metaParts = [`<strong>${item.distanceKm} km</strong>`];
        if (subPlace) metaParts.push(escapeHtmlSafe(subPlace));
        if (item.phone) metaParts.push(`☎️ ${escapeHtmlSafe(item.phone)}`);

        card.innerHTML = `
          <span class="wpt-icon">${icon}</span>
          <div class="wpt-details" style="min-width:0;flex:1;">
            <div class="wpt-title">${escapeHtmlSafe(item.name)}</div>
            <div class="wpt-coords">${metaParts.join(' &bull; ')}</div>
            ${item.details ? `<div style="font-size:10px;color:#94a3b8;margin-top:2px;">${escapeHtmlSafe(item.details)}</div>` : ''}
          </div>
          <div class="wpt-actions">
            <button type="button" class="wpt-act-btn" data-act="focus" title="Ver no mapa">🔍</button>
            <button type="button" class="wpt-act-btn route" data-act="route" title="Traçar rota até aqui">🧭</button>
          </div>
        `;
        card.querySelector('[data-act="focus"]')?.addEventListener('click', () => {
          flyToCoords(item.lat, item.lng, item.name, 15);
        });
        card.querySelector('[data-act="route"]')?.addEventListener('click', () => {
          window.setRouteDestination(item.lat, item.lng, item.name);
        });
        listEl.appendChild(card);

        if (mapInstance && typeof maplibregl !== 'undefined' && typeof item.lat === 'number' && typeof item.lng === 'number') {
          const el = document.createElement('div');
          el.innerHTML = `<div style="background:rgba(239,68,68,0.92);border:2px solid #fff;border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-size:13px;box-shadow:0 0 10px rgba(239,68,68,0.65);cursor:pointer;">${icon}</div>`;
          const marker = new maplibregl.Marker({ element: el })
            .setLngLat([item.lng, item.lat])
            .setPopup(
              new maplibregl.Popup({ offset: 18 }).setHTML(
                `<div style="color:#fff;font-family:sans-serif;font-size:12px;padding:3px;">
                  <div style="font-weight:800;color:#fca5a5;">${icon} ${escapeHtmlSafe(item.name)}</div>
                  <div style="font-size:10px;color:#cbd5e1;margin:2px 0;">${item.distanceKm} km${subPlace ? ' • ' + escapeHtmlSafe(subPlace) : ''}</div>
                  ${item.phone ? `<div style="font-size:10px;color:#6ee7b7;">☎️ ${escapeHtmlSafe(item.phone)}</div>` : ''}
                </div>`
              )
            )
            .addTo(mapInstance);
          nearbySupportMarkers.push(marker);
        }
      });
    }
  } catch (err) {
    if (summaryEl) summaryEl.textContent = 'Erro no radar offline';
    if (listEl) listEl.innerHTML = '<div class="text-xs text-red-400 py-3 text-center">Falha ao consultar /api/nearby-support.</div>';
  }
};

// =====================================================================
// BACKUP & RESTAURAÇÃO COMPLETA (.JSON: WAYPOINTS, PEF, BOB, PACE)
// =====================================================================

window.exportFullTacticalBackup = function() {
  const safeParse = (key) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  };

  const payload = {
    app: 'nomad-brasil',
    version: 2,
    exportedAt: new Date().toISOString(),
    waypoints: Array.isArray(userWaypoints) ? userWaypoints : [],
    pef: safeParse('nomad_pef_data_v1'),
    bob: safeParse('nomad_bob_checked_state_v1'),
    pace: safeParse('nomad_pace_plan_v1')
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const dateStamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `nomad-brasil-backup-${dateStamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  const msgEl = document.getElementById('backup-status-message');
  if (msgEl) {
    msgEl.className = 'text-xs text-emerald-400 mt-3';
    msgEl.textContent = `✅ Backup exportado (${payload.waypoints.length} waypoints, PEF, BOB e PACE).`;
  }
};

window.importFullTacticalBackup = function(event) {
  const file = event && event.target && event.target.files ? event.target.files[0] : null;
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    const msgEl = document.getElementById('backup-status-message');
    try {
      const parsed = JSON.parse(e.target.result);
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Estrutura JSON inválida');
      }

      const restoredSections = [];

      if (Array.isArray(parsed.waypoints)) {
        userWaypoints = parsed.waypoints.filter(w => w && typeof w.lat === 'number' && typeof w.lng === 'number');
        saveUserWaypointsToStorage();
        restoredSections.push(`Waypoints (${userWaypoints.length})`);
      }

      if (parsed.pef && typeof parsed.pef === 'object') {
        localStorage.setItem('nomad_pef_data_v1', JSON.stringify(parsed.pef));
        if (typeof window.loadPefData === 'function') window.loadPefData();
        restoredSections.push('PEF');
      }

      if (parsed.bob && typeof parsed.bob === 'object') {
        localStorage.setItem('nomad_bob_checked_state_v1', JSON.stringify(parsed.bob));
        if (typeof renderBobKit === 'function') renderBobKit();
        restoredSections.push('BOB');
      }

      if (parsed.pace && typeof parsed.pace === 'object') {
        localStorage.setItem('nomad_pace_plan_v1', JSON.stringify(parsed.pace));
        if (typeof window.loadPacePlan === 'function') window.loadPacePlan();
        restoredSections.push('PACE');
      }

      if (restoredSections.length === 0) {
        throw new Error('Nenhum bloco reconhecido (waypoints, pef, bob, pace) encontrado neste arquivo.');
      }

      if (msgEl) {
        msgEl.className = 'text-xs text-emerald-400 mt-3';
        msgEl.textContent = `✅ Restauração concluída: ${restoredSections.join(', ')}.`;
      }
      alert(`Backup restaurado com sucesso:\n${restoredSections.join(', ')}`);
    } catch (err) {
      if (msgEl) {
        msgEl.className = 'text-xs text-red-400 mt-3';
        msgEl.textContent = `❌ Falha ao restaurar backup: ${err.message || err}`;
      }
      alert(`Erro ao restaurar arquivo JSON: ${err.message || err}`);
    } finally {
      if (event && event.target) event.target.value = '';
    }
  };
  reader.readAsText(file);
};

// =====================================================================
// 33. KIWIX DINÂMICO LAN (:8090), ESTANTE MULTI-ZIM & ATALHOS MÉDICOS
// =====================================================================

let kiwixBookshelfList = [];
let activeKiwixBook = null;

window.getKiwixBaseUrl = function() {
  const host = (typeof window !== 'undefined' && window.location && window.location.hostname)
    ? window.location.hostname
    : 'localhost';
  return `http://${host}:8090`;
};

window.setActiveKiwixBookState = function(bookName) {
  if (!bookName) return;
  activeKiwixBook = bookName;
  const base = window.getKiwixBaseUrl();
  const extLink = document.getElementById('kiwix-tab-external-link');
  if (extLink) {
    extLink.href = `${base}/content/${encodeURIComponent(bookName)}`;
  }
  document.querySelectorAll('.kiwix-book-chip').forEach(btn => {
    const b = btn.getAttribute('data-book');
    btn.classList.toggle('chip-highlight', b === bookName);
  });
};

window.initDynamicKiwixLinks = function() {
  const base = window.getKiwixBaseUrl();
  const primary = activeKiwixBook || window.nomadPrimaryZimBook || 'wikipedia_pt_all_maxi_2026-05';
  const sideLink = document.getElementById('kiwix-sidebar-link');
  const shelfLink = document.getElementById('kiwix-shelf-link');
  const extLink = document.getElementById('kiwix-tab-external-link');
  if (sideLink) sideLink.href = base;
  if (shelfLink) shelfLink.href = base;
  if (extLink) extLink.href = `${base}/content/${encodeURIComponent(primary)}`;
};

window.loadKiwixBookshelf = async function() {
  const wrap = document.getElementById('kiwix-bookshelf-chips');
  if (!wrap) return;
  try {
    const res = await fetch('/api/kiwix/books');
    if (!res.ok) throw new Error('Falha ao listar livros');
    const data = await res.json();
    const books = Array.isArray(data.books) ? data.books : [];
    kiwixBookshelfList = books;
    if (books.length === 0) {
      wrap.innerHTML = '<span class="text-xs text-amber-400">Nenhum arquivo .zim encontrado em storage/zim/</span>';
      return;
    }
    if (!activeKiwixBook) {
      activeKiwixBook = window.nomadPrimaryZimBook || books[0].book;
    }
    wrap.innerHTML = '';
    books.forEach(b => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `chip-btn kiwix-book-chip${b.book === activeKiwixBook ? ' chip-highlight' : ''}`;
      btn.setAttribute('data-book', b.book);
      btn.style.fontSize = '0.72rem';
      btn.style.padding = '0.25rem 0.6rem';
      btn.textContent = `${b.icon || '📕'} ${b.title} (${b.sizeFormatted})`;
      btn.addEventListener('click', () => {
        window.setActiveKiwixBookState(b.book);
        const iframe = document.getElementById('kiwix-iframe');
        if (iframe) {
          iframe.setAttribute('src', `${window.getKiwixBaseUrl()}/content/${encodeURIComponent(b.book)}`);
        }
      });
      wrap.appendChild(btn);
    });
  } catch (e) {
    wrap.innerHTML = '<span class="text-xs text-gray-400">Estante Kiwix disponível via botão Estante (:8090).</span>';
  }
};

window.searchInCurrentKiwixBook = function() {
  const input = document.getElementById('kiwix-search-input');
  const q = input ? input.value.trim() : '';
  const book = activeKiwixBook || window.nomadPrimaryZimBook || 'wikipedia_pt_all_maxi_2026-05';
  const base = window.getKiwixBaseUrl();
  const targetUrl = q
    ? `${base}/search?content=${encodeURIComponent(book)}&pattern=${encodeURIComponent(q)}`
    : `${base}/content/${encodeURIComponent(book)}`;
  window.setActiveKiwixBookState(book);
  const iframe = document.getElementById('kiwix-iframe');
  if (iframe) iframe.setAttribute('src', targetUrl);
};

window.searchMedicalZim = async function(targetType) {
  const input = document.getElementById('med-zim-search-input');
  const q = input ? input.value.trim() : '';
  const base = window.getKiwixBaseUrl();
  const queryParam = targetType === 'nhs' ? 'book=nhs' : 'category=medicine';
  let finalUrl = `${base}/search?content=${encodeURIComponent(targetType === 'nhs' ? 'nhs.uk_en_medicines_2025-12' : 'wikipedia_pt_medicine_maxi_2026-10')}&pattern=${encodeURIComponent(q)}`;

  try {
    const res = await fetch(`/api/kiwix/resolve?${queryParam}&q=${encodeURIComponent(q)}`);
    if (res.ok) {
      const resolved = await res.json();
      if (resolved && resolved.ok) {
        finalUrl = q ? (resolved.searchUrl || resolved.articleUrl) : resolved.articleUrl;
        if (resolved.book) window.setActiveKiwixBookState(resolved.book);
      }
    }
  } catch (e) {}

  switchTab('wiki');
  const searchBox = document.getElementById('kiwix-search-input');
  if (searchBox && q) searchBox.value = q;
  const iframe = document.getElementById('kiwix-iframe');
  if (iframe) iframe.setAttribute('src', finalUrl);
};

// =====================================================================
// 34. FERRAMENTA DE MEDIÇÃO TÁTICA NO MAPA (AZIMUTE & VISADA RÁDIO)
// =====================================================================

let tacticalMeasureActive = false;
let measurePoints = [];
let measureMarkers = [];

const BRAZIL_DECLINATION_DEG = -21;

function getCardinalDir(deg) {
  const dirs = ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'];
  return dirs[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
}

function computeTrueAzimuthDeg(lat1, lng1, lat2, lng2) {
  const rad = Math.PI / 180;
  const p1 = lat1 * rad;
  const p2 = lat2 * rad;
  const dl = (lng2 - lng1) * rad;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function ensureTacticalMeasureLayer() {
  if (!mapInstance) return;
  if (!mapInstance.getSource('tactical-measure-source')) {
    mapInstance.addSource('tactical-measure-source', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });
    mapInstance.addLayer({
      id: 'tactical-measure-layer',
      type: 'line',
      source: 'tactical-measure-source',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': '#38bdf8',
        'line-width': 3.5,
        'line-dasharray': [2.2, 1.5]
      }
    });
  }
}

function renderTacticalMeasureState() {
  ensureTacticalMeasureLayer();
  if (mapInstance && mapInstance.getSource('tactical-measure-source')) {
    const features = [];
    if (measurePoints.length >= 2) {
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: measurePoints }
      });
    }
    mapInstance.getSource('tactical-measure-source').setData({
      type: 'FeatureCollection',
      features
    });
  }

  measureMarkers.forEach(m => m.remove());
  measureMarkers = [];
  if (mapInstance && typeof maplibregl !== 'undefined') {
    measurePoints.forEach((pt, idx) => {
      const el = document.createElement('div');
      el.style.cssText = 'background:#0284c7;color:#fff;border:2px solid #fff;border-radius:50%;width:20px;height:20px;font-size:10px;font-weight:800;display:flex;align-items:center;justify-content:center;box-shadow:0 0 8px rgba(56,189,248,0.8);';
      el.textContent = String(idx + 1);
      const mk = new maplibregl.Marker({ element: el }).setLngLat(pt).addTo(mapInstance);
      measureMarkers.push(mk);
    });
  }

  const statsEl = document.getElementById('measure-hud-stats');
  if (!statsEl) return;

  if (measurePoints.length === 0) {
    statsEl.innerHTML = '<div>Clique no mapa para definir o ponto 1 e iniciar a medição.</div>';
    return;
  }
  if (measurePoints.length === 1) {
    statsEl.innerHTML = `<div>Ponto 1 marcado (${measurePoints[0][1].toFixed(4)}, ${measurePoints[0][0].toFixed(4)}). Clique no próximo ponto.</div>`;
    return;
  }

  let totalKm = 0;
  let lastSegKm = 0;
  for (let i = 1; i < measurePoints.length; i++) {
    const seg = getDistanceFromLatLonInKm(measurePoints[i - 1][1], measurePoints[i - 1][0], measurePoints[i][1], measurePoints[i][0]);
    totalKm += seg;
    lastSegKm = seg;
  }

  const a = measurePoints[measurePoints.length - 2];
  const b = measurePoints[measurePoints.length - 1];
  const trueAz = computeTrueAzimuthDeg(a[1], a[0], b[1], b[0]);
  const magAz = (trueAz - BRAZIL_DECLINATION_DEG + 360) % 360;
  const distStr = totalKm < 1 ? `${Math.round(totalKm * 1000)} m` : `${totalKm.toFixed(2)} km`;
  const walkMin = Math.round((totalKm / 4.5) * 60);
  const vhfNote = lastSegKm <= 6
    ? '🟢 VHF/UHF Portátil↔Portátil excelente (≤ 6 km)'
    : lastSegKm <= 18
      ? '🟡 VHF/UHF provável (requer ponto alto / repetidora)'
      : '🟠 Acima do horizonte portátil: use repetidora VHF ou HF NVIS';

  statsEl.innerHTML = `
    <div><strong>Distância Total (${measurePoints.length} pts):</strong> <span class="text-emerald-400 font-mono">${distStr}</span></div>
    <div><strong>Azimute Verdadeiro:</strong> <span class="font-mono text-cyan-300">${Math.round(trueAz)}° (${getCardinalDir(trueAz)})</span></div>
    <div><strong>Azimute Magnético (Decl. -21°):</strong> <span class="font-mono text-amber-300">${Math.round(magAz)}° (${getCardinalDir(magAz)})</span></div>
    <div><strong>Marcha a Pé (~4,5 km/h):</strong> <span class="font-mono">${walkMin >= 60 ? Math.floor(walkMin / 60) + 'h ' + (walkMin % 60) + 'm' : walkMin + ' min'}</span></div>
    <div style="margin-top:4px;padding-top:4px;border-top:1px solid rgba(148,163,184,0.2);font-size:11px;">${vhfNote}</div>
  `;
}

window.toggleTacticalMeasure = function(force) {
  tacticalMeasureActive = typeof force === 'boolean' ? force : !tacticalMeasureActive;
  const btn = document.getElementById('btn-toggle-measure');
  const hud = document.getElementById('tactical-measure-hud');
  if (btn) btn.classList.toggle('active', tacticalMeasureActive);
  if (hud) hud.style.display = tacticalMeasureActive ? 'block' : 'none';
  if (tacticalMeasureActive && typeof cancelMapPick === 'function') cancelMapPick();
  if (mapInstance && mapInstance.getCanvas()) {
    mapInstance.getCanvas().style.cursor = tacticalMeasureActive ? 'crosshair' : '';
  }
  if (!tacticalMeasureActive) {
    window.clearMeasurePoints();
  } else {
    renderTacticalMeasureState();
  }
};

window.addTacticalMeasurePoint = function(lat, lng) {
  measurePoints.push([lng, lat]);
  renderTacticalMeasureState();
};

window.undoMeasurePoint = function() {
  if (measurePoints.length > 0) {
    measurePoints.pop();
    renderTacticalMeasureState();
  }
};

window.clearMeasurePoints = function() {
  measurePoints = [];
  renderTacticalMeasureState();
};

// =====================================================================
// 35. MODO ACAMPAMENTO / REDE LOCAL (LAN) & QR CODE OFFLINE PURO EM JS
// =====================================================================

function generateOfflineQrSvg(text, pixelSize = 180) {
  const utf8 = Array.from(new TextEncoder().encode(String(text || 'http://localhost:8000')));
  const caps = [
    { ver: 1, cap: 17, totalData: 19, ec: 7, align: [] },
    { ver: 2, cap: 32, totalData: 34, ec: 10, align: [6, 18] },
    { ver: 3, cap: 53, totalData: 55, ec: 15, align: [6, 22] },
    { ver: 4, cap: 78, totalData: 80, ec: 20, align: [6, 26] }
  ];
  const cfg = caps.find(c => utf8.length <= c.cap);
  if (!cfg) return '';

  // Encode byte stream
  const bits = [];
  const pushBits = (val, len) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
  };
  pushBits(0b0100, 4);
  pushBits(utf8.length, 8);
  utf8.forEach(b => pushBits(b, 8));
  const maxBits = cfg.totalData * 8;
  for (let i = 0; i < 4 && bits.length < maxBits; i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);
  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (bits.length < maxBits) {
    pushBits(padBytes[padIdx % 2], 8);
    padIdx++;
  }
  const dataCw = [];
  for (let i = 0; i < bits.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
    dataCw.push(v);
  }

  // GF(256) Reed-Solomon (poly 0x11d)
  const exp = new Uint8Array(512);
  const log = new Uint8Array(256);
  let x = 1;
  for (let i = 0; i < 255; i++) {
    exp[i] = x;
    log[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) exp[i] = exp[i - 255];
  const gfMul = (a, b) => (a === 0 || b === 0 ? 0 : exp[log[a] + log[b]]);

  let gen = [1];
  for (let i = 0; i < cfg.ec; i++) {
    const next = new Array(gen.length + 1).fill(0);
    const root = exp[i];
    for (let j = 0; j < gen.length; j++) {
      next[j] ^= gen[j];
      next[j + 1] ^= gfMul(gen[j], root);
    }
    gen = next;
  }

  const msg = dataCw.concat(new Array(cfg.ec).fill(0));
  for (let i = 0; i < dataCw.length; i++) {
    const coef = msg[i];
    if (coef !== 0) {
      for (let j = 0; j < gen.length; j++) {
        msg[i + j] ^= gfMul(gen[j], coef);
      }
    }
  }
  const allCw = dataCw.concat(msg.slice(dataCw.length));
  const allBits = [];
  allCw.forEach(cw => {
    for (let i = 7; i >= 0; i--) allBits.push((cw >> i) & 1);
  });

  const size = 17 + 4 * cfg.ver;
  const grid = Array.from({ length: size }, () => new Int8Array(size));
  const isFunc = Array.from({ length: size }, () => new Uint8Array(size));
  const setFunc = (r, c, val) => {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      grid[r][c] = val ? 1 : 0;
      isFunc[r][c] = 1;
    }
  };

  // Finder + separator
  const drawFinder = (tr, tc) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const r = tr + dr, c = tc + dc;
        if (r < 0 || r >= size || c < 0 || c >= size) continue;
        const inOuter = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
        const on = inOuter && (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
        setFunc(r, c, on ? 1 : 0);
      }
    }
  };
  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  // Alignment patterns
  for (const ar of cfg.align) {
    for (const ac of cfg.align) {
      if (isFunc[ar][ac]) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const on = Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0);
          setFunc(ar + dr, ac + dc, on ? 1 : 0);
        }
      }
    }
  }

  // Timing patterns
  for (let i = 8; i <= size - 9; i++) {
    setFunc(6, i, i % 2 === 0 ? 1 : 0);
    setFunc(i, 6, i % 2 === 0 ? 1 : 0);
  }

  // Dark module & reserve format info
  setFunc(4 * cfg.ver + 9, 8, 1);
  for (let i = 0; i < 9; i++) {
    if (i !== 6) {
      setFunc(8, i, 0);
      setFunc(i, 8, 0);
    }
  }
  for (let i = 0; i < 8; i++) {
    setFunc(8, size - 1 - i, 0);
    if (i < 7) setFunc(size - 1 - i, 8, 0);
  }

  // Place data bits in zigzag
  let bitIdx = 0;
  let dir = -1;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (let step = 0; step < size; step++) {
      const r = dir === -1 ? size - 1 - step : step;
      for (let dc = 0; dc < 2; dc++) {
        const c = col - dc;
        if (!isFunc[r][c]) {
          grid[r][c] = bitIdx < allBits.length ? allBits[bitIdx++] : 0;
        }
      }
    }
    dir = -dir;
  }

  const maskFns = [
    (r, c) => (r + c) % 2 === 0,
    (r) => r % 2 === 0,
    (_, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => ((r * c) % 2 + (r * c) % 3) === 0,
    (r, c) => (((r * c) % 2 + (r * c) % 3) % 2) === 0,
    (r, c) => (((r + c) % 2 + (r * c) % 3) % 2) === 0
  ];

  // Evaluate best mask using run-length + balance penalty
  let bestMask = 0;
  let bestScore = Infinity;
  let bestGrid = null;

  for (let m = 0; m < 8; m++) {
    const fn = maskFns[m];
    const testGrid = grid.map((row, r) => row.map((v, c) => (isFunc[r][c] ? v : (fn(r, c) ? v ^ 1 : v))));

    // Inject BCH(15,5) format bits for EC-L (01) + mask m
    const rem = (0b01 << 3) | m;
    let d = rem << 10;
    for (let i = 4; i >= 0; i--) {
      if ((d >> (i + 10)) & 1) d ^= 0x537 << i;
    }
    const fmt = ((rem << 10) | d) ^ 0x5412;

    for (let i = 0; i <= 5; i++) testGrid[8][i] = (fmt >> (14 - i)) & 1;
    testGrid[8][7] = (fmt >> 8) & 1;
    testGrid[8][8] = (fmt >> 7) & 1;
    testGrid[7][8] = (fmt >> 6) & 1;
    for (let i = 0; i <= 5; i++) testGrid[5 - i][8] = (fmt >> (5 - i)) & 1;

    for (let i = 0; i < 7; i++) testGrid[size - 1 - i][8] = (fmt >> (14 - i)) & 1;
    for (let i = 0; i < 8; i++) testGrid[8][size - 8 + i] = (fmt >> (7 - i)) & 1;

    let penalty = 0;
    let dark = 0;
    for (let r = 0; r < size; r++) {
      let runLen = 1;
      for (let c = 0; c < size; c++) {
        dark += testGrid[r][c];
        if (c > 0 && testGrid[r][c] === testGrid[r][c - 1]) {
          runLen++;
          if (runLen === 5) penalty += 3;
          else if (runLen > 5) penalty++;
        } else {
          runLen = 1;
        }
      }
    }
    for (let c = 0; c < size; c++) {
      let runLen = 1;
      for (let r = 1; r < size; r++) {
        if (testGrid[r][c] === testGrid[r - 1][c]) {
          runLen++;
          if (runLen === 5) penalty += 3;
          else if (runLen > 5) penalty++;
        } else {
          runLen = 1;
        }
      }
    }
    const ratioPenalty = Math.abs(Math.round((dark * 100) / (size * size) - 50) / 5) * 10;
    const score = penalty + ratioPenalty;
    if (score < bestScore) {
      bestScore = score;
      bestMask = m;
      bestGrid = testGrid;
    }
  }

  const margin = 2;
  const full = size + margin * 2;
  let rects = '';
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (bestGrid[r][c]) {
        rects += `<rect x="${c + margin}" y="${r + margin}" width="1" height="1"/>`;
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${pixelSize}" height="${pixelSize}" viewBox="0 0 ${full} ${full}" shape-rendering="crispEdges"><rect width="${full}" height="${full}" fill="#ffffff"/><g fill="#090d10">${rects}</g></svg>`;
}

window.refreshLanModalQr = function() {
  const input = document.getElementById('lan-custom-host-input');
  const host = (input && input.value.trim()) ? input.value.trim() : (window.location.hostname || 'localhost');
  const portalUrl = `http://${host}:8000`;
  const kiwixUrl = `http://${host}:8090`;

  const portalText = document.getElementById('lan-portal-url-text');
  const kiwixText = document.getElementById('lan-kiwix-url-text');
  const qrWrap = document.getElementById('lan-qr-preview');
  if (portalText) portalText.textContent = portalUrl;
  if (kiwixText) kiwixText.textContent = kiwixUrl;
  if (qrWrap) {
    const svg = generateOfflineQrSvg(portalUrl, 176);
    qrWrap.innerHTML = svg || '<div class="text-xs text-amber-400">Endereço muito longo para QR compacto.</div>';
  }
};

window.openLanConnectModal = function() {
  const modal = document.getElementById('lan-connect-modal');
  const body = document.getElementById('lan-modal-body');
  if (!modal || !body) return;

  const browserHost = window.location.hostname || 'localhost';
  const serverIps = Array.isArray(window.nomadLanIps) ? window.nomadLanIps : [];
  const preferredHost = (browserHost !== 'localhost' && browserHost !== '127.0.0.1')
    ? browserHost
    : (serverIps.find(ip => ip.startsWith('192.168.') || ip.startsWith('10.')) || serverIps[0] || browserHost);

  const ipPills = serverIps.length > 0
    ? serverIps.map(ip => `<button type="button" class="chip-btn" style="font-size:0.7rem;padding:0.2rem 0.5rem;" onclick="document.getElementById('lan-custom-host-input').value='${escapeHtmlSafe(ip)}';refreshLanModalQr();">${escapeHtmlSafe(ip)}</button>`).join(' ')
    : '<span class="text-gray-400">Nenhum IP LAN detectado pelo contêiner (verifique <code>ipconfig</code> no Windows).</span>';

  body.innerHTML = `
    <div>
      <label class="text-xs font-bold text-gray-300 block mb-1">Endereço IP da máquina na rede Wi-Fi / Hotspot:</label>
      <div style="display:flex;gap:0.4rem;">
        <input type="text" id="lan-custom-host-input" class="route-input font-mono" value="${escapeHtmlSafe(preferredHost)}" oninput="refreshLanModalQr()">
        <button type="button" class="btn-input-action" onclick="refreshLanModalQr()">Atualizar QR</button>
      </div>
      <div class="text-xs text-gray-400 mt-1">IPs detectados no host: ${ipPills}</div>
    </div>
    <div style="display:flex;flex-direction:column;align-items:center;gap:0.5rem;padding:0.75rem;background:rgba(15,23,42,0.75);border-radius:10px;border:1px solid rgba(51,65,85,0.6);">
      <div id="lan-qr-preview" style="border-radius:8px;overflow:hidden;"></div>
      <div class="text-xs text-gray-400 text-center">Aponte a câmera do celular (no mesmo Wi-Fi) para abrir o portal:</div>
      <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;justify-content:center;">
        <code id="lan-portal-url-text" class="text-emerald-400 font-bold"></code>
        <button type="button" class="chip-btn" style="font-size:0.7rem;padding:0.2rem 0.5rem;" onclick="copyCustomCoordsText(document.getElementById('lan-portal-url-text').textContent)">📋 Copiar</button>
      </div>
      <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;justify-content:center;">
        <span class="text-gray-400">Kiwix:</span>
        <code id="lan-kiwix-url-text" class="text-cyan-400 font-bold"></code>
        <button type="button" class="chip-btn" style="font-size:0.7rem;padding:0.2rem 0.5rem;" onclick="copyCustomCoordsText(document.getElementById('lan-kiwix-url-text').textContent)">📋 Copiar</button>
      </div>
    </div>
  `;

  modal.style.display = 'flex';
  window.refreshLanModalQr();
};

window.closeLanConnectModal = function() {
  const modal = document.getElementById('lan-connect-modal');
  if (modal) modal.style.display = 'none';
};

// =====================================================================
// 36. EFEMÉRIDES SOLARES & LUNARES 100% OFFLINE POR COORDENADA
// =====================================================================

function computeOfflineSunMoon(lat, lng, date = new Date()) {
  const rad = Math.PI / 180;
  const startOfYear = new Date(date.getFullYear(), 0, 0);
  const doy = Math.floor((date - startOfYear) / 86400000);
  const tzOffsetHours = -date.getTimezoneOffset() / 60;

  // NOAA simplified solar equations
  const gamma = ((2 * Math.PI) / 365) * (doy - 1);
  const eqTime = 229.18 * (
    0.000075 +
    0.001868 * Math.cos(gamma) -
    0.032077 * Math.sin(gamma) -
    0.014615 * Math.cos(2 * gamma) -
    0.040849 * Math.sin(2 * gamma)
  );
  const decl =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);

  const calcSunTime = (zenithDeg, isSunrise) => {
    const cosHA = Math.cos(zenithDeg * rad) / (Math.cos(lat * rad) * Math.cos(decl)) - Math.tan(lat * rad) * Math.tan(decl);
    const clamped = Math.max(-0.999, Math.min(0.999, cosHA));
    const haDeg = Math.acos(clamped) / rad;
    const solarNoonUtcMin = 720 - 4 * lng - eqTime;
    const utcMin = isSunrise ? solarNoonUtcMin - 4 * haDeg : solarNoonUtcMin + 4 * haDeg;
    return utcMin + tzOffsetHours * 60;
  };

  const fmtMin = (m) => {
    const wrapped = ((Math.round(m) % 1440) + 1440) % 1440;
    const hh = Math.floor(wrapped / 60);
    const mm = wrapped % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  };

  const dawnMin = calcSunTime(96, true);
  const sunriseMin = calcSunTime(90.833, true);
  const sunsetMin = calcSunTime(90.833, false);
  const duskMin = calcSunTime(96, false);

  const daylightMin = Math.max(0, Math.round(sunsetMin - sunriseMin));
  const daylightStr = `${Math.floor(daylightMin / 60)}h${String(daylightMin % 60).padStart(2, '0')}m`;

  const nowMin = date.getHours() * 60 + date.getMinutes();
  let remainingLabel = '';
  if (nowMin < sunriseMin) {
    const waitMin = Math.round(sunriseMin - nowMin);
    remainingLabel = `Falta ${Math.floor(waitMin / 60)}h${String(waitMin % 60).padStart(2, '0')}m para o nascer do sol`;
  } else if (nowMin < sunsetMin) {
    const remMin = Math.round(sunsetMin - nowMin);
    remainingLabel = `Luz solar útil restante hoje: ${Math.floor(remMin / 60)}h${String(remMin % 60).padStart(2, '0')}m`;
  } else {
    remainingLabel = 'Período noturno — considere iluminação/marcha noturna';
  }

  // Synodic lunar phase relative to J2000 reference New Moon (2000-01-06 18:14 UTC)
  const synodicDays = 29.530588853;
  const refNewMoon = Date.UTC(2000, 0, 6, 18, 14, 0);
  const ageDays = ((date.getTime() - refNewMoon) / 86400000) % synodicDays;
  const normAge = ageDays < 0 ? ageDays + synodicDays : ageDays;
  const frac = normAge / synodicDays;
  const moonIllum = Math.round((1 - Math.cos(frac * 2 * Math.PI)) * 50);

  let moonPhaseName = 'Lua Nova';
  let moonIcon = '🌑';
  if (frac >= 0.0625 && frac < 0.1875) { moonPhaseName = 'Crescente'; moonIcon = '🌒'; }
  else if (frac >= 0.1875 && frac < 0.3125) { moonPhaseName = 'Quarto Crescente'; moonIcon = '🌓'; }
  else if (frac >= 0.3125 && frac < 0.4375) { moonPhaseName = 'Crescente Gibosa'; moonIcon = '🌔'; }
  else if (frac >= 0.4375 && frac < 0.5625) { moonPhaseName = 'Lua Cheia'; moonIcon = '🌕'; }
  else if (frac >= 0.5625 && frac < 0.6875) { moonPhaseName = 'Minguante Gibosa'; moonIcon = '🌖'; }
  else if (frac >= 0.6875 && frac < 0.8125) { moonPhaseName = 'Quarto Minguante'; moonIcon = '🌗'; }
  else if (frac >= 0.8125 && frac < 0.9375) { moonPhaseName = 'Minguante'; moonIcon = '🌘'; }

  return {
    dawn: fmtMin(dawnMin),
    sunrise: fmtMin(sunriseMin),
    sunset: fmtMin(sunsetMin),
    dusk: fmtMin(duskMin),
    daylightStr,
    remainingLabel,
    moonPhaseName,
    moonIcon,
    moonIllum
  };
}

// =====================================================================
// 37. GERADOR DE DOSSIÊ TÁTICO DA ROTA IMPRIMÍVEL (ORDEM DE MOVIMENTO A4)
// =====================================================================

window.printCurrentRouteDossier = function() {
  if (!currentRouteData || !routeOrigin || !routeDest) {
    alert('Trace uma rota antes de gerar o Dossiê Tático.');
    return;
  }

  const safeJson = (k) => {
    try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; }
  };
  const pef = safeJson('nomad_pef_data_v1') || {};
  const pace = safeJson('nomad_pace_plan_v1') || {};
  const ephemDest = computeOfflineSunMoon(routeDest.lat, routeDest.lng);

  const fmtPoint = (title, pt) => {
    if (!pt) return '';
    return `<tr>
      <td><strong>${escapeHtmlSafe(title)}</strong></td>
      <td>${escapeHtmlSafe(pt.label || '')}</td>
      <td><code>${pt.lat.toFixed(5)}, ${pt.lng.toFixed(5)}</code></td>
      <td><code>${escapeHtmlSafe(formatCoordsDMS(pt.lat, pt.lng))}</code></td>
      <td><code>${escapeHtmlSafe(formatCoordsUTM(pt.lat, pt.lng))}</code></td>
    </tr>`;
  };

  const corridorRows = (Array.isArray(currentRouteData.corridorSupport) ? currentRouteData.corridorSupport : [])
    .map(p => `<tr>
      <td>${p.kmAlongRoute} km</td>
      <td>${escapeHtmlSafe(p.name)}</td>
      <td>${escapeHtmlSafe((p.category || '').toUpperCase())}</td>
      <td>${p.distFromRouteKm} km</td>
      <td>${escapeHtmlSafe(p.phone || '-')}</td>
    </tr>`).join('');

  const stepItems = (Array.isArray(currentRouteData.steps) ? currentRouteData.steps : [])
    .map((s, i) => `<li><strong>${i + 1}.</strong> ${s.instruction}${s.distanceKm > 0 ? ` <em>(${s.distanceKm} km)</em>` : ''}</li>`)
    .join('');

  const profileLabels = { driving: 'Veículo Rodoviário', tactical: '4x4 Tático / Off-Road', walking: 'Marcha a Pé' };

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Ordem de Movimento — NOMAD Brasil</title>
  <style>
    @page { size: A4; margin: 14mm; }
    body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; line-height: 1.4; font-size: 11px; margin: 0; padding: 16px; }
    h1 { font-size: 18px; margin: 0 0 4px; border-bottom: 2px solid #047857; padding-bottom: 4px; }
    h2 { font-size: 13px; margin: 14px 0 6px; color: #047857; text-transform: uppercase; border-bottom: 1px solid #cbd5e1; padding-bottom: 2px; }
    .meta { font-size: 10px; color: #475569; margin-bottom: 10px; }
    .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 8px 0 12px; }
    .box { border: 1px solid #cbd5e1; padding: 6px 8px; border-radius: 4px; background: #f8fafc; }
    .box .lbl { font-size: 9px; color: #64748b; text-transform: uppercase; }
    .box .val { font-size: 13px; font-weight: bold; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 10px; font-size: 10px; }
    th, td { border: 1px solid #cbd5e1; padding: 4px 6px; text-align: left; }
    th { background: #e2e8f0; }
    ol { padding-left: 16px; margin: 4px 0; }
    li { margin-bottom: 3px; }
    .no-print { margin-bottom: 12px; }
    @media print { .no-print { display: none; } body { padding: 0; } }
  </style>
</head>
<body>
  <div class="no-print">
    <button onclick="window.print()" style="padding:8px 14px;background:#047857;color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:bold;">🖨️ Imprimir / Salvar PDF</button>
  </div>
  <h1>ORDEM DE MOVIMENTO TÁTICA — NOMAD BRASIL</h1>
  <div class="meta">Gerado em ${new Date().toLocaleString('pt-BR')} &bull; Perfil: <strong>${escapeHtmlSafe(profileLabels[currentRouteData.profile] || currentRouteData.profile)}</strong> &bull; Fonte: <strong>${escapeHtmlSafe(currentRouteData.source)}</strong></div>

  <div class="grid">
    <div class="box"><div class="lbl">Distância</div><div class="val">${currentRouteData.distanceKm} km</div></div>
    <div class="box"><div class="lbl">Tempo Estimado</div><div class="val">${currentRouteData.durationMin} min</div></div>
    <div class="box"><div class="lbl">${currentRouteData.profile === 'walking' ? 'Água / Calorias' : 'Combustível Est.'}</div><div class="val">${currentRouteData.profile === 'walking' ? `${currentRouteData.waterLiters} L / ${currentRouteData.caloriesKcal || 0} kcal` : `${currentRouteData.fuelLiters} L`}</div></div>
    <div class="box"><div class="lbl">Luz Solar Destino</div><div class="val">${ephemDest.sunrise}–${ephemDest.sunset} (${ephemDest.moonPhaseName})</div></div>
  </div>

  <h2>1. Pontos de Controle &amp; Coordenadas</h2>
  <table>
    <thead><tr><th>Ponto</th><th>Localidade / Via</th><th>Decimal</th><th>DMS</th><th>UTM (SIRGAS2000/WGS84)</th></tr></thead>
    <tbody>
      ${fmtPoint('Origem (A)', routeOrigin)}
      ${routeVia ? fmtPoint('Parada (Via)', routeVia) : ''}
      ${fmtPoint('Destino (B)', routeDest)}
    </tbody>
  </table>

  ${corridorRows ? `<h2>2. Pontos de Apoio no Corredor (até 5 km)</h2>
  <table>
    <thead><tr><th>Km Rota</th><th>Nome do Apoio</th><th>Categoria</th><th>Dist. Eixo</th><th>Telefone</th></tr></thead>
    <tbody>${corridorRows}</tbody>
  </table>` : ''}

  <h2>${corridorRows ? '3' : '2'}. Roteiro Passo a Passo</h2>
  <ol>${stepItems}</ol>

  <h2>${corridorRows ? '4' : '3'}. Plano Familiar (PEF) &amp; Comunicações (PACE)</h2>
  <table>
    <tbody>
      <tr><th>PEF Ponto Primário / Secundário</th><td>${escapeHtmlSafe(pef.p1 || pef.primaryPoint || 'Não definido')} / ${escapeHtmlSafe(pef.p2 || pef.secondaryPoint || 'Não definido')}</td></tr>
      <tr><th>Contato de Apoio / Senha</th><td>${escapeHtmlSafe(pef.contactName || pef.name || 'Não definido')} (${escapeHtmlSafe(pef.contactPhone || pef.phone || '-')})</td></tr>
      <tr><th>Plano Rádio PACE</th><td><strong>P:</strong> ${escapeHtmlSafe(pace.primary || pace.p || '-')} | <strong>A:</strong> ${escapeHtmlSafe(pace.alternate || pace.a || '-')} | <strong>C:</strong> ${escapeHtmlSafe(pace.contingency || pace.c || '-')} | <strong>E:</strong> ${escapeHtmlSafe(pace.emergency || pace.e || '-')}</td></tr>
    </tbody>
  </table>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=900,height=800');
  if (win) {
    win.document.open();
    win.document.write(html);
    win.document.close();
  } else {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dossie-rota-nomad-${new Date().toISOString().slice(0, 10)}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  if (typeof window.initDynamicKiwixLinks === 'function') window.initDynamicKiwixLinks();
});
